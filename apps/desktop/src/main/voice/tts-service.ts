import { spawn } from 'child_process'
import type { TtsVoice } from '@auralith/core-voice'

type QueueEntry = {
  text: string
  voiceId?: string
  rate?: number
  resolve: () => void
  reject: (err: Error) => void
}

export class TtsService {
  private queue: QueueEntry[] = []
  private speaking = false
  private cancelFlag = false
  private _available = true

  get available(): boolean {
    return this._available && process.platform === 'win32'
  }

  async speak(text: string, voiceId?: string, rate?: number): Promise<void> {
    if (!this.available) return
    return new Promise((resolve, reject) => {
      this.queue.push({
        text,
        ...(voiceId !== undefined ? { voiceId } : {}),
        ...(rate !== undefined ? { rate } : {}),
        resolve,
        reject,
      })
      if (!this.speaking) void this.drainQueue()
    })
  }

  cancel(): void {
    this.cancelFlag = true
    this.queue = []
  }

  async listVoices(): Promise<TtsVoice[]> {
    if (process.platform !== 'win32') return []
    return new Promise((resolve) => {
      const script = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.GetInstalledVoices() | ForEach-Object {
  $v = $_.VoiceInfo
  Write-Output ("$($v.Id)|$($v.Name)|$($v.Culture)")
}
      `.trim()

      const ps = spawn('powershell.exe', ['-NonInteractive', '-Command', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let out = ''
      ps.stdout.on('data', (d: Buffer) => {
        out += d.toString()
      })
      ps.on('close', () => {
        const voices: TtsVoice[] = out
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.includes('|'))
          .map((line) => {
            const parts = line.split('|')
            return {
              id: parts[0] ?? '',
              name: parts[1] ?? '',
              lang: parts[2] ?? '',
              provider: 'sapi' as const,
              installed: true,
            }
          })
          .filter((v) => v.id.length > 0)
        resolve(voices)
      })
      ps.on('error', () => resolve([]))
    })
  }

  private async drainQueue(): Promise<void> {
    this.speaking = true
    while (this.queue.length > 0) {
      const entry = this.queue.shift()
      if (!entry) break
      if (this.cancelFlag) {
        entry.resolve()
        this.cancelFlag = false
        continue
      }
      try {
        await this.speakOne(entry.text, entry.voiceId, entry.rate)
        entry.resolve()
      } catch (err) {
        entry.reject(err instanceof Error ? err : new Error('TTS error'))
      }
    }
    this.speaking = false
    this.cancelFlag = false
  }

  private speakOne(text: string, voiceId?: string, rate?: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const safeText = text.replace(/'/g, "''").slice(0, 2000)
      const voiceLine = voiceId ? `$synth.SelectVoice('${voiceId}')` : ''
      const rateLine = rate !== undefined ? `$synth.Rate = ${Math.round((rate - 1) * 5)}` : ''

      const script = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
${voiceLine}
${rateLine}
$synth.Speak('${safeText}')
      `.trim()

      const ps = spawn('powershell.exe', ['-NonInteractive', '-Command', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      ps.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`TTS powershell exited ${code}`))
      })
      ps.on('error', (err) => reject(err))
    })
  }
}
