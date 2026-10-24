// Tesla Roadster 3D — guida libera con fisica a corpo rigido, sospensioni a raggio,
// pneumatici con cerchio d'attrito, aspirazione a ventola e 10 propulsori ad aria compressa.
//
// Dati di riferimento (presentazione del 15/10/2026 e dichiarazioni Tesla/SpaceX):
//  - 10 propulsori a gas freddo: 4 posteriori (>80 kN totali) + 6 su frontale e fiancate,
//    orientati da attuatori elettrici per le micro-correzioni in volo.
//  - 600 L di aria/azoto in serbatoi COPV a ~690 bar (10.000 psi).
//  - Aspirazione a ventole sotto il pianale fino a ~2 g di deportanza.
//  - ~1000 kW, 10.000 Nm alle ruote, trazione posteriore con torque vectoring,
//    passo 2,65 m (modello 3D), velocità massima ~370 km/h, curve oltre 2 g.

import * as THREE from 'three';
import { buildRoadster } from './roadster-model.js';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { buildRoutes } from './routes.js';
import { buildWheel, archLiner } from './wheels.js';
import { T, getLang, setLang, applyI18n, onLang } from './i18n.js';
import { RoomEnvironment } from './vendor/three/examples/jsm/environments/RoomEnvironment.js';

const V3 = THREE.Vector3;
const G = 9.81, RHO = 1.225;

// ---------------------------------------------------------------- parametri auto
const CAR = {
  mass: 1900,             // kg con pilota e serbatoi pieni
  gasKg: 155,             // massa dei 600 L di azoto a 690 bar: l'auto si alleggerisce mentre lo usi
  // gas compresso come nel gioco originale: 600 L, il sollevamento ne usa 180 L/s,
  // boost e getti frenanti la metà, le rotazioni il 18%
  gasL: 600, burn: 180,
  liftG: 2.4, boostG: 2.2, retroG: 1.1, // spinta in g (sollevamento 2,4 g, boost 2,2 g come l'originale)
  inertiaPerKg: new V3(1.53, 1.74, 0.38), // pitch, yaw, roll (m²) — scatola 4.5 × 2.0 × 1.1 m
  com: new V3(0, 0.50, 0.30), // baricentro nel modello (ripartizione 45/55)
  wheelR: 0.358,
  mu: 1.25,               // gomme sportive su cemento
  k: 200000,              // N/m molla per ruota (rigida: l'aspirazione schiaccia l'auto a terra fino a 3 g)
  cBump: 6500, cReb: 17000,
  travelUp: 0.12, travelDown: 0.17,
  wheelTorque: 5000,      // Nm per ruota posteriore (10.000 Nm totali)
  powerPerWheel: 500000,  // W
  vMax: 103,              // m/s (~370 km/h)
  brakePerWheel: 14000,   // N
  CdA: 0.62, ClA: 1.0,
  suctionG: 2.0,
  steerMax: 0.7,
};

const WHEELS = [
  { name: 'wheel_fl', hub: [-0.843, 0.358, -1.155], front: true },
  { name: 'wheel_fr', hub: [0.829, 0.361, -1.154], front: true },
  { name: 'wheel_rl', hub: [-0.821, 0.358, 1.495], front: false },
  { name: 'wheel_rr', hub: [0.824, 0.358, 1.496], front: false },
];

// Coordinate del modello: avanti = -Z, destra = +X, su = +Y.
const THRUSTERS = [
  // 4 posteriori fissi, incassati nel paraurti sopra il diffusore (boost)
  { id: 'P1', kind: 'rear', pos: [-0.62, 0.42, 2.10], max: 12000 },
  { id: 'P2', kind: 'rear', pos: [-0.25, 0.42, 2.125], max: 12000 },
  { id: 'P3', kind: 'rear', pos: [0.25, 0.42, 2.125], max: 12000 },
  { id: 'P4', kind: 'rear', pos: [0.62, 0.42, 2.09], max: 12000 },
  // 2 anteriori orientabili, incassati sotto lo splitter
  { id: 'A1', kind: 'vec', front: true, pos: [-0.50, 0.148, -1.90], max: 11000 },
  { id: 'A2', kind: 'vec', front: true, pos: [0.50, 0.148, -1.90], max: 11000 },
  // 4 orientabili: due ai lati delle portiere (dietro le ruote anteriori, nella minigonna) e due nei
  // quattro angoli posteriori. La posizione "pos" serve al calcolo dei momenti (invariata, così il
  // comportamento resta identico); "vpos" e "vbase" sono dove l'ugello si vede sull'auto.
  { id: 'S1', kind: 'vec', pos: [-0.60, 0.103, -0.55], vpos: [-0.86, 0.25, -0.62], vbase: [-0.55, -0.84, 0], max: 11000 },
  { id: 'S2', kind: 'vec', pos: [-0.55, 0.10, 1.90], max: 11000 },
  { id: 'S3', kind: 'vec', pos: [0.60, 0.103, -0.55], vpos: [0.86, 0.25, -0.62], vbase: [0.55, -0.84, 0], max: 11000 },
  { id: 'S4', kind: 'vec', pos: [0.55, 0.10, 1.90], max: 11000 },
];

// ---------------------------------------------------------------- mondo / collisioni
// Misure del gioco originale: rincorsa, curva r1 = 7 m, parete 9 m, uncino r2 = 5 m a 90°,
// labbro 3 m, larghezza 4,6 m, spessore 0,45 m. Zone d'atterraggio a x = -24 (±5) e x = -76 (±6).
const RAMP = { W: 4.6, T: 0.45, r1: 7, wall: 9, r2: 5, sweep: Math.PI / 2, lip: 3 };
RAMP.top = RAMP.r1 + RAMP.wall + RAMP.r2 * Math.sin(RAMP.sweep);
const START = { ramp: new V3(-8, 0, 0), jump: new V3(-178, 0, 0) };
const LAND_ZONE = { x: -24, z: 0, hx: 5, hz: 3.2 };
const JUMP_ZONE = { x: -76, z: 0, hx: 6, hz: 3.2 };
const AIR_PAD = { x: -40, z: -15, h: 3.2 };

// I cinque veicoli da saltare, con gli stessi profili, misure e colori dell'originale
const VEHICLES = [
  { label: 'il taxi', length: 4.2, width: 1.95, height: 1.42, color: '#c8b48c', metal: .7, body: [[2.1, .42], [1, .9], [-1.6, .94], [-2.1, .85], [-2.12, .42], [-1.9, .25], [1.9, .25]], glass: [[1.05, .86], [.15, 1.38], [-.7, 1.42], [-1.75, .97], [-1.7, .84], [1, .8]], glassMode: 'canopy', wheels: [1.35, -1.35], wheelR: .36 },
  { label: 'il pick-up', length: 5.7, width: 2.2, height: 1.95, color: '#a3a7ab', metal: .85, body: [[2.85, .55], [2.85, 1.12], [.2, 1.95], [-2.85, 1.38], [-2.85, .55], [-2.6, .42], [2.6, .42]], glass: [[1.75, 1.32], [.2, 1.82], [-1, 1.62], [-1, 1.3]], glassMode: 'side', wheels: [1.9, -1.9], wheelR: .45 },
  { label: 'il camion', length: 7.2, width: 2.5, height: 3.95, color: '#ececea', metal: .2, body: [[3.6, .5], [3.6, 1.6], [2.9, 3.4], [2.2, 3.95], [.4, 3.95], [.4, 1.3], [-3.6, 1.3], [-3.6, .6], [3.4, .45]], glass: [[3, 2.25], [2.4, 3.35], [1.2, 3.35], [1.2, 2.25]], glassMode: 'side', wheels: [2.6, -1.7, -2.95], wheelR: .52 },
  { label: 'il SUV', length: 4.75, width: 1.98, height: 1.58, color: '#4b4e53', metal: .6, body: [[2.37, .42], [2.4, .74], [1.4, .98], [-2, 1.08], [-2.37, 1], [-2.4, .48], [-2.2, .3], [2.2, .3]], glass: [[1.3, .96], [.3, 1.55], [-1.3, 1.58], [-2.2, 1.08], [-2.15, .95], [1.2, .9]], glassMode: 'canopy', wheels: [1.45, -1.45], wheelR: .4 },
  { label: 'la berlina', length: 4.7, width: 1.93, height: 1.42, color: '#8f1a1a', metal: .6, body: [[2.35, .38], [2.38, .68], [1.3, .9], [-1.9, .98], [-2.35, .88], [-2.36, .45], [-2.2, .28], [2.2, .28]], glass: [[1.2, .88], [.25, 1.38], [-.9, 1.42], [-2.05, .98], [-2, .86], [1.1, .82]], glassMode: 'canopy', wheels: [1.42, -1.42], wheelR: .38 },
];
{ let o = -124; for (const v of VEHICLES) { v.x0 = o; v.x1 = o + v.length; v.cx = o + v.length / 2; o += v.length + 1.6; } }

function buildProfile() {
  const pts = [], step = 0.25;
  const line = (x0, y0, x1, y1) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let i = 0; i < n; i++) pts.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]);
  };
  const arc = (cx, cy, r, a0, a1) => {
    const n = Math.ceil(Math.abs(a1 - a0) * r / step);
    for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  };
  const { r1, wall, r2, sweep, lip } = RAMP;
  line(-6, 0, 0, 0);
  arc(0, r1, r1, -Math.PI / 2, 0);
  line(r1, r1, r1, r1 + wall);
  arc(r1 - r2, r1 + wall, r2, 0, sweep);
  const ex = r1 - r2 + r2 * Math.cos(sweep), ey = r1 + wall + r2 * Math.sin(sweep), ea = sweep + Math.PI / 2;
  line(ex, ey, ex + Math.cos(ea) * lip, ey + Math.sin(ea) * lip);
  pts.push([ex + Math.cos(ea) * lip, ey + Math.sin(ea) * lip]);
  return pts;
}
const PROFILE = buildProfile();
const NSEG = PROFILE.length - 1;
const SX = new Float64Array(NSEG), SY = new Float64Array(NSEG), SDX = new Float64Array(NSEG), SDY = new Float64Array(NSEG), SINV = new Float64Array(NSEG), SLINV = new Float64Array(NSEG);
const SCUM = new Float64Array(NSEG + 1);
for (let i = 0; i < NSEG; i++) {
  const [ax, ay] = PROFILE[i], [bx, by] = PROFILE[i + 1];
  SX[i] = ax; SY[i] = ay; SDX[i] = bx - ax; SDY[i] = by - ay;
  const l2 = SDX[i] ** 2 + SDY[i] ** 2; SINV[i] = 1 / l2; SLINV[i] = 1 / Math.sqrt(l2);
  SCUM[i + 1] = SCUM[i] + Math.sqrt(l2);
}
const CURVE_S = 6; // inizio della curva (x = 0) lungo il profilo
const RAMP_BOX = { x0: -7, x1: RAMP.r1 + 1, y0: -1, y1: RAMP.top + 1, z: RAMP.W / 2 + 0.5 };
const TRUSS = { L: RAMP.r1 + 0.9, K: RAMP.r1 + 3.6, D: RAMP.top + 2.4, Z: RAMP.W / 2 + 0.4 };

const BOXES = [
  // traliccio dietro la parete e sopra l'uncino
  { cx: (RAMP.r1 + RAMP.T + TRUSS.K) / 2, cy: TRUSS.D / 2, cz: 0, hx: (TRUSS.K - RAMP.r1 - RAMP.T) / 2, hy: TRUSS.D / 2, hz: TRUSS.Z, surf: 'struct' },
  { cx: (-1.5 + TRUSS.K) / 2, cy: (RAMP.top + RAMP.T + TRUSS.D) / 2, cz: 0, hx: (TRUSS.K + 1.5) / 2, hy: (TRUSS.D - RAMP.top - RAMP.T) / 2, hz: TRUSS.Z, surf: 'struct' },
];
// collisioni dei veicoli: fette di 0,5 m che seguono il profilo della carrozzeria e dei vetri
function polyTop(poly, x) {
  let top = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (a[0] === b[0] || (a[0] - x) * (b[0] - x) > 0) continue;
    top = Math.max(top, a[1] + (x - a[0]) / (b[0] - a[0]) * (b[1] - a[1]));
  }
  return top;
}
// I cinque veicoli sono corpi rigidi: si spostano, scivolano e si urtano se li colpisci.
// Le collisioni seguono il profilo (fette di 0,5 m di carrozzeria e vetri) nel loro riferimento.
const VEH_MASS = [1500, 2400, 7500, 2100, 1600]; // taxi, pick-up, camion, SUV, berlina
const VEH = VEHICLES.map((v, idx) => {
  const comY = v.height * 0.38, boxes = [];
  for (const [poly, hw] of [[v.body, (v.width - 0.08) / 2], [v.glass, v.glassMode === 'canopy' ? 0.37 * v.width : (v.width + 0.02) / 2]]) {
    const xs = poly.map(p => p[0]), lo = Math.min(...xs), hi = Math.max(...xs);
    for (let x = lo; x < hi - 1e-3; x += 0.5) {
      const x1 = Math.min(hi, x + 0.5);
      const top = Math.max(polyTop(poly, x + 1e-3), polyTop(poly, (x + x1) / 2), polyTop(poly, x1 - 1e-3));
      if (!(top > 0)) continue;
      boxes.push({ cx: (x + x1) / 2, cy: top / 2 - comY, cz: 0, hx: (x1 - x) / 2, hy: top / 2, hz: hw });
    }
  }
  const L = v.length, H = v.height, Wd = v.width, m = VEH_MASS[idx], pts = [];
  for (const sx of [-1, -0.5, 0, 0.5, 1]) for (const sz of [-1, 1]) pts.push(new V3(sx * (L / 2 - 0.15), -comY, sz * (Wd / 2 - 0.08)));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { pts.push(new V3(sx * L / 2 * 0.85, H * 0.85 - comY, sz * Wd / 2 * 0.85)); pts.push(new V3(sx * L / 2, H * 0.45 - comY, sz * Wd / 2)); }
  return { idx, v, m, comY, boxes, pts, home: new V3(v.cx, comY, 0), pos: new V3(v.cx, comY, 0), q: new THREE.Quaternion(), qi: new THREE.Quaternion(), vel: new V3(), w: new V3(),
    inv: new V3(12 / (m * (H * H + Wd * Wd)), 12 / (m * (L * L + Wd * Wd)), 12 / (m * (L * L + H * H))), R: Math.hypot(L / 2, H, Wd / 2) + 0.3, awake: false, still: 0, group: null };
});
const BODIES = VEH.slice(); // veicoli + casse (le casse si aggiungono dopo, quando la mappa è costruita)
const _vl = new V3(), _vN = new V3();
let _vehFound = false;
function vehSDF(V, p, nOut, best) {
  _vl.subVectors(p, V.pos);
  if (_vl.length() - V.R > best) return best;
  _vl.applyQuaternion(V.qi);
  let nx = 0, ny = 0, nz = 0;
  for (const b of V.boxes) {
    const ex = _vl.x - b.cx, ey = _vl.y - b.cy, ez = _vl.z - b.cz;
    const dx = Math.abs(ex) - b.hx, dy = Math.abs(ey) - b.hy, dz = Math.abs(ez) - b.hz;
    if (dx > best || dy > best || dz > best) continue;
    const ox = Math.max(dx, 0), oy = Math.max(dy, 0), oz = Math.max(dz, 0), out = Math.hypot(ox, oy, oz);
    const d = out + Math.min(Math.max(dx, dy, dz), 0);
    if (d >= best) continue;
    best = d; _vehFound = true;
    if (out > 0) { nx = ox * Math.sign(ex) / out; ny = oy * Math.sign(ey) / out; nz = oz * Math.sign(ez) / out; }
    else if (dx > dy && dx > dz) { nx = Math.sign(ex) || 1; ny = 0; nz = 0; }
    else if (dy > dz) { nx = 0; ny = Math.sign(ey) || 1; nz = 0; }
    else { nx = 0; ny = 0; nz = Math.sign(ez) || 1; }
  }
  if (_vehFound) nOut.set(nx, ny, nz).applyQuaternion(V.q);
  return best;
}
const _vi = new V3();
function vehInvI(V, vec, out) { out.copy(vec).applyQuaternion(V.qi); out.set(out.x * V.inv.x, out.y * V.inv.y, out.z * V.inv.z); return out.applyQuaternion(V.q); }
function vehImpulse(V, J, p) {
  V.vel.addScaledVector(J, 1 / V.m);
  _vi.subVectors(p, V.pos).cross(J); V.w.add(vehInvI(V, _vi, _vi));
  V.awake = true; V.still = 0;
}
function vehPointVel(V, p, out) { return out.subVectors(p, V.pos).cross(V.w).negate().add(V.vel); } // v + w × r
function resetVehicles() { for (const V of BODIES) { V.pos.copy(V.home); V.q.identity(); V.qi.identity(); V.vel.set(0, 0, 0); V.w.set(0, 0, 0); V.awake = false; V.still = 0; } }

let lastSurf = 'ground', lastBoxIdx = -1;
const _rn = new V3();

// posizione lungo il profilo (per i LED che si accendono mentre sali)
function rampS(px, py) {
  let best = Infinity, s = 0;
  for (let i = 0; i < NSEG; i++) {
    let t = ((px - SX[i]) * SDX[i] + (py - SY[i]) * SDY[i]) * SINV[i];
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = SX[i] + SDX[i] * t - px, qy = SY[i] + SDY[i] * t - py, d2 = qx * qx + qy * qy;
    if (d2 < best) { best = d2; s = SCUM[i] + t * (SCUM[i + 1] - SCUM[i]); }
  }
  return s;
}

function rampSDF(p, nOut) {
  const px = p.x, py = p.y;
  let best = Infinity, bi = 0, bt = 0;
  for (let i = 0; i < NSEG; i++) {
    let t = ((px - SX[i]) * SDX[i] + (py - SY[i]) * SDY[i]) * SINV[i];
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = SX[i] + SDX[i] * t - px, qy = SY[i] + SDY[i] * t - py;
    const d2 = qx * qx + qy * qy;
    if (d2 < best) { best = d2; bi = i; bt = t; }
  }
  const tx = SDX[bi] * SLINV[bi], ty = SDY[bi] * SLINV[bi];
  const nx = -ty, ny = tx;
  const rx = px - (SX[bi] + SDX[bi] * bt), ry = py - (SY[bi] + SDY[bi] * bt);
  let along = 0, ax = 0, ay = 0;
  if (bi === 0 && bt === 0) { along = Math.max(0, -(rx * tx + ry * ty)); ax = -tx; ay = -ty; }
  else if (bi === NSEG - 1 && bt === 1) { along = Math.max(0, rx * tx + ry * ty); ax = tx; ay = ty; }
  const u = rx * nx + ry * ny;
  const cu = u + RAMP.T / 2;
  const qu = Math.abs(cu) - RAMP.T / 2, qz = Math.abs(p.z) - RAMP.W / 2;
  const ou = Math.max(qu, 0), oz = Math.max(qz, 0);
  const outside = Math.hypot(along, ou, oz);
  if (outside > 1e-6) {
    const su = Math.sign(cu) || 1, sz = Math.sign(p.z) || 1;
    nOut.set((ax * along + nx * ou * su) / outside, (ay * along + ny * ou * su) / outside, (oz * sz) / outside);
    return outside;
  }
  if (qu > qz) { const su = Math.sign(cu) || 1; nOut.set(nx * su, ny * su, 0); }
  else nOut.set(0, 0, Math.sign(p.z) || 1);
  return Math.max(qu, qz);
}

