# AGENTS.md

ASCII glyph tiles drawn into a canvas to look like koi swimming behind a page. `src/` is shipped
as-is: there is no `package.json`, bundler, test suite, linter, or typechecker. Do not add one
unless asked. Keep `src/` directly browser-loadable (relative `.js` imports); the README/CDN loads
`src/pond.js` with no build step.

## Preview and verify

- ES modules do not work over `file://`. Serve the repo: `python3 -m http.server 8899`, then open
  `http://127.0.0.1:8899/` and `http://127.0.0.1:8899/examples/embed.html`.
- Verification is manual in a browser: console clean, dark/light switch, feeding, resize, mobile
  width, reduced motion. The template picks five different species on every load; reload to see
  the others. There are no tests or build commands.
- `index.html` is a forkable one-page template, not the library entry point; the embeddable API is
  `src/pond.js`.
- The template exposes `window.asciiPond` (the `mount()` result) and `window.asciiPondResidents`
  (species names picked this load) for console checks.
- `README.md` is Chinese; `README.en.md` is its English mirror. Update both when public options or
  behavior change.

## Layout

- `src/pond.js` — engine: `Pond` simulation, `PondRenderer`, palettes, `mount()`, custom element,
  content avoidance, input, theme reveal. Importing it also defines `<ascii-pond>` (side effect).
- `src/koi.js` — the signature species: behavior, 20-node spine, markings, per-cell drawing.
- `src/animals.js` — the other eight species and their shared drawing/steering helpers. `ANIMALS`
  is spread into `SPECIES` in `src/pond.js`.
- `src/util.js` — shared math, deterministic noise, `compact()`.
- `index.html` — template shell: hash routes `#/pond`, `#/projects`, `#/blog`, page theme switch,
  localStorage. The theme wipe depends on `mount({ onFrame })` to recolor page text each frame.
- `examples/embed.html` — custom-element embed example.

## Architecture invariants

- The simulation is fixed-step at 120 Hz (`STEP = 1 / 120`); species `step()` always receives
  `dt = 1/120`. `speed` and reduced motion change how many steps accumulate, not `dt`. Water wake
  diffuses at 60 Hz. Do not move motion into `requestAnimationFrame` callbacks or assume frame rate.
- Species draw into `renderer.grid` arrays; the engine sorts creatures by `depth` (deep first) and
  paints cells. A species must not draw to the canvas directly.
- Species contract: `name`, `colors`, `seed`, `step`, `draw`; optional `grow` (runs 1.5 s after a
  resize settles, not on spawn), `wake`, `splash`, `floating`. Register by adding an import and a
  `SPECIES` entry in `src/pond.js`, or pass a species object through the `species` option. Add theme
  colors under `colors.dark` / `colors.light` without colliding with existing palette keys. `count`
  caps at 8 koi and 4 of any other species.
- Coordinates are CSS pixels; DPR is capped at 2. `measure()` maps DOM rects into canvas space and
  reruns every 30 frames, on scroll, and on resize. `[data-pond-avoid]` steers fish, fades text,
  and blocks feeding on text; `[data-pond-ignore]`, links, buttons, and inputs never feed.
- Each palette's `page` and `bg` must approximate the host page background, or tiles show a color
  seam. The engine's theme reveal renders both palettes into live offscreen layers; the template
  recolors page text via `onFrame`. Do not replace this with View Transitions, whose snapshot
  freezes the fish.
- Preserve accessibility behavior: canvas is `aria-hidden`, forced-colors mode hides it, reduced
  motion slows the sim to 0.2x, and touch input ripples instead of hovering.
- `step()` and `draw()` are hot loops over every creature/cell. Avoid per-step and per-cell
  allocations; reuse typed arrays, `compact()` for churn, and module-level scratch objects such as
  `PUSH`, `fins`, and `hit`.

## Style and repo notes

- Match the existing style: 2-space indent, double quotes, semicolons, compact helpers, English code
  comments. There is no formatter config.
- Commit messages use conventional prefixes with Chinese summaries, e.g. `fix(pond): …`.
- `.gitignore` reserves `/test/` and `/docs/` for local-only files; they are intentionally untracked.
