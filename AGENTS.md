# AGENTS.md

ASCII glyph tiles drawn into a canvas to look like koi swimming behind a page. `src/` is shipped
as-is: there is no `package.json`, bundler, test suite, linter, or typechecker. Do not add one
unless asked. Keep `src/` directly browser-loadable (relative `.js` imports); the README's CDN
snippet loads `src/pond.js` from `@main`, so `main` is the version embedders load.

## Preview and verify

- ES modules do not work over `file://`. Serve the repo: `python3 -m http.server 8899`, then open
  `http://127.0.0.1:8899/` and `http://127.0.0.1:8899/examples/embed.html`.
- Verification is manual in a browser: console clean, dark/light switch, feeding, resize, mobile
  width, reduced motion. The template always mounts the food chain (three small species at random,
  a shark and one other big hunter — tuna or perch) plus two random wildcards; reload to see the
  others. Watch a catch: the hunter opens its jaw, ripples and a bite flash, then cruises off
  digesting while still eating pellets.
- `index.html` is a forkable one-page template that mounts into its own `<canvas id="pond">`, not
  the library entry point; the embeddable API is `src/pond.js` / `<ascii-pond>`
  (`examples/embed.html`).
- The template exposes `window.asciiPond` (the `mount()` result) and `window.asciiPondResidents`
  (species names picked this load) for console checks.
- `README.md` is Chinese; `README.en.md` is its English mirror. Update both when public options or
  behavior change.

## Layout

- `src/pond.js` — engine: `Pond` simulation, `PondRenderer`, palettes, `mount()`, custom element,
  content avoidance, input, theme reveal. Importing it also defines `<ascii-pond>` (side effect).
- `src/koi.js` — the signature species: behavior, 20-node spine, markings, per-cell drawing.
- `src/animals.js` — the other eight species and their shared drawing/steering helpers. `ANIMALS`
  is spread into `SPECIES` in `src/pond.js`; the helpers it exports are shared with `src/fish.js`.
- `src/fish.js` — sharks, tuna, perch and five small fish species (guppy, tetra, danio, platy,
  cory): hunting, digest cooldown, prey replacement, and the `FISH` map spread into `SPECIES`.
- `src/util.js` — shared math, deterministic noise, `compact()`.
- `index.html` — template shell: hash routes `#/pond`, `#/projects`, `#/blog`, page theme switch,
  localStorage. The theme wipe depends on `mount({ onFrame })` to recolor page text each frame.
- `examples/embed.html` — custom-element embed example.

## Architecture invariants

- The simulation is fixed-step at 120 Hz (`STEP = 1 / 120`); species `step()` always receives
  `dt = 1/120`. `speed` and reduced motion change how many steps accumulate, not `dt`. Water wake
  diffuses at `WAKE_STEP = 1/60`. Do not move motion into `requestAnimationFrame` callbacks or assume
  frame rate; the frame loop caps catch-up at `MAX_STEPS = 8` and drops the remaining accumulator.
- `feed()` throws 5–7 pellets around the click; `PELLET_MAX = 100` caps live pellets (further clicks
  only ripple).
- Species draw into `renderer.grid` arrays; the engine sorts creatures by `depth` (deep first) and
  paints cells. A species must not draw to the canvas directly.
- Species contract: `name`, `colors`, `seed`, `step`, `draw`; optional `grow` (runs 1.5 s after a
  resize settles, not on spawn), `wake`, `splash`, `floating`. `SPECIES` values are factories
  `(config) => species`; register with an import plus a `SPECIES` entry, or pass an already-built
  object through `species` (detected by the presence of `.step`). Add theme colors under
  `colors.dark` / `colors.light` without colliding with existing palette keys. `count` clamps to
  8 koi, 4 of most species, 2 sharks/tuna/perch, and 2 minnow schools (one school is one creature).
- `mount()` completes the food chain after resolving `species` (`completeFoodChain`): if the
  selection contains any fish (`prey` or `predator`), a missing `pool: "large"` or `pool: "small"`
  side is filled with the default `shark` / `guppy`. Non-fish ponds are untouched, so
  `species="duck,turtle,strider"` stays as written, while the default `koi` gains a shark and a guppy.
- Predation is tag-based. Only `predator` species hunt, only `prey` species can be eaten, and prey
  must be at most `preyRatio × hunter.length`; same-species cannibalism is blocked. A catch sets
  `gone` and pushes one replacement into `pond.spawnQueue`; the queue drains after creature steps
  so the list is never mutated mid-loop. `spawn(pond, offscreen)` must **push** the new creature
  into `pond.creatures` and start it off-screen when `offscreen` is true. Replacement pools are the
  selected species sharing the prey's `pool` (`small`: guppies, tetras, danios, platies, corys,
  minnows; `large`: sharks, tuna, perch), capped per species by `limit`, so the pond's head count
  stays constant. Hunters keep a random digest cooldown (`digestUntil`) after a catch: they ignore
  live prey but still eat pellets. Koi, minnows and the small fish are tagged prey and provide
  `spawn`; the small fish eat pellets only. `perch` is a smaller hunter that is itself prey, so the
  chain has three levels (shark → perch → small fish).
- Coordinates are CSS pixels; DPR is capped at 2. `measure()` maps DOM rects into canvas space and
  reruns every 30 frames, on scroll, and on resize. `[data-pond-avoid]` steers fish and blocks
  feeding; only its text line boxes fade. Boxes that are flush with a pond edge are stretched
  off-canvas so fish are pushed inward, not out. `[data-pond-ignore]`, links, buttons, and inputs
  never feed.
- Each palette's `page` and `bg` must approximate the host page background, or tiles show a color
  seam. The engine's theme reveal renders both palettes into live offscreen layers; the template
  recolors page text via `onFrame` and disables its CSS transition. New copy that should flip with
  the wipe must be added to both `THEME_TEXT` and the `:root[data-transition="theme"]` rule. Do not
  replace the reveal with View Transitions, whose snapshot freezes the fish.
- In `index.html` the pond canvas sits above the page (`#pond { z-index: 50; pointer-events: none }`)
  so the fish swim over the copy; during the wipe CSS drops it to `z-index: 10`, because the wipe's
  opaque page-colour circle must stay behind the text. Keep the canvas click-through.
- Preserve accessibility behavior: canvas is `aria-hidden`, forced-colors mode hides it, reduced
  motion slows the sim to 0.2x and skips the theme reveal, and touch input ripples instead of
  hovering.
- `step()` and `draw()` are hot loops over every creature/cell. Avoid per-step and per-cell
  allocations; reuse typed arrays, `compact()` for churn, and module-level scratch objects such as
  `PUSH`, `fins`, and `hit`.

## Style and repo notes

- Match the existing style: 2-space indent, double quotes, semicolons, compact helpers, English code
  comments. There is no formatter config.
- Commit messages use conventional prefixes with Chinese summaries, e.g. `fix(pond): …`.
- `.gitignore` reserves `/test/` and `/docs/` for local-only files; they are intentionally untracked.
