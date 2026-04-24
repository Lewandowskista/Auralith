import { EventEmitter } from 'events'
import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'

// Sensitivity maps to System.Speech confidence threshold (0–1 scale, lower = more sensitive)
const SENSITIVITY_THRESHOLD: Record<'low' | 'medium' | 'high', number> = {
  high: 0.25,
  medium: 0.45,
  low: 0.65,
}

// Inline PowerShell script that listens for the wake phrase using System.Speech.
// Prints "DETECTED" to stdout when the phrase is recognised above the confidence threshold.
// Prints "READY" once the recognizer is armed.
function buildPsScript(sensitivity: 'low' | 'medium' | 'high'): string {
  const threshold = SENSITIVITY_THRESHOLD[sensitivity]
  return `
Add-Type -AssemblyName System.Speech
$rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine
$grammar = New-Object System.Speech.Recognition.GrammarBuilder
$grammar.Append("hey auralith")
$g = New-Object System.Speech.Recognition.Grammar($grammar)
$rec.LoadGrammar($g)
$rec.SetInputToDefaultAudioDevice()
$rec.SpeechRecognized += {
  param($s, $e)
  if ($e.Result.Confidence -ge ${threshold}) {
    [Console]::Out.WriteLine("DETECTED")
    [Console]::Out.Flush()
  }
}
[Console]::Out.WriteLine("READY")
[Console]::Out.Flush()
$rec.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
while ($true) { Start-Sleep -Milliseconds 200 }
`
}

/**
 * Wake word service using Windows' built-in System.Speech API.
 *
 * Listens for "Hey Auralith" via a PowerShell child process running
 * System.Speech.Recognition.SpeechRecognitionEngine — no binary bundle,
 * no API keys, works offline on any Windows 10/11 machine with a mic.
 *
 * Emits 'detected' when the wake phrase is heard above the confidence threshold.
 * Emits 'ready' once the recognizer is armed.
 * Emits 'error' if the engine fails to start.
 */
export class WakeWordService extends EventEmitter {
  private proc: ChildProcess | null = null
  private enabled = false
  private sensitivity: 'low' | 'medium' | 'high' = 'medium'
  private startAttempts = 0
  private readonly MAX_RESTARTS = 3

  enable(sensitivity: 'low' | 'medium' | 'high' = 'medium'): void {
    this.sensitivity = sensitivity
    if (this.enabled) return
    this.enabled = true
    this.startAttempts = 0
    this.startDetector()
  }

  disable(): void {
    if (!this.enabled) return
    this.enabled = false
    this.stopDetector()
  }

  get isEnabled(): boolean {
    return this.enabled
  }

  setSensitivity(s: 'low' | 'medium' | 'high'): void {
    this.sensitivity = s
    if (this.enabled) {
      this.stopDetector()
      this.startDetector()
    }
  }

  private startDetector(): void {
    if (process.platform !== 'win32') {
      console.warn(
        '[wake-word] System.Speech is Windows-only — wake word unavailable on this platform',
      )
      return
    }

    const script = buildPsScript(this.sensitivity)

    try {
      this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (err) {
      console.error('[wake-word] Failed to spawn PowerShell:', err)
      this.emit('error', 'Failed to start wake word engine')
      return
    }

    let buffer = ''
    this.proc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed === 'READY') {
          this.emit('ready')
        } else if (trimmed === 'DETECTED') {
          this.emit('detected')
        }
      }
    })

    this.proc.stderr?.on('data', (chunk: Buffer) => {
      const msg = chunk.toString().trim()
      // Filter out common non-fatal PowerShell noise
      if (msg && !msg.includes('WARNING') && !msg.includes('NativeCommandError')) {
        console.warn('[wake-word] stderr:', msg)
      }
    })

    this.proc.on('exit', (code, signal) => {
      this.proc = null
      if (!this.enabled) return // clean shutdown
      console.warn(`[wake-word] Process exited (code=${code}, signal=${signal}) — restarting...`)
      this.startAttempts++
      if (this.startAttempts < this.MAX_RESTARTS) {
        setTimeout(() => {
          if (this.enabled) this.startDetector()
        }, 2000 * this.startAttempts)
      } else {
        console.error('[wake-word] Max restart attempts reached — disabling wake word')
        this.enabled = false
        this.emit('error', 'Wake word engine crashed repeatedly — disabled')
      }
    })
  }

  private stopDetector(): void {
    if (this.proc) {
      this.proc.removeAllListeners()
      this.proc.stdout?.removeAllListeners()
      this.proc.stderr?.removeAllListeners()
      try {
        this.proc.kill()
      } catch {
        /* already gone */
      }
      this.proc = null
    }
  }

  dispose(): void {
    this.enabled = false
    this.stopDetector()
    this.removeAllListeners()
  }
}
