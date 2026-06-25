const test = require('node:test');
const assert = require('node:assert/strict');

const { createRuntime } = require('../runtime/runtime');

function sampleData() {
  return {
    manifest: {
      viewport: { width: 1440, height: 960 },
      screenshots: {
        report: 'report.png',
        viewer: 'viewer.png',
      },
    },
    actions: {
      actions: [
        {
          id: 'open_viewer_1',
          page: 'report',
          action: 'open_viewer',
          box: { x: 1194, y: 0, width: 86, height: 54 },
          targetPage: 'viewer',
        },
        {
          id: 'adjust_ww_wl_1',
          page: 'viewer',
          action: 'adjust_ww_wl',
          box: { x: 20, y: 10, width: 40, height: 32 },
        },
        {
          id: 'switch_series_1',
          page: 'viewer',
          action: 'switch_series',
          box: { x: 70, y: 10, width: 40, height: 32 },
        },
        {
          id: 'change_layout_1',
          page: 'viewer',
          action: 'change_layout',
          box: { x: 120, y: 10, width: 40, height: 32 },
        },
        {
          id: 'show_dicom_info_1',
          page: 'viewer',
          action: 'show_dicom_info',
          box: { x: 170, y: 10, width: 40, height: 32 },
        },
      ],
    },
  };
}

function flowData() {
  return {
    manifest: {
      viewport: { width: 1440, height: 960 },
      screenshots: {
        report: 'report.png',
      },
    },
    actions: { actions: [] },
    flow: {
      version: 1,
      startScreenshot: 'flow_000.png',
      steps: [
        {
          id: 'flow_step_001',
          screenshot: 'flow_000.png',
          nextScreenshot: 'flow_001.png',
          click: { x: 100, y: 120, width: 24, height: 24 },
          label: 'open_viewer',
        },
        {
          id: 'flow_step_002',
          screenshot: 'flow_001.png',
          nextScreenshot: 'flow_002.png',
          click: { x: 40, y: 560, width: 24, height: 24 },
          label: 'open_layout_menu',
        },
      ],
    },
  };
}

function fakeView() {
  const calls = [];
  return {
    calls,
    hotspotHandler: null,
    setViewport(width, height) {
      calls.push(['setViewport', width, height]);
    },
    setScreenshot(src) {
      calls.push(['setScreenshot', src]);
    },
    setHotspots(actions, onAction) {
      calls.push(['setHotspots', actions.map((action) => action.action)]);
      this.hotspots = actions;
      this.hotspotHandler = onAction;
    },
    setViewerControls(state, onAction) {
      calls.push(['setViewerControls', { ...state }]);
      this.viewerControlHandler = onAction;
    },
    showDicomInfo(info) {
      calls.push(['showDicomInfo', info]);
    },
  };
}

test('runtime initializes report screenshot and report hotspots', () => {
  const view = fakeView();
  const runtime = createRuntime({ data: sampleData(), view });

  runtime.init();

  assert.deepEqual(view.calls.slice(0, 3), [
    ['setViewport', 1440, 960],
    ['setScreenshot', 'report.png'],
    ['setHotspots', ['open_viewer']],
  ]);
  assert.equal(runtime.getState().currentPage, 'report');
});

test('runtime replays recorded click flow screenshots step by step', () => {
  const view = fakeView();
  const runtime = createRuntime({ data: flowData(), view });

  runtime.init();

  assert.deepEqual(view.calls.slice(0, 3), [
    ['setViewport', 1440, 960],
    ['setScreenshot', 'flow_000.png'],
    ['setHotspots', ['flow_next']],
  ]);
  assert.equal(runtime.getState().currentPage, 'flow');
  assert.equal(runtime.getState().flowIndex, 0);

  view.hotspotHandler({ action: 'flow_next' });
  assert.equal(runtime.getState().flowIndex, 1);
  assert.deepEqual(view.calls.at(-2), ['setScreenshot', 'flow_001.png']);
  assert.deepEqual(view.calls.at(-1), ['setHotspots', ['flow_next']]);

  view.hotspotHandler({ action: 'flow_next' });
  assert.equal(runtime.getState().flowIndex, 2);
  assert.deepEqual(view.calls.at(-2), ['setScreenshot', 'flow_002.png']);
  assert.deepEqual(view.calls.at(-1), ['setHotspots', []]);
});

