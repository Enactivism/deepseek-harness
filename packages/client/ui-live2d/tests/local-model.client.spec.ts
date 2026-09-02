// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildModelBundle } from '../src/client/model-files.ts'
import { prepareLocalModel } from '../src/client/local-model.ts'

const createObjectURL = vi.fn<(value: Blob) => string>()
const revokeObjectURL = vi.fn<(value: string) => void>()

function file(name: string, contents: string, path = name): File {
  const result = new File([contents], name, { type: 'application/octet-stream' })
  Object.defineProperty(result, 'webkitRelativePath', { configurable: true, value: path })
  return result
}

beforeEach(() => {
  let next = 0
  createObjectURL.mockImplementation(() => `blob:live2d-${String(next++)}`)
  revokeObjectURL.mockImplementation(() => undefined)
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
})

afterEach(() => {
  vi.unstubAllGlobals()
  createObjectURL.mockReset()
  revokeObjectURL.mockReset()
})

describe('local Live2D model preparation', () => {
  it('rewrites nested local references and releases every owned object URL', async () => {
    const entry = file('Haru.model3.json', JSON.stringify({
      FileReferences: {
        Moc: 'Haru.moc3',
        Textures: ['textures/body.png'],
        Motion: 'motions/idle.motion3.json?cache=1',
        External: 'https://example.com/remote.png',
      },
    }), 'Haru/Haru.model3.json')
    const moc = file('Haru.moc3', 'moc', 'Haru/Haru.moc3')
    const texture = file('body.png', 'png', 'Haru/textures/body.png')
    const motion = file('idle.motion3.json', '{}', 'Haru/motions/idle.motion3.json')
    const prepared = await prepareLocalModel(buildModelBundle([entry, moc, texture, motion]))

    expect(prepared.entryUrl).toBe('blob:live2d-4')
    const rewritten = JSON.parse(await (createObjectURL.mock.calls[4]?.[0] as Blob).text()) as {
      FileReferences: { Moc: string; Textures: string[]; Motion: string; External: string }
    }
    expect(rewritten.FileReferences.Moc).toBe('blob:live2d-1')
    expect(rewritten.FileReferences.Textures).toEqual(['blob:live2d-2'])
    expect(rewritten.FileReferences.Motion).toBe('blob:live2d-3')
    expect(rewritten.FileReferences.External).toBe('https://example.com/remote.png')

    prepared.dispose()
    expect(revokeObjectURL.mock.calls.map(([url]) => url)).toEqual([
      'blob:live2d-0', 'blob:live2d-1', 'blob:live2d-2', 'blob:live2d-3', 'blob:live2d-4',
    ])
    prepared.dispose()
    expect(revokeObjectURL).toHaveBeenCalledTimes(5)
  })

  it('cleans file URLs when the model entry is invalid JSON', async () => {
    const entry = file('Haru.model3.json', '{not-json}', 'Haru/Haru.model3.json')
    const moc = file('Haru.moc3', 'moc', 'Haru/Haru.moc3')

    await expect(prepareLocalModel(buildModelBundle([entry, moc])))
      .rejects.toThrow('model entry is not valid JSON')
    expect(revokeObjectURL.mock.calls.map(([url]) => url)).toEqual([
      'blob:live2d-0', 'blob:live2d-1',
    ])
  })
})
