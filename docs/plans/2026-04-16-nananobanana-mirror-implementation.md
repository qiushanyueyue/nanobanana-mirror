# Nananobanana Mirror Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a stable, deployable `nananobanana mirror` app with session memory, prompt presets, reference-image editing, durable image storage, image copy/download, cost tracking, default 4K resolution, and updated branding.

**Architecture:** Keep FastAPI as a thin generation proxy and move app state orchestration into the React frontend. Split structured metadata into `localStorage` and binary image payloads into `IndexedDB`, then compose request payloads from session memory, prompt presets, and edited reference images at submit time.

**Tech Stack:** React 19, TypeScript, Vite, FastAPI, browser `IndexedDB`, canvas APIs, Clipboard API.

---

### Task 1: Add test harness and pure domain utilities

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/lib/costs.ts`
- Create: `frontend/src/lib/memory.ts`
- Test: `frontend/src/lib/costs.test.ts`
- Test: `frontend/src/lib/memory.test.ts`

**Step 1: Write the failing tests**

- Add tests for:
  - per-model image input/output cost calculation
  - remaining balance sequence calculation
  - session memory prompt composition

**Step 2: Run test to verify it fails**

Run: `npm test -- --run`

Expected: FAIL because utility modules do not exist yet.

**Step 3: Write minimal implementation**

- Implement pricing constants and deterministic helper functions.
- Implement session memory helpers that merge recent user prompts and clicked prompt presets.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run`

Expected: PASS

### Task 2: Expand app types and storage model

**Files:**
- Modify: `frontend/src/types.ts`
- Create: `frontend/src/lib/imageStore.ts`

**Step 1: Write the failing test**

- Extend utility tests to assert serialized session records do not contain binary data.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run`

Expected: FAIL due to missing metadata-only shape.

**Step 3: Write minimal implementation**

- Add session, prompt preset, image asset, editor, and cost-entry types.
- Add IndexedDB helpers for put/get/delete.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run`

Expected: PASS

### Task 3: Refactor app shell for durable sessions

**Files:**
- Modify: `frontend/src/App.tsx`

**Step 1: Write the failing test**

- Add memory helper test covering new-session reset semantics if needed.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run`

Expected: FAIL before session reset logic exists.

**Step 3: Write minimal implementation**

- Set default resolution to `4k`.
- Stabilize session initialization.
- Persist metadata only.
- Add running balance state and per-session prompt preset state.
- Rename brand text to `nananobanana mirror`.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run`

Expected: PASS

### Task 4: Build prompt preset panel and composer integration

**Files:**
- Modify: `frontend/src/components/ImageGenerator.tsx`
- Modify: `frontend/src/index.css`

**Step 1: Write the failing test**

- Add memory helper coverage for prompt preset insertion and edit/delete state changes where feasible.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run`

Expected: FAIL

**Step 3: Write minimal implementation**

- Add preset input field and list UI near the composer.
- Clicking a preset writes text into the prompt box.
- Add edit and delete actions.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run`

Expected: PASS

### Task 5: Build reference-image editor and asset actions

**Files:**
- Modify: `frontend/src/components/ImageGenerator.tsx`
- Modify: `frontend/src/index.css`

**Step 1: Write the failing test**

- Add cost helper or editor-state helper tests for undo/redo stack behavior if extracted.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run`

Expected: FAIL

**Step 3: Write minimal implementation**

- Add editor overlay for uploaded reference images.
- Support brush color selection, undo, redo, clear, save, cancel.
- Preserve original upload and edited variant.
- Add copy-image and download-original actions for chat assets.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run`

Expected: PASS

### Task 6: Wire submit flow, cost display, and backend payload metadata

**Files:**
- Modify: `frontend/src/components/ImageGenerator.tsx`
- Modify: `frontend/src/types.ts`
- Modify: `api/index.py`
- Modify: `api/service.py`

**Step 1: Write the failing test**

- Add utility test for output cost attachment to generated image entries.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run`

Expected: FAIL

**Step 3: Write minimal implementation**

- Send typed image payloads with mime information.
- Include session memory in request prompt composition.
- Store generated images in IndexedDB and metadata in localStorage.
- Render cost line under each generated image.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run`

Expected: PASS

### Task 7: Update branding and favicon asset

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/public/favicon.svg`
- Optionally add: `frontend/public/apple-touch-icon.png`

**Step 1: Generate replacement banana icon**

- Create a new banana-themed icon asset matching the product branding.

**Step 2: Integrate asset**

- Update page title and favicon references.

**Step 3: Verify build**

Run: `npm run build`

Expected: PASS

### Task 8: Final verification for deployability

**Files:**
- Modify if needed: `vercel.json`
- Modify if needed: `PROJECT_SUMMARY.md`

**Step 1: Run verification**

Run:

```bash
npm test -- --run
npm run build
npm run lint
```

Expected: all PASS

**Step 2: Manual sanity checks**

- New chat clears memory.
- Prompt preset add/edit/delete works.
- Reference image editing supports undo/redo.
- Generated image card shows cost and remaining balance.
- Copy/download actions work.

**Step 3: Prepare for GitHub/Vercel**

- Confirm production paths and environment variable usage.
