Here is the `README.md` file for the `workersFriend` library, designed to serve both student and professional audiences.

-----

# WorkersFriend

A Web Worker utility library with a dual-API for effortless background task execution.

WorkersFriend helps you move complex, long-running JavaScript tasks off the main thread to prevent your web page from freezing. It’s designed to be simple enough for beginners while providing the power and flexibility that professionals need.

### 🚀 Core Concepts

WorkersFriend is built around two primary functions, each tailored for a different audience and use case:

  * **For Beginners & Iterative Tasks:** `createLoopWorker` is inspired by the **Arduino `setup()` and `loop()`** model. It's perfect for tasks that run repeatedly, like simulations, calculations, or game loops. It provides a simple, opinionated API so you can get started with minimal boilerplate.

  * **For Professionals & Custom Tasks:** `createCustomWorker` is for complex, on-demand tasks. It gives you full control by allowing you to define multiple custom functions within your worker and call them by name. This is the ideal choice for APIs, data processing, and other one-off operations.

-----

### Getting Started

To use WorkersFriend, you need two files:

1.  `workersFriend.js` (The main library)
2.  `workersFriend.worker.js` (The worker script)

Include them in your HTML file:

```html
<script src="workersFriend.js"></script>
<script src="workersFriend.worker.js"></script>
```

-----

### 🧑‍🎓 Usage for Students: The `createLoopWorker` Approach

This method is for students and those who are new to Web Workers. The mental model is simple: `setup` runs once, `loop` runs until the task is complete or cancelled, and `teardown` returns the final result.

Here's an example of a long-running Pi calculation:

```javascript
// 1. Define your loop-based task
const piTask = {
  setup: ({ iterations }) => ({ i: 0, totalIterations: iterations, pi: 0 }),
  loop: (state, onProgress) => {
    state.pi += 4 * Math.pow(-1, state.i) / (2 * state.i + 1);
    state.i++;
    if (state.i % 1000 === 0) onProgress(`Working... ${state.i} of ${state.totalIterations}`);
  },
  teardown: state => ({ piValue: state.pi })
};

// 2. Create the worker using the new function
const piWorker = WorkersFriend.createLoopWorker(piTask, {
  workerUrl: 'workersFriend.worker.js',
  onProgress: msg => console.log(msg),
  useWorkerThread: true
});

// 3. Call the worker and get the result
piWorker.call({ iterations: 500000 })
  .promise.then(result => {
    console.log('Pi calculation finished:', result.piValue);
  });
```

-----

### 👩‍💻 Usage for Professionals: The `createCustomWorker` Approach

This is for developers who need to define multiple functions for their worker. You can call any function by name, making the worker act like a custom API.

Here's an example of a worker that can build or validate text prompts for an AI model:

```javascript
// 1. Define your custom task object
const promptTask = {
  buildPrompt: ({ ingredients }) => {
    const prompt = ingredients.join(', ');
    return { builtPrompt: prompt };
  },
  validatePrompt: ({ text }) => {
    const isValid = text.length > 10; // Simple validation
    return { isValid };
  }
};

// 2. Create the custom worker
const customWorker = WorkersFriend.createCustomWorker(promptTask, {
  workerUrl: 'workersFriend.worker.js'
});

// 3. Call a specific function on the worker
customWorker.call('buildPrompt', {
  ingredients: ['A beautiful landscape', 'oil painting', 'sunset']
})
  .promise.then(result => {
    console.log('Built prompt:', result.builtPrompt);
  });

// 4. You can call another function on the same worker
customWorker.call('validatePrompt', { text: 'A short test' })
  .promise.then(result => {
    console.log('Is valid:', result.isValid);
  });
```

-----

### 📚 API Reference

#### `WorkersFriend.createLoopWorker(taskObject, options)`

  * **`taskObject`**: An object containing `setup`, `loop`, and `teardown` functions.
  * **`options`**: An object with configuration options.
      * `workerUrl`: The path to the `workersFriend.worker.js` file.
      * `useWorkerThread`: `true` to use a real worker, `false` to use the in-page emulator for debugging.
      * `onProgress`: A callback function for progress updates.
      * `timeout`: The maximum time to wait for a result before timing out.
  * **Returns**: An object with a `call` and `terminate` method.

#### `WorkersFriend.createCustomWorker(taskObject, options)`

  * **`taskObject`**: An object containing your custom functions.
  * **`options`**: Same as `createLoopWorker` options.
  * **Returns**: An object with a `call` and `terminate` method.

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
  * **Production Ready:** By avoiding the use of `new Function()`, the library is secure and compatible with modern web security policies (CSP).