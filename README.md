# Web Worker Helper and Pi Calculation Demo

This project demonstrates a robust and reusable pattern for using Web Workers. It addresses common challenges like debugging, communication, and providing real-time progress updates for long-running CPU-intensive tasks.

## Key Features

- **Reusable Worker Helper:** The `workersFriend.js` file provides a generic wrapper for Web Workers, simplifying the API to a clean, Promise-based `call()` method.
- **Optional Console Redirection:** The `createCoreWorker` function now accepts an optional boolean flag, `enableConsoleSwizzling`. When `true`, it redirects all `console.log`, `console.warn`, and `console.error` calls from the worker to the main thread's console. This makes debugging much easier in browsers where worker logging is not straightforward. When `false` (the default), the worker's console output behaves as normal.
- **Progress Reporting:** The worker's task is a long-running Pi calculation, and it sends real-time progress updates back to the main thread, which are used to update a UI element.
- **Easy to Use:** The worker's core logic is kept in a `<script>` tag within the main HTML file, making it easy to edit and debug the code without managing a separate `.js` file for the worker itself.

## File Structure

- `index.html`: The main page that sets up the UI and orchestrates the worker's task. It contains the worker's business logic in a `<script>` tag.
- `workersFriend.js`: A reusable JavaScript file that provides the `WorkersFriend` global namespace, containing the functions to create the worker.

## How to Use

1.  **Clone or Download:** Get the two files (`index.html` and `workersFriend.js`) into a single directory.
2.  **Open in Browser:** Open `index.html` directly in a modern web browser (e.g., Chrome, Firefox, Safari).
3.  **Inspect:** Open the Developer Tools (F12 or Cmd+Opt+I) and navigate to the Console tab to see the redirected worker logs and the progress updates. The UI on the page will also update in real-time.

## Design Choices

- **Pi Calculation:** The project uses a Pi calculation algorithm as a stand-in for any long-running, CPU-intensive task. This is a classic example for demonstrating the value of Web Workers, as it keeps the main thread from freezing while the heavy lifting is done in the background.
- **Worker Code in HTML:** Keeping the worker's logic in an in-page `<script>` tag with `type="text/javascript"` allows for a single-file, self-contained example. It's a pragmatic choice for small to medium-sized worker tasks where the convenience of a single file outweighs the modularity of a separate `.js` file.
- **`type="text/javascript"`:** While `text/worker` is often used to prevent accidental execution, using `text/javascript` ensures that code editors and linters correctly parse and validate the worker's script, providing syntax highlighting and error checking.
- **Plain JavaScript:** The `workersFriend.js` file uses a self-executing anonymous function (IIFE) to create a global `WorkersFriend` namespace. This avoids using ES modules (`import/export`), making the code highly compatible and easier to use in simple web projects without needing a bundler or a development server.
- **Decoupled Worker Helper:** The `createCoreWorker` function is placed in its own file to demonstrate a reusable pattern. It can be imported and used in any project that needs a robust, promise-based worker interface. It's not tied to an `id` on an HTML element, making it highly flexible.

## By

- **Author/Director**: Andrew Kingdom
- **AI Assist**: Google Gemini
