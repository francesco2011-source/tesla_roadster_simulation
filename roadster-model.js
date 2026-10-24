// Modello procedurale della Tesla Roadster (seconda generazione).
// Riferimento auto: avanti = -Z, destra = +X, su = +Y, terreno a y = 0 (come la fisica).
// Carrozzeria costruita per sezioni (superellissi) lungo la lunghezza, con i passaruota
// ritagliati, abitacolo in vetro con tetto targa, fari sottili, fanale posteriore a barra.

const WHEEL_POS = {
  wheel_fl: [-0.843, 0.358, -1.155], wheel_fr: [0.829, 0.361, -1.154],
  wheel_rl: [-0.821, 0.358, 1.495], wheel_rr: [0.824, 0.358, 1.496],
};
const ARCH_R = 0.41;

// interpolazione Catmull-Rom su punti chiave [z, valore]
function curve(keys) {
  return z => {
    if (z <= keys[0][0]) return keys[0][1];
    const n = keys.length;
    if (z >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0; while (z > keys[i + 1][0]) i++;
    const p0 = keys[Math.max(0, i - 1)], p1 = keys[i], p2 = keys[i + 1], p3 = keys[Math.min(n - 1, i + 2)];
    const t = (z - p1[0]) / (p2[0] - p1[0]), t2 = t * t, t3 = t2 * t;
    const m1 = (p2[1] - p0[1]) / (p2[0] - p0[0] || 1) * (p2[0] - p1[0]);
    const m2 = (p3[1] - p1[1]) / (p3[0] - p1[0] || 1) * (p2[0] - p1[0]);
    return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
  };
}

// profili della carrozzeria
const Z0 = -2.33, Z1 = 2.27;
const TOP = curve([[-2.33, 0.40], [-2.26, 0.50], [-2.12, 0.585], [-1.9, 0.65], [-1.55, 0.705], [-1.15, 0.75], [-0.95, 0.775], [-0.6, 0.79], [0, 0.81], [0.6, 0.85], [1.1, 0.89], [1.5, 0.915], [1.9, 0.915], [2.15, 0.885], [2.27, 0.83]]);
const BOT = curve([[-2.33, 0.30], [-2.2, 0.21], [-1.95, 0.155], [-1.5, 0.135], [1.6, 0.135], [2.0, 0.17], [2.27, 0.27]]);
const SH = curve([[-2.33, 0.35], [-2.0, 0.44], [-1.155, 0.56], [-0.5, 0.53], [0.4, 0.53], [1.5, 0.60], [2.27, 0.58]]);
const WID = curve([[-2.33, 0.52], [-2.28, 0.76], [-2.14, 0.9], [-1.88, 0.97], [-1.155, 1.0], [-0.7, 0.965], [0, 0.95], [0.7, 0.975], [1.3, 1.02], [1.6, 1.03], [2.0, 0.995], [2.2, 0.935], [2.27, 0.87]]);
const NU = 4.0, NL = 5.0;
// gobbe dei parafanghi (anteriori sopra le ruote, fianchi larghi dietro)
const bump = (z, xr) => {
  const f = 0.065 * Math.exp(-(((z + 1.155) / 0.42) ** 2)) + 0.07 * Math.exp(-(((z - 1.45) / 0.55) ** 2));
  return f * Math.exp(-(((xr - 0.72) / 0.2) ** 2));
};
// punto della superficie sul lato destro a parametro t in [-π/2, π/2]
function bodyPoint(z, t) {
  const w = WID(z), sh = SH(z), c = Math.cos(t), s = Math.sin(t);
  const pw = (v, n) => Math.sign(v) * Math.pow(Math.abs(v), 2 / n);
  if (s >= 0) {
    const x = w * pw(c, NU), top = TOP(z);
    return [x, sh + (top - sh) * pw(s, NU) + bump(z, x)];
  }
  const x = w * pw(c, NL);
  return [x, sh + (sh - BOT(z)) * pw(s, NL)];
}
// x della superficie (lato destro) a una certa altezza, cercando sul profilo vero (gobbe comprese)
function surfaceX(z, y) {
  let lo = -Math.PI / 2, hi = Math.PI / 2;
  for (let k = 0; k < 28; k++) { const mid = (lo + hi) / 2; if (bodyPoint(z, mid)[1] < y) lo = mid; else hi = mid; }
  return bodyPoint(z, (lo + hi) / 2)[0];
}
// altezza della superficie superiore a una certa x
function surfaceY(z, x) {
  const w = WID(z), sh = SH(z), u = Math.min(1, Math.abs(x) / w);
  return sh + (TOP(z) - sh) * Math.pow(1 - Math.pow(u, NU), 1 / NU) + bump(z, Math.abs(x));
}

// restituisce il centro del passaruota se il punto (sul fianco) cade dentro l'arco
function archOf(z, x, y) {
  if (Math.abs(x) < 0.6) return null;
  for (const k of ['wheel_fl', 'wheel_rl']) {
    const [, hy, hz] = WHEEL_POS[k];
    if (Math.hypot(z - hz, y - hy) < ARCH_R) return [hz, hy];
  }
  return null;
}

export function buildRoadster(THREE) {
  const root = new THREE.Group();
  const V3 = THREE.Vector3;

  // ---------------- materiali
  const paint = new THREE.MeshPhysicalMaterial({ color: '#f2f2ee', roughness: 0.28, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.1 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#4a3b17', roughness: 0.04, metalness: 0.75, transparent: true, opacity: 0.62, envMapIntensity: 1.8, side: THREE.DoubleSide, depthWrite: false });
  const black = new THREE.MeshStandardMaterial({ color: '#0d0d0e', roughness: 0.45, metalness: 0.3 });
  const satin = new THREE.MeshStandardMaterial({ color: '#1b1c1e', roughness: 0.6, metalness: 0.2 });
  const liner = new THREE.MeshStandardMaterial({ color: '#070708', roughness: 0.95, side: THREE.BackSide });
  const tyre = new THREE.MeshStandardMaterial({ color: '#121213', roughness: 0.88 });
  const rim = new THREE.MeshStandardMaterial({ color: '#9da1a6', roughness: 0.28, metalness: 1 });
  const rimDark = new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.35, metalness: 0.9 });
  const disc = new THREE.MeshStandardMaterial({ color: '#5b5e63', roughness: 0.5, metalness: 0.9 });
  const drl = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(2.2), toneMapped: false });
  const tail = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff1a12').multiplyScalar(1.6), toneMapped: false });
  const lens = new THREE.MeshPhysicalMaterial({ color: '#0a0a0b', roughness: 0.05, metalness: 0.4, clearcoat: 1 });
  const seatMat = new THREE.MeshStandardMaterial({ color: '#161617', roughness: 0.75 });
  const add = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; root.add(m); return m; };

  // ---------------- carrozzeria
  {
    const NS = 170, M = 40; // sezioni lungo z, campioni per mezza sezione
    const pos = [], idx = [], cut = [];
    const ring = 2 * M;
    for (let i = 0; i <= NS; i++) {
      const z = Z0 + (Z1 - Z0) * i / NS;
      for (let j = 0; j < ring; j++) {
        // j: 0 = fondo centrale, sale sul lato destro fino al tetto (j = M), poi scende a sinistra
        let t, sgn;
        if (j <= M) { t = -Math.PI / 2 + Math.PI * j / M; sgn = 1; } else { t = Math.PI / 2 - Math.PI * (j - M) / M; sgn = -1; }
        const [x, y] = bodyPoint(z, t);
        const arch = archOf(z, sgn * x, y);
        pos.push(sgn * x, y, z);
        cut.push(arch);
      }
    }
    // i quadrilateri tutti dentro l'arco si scartano; quelli sul bordo hanno i vertici interni
    // spostati esattamente sul cerchio, così il passaruota ha un contorno pulito
    const snap = new Set();
    for (let i = 0; i < NS; i++) for (let j = 0; j < ring; j++) {
      const q = [i * ring + j, i * ring + (j + 1) % ring, (i + 1) * ring + j, (i + 1) * ring + (j + 1) % ring];
      const inside = q.filter(v => cut[v]).length;
      if (inside === 4) continue;
      for (const v of q) if (cut[v]) snap.add(v);
      idx.push(q[0], q[1], q[2], q[1], q[3], q[2]);
    }
    for (const v of snap) {
      const [hz, hy] = cut[v], z = pos[3 * v + 2], y = pos[3 * v + 1];
      let dz = z - hz, dy = y - hy; const l = Math.hypot(dz, dy) || 1;
      const nz = hz + dz / l * ARCH_R, ny = hy + dy / l * ARCH_R;
      const sx = Math.sign(pos[3 * v]) || 1;
      pos[3 * v + 2] = nz; pos[3 * v + 1] = ny; pos[3 * v] = sx * surfaceX(nz, ny);
    }
    // chiusure: muso arrotondato e coda tronca
    for (const [i, front] of [[0, true], [NS, false]]) {
      let cx = 0, cy = 0, cz = 0;
      for (let j = 0; j < ring; j++) { cx += pos[3 * (i * ring + j)]; cy += pos[3 * (i * ring + j) + 1]; cz += pos[3 * (i * ring + j) + 2]; }
      const ci = pos.length / 3; pos.push(cx / ring, cy / ring, cz / ring + (front ? -0.03 : 0.012));
      for (let j = 0; j < ring; j++) { const a = i * ring + j, b = i * ring + (j + 1) % ring; if (front) idx.push(ci, b, a); else idx.push(ci, a, b); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    add(g, paint);
  }

  // passaruota: rivestimento interno nero e bordo pulito
  for (const k of Object.keys(WHEEL_POS)) {
    const [hx, hy, hz] = WHEEL_POS[k], sgn = Math.sign(hx);
    // dopo rotateZ: y = r·sinθ, z = r·cosθ → θ da -0,25 a π+0,25 copre la parte alta dell'arco
    const lg = new THREE.CylinderGeometry(ARCH_R + 0.01, ARCH_R + 0.01, 0.42, 32, 1, true, -0.25, Math.PI + 0.5);
    lg.rotateZ(Math.PI / 2);
    const l = add(lg, liner, false); l.position.set(sgn * 0.74, hy, hz);
    const pts = [];
    for (let a = 0; a <= 40; a++) {
      const ang = Math.PI * (-0.08 + 1.16 * a / 40), z = hz + Math.cos(ang) * ARCH_R, y = hy + Math.sin(ang) * ARCH_R;
      if (y < 0.16) continue;
      pts.push(new V3(sgn * (surfaceX(z, y) - 0.004), y, z));
    }
    if (pts.length > 2) add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.016, 6), black, false);
  }

  // fondo, presa d'aria anteriore, diffusore
  { const u = add(new THREE.BoxGeometry(1.7, 0.03, 4.1), satin, false); u.position.set(0, 0.15, 0.0); }
  { const f = add(new THREE.SphereGeometry(1, 32, 12), black); f.scale.set(0.42, 0.05, 0.1); f.position.set(0, 0.28, -2.2); }
  for (const sx of [-1, 1]) { const f = add(new THREE.SphereGeometry(1, 24, 10), black); f.scale.set(0.16, 0.035, 0.08); f.position.set(sx * 0.6, 0.29, -2.08); }
  {
    const d = add(new THREE.BoxGeometry(1.36, 0.16, 0.42), black); d.position.set(0, 0.24, 2.08); d.rotation.x = -0.25;
    for (let i = -2; i <= 2; i++) { const fin = add(new THREE.BoxGeometry(0.02, 0.14, 0.4), satin); fin.position.set(i * 0.26, 0.2, 2.1); fin.rotation.x = -0.25; }
  }

  // abitacolo in vetro (parabrezza, finestrini e tetto targa)
  {
    const ROOF = curve([[-0.98, 0.0], [-0.72, 0.11], [-0.42, 0.235], [-0.15, 0.305], [0.1, 0.32], [0.35, 0.31], [0.6, 0.25], [0.8, 0.15], [0.96, 0.03]]);
    const BW = curve([[-0.98, 0.70], [-0.5, 0.775], [0.2, 0.785], [0.96, 0.66]]);
    const NS = 70, M = 22, pos = [], idx = [];
    const zA = -0.98, zB = 0.96;
    const ring = 2 * M + 1;
    for (let i = 0; i <= NS; i++) {
      const z = zA + (zB - zA) * i / NS;
      const bw = BW(z), yb = surfaceY(z, bw) - 0.02, top = surfaceY(z, 0) + ROOF(z);
      for (let j = 0; j < ring; j++) {
        const t = Math.PI * j / (ring - 1); // da destra (0) a sinistra (π) passando per il tetto
        const c = Math.cos(t), s = Math.sin(t);
        const x = bw * Math.sign(c) * Math.pow(Math.abs(c), 2 / 2.6);
        const yBase = surfaceY(z, x) - 0.02;
        const y = Math.max(yBase, yb + (top - yb) * Math.pow(s, 2 / 2.6));
        pos.push(x, y, z);
      }
    }
    for (let i = 0; i < NS; i++) for (let j = 0; j < ring - 1; j++) {
      const a = i * ring + j, b = a + 1, c = a + ring, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const gl = add(g, glass, false); gl.renderOrder = 2;
    // montanti e cornice del tetto targa (neri)
    const frame = (fz, ft) => {
      const z = zA + (zB - zA) * fz, bw = BW(z), yb = surfaceY(z, bw) - 0.02, top = surfaceY(z, 0) + ROOF(z);
      const c = Math.cos(ft), s = Math.sin(ft), x = bw * Math.sign(c) * Math.pow(Math.abs(c), 2 / 2.6);
      return new V3(x, Math.max(surfaceY(z, x) - 0.02, yb + (top - yb) * Math.pow(s, 2 / 2.6)) + 0.004, z);
    };
    for (const side of [0.06, 0.95, Math.PI - 0.95, Math.PI - 0.06]) {
      const pts = []; for (let k = 0; k <= 20; k++) pts.push(frame(0.02 + 0.93 * k / 20, side));
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.018, 6), black, false);
    }
    for (const fz of [0.33, 0.78]) {
      const pts = []; for (let k = 0; k <= 16; k++) pts.push(frame(fz, 0.06 + (Math.PI - 0.12) * k / 16));
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.014, 6), black, false);
    }
  }

  // interni visibili attraverso i vetri
  {
    for (const sx of [-0.36, 0.36]) {
      const c = add(new THREE.BoxGeometry(0.46, 0.12, 0.5), seatMat, false); c.position.set(sx, 0.33, 0.2);
      const b = add(new THREE.BoxGeometry(0.46, 0.62, 0.12), seatMat, false); b.position.set(sx, 0.64, 0.5); b.rotation.x = -0.28;
      const h = add(new THREE.BoxGeometry(0.26, 0.16, 0.1), seatMat, false); h.position.set(sx, 1.0, 0.6); h.rotation.x = -0.28;
    }
    const dash = add(new THREE.BoxGeometry(1.5, 0.12, 0.34), satin, false); dash.position.set(0, 0.7, -0.72);
    const cons = add(new THREE.BoxGeometry(0.22, 0.2, 1.1), satin, false); cons.position.set(0, 0.36, -0.15);
    // volante a cloche (yoke) e schermo
    const yoke = add(new THREE.TorusGeometry(0.16, 0.022, 8, 24, Math.PI * 1.1), black, false);
    yoke.position.set(-0.36, 0.74, -0.42); yoke.rotation.set(-0.35, 0, Math.PI * 0.95);
    const scr = add(new THREE.BoxGeometry(0.3, 0.17, 0.02), new THREE.MeshBasicMaterial({ color: '#1d2a36' }), false);
    scr.position.set(0.02, 0.8, -0.66); scr.rotation.x = -0.5;
  }

  // fari sottili che risalgono lungo i parafanghi
  for (const sx of [-1, 1]) {
    const pts = [[0.42, -2.25], [0.6, -2.2], [0.75, -2.11], [0.86, -1.98], [0.92, -1.82]].map(([x, z]) => new V3(sx * x, surfaceY(z, x) + 0.004, z));
    const crv = new THREE.CatmullRomCurve3(pts);
    add(new THREE.TubeGeometry(crv, 40, 0.02, 8), lens, false);
    const lit = new THREE.CatmullRomCurve3(pts.map(v => v.clone().add(new V3(0, 0.017, -0.004))));
    add(new THREE.TubeGeometry(lit, 40, 0.009, 6), drl, false);
  }
  // fanale posteriore a tutta larghezza
  // sulla coda tronca e poi avvolto sugli angoli posteriori
  const xr = surfaceX(2.27, 0.79) - 0.03;
  const tailPts = [
    new V3(-(surfaceX(2.15, 0.78) + 0.004), 0.78, 2.15), new V3(-(surfaceX(2.23, 0.79) + 0.004), 0.79, 2.23),
    ...Array.from({ length: 9 }, (_, k) => new V3(-xr + 2 * xr * k / 8, 0.79, 2.298)),
    new V3(surfaceX(2.23, 0.79) + 0.004, 0.79, 2.23), new V3(surfaceX(2.15, 0.78) + 0.004, 0.78, 2.15),
  ];
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tailPts), 60, 0.024, 8), lens, false);
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tailPts.map(v => v.clone().add(new V3(0, 0, 0.012)))), 60, 0.014, 6), tail, false);

  // linee delle portiere, prese d'aria laterali, specchietti
  for (const sx of [-1, 1]) {
    for (const seam of [[[-0.9, 0.79], [-0.93, 0.55], [-0.88, 0.25]], [[0.66, 0.85], [0.7, 0.55], [0.64, 0.24]]]) {
      const pts = seam.map(([z, y]) => new V3(sx * (surfaceX(z, y) + 0.002), y, z));
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.004, 4), black, false);
    }
    const inl = add(new THREE.SphereGeometry(1, 20, 12), black); inl.scale.set(0.03, 0.07, 0.24); inl.position.set(sx * (surfaceX(0.92, 0.52) - 0.012), 0.52, 0.92); inl.rotation.x = 0.15;
    const mir = add(new THREE.SphereGeometry(1, 16, 10), paint); mir.scale.set(0.05, 0.042, 0.105); mir.position.set(sx * 0.9, 0.9, -0.66);
    const stalk = add(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 6), black, false); stalk.rotation.z = Math.PI / 2; stalk.position.set(sx * 0.83, 0.88, -0.66);
    const mg = add(new THREE.PlaneGeometry(0.08, 0.06), lens, false); mg.position.set(sx * 0.9, 0.9, -0.555);
  }
  // spoiler posteriore attivo (a riposo, integrato nella coda)
  {
    const sp = new THREE.Shape(); sp.moveTo(-0.8, 0); sp.quadraticCurveTo(0, 0.05, 0.8, 0); sp.lineTo(0.8, 0.012); sp.quadraticCurveTo(0, 0.062, -0.8, 0.012);
    const geo = new THREE.ExtrudeGeometry(sp, { depth: 0.16, bevelEnabled: false }); geo.translate(0, 0, -0.08);
    const m = add(geo, paint); m.position.set(0, surfaceY(2.12, 0) + 0.004, 2.12);
  }

  // ---------------- ruote (19" anteriori, 20" posteriori stile turbina)
  const wheels = {};
  const makeWheel = rear => {
    const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
    const R = 0.358, w = rear ? 0.29 : 0.26, rr = rear ? 0.255 : 0.24;
    const prof = [[rr, -w / 2], [rr + 0.05, -w / 2 - 0.006], [R - 0.012, -w / 2 + 0.008], [R, -w / 2 + 0.05], [R + 0.002, 0], [R, w / 2 - 0.05], [R - 0.012, w / 2 - 0.008], [rr + 0.05, w / 2 + 0.006], [rr, w / 2]].map(([r, y]) => new THREE.Vector2(r, y));
    const tg = new THREE.LatheGeometry(prof, 56); tg.rotateZ(Math.PI / 2);
    const t = new THREE.Mesh(tg, tyre); t.castShadow = true; inner.add(t);
    const barrel = new THREE.CylinderGeometry(rr, rr, w - 0.02, 40, 1, true); barrel.rotateZ(Math.PI / 2);
    inner.add(new THREE.Mesh(barrel, rimDark));
    const face = new THREE.CylinderGeometry(rr - 0.005, rr - 0.005, 0.012, 40); face.rotateZ(Math.PI / 2);
    const fm = new THREE.Mesh(face, rimDark); fm.position.x = w / 2 - 0.05; inner.add(fm);
    const spokeGeo = new THREE.BoxGeometry(0.03, rr - 0.06, 0.05);
    for (let k = 0; k < 10; k++) {
      const s = new THREE.Mesh(spokeGeo, rim);
      const a = k / 10 * Math.PI * 2;
      s.position.set(w / 2 - 0.035, Math.cos(a) * (rr / 2 + 0.02), Math.sin(a) * (rr / 2 + 0.02));
      s.rotation.x = a; s.rotateY(0.35); // pale inclinate come una turbina
      inner.add(s);
    }
    const lipG = new THREE.TorusGeometry(rr - 0.006, 0.012, 6, 48); lipG.rotateY(Math.PI / 2);
    const lip = new THREE.Mesh(lipG, rim); lip.position.x = w / 2 - 0.03; inner.add(lip);
    const cap = new THREE.CylinderGeometry(0.055, 0.06, 0.03, 20); cap.rotateZ(Math.PI / 2);
    const cm = new THREE.Mesh(cap, rim); cm.position.x = w / 2 - 0.03; inner.add(cm);
    const dg = new THREE.CylinderGeometry(0.19, 0.19, 0.03, 32); dg.rotateZ(Math.PI / 2);
    const dm = new THREE.Mesh(dg, disc); dm.position.x = -0.02; inner.add(dm);
    return { g, inner };
  };
  for (const [name, p] of Object.entries(WHEEL_POS)) {
    const { g, inner } = makeWheel(name === 'wheel_rl' || name === 'wheel_rr');
    if (p[0] < 0) inner.scale.x = -1; // cerchio rivolto verso l'esterno anche a sinistra
    g.name = name; g.position.set(...p); root.add(g); wheels[name] = g;
  }

  return {
    group: root, wheels,
    setBrake(level) { tail.color.set('#ff1a12').multiplyScalar(1.6 + 2.4 * level); },
  };
}
