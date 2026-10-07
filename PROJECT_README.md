# CalcInk

CalcInk is a browser-based drawing canvas with pen and calligraphy tools, adjustable erasing, undo, redo, and handwritten arithmetic recognition for digits and basic operators. Recognition uses the CoMER ONNX models in `public/models` and runs locally in your browser. Results update automatically after a short pause in drawing; the toolbar button can trigger recognition immediately. The first recognition loads the model files, and later runs reuse the initialized model.

Start the app with:

```sh
npm install
npm run dev
```

Create a production build with `npm run build`, then preview it with `npm run preview`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the application architecture, data flows, boundaries, and offline behavior.

See [docs/MODEL_SELECTION.txt](docs/MODEL_SELECTION.txt) for the pre-trained model rationale, size and accuracy evidence, and alternative assessment.

Production browser builds cache the application, fonts, model files, and ONNX WebAssembly runtime for offline use after the first online visit and successful cache setup. The initial visit needs a network connection. Android builds package their web assets with the app and do not create a second browser cache.
