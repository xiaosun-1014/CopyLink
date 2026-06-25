const { normalizeBox } = require('../../model');

function first(locator) {
  return locator && typeof locator.first === 'function' ? locator.first() : locator;
}

async function usableLocator(locator) {
  if (!locator) return null;
  const count = typeof locator.count === 'function' ? await locator.count().catch(() => 0) : 1;
  if (count < 1) return null;
  const box = await locator.boundingBox().catch(() => null);
  if (!box) return null;
  return { locator, box: normalizeBox(box) };
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
        const text = await candidate.locator.innerText().catch(() => candidate.text);
        return {
          locator: candidate.locator,
          box: usable.box,
          text: String(text || candidate.text).trim() || candidate.text,
        };
      }
    }

    return null;
  },
};

module.exports = {
  zscloudProfile,
};
