// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { Live2DOverlayProps } from '../src/client/Live2DOverlay.tsx'
import { en, zh } from '../src/client/locales.ts'
import { Live2DOverlay } from '../src/client/Live2DOverlay.tsx'

const mountLive2D = vi.hoisted(() => vi.fn(() => () => {}))
vi.mock('../src/client/renderer.ts', () => ({ mountLive2D }))

afterEach(() => {
  cleanup()
  mountLive2D.mockClear()
})

const t = makeTranslate(zh)
const props = (): Live2DOverlayProps => ({
  t,
  useSessions: ((selector: (snapshot: { current: undefined; byId: Record<string, never> }) => boolean) =>
    selector({ current: undefined, byId: {} })) as unknown as Live2DOverlayProps['useSessions'],
  // The overlay does not read workspace state; this keeps the required global
  // standard prop explicit without coupling the test to the workspace store.
  useWorkspaces: (() => undefined) as unknown as Live2DOverlayProps['useWorkspaces'],
})

function selectedFiles(): File[] {
  const entry = new File(['{"FileReferences":{"Moc":"Haru.moc3"}}'], 'Haru.model3.json', {
    type: 'application/json',
  })
  const moc = new File(['moc'], 'Haru.moc3')
  return [entry, moc]
}

describe('Live2D companion right workspace', () => {
  it('starts with a discoverable local upload state and can be hidden/restored', () => {
    render(<Live2DOverlay {...props()} />)
    expect(screen.getByText('上传你的模型')).toBeTruthy()
    expect(screen.getByRole('button', { name: '上传模型文件夹' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '隐藏 Live2D 陪伴' }))
    expect(screen.getByRole('button', { name: '显示 Live2D 陪伴' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '显示 Live2D 陪伴' }))
    expect(screen.getByText('上传你的模型')).toBeTruthy()
  })

  it('accepts one model folder and exposes local appearance controls', async () => {
    const view = render(<Live2DOverlay {...props()} />)
    const input = view.container.querySelector('input[type="file"]')
    expect(input).not.toBeNull()
    fireEvent.change(input!, { target: { files: selectedFiles() } })

    await waitFor(() => { expect(screen.getAllByText('Haru')).not.toHaveLength(0) })
    expect(screen.getByText('2 个文件')).toBeTruthy()
    expect(mountLive2D).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '调整外观' }))
    expect(screen.getByRole('slider', { name: '模型大小' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: '透明度' })).toBeTruthy()
    fireEvent.change(screen.getByRole('slider', { name: '模型大小' }), { target: { value: '1.2' } })
    expect(screen.getByText('120%')).toBeTruthy()
  })

  it('keeps the existing model when a second selection is invalid', async () => {
    const view = render(<Live2DOverlay {...props()} />)
    const input = view.container.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: selectedFiles() } })
    await waitFor(() => { expect(screen.getAllByText('Haru')).not.toHaveLength(0) })

    fireEvent.change(input, { target: { files: [new File(['readme'], 'README.txt')] } })
    expect(screen.getAllByText('Haru')).not.toHaveLength(0)
    expect(screen.getByRole('alert').textContent).toBe('没有找到 .model3.json 或 .model.json 入口文件。')
  })

  it('keeps the locale key sets balanced', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })
})
