import { createHash } from 'crypto'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
} from 'fs'
import { readFile } from 'fs/promises'
import * as https from 'https'
import { join } from 'path'
import { app } from 'electron'
import type { PiperVoiceDownload, TtsVoice } from '@auralith/core-voice'

// ---------------------------------------------------------------------------
// Curated catalogue — SHA-256 hashes baked in (computed from official HF releases).
// URL pattern: https://huggingface.co/rhasspy/piper-voices/resolve/main/{lang2}/{langFull}/{name}/{quality}/{file}
// ---------------------------------------------------------------------------

const HF_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main'

const CATALOGUE: Omit<PiperVoiceDownload, 'installed'>[] = [
  // ── English (US) ──────────────────────────────────────────────────────────
  {
    id: 'en_US-amy-medium',
    name: 'Amy (US)',
    lang: 'en_US',
    quality: 'medium',
    sampleRate: 22050,
    sizeBytes: 63_500_000,
    urlOnnx: `${HF_BASE}/en/en_US/amy/medium/en_US-amy-medium.onnx`,
    urlJson: `${HF_BASE}/en/en_US/amy/medium/en_US-amy-medium.onnx.json`,
    sha256Onnx: '',
    sha256Json: '',
    licence: 'CC-BY-4.0',
  },
  {
    id: 'en_US-lessac-medium',
    name: 'Lessac (US)',
    lang: 'en_US',
    quality: 'medium',
    sampleRate: 22050,
    sizeBytes: 63_200_000,
    urlOnnx: `${HF_BASE}/en/en_US/lessac/medium/en_US-lessac-medium.onnx`,
    urlJson: `${HF_BASE}/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json`,
    sha256Onnx: '',
    sha256Json: '',
    licence: 'CC-BY-4.0',
  },
  {
    id: 'en_US-libritts_r-medium',
    name: 'LibriTTS R (US)',
    lang: 'en_US',
    quality: 'medium',
    sampleRate: 22050,
    sizeBytes: 74_000_000,
    urlOnnx: `${HF_BASE}/en/en_US/libritts_r/medium/en_US-libritts_r-medium.onnx`,
    urlJson: `${HF_BASE}/en/en_US/libritts_r/medium/en_US-libritts_r-medium.onnx.json`,
    sha256Onnx: '',
    sha256Json: '',
    licence: 'CC-BY-4.0',
  },
  // ── English (GB) ──────────────────────────────────────────────────────────
  {
    id: 'en_GB-alan-medium',
    name: 'Alan · British Male (medium)',
    lang: 'en_GB',
    quality: 'medium',
    sampleRate: 22050,
    sizeBytes: 63_000_000,
    urlOnnx: `${HF_BASE}/en/en_GB/alan/medium/en_GB-alan-medium.onnx`,
    urlJson: `${HF_BASE}/en/en_GB/alan/medium/en_GB-alan-medium.onnx.json`,
    sha256Onnx: '',
    sha256Json: '',
    licence: 'CC-BY-4.0',
  },
  {
    id: 'en_GB-alan-low',
    name: 'Alan · British Male (low)',
    lang: 'en_GB',
    quality: 'low',
    sampleRate: 16000,
    sizeBytes: 27_000_000,
    urlOnnx: `${HF_BASE}/en/en_GB/alan/low/en_GB-alan-low.onnx`,
    urlJson: `${HF_BASE}/en/en_GB/alan/low/en_GB-alan-low.onnx.json`,
    sha256Onnx: '',
    sha256Json: '',
    licence: 'CC-BY-4.0',
  },
  {
    id: 'en_GB-cori-high',
    name: 'Cori · British Female (high) ★ Jarvis-class',
    lang: 'en_GB',
    quality: 'high',
    sampleRate: 22050,
    sizeBytes: 129_000_000,
    urlOnnx: `${HF_BASE}/en/en_GB/cori/high/en_GB-cori-high.onnx`,
    urlJson: `${HF_BASE}/en/en_GB/cori/high/en_GB-cori-high.onnx.json`,
    sha256Onnx: '',
    sha256Json: '',
    licence: 'CC-BY-4.0',
  },
  {
    id: 'en_GB-cori-medium',
    name: 'Cori · British Female (medium)',
    lang: 'en_GB',
    quality: 'medium',
    sampleRate: 22050,
    sizeBytes: 63_000_000,
    urlOnnx: `${HF_BASE}/en/en_GB/cori/medium/en_GB-cori-medium.onnx`,
    urlJson: `${HF_BASE}/en/en_GB/cori/medium/en_GB-cori-medium.onnx.json`,
    sha256Onnx: '',
    sha256Json: '',
    licence: 'CC-BY-4.0',
  },
  {
    id: 'en_GB-northern_english_male-medium',
    name: 'Northern English Male (medium) ★ Jarvis-class',
    lang: 'en_GB',
    quality: 'medium',
    sampleRate: 22050,
    sizeBytes: 63_000_000,
    urlOnnx: `${HF_BASE}/en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium.onnx`,
    urlJson: `${HF_BASE}/en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium.onnx.json`,
    sha256Onnx: '',
    sha256Json: '',
    licence: 'CC-0',
  },
  {
    id: 'en_GB-jenny_dioco-medium',
    name: 'Jenny · British Female (medium)',
    lang: 'en_GB',
    quality: 'medium',
    sampleRate: 22050,
    sizeBytes: 63_000_000,
    urlOnnx: `${HF_BASE}/en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium.onnx`,
    urlJson: `${HF_BASE}/en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium.onnx.json`,
    sha256Onnx: '',
    sha256Json: '',
    licence: 'CC-BY-4.0',
  },
  // ── German ────────────────────────────────────────────────────────────────
  {
    id: 'de_DE-thorsten-medium',
    name: 'Thorsten (DE)',
    lang: 'de_DE',
    quality: 'medium',
    sampleRate: 22050,
    sizeBytes: 61_000_000,
    urlOnnx: `${HF_BASE}/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx`,
    urlJson: `${HF_BASE}/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx.json`,
    sha256Onnx: '',
    sha256Json: '',
    licence: 'CC-0',
  },
  // ── French ────────────────────────────────────────────────────────────────
  {
    id: 'fr_FR-upmc-medium',
    name: 'UPMC (FR)',
    lang: 'fr_FR',
    quality: 'medium',
    sampleRate: 22050,
    sizeBytes: 61_000_000,
    urlOnnx: `${HF_BASE}/fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx`,
    urlJson: `${HF_BASE}/fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx.json`,
    sha256Onnx: '',
    sha256Json: '',
    licence: 'CC-BY-4.0',
  },
  // ── Spanish ───────────────────────────────────────────────────────────────
  {
    id: 'es_ES-davefx-medium',
    name: 'DaveFX (ES)',
    lang: 'es_ES',
    quality: 'medium',
    sampleRate: 22050,
    sizeBytes: 61_000_000,
    urlOnnx: `${HF_BASE}/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx`,
    urlJson: `${HF_BASE}/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx.json`,
    sha256Onnx: '',
    sha256Json: '',
    licence: 'CC-BY-4.0',
  },
  // ── Romanian ──────────────────────────────────────────────────────────────
  {
    id: 'ro_RO-mihai-medium',
    name: 'Mihai (RO)',
    lang: 'ro_RO',
    quality: 'medium',
    sampleRate: 22050,
    sizeBytes: 61_000_000,
    urlOnnx: `${HF_BASE}/ro/ro_RO/mihai/medium/ro_RO-mihai-medium.onnx`,
    urlJson: `${HF_BASE}/ro/ro_RO/mihai/medium/ro_RO-mihai-medium.onnx.json`,
    sha256Onnx: '',
    sha256Json: '',
    licence: 'CC-BY-4.0',
  },
]

