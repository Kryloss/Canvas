# GymCanvas (Canvas-Only PWA)

A borderless, canvas-rendered gym planner that works great on iPhone (15 Pro Max and others), tablets, and desktop.

- Full-canvas UI (no DOM widgets on screen; only hidden file input for image upload)
- Tabs: Weeks • Planning • Nutrition
- Draggable workout blocks with checkmarks and expandable exercises
- Add your own exercise images or use built-in icons (biceps, pull-ups, dumbbells, legs)
- Nutrition tracker with calories, protein, fat, carbs and daily history
- Presets that can auto-apply to the current week or generate future weeks
- Auto-save to `localStorage`
- Installable PWA with offline cache via service worker

## One-click deploy (GitHub Pages)
1. Create a new GitHub repo, e.g., `gymcanvas`.
2. Upload the files in this zip (or drag-and-drop the folder).
3. In **Settings → Pages**, set:
   - **Source**: Deploy from a branch
   - **Branch**: `main` (or `master`) → `/root` and **Save**.
4. Wait for the site to build. Your site URL will look like `https://<username>.github.io/gymcanvas/`.
5. Open on your iPhone in Safari, tap share → **Add to Home Screen** for borderless mode.

## Local run
Just open `index.html` (or serve with any static server).

## Notes
- Data persists locally on-device. For cross-device sync you’d need a small cloud backend (not included).
- iOS: For the best experience, **Add to Home Screen**. That enables standalone mode and hides the browser UI.
