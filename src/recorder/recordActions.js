const path = require('node:path');
const { addAction } = require('../actions/addAction');
const { addPage } = require('../actions/addPage');
const { normalizeBox } = require('../model');
const { screenshotNameForPage } = require('./recordStates');

const QUICK_ACTIONS = {
  manual: {
    key: '0',
    label: 'Manual CSV',
  },
  open_viewer: {
    key: '8',
    label: 'Open viewer',
    action: 'open_viewer',
    targetPage: 'viewer',
    nextPage: 'viewer',
    nextMode: 'open_layout_menu',
  },
  open_layout_menu: {
    key: '1',
    label: 'Open layout',
    action: 'open_layout_menu',
    targetPage: 'viewer_layout_menu',
    captureTargetPage: true,
    nextPage: 'viewer_layout_menu',
    nextMode: 'set_layout',
  },
  set_layout: {
    key: '2',
    label: 'Set layout',
    action: 'set_layout',
    targetPage: 'viewer',
    valueFromText: true,
    valueKind: 'layout',
    nextPage: 'viewer',
    nextMode: 'select_series',
  },
  open_series_menu: {
    key: '3',
    label: 'Open series',
    action: 'open_series_menu',
    targetPage: 'viewer_series_menu',
    captureTargetPage: true,
    nextPage: 'viewer_series_menu',
    nextMode: 'select_series',
  },
  select_series: {
    key: '4',
    label: 'Double-click series',
    action: 'select_series',
    targetPage: 'viewer',
    valueFromText: true,
    nextPage: 'viewer',
    nextMode: 'show_dicom_info',
  },
  show_dicom_info: {
    key: '5',
    label: 'DICOM info',
    action: 'show_dicom_info',
    targetPage: 'viewer_dicom_info',
    captureTargetPage: true,
    nextPage: 'viewer_dicom_info',
    nextMode: 'close_dialog',
  },
  close_dialog: {
    key: '6',
    label: 'Close dialog',
    action: 'close_dialog',
    targetPage: 'viewer',
    nextPage: 'viewer',
    nextMode: 'adjust_ww_wl',
  },
  adjust_ww_wl: {
    key: '7',
    label: 'WW then WL',
    action: 'adjust_ww_wl',
  },
};

