# @deepseek-ai/dsh-client-ui-live2d

English | [中文](README.zh.md)

Local-first Live2D companion for the Harness coding workspace. The feature contributes one additive entry to the layout's `shell.right` slot, so the character is embedded in a fixed right workspace beside the conversation; that column participates in normal layout and never covers the conversation or composer. Tool inspection keeps its separate `details` column.

The empty state explains the workflow and lets a user choose a model folder. The folder must contain one `.model3.json` or `.model.json` entry file and its referenced `.moc3`/`.moc`, texture, motion, expression, physics, and audio resources. The browser converts the selected files to temporary object URLs and rewrites the entry document's local references before handing it to [`l2d`](https://github.com/hacxy/l2d); model bytes are not sent to the Host or the model provider.

After loading, the companion shows the current model name and file count, follows the selected Harness session's running state with a small status indicator, and exposes model size, opacity, hide/show, change, and remove controls. The renderer is disposed together with the slot entry, including WebGL state and object URLs, so selecting a new model does not leave the previous model resident.

The component is deliberately browser-only. Qt remains a WebEngine/process shell and does not need a Live2D SDK or a second rendering path. This keeps local model ownership and the UI seam in the same place as the rest of the Web plugin system.

When the page runs in the Qt shell, a loaded model also exposes `Desktop pet`. The shell opens a second WebEngine view in a frameless, always-on-top 360x480 window, restores the current model there, and hides the rest of that view's Web UI. On window systems that expose global pointer coordinates, the model follows the pointer across the desktop; drag the window to move it, scroll up over the pet to enlarge it or down to shrink it to 240x320, and double-click to close it. Browser sessions do not expose this action.

The floating pet includes a chat button. Opening it restores or creates a dedicated Harness Session and renders that Session's user and assistant text inside a compact panel. Its context is separate from the main workspace chat, and selecting it in the pet's auxiliary browser runtime does not replace the main workspace's persisted current Session. While the panel is open, mouse clicks and wheel input stay with the Web chat controls; close the panel to restore whole-window dragging, wheel resizing, and double-click exit.

## Development

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-live2d bundle
pnpm run test:gui
```

The browser bundle inlines `l2d`, while React, the slot renderer, and UI primitives continue to resolve from the Harness browser module table. Live2D Cubism-based runtimes and model assets have separate licensing obligations; review the [`l2d` license and disclaimer](https://github.com/hacxy/l2d#disclaimer) and [Live2D's SDK license](https://www.live2d.com/en/sdk/license/) before distributing a product that accepts arbitrary user models.

## Model Experience

### Local companion state and desktop-pet chat

#### What the model sees

The embedded workspace companion only reacts to local model state and the selected Session's running bit. Sending from the desktop-pet chat admits the typed text through the dedicated Session's normal `prompt` path, so that Session's agent sees its own conversation history and configured tools; it does not see the main workspace chat unless the user explicitly supplies that content.

#### Token effect

Model rendering and its status indicator have no token cost. Desktop-pet chat uses the normal token accounting of its dedicated Session.

#### KV Cache effect

The local model UI does not affect provider caching. Each desktop-pet chat turn continues the dedicated Session's own provider context, independently of the main workspace Session.

## Known Limitations and Deferred Work

- **The current model stays local to this browser profile** — model files are cached in same-origin IndexedDB for the desktop-pet view and are not synchronized to another browser or machine.
- **One folder at a time** — the picker rejects a selection containing multiple model entry files, which avoids silently displaying the wrong character when a parent directory contains several models.
- **Renderer coverage follows `l2d`** — the package accepts the two common Cubism entry formats, while a particular model can still fail if its exported resources or license are incomplete. The model owner remains responsible for the model's distribution and usage rights.
- **Chat does not yet drive animation** — the model keeps its own idle/tap behavior; message-linked expressions, voice/lip-sync, and a model library can be added behind a future browser-side service without moving model bytes through the Host.
