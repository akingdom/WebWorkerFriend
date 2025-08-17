// WorkersFriend.js v6.8.2 (JSDoc with @example Blocks Added)
window.versions = { ...(window.versions || {}), workersFriend: '6.8.2' };

(function(global) {
  "use strict";

  const LoopAction = Object.freeze({
    CONTINUE: 'continue',
    TERMINATE: 'terminate',
  });

  /**
   * Clones a value using structuredClone for deep, safe cloning.
   * @param {*} obj The object to clone.
   * @returns {*} The cloned object.
   * @throws {Error} If structuredClone is not supported.
   * @ignore
   */
  function cloneAny(obj) {
    if (typeof structuredClone === 'function') {
      return structuredClone(obj);
    }
    throw new Error('structuredClone is not supported. Cannot clone data for worker.');
  }

  /**
   * Creates an in-memory Blob URL from a script string.
   * @param {string} scriptText The JavaScript code to be turned into a Blob.
   * @returns {string} A Blob URL.
   * @ignore
   */
  function createBlobURL(scriptText) {
    const blob = new Blob([scriptText], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
  }

  /**
   * A class that emulates a Web Worker for in-page debugging.
   * It runs on the main thread and uses setTimeout to mimic a non-blocking environment.
   * @ignore
   */
  class MainThreadWorkerEmulator {
    /**
     * @param {string} workerScriptText The JavaScript code to be run in the emulator's scope.
     */
    constructor(workerScriptText) {
      this.terminated = false;
      this.listeners = [];
      this._workerOnMessageHandler = null;

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
          if (type === 'message') {
            scope.onmessage = fn;
            this._workerOnMessageHandler = fn;
          }
        },
        removeEventListener: (type, fn) => {
          if (type === 'message' && scope.onmessage === fn) {
            scope.onmessage = null;
            this._workerOnMessageHandler = null;
          }
        },
        console: global.console,
        importScripts: (url) => {
          if (global.__workersFriendTasks && global.__workersFriendTasks[url]) {
            global.__workersFriendTasks[url](scope);
          } else {
            console.error(`Emulator failed to load script: ${url}. This is a fatal error.`);
            throw new Error(`Emulator failed to load script: ${url}.`);
          }
        }
      };

      try {
        const workerFn = new Function('self', workerScriptText);
        workerFn(scope);
      } catch (err) {
        scope.postMessage({ action: 'init-error', error: { message: err.message, stack: err.stack, type: 'init' } });
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
      if (typeof this._workerOnMessageHandler === 'function') {
        this._scope.removeEventListener('message', this._workerOnMessageHandler);
      }
    }
  }

  async function loadScriptForEmulator(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      console.error(`Failed to fetch script for emulation: ${url}`, error);
      throw error;
    }
  }

  function createCoreWorker(options = {}) {
    const {
      useWorkerThread = true,
      onLiveProgress = null,
      onDeferredProgress = null,
      timeout = 30000,
      workerUrl,
      taskString,
      taskElementId,
    } = options;

    let nextId = 0;
    const pending = new Map();
    let raw;
    let rawTerminated = false;
    let actualWorkerUrl;

    return new Promise(async (resolve, reject) => {
      try {
        const providedSources = [workerUrl, taskString, taskElementId].filter(Boolean);
        if (providedSources.length === 0) {
          throw new Error('A worker URL, script string, or element ID must be provided.');
        }
        if (providedSources.length > 1) {
          throw new Error('Ambiguous worker source: Only one of `workerUrl`, `taskString`, or `taskElementId` can be specified.');
        }

        if (taskString) {
          actualWorkerUrl = createBlobURL(taskString);
          if (!useWorkerThread) {
            raw = new MainThreadWorkerEmulator(taskString);
          }
        } else if (taskElementId) {
          const element = document.getElementById(taskElementId);
          if (!element || element.tagName.toUpperCase() !== 'SCRIPT') {
            throw new Error(`Element with ID "${taskElementId}" not found or is not a <script> tag.`);
          }
          const scriptContent = element.textContent;
          actualWorkerUrl = createBlobURL(scriptContent);
          if (!useWorkerThread) {
            raw = new MainThreadWorkerEmulator(scriptContent);
          }
        } else if (workerUrl) {
          if (!useWorkerThread) {
            const scriptContent = await loadScriptForEmulator(workerUrl);
            raw = new MainThreadWorkerEmulator(scriptContent);
          } else {
            actualWorkerUrl = workerUrl;
          }
        }

        if (useWorkerThread && typeof Worker === 'function') {
          raw = new Worker(actualWorkerUrl);
        } else if (!raw) {
          throw new Error("Logic error: Could not create worker instance.");
        }
      } catch (err) {
        return reject(err);
      }

      const ep = {
        postMessage: msg => {
          if (rawTerminated) {
            console.warn("[WorkersFriend] Attempted to post message to a terminated worker.");
            return;
          }
          raw.postMessage(cloneAny(msg));
        },
        addEventListener: (type, fn) => raw.addEventListener(type, fn),
        terminate: () => {
          rawTerminated = true;
          for (const { reject, timeoutId } of pending.values()) {
            clearTimeout(timeoutId);
            reject(new Error("Worker terminated."));
          }
          pending.clear();

          if (raw instanceof Worker) {
            raw.terminate();
            if (taskString || taskElementId || (workerUrl && !useWorkerThread)) {
              URL.revokeObjectURL(actualWorkerUrl);
            }
          } else {
            if (typeof raw.terminate === 'function') {
              raw.terminate();
            }
          }
        },
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

        if (d.action === 'live:data') {
          onLiveProgress?.(d.payload);
        } else if (d.action === 'deferred:data') {
          onDeferredProgress?.(d.payload);
        } else if (d.action === 'task:result') {
          entry.resolve(d.payload);
        } else if (d.action === 'error' || d.action === 'init-error') {
          entry.reject(new Error(d.error.message || 'Worker error'), Object.assign(new Error(d.error.message || 'Worker error'), d.error));
        }
      });

      resolve({
        /**
         * Sends a message to the worker to execute a task.
         * @param {string} action - The name of the function to call in the worker.
         * @param {object} [payload] - The data to pass to the worker function.
         * @returns {{promise: Promise<*>, abortController: {abort: Function}}} An object containing the promise for the result and an abort controller.
         */
        call(action, payload) {
          if (rawTerminated) {
            return {
              promise: Promise.reject(new Error("Worker already terminated.")).catch(() => {}),
              abortController: { abort: () => {} }
            };
          }
          const id = String(nextId++);
          const promise = new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              pending.delete(id);
              reject(new Error(`timeout after ${timeout}ms`));
            }, timeout);
            pending.set(id, { resolve, reject, timeoutId });
            ep.postMessage({ action, payload: { ...payload, id } });
          });

          // Add a listener to warn about unhandled promises
          promise.catch(() => {}).finally(() => {
            if (pending.has(id)) {
              console.warn(`WorkersFriend: Promise for task ID ${id} was not handled. Make sure you use .then() or async/await.`);
            }
          });

          return {
            promise,
            abortController: {
              abort: () => {
                if (!rawTerminated) {
                  ep.postMessage({ action: 'cancel', payload: { id } });
                }
              }
            }
          };
        },
        terminate: ep.terminate,
      });
    });
  }

  global.WorkersFriend = {
    /**
     * @typedef {object} WorkerOptions
     * @property {boolean} [useWorkerThread=true] - If true, a real Web Worker is used. Otherwise, an in-page emulator is used.
     * @property {Function} [onLiveProgress] - A callback for real-time progress updates.
     * @property {Function} [onDeferredProgress] - A callback for batched progress updates.
     * @property {number} [timeout=30000] - The maximum time to wait for a result.
     */

    /**
     * Creates a timesliced loop worker based on a separate worker script file.
     * Perfect for iterative or long-running calculations.
     * @param {string} taskUrl - The URL to the worker script file.
     * @param {WorkerOptions} [options] - The worker configuration options.
     * @returns {Promise<object>} A promise that resolves with the worker control object.
     * @example
     * // For professionals: use a real worker with async/await.
     * const loopWorker = await WorkersFriend.createLoopWorker('myLoopTask.js', { useWorkerThread: true });
     *
     * // For students: use the emulator for easy debugging.
     * const loopWorkerDebug = await WorkersFriend.createLoopWorker('myLoopTask.js', { useWorkerThread: false });
     *
     * // Then call the worker.
     * const { promise } = loopWorker.call({ iterations: 1000000 });
     * promise.then(result => console.log(result));
     */
    createLoopWorker: async (taskUrl, options) => {
      const coreWorker = await createCoreWorker({ ...options, workerUrl: taskUrl });
      return {
        call: (payload = {}) => {
          return coreWorker.call('start_loop_task', payload);
        },
        terminate: () => coreWorker.terminate(),
      };
    },

    /**
     * Creates a custom worker based on a separate worker script file.
     * Ideal for professionals needing full control over multiple tasks.
     * @param {string} taskUrl - The URL to the worker script file.
     * @param {WorkerOptions} [options] - The worker configuration options.
     * @returns {Promise<object>} A promise that resolves with the worker control object.
     * @example
     * // Create a custom worker from a separate file.
     * const apiWorker = await WorkersFriend.createCustomWorker('myApiWorker.js');
     *
     * // Call a function named 'processData' on the worker.
     * const { promise } = apiWorker.call('processData', { input: 'some data' });
     * promise.then(result => console.log('API Result:', result));
     */
    createCustomWorker: async (taskUrl, options) => {
      const coreWorker = await createCoreWorker({ ...options, workerUrl: taskUrl });
      return {
        call: (action, payload = {}) => {
          return coreWorker.call(action, payload);
        },
        terminate: () => coreWorker.terminate(),
      };
    },

    /**
     * Creates a worker from an inline string of JavaScript code.
     * A convenient method for quick tests or self-contained tasks.
     * @param {string} taskString - The JavaScript code as a string.
     * @param {WorkerOptions} [options] - The worker configuration options.
     * @returns {Promise<object>} A promise that resolves with the worker control object.
     * @example
     * // Define a simple task directly in your main script.
     * const myTask = \`
     * self.onmessage = (e) => {
     * const { payload } = e.data;
     * const result = payload.a + payload.b;
     * self.postMessage({ id: payload.id, action: 'task:result', payload: result });
     * };
     * \`;
     * const myWorker = await WorkersFriend.createFromScript(myTask);
     * const { promise } = myWorker.call('myAction', { a: 5, b: 10 });
     * promise.then(result => console.log('Result:', result));
     */
    createFromScript: async (taskString, options) => {
      const coreWorker = await createCoreWorker({ ...options, taskString });
      return {
        call: (action, payload = {}) => {
          return coreWorker.call(action, payload);
        },
        terminate: () => coreWorker.terminate(),
      };
    },

    /**
     * Creates a worker from the text content of a <script> element in the DOM.
     * This is useful for keeping worker code inline with your HTML for demonstrations or simple apps.
     * @param {string} elementId - The ID of a <script> element.
     * @param {WorkerOptions} [options] - The worker configuration options.
     * @returns {Promise<object>} A promise that resolves with the worker control object.
     * @example
     * // HTML: <script id="my-worker-script" type="text/javascript">...</script>
     * const myWorker = await WorkersFriend.createFromElement('my-worker-script');
     * const { promise } = myWorker.call('doSomething', { input: 'hello' });
     * promise.then(result => console.log(result));
     */
    createFromElement: async (elementId, options) => {
      const coreWorker = await createCoreWorker({ ...options, taskElementId: elementId });
      return {
        call: (action, payload = {}) => {
          return coreWorker.call(action, payload);
        },
        terminate: () => coreWorker.terminate(),
      };
    },

    /**
     * Creates a loop worker from an object containing `setup`, `loop`, and `teardown` functions.
     * This API is designed to mimic the Arduino `setup()` and `loop()` structure for students and beginners.
     * @param {object} taskObject - An object with `setup`, `loop`, and `teardown` functions.
     * @param {WorkerOptions} [options] - The worker configuration options.
     * @returns {Promise<object>} A promise that resolves with the worker control object.
     * @example
     * // Define your task in a simple object.
     * const piTask = {
     * setup: ({ iterations }) => ({ i: 0, totalIterations: iterations, pi: 0 }),
     * loop: state => {
     * state.pi += 4 * Math.pow(-1, state.i) / (2 * state.i + 1);
     * state.i++;
     * return state;
     * },
     * teardown: state => ({ piValue: state.pi }),
     * };
     *
     * const piWorker = await WorkersFriend.createLoopWorkerFromObject(piTask, {
     * workerUrl: 'workersFriend.worker.js',
     * useWorkerThread: true
     * });
     *
     * const { promise } = piWorker.call({ iterations: 500000 });
     * promise.then(res => console.log(res.piValue.toFixed(15)));
     */
    createLoopWorkerFromObject: async (taskObject, options) => {
      const coreWorker = await createCoreWorker({ ...options, workerUrl: options.workerUrl });
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
  };
})(window);