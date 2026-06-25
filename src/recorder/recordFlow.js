const path = require('node:path');
const { ensureDir, writeJson } = require('../fs-utils');
const { normalizeBox } = require('../model');

function clickBoxForPoint(point, size = 24) {
  const half = Math.round(size / 2);
  return normalizeBox({
    x: Math.max(0, Math.round(Number(point.x || 0)) - half),
    y: Math.max(0, Math.round(Number(point.y || 0)) - half),
    width: size,
    height: size,
  });
}

function flowScreenshotName(index) {
  return `flow_${String(index).padStart(3, '0')}.png`;
}

function isDuplicateFlowEvent(previous, next, thresholdMs = 500) {
  if (!previous || !next) return false;

  const previousTime = Number(previous.time);
  const nextTime = Number(next.time);
  if (!Number.isFinite(previousTime) || !Number.isFinite(nextTime)) return false;
  if (Math.abs(nextTime - previousTime) > thresholdMs) return false;

  const previousLabel = String(previous.label || '');
  const nextLabel = String(next.label || '');
  if (previousLabel !== nextLabel) return false;

  const previousX = Number(previous.x || 0);
  const previousY = Number(previous.y || 0);
  const nextX = Number(next.x || 0);
  const nextY = Number(next.y || 0);
  return Math.abs(nextX - previousX) <= 3 && Math.abs(nextY - previousY) <= 3;
}

async function hideCopylinkFlowOverlays(page) {
  if (typeof page.evaluate !== 'function') return;
  await page
    .evaluate(() => {
      const selectors = '#copylink-flow-panel';
      document.querySelectorAll(selectors).forEach((element) => {
        element.dataset.copylinkPreviousVisibility = element.style.visibility || '__empty__';
        element.style.visibility = 'hidden';
      });
    })
    .catch(() => {});
}

async function restoreCopylinkFlowOverlays(page) {
  if (typeof page.evaluate !== 'function') return;
  await page
    .evaluate(() => {
      const selectors = '#copylink-flow-panel';
      document.querySelectorAll(selectors).forEach((element) => {
        const previous = element.dataset.copylinkPreviousVisibility;
        if (previous === undefined) return;
        element.style.visibility = previous === '__empty__' ? '' : previous;
        delete element.dataset.copylinkPreviousVisibility;
      });
    })
    .catch(() => {});
}

async function screenshotFlowPage(page, options) {
  await hideCopylinkFlowOverlays(page);
  try {
    return await page.screenshot(options);
  } finally {
    await restoreCopylinkFlowOverlays(page);
  }
}

