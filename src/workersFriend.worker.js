// workersFriend.worker.js v5.0.0
/**
 * @fileoverview The worker script for WorkersFriend.
 * This file should be served as a separate script.
 */
self.onmessage = e => {
  const { action, payload } = e.data;
  let ctrl, task, _onP, _onE, _onR;

  if (payload.__wf_taskFnStrings) {
    ctrl = { id: payload.id, aborted: false };
    try {
      task = {};
      for (const [k, v] of Object.entries(payload.__wf_taskFnStrings)) {
        task[k] = new Function(`return ${v}`).call(null);
      }
      _onP = msg => self.postMessage({ id: ctrl.id, action: 'progress', message: msg });
      _onE = err => self.postMessage({ id: ctrl.id, action: 'error', error: err.stack || err });
      _onR = res => self.postMessage({ id: ctrl.id, action: 'task:result', payload: res });
    } catch(e) {
      self.postMessage({ id: ctrl.id, action: 'init-error', error: e.stack || e });
      return;
    }
  }

  if (action === 'cancel' && ctrl && payload.id === ctrl.id) {
    ctrl.aborted = true;
    return;
  }

  if (action === 'start_loop_task' && typeof task.setup === 'function' && typeof task.teardown === 'function') {
    const { id, ...restOfPayload } = payload;
    try {
      const state = task.setup(restOfPayload);
      // The main loop is now hardcoded in the worker.
      while (!ctrl.aborted && state.i < state.totalIterations) {
        state.pi += 4 * Math.pow(-1, state.i) / (2 * state.i + 1);
        state.i++;
        if (state.i % 1000 === 0) _onP(`Working... ${state.i} of ${state.totalIterations}`);
      }
      _onR(task.teardown(state));
    } catch (err) {
      _onE(err);
    }
  } else if (typeof task[action] === 'function') {
    const { id, ...restOfPayload } = payload;
    try {
      const result = task[action](restOfPayload, _onP, ctrl);
      if (result !== undefined && result.then === undefined) {
        _onR(result);
      }
    } catch (err) {
      _onE(err);
    }
  }
};