// Keyless assembled-browser snapshot for the desktop pet's isolated chat.
// Two pages share the Qt profile's origin: the primary surface remains on its
// selected Session while the pet page transiently opens its own seeded Session.
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, BrowserContext, Page } from 'playwright'
import { chromium } from 'playwright'
import { createMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/desktop-pet-chat', import.meta.url))
const UI_EXPECTED = join(SNAPSHOT_DIR, 'ui.expected.md')
const MODE = webSnapshotMode()
const MAIN_ID = SessionId('desktop-pet-main')
const PET_ID = SessionId('desktop-pet-chat')

describe('web e2e: isolated desktop-pet chat', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let context: BrowserContext
  let mainPage: Page
  let petPage: Page
  let mainTripwire: ReturnType<typeof watchConsole>
  let petTripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    scaffold.ctx.sessions.create(MAIN_ID)
    const pet = scaffold.ctx.sessions.create(PET_ID)
    pet.append('turn/start', { turn: 1 })
    const user = pet.append('user/message', createUserMessage({
      content: [{ type: 'text', text: '今天一起写代码吧。' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    pet.append('session/title', {
      title: '桌宠聊天',
      messageSeqs: [user.seq],
      source: { kind: 'fallback' },
    })
    pet.append('step/start', { turn: 1, step: 1 })
    pet.append('assistant/message', {
      turn: 1,
      step: 1,
      message: createMessage({
        role: 'assistant',
        content: [{ type: 'text', text: '好呀，我会在独立会话里陪着你。' }],
        source: { kind: 'model', provider: 'fixture', model: 'fixture' },
      }),
    }, { surfaceOp: 'append' })
    pet.append('step/end', { turn: 1, step: 1 })
    pet.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    const executablePath = process.env.DSH_PLAYWRIGHT_EXECUTABLE_PATH
    browser = await chromium.launch(executablePath === undefined ? {} : { executablePath })
    context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      locale: ZH_BROWSER_LOCALE,
    })
    await context.addInitScript(({ mainId, petId }) => {
      localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: mainId }))
      localStorage.setItem('dsh.live2d.desktop-pet-session', petId)
    }, { mainId: MAIN_ID, petId: PET_ID })
    mainPage = await context.newPage()
    mainTripwire = watchConsole(mainPage)
    await mainPage.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await mainPage.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    petPage = await context.newPage()
    petTripwire = watchConsole(petPage)
    await petPage.goto(`${scaffold.baseUrl}/?dshDesktopPet=1`, { waitUntil: 'load' })
    await petPage.waitForSelector('[data-live2d-companion="true"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await context?.close()
    await browser?.close()
    await scaffold?.close()
  })

  it('opens the pet Session without moving the primary surface selection', async () => {
    onTestFailed(() => saveFailureShot(petPage, 'web-e2e-desktop-pet-chat'))
    await petPage.getByRole('button', { name: '打开桌宠聊天' }).click()
    const panel = petPage.getByRole('complementary', { name: '桌宠聊天' })
    await panel.getByText('好呀，我会在独立会话里陪着你。', { exact: true }).waitFor({ timeout: 15_000 })
    await expect.poll(() => panel.getByRole('textbox', { name: '输入消息…' }).isEnabled())
      .toBe(true)

    expect(await petPage.evaluate(() => localStorage.getItem('dsh.sessions.current')))
      .toBe(JSON.stringify({ sessionId: MAIN_ID }))
    expect(await mainPage.evaluate(() => localStorage.getItem('dsh.sessions.current')))
      .toBe(JSON.stringify({ sessionId: MAIN_ID }))
    expect(await mainPage.locator('textarea').first().isEnabled()).toBe(true)

    const snapshot = await captureStableAria(
      petPage,
      '[aria-label="桌宠聊天"]',
      scaffold.workspaceCwd,
    )
    await compareOrRefreshGolden(UI_EXPECTED, snapshot, MODE)
    expect(mainTripwire.pageErrors).toEqual([])
    expect(petTripwire.pageErrors).toEqual([])
  }, 60_000)

  it('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['ui.expected.md'])
  })
})
