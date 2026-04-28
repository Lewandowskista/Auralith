import { EventEmitter } from 'events'
import { describe, expect, test, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  fork: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => 'C:\\Users\\Stefan\\ProjectTank\\apps\\desktop',
  },
  utilityProcess: {
    fork: electronMock.fork,
  },
}))

import { WhisperClient } from './whisper-client'

describe('WhisperClient worker path', () => {
  test('uses a JavaScript utility-process entry in development', () => {
    const client = new WhisperClient()
    const workerPath = (client as unknown as { getWorkerPath: () => string }).getWorkerPath()

    expect(workerPath).toContain('workers\\whisper\\index.js')
    expect(workerPath).not.toContain('src\\workers\\whisper\\index.ts')
  })

  test('sends resolved whisper binary path to the worker when loading a model', () => {
    const postMessage = vi.fn()
    const proc = Object.assign(new EventEmitter(), {
      postMessage,
      stdout: null,
      stderr: null,
      kill: vi.fn(),
    })
    electronMock.fork.mockReturnValue(proc)

    const client = new WhisperClient()
    client.setModelPath('C:\\Users\\Stefan\\ProjectTank\\resources\\whisper\\ggml-base.en-q5_1.bin')
    client.ensureRunning()

    expect(postMessage).toHaveBeenCalledWith({
      type: 'load',
      modelPath: 'C:\\Users\\Stefan\\ProjectTank\\resources\\whisper\\ggml-base.en-q5_1.bin',
      binPath: 'C:\\Users\\Stefan\\ProjectTank\\apps\\desktop\\resources\\whisper\\whisper.exe',
    })
  })
})
