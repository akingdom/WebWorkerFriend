// workersFriend.worker.js v6.7.0
/**
 * The worker script for WorkersFriend.
 * This script is responsible for all background tasks and should be served as a separate file.
 */
self.onmessage = e => {
  const { action, payload } = e.data;

  // We only handle the 'start_loop_task' action, but a custom worker
  // could handle multiple actions.
  if (action === 'start_loop_task') {
    const { id, iterations } = payload;
    let pi = 0;
    let i = 0;
    const totalIterations = iterations;
    const aborted = false;

    // Report progress to the main thread
    const postProgress = msg => self.postMessage({ id, action: 'live:data', payload: msg });

    // The core calculation loop
    while (!aborted && i < totalIterations) {
      pi += 4 * Math.pow(-1, i) / (2 * i + 1);
      i++;
      if (i % 50000 === 0) {
        postProgress(`Working... ${i} of ${totalIterations}`);
      }
    }

    // Report final result to the main thread
    self.postMessage({ id, action: 'task:result', payload: { piValue: pi } });
  }

  // The 'cancel' action is automatically handled by the main library.
  // It terminates the worker, so we don't need a specific handler here.
};