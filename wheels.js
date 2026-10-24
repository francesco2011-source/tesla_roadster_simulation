// Ruote della Tesla Roadster costruite da zero: gomma ribassata con battistrada e spalla,
// cerchio aerodinamico concavo a 10 razze con canale e labbro lucidato, coprimozzo con la T,
// disco freno autoventilato e pinza (la pinza non gira con la ruota).
// Asse della ruota lungo +X, faccia esterna verso +X (per il lato sinistro si specchia).

let MATS = null;
function materials(THREE) {
  if (MATS) return MATS;
  // battistrada: blocchi con lamelle diagonali e scanalature longitudinali
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1a1b'; g.fillRect(0, 0, 1024, 128);
  for (let i = 0; i < 1024; i += 16) {
    g.strokeStyle = '#0c0c0d'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(i, 18); g.lineTo(i + 9, 52); g.stroke();
    g.beginPath(); g.moveTo(i + 6, 76); g.lineTo(i - 3, 110); g.stroke();
  }
  g.fillStyle = '#080809'; for (const y of [34, 64, 94]) g.fillRect(0, y - 3, 1024, 6);
  const tread = new THREE.CanvasTexture(c); tread.wrapS = tread.wrapT = THREE.RepeatWrapping; tread.colorSpace = THREE.SRGBColorSpace; tread.anisotropy = 8;
  // fianco: anelli sottili e scritta in rilievo appena visibile
  const s = document.createElement('canvas'); s.width = 1024; s.height = 64;
  const sg = s.getContext('2d'); sg.fillStyle = '#19191a'; sg.fillRect(0, 0, 1024, 64);
  sg.fillStyle = '#242426'; sg.font = '600 30px "General Sans", system-ui'; sg.textBaseline = 'middle';
  for (const x of [60, 572]) sg.fillText('PILOT SPORT  ·  325/30 ZR21', x, 32);
  sg.fillStyle = '#111112'; sg.fillRect(0, 6, 1024, 2); sg.fillRect(0, 56, 1024, 2);
  const side = new THREE.CanvasTexture(s); side.wrapS = THREE.RepeatWrapping; side.colorSpace = THREE.SRGBColorSpace; side.anisotropy = 8;
  MATS = {
    tread: new THREE.MeshStandardMaterial({ map: tread, bumpMap: tread, bumpScale: 2.2, roughness: 0.92, metalness: 0 }),
    side: new THREE.MeshStandardMaterial({ map: side, bumpMap: side, bumpScale: 0.8, roughness: 0.85, metalness: 0 }),
    face: new THREE.MeshPhysicalMaterial({ color: '#2b2d31', roughness: 0.32, metalness: 0.9, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
    lip: new THREE.MeshStandardMaterial({ color: '#d6d9dd', roughness: 0.12, metalness: 1 }),
    barrel: new THREE.MeshStandardMaterial({ color: '#202124', roughness: 0.5, metalness: 0.8, side: THREE.DoubleSide }),
    disc: new THREE.MeshStandardMaterial({ color: '#7a7d82', roughness: 0.38, metalness: 0.95 }),
    discHub: new THREE.MeshStandardMaterial({ color: '#2a2b2e', roughness: 0.5, metalness: 0.7 }),
    caliper: new THREE.MeshPhysicalMaterial({ color: '#b3121c', roughness: 0.35, metalness: 0.2, clearcoat: 0.8 }),
    cap: new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.3, metalness: 0.6 }),
    logo: new THREE.MeshStandardMaterial({ color: '#e3e5e8', roughness: 0.15, metalness: 1 }),
    liner: new THREE.MeshStandardMaterial({ color: '#070708', roughness: 0.95, side: THREE.BackSide }),
  };
  return MATS;
}

// solido di rivoluzione con asse lungo X (profilo: [raggio, x])
function lathe(THREE, prof, seg = 72) {
  const geo = new THREE.LatheGeometry(prof.map(([r, x]) => new THREE.Vector2(r, x)), seg);
  geo.rotateZ(-Math.PI / 2);
  return geo;
}

