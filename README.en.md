# ascii-pond

[简体中文](README.md) | English

Koi, sharks, ducks and turtles made of text characters swim behind your web page. Small fish nibble
the food you drop; sharks, tuna and perch hunt them. Move the mouse and the fish come over; click the
water to drop food. Plain JavaScript: no build step, no dependencies.

![The pond: dropping food, then switching to the light theme](demo.webp)

## Quick start

Add two lines to your page:

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/zhojielun/ascii-background@main/src/pond.js"></script>
<ascii-pond fixed></ascii-pond>
```

Now there's a pond behind the whole page. For a pond in one spot (say, a post header), drop
`fixed` and give it a height:

```html
<ascii-pond style="height: 320px"></ascii-pond>
```

Add `data-pond-avoid` to your content and the fish swim around it, fading out under the text so
it stays readable:

```html
<article data-pond-avoid>…</article>
```

To avoid the CDN, copy `src/` into your site and point `src` at it.

## Use the template

`index.html` is a ready-made one-page site: top nav, three pages, dark/light switch. Every reload
keeps a working food chain: two each of three kinds of small fish picked at random, a shark plus one
other big hunter (a tuna or a perch), and two other species at random. Fork the repo, change the title
and the text, done.

Preview it over http (ES modules don't load from a double-clicked file):

```sh
python3 -m http.server 8899
# template:      http://127.0.0.1:8899/
# embed example: http://127.0.0.1:8899/examples/embed.html
```

## Options

### Attributes

| Attribute | What it does |
|---|---|
| `fixed` | fill the window, as the page background |
| `theme` | `auto` (follow the system, default), `dark`, `light` |
| `count`, `young` | how many of each species; koi default by pond size, the rest to one. Caps: 8 koi, 4 of most species, 2 sharks/tuna/perch, 2 minnow schools |
| `species` | which creatures, comma-separated; default `koi`; available: `koi`, `duck`, `turtle`, `strider`, `frog`, `dragonfly`, `minnows`, `crayfish`, `newt`, `guppy`, `tetra`, `danio`, `platy`, `cory`, `shark`, `tuna`, `perch` |
| `avoid` | CSS selector for elements the fish swim around; default `[data-pond-avoid]` |
| `no-feed` | clicks don't drop food |

### From JavaScript

```js
import { mount } from "./src/pond.js";

const pond = mount(document.body, {
  theme: "auto",
  species: [{ type: "koi", count: 4, young: 1 }],
  palette: { dark: { page: [16, 16, 20] } },  // set to your page background
});

