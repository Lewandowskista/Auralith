/**
 * One-time dev script: downloads the Silero-VAD v4 ONNX model into resources/vad/.
 * Run with: node apps/desktop/scripts/download-vad-model.mjs
 */
import { createWriteStream, mkdirSync, existsSync } from 'fs'
import { pipeline } from 'stream/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(__dirname, '../resources/vad')
const outPath = resolve(outDir, 'silero_vad.onnx')

const MODEL_URL =
  'https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx'

if (existsSync(outPath)) {
  console.log(`silero_vad.onnx already exists at ${outPath} — skipping download.`)
  process.exit(0)
}

mkdirSync(outDir, { recursive: true })

console.log(`Downloading Silero-VAD ONNX model from:\n  ${MODEL_URL}`)
console.log(`Destination: ${outPath}`)

const response = await fetch(MODEL_URL)
if (!response.ok) {
  console.error(`Download failed: HTTP ${response.status} ${response.statusText}`)
  process.exit(1)
}

await pipeline(response.body, createWriteStream(outPath))
console.log('Done.')
