# Agent Note: Restore the persisted Live2D model at application startup

Status: implemented

English | [中文](2026-09-26-live2d-model-startup-persistence.zh.md)

## Problem

The Live2D picker already stored the selected model bytes in same-origin IndexedDB, but only the desktop-pet page read that record. A normal application restart therefore showed the empty picker and required the user to select the same model again. Qt WebEngine's folder chooser also emits a `.` directory placeholder as a `File`; attempting to read its bytes rejects with `NotFoundError` and leaves the profile without a saved bundle.

## Decision

Every `Live2DOverlay` page loads the persisted model bundle during startup. Desktop-pet pages continue to accept the `BroadcastChannel` transfer used when IndexedDB is unavailable, and a newer selection or transfer wins over an in-flight restore. A folder import excludes `.` and `..` directory placeholders before model validation, rendering, and persistence. The remove action deletes the IndexedDB record as well as clearing the rendered model. Save and delete operations are serialized so a fast replacement or removal cannot let an older asynchronous write restore a stale model on the next launch. Save and delete promises settle when their IndexedDB transactions commit; read, save, and removal failures appear in the companion UI.

The repository ignores dedicated `live2d-models/`, `Live2DModels/`, and `.live2d-models/` directories at any depth, along with common Live2D model and animation file extensions. The browser's IndexedDB remains the runtime persistence location; the ignore rules protect optional model folders a developer may keep inside the checkout and do not make model assets repository data. The Qt shell gives all three WebEngine pages one named profile with a persistent storage directory under the system application-data location, so the IndexedDB record survives an application restart without writing model bytes into the checkout.

## Alternatives considered

**Keep restoration limited to the desktop-pet page.** Rejected because the main workspace is the normal entry point and must restore the same selected companion without another file-picker action.

**Persist only the filesystem path.** Rejected because browser file handles and paths are not reliable across launches or permission changes; storing the selected bytes lets the existing browser-only renderer restore the model without sending it to the Host.

**Use a repository model directory as the source of truth.** Rejected because user-owned model assets are large, may carry separate licenses, and must not become tracked repository content; IndexedDB keeps the runtime data local while `.gitignore` protects optional checkout-local folders.

**Leave the stored record when the user removes the model.** Rejected because a later startup would silently resurrect a model the user explicitly cleared.

## Consequences

The same browser profile restores the selected model in the main workspace and desktop-pet views, while another browser or machine still requires a new selection. The Qt shell stores that profile under the system application-data location, outside the repository. A profile without a saved model requires one selection; a prior off-the-record profile has no on-disk record to migrate. The first render may wait for the asynchronous IndexedDB read. A stored bundle consumes browser profile storage and is subject to that profile's quota; when storage is unavailable, the current page can still render a newly selected model and the desktop-pet transfer fallback remains available.

## Verification

The Live2D tests cover startup restoration, removal, visible storage failures, and filtering of Qt directory placeholders. A Qt WebEngine process selected a seven-file model folder, verified that all seven files committed to IndexedDB, exited, and restored the model from the same profile in a second process. The repository ignore checks cover model folders, model data, and model resources without ignoring the Live2D source package.
