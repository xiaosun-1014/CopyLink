const { zscloudProfile } = require('./zscloud');

const profiles = [zscloudProfile];

const genericProfile = {
  vendor: 'generic',
  match() {
    return true;
  },
  async findOpenViewer(page) {
    if (typeof page.locator !== 'function') return null;
    const locator = page.locator('text=/查看影像|查看图像|View Image|Image|PACS/i').first();
    const count = await locator.count().catch(() => 0);
    if (count < 1) return null;
    const box = await locator.boundingBox().catch(() => null);
    if (!box) return null;
    const text = await locator.innerText().catch(() => 'View Image');
    return { locator, box, text };
  },
};

function pickProfile(url) {
  return profiles.find((profile) => profile.match(url)) || genericProfile;
}

module.exports = {
  genericProfile,
  pickProfile,
  profiles,
};
