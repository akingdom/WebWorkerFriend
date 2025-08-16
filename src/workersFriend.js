// WorkersFriend.js v5.0.0 (Final & Stable)
window.versions = { ...(window.versions || {}), workersFriend: '5.0.0' };

(function(global) {
  "use strict";

  function cloneAny(obj) {
    try {
      if (typeof structuredClone === 'function') {
        return structuredClone(obj);
      }
      return JSON.parse(JSON.stringify(obj));
    } catch (e) {
      return JSON.parse(JSON.stringify(obj));
    }
  }

  class MainThreadWorkerEmulator {
    constructor(workerFn) {
      this.terminated = false;
      this.listeners = [];
      this.onmessage = null;

      const scope = {
        onmessage: null,
        postMessage: msg => {
          if (this.terminated) return;
          const data = cloneAny(msg);
          setTimeout(() => {
            if (typeof this.onmessage === 'function') this.onmessage({ data });
            this.listeners.forEach(fn => fn({ data }));
          }, 0);
        },
        addEventListener: (type, fn) => {
          if (type === 'message') scope.onmessage = fn;
        },
        removeEventListener: (type, fn) => {
          if (type === 'message' && scope.onmessage === fn) scope.onmessage = null;
        },
        console: global.console
      };

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
      setTimeout(() => {
        if (typeof this._scope.onmessage === 'function') this._scope.onmessage({ data });
      }, 0);
    }

    addEventListener(type, fn) {
      if (type === 'message') this.listeners.push(fn);
    }

    removeEventListener(type, fn) {
      if (type === 'message') this.listeners = this.listeners.filter(l => l !== fn);
    }

    terminate() {
      this.terminated = true;
      this.listeners.length = 0;
    }
  }

  function createCoreWorker(workerUrl, options = {}) {
    const {
      useWorkerThread = true,
      onProgress = null,
      timeout = 30000,
    } = options;

    let nextId = 0;
    const pending = new Map();
    let raw;

    if (useWorkerThread && typeof Worker === 'function') {
      raw = new Worker(workerUrl);
    } else {
      const workerFn = self => {
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
              // The main loop is now hardcoded in the emulation mode.
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
      };
      raw = new MainThreadWorkerEmulator(workerFn);
    }

    const ep = {
        postMessage: msg => raw.postMessage(cloneAny(msg)),
        addEventListener: (type, fn) => raw.addEventListener(type, fn),
        terminate: () => raw.terminate(),
    };

    ep.addEventListener('message', ev => {
      const d = ev.data;
      if (!d || typeof d.id !== 'string' || typeof d.action !== 'string') return;
      const entry = pending.get(d.id);
      if (!entry) return;

      if (d.action === 'task:result' || d.action === 'error' || d.action === 'init-error') {
        clearTimeout(entry.timeoutId);
        pending.delete(d.id);
      }

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
        const promise = new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`timeout after ${timeout}ms`));
          }, timeout);
          pending.set(id, { resolve, reject, timeoutId });
          ep.postMessage({ action, payload: { ...payload, id } });
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

  global.WorkersFriend = {
    createLoopWorker: (taskObject, options) => {
      const coreWorker = createCoreWorker(options.workerUrl, options);
      const functionStrings = Object.fromEntries(
        Object.entries(taskObject)
          .filter(([k, v]) => typeof v === 'function')
          .map(([k, v]) => [k, v.toString()])
      );
      return {
        call: (payload = {}) => {
          return coreWorker.call('start_loop_task', {
            ...payload,
            __wf_taskFnStrings: functionStrings,
          });
        },
        terminate: () => coreWorker.terminate(),
      };
    },

    createCustomWorker: (taskObject, options) => {
      const coreWorker = createCoreWorker(options.workerUrl, options);
      const functionStrings = Object.fromEntries(
        Object.entries(taskObject)
          .filter(([k, v]) => typeof v === 'function')
          .map(([k, v]) => [k, v.toString()])
      );
      return {
        call: (action, payload = {}) => {
          return coreWorker.call(action, {
            ...payload,
            __wf_taskFnStrings: functionStrings,
          });
        },
        terminate: () => coreWorker.terminate(),
      };
    }
  };
})(window);