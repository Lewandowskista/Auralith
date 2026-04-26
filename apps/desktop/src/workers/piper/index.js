/**
 * Piper TTS utilityProcess worker.
 *
 * Protocol (JSON-line over process.parentPort messages):
 *   IN:  { type: 'setVoice', modelPath, sampleRate }
 *        { type: 'synthesize', id, text, lengthScale? }
 *        { type: 'cancel', id }
 *        { type: 'ping' }
 *
 *   OUT: { type: 'ready' }
 *        { type: 'pcm', id, chunk: <Buffer as array>, sampleRate }
 *        { type: 'done', id }
 *        { type: 'error', id?, message }
 *        { type: 'pong' }
 *
 * Keeps one persistent piper.exe child loaded with the active voice model.
 * Multiple synthesize requests are queued and processed sequentially.
 * PCM-16 frames are streamed to the parent as they arrive from piper stdout.
 */

const { spawn, execFile } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')
const { EventEmitter } = require('node:events')

const parentPort = process.parentPort

function send(msg) {
  parentPort.postMessage(msg)
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let piperBinPath = ''
let currentModelPath = ''
let currentSampleRate = 22050
let piperProc = null
let isReady = false

// Queue of pending synthesis requests
const queue = []
let processing = false

// Set of cancelled IDs — checked before and during processing
const cancelledIds = new Set()

// Chunk accumulator for stdout
let stdoutBuf = Buffer.alloc(0)

// ---------------------------------------------------------------------------
// Piper process management
// ---------------------------------------------------------------------------

function getBinPath() {
  if (piperBinPath) return piperBinPath
  // Resolved by setVoice message; fallback scan
  const candidates = [
    join(__dirname, '../../resources/piper/piper.exe'),
    join(process.resourcesPath ?? '', 'piper/piper.exe'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

function spawnPiper(modelPath) {
  if (!modelPath || !existsSync(modelPath)) {
    send({ type: 'error', message: `Piper model not found: ${modelPath}` })
    return null
  }

  const bin = getBinPath()
  if (!bin || !existsSync(bin)) {
    send({ type: 'error', message: `piper.exe not found (looked at: ${bin})` })
    return null
  }

  const proc = spawn(
    bin,
    [
      '--model', modelPath,
      '--output-raw',
      '--json-input',
    ],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )

  proc.stderr.on('data', (chunk) => {
    // Piper writes loading progress to stderr — suppress unless it looks like an error
    const msg = chunk.toString('utf8').trim()
    if (msg.toLowerCase().includes('error') || msg.toLowerCase().includes('failed')) {
      send({ type: 'error', message: `piper stderr: ${msg.slice(0, 300)}` })
    }
  })

  proc.on('error', (err) => {
    send({ type: 'error', message: `piper process error: ${err.message}` })
    piperProc = null
    isReady = false
  })

  proc.on('close', (code) => {
    piperProc = null
    isReady = false
    if (code !== 0 && code !== null) {
      send({ type: 'error', message: `piper exited with code ${code}` })
    }
  })

  return proc
}

function ensurePiper(modelPath) {
  if (piperProc && isReady && currentModelPath === modelPath) return true

  // Kill existing child if switching voices
  if (piperProc) {
    try {
      piperProc.stdin.end()
      piperProc.kill('SIGTERM')
    } catch {
      /* ignore */
    }
    piperProc = null
    isReady = false
  }

  piperProc = spawnPiper(modelPath)
  if (!piperProc) return false

  currentModelPath = modelPath
  isReady = true
  return true
}

// ---------------------------------------------------------------------------
// Synthesis queue
// ---------------------------------------------------------------------------

function drainQueue() {
  if (processing || queue.length === 0) return
  processing = true
  processNext()
}

function processNext() {
  if (queue.length === 0) {
    processing = false
    return
  }

  const item = queue.shift()
  if (!item) {
    processing = false
    return
  }

  const { id, text, lengthScale, modelPath, sampleRate } = item

  if (cancelledIds.has(id)) {
    cancelledIds.delete(id)
    setImmediate(processNext)
    return
  }

  if (!ensurePiper(modelPath)) {
    send({ type: 'error', id, message: 'Failed to start piper' })
    setImmediate(processNext)
    return
  }

  currentSampleRate = sampleRate

  // Build JSON-input line for piper
  const inputLine = JSON.stringify({
    text,
    ...(lengthScale !== undefined ? { length_scale: lengthScale } : {}),
  }) + '\n'

  stdoutBuf = Buffer.alloc(0)

  // Piper writes raw PCM-16 to stdout for each JSON input line,
  // followed by an end-of-stream signal when stdin line is consumed.
  // We capture all stdout data between writes and flush it as chunks.

  const onData = (chunk) => {
    if (cancelledIds.has(id)) {
      // Don't forward more PCM for cancelled requests
      return
    }
    // Forward raw PCM chunk directly — renderer will handle buffering
    send({
      type: 'pcm',
      id,
      chunk: Array.from(chunk),
      sampleRate: currentSampleRate,
    })
  }

  piperProc.stdout.on('data', onData)

  piperProc.stdin.write(inputLine, 'utf8', (writeErr) => {
    if (writeErr) {
      piperProc.stdout.removeListener('data', onData)
      send({ type: 'error', id, message: `stdin write error: ${writeErr.message}` })
      setImmediate(processNext)
      return
    }

    // Piper processes one line at a time; after writing we wait for
    // stdout to flush. Use a short polling approach: if no new data
    // arrives for 150 ms after the last byte, consider synthesis done.
    let lastDataAt = Date.now()
    let watchTimer = null

    const onDataWithTs = (chunk) => {
      lastDataAt = Date.now()
      onData(chunk)
    }

    piperProc.stdout.removeListener('data', onData)
    piperProc.stdout.on('data', onDataWithTs)

    watchTimer = setInterval(() => {
      if (Date.now() - lastDataAt > 150) {
        clearInterval(watchTimer)
        piperProc.stdout.removeListener('data', onDataWithTs)

        if (!cancelledIds.has(id)) {
          send({ type: 'done', id })
        } else {
          cancelledIds.delete(id)
        }
        setImmediate(processNext)
      }
    }, 50)
  })
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

parentPort.on('message', ({ data }) => {
  switch (data.type) {
    case 'ping':
      send({ type: 'pong' })
      break

    case 'setBinPath':
      piperBinPath = data.binPath
      send({ type: 'ready' })
      break

    case 'setVoice': {
      // Pre-warm: spawn piper with the new voice immediately
      const { modelPath, sampleRate, binPath } = data
      if (binPath) piperBinPath = binPath
      currentSampleRate = sampleRate ?? 22050
      const ok = ensurePiper(modelPath)
      if (ok) {
        send({ type: 'ready' })
      }
      break
    }

    case 'synthesize': {
      const { id, text, lengthScale } = data
      if (!currentModelPath) {
        send({ type: 'error', id, message: 'No voice model loaded. Send setVoice first.' })
        break
      }
      queue.push({
        id,
        text,
        lengthScale,
        modelPath: currentModelPath,
        sampleRate: currentSampleRate,
      })
      drainQueue()
      break
    }

    case 'cancel': {
      const { id } = data
      cancelledIds.add(id)
      // Also clear from queue if not yet processing
      const idx = queue.findIndex((q) => q.id === id)
      if (idx >= 0) queue.splice(idx, 1)
      break
    }

    default:
      send({ type: 'error', message: `Unknown piper worker message: ${String(data.type)}` })
  }
})
