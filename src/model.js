const crypto = require('node:crypto');

function safeSegment(value, fallback = 'case') {
  const segment = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return segment || fallback;
}

function hashUrl(url) {
  return crypto.createHash('sha256').update(String(url)).digest('hex');
}

function createCaseId(url, vendor = 'case') {
  const codeMatch = String(url).match(/[?&]code=([^&#]+)/i);
  const suffix = codeMatch ? decodeURIComponent(codeMatch[1]) : hashUrl(url).slice(0, 10);
  return `${safeSegment(vendor, 'vendor')}_${safeSegment(suffix)}`;
}

function normalizeBox(box) {
  return {
    x: Math.round(Number(box.x || 0)),
    y: Math.round(Number(box.y || 0)),
    width: Math.max(1, Math.round(Number(box.width || 0))),
    height: Math.max(1, Math.round(Number(box.height || 0))),
  };
}

function sanitizeAction(action) {
  return {
    ...action,
    box: action.box ? normalizeBox(action.box) : undefined,
  };
}

function sanitizeCaseData(caseData) {
  const manifest = caseData.manifest || {};
  const source = manifest.source || {};
  const runtimeId =
    source.originalUrlHash && manifest.vendor
      ? `${safeSegment(manifest.vendor, 'vendor')}_${String(source.originalUrlHash).slice(0, 10)}`
      : manifest.id;
  return {
    manifest: {
      id: runtimeId,
      vendor: manifest.vendor,
      viewport: manifest.viewport,
      screenshots: manifest.screenshots,
      source: {
        originalUrlHash: source.originalUrlHash,
        capturedAt: source.capturedAt,
      },
    },
    actions: {
      actions: ((caseData.actions && caseData.actions.actions) || []).map(sanitizeAction),
    },
  };
}

module.exports = {
  createCaseId,
  hashUrl,
  normalizeBox,
  sanitizeCaseData,
};