test('runtime lets report open_viewer hotspot advance the first flow step', () => {
  const data = flowData();
  data.actions.actions = [
    {
      id: 'open_viewer_1',
      page: 'report',
      action: 'open_viewer',
      text: '查看影像',
      box: { x: 1194, y: 30, width: 86, height: 24 },
      targetPage: 'viewer',
    },
  ];
  const view = fakeView();
  const runtime = createRuntime({ data, view });

  runtime.init();

  assert.deepEqual(
    view.hotspots.map((action) => ({
      action: action.action,
      text: action.text,
      box: action.box,
    })),
    [
      {
        action: 'flow_next',
        text: 'open_viewer',
        box: { x: 100, y: 120, width: 24, height: 24 },
      },
      {
        action: 'flow_next',
        text: '查看影像',
        box: { x: 1186, y: 0, width: 102, height: 66 },
      },
    ],
  );

  view.hotspotHandler(view.hotspots[1]);
  assert.equal(runtime.getState().flowIndex, 1);
  assert.deepEqual(view.calls.at(-2), ['setScreenshot', 'flow_001.png']);
});

test('open_viewer switches to viewer screenshot and shows viewer controls', () => {
  const view = fakeView();
  const runtime = createRuntime({ data: sampleData(), view });

  runtime.init();
  runtime.runAction({ action: 'open_viewer', targetPage: 'viewer' });

  assert.equal(runtime.getState().currentPage, 'viewer');
  assert.deepEqual(view.calls.at(-1), [
    'setHotspots',
    ['adjust_ww_wl', 'switch_series', 'change_layout', 'show_dicom_info'],
  ]);
  assert.equal(view.calls.some((call) => call[0] === 'setViewerControls'), false);
});

test('viewer hotspots receive an action handler for browser button clicks', () => {
  const view = fakeView();
  const runtime = createRuntime({ data: sampleData(), view });

  runtime.init();
  runtime.runAction({ action: 'open_viewer', targetPage: 'viewer' });

  assert.equal(typeof view.hotspotHandler, 'function');
  view.hotspotHandler({ action: 'adjust_ww_wl' });
  assert.equal(runtime.getState().ww, 450);
});

test('viewer actions update ww wl, layout, and selected series state', () => {
  const view = fakeView();
  const runtime = createRuntime({ data: sampleData(), view });

  runtime.init();
  runtime.runAction({ action: 'open_viewer', targetPage: 'viewer' });
  runtime.runAction({ action: 'adjust_ww_wl' });
  runtime.runAction({ action: 'change_layout' });
  runtime.runAction({ action: 'switch_series' });

  assert.deepEqual(runtime.getState(), {
    currentPage: 'viewer',
    ww: 450,
    wl: 50,
    layout: '1x2',
    seriesIndex: 2,
  });
});

test('runtime supports separate window width and window level actions', () => {
  const view = fakeView();
  const runtime = createRuntime({ data: sampleData(), view });

  runtime.init();
  runtime.runAction({ action: 'open_viewer', targetPage: 'viewer' });
  runtime.runAction({ action: 'set_window_width', value: '1200' });
  runtime.runAction({ action: 'set_window_level', value: '-500' });

  assert.equal(runtime.getState().ww, 1200);
  assert.equal(runtime.getState().wl, -500);
});

test('runtime nudges ww and wl when separate window actions have no value', () => {
  const view = fakeView();
  const runtime = createRuntime({ data: sampleData(), view });

  runtime.init();
  runtime.runAction({ action: 'open_viewer', targetPage: 'viewer' });
  runtime.runAction({ action: 'set_window_width' });
  runtime.runAction({ action: 'set_window_level' });

  assert.equal(runtime.getState().ww, 450);
  assert.equal(runtime.getState().wl, 50);
});

