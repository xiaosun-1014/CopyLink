const path = require('node:path');
const { addPage } = require('../actions/addPage');
const { ensureDir } = require('../fs-utils');

function screenshotNameForPage(pageId) {
  return `${String(pageId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')}.png`;
}

function shortcutScript() {
  return `
    (() => {
      window.copylinkCaptureState = null;
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
          'width:420px',
          'padding:12px',
          'background:#111',
          'color:#fff',
          'border:1px solid #4aa3ff',
          'box-shadow:0 10px 32px rgba(0,0,0,.35)',
          'font:14px Arial,sans-serif'
        ].join(';');
        overlay.innerHTML = '<div style="margin-bottom:8px;font-weight:700"></div><input style="box-sizing:border-box;width:100%;height:34px;margin-bottom:8px;padding:0 8px;background:#fff;color:#111;border:1px solid #999" /><div style="display:flex;gap:8px;justify-content:flex-end"><button data-copylink-cancel>Cancel</button><button data-copylink-ok>OK</button></div>';
        overlay.querySelector('div').textContent = title;
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
        if (modifier && event.shiftKey && event.key.toLowerCase() === 's') {
          event.preventDefault();
          event.stopImmediatePropagation();
          showCopylinkOverlay('CopyLink page id', 'viewer_layout_menu', (pageId) => {
            window.copylinkCaptureState = pageId;
          });
        }
        if (modifier && event.shiftKey && event.key.toLowerCase() === 'q') {
          event.preventDefault();
          event.stopImmediatePropagation();
          window.copylinkStopRecording = true;
        }
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
      'Playwright is required for record-states. Install dependencies with `npm install`.',
    );
  }
}

async function recordStates(caseDir, url, options = {}) {
  ensureDir(caseDir);
  const chromium = loadChromium(options);
  const browser = await chromium.launch({
    headless: false,
    slowMo: options.slowMo ?? 100,
  });

  const captured = [];
  try {
    const context = await browser.newContext({
      viewport: options.viewport || { width: 1440, height: 960 },
      deviceScaleFactor: 1,
    });
    const script = shortcutScript();
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

    console.log('Record states mode:');
    console.log('  1. Interact with the page until the desired menu/dialog is visible.');
    console.log('  2. Press Ctrl/Cmd+Shift+S and enter a page id.');
    console.log('  3. Press Ctrl/Cmd+Shift+Q to finish.');

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

        const pageId = await activePage
          .evaluate(() => window.copylinkCaptureState)
          .catch(() => null);
        if (pageId) {
          await activePage
            .evaluate(() => {
              window.copylinkCaptureState = null;
            })
            .catch(() => {});
          const screenshot = screenshotNameForPage(pageId);
          await activePage.screenshot({
            path: path.join(caseDir, screenshot),
            fullPage: false,
          });
          addPage(caseDir, pageId, screenshot);
          captured.push({ page: pageId, screenshot });
          console.log(`Captured ${pageId} -> ${screenshot}`);
        }
      }

      if (shouldStop) break;

      await page.waitForTimeout(options.pollMs || 250);
    }
  } finally {
    await browser.close();
  }

  return captured;
}

module.exports = {
  recordStates,
  screenshotNameForPage,
  shortcutScript,
};
