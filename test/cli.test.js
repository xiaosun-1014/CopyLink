const test = require('node:test');
const assert = require('node:assert/strict');

const { parseCommand } = require('../src/cli');

test('parseCommand parses capture command with url and output directory', () => {
  assert.deepEqual(
    parseCommand([
      'node',
      'copylink',
      'capture',
      'https://example.test',
      '--out',
      'cases/a',
      '--viewer-wait-ms',
      '8000',
    ]),
    {
      command: 'capture',
      url: 'https://example.test',
      outDir: 'cases/a',
      viewerWaitMs: 8000,
    },
  );
});

test('parseCommand parses build and serve commands', () => {
  assert.deepEqual(parseCommand(['node', 'copylink', 'build', 'cases/a']), {
    command: 'build',
    caseDir: 'cases/a',
  });
  assert.deepEqual(parseCommand(['node', 'copylink', 'serve', 'cases/a', '--port', '4050']), {
    command: 'serve',
    caseDir: 'cases/a',
    port: 4050,
  });
});

test('parseCommand parses add-action command with page action and box', () => {
  assert.deepEqual(
    parseCommand([
      'node',
      'copylink',
      'add-action',
      'cases/a',
      'viewer',
      'show_dicom_info',
      '--box',
      '10,20,30,40',
      '--text',
      'DICOM',
      '--target-page',
      'viewer_dicom_info',
      '--value',
      'info',
    ]),
    {
      command: 'add-action',
      caseDir: 'cases/a',
      page: 'viewer',
      action: 'show_dicom_info',
      text: 'DICOM',
      targetPage: 'viewer_dicom_info',
      value: 'info',
      box: { x: 10, y: 20, width: 30, height: 40 },
    },
  );
});

test('parseCommand parses add-page command', () => {
  assert.deepEqual(
    parseCommand([
      'node',
      'copylink',
      'add-page',
      'cases/a',
      'viewer_layout_menu',
      'viewer_layout_menu.png',
    ]),
    {
      command: 'add-page',
      caseDir: 'cases/a',
      page: 'viewer_layout_menu',
      screenshot: 'viewer_layout_menu.png',
    },
  );
});

test('parseCommand parses record-states command', () => {
  assert.deepEqual(
    parseCommand([
      'node',
      'copylink',
      'record-states',
      'cases/a',
      'https://example.test/report',
    ]),
    {
      command: 'record-states',
      caseDir: 'cases/a',
      url: 'https://example.test/report',
    },
  );
});

test('parseCommand parses record-actions command', () => {
  assert.deepEqual(
    parseCommand([
      'node',
      'copylink',
      'record-actions',
      'cases/a',
      'https://example.test/viewer',
      '--page',
      'viewer',
    ]),
    {
      command: 'record-actions',
      caseDir: 'cases/a',
      url: 'https://example.test/viewer',
      page: 'viewer',
    },
  );
});

test('parseCommand parses record-flow command', () => {
  assert.deepEqual(
    parseCommand([
      'node',
      'copylink',
      'record-flow',
      'cases/a',
      'https://example.test/report',
      '--page',
      'report',
    ]),
    {
      command: 'record-flow',
      caseDir: 'cases/a',
      url: 'https://example.test/report',
      page: 'report',
    },
  );
});

test('parseCommand rejects missing required arguments', () => {
  assert.throws(() => parseCommand(['node', 'copylink', 'capture']), /Usage:/);
  assert.throws(() => parseCommand(['node', 'copylink', 'build']), /Usage:/);
});