test('show_dicom_info opens modal with stable placeholder fields', () => {
  const view = fakeView();
  const runtime = createRuntime({ data: sampleData(), view });

  runtime.init();
  runtime.runAction({ action: 'show_dicom_info' });

  assert.deepEqual(view.calls.at(-1), [
    'showDicomInfo',
    {
      PatientID: 'REDACTED',
      StudyInstanceUID: 'CAPTURED_PLACEHOLDER',
      Modality: 'CT',
    },
  ]);
});

test('actions with targetPage switch to captured popup states', () => {
  const data = sampleData();
  data.manifest.screenshots.viewer_layout_menu = 'viewer-layout-menu.png';
  data.manifest.screenshots.viewer_dicom_info = 'viewer-dicom-info.png';
  data.manifest.screenshots.viewer_series_menu = 'viewer-series-menu.png';
  data.actions.actions.push(
    {
      id: 'open_layout_menu_1',
      page: 'viewer',
      action: 'open_layout_menu',
      box: { x: 10, y: 10, width: 40, height: 40 },
      targetPage: 'viewer_layout_menu',
    },
    {
      id: 'set_layout_1',
      page: 'viewer_layout_menu',
      action: 'set_layout',
      value: '2x2',
      box: { x: 10, y: 70, width: 80, height: 40 },
      targetPage: 'viewer',
    },
    {
      id: 'show_dicom_info_2',
      page: 'viewer',
      action: 'show_dicom_info',
      box: { x: 100, y: 10, width: 40, height: 40 },
      targetPage: 'viewer_dicom_info',
    },
    {
      id: 'open_series_menu_1',
      page: 'viewer',
      action: 'open_series_menu',
      box: { x: 12, y: 140, width: 220, height: 36 },
      targetPage: 'viewer_series_menu',
    },
    {
      id: 'select_series_1',
      page: 'viewer_series_menu',
      action: 'select_series',
      value: 'AXIAL_LUNG_THIN',
      box: { x: 12, y: 220, width: 220, height: 36 },
      targetPage: 'viewer',
    },
    {
      id: 'close_dialog_1',
      page: 'viewer_dicom_info',
      action: 'close_dialog',
      box: { x: 300, y: 20, width: 40, height: 40 },
      targetPage: 'viewer',
    },
  );

  const view = fakeView();
  const runtime = createRuntime({ data, view });

  runtime.init();
  runtime.runAction({ action: 'open_viewer', targetPage: 'viewer' });
  runtime.runAction({ action: 'open_layout_menu', targetPage: 'viewer_layout_menu' });

  assert.equal(runtime.getState().currentPage, 'viewer_layout_menu');
  assert.equal(view.calls.at(-2)[1], 'viewer-layout-menu.png');

  runtime.runAction({ action: 'set_layout', value: '2x2', targetPage: 'viewer' });
  assert.equal(runtime.getState().layout, '2x2');
  assert.equal(runtime.getState().currentPage, 'viewer');

  runtime.runAction({ action: 'show_dicom_info', targetPage: 'viewer_dicom_info' });
  assert.equal(runtime.getState().currentPage, 'viewer_dicom_info');
  assert.equal(view.calls.at(-2)[1], 'viewer-dicom-info.png');

  runtime.runAction({ action: 'close_dialog', targetPage: 'viewer' });
  assert.equal(runtime.getState().currentPage, 'viewer');

  runtime.runAction({ action: 'open_series_menu', targetPage: 'viewer_series_menu' });
  assert.equal(runtime.getState().currentPage, 'viewer_series_menu');
  assert.equal(view.calls.at(-2)[1], 'viewer-series-menu.png');

  runtime.runAction({
    action: 'select_series',
    value: 'AXIAL_LUNG_THIN',
    targetPage: 'viewer',
  });
  assert.equal(runtime.getState().selectedSeries, 'AXIAL_LUNG_THIN');
  assert.equal(runtime.getState().currentPage, 'viewer');
});
