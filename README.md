# WorkersFriend

A Web Worker utility library with a dual-API for effortless background task execution.

WorkersFriend helps you move complex, long-running JavaScript tasks off the main thread to prevent your web page from freezing. It’s designed to be simple enough for beginners while providing the power and flexibility that professionals need.

-----

### 🚀 Core Concepts

WorkersFriend is built around two primary functions, each tailored for a different audience and use case:

  * **For Beginners & Iterative Tasks:** `createLoopWorkerFromObject` uses a **setup-loop-teardown** model. It's perfect for tasks that run repeatedly, like simulations, calculations, or game loops. It provides a simple, opinionated API so you can get started with minimal boilerplate.

  * **For Professionals & Custom Tasks:** `createCustomWorker` is for complex, on-demand tasks. It gives you full control by allowing you to define multiple custom functions within your worker and call them by name. This is the ideal choice for APIs, data processing, and other one-off operations.

-----

### ⚙️ Getting Started

To use WorkersFriend, you need two files:

1.  `workersFriend.js` (The main library)
2.  `workersFriend.worker.js` (The worker script)

To use the demo, you must serve the files from a web server. Web Workers cannot be loaded directly from the local file system (`file://` URLs) due to browser security restrictions. For this project structure, the `workersFriend.js`, `workersFriend.worker.js`, and `index.html` files should all be located in a `src` directory.

To include the scripts in your `index.html`, use the relative path:

```html
<script src="workersFriend.js"></script>
<script src="workersFriend.worker.js"></script>
```

If you don't have a server, here are some simple ways to run one locally:

1.  Open your terminal or command prompt and **navigate into the `src` directory** of your project.
2.  Start a simple server.
      * **Using Python (recommended):** If you have Python installed, the easiest way is with its built-in server.
        ```sh
        # For Python 3
        python -m http.server
        ```
        ```sh
        # For Python 2
        python -m SimpleHTTPServer
        ```
      * **Using Node.js:** If you have Node.js installed, you can use the `serve` package.
        ```sh
        # Install serve globally if you haven't already
        npm install -g serve
        # Then, run it in your directory
        serve
        ```
3.  Once the server is running, open your web browser and navigate to the address it provides (usually `http://localhost:8000`).

-----

### 🧑‍🎓 Usage for Students: The `createLoopWorkerFromObject` Approach

This method is for students and those who are new to Web Workers. It simplifies the process by handling the communication boilerplate for you.

You provide a single JavaScript object with three functions: `setup`, `loop`, and `teardown`.

```javascript
// In your main HTML file
const piTask = {
  setup: ({ iterations }) => {
    // This runs ONCE at the start.
    // Set up your initial state.
    return { i: 0, totalIterations: iterations, pi: 0 };
  },
  loop: state => {
    // This runs REPEATEDLY in a time-sliced loop.
    // Perform one step of your calculation.
    state.pi += 4 * Math.pow(-1, state.i) / (2 * state.i + 1);
    state.i++;
    return state; // Pass the updated state back.
  },
  teardown: state => {
    // This runs ONCE at the end.
    // Return your final result.
    return { piValue: state.pi };
  },
};

const piWorker = await WorkersFriend.createLoopWorkerFromObject(piTask, {
  // Use a real worker, or set to false for in-page emulation (for debugging)
  useWorkerThread: true,
  // A callback for real-time progress updates from the worker
  onLiveProgress: msg => console.log(msg)
});

// Start the calculation
const { promise } = piWorker.call({ iterations: 500000 });
promise.then(result => {
  console.log(`Pi is approximately ${result.piValue.toFixed(15)}`);
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

#### `WorkersFriend.createLoopWorkerFromObject(taskObject, options)`

  * **`taskObject`**: An object containing your `setup`, `loop`, and `teardown` functions.
  * **`options`**: An object containing configuration options.
      * `workerUrl`: The URL to the worker script file (`workersFriend.worker.js`).
      * `useWorkerThread`: `true` to use a real Web Worker, `false` to use the in-page emulator.
      * `onLiveProgress`: A callback function for real-time progress updates.
      * `timeout`: The maximum time (in ms) to wait for a result before timing out.
  * **Returns**: An asynchronous promise that resolves to an object with `call` and `terminate` methods.

#### `WorkersFriend.createCustomWorker(workerUrl, options)`

  * **`workerUrl`**: The URL to the worker script file.
  * **`options`**: Same as `createLoopWorkerFromObject` options.
  * **Returns**: An asynchronous promise that resolves to an object with a `call` and `terminate` method.

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
  * **Production Ready:** The library is secure and compatible with modern web security policies (CSP).