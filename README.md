# CalcInk Part 1 — UI, Digital Ink, and Frontend

Contains the canvas, drawing/input, interface, presentation, styling, and visual assets.

## Functionality
- Mouse, touch, and stylus input; pen/calligraphy stroke rendering
- High-DPI scaling, coordinate conversion, undo/redo, stroke and pixel erasing, clear canvas
- Stroke width/color, toolbar, FPS, settings/themes/templates, history, inline result projection
- Responsive layout and frontend state

## Files included
- index.html
- public/favicon.svg
- public/icons.svg
- src/App.css
- src/App.tsx
- src/assets/hero.png
- src/assets/react.svg
- src/assets/vite.svg
- src/canvasCoordinates.test.ts
- src/canvasCoordinates.ts
- src/FpsIndicator.tsx
- src/index.css
- src/main.tsx

## Roles and integration
- src/App.tsx owns drawing, canvas state, tools, settings/history, and result display; it dynamically calls Part 2's recognizeCanvasStrokes API with points, width, and style.
- src/App.css and src/index.css provide component and global layout/styles.
- src/canvasCoordinates.ts maps pointer coordinates to CSS-pixel canvas coordinates; its test remains alongside it.
- src/FpsIndicator.tsx owns the frame-rate display.
- src/main.tsx and index.html bootstrap the page and app.
- public and src/assets contain app imagery/icons; starter SVGs are currently unreferenced.

Recognition lives in Part 2. It filters eraser strokes, preprocesses the remaining ink in a worker, returns expression/result metadata, and Part 1 presents a current result beside the user's handwriting. Shared project configuration is in Part 2 once only. These are contribution snapshots, not standalone apps; restore both at the original paths to run CalcInk.
