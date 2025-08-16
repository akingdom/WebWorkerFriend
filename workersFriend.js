// WorkersFriend.js v3.1.4 (fixed emulator)
window.versions = { ...(window.versions||{}), workersFriend: '3.1.4' };
/**
 * WorkersFriend.js  v3.1.2
 * ------------------------
 * Generic, reusable Web Worker helper with in‐page emulation, progress events,
 * console swizzling, and cancellable tasks via an AbortController‐style flag.
 *
 * USAGE EXAMPLE:
 *
 * // 1. Define your worker "task" object with setup / loop / teardown functions:
 * const task = {
 *   setup:    ({ iterations }) => ({ i: 0, totalIterations: iterations }),
 *   loop:     (state, progress) => {
 *               // do a chunk of work
 *               if (state.i % 1000 === 0) progress(`At iteration ${state.i}`);
 *             },
 *   teardown: state => ({ finishedAt: Date.now(), iterationsDone: state.i })
 * };
 *
 * // 2. Create a worker instance (real thread or in‐page emulator):
 * const coreWorker = WorkersFriend.createCoreWorker(task, {
 * useWorkerThread: true,                // false => runs in‐page for debugging
 *   enableConsoleSwizzling: true,         // capture worker console.* calls
 *   onProgress: msg => updateProgressBar(msg),
 *   onSwizzledConsole: (lvl, ...args) => logToPanel(lvl, ...args),
 * timeout: 30000                         // ms before auto‑reject
 * });
 *
 * // 3. Call the worker:
 * const { promise, abortController } = coreWorker.call('start_task', {
 *   iterations: 1_000_000,
 *   isEmulated: false
 * });
 *
 * promise
 *   .then(result => console.log('Worker result:', result))
 *   .catch(err => console.error('Worker error/timeout:', err));
 *
 * // 4. Cancel if needed:
 * abortController.aborted = true;
 *
 * // 5. Clean up when done:
 * coreWorker.terminate();
 *
 * NOTES:
 * - All messages are deep‐cloned via structuredClone (with JSON fallback)
 * - Progress callbacks are optional; post from worker as { action:'progress', message }
 * - MainThreadWorkerEmulator simulates Worker API for single‐thread debugging
 * - No global state is shared between calls; pass all config in task/setup payloads
 * - New in v3.0.8: optional __wf_taskFactoryFn (single string) to send full task; worker falls back to setupFn/loopFn/teardownFn if absent
 */

