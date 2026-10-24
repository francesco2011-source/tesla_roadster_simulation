// Percorsi aggiuntivi della mappa: mappa test a griglia (stile BeamNG), parco acrobazie e colline sterrate.
// Tutto ciò che si tocca è fatto di scatole orientate (OBB) indicizzate su una griglia, più un
// terreno collinare analitico; la fisica e le particelle li interrogano con distanze con segno.

export function buildRoutes(THREE, scene, opts = {}) {
  const V3 = THREE.Vector3;
  const visuals = opts.visuals !== false;
  const OB = [];            // scatole orientate (dati piatti per la velocità)
  const CELL = 8, grid = new Map();
  const key = (ix, iz) => (ix + 4096) * 8192 + (iz + 4096);

  function addOBB(c, u, v, w, hx, hy, hz, surf) {
    // deck: lastra su cui si guida (asse v = verso la superficie): dentro la lastra la spinta è sempre
    // perpendicolare alla superficie, così le giunzioni tra lastre vicine non fanno da scalino
    const o = { cx: c.x, cy: c.y, cz: c.z, ux: u.x, uy: u.y, uz: u.z, vx: v.x, vy: v.y, vz: v.z, wx: w.x, wy: w.y, wz: w.z, hx, hy, hz, surf, deck: surf === 'road' || surf === 'loop' || surf === 'park' };
    const ex = Math.abs(u.x) * hx + Math.abs(v.x) * hy + Math.abs(w.x) * hz;
    const ey = Math.abs(u.y) * hx + Math.abs(v.y) * hy + Math.abs(w.y) * hz;
    const ez = Math.abs(u.z) * hx + Math.abs(v.z) * hy + Math.abs(w.z) * hz;
    o.y0 = c.y - ey; o.y1 = c.y + ey;
    const m = 4; // margine: ogni scatola entro 4 m da una cella è nella sua lista
    for (let ix = Math.floor((c.x - ex - m) / CELL); ix <= Math.floor((c.x + ex + m) / CELL); ix++)
      for (let iz = Math.floor((c.z - ez - m) / CELL); iz <= Math.floor((c.z + ez + m) / CELL); iz++) {
        const k = key(ix, iz); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(OB.length);
      }
    OB.push(o);
    return o;
  }
  const axisBox = (cx, cy, cz, hx, hy, hz, surf) => addOBB(new V3(cx, cy, cz), new V3(1, 0, 0), new V3(0, 1, 0), new V3(0, 0, 1), hx, hy, hz, surf);

  const api = { lastSurf: 'road' };
  api.sdf = (p, best, nOut) => {
    const l = grid.get(key(Math.floor(p.x / CELL), Math.floor(p.z / CELL)));
    if (!l) return best;
    for (let k = 0; k < l.length; k++) {
      const o = OB[l[k]];
      if (p.y - o.y1 > best || o.y0 - p.y > best) continue;
      const dx = p.x - o.cx, dy = p.y - o.cy, dz = p.z - o.cz;
      const lx = dx * o.ux + dy * o.uy + dz * o.uz, ly = dx * o.vx + dy * o.vy + dz * o.vz, lz = dx * o.wx + dy * o.wy + dz * o.wz;
      const qx = Math.abs(lx) - o.hx, qy = Math.abs(ly) - o.hy, qz = Math.abs(lz) - o.hz;
      if (qx > best || qy > best || qz > best) continue;
      const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0, oz = qz > 0 ? qz : 0;
      const out = Math.sqrt(ox * ox + oy * oy + oz * oz);
      const d = out > 0 ? out : o.deck ? qy : Math.max(qx, qy, qz);
      if (d >= best) continue;
      best = d; api.lastSurf = o.surf;
      let nx, ny, nz;
      if (out > 0) { nx = ox * Math.sign(lx) / out; ny = oy * Math.sign(ly) / out; nz = oz * Math.sign(lz) / out; }
      else if (o.deck) { nx = 0; ny = Math.sign(ly) || 1; nz = 0; }
      else if (qx > qy && qx > qz) { nx = Math.sign(lx) || 1; ny = 0; nz = 0; }
      else if (qy > qz) { nx = 0; ny = Math.sign(ly) || 1; nz = 0; }
      else { nx = 0; ny = 0; nz = Math.sign(lz) || 1; }
      nOut.set(o.ux * nx + o.vx * ny + o.wx * nz, o.uy * nx + o.vy * ny + o.wy * nz, o.uz * nx + o.vz * ny + o.wz * nz);
    }
    return best;
  };
  api.near = (x, y, z) => { const l = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (!l) return false; for (const i of l) if (y < OB[i].y1 + 2) return true; return false; };

  // ---------------------------------------------------------------- colline sterrate
  const HB = { x0: -470, x1: -200, z0: 40, z1: 290, edge: 35 };
  const sm = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  const hillsH = (x, z) => {
    if (x <= HB.x0 || x >= HB.x1 || z <= HB.z0 || z >= HB.z1) return 0;
    const m = sm((x - HB.x0) / HB.edge) * sm((HB.x1 - x) / HB.edge) * sm((z - HB.z0) / HB.edge) * sm((HB.z1 - z) / HB.edge);
    return m * (2.2 * (1 + Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.04)) + 0.7 * (1 + Math.sin((x - z) * 0.085)) + 0.15 * (1 + Math.cos(x * 0.19 + z * 0.07)));
  };
  // Elementi del terreno della mappa test: dossi, onda di lavatrice (washboard), campo di sassi, collina conica.
  // Ognuno è una funzione h(x,z) con un riquadro: fuori dal riquadro vale 0 e la ricerca si ferma subito.
  const FEATS = [];
  const edge = (t, e) => t <= 0 ? 0 : t >= e ? 1 : sm(t / e);
  const addFeat = (box, fn, color) => FEATS.push({ ...box, fn, color });
  const GRID = { x0: -135, x1: 115, z0: 35, z1: 305 };
  const BUMPS = [[-100, 0.06], [-88, 0.10], [-76, 0.15], [-64, 0.20], [-52, 0.28]];
  addFeat({ x0: -102, x1: -50, z0: 48, z1: 72, res: 0.2 }, (x, z) => {
    let h = 0; for (const [bx, bh] of BUMPS) { const d = (x - bx) / 0.9; if (d > -1 && d < 1) h += bh * Math.cos(d * Math.PI / 2) ** 2; }
    return h * edge(z - 48, 1.5) * edge(72 - z, 1.5);
  }, 'bump');
  addFeat({ x0: -37, x1: 7, z0: 48, z1: 72, res: 0.2 }, (x, z) =>
    0.07 * 0.5 * (1 - Math.cos(2 * Math.PI * (x + 37) / 1.6)) * edge(x + 37, 4) * edge(7 - x, 4) * edge(z - 48, 1.5) * edge(72 - z, 1.5), 'wash');
  addFeat({ x0: 13, x1: 62, z0: 48, z1: 72, res: 0.5 }, (x, z) => {
    const n = 0.5 + 0.28 * Math.sin(x * 0.83 + 1.3) * Math.cos(z * 0.71) + 0.22 * Math.sin(x * 1.9 + z * 1.4) + 0.12 * Math.cos(x * 0.37 - z * 0.52);
    return 0.34 * Math.max(0, n) * edge(x - 13, 4) * edge(62 - x, 4) * edge(z - 48, 2) * edge(72 - z, 2);
  }, 'rock');
  const HILL = { x: 75, z: 130, R: 40, H: 14 };
  addFeat({ x0: HILL.x - HILL.R, x1: HILL.x + HILL.R, z0: HILL.z - HILL.R, z1: HILL.z + HILL.R, res: 1 }, (x, z) => {
    const r2 = ((x - HILL.x) ** 2 + (z - HILL.z) ** 2) / (HILL.R * HILL.R); return r2 >= 1 ? 0 : HILL.H * (1 - r2) ** 2;
  }, 'hill');
  const featH = (x, z) => { let h = 0; for (const f of FEATS) if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1) h += f.fn(x, z); return h; };
  const groundH = (x, z) => hillsH(x, z) + featH(x, z);
  const inField = (x, z) => (x > HB.x0 && x < HB.x1 && z > HB.z0 && z < HB.z1) || (x > GRID.x0 && x < GRID.x1 && z > GRID.z0 && z < GRID.z1);
  api.groundH = groundH;
  api.inHills = (x, z) => x > HB.x0 && x < HB.x1 && z > HB.z0 && z < HB.z1;
  // distanza con segno dal terreno (piano a y = 0 fuori da colline e mappa test)
  api.ground = (p, nOut) => {
    if (!inField(p.x, p.z)) { nOut.set(0, 1, 0); return p.y; }
    const e = 0.12, h = groundH(p.x, p.z);
    const gx = (groundH(p.x + e, p.z) - groundH(p.x - e, p.z)) / (2 * e), gz = (groundH(p.x, p.z + e) - groundH(p.x, p.z - e)) / (2 * e);
    const k = 1 / Math.sqrt(1 + gx * gx + gz * gz);
    nOut.set(-gx * k, k, -gz * k);
    return (p.y - h) * k;
  };

  // ---------------------------------------------------------------- materiali
  let concreteTex = null, asphaltTex = null;
  const canvasTex = (base, amp, specks, rep) => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    const im = g.getImageData(0, 0, 256, 256);
    for (let i = 0; i < im.data.length; i += 4) { const d = (Math.random() - 0.5) * amp + (Math.random() < specks ? (Math.random() < 0.5 ? -30 : 30) : 0); im.data[i] += d; im.data[i + 1] += d; im.data[i + 2] += d; }
    g.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    if (rep) t.repeat.set(rep, rep);
    return t;
  };
  let M = {};
  if (visuals) {
    concreteTex = canvasTex('#9c9c98', 30, 0.02);
    asphaltTex = canvasTex('#2c2c2e', 22, 0.04);
    M = {
      asphalt: new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
      concrete: new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
      under: new THREE.MeshStandardMaterial({ color: '#4a4a48', roughness: 0.9, side: THREE.DoubleSide }),
      white: new THREE.MeshStandardMaterial({ color: '#efefea', roughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
      red: new THREE.MeshStandardMaterial({ color: '#d42a1f', roughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
      wall: new THREE.MeshStandardMaterial({ color: '#c9c8c2', roughness: 0.8 }),
      led: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3326').multiplyScalar(2), toneMapped: false, side: THREE.DoubleSide }),
      cone: new THREE.MeshStandardMaterial({ color: '#ff6a1a', roughness: 0.6 }),
      pillar: new THREE.MeshStandardMaterial({ color: '#8f8e8a', roughness: 0.85 }),
    };
  }
  const mesh = (geo, mat, shadow = true) => { if (!visuals) return null; const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m; };
  // striscia: per ogni campione due punti (sinistra, destra) → triangoli
  const stripGeo = (rows, uvScale = 1) => {
    const pos = [], uv = [], idx = [];
    rows.forEach((r, i) => { pos.push(...r[0], ...r[1]); uv.push(0, r[2] * uvScale, 1, r[2] * uvScale); if (i < rows.length - 1) { const a = 2 * i; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  const P = (v) => [v.x, v.y, v.z];

  const mini = { lines: [], rects: [], polys: [] }; // per la minimappa

  // ---------------------------------------------------------------- mappa test a griglia (stile BeamNG)
  const PW = 8, PT = 0.5;
  const props = [];   // casse da sfondare: corpi rigidi, li costruisce il gioco
  const signs = [];
  const sign = (text, x, z, yaw = -Math.PI / 2) => signs.push({ text, x, z, yaw }); // il cartello guarda verso chi arriva da ovest (−x)
  const prism = (profile, z, width, mat) => { // profilo (x, y) estruso lungo z
    if (!visuals) return;
    const sh = new THREE.Shape(); sh.moveTo(profile[0][0], profile[0][1]); for (const [x, y] of profile.slice(1)) sh.lineTo(x, y); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: false }); g.translate(0, 0, z - width / 2);
    mesh(g, mat);
  };
  const slab = (a, b, z, width, surf = 'park') => { // piano inclinato da a=(x,y) a b=(x,y), superficie in alto
    const u = new V3(b[0] - a[0], b[1] - a[1], 0), len = u.length(); u.normalize();
    const n = new V3(-u.y, u.x, 0); if (n.y < 0) n.negate();
    const w = new V3().crossVectors(u, n);
    addOBB(new V3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z).addScaledVector(n, -PT / 2), u, n, w, len / 2 + 0.05, PT / 2, width / 2, surf);
  };
  const kicker = (x0, z, len, deg, width) => { // trampolino in salita verso +x
    const a = deg * Math.PI / 180, lx = len * Math.cos(a), h = len * Math.sin(a);
    slab([x0, 0], [x0 + lx, h], z, width);
    axisBox(x0 + lx - 0.3, h / 2, z, 0.3, h / 2, width / 2, 'park');
    prism([[x0, 0], [x0 + lx, h], [x0 + lx, 0]], z, width, M.concrete);
    mini.rects.push([x0, z - width / 2, lx, width]);
    return { x1: x0 + lx, h };
  };
  const landing = (x0, z, h, deg, width) => { // rampa d'atterraggio in discesa verso +x
    const a = deg * Math.PI / 180, lx = h / Math.tan(a);
    slab([x0, h], [x0 + lx, 0], z, width);
    axisBox(x0 + 0.3, h / 2, z, 0.3, h / 2, width / 2, 'park');
    prism([[x0, 0], [x0, h], [x0 + lx, 0]], z, width, M.concrete);
    mini.rects.push([x0, z - width / 2, lx, width]);
    return x0 + lx;
  };
  mini.grid = [GRID.x0, GRID.z0, GRID.x1 - GRID.x0, GRID.z1 - GRID.z0];

  if (visuals) { // pavimento a griglia: celle da 10 m, linee ogni 50 m più marcate
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d'); g.fillStyle = '#4c4f55'; g.fillRect(0, 0, 512, 512);
    const im = g.getImageData(0, 0, 512, 512);
    for (let i = 0; i < im.data.length; i += 4) { const d = (Math.random() - 0.5) * 7; im.data[i] += d; im.data[i + 1] += d; im.data[i + 2] += d; }
    g.putImageData(im, 0, 0);
    g.strokeStyle = '#7d8189'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 509, 509);
    g.strokeStyle = 'rgba(125,129,137,.45)'; g.lineWidth = 1.5; for (let i = 1; i < 10; i++) { g.beginPath(); g.moveTo(i * 51.2, 0); g.lineTo(i * 51.2, 512); g.moveTo(0, i * 51.2); g.lineTo(512, i * 51.2); g.stroke(); }
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const gw = GRID.x1 - GRID.x0, gh = GRID.z1 - GRID.z0; tex.repeat.set(gw / 100, gh / 100);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set((GRID.x0 + GRID.x1) / 2, 0.004, (GRID.z0 + GRID.z1) / 2); floor.receiveShadow = true; scene.add(floor);
    // linee arancioni ogni 50 m
    const lm = new THREE.MeshBasicMaterial({ color: '#ff7a2f', polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    for (let x = GRID.x0 + 25; x < GRID.x1; x += 50) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.18, gh), lm); l.rotation.x = -Math.PI / 2; l.position.set(x, 0.01, (GRID.z0 + GRID.z1) / 2); scene.add(l); }
    for (let z = GRID.z0 + 15; z < GRID.z1; z += 50) { const l = new THREE.Mesh(new THREE.PlaneGeometry(gw, 0.18), lm); l.rotation.x = -Math.PI / 2; l.position.set((GRID.x0 + GRID.x1) / 2, 0.01, z); scene.add(l); }
  }

  // A · dossi, onda di lavatrice e campo di sassi (altezze analitiche, vedi sopra)
  sign('BUMPS', -118, 52); sign('WASHBOARD', -42, 52); sign('ROCKS', 8, 52);
  // B · rampe a 10°, 20°, 30°, 40°
  [[10, 14], [20, 13], [30, 11], [40, 9.5]].forEach(([deg, len], i) => kicker(-110, 87 + 12 * i, len, deg, PW));
  sign('RAMPS', -120, 82);
  // C · scale (12 gradini da 18 cm) con piattaforma e discesa, poi muro con quarto di cerchio
  {
    const z = 150, x0 = -120, rise = 0.18, depth = 1.0, n = 12, W = 10;
    for (let i = 0; i < n; i++) axisBox(x0 + depth * (i + 0.5), rise * (i + 1) / 2, z, depth / 2, rise * (i + 1) / 2, W / 2, 'step');
    const top = rise * n, px = x0 + depth * n;
    axisBox(px + 5, top / 2, z, 5, top / 2, W / 2, 'step');
    const a = 10 * Math.PI / 180, lx = top / Math.tan(a);
    slab([px + 10, top], [px + 10 + lx, 0], z, W);
    prism([[x0, 0], ...Array.from({ length: n }, (_, i) => [[x0 + depth * i, rise * (i + 1)], [x0 + depth * (i + 1), rise * (i + 1)]]).flat(), [px + 10, top], [px + 10 + lx, 0]], z, W, M.concrete);
    mini.rects.push([x0, z - W / 2, 10 + n + lx, W]);
    sign('STAIRS', -124, 143);
    // muro: quarto di cerchio r = 6 m e parete verticale, piattaforma sopra
    const xw = -50, R = 6, wallTop = 9.5, Wd = 12, pts = [];
    for (let k = 0; k <= 16; k++) { const f = Math.PI / 2 * k / 16; pts.push([xw - R + R * Math.sin(f), R - R * Math.cos(f)]); }
    pts.push([xw, wallTop]);
    for (let k = 0; k < pts.length - 1; k++) slab(pts[k], pts[k + 1], z, Wd);
    slab([xw, wallTop], [xw + 4, wallTop], z, Wd);
    slab([xw + 4, wallTop], [xw + 4.001, wallTop - 0.001], z, Wd);
    axisBox(xw + 2.5, wallTop / 2 - 0.25, z, 2.5, wallTop / 2 - 0.25, Wd / 2, 'park');
    prism([[xw - R, 0], ...pts.slice(0), [xw + 4, wallTop], [xw + 4, 0]], z, Wd, M.concrete);
    mini.rects.push([xw - R, z - Wd / 2, R + 4, Wd]);
    sign('WALL', -64, 142);
  }
  // D · salto lungo, dosso a V
  {
    const k = kicker(-110, 190, 12, 22, PW); landing(-52, 190, k.h, 18, PW);
    sign('LONG JUMP', -118, 183);
    // dosso a V a cavallo della corsia: due piani da 20° che si incontrano a 2,4 m
    const h = 2.4, lx = h / Math.tan(20 * Math.PI / 180), xa = -30;
    slab([xa, 0], [xa + lx, h], 165, 10); slab([xa + lx, h], [xa + 2 * lx, 0], 165, 10);
    axisBox(xa + lx, h / 2 - 0.2, 165, 0.4, h / 2 - 0.2, 5, 'park');
    prism([[xa, 0], [xa + lx, h], [xa + 2 * lx, 0]], 165, 10, M.concrete);
    mini.rects.push([xa, 160, 2 * lx, 10]);
    sign('RIDGE', xa - 3, 158);
  }
  // E · pista circolare sopraelevata (28°) con raccordo d'ingresso a 12° e muretto esterno
  const BANK = { cx: 30, cz: 215, ri: 33, bank: 28 * Math.PI / 180, tb: 12 * Math.PI / 180, WS: 9, WT: 4 };
  {
    const { cx, cz, ri, bank, tb, WS, WT } = BANK, NSEG = 72;
    const rings = [ // [raggio interno, larghezza lungo il pendio, inclinazione, quota iniziale]
      [ri - WT * Math.cos(tb), WT, tb, 0],
      [ri, WS, bank, WT * Math.sin(tb)],
    ];
    const hTop = WT * Math.sin(tb) + WS * Math.sin(bank);
    for (const [r0, Ws, b, y0] of rings) {
      const Wh = Ws * Math.cos(b), hh = Ws * Math.sin(b), Rc = r0 + Wh / 2;
      for (let i = 0; i < NSEG; i++) {
        const t0 = i / NSEG * 2 * Math.PI, t1 = (i + 1) / NSEG * 2 * Math.PI, tm = (t0 + t1) / 2;
        const rh = new V3(Math.cos(tm), 0, Math.sin(tm)), tan = new V3(-Math.sin(tm), 0, Math.cos(tm));
        const n = new V3().addScaledVector(rh, -Math.sin(b)).add(new V3(0, Math.cos(b), 0));
        const sl = new V3().addScaledVector(rh, Math.cos(b)).add(new V3(0, Math.sin(b), 0));
        const chord = 2 * Rc * Math.sin(Math.PI / NSEG);
        const c = new V3(cx + rh.x * Rc, y0 + hh / 2, cz + rh.z * Rc).addScaledVector(n, -PT / 2);
        addOBB(c, tan, n, sl, chord / 2 + 0.25, PT / 2, Ws / 2, 'park');
      }
    }
    // muretto esterno
    const ro = ri + WS * Math.cos(bank);
    for (let i = 0; i < NSEG; i++) {
      const tm = (i + 0.5) / NSEG * 2 * Math.PI, rh = new V3(Math.cos(tm), 0, Math.sin(tm)), tan = new V3(-Math.sin(tm), 0, Math.cos(tm)), chord = 2 * ro * Math.sin(Math.PI / NSEG);
      addOBB(new V3(cx + rh.x * (ro + 0.2), hTop + 0.5, cz + rh.z * (ro + 0.2)), tan, new V3(0, 1, 0), rh.clone(), chord / 2 + 0.2, 0.7, 0.25, 'wall');
    }
    if (visuals) {
      const strip = (r0, r1, y0, y1, off = 0) => { const pos = [], idx = []; for (let i = 0; i <= NSEG; i++) { const t = i / NSEG * 2 * Math.PI, ct = Math.cos(t), st = Math.sin(t); pos.push(cx + ct * r0, y0 + off, cz + st * r0, cx + ct * r1, y1 + off, cz + st * r1); if (i < NSEG) { const a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
      const r1 = ri - WT * Math.cos(tb) + WT * Math.cos(tb);
      const m1 = mesh(strip(ri - WT * Math.cos(tb), ri, 0, WT * Math.sin(tb)), M.concrete);
      const m2 = mesh(strip(ri, ri + WS * Math.cos(bank), WT * Math.sin(tb), hTop), M.concrete);
      for (const m of [m1, m2]) m.material = M.concrete;
      // linee bianche e arancioni sul pendio
      for (const f of [0.18, 0.5, 0.82]) { const rr = ri + WS * Math.cos(bank) * f, yy = WT * Math.sin(tb) + WS * Math.sin(bank) * f; mesh(strip(rr - 0.05, rr + 0.05, yy, yy, 0.012), f === 0.5 ? M.white : M.led, false); }
      const wallG = new THREE.CylinderGeometry(ro + 0.2, ro + 0.2, 1.4, 96, 1, true); const wall = new THREE.Mesh(wallG, M.wall); wall.position.set(cx, hTop + 0.5, cz); wall.material = new THREE.MeshStandardMaterial({ color: '#c9c8c2', roughness: 0.8, side: THREE.DoubleSide }); wall.castShadow = wall.receiveShadow = true; scene.add(wall);
      // sotto-struttura visibile dall'esterno
      const outer = new THREE.Mesh(new THREE.CylinderGeometry(ro, ro, hTop, 96, 1, true), new THREE.MeshStandardMaterial({ color: '#4a4a48', roughness: 0.9, side: THREE.DoubleSide })); outer.position.set(cx, hTop / 2, cz); scene.add(outer);
    }
    mini.ring = [cx, cz, ro + 0.4, ri - WT];
    sign('BANKED', cx - ro - 12, cz - 10);
  }
  // F · salita sulla collina conica (14 m, pendenza massima ≈ 28°)
  sign('HILL', HILL.x - HILL.R - 8, HILL.z - 8);
  // G · pista circolare disegnata (skidpad) e slalom
  if (visuals) {
    const cxs = -70, czs = 255, rr = 22, pos = [], idx = [];
    for (let i = 0; i <= 96; i++) { const t = i / 96 * 2 * Math.PI; pos.push(cxs + Math.cos(t) * (rr - 0.15), 0.012, czs + Math.sin(t) * (rr - 0.15), cxs + Math.cos(t) * (rr + 0.15), 0.012, czs + Math.sin(t) * (rr + 0.15)); if (i < 96) { const a = 2 * i; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); mesh(g, M.white, false);
    const g2 = new THREE.CircleGeometry(0.6, 20); g2.rotateX(-Math.PI / 2); const c2 = mesh(g2, M.white, false); c2.position.set(cxs, 0.012, czs);
    sign('SKIDPAD', cxs - 12, czs - rr - 6);
  }
  mini.skid = [-70, 255, 22];
  for (let i = 0; i < 9; i++) {
    const x = -125 + i * 11, z = 295 + (i % 2 ? 2.8 : -2.8);
    axisBox(x, 0.4, z, 0.3, 0.4, 0.3, 'cone');
    if (visuals) { const c = mesh(new THREE.ConeGeometry(0.32, 0.8, 16), M.cone); c.position.set(x, 0.4, z); const b = mesh(new THREE.BoxGeometry(0.75, 0.04, 0.75), M.under); b.position.set(x, 0.02, z); }
    mini.lines.push([x, z]);
  }
  sign('SLALOM', -128, 288);
  // H · casse da sfondare: un muro di 4 × 5 e una piramide da 21, corpi rigidi da 45 kg
  {
    const S = 0.9, mk = (x, y, z) => props.push({ x, y, z, hx: S / 2, hy: S / 2, hz: S / 2, m: 45 });
    for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) mk(94, S / 2 + j * S, 196 + i * (S + 0.04));
    for (let r = 0; r < 6; r++) for (let i = 0; i < 6 - r; i++) mk(92, S / 2 + r * S, 262 + (i - (5 - r) / 2) * (S + 0.04));
    mini.rects.push([90, 193, 6, 4.6], [90, 258, 6, 6]);
    sign('CRATES', 84, 188);
  }

  // ---------------------------------------------------------------- parco acrobazie
  // fila A e B: trampolini con rampe d'atterraggio
  { const k = kicker(60, -50, 9, 15, PW); landing(k.x1 + 20, -50, k.h, 12, PW); }
  { const k = kicker(60, -75, 10, 25, PW); landing(k.x1 + 28, -75, k.h, 14, PW); }
  // fila C: table-top
  {
    const z = -100, a = 12 * Math.PI / 180, len = 12, lx = len * Math.cos(a), h = len * Math.sin(a), x0 = 60, top = 20;
    slab([x0, 0], [x0 + lx, h], z, 10); slab([x0 + lx + top, h], [x0 + 2 * lx + top, 0], z, 10);
    axisBox(x0 + lx + top / 2, h / 2, z, top / 2 + 0.1, h / 2, 5, 'park');
    prism([[x0, 0], [x0 + lx, h], [x0 + lx + top, h], [x0 + 2 * lx + top, 0]], z, 10, M.concrete);
    mini.rects.push([x0, z - 5, 2 * lx + top, 10]);
  }
  // fila D: giro della morte a elica (entri a z = -125 ed esci a z = -133) con ingresso e uscita
  // raccordati a clotoide: la curvatura cresce in 10 m fino al raggio minimo e poi cala, come
  // nei giri veri, così il muso non urta la pista e i carichi crescono gradualmente
  const LOOP = { x0: 92, z0: -125, shift: -8, W: 6.5, Rmin: 8.5, Lt: 10 };
  {
    const kmax = 1 / LOOP.Rmin, Stot = 2 * Math.PI / kmax + LOOP.Lt, ds = 0.05;
    const samples = []; let x = LOOP.x0, y = 0, ph = 0;
    for (let s = 0; s <= Stot + 1e-6; s += ds) {
      if (Math.round(s / ds) % 16 === 0) samples.push({ x, y, ph, s });
      const k = kmax * Math.min(1, s / LOOP.Lt, (Stot - s) / LOOP.Lt);
      ph += k * ds; x += Math.cos(ph) * ds; y += Math.sin(ph) * ds;
    }
    samples.push({ x, y, ph: 2 * Math.PI, s: Stot });
    const pts = samples.map(q => ({ p: new V3(q.x, Math.max(q.y, 0), LOOP.z0 + LOOP.shift * q.s / Stot), n: new V3(-Math.sin(q.ph), Math.cos(q.ph), 0), s: q.s }));
    LOOP.samples = pts.map(q => q.p); LOOP.tz = LOOP.shift / Stot;
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1], u = new V3().subVectors(b.p, a.p), len = u.length(); u.normalize();
      const n = new V3().addVectors(a.n, b.n); n.addScaledVector(u, -n.dot(u)).normalize();
      const w = new V3().crossVectors(u, n).normalize();
      addOBB(new V3().addVectors(a.p, b.p).multiplyScalar(0.5).addScaledVector(n, -PT / 2), u, n, w, len / 2 + 0.06, PT / 2, LOOP.W / 2, 'loop');
    }
    const xs = pts.map(q => q.p.x), top = Math.max(...pts.map(q => q.p.y)), cx = (Math.min(...xs) + Math.max(...xs)) / 2, hw = (Math.max(...xs) - Math.min(...xs)) / 2;
    if (visuals) {
      const side = (lat, off) => pts.map(q => [P(q.p.clone().add(new V3(0, 0, lat[0])).addScaledVector(q.n, off)), P(q.p.clone().add(new V3(0, 0, lat[1])).addScaledVector(q.n, off)), q.s / 3]);
      mesh(stripGeo(side([LOOP.W / 2, -LOOP.W / 2], 0)), M.concrete);
      mesh(stripGeo(side([-LOOP.W / 2, LOOP.W / 2], -PT)), M.under);
      for (const sd of [-1, 1]) mesh(stripGeo(side([sd * (LOOP.W / 2 - 0.12), sd * (LOOP.W / 2 - 0.02)], 0.01)), M.led, false);
      for (const sx of [-1, 1]) { const c = mesh(new THREE.CylinderGeometry(0.35, 0.45, top, 12), M.pillar); c.position.set(cx + sx * (hw + 1.2), top / 2, LOOP.z0 + LOOP.shift / 2); axisBox(c.position.x, c.position.y, c.position.z, 0.45, top / 2, 0.45, 'wall'); }
    }
    mini.rects.push([cx - hw, LOOP.z0 + LOOP.shift - 3, 2 * hw, -LOOP.shift + 6]);
    // corsia d'ingresso con limitatore a 55 km/h (segnaletica a terra)
    LOOP.lane = { x0: LOOP.x0 - 45, x1: LOOP.x0 + 14, z: LOOP.z0, hw: LOOP.W / 2 + 1 };
    if (visuals) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 128;
      const g = c.getContext('2d'); g.fillStyle = '#efefea'; g.font = '700 110px "General Sans", system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('55', 128, 68);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const m = mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3 }), false);
      m.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); m.position.set(LOOP.x0 - 22, 0.02, LOOP.z0);
      for (const sd of [-1, 1]) { const l = mesh(new THREE.PlaneGeometry(45, 0.15), M.white, false); l.rotation.x = -Math.PI / 2; l.position.set(LOOP.x0 - 22.5, 0.02, LOOP.z0 + sd * (LOOP.W / 2)); }
    }
  }
  // fila E: half-pipe lungo x
  {
    const zc = -160, flat = 8, R = 5, x0 = 70, x1 = 130, prof = [];
    prof.push([zc - flat / 2 - R, R + 1.2]);
    for (let k = 0; k <= 8; k++) { const f = Math.PI / 2 * (1 - k / 8); prof.push([zc - flat / 2 - R * Math.sin(f), R - R * Math.cos(f)]); }
    for (let k = 0; k <= 8; k++) { const f = Math.PI / 2 * k / 8; prof.push([zc + flat / 2 + R * Math.sin(f), R - R * Math.cos(f)]); }
    prof.push([zc + flat / 2 + R, R + 1.2]);
    const len = x1 - x0;
    for (let k = 0; k < prof.length - 1; k++) {
      const [za, ya] = prof[k], [zb, yb] = prof[k + 1], dz = zb - za, dy = yb - ya, sl = Math.hypot(dz, dy);
      const n = new V3(0, dz / sl, -dy / sl), u = new V3(1, 0, 0), w = new V3().crossVectors(u, n);
      addOBB(new V3((x0 + x1) / 2, (ya + yb) / 2, (za + zb) / 2).addScaledVector(n, -PT / 2), u, n, w, len / 2, PT / 2, sl / 2 + 0.03, 'park');
    }
    if (visuals) {
      const normals = prof.map((q, k) => { const a = prof[Math.max(0, k - 1)], b = prof[Math.min(prof.length - 1, k + 1)]; const dz = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dz, dy); return [dy === 0 && dz === 0 ? 0 : -dy / l, dz / l]; });
      const rowsAt = off => prof.map((q, k) => [[x1, q[1] + normals[k][1] * off, q[0] + normals[k][0] * off], [x0, q[1] + normals[k][1] * off, q[0] + normals[k][0] * off], k]);
      mesh(stripGeo(rowsAt(0)), M.concrete);
      mesh(stripGeo(rowsAt(-PT).map(r => [r[1], r[0], r[2]])), M.under);
      for (const zz of [prof[0][0], prof[prof.length - 1][0]]) { const e = mesh(new THREE.BoxGeometry(len, 0.08, 0.12), M.led, false); e.position.set((x0 + x1) / 2, R + 1.2 + 0.04, zz); }
    }
    mini.rects.push([x0, zc - flat / 2 - R, x1 - x0, flat + 2 * R]);
  }
  // fila F: slalom tra i coni
  for (let i = 0; i < 10; i++) {
    const x = 60 + i * 10, z = -190 + (i % 2 ? 3 : -3);
    axisBox(x, 0.4, z, 0.3, 0.4, 0.3, 'cone');
    if (visuals) { const c = mesh(new THREE.ConeGeometry(0.32, 0.8, 16), M.cone); c.position.set(x, 0.4, z); const b = mesh(new THREE.BoxGeometry(0.75, 0.04, 0.75), M.under); b.position.set(x, 0.02, z); }
    mini.lines.push([x, z]);
  }

  // ---------------------------------------------------------------- mesh delle colline
  if (visuals) {
    const sx = HB.x1 - HB.x0, sz = HB.z1 - HB.z0, nx = Math.round(sx / 2), nz = Math.round(sz / 2);
    const g = new THREE.PlaneGeometry(sx, sz, nx, nz); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, col = [];
    const c1 = new THREE.Color('#5a4630'), c2 = new THREE.Color('#7b6646'), c3 = new THREE.Color('#3f3a2c'), tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + (HB.x0 + HB.x1) / 2, z = pos.getZ(i) + (HB.z0 + HB.z1) / 2, h = hillsH(x, z);
      pos.setX(i, x); pos.setZ(i, z); pos.setY(i, h + 0.02);
      tmp.copy(c1).lerp(c2, 0.5 + 0.5 * Math.sin(x * 0.31 + z * 0.17)).lerp(c3, Math.min(1, h / 9) * 0.5 + 0.15 * Math.random());
      col.push(tmp.r, tmp.g, tmp.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })); m.receiveShadow = true; scene.add(m);
    // paletti con bandierine lungo un tracciato
    const flags = [[-215, 160], [-250, 110], [-300, 80], [-360, 95], [-420, 140], [-430, 210], [-380, 255], [-310, 245], [-260, 200]];
    flags.forEach(([x, z], i) => {
      const h = hillsH(x, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), M.wall); pole.position.set(x, h + 1.5, z); scene.add(pole);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), i % 2 ? M.red : M.white); f.position.set(x + 0.45, h + 2.7, z); scene.add(f);
    });
    mini.flags = flags;
  }
  if (visuals) {
    // rilievi della mappa test: una mesh a risoluzione adatta per ognuno (i dossi ogni 20 cm, la collina ogni metro)
    const COL = { bump: ['#6a6d73', '#d9b21e'], wash: ['#585b61', '#6e7178'], rock: ['#5a5b5c', '#7a7b7a'], hill: ['#575a54', '#7c8077'] };
    for (const f of FEATS) {
      const sx = f.x1 - f.x0, sz = f.z1 - f.z0, nx = Math.round(sx / f.res), nz = Math.round(sz / f.res);
      const g = new THREE.PlaneGeometry(sx, sz, nx, nz); g.rotateX(-Math.PI / 2);
      const pos = g.attributes.position, col = [], c0 = new THREE.Color(COL[f.color][0]), c1 = new THREE.Color(COL[f.color][1]), cc = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + (f.x0 + f.x1) / 2, z = pos.getZ(i) + (f.z0 + f.z1) / 2, h = f.fn(x, z);
        pos.setX(i, x); pos.setZ(i, z); pos.setY(i, h + 0.012);
        const t = f.color === 'bump' ? (h > 0.004 && Math.floor((z - 48) / 1.6) % 2 === 0 ? 1 : 0) : Math.min(1, h / (f.color === 'hill' ? 14 : 0.34)) * 0.9 + 0.1 * Math.random();
        cc.copy(c0).lerp(c1, t); col.push(cc.r, cc.g, cc.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.receiveShadow = m.castShadow = true; scene.add(m);
    }
    // cartelli dei settori
    const mkSign = (text) => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
      g.fillStyle = '#16171a'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#ff7a2f'; g.lineWidth = 8; g.strokeRect(6, 6, 500, 116);
      g.fillStyle = '#f2f1ec'; g.font = '700 64px ui-sans-serif, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 68);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
    };
    for (const sg of signs) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 8), M.wall); pole.position.set(sg.x, 1.6, sg.z); scene.add(pole);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: mkSign(sg.text), side: THREE.DoubleSide })); pl.position.set(sg.x, 3.1, sg.z); pl.rotation.y = sg.yaw; scene.add(pl);
    }
  }
  mini.hills = [HB.x0, HB.z0, HB.x1 - HB.x0, HB.z1 - HB.z0];

  // ---------------------------------------------------------------- partenze e giro
  api.starts = {
    grid: { p: new V3(-125, 0, 60), yaw: -Math.PI / 2 },
    park: { p: new V3(35, 0, -75), yaw: -Math.PI / 2 },
    hills: { p: new V3(-190, 0, 165), yaw: Math.PI / 2 },
  };
  api.props = props; api.bank = BANK; api.GRID = GRID;
  api.loop = LOOP;
  api.mini = mini;
  api.count = OB.length;
  return api;
}