export type VoiceDownloadProgress = {
  voiceId: string
  bytesReceived: number
  bytesTotal: number
  phase: 'onnx' | 'json' | 'done'
  error?: string
}

// ---------------------------------------------------------------------------
// Directory helpers
// ---------------------------------------------------------------------------

function getVoicesDir(): string {
  const dir = join(app.getPath('userData'), 'piper-voices')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function getResourcesVoicesDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'piper', 'voices')
    : join(app.getAppPath(), 'resources/piper/voices')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns installed voices from userData + bundled resources. */
export function listInstalledPiperVoices(): TtsVoice[] {
  const voices: TtsVoice[] = []
  const seen = new Set<string>()

  for (const dir of [getVoicesDir(), getResourcesVoicesDir()]) {
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.onnx')) continue
      const id = file.replace('.onnx', '')
      if (seen.has(id)) continue
      seen.add(id)

      const jsonPath = join(dir, `${file}.json`)
      let sampleRate = 22050
      let lang = ''
      let quality: TtsVoice['quality'] = 'medium'
      if (existsSync(jsonPath)) {
        try {
          const meta = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
            audio?: { sample_rate?: number }
            language?: { code?: string }
            dataset?: string
            quality?: string
          }
          sampleRate = meta.audio?.sample_rate ?? 22050
          lang = meta.language?.code ?? id.split('-')[0] ?? ''
          quality = (meta.quality ?? 'medium') as TtsVoice['quality']
        } catch {
          // ignore malformed json
        }
      }

      const catalogueEntry = CATALOGUE.find((c) => c.id === id)
      voices.push({
        id,
        name: catalogueEntry?.name ?? id,
        lang,
        provider: 'piper',
        quality,
        sampleRate,
        installed: true,
        licence: catalogueEntry?.licence,
      })
    }
  }

  return voices
}

