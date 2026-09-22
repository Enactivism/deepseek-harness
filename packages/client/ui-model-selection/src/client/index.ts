/**
 * Model selection plugin, browser half — THREE entries over ONE per-session
 * directory owned by ModelDirectoryResolver (`ctx.modelDirectories`). The /model popupSelect
 * contribution and the composer's named `conversation.input.model` seat both
 * load the session's provider-grouped advisory directory (`session.models`)
 * and submit through `session.selectModel` via the same directory instance,
 * while the native desktop-pet chat contributes a root-scoped third entry over
 * the dedicated Session supplied by its owner. The host-reported current
 * selection is the single fact all surfaces echo — a switch made in any entry
 * is what the others show next. Failures ride each entry's own retry surface
 * (popup shell error/retry; seat menu inline error) without forking the state.
 * Addressed subagent sessions expose none of these entries because those Agent-bound
 * RPCs would activate persisted history outside the direct-parent continuation path.
 */
// Type-only: the carrier types, the forwarded Host-event face and the ctx.remote merge.
import type { ModelSelection, SessionModels } from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { CommandUiContract, SelectOption } from '@deepseek-ai/dsh-client-ui-commands/client'
// Type-only: pulls the ui-conversation SlotMap merge (the input.model seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelDirectoryState } from './directory.ts'
import { ModelDirectoryResolver } from './service.ts'
import type { ModelSelectInjected } from './slots.ts'
import { ModelSelect } from './ModelSelect.tsx'
import {
  DesktopPetModelSelect,
  type DesktopPetModelSelectInjected,
  type DesktopPetModelSelectOwner,
} from './DesktopPetModelSelect.tsx'

export type {
  DesktopPetModelSelectInjected,
  DesktopPetModelSelectOwner,
} from './DesktopPetModelSelect.tsx'
import { en, zh, type ModelKey } from './locales.ts'

export { ModelDirectory } from './directory.ts'
export type { ModelDirectoryState } from './directory.ts'
export { ModelDirectoryResolver } from './service.ts'
export type { ModelSelectInjected } from './slots.ts'
export { ModelSelect } from './ModelSelect.tsx'
export type { ModelKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The model selection surfaces' copy (/model popup + composer seat). */
    model: ModelKey
  }

  interface SlotMap {
    /** Model selector rendered by the native desktop-pet chat window. */
    'desktop-pet.model': {
      kind: 'single'
      scope: 'root'
      owner: DesktopPetModelSelectOwner
    }
  }
}

/** One selectable row's id: an opaque row key (resolved by lookup, never parsed). */
function rowId(providerId: string, modelId: string): string {
  return `${providerId}/${modelId}`
}

/** Flatten the directory into popup rows; failure rows are listed for visibility but never selectable. */
function optionsOf(directory: SessionModels, t: TranslateNS<'model'>): SelectOption[] {
  const rows: SelectOption[] = []
  for (const group of directory.groups) {
    for (const model of group.models) {
      rows.push({
        id: rowId(group.id, model.id),
        label: model.name,
        detail: model.description !== undefined ? `${group.name} · ${model.description}` : group.name,
        ...(directory.current.provider === group.id && directory.current.model === model.id
          ? { active: true } : {}),
      })
    }
  }
  for (const failure of directory.failures) {
    rows.push({
      id: `failure/${failure.id}`,
      label: failure.name,
      detail: t('option.loadError', { message: failure.message }),
    })
  }
  return rows
}

/**
 * Resolve a picked row back to its model selection by matching against the loaded
 * groups (the same data the rows were built from — ids stay opaque).
 * @param state - the session's directory snapshot.
 * @param id - the picked row id.
 * @returns the row's model selection, or undefined for failure rows / stale ids.
 */
function selectionOf(state: ModelDirectoryState, id: string): ModelSelection | undefined {
  for (const group of state.groups) {
    for (const model of group.models) {
      if (rowId(group.id, model.id) !== id) continue
      const sameRoute = state.current?.provider === group.id && state.current.model === model.id
      const reasoningEffort = sameRoute
        ? state.current?.reasoningEffort ?? model.reasoning?.defaultEffort
        : model.reasoning?.defaultEffort
      return {
        provider: group.id,
        model: model.id,
        ...reasoningEffort === undefined ? {} : { reasoningEffort },
      }
    }
  }
  return undefined
}

