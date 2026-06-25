const { addAction } = require('../actions/addAction');
const { normalizeBox } = require('../model');

function stableValue(text) {
  return String(text || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
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

function actionShortcutScript(initialPage) {
  return `
    (() => {
      window.copylinkRecordedActions = [];
      window.copylinkCurrentPage = ${JSON.stringify(initialPage || 'viewer')};
      window.copylinkStopRecording = false;
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
      window.addEventListener('keydown', (event) => {
        const modifier = event.metaKey || event.ctrlKey;
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
          });
        }
      }, true);
      window.addEventListener('click', (event) => {
        if (event.target && event.target.closest && event.target.closest('#copylink-overlay')) return;
        if (event.altKey || event.metaKey || event.ctrlKey) return;
        const element = event.target && event.target.closest
          ? event.target.closest('button,a,[role="button"],[class],div,span')
          : event.target;
        if (!element || !element.getBoundingClientRect) return;
        const box = element.getBoundingClientRect();
        if (box.width < 3 || box.height < 3) return;
        const text = (element.innerText || element.getAttribute('aria-label') || element.getAttribute('title') || '').trim().replace(/\\s+/g, ' ').slice(0, 120);
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
        });
      }, true);
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
    const script = actionShortcutScript(options.page || 'viewer');
    const pages = new Set();
    if (typeof context.addInitScript === 'function') {
      await context.addInitScript(script);
    }
    if (typeof context.on === 'function') {
      context.on('page', async (newPage) => {
        pages.add(newPage);
        await newPage.waitForLoadState('domcontentloaded').catch(() => {});
        await newPage.evaluate(script).catch(() => {});
      });
    }
    const page = await context.newPage();
    pages.add(page);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs || 30000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.evaluate(script);

    console.log('Record actions mode:');
    console.log('  Click a real control, then fill: action,targetPage,value,page');
    console.log('  Ctrl/Cmd+Shift+P changes current page id.');
    console.log('  Ctrl/Cmd+Shift+Q finishes recording.');

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
          const parsed = parseActionInput(item.input);
          if (!parsed) continue;
          const action = normalizeRecordedAction({
            ...item,
            ...parsed,
            page: parsed.page || item.page,
          });
          recorded.push(addAction(caseDir, action));
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
  normalizeRecordedAction,
  parseActionInput,
  recordActions,
};
