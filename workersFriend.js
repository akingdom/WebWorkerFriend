// filename: workersFriend.js
window.versions={...(window.versions||{}), workersFriend:'1.0.3'};

(function(global) {
  'use strict';

  /**
   * @fileoverview A generic helper to create a Web Worker with a Promise-based API and optional console redirection.
   */

  /**
   * Creates and returns a wrapped Web Worker instance.
   * @param {string} workerCode The JavaScript code to be executed in the worker.
   * @param {boolean} [enableConsoleSwizzling=false] If true, redirects console logs from the worker to the main thread.
   * @param {function(string): void} [onProgress] An optional callback function to handle progress messages from the worker.
   * @returns {{call: (function(string, any): Promise<any>), terminate: (function(): void)}} An object with `call` and `terminate` methods.
   */
  function createCoreWorker(workerCode, enableConsoleSwizzling = false, onProgress = null) {
    let finalCode = workerCode;
    
    if (enableConsoleSwizzling) {
      const swizzleCode = `
        const originalConsole = {
          log: self.console.log,
          warn: self.console.warn,
          error: self.console.error,
        };
        self.console = {
          log: (...args) => {
            self.postMessage({ type: 'console:log', payload: args });
            originalConsole.log(...args);
          },
          warn: (...args) => {
            self.postMessage({ type: 'console:warn', payload: args });
            originalConsole.warn(...args);
          },
          error: (...args) => {
            self.postMessage({ type: 'console:error', payload: args });
            originalConsole.error(...args);
          },
        };
      `;
      finalCode = swizzleCode + workerCode;
    }

    const blob = new Blob([finalCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    const pending = new Map();

    worker.onmessage = ({ data }) => {
      const { id, type, payload, message, error } = data;
      const deferred = pending.get(id);

      if (type.startsWith('console:')) {
        const consoleType = type.split(':')[1];
        if (consoleType in console) {
          console[consoleType](...payload);
        }
        return;
      }
      
      // Handle progress messages separately
      if (type === 'progress' && onProgress) {
        onProgress(message);
        return;
      }

      if (!deferred) return;

      if (type.endsWith(':result')) {
        deferred.resolve(payload);
      } else if (type === 'error') {
        deferred.reject(new Error(error));
      }
      pending.delete(id);
    };

    return {
      call(type, data) {
        return new Promise((resolve, reject) => {
          const id = `${Date.now()}-${Math.random()}`;
          pending.set(id, { resolve, reject });
          worker.postMessage({ id, type, payload: data });
        });
      },
      terminate() {
        worker.terminate();
      },
    };
  }

  /**
   * Convenience helper to create a Web Worker from a script element in the DOM.
   * @param {string} elId The ID of the script element containing the worker's code.
   * @param {boolean} [enableConsoleSwizzling=false] If true, redirects console logs from the worker to the main thread.
   * @param {function(string): void} [onProgress] An optional callback function to handle progress messages from the worker.
   * @returns {{call: (function(string, any): Promise<any>), terminate: (function(): void)}} An object with `call` and `terminate` methods.
   */
  function createCoreWorkerFromId(elId, enableConsoleSwizzling = false, onProgress = null) {
      const workerScriptEl = document.getElementById(elId);
      if (!workerScriptEl) {
          throw new Error(`Script element with ID '${elId}' not found.`);
      }
      const workerScriptContent = workerScriptEl.textContent;
      return createCoreWorker(workerScriptContent, enableConsoleSwizzling, onProgress);
  }

  // Expose the public API to a global namespace
  global.WorkersFriend = {
    createCoreWorker,
    createCoreWorkerFromId
  };

})(window);