window.versions = { ...(window.versions||{}), workersFriend: '3.0.5' };

(function(global) {
  'use strict';

  let nextMessageId = 0;

  // 1) STRUCTURED-CLONE / deep-clone fallback
  function cloneAny(obj) {
    if (typeof structuredClone === 'function') {
      return structuredClone(obj);
    }
    return JSON.parse(JSON.stringify(obj));
  }

  // 2) ROBUST console-swizzling
  const _SWIZZLED = new WeakSet();
  function swizzleConsole(targetConsole, sendFn) {
    if (_SWIZZLED.has(targetConsole)) return;
    _SWIZZLED.add(targetConsole);

    for (const lvl of ['log','warn','error','info','debug']) {
      const orig = targetConsole[lvl].bind(targetConsole);
      targetConsole[lvl] = (...args) => {
        try { sendFn(lvl, ...args); } catch(_) {}
        orig(...args);
      };
    }
  }
  function unswizzleConsole(targetConsole) {
    // no-op in this sketch, but you could restore originals if saved
  }

    class MainThreadWorkerEmulator {
    constructor(blobFn, options={}) {
      this.terminated = false;
      this.listeners  = [];
      this.workerScope = {
        onmessage: null,
        postMessage: msg => {
          setTimeout(() => {
            if (this.terminated) return;

            // emulate Worker→main onmessage
            if (typeof this.onmessage === 'function') {
              this.onmessage({ data: msg });
            }

            // emulate Worker→main addEventListener
            this.listeners.forEach(fn => fn({ data: msg }));
          }, 0);
        },
        addEventListener: (type, fn) => {
          if (type === 'message') {
            this.listeners.push(fn);
          }
        },
        console: global.console
      };

      // Kick off the blob’s code in this “fake worker”
      try { blobFn(this.workerScope); }
      catch (e) {
        this.workerScope.postMessage({ action:'init-error', error:e.stack||e });
      }
    }

    addEventListener(type, fn) {
      if (type === 'message') {
        this.listeners.push(fn);
      }
    }
 
    removeEventListener(type, fn) {
      if (type === 'message') {
        this.listeners = this.listeners.filter(listener => listener !== fn);
      }
    }

    postMessage(msg) {
      if (this.terminated) return;
      setTimeout(() => {
        // emulate both .onmessage and addEventListener
        if (typeof this.workerScope.onmessage==='function') {
          this.workerScope.onmessage({ data: msg });
        }
        this.listeners.forEach(fn => fn({ data: msg }));
      }, 0);
    }

    terminate() {
      this.terminated = true;
      this.listeners = [];
      console.log('MainThreadWorkerEmulator terminated');
    }
  }

  // 3) UNIFORM ENDPOINT abstraction
  class Endpoint {
    constructor(workerOrEmulator, revokeUrlFn) {
      this._ep       = workerOrEmulator;
      this._revoke   = revokeUrlFn;    // called once on ready/init-error
      this._revoked  = false;
    }

    postMessage(msg) {
      // always send a deep-cloned copy
      this._ep.postMessage(cloneAny(msg));
    }

    addEventListener(type, fn) {
      if (type==='message') this._ep.addEventListener('message', fn);
    }

    removeEventListener(type, fn) {
      if (type==='message' && typeof this._ep.removeEventListener==='function') {
        this._ep.removeEventListener('message', fn);
      }
    }

    terminate() {
      try { this._ep.terminate(); } catch(_) {}
      unswizzleConsole(global.console);
    }

    _maybeRevoke() {
      if (this._revoke && !this._revoked) {
        this._revoked = true;
        this._revoke();
      }
    }
  }

  // 4) CORE FACTORY
  function createCoreWorker(taskObject, options={}) {
    const {
      useWorkerThread       = true,
      enableConsoleSwizzling= true,
      onProgress            = null,
      onSwizzledConsole     = null,
      timeout               = 30000
    } = options;

    // BUILD the blobFn to run inside real/emulated worker
    const blobFn = self => {
      const actionHandlers = new Map();
      let task, _onProgress, _onError, _onResult;
      let controller; // will be set per‐call

      // INIT handler: deserialize, setup console, then signal ready
      actionHandlers.set('init', data => {
        controller = data.abortSignal;
        task = {
          setup:    eval('('+data.setupFn+')'),
          loop:     eval('('+data.loopFn+')'),
          teardown: data.teardownFn? eval('('+data.teardownFn+')'): null
        };

        _onProgress = msg => self.postMessage({ id:data.id, action:'progress', message:msg });
        _onError    = err => self.postMessage({ id:data.id, action:'error', error:err.stack||err });
        _onResult   = res => self.postMessage({ id:data.id, action:'task:result', payload:res });

        if (data.enableConsoleSwizzling && data.onSwizzledConsoleFn) {
          swizzleConsole(self.console,
            (lvl, ...args) => self.postMessage({ id:data.id, action:'console', payload:{ level:lvl,args } })
          );
        }

        self.postMessage({ id:data.id, action:'ready' });
      });

      // CANCEL handler: just mark aborted
      actionHandlers.set('cancel', data => {
        if (data.id === controller?.id) controller.aborted = true;
      });

      // START_TASK handler: run sync or async, respecting abort
      actionHandlers.set('start_task', payload => {
        if (controller.aborted) return;
        const { iterations, isEmulated } = payload;
        let state = task.setup
          ? task.setup({ iterations })
          : { i:0, totalIterations:iterations };

        function finish() {
          if (!controller.aborted) {
            const result = task.teardown
              ? task.teardown(state)
              : state;
            _onResult(result);
          }
        }

        if (!isEmulated) {
          try {
            while (state.i < state.totalIterations && !controller.aborted) {
              task.loop(state, _onProgress);
              state.i++;
            }
            finish();
          } catch (err) {
            _onError(err);
          }
        } else {
          const timeSlice = 20;
          let delay = 0;
          const fib = d => d===0?10:Math.min(Math.floor(d*1.618),500);

          (function step() {
            if (controller.aborted) return;
            const start = performance.now();
            try {
              while (state.i < state.totalIterations &&
                     (performance.now()-start) < timeSlice &&
                     !controller.aborted) {
                task.loop(state, _onProgress);
                state.i++;
              }
            } catch (err) {
              return _onError(err);
            }
            if (state.i < state.totalIterations && !controller.aborted) {
              delay = fib(delay);
              setTimeout(step, delay);
            } else finish();
          })();
        }
      });

      // central incoming dispatcher
      self.onmessage = e => {
        const d = e.data;
        // 5) SHAPE‐VALIDATE
        if (!d || typeof d.id!=='string' || typeof d.action!=='string') {
          return; // drop stray message
        }
        const handler = actionHandlers.get(d.action);
        if (handler) handler(d.payload);
      };
    };

    // instantiate real Worker or emulator
    let rawWorker, blobUrl;
    if (useWorkerThread) {
      const script = `(${blobFn.toString()})(self);`;
      const blob   = new Blob([script], { type:'application/javascript' });
      blobUrl      = URL.createObjectURL(blob);
      rawWorker    = new Worker(blobUrl);
    } else {
      rawWorker = new MainThreadWorkerEmulator(blobFn, {});
    }
    const endpoint = new Endpoint(rawWorker, () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    });

    // RPC dispatch registry
    const pending = new Map();

    function dispatchMainMessage(event) {
      const d = event.data;
      // shape-validate
      if (!d || typeof d.id!=='string' || typeof d.action!=='string') return;

      // revoke blob URL on first ready or init-error
      if ((d.action==='ready' || d.action==='init-error')) {
        endpoint._maybeRevoke();
      }

      const entry = pending.get(d.id);
      switch (d.action) {
        case 'console':
          onSwizzledConsole?.(d.payload.level, ...d.payload.args);
          break;
        case 'ready':
          if (entry) {
            // 6) AUTOMATIC Blob URL revocation just happened
            endpoint.postMessage({ id: d.id, action:'start_task', payload:{
              iterations: entry.params.iterations,
              isEmulated: !useWorkerThread
            }});
          }
          break;
        case 'progress':
          onProgress?.(d.message);
          break;
        case 'task:result':
          if (entry) {
            clearTimeout(entry.timeoutId);
            entry.resolve(d.payload);
            pending.delete(d.id);
          }
          break;
        case 'error':
          if (entry) {
            clearTimeout(entry.timeoutId);
            entry.reject(new Error(d.error));
            pending.delete(d.id);
          }
          break;
        case 'init-error':
          console.error('Worker init failed:', d.error);
          break;
      }
    }

    endpoint.addEventListener('message', dispatchMainMessage);

    // 7) PUBLIC API: call() returns { promise, abortController }
    return {
      call(actionName, params) {
        const id = String(nextMessageId++);
        const abortController = { id, aborted: false };
        const promise = new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`Worker timed out after ${timeout}ms`));
          }, timeout);

          pending.set(id, { resolve, reject, timeoutId, params });

          // 2‐phase init handshake, passing AbortSignal info
          endpoint.postMessage({
            id,
            action: 'init',
            payload: {
              id,
              setupFn:    taskObject.setup   .toString(),
              loopFn:     taskObject.loop    .toString(),
              teardownFn: taskObject.teardown
                ? taskObject.teardown.toString()
                : '',
              enableConsoleSwizzling,
              onSwizzledConsoleFn: onSwizzledConsole
                ? onSwizzledConsole.toString()
                : '',
              abortSignal: abortController
            }
          });
        });

        return { promise, abortController };
      },

      terminate() {
        // cancel all pending
        for (const { reject, timeoutId, params } of pending.values()) {
          clearTimeout(timeoutId);
          reject(new Error('Worker terminated'));
        }
        pending.clear();

        endpoint.terminate();
      }
    };
  }

  // export
  global.WorkersFriend = { createCoreWorker };

})(window);
