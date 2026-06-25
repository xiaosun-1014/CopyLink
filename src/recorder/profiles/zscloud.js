const { normalizeBox } = require('../../model');

function first(locator) {
  return locator && typeof locator.first === 'function' ? locator.first() : locator;
}

async function usableLocator(locator) {
  if (!locator) return null;
  const count = typeof locator.count === 'function' ? await locator.count().catch(() => 0) : 1;
  if (count < 1) return null;

  const clickable =
    typeof locator.evaluate === 'function'
      ? await locator
          .evaluate((element) => {
            const target =
              element.closest(
                [
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
                ].join(','),
              ) || element;
            const rect = target.getBoundingClientRect();
            if (!rect || rect.width < 1 || rect.height < 1) return null;
            const text =
              target.innerText ||
              element.innerText ||
              target.getAttribute('aria-label') ||
              target.getAttribute('title') ||
              '';
            return {
              box: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              },
              text: String(text).trim(),
            };
          })
          .catch(() => null)
      : null;

  const box =
    clickable && clickable.box ? clickable.box : await locator.boundingBox().catch(() => null);
  if (!box) return null;
  return { locator, box: normalizeBox(box), text: clickable && clickable.text };
}

const zscloudProfile = {
  vendor: 'zscloud',

  match(url) {
    return String(url).includes('zscloud.zs-hospital.sh.cn');
  },

  async findOpenViewer(page) {
    const candidates = [];

    if (typeof page.getByText === 'function') {
      candidates.push({ text: '查看影像', locator: first(page.getByText('查看影像')) });
      candidates.push({ text: 'View Image', locator: first(page.getByText('View Image')) });
    }

    if (typeof page.locator === 'function') {
      candidates.push({
        text: '影像入口',
        locator: first(page.locator('text=/查看影像|View Image|影像|PACS/i')),
      });
    }

    for (const candidate of candidates) {
      const usable = await usableLocator(candidate.locator);
      if (usable) {
        const text =
          usable.text || (await candidate.locator.innerText().catch(() => candidate.text));
        return {
          locator: candidate.locator,
          box: usable.box,
          text: String(text || candidate.text).trim() || candidate.text,
        };
      }
    }

    return null;
  },

  async waitForViewerReady(page, options = {}) {
    if (typeof page.waitForFunction !== 'function') return;
    await page
      .waitForFunction(
        () => {
          const text = document.body?.innerText || '';
          if (/访问|插件|四角信息配置|预设窗设置|快捷键|MPR|DICOM/i.test(text)) {
            return true;
          }
          return Boolean(
            document.querySelector(
              [
                'canvas',
                '[class*="viewer"]',
                '[class*="Viewer"]',
                '[class*="viewport"]',
                '[class*="Viewport"]',
                '[class*="series"]',
                '[class*="Series"]',
              ].join(','),
            ),
          );
        },
        null,
        { timeout: options.viewerReadyTimeoutMs || 15000 },
      )
      .catch(() => {});
  },
};

module.exports = {
  zscloudProfile,
};
