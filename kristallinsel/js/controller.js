// Bewegung der Spielfigur: Laufen, Sprinten, Springen, Rutschen an steilen Hängen, Schwimmen, Gleiten.
// Reines JS (in Node testbar). world: { terrain, colliders, water }.

export const P = {
  radius: 0.34,
  height: 1.75,
  stepUp: 0.5,
  walk: 4.4,
  run: 7.8,
  swim: 2.4,
  swimFast: 3.9,
  accel: 16,
  airAccel: 3.5,
  gravity: 24,
  jumpV: 8.4,
  maxFall: 40,
  maxSlopeNy: 0.62,     // ab ca. 52° rutscht man ab
  swimDepth: 1.3,       // ab dieser Wassertiefe wird geschwommen
  glideFall: 2.3,
  glideSpeed: 9.5,
  staminaRun: 0.11,     // pro Sekunde (≈ 9 s Sprint)
  staminaGlide: 0.055,  // ≈ 18 s Gleiten
  staminaSwim: 0.09,
  staminaRegen: 0.32,
};

/** Schrittlänge in m (ein Schritt = halber Laufzyklus). */
export const STRIDE = { walk: 1.05, run: 1.55, swim: 1.3 };

export function createPlayer(x, y, z, yaw = 0) {
  return {
    x, y, z, vx: 0, vy: 0, vz: 0, yaw,
    mode: 'ground',        // ground | air | swim | glide
    stamina: 1, exhausted: false,
    sliding: false, running: false,
    surface: 'grass', floor: null,
    phase: 0, airTime: 0, fallStartY: y, speed: 0,
  };
}

const damp = (k, dt) => 1 - Math.exp(-k * dt);

function ground(world, x, z, maxTop) {
  const t = world.terrain.heightAt(x, z);
  const f = world.colliders.floorAt(x, z, 0.28, maxTop);
  if (f > t) return { y: f, col: world.colliders.lastFloor };
  return { y: t, col: null };
}

/**
 * Ein Simulationsschritt. input: { mx, mz } (Weltrichtung, Länge ≤ 1), run, jump (gerade gedrückt), canGlide.
 * Liefert Ereignisse: jump, land, step, splash, glideOn, glideOff, exhausted.
 */
export function stepPlayer(p, input, dt, world) {
  const ev = [];
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  let jump = input.jump;
  for (let i = 0; i < steps; i++) { substep(p, input, jump, h, world, ev); jump = false; }
  return ev;
}

