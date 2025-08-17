// workersFriend.worker.js v6.8.1
/**
 * The worker script for WorkersFriend.
 * This script is responsible for all background tasks and should be served as a separate file.
 */
self.onmessage = e => {
  const { action, payload } = e.data;
  let ctrl, task;

  // This block handles the dynamic execution of setup/teardown/loop
  if (payload && payload.__wf_taskFnStrings) {
    ctrl = { id: payload.id, aborted: false };
    try {
      task = {};
      for (const [k, v] of Object.entries(payload.__wf_taskFnStrings)) {
        task[k] = new Function(`return ${v}`).call(null);
      }
    } catch(e) {
      self.postMessage({ id: ctrl.id, action: 'init-error', error: { message: e.message, stack: e.stack, type: 'init' } });
      return;
    }
  }

  if (action === 'cancel' && ctrl && payload.id === ctrl.id) {
    ctrl.aborted = true;
    return;
  }
  
  // The start_loop_task action now uses the setup/loop/teardown functions
  if (action === 'start_loop_task' && task && typeof task.setup === 'function' && typeof task.loop === 'function' && typeof task.teardown === 'function') {
    const { id, ...restOfPayload } = payload;
    let state;
    try {
      // Execute the 'setup' function
      state = task.setup(restOfPayload);
    } catch (e) {
      self.postMessage({ id, action: 'error', error: { message: `Error in setup: ${e.message}`, stack: e.stack }});
      return;
    }
    
    // The main loop is now dynamic, calling the user-provided 'loop' function
    while (!ctrl.aborted && state.i < state.totalIterations) {
      state = task.loop(state);
      if (state.i % 50000 === 0) {
        self.postMessage({ id, action: 'live:data', payload: `Working... ${state.i} of ${state.totalIterations}` });
      }
    }

    // Execute the 'teardown' function
    let finalResult;
    try {
      finalResult = task.teardown(state);
    } catch (e) {
      self.postMessage({ id, action: 'error', error: { message: `Error in teardown: ${e.message}`, stack: e.stack }});
      return;
    }
    
    // Report final result to the main thread
    self.postMessage({ id, action: 'task:result', payload: finalResult });
  }

  // The 'cancel' action is handled above.
};