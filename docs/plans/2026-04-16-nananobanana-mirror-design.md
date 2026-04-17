# Nananobanana Mirror Design

**Goal:** Stabilize the app for GitHub and Vercel deployment while adding session memory, prompt management, reference-image editing, image copy/download, cost tracking, and updated branding.

## Product Scope

- Each chat session keeps its own history, prompt presets, balance state, and image references.
- Creating a new chat starts with empty memory.
- Uploaded reference images support lightweight pre-editing in the browser:
  - brush colors
  - undo
  - redo
  - clear
- Prompt presets live beside the composer:
  - add preset
  - click preset to inject into the input box
  - edit preset
  - delete preset
- Chat images support:
  - copy image
  - download original upload
  - download generated image
- Default generation resolution is `4k`.
- Site branding changes to `nananobanana mirror`.
- Cost display is per generated image and deducts from a starting balance of `$185.00`.

## Technical Direction

### Storage Split

- `localStorage` stores only structured metadata:
  - sessions
  - prompts
  - message ordering
  - image ids
  - cost entries
- `IndexedDB` stores heavy binary payloads:
  - uploaded originals
  - edited reference images
  - generated outputs

This removes the current white-screen failure mode caused by large base64 payloads overflowing synchronous browser storage.

### Session Memory

- Each session keeps a `memoryPrompt` derived from recent user prompts and prompt presets used in that session.
- The backend request still stays stateless; the frontend composes the memory context into the outgoing prompt payload.
- New sessions start empty and do not inherit memory from previous sessions.

### Image Editing

- Editing is browser-side canvas markup over the uploaded image.
- Saving an edit exports a new PNG data blob used as the reference image payload for generation.
- Original upload remains preserved for history download.

### Cost Model

- Initial balance: `$185.00`
- Pricing is model-specific and includes:
  - input charge per uploaded reference image
  - output charge per generated image

Rates:

- `gemini-3.1-flash-image-preview`
  - input image: `$0.50`
  - output image: `$0.0672`
- `gemini-3-pro-image-preview`
  - input image: `$2.00`
  - output image: `$0.134`

If one request uses multiple models, each model is charged independently. The displayed line under each image reflects that image's own cost and the remaining balance after sequential deduction.

## UI Direction

- Keep the current light workspace aesthetic.
- Add an editor sheet and prompt panel that feel native to the existing sidebar/composer system.
- Use compact utility actions under images instead of heavy modal chrome.
- Replace the generic sparkle brand mark with a banana-based icon and update the page title/favicon.

## Risks

- Browser clipboard image write support is uneven; the UI needs a graceful fallback.
- IndexedDB migration must handle existing localStorage-only sessions without crashing.
- Canvas editing and binary storage must not block the main compose flow.
