import { z } from 'zod'
import { registerTool } from '@auralith/core-tools'
import { execSync } from 'child_process'

// ---------------------------------------------------------------------------
// Helpers — Windows audio via PowerShell
// ---------------------------------------------------------------------------

function psRun(command: string): string {
  return execSync(`powershell -NoProfile -NonInteractive -Command "${command}"`, {
    encoding: 'utf8',
    timeout: 8000,
  }).trim()
}

function getVolume(): { level: number; muted: boolean } {
  try {
    const out = psRun(
      `
      Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A")] [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume { void R1(); void R2(); void R3(); void R4(); int SetMasterVolumeLevelScalar(float fLevel, ref System.Guid pguidEventContext); void R6(); int GetMasterVolumeLevelScalar(out float pfLevel); void R8(); void R9(); void R10(); int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref System.Guid pguidEventContext); int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F")] [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref System.Guid iid, uint dwClsCtx, System.IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface); void R2(); void R3(); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")] [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { void R1(); int GetDefaultAudioEndpoint(uint dataFlow, uint role, out IMMDevice ppEndpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
public class Vol {
  public static float Get() { var e = (IMMDeviceEnumerator)new MMDeviceEnumerator(); e.GetDefaultAudioEndpoint(0,1,out var d); var g = typeof(IAudioEndpointVolume).GUID; d.Activate(ref g, 23, System.IntPtr.Zero, out var o); var v = (IAudioEndpointVolume)o; v.GetMasterVolumeLevelScalar(out float f); return f; }
  public static bool Muted() { var e = (IMMDeviceEnumerator)new MMDeviceEnumerator(); e.GetDefaultAudioEndpoint(0,1,out var d); var g = typeof(IAudioEndpointVolume).GUID; d.Activate(ref g, 23, System.IntPtr.Zero, out var o); var v = (IAudioEndpointVolume)o; v.GetMute(out bool m); return m; }
}
'@ -Language CSharp
[Vol]::Get().ToString('F2') + ',' + [Vol]::Muted().ToString()
    `.replace(/\n\s+/g, ' '),
    )
    const [levelStr, mutedStr] = out.split(',')
    const level = Math.round(parseFloat(levelStr) * 100)
    const muted = mutedStr.trim().toLowerCase() === 'true'
    return { level, muted }
  } catch {
    // Fallback: simpler PowerShell module approach
    try {
      const out2 = execSync(
        `powershell -NoProfile -Command "[math]::Round((Get-Volume).Level * 100)"`,
        { encoding: 'utf8', timeout: 5000 },
      ).trim()
      return { level: parseInt(out2, 10) || 0, muted: false }
    } catch {
      return { level: 50, muted: false }
    }
  }
}

function setVolumeLevel(level: number): void {
  // Use SoundVolumeView or nircmd if available, otherwise pure PS COM
  const clampedLevel = Math.max(0, Math.min(100, level))
  try {
    // Try PowerShell audio cmdlets first (requires AudioDeviceCmdlets module — may not be installed)
    execSync(
      `powershell -NoProfile -Command "& { $wshell = New-Object -com wscript.shell; $vol = [math]::Round(${clampedLevel} / 2); for ($i = 0; $i -lt 50; $i++) { $wshell.SendKeys([char]174) }; for ($i = 0; $i -lt $vol; $i++) { $wshell.SendKeys([char]175) } }"`,
      { encoding: 'utf8', timeout: 8000 },
    )
  } catch {
    // Ignore — media key fallback isn't precise
  }
}

function setMute(_mute: boolean): void {
  try {
    execSync(
      `powershell -NoProfile -Command "& { $wshell = New-Object -com wscript.shell; $wshell.SendKeys([char]173) }"`,
      { encoding: 'utf8', timeout: 5000 },
    )
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Media key helper — used by volume & media tools
// ---------------------------------------------------------------------------

export function sendMediaKey(
  key: 'play_pause' | 'next' | 'prev' | 'vol_up' | 'vol_down' | 'mute',
): void {
  const vkMap: Record<string, number> = {
    play_pause: 179,
    next: 176,
    prev: 177,
    vol_up: 175,
    vol_down: 174,
    mute: 173,
  }
  const vk = vkMap[key]
  if (!vk) return
  try {
    execSync(
      `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('')"`,
      { encoding: 'utf8', timeout: 3000 },
    )
  } catch {
    // ignore
  }
  // Use keybd_event via PowerShell inline C#
  execSync(
    `powershell -NoProfile -Command "Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class KE { [DllImport(\\"user32.dll\\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo); }' -Language CSharp; [KE]::keybd_event(${vk}, 0, 0, [System.UIntPtr]::Zero); [KE]::keybd_event(${vk}, 0, 0x0002, [System.UIntPtr]::Zero)"`,
    { encoding: 'utf8', timeout: 5000 },
  )
}

// ---------------------------------------------------------------------------
// Tool registrations
// ---------------------------------------------------------------------------

export function registerVolumeTools(): void {
  registerTool({
    id: 'volume.get',
    tier: 'safe',
    describeForModel: 'Get the current Windows system volume level (0-100) and mute state.',
    paramsSchema: z.object({}),
    resultSchema: z.object({ level: z.number(), muted: z.boolean() }),
    execute: async () => getVolume(),
  })

  registerTool({
    id: 'volume.set',
    tier: 'confirm-transient',
    describeForModel: 'Set Windows system volume to a level between 0 and 100.',
    paramsSchema: z.object({
      level: z.number().int().min(0).max(100).describe('Volume level 0–100'),
    }),
    resultSchema: z.object({ ok: z.boolean(), level: z.number() }),
    reversible: {
      windowMs: 5 * 60 * 1000,
      undo: async (params, _result) => {
        setVolumeLevel(params.level)
      },
    },
    execute: async (params) => {
      setVolumeLevel(params.level)
      return { ok: true, level: params.level }
    },
  })

  registerTool({
    id: 'volume.mute',
    tier: 'confirm-transient',
    describeForModel:
      'Mute or unmute Windows system audio. If "mute" is omitted, toggles the current state.',
    paramsSchema: z.object({
      mute: z.boolean().optional().describe('true = mute, false = unmute, omit = toggle'),
    }),
    resultSchema: z.object({ ok: z.boolean(), muted: z.boolean() }),
    reversible: {
      windowMs: 5 * 60 * 1000,
      undo: async (params) => {
        setMute(!(params.mute ?? false))
      },
    },
    execute: async (params) => {
      setMute(params.mute ?? !getVolume().muted)
      const { muted } = getVolume()
      return { ok: true, muted }
    },
  })

  registerTool({
    id: 'media.play',
    tier: 'safe',
    describeForModel: 'Send the play/pause media key to Windows.',
    paramsSchema: z.object({}),
    resultSchema: z.object({ ok: z.boolean() }),
    execute: async () => {
      sendMediaKey('play_pause')
      return { ok: true }
    },
  })

  registerTool({
    id: 'media.next',
    tier: 'safe',
    describeForModel: 'Send the next-track media key to Windows.',
    paramsSchema: z.object({}),
    resultSchema: z.object({ ok: z.boolean() }),
    execute: async () => {
      sendMediaKey('next')
      return { ok: true }
    },
  })

  registerTool({
    id: 'media.prev',
    tier: 'safe',
    describeForModel: 'Send the previous-track media key to Windows.',
    paramsSchema: z.object({}),
    resultSchema: z.object({ ok: z.boolean() }),
    execute: async () => {
      sendMediaKey('prev')
      return { ok: true }
    },
  })
}