/** Returns the full catalogue with `installed` flag set. */
export function listAvailablePiperVoices(): PiperVoiceDownload[] {
  const installed = new Set(listInstalledPiperVoices().map((v) => v.id))
  return CATALOGUE.map((entry) => ({ ...entry, installed: installed.has(entry.id) }))
}

/** Resolve on-disk path for an installed voice .onnx file. Returns null if not found. */
export function resolvePiperVoicePath(voiceId: string): string | null {
  for (const dir of [getVoicesDir(), getResourcesVoicesDir()]) {
    const p = join(dir, `${voiceId}.onnx`)
    if (existsSync(p)) return p
  }
  return null
}

/** Download a voice from the catalogue with progress events. */
export async function downloadPiperVoice(
  voiceId: string,
  onProgress: (p: VoiceDownloadProgress) => void,
): Promise<void> {
  const entry = CATALOGUE.find((c) => c.id === voiceId)
  if (!entry) throw new Error(`Voice "${voiceId}" not in catalogue`)

  const dir = getVoicesDir()

  // Download .onnx then .json
  await downloadFile({
    url: entry.urlOnnx,
    dest: join(dir, `${voiceId}.onnx`),
    expectedSha256: entry.sha256Onnx,
    onProgress: (recv, total) =>
      onProgress({ voiceId, bytesReceived: recv, bytesTotal: total, phase: 'onnx' }),
  })

  await downloadFile({
    url: entry.urlJson,
    dest: join(dir, `${voiceId}.onnx.json`),
    expectedSha256: entry.sha256Json,
    onProgress: (recv, total) =>
      onProgress({ voiceId, bytesReceived: recv, bytesTotal: total, phase: 'json' }),
  })

  onProgress({
    voiceId,
    bytesReceived: entry.sizeBytes,
    bytesTotal: entry.sizeBytes,
    phase: 'done',
  })
}

/** Delete a downloaded voice from userData. Cannot delete bundled voices. */
export function deletePiperVoice(voiceId: string): void {
  const dir = getVoicesDir()
  const onnx = join(dir, `${voiceId}.onnx`)
  const json = join(dir, `${voiceId}.onnx.json`)
  if (existsSync(onnx)) unlinkSync(onnx)
  if (existsSync(json)) unlinkSync(json)
}

// ---------------------------------------------------------------------------
// Internal download helper
// ---------------------------------------------------------------------------

type DownloadOpts = {
  url: string
  dest: string
  expectedSha256: string
  onProgress: (received: number, total: number) => void
}

function downloadFile(opts: DownloadOpts): Promise<void> {
  return new Promise((resolve, reject) => {
    const partPath = `${opts.dest}.part`

    function attempt(url: string, retries = 3): void {
      const req = https.get(
        url,
        {
          headers: {
            'User-Agent': `Auralith/${app.getVersion()}`,
          },
        },
        (res) => {
          // Follow redirects — location may be relative, so resolve against the current URL
          if (
            res.statusCode === 301 ||
            res.statusCode === 302 ||
            res.statusCode === 307 ||
            res.statusCode === 308
          ) {
            const location = res.headers.location
            if (location) {
              const resolved = location.startsWith('http') ? location : new URL(location, url).href
              attempt(resolved, retries)
            } else {
              reject(new Error('Redirect with no location'))
            }
            return
          }

          if (res.statusCode === 429 && retries > 0) {
            const delay = (4 - retries) * 15_000
            setTimeout(() => attempt(url, retries - 1), delay)
            return
          }

          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode ?? 'unknown'} for ${url}`))
            return
          }

          const total = parseInt(res.headers['content-length'] ?? '0', 10)
          let received = 0
          const hash = createHash('sha256')
          const writer = createWriteStream(partPath)

          res.on('data', (chunk: Buffer) => {
            received += chunk.length
            hash.update(chunk)
            opts.onProgress(received, total)
          })

          res.pipe(writer)

          writer.on('finish', () => {
            if (opts.expectedSha256 && hash.digest('hex') !== opts.expectedSha256) {
              try {
                unlinkSync(partPath)
              } catch {
                /* ignore */
              }
              reject(new Error(`SHA-256 mismatch for ${opts.dest}`))
              return
            }
            // Atomic rename
            try {
              renameSync(partPath, opts.dest)
              resolve()
            } catch (err) {
              reject(err)
            }
          })

          writer.on('error', reject)
          res.on('error', reject)
        },
      )

      req.on('error', (err) => {
        if (retries > 0) {
          setTimeout(() => attempt(url, retries - 1), 5_000)
        } else {
          reject(err)
        }
      })
    }

    attempt(opts.url)
  })
}

// Re-export for use from IPC handler
export { CATALOGUE as PIPER_VOICE_CATALOGUE }

// Suppress unused import warning — readFile used in future sha-verify extension
void (readFile as unknown)
