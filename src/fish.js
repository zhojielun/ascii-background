// The food chain: sharks, tuna and perch hunt, while small fish only browse the pellets.
//
// A hunted creature is marked `gone`; `pond.spawnQueue` brings one back from the same pool just
// off-screen, so the pond's head count stays level. Species that can be eaten carry `prey: true`;
// hunters also carry `predator: true` and a `pool` for the replacement draw.
import {
  clamp, rand, angleDiff, shade, hash3, repel,
} from "./util.js";
import {
  paint, put, ellipse, ellipseShadow, line, nearestPellet, predatorNear, ripple, eat,
  spawnAt, spawnAtEdge, countOf,
} from "./animals.js";

const PUSH = { x: 0, y: 0 };
const GOAL = { x: 0, y: 0 };
const MAX_SMALL = 4;
const MAX_LARGE = 2;

/** Koi carry a node spine instead of x/y; hunters need one position for either. */
const xOf = (c) => (c.nodes ? c.nodes[0] : c.x);
const yOf = (c) => (c.nodes ? c.nodes[1] : c.y);

// ─── colours ────────────────────────────────────────────────────────────────
const COLORS = {
  guppy: {
    dark: {
      guppyBody: [196, 124, 92], guppyBelly: [246, 214, 178], guppyStripe: [232, 92, 116],
      guppyFin: [74, 156, 158], guppyEye: [20, 18, 22],
    },
    light: {
      guppyBody: [160, 92, 66], guppyBelly: [224, 194, 158], guppyStripe: [188, 62, 88],
      guppyFin: [40, 112, 116], guppyEye: [24, 22, 24],
    },
  },
  tetra: {
    dark: {
      tetraBody: [150, 178, 190], tetraBelly: [220, 232, 234], tetraStripe: [80, 196, 220],
      tetraFin: [196, 208, 214], tetraEye: [16, 18, 22],
    },
    light: {
      tetraBody: [92, 120, 132], tetraBelly: [190, 204, 208], tetraStripe: [24, 142, 176],
      tetraFin: [130, 146, 152], tetraEye: [22, 22, 24],
    },
  },
  danio: {
    dark: {
      danioBody: [206, 188, 118], danioBelly: [242, 232, 194], danioStripe: [48, 98, 150],
      danioFin: [210, 158, 82], danioEye: [20, 18, 22],
    },
    light: {
      danioBody: [166, 142, 74], danioBelly: [216, 204, 164], danioStripe: [34, 74, 120],
      danioFin: [172, 118, 52], danioEye: [24, 22, 24],
    },
  },
  platy: {
    dark: {
      platyBody: [232, 126, 58], platyBelly: [250, 214, 158], platyStripe: [126, 56, 40],
      platyFin: [240, 178, 74], platyEye: [20, 18, 22],
    },
    light: {
      platyBody: [196, 94, 40], platyBelly: [228, 190, 140], platyStripe: [96, 46, 34],
      platyFin: [198, 140, 52], platyEye: [24, 22, 24],
    },
  },
  cory: {
    dark: {
      coryBody: [178, 168, 148], coryBelly: [238, 232, 216], coryStripe: [90, 74, 58],
      coryFin: [198, 188, 168], coryEye: [18, 18, 22],
    },
    light: {
      coryBody: [138, 128, 108], coryBelly: [208, 202, 186], coryStripe: [72, 58, 46],
      coryFin: [160, 150, 130], coryEye: [24, 22, 24],
    },
  },
  shark: {
    dark: {
      sharkBody: [94, 108, 118], sharkBelly: [206, 210, 204], sharkFin: [76, 88, 98],
      sharkGill: [70, 82, 92], sharkEye: [12, 14, 18], sharkMouth: [96, 58, 58],
    },
    light: {
      sharkBody: [78, 92, 102], sharkBelly: [226, 228, 222], sharkFin: [62, 74, 84],
      sharkGill: [92, 104, 112], sharkEye: [18, 18, 22], sharkMouth: [92, 56, 52],
    },
  },
  tuna: {
    dark: {
      tunaBody: [42, 78, 110], tunaBelly: [204, 212, 214], tunaStripe: [26, 54, 82],
      tunaFin: [226, 184, 76], tunaEye: [12, 14, 18],
    },
    light: {
      tunaBody: [30, 60, 92], tunaBelly: [222, 226, 224], tunaStripe: [20, 42, 68],
      tunaFin: [188, 140, 40], tunaEye: [18, 18, 22],
    },
  },
  perch: {
    dark: {
      perchBody: [104, 138, 96], perchBelly: [228, 228, 208], perchBar: [56, 82, 60],
      perchFin: [196, 170, 96], perchEye: [16, 16, 20], perchMouth: [72, 62, 54],
    },
    light: {
      perchBody: [78, 110, 74], perchBelly: [214, 214, 196], perchBar: [44, 68, 50],
      perchFin: [164, 136, 66], perchEye: [20, 20, 24], perchMouth: [70, 58, 50],
    },
  },
};