function stableValue(text) {
  return String(text || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function layoutValue(text) {
  const match = String(text || '').match(/(\d+)\s*[xX]\s*(\d+)/);
  if (match) return `${match[1]}x${match[2]}`;
  return String(text || '').trim();
}

function valueForQuickAction(preset, text, explicitValue) {
  if (explicitValue) return explicitValue;
  if (!preset.valueFromText) return undefined;
  if (preset.valueKind === 'layout') return layoutValue(text);
  return stableValue(text);
}

function createQuickRecordedAction(input) {
  const preset = QUICK_ACTIONS[input.mode];
  if (!preset || !preset.action) return null;
  if (input.mode === 'adjust_ww_wl') {
    const currentStep = input.wwWlStep === 'level' ? 'level' : 'width';
    return {
      page: input.page,
      action: currentStep === 'width' ? 'set_window_width' : 'set_window_level',
      ...(input.text ? { text: input.text } : {}),
      ...(input.value ? { value: input.value } : {}),
      nextWwWlStep: currentStep === 'width' ? 'level' : 'width',
      box: normalizeBox(input.box),
    };
  }
  const value = valueForQuickAction(preset, input.text, input.value);
  return {
    page: input.page,
    action: preset.action,
    ...(input.text ? { text: input.text } : {}),
    ...(value ? { value } : {}),
    ...(preset.targetPage ? { targetPage: preset.targetPage } : {}),
    ...(preset.captureTargetPage ? { captureTargetPage: true } : {}),
    ...(preset.nextPage ? { nextPage: preset.nextPage } : {}),
    ...(preset.nextMode ? { nextMode: preset.nextMode } : {}),
    box: normalizeBox(input.box),
  };
}

function parseActionInput(input) {
  const parts = String(input || '')
    .split(',')
    .map((part) => part.trim());
  const action = parts[0] || undefined;
  if (!action) return null;
  return {
    action,
    targetPage: parts[1] || undefined,
    value: parts[2] || undefined,
    page: parts[3] || undefined,
  };
}

function normalizeRecordedAction(input) {
  const value =
    input.value ||
    (input.action === 'select_series' ? stableValue(input.text) : undefined);
  return {
    page: input.page,
    action: input.action,
    ...(input.text ? { text: input.text } : {}),
    ...(value ? { value } : {}),
    ...(input.targetPage ? { targetPage: input.targetPage } : {}),
    box: normalizeBox(input.box),
  };
}

async function hideCopylinkOverlaysForScreenshot(page) {
  if (typeof page.evaluate !== 'function') return;
  await page
    .evaluate(() => {
      const selectors = '#copylink-recorder-panel,#copylink-overlay';
      const hideInDocument = (documentRef) => {
        documentRef.querySelectorAll(selectors).forEach((element) => {
          if (!element.dataset.copylinkPreviousVisibility) {
            element.dataset.copylinkPreviousVisibility = element.style.visibility || '__empty__';
          }
          element.style.visibility = 'hidden';
        });
      };
      hideInDocument(document);
      document.querySelectorAll('iframe').forEach((frame) => {
        try {
          if (frame.contentDocument) hideInDocument(frame.contentDocument);
        } catch {
          // Cross-origin frames cannot be edited from the parent page.
        }
      });
    })
    .catch(() => {});
}

async function restoreCopylinkOverlaysAfterScreenshot(page) {
  if (typeof page.evaluate !== 'function') return;
  await page
    .evaluate(() => {
      const selectors = '#copylink-recorder-panel,#copylink-overlay';
      const restoreInDocument = (documentRef) => {
        documentRef.querySelectorAll(selectors).forEach((element) => {
          const previous = element.dataset.copylinkPreviousVisibility;
          if (previous === undefined) return;
          element.style.visibility = previous === '__empty__' ? '' : previous;
          delete element.dataset.copylinkPreviousVisibility;
        });
      };
      restoreInDocument(document);
      document.querySelectorAll('iframe').forEach((frame) => {
        try {
          if (frame.contentDocument) restoreInDocument(frame.contentDocument);
        } catch {
          // Cross-origin frames cannot be edited from the parent page.
        }
      });
    })
    .catch(() => {});
}

async function screenshotWithoutCopylinkOverlays(page, options) {
  await hideCopylinkOverlaysForScreenshot(page);
  try {
    return await page.screenshot(options);
  } finally {
    await restoreCopylinkOverlaysAfterScreenshot(page);
  }
}

async function persistRecordedAction(caseDir, page, input, options = {}) {
  const action = normalizeRecordedAction(input);

  if (input.captureTargetPage && action.targetPage) {
    if (typeof page.waitForTimeout === 'function') {
      await page.waitForTimeout(options.captureDelayMs ?? 350);
    }
    const screenshot = screenshotNameForPage(action.targetPage);
    await screenshotWithoutCopylinkOverlays(page, {
      path: path.join(caseDir, screenshot),
      fullPage: false,
    });
    addPage(caseDir, action.targetPage, screenshot);
  }

  return addAction(caseDir, action);
}

function actionShortcutScript(initialPage) {
  const quickActionsJson = JSON.stringify(QUICK_ACTIONS);
  return `
    (() => {
      if (window.top !== window) return;
      const QUICK_ACTIONS = ${quickActionsJson};
      window.copylinkRecordedActions = [];
      window.copylinkCurrentPage = ${JSON.stringify(initialPage || 'viewer')};
      window.copylinkActionMode = 'manual';
      window.copylinkExplicitValue = '';
      window.copylinkWwWlStep = 'width';
      window.copylinkStopRecording = false;
      function stableValue(text) {
        return String(text || '')
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '');
      }
      function layoutValue(text) {
        const match = String(text || '').match(/(\\d+)\\s*[xX]\\s*(\\d+)/);
        if (match) return match[1] + 'x' + match[2];
        return String(text || '').trim();
      }
      function quickValue(preset, text, explicitValue) {
        if (explicitValue) return explicitValue;
        if (!preset.valueFromText) return undefined;
        if (preset.valueKind === 'layout') return layoutValue(text);
        return stableValue(text);
      }
      function whenCopylinkDocumentReady(callback) {
        if (document.body || document.documentElement) {
          callback();
          return;
        }
        window.addEventListener('DOMContentLoaded', callback, { once: true });
      }
      function setMode(mode) {
        if (!QUICK_ACTIONS[mode]) return;
        window.copylinkActionMode = mode;
        renderPanel();
      }
      function valuePlaceholderForMode(mode) {
        if (mode === 'set_layout') return 'auto, e.g. 2x2';
        if (mode === 'select_series') return 'auto from series text';
        if (mode === 'adjust_ww_wl') {
          return window.copylinkWwWlStep === 'level' ? 'optional WL number' : 'optional WW number';
        }
        return 'optional';
      }
      function showCopylinkPanel() {
        let panel = document.getElementById('copylink-recorder-panel');
        if (panel) return panel;
        panel = document.createElement('aside');
        panel.id = 'copylink-recorder-panel';
        panel.style.cssText = [
          'position:fixed',
          'z-index:2147483646',
          'right:12px',
          'top:12px',
          'width:260px',
          'padding:10px',
          'background:rgba(17,17,17,.92)',
          'color:#fff',
          'border:1px solid #4aa3ff',
          'box-shadow:0 10px 32px rgba(0,0,0,.35)',
          'font:12px Arial,sans-serif'
        ].join(';');
        const parent = document.body || document.documentElement;
        if (!parent) return null;
        parent.appendChild(panel);
        return panel;
      }
      function renderPanel() {
        const panel = showCopylinkPanel();
        if (!panel) return;
        panel.style.display = '';
        const modes = Object.entries(QUICK_ACTIONS)
          .map(([mode, preset]) => {
            const active = mode === window.copylinkActionMode;
            return '<button data-copylink-mode="' + mode + '" style="box-sizing:border-box;width:100%;margin:2px 0;padding:5px 6px;text-align:left;border:1px solid ' + (active ? '#00d8ff' : '#555') + ';background:' + (active ? '#123d48' : '#222') + ';color:#fff;cursor:pointer">' + preset.key + ' - ' + preset.label + '</button>';
          })
          .join('');
        panel.innerHTML = [
          '<div style="font-weight:700;margin-bottom:6px">CopyLink recorder</div>',
          '<div>Page: <input data-copylink-page style="width:150px;background:#fff;color:#111;border:1px solid #777" /></div>',
          '<div style="margin-top:6px">Value: <input data-copylink-value style="width:146px;background:#fff;color:#111;border:1px solid #777" /></div>',
          '<div style="margin-top:8px">' + modes + '</div>',
          '<div style="margin-top:8px;color:#bbb;line-height:1.35">Keys 1-8/0 mode, Q finish. 4 double-clicks series. 7 records WW then WL.</div>',
          '<div style="margin-top:6px;color:#9be">Recorded: ' + (window.copylinkRecordedCount || 0) + '</div>'
        ].join('');
        const pageInput = panel.querySelector('[data-copylink-page]');
        pageInput.value = window.copylinkCurrentPage || 'viewer';
        pageInput.addEventListener('input', () => {
          window.copylinkCurrentPage = pageInput.value.trim() || 'viewer';
        });
        const valueInput = panel.querySelector('[data-copylink-value]');
        valueInput.value = window.copylinkExplicitValue || '';
        valueInput.placeholder = valuePlaceholderForMode(window.copylinkActionMode || 'manual');
        valueInput.addEventListener('input', () => {
          window.copylinkExplicitValue = valueInput.value.trim();
        });
        panel.querySelectorAll('[data-copylink-mode]').forEach((button) => {
          button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            setMode(button.getAttribute('data-copylink-mode'));
          });
        });
      }
      function currentExplicitValue() {
        const panel = document.getElementById('copylink-recorder-panel');
        const input = panel && panel.querySelector('[data-copylink-value]');
        if (input) window.copylinkExplicitValue = input.value.trim();
        return window.copylinkExplicitValue || '';
      }
      function isCopylinkTypingTarget(target) {
        if (!target) return false;
        const tag = String(target.tagName || '').toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
      }
      function hideCopylinkPanelWhenInactive() {
        if (window.copylinkHidePanelOnBlur !== true) return;
        const panel = document.getElementById('copylink-recorder-panel');
        if (panel) panel.style.display = 'none';
      }
      function showCopylinkOverlay(title, placeholder, onSubmit) {
        const previous = document.getElementById('copylink-overlay');
        if (previous) previous.remove();
        const overlay = document.createElement('div');
        overlay.id = 'copylink-overlay';
        overlay.style.cssText = [
          'position:fixed',
          'z-index:2147483647',
          'top:20px',
          'left:50%',
          'transform:translateX(-50%)',
          'width:560px',
          'padding:12px',
          'background:#111',
          'color:#fff',
          'border:1px solid #4aa3ff',
          'box-shadow:0 10px 32px rgba(0,0,0,.35)',
          'font:14px Arial,sans-serif'
        ].join(';');
        overlay.innerHTML = '<div data-copylink-title style="margin-bottom:8px;font-weight:700;white-space:pre-line"></div><input style="box-sizing:border-box;width:100%;height:34px;margin-bottom:8px;padding:0 8px;background:#fff;color:#111;border:1px solid #999" /><div style="display:flex;gap:8px;justify-content:flex-end"><button data-copylink-cancel>Cancel</button><button data-copylink-ok>OK</button></div>';
        overlay.querySelector('[data-copylink-title]').textContent = title;
        const input = overlay.querySelector('input');
        input.value = placeholder || '';
        overlay.addEventListener('click', (event) => event.stopPropagation(), true);
        overlay.addEventListener('keydown', (event) => {
          event.stopPropagation();
          if (event.key === 'Escape') overlay.remove();
          if (event.key === 'Enter') {
            const value = input.value.trim();
            overlay.remove();
            if (value) onSubmit(value);
          }
        }, true);
        overlay.querySelector('[data-copylink-cancel]').addEventListener('click', () => overlay.remove());
        overlay.querySelector('[data-copylink-ok]').addEventListener('click', () => {
          const value = input.value.trim();
          overlay.remove();
          if (value) onSubmit(value);
        });
        document.documentElement.appendChild(overlay);
        input.focus();
        input.select();
      }
      function textForElement(element) {
        return (element.innerText || element.getAttribute('aria-label') || element.getAttribute('title') || '')
          .trim()
          .replace(/\\s+/g, ' ')
          .slice(0, 120);
      }
      function bestRecordElement(target) {
        if (!target || !target.closest) return target;
        return (
          target.closest([
            'button',
            'a',
            '[role="button"]',
            '[onclick]',
            '.el-button',
            '.ant-btn',
            '[class*="btn"]',
            '[class*="Btn"]',
            '[class*="button"]',
            '[class*="Button"]',
            '[class*="tool"]',
            '[class*="Tool"]',
            '[class*="icon"]',
            '[class*="Icon"]',
            '[class*="item"]',
            '[class*="Item"]'
          ].join(',')) || target.closest('[class],div,span') || target
        );
      }
      function quickRecordedAction(mode, page, text, box, explicitValue) {
        const preset = QUICK_ACTIONS[mode];
        if (!preset || !preset.action) return null;
        if (mode === 'adjust_ww_wl') {
          const step = window.copylinkWwWlStep === 'level' ? 'level' : 'width';
          const action = {
            page,
            action: step === 'width' ? 'set_window_width' : 'set_window_level',
            text,
            box: { x: box.x, y: box.y, width: box.width, height: box.height },
            nextWwWlStep: step === 'width' ? 'level' : 'width'
          };
          if (explicitValue) action.value = explicitValue;
          return action;
        }
        const value = quickValue(preset, text, explicitValue);
        const action = {
          page,
          action: preset.action,
          text,
          box: { x: box.x, y: box.y, width: box.width, height: box.height }
        };
        if (value) action.value = value;
        if (preset.targetPage) action.targetPage = preset.targetPage;
        if (preset.captureTargetPage) action.captureTargetPage = true;
        if (preset.nextPage) action.nextPage = preset.nextPage;
        if (preset.nextMode) action.nextMode = preset.nextMode;
        return action;
      }
      window.addEventListener('keydown', (event) => {
        if (isCopylinkTypingTarget(event.target)) return;
        const modifier = event.metaKey || event.ctrlKey;
        if (!modifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'q') {
          event.preventDefault();
          event.stopImmediatePropagation();
          window.copylinkStopRecording = true;
          return;
        }
        const mode = Object.entries(QUICK_ACTIONS).find(([, preset]) => preset.key === event.key);
        if (mode && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          event.stopImmediatePropagation();
          setMode(mode[0]);
          return;
        }
        if (modifier && event.shiftKey && event.key.toLowerCase() === 'q') {
          event.preventDefault();
          event.stopImmediatePropagation();
          window.copylinkStopRecording = true;
        }
        if (modifier && event.shiftKey && event.key.toLowerCase() === 'p') {
          event.preventDefault();
          event.stopImmediatePropagation();
          showCopylinkOverlay('Current page id', window.copylinkCurrentPage || 'viewer', (page) => {
            window.copylinkCurrentPage = page;
            renderPanel();
          });
        }
      }, true);
      whenCopylinkDocumentReady(renderPanel);
      function recordSelectSeriesDoubleClick(event) {
        if ((window.copylinkActionMode || 'manual') !== 'select_series') return;
        if (event.target && event.target.closest && event.target.closest('#copylink-overlay,#copylink-recorder-panel')) return;
        if (event.altKey || event.metaKey || event.ctrlKey) return;
        const element = bestRecordElement(event.target);
        if (!element || !element.getBoundingClientRect) return;
        const box = element.getBoundingClientRect();
        if (box.width < 3 || box.height < 3) return;
        const quickAction = quickRecordedAction(
          'select_series',
          window.copylinkCurrentPage || 'viewer',
          textForElement(element),
          box,
          currentExplicitValue()
        );
        if (!quickAction) return;
        window.copylinkRecordedActions.push(quickAction);
        window.copylinkRecordedCount = (window.copylinkRecordedCount || 0) + 1;
        if (quickAction.nextPage) window.copylinkCurrentPage = quickAction.nextPage;
        if (quickAction.nextMode) setMode(quickAction.nextMode);
        renderPanel();
      }
      window.addEventListener('click', (event) => {
        if (event.target && event.target.closest && event.target.closest('#copylink-overlay,#copylink-recorder-panel')) return;
        if (event.altKey || event.metaKey || event.ctrlKey) return;
        const element = bestRecordElement(event.target);
        if (!element || !element.getBoundingClientRect) return;
        const box = element.getBoundingClientRect();
        if (box.width < 3 || box.height < 3) return;
        const text = textForElement(element);
        const mode = window.copylinkActionMode || 'manual';
        if (mode === 'select_series') return;
        const quickAction = quickRecordedAction(
          mode,
          window.copylinkCurrentPage || 'viewer',
          text,
          box,
          currentExplicitValue()
        );
        if (quickAction) {
          window.copylinkRecordedActions.push(quickAction);
          window.copylinkRecordedCount = (window.copylinkRecordedCount || 0) + 1;
          if (quickAction.action === 'open_viewer') window.copylinkHidePanelOnBlur = true;
          if (quickAction.nextWwWlStep) window.copylinkWwWlStep = quickAction.nextWwWlStep;
          if (quickAction.nextPage) window.copylinkCurrentPage = quickAction.nextPage;
          if (quickAction.nextMode) setMode(quickAction.nextMode);
          renderPanel();
          return;
        }
        const help = [
          'Format: action,targetPage,value,page',
          'Examples:',
          'open_layout_menu,viewer_layout_menu',
          'set_layout,viewer,2x2,viewer_layout_menu',
          'open_series_menu,viewer_series_menu',
          'select_series,viewer,,viewer_series_menu',
          'show_dicom_info,viewer_dicom_info',
          'close_dialog,viewer,,viewer_dicom_info',
          '',
          'Leave blank to skip this click.'
        ].join('\\n');
        showCopylinkOverlay(help, text ? 'select_series,viewer,,' + window.copylinkCurrentPage : '', (input) => {
          window.copylinkRecordedActions.push({
            input,
            text,
            page: window.copylinkCurrentPage || 'viewer',
            box: { x: box.x, y: box.y, width: box.width, height: box.height }
          });
          window.copylinkRecordedCount = (window.copylinkRecordedCount || 0) + 1;
          renderPanel();
        });
      }, true);
      window.addEventListener('dblclick', recordSelectSeriesDoubleClick, true);
      window.addEventListener('blur', hideCopylinkPanelWhenInactive);
    })();
  `;
}

function loadChromium(options) {
  if (options.chromium) return options.chromium;
  try {
    return require('playwright').chromium;
  } catch {
    throw new Error(
      'Playwright is required for record-actions. Install dependencies with `npm install`.',
    );
  }
}

async function recordActions(caseDir, url, options = {}) {
  const chromium = loadChromium(options);
  const browser = await chromium.launch({
    headless: false,
    slowMo: options.slowMo ?? 100,
  });
  const recorded = [];

  try {
    const context = await browser.newContext({
      viewport: options.viewport || { width: 1440, height: 960 },
      deviceScaleFactor: 1,
    });
    const defaultScript = actionShortcutScript('viewer');
    const initialScript = actionShortcutScript(options.page || 'viewer');
    const pages = new Set();
    if (typeof context.addInitScript === 'function') {
      await context.addInitScript(defaultScript);
    }
    if (typeof context.on === 'function') {
      context.on('page', async (newPage) => {
        pages.add(newPage);
        await newPage.waitForLoadState('domcontentloaded').catch(() => {});
        await newPage.evaluate(defaultScript).catch(() => {});
      });
    }
    const page = await context.newPage();
    pages.add(page);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs || 30000 });
    await page.evaluate(initialScript);
    await page.waitForLoadState('networkidle').catch(() => {});

    console.log('Record actions mode:');
    console.log('  Use the CopyLink recorder panel, choose a mode, then click real controls once.');
    console.log('  Fast keys: 1 layout menu, 2 set layout, 4 double-click series.');
    console.log('  Fast keys: 5 DICOM info, 6 close dialog, 7 WW then WL, 8 open viewer, 0 manual.');
    console.log('  Key 3 remains available for systems that require opening a series menu.');
    console.log('  Ctrl/Cmd+Shift+P changes current page id.');
    console.log('  Q or Ctrl/Cmd+Shift+Q finishes recording.');

    while (true) {
      let shouldStop = false;

      for (const activePage of Array.from(pages)) {
        const stop = await activePage
          .evaluate(() => window.copylinkStopRecording)
          .catch(() => false);
        if (stop) {
          shouldStop = true;
          break;
        }

        const queue = await activePage
          .evaluate(() => {
            const items = window.copylinkRecordedActions || [];
            window.copylinkRecordedActions = [];
            return items;
          })
          .catch(() => []);

        for (const item of queue) {
          const parsed = item.input ? parseActionInput(item.input) : item;
          if (!parsed) continue;
          const actionInput = {
            ...item,
            ...parsed,
            page: parsed.page || item.page,
          };
          const screenshotPage =
            actionInput.action === 'open_viewer'
              ? Array.from(pages).at(-1) || activePage
              : activePage;
          const action = await persistRecordedAction(
            caseDir,
            screenshotPage,
            actionInput,
            options,
          );
          recorded.push(action);
          console.log(`Recorded ${action.page}:${action.action}`);
        }
      }

      if (shouldStop) break;

      await page.waitForTimeout(options.pollMs || 250);
    }
  } finally {
    await browser.close();
  }

  return recorded;
}

module.exports = {
  actionShortcutScript,
  createQuickRecordedAction,
  hideCopylinkOverlaysForScreenshot,
  normalizeRecordedAction,
  parseActionInput,
  persistRecordedAction,
  recordActions,
  restoreCopylinkOverlaysAfterScreenshot,
  screenshotWithoutCopylinkOverlays,
};