pond.feed(200, 150);            // drop food at (200, 150)
pond.setTheme(true, { x, y });  // switch to light, spreading out from (x, y)
pond.destroy();                 // remove the pond
```

`mount` takes a `<canvas>` or any element (it adds a canvas inside). Pass `document.body` and it
fills the page. It returns `{ pond, renderer, canvas, feed, setTheme, measure, destroy }`.

| Option | Default | What it does |
|---|---|---|
| `species` | `["koi"]` | as the attribute; also `{ type, count, young }` or a species object |
| `theme` | `"auto"` | as the attribute; after `setTheme()` it stops following the system |
| `avoid` | `"[data-pond-avoid]"` | as the attribute; `null` turns it off |
| `ignore` | links, buttons, inputs, `[data-pond-ignore]` | clicks here don't drop food |
| `feed` | `true` | click to drop food |
| `fixed` | on when mounted on `<body>` | fill the window |
| `speed` | `1` | swim speed; drops to 0.2× when the system asks for reduced motion |
| `palette` | `{}` | colour overrides; see `DARK` in `src/pond.js` for the keys |
| `onFrame` | | called after each frame |

The canvas is transparent and the tiles are blended toward `bg`, so set `page` and `bg` in
`palette` close to your page background, or the pond won't match the page.

### Built-in creatures

| Name | Creature | Notes |
|---|---|---|
| `koi` | koi | the default species, in `src/koi.js` |
| `duck` | duck / mandarin colouring | floats, dabbles for food |
| `turtle` | turtle | slow and deep, surfaces now and then |
| `strider` | water strider | skates and stops on the surface |
| `frog` | frog | sits, hops, splashes down |
| `dragonfly` | dragonfly | hovers, darts, dips at the water |
| `minnows` | minnow school | one creature drawn as a small school |
| `crayfish` | crayfish | scuttles along the bottom, claws out |
| `newt` | newt | swims slowly with a wagging tail |
| `guppy` | guppy | small fish, pellets only; a big spotted fan tail |
| `tetra` | neon tetra | small fish, pellets only; a bright blue flank |
| `danio` | zebra danio | small fish, pellets only; striped and quick |
| `platy` | platy | small fish, pellets only; orange, a dark blotch by the tail |
| `cory` | corydoras | small fish, pellets only; hugs the bottom, whiskers out |
| `shark` | shark | hunts anything it can swallow, then digests |
| `tuna` | tuna | fast hunter; a big shark can eat it too |
| `perch` | perch | a smaller hunter that chases the small fish, and a shark's meal |

```html
<ascii-pond species="duck,turtle,strider" count="1" young="0"></ascii-pond>
```

### The food chain

`shark`, `tuna` and `perch` are the hunters. They chase any selected species marked as prey that is
smaller than a share of their own length, so a large shark can eat tuna, perch, small koi and the
small fish, a tuna can take small fish and the smallest koi, and a perch only takes the small fish and
minnow schools — while a shark can eat the perch in turn. Koi, minnow schools and the small fish flee
when a hunter comes close.

After a catch the hunter is full for a random spell (a shark 20–36 s, a tuna 16–30 s, a perch 12–24 s):
it stops chasing live prey but still takes pellets. The eaten fish is replaced just off-screen by a
random species from the same pool (`small` for guppies, tetras, danios, platies, corys and minnow
schools; `large` for sharks, tuna and perch), so the pond's head count stays level. Per-species caps
still apply, so replacements cannot pile up one species. If you keep only one species in a pool, that
is what comes back.

To see the whole chain at once:

```html
<ascii-pond species="guppy,tetra,danio,shark,tuna,perch" count="2"></ascii-pond>
```

## Add a creature

Koi live in `src/koi.js`; the other species are in `src/animals.js`, and the fish in `src/fish.js`.
A species is an object with these functions:

```js
{
  name: "jellyfish",
  colors: { dark: { … }, light: { … } },  // extra colours it uses
  seed(pond) {},                           // create the first ones, push into pond.creatures
  step(pond, creature, dt) {},             // update one creature (120 times a second)
  draw(renderer, creature, time) {},       // draw it into renderer.grid
  prey: true,                              // optional: hunters may eat it
  predator: true,                          // optional: it hunts other prey
  pool: "small",                           // optional: what replaces it when eaten
  limit: 4,                                // optional: cap on replacements of this species
  spawn(pond, offscreen) {},               // optional: add one replacement, push into pond.creatures
  grow(pond) {},                           // optional: once a resize holds still 1.5 s, add or remove to suit
  wake(renderer, creature) {},             // optional: stir the water, renderer.stir(x, y, amount)
  splash(pond, pellet) {},                 // optional: food just hit the water
  floating(pond, pellet) {},               // optional: called on every update while food floats
}
```

Each creature needs `species` (this object) and `depth` (0 = bottom, 1 = surface; deeper ones
are drawn first); set `gone = true` on one to remove it after the step. Register it with `SPECIES.jellyfish = (config) => ({ … })`, or pass it straight
to the `species` option.

`prey` marks a species as edible and `predator` marks it as a threat: the built-in hunters chase
`prey` that is small enough, and koi, minnows and small fish flee anything tagged `predator` that is
larger than them. A custom hunter still has to chase and eat in its own `step`. Give an edible
species `spawn(pond, offscreen)` so a meal can be replaced: `spawn` must push a new creature into
`pond.creatures`, starting outside the pond when `offscreen` is true. Species with the same `pool`
share a replacement draw; `limit` keeps repeated replacements from piling up one species.

## How it works

- The simulation always runs 120 steps a second, so motion looks the same on 60 Hz and 144 Hz screens.
- Each koi is a 20-segment spine that follows its head. Every screen cell is checked against it
  (body, fin, eye or barbel) and drawn as a tile with a character on it. Markings stick to the
  body, so they bend with the fish.
- Each fish has its own temperament and switches between cruising, gliding, exploring, resting,
  rising and following another fish, with the odd sudden dash. Hungry fish fight over food;
  full ones can't be bothered.
- Now and then a fish startles at nothing and darts off, and its neighbours flinch. Dragging a
  finger across the water leaves ripples.
- A shark, tuna or perch that spots a smaller fish leads its target, accelerates, and lunges with its
  jaw open; the catch throws a ripple and a bite flash. Small fish scatter in a C-start, while the
  hunter cruises off to digest. Only the hunters eat animals, and the small fish, koi and minnow
  schools can be eaten — a perch can be hunted down as well.
- Ducks float and dabble, the turtle keeps to the bottom and surfaces now and then, the water
  strider skates, the frog hops, the dragonfly hovers then darts, the minnows circle, the crayfish
  scuttles with its claws up, and the newt swims with a wagging tail; the corydoras grazes the
  bottom, whiskers out.
- With reduced motion on, the fish swim slower and feeding still works. In forced-colours (high
  contrast) mode the pond is hidden.

## Files

| File | Contents |
|---|---|
| `src/pond.js` | engine: pond, water, rendering, theme switch, `mount()`, `<ascii-pond>` |
| `src/koi.js` | koi |
| `src/animals.js` | ducks, turtle, water strider, frog, dragonfly, minnows, crayfish, newt |
| `src/fish.js` | sharks, tuna, perch and the small fish; hunting, cooldown and replacement |
| `src/util.js` | shared maths |
| `index.html` | one-page template |
| `favicon.svg` | the template's tab icon |
| `demo.webp` | the demo animation in this README |
| `examples/embed.html` | embed example |
| `fonts/` | Geist Mono, used by the template |

Needs ES modules, custom elements and `ResizeObserver`; the template also uses CSS `color-mix()`.
Any mainstream browser from the last few years works.

## Thanks

Thanks to [stqfdyr/ascii-pond](https://github.com/stqfdyr/ascii-pond) for the pond engine, and to [stackedlol/ascii-sharks](https://github.com/stackedlol/ascii-sharks) for the inspiration.

## License

MIT, see [`LICENSE`](LICENSE). The bundled Geist Mono font is under the SIL OFL 1.1, see [`fonts/GEIST-LICENSE`](fonts/GEIST-LICENSE).