// ─── shared steering ────────────────────────────────────────────────────────
/**
 * Turn toward `goal` at a rate a body of this length can actually manage, with eased speed.
 * Wall and content avoidance live here so every new fish behaves like the rest of the pond.
 */
function steer(pond, f, dt, goal, o = {}) {
  const W = pond.width, H = pond.height;
  f.wander = clamp((f.wander || 0) + (Math.random() - 0.5) * 2.4 * Math.sqrt(dt / 60), -0.8, 0.8);
  let dx = Math.cos(f.heading), dy = Math.sin(f.heading);
  const wander = o.wander ?? 0.35;
  dx += Math.cos(f.heading + f.wander) * wander;
  dy += Math.sin(f.heading + f.wander) * wander;
  if (goal) {
    const gx = goal.x - f.x, gy = goal.y - f.y, d = Math.hypot(gx, gy) || 1;
    const pull = o.pull ?? 2.5;
    dx += (gx / d) * pull;
    dy += (gy / d) * pull;
  }

  // Look ahead along the body so a long fish turns before its nose reaches the wall.
  const margin = Math.max(24, f.length * 0.45);
  const look = Math.max(18, f.speed * 0.4);
  const ax = f.x + Math.cos(f.heading) * look, ay = f.y + Math.sin(f.heading) * look;
  const ex = Math.max(0, margin - ax) - Math.max(0, ax - (W - margin));
  const ey = Math.max(0, margin - ay) - Math.max(0, ay - (H - margin));
  if (ex || ey) {
    const d = Math.hypot(ex, ey) || 1;
    dx += (ex / d) * 2.4;
    dy += (ey / d) * 2.4;
  }
  const over = Math.max(-f.x, f.x - W, -f.y, f.y - H);
  if (over > 0) {
    const tx = W / 2 - f.x, ty = H / 2 - f.y, d = Math.hypot(tx, ty) || 1;
    dx += (tx / d) * 3;
    dy += (ty / d) * 3;
  }
  if (pond.avoid.length) {
    repel(pond.avoid, f.x, f.y, o.avoid ?? f.length * 1.2, PUSH);
    dx += PUSH.x * (o.yield ?? 1.4);
    dy += PUSH.y * (o.yield ?? 1.4);
  }

  const desired = Math.atan2(dy, dx);
  const err = angleDiff(f.heading, desired);
  // A long body has a wide turning circle; a small one can pivot almost on the spot.
  const radius = Math.max(8, f.length * (o.radius ?? 0.45));
  const maxRate = Math.min(8, (f.speed + 45) / radius) * (o.agility ?? 1) * (1 + (o.urgency ?? 0) * 0.6);
  const want = maxRate * clamp(err / (o.snap ?? 0.45), -1, 1);
  f.turnRate += (want - (f.turnRate || 0)) * Math.min(1, dt * (o.turnSnap ?? 7));
  const turned = clamp(f.turnRate * dt, -Math.abs(err), Math.abs(err));
  f.heading += turned;

  const target = o.speed ?? f.cruise;
  f.speed += (target - f.speed) * Math.min(1, dt * (o.accel ?? 2.6));
  f.x += Math.cos(f.heading) * f.speed * dt;
  f.y += Math.sin(f.heading) * f.speed * dt;
  if (f.entering) {
    if (f.x > 2 && f.x < W - 2 && f.y > 2 && f.y < H - 2) f.entering = false;
  } else {
    f.x = clamp(f.x, 4, W - 4);
    f.y = clamp(f.y, 4, H - 4);
  }
  f.phase += dt * (0.7 + f.speed * 0.08) * (f.panic > 0.2 ? 1.5 : 1);
}

function wakeFish(r, f, power) {
  const n = f.length > 80 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const d = f.length * (0.25 + i * 0.12);
    r.stir(f.x - Math.cos(f.heading) * d, f.y - Math.sin(f.heading) * d,
      power + f.speed * 0.0008);
  }
}

