// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  buildModelBundle,
  filePath,
  ModelImportError,
  modelName,
  normalizePath,
} from '../src/client/model-files.ts'

/** Add the directory path that Chromium exposes only on directory picks. */
function file(name: string, path = name): File {
  const result = new File(['model'], name, { type: 'application/octet-stream' })
  Object.defineProperty(result, 'webkitRelativePath', { configurable: true, value: path })
  return result
}

describe('Live2D model file helpers', () => {
  it('normalizes separators and parent segments', () => {
    expect(normalizePath('Avatar\\motions/../Haru.model3.json')).toBe('Avatar/Haru.model3.json')
    expect(normalizePath('./Avatar//textures/./body.png')).toBe('Avatar/textures/body.png')
  })

  it('reads the directory-relative path and derives the model name', () => {
    const entry = file('Haru.model3.json', 'Haru/Haru.model3.json')
    expect(filePath(entry)).toBe('Haru/Haru.model3.json')
    expect(modelName(filePath(entry))).toBe('Haru')
    expect(modelName('shizuku.model.json')).toBe('shizuku')
  })

  it('accepts one model3 entry with model data', () => {
    const entry = file('Haru.model3.json', 'Haru/Haru.model3.json')
    const bundle = buildModelBundle([entry, file('Haru.moc3', 'Haru/Haru.moc3')])
    expect(bundle).toMatchObject({ name: 'Haru', entryPath: 'Haru/Haru.model3.json' })
    expect(bundle.files).toHaveLength(2)
  })

  it.each([
    ['no-files', []],
    ['missing-entry', [file('Haru.moc3')]],
    ['missing-model-data', [file('Haru.model3.json')]],
  ] as const)('rejects %s selections', (code, files) => {
    expect(() => buildModelBundle(files)).toThrow(ModelImportError)
    try {
      buildModelBundle(files)
    } catch (error) {
      expect(error).toMatchObject({ code })
    }
  })

  it('rejects a parent folder containing more than one model entry', () => {
    expect(() => buildModelBundle([
      file('one.model3.json', 'one/one.model3.json'),
      file('one.moc3', 'one/one.moc3'),
      file('two.model.json', 'two/two.model.json'),
      file('two.moc', 'two/two.moc'),
    ])).toThrow(new ModelImportError('multiple-entries'))
  })
})
