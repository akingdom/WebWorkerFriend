# Web Worker Helper and Pi Calculation Demo

This project demonstrates a robust, reusable pattern for Web Workers, complete with in-page emulation, real-time progress reporting, optional console redirection, and cancellable tasks. It uses a Pi-calculation example to showcase how to keep the main thread responsive during CPU-intensive operations.

---

## Key Features

- Reusable Worker Helper  
  The `workersFriend.js` file provides a generic wrapper, exposing `WorkersFriend.createCoreWorker(...)` which returns a clean, promise-based API for RPC-style communication.

- In-Page Emulator Support  
  When you set `useWorkerThread: false`, the helper falls back to our `MainThreadWorkerEmulator`, mimicking a real `Worker` so you can debug without spawning a separate thread.

- Promise + AbortController Pattern  
  `call(...)` now returns an object `{ promise, abortController }`.  
  - `promise`: resolves with the task result or rejects on error/timeout  
  - `abortController`: an `{ id, aborted }` object you can set to `true` to cancel the task in-flight

- Optional Console Swizzling  
  Pass `enableConsoleSwizzling: true` and an `onSwizzledConsole(level, ...args)` callback to capture worker `console.log/warn/error` calls in the main thread.

- Real-Time Progress Updates  
  The worker sends periodic `progress` events back, which you can hook into via the `onProgress` callback to update a UI indicator.

---

## File Structure

- **index.html**  
  Contains the UI, the Pi-calculation task object, and orchestrates worker creation and result handling.  

- **workersFriend.js**  
  Implements:
  1. A deep-clone fallback (`cloneAny`) for structured-clone  
  2. `swizzleConsole` and `unswizzleConsole` helpers  
  3. An `Endpoint` class for uniform postMessage/eventListener management  
  4. The core factory `createCoreWorker(...)` with emulation, timeouts, cancellation, and RPC registry  
  5. **(Re-added)** `MainThreadWorkerEmulator` class for in-page emulation

---

## How to Use

1.  Clone or download both files (`index.html` and `workersFriend.js`) into the same folder.  

2.  Open `index.html` in a modern browser (Chrome, Firefox, Safari).  

3.  Click **Start Calculation**.  
    - Toggle **Debug in-emulator** to switch between a real Worker thread and the in-page emulator.  
    - The UI shows real-time progress and final Pi approximation.  

4.  (Optional) Add a **Cancel** button in your UI, and on click do:
    ```js
    abortController.aborted = true;
    ```
    to immediately stop the worker’s loop and free resources.

---

## API Overview

```js
const coreWorker = WorkersFriend.createCoreWorker(task, {
  useWorkerThread: true,           // default: true
  enableConsoleSwizzling: false,   // default: true
  onProgress: msg => { /* update UI */ },
  onSwizzledConsole: (lvl, ...args) => { /* capture worker logs */ },
  timeout: 30000                   // default timeout in ms
});

// call returns { promise, abortController }
const { promise, abortController } = coreWorker.call('start_task', {
  iterations: 1_000_000,
  isEmulated: !useWorkerThread
});

promise
  .then(result => { /* handle result */ })
  .catch(err => { /* handle error or timeout */ });

// cancel mid-flight:
abortController.aborted = true;

// terminate and clean up:
coreWorker.terminate();
```

Logging can be overridden per-instance via `options.logger`.

---

## Design Choices

- **Single-File Example**  
  Embeds worker logic in HTML for easy editing, without separate `.js` files.  

- **Endpoint Abstraction**  
  Wraps both real Workers and the emulator in a unified interface, handling deep-clone, event listeners, and URL revocation.  

- **Cancellation Model**  
  Uses a simple `{ aborted }` flag passed into the worker, checked on each loop iteration or time slice.  

- **Swizzled Console**  
  Allows capturing logs from inside the worker without polluting the main thread’s console.  

- **Progress-Driven UI**  
  Delivers regular progress callbacks so users see immediate feedback, preventing the “browser freeze” effect.

---

## By

- **Author/Director**: Andrew Kingdom  
- **AI Assist**: Google Gemini, Microsoft Copilot