// ─── small fish: pellets only ───────────────────────────────────────────────
const SMALL = {
  guppy: {
    name: "guppy",
    tail: "fan",
    stripe: "spots",
    length: [48, 62],
    depth: [0.55, 0.78],
    speed: [26, 38],
    sense: 170,
    keys: {
      body: "guppyBody", belly: "guppyBelly", stripe: "guppyStripe",
      fin: "guppyFin", eye: "guppyEye",
    },
  },
  tetra: {
    name: "tetra",
    tail: "fork",
    stripe: "neon",
    length: [42, 54],
    depth: [0.55, 0.78],
    speed: [30, 42],
    sense: 190,
    keys: {
      body: "tetraBody", belly: "tetraBelly", stripe: "tetraStripe",
      fin: "tetraFin", eye: "tetraEye",
    },
  },
  danio: {
    name: "danio",
    tail: "fork",
    stripe: "lines",
    length: [52, 66],
    depth: [0.55, 0.78],
    speed: [32, 44],
    sense: 180,
    keys: {
      body: "danioBody", belly: "danioBelly", stripe: "danioStripe",
      fin: "danioFin", eye: "danioEye",
    },
  },
  platy: {
    name: "platy",
    tail: "fan",
    stripe: "belt",
    length: [46, 60],
    depth: [0.5, 0.72],
    speed: [24, 36],
    sense: 165,
    keys: {
      body: "platyBody", belly: "platyBelly", stripe: "platyStripe",
      fin: "platyFin", eye: "platyEye",
    },
  },
  cory: {
    name: "cory",
    tail: "fork",
    stripe: "speck",
    barbels: true,
    length: [40, 54],
    depth: [0.06, 0.22],
    speed: [16, 26],
    sense: 150,
    keys: {
      body: "coryBody", belly: "coryBelly", stripe: "coryStripe",
      fin: "coryFin", eye: "coryEye",
    },
  },
};

function spawnSmall(pond, species, cfg, offscreen = false) {
  const L = rand(cfg.length[0], cfg.length[1]);
  const depth = rand(cfg.depth[0], cfg.depth[1]);
  const p = offscreen ? spawnAtEdge(pond, depth, L * 1.6) : spawnAt(pond, depth, 0.12);
  const f = {
    species, id: pond.nextId++,
    ...p,
    length: L,
    cruise: rand(cfg.speed[0], cfg.speed[1]),
    speed: 0,
    turnRate: 0,
    depthTarget: depth,
    panic: 0,
    fleeX: 0,
    fleeY: 0,
    nextWake: 0,
    entering: offscreen,
  };
  f.speed = f.cruise;
  return f;
}

function stepSmall(pond, f, dt, cfg) {
  const t = pond.time;
  const threat = predatorNear(pond, f.x, f.y, f.length, Math.max(130, f.length * 7), f, 1.15);
  if (threat) {
    // A C-start: the first sight of a hunter is a burst, then a fast, tight retreat.
    if (f.panic < 0.2) f.speed = Math.max(f.speed, cfg.speed[1] * 1.8);
    f.panic = 1;
    f.fleeX = threat.x;
    f.fleeY = threat.y;
  } else {
    f.panic = Math.max(0, f.panic - dt * 0.85);
  }
  const scared = f.panic > 0.2;
  const food = scared ? null : nearestPellet(pond, f.x, f.y, cfg.sense);
  let goal = null, speed = f.cruise, accel = 3;
  if (scared) {
    const dx = f.x - f.fleeX, dy = f.y - f.fleeY, d = Math.hypot(dx, dy) || 1;
    GOAL.x = f.x + (dx / d) * 180;
    GOAL.y = f.y + (dy / d) * 180;
    goal = GOAL;
    speed = cfg.speed[1] * 2.6;
    accel = 9;
  } else if (food) {
    const d = Math.hypot(food.x - f.x, food.y - f.y);
    if (d < f.length * 0.8) {
      eat(pond, f.x, f.y, f.length * 0.9);
    } else {
      goal = food;
      speed = cfg.speed[1] * 1.7;
    }
  }
  steer(pond, f, dt, goal, {
    speed, accel, wander: scared ? 0.12 : 0.5, agility: scared ? 1.6 : 1,
    radius: scared ? 0.18 : 0.35, avoid: f.length * 2.2,
  });
  f.depth += (f.depthTarget - f.depth) * Math.min(1, dt * 0.5);
  if (scared && t > f.nextWake) {
    ripple(pond, f.x - Math.cos(f.heading) * f.length * 0.4,
      f.y - Math.sin(f.heading) * f.length * 0.4, 0.1);
    f.nextWake = t + rand(0.15, 0.35);
  }
}