let routes = null; // percorsi aggiuntivi (routes.js)
const _rsN = new V3();
function sdf(p, nOut, skipVeh = -1) {
  let best; lastBoxIdx = -1;
  if (routes) { best = routes.ground(p, nOut); lastSurf = routes.inHills(p.x, p.z) ? 'terrain' : 'ground'; }
  else { best = p.y; nOut.set(0, 1, 0); lastSurf = 'ground'; }
  for (let i = 0; i < BOXES.length; i++) {
    const b = BOXES[i];
    const ex = p.x - b.cx, ey = p.y - b.cy, ez = p.z - b.cz;
    const dx = Math.abs(ex) - b.hx, dy = Math.abs(ey) - b.hy, dz = Math.abs(ez) - b.hz;
    if (dx > best || dy > best || dz > best) continue;
    const ox = Math.max(dx, 0), oy = Math.max(dy, 0), oz = Math.max(dz, 0);
    const outside = Math.hypot(ox, oy, oz);
    const d = outside + Math.min(Math.max(dx, dy, dz), 0);
    if (d < best) {
      best = d; lastSurf = b.surf; lastBoxIdx = b.idx ?? -1;
      if (outside > 0) nOut.set(ox * Math.sign(ex), oy * Math.sign(ey), oz * Math.sign(ez)).divideScalar(outside);
      else if (dx > dy && dx > dz) nOut.set(Math.sign(ex) || 1, 0, 0);
      else if (dy > dz) nOut.set(0, Math.sign(ey) || 1, 0);
      else nOut.set(0, 0, Math.sign(ez) || 1);
    }
  }
  for (let i = 0; i < BODIES.length; i++) {
    if (i === skipVeh) continue;
    _vehFound = false; const d = vehSDF(BODIES[i], p, _vN, best);
    if (_vehFound) { best = d; nOut.copy(_vN); lastSurf = 'parked'; lastBoxIdx = i; }
  }
  // limite inferiore con il volume della rampa per saltare il calcolo quando è lontana
  const bx = Math.max(RAMP_BOX.x0 - p.x, 0, p.x - RAMP_BOX.x1), by = Math.max(RAMP_BOX.y0 - p.y, 0, p.y - RAMP_BOX.y1), bz = Math.max(Math.abs(p.z) - RAMP_BOX.z, 0);
  if (Math.hypot(bx, by, bz) < best) {
    const d = rampSDF(p, _rn);
    if (d < best) { best = d; nOut.copy(_rn); lastSurf = 'ramp'; lastBoxIdx = -1; }
  }
  if (routes) { const d = routes.sdf(p, best, _rsN); if (d < best) { best = d; nOut.copy(_rsN); lastSurf = routes.lastSurf; lastBoxIdx = -1; } }
  return best;
}

// ---------------------------------------------------------------- renderer e scena
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.prepend(renderer.domElement);
renderer.domElement.tabIndex = 0;

const scene = new THREE.Scene();
const BG = new THREE.Color('#000000');
scene.background = BG;
scene.fog = new THREE.FogExp2(BG, 0.008);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.12, 2500); // near più grande = profondità più precisa
scene.add(new THREE.HemisphereLight(0xbfc6d0, 0x1a1816, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 2.1);
sun.position.set(-30, 60, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 200 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03; // niente acne d'ombra tremolante
scene.add(sun, sun.target);
routes = buildRoutes(THREE, scene);
{ // casse da sfondare della mappa test: stessi corpi rigidi dei veicoli, un solo box ciascuna
  const tex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#b08448'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 128; i += 21) { g.fillStyle = i % 42 ? '#a77c42' : '#b88c50'; g.fillRect(0, i, 128, 20); g.fillStyle = '#6d4c26'; g.fillRect(0, i + 20, 128, 2); }
    g.strokeStyle = '#5a3d1e'; g.lineWidth = 9; g.strokeRect(5, 5, 118, 118); g.lineWidth = 6; g.beginPath(); g.moveTo(8, 8); g.lineTo(120, 120); g.moveTo(120, 8); g.lineTo(8, 120); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0 });
  for (const d of routes.props) {
    const L = d.hx * 2, H = d.hy * 2, Wd = d.hz * 2, m = d.m, pts = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pts.push(new V3(sx * d.hx * 0.98, sy * d.hy * 0.98, sz * d.hz * 0.98));
    for (const a of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) pts.push(new V3(a[0] * d.hx, a[1] * d.hy, a[2] * d.hz));
    const B = { idx: BODIES.length, v: null, m, comY: 0, boxes: [{ cx: 0, cy: 0, cz: 0, hx: d.hx, hy: d.hy, hz: d.hz }], pts, home: new V3(d.x, d.y, d.z), pos: new V3(d.x, d.y, d.z), q: new THREE.Quaternion(), qi: new THREE.Quaternion(), vel: new V3(), w: new V3(),
      inv: new V3(12 / (m * (H * H + Wd * Wd)), 12 / (m * (L * L + Wd * Wd)), 12 / (m * (L * L + H * H))), R: Math.hypot(d.hx, d.hy, d.hz) + 0.1, awake: false, still: 0, group: null, prop: true };
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(L, H, Wd), mat); mesh.castShadow = mesh.receiveShadow = true; mesh.position.copy(B.pos); scene.add(mesh); B.group = mesh;
    BODIES.push(B);
  }
}

// terreno e segnaletica come l'originale
{
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#121213'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,.025)'; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(250, 250);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); tex.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.78, metalness: 0.15, envMapIntensity: 0.3, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 })); // il terreno sta sempre dietro a strade e segnaletica
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const lineMat = new THREE.MeshBasicMaterial({ color: '#8d8d8a', transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2 });
  const line = (x0, z0, x1, z1, w) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(x1 - x0, z1 - z0), w), lineMat);
    m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(z1 - z0, x1 - x0);
    m.position.set((x0 + x1) / 2, 0.005, (z0 + z1) / 2); scene.add(m);
  };
  line(-70, -26, 12, 22, 0.16); line(-70, 26, 12, -22, 0.16); line(-190, 0, -40, 0, 0.12);
  for (const zn of [LAND_ZONE, JUMP_ZONE]) {
    const { x, hx } = zn;
    line(x - hx, -3.2, x + hx, -3.2, 0.2); line(x - hx, 3.2, x + hx, 3.2, 0.2);
    line(x - hx, -3.2, x - hx, 3.2, 0.2); line(x + hx, -3.2, x + hx, 3.2, 0.2);
  }
  // barre a LED rosse con le lampadine bianche
  const red = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a1f').multiplyScalar(2.2), toneMapped: false });
  const white = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(2), toneMapped: false });
  const bulb = new THREE.SphereGeometry(0.07, 6, 4);
  const rail = (x0, x1, z) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.08, 0.08), red); b.position.set((x0 + x1) / 2, 0.05, z); scene.add(b);
    const n = Math.floor((x1 - x0) / 2), im = new THREE.InstancedMesh(bulb, white, n), m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { m.makeTranslation(x0 + 1 + 2 * i, 0.35, z - 0.4 * Math.sign(z)); im.setMatrixAt(i, m); }
    scene.add(im);
  };
  rail(-66, -2, -9); rail(-190, -60, -9);
}

function textSprite(text, color = '#9fd8ff') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d'); g.font = '500 54px "General Sans", system-ui'; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 48);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(4, 1.5, 1); return s;
}

// stazione di ricarica del gas
{
  const h = AIR_PAD.h;
  const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) => new V3(AIR_PAD.x + a * h, 0.03, AIR_PAD.z + b * h));
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#9fd8ff' })));
  const f = new THREE.Mesh(new THREE.PlaneGeometry(2 * h, 2 * h), new THREE.MeshBasicMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.08, depthWrite: false }));
  f.rotation.x = -Math.PI / 2; f.position.set(AIR_PAD.x, 0.025, AIR_PAD.z); scene.add(f);
  const s = textSprite('GAS'); s.position.set(AIR_PAD.x, 2.6, AIR_PAD.z); scene.add(s);
}

// rampa a J come l'originale: cemento, linea bianca, LED rossi che diventano bianchi mentre sali, traliccio
const rampLed = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color('#ff3326') }, uLit: { value: new THREE.Color('#ffffff').multiplyScalar(0.2) }, uProgress: { value: -1 }, uIntensity: { value: 2.2 } },
  vertexShader: `attribute float aS; varying float vS; void main(){ vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform vec3 uColor; uniform vec3 uLit; uniform float uProgress; uniform float uIntensity; varying float vS;
    void main(){ float lit = smoothstep(uProgress + 0.6, uProgress - 0.6, vS); gl_FragColor = vec4(mix(uColor, uLit, lit) * uIntensity, 1.0); }`,
  toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
});
{
  const W = RAMP.W, T = RAMP.T, n = W / 2, grp = new THREE.Group(); grp.position.y = 0.01; scene.add(grp);
  const S = PROFILE.map((p, i) => {
    const a = PROFILE[Math.max(0, i - 1)], b = PROFILE[Math.min(PROFILE.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
    return { x: p[0], y: p[1], s: SCUM[i], nx: -dy / l, ny: dx / l };
  });
  const pos = [], nor = [], uv = [], idx = [];
  const strip = fn => {
    const base = pos.length / 3;
    for (const e of S) for (const i of [0, 1]) { const r = fn(e, i); pos.push(...r.v); nor.push(...r.n); uv.push(...r.uv); }
    for (let e = 0; e < S.length - 1; e++) { const i = base + 2 * e; idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
  };
  strip((e, i) => ({ v: [e.x, e.y, i ? -n : n], n: [e.nx, e.ny, 0], uv: [e.s / 4, i ? 0 : W / 4] }));
  strip((e, t) => ({ v: [e.x - T * e.nx, e.y - T * e.ny, t ? n : -n], n: [-e.nx, -e.ny, 0], uv: [e.s / 4, t] }));
  strip((e, t) => ({ v: [e.x - T * e.nx * t, e.y - T * e.ny * t, n], n: [0, 0, 1], uv: [e.s / 4, 0.1 * t] }));
  strip((e, t) => ({ v: [e.x - T * e.nx * (1 - t), e.y - T * e.ny * (1 - t), -n], n: [0, 0, -1], uv: [e.s / 4, 0.1 * t] }));
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); dg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); dg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); dg.setIndex(idx);
  const ct = document.createElement('canvas'); ct.width = ct.height = 256;
  const g = ct.getContext('2d'); g.fillStyle = '#9c9c98'; g.fillRect(0, 0, 256, 256);
  const im = g.getImageData(0, 0, 256, 256);
  for (let k = 0; k < im.data.length; k += 4) { const d = (Math.random() - 0.5) * 34 + (Math.random() < 0.02 ? -40 : 0); im.data[k] += d; im.data[k + 1] += d; im.data[k + 2] += d; }
  g.putImageData(im, 0, 0);
  for (let k = 0; k < 6; k++) { const gr = g.createRadialGradient(256 * Math.random(), 256 * Math.random(), 0, 256 * Math.random(), 256 * Math.random(), 60 + 60 * Math.random()); gr.addColorStop(0, 'rgba(60,60,58,0.12)'); gr.addColorStop(1, 'rgba(60,60,58,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
  g.fillStyle = 'rgba(40,40,40,0.55)'; g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(ct); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const deck = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }));
  deck.receiveShadow = deck.castShadow = true; grp.add(deck);
  const band = (z, w, off, withS) => {
    const p = [], a = [], ix = [];
    S.forEach((e, l) => { for (const sg of [-1, 1]) { p.push(e.x + e.nx * off, e.y + e.ny * off, z + sg * w / 2); a.push(e.s); } if (l < S.length - 1) { const k = 2 * l; ix.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } });
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); if (withS) bg.setAttribute('aS', new THREE.Float32BufferAttribute(a, 1)); bg.setIndex(ix); return bg;
  };
  grp.add(new THREE.Mesh(band(0.1 * W, 0.12, 0.01, false), new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.7, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })));
  const sideBand = z => {
    const p = [], a = [], ix = [];
    S.forEach((e, l) => { for (const d of [0.02, 0.16]) { p.push(e.x - e.nx * d, e.y - e.ny * d, z); a.push(e.s); } if (l < S.length - 1) { const k = 2 * l; ix.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } });
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); bg.setAttribute('aS', new THREE.Float32BufferAttribute(a, 1)); bg.setIndex(ix); return bg;
  };
  for (const bgeo of [band(n - 0.05, 0.1, 0.02, true), band(-n + 0.05, 0.1, 0.02, true), sideBand(n + 0.015), sideBand(-n - 0.015)]) grp.add(new THREE.Mesh(bgeo, rampLed));

  // traliccio (stesso disegno dell'originale)
  const L = [], A = (a, b) => L.push(...a, ...b);
  const { L: tL, K: tK, D } = TRUSS, Pz = [n + 0.4, -n - 0.4], lv = [];
  for (let y = 0; y < D; y += 2.4) lv.push(y); lv.push(D);
  for (const z of Pz) {
    for (const x of [tL, tK]) A([x, 0, z], [x, D, z]);
    for (let t = 0; t < lv.length; t++) { A([tL, lv[t], z], [tK, lv[t], z]); if (t > 0) A([tL, lv[t - 1], z], [tK, lv[t], z]); }
  }
  for (let t = 0; t < lv.length; t++) for (const x of [tL, tK]) { A([x, lv[t], Pz[0]], [x, lv[t], Pz[1]]); if (t > 0) A([x, lv[t - 1], Pz[0]], [x, lv[t], Pz[1]]); }
  const I = Math.min(PROFILE[PROFILE.length - 1][0], RAMP.r1 - RAMP.r2) - 0.5;
  for (const z of Pz) {
    A([I, D, z], [tK, D, z]); A([I, D - 1.6, z], [tL, D - 1.6, z]);
    for (let x = I; x < tL; x += 1.6) { A([x, D, z], [x, D - 1.6, z]); A([x, D - 1.6, z], [Math.min(tL, x + 1.6), D, z]); }
  }
  for (let x = I; x < tK; x += 1.6) A([x, D, Pz[0]], [x, D, Pz[1]]);
  for (const e of S) {
    if (e.s < CURVE_S + 1 || Math.round(e.s / 0.25) % 8 !== 0) continue;
    const ix = e.x - T * e.nx, iy = e.y - T * e.ny, top = e.y > RAMP.top - 0.5;
    const rx = top ? ix : tL, ry = top ? D - 1.6 : iy;
    if (Math.hypot(rx - ix, ry - iy) >= 0.3) for (const z of Pz) A([ix, iy, 0.9 * z], [rx, ry, z]);
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(L, 3));
  grp.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#7a7a78', transparent: true, opacity: 0.75 })));
}

// veicoli da saltare: profili estrusi come l'originale
{
  const glassMat = new THREE.MeshStandardMaterial({ color: '#0f1114', roughness: 0.16, metalness: 0.5, envMapIntensity: 0.8, flatShading: true });
  const tyreMat = new THREE.MeshStandardMaterial({ color: '#101011', roughness: 0.85, flatShading: true });
  const hubMat = new THREE.MeshStandardMaterial({ color: '#2b2c2f', roughness: 0.4, metalness: 0.6, flatShading: true });
  const extrude = (poly, depth, bevel) => {
    const sh = new THREE.Shape(); sh.moveTo(poly[0][0], poly[0][1]); for (const [x, y] of poly.slice(1)) sh.lineTo(x, y); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, steps: 1 });
    geo.translate(0, 0, -depth / 2); return geo;
  };
  for (const v of VEHICLES) {
    const g = new THREE.Group(); g.position.x = v.cx;
    const body = new THREE.Mesh(extrude(v.body, v.width - 0.08, 0.04), new THREE.MeshStandardMaterial({ color: v.color, roughness: 0.32, metalness: v.metal, flatShading: true }));
    body.castShadow = body.receiveShadow = true; g.add(body);
    g.add(new THREE.Mesh(extrude(v.glass, v.glassMode === 'canopy' ? 0.74 * v.width : v.width + 0.02, 0.03), glassMat));
    const wg = new THREE.CylinderGeometry(v.wheelR, v.wheelR, 0.3, 16); wg.rotateX(Math.PI / 2);
    const hg = new THREE.CylinderGeometry(0.62 * v.wheelR, 0.62 * v.wheelR, 0.32, 12); hg.rotateX(Math.PI / 2);
    for (const wx of v.wheels) for (const sd of [1, -1]) {
      const t = new THREE.Mesh(wg, tyreMat); t.position.set(wx, v.wheelR, sd * (v.width / 2 - 0.12)); t.castShadow = true;
      const hb = new THREE.Mesh(hg, hubMat); hb.position.copy(t.position); g.add(t, hb);
    }
    scene.add(g); VEH[VEHICLES.indexOf(v)].group = g;
  }
}

