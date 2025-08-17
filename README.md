# WorkersFriend

A Web Worker utility library with a dual-API for effortless background task execution.

WorkersFriend helps you move complex, long-running JavaScript tasks off the main thread to prevent your web page from freezing. It’s designed to be simple enough for beginners while providing the power and flexibility that professionals need.

---

### 🚀 Core Concepts

WorkersFriend is built around two primary functions, each tailored for a different audience and use case:

* **For Beginners & Iterative Tasks:** `createLoopWorker` is inspired by the **Arduino `setup()` and `loop()`** model. It's perfect for tasks that run repeatedly, like simulations, calculations, or game loops. It provides a simple, opinionated API so you can get started with minimal boilerplate.

* **For Professionals & Custom Tasks:** `createCustomWorker` is for complex, on-demand tasks. It gives you full control by allowing you to define multiple custom functions within your worker and call them by name. This is the ideal choice for APIs, data processing, and other one-off operations.

---

### Getting Started

To use WorkersFriend, you need two files:

1.  `workersFriend.js` (The main library)
2.  `workersFriend.worker.js` (The worker script)

Include the main library in your HTML file:

```html
<script src="workersFriend.js"></script>
````

**Note:** The worker script is now loaded automatically by the library, so you no longer need to include it with a `<script>` tag.

-----

### 🧑‍🎓 Usage for Students: The `createLoopWorker` Approach

This method is for students and those who are new to Web Workers. It simplifies the process by handling the communication boilerplate for you.

```javascript
// A simple worker to calculate Pi (in workersFriend.worker.js)
self.onmessage = e => {
  const { action, payload } = e.data;
  if (action === 'start_loop_task') {
    const { id, iterations } = payload;
    let pi = 0;
    // Perform calculation...
    self.postMessage({ id, action: 'task:result', payload: { piValue: pi } });
  }
};

// In your main HTML file
const piWorker = await WorkersFriend.createLoopWorker('workersFriend.worker.js', {
  // Use a real worker, or set to false for in-page emulation (for debugging)
  useWorkerThread: true,
  // A callback for real-time progress updates from the worker
  onLiveProgress: msg => console.log(msg)
});

// Start the calculation
const { promise } = piWorker.call({ iterations: 500000 });
promise.then(result => {
  console.log(`Pi is approximately ${result.piValue}`);
});

// To stop the worker
piWorker.terminate();
```

-----

### 🧑‍💻 Usage for Professionals: The `createCustomWorker` Approach

This method is for professionals who need more control. You define your own actions in the worker and call them by name.

```javascript
// In your custom worker file (e.g., 'my-worker.js')
self.onmessage = e => {
  const { action, payload } = e.data;
  const { id } = payload;
  
  if (action === 'processImage') {
    // Process the image and post the result
    self.postMessage({ id, action: 'task:result', payload: processedImage });
  }
  // ...handle other actions
};

// In your main HTML file
const myWorker = await WorkersFriend.createCustomWorker('my-worker.js', {
  useWorkerThread: true
});

// Call a specific function in the worker by name
const { promise } = myWorker.call('processImage', { imageData: myImageData });
promise.then(result => {
  console.log('Image processed:', result);
});
```

-----

### API Reference

#### `WorkersFriend.createLoopWorker(taskUrl, options)`

  * **`taskUrl`**: The URL to the worker script file.
  * **`options`**: An object containing configuration options.
      * `useWorkerThread`: `true` to use a real Web Worker, `false` to use the in-page emulator.
      * `onLiveProgress`: A callback function for real-time progress updates from the worker.
      * `timeout`: The maximum time (in ms) to wait for a result before timing out.
  * **Returns**: An asynchronous promise that resolves to an object with `call` and `terminate` methods.

#### `WorkersFriend.createCustomWorker(taskUrl, options)`

  * **`taskUrl`**: The URL to the worker script file.
  * **`options`**: Same as `createLoopWorker` options.
  * **Returns**: An asynchronous promise that resolves to an object with `call` and `terminate` methods.

#### `worker.call(action, payload)`

  * **`action`**: (for `createCustomWorker` only) The name of the function to run in the worker.
  * **`payload`**: The data to pass to the worker function.
  * **Returns**: An object containing a `promise` and an `abortController`.

#### `worker.terminate()`

  * Stops the worker thread and cleans up resources.

-----

### ✨ Key Features

  * **In-Page Emulation:** Test and debug your worker code directly in the main thread with `useWorkerThread: false`. No more stepping into separate worker files\!
  * **Promise-Based API:** Write clean, modern asynchronous code with `async/await` and `.then()`.
  * **Cancellable Tasks:** Use the `abortController` to easily stop a running task, like when a user navigates away or presses a "cancel" button.
  * **Progress Events:** Get real-time updates from your worker to show progress bars or loading indicators.
  * **Production Ready:** The library is secure and compatible with modern web security policies (CSP) by avoiding `eval()`.

<!-- end list -->

```