function drawSmall(r, f, cfg) {
  const P = r.palette, K = cfg.keys, L = f.length;
  const cs = Math.cos(f.heading), sn = Math.sin(f.heading);
  const at = (u, v) => [f.x + cs * u - sn * v, f.y + sn * u + cs * v];
  const wig = Math.sin(f.phase * (1 + f.panic * 0.8)) * L * 0.08;
  const [bx, by] = at(0, 0);

  const [shx, shy] = at(L * 0.03, L * 0.08);
  ellipseShadow(r, shx, shy, L * 0.46, L * 0.18, f.heading);

  // Tail: a guppy fans, the others fork.
  const [tx, ty] = at(-L * 0.4, wig * 0.5);
  if (cfg.tail === "fan") {
    for (let i = -2; i <= 2; i++) {
      const [ex, ey] = at(-L * 0.68, wig * 0.5 + i * L * 0.11);
      line(r, tx, ty, ex, ey, P[K.fin], P.alpha * (0.55 + 0.1 * Math.abs(i)));
    }
  } else {
    const [ax, ay] = at(-L * 0.68, wig * 0.5 - L * 0.2);
    const [bx2, by2] = at(-L * 0.68, wig * 0.5 + L * 0.2);
    line(r, tx, ty, ax, ay, P[K.fin], P.alpha * 0.7);
    line(r, tx, ty, bx2, by2, P[K.fin], P.alpha * 0.7);
    line(r, tx, ty, tx - 2, ty, P[K.fin], P.alpha * 0.55);
  }

  ellipse(r, bx, by, L * 0.48, L * 0.2, f.heading, (rr, i, u, v, q) => {
    const across = v / (L * 0.2);
    let col = across < 0 ? P[K.body] : P[K.belly];
    let glyph = q > 0.72 ? "," : ".";
    if (cfg.stripe === "neon" && across < 0.55) { col = P[K.stripe]; glyph = "-"; }
    else if (cfg.stripe === "lines" && across < -0.1) {
      col = P[K.stripe];
      glyph = "=";
    } else if (cfg.stripe === "belt" && across < 0.4 && u < -L * 0.16 && u > -L * 0.42) {
      // A platy's dark blotch just ahead of the tail.
      col = P[K.stripe];
      glyph = "=";
    } else if (cfg.stripe === "speck" && hash3(Math.round(u / rr.cellW), Math.round(v / rr.cellH), f.id) > 0.58) {
      // A cory's armour: a scatter of dark scutes over the whole flank.
      col = P[K.stripe];
      glyph = "*";
    } else if (cfg.stripe === "spots" && hash3(Math.round(u / rr.cellW), Math.round(v / rr.cellH), f.id) > 0.72) {
      col = P[K.stripe];
      glyph = "%";
    }
    paint(rr, i, glyph, shade(col, 0.62), P.alpha * 0.9, col, P.alpha * 0.6);
  });

  // Dorsal fin and a pectoral tucked against the flank.
  const [dx, dy] = at(-L * 0.02, -L * 0.19);
  const [ex, ey] = at(-L * 0.18, -L * 0.27);
  line(r, dx, dy, ex, ey, P[K.fin], P.alpha * 0.8);
  const [fx, fy] = at(L * 0.05, L * 0.12);
  const [qx, qy] = at(-L * 0.08, L * 0.2);
  line(r, fx, fy, qx, qy, P[K.fin], P.alpha * 0.6);

  const [hx, hy] = at(L * 0.3, -L * 0.06);
  put(r, hx, hy, "o", P[K.eye], P.alpha);
  const [mx, my] = at(L * 0.48, 0);
  put(r, mx, my, f.panic > 0.2 ? ">" : ".", P[K.body], P.alpha * 0.9);

  // A cory's barbels: two whiskers trailing from the snout.
  if (cfg.barbels) {
    for (const side of [-1, 1]) {
      const [b0x, b0y] = at(L * 0.46, side * L * 0.05);
      const [b1x, b1y] = at(L * 0.64, side * L * 0.15 + wig * 0.4);
      line(r, b0x, b0y, b1x, b1y, P[K.fin], P.alpha * 0.6);
    }
  }
}