function substep(p, input, jump, dt, world, ev) {
  const water = world.water ?? 0;
  let mx = input.mx || 0, mz = input.mz || 0;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const moving = ml > 0.05;

  // --- Ausdauer
  const wantRun = !!input.run && moving && !p.exhausted;
  p.running = false;
  if (p.mode === 'ground' && wantRun) { p.running = true; p.stamina -= P.staminaRun * dt; }
  else if (p.mode === 'swim' && wantRun) { p.running = true; p.stamina -= P.staminaSwim * dt; }
  else if (p.mode === 'glide') p.stamina -= P.staminaGlide * dt;
  else if (p.mode === 'ground' || p.mode === 'swim') p.stamina += P.staminaRegen * dt * (p.mode === 'swim' ? 0.5 : 1);
  if (p.stamina <= 0) {
    p.stamina = 0;
    if (!p.exhausted) { p.exhausted = true; ev.push({ type: 'exhausted' }); }
    if (p.mode === 'glide') { p.mode = 'air'; ev.push({ type: 'glideOff' }); }
  }
  if (p.stamina > 1) p.stamina = 1;
  if (p.exhausted && p.stamina >= 1) p.exhausted = false;

  // --- Waagerechte Geschwindigkeit
  let speed, acc;
  switch (p.mode) {
    case 'ground': speed = p.running ? P.run : P.walk; acc = P.accel; break;
    case 'swim': speed = p.running ? P.swimFast : P.swim; acc = 5; break;
    case 'glide': speed = P.glideSpeed; acc = 2.2; break;
    default: speed = Math.max(P.walk, Math.hypot(p.vx, p.vz)); acc = P.airAccel;
  }
  let tx = mx * speed, tz = mz * speed;
  if (p.mode === 'glide' && !moving) { tx = Math.sin(p.yaw) * speed * 0.75; tz = Math.cos(p.yaw) * speed * 0.75; }
  if (p.mode === 'air' && !moving) { tx = p.vx; tz = p.vz; }
  const k = damp(acc, dt);
  p.vx += (tx - p.vx) * k;
  p.vz += (tz - p.vz) * k;

  // --- Steile Hänge: kein Hinaufgehen, Abrutschen
  p.sliding = false;
  if (p.mode === 'ground' && !p.floor) {
    const n = world.terrain.normalAt(p.x, p.z);
    if (n[1] < P.maxSlopeNy) {
      const dl = Math.hypot(n[0], n[2]) || 1;
      const dx = n[0] / dl, dz = n[2] / dl;      // hangabwärts
      const along = p.vx * dx + p.vz * dz;
      if (along < 0) { p.vx -= along * dx; p.vz -= along * dz; }
      const slide = P.gravity * (1 - n[1]) * 0.9;
      p.vx += dx * slide * dt; p.vz += dz * slide * dt;
      p.sliding = true;
    }
  }

  // --- Springen / Gleiter
  if (jump) {
    if (p.mode === 'ground' && !p.sliding) {
      p.vy = P.jumpV; p.mode = 'air'; p.airTime = 0; p.fallStartY = p.y; ev.push({ type: 'jump' });
    } else if (p.mode === 'ground' && p.sliding) {
      p.vy = P.jumpV * 0.6; p.mode = 'air'; p.airTime = 0; p.fallStartY = p.y; ev.push({ type: 'jump' });
    } else if (p.mode === 'swim') {
      p.vy = 6.2; p.mode = 'air'; p.airTime = 0; p.fallStartY = p.y; ev.push({ type: 'jump', water: true });
    } else if (p.mode === 'air' && input.canGlide && p.stamina > 0.02 && !p.exhausted) {
      p.mode = 'glide'; ev.push({ type: 'glideOn' });
    } else if (p.mode === 'glide') {
      p.mode = 'air'; ev.push({ type: 'glideOff' });
    }
  }

  // --- Schwerkraft
  if (p.mode === 'air') {
    p.vy -= P.gravity * dt;
    if (p.vy < -P.maxFall) p.vy = -P.maxFall;
    p.airTime += dt;
  } else if (p.mode === 'glide') {
    p.vy += (-P.glideFall - p.vy) * damp(4, dt);
    p.airTime += dt;
  }

  // --- Waagerecht bewegen + Kollision
  const ox = p.x, oz = p.z;
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  const lim = 505;
  if (p.x < -lim) p.x = -lim; if (p.x > lim) p.x = lim;
  if (p.z < -lim) p.z = -lim; if (p.z > lim) p.z = lim;
  if (world.colliders.pushOut(p, P.radius, p.y + P.stepUp, p.y + P.height)) {
    // Geschwindigkeit an die tatsächliche Bewegung anpassen (an Wänden entlang gleiten)
    if (dt > 0) {
      const rvx = (p.x - ox) / dt, rvz = (p.z - oz) / dt;
      if (Math.hypot(rvx, rvz) < Math.hypot(p.vx, p.vz)) { p.vx = rvx; p.vz = rvz; }
    }
  }

  // --- Senkrecht bewegen
  const oy = p.y;
  p.y += p.vy * dt;
  if (p.vy > 0) {
    const ceil = world.colliders.ceilingAt(p.x, p.z, P.radius * 0.8, oy + P.height - 0.05, p.y + P.height);
    if (ceil < Infinity) { p.y = ceil - P.height - 0.01; p.vy = 0; }
  }
  const g = ground(world, p.x, p.z, Math.max(oy, p.y) + P.stepUp);
  p.floor = g.col;
  const depth = water - g.y;

  if (p.mode === 'swim') {
    if (depth < P.swimDepth - 0.15) {
      p.mode = 'ground'; p.y = g.y; p.vy = 0;
    } else {
      const floatY = water - 1.22;
      p.vy += (floatY - p.y) * 28 * dt;
      p.vy *= 1 - damp(5, dt);
      if (p.y < g.y) { p.y = g.y; if (p.vy < 0) p.vy = 0; }
    }
  } else if (depth > P.swimDepth && p.y < water - 1.15 && (p.mode !== 'ground' || p.y <= g.y + 0.05)) {
    if (p.mode === 'air' || p.mode === 'glide') ev.push({ type: 'splash', v: -p.vy });
    if (p.mode === 'glide') ev.push({ type: 'glideOff' });
    p.mode = 'swim';
    p.vy *= 0.35;
  } else if (p.y <= g.y) {
    if (p.mode === 'air' || p.mode === 'glide') {
      ev.push({ type: 'land', v: -p.vy, fall: p.fallStartY - g.y, surface: g.col ? g.col.mat : null });
      if (p.mode === 'glide') ev.push({ type: 'glideOff' });
    }
    p.y = g.y; p.vy = 0; p.mode = 'ground';
  } else if (p.mode === 'ground') {
    // Hangabwärts am Boden bleiben, an Kanten in den Fall übergehen.
    const snap = 0.45 + Math.hypot(p.vx, p.vz) * dt * 1.5;
    if (p.y - g.y < snap && p.vy <= 0) { p.y = g.y; p.vy = 0; }
    else { p.mode = 'air'; p.airTime = 0; p.fallStartY = p.y; if (p.vy > 0) p.vy = 0; }
  }

  // --- Untergrund und Schritte (die Phase treibt auch die Laufanimation)
  const moved = Math.hypot(p.x - ox, p.z - oz);
  if (p.mode === 'ground') {
    p.surface = g.col ? g.col.mat : world.terrain.surfaceAt(p.x, p.z);
    const before = Math.floor(p.phase / Math.PI);
    p.phase += (moved / (p.running ? STRIDE.run : STRIDE.walk)) * Math.PI;
    if (Math.floor(p.phase / Math.PI) !== before) ev.push({ type: 'step', surface: p.surface, run: p.running });
  } else if (p.mode === 'swim') {
    p.surface = 'water';
    const before = Math.floor(p.phase / Math.PI);
    p.phase += (moved / STRIDE.swim) * Math.PI + dt * 1.2;
    if (Math.floor(p.phase / Math.PI) !== before && moved > 0.005) ev.push({ type: 'stroke' });
  }

  // --- Blickrichtung
  const hs = Math.hypot(p.vx, p.vz);
  p.speed = hs;
  if (hs > 0.4 && (moving || p.mode === 'glide')) {
    const target = Math.atan2(p.vx, p.vz);
    let d = target - p.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    p.yaw += d * damp(p.mode === 'glide' ? 5 : 14, dt);
  }

  // Sicherheitsnetz: aus der Welt gefallen
  if (p.y < -40 || !Number.isFinite(p.y + p.x + p.z)) ev.push({ type: 'lost' });
}
