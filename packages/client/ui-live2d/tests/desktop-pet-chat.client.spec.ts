// @vitest-environment jsdom

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PendingWait, type SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { TestSessions } from '@deepseek-ai/dsh-client-test-runtime'
import {
  DesktopPetChatController, type DesktopPetChatSessions,
} from '../src/client/desktop-pet-chat.ts'

const controllers: DesktopPetChatController[] = []
const runtimes: TestSessions[] = []
const PET_SESSION_KEY = 'dsh.live2d.desktop-pet-session'

afterEach(async () => {
  for (const controller of controllers.splice(0)) controller.dispose()
  for (const runtime of runtimes.splice(0)) await runtime.disposeScopes()
})

function sessions(): TestSessions {
  const runtime = new TestSessions(async (run) => { await run() }, new Context())
  runtimes.push(runtime)
  return runtime
}

function controller(
  runtime: DesktopPetChatSessions,
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
): DesktopPetChatController {
  const value = new DesktopPetChatController(runtime, storage)
  controllers.push(value)
  return value
}

describe('desktop-pet chat controller', () => {
  it('restores its dedicated session and projects only compact user and assistant text', async () => {
    const runtime = sessions()
    await runtime.add({ id: 'main' })
    await runtime.add({ id: 'pet' }, { current: false })
    const storage = {
      getItem: vi.fn(() => 'pet'),
      setItem: vi.fn(),
    }
    const chat = controller(runtime, storage)
    const listener = vi.fn()
    const unsubscribe = chat.subscribe(listener)

    await expect(chat.activate()).resolves.toBe('pet')
    await expect(chat.activate()).resolves.toBe('pet')
    expect(runtime.calls.filter(call => call.method === 'openTransient')).toEqual([
      { method: 'openTransient', args: ['pet'] },
    ])
    expect(storage.setItem).not.toHaveBeenCalled()

    await runtime.updateSnapshot('pet', (draft) => {
      draft.nodes = [
        {
          kind: 'user', seq: 1, time: 1,
          content: [{ type: 'text', text: '[Desktop pet persona]\n你是一只猫耳桌宠。\n\n你好' }],
          source: null,
        },
        { kind: 'context', seq: 2, time: 2, content: [{ type: 'text', text: '隐藏' }], source: null, provenance: { kind: 'unknown' }, form: null } as never,
        { kind: 'assistant', seq: 3, time: 3, turn: 1, step: 1, blocks: [
          { kind: 'reasoning', text: '不显示' }, { kind: 'text', text: '你好呀' },
        ] },
      ]
      draft.partial = { turn: 2, step: 1, blocks: [{ kind: 'text', text: '正在回答' }] }
      draft.running = true
    })

    expect(chat.getSnapshot()).toMatchObject({
      status: 'ready',
      sessionId: 'pet',
      running: true,
      messages: [
        { id: 'user-1', role: 'user', text: '你好' },
        { id: 'assistant-3', role: 'assistant', text: '你好呀' },
        { id: 'assistant-partial-2-1', role: 'assistant', text: '正在回答', streaming: true },
      ],
    })
    expect(listener).toHaveBeenCalled()
    unsubscribe()
  })

  it('projects a pending command approval and answers it through the Session carrier', async () => {
    const runtime = sessions()
    const response = vi.fn(async () => ({ accepted: true as const }))
    const sessionId = 'pet' as SessionId
    const wait = new PendingWait('approval', 'approval-rpc' as never, sessionId, {
      approvalId: 'approval-1' as never,
      toolName: 'bash',
      callId: 'call-1' as never,
      reason: '需要写入工作区文件',
    }, response)
    await runtime.add({
      id: 'pet',
      snapshot: {
        pending: [wait],
        runningCalls: [{
          callId: 'call-1', name: 'bash', argsRaw: '{"command":"echo desktop pet"}',
          turn: 1, step: 1, time: 1, callView: null, subCalls: [],
        }] as never,
      },
    }, { current: false })
    const chat = controller(runtime, { getItem: vi.fn(() => 'pet'), setItem: vi.fn() })

    await chat.activate()
    expect(chat.getSnapshot().pendingApproval).toEqual({
      key: 'a:approval-rpc',
      toolName: 'bash',
      reason: '需要写入工作区文件',
      command: 'echo desktop pet',
    })
    await expect(chat.answerApproval('allowed-once')).resolves.toBe(true)
    expect(response).toHaveBeenCalledWith({
      type: 'client-response',
      rpcId: 'approval-rpc',
      result: {
        ok: true,
        value: { sessionId, approvalId: 'approval-1', outcome: 'allowed-once' },
      },
    })
  })

  it('creates and remembers a missing session, then reports prompt acceptance and rejection', async () => {
    const runtime = sessions()
    const prompt = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: { accepted: true } })
      .mockResolvedValueOnce({ ok: false, error: { code: 'busy', message: '稍后再试' } })
    const originalCreate = runtime.create.bind(runtime)
    runtime.create = vi.fn(async () => {
      const id = await originalCreate({ sessionId: 'pet-created' as SessionId })
      Object.assign(runtime.binding(id)!.session, { prompt })
      return id
    })
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() }
    const chat = controller(runtime, storage)

    const first = chat.activate()
    expect(chat.activate()).toBe(first)
    await expect(first).resolves.toBe('pet-created')
    expect(storage.setItem).toHaveBeenCalledWith(PET_SESSION_KEY, 'pet-created')
    await expect(chat.send('第一条')).resolves.toBe(true)
    await expect(chat.send('第二条')).resolves.toBe(false)
    expect(chat.getSnapshot().error).toBe('稍后再试')
    expect(prompt).toHaveBeenNthCalledWith(1, [{ type: 'text', text: '第一条' }], 'queue')
    await expect(chat.send('')).resolves.toBe(false)
  })

  it('surfaces activation and prompt failures without publishing after disposal', async () => {
    const list = {
      getSnapshot: () => ({ byId: {} }),
      subscribe: () => () => {},
    }
    const failing = controller({
      list: list as never,
      create: vi.fn(() => Promise.reject(new Error('离线'))),
      openTransient: vi.fn(),
      binding: vi.fn(),
    })
    await expect(failing.activate()).rejects.toThrow('离线')
    expect(failing.getSnapshot()).toMatchObject({ status: 'error', error: '离线' })

    const runtime = sessions()
    await runtime.add({
      id: 'pet',
      session: { prompt: vi.fn(() => Promise.reject(new Error('发送失败'))) },
    }, { current: false })
    runtime.create = vi.fn(() => Promise.resolve('pet' as SessionId))
    const storage = {
      getItem: vi.fn(() => { throw new Error('读取失败') }),
      setItem: vi.fn(() => { throw new Error('写入失败') }),
    }
    const chat = controller(runtime, storage)
    const publish = vi.fn()
    chat.subscribe(publish)
    await expect(chat.send('消息')).resolves.toBe(false)
    expect(chat.getSnapshot().error).toBe('发送失败')
    const published = publish.mock.calls.length
    chat.dispose()
    chat.dispose()
    await runtime.updateSnapshot('pet', (draft) => { draft.running = true })
    expect(publish).toHaveBeenCalledTimes(published)
  })
})