function makeSmall(cfg, config) {
  const species = {
    name: cfg.name,
    colors: COLORS[cfg.name],
    prey: true,
    pool: "small",
    limit: MAX_SMALL,
    seed: (pond) => {
      for (let i = 0, n = countOf(config, MAX_SMALL); i < n; i++) pond.creatures.push(spawnSmall(pond, species, cfg));
    },
    spawn: (pond, offscreen = false) => { pond.creatures.push(spawnSmall(pond, species, cfg, offscreen)); },
    step: (pond, f, dt) => stepSmall(pond, f, dt, cfg),
    draw: (r, f) => drawSmall(r, f, cfg),
    wake: (r, f) => wakeFish(r, f, 0.012),
  };
  return species;
}

// ─── hunters: pellets plus live prey ────────────────────────────────────────
const HUNTERS = {
  shark: {
    name: "shark",
    look: "shark",
    size: 0.55,
    min: 260,
    max: 470,
    speed: [58, 78],
    huntSpeed: 125,
    lungeSpeed: 235,
    sense: 620,
    preyRatio: 0.72,
    digest: [20, 36],
    tail: "crescent",
    finlets: false,
    keys: {
      body: "sharkBody", belly: "sharkBelly", fin: "sharkFin", gill: "sharkGill",
      eye: "sharkEye", mouth: "sharkMouth",
    },
  },
  tuna: {
    name: "tuna",
    look: "tuna",
    size: 0.3,
    min: 130,
    max: 220,
    speed: [72, 94],
    huntSpeed: 155,
    lungeSpeed: 255,
    sense: 430,
    preyRatio: 0.68,
    digest: [16, 30],
    tail: "fork",
    finlets: true,
    keys: {
      body: "tunaBody", belly: "tunaBelly", fin: "tunaFin", gill: "tunaStripe",
      eye: "tunaEye", mouth: "tunaStripe",
    },
  },
  // A pond perch: small and quick, it hunts the small fish but is itself on a shark's menu.
  perch: {
    name: "perch",
    look: "perch",
    pattern: "bars",
    size: 0.2,
    min: 96,
    max: 138,
    speed: [40, 56],
    huntSpeed: 92,
    lungeSpeed: 175,
    sense: 320,
    preyRatio: 0.8,
    digest: [12, 24],
    tail: "fork",
    finlets: false,
    keys: {
      body: "perchBody", belly: "perchBelly", fin: "perchFin", gill: "perchBar",
      eye: "perchEye", mouth: "perchMouth",
    },
  },
};

function spawnHunter(pond, species, cfg, offscreen = false) {
  const W = pond.width, H = pond.height;
  const L = clamp(Math.min(W, H) * cfg.size, cfg.min, cfg.max) * rand(0.92, 1.06);
  const depth = cfg.look === "shark" ? rand(0.35, 0.58) : rand(0.48, 0.7);
  const p = offscreen ? spawnAtEdge(pond, depth, L * 0.7) : spawnAt(pond, depth, 0.14);
  const h = {
    species, id: pond.nextId++,
    ...p,
    length: L,
    cruise: rand(cfg.speed[0], cfg.speed[1]),
    speed: 0,
    turnRate: 0,
    depthTarget: depth,
    target: null,
    digestUntil: 0,
    gulp: 0,
    lunge: 0,
    panic: 0,
    fleeX: 0,
    fleeY: 0,
    nextWake: 0,
    entering: offscreen,
  };
  h.speed = h.cruise;
  return h;
}

/** True while a replacement is still outside the pond, so it cannot be eaten before it arrives. */
function inside(pond, c) {
  const x = xOf(c), y = yOf(c);
  return x >= 0 && x <= pond.width && y >= 0 && y <= pond.height;
}

function validTarget(pond, h, prey, cfg) {
  if (!prey || prey.gone || prey.leaving || !prey.species.prey || prey.species === h.species) return false;
  if (!inside(pond, prey)) return false;
  if (prey.length > h.length * cfg.preyRatio) return false;
  return Math.hypot(xOf(prey) - h.x, yOf(prey) - h.y) < cfg.sense * 1.35;
}

