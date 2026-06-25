# CopyLink Layout Freezer Design

## Goal

Build a local tool that captures an expiring medical report link into an offline, clickable training page for GUIAgent operation-flow learning.

The first version optimizes for speed and layout fidelity, not faithful reproduction of the source application's JavaScript, backend APIs, or DICOM rendering.

## Scope

The tool captures:

- The report page screenshot.
- The viewer page screenshot after clicking the image-entry button.
- The bounding box and semantic action for important controls.
- A local static page that replays the captured flow with transparent hotspots and simulated viewer controls.

The tool does not capture:

- Full source-site JavaScript execution.
- Backend APIs, tokens, cookies, or session replay.
- Accurate DICOM pixel rendering.
- Medical interpretation behavior.

## Architecture

CopyLink has three boundaries:

- `recorder`: opens a real link with Playwright, captures screenshots, detects vendor-specific buttons, and writes `manifest.json` plus `actions.json`.
- `builder`: copies runtime assets and emits `case-data.js` so a case can run as a local static page.
- `runtime`: displays screenshots, overlays clickable hotspots, and simulates required actions.

The first vendor profile is `zscloud`, identified by `zscloud.zs-hospital.sh.cn`. It finds the report-page image entry via visible text such as `查看影像` or `View Image`.

## Case Format

Each case directory contains:

```text
manifest.json
actions.json
report.png
viewer.png
index.html
style.css
runtime.js
case-data.js
```

`manifest.json` stores viewport and screenshot names. It stores only a hash of the original URL, not full viewer URLs with patient or study identifiers.

`actions.json` stores normalized hotspots:

```json
{
  "actions": [
    {
      "id": "open_viewer_1",
      "page": "report",
      "action": "open_viewer",
      "text": "查看影像",
      "box": { "x": 1194, "y": 0, "width": 86, "height": 54 },
      "targetPage": "viewer"
    }
  ]
}
```

## Runtime Behavior

The offline page starts on `report.png`.

Clicking `open_viewer` switches to `viewer.png`. On the viewer page, the runtime does not add a separate synthetic toolbar. It only renders hotspots declared in `actions.json`, so controls stay aligned with the original viewer screenshot.

Menus and dialogs are modeled as additional captured page states. For example:

- `viewer_layout_menu.png`: screenshot after clicking the layout button.
- `viewer_dicom_info.png`: screenshot after clicking the DICOM information button.
- `viewer_series_menu.png`: screenshot after opening the sequence selector.

An action can set `targetPage` to switch into one of these captured states. Menu item actions can set `value` and return to `viewer`.

Viewer hotspots can represent:

- Window width/window level value adjustment.
- Series selection with `select_series` and a stable `value`.
- Layout cycling between `1x1`, `1x2`, and `2x2`.
- DICOM information modal.
- Returning to the report page.

These hotspots include `data-agent-action` markers and are transparent over the screenshot. The first MVP supports registering extra screenshot states with `copylink add-page`, adding hotspots with `copylink add-action`, quickly capturing extra states with `copylink record-states`, and recording hotspots from real clicks with `copylink record-actions`.

`record-states` opens the real page and injects shortcuts with an in-page `#copylink-overlay` input. It avoids native browser prompts because some medical viewers steal focus or suppress prompts.

- `Ctrl/Cmd+Shift+S`: show the overlay input for a page id, then capture the current browser state.
- `Ctrl/Cmd+Shift+Q`: stop recording.

`record-actions` opens the real page and records clicked controls with the same overlay input:

- Click a real control, then fill `action,targetPage,value,page` in the overlay.
- `Ctrl/Cmd+Shift+P`: update the current page id.
- `Ctrl/Cmd+Shift+Q`: stop recording.
- For `select_series`, if `value` is omitted, the clicked text becomes a stable uppercase value.

## Verification

The MVP is verified with Node's built-in test runner:

- Builder emits `index.html`, `style.css`, `runtime.js`, and `case-data.js`.
- Generated `case-data.js` avoids leaking raw source URLs.
- Runtime can render report hotspots.
- Runtime can switch to viewer state.
- Runtime can adjust WW/WL, cycle layout, and open DICOM info.
