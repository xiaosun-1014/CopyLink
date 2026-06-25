(function (globalScope) {
  const DEFAULT_DICOM_INFO = {
    PatientID: 'REDACTED',
    StudyInstanceUID: 'CAPTURED_PLACEHOLDER',
    Modality: 'CT',
  };

  function createRuntime({ data, view }) {
    const state = {
      currentPage: 'report',
      flowIndex: 0,
      ww: 400,
      wl: 40,
      layout: '1x1',
      seriesIndex: 1,
    };

    function hasFlow() {
      return Boolean(data.flow && Array.isArray(data.flow.steps) && data.flow.steps.length);
    }

    function currentFlowStep() {
      if (!hasFlow()) return null;
      return data.flow.steps[state.flowIndex] || null;
    }

    function expandedFlowEntryBox(box) {
      const leftPadding = 8;
      const topPadding = 36;
      const rightPadding = 8;
      const bottomPadding = 12;
      const x = Math.max(0, Number(box.x || 0) - leftPadding);
      const y = Math.max(0, Number(box.y || 0) - topPadding);
      return {
        x,
        y,
        width: Number(box.width || 0) + leftPadding + rightPadding,
        height: Number(box.height || 0) + (Number(box.y || 0) - y) + bottomPadding,
      };
    }

    function reportOpenViewerFlowHotspots() {
      if (state.flowIndex !== 0) return [];
      return ((data.actions && data.actions.actions) || [])
        .filter((action) => action.page === 'report' && action.action === 'open_viewer' && action.box)
        .map((action) => ({
          id: `${action.id || 'open_viewer'}_flow_entry`,
          action: 'flow_next',
          text: action.text || 'Open viewer',
          box: expandedFlowEntryBox(action.box),
        }));
    }

    function getActionsForCurrentPage() {
      return ((data.actions && data.actions.actions) || []).filter(
        (action) => action.page === state.currentPage,
      );
    }

    function render() {
      const viewport = data.manifest.viewport || { width: 1440, height: 960 };
      if (hasFlow()) {
        const step = currentFlowStep();
        const screenshot =
          (step && step.screenshot) ||
          data.flow.steps.at(-1)?.nextScreenshot ||
          data.flow.startScreenshot;
        const hotspots =
          step && step.click
            ? [
                {
                  id: step.id,
                  action: 'flow_next',
                  text: step.label || 'Next step',
                  box: step.click,
                },
              ]
            : [];
        hotspots.push(...reportOpenViewerFlowHotspots());

        state.currentPage = 'flow';
        view.setViewport(viewport.width, viewport.height);
        view.setScreenshot(screenshot);
        view.setHotspots(hotspots, runAction);
        return;
      }

      const screenshot = data.manifest.screenshots[state.currentPage];

      view.setViewport(viewport.width, viewport.height);
      view.setScreenshot(screenshot);
      view.setHotspots(getActionsForCurrentPage(), runAction);
    }

    function cycleLayout() {
      const layouts = ['1x1', '1x2', '2x2'];
      const currentIndex = layouts.indexOf(state.layout);
      state.layout = layouts[(currentIndex + 1) % layouts.length];
    }

    function navigateToTarget(action) {
      if (!action.targetPage) return false;
      state.currentPage = action.targetPage;
      render();
      return true;
    }

    function numericValue(value) {
      const number = Number(value);
      return Number.isFinite(number) ? number : undefined;
    }

    function runAction(action) {
      if (action.action === 'flow_next') {
        state.flowIndex += 1;
        render();
        return;
      }

      if (action.action === 'open_viewer') {
        state.currentPage = action.targetPage || 'viewer';
        render();
        return;
      }

      if (action.action === 'back_to_report') {
        state.currentPage = action.targetPage || 'report';
        render();
        return;
      }

      if (action.action === 'adjust_ww_wl') {
        state.ww += 50;
        state.wl += 10;
        navigateToTarget(action);
        return;
      }

      if (action.action === 'set_window_width') {
        state.ww = numericValue(action.value) ?? state.ww + 50;
        navigateToTarget(action);
        return;
      }

      if (action.action === 'set_window_level') {
        state.wl = numericValue(action.value) ?? state.wl + 10;
        navigateToTarget(action);
        return;
      }

      if (action.action === 'change_layout') {
        cycleLayout();
        navigateToTarget(action);
        return;
      }

      if (action.action === 'switch_series') {
        state.seriesIndex = state.seriesIndex >= 6 ? 1 : state.seriesIndex + 1;
        navigateToTarget(action);
        return;
      }

      if (action.action === 'set_layout') {
        if (action.value) state.layout = action.value;
        navigateToTarget(action);
        return;
      }

      if (action.action === 'select_series') {
        state.selectedSeries = action.value || action.text || `series_${state.seriesIndex}`;
        navigateToTarget(action);
        return;
      }

      if (action.action === 'open_layout_menu' || action.action === 'open_popup') {
        navigateToTarget(action);
        return;
      }

      if (action.action === 'show_dicom_info') {
        if (navigateToTarget(action)) return;
        view.showDicomInfo(DEFAULT_DICOM_INFO);
        return;
      }

      if (action.action === 'close_dialog') {
        if (navigateToTarget(action)) return;
        if (view.closeModal) view.closeModal();
        return;
      }

      navigateToTarget(action);
    }

    return {
      init: render,
      runAction,
      getState() {
        const snapshot = { ...state };
        if (!hasFlow()) delete snapshot.flowIndex;
        return snapshot;
      },
    };
  }

  function createBrowserView(documentRef) {
    const app = documentRef.querySelector('#app');
    const image = documentRef.querySelector('#page-image');
    const overlay = documentRef.querySelector('#overlay');
    const controls = documentRef.querySelector('#viewer-controls');
    const modalRoot = documentRef.querySelector('#modal-root');

    function button(label, action, onAction) {
      const el = documentRef.createElement('button');
      el.type = 'button';
      el.textContent = label;
      el.dataset.agentAction = action;
      el.addEventListener('click', () => onAction({ action }));
      return el;
    }

    return {
      setViewport(width, height) {
        app.style.width = `${width}px`;
        app.style.height = `${height}px`;
      },
      setScreenshot(src) {
        image.src = src || '';
      },
      setHotspots(actions, onAction) {
        overlay.innerHTML = '';
        for (const action of actions) {
          if (!action.box) continue;
          const el = documentRef.createElement('button');
          el.type = 'button';
          el.className = 'hotspot';
          el.dataset.agentAction = action.action;
          el.setAttribute('aria-label', action.text || action.action);
          el.style.left = `${action.box.x}px`;
          el.style.top = `${action.box.y}px`;
          el.style.width = `${action.box.width}px`;
          el.style.height = `${action.box.height}px`;
          el.addEventListener('click', () => onAction(action));
          overlay.appendChild(el);
        }
      },
      setViewerControls(state, onAction) {
        controls.hidden = !state.visible;
        controls.innerHTML = '';
        if (!state.visible) return;

        const status = documentRef.createElement('div');
        status.className = 'viewer-status';
        status.textContent = `WW ${state.ww} / WL ${state.wl} / Layout ${state.layout} / Series ${state.seriesIndex}`;

        controls.append(
          button('WW/WL', 'adjust_ww_wl', onAction),
          button('Series', 'switch_series', onAction),
          button('Layout', 'change_layout', onAction),
          button('DICOM', 'show_dicom_info', onAction),
          button('Report', 'back_to_report', onAction),
          status,
        );
      },
      showDicomInfo(info) {
        modalRoot.innerHTML = '';
        const modal = documentRef.createElement('section');
        modal.className = 'dicom-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-label', 'DICOM information');

        const title = documentRef.createElement('h2');
        title.textContent = 'DICOM Info';
        modal.appendChild(title);

        for (const [key, value] of Object.entries(info)) {
          const row = documentRef.createElement('p');
          row.textContent = `${key}: ${value}`;
          modal.appendChild(row);
        }

        const close = documentRef.createElement('button');
        close.type = 'button';
        close.textContent = 'Close';
        close.dataset.agentAction = 'close_dialog';
        close.addEventListener('click', () => {
          modalRoot.innerHTML = '';
        });
        modal.appendChild(close);
        modalRoot.appendChild(modal);
      },
      closeModal() {
        modalRoot.innerHTML = '';
      },
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createRuntime, createBrowserView };
    return;
  }

  globalScope.CopyLinkRuntime = { createRuntime, createBrowserView };

  globalScope.addEventListener('DOMContentLoaded', () => {
    if (!globalScope.COPYLINK_CASE) return;
    const runtime = createRuntime({
      data: globalScope.COPYLINK_CASE,
      view: createBrowserView(globalScope.document),
    });
    globalScope.copyLinkRuntime = runtime;
    runtime.init();
  });
})(typeof window !== 'undefined' ? window : globalThis);