function findPrey(pond, h, cfg) {
  let best = null, bestD = cfg.sense * cfg.sense;
  for (const o of pond.creatures) {
    if (o === h || o.gone || o.leaving || o.species === h.species || !o.species.prey) continue;
    if (!inside(pond, o) || o.length > h.length * cfg.preyRatio) continue;
    const d = (xOf(o) - h.x) ** 2 + (yOf(o) - h.y) ** 2;
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

function stepHunter(pond, h, dt, cfg) {
  const t = pond.time;
  h.gulp = Math.max(0, h.gulp - dt * 2.2);
  h.lunge = Math.max(0, h.lunge - dt * 1.8);

  // A tuna is prey too: a shark in range interrupts the hunt.
  const threat = predatorNear(pond, h.x, h.y, h.length, Math.max(300, h.length * 3), h, 1.25);
  if (threat) {
    h.target = null;
    if (h.panic < 0.2) h.speed = Math.max(h.speed, h.cruise * 1.8);
    h.panic = 1;
    h.fleeX = threat.x;
    h.fleeY = threat.y;
    const dx = h.x - h.fleeX, dy = h.y - h.fleeY, d = Math.hypot(dx, dy) || 1;
    GOAL.x = h.x + (dx / d) * 260;
    GOAL.y = h.y + (dy / d) * 260;
    steer(pond, h, dt, GOAL, {
      speed: cfg.lungeSpeed, accel: 6, wander: 0.08, radius: 0.3, urgency: 1,
    });
    if (t > h.nextWake) {
      ripple(pond, h.x - Math.cos(h.heading) * h.length * 0.4,
        h.y - Math.sin(h.heading) * h.length * 0.4, 0.35);
      h.nextWake = t + rand(0.1, 0.24);
    }
    return;
  }
  h.panic = Math.max(0, h.panic - dt * 0.9);

  // Pellets are always on the menu, even while digesting a catch.
  let food = nearestPellet(pond, h.x, h.y, Math.max(180, h.length * 2.6));
  if (food) {
    const d = Math.hypot(food.x - h.x, food.y - h.y);
    if (d < Math.max(16, h.length * 0.22)) {
      eat(pond, h.x, h.y, Math.max(18, h.length * 0.26));
      food = null;
    }
  }

  // Keep a target while it is still worth chasing; otherwise look for the nearest one.
  const digesting = t < h.digestUntil;
  if (digesting) h.target = null;
  else if (!validTarget(pond, h, h.target, cfg)) h.target = findPrey(pond, h, cfg);

  let goal = null, speed = h.cruise * (digesting ? 0.72 : 1), accel = 3, urgency = 0;
  if (h.target) {
    const p = h.target, tx = xOf(p), ty = yOf(p);
    const d = Math.hypot(tx - h.x, ty - h.y);
    const lead = clamp(d / Math.max(120, h.speed + p.speed), 0, 0.55);
    GOAL.x = tx + Math.cos(p.heading) * p.speed * lead;
    GOAL.y = ty + Math.sin(p.heading) * p.speed * lead;
    goal = GOAL;
    const front = (tx - h.x) * Math.cos(h.heading) + (ty - h.y) * Math.sin(h.heading);
    if (d < h.length * 1.35) h.lunge = Math.max(h.lunge, 0.9);
    speed = d < h.length * 2.4 ? cfg.lungeSpeed : cfg.huntSpeed;
    accel = d < h.length * 2.4 ? 7 : 4;
    urgency = 1;
    if (d < h.length * 0.34 + p.length * 0.5 && front > 0) {
      strike(pond, h, p, cfg);
      return;
    }
  } else if (food) {
    goal = food;
    speed = cfg.speed[1] * 1.5;
    accel = 4;
  }

  steer(pond, h, dt, goal, {
    speed, accel, urgency, wander: h.target ? 0.1 : 0.4,
    radius: h.target ? 0.34 : 0.55, avoid: h.length * 0.9, yield: h.target ? 0.8 : 1.4,
  });
  const depthTarget = h.target ? h.target.depth : h.depthTarget;
  h.depth += (depthTarget - h.depth) * Math.min(1, dt * 0.8);
}

function strike(pond, h, prey, cfg) {
  const t = pond.time;
  const x = xOf(prey), y = yOf(prey);
  prey.gone = true;
  h.target = null;
  h.digestUntil = t + rand(cfg.digest[0], cfg.digest[1]);
  h.gulp = 1;
  h.lunge = 1;
  h.speed *= 0.55;
  ripple(pond, x, y, 0.95);
  for (let i = 0; i < 3; i++) {
    pond.bites.push({
      x: x + rand(-7, 7),
      y: y + rand(-5, 5),
      born: t,
    });
  }
  replenish(pond, prey);
}

/** Put one fish back from the same pool, just off-screen. */
function replenish(pond, prey) {
  let choices = null;
  if (prey.species.pool) {
    choices = pond.species.filter((s) => s.pool === prey.species.pool && s.spawn);
  } else if (prey.species.spawn) {
    choices = [prey.species];
  }
  if (!choices || !choices.length) return;
  // Never let repeated replacements push one species past its own cap; the meal just freed a slot
  // in the eaten species, so there is always at least one candidate.
  const roomy = choices.filter((s) => countIn(pond, s) < (s.limit ?? Infinity));
  if (roomy.length) choices = roomy;
  const species = choices.length === 1 ? choices[0] : choices[Math.floor(Math.random() * choices.length)];
  pond.spawnQueue.push({ at: pond.time, species, make: () => species.spawn(pond, true) });
}

function countIn(pond, species) {
  let n = 0;
  for (const c of pond.creatures) if (c.species === species && !c.gone) n++;
  // Two catches can land in the same step; count replacements already waiting in the queue too.
  for (const s of pond.spawnQueue) if (s.species === species) n++;
  return n;
}

function drawHunter(r, h, cfg) {
  const P = r.palette, K = cfg.keys, L = h.length;
  const cs = Math.cos(h.heading), sn = Math.sin(h.heading);
  const at = (u, v) => [h.x + cs * u - sn * v, h.y + sn * u + cs * v];
  const sway = Math.sin(h.phase) * L * 0.012;

  const [shx, shy] = at(0, L * 0.04);
  ellipseShadow(r, shx, shy, L * 0.36, L * 0.1, h.heading);

  // Caudal fin: a shark's crescent, a tuna's fork.
  const [tx, ty] = at(-L * 0.38, sway);
  if (cfg.tail === "fork") {
    const [ax, ay] = at(-L * 0.6, sway - L * 0.2);
    const [bx, by] = at(-L * 0.6, sway + L * 0.2);
    const [cx, cy] = at(-L * 0.55, sway);
    line(r, tx, ty, ax, ay, P[K.fin], P.alpha);
    line(r, tx, ty, bx, by, P[K.fin], P.alpha);
    line(r, tx, ty, cx, cy, P[K.fin], P.alpha * 0.8);
  } else {
    const [ax, ay] = at(-L * 0.6, sway - L * 0.24);
    const [bx, by] = at(-L * 0.54, sway + L * 0.1);
    const [cx, cy] = at(-L * 0.64, sway - L * 0.03);
    line(r, tx, ty, ax, ay, P[K.fin], P.alpha);
    line(r, tx, ty, bx, by, P[K.fin], P.alpha);
    line(r, tx, ty, cx, cy, P[K.fin], P.alpha * 0.85);
  }

  // Body, counter-shaded: dark back, pale belly.
  ellipse(r, h.x, h.y, L * 0.36, L * 0.115, h.heading, (rr, i, u, v, q) => {
    const across = v / (L * 0.115);
    let col = across < 0.05 ? P[K.body] : P[K.belly];
    let glyph = across < 0.05 ? (q > 0.72 ? "%" : "@") : q > 0.75 ? "." : ",";
    // A perch wears dark vertical bars down its flank.
    if (cfg.pattern === "bars" && across < 0.45 && hash3(Math.round(u / (rr.cellW * 1.5)), 0, h.id) > 0.55) {
      col = P[K.gill];
      glyph = "|";
    }
    paint(rr, i, glyph, shade(col, 0.62), P.alpha * 0.95, col, P.alpha * 0.68);
  });

  // Snout: a narrower nose in front of the body.
  const [nx, ny] = at(L * 0.36, 0);
  ellipse(r, nx, ny, L * 0.12, L * 0.065, h.heading, (rr, i, u, v, q) => {
    const across = v / (L * 0.065);
    const col = across < 0 ? P[K.body] : P[K.belly];
    paint(rr, i, q > 0.7 ? "." : ",", shade(col, 0.62), P.alpha * 0.95, col, P.alpha * 0.68);
  });

  // Dorsal fin, swept back while lunging.
  const sweep = h.lunge * L * 0.06;
  const [fx, fy] = at(-L * 0.03 + sweep, -L * 0.1);
  const [gx, gy] = at(-L * 0.14 + sweep, -L * 0.27);
  const [ex, ey] = at(-L * 0.23 + sweep, -L * 0.08);
  line(r, fx, fy, gx, gy, P[K.fin], P.alpha * 0.9);
  line(r, gx, gy, ex, ey, P[K.fin], P.alpha * 0.85);
  line(r, ex, ey, fx, fy, P[K.fin], P.alpha * 0.55);

  for (const side of [-1, 1]) {
    const [p0x, p0y] = at(L * 0.1, side * L * 0.07);
    const [q0x, q0y] = at(-L * 0.1 + sweep * 0.5, side * L * 0.19);
    line(r, p0x, p0y, q0x, q0y, P[K.fin], P.alpha * 0.8);
  }

  if (cfg.finlets) {
    for (const u of [0.3, 0.4, 0.5]) {
      const [ux, uy] = at(-L * u, -L * 0.1);
      const [lx, ly] = at(-L * u, L * 0.1);
      put(r, ux, uy, "'", P[K.fin], P.alpha * 0.9);
      put(r, lx, ly, "'", P[K.fin], P.alpha * 0.8);
    }
  }

  // Gills: short bars behind the head.
  for (const u of [0.14, 0.2, 0.26]) {
    const [g0x, g0y] = at(L * u, -L * 0.015);
    const [g1x, g1y] = at(L * u, L * 0.055);
    line(r, g0x, g0y, g1x, g1y, P[K.gill], P.alpha * 0.7);
  }

  const [ex2, ey2] = at(L * 0.3, -L * 0.045);
  put(r, ex2, ey2, "o", P[K.eye], P.alpha);

  // An open jaw shows during the lunge and for a moment after the catch.
  const open = Math.max(h.gulp, h.lunge * 0.7);
  if (open > 0.15) {
    const gap = L * (0.025 + 0.055 * open);
    const [m0x, m0y] = at(L * 0.47, 0);
    const [m1x, m1y] = at(L * 0.33, -gap);
    const [m2x, m2y] = at(L * 0.33, gap);
    line(r, m0x, m0y, m1x, m1y, P[K.mouth], P.alpha);
    line(r, m0x, m0y, m2x, m2y, P[K.mouth], P.alpha);
    for (let i = -1; i <= 1; i++) {
      const [tx2, ty2] = at(L * (0.43 - Math.abs(i) * 0.02), i * gap * 0.55);
      put(r, tx2, ty2, "^", P[K.belly], P.alpha * 0.95);
    }
  } else {
    const [m0x, m0y] = at(L * 0.46, -L * 0.005);
    const [m1x, m1y] = at(L * 0.38, L * 0.035);
    line(r, m0x, m0y, m1x, m1y, P[K.mouth], P.alpha * 0.8);
  }
}

function makeHunter(cfg, config) {
  const species = {
    name: cfg.name,
    colors: COLORS[cfg.name],
    prey: true,
    predator: true,
    pool: "large",
    limit: MAX_LARGE,
    seed: (pond) => {
      for (let i = 0, n = countOf(config, MAX_LARGE); i < n; i++) pond.creatures.push(spawnHunter(pond, species, cfg));
    },
    spawn: (pond, offscreen = false) => { pond.creatures.push(spawnHunter(pond, species, cfg, offscreen)); },
    step: (pond, h, dt) => stepHunter(pond, h, dt, cfg),
    draw: (r, h) => drawHunter(r, h, cfg),
    wake: (r, h) => wakeFish(r, h, 0.03),
  };
  return species;
}

// ─── species ────────────────────────────────────────────────────────────────
export function guppy(config = {}) { return makeSmall(SMALL.guppy, config); }
export function tetra(config = {}) { return makeSmall(SMALL.tetra, config); }
export function danio(config = {}) { return makeSmall(SMALL.danio, config); }
export function platy(config = {}) { return makeSmall(SMALL.platy, config); }
export function cory(config = {}) { return makeSmall(SMALL.cory, config); }
export function shark(config = {}) { return makeHunter(HUNTERS.shark, config); }
export function tuna(config = {}) { return makeHunter(HUNTERS.tuna, config); }
export function perch(config = {}) { return makeHunter(HUNTERS.perch, config); }

export const FISH = { shark, tuna, perch, guppy, tetra, danio, platy, cory };
