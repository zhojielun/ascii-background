// The rest of the pond: ducks, turtles, water striders, frogs, dragonflies,
// minnow schools, crayfish and newts. Each one is a species for pond.js.
import {
  TAU, clamp, rand, angleDiff, shade, packRgb, hash3, lineGlyph, repel, compact,
} from "./util.js";

// ─── shared helpers ─────────────────────────────────────────────────────────
const PUSH = { x: 0, y: 0 };
/** A guard against a stray count="Infinity" in markup. */
const MAX_COUNT = 4;

function countOf(config = {}, cap = MAX_COUNT) {
  const n = Number(config.count);
  return Number.isFinite(n) ? clamp(Math.round(n), 0, cap) : 1;
}

function spawnAt(pond, depth, margin = 0.12) {
  const W = pond.width, H = pond.height;
  return {
    x: rand(W * margin, W * (1 - margin)),
    y: rand(H * margin, H * (1 - margin)),
    heading: rand(0, TAU),
    depth,
    phase: rand(0, TAU),
    wander: 0,
  };
}

function seedSpecies(pond, species, make, config, cap = MAX_COUNT) {
  for (let i = 0, n = countOf(config, cap); i < n; i++) pond.creatures.push(make(pond, species));
}

function growSpecies(pond, species, make, config, cap = MAX_COUNT) {
  let have = 0;
  for (const c of pond.creatures) if (c.species === species) have++;
  for (let i = have, n = countOf(config, cap); i < n; i++) pond.creatures.push(make(pond, species));
}

/** Write one cell. Draw order is depth order, so later species deliberately win. */
function paint(r, i, glyph, color, alpha, tile = null, tileAlpha = 0) {
  if (!glyph && tileAlpha <= 0) return;
  let code = glyph ? (typeof glyph === "number" ? glyph : glyph.charCodeAt(0)) : 0;
  if (tileAlpha > 0 && !code) code = 32;
  if (code) r.grid.glyph[i] = code;
  if (tileAlpha > 0) {
    r.grid.tile[i] = packRgb(tile);
    r.grid.tileAlpha[i] = tileAlpha;
  }
  if (color) {
    r.grid.color[i] = packRgb(color);
    r.grid.alpha[i] = alpha;
  }
}

function put(r, x, y, glyph, color, alpha, tile = null, tileAlpha = 0) {
  const i = r.cellIndex(x, y);
  if (i >= 0) paint(r, i, glyph, color, alpha, tile, tileAlpha);
}

/**
 * Walk the cells of an ellipse and hand each one (u, v, q): u along `angle`,
 * v across it, q the normalised radius. Used for heads, shells and bodies.
 */
function ellipse(r, cx, cy, rx, ry, angle, visit) {
  const { cellW: cw, cellH: ch, cols, rows } = r;
  // Grow by half a cell: a cell counts when the ellipse touches it, not only when it covers its centre.
  // Without this, thin shapes (a newt's body, a claw) break into disconnected tiles.
  const ex = rx + cw * 0.5, ey = ry + ch * 0.5;
  const reach = Math.max(rx, ry) + Math.max(cw, ch) * 0.5;
  const c0 = clamp(Math.floor((cx - reach) / cw), 0, cols - 1);
  const c1 = clamp(Math.floor((cx + reach) / cw), 0, cols - 1);
  const r0 = clamp(Math.floor((cy - reach) / ch), 0, rows - 1);
  const r1 = clamp(Math.floor((cy + reach) / ch), 0, rows - 1);
  const cs = Math.cos(angle), sn = Math.sin(angle);
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const x = col * cw + cw / 2, y = row * ch + ch / 2;
      const dx = x - cx, dy = y - cy;
      const u = dx * cs + dy * sn, v = -dx * sn + dy * cs;
      const q = (u / ex) ** 2 + (v / ey) ** 2;
      if (q <= 1) visit(r, row * cols + col, u, v, q, x, y);
    }
  }
}

function ellipseShadow(r, cx, cy, rx, ry, angle) {
  ellipse(r, cx, cy, rx, ry, angle, (rr, i) => {
    if (!rr.grid.glyph[i]) rr.grid.shadow[i] = 1;
  });
}

/** A line of glyphs, each angled to the line. */
function line(r, x0, y0, x1, y1, color, alpha, glyph = null) {
  const dx = x1 - x0, dy = y1 - y0;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / Math.min(r.cellW, r.cellH)));
  const g = glyph || lineGlyph(dx, dy);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    put(r, x0 + dx * t, y0 + dy * t, g, color, alpha);
  }
}

/** One step of wandering, food seeking and steering around content and walls. */
function swim(pond, c, dt, o = {}) {
  const speed = o.speed ?? c.speed;
  const turn = o.turn ?? 2;
  const wander = o.wander ?? 0.5;
  const margin = Math.max(1, o.margin ?? 40);
  const avoid = o.avoid ?? 80;
  c.wander = clamp((c.wander || 0) + (Math.random() - 0.5) * 2.6 * dt, -0.8, 0.8);
  let dx = Math.cos(c.heading) + Math.cos(c.heading + c.wander) * wander;
  let dy = Math.sin(c.heading) + Math.sin(c.heading + c.wander) * wander;
  if (o.goal) {
    const gx = o.goal.x - c.x, gy = o.goal.y - c.y, d = Math.hypot(gx, gy) || 1;
    if (d > 5) { dx += (gx / d) * 2.2; dy += (gy / d) * 2.2; }
  }
  const W = pond.width, H = pond.height;
  const ex = Math.max(0, margin - c.x) - Math.max(0, c.x - (W - margin));
  const ey = Math.max(0, margin - c.y) - Math.max(0, c.y - (H - margin));
  dx += ex / margin; dy += ey / margin;
  if (avoid > 0 && pond.avoid.length) {
    repel(pond.avoid, c.x, c.y, avoid, PUSH);
    dx += PUSH.x * 1.4; dy += PUSH.y * 1.4;
  }
  const desired = Math.atan2(dy, dx);
  c.heading += clamp(angleDiff(c.heading, desired), -turn * dt, turn * dt);
  c.x = clamp(c.x + Math.cos(c.heading) * speed * dt, 4, W - 4);
  c.y = clamp(c.y + Math.sin(c.heading) * speed * dt, 4, H - 4);
  c.phase += dt * (1 + speed / 80);
}