function flowRecorderScript(initialPage) {
  return `
    (() => {
      const initialPage = ${JSON.stringify(initialPage || 'report')};
      function topWindow() {
        try {
          return window.top || window;
        } catch {
          return window;
        }
      }
      if (window.copylinkFlowInstalled) return;
      window.copylinkFlowInstalled = true;
      function enqueueFlowEvent(event) {
        const payload = {
          x: event.clientX,
          y: event.clientY,
          label: String(
            event.target?.innerText ||
            event.target?.getAttribute?.('aria-label') ||
            event.target?.getAttribute?.('title') ||
            ''
          ).trim().replace(/\\s+/g, ' ').slice(0, 120),
          page: initialPage,
          time: Date.now()
        };
        if (window === topWindow()) {
          window.copylinkFlowEvents = window.copylinkFlowEvents || [];
          window.copylinkFlowEvents.push(payload);
          renderFlowPanel();
          return;
        }
        topWindow().postMessage({ type: 'copylink-flow-click', payload }, '*');
      }
      function frameRectForSource(source, rootDocument) {
        for (const frame of rootDocument.querySelectorAll('iframe')) {
          if (frame.contentWindow === source) return frame.getBoundingClientRect();
        }
        return null;
      }
      function renderFlowPanel() {
        if (window !== topWindow()) return;
        const parent = document.body || document.documentElement;
        if (!parent) return;
        let panel = document.getElementById('copylink-flow-panel');
        if (!panel) {
          panel = document.createElement('aside');
          panel.id = 'copylink-flow-panel';
          panel.style.cssText = [
            'position:fixed',
            'z-index:2147483646',
            'right:12px',
            'top:12px',
            'width:220px',
            'padding:10px',
            'background:rgba(17,17,17,.92)',
            'color:#fff',
            'border:1px solid #4aa3ff',
            'font:12px Arial,sans-serif'
          ].join(';');
          parent.appendChild(panel);
        }
        panel.textContent = 'CopyLink flow recorder | clicks: ' + (window.copylinkFlowRecordedCount || 0) + ' | q to finish';
      }
      if (window === topWindow()) {
        window.copylinkFlowEvents = window.copylinkFlowEvents || [];
        window.copylinkFlowRecordedCount = window.copylinkFlowRecordedCount || 0;
        window.copylinkStopFlow = false;
        window.addEventListener('message', (event) => {
          if (!event.data || event.data.type !== 'copylink-flow-click') return;
          const rect = frameRectForSource(event.source, document);
          const payload = event.data.payload || {};
          window.copylinkFlowEvents.push({
            ...payload,
            x: Number(payload.x || 0) + (rect ? rect.x : 0),
            y: Number(payload.y || 0) + (rect ? rect.y : 0)
          });
          renderFlowPanel();
        });
        window.addEventListener('keydown', (event) => {
          const modifier = event.metaKey || event.ctrlKey;
          if ((!modifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'q') ||
              (modifier && event.shiftKey && event.key.toLowerCase() === 'q')) {
            event.preventDefault();
            event.stopImmediatePropagation();
            window.copylinkStopFlow = true;
          }
        }, true);
        if (document.body || document.documentElement) renderFlowPanel();
        else window.addEventListener('DOMContentLoaded', renderFlowPanel, { once: true });
      }
      window.addEventListener('click', (event) => {
        if (event.target?.closest?.('#copylink-flow-panel')) return;
        enqueueFlowEvent(event);
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
      'Playwright is required for record-flow. Install dependencies with `npm install`.',
    );
  }
}

async function recordFlow(caseDir, url, options = {}) {
  ensureDir(caseDir);
  const chromium = loadChromium(options);
  const browser = await chromium.launch({
    headless: false,
    slowMo: options.slowMo ?? 100,
  });
  const flow = {
    version: 1,
    startScreenshot: flowScreenshotName(0),
    steps: [],
  };

  try {
    const context = await browser.newContext({
      viewport: options.viewport || { width: 1440, height: 960 },
      deviceScaleFactor: 1,
    });
    const script = flowRecorderScript(options.page || 'report');
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
    await page.evaluate(script);
    await page.waitForLoadState('networkidle').catch(() => {});
    await screenshotFlowPage(page, {
      path: path.join(caseDir, flow.startScreenshot),
      fullPage: false,
    });
    writeJson(path.join(caseDir, 'flow.json'), flow);

    console.log('Record flow mode: click through the real workflow, then press q to finish.');

    let currentScreenshot = flow.startScreenshot;
    let lastFlowEvent = null;
    while (true) {
      let shouldStop = false;

      for (const activePage of Array.from(pages)) {
        const stop = await activePage
          .evaluate(() => window.copylinkStopFlow)
          .catch(() => false);
        if (stop) {
          shouldStop = true;
          break;
        }

        const queue = await activePage
          .evaluate(() => {
            const items = window.copylinkFlowEvents || [];
            window.copylinkFlowEvents = [];
            return items;
          })
          .catch(() => []);

        for (const item of queue) {
          if (
            isDuplicateFlowEvent(lastFlowEvent, item, options.duplicateWindowMs ?? 500)
          ) {
            continue;
          }
          lastFlowEvent = item;
          if (typeof activePage.waitForTimeout === 'function') {
            await activePage.waitForTimeout(options.captureDelayMs ?? 350);
          }
          const nextScreenshot = flowScreenshotName(flow.steps.length + 1);
          await screenshotFlowPage(activePage, {
            path: path.join(caseDir, nextScreenshot),
            fullPage: false,
          });
          const step = {
            id: `flow_step_${String(flow.steps.length + 1).padStart(3, '0')}`,
            screenshot: currentScreenshot,
            nextScreenshot,
            click: clickBoxForPoint(item),
            ...(item.label ? { label: item.label } : {}),
          };
          flow.steps.push(step);
          currentScreenshot = nextScreenshot;
          await activePage
            .evaluate(() => {
              window.copylinkFlowRecordedCount = (window.copylinkFlowRecordedCount || 0) + 1;
            })
            .catch(() => {});
          writeJson(path.join(caseDir, 'flow.json'), flow);
          console.log(`Recorded flow step ${flow.steps.length}`);
        }
      }

      if (shouldStop) break;
      await page.waitForTimeout(options.pollMs || 250);
    }
  } finally {
    await browser.close();
  }

  return flow;
}

module.exports = {
  clickBoxForPoint,
  flowRecorderScript,
  isDuplicateFlowEvent,
  recordFlow,
};