/** Dictionary namespace owned by this plugin. */
const NS = 'model'

/** Required services: the contribution registry, the seat's slot registry, locale, and the service's own faces. */
export const inject = ['commandUi', 'connection', 'locale', 'sessions', 'slots', 'remote']

/**
 * Client plugin body: mount ModelDirectoryResolver, register the `model` dictionaries,
 * then register the /model popup contribution and the composer model seat
 * over the service.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-model-selection: dictionaries')

  // Non-slot faces (the command description, the popup option builder) read
  // through the bound translate; the seat component reads the standard seat.
  const t = ctx.locale.bind(NS)

  // The composer-block reason is this plugin's own copy, read at raise time so
  // a locale change reaches the next publish.
  ctx.plugin(ModelDirectoryResolver, { blockReason: () => t('blocked.composer') })

  // Entry 1: the /model popupSelect over the shared directory. The command
  // description is registry-held text: it reads t() once at registration and
  // refreshes only on re-registration, not on locale change.
  ctx.inject(['commandUi', 'modelDirectories'], (scope: ClientContext) => {
    const command = scope.get('commandUi') as CommandUiContract
    const models = scope.modelDirectories
    const sessions = scope.sessions
    scope.effect(() => command.register({
      name: 'model',
      description: t('command.description'),
      available: session => sessions.subagentAddress(session.sessionId) === undefined,
      ui: {
        kind: 'popupSelect',
        options: async (session) => {
          if (sessions.subagentAddress(session.sessionId) !== undefined) {
            throw new Error('model selection is unavailable for addressed subagent sessions')
          }
          return optionsOf(await models.directoryFor(session.sessionId).load(), t)
        },
        onSelect: async (option, session) => {
          if (sessions.subagentAddress(session.sessionId) !== undefined) {
            throw new Error('model selection is unavailable for addressed subagent sessions')
          }
          const directory = models.directoryFor(session.sessionId)
          const selection = selectionOf(directory.store.getSnapshot(), option.id)
          if (selection === undefined) {
            throw new Error('this provider\'s catalog failed to load — pick a model from a loaded group')
          }
          await directory.select(selection)
        },
      },
    }), 'ui-model-selection: /model contribution')
  })

  // Entry 2: the composer's named model seat over the SAME directory.
  ctx.inject(['slots', 'modelDirectories'], (scope: ClientContext) => {
    const models = scope.modelDirectories
    const sessions = scope.sessions
    scope.slots.inject('conversation.input.model', () => scope.slots.register({
      name: 'conversation.input.model',
      locale: NS,
      inject: (sessionId): ModelSelectInjected => {
        const directory = models.directoryFor(sessionId)
        const available = sessions.subagentAddress(sessionId) === undefined
        return {
          available,
          directory: directory.store,
          load: () => {
            if (available) directory.load().catch(() => { /* surfaced on the store */ })
          },
          select: (selection: ModelSelection) => available
            ? directory.select(selection).then(() => true, () => false)
            : Promise.resolve(false),
        }
      },
    }, ModelSelect))
  })

  // The native desktop-pet chat is a root-scoped surface, so it supplies its
  // dedicated Session id as owner data instead of borrowing the current-session
  // standard kit used by the main composer.
  ctx.slots.inject('desktop-pet.model', () => {
    const fiber = ctx.inject(['modelDirectories'], (scope: ClientContext) => {
      scope.effect(() => scope.slots.register({
        name: 'desktop-pet.model',
        locale: NS,
        inject: (): DesktopPetModelSelectInjected => ({
          selectionFor: (sessionId: SessionId): ModelSelectInjected => {
            const directory = scope.modelDirectories.directoryFor(sessionId)
            const available = scope.sessions.subagentAddress(sessionId) === undefined
            return {
              available,
              directory: directory.store,
              load: () => {
                if (available) directory.load().catch(() => { /* surfaced on the store */ })
              },
              select: selection => available
                ? directory.select(selection).then(() => true, () => false)
                : Promise.resolve(false),
            }
          },
        }),
      }, DesktopPetModelSelect), 'ui-model-selection: desktop-pet model slot')
    })
    return () => { void fiber.dispose() }
  })
}
