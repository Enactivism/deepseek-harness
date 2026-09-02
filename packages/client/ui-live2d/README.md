# @deepseek-ai/dsh-client-ui-live2d

English | [中文](README.zh.md)

Local-first Live2D companion for the Harness coding workspace. The feature contributes one additive entry to the layout's `shell.right` slot, so the character is embedded in a fixed right workspace beside the conversation; that column participates in normal layout and never covers the conversation or composer. Tool inspection keeps its separate `details` column.

The empty state explains the workflow and lets a user choose a model folder. The folder must contain one `.model3.json` or `.model.json` entry file and its referenced `.moc3`/`.moc`, texture, motion, expression, physics, and audio resources. The browser converts the selected files to temporary object URLs and rewrites the entry document's local references before handing it to [`l2d`](https://github.com/hacxy/l2d); model bytes are not sent to the Host or the model provider.

After loading, the companion shows the current model name and file count, follows the selected Harness session's running state with a small status indicator, and exposes model size, opacity, hide/show, change, and remove controls. The renderer is disposed together with the slot entry, including WebGL state and object URLs, so selecting a new model does not leave the previous model resident.

The component is deliberately browser-only. Qt remains a WebEngine/process shell and does not need a Live2D SDK or a second rendering path. This keeps local model ownership and the UI seam in the same place as the rest of the Web plugin system.

When the page runs in the Qt shell, a loaded model also exposes `Desktop pet`. The shell moves the existing WebEngine view into a frameless, always-on-top 360x480 window, keeps the current model mounted, and hides the rest of the Web UI in that window. Drag with the left mouse button to move it; double-click to return to the workspace. Browser sessions do not expose this action.

## Development

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-live2d bundle
pnpm run test:gui
```

The browser bundle inlines `l2d`, while React, the slot renderer, and UI primitives continue to resolve from the Harness browser module table. Live2D Cubism-based runtimes and model assets have separate licensing obligations; review the [`l2d` license and disclaimer](https://github.com/hacxy/l2d#disclaimer) and [Live2D's SDK license](https://www.live2d.com/en/sdk/license/) before distributing a product that accepts arbitrary user models.

## Model Experience

### Local companion state

#### What the model sees

Nothing. The companion reacts to local file selection and the read-only `current-session` running bit; it never changes `prompt`, messages, tool calls, schemas, or model configuration.

#### Token effect

None; the selected model and the running indicator stay in the browser UI.

#### KV Cache effect

None; no provider request is assembled or sent by this package.

## Known Limitations and Deferred Work

- **The current model is page-local** — a refresh clears the selected files because the implementation intentionally avoids copying potentially large model assets into Harness settings or a remote store. A later persistence feature can add an explicit IndexedDB library without changing the slot contract.
- **One folder at a time** — the picker rejects a selection containing multiple model entry files, which avoids silently displaying the wrong character when a parent directory contains several models.
- **Renderer coverage follows `l2d`** — the package accepts the two common Cubism entry formats, while a particular model can still fail if its exported resources or license are incomplete. The model owner remains responsible for the model's distribution and usage rights.
- **Interaction is intentionally small in this first slice** — the model keeps its own idle/tap behavior; chat-linked expressions, voice/lip-sync, and a model library can be added behind a future browser-side service without moving model bytes through the Host.
