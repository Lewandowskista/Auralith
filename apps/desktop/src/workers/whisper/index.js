/**
 * Whisper STT utilityProcess worker.
 *
 * Protocol (JSON-line over process.parentPort messages):
 *   IN:  { type: 'load', modelPath, binPath }
 *        { type: 'chunk', pcm16Base64 }
 *        { type: 'end' }
 *        { type: 'ping' }
 *
 *   OUT: { type: 'ready' }
 *        { type: 'partial', text }
 *        { type: 'final', text }
 *        { type: 'error', message }
 *        { type: 'pong' }
 *
 * The worker writes collected PCM-16 chunks to a temporary WAV file,
 * passes it to the bundled whisper-cli binary, then parses transcript
 * lines from stdout.
 */

const { spawn } = require('node:child_process')
const { existsSync, writeFileSync, unlinkSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { randomUUID } = require('node:crypto')

const parentPort = process.parentPort

function send(msg) {
  parentPort.postMessage(msg)
}

let modelPath = ''
let binPath = ''
let audioChunks = []

/** Build a minimal 16-bit mono PCM WAV header + body */
function buildWav(pcmBuffer, sampleRate = 16_000) {
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
  const blockAlign = (numChannels * bitsPerSample) / 8
  const dataSize = pcmBuffer.length
  const header = Buffer.alloc(44)

  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // PCM chunk size
  header.writeUInt16LE(1, 20) // PCM format
  header.writeUInt16LE(numChannels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)

  return Buffer.concat([header, pcmBuffer])
}

function loadModel(path, whisperBinPath) {
  modelPath = path
  binPath = whisperBinPath
  if (!existsSync(binPath)) {
    send({ type: 'error', message: `whisper binary not found at ${binPath}` })
    return
  }
  if (!existsSync(path)) {
    send({ type: 'error', message: `whisper model not found at ${path}` })
    return
  }
  send({ type: 'ready' })
}

/**
 * Compute RMS energy of a 16-bit PCM buffer.
 * Returns a value in [0, 1] where 1 = full scale.
 */
function rmsEnergy(pcmBuffer) {
  if (pcmBuffer.length < 2) return 0
  let sum = 0
  const samples = pcmBuffer.length / 2
  for (let i = 0; i < pcmBuffer.length - 1; i += 2) {
    const sample = pcmBuffer.readInt16LE(i) / 32768
    sum += sample * sample
  }
  return Math.sqrt(sum / samples)
}

// Whisper hallucinations commonly produced on silence or near-silence
const HALLUCINATION_PATTERNS = [
  /^\s*you\s*$/i,
  /^\s*thank you\s*\.?\s*$/i,
  /^\s*\[blank_audio\]\s*$/i,
  /^\s*\[silence\]\s*$/i,
  /^\s*\.\s*$/,
]

function isHallucination(text) {
  return HALLUCINATION_PATTERNS.some((re) => re.test(text))
}

// Minimum RMS energy required to attempt transcription (~-40 dBFS)
const MIN_ENERGY_THRESHOLD = 0.01

function runTranscription() {
  return new Promise((resolve, reject) => {
    if (!modelPath) {
      reject(new Error('Model not loaded'))
      return
    }

    const combinedPcm = Buffer.concat(audioChunks)
    audioChunks = []

    if (combinedPcm.length === 0) {
      resolve({ text: '' })
      return
    }

    // Skip transcription if the audio is essentially silence — whisper hallucinates
    // tokens like "you" or "thank you" on silent input.
    if (rmsEnergy(combinedPcm) < MIN_ENERGY_THRESHOLD) {
      resolve({ text: '' })
      return
    }

    // Write PCM as a proper WAV file — whisper-cli does not accept stdin or raw PCM
    const wavPath = join(tmpdir(), `auralith-stt-${randomUUID()}.wav`)
    try {
      writeFileSync(wavPath, buildWav(combinedPcm))
    } catch (err) {
      reject(new Error(`Failed to write temp WAV: ${err.message}`))
      return
    }

    const args = ['-m', modelPath, '-f', wavPath, '-l', 'en', '-nt', '--no-prints']

    const proc = spawn(binPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })

    proc.on('close', (code) => {
      try {
        unlinkSync(wavPath)
      } catch {
        /* ignore */
      }

      if (code !== 0) {
        reject(new Error(`whisper exited with code ${code}: ${stderr.slice(0, 300)}`))
        return
      }

      // Strip leading/trailing whitespace and any timestamp artifacts
      const text = stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join(' ')
        .trim()

      // Reject well-known whisper hallucination strings produced on silence
      const safeText = isHallucination(text) ? '' : text

      if (safeText) send({ type: 'partial', text: safeText })
      resolve({ text: safeText })
    })

    proc.on('error', (err) => {
      try {
        unlinkSync(wavPath)
      } catch {
        /* ignore */
      }
      reject(err)
    })
  })
}

parentPort.on('message', ({ data }) => {
  switch (data.type) {
    case 'ping':
      send({ type: 'pong' })
      break

    case 'load':
      loadModel(data.modelPath, data.binPath)
      break

    case 'chunk':
      audioChunks.push(Buffer.from(data.pcm16Base64, 'base64'))
      break

    case 'end':
      runTranscription()
        .then(({ text }) => {
          send({ type: 'final', text })
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : 'Transcription error'
          send({ type: 'error', message })
        })
      break

    default:
      send({ type: 'error', message: `Unknown whisper worker message: ${String(data.type)}` })
      break
  }
})