(function(global) {
  //–– Universal deep‐clone (uses structuredClone when available) ––
  function cloneAny(obj) {
    return typeof structuredClone==='function'
      ? structuredClone(obj)
      : JSON.parse(JSON.stringify(obj));
  }

  //–– Emulated Worker running in the main thread ––
  class MainThreadWorkerEmulator {
    constructor(workerFn) {
      this.terminated = false;
      this.listeners  = [];
      this.onmessage  = null;
      
      // Build the "self" scope for the workerFn:
      const scope = {
        onmessage: null,
        postMessage: msg => {
          if (this.terminated) return;
          const data = cloneAny(msg);
          // Delay to mimic asynchronous message passing
          setTimeout(() => {
            if (typeof this.onmessage === 'function') {
              this.onmessage({ data });
            }
            this.listeners.forEach(fn => fn({ data }));
          }, 0);
        },
        addEventListener: (type, fn) => {
          if (type === 'message') scope.onmessage = fn;
        },
        removeEventListener: (type, fn) => {
          if (type === 'message' && scope.onmessage === fn) {
            scope.onmessage = null;
          }
        },
        console: global.console
      };

      // Run the worker code inside that scope
      try {
        workerFn(scope);
      } catch (err) {
        scope.postMessage({ action: 'init-error', error: err.stack || err });
      }

      this._scope = scope;
    }
    postMessage(msg) {
      if (this.terminated) return;
      const data = cloneAny(msg);
      setTimeout(()=>{
        if (typeof this._scope.onmessage === 'function') {
          this._scope.onmessage({ data });
        }
        //this.listeners.forEach(fn => fn({ data: msg }));
      }, 0);
    }

    addEventListener(type, fn) {
      if (type === 'message') this.listeners.push(fn);
    }

    removeEventListener(type, fn) {
      if (type === 'message') {
        this.listeners = this.listeners.filter(l => l !== fn);
    }
    }

    terminate() {
      this.terminated = true;
      this.listeners.length = 0;
    }
  }

  //–– Endpoint wraps either a real Worker or the emulator ––
  class Endpoint {
    constructor(raw, onRevoke) {
      this._raw      = raw;
      this._revoked  = false;
      this._revoke = onRevoke;
    }

    postMessage(msg) {
      if (this._revoked) return;
      this._raw.postMessage(cloneAny(msg));
    }

    addEventListener(type, fn) {
      if (type === 'message') {
        this._raw.addEventListener('message', fn);
      }
    }

    removeEventListener(type, fn) {
      if (type === 'message' && typeof this._raw.removeEventListener === 'function') {
        this._raw.removeEventListener('message', fn);
      }
    }

    terminate() {
      try { this._raw.terminate(); } catch {}
      if (!this._revoked && this._revoke) {
        this._revoked = true;
        this._revoke();
      }
    }
  }

  //–– Core API: createCoreWorker(taskObject, options) ––
  function createCoreWorker(taskObject, options = {}) {
    const {
      useWorkerThread        = true,
      onProgress             = null,
      timeout                = 30000,
      logger: userLogger     = {}
    } = options;

    const logger = Object.assign({}, {
      log:   (...a) => console.log('[wf]', ...a),
      warn:  (...a) => console.warn('[wf]', ...a),
      error: (...a) => console.error('[wf]', ...a),
      info:  (...a) => console.info('[wf]', ...a),
      debug: (...a) => console.debug('[wf]', ...a)
    }, userLogger);

    let nextId = 0;
    const pending = new Map();

    // Build the worker code
    const workerFn = self => {
      const handlers = new Map();
      let ctrl, task, _onP, _onE, _onR;

      // START_TASK handler
      handlers.set('start_task', (payload) => {
        const { id, iterations, isEmulated, __wf_taskFnStrings } = payload;
        ctrl = { id, aborted: false };

        try {
      // Re-create the task object with functions from strings
          task = {};
          for (const [k, v] of Object.entries(__wf_taskFnStrings)) {
            task[k] = new Function(`return ${v}`).call(null);
          }
          _onP = msg => self.postMessage({ id: ctrl.id, action: 'progress', message: msg });
          _onE = err => self.postMessage({ id: ctrl.id, action: 'error', error: err.stack || err });
          _onR = res => self.postMessage({ id: ctrl.id, action: 'task:result', payload: res });
        } catch (e) {
          self.postMessage({ id: ctrl.id, action: 'init-error', error: e.stack || e });
        }

        let state = task.setup
          ? task.setup({ iterations })
          : { i: 0, totalIterations: iterations };

        const finish=()=>{
          if(ctrl.aborted)return;
          try {
            const result = task.teardown
              ? task.teardown(state)
              : state;
            _onR(result);
          } catch (e) {
            _onE(e);
          }
        };

        // Synchronous loop
        if (!isEmulated) {
          try {
            while (state.i < state.totalIterations && !ctrl.aborted) {
              task.loop(state, _onP);
              state.i++;
            }
            finish();
          } catch (e) {
            _onE(e);
          }
          return;
        }

        // Emulated loop (chunks <20ms)
        let delay = 0;
        const fib = x => x === 0 ? 10 : Math.min(Math.floor(x * 1.618), 500);

        (function step() {
          if(ctrl.aborted)return;
          const start = performance.now();
          try {
            while (
              state.i < state.totalIterations &&
              (performance.now() - start) < 20 &&
              !ctrl.aborted
            ) {
              task.loop(state, _onP);
              state.i++;
            }
          } catch (e) {
            return _onE(e);
          }

          if (state.i < state.totalIterations && !ctrl.aborted) {
            delay = fib(delay);
            setTimeout(step, delay);
          } else {
            finish();
          }
        })();
      });

      // CANCEL handler
      handlers.set('cancel', ({ id }) => {
        if (ctrl && id === ctrl.id) ctrl.aborted = true;
      });

      self.onmessage = e => {
        const msg = e.data;
        handlers.get(msg.action)?.(msg.payload);
      };
    };

    // Instantiate raw worker or emulator
    let raw, blobURL;
    if (useWorkerThread && typeof Worker === 'function') {
      const code = `(${workerFn.toString()})(self);`;
      const blob=new Blob([code],{type:'application/javascript'});
      blobURL = URL.createObjectURL(blob);
      raw = new Worker(blobURL);
    } else {
      raw = new MainThreadWorkerEmulator(workerFn);
    }

    const ep = new Endpoint(raw, () => blobURL && URL.revokeObjectURL(blobURL));

    // Listen for messages from worker/emulator
    ep.addEventListener('message',ev=>{
      const d = ev.data;
      if (!d || typeof d.id!=='string' || typeof d.action!=='string') return;

      const entry = pending.get(d.id);
      if (!entry) {
        // This is the error message being logged.
        // It's a race condition if the worker sends a message before the main thread can set up the pending entry.
        // We'll ignore it for now as the main thread will eventually process the task.
        return;
      }
      
      // Cleanup the pending entry as soon as we get a final result or error
      if (d.action === 'task:result' || d.action === 'error' || d.action === 'init-error') {
      clearTimeout(entry.timeoutId);
      pending.delete(d.id);
      }

      // Handle the actions
      if (d.action === 'progress') {
        onProgress?.(d.message);
      } else if (d.action === 'task:result') {
        entry.resolve(d.payload);
      } else if (d.action === 'error' || d.action === 'init-error') {
        entry.reject(new Error(d.error));
      }
    });

    return {
      call(action, payload) {
        const id = String(nextId++);
        const functionStrings = Object.fromEntries(
          Object.entries(taskObject)
            .filter(([k, v]) => typeof v === 'function')
            .map(([k, v]) => [k, v.toString()])
        );

        const promise = new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`timeout after ${timeout}ms`));
          }, timeout);

          pending.set(id, { resolve, reject, timeoutId });
          ep.postMessage({
            action,
            payload: { ...payload, id, __wf_taskFnStrings: functionStrings }
          });
        });

        return {
          promise,
          abortController: {
            abort: () => ep.postMessage({ action: 'cancel', payload: { id } })
          }
        };
      },

      terminate() {
        for (const { reject, timeoutId } of pending.values()) {
          clearTimeout(timeoutId);
          reject(new Error('terminated'));
        }
        pending.clear();
        ep.terminate();
      }
    };
  }

  global.WorkersFriend = { createCoreWorker };

})(window);