export function buildWheel(THREE, { R = 0.355, W = 0.28, rimR = 0.262 } = {}) {
  const M = materials(THREE);
  const root = new THREE.Group();   // segue lo sterzo e le sospensioni
  const spin = new THREE.Group();   // gira con la ruota
  root.add(spin);
  const hw = W / 2;

  // ---- gomma: battistrada (con texture) e due fianchi
  const tread = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16, x = -hw * 0.86 + 1.72 * hw * t;
    const crown = 1 - Math.pow(Math.abs(2 * t - 1), 6) * 0.04; // spalla leggermente arrotondata
    tread.push([R * crown, x]);
  }
  const tg = lathe(THREE, tread);
  { const uv = tg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 14, uv.getY(i)); }
  const tm = new THREE.Mesh(tg, M.tread); tm.castShadow = true; spin.add(tm);
  for (const sd of [1, -1]) {
    const prof = [[R * 0.96, sd * hw * 0.86], [R - 0.012, sd * hw * 0.97], [R - 0.03, sd * hw * 1.02], [(R + rimR) / 2, sd * hw * 1.04], [rimR + 0.018, sd * hw * 0.99], [rimR + 0.004, sd * hw * 0.94]];
    const g = lathe(THREE, sd > 0 ? prof : prof.reverse());
    const m = new THREE.Mesh(g, M.side); m.castShadow = true; spin.add(m);
  }

  // ---- cerchio: canale, labbro lucidato, faccia concava a 10 razze
  const barrel = new THREE.CylinderGeometry(rimR, rimR, W * 0.92, 56, 1, true); barrel.rotateZ(Math.PI / 2);
  spin.add(new THREE.Mesh(barrel, M.barrel));
  const lip = lathe(THREE, [[rimR + 0.004, hw * 0.93], [rimR + 0.012, hw * 0.95], [rimR + 0.006, hw * 0.99], [rimR - 0.014, hw * 0.99], [rimR - 0.016, hw * 0.93]]);
  spin.add(new THREE.Mesh(lip, M.lip));
  {
    const fr = rimR - 0.014, shape = new THREE.Shape();
    shape.absarc(0, 0, fr, 0, Math.PI * 2, false);
    const N = 10, r0 = 0.085, r1 = fr - 0.03;
    for (let k = 0; k < N; k++) {
      const a0 = k / N * Math.PI * 2, slot = 0.34, twist = 0.22; // fessure leggermente curve (effetto turbina)
      const hole = new THREE.Path();
      const pt = (rr, aa) => [rr * Math.cos(aa), rr * Math.sin(aa)];
      const steps = 6, pts = [];
      for (let i = 0; i <= steps; i++) { const u = i / steps; pts.push(pt(r0 + (r1 - r0) * u, a0 + twist * u * u)); }
      for (let i = steps; i >= 0; i--) { const u = i / steps; pts.push(pt(r0 + (r1 - r0) * u, a0 + slot * (0.35 + 0.65 * u) + twist * u * u)); }
      hole.moveTo(...pts[0]); for (const p of pts.slice(1)) hole.lineTo(...p); hole.closePath();
      shape.holes.push(hole);
    }
    const fg = new THREE.ExtrudeGeometry(shape, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 2, curveSegments: 48 });
    fg.rotateY(Math.PI / 2);
    // faccia concava: il centro rientra verso l'interno
    const p = fg.attributes.position;
    for (let i = 0; i < p.count; i++) { const rr = Math.hypot(p.getY(i), p.getZ(i)) / fr; p.setX(i, p.getX(i) - 0.05 * (1 - rr * rr)); }
    fg.computeVertexNormals();
    const face = new THREE.Mesh(fg, M.face); face.position.x = hw * 0.9 - 0.022; face.castShadow = true; spin.add(face);
    // coprimozzo con la T
    const cap = new THREE.CylinderGeometry(0.058, 0.064, 0.03, 32); cap.rotateZ(Math.PI / 2);
    const cm = new THREE.Mesh(cap, M.cap); cm.position.x = hw * 0.9 - 0.06; spin.add(cm);
    const T = new THREE.Shape();
    T.moveTo(-0.03, 0.026); T.lineTo(0.03, 0.026); T.lineTo(0.03, 0.017); T.lineTo(0.007, 0.017); T.lineTo(0.007, -0.03); T.lineTo(-0.007, -0.03); T.lineTo(-0.007, 0.017); T.lineTo(-0.03, 0.017); T.closePath();
    const tgeo = new THREE.ExtrudeGeometry(T, { depth: 0.004, bevelEnabled: false }); tgeo.rotateY(Math.PI / 2);
    const tl = new THREE.Mesh(tgeo, M.logo); tl.position.x = hw * 0.9 - 0.045; spin.add(tl);
  }

  // ---- freno: disco autoventilato (due piste) con campana, pinza fissa
  const disc = new THREE.CylinderGeometry(0.19, 0.19, 0.012, 56); disc.rotateZ(Math.PI / 2);
  for (const dx of [-0.012, 0.012]) { const d = new THREE.Mesh(disc, M.disc); d.position.x = -0.02 + dx; spin.add(d); }
  const bell = new THREE.CylinderGeometry(0.1, 0.11, 0.05, 32); bell.rotateZ(Math.PI / 2);
  const bm = new THREE.Mesh(bell, M.discHub); bm.position.x = 0.005; spin.add(bm);
  {
    const sh = new THREE.Shape(), a0 = 0.55, a1 = 1.75, ri = 0.13, ro = 0.215;
    sh.absarc(0, 0, ro, a0, a1, false); sh.absarc(0, 0, ri, a1, a0, true); sh.closePath();
    const cg = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 20 });
    cg.translate(0, 0, -0.035); cg.rotateY(Math.PI / 2);
    const cal = new THREE.Mesh(cg, M.caliper); cal.position.x = -0.02; cal.castShadow = true;
    cal.rotation.x = 0.35; // dietro e in alto rispetto al mozzo
    root.add(cal);
  }
  return { root, spin };
}

// rivestimento scuro del passaruota (mezzo cilindro sopra la ruota)
export function archLiner(THREE, r = 0.4, w = 0.42) {
  // dopo la rotazione y = r·sinθ: θ da -20° a 200° copre la parte alta dell'arco
  const g = new THREE.CylinderGeometry(r, r, w, 36, 1, true, -Math.PI * 0.11, Math.PI * 1.22);
  g.rotateZ(Math.PI / 2);
  return new THREE.Mesh(g, materials(THREE).liner);
}
