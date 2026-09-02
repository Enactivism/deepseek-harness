// @vitest-environment jsdom

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '../src/client/index.ts'
import { NS, en, zh } from '../src/client/locales.ts'

const mountLive2D = vi.hoisted(() => vi.fn(() => () => {}))
vi.mock('../src/client/renderer.ts', () => ({ mountLive2D }))

const disposers: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose()
})

describe('ui-live2d browser plugin', () => {
  it('declares its slot and locale services', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('registers an additive right workspace and releases it with the plugin', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.slots.register({
      name: 'root',
      children: { 'shell.right': { kind: 'list', scope: 'root' } },
    } as never, () => null)
    const locale = new LocaleRuntime(ctx)
    ctx.provide('locale', locale)

    const fiber = ctx.plugin({ inject, apply })
    disposers.push(() => fiber.dispose())
    await fiber.await()
    expect(ctx.slots.entries('shell.right').map(entry => entry.options.id)).toContain('live2d-companion')
    locale.setLocale('zh')
    expect(locale.bind(NS)('brand')).toBe(zh.brand)

    await fiber.dispose()
    expect(ctx.slots.entries('shell.right').map(entry => entry.options.id)).not.toContain('live2d-companion')
    expect(locale.bind(NS)('brand')).not.toBe(en.brand)
  })
})