function nearestPellet(pond, x, y, range) {
  let best = null, bestD = range * range;
  for (const p of pond.pellets) {
    if (!p.landed) continue;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

function ripple(pond, x, y, strength = 0.3) {
  pond.ripples.push({ x, y, born: pond.time, strength });
}

function eat(pond, x, y, radius) {
  let ate = false;
  compact(pond.pellets, (p) => {
    if (!p.landed) return true;
    if ((p.x - x) ** 2 + (p.y - y) ** 2 > radius * radius) return true;
    ate = true;
    return false;
  });
  if (ate) {
    ripple(pond, x, y, 0.45);
    pond.bites.push({ x, y, born: pond.time });
  }
  return ate;
}

/** A head or beak pointing along (cs, sn), as a glyph that matches the direction. */
function arrowGlyph(cs, sn) {
  if (Math.abs(cs) >= Math.abs(sn)) return cs >= 0 ? ">" : "<";
  return sn >= 0 ? "v" : "^";
}

// ─── colours ────────────────────────────────────────────────────────────────
// Prefixed keys, merged into the pond palette only when that species is present.
const COLORS = {
  duck: {
    dark: {
      duckBody: [188, 154, 116], duckHead: [58, 122, 100], duckWing: [104, 78, 58],
      duckBeak: [234, 154, 58], duckTail: [228, 220, 208], duckEye: [18, 18, 24],
      duckMark: [206, 112, 66],
    },
    light: {
      duckBody: [154, 118, 78], duckHead: [36, 86, 70], duckWing: [92, 64, 44],
      duckBeak: [188, 98, 36], duckTail: [128, 110, 90], duckEye: [24, 22, 26],
      duckMark: [180, 74, 38],
    },
  },
  turtle: {
    dark: {
      turtleShell: [82, 92, 58], turtlePattern: [166, 150, 96], turtleSkin: [122, 132, 88],
      turtleEye: [18, 18, 22],
    },
    light: {
      turtleShell: [72, 82, 52], turtlePattern: [132, 118, 74], turtleSkin: [96, 108, 72],
      turtleEye: [24, 22, 24],
    },
  },
  strider: {
    dark: {
      striderBody: [168, 162, 140], striderLeg: [126, 122, 106], striderEye: [18, 18, 22],
    },
    light: {
      striderBody: [62, 60, 54], striderLeg: [92, 90, 80], striderEye: [24, 22, 24],
    },
  },
  frog: {
    dark: {
      frogBody: [88, 148, 74], frogSpot: [50, 88, 44], frogBelly: [174, 196, 116],
      frogLeg: [70, 124, 62], frogEye: [238, 202, 74], frogPupil: [22, 24, 18],
    },
    light: {
      frogBody: [58, 112, 52], frogSpot: [34, 70, 34], frogBelly: [132, 156, 88],
      frogLeg: [48, 96, 46], frogEye: [182, 132, 34], frogPupil: [24, 22, 18],
    },
  },
  dragonfly: {
    dark: {
      dragonBody: [84, 164, 188], dragonWing: [196, 222, 220], dragonEye: [234, 92, 62],
    },
    light: {
      dragonBody: [38, 116, 140], dragonWing: [116, 156, 156], dragonEye: [188, 58, 38],
    },
  },
  minnows: {
    dark: {
      minnowBody: [178, 198, 188], minnowStripe: [94, 122, 124], minnowEye: [18, 18, 22],
    },
    light: {
      minnowBody: [104, 126, 128], minnowStripe: [54, 76, 80], minnowEye: [24, 22, 26],
    },
  },
  crayfish: {
    dark: {
      crayfishShell: [172, 72, 48], crayfishClaw: [206, 98, 60], crayfishLeg: [138, 56, 38],
      crayfishEye: [18, 18, 22],
    },
    light: {
      crayfishShell: [144, 54, 34], crayfishClaw: [178, 74, 42], crayfishLeg: [112, 42, 28],
      crayfishEye: [24, 22, 24],
    },
  },
  newt: {
    dark: {
      newtBody: [98, 114, 60], newtBelly: [210, 140, 54], newtLeg: [82, 96, 50],
      newtEye: [18, 18, 22],
    },
    light: {
      newtBody: [72, 88, 44], newtBelly: [170, 104, 36], newtLeg: [58, 72, 38],
      newtEye: [24, 22, 24],
    },
  },
};

// ─── duck (mallard / mandarin colouring) ────────────────────────────────────
function spawnDuck(pond, species) {
  const d = {
    species, id: pond.nextId++,
    ...spawnAt(pond, 0.92, 0.1),
    length: clamp(Math.min(pond.width, pond.height) * 0.2, 62, 116),
    speed: rand(18, 28),
    nextRipple: 0,
    dabble: 0,
    goal: null,
    mark: Math.random() < 0.55,
  };
  d.cruise = d.speed;
  return d;
}

function stepDuck(pond, d, dt) {
  const t = pond.time;
  d.goal = null;
  if (d.dabble > 0) {
    d.dabble -= dt;
    if (d.dabble <= 0) { d.dabble = 0; d.speed = d.cruise; }
    return;
  }

  const food = nearestPellet(pond, d.x, d.y, 240);
  if (food) {
    const dist = Math.hypot(food.x - d.x, food.y - d.y);
    if (dist < d.length * 0.55) {
      d.dabble = rand(0.7, 1.5);
      d.speed = 0;
      ripple(pond, d.x, d.y, 0.28);
      eat(pond, d.x, d.y, d.length * 0.62);
    } else {
      d.goal = food;
    }
  }
  swim(pond, d, dt, {
    speed: d.cruise, goal: d.goal, turn: 1.2, wander: 0.35,
    avoid: d.length * 0.8, margin: d.length * 0.5,
  });
  if (t > d.nextRipple) {
    const x = d.x - Math.cos(d.heading) * d.length * 0.45;
    const y = d.y - Math.sin(d.heading) * d.length * 0.45;
    ripple(pond, x, y, 0.16);
    d.nextRipple = t + rand(1.8, 3.4);
  }
}

function drawDuck(r, d) {
  const P = r.palette, L = d.length;
  const at = (u, v) => [
    d.x + Math.cos(d.heading) * u - Math.sin(d.heading) * v,
    d.y + Math.sin(d.heading) * u + Math.cos(d.heading) * v,
  ];

  const [sx, sy] = at(-L * 0.03, L * 0.1);
  ellipseShadow(r, sx + L * 0.04, sy + L * 0.06, L * 0.4, L * 0.27, d.heading);

  const [bx, by] = at(-L * 0.03, 0);
  ellipse(r, bx, by, L * 0.4, L * 0.25, d.heading, (rr, i, u, v, q) => {
    const key = hash3(Math.round(u / rr.cellW), Math.round(v / rr.cellH), d.id);
    const mark = d.mark && q > 0.45 && u < L * 0.1 && u > -L * 0.34;
    const col = mark ? P.duckMark : P.duckBody;
    paint(rr, i, mark ? "%" : ",;~"[key % 3], shade(col, 0.55), P.alpha * 0.9,
      col, P.alpha * 0.72);
  });

  for (const side of [-1, 1]) {
    const [wx, wy] = at(-L * 0.08, side * L * 0.16);
    ellipse(r, wx, wy, L * 0.2, L * 0.07, d.heading, (rr, i) => {
      paint(rr, i, side < 0 ? "/" : "\\", shade(P.duckWing, 0.72), P.alpha * 0.85,
        P.duckWing, P.alpha * 0.6);
    });
  }

  const tailSide = d.dabble > 0 ? 1 : -1;
  for (const v of [-L * 0.03, 0, L * 0.03]) {
    const [tx, ty] = at(tailSide * L * 0.42, v);
    put(r, tx, ty, "~", P.duckTail, P.alpha * 0.9);
  }

  if (d.dabble <= 0) {
    const [hx, hy] = at(L * 0.33, 0);
    ellipse(r, hx, hy, L * 0.16, L * 0.15, d.heading, (rr, i, u, v) => {
      const key = hash3(Math.round(u / rr.cellW), Math.round(v / rr.cellH), d.id + 5);
      paint(rr, i, key % 4 === 0 ? "o" : "@", shade(P.duckHead, 0.62), P.alpha,
        P.duckHead, P.alpha * 0.8);
    });
    for (const side of [-1, 1]) {
      const [ex, ey] = at(L * 0.36, side * L * 0.07);
      put(r, ex, ey, "o", P.duckEye, P.alpha);
    }
    const [beakX, beakY] = at(L * 0.49, 0);
    put(r, beakX, beakY, arrowGlyph(Math.cos(d.heading), Math.sin(d.heading)), P.duckBeak, P.alpha);
  }
}

function wakeDuck(r, d) {
  if (d.dabble > 0) return;
  const x = d.x - Math.cos(d.heading) * d.length * 0.45;
  const y = d.y - Math.sin(d.heading) * d.length * 0.45;
  r.stir(x, y, 0.035 + d.speed * 0.0012);
}

export function duck(config = {}) {
  const species = {
    name: "duck",
    colors: COLORS.duck,
    seed: (pond) => seedSpecies(pond, species, spawnDuck, config),
    grow: (pond) => growSpecies(pond, species, spawnDuck, config),
    step: stepDuck,
    draw: drawDuck,
    wake: wakeDuck,
  };
  return species;
}

// ─── turtle ─────────────────────────────────────────────────────────────────
function spawnTurtle(pond, species) {
  return {
    species, id: pond.nextId++,
    ...spawnAt(pond, 0.12, 0.15),
    length: clamp(Math.min(pond.width, pond.height) * 0.16, 54, 96),
    speed: rand(9, 15),
    nextSurface: pond.time + rand(6, 15),
  };
}

function stepTurtle(pond, d, dt) {
  const t = pond.time;
  const food = nearestPellet(pond, d.x, d.y, 190);
  if (food) {
    const dist = Math.hypot(food.x - d.x, food.y - d.y);
    if (dist < d.length * 0.5) eat(pond, d.x, d.y, d.length * 0.55);
  }
  if (t > d.nextSurface) {
    d.depth = d.depth < 0.5 ? 0.7 : 0.12;
    d.nextSurface = t + rand(8, 18);
  }
  swim(pond, d, dt, {
    speed: d.speed, goal: food, turn: 0.8, wander: 0.2,
    avoid: d.length * 0.9, margin: d.length * 0.6,
  });
}

function drawTurtle(r, d) {
  const P = r.palette, L = d.length;
  const at = (u, v) => [
    d.x + Math.cos(d.heading) * u - Math.sin(d.heading) * v,
    d.y + Math.sin(d.heading) * u + Math.cos(d.heading) * v,
  ];

  const [sx, sy] = at(L * 0.02, L * 0.1);
  ellipseShadow(r, sx + L * 0.08, sy + L * 0.1, L * 0.5, L * 0.36, d.heading);

  const [cx, cy] = at(0, 0);
  ellipse(r, cx, cy, L * 0.48, L * 0.35, d.heading, (rr, i, u, v, q) => {
    const angle = Math.atan2(v, u);
    const pattern = Math.abs(Math.sin(angle * 3 + q * 7)) < 0.2 ||
      hash3(Math.round(u / rr.cellW), Math.round(v / rr.cellH), d.id) > 0.78;
    const col = pattern ? P.turtlePattern : P.turtleShell;
    paint(rr, i, pattern ? "%" : "@", shade(col, 0.58), P.alpha * 0.92,
      col, P.alpha * 0.74);
  });

  for (const side of [-1, 1]) {
    const [fx, fy] = at(L * 0.18, side * L * 0.25);
    const [tx, ty] = at(L * 0.32, side * L * 0.5);
    line(r, fx, fy, tx, ty, P.turtleSkin, P.alpha * 0.8);
    const [bx, by] = at(-L * 0.2, side * L * 0.25);
    const [ex, ey] = at(-L * 0.34, side * L * 0.48);
    line(r, bx, by, ex, ey, P.turtleSkin, P.alpha * 0.75);
  }

  const [hx, hy] = at(L * 0.52, 0);
  ellipse(r, hx, hy, L * 0.12, L * 0.1, d.heading, (rr, i) => {
    paint(rr, i, "@", shade(P.turtleSkin, 0.6), P.alpha, P.turtleSkin, P.alpha * 0.7);
  });
  for (const side of [-1, 1]) {
    const [ex, ey] = at(L * 0.55, side * L * 0.055);
    put(r, ex, ey, "o", P.turtleEye, P.alpha);
  }
  const [tx, ty] = at(-L * 0.5, 0);
  put(r, tx, ty, "~", P.turtleSkin, P.alpha * 0.9);
}

function wakeTurtle(r, d) {
  r.stir(d.x - Math.cos(d.heading) * d.length * 0.4,
    d.y - Math.sin(d.heading) * d.length * 0.4, 0.02);
}

export function turtle(config = {}) {
  const species = {
    name: "turtle",
    colors: COLORS.turtle,
    seed: (pond) => seedSpecies(pond, species, spawnTurtle, config),
    grow: (pond) => growSpecies(pond, species, spawnTurtle, config),
    step: stepTurtle,
    draw: drawTurtle,
    wake: wakeTurtle,
  };
  return species;
}

// ─── water strider ──────────────────────────────────────────────────────────
function spawnStrider(pond, species) {
  return {
    species, id: pond.nextId++,
    ...spawnAt(pond, 0.99, 0.1),
    length: rand(30, 42),
    speed: rand(75, 120),
    pauseUntil: 0,
    nextPause: pond.time + rand(1, 4),
    nextRipple: 0,
  };
}

function stepStrider(pond, d, dt) {
  const t = pond.time;
  if (t < d.pauseUntil) return;
  if (t > d.nextPause) {
    d.pauseUntil = t + rand(0.25, 1.1);
    d.nextPause = t + rand(2, 5);
    return;
  }

  const p = pond.pointer;
  if (p.active) {
    const dx = d.x - p.x, dy = d.y - p.y, dist = Math.hypot(dx, dy);
    if (dist < 95 && dist > 1) {
      d.heading = Math.atan2(dy, dx);
      d.pauseUntil = t + 0.18;
    }
  }

  swim(pond, d, dt, { speed: d.speed, turn: 4.5, wander: 0.22, avoid: 45, margin: 22 });
  if (t > d.nextRipple) {
    ripple(pond, d.x, d.y, 0.13);
    d.nextRipple = t + rand(0.7, 1.8);
  }
}

function drawStrider(r, d) {
  const P = r.palette, L = d.length;
  const at = (u, v) => [
    d.x + Math.cos(d.heading) * u - Math.sin(d.heading) * v,
    d.y + Math.sin(d.heading) * u + Math.cos(d.heading) * v,
  ];

  const [sx, sy] = at(L * 0.05, L * 0.08);
  ellipseShadow(r, sx, sy, L * 0.24, L * 0.1, d.heading);

  const legs = [
    [0.12, 0.05, 0.85, 0.85], [0.12, -0.05, 0.85, -0.85],
    [0.02, 0.05, 0.1, 1.2], [0.02, -0.05, 0.1, -1.2],
    [-0.14, 0.05, -0.7, 0.95], [-0.14, -0.05, -0.7, -0.95],
  ];
  for (const [u0, v0, u1, v1] of legs) {
    const [x0, y0] = at(u0 * L, v0 * L);
    const [x1, y1] = at(u1 * L, v1 * L);
    line(r, x0, y0, x1, y1, P.striderLeg, P.alpha * 0.8);
  }

  const [ax, ay] = at(-L * 0.2, 0);
  ellipse(r, ax, ay, L * 0.36, L * 0.1, d.heading, (rr, i) => {
    paint(rr, i, "-", shade(P.striderBody, 0.62), P.alpha * 0.95, P.striderBody, P.alpha * 0.7);
  });
  const [bx, by] = at(L * 0.13, 0);
  ellipse(r, bx, by, L * 0.15, L * 0.11, d.heading, (rr, i) => {
    paint(rr, i, "o", shade(P.striderBody, 0.6), P.alpha, P.striderBody, P.alpha * 0.75);
  });
  const [hx, hy] = at(L * 0.32, 0);
  put(r, hx, hy, "o", P.striderEye, P.alpha);
  for (const side of [-1, 1]) {
    const [ex, ey] = at(L * 0.34, side * L * 0.07);
    put(r, ex, ey, "o", P.striderEye, P.alpha);
  }
}

function wakeStrider(r, d) {
  r.stir(d.x, d.y, 0.03);
}

export function strider(config = {}) {
  const species = {
    name: "strider",
    colors: COLORS.strider,
    seed: (pond) => seedSpecies(pond, species, spawnStrider, config),
    grow: (pond) => growSpecies(pond, species, spawnStrider, config),
    step: stepStrider,
    draw: drawStrider,
    wake: wakeStrider,
  };
  return species;
}

// ─── frog ───────────────────────────────────────────────────────────────────
function spawnFrog(pond, species) {
  return {
    species, id: pond.nextId++,
    ...spawnAt(pond, 0.72, 0.12),
    length: rand(44, 62),
    speed: 0,
    hop: 0,
    hopStart: 0,
    hopDur: 0,
    hopH: 0,
    fromX: 0, fromY: 0, toX: 0, toY: 0,
    z: 0,
    nextHop: pond.time + rand(2, 6),
    cooldown: 0,
  };
}

function startHop(pond, d, x, y) {
  const W = pond.width, H = pond.height;
  d.fromX = d.x; d.fromY = d.y;
  d.toX = clamp(x, 30, W - 30);
  d.toY = clamp(y, 30, H - 30);
  const dist = Math.hypot(d.toX - d.fromX, d.toY - d.fromY);
  if (dist > 2) d.heading = Math.atan2(d.toY - d.fromY, d.toX - d.fromX);
  d.hop = 1;
  d.hopStart = pond.time;
  d.hopDur = clamp(0.35 + dist / 420, 0.35, 1.1);
  d.hopH = 12 + Math.min(40, dist * 0.08);
  d.z = 0;
}

function stepFrog(pond, d, dt) {
  const t = pond.time;
  if (d.hop) {
    const k = clamp((t - d.hopStart) / d.hopDur, 0, 1);
    d.x = d.fromX + (d.toX - d.fromX) * k;
    d.y = d.fromY + (d.toY - d.fromY) * k;
    d.z = Math.sin(Math.PI * k) * d.hopH;
    if (k >= 1) {
      d.hop = 0;
      d.z = 0;
      d.x = d.toX;
      d.y = d.toY;
      ripple(pond, d.x, d.y, 0.42);
      eat(pond, d.x, d.y, d.length * 0.9);
      d.cooldown = t + rand(0.35, 0.8);
      d.nextHop = t + rand(5, 11);
    }
    return;
  }
  if (t < d.cooldown) return;

  const food = nearestPellet(pond, d.x, d.y, 300);
  if (food) {
    startHop(pond, d, food.x, food.y);
  } else if (t > d.nextHop) {
    startHop(pond, d, rand(40, pond.width - 40), rand(40, pond.height - 40));
  }
}

function drawFrog(r, d) {
  const P = r.palette, L = d.length;
  const at = (u, v) => [
    d.x + Math.cos(d.heading) * u - Math.sin(d.heading) * v,
    d.y + Math.sin(d.heading) * u + Math.cos(d.heading) * v,
  ];

  const [sx, sy] = at(0, 0);
  ellipseShadow(r, sx + d.z * 0.25, sy + d.z * 0.3, L * 0.4, L * 0.34, d.heading);

  const spread = d.hop ? 1.5 : 1;
  for (const side of [-1, 1]) {
    const [lx, ly] = at(-L * 0.04, side * L * 0.22);
    const [ex, ey] = at(-L * 0.42 * spread, side * L * 0.55 * spread);
    line(r, lx, ly, ex, ey, P.frogLeg, P.alpha * 0.8);
    const [fx, fy] = at(L * 0.11, side * L * 0.16);
    const [gx, gy] = at(L * 0.38 * spread, side * L * 0.42 * spread);
    line(r, fx, fy, gx, gy, P.frogLeg, P.alpha * 0.7);
  }

  const [bx, by] = at(0, 0);
  ellipse(r, bx, by, L * 0.36, L * 0.3, d.heading, (rr, i, u, v, q) => {
    const spot = hash3(Math.round(u / rr.cellW), Math.round(v / rr.cellH), d.id) > 0.8;
    const pale = !spot && q < 0.22;
    const col = spot ? P.frogSpot : pale ? P.frogBelly : P.frogBody;
    paint(rr, i, spot ? "*" : pale ? ":" : "@", shade(col, 0.6), P.alpha * 0.9,
      col, P.alpha * 0.7);
  });

  const [hx, hy] = at(L * 0.2, 0);
  for (const side of [-1, 1]) {
    const [ex, ey] = at(L * 0.24, side * L * 0.17);
    ellipse(r, ex, ey, L * 0.12, L * 0.12, d.heading, (rr, i) => {
      paint(rr, i, "o", P.frogPupil, P.alpha, P.frogEye, P.alpha * 0.85);
    });
  }
  const [mx, my] = at(L * 0.38, 0);
  put(r, mx, my, "v", P.frogBody, P.alpha * 0.8);
}

function wakeFrog(r, d) {
  if (!d.hop) r.stir(d.x, d.y, 0.02);
}

export function frog(config = {}) {
  const species = {
    name: "frog",
    colors: COLORS.frog,
    seed: (pond) => seedSpecies(pond, species, spawnFrog, config),
    grow: (pond) => growSpecies(pond, species, spawnFrog, config),
    step: stepFrog,
    draw: drawFrog,
    wake: wakeFrog,
  };
  return species;
}

// ─── dragonfly ──────────────────────────────────────────────────────────────
function spawnDragonfly(pond, species) {
  return {
    species, id: pond.nextId++,
    ...spawnAt(pond, 1, 0.08),
    length: rand(56, 78),
    speed: 12,
    mode: "hover",
    baseX: 0,
    baseY: 0,
    target: null,
    nextMove: 0,
    nextDip: pond.time + rand(4, 10),
  };
}

function stepDragonfly(pond, d, dt) {
  const t = pond.time;
  if (!d.baseX) { d.baseX = d.x; d.baseY = d.y; }

  if (t > d.nextMove) {
    if (d.mode === "hover") {
      d.mode = "dart";
      d.target = { x: rand(50, pond.width - 50), y: rand(50, pond.height - 50) };
      d.nextMove = t + rand(0.5, 1.2);
    } else {
      d.mode = "hover";
      d.baseX = clamp(d.x + rand(-70, 70), 40, pond.width - 40);
      d.baseY = clamp(d.y + rand(-50, 50), 40, pond.height - 40);
      d.nextMove = t + rand(1.2, 3.5);
    }
  }

  if (d.mode === "dart") {
    swim(pond, d, dt, {
      speed: 105, goal: d.target, turn: 5, wander: 0.08, avoid: 0, margin: 20,
    });
    if (Math.hypot(d.target.x - d.x, d.target.y - d.y) < 18) d.mode = "hover";
  } else {
    swim(pond, d, dt, {
      speed: 11, goal: { x: d.baseX, y: d.baseY }, turn: 1.8,
      wander: 0.18, avoid: 0, margin: 20,
    });
  }

  if (t > d.nextDip) {
    ripple(pond, d.x, d.y, 0.18);
    d.nextDip = t + rand(5, 12);
  }
}

function drawDragonfly(r, d) {
  const P = r.palette, L = d.length;
  const at = (u, v) => [
    d.x + Math.cos(d.heading) * u - Math.sin(d.heading) * v,
    d.y + Math.sin(d.heading) * u + Math.cos(d.heading) * v,
  ];

  const [sx, sy] = at(0, 0);
  ellipseShadow(r, sx + L * 0.3, sy + L * 0.35, L * 0.28, L * 0.16, d.heading);

  for (const side of [-1, 1]) {
    const [ax, ay] = at(L * 0.02, side * L * 0.03);
    const [bx, by] = at(L * 0.3, side * L * 0.88);
    const [cx, cy] = at(-L * 0.38, side * L * 0.9);
    line(r, ax, ay, bx, by, P.dragonWing, P.alpha * 0.62);
    line(r, ax, ay, cx, cy, P.dragonWing, P.alpha * 0.55);
  }

  const [ax, ay] = at(L * 0.06, 0);
  const [tx, ty] = at(-L * 0.55, 0);
  const [bx, by] = at(-L * 0.12, 0);
  line(r, tx, ty, bx, by, P.dragonBody, P.alpha * 0.9, "~");
  const [mx, my] = at(-L * 0.3, 0);
  ellipse(r, mx, my, L * 0.24, L * 0.07, d.heading, (rr, i) => {
    paint(rr, i, "=", shade(P.dragonBody, 0.55), P.alpha * 0.9, P.dragonBody, P.alpha * 0.6);
  });
  ellipse(r, ax, ay, L * 0.13, L * 0.09, d.heading, (rr, i) => {
    paint(rr, i, "@", shade(P.dragonBody, 0.55), P.alpha, P.dragonBody, P.alpha * 0.78);
  });
  const [hx, hy] = at(L * 0.24, 0);
  ellipse(r, hx, hy, L * 0.1, L * 0.09, d.heading, (rr, i) => {
    paint(rr, i, "o", shade(P.dragonBody, 0.5), P.alpha, P.dragonBody, P.alpha * 0.8);
  });
  for (const side of [-1, 1]) {
    const [ex, ey] = at(L * 0.25, side * L * 0.06);
    put(r, ex, ey, "o", P.dragonEye, P.alpha);
  }
  put(r, tx, ty, "~", P.dragonBody, P.alpha * 0.8);
}

export function dragonfly(config = {}) {
  const species = {
    name: "dragonfly",
    colors: COLORS.dragonfly,
    seed: (pond) => seedSpecies(pond, species, spawnDragonfly, config),
    grow: (pond) => growSpecies(pond, species, spawnDragonfly, config),
    step: stepDragonfly,
    draw: drawDragonfly,
  };
  return species;
}

// ─── minnows: one creature that draws a small school ────────────────────────
function spawnSchool(pond, species) {
  const s = {
    species, id: pond.nextId++,
    ...spawnAt(pond, 0.58, 0.12),
    length: 14,
    speed: rand(34, 46),
    members: [],
  };
  const n = 5 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    s.members.push({
      a: (i / n) * TAU + rand(-0.25, 0.25),
      r: rand(10, 30),
      spin: rand(-0.8, 0.8),
      size: rand(16, 24),
      tilt: rand(-0.35, 0.35),
    });
  }
  return s;
}

function stepSchool(pond, s, dt) {
  const food = nearestPellet(pond, s.x, s.y, 280);
  if (food) {
    const dist = Math.hypot(food.x - s.x, food.y - s.y);
    if (dist < 26) eat(pond, s.x, s.y, 28);
  }
  swim(pond, s, dt, {
    speed: food ? 56 : s.speed, goal: food, turn: 3.2, wander: 0.45,
    avoid: 60, margin: 28,
  });
  for (const m of s.members) m.a += m.spin * dt;
}

function drawSchool(r, s, t) {
  const P = r.palette;
  for (const m of s.members) {
    const a = m.a + t * 0.35;
    const x = s.x + Math.cos(a) * m.r;
    const y = s.y + Math.sin(a) * m.r * 0.62;
    const heading = s.heading + m.tilt;
    const cs = Math.cos(heading), sn = Math.sin(heading);
    const at = (u, v) => [x + cs * u - sn * v, y + sn * u + cs * v];

    const [sx, sy] = at(2, 3);
    ellipseShadow(r, sx, sy, m.size * 0.58, m.size * 0.25, heading);

    ellipse(r, x, y, m.size * 0.56, m.size * 0.23, heading, (rr, i, u, v) => {
      const stripe = Math.abs(v) > m.size * 0.08;
      const col = stripe ? P.minnowStripe : P.minnowBody;
      paint(rr, i, stripe ? "-" : ",", shade(col, 0.5), P.alpha * 0.9,
        col, P.alpha * 0.62);
    });
    const [hx, hy] = at(m.size * 0.4, 0);
    put(r, hx, hy, arrowGlyph(cs, sn), P.minnowBody, P.alpha);
    const [ex, ey] = at(m.size * 0.18, m.size * 0.1);
    put(r, ex, ey, ".", P.minnowEye, P.alpha);
  }
}

function wakeSchool(r, s) {
  r.stir(s.x, s.y, 0.018);
}

export function minnows(config = {}) {
  const species = {
    name: "minnows",
    colors: COLORS.minnows,
    seed: (pond) => seedSpecies(pond, species, spawnSchool, config, 2),
    grow: (pond) => growSpecies(pond, species, spawnSchool, config, 2),
    step: stepSchool,
    draw: drawSchool,
    wake: wakeSchool,
  };
  return species;
}

// ─── crayfish ───────────────────────────────────────────────────────────────
function spawnCrayfish(pond, species) {
  return {
    species, id: pond.nextId++,
    ...spawnAt(pond, 0.06, 0.1),
    length: clamp(Math.min(pond.width, pond.height) * 0.1, 38, 64),
    speed: rand(8, 13),
    claw: rand(0, TAU),
  };
}

function stepCrayfish(pond, d, dt) {
  const food = nearestPellet(pond, d.x, d.y, 170);
  if (food) {
    const dist = Math.hypot(food.x - d.x, food.y - d.y);
    if (dist < d.length * 0.5) eat(pond, d.x, d.y, d.length * 0.55);
  }
  d.claw += dt * 1.6;
  swim(pond, d, dt, {
    speed: d.speed, goal: food, turn: 1, wander: 0.5,
    avoid: d.length * 0.8, margin: d.length * 0.5,
  });
}

function drawCrayfish(r, d) {
  const P = r.palette, L = d.length;
  const at = (u, v) => [
    d.x + Math.cos(d.heading) * u - Math.sin(d.heading) * v,
    d.y + Math.sin(d.heading) * u + Math.cos(d.heading) * v,
  ];

  const [sx, sy] = at(0, L * 0.1);
  ellipseShadow(r, sx + L * 0.06, sy + L * 0.08, L * 0.36, L * 0.2, d.heading);

  for (const side of [-1, 1]) {
    for (let j = 0; j < 3; j++) {
      const [lx, ly] = at(-L * (0.02 + j * 0.1), side * L * 0.1);
      const [mx, my] = at(-L * (0.08 + j * 0.13), side * L * 0.36);
      line(r, lx, ly, mx, my, P.crayfishLeg, P.alpha * 0.72);
    }
    const [ax, ay] = at(L * 0.16, side * L * 0.1);
    const [ex, ey] = at(L * 0.36, side * L * 0.28);
    line(r, ax, ay, ex, ey, P.crayfishClaw, P.alpha * 0.85);
    const [fx, fy] = at(L * 0.3, side * L * 0.05);
    const [wx, wy] = at(L * 0.74, side * L * 0.24);
    line(r, fx, fy, wx, wy, P.crayfishLeg, P.alpha * 0.55, "/");
  }

  for (let i = 0; i < 3; i++) {
    const [tx, ty] = at(-L * (0.26 + i * 0.1), 0);
    ellipse(r, tx, ty, L * 0.1, L * 0.12, d.heading, (rr, cell) => {
      paint(rr, cell, "~", shade(P.crayfishShell, 0.5), P.alpha * 0.85,
        P.crayfishShell, P.alpha * 0.65);
    });
  }
  const [tx, ty] = at(-L * 0.58, 0);
  ellipse(r, tx, ty, L * 0.09, L * 0.14, d.heading, (rr, cell) => {
    paint(rr, cell, "<", shade(P.crayfishShell, 0.45), P.alpha * 0.9,
      P.crayfishShell, P.alpha * 0.7);
  });

  const [bx, by] = at(L * 0.04, 0);
  ellipse(r, bx, by, L * 0.3, L * 0.15, d.heading, (rr, i, u, v) => {
    const key = hash3(Math.round(u / rr.cellW), Math.round(v / rr.cellH), d.id);
    paint(rr, i, key % 3 ? "@" : "#", shade(P.crayfishShell, 0.6), P.alpha * 0.92,
      P.crayfishShell, P.alpha * 0.75);
  });

  for (const side of [-1, 1]) {
    const [cx, cy] = at(L * 0.48, side * L * 0.32);
    const open = 0.75 + 0.25 * Math.sin(d.claw + side);
    ellipse(r, cx, cy, L * 0.2 * open, L * 0.1, d.heading + side * 0.45, (rr, i) => {
      paint(rr, i, side < 0 ? "(" : ")", shade(P.crayfishClaw, 0.55), P.alpha,
        P.crayfishClaw, P.alpha * 0.78);
    });
    const [ex, ey] = at(L * 0.3, side * L * 0.06);
    put(r, ex, ey, "o", P.crayfishEye, P.alpha);
  }
}

function wakeCrayfish(r, d) {
  r.stir(d.x, d.y, 0.015);
}

export function crayfish(config = {}) {
  const species = {
    name: "crayfish",
    colors: COLORS.crayfish,
    seed: (pond) => seedSpecies(pond, species, spawnCrayfish, config),
    grow: (pond) => growSpecies(pond, species, spawnCrayfish, config),
    step: stepCrayfish,
    draw: drawCrayfish,
    wake: wakeCrayfish,
  };
  return species;
}

// ─── newt ───────────────────────────────────────────────────────────────────
function spawnNewt(pond, species) {
  return {
    species, id: pond.nextId++,
    ...spawnAt(pond, 0.32, 0.12),
    length: clamp(Math.min(pond.width, pond.height) * 0.12, 46, 72),
    speed: rand(17, 26),
  };
}

function stepNewt(pond, d, dt) {
  const food = nearestPellet(pond, d.x, d.y, 210);
  if (food) {
    const dist = Math.hypot(food.x - d.x, food.y - d.y);
    if (dist < d.length * 0.42) eat(pond, d.x, d.y, d.length * 0.5);
  }
  swim(pond, d, dt, {
    speed: d.speed, goal: food, turn: 1.9, wander: 0.3,
    avoid: d.length * 0.7, margin: d.length * 0.5,
  });
}

function drawNewt(r, d) {
  const P = r.palette, L = d.length;
  const at = (u, v) => [
    d.x + Math.cos(d.heading) * u - Math.sin(d.heading) * v,
    d.y + Math.sin(d.heading) * u + Math.cos(d.heading) * v,
  ];

  const [sx, sy] = at(0, L * 0.1);
  ellipseShadow(r, sx + L * 0.05, sy + L * 0.08, L * 0.42, L * 0.13, d.heading);

  const sway = Math.sin(d.phase * 2.2) * L * 0.08;
  const [t0x, t0y] = at(-L * 0.3, 0);
  const [t1x, t1y] = at(-L * 0.58, sway);
  const [t2x, t2y] = at(-L * 0.72, sway * 1.6);
  line(r, t0x, t0y, t1x, t1y, P.newtBody, P.alpha * 0.85, "~");
  line(r, t1x, t1y, t2x, t2y, P.newtBody, P.alpha * 0.7, "~");

  const [bx, by] = at(0, 0);
  ellipse(r, bx, by, L * 0.38, L * 0.12, d.heading, (rr, i, u, v, q) => {
    const spot = Math.abs(v) > L * 0.07 && hash3(Math.round(u / rr.cellW), Math.round(v / rr.cellH), d.id) > 0.6;
    const col = spot ? P.newtBelly : P.newtBody;
    paint(rr, i, spot ? "=" : "-", shade(col, 0.55), P.alpha * 0.9,
      col, P.alpha * 0.7);
  });

  for (const side of [-1, 1]) {
    const [ax, ay] = at(L * 0.13, side * L * 0.08);
    const [ex, ey] = at(L * 0.02, side * L * 0.32);
    line(r, ax, ay, ex, ey, P.newtLeg, P.alpha * 0.75);
    const [bx2, by2] = at(-L * 0.13, side * L * 0.08);
    const [cx2, cy2] = at(-L * 0.25, side * L * 0.3);
    line(r, bx2, by2, cx2, cy2, P.newtLeg, P.alpha * 0.7);
  }

  const [hx, hy] = at(L * 0.43, 0);
  ellipse(r, hx, hy, L * 0.13, L * 0.1, d.heading, (rr, i) => {
    paint(rr, i, "@", shade(P.newtBody, 0.55), P.alpha, P.newtBody, P.alpha * 0.72);
  });
  for (const side of [-1, 1]) {
    const [ex, ey] = at(L * 0.47, side * L * 0.06);
    put(r, ex, ey, "o", P.newtEye, P.alpha);
  }
}

function wakeNewt(r, d) {
  r.stir(d.x - Math.cos(d.heading) * d.length * 0.4,
    d.y - Math.sin(d.heading) * d.length * 0.4, 0.02);
}

export function newt(config = {}) {
  const species = {
    name: "newt",
    colors: COLORS.newt,
    seed: (pond) => seedSpecies(pond, species, spawnNewt, config),
    grow: (pond) => growSpecies(pond, species, spawnNewt, config),
    step: stepNewt,
    draw: drawNewt,
    wake: wakeNewt,
  };
  return species;
}

/** Everything the engine can mount by name. */
export const ANIMALS = { duck, turtle, strider, frog, dragonfly, minnows, crayfish, newt };
