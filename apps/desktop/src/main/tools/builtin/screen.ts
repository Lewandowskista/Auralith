import { randomUUID } from 'crypto'
import { desktopCapturer, screen } from 'electron'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFile } from 'child_process'
import { z } from 'zod'
import { registerTool } from '@auralith/core-tools'

const MAX_CAPTURE_EDGE = 3_840

export function registerScreenTools(): void {
  registerTool({
    id: 'screen.capture',
    tier: 'safe',
    paramsSchema: z.object({
      displayId: z.number().int().optional(),
      region: z
        .object({
          x: z.number().int(),
          y: z.number().int(),
          width: z.number().int().positive(),
          height: z.number().int().positive(),
        })
        .optional(),
      includeOcr: z.boolean().default(true),
    }),
    resultSchema: z.object({
      ok: z.boolean(),
      displayId: z.number(),
      width: z.number(),
      height: z.number(),
      imageBase64: z.string(),
      mimeType: z.literal('image/png'),
      ocrText: z.string().optional(),
      ocrEngine: z.string().optional(),
      ocrError: z.string().optional(),
    }),
    describeForModel:
      'Capture the current Windows screen or a region of it. Returns PNG image data as base64 and OCR text extracted with the built-in Windows OCR engine.',
    execute: async (params) => {
      const targetDisplay = resolveTargetDisplay(params.displayId)
      const scaleFactor = Math.max(targetDisplay.scaleFactor || 1, 1)
      const captureWidth = clampEdge(Math.round(targetDisplay.size.width * scaleFactor))
      const captureHeight = clampEdge(Math.round(targetDisplay.size.height * scaleFactor))

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: captureWidth,
          height: captureHeight,
        },
      })

      const source =
        sources.find((entry) => entry.display_id === String(targetDisplay.id)) ?? sources[0]
      if (!source) {
        throw new Error('No screen source available')
      }

      let image = source.thumbnail
      if (image.isEmpty()) {
        throw new Error('Screen capture returned an empty image')
      }

      if (params.region) {
        const cropped = clampRegion(params.region, image.getSize())
        image = image.crop(cropped)
      }

      const png = image.toPNG()
      const result: {
        ok: boolean
        displayId: number
        width: number
        height: number
        imageBase64: string
        mimeType: 'image/png'
        ocrText?: string
        ocrEngine?: string
        ocrError?: string
      } = {
        ok: true,
        displayId: Number(source.display_id || targetDisplay.id),
        width: image.getSize().width,
        height: image.getSize().height,
        imageBase64: png.toString('base64'),
        mimeType: 'image/png',
      }

      if (params.includeOcr ?? true) {
        try {
          const ocrText = await runWindowsOcr(png)
          result.ocrText = ocrText
          result.ocrEngine = 'windows.media.ocr'
        } catch (error) {
          result.ocrError = error instanceof Error ? error.message : 'OCR failed'
        }
      }

      return result
    },
  })
}

function resolveTargetDisplay(displayId?: number) {
  if (displayId !== undefined) {
    const match = screen.getAllDisplays().find((display) => display.id === displayId)
    if (match) return match
  }
  return screen.getPrimaryDisplay()
}

function clampEdge(value: number): number {
  return Math.max(1, Math.min(value, MAX_CAPTURE_EDGE))
}

function clampRegion(
  region: { x: number; y: number; width: number; height: number },
  size: { width: number; height: number },
) {
  const x = Math.max(0, Math.min(region.x, size.width - 1))
  const y = Math.max(0, Math.min(region.y, size.height - 1))
  const width = Math.max(1, Math.min(region.width, size.width - x))
  const height = Math.max(1, Math.min(region.height, size.height - y))
  return { x, y, width, height }
}

async function runWindowsOcr(imagePng: Buffer): Promise<string> {
  if (process.platform !== 'win32') {
    throw new Error('OCR is only available on Windows in this build')
  }

  const tempDir = join(tmpdir(), 'auralith-ocr')
  mkdirSync(tempDir, { recursive: true })
  const imagePath = join(tempDir, `${randomUUID()}.png`)
  writeFileSync(imagePath, imagePng)

  const script = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap,Windows.Foundation,ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await([object]$op, [type]$resultType) {
  $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($op))
  $task.Wait()
  return $task.Result
}
$path = $args[0]
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($path)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$ocrBitmap = [Windows.Graphics.Imaging.SoftwareBitmap]::Convert($bitmap, [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8)
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) { throw 'Windows OCR engine unavailable' }
$result = Await ($engine.RecognizeAsync($ocrBitmap)) ([Windows.Media.Ocr.OcrResult])
Write-Output $result.Text
`

  try {
    const stdout = await execFileText('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
      imagePath,
    ])
    return stdout.trim()
  } finally {
    try {
      rmSync(imagePath, { force: true })
    } catch {
      // Best-effort temp cleanup.
    }
  }
}

function execFileText(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message))
          return
        }
        resolve(stdout)
      },
    )
  })
}