// ---------------------------------------------------------------- particelle
const FX_N = 26000;
// zone dove le particelle possono urtare rampa, traliccio e veicoli (fuori basta il terreno)
const FX_VEHBOX = { x0: -125, x1: -90, y1: 4.6, z0: -1.7, z1: 1.7 }; // aggiornato ogni fotogramma (i veicoli si muovono)
const FX_NEAR = (x, y, z) => (x > -7 && x < TRUSS.K + 0.5 && y < TRUSS.D + 1 && Math.abs(z) < TRUSS.Z + 0.6) || (x > FX_VEHBOX.x0 && x < FX_VEHBOX.x1 && y < FX_VEHBOX.y1 && z > FX_VEHBOX.z0 && z < FX_VEHBOX.z1);
// texture della condensa: 4 sbuffi di rumore frattale con il cuore più denso e un po' d'ombra propria
function cloudAtlas() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = 2 * S;
  const g = c.getContext('2d'), img = g.createImageData(2 * S, 2 * S), D = img.data;
  const hash = (x, y, s) => { const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };
  const vn = (x, y, s) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c2 = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s); return a + (b - a) * u + (c2 - a) * v + (a - b - c2 + d) * u * v; };
  const fbm = (x, y, s) => { let f = 0, a = 0.5, fr = 1; for (let o = 0; o < 5; o++) { f += a * vn(x * fr, y * fr, s + o * 13); fr *= 2.03; a *= 0.5; } return f; };
  for (let cell = 0; cell < 4; cell++) {
    const ox = (cell % 2) * S, oy = Math.floor(cell / 2) * S, seed = cell * 7.3 + 1;
    const dens = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S - 0.5, v = y / S - 0.5, r = Math.sqrt(u * u + v * v) * 2;
      const fall = Math.max(0, 1 - r); const n = fbm(u * 4 + 9, v * 4 + 3, seed);
      dens[y * S + x] = Math.min(1, Math.max(0, (n * 1.25 - 0.28) * 1.9) * Math.pow(fall, 0.7) + 0.55 * Math.pow(fall, 3));
    }
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = dens[y * S + x], occ = dens[Math.min(S - 1, y + 3) * S + Math.min(S - 1, x + 2)];
      const lit = 0.8 + 0.2 * (1 - Math.max(0, occ - d) * 3) - 0.08 * d; // ombra propria morbida
      const i = 4 * ((oy + y) * 2 * S + ox + x);
      D[i] = D[i + 1] = D[i + 2] = Math.round(255 * Math.min(1, Math.max(0.55, lit))); D[i + 3] = Math.round(255 * Math.pow(d, 0.85));
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; return t;
}
// Aria compressa: l'azoto esce dall'ugello quasi trasparente e velocissimo (nucleo del getto),
// si espande e si raffredda formando una nebbia di condensa bianca più a valle; l'aria ferma lo
// frena (resistenza quadratica), la nuvola si allarga, all'inizio è fredda e densa e scende, poi
// si scalda e sale. I getti spingono tutte le particelle che incontrano, l'auto si trascina dietro
// la scia, la ventola d'aspirazione le risucchia e sul terreno il getto solleva polvere.
const KIND = { GAS: 0, SMOKE: 1, DUST: 2, DIRT: 3 };
class Fx {
  constructor() {
    this.pos = new Float32Array(FX_N * 3); this.vel = new Float32Array(FX_N * 3);
    this.life = new Float32Array(FX_N); this.maxLife = new Float32Array(FX_N).fill(1);
    this.size0 = new Float32Array(FX_N); this.size1 = new Float32Array(FX_N); this.kind = new Uint8Array(FX_N);
    this.cursor = 0; this.frame = 0; this.jets = [];
    this.density = 1.4;
    this.colors = [new THREE.Color('#ffffff'), new THREE.Color('#e6e6e3'), new THREE.Color('#b9b6af'), new THREE.Color('#8c7453')];
    this.geom = new THREE.BufferGeometry();
    this.geom.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(FX_N), 1).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(new Float32Array(FX_N), 1).setUsage(THREE.DynamicDrawUsage);
    this.tintAttr = new THREE.BufferAttribute(new Float32Array(FX_N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.seedAttr = new THREE.BufferAttribute(new Float32Array(FX_N).map(() => Math.random()), 1);
    this.geom.setAttribute('aSize', this.sizeAttr); this.geom.setAttribute('aAlpha', this.alphaAttr); this.geom.setAttribute('aTint', this.tintAttr); this.geom.setAttribute('aSeed', this.seedAttr);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 }, uTex: { value: cloudAtlas() } },
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aTint; attribute float aSeed; uniform float uScale;
        varying float vAlpha; varying vec3 vTint; varying float vSeed;
        void main(){ vAlpha = aAlpha; vTint = aTint; vSeed = aSeed; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(aSize * uScale / max(0.1, -mv.z), 460.0); gl_Position = projectionMatrix * mv; }`,
      // sbuffo volumetrico: una delle 4 texture di condensa, ruotata per particella, luce dall'alto
      fragmentShader: `uniform sampler2D uTex; varying float vAlpha; varying vec3 vTint; varying float vSeed;
        void main(){ vec2 pc = gl_PointCoord - 0.5; float an = vSeed * 6.2831; float cs = cos(an), sn = sin(an);
          vec2 rc = vec2(cs * pc.x - sn * pc.y, sn * pc.x + cs * pc.y) + 0.5;
          if (rc.x < 0.0 || rc.x > 1.0 || rc.y < 0.0 || rc.y > 1.0) discard;
          float cell = floor(vSeed * 3.999); vec2 off = vec2(mod(cell, 2.0), floor(cell / 2.0)) * 0.5;
          vec4 tx = texture2D(uTex, off + rc * 0.5);
          float a = tx.a * vAlpha; if (a < 0.004) discard;
          float shade = 0.86 + 0.2 * (1.0 - gl_PointCoord.y);
          gl_FragColor = vec4(vTint * tx.rgb * shade, a); }`,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(this.geom, this.mat); this.points.frustumCulled = false;
    this.tP = new V3(); this.tV = new V3(); this.tN = new V3(); this.qi = new THREE.Quaternion(); this.tC = new V3();
  }
  setScale(h, fov) { this.mat.uniforms.uScale.value = h / (2 * Math.tan(fov * Math.PI / 360)); }
  emit(kind, p, v, life, s0, s1) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % FX_N;
    this.pos[3 * i] = p.x; this.pos[3 * i + 1] = p.y; this.pos[3 * i + 2] = p.z;
    this.vel[3 * i] = v.x; this.vel[3 * i + 1] = v.y; this.vel[3 * i + 2] = v.z;
    this.life[i] = 0; this.maxLife[i] = life; this.size0[i] = s0; this.size1[i] = s1; this.kind[i] = kind;
  }
  // getto: la condensa compare tra 0,15 e 0,9 m dall'ugello, più lenta quanto più è lontana
  gas(p, dir, vel, n, r = 1) {
    for (let a = 0; a < n; a++) {
      const u = 0.85 * Math.pow(Math.random(), 0.9); // nebbia fin dalla bocca dell'ugello
      const sp = (30 + 18 * Math.random()) * r * (1 - 0.45 * u), j = 2 + 3 * u;
      this.tV.copy(dir).multiplyScalar(sp).add(vel);
      this.tV.x += (Math.random() - 0.5) * j; this.tV.y += (Math.random() - 0.5) * j; this.tV.z += (Math.random() - 0.5) * j;
      this.tP.copy(p).addScaledVector(dir, u * r);
      this.emit(KIND.GAS, this.tP, this.tV, (1.5 + 1.8 * Math.random()) * (0.7 + 0.4 * r), (0.12 + 0.35 * u) * r, (2.8 + 2.8 * Math.random()) * r);
    }
  }
  smoke(p, n, spread, up, r = 1) {
    for (let a = 0; a < n; a++) {
      this.tV.set((Math.random() - 0.5) * spread, up * (0.4 + Math.random()), (Math.random() - 0.5) * spread);
      this.tP.set(p.x + (Math.random() - 0.5) * 0.6, p.y + 0.3 * Math.random(), p.z + (Math.random() - 0.5) * 0.6);
      this.emit(KIND.SMOKE, this.tP, this.tV, 1.8 + 1.8 * Math.random(), 0.6 * r, (2.6 + 2.4 * Math.random()) * r);
    }
  }
  // polvere sollevata dal getto che colpisce il suolo (marrone sullo sterrato, grigia sul cemento)
  dust(x, y, z, vx, vz, dirt) {
    const sp = 0.6 + Math.random();
    this.tV.set(vx * sp + (Math.random() - 0.5) * 2, 1 + 2.5 * Math.random(), vz * sp + (Math.random() - 0.5) * 2);
    this.tP.set(x, y, z);
    this.emit(dirt ? KIND.DIRT : KIND.DUST, this.tP, this.tV, 1.6 + 2 * Math.random(), 0.3, 1.6 + 1.6 * Math.random());
  }
  update(dt) {
    this.frame++;
    const sz = this.sizeAttr.array, al = this.alphaAttr.array, ti = this.tintAttr.array, P = this.pos, Vv = this.vel;
    const qi = this.qi.copy(car.q).invert(), cp = car.pos, cv = car.v, tm = performance.now() / 1000;
    const L = this.tP, N = this.tN, jets = this.jets, nj = jets.length;
    const fan = car.contacts > 0 ? car.fan : 0;
    const under = this.tC.set(0, -0.35, -0.3).applyQuaternion(car.q).add(cp); // centro del pianale
    FX_VEHBOX.x0 = Infinity; FX_VEHBOX.x1 = -Infinity; FX_VEHBOX.y1 = 0; FX_VEHBOX.z0 = Infinity; FX_VEHBOX.z1 = -Infinity;
    for (const V of VEH) { FX_VEHBOX.x0 = Math.min(FX_VEHBOX.x0, V.pos.x - V.R); FX_VEHBOX.x1 = Math.max(FX_VEHBOX.x1, V.pos.x + V.R); FX_VEHBOX.y1 = Math.max(FX_VEHBOX.y1, V.pos.y + V.R); FX_VEHBOX.z0 = Math.min(FX_VEHBOX.z0, V.pos.z - V.R); FX_VEHBOX.z1 = Math.max(FX_VEHBOX.z1, V.pos.z + V.R); }
    for (let r = 0; r < FX_N; r++) {
      if (this.life[r] >= this.maxLife[r]) { al[r] = 0; sz[r] = 0; continue; }
      this.life[r] += dt;
      const age = this.life[r], a = Math.min(1, age / this.maxLife[r]), kind = this.kind[r], gas = kind === KIND.GAS, i3 = 3 * r;
      let vx = Vv[i3], vy = Vv[i3 + 1], vz = Vv[i3 + 2];
      if (gas) {
        const sp = Math.sqrt(vx * vx + vy * vy + vz * vz), k = Math.exp(-0.5 * dt) / (1 + 0.35 * sp * dt);
        vx *= k; vy *= k; vz *= k;
        vy += (age < 0.5 ? -1.6 : 0.25) * dt;              // fredda e densa, poi si scalda
        const tw = 1.2 * (0.5 + a);                          // turbolenza che cresce rallentando
        vx += Math.sin(P[i3 + 1] * 0.9 + tm * 1.7 + r) * tw * dt;
        vz += Math.cos(P[i3] * 0.8 + tm * 1.3 + r * 0.7) * tw * dt;
        vy += Math.sin(P[i3 + 2] * 0.7 + tm * 1.1) * 0.5 * tw * dt;
      } else if (kind === KIND.SMOKE) { const k = Math.exp(-0.9 * dt); vx *= k; vy = vy * k + 0.5 * dt; vz *= k; }
      else { const k = Math.exp(-1.4 * dt); vx *= k; vy = vy * k - 2.5 * dt; vz *= k; } // la polvere ricade
      // i getti attivi spingono tutto ciò che incontrano lungo il loro asse
      for (let q = 0; q < nj; q++) {
        const j = jets[q], dx = P[i3] - j.x, dy = P[i3 + 1] - j.y, dz = P[i3 + 2] - j.z;
        const along = dx * j.dx + dy * j.dy + dz * j.dz;
        if (along < -0.2 || along > 14) continue;
        const r2 = dx * dx + dy * dy + dz * dz - along * along, sg = 0.12 + 0.11 * Math.max(along, 0);
        if (r2 > 9 * sg * sg) continue;
        const g = j.s * 38 / (1 + 0.6 * Math.max(along, 0)) * Math.exp(-r2 / (2 * sg * sg)) * dt;
        vx += j.dx * g; vy += j.dy * g; vz += j.dz * g;
      }
      // scia dell'auto e risucchio della ventola sotto il pianale
      {
        const dx = P[i3] - cp.x, dy = P[i3 + 1] - cp.y, dz = P[i3 + 2] - cp.z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 30) {
          const wk = Math.max(0, 1 - Math.sqrt(d2) / 5.5) * 1.8 * dt;
          vx += (cv.x - vx) * wk; vy += (cv.y - vy) * wk; vz += (cv.z - vz) * wk;
          if (fan > 0.1 && d2 < 9) { const s2 = 2.5 * fan * dt; vx += (under.x - P[i3]) * s2; vy += (under.y - P[i3 + 1]) * s2; vz += (under.z - P[i3 + 2]) * s2; }
        }
      }
      P[i3] += vx * dt; P[i3 + 1] += vy * dt; P[i3 + 2] += vz * dt;
      const rad = 0.12 + 0.12 * this.size1[r] * Math.sqrt(a);
      // terreno: il getto si schiaccia, si allarga a ventaglio e solleva polvere
      const gH = routes.groundH(P[i3], P[i3 + 2]);
      if (P[i3 + 1] < gH + rad) {
        P[i3 + 1] = gH + rad;
        const e = Math.min(0, vy); vy = -0.05 * e;
        let hx = vx, hz = vz, hl = Math.hypot(hx, hz);
        if (hl < 0.3) { const t = Math.random() * Math.PI * 2; hx = Math.cos(t); hz = Math.sin(t); hl = 1; }
        const k = -e * 0.8;
        vx += hx / hl * k + (Math.random() - 0.5) * -e * 0.3; vz += hz / hl * k + (Math.random() - 0.5) * -e * 0.3;
        if (gas && -e > 4 && Math.random() < 0.05) this.dust(P[i3], gH + 0.15, P[i3 + 2], hx / hl * 4, hz / hl * 4, routes.inHills(P[i3], P[i3 + 2]));
      }
      Vv[i3] = vx; Vv[i3 + 1] = vy; Vv[i3 + 2] = vz;
      // rampa, traliccio, percorsi e veicoli: rimbalza e scorre lungo le superfici (a fotogrammi alterni)
      if (((r + this.frame) & 1) === 0 && (FX_NEAR(P[i3], P[i3 + 1], P[i3 + 2]) || routes.near(P[i3], P[i3 + 1], P[i3 + 2]))) {
        L.set(P[i3], P[i3 + 1], P[i3 + 2]);
        const d = sdf(L, N);
        if (d < rad) {
          L.addScaledVector(N, rad - d); P[i3] = L.x; P[i3 + 1] = L.y; P[i3 + 2] = L.z;
          const vn = Vv[i3] * N.x + Vv[i3 + 1] * N.y + Vv[i3 + 2] * N.z;
          if (vn < 0) {
            Vv[i3] -= 1.08 * vn * N.x; Vv[i3 + 1] -= 1.08 * vn * N.y; Vv[i3 + 2] -= 1.08 * vn * N.z;
            Vv[i3] *= 1.12; Vv[i3 + 1] *= 1.12; Vv[i3 + 2] *= 1.12;
          }
        }
      }
      // l'auto spinge via la nuvola quando ci passa attraverso
      if (age > 0.12) {
        const dx = P[i3] - cp.x, dy = P[i3 + 1] - cp.y, dz = P[i3 + 2] - cp.z;
        if (dx * dx + dy * dy + dz * dz < 9) {
          L.set(dx, dy, dz).applyQuaternion(qi);
          const ox = 1.0 - Math.abs(L.x), oy = 0.58 - Math.abs(L.y - 0.185), oz = 2.25 - Math.abs(L.z + 0.25);
          if (ox > 0 && oy > 0 && oz > 0) {
            if (ox < oy && ox < oz) L.x += Math.sign(L.x) * ox; else if (oy < oz) L.y += Math.sign(L.y - 0.185) * oy; else L.z += Math.sign(L.z + 0.25) * oz;
            L.applyQuaternion(car.q);
            P[i3] = cp.x + L.x; P[i3 + 1] = cp.y + L.y; P[i3 + 2] = cp.z + L.z;
            const ln = Math.hypot(L.x, L.y, L.z) || 1;
            Vv[i3] = cv.x + L.x / ln * 3; Vv[i3 + 1] = cv.y + L.y / ln * 3; Vv[i3 + 2] = cv.z + L.z / ln * 3;
          }
        }
      }
      sz[r] = this.size0[r] + (this.size1[r] - this.size0[r]) * Math.sqrt(a);
      // il nucleo del getto è trasparente: la condensa diventa visibile dopo qualche centesimo di secondo
      al[r] = gas ? 0.85 * THREE.MathUtils.smoothstep(age, 0.0, 0.05) * Math.min(1, 6 * a) * Math.pow(1 - a, 1.4)
        : kind === KIND.SMOKE ? 0.5 * Math.min(1, 8 * a) * Math.pow(1 - a, 1.5) : 0.5 * Math.min(1, 6 * a) * Math.pow(1 - a, 1.3);
      const c = this.colors[kind]; ti[i3] = c.r; ti[i3 + 1] = c.g; ti[i3 + 2] = c.b;
    }
    this.geom.attributes.position.needsUpdate = this.sizeAttr.needsUpdate = this.alphaAttr.needsUpdate = this.tintAttr.needsUpdate = true;
  }
}
const fx = new Fx();
scene.add(fx.points);

// ---------------------------------------------------------------- auto: stato fisico
const car = {
  pos: new V3(), q: new THREE.Quaternion(), v: new V3(), w: new V3(),
  gas: CAR.gasL, mass: CAR.mass,
  steer: 0, fan: 0, contacts: 0, airTime: 0, groundTime: 0,
  wheels: WHEELS.map(w => ({
    ...w, hubM: new V3(...w.hub), rel: new V3(...w.hub).sub(CAR.com),
    mount: new V3(...w.hub).sub(CAR.com).add(new V3(0, CAR.travelUp, 0)),
    t: CAR.travelUp, contact: false, n: new V3(0, 1, 0), surf: 'ground', spin: 0, slip: 0, load: 0, node: null, base: null, baseQ: null,
  })),
  thr: THRUSTERS.map(t => ({ ...t, rel: new V3(...t.pos).sub(CAR.com), vrel: new V3(...(t.vpos || t.pos)).sub(CAR.com), f: new V3(), level: 0, cone: null })),
  accel: new V3(), lastV: new V3(),
};

const BODY_PTS = [];
for (const z of [-2.2, -1.1, 0, 1.1, 2.2]) {
  const end = Math.abs(z) > 2;
  for (const x of [-0.95, 0, 0.95]) {
    BODY_PTS.push(new V3(x, end ? 0.40 : 0.18, z));
    BODY_PTS.push(new V3(x, end ? 0.82 : (Math.abs(z) < 0.5 ? 1.12 : 1.0), z));
  }
  for (const x of [-0.99, 0.99]) BODY_PTS.push(new V3(x, 0.6, z));
}
for (const p of BODY_PTS) p.sub(CAR.com);

const tmp = { a: new V3(), b: new V3(), c: new V3(), d: new V3(), e: new V3(), n: new V3(), up: new V3(), fw: new V3(), rt: new V3(), q: new THREE.Quaternion() };
const F = new V3(), TQ = new V3(); // forza e coppia totali del passo di fisica
const invQ = new THREE.Quaternion();

function invInertiaWorld(vec, out) {
  invQ.copy(car.q).invert();
  out.copy(vec).applyQuaternion(invQ);
  const m = car.mass;
  out.set(out.x / (CAR.inertiaPerKg.x * m), out.y / (CAR.inertiaPerKg.y * m), out.z / (CAR.inertiaPerKg.z * m));
  return out.applyQuaternion(car.q);
}
function addForceAt(f, point) {
  F.add(f);
  tmp.e.subVectors(point, car.pos).cross(f); TQ.add(tmp.e);
}
function pointVel(rWorld, out) { return out.crossVectors(car.w, rWorld).add(car.v); }

// ---------------------------------------------------------------- input
const keys = new Set();
const input = { throttle: 0, brake: 0, steer: 0, pitch: 0, roll: 0, rollBtn: 0, lift: 0, boost: 0, retro: 0, camX: 0, camY: 0, zoom: 0 };
let padActive = false, padIndex = null;
const prevBtn = [];
const events = [];
addEventListener('keydown', e => {
  if (e.repeat) { if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); return; }
  keys.add(e.code); padActive = false;
  if (helpUI.open) { if (e.code === 'Escape' || e.key === '?' || e.code === 'KeyH') events.push('help'); return; }
  if (settingsUI.open) { const m2 = { ArrowUp: 'setUp', ArrowDown: 'setDown', ArrowLeft: 'setLeft', ArrowRight: 'setRight', Escape: 'settings', KeyP: 'settings' }; if (m2[e.code]) { events.push(m2[e.code]); e.preventDefault(); } return; }
  if (e.code === 'KeyP') events.push('settings');
  const map = { KeyV: 'view', KeyT: 'challenge', KeyR: 'restart', KeyF: 'recover', KeyH: 'tc', KeyG: 'suction', KeyX: 'camReset', KeyM: 'sUp', KeyN: 'sDown', KeyZ: 'zoomCycle' };
  if (e.key === '?' || e.code === 'Slash' || e.code === 'F1') { events.push('help'); e.preventDefault(); return; }
  if (map[e.code]) events.push(map[e.code]);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  startGame();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
addEventListener('gamepadconnected', e => { padIndex = e.gamepad.index; padActive = true; normalizePad(e.gamepad); toast(T('t.pad'), `${padInfo.kind === 'xbox' ? 'Xbox' : padInfo.kind === 'ps' ? 'PlayStation' : T('t.padGeneric')} · ${e.gamepad.id.replace(/\(.*\)/, '').trim()}`); });
addEventListener('gamepaddisconnected', e => { if (e.gamepad.index === padIndex) { padIndex = null; padActive = false; } });

// Riconosce da solo il tipo di controller (DualSense, DualShock 4, Xbox, generici) e li porta tutti
// alla disposizione "standard" (0 ✕/A, 1 ○/B, 2 □/X, 3 △/Y, 4-5 L1/R1, 6-7 L2/R2, 8 Create/Back,
// 9 Options/Menu, 10-11 L3/R3, 12-15 croce direzionale). Chrome/Edge la forniscono già così;
// Firefox e Safari a volte danno indici diversi per i controller PlayStation: li converto.
const padInfo = { name: '', kind: '' };
const _norm = { buttons: [], axes: [0, 0, 0, 0] };
for (let i = 0; i < 18; i++) _norm.buttons.push({ pressed: false, value: 0 });
function setNormBtn(i, v) { const o = _norm.buttons[i]; o.value = v; o.pressed = v > 0.4; }
function normalizePad(p) {
  const id = (p.id || '').toLowerCase();
  const kind = /054c|playstation|dualsense|dualshock|wireless controller|ps4|ps5/.test(id) ? 'ps' : /xbox|xinput|045e|microsoft/.test(id) ? 'xbox' : 'generic';
  if (padInfo.name !== p.id) { padInfo.name = p.id; padInfo.kind = kind; }
  if (p.mapping === 'standard' || kind !== 'ps' || p.axes.length < 6) return p;       // già standard (o sconosciuto): lo uso così
  // PlayStation con mappatura non standard: tasti [□ ✕ ○ △ L1 R1 L2 R2 Share Options L3 R3 PS Touchpad], assi [lx ly rx L2 R2 ry (hat)]
  const map = [2, 0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 17];
  for (let i = 0; i < 18; i++) setNormBtn(i, 0);
  p.buttons.forEach((b, i) => { if (map[i] !== undefined) setNormBtn(map[i], b.value || (b.pressed ? 1 : 0)); });
  if (p.axes.length > 9) { // croce direzionale come asse "hat": su, su-dx, dx, giù-dx, giù, giù-sx, sx, su-sx
    const h = Math.round((p.axes[9] + 1) * 3.5), ok = p.axes[9] < 1.1 && h >= 0 && h <= 7;
    if (ok) { const d = [[1, 0, 0, 0], [1, 0, 0, 1], [0, 0, 0, 1], [0, 1, 0, 1], [0, 1, 0, 0], [0, 1, 1, 0], [0, 0, 1, 0], [1, 0, 1, 0]][h]; setNormBtn(12, d[0]); setNormBtn(13, d[1]); setNormBtn(14, d[2]); setNormBtn(15, d[3]); }
  }
  const trig = v => Math.max(0, Math.min(1, (v + 1) / 2));
  if (p.axes[3] !== undefined && p.buttons[6] && !p.buttons[6].value) setNormBtn(6, trig(p.axes[3]));
  if (p.axes[4] !== undefined && p.buttons[7] && !p.buttons[7].value) setNormBtn(7, trig(p.axes[4]));
  _norm.axes = [p.axes[0], p.axes[1], p.axes[2], p.axes[5]];
  return _norm;
}

const opt = { t: 0, fired: false };
const dz = (v, d = 0.12) => Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d);
function readInput() {
  const k = c => keys.has(c) ? 1 : 0;
  let thr = Math.max(k('KeyW'), k('ArrowUp')), brk = Math.max(k('KeyS'), k('ArrowDown'));
  let st = Math.max(k('KeyD'), k('ArrowRight')) - Math.max(k('KeyA'), k('ArrowLeft'));
  Object.assign(input, {
    throttle: thr, brake: brk, steer: st, pitch: thr - brk, roll: st, rollBtn: k('KeyE') - k('KeyQ'),
    lift: k('Space'), boost: Math.max(k('ShiftLeft'), k('ShiftRight')), retro: k('KeyC'), camX: 0, camY: 0, zoom: 0,
  });
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let p = padIndex != null ? pads[padIndex] : null;
  if (!p) for (const c of pads) if (c) { p = c; padIndex = c.index; break; }
  if (!p) return;
  p = normalizePad(p);
  const b = i => p.buttons[i] ? p.buttons[i].value || (p.buttons[i].pressed ? 1 : 0) : 0;
  const pressed = i => b(i) > 0.4;
  const lx = dz(p.axes[0] || 0), ly = dz(p.axes[1] || 0), rx = dz(p.axes[2] || 0, 0.15), ry = dz(p.axes[3] || 0, 0.15);
  const any = p.buttons.some(x => x.pressed) || lx || ly || rx || ry;
  if (any) { padActive = true; startGame(); }
  if (!padActive) return;
  input.throttle = Math.max(input.throttle, b(7));
  input.brake = Math.max(input.brake, b(6));
  input.steer = Math.abs(lx) > Math.abs(input.steer) ? lx : input.steer;
  input.roll = input.steer;
  input.pitch = Math.abs(ly) > Math.abs(input.pitch) ? -ly : input.pitch; // stick avanti = muso su (non invertito)
  input.lift = Math.max(input.lift, pressed(0) ? 1 : 0);
  input.boost = Math.max(input.boost, pressed(1) ? 1 : 0);
  input.retro = Math.max(input.retro, pressed(2) ? 1 : 0);
  input.rollBtn += (pressed(5) ? 1 : 0) - (pressed(4) ? 1 : 0); // L1/R1: capovolgimento laterale
  input.camX = rx; input.camY = ry;
  const edge = (i, name) => { const now = pressed(i); if (now && !prevBtn[i]) events.push(name); prevBtn[i] = now; };
  if (helpUI.open) { edge(1, 'help'); edge(9, 'help'); edge(8, 'help'); for (const k of Object.keys(input)) input[k] = 0; return; }
  if (settingsUI.open) { // nel pannello: D-pad per scegliere e regolare, ○ per chiudere
    edge(12, 'setUp'); edge(13, 'setDown'); edge(14, 'setLeft'); edge(15, 'setRight'); edge(1, 'settings');
    { const now = pressed(9); if (!now && prevBtn[9]) events.push('settings'); prevBtn[9] = now; }
    for (const k of Object.keys(input)) input[k] = 0;
    return;
  }
  edge(3, 'view');        // △ cambia visuale
  edge(17, 'challenge');  // touchpad (PlayStation) / Share (Xbox Series)
  edge(10, 'challenge');  // L3: stesso comando per i controller senza touchpad
  // OPTIONS: premuto e rilasciato = ricomincia, tenuto premuto 0,6 s = impostazioni
  { const now = pressed(9), tnow = performance.now();
    if (now && !prevBtn[9]) { opt.t = tnow; opt.fired = false; }
    if (now && !opt.fired && tnow - opt.t > 600) { events.push('settings'); opt.fired = true; }
    if (!now && prevBtn[9] && !opt.fired) events.push(settingsUI.open ? 'settings' : 'restart');
    prevBtn[9] = now; }
  edge(8, 'recover');     // CREATE
  edge(11, 'zoomCycle');  // R3: distanza della telecamera
  edge(12, 'sUp');        // D-pad ↑: più aspirazione
  edge(13, 'sDown');      // D-pad ↓: meno aspirazione
  edge(14, 'tc');         // D-pad ←
  edge(15, 'suction');    // D-pad →
  edge(0, 'cross');
}

const rumble = { next: 0 };
function rumbleFx(strong, weak, ms) {
  const p = padIndex != null && navigator.getGamepads()[padIndex];
  const a = p && p.vibrationActuator;
  if (!a || !a.playEffect) return;
  try { a.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }); } catch { }
}

// ---------------------------------------------------------------- audio
// Suoni sintetizzati: motore elettrico (fondamentale, armoniche e portante dell'inverter),
// gomme (rotolamento e stridio), vento, aria compressa (sibilo e rombo con colpo di valvola),
// ventole dell'aspirazione, urti con tonfo e lamiera, il tutto con un leggero riverbero.
const audio = { ctx: null };
function noiseBuffer(ctx, pink) {
  const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (!pink) { d[i] = w; continue; }
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
  }
  return buf;
}
function initAudio() {
  if (audio.ctx) { audio.ctx.resume?.(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const ctx = new AC(); audio.ctx = ctx;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(ctx.destination);
  const master = ctx.createGain(); master.gain.value = 0.8; master.connect(comp);
  // riverbero corto (spazio aperto con il traliccio)
  const ir = ctx.createBuffer(2, ctx.sampleRate * 1.4, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3); }
  const conv = ctx.createConvolver(); conv.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.16; conv.connect(wet); wet.connect(comp);
  const bus = ctx.createGain(); bus.connect(master); bus.connect(conv);
  const white = noiseBuffer(ctx, false), pink = noiseBuffer(ctx, true);
  const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const filt = (type, f, q = 1) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const loop = buf => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 2); return s; };
  const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };
  const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
  // motore elettrico
  const mG = gain(), mF = filt('lowpass', 3500, 0.7); chain(mF, mG, bus);
  // ordini del motore: fondamentale del rotore, poli e cave dello statore (il "fischio" delle elettriche)
  // ronzio del motore: solo gli ordini bassi, filtrati (niente fischi o toni acuti tipo "beep")
  const harm = [[2, 'sine', 0.3], [4, 'sine', 0.12], [6, 'sine', 0.05]].map(([k, t, g]) => { const o = osc(t, 100); chain(o, gain(g), mF); return { o, k }; });
  const whG = gain(), whF = filt('bandpass', 500, 0.9); chain(loop(pink), whF, whG, bus); // flusso d'aria di motore e raffreddamento
  const scG = gain(), scF = filt('bandpass', 1500, 1.6); chain(loop(white), scF, scG, bus);  // lamiera che striscia
  const scR = gain(); chain(loop(pink), filt('lowpass', 260, 0.8), scR, bus);
  // gomme
  const rollG = gain(), rollF = filt('lowpass', 250, 0.6); chain(loop(pink), rollF, rollG, bus);
  const sqG = gain(); chain(loop(white), filt('bandpass', 1300, 3), sqG, bus); // stridio: solo rumore filtrato
  // vento
  const windG = gain(), windF = filt('bandpass', 400, 0.5); chain(loop(pink), windF, windG, bus);
  // aria compressa
  const hissG = gain(), hissF = filt('highpass', 1600, 0.6), hissP = filt('peaking', 4800, 1.2); hissP.gain.value = 7; chain(loop(white), hissF, hissP, hissG, bus);
  const roarG = gain(), roarF = filt('lowpass', 380, 0.8); chain(loop(pink), roarF, roarG, bus);
  // ventole dell'aspirazione
  const fanO = osc('sawtooth', 120), fanG = gain(); chain(fanO, filt('lowpass', 800, 2), fanG, bus);
  const fanNG = gain(), fanNF = filt('bandpass', 650, 3); chain(loop(white), fanNF, fanNG, bus);
  Object.assign(audio, { master, whG, whF, scG, scF, scR, bus, white, pink, harm, mG, mF, rollG, rollF, sqG, windG, windF, hissG, hissF, roarG, fanO, fanG, fanNG, fanNF, lastThrust: 0 });
}
function audioUpdate() {
  if (!audio.ctx) return;
  const t = audio.ctx.currentTime, A = audio;
  const v = car.v.length(), grounded = car.contacts > 0;
  const rearSpin = Math.abs(car.wheels[2].spinRate || 0) + Math.abs(car.wheels[3].spinRate || 0);
  const rotor = Math.max(1.5, 0.5 * rearSpin * 9.73 / (2 * Math.PI));       // giri al secondo del rotore (rapporto 9,73:1)
  const load = Math.max(input.throttle, 0.6 * input.brake);
  for (const h of A.harm) h.o.frequency.setTargetAtTime(Math.min(12000, rotor * h.k), t, 0.04);
  A.mF.frequency.setTargetAtTime(420 + rotor * 14, t, 0.08);
  A.mG.gain.setTargetAtTime(0.01 + (0.05 + 0.16 * load) * Math.min(1, rotor / 40 + 0.3) + 0.02 * Math.min(1, v / 40), t, 0.05);
  A.whG.gain.setTargetAtTime(Math.min(0.22, (0.02 + 0.12 * load) * Math.min(1, v / 30)), t, 0.08); A.whF.frequency.setTargetAtTime(350 + v * 20, t, 0.1);
  const scr = Math.min(1, (car.scrapeAcc || 0) / 12); car.scrapeAcc = 0;
  A.scG.gain.setTargetAtTime(0.4 * scr, t, 0.03); A.scR.gain.setTargetAtTime(0.35 * scr, t, 0.03); A.scF.frequency.setTargetAtTime(900 + 900 * Math.random(), t, 0.02);
  A.rollG.gain.setTargetAtTime(grounded ? Math.min(0.28, 0.02 + v / 110) : 0, t, 0.08);
  A.rollF.frequency.setTargetAtTime(160 + v * 9, t, 0.1);
  const sq = grounded ? Math.min(1, car.slip || 0) : 0;
  A.sqG.gain.setTargetAtTime(0.2 * sq, t, 0.04);
  A.windG.gain.setTargetAtTime(Math.min(0.4, v * v / 8000), t, 0.1); A.windF.frequency.setTargetAtTime(250 + v * 7, t, 0.15);
  const thrust = (car.liftFrac || 0) + 0.9 * (car.boostFrac || 0) + 0.5 * (car.retroFrac || 0) + 0.3 * (car.attFrac || 0) + 0.45 * (car.ventT || 0);
  A.hissG.gain.setTargetAtTime(0.5 * Math.min(1.4, thrust), t, 0.02);
  A.hissF.frequency.setTargetAtTime(1300 + 900 * Math.min(1, thrust), t, 0.05);
  A.roarG.gain.setTargetAtTime(0.55 * Math.min(1.4, (car.liftFrac || 0) + (car.boostFrac || 0)), t, 0.03);
  if (thrust > 0.2 && A.lastThrust <= 0.05) valvePop();
  A.lastThrust = thrust;
  const fan = car.fan * (grounded ? 1 : 0.6);
  A.fanO.frequency.setTargetAtTime(70 + 210 * fan, t, 0.3); A.fanG.gain.setTargetAtTime(0.05 * fan, t, 0.2);
  A.fanNG.gain.setTargetAtTime(0.09 * fan, t, 0.2); A.fanNF.frequency.setTargetAtTime(400 + 500 * fan, t, 0.3);
}
function burst(buf, type, f, q, g0, dur, delay = 0) {
  const ctx = audio.ctx, t = ctx.currentTime + delay, s = ctx.createBufferSource(); s.buffer = buf;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(g0, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(fl); fl.connect(g); g.connect(audio.bus); s.start(t, Math.random() * 2); s.stop(t + dur + 0.05);
}
function valvePop() { if (audio.ctx) { burst(audio.white, 'highpass', 900, 0.7, 0.5, 0.09); burst(audio.pink, 'lowpass', 250, 0.8, 0.5, 0.18); } }
function tone(type, f0, f1, g0, dur, delay = 0) {
  const ctx = audio.ctx, t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(g0, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  o.connect(g); g.connect(audio.bus); o.start(t); o.stop(t + dur + 0.05);
}
// lamiera che vibra: rumore che eccita un risonatore a pettine (ritardo con retroazione)
function metalRing(f, fb, g0, dur, delay) {
  const ctx = audio.ctx, t = ctx.currentTime + delay;
  const src = ctx.createBufferSource(); src.buffer = audio.white;
  const env = ctx.createGain(); env.gain.setValueAtTime(g0, t); env.gain.exponentialRampToValueAtTime(0.0005, t + 0.035);
  const dl = ctx.createDelay(0.05); dl.delayTime.value = 1 / f;
  const fbG = ctx.createGain(); fbG.gain.value = fb;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
  const out = ctx.createGain(); out.gain.setValueAtTime(0.8, t); out.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  src.connect(env); env.connect(dl); dl.connect(lp); lp.connect(fbG); fbG.connect(dl); lp.connect(out); out.connect(audio.bus);
  src.start(t, Math.random() * 2); src.stop(t + 0.05);
  setTimeout(() => { try { fbG.disconnect(); out.disconnect(); } catch { } }, (delay + dur + 0.3) * 1000);
}
// schianto: tonfo sordo del telaio, lamiera che si accartoccia (centinaia di grani di rumore),
// pannelli che vibrano, vetri e plastica che si rompono, detriti che ricadono
function audioHit(power, metal = true, vehicle = false) {
  if (!audio.ctx) return;
  const P = Math.max(0.05, Math.min(1, power)), R = Math.random;
  burst(audio.pink, 'lowpass', 130 + 220 * P, 0.7, Math.min(1, 0.35 + 0.8 * P), 0.22 + 0.5 * P);   // tonfo
  tone('sine', 55, 26, Math.min(0.7, 0.15 + 0.6 * P), 0.25 + 0.35 * P);                          // colpo sordo (si sente nel petto)
  if (!metal) return;
  const nG = Math.round(12 + 40 * P);
  for (let i = 0; i < nG; i++) burst(audio.white, 'bandpass', 250 + R() * 3200, 1.2 + R() * 2.5, (0.04 + 0.26 * P) * (0.3 + R()), 0.015 + 0.07 * R(), R() * (0.1 + 0.3 * P));
  for (let i = 0; i < 2 + 3 * P; i++) metalRing(95 + R() * (vehicle ? 300 : 480), 0.5 + 0.25 * R(), 0.22 * P, 0.2 + 0.5 * R(), R() * 0.05);
  if (P > 0.4) { // vetri e plastica
    const nV = Math.round(6 + 24 * P);
    for (let i = 0; i < nV; i++) burst(audio.white, 'highpass', 3200 + R() * 4000, 0.7, (0.05 + 0.14 * P) * R(), 0.01 + 0.03 * R(), 0.02 + R() * 0.4);
  }
  for (let i = 0; i < 4 + 8 * P; i++) burst(audio.pink, 'bandpass', 180 + R() * 700, 1.2, 0.09 * P, 0.03 + 0.05 * R(), 0.3 + R() * 1.2); // detriti
}

// ---------------------------------------------------------------- stato di gioco
const SAVE_KEY = 'roadster3d';
const save = (() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; } })();
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { } };
const game = {
  started: false, challenge: save.challenge || 'ramp', test: save.tests || 0,
  view: 0, suction: 'auto', suctionLevel: Math.min(1, Math.max(0, save.suctionLevel ?? 1)), tc: true,
  flight: null, jump: null, crashCooldown: 0,
};
const VIEWS = ['third', 'cockpit', 'side', 'drone'];
const viewName = () => T('v.' + VIEWS[game.view]);
const SUCTION_MODES = ['auto', 'on']; // automatica (con R2/L2) o manuale (sempre attiva)
const CHALLENGES = ['ramp', 'jump', 'grid', 'park', 'hills'];
const chName = k => T('ch.' + k), chDesc = k => T('chd.' + k);
if (!CHALLENGES.includes(game.challenge)) game.challenge = 'ramp';

function resetCar() {
  const st = START[game.challenge] ? { p: START[game.challenge], yaw: -Math.PI / 2 } : routes.starts[game.challenge];
  car.pos.set(st.p.x, st.p.y + CAR.com.y, st.p.z);
  car.q.setFromAxisAngle(new V3(0, 1, 0), st.yaw); // ramp e salto: muso verso +X
  car.v.set(0, 0, 0); car.w.set(0, 0, 0); car.steer = 0; car.fan = 0;
  car.gas = CAR.gasL; car.mass = CAR.mass; game.rampProgress = -1; game.hookBanged = false;
  resetVehicles();
  for (const w of car.wheels) { w.t = CAR.travelUp; w.spin = 0; }
  game.flight = null; game.jump = { passed: new Set(), hit: new Set(), done: false };
  game.test++; save.tests = game.test; persist();
  cam.init = true;
  updateTopHud();
}

function recoverCar() {
  // mantiene la direzione, rimette l'auto in piano e la appoggia dall'alto
  const f = tmp.a.set(0, 0, -1).applyQuaternion(car.q).setY(0);
  const yaw = f.lengthSq() > 1e-4 ? Math.atan2(-f.x, -f.z) : 0;
  car.q.setFromAxisAngle(new V3(0, 1, 0), yaw);
  car.pos.y = Math.max(car.pos.y + 1.2, 1.4);
  car.v.set(0, 0, 0); car.w.set(0, 0, 0);
  toast(T('t.righted'), '');
}

// ---------------------------------------------------------------- fisica
function physicsStep(h) {
  F.set(0, 0, 0); TQ.set(0, 0, 0);
  const m = car.mass;
  const up = tmp.up.set(0, 1, 0).applyQuaternion(car.q);
  const fwdBody = tmp.fw.set(0, 0, -1).applyQuaternion(car.q);
  const vFwd = car.v.dot(fwdBody);
  const speed = car.v.length();

  F.y -= m * G;

  // aerodinamica: resistenza + deportanza dell'alettone attivo
  if (speed > 0.1) F.addScaledVector(car.v, -0.5 * RHO * CAR.CdA * speed);
  if (vFwd > 0) F.addScaledVector(up, -0.5 * RHO * CAR.ClA * vFwd * vFwd);
  TQ.addScaledVector(car.w, -350); // smorzamento aerodinamico rotazionale
  { // resistenza laterale: di traverso l'aria frena e, agendo dietro il baricentro, raddrizza l'auto
    const rb = tmp.rt.set(1, 0, 0).applyQuaternion(car.q), vLat = car.v.dot(rb);
    if (Math.abs(vLat) > 0.3) addForceAt(rb.multiplyScalar(-0.5 * RHO * 2.4 * vLat * Math.abs(vLat)), tmp.c.set(0, 0, 0.35).applyQuaternion(car.q).add(car.pos));
  }

  // aspirazione a ventola (multi-modalità)
  // ✕ stacca sempre l'aspirazione per potersi sollevare
  const onClimb = car.wheels.some(w => w.contact && (w.surf === 'ramp' || w.surf === 'loop'));
  const pedal = input.throttle > 0.05 || input.brake > 0.05;
  // isteresi: si accende sopra 60 km/h, si spegne sotto 50 km/h; sulla rampa e nel giro serve sempre
  car.fanHi = vFwd > 16.7 ? true : vFwd < 13.9 ? false : car.fanHi;
  let wantFan = input.lift > 0 ? 0 : game.suction === 'on' ? game.suctionLevel : (vFwd > 0.3 && pedal && (onClimb || car.fanHi) ? 1 : 0);
  // ventola adattiva: se la pista curva già schiaccia l'auto (giro della morte, compressioni)
  // riduce la spinta per tenere il carico totale sulle gomme intorno a 3 g
  const otherG = (car.loadG || 1) - car.fan * CAR.suctionG * (car.contacts / 4);
  wantFan *= THREE.MathUtils.clamp((3.0 - otherG) / CAR.suctionG, 0, 1);
  car.fan += (wantFan - car.fan) * Math.min(1, h * 6);
  // F = ΔP · A: depressione delle ventole sul fondo (≈ 9 kPa su 4 m² = 2 g); più il fondo è vicino
  // al suolo meno aria entra dai bordi e più la depressione tiene (perdita ∝ altezza della fessura)
  const A_FLOOR = 4.0, dPmax = CAR.suctionG * CAR.mass * G / A_FLOOR;
  let gap = 0, nc = 0; for (const w of car.wheels) if (w.contact) { gap += 0.12 + (w.t - CAR.travelUp); nc++; }
  const seal = nc ? (nc / 4) * THREE.MathUtils.clamp(Math.exp(-(gap / nc - 0.12) / 0.08), 0, 1.35) : 0;
  car.seal = seal;
  if (car.fan > 0.01 && seal > 0) F.addScaledVector(up, -car.fan * dPmax * A_FLOOR * seal);

  // sterzo con riduzione in velocità (steer-by-wire)
  // assistenza di corsia sulla rampa: se non sterzi ti tiene dritto e al centro
  let steerIn = input.steer;
  if (Math.abs(steerIn) < 0.15 && vFwd > 0.3 && car.wheels.some(w => w.contact && w.surf === 'ramp'))
    steerIn = THREE.MathUtils.clamp(-(0.25 * car.pos.z + 2.2 * fwdBody.z), -0.6, 0.6);
  // giro della morte a elica: l'assistenza segue la spirale (sul giro la destra dell'auto è sempre +z)
  const onLoop = car.wheels.some(w => w.contact && w.surf === 'loop');
  if (onLoop) {
    // posizione lungo il profilo del giro (ricerca locale attorno al campione precedente)
    const LS = routes.loop.samples;
    let i0 = game.loopIdx ?? 0, best = 1e9, bi = i0;
    const lo = game.loopIdx == null ? 0 : Math.max(0, i0 - 8), hi = game.loopIdx == null ? LS.length - 1 : Math.min(LS.length - 1, i0 + 8);
    for (let i = lo; i <= hi; i++) { const q = LS[i], d = (q.x - car.pos.x) ** 2 + (q.y - car.pos.y + CAR.com.y) ** 2 + 0.05 * (q.z - car.pos.z) ** 2; if (d < best) { best = d; bi = i; } }
    game.loopIdx = bi;
    const zT = LS[bi].z, tz = routes.loop.tz;
    if (Math.abs(input.steer) < 0.15 && vFwd > 0.3) steerIn = THREE.MathUtils.clamp(-(0.35 * (car.pos.z - zT) + 2.5 * (fwdBody.z - tz)), -0.6, 0.6);
  } else if (car.contacts > 0 && car.wheels.every(w => !w.contact || w.surf !== 'loop')) game.loopIdx = null;
  // Sterzo steer-by-wire. L'angolo massimo alle ruote è quello che l'aderenza permette: in curva
  // a_y = v²·tanδ / L deve restare entro μ·g_eff (g_eff cresce con la deportanza della ventola),
  // con un margine del 10% per gli angoli di deriva delle gomme, e comunque entro il limite
  // meccanico della cremagliera. Il comando ha una curva esponenziale per i movimenti fini
  // (stick analogico) e l'attuatore risponde con una costante di tempo di ~0,1 s.
  const vS = Math.max(Math.abs(vFwd), 0.5);
  const gEffS = G * (1 + CAR.suctionG * car.fan * Math.min(1, car.seal || 0));
  const dLim = Math.atan(CAR.mu * gEffS * 2.65 / (vS * vS));
  const dMax = Math.min(CAR.steerMax, 1.5 * dLim);
  const steerTarget = Math.sign(steerIn) * Math.pow(Math.abs(steerIn), 1.25) * dMax;
  const tauS = 0.06 + 0.03 * Math.min(1, vS / 30);
  car.steer += THREE.MathUtils.clamp((steerTarget - car.steer) * (1 - Math.exp(-h / tauS)), -2.8 * h, 2.8 * h);
  car.steer = THREE.MathUtils.clamp(car.steer, -dMax, dMax);

  const LL = routes.loop.lane;
  car.inLoopZone = (car.pos.x > LL.x0 && car.pos.x < LL.x1 && Math.abs(car.pos.z - LL.z) < LL.hw) || car.wheels.some(w => w.contact && w.surf === 'loop');
  // ruote
  let contacts = 0, slipSum = 0;
  const mEff = m / 4;
  for (let wi = 0; wi < 4; wi++) {
    const w = car.wheels[wi];
    const mountW = tmp.a.copy(w.mount).applyQuaternion(car.q).add(car.pos);
    const dir = tmp.b.copy(up).negate();
    let t = 0, hit = false;
    const maxT = CAR.travelUp + CAR.travelDown;
    for (let it = 0; it < 16; it++) {
      const c = tmp.c.copy(mountW).addScaledVector(dir, t);
      const d = sdf(c, w.n) - CAR.wheelR;
      if (d < 0.003) { hit = true; break; }
      t += d; if (t > maxT) break;
    }
    if (!hit || t > maxT) {
      w.contact = false; w.t = Math.min(maxT, w.t + h * 3); w.load = 0;
      // in aria la ruota continua a girare: il motore la accelera, i freni e l'attrito la fermano
      let sr = (w.omega || 0) * Math.exp(-0.4 * h);
      if (!w.front) sr += input.throttle * CAR.wheelTorque / 1.6 * 0.3 * h;
      if (input.brake > 0) sr -= Math.sign(sr) * Math.min(Math.abs(sr), CAR.brakePerWheel * CAR.wheelR / 1.2 * h);
      w.omega = THREE.MathUtils.clamp(sr, -40, CAR.vMax / CAR.wheelR * 1.05); w.spinRate = w.omega; w.spin += w.omega * h;
      continue;
    }
    w.contact = true; w.t = t; w.surf = lastSurf; contacts++;
    const wveh = lastSurf === 'parked' && lastBoxIdx >= 0 ? BODIES[lastBoxIdx] : null;
    if (lastSurf === 'parked' && game.jump) game.jump.hit.add(lastBoxIdx);
    const hub = tmp.c.copy(mountW).addScaledVector(dir, t);
    const cp = tmp.d.copy(hub).addScaledVector(w.n, -CAR.wheelR);
    const r = tmp.e.subVectors(cp, car.pos);
    const vp = pointVel(r, new V3());
    if (wveh) vp.sub(vehPointVel(wveh, cp, tmp.rt)); // velocità relativa alla superficie del veicolo
    const comp = vp.dot(dir);
    const L0 = CAR.travelUp + (CAR.mass * G / 4) / CAR.k;
    let fs = CAR.k * (L0 - t);
    // molla progressiva idraulica: piena in compressione, quasi nulla in estensione (non restituisce l'urto)
    if (t < 0.07) fs += 3.5e6 * (0.07 - t) * (0.07 - t) / 0.07 * (comp > 0 ? 1 : 0.15);
    // barra antirollio: trasferisce carico dalla ruota più compressa a quella opposta
    const mate = car.wheels[(wi ^ 1)];
    if (mate.contact) fs += 32000 * (mate.t - t);
    // tampone di fine corsa progressivo e molto smorzato: assorbe l'urto e restituisce poca energia
    const BS = 0.035;
    if (t < BS) { const pen = BS - t; fs += comp > 0 ? 9e5 * pen + 45000 * comp : 9e5 * pen * 0.25; }
    // ammortizzatore progressivo: più frenante sugli urti veloci, molto frenante in estensione
    const fd = comp > 0 ? (comp < 0.4 ? CAR.cBump * comp : CAR.cBump * 0.4 + 9000 * (comp - 0.4)) : CAR.cReb * comp;
    const N = Math.max(0, fs + fd);
    const Nf = new V3().copy(up).multiplyScalar(N);
    addForceAt(Nf, cp);
    if (wveh) vehImpulse(wveh, Nf.clone().multiplyScalar(-h), cp);
    const load = N * Math.max(0, w.n.dot(up));
    w.load = load;

    // assi della gomma sul piano di contatto
    let delta = 0; // geometria di Ackermann: la ruota interna alla curva sterza di più
    if (w.front && Math.abs(car.steer) > 1e-4) {
      const d0 = -car.steer, Rt = 2.65 / Math.tan(Math.abs(d0)), inner = (d0 > 0) === (w.hub[0] < 0);
      delta = Math.sign(d0) * Math.atan(2.65 / (Rt + (inner ? -0.835 : 0.835)));
    }
    w.delta = delta;
    const fw = new V3(-Math.sin(delta), 0, -Math.cos(delta)).applyQuaternion(car.q);
    fw.addScaledVector(w.n, -fw.dot(w.n)).normalize();
    const side = new V3().crossVectors(fw, w.n).normalize();
    const vl = vp.dot(fw), vs = vp.dot(side);
    const staticLoad = CAR.mass * G / 4;
    const surfMu = w.surf === 'terrain' ? 0.7 : w.surf === 'park' || w.surf === 'ramp' || w.surf === 'loop' ? 1.05 : 1; // sterrato più scivoloso, cemento un po' più aderente
    const mu = CAR.mu * surfMu * THREE.MathUtils.clamp(1 - 0.06 * (load / staticLoad - 1), 0.8, 1.08), fmax = mu * load;

    // longitudinale: dinamica della ruota (I·dω/dt = T_motore − T_freno − R·Fx) e formula magica di
    // Pacejka sullo slittamento κ = (ωR − v)/|v|. Controllo trazione e ABS limitano la coppia al picco.
    const R = CAR.wheelR, Iw = w.front ? 1.1 : 1.6; // kg·m²: ruota e disco (dietro anche il rotore riportato)
    if (w.omega === undefined) w.omega = vl / R;
    let Td = 0, Tb = 0;
    if (!w.front) {
      if (input.throttle > 0 && !(vl > CAR.vMax) && !(vl > 15.3 && car.inLoopZone))
        Td = input.throttle * Math.min(CAR.wheelTorque, CAR.powerPerWheel / Math.max(Math.abs(w.omega), 5)); // T = min(Tmax, P/ω)
      else if (input.brake > 0 && vl <= 0.6 && input.throttle === 0 && vl > -9) Td = -input.brake * 1250;   // retromarcia
      if (input.throttle === 0 && input.brake === 0 && input.boost === 0 && input.lift === 0 && vl > 2) Td -= 0.03 * m * G * R; // rigenerazione in rilascio
    }
    if (input.brake > 0 && (vl > 0.6 || input.throttle > 0)) Tb = input.brake * CAR.brakePerWheel * R * (w.front ? 1.2 : 0.8);
    if (car.inLoopZone && vl > 15.8) Tb += Math.min(0.6 * fmax, mEff * (vl - 15.3) / h) * R;            // limitatore del giro
    if (game.tc && Td > 0) {                                                                            // controllo trazione: limite al picco e,
      Td = Math.min(Td, 1.02 * fmax * R);                                                               // se la ruota pattina oltre il picco, taglio
      const kp = w.kappa || 0;                                                                           // della coppia finché riprende aderenza
      if (kp > 0.12) Td *= Math.max(0, 1 - (kp - 0.12) / 0.1);
    }
    Tb = Math.min(Tb, 0.98 * fmax * R + Math.max(0, Td));                                                // ABS
    const vref = Math.max(Math.abs(vl), 1.5), PB = 11, PC = 1.65, PE = 0.3;
    const pac = k => { const bk = PB * k; return fmax * Math.sin(PC * Math.atan(bk - PE * (bk - Math.atan(bk)))); };
    const kap0 = THREE.MathUtils.clamp((w.omega * R - vl) / vref, -1, 1), Fx0 = pac(kap0);
    const ks = Math.max(0.05, 1 / (1 + (PB * kap0) ** 2)) * fmax * PB * PC;  // pendenza della curva dFx/dκ
    const denom = Iw + h * R * R * ks / vref;                                  // passo implicito: stabile con gomme rigide
    let om = w.omega + h * (Td - R * Fx0) / denom;
    const dB = h * Tb / denom;                                                 // il freno frena la rotazione, non la inverte
    om = om > 0 ? Math.max(0, om - dB) : Math.min(0, om + dB);
    w.omega = THREE.MathUtils.clamp(om, -40, CAR.vMax / R * 1.05);
    const kap = THREE.MathUtils.clamp((w.omega * R - vl) / vref, -1, 1);
    w.kappa = kap;
    let fx = pac(kap);
    fx -= 0.012 * load * Math.sign(vl) * Math.min(1, Math.abs(vl)); // resistenza al rotolamento (Crr ≈ 0,012)
    // freno di stazionamento automatico; con l'aspirazione manuale ti tiene appeso alla rampa
    // come il "brake hold" delle auto vere: si disinserisce con acceleratore, freno o qualsiasi getto
    const propCmd = input.throttle > 0 || input.brake > 0 || input.boost > 0 || input.retro > 0 || input.lift > 0;
    if (!propCmd) {
      const hold = game.suction === 'on' && car.fan > 0.5 ? 0.95 : Math.abs(vl) < 0.3 ? 0.5 : 0;
      if (hold) { fx -= Math.min(mEff * Math.abs(vl) / h, hold * fmax) * Math.sign(vl); w.omega = vl / R; }
    }

    // laterale: curva magica di Pacejka semplificata
    const alpha = Math.atan2(vs, Math.max(Math.abs(vl), 2.5));
    let fy = -fmax * Math.sin(1.3 * Math.atan(16 * alpha));
    w.fyF = (w.fyF || 0) + (fy - (w.fyF || 0)) * Math.min(1, h * Math.max(Math.hypot(vl, vs), 4) / 0.35);
    fy = THREE.MathUtils.clamp(w.fyF, -0.9 * mEff * Math.abs(vs) / h, 0.9 * mEff * Math.abs(vs) / h);

    // cerchio d'attrito
    const tot = Math.hypot(fx, fy);
    let slip = 0;
    if (tot > fmax && tot > 0) { const s = fmax / tot; slip = 1 - s; fx *= s; fy *= s; }
    slip = Math.max(slip, Math.min(1, Math.abs(alpha) / 0.25 - 0.4), Math.min(1, Math.abs(w.kappa) / 0.25 - 0.3));
    w.slip = slip; slipSum += Math.max(0, slip) * Math.min(1, Math.hypot(vl, vs) / 5);

    const Tf = fw.multiplyScalar(fx).addScaledVector(side, fy);
    addForceAt(Tf, cp);
    if (wveh) vehImpulse(wveh, Tf.clone().multiplyScalar(-h), cp);
    w.spin += w.omega * h; w.spinRate = w.omega;
  }
  // controllo di stabilità (ESC) con torque vectoring dei due motori posteriori: confronta la
  // rotazione dell'auto con quella che lo sterzo chiede e corregge sovrasterzo e sottosterzo
  if (game.tc && contacts >= 3 && vFwd > 4) {
    invQ.copy(car.q).invert();
    const wy = tmp.c.copy(car.w).applyQuaternion(invQ).y;
    const gEff = G * (1 + CAR.suctionG * car.fan);
    const lim = 0.9 * CAR.mu * gEff / vFwd;
    const rDes = THREE.MathUtils.clamp(-vFwd * car.steer / (2.65 * (1 + 0.0012 * vFwd * vFwd)), -lim, lim);
    const err = wy - rDes;
    if (Math.abs(err) > 0.04) TQ.addScaledVector(up, THREE.MathUtils.clamp(-err * CAR.inertiaPerKg.y * m * 5, -9000, 9000));
  }
  car.contacts = contacts;
  car.slip = slipSum;
  car.loadG = car.wheels.reduce((a, w) => a + w.load, 0) / (m * G);

  // propulsori
  thrusters(h, up);

  // integrazione velocità
  car.v.addScaledVector(F, h / m);
  car.w.add(invInertiaWorld(TQ, tmp.a).multiplyScalar(h));

  // collisioni della scocca (impulsi) e veicoli parcheggiati
  bodyContacts(h);
  vehStep(h);

  car.pos.addScaledVector(car.v, h);
  const wq = tmp.q.set(car.w.x, car.w.y, car.w.z, 0).multiply(car.q);
  car.q.x += 0.5 * wq.x * h; car.q.y += 0.5 * wq.y * h; car.q.z += 0.5 * wq.z * h; car.q.w += 0.5 * wq.w * h;
  car.q.normalize();
}

const torqueBody = new V3(), forceBody = new V3(), liftDir = new V3(), wBody = new V3(), WORLD_UP = new V3(0, 1, 0);
const GIMBAL = THREE.MathUtils.degToRad(35), COS_G = Math.cos(GIMBAL), SIN_G = Math.sin(GIMBAL);
const VEC = car.thr.filter(t => t.kind === 'vec');
const VEC_MEAN = VEC.reduce((m, t) => m.add(t.rel), new V3()).divideScalar(VEC.length);
for (const t of VEC) t.rc = t.rel.clone().sub(VEC_MEAN);
const VEC_SA = VEC.reduce((s, t) => s.add(new V3(t.rc.y ** 2 + t.rc.z ** 2, t.rc.x ** 2 + t.rc.z ** 2, t.rc.x ** 2 + t.rc.y ** 2)), new V3());
// Ripartizione del sollevamento: ogni ugello spinge in proporzione alla sua distanza dal
// baricentro così che i momenti si annullino e l'auto salga in piano (discesa del gradiente
// proiettata sui limiti di spinta, calcolata una volta sola).
(function solveLift() {
  const f = VEC.map(t => t.max);
  const S = VEC.reduce((s, t) => s + t.rel.x ** 2 + t.rel.z ** 2, 0);
  for (let it = 0; it < 2000; it++) {
    let mx = 0, mz = 0;
    VEC.forEach((t, i) => { mx += f[i] * t.rel.x; mz += f[i] * t.rel.z; });
    VEC.forEach((t, i) => { f[i] = Math.min(t.max, Math.max(0, f[i] - (t.rel.x * mx + t.rel.z * mz) / S)); });
  }
  VEC.forEach((t, i) => { t.liftW = f[i] / t.max; });
})();

const LIFT_WSUM = VEC.reduce((s, t) => s + t.liftW, 0);
function thrusters(h, up) {
  const airborne = car.contacts === 0;
  const pf = CAR.gasInf || car.gas > 0 ? 1 : 0;
  const lifting = input.lift > 0 && pf > 0;
  const m = car.mass, Ix = CAR.inertiaPerKg.x * m, Iy = CAR.inertiaPerKg.y * m, Iz = CAR.inertiaPerKg.z * m;
  invQ.copy(car.q).invert();
  wBody.copy(car.w).applyQuaternion(invQ);
  const onRamp = car.wheels.some(w => w.contact && w.surf === 'ramp');

  // Controllo di volo assistito (fly-by-wire): i comandi chiedono una velocità di rotazione,
  // il computer di bordo la ottiene con i getti orientabili e, senza comandi, tiene l'assetto.
  // Riferimento auto: X destra, Y su, Z dietro.
  torqueBody.set(0, 0, 0);
  const overturned = up.y < 0.45 && car.bodyTouch;                  // ribaltata e appoggiata (sul tetto o sul fianco)
  const rollCmd = THREE.MathUtils.clamp(input.rollBtn + (overturned ? input.roll : 0), -1, 1); // L1/R1 (da ribaltata anche lo stick)
  const yawCmd = airborne && !overturned ? input.roll : 0;          // stick ←→ in aria: gira su sé stessa
  const pitchCmd = airborne && !car.bodyTouch ? input.pitch : 0;                      // stick ↑↓ in aria: capriola
  const hasCmd = Math.abs(rollCmd) > 0.1 || Math.abs(pitchCmd) > 0.1 || Math.abs(yawCmd) > 0.1;
  let attitudeGas = false;
  if (airborne || lifting) {
    const wd = tmp.d.set(2.8 * pitchCmd, -2.6 * yawCmd, -4.2 * rollCmd);
    // se non chiedi una capriola il computer tiene il muso sull'orizzonte, così L1/R1
    // capovolgono davvero l'auto anche quando esce dall'uncino della rampa
    if (Math.abs(pitchCmd) < 0.1) {
      const fwd = tmp.c.set(0, 0, -1).applyQuaternion(car.q);
      const fh = tmp.b.set(fwd.x, 0, fwd.z);
      if (fh.lengthSq() > 0.04) {
        const ax = fh.normalize().cross(fwd).negate().applyQuaternion(invQ);
        wd.x += 3 * ax.x; if (Math.abs(yawCmd) < 0.1) wd.y += 3 * ax.y;
      }
    }
    // senza comandi: se è quasi dritta la rimette in piano, altrimenti tiene l'assetto com'è
    if (!hasCmd && up.y > 0.4) {
      const err = tmp.e.crossVectors(up, WORLD_UP).applyQuaternion(invQ);
      wd.x += 3 * err.x; wd.z += 3 * err.z;
    }
    if (overturned) wd.z = -5.2 * rollCmd; // da ribaltata rotola con decisione per tornare sulle ruote
    if (pf > 0) torqueBody.set(Ix * 7 * (wd.x - wBody.x), Iy * 4 * (wd.y - wBody.y), Iz * (overturned ? 14 : 9) * (wd.z - wBody.z));
    attitudeGas = hasCmd;
    if (!hasCmd && !lifting) torqueBody.set(0, 0, 0); // senza comandi né sollevamento: volo balistico, l'auto ruota come l'ha lanciata la rampa
  } else if (Math.abs(rollCmd) > 0.1 && !onRamp && pf > 0) {
    if (up.y < 0.6) torqueBody.z = Iz * 14 * (-5.2 * rollCmd - wBody.z); // ribaltata: rotola sul fianco
    else torqueBody.y = -60000 * rollCmd;                              // dritta: gira su sé stessa
    attitudeGas = true;
  }

  // spinta di sollevamento sempre verticale nel mondo, entro il limite dei gimbal
  liftDir.copy(WORLD_UP).applyQuaternion(invQ);
  if (liftDir.y < COS_G) {
    const hl = Math.hypot(liftDir.x, liftDir.z);
    if (hl > 1e-3) liftDir.set(liftDir.x / hl * SIN_G, COS_G, liftDir.z / hl * SIN_G);
    else liftDir.set(0, 1, 0);
  }

  const lift = CAR.liftG * CAR.mass * G, boostEach = CAR.boostG * CAR.mass * G / 4, retroEach = CAR.retroG * CAR.mass * G / 2;
  let total = 0, totalMax = 0;
  for (const t of car.thr) {
    const f = t.f.set(0, 0, 0);
    if (t.kind === 'rear') f.set(0, 0, -boostEach * input.boost);
    else {
      // prima l'assetto (priorità), poi il sollevamento riempie la capacità che resta;
      // ogni asse è ripartito sui 6 ugelli con posizioni centrate: coppia pura, nessuna traslazione
      const r = t.rc, tq = torqueBody;
      f.set(tq.y * r.z / VEC_SA.y - tq.z * r.y / VEC_SA.z,
            -tq.x * r.z / VEC_SA.x + tq.z * r.x / VEC_SA.z,
            tq.x * r.y / VEC_SA.x - tq.y * r.x / VEC_SA.y);
      if (t.front) f.z += retroEach * input.retro;
      let len = f.length();
      if (len > t.max) { f.multiplyScalar(t.max / len); len = t.max; }
      if (lifting) {
        // effetto suolo: vicino al terreno il getto rimbalza sotto il pianale e spinge di più
        const np = tmp.b.copy(t.rel).applyQuaternion(car.q).add(car.pos), hg = np.y - routes.groundH(np.x, np.z);
        const cushion = hg < 1.5 ? 1 + 0.2 * (1 - Math.max(0, hg) / 1.5) : 1;
        const want = lift * t.liftW / LIFT_WSUM * input.lift * cushion;
        const bb = f.dot(liftDir), cc = len * len - t.max * t.max;
        const room = -bb + Math.sqrt(Math.max(0, bb * bb - cc));
        f.addScaledVector(liftDir, Math.min(want, Math.max(0, room)));
      }
      if (f.length() < t.max * 0.03) f.set(0, 0, 0);
    }
    f.multiplyScalar(pf);
    const mag = f.length();
    t.level += ((mag / t.max) - t.level) * Math.min(1, h * 30);
    t.lift = lifting;
    totalMax += t.max; total += mag;
    if (mag > 0) addForceAt(tmp.a.copy(f).applyQuaternion(car.q), tmp.b.copy(t.rel).applyQuaternion(car.q).add(car.pos));
  }
  // consumo in litri come l'originale
  const burn = CAR.burn * (input.lift + 0.5 * input.boost + 0.5 * input.retro + (attitudeGas ? 0.18 : 0));
  if (!CAR.gasInf) car.gas = Math.max(0, car.gas - burn * pf * h);
  car.mass = CAR.mass - CAR.gasKg * (1 - car.gas / CAR.gasL);
  car.thrustFrac = total / totalMax;
  // valvola di sicurezza: ribaltata e ferma, il gas compresso si sfiata dagli ugelli anche senza comandi (solo effetto)
  car.ventT = 0; // nessuno sfiato: i getti si vedono solo quando li comandi
  car.liftFrac = lifting ? input.lift : 0; car.boostFrac = pf * input.boost; car.retroFrac = pf * input.retro; car.attFrac = attitudeGas && pf ? 1 : 0;
}

const _cn = new V3(), _r = new V3(), _vp = new V3(), _rn2 = new V3(), _tmpI = new V3(), _vt = new V3();
const _rv = new V3(), _vv = new V3(), _rvn = new V3(), _tmpI2 = new V3(), _J = new V3();
function bodyContacts(h) {
  const m = car.mass;
  let maxImpact = 0, push = 0, scrape = 0, vehHit = -1;
  _cn.set(0, 0, 0);
  for (let pass = 0; pass < 3; pass++) {
    for (const bp of BODY_PTS) {
      const p = tmp.a.copy(bp).applyQuaternion(car.q).add(car.pos);
      const d = sdf(p, tmp.n);
      if (d >= 0) continue;
      const n = tmp.n, surf = lastSurf, veh = surf === 'parked' && lastBoxIdx >= 0 ? BODIES[lastBoxIdx] : null;
      if (veh && pass === 0 && game.jump) game.jump.hit.add(veh.idx);
      _r.subVectors(p, car.pos);
      const relVel = () => { pointVel(_r, _vp); if (veh) { _rv.subVectors(p, veh.pos); _vp.sub(vehPointVel(veh, p, _vv)); } return _vp; };
      const vn = relVel().dot(n);
      if (vn < 0) {
        // un atterraggio duro sulle ruote (pianale che tocca) tollera più velocità di un urto vero
        const soft = tmp.up.y > 0.6 && n.y > 0.6 ? 0.4 : 1;
        maxImpact = Math.max(maxImpact, -vn * soft);
        if (veh && -vn > 1.5) vehHit = veh.idx;
        const rn = _rn2.crossVectors(_r, n);
        let k = 1 / m + invInertiaWorld(rn, _tmpI).cross(_r).dot(n);
        if (veh) { _rvn.crossVectors(_rv, n); k += 1 / veh.m + vehInvI(veh, _rvn, _tmpI2).cross(_rv).dot(n); }
        // gli urti lenti rimbalzano appena, quelli forti sono anelastici (la lamiera si deforma)
        const e = 0.22 * Math.exp(vn / 3);
        const j = -(1 + e) * vn / k;
        car.v.addScaledVector(n, j / m);
        car.w.add(invInertiaWorld(rn.multiplyScalar(j), _tmpI));
        if (veh) vehImpulse(veh, _J.copy(n).multiplyScalar(-j), p);
        // attrito di Coulomb: dipende da cosa sta strisciando su cosa
        relVel();
        _vt.copy(_vp).addScaledVector(n, -_vp.dot(n));
        const vt = _vt.length();
        if (vt > 1e-4) {
          _vt.divideScalar(vt);
          const rt = _rn2.crossVectors(_r, _vt);
          let kt = 1 / m + invInertiaWorld(rt, _tmpI).cross(_r).dot(_vt);
          if (veh) { _rvn.crossVectors(_rv, _vt); kt += 1 / veh.m + vehInvI(veh, _rvn, _tmpI2).cross(_rv).dot(_vt); }
          const floor = tmp.c.set(0, -1, 0).applyQuaternion(car.q).dot(n) < -0.7; // contatto col fondo
          const muB = floor ? 0.2 : veh ? 0.45 : surf === 'terrain' ? 0.5 : surf === 'road' ? 0.7 : 0.6;
          const jt = Math.min(muB * j, vt / kt);
          car.v.addScaledVector(_vt, -jt / m);
          car.w.add(invInertiaWorld(rt.multiplyScalar(-jt), _tmpI));
          if (veh) vehImpulse(veh, _J.copy(_vt).multiplyScalar(jt), p);
          if (pass === 0) scrape += Math.min(vt, 30) * Math.min(jt, 4000) / 4000;
          if (pass === 0 && vt > 3 && Math.random() < 0.15) fx.smoke(p, 1, 2, 0.4, 0.5); // polvere dello strisciamento
        }
      }
      if (pass === 0 && -d > push) { push = -d; _cn.copy(n); }
    }
  }
  if (push > 0) car.pos.addScaledVector(_cn, Math.min(push, 0.2) * 0.6);
  car.bodyTouch = push > 0 || (car.bodyTouch && car.v.lengthSq() < 0.5 && car.contacts === 0);
  car.scrapeAcc = (car.scrapeAcc || 0) + scrape;
  if (maxImpact > 6.5 && game.crashCooldown <= 0) crashEvent(maxImpact, vehHit >= 0);
  else if (vehHit >= 0 && maxImpact > 2 && game.crashCooldown <= 0) { game.crashCooldown = 0.3; audioHit(Math.min(0.5, maxImpact / 12), true, true); rumbleFx(0.3, 0.4, 120); }
}

// veicoli parcheggiati: gravità, contatti con terreno, percorsi e con gli altri veicoli
const _vp2 = new V3(), _vn2 = new V3(), _vr = new V3(), _vpv = new V3(), _vq2 = new THREE.Quaternion();
function vehStep(h) {
  // un corpo in movimento sveglia quelli appoggiati o vicini (altrimenti una pila resterebbe a mezz'aria)
  for (const V of BODIES) if (V.awake && (V.vel.lengthSq() > 0.16 || V.w.lengthSq() > 0.16))
    for (const O of BODIES) if (!O.awake && O !== V) { const rr = V.R + O.R + 0.15; if (V.pos.distanceToSquared(O.pos) < rr * rr) { O.awake = true; O.still = 0; } }
  for (const V of BODIES) {
    if (!V.awake) continue;
    V.vel.y -= G * h;
    V.w.multiplyScalar(Math.exp(-0.3 * h));
    for (let pass = 0; pass < 2; pass++) for (const lp of V.pts) {
      const p = _vp2.copy(lp).applyQuaternion(V.q).add(V.pos);
      const d = sdf(p, _vn2, V.idx);
      if (d >= 0) continue;
      const O = lastSurf === 'parked' && lastBoxIdx >= 0 ? BODIES[lastBoxIdx] : null;
      _vr.subVectors(p, V.pos);
      vehPointVel(V, p, _vpv); if (O) _vpv.sub(vehPointVel(O, p, _vv));
      const vn = _vpv.dot(_vn2);
      if (vn < 0) {
        let k = 1 / V.m + vehInvI(V, _rvn.crossVectors(_vr, _vn2), _tmpI2).cross(_vr).dot(_vn2);
        if (O) { _rv.subVectors(p, O.pos); k += 1 / O.m + vehInvI(O, _rvn.crossVectors(_rv, _vn2), _tmpI2).cross(_rv).dot(_vn2); }
        const j = -(1 + 0.1 * Math.exp(vn / 3)) * vn / k;
        vehImpulse(V, _J.copy(_vn2).multiplyScalar(j), p); if (O) vehImpulse(O, _J.copy(_vn2).multiplyScalar(-j), p);
        vehPointVel(V, p, _vpv); if (O) _vpv.sub(vehPointVel(O, p, _vv));
        _vt.copy(_vpv).addScaledVector(_vn2, -_vpv.dot(_vn2)); const vt = _vt.length();
        if (vt > 1e-4) { // gomme col freno a mano tirato e lamiera: attrito alto
          _vt.divideScalar(vt);
          const kt = 1 / V.m + vehInvI(V, _rvn.crossVectors(_vr, _vt), _tmpI2).cross(_vr).dot(_vt);
          const jt = Math.min(0.75 * j, vt / kt);
          vehImpulse(V, _J.copy(_vt).multiplyScalar(-jt), p); if (O) vehImpulse(O, _J.copy(_vt).multiplyScalar(jt), p);
        }
      }
      if (pass === 0) V.pos.addScaledVector(_vn2, Math.min(-d, 0.15) * 0.5);
    }
    V.pos.addScaledVector(V.vel, h);
    const wq = _vq2.set(V.w.x, V.w.y, V.w.z, 0).multiply(V.q);
    V.q.x += 0.5 * wq.x * h; V.q.y += 0.5 * wq.y * h; V.q.z += 0.5 * wq.z * h; V.q.w += 0.5 * wq.w * h; V.q.normalize(); V.qi.copy(V.q).invert();
    if (V.vel.lengthSq() < 0.02 && V.w.lengthSq() < 0.02) { V.still += h; if (V.still > 0.8) { V.awake = false; V.vel.set(0, 0, 0); V.w.set(0, 0, 0); } } else V.still = 0;
  }
}
function syncVehicles() {
  for (const V of BODIES) { if (!V.group) continue; V.group.quaternion.copy(V.q); V.group.position.set(0, -V.comY, 0).applyQuaternion(V.q).add(V.pos); }
}

function crashEvent(impact, vehicle = false) {
  game.crashCooldown = 0.6;
  const power = Math.min(1, (impact - 4) / 12);
  car.w.multiplyScalar(1 - 0.15 * power); // parte della rotazione si perde nella deformazione
  cam.shake = Math.max(cam.shake, 0.4 + power);
  rumbleFx(0.5 + power * 0.5, 0.8, 250 + power * 350);
  audioHit(power, true, vehicle);
  fx.smoke(tmp.b.set(car.pos.x, Math.max(0.3, car.pos.y - 0.4), car.pos.z), Math.round(40 + 50 * power), 10, 1.4, 1.2);
  if (game.flight && game.flight.air > 0.4) endFlight(false, impact);
}

// ---------------------------------------------------------------- punteggi
function startFlight() {
  const fromRamp = car.wheels.some(w => w.surf === 'ramp');
  game.flight = { air: 0, releaseH: Math.max(0, car.pos.y - CAR.com.y), maxH: Math.max(0, car.pos.y - CAR.com.y), pitch: 0, roll: 0, yaw: 0, fromRamp, x0: car.pos.x };
  if (game.jump) game.jump.hit.clear();
}
function trackFlight(dt) {
  const f = game.flight; if (!f) return;
  f.air += dt; f.maxH = Math.max(f.maxH, car.pos.y - CAR.com.y);
  invQ.copy(car.q).invert();
  const wb = tmp.a.copy(car.w).applyQuaternion(invQ);
  f.pitch += wb.x * dt; f.roll += wb.z * dt; f.yaw += wb.y * dt;
}
function clearedVehicles(f) {
  const lo = Math.min(f.x0, car.pos.x), hi = Math.max(f.x0, car.pos.x);
  return VEHICLES.filter((v, i) => v.x0 > lo && v.x1 < hi - 1.125 && !game.jump.hit.has(i)).length;
}
// stesso calcolo dei punti del gioco originale
function endFlight(landed, impact = 0) {
  const f = game.flight; game.flight = null;
  if (!f || f.air < 0.5) return;
  const turns = (Math.abs(f.pitch) + Math.abs(f.roll)) / (2 * Math.PI);
  const cleared = clearedVehicles(f);
  const kind = f.fromRamp ? 'ramp' : cleared > 0 ? 'jump' : (game.challenge !== 'ramp' && game.challenge !== 'jump' && f.air > 0.8 ? 'trick' : null);
  if (!kind) return;
  if (!landed) {
    toast(T('t.crash'), T('t.crashDetail', (kind === 'ramp' ? f.releaseH : f.maxH).toFixed(1), turns.toFixed(2), impact.toFixed(1)));
    return;
  }
  const upY = tmp.a.set(0, 1, 0).applyQuaternion(car.q).y;
  const tilt = Math.acos(THREE.MathUtils.clamp(upY, -1, 1)) * 180 / Math.PI;
  const gasLeft = CAR.gasInf ? 1 : car.gas / CAR.gasL;
  const u = Math.max(0, 1 - impact / 7), c = Math.max(0, 1 - tilt / 28);
  const zone = kind === 'ramp' ? LAND_ZONE : JUMP_ZONE;
  const onMark = kind !== 'trick' && Math.abs(car.pos.x - zone.x) <= zone.hx && Math.abs(car.pos.z) <= zone.hz;
  const flips = kind === 'ramp' ? Math.floor(turns + 0.08) : Math.max(0, Math.floor(turns - 0.5 + 0.08));
  let pts = kind === 'jump' ? 600 * cleared + Math.round(40 * f.maxH) : kind === 'trick' ? Math.round(40 * f.maxH) : Math.round(60 * f.releaseH);
  pts += Math.round(150 * f.air) + 1500 * flips + Math.round(1200 * u) + Math.round(600 * c) + Math.round(800 * gasLeft) + (onMark ? 1000 : 0);
  const score = 10 * Math.round(pts / 10);
  const complete = kind === 'ramp' || cleared === VEHICLES.length;
  const title = kind === 'trick' ? T('t.trick') : complete ? (u > 0.75 && c > 0.75 && onMark ? T('t.perfect') : u > 0.5 && c > 0.5 ? T('t.clean') : T('t.landed')) : T('t.short');
  const key = 'best_' + game.challenge;
  const isBest = score > (save[key] || 0);
  if (isBest) { save[key] = score; persist(); updateTopHud(); }
  const parts = [kind === 'jump' ? T('t.cleared', cleared, VEHICLES.length) : kind === 'trick' ? T('t.high', f.maxH.toFixed(1)) : T('t.released', f.releaseH.toFixed(1)), T('t.air', f.air.toFixed(2)), T('t.turns', turns.toFixed(2)), T('t.impact', impact.toFixed(1)), `${tilt.toFixed(0)}°`, T('t.gasLeft', Math.round(gasLeft * 100))];
  if (onMark) parts.push(T('t.onMark'));
  toast(`${title} · ${score.toLocaleString(getLang() === 'it' ? 'it-IT' : 'en-US')} ${T('ui.pts')}${isBest ? ' · ' + T('t.best') : ''}`, parts.join(' · '));
  fx.smoke(tmp.b.set(car.pos.x, 0.2, car.pos.z), 36, 7, 0.4, 0.8);
  audioHit(Math.min(0.6, impact / 12), false);
  cam.shake = Math.max(cam.shake, Math.min(0.6, impact / 14));
  rumbleFx(0.3, 0.6, 160);
}
function trackJump() { }
// ---------------------------------------------------------------- impostazioni (come il pannello dell'originale)
const gripLabel = v => v < 0.6 ? T('s.gripWet') : v < 0.78 ? T('s.gripAvg') + ' (−)' : v < 0.95 ? T('s.gripAvg') : v < 1.15 ? T('s.gripDry') : T('s.gripTrack');
const SETTINGS = [
  { key: 'gas', label: 's.gas', min: 100, max: 2050, step: 50, def: 600, fmt: v => v > 2000 ? T('s.infinite') : `${v} L` },
  { key: 'burn', label: 's.burn', min: 50, max: 600, step: 10, def: 180, fmt: v => `${v} L/s` },
  { key: 'lift', label: 's.lift', min: 1.4, max: 4, step: 0.1, def: 2.4, fmt: v => `${v.toFixed(1)} g` },
  { key: 'boost', label: 's.boost', min: 0.5, max: 5, step: 0.1, def: 2.2, fmt: v => `${v.toFixed(1)} g` },
  { key: 'air', label: 's.air', min: 0.4, max: 2.5, step: 0.1, def: 1.4, fmt: v => `${Math.round(v * 100)}%` },
  { key: 'grip', label: 's.grip', min: 0.4, max: 1.4, step: 0.05, def: 0.85, fmt: v => `μ ${v.toFixed(2)} · ${gripLabel(v)}` },
  { key: 'impact', label: 's.impact', min: 0, max: 100, step: 10, def: 100, fmt: v => v ? `${v}%` : T('s.off') },
  { key: 'invert', label: 's.invert', min: 0, max: 1, step: 1, def: 0, fmt: v => v ? T('s.inverted') : T('s.normal') },
  { key: 'volume', label: 's.volume', min: 0, max: 100, step: 5, def: 80, fmt: v => `${v}%` },
  { key: 'lang', label: 's.lang', min: 0, max: 1, step: 1, def: 0, fmt: v => v ? 'English' : 'Italiano',
    get: () => getLang() === 'en' ? 1 : 0, set: v => setLang(v ? 'en' : 'it') },
];
save.settings = Object.assign(Object.fromEntries(SETTINGS.map(o => [o.key, o.def])), save.settings || {});
const settingsUI = { open: false, sel: 0, rows: [] };
const helpUI = { open: false };
const sval = o => o.get ? o.get() : save.settings[o.key];
function applySettings(refill) {
  const S = save.settings;
  CAR.gasInf = S.gas > 2000; CAR.gasL = CAR.gasInf ? 600 : S.gas;
  CAR.gasKg = Math.min(450, 0.258 * CAR.gasL); CAR.mass = 1745 + CAR.gasKg; // 600 L di azoto a 690 bar ≈ 155 kg
  CAR.burn = S.burn; CAR.liftG = S.lift; CAR.boostG = S.boost; fx.density = S.air;
  CAR.mu = S.grip; CAR.hookBang = S.impact / 100;
  for (const t of car.thr) { // ugelli dimensionati per la spinta scelta
    t.max = t.kind === 'rear' ? Math.max(12000, CAR.boostG * CAR.mass * G / 4 * 1.05) : Math.max(11000, CAR.liftG * CAR.mass * G * t.liftW / LIFT_WSUM * 1.15);
  }
  if (audio.master) audio.master.gain.value = 0.8 * S.volume / 100;
  if (refill) { car.gas = CAR.gasL; car.mass = CAR.mass; }
}
function buildSettingsUI() {
  const host = $('setRows'); host.innerHTML = '';
  settingsUI.rows = SETTINGS.map((o, i) => {
    const row = document.createElement('div'); row.className = 'srow';
    row.innerHTML = `<div class="top"><span>${T(o.label)}</span><b></b></div><input type="range" min="${o.min}" max="${o.max}" step="${o.step}">`;
    const inp = row.querySelector('input'), val = row.querySelector('b');
    const show = () => { const v = sval(o); val.textContent = o.fmt(v); inp.value = v; };
    inp.addEventListener('input', () => { const v = +inp.value; if (o.set) o.set(v); else save.settings[o.key] = v; show(); persist(); applySettings(o.key === 'gas'); });
    row.addEventListener('pointerdown', () => { settingsUI.sel = i; markSel(); });
    host.appendChild(row); show();
    return { row, inp, show, o };
  });
  markSel();
}
function nudgeSetting(dir) {
  const r = settingsUI.rows[settingsUI.sel], o = r.o;
  let v = Math.round(THREE.MathUtils.clamp(sval(o) + dir * o.step, o.min, o.max) / o.step) * o.step;
  if (o.step < 1) v = +v.toFixed(2);
  if (o.set) o.set(v); else save.settings[o.key] = v;
  r.show(); persist(); applySettings(o.key === 'gas');
}
function toggleSettings(on = !settingsUI.open) {
  settingsUI.open = on; $('settings').classList.toggle('on', on);
  if (on) { for (const r of settingsUI.rows) r.show(); markSel(); }
}
// comandi: tabella nel pulsante ? al bordo dello schermo (mai sullo schermo di gioco)
const HELP = [
  ['h.drive', 'R2 / L2', 'W / S'], ['h.steer', 'L', 'A D · W S'], ['h.lift', '✕', 'Space'], ['h.boost', '○', 'Shift'], ['h.retro', '□', 'C'],
  ['h.roll', 'L1 / R1', 'Q / E'], ['h.view', '△', 'V'], ['h.chal', 'Touchpad / L3', 'T'], ['h.recover', 'CREATE', 'F'], ['h.restart', 'OPTIONS', 'R'],
  ['h.settings', 'OPTIONS (' + 'hold)', 'P'], ['h.cam', 'R', 'mouse'], ['h.zoom', 'R3', 'Z · wheel'], ['h.sLevel', 'D-pad ↑ / ↓', 'M / N'],
  ['h.sMode', 'D-pad →', 'G'], ['h.tc', 'D-pad ←', 'H'],
];
function buildHelp() {
  const padName = { L: getLang() === 'it' ? 'Stick sx' : 'Left stick', R: getLang() === 'it' ? 'Stick dx' : 'Right stick' };
  const fill = (id, col) => { const host = $(id); host.innerHTML = ''; for (const r of HELP) { const d = document.createElement('div'); let k = r[col]; if (col === 1) k = (padName[k] || k).replace('(hold)', '(' + T('h.hold') + ')'); else k = k.replace('wheel', T('h.wheel')).replace('mouse', T('h.drag')); d.innerHTML = `<span>${T(r[0])}</span><span>${k.split(' · ').map(x => `<kbd>${x}</kbd>`).join(' ')}</span>`; host.appendChild(d); } };
  fill('helpPad', 1); fill('helpKb', 2);
}
function toggleHelp(on = !helpUI.open) { helpUI.open = on; $('help').classList.toggle('on', on); }
function wireUI() {
  $('setBtn').addEventListener('click', e => { e.stopPropagation(); startGame(); toggleSettings(); });
  $('helpBtn').addEventListener('click', e => { e.stopPropagation(); toggleHelp(); });
  $('setClose').addEventListener('click', () => toggleSettings(false));
  $('helpClose').addEventListener('click', () => toggleHelp(false));
  $('setReset').addEventListener('click', () => { for (const o of SETTINGS) { if (o.set) continue; save.settings[o.key] = o.def; } persist(); applySettings(true); for (const r of settingsUI.rows) r.show(); });
  $('settings').addEventListener('pointerdown', e => { if (e.target.id === 'settings') toggleSettings(false); });
  $('help').addEventListener('pointerdown', e => { if (e.target.id === 'help') toggleHelp(false); });
  onLang(() => { buildSettingsUI(); buildHelp(); refreshTexts(); });
  buildSettingsUI(); buildHelp(); applyI18n(); refreshTexts();
}
function refreshTexts() { $('thrFront').textContent = T('ui.front'); updateTopHud(); }
function markSel() { settingsUI.rows.forEach((r, i) => r.row.classList.toggle('sel', i === settingsUI.sel)); }

// minimappa: disegno fisso una volta, poi solo l'auto
const MM = { x0: -480, x1: 230, z0: -215, z1: 322 };
const mmCanvas = document.getElementById('minimap'), mmCtx = mmCanvas.getContext('2d');
const mmStatic = document.createElement('canvas'); mmStatic.width = mmCanvas.width; mmStatic.height = mmCanvas.height;
const mmS = Math.min((mmCanvas.width - 12) / (MM.x1 - MM.x0), (mmCanvas.height - 12) / (MM.z1 - MM.z0));
const mmX = x => 6 + (x - MM.x0) * mmS, mmZ = z => 6 + (z - MM.z0) * mmS;
{
  const g = mmStatic.getContext('2d'), mi = routes.mini;
  const [hx, hz, hw, hh] = mi.hills; g.fillStyle = 'rgba(123,102,70,.45)'; g.fillRect(mmX(hx), mmZ(hz), hw * mmS, hh * mmS);
  if (mi.grid) { g.fillStyle = 'rgba(95,99,106,.5)'; g.fillRect(mmX(mi.grid[0]), mmZ(mi.grid[1]), mi.grid[2] * mmS, mi.grid[3] * mmS); }
  if (mi.ring) { g.strokeStyle = '#a3a6ac'; g.lineWidth = Math.max(2, 9 * mmS); g.beginPath(); g.arc(mmX(mi.ring[0]), mmZ(mi.ring[1]), (mi.ring[2] - 4) * mmS, 0, 7); g.stroke(); }
  if (mi.skid) { g.strokeStyle = 'rgba(240,240,235,.7)'; g.lineWidth = 1; g.beginPath(); g.arc(mmX(mi.skid[0]), mmZ(mi.skid[1]), mi.skid[2] * mmS, 0, 7); g.stroke(); }
  for (const pl of mi.polys) { g.strokeStyle = '#8a8a8e'; g.lineWidth = Math.max(2, pl.width * mmS); g.lineJoin = 'round'; g.beginPath(); pl.pts.forEach(([x, z], i) => i ? g.lineTo(mmX(x), mmZ(z)) : g.moveTo(mmX(x), mmZ(z))); if (pl.closed) g.closePath(); g.stroke(); }
  g.fillStyle = '#b9b8b2'; for (const [x, z, w, h] of mi.rects) g.fillRect(mmX(x), mmZ(z), Math.max(1.5, w * mmS), Math.max(1.5, h * mmS));
  g.fillStyle = '#ff6a1a'; for (const [x, z] of mi.lines) g.fillRect(mmX(x) - 1, mmZ(z) - 1, 2, 2);
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(mmX(-190), mmZ(0)); g.lineTo(mmX(0), mmZ(0)); g.stroke();
  g.fillStyle = '#ff3326'; g.fillRect(mmX(-1), mmZ(-2.3), 11 * mmS + 1, 4.6 * mmS + 1);
  g.fillStyle = '#d0cfc8'; for (const v of VEHICLES) g.fillRect(mmX(v.x0), mmZ(-1), Math.max(1.5, v.length * mmS), 2);
  g.fillStyle = 'rgba(159,216,255,.8)'; g.fillRect(mmX(AIR_PAD.x - AIR_PAD.h), mmZ(AIR_PAD.z - AIR_PAD.h), 2 * AIR_PAD.h * mmS + 1, 2 * AIR_PAD.h * mmS + 1);
  if (mi.flags) { g.fillStyle = '#efefea'; for (const [x, z] of mi.flags) g.fillRect(mmX(x) - 1, mmZ(z) - 1, 2, 2); }
}
function drawMinimap() {
  mmCtx.clearRect(0, 0, mmCanvas.width, mmCanvas.height); mmCtx.drawImage(mmStatic, 0, 0);
  const f = tmp.a.set(0, 0, -1).applyQuaternion(car.q), a = Math.atan2(f.z, f.x);
  const Wm = mmCanvas.width, Hm = mmCanvas.height, px = mmX(car.pos.x), py = mmZ(car.pos.z), M = 9;
  const out = px < M || px > Wm - M || py < M || py > Hm - M;
  if (!out) {
    mmCtx.save(); mmCtx.translate(px, py); mmCtx.rotate(a);
    mmCtx.fillStyle = '#ffffff'; mmCtx.beginPath(); mmCtx.moveTo(6, 0); mmCtx.lineTo(-4, 3.5); mmCtx.lineTo(-4, -3.5); mmCtx.closePath(); mmCtx.fill(); mmCtx.restore();
  } else {
    // fuori dalla mappa: freccia arancione sul bordo che indica dove sei, con la distanza per tornare
    const cx = Wm / 2, cy = Hm / 2, dx = px - cx, dy = py - cy;
    const k = Math.min((Wm / 2 - M) / Math.abs(dx || 1e-6), (Hm / 2 - M) / Math.abs(dy || 1e-6));
    const bx = cx + dx * k, by = cy + dy * k, ang = Math.atan2(dy, dx);
    mmCtx.save(); mmCtx.translate(bx, by); mmCtx.rotate(ang);
    mmCtx.fillStyle = '#ff7a2f'; mmCtx.beginPath(); mmCtx.moveTo(8, 0); mmCtx.lineTo(-5, 6); mmCtx.lineTo(-2, 0); mmCtx.lineTo(-5, -6); mmCtx.closePath(); mmCtx.fill(); mmCtx.restore();
    const ddx = Math.max(MM.x0 - car.pos.x, 0, car.pos.x - MM.x1), ddz = Math.max(MM.z0 - car.pos.z, 0, car.pos.z - MM.z1);
    mmCtx.fillStyle = '#ff7a2f'; mmCtx.font = '500 11px "General Sans", system-ui'; mmCtx.textAlign = 'center';
    mmCtx.fillText(T('ui.outMap', Math.round(Math.hypot(ddx, ddz))), cx, Hm - 4);
  }
  if (out && !game.outOfMap) toast(T('t.copyHint'), '');
  game.outOfMap = out;
}

// ---------------------------------------------------------------- modello 3D
const carRoot = new THREE.Group(); scene.add(carRoot);
const model = new THREE.Group(); model.position.copy(CAR.com).negate(); carRoot.add(model);
const plumeGeo = new THREE.CylinderGeometry(0.07, 0.42, 1, 14, 1, true); plumeGeo.translate(0, -0.5, 0);
const plumeMat = () => new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color('#f4f8ff') }, uLevel: { value: 0 }, uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vView;
    void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 uColor; uniform float uLevel; uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vView;
    void main(){ float along = vUv.y; float rim = pow(abs(dot(normalize(vN), vView)), 1.4); float flicker = 0.85 + 0.15 * sin(uTime * 61.0 + vUv.x * 18.0);
      float diamonds = 0.55 + 0.45 * smoothstep(0.55, 1.0, cos((1.0 - along) * 34.0)) * along;
      float a = 0.55 * pow(along, 1.3) * rim * uLevel * flicker * diamonds; gl_FragColor = vec4(uColor * (0.85 + along * 0.9), a); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
});
// campana divergente: bocca a y = 0, gola verso +y (dentro la carrozzeria)
const bellGeo = new THREE.LatheGeometry([[0.05, 0], [0.046, 0.014], [0.037, 0.034], [0.027, 0.054], [0.021, 0.068], [0.025, 0.075]].map(([r, y]) => new THREE.Vector2(r, y)), 32);
const bellMat = new THREE.MeshStandardMaterial({ color: '#a9adb2', metalness: 1, roughness: 0.28, side: THREE.DoubleSide });
const ringGeo = new THREE.TorusGeometry(0.06, 0.008, 10, 36);
const ringMat = new THREE.MeshStandardMaterial({ color: '#1b1c1f', metalness: 0.7, roughness: 0.4 });
const gimbalGeo = new THREE.TorusGeometry(0.052, 0.005, 8, 28);
const cavityGeo = new THREE.CircleGeometry(0.066, 28);
const cavityMat = new THREE.MeshBasicMaterial({ color: '#030303', side: THREE.DoubleSide });
const DOWN = new V3(0, -1, 0), ZP = new V3(0, 0, 1);
for (const t of car.thr) {
  const g = new THREE.Group(); g.position.set(...(t.vpos || t.pos)); model.add(g);
  t.base = t.vbase ? new V3(...t.vbase).normalize() : t.kind === 'rear' ? new V3(0, 0, 1) : new V3(0, -1, 0); // direzione dello scarico a riposo
  const ring = new THREE.Mesh(ringGeo, ringMat); ring.quaternion.setFromUnitVectors(ZP, t.base); g.add(ring);
  const cav = new THREE.Mesh(cavityGeo, cavityMat); cav.quaternion.setFromUnitVectors(ZP, t.base); cav.position.copy(t.base).multiplyScalar(-0.085); g.add(cav);
  const aim = new THREE.Group(); aim.quaternion.setFromUnitVectors(DOWN, t.base); g.add(aim);
  const bell = new THREE.Mesh(bellGeo, bellMat); aim.add(bell);
  if (t.kind === 'vec') { const gb = new THREE.Mesh(gimbalGeo, ringMat); gb.rotation.x = Math.PI / 2; gb.position.y = 0.045; aim.add(gb); }
  const c = new THREE.Mesh(plumeGeo, plumeMat()); c.visible = false; aim.add(c);
  t.cone = c; t.vis = 0; t.aim = aim; t.aimQ = new THREE.Quaternion().copy(aim.quaternion);
}
const suctionGlow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.5), new THREE.MeshBasicMaterial({ color: new THREE.Color('#9fd8ff').multiplyScalar(1.3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
suctionGlow.rotation.set(-Math.PI / 2, 0, Math.PI / 2); suctionGlow.position.set(0, 0.12, 0.1); model.add(suctionGlow);

let modelReady = false;
// Modello originale della Tesla Roadster 2026: una sola mesh con la texture già illuminata
// (collegata come emissiva). La converto in un materiale normale che reagisce alle luci,
// la scalo sul passo reale (2,65 m) e separo le quattro ruote per farle girare e sterzare.
const MODEL = { scale: 2.276, hubY: 0.148, hubR: 0.152, axleF: 0.529, axleR: -0.632, zOff: 0.05 };
new GLTFLoader().load('./models/tesla-roadster-2026.glb', gltf => {
  let src = null; gltf.scene.traverse(o => { if (o.isMesh && !src) src = o; });
  const tex = src.material.emissiveMap || src.material.map;
  if (tex) { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); }
  const mat = new THREE.MeshPhysicalMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.16, roughness: 0.42, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 0.9, side: THREE.DoubleSide });
  const geo = src.geometry, pa = geo.attributes.position.array, ix = geo.index.array;
  // nel modello il muso è verso +Z; la fisica ha il muso verso -Z (rotazione di 180°)
  const hubs = [{ name: 'wheel_fl', sx: 1, z: MODEL.axleF }, { name: 'wheel_fr', sx: -1, z: MODEL.axleF }, { name: 'wheel_rl', sx: 1, z: MODEL.axleR }, { name: 'wheel_rr', sx: -1, z: MODEL.axleR }];
  const nv = pa.length / 3, tag = new Int8Array(nv).fill(-1), xs = [0, 0, 0, 0], xn = [0, 0, 0, 0];
  for (let v = 0; v < nv; v++) {
    const x = pa[3 * v], y = pa[3 * v + 1], z = pa[3 * v + 2];
    if (Math.abs(x) < 0.2) continue;
    for (let k = 0; k < 4; k++) {
      const hb = hubs[k]; if (Math.sign(x) !== hb.sx) continue;
      if (Math.hypot(z - hb.z, y - MODEL.hubY) < MODEL.hubR) { tag[v] = k; xs[k] += x; xn[k]++; break; }
    }
  }
  const body = [], wl = [[], [], [], []];
  for (let t = 0; t < ix.length; t += 3) {
    const a = tag[ix[t]], b = tag[ix[t + 1]], c = tag[ix[t + 2]];
    (a >= 0 && a === b && b === c ? wl[a] : body).push(ix[t], ix[t + 1], ix[t + 2]);
  }
  const sub = list => { const g = new THREE.BufferGeometry(); for (const k of ['position', 'normal', 'uv']) if (geo.attributes[k]) g.setAttribute(k, geo.attributes[k]); g.setIndex(new THREE.Uint32BufferAttribute(list, 1)); g.computeBoundingSphere(); return g; };
  const S = MODEL.scale;
  const bodyMesh = new THREE.Mesh(sub(body), mat);
  bodyMesh.scale.setScalar(S); bodyMesh.rotation.y = Math.PI; bodyMesh.position.z = MODEL.zOff;
  bodyMesh.castShadow = bodyMesh.receiveShadow = true; model.add(bodyMesh);
  // le ruote della mesh vengono scartate: al loro posto ruote costruite da zero (wheels.js)
  const WSPEC = { wheel_fl: 0.255, wheel_fr: 0.255, wheel_rl: 0.305, wheel_rr: 0.305 };
  hubs.forEach(hb => {
    const w = car.wheels.find(q => q.name === hb.name), side = w.hub[0] < 0 ? -1 : 1, W = WSPEC[hb.name];
    const piv = new THREE.Group(); piv.name = hb.name;
    piv.position.set(side * (0.925 - W / 2), CAR.wheelR, -hb.z * S + MODEL.zOff);
    const wh = buildWheel(THREE, { R: 0.352, W, rimR: 0.262 });
    if (side < 0) wh.root.scale.x = -1; // faccia del cerchio verso l'esterno anche a sinistra
    wh.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    piv.add(wh.root); model.add(piv);
    const liner = archLiner(THREE, 0.41, 0.44); liner.position.set(side * 0.72, CAR.wheelR, piv.position.z); model.add(liner);
    w.node = piv; w.spinNode = wh.spin; w.base = piv.position.clone(); w.baseQ = piv.quaternion.clone();
  });
  modelReady = true;
}, undefined, err => {
  // senza il file .glb (non incluso nel repository pubblico) si usa il modello procedurale
  console.warn('GLB non trovato, uso il modello procedurale', err);
  const fb = buildRoadster(THREE);
  model.add(fb.group);
  for (const w of car.wheels) {
    const g = fb.wheels[w.name]; if (!g) continue;
    g.position.y = CAR.wheelR;
    w.node = g; w.spinNode = g.userData.spin || g.children[0] || null; w.base = g.position.clone(); w.baseQ = g.quaternion.clone();
  }
  modelReady = true;
});

const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), AX = new V3(1, 0, 0), AY = new V3(0, 1, 0);
function syncVisuals(dt) {
  carRoot.position.copy(car.pos); carRoot.quaternion.copy(car.q);
  for (const w of car.wheels) {
    if (!w.node) continue;
    w.node.position.copy(w.base); w.node.position.y += CAR.travelUp - w.t;
    w.node.quaternion.setFromAxisAngle(AY, w.delta || 0);  // sterzo (Ackermann): la pinza segue lo sterzo
    if (w.spinNode) w.spinNode.rotation.x = -w.spin;        // cerchio e gomma girano
  }
  suctionGlow.material.opacity = 0.45 * car.fan * (car.contacts / 4);
  // getti: coni luminosi e gas come l'originale (70 particelle/s per il sollevamento divise
  // sui 6 ugelli come i 4 dell'originale, 40/s per ogni getto posteriore, 34/s per l'assetto)
  const now = performance.now() / 1000;
  fx.jets.length = 0;
  for (const t of car.thr) {
    const firing = t.level > 0.03, venting = !firing && (car.ventT || 0) > 0.05;
    const target = firing ? 1 : venting ? 0.4 * car.ventT : 0;
    t.vis += (target - t.vis) * Math.min(1, dt * (target > t.vis ? 30 : 14));
    // l'ugello orientabile ruota nel suo supporto verso la direzione reale della spinta
    const ex = tmp.a.copy(t.base);
    if (firing && t.f.lengthSq() > 1e-6) ex.copy(t.f).normalize().negate();
    _q1.setFromUnitVectors(DOWN, ex); t.aimQ.slerp(_q1, Math.min(1, dt * 14)); t.aim.quaternion.copy(t.aimQ);
    const on = t.vis > 0.01;
    t.cone.visible = false; // il getto è disegnato dalla nebbia stessa
    if (!on) continue;
    const L = t.vis;
    t.cone.material.uniforms.uLevel.value = L; t.cone.material.uniforms.uTime.value = now;
    t.cone.scale.set(0.8 + 0.4 * L, 0.6 + 2.4 * L * (0.9 + 0.2 * Math.random()), 0.8 + 0.4 * L);
    if (target === 0) continue;
    const exW = tmp.b.copy(DOWN).applyQuaternion(t.aimQ).applyQuaternion(car.q);
    const pW = tmp.c.copy(t.vrel).applyQuaternion(car.q).add(car.pos);
    if (venting) { // sfiato di sicurezza da ribaltata: nuvoletta dagli ugelli, senza spinta
      const nv = Math.floor(34 * fx.density * car.ventT * dt + Math.random());
      if (nv > 0) fx.gas(pW, exW, car.v, nv, 0.32);
      continue;
    }
    fx.jets.push({ x: pW.x, y: pW.y, z: pW.z, dx: exW.x, dy: exW.y, dz: exW.z, s: t.level });
    const liftJet = t.kind === 'vec' && t.lift;
    const base = t.kind === 'rear' ? 230 : liftJet ? 270 : 130; // getto continuo e denso di nebbia
    const n = Math.floor(base * fx.density * dt + Math.random());
    if (n > 0) fx.gas(pW, exW, car.v, n, liftJet ? 1 : t.kind === 'rear' ? 0.9 : 0.6);
  }
  // fumo delle gomme
  for (const w of car.wheels) {
    if (!w.contact || w.slip < 0.35 || car.v.length() < 3) continue;
    if (Math.random() > w.slip) continue;
    const p = tmp.a.copy(w.rel).applyQuaternion(car.q).add(car.pos); p.y = Math.max(0.15, p.y - 0.3);
    fx.smoke(p, 1, 2, 0.6, 0.5);
  }
}

// ---------------------------------------------------------------- telecamera
const cam = { init: true, autoYaw: 0, autoPitch: 0, shake: 0, fwd: new V3(0, 0, -1), up: new V3(0, 1, 0), arm: 7, fov: 60, pos: new V3(), look: new V3(), yaw: 0, pitch: 0, zoom: 1, idle: 0, drag: null };
const ZOOMS = [0.75, 1, 1.5, 2.2];
const _cp2 = new V3(), _cf = new V3(), _cr = new V3(), _cu = new V3(), _cp = new V3(), _cd = new V3(), _cl = new V3(), _cw = new V3(), _cv = new V3(), _tp = new V3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
// ruota il vettore unitario `cur` verso `want` di una frazione f (senza scatti, anche quando sono opposti)
function steerVec(cur, want, f) { _qa.setFromUnitVectors(cur, want); _qb.identity().slerp(_qa, f); cur.applyQuaternion(_qb).normalize(); }
// braccio della telecamera: si ferma prima di terreno, rampa o veicoli
function armClear(from, dir, maxLen) {
  for (let t = 1.3; t < maxLen; t += 0.5) { _tp.copy(from).addScaledVector(dir, t); if (sdf(_tp, tmp.n) < 0.4) return Math.max(1.5, t - 0.5); }
  return maxLen;
}
// Telecamera di inseguimento ispirata a GTA V: segue la direzione di marcia con un ritardo morbido
// (non l'auto che gira su sé stessa), l'alto resta il cielo tranne quando si sale in verticale, il
// braccio si accorcia di colpo contro gli ostacoli e si riallunga piano, il campo visivo si allarga
// con la velocità e un leggero sguardo in avanti mostra dove stai andando.
function updateCamera(dt) {
  const view = VIEWS[game.view], inv = save.settings.invert ? -1 : 1;
  if (input.camX || input.camY) { cam.yaw -= input.camX * 2.6 * dt; cam.pitch = THREE.MathUtils.clamp(cam.pitch + inv * input.camY * 1.8 * dt, -0.6, 1.2); cam.idle = 0; }
  else if (!cam.drag) cam.idle += dt;
  if (input.zoom) cam.zoom = THREE.MathUtils.clamp(cam.zoom * Math.exp(input.zoom * 1.3 * dt), 0.45, 3);
  const sp = car.v.length();
  if (cam.idle > 2 && view === 'third' && sp > 2) { const k = Math.min(1, dt * 1.6); cam.yaw -= cam.yaw * k; cam.pitch -= cam.pitch * k; }

  const fovT = view === 'third' ? 60 + 15 * THREE.MathUtils.clamp(sp / 80, 0, 1) : { cockpit: 72, side: 40, drone: 45 }[view];
  cam.fov += (fovT - cam.fov) * (cam.init ? 1 : 1 - Math.exp(-3 * dt));
  if (Math.abs(camera.fov - cam.fov) > 0.05) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }

  if (view === 'third') {
    const fb = _cf.set(0, 0, -1).applyQuaternion(car.q);
    const want = _cw.copy(fb);
    if (car.contacts === 0) {                                                     // in aria: la direzione di marcia sul piano orizzontale
      _cv.set(car.v.x, 0, car.v.z); const hs = _cv.length();                      // (salendo coi getti la visuale resta ferma)
      if (hs > 4) want.copy(_cv).divideScalar(hs); else want.copy(cam.fwd).setY(cam.fwd.y * 0.5).normalize();
    }
    else if (sp > 8 && car.v.dot(fb) > 0) { _cv.copy(car.v).divideScalar(sp); want.lerp(_cv, 0.4 * THREE.MathUtils.smoothstep(sp, 8, 25)).normalize(); } // in derapata guarda dove vai
    if (cam.init) { cam.fwd.copy(want); cam.up.set(0, 1, 0); cam.arm = 7; }
    // la direzione ruota verso quella desiderata, al massimo 220°/s; l'alto viaggia con lei (trasporto parallelo)
    // così resta sempre perpendicolare e non può "scattare" nemmeno quando si guarda in verticale
    _qa.setFromUnitVectors(cam.fwd, want);
    const need = 2 * Math.acos(THREE.MathUtils.clamp(Math.abs(_qa.w), 0, 1));
    const fr = cam.init ? 1 : Math.min(1 - Math.exp(-(car.contacts === 0 ? 2.4 : 6) * dt), need > 1e-4 ? 3.8 * dt / need : 1);
    _qb.identity().slerp(_qa, fr);
    cam.fwd.applyQuaternion(_qb).normalize(); cam.up.applyQuaternion(_qb);
    cam.up.addScaledVector(cam.fwd, -cam.up.dot(cam.fwd)).normalize();
    // l'alto desiderato è il cielo; sulla parete verticale diventa l'alto dell'auto
    const carUp = _cu.set(0, 1, 0).applyQuaternion(car.q);
    const sv = THREE.MathUtils.smoothstep(Math.abs(cam.fwd.y), 0.55, 0.88);
    const wu = _cd.set(0, 1, 0).lerp(carUp, sv); if (wu.lengthSq() < 0.05) wu.copy(carUp);
    wu.addScaledVector(cam.fwd, -wu.dot(cam.fwd));
    if (cam.init) { if (wu.lengthSq() > 1e-4) cam.up.copy(wu).normalize(); }
    else if (wu.lengthSq() > 0.02) {                      // torsione verso l'alto desiderato, al massimo 150°/s
      wu.normalize();
      _cr.crossVectors(cam.up, wu);
      const ang = Math.atan2(cam.fwd.dot(_cr), cam.up.dot(wu));
      const step = THREE.MathUtils.clamp(ang * (1 - Math.exp(-4 * dt)), -2.6 * dt, 2.6 * dt);
      cam.up.applyAxisAngle(cam.fwd, step);
    }
    _cr.crossVectors(cam.fwd, cam.up).normalize();
    const upO = _cu.copy(cam.up);
    const dirFor = (yw, pt, out) => { const cy = Math.cos(yw), sy = Math.sin(yw), el = 0.17 + pt, ce = Math.cos(el), se = Math.sin(el); return out.copy(cam.fwd).multiplyScalar(-cy).addScaledVector(_cr, sy).multiplyScalar(ce).addScaledVector(upO, se); };
    const pivot = _cl.copy(car.pos); pivot.y += 0.55;                        // perno fisso al centro dell'auto
    const dist = (6.2 + Math.min(sp * 0.018, 2.4)) * cam.zoom;
    // se dietro l'auto c'è un ostacolo (rampa, muro, veicolo) cerca un'inquadratura libera più in alto o di lato
    let tgtY = 0, tgtP = 0;
    const c0 = armClear(pivot, dirFor(cam.yaw, cam.pitch, _cp), dist);
    if (c0 < dist * 0.8) {
      let best = c0 - 1.2;                                                   // preferisce restare dietro l'auto
      for (const [dy, dp] of [[0, 0.45], [0, 0.9], [0.8, 0.25], [-0.8, 0.25], [1.5, 0.35], [-1.5, 0.35], [0, 1.25]]) {
        const cc = armClear(pivot, dirFor(cam.yaw + dy, cam.pitch + dp, _cp2), dist) - 0.5 * (Math.abs(dy) + dp);
        if (cc > best + 0.3) { best = cc; tgtY = dy; tgtP = dp; }
      }
    }
    const ka = 1 - Math.exp(-(tgtY || tgtP ? 4.5 : 1.6) * dt);
    cam.autoYaw += (tgtY - cam.autoYaw) * ka; cam.autoPitch += (tgtP - cam.autoPitch) * ka;
    dirFor(cam.yaw + cam.autoYaw, cam.pitch + cam.autoPitch, _cp);            // dal pivot alla telecamera
    const cy = Math.cos(cam.yaw);
    const clear = armClear(pivot, _cp, dist);
    cam.arm = cam.init ? clear : cam.arm + (clear - cam.arm) * (1 - Math.exp(-(clear < cam.arm ? 22 : 3.6) * dt));
    cam.pos.copy(pivot).addScaledVector(_cp, cam.arm);
    cam.look.copy(pivot).addScaledVector(cam.fwd, 2.4 * cy);
    camera.position.copy(cam.pos); camera.up.copy(upO);
    // orientamento finale passato in un filtro: elimina anche i micro-scatti dovuti all'accorciarsi del braccio
    _qa.copy(camera.quaternion); camera.lookAt(cam.look); _qb.copy(camera.quaternion);
    camera.quaternion.copy(_qa).slerp(_qb, cam.init ? 1 : 1 - Math.exp(-18 * dt));
  } else if (view === 'cockpit') {
    camera.position.set(-0.36, 1.06, 0.15).sub(CAR.com).applyQuaternion(car.q).add(car.pos);
    const look = _q1.setFromAxisAngle(AY, cam.yaw).multiply(_q2.setFromAxisAngle(AX, -cam.pitch * 0.6 - 0.05));
    camera.quaternion.copy(car.q).multiply(look);
    camera.up.set(0, 1, 0);
  } else {
    const base = view === 'side' ? new V3(0, 3, 30) : new V3(-26, 30, 26);
    base.multiplyScalar(cam.zoom).applyAxisAngle(AY, cam.yaw);
    base.y += cam.pitch * 15;
    const want = tmp.b.copy(car.pos).add(base); want.y = Math.max(1, want.y);
    const pk = cam.init ? 1 : 1 - Math.exp(-dt * 4);
    cam.pos.lerp(want, pk); cam.look.lerp(car.pos, cam.init ? 1 : 1 - Math.exp(-dt * 8));
    camera.position.copy(cam.pos); camera.up.set(0, 1, 0); camera.lookAt(cam.look);
  }
  cam.init = false;
  if (cam.shake > 0.01) {
    camera.position.x += (Math.random() - 0.5) * 0.25 * cam.shake; camera.position.y += (Math.random() - 0.5) * 0.25 * cam.shake;
    cam.shake *= Math.exp(-6 * dt);
  }
  sun.position.set(car.pos.x - 30, 60, car.pos.z + 25); sun.target.position.copy(car.pos);
}
renderer.domElement.addEventListener('pointerdown', e => { initAudio(); cam.drag = { x: e.clientX, y: e.clientY }; renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointermove', e => {
  if (!cam.drag) return;
  cam.yaw -= (e.clientX - cam.drag.x) * 0.005; cam.pitch = THREE.MathUtils.clamp(cam.pitch + (e.clientY - cam.drag.y) * 0.004, -0.6, 1.2);
  cam.drag = { x: e.clientX, y: e.clientY }; cam.idle = 0;
});
renderer.domElement.addEventListener('pointerup', () => { cam.drag = null; });
renderer.domElement.addEventListener('wheel', e => { e.preventDefault(); cam.zoom = THREE.MathUtils.clamp(cam.zoom * Math.exp(e.deltaY * 0.0012), 0.45, 3); }, { passive: false });
renderer.domElement.addEventListener('dblclick', () => { cam.yaw = cam.pitch = 0; cam.zoom = 1; });

// ---------------------------------------------------------------- HUD
const $ = id => document.getElementById(id);
const thrDots = {};
{
  const svg = $('thr'), NS = 'http://www.w3.org/2000/svg';
  for (const t of THRUSTERS) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', (t.vpos || t.pos)[0]); c.setAttribute('cy', (t.vpos || t.pos)[2]); c.setAttribute('r', 0.13); c.setAttribute('class', 'n');
    svg.appendChild(c); thrDots[t.id] = c;
  }
}
let toastTimer = 0;
function toast(t, s) { $('toastT').textContent = t; $('toastS').textContent = s || ''; $('toast').classList.add('on'); toastTimer = 3.2; }
function updateTopHud() {
  $('testN').textContent = T('ui.run', game.test);
  const b = save['best_' + game.challenge];
  $('best').textContent = b ? `${b.toLocaleString(getLang() === 'it' ? 'it-IT' : 'en-US')} ${T('ui.pts')}` : '—';
  $('chal').textContent = chName(game.challenge);
  $('view').textContent = viewName();
  $('sucMode').textContent = game.suction === 'auto' ? T('ui.suctionAuto') : `${T('ui.suctionManual')} ${Math.round(game.suctionLevel * 100)}%`;
  $('tcMode').textContent = game.tc ? T('ui.on') : T('ui.off');
}
let hudAcc = 0;
function updateHud(dt) {
  hudAcc += dt;
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').classList.remove('on');
  for (const t of car.thr) {
    const c = thrDots[t.id], l = t.level;
    c.style.fill = l > 0.03 ? `rgba(159,216,255,${0.35 + 0.65 * l})` : '';
    c.setAttribute('r', 0.13 + 0.12 * l);
  }
  if (hudAcc < 0.08) return; hudAcc = 0;
  const kmh = car.v.length() * 3.6;
  $('spd').firstChild.nodeValue = Math.round(kmh);
  $('alt').firstChild.nodeValue = Math.max(0, car.pos.y - CAR.com.y).toFixed(1);
  $('gf').firstChild.nodeValue = (car.gDisp || 1).toFixed(1);
  $('suc').firstChild.nodeValue = Math.round(car.fan * 100);
  const gf = CAR.gasInf ? 1 : car.gas / CAR.gasL;
  $('bar').firstChild.nodeValue = CAR.gasInf ? '∞' : Math.round(car.gas);
  $('bar').lastChild.textContent = CAR.gasInf ? '' : 'L';
  $('tankI').style.transform = `scaleY(${gf})`;
  $('tank').classList.toggle('low', gf < 0.2);
  $('thrInfo').textContent = CAR.gasInf ? T('ui.gasInf') : car.gas <= 0 ? T('ui.gasOut') : gf < 0.2 ? T('ui.gasLow') : T('ui.nozzles');
}
function inAirPad() { return Math.abs(car.pos.x - AIR_PAD.x) < AIR_PAD.h && Math.abs(car.pos.z - AIR_PAD.z) < AIR_PAD.h && car.contacts > 0 && car.v.length() < 3; }

// ---------------------------------------------------------------- loop
function startGame() {
  initAudio();
  if (game.started) return;
  if (helpUI.open) return;
  game.started = true; $('start').style.display = 'none'; renderer.domElement.focus();
}
$('start').addEventListener('click', e => { if (e.target.closest('.sub')) { toggleHelp(true); return; } startGame(); });

function handleEvents() {
  while (events.length) {
    const e = events.shift();
    if (!game.started) { if (e === 'cross') startGame(); else if (e === 'help') toggleHelp(); continue; }
    if (e === 'help') { toggleHelp(); continue; }
    if (e === 'view') { game.view = (game.view + 1) % VIEWS.length; cam.yaw = cam.pitch = 0; cam.init = true; updateTopHud(); }
    else if (e === 'challenge') { game.challenge = CHALLENGES[(CHALLENGES.indexOf(game.challenge) + 1) % CHALLENGES.length]; save.challenge = game.challenge; persist(); resetCar(); toast(T('t.challenge', chName(game.challenge)), chDesc(game.challenge)); }
    else if (e === 'restart') resetCar();
    else if (e === 'settings') toggleSettings();
    else if (e === 'setUp') { settingsUI.sel = (settingsUI.sel + SETTINGS.length - 1) % SETTINGS.length; markSel(); }
    else if (e === 'setDown') { settingsUI.sel = (settingsUI.sel + 1) % SETTINGS.length; markSel(); }
    else if (e === 'setLeft') nudgeSetting(-1);
    else if (e === 'setRight') nudgeSetting(1);
    else if (e === 'recover') recoverCar();
    else if (e === 'camReset') { cam.yaw = cam.pitch = 0; cam.zoom = 1; }
    else if (e === 'zoomCycle') { const i = ZOOMS.findIndex(z => Math.abs(z - cam.zoom) < 0.05); cam.zoom = ZOOMS[(i + 1) % ZOOMS.length]; cam.yaw = cam.pitch = 0; toast(T('t.zoom', `×${cam.zoom}`), ''); }
    else if (e === 'sUp' || e === 'sDown') { game.suctionLevel = Math.round(THREE.MathUtils.clamp(game.suctionLevel + (e === 'sUp' ? 0.1 : -0.1), 0, 1) * 10) / 10; save.suctionLevel = game.suctionLevel; persist(); updateTopHud(); toast(T('t.sLevel', Math.round(game.suctionLevel * 100)), game.suction === 'on' ? '' : T('t.sLevelD')); }
    else if (e === 'tc') { game.tc = !game.tc; updateTopHud(); toast(game.tc ? T('t.tcOn') : T('t.tcOff'), game.tc ? '' : T('t.tcOffD')); }
    else if (e === 'suction') { game.suction = SUCTION_MODES[(SUCTION_MODES.indexOf(game.suction) + 1) % SUCTION_MODES.length]; updateTopHud(); toast(game.suction === 'auto' ? T('t.sAuto') : T('t.sMan', Math.round(game.suctionLevel * 100)), game.suction === 'auto' ? T('t.sAutoD') : T('t.sManD')); }
  }
}

const clock = new THREE.Clock();
let lastContacts = 4;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 30);
  readInput();
  handleEvents();
  if (game.started && modelReady && !settingsUI.open && !helpUI.open) {
    const sub = 8, h = dt / sub;
    car.lastV.copy(car.v);
    for (let i = 0; i < sub; i++) physicsStep(h);
    car.accel.subVectors(car.v, car.lastV).divideScalar(Math.max(dt, 1e-4)).add(tmp.a.set(0, G, 0));
    // accelerometro filtrato (come quello vero): niente picchi da un singolo fotogramma
    car.gDisp = (car.gDisp || 1) + (car.accel.length() / G - (car.gDisp || 1)) * Math.min(1, dt / 0.15);
    game.crashCooldown -= dt;
    // volo
    if (car.contacts === 0) { car.airTime += dt; car.groundTime = 0; if (!game.flight && car.airTime > 0.15) startFlight(); }
    else {
      car.groundTime += dt;
      if (lastContacts === 0 && game.flight) {
        const upY = tmp.a.set(0, 1, 0).applyQuaternion(car.q).y;
        const impact = Math.max(0, -car.lastV.y);
        // le sospensioni assorbono fino a 12 m/s, oltre è uno schianto ("troppo duro")
        if (car.contacts >= 2 && upY > 0.6) { if (impact > 12) crashEvent(impact); else endFlight(true, impact); }
        else if (upY < 0.3) endFlight(false, Math.max(0, -car.lastV.y));
      }
      if (car.groundTime > 0.25) { car.airTime = 0; if (game.flight && car.groundTime > 0.8) endFlight(true); }
    }
    lastContacts = car.contacts;
    { // nel tratto a testa in giù dell'uncino, prima di staccarti: urto metallico proporzionale alla velocità
      const onRampNow = car.wheels.some(w => w.contact && w.surf === 'ramp'), upYv = tmp.a.set(0, 1, 0).applyQuaternion(car.q).y;
      if (onRampNow && upYv < -0.15 && !game.hookBanged) {
        game.hookBanged = true;
        const P = THREE.MathUtils.clamp((car.v.length() - 4) / 22, 0.06, 1) * (CAR.hookBang ?? 1);
        if (P > 0.02) { audioHit(P, true, false); cam.shake = Math.max(cam.shake, 0.7 * P); rumbleFx(0.35 + 0.55 * P, 0.7, 140 + 260 * P); }
      } else if (game.hookBanged && upYv > 0.3) game.hookBanged = false;
    }
    trackFlight(dt);
    trackJump();
    if (inAirPad() && !CAR.gasInf) car.gas = Math.min(CAR.gasL, car.gas + 120 * dt);
    // LED della rampa: si accendono fin dove sei arrivato
    if (car.wheels.some(w => w.contact && w.surf === 'ramp')) game.rampProgress = Math.max(game.rampProgress, rampS(car.pos.x, car.pos.y));
    rampLed.uniforms.uProgress.value = game.rampProgress;
    // vibrazione continua con i getti e le gomme
    if (performance.now() > rumble.next && (car.thrustFrac > 0.02 || car.slip > 0.3)) {
      rumbleFx(car.thrustFrac * 0.35, Math.min(0.5, car.thrustFrac * 0.6 + car.slip * 0.25), 120); rumble.next = performance.now() + 100;
    }
    audioUpdate();
  }
  if (modelReady) syncVisuals(dt);
  syncVehicles();
  fx.setScale(renderer.domElement.height, camera.fov);
  fx.update(dt);
  updateCamera(dt);
  updateHud(dt);
  drawMinimap();
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

game.test = Math.max(0, (save.tests || 0));
wireUI();
applySettings(true);
resetCar();
updateTopHud();
frame();













