# CopyLink Layout Freezer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MVP CLI that captures a report link into an offline clickable case package for GUIAgent operation-flow training.

**Architecture:** The implementation separates real-web capture, static case building, and local runtime simulation. Capture uses Playwright and vendor profiles; build emits static files; runtime replays screenshots with hotspots and simulated viewer controls.

**Tech Stack:** Node.js CommonJS, Playwright for capture, Node built-in test runner for unit tests, static HTML/CSS/JS for runtime.

---

### File Structure

- Create `package.json`: scripts and CLI entry.
- Create `bin/copylink.js`: command dispatcher for `capture`, `build`, and `serve`.
- Create `src/fs-utils.js`: JSON and filesystem helpers.
- Create `src/model.js`: case IDs, URL hashing, box normalization, and validation.
- Create `src/recorder/capture.js`: Playwright capture workflow.
- Create `src/recorder/profiles/zscloud.js`: zscloud image-entry detection.
- Create `src/recorder/profiles/index.js`: vendor profile selection.
- Create `src/builder/buildCase.js`: static case generation.
- Create `src/actions/addAction.js`: append manually marked hotspots to a case.
- Create `src/server/serveCase.js`: local static server.
- Create `runtime/index.html`: offline page shell.
- Create `runtime/style.css`: screenshot and hotspot layout.
- Create `runtime/runtime.js`: browser runtime.
- Create `test/*.test.js`: unit tests for model, builder, and runtime.

### Task 1: Model And Builder Tests

- [ ] Write tests for URL hashing, case ID generation, and box normalization.
- [ ] Run tests and confirm they fail because implementation files do not exist.
- [ ] Implement `src/model.js`.
- [ ] Run tests and confirm model tests pass.
- [ ] Write builder tests that create a temp case and assert emitted files.
- [ ] Run builder tests and confirm they fail.
- [ ] Implement `src/builder/buildCase.js` and runtime asset templates.
- [ ] Run builder tests and confirm they pass.

### Task 2: Runtime Tests

- [ ] Write runtime tests with a minimal DOM stub.
- [ ] Run tests and confirm they fail because runtime API is missing.
- [ ] Implement `window.CopyLinkRuntime` in `runtime/runtime.js`.
- [ ] Run runtime tests and confirm they pass.

### Task 3: Capture And Action CLI

- [ ] Implement `zscloud` profile detection for `查看影像`, `View Image`, and generic image text.
- [ ] Implement Playwright capture that writes `report.png`, clicks image entry, handles popup pages, writes `viewer.png`, and emits JSON.
- [ ] Implement CLI commands for `capture`, `build`, `add-page`, `add-action`, `record-states`, `record-actions`, and `serve`.
- [ ] Implement `add-action` so viewer screenshot controls can be marked as transparent hotspots instead of synthetic top controls.
- [ ] Support popup/menu states with `targetPage`, such as `viewer_layout_menu` and `viewer_dicom_info`.
- [ ] Support action `value` for menu choices, such as `set_layout --value 2x2`.
- [ ] Support explicit sequence selection with `select_series --value <sequence-id>`.
- [ ] Add `record-states` shortcut capture for repeated menu/dialog screenshots.
- [ ] Add `record-actions` click capture for creating hotspots from real clicked controls.
- [ ] Run unit tests.
- [ ] Optionally run `copylink capture <url>` against a real link only when user approval and network access are available.

### Task 4: Local Serve

- [ ] Implement static server for a case directory.
- [ ] Verify `copylink serve cases/<id>` prints a local URL.
- [ ] Keep server process user-controlled; do not leave required sessions running at final response time.

### Self-Review

- The plan covers capture, build, runtime, tests, and local serving.
- No raw viewer URL is stored in generated case data.
- The implementation remains an MVP: no full DOM reconstruction, no DICOM rendering, no batch queue, no full annotation UI.
