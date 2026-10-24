// Traduzioni (italiano / inglese). La lingua si sceglie dalle impostazioni; di default segue il browser.
const D = {
  it: {
    'ui.blurb': 'Pacchetto SpaceX: 10 propulsori a gas compresso e aspirazione a ventola sotto il pianale. Guida libera in 3D.',
    'ui.start': 'Clicca o premi ✕ per iniziare',
    'ui.controls': 'Comandi', 'ui.settings': 'Impostazioni', 'ui.close': 'Chiudi', 'ui.defaults': 'Valori originali',
    'ui.thrusters': 'Propulsori', 'ui.front': 'fronte', 'ui.nozzles': '10 ugelli', 'ui.gasInf': 'gas infinito', 'ui.gasOut': 'gas finito', 'ui.gasLow': 'gas basso',
    'ui.speed': 'Velocità', 'ui.height': 'Altezza', 'ui.suction': 'Aspirazione', 'ui.gas': 'Gas',
    'ui.run': 'Prova {0}', 'ui.best': 'Record', 'ui.challenge': 'Sfida', 'ui.view': 'Vista', 'ui.pts': 'punti',
    'ui.suctionAuto': 'AUTOMATICA', 'ui.suctionManual': 'MANUALE', 'ui.tc': 'Controllo trazione', 'ui.on': 'ON', 'ui.off': 'OFF',
    'ui.outMap': 'fuori mappa · {0} m', 'ui.paused': 'In pausa',
    'ui.setHint': 'Controller: tieni premuto OPTIONS per aprire · D-pad ↑↓ scegli · ←→ regola · ○ chiudi. Tastiera: P, frecce, Esc.',
    'ui.helpTitle': 'Comandi', 'ui.helpPad': 'Controller PS5 / PS4 / Xbox (riconosciuto da solo)', 'ui.helpKb': 'Tastiera e mouse',
    'v.third': 'Terza persona', 'v.cockpit': 'Abitacolo', 'v.side': 'Laterale', 'v.drone': 'Drone',
    'ch.ramp': 'Rampa', 'ch.jump': 'Salto', 'ch.grid': 'Mappa test', 'ch.park': 'Parco acrobazie', 'ch.hills': 'Colline',
    'chd.ramp': 'Sali sulla J, staccati e atterra nella zona', 'chd.jump': 'Supera i cinque veicoli parcheggiati',
    'chd.grid': 'Area di prova a griglia: rampe, dossi, muro, scale, pista sopraelevata, casse da sfondare e salita',
    'chd.park': 'Trampolini, table-top, giro della morte, half-pipe e slalom', 'chd.hills': 'Sterrato tra le colline: meno aderenza, tanti salti',
    's.gas': 'Gas compresso', 's.burn': 'Consumo del sollevamento', 's.lift': 'Spinta di sollevamento', 's.boost': 'Spinta del boost',
    's.air': "Densità dell'aria compressa", 's.volume': 'Volume', 's.grip': 'Aderenza della strada', 's.impact': 'Botto al distacco dalla rampa',
    's.invert': 'Asse verticale telecamera', 's.lang': 'Lingua',
    's.infinite': '∞ infinito', 's.normal': 'Normale', 's.inverted': 'Invertito', 's.off': 'spento',
    's.gripWet': 'bagnato', 's.gripAvg': 'strada media', 's.gripDry': 'asciutto', 's.gripTrack': 'pista',
    't.pad': 'Controller collegato', 't.padGeneric': 'Controller', 't.righted': 'Auto raddrizzata',
    't.crash': 'Schianto', 't.crashDetail': '{0} m · {1} giri · impatto {2} m/s — continua pure',
    't.perfect': 'Perfetto', 't.clean': 'Pulito', 't.landed': 'Atterrato', 't.short': 'Atterrato corto', 't.trick': 'Acrobazia', 't.best': 'record!',
    't.cleared': 'superati {0} di {1}', 't.released': 'staccato a {0} m', 't.high': '{0} m di altezza', 't.air': '{0} s in aria', 't.turns': '{0} giri', 't.impact': 'impatto {0} m/s', 't.gasLeft': 'gas {0}%', 't.onMark': 'nella zona',
    't.model': 'Errore nel caricare il modello',
    't.challenge': 'Sfida: {0}',
    't.tcOn': 'Controllo trazione attivo', 't.tcOff': 'Controllo trazione disattivato', 't.tcOffD': 'Attento: 10.000 Nm sulle ruote posteriori',
    't.sAuto': 'Aspirazione automatica', 't.sAutoD': 'Si accende sopra 60 km/h, sulla rampa e nel giro della morte; mai in retromarcia',
    't.sMan': 'Aspirazione manuale {0}%', 't.sManD': '↑ / ↓ del D-pad per regolarla · ✕ per staccarti dalla rampa',
    't.sLevel': 'Aspirazione {0}%', 't.sLevelD': 'Vale in modalità manuale (D-pad →)',
    't.zoom': 'Zoom telecamera {0}',
    't.copyHint': 'Fuori dalla mappa: segui la freccia arancione nella minimappa',
    'h.drive': 'Accelera / frena (da fermo: retromarcia)', 'h.steer': 'Sterza (in aria: capriola e giro su sé stessa)', 'h.lift': 'Getti di sollevamento', 'h.boost': 'Boost posteriore',
    'h.retro': 'Getti frenanti anteriori', 'h.roll': 'Capovolgi di lato (a terra: gira su sé stessa)', 'h.view': 'Cambia visuale', 'h.chal': 'Cambia sfida',
    'h.recover': "Raddrizza l'auto", 'h.restart': 'Ricomincia', 'h.settings': 'Impostazioni (tieni premuto)', 'h.cam': 'Telecamera', 'h.zoom': 'Zoom',
    'h.sLevel': 'Aspirazione manuale: più / meno', 'h.sMode': 'Aspirazione automatica / manuale', 'h.tc': 'Controllo trazione',
    'h.drag': 'trascina', 'h.wheel': 'rotella', 'h.hold': 'tieni premuto',
    'h.tip': 'Xbox: A=✕ B=○ X=□ Y=△ · View=CREATE · Menu=OPTIONS · L3/Share=sfida. Suggerimento: sulla rampa tieni R2 e l\'aspirazione ti tiene attaccato; lascia per staccarti. Da ribaltato, L1/R1 ti rigirano.',
  },
  en: {
    'ui.blurb': 'SpaceX package: 10 cold-gas thrusters and an underfloor suction fan. Free-roam driving in 3D.',
    'ui.start': 'Click or press ✕ to start',
    'ui.controls': 'Controls', 'ui.settings': 'Settings', 'ui.close': 'Close', 'ui.defaults': 'Defaults',
    'ui.thrusters': 'Thrusters', 'ui.front': 'front', 'ui.nozzles': '10 nozzles', 'ui.gasInf': 'infinite gas', 'ui.gasOut': 'out of gas', 'ui.gasLow': 'low gas',
    'ui.speed': 'Speed', 'ui.height': 'Height', 'ui.suction': 'Suction', 'ui.gas': 'Gas',
    'ui.run': 'Run {0}', 'ui.best': 'Best', 'ui.challenge': 'Challenge', 'ui.view': 'View', 'ui.pts': 'pts',
    'ui.suctionAuto': 'AUTO', 'ui.suctionManual': 'MANUAL', 'ui.tc': 'Traction control', 'ui.on': 'ON', 'ui.off': 'OFF',
    'ui.outMap': 'off the map · {0} m', 'ui.paused': 'Paused',
    'ui.setHint': 'Gamepad: hold OPTIONS to open · D-pad ↑↓ pick · ←→ adjust · ○ close. Keyboard: P, arrows, Esc.',
    'ui.helpTitle': 'Controls', 'ui.helpPad': 'PS5 / PS4 / Xbox controller (auto-detected)', 'ui.helpKb': 'Keyboard and mouse',
    'v.third': 'Third person', 'v.cockpit': 'Cockpit', 'v.side': 'Side', 'v.drone': 'Drone',
    'ch.ramp': 'Ramp', 'ch.jump': 'Jump', 'ch.grid': 'Test grid', 'ch.park': 'Stunt park', 'ch.hills': 'Hills',
    'chd.ramp': 'Climb the J, let go and land in the zone', 'chd.jump': 'Clear the five parked vehicles',
    'chd.grid': 'Grid test area: ramps, bumps, wall, stairs, banked track, crates to smash and a hill climb',
    'chd.park': 'Kickers, table-top, loop, half-pipe and slalom', 'chd.hills': 'Dirt between the hills: less grip, lots of jumps',
    's.gas': 'Compressed gas', 's.burn': 'Lift gas burn', 's.lift': 'Lift thrust', 's.boost': 'Boost thrust',
    's.air': 'Compressed-air density', 's.volume': 'Volume', 's.grip': 'Road grip', 's.impact': 'Ramp-hook impact bang',
    's.invert': 'Camera vertical axis', 's.lang': 'Language',
    's.infinite': '∞ infinite', 's.normal': 'Normal', 's.inverted': 'Inverted', 's.off': 'off',
    's.gripWet': 'wet', 's.gripAvg': 'average road', 's.gripDry': 'dry', 's.gripTrack': 'track',
    't.pad': 'Controller connected', 't.padGeneric': 'Controller', 't.righted': 'Car righted',
    't.crash': 'Crash', 't.crashDetail': '{0} m · {1} turns · impact {2} m/s — keep going',
    't.perfect': 'Perfect', 't.clean': 'Clean', 't.landed': 'Landed', 't.short': 'Landed short', 't.trick': 'Stunt', 't.best': 'new best!',
    't.cleared': 'cleared {0} of {1}', 't.released': 'released at {0} m', 't.high': '{0} m high', 't.air': '{0} s airtime', 't.turns': '{0} turns', 't.impact': 'impact {0} m/s', 't.gasLeft': 'gas {0}%', 't.onMark': 'on target',
    't.model': 'Could not load the model',
    't.challenge': 'Challenge: {0}',
    't.tcOn': 'Traction control on', 't.tcOff': 'Traction control off', 't.tcOffD': 'Careful: 10,000 Nm on the rear wheels',
    't.sAuto': 'Automatic suction', 't.sAutoD': 'Turns on above 60 km/h, on the ramp and in the loop; never in reverse',
    't.sMan': 'Manual suction {0}%', 't.sManD': 'D-pad ↑ / ↓ to adjust · ✕ to peel off the ramp',
    't.sLevel': 'Suction {0}%', 't.sLevelD': 'Applies in manual mode (D-pad →)',
    't.zoom': 'Camera zoom {0}',
    't.copyHint': 'Off the map: follow the orange arrow on the minimap',
    'h.drive': 'Accelerate / brake (stopped: reverse)', 'h.steer': 'Steer (in air: flip and spin)', 'h.lift': 'Lift thrusters', 'h.boost': 'Rear boost',
    'h.retro': 'Front braking jets', 'h.roll': 'Barrel-roll (on ground: turn in place)', 'h.view': 'Change camera', 'h.chal': 'Change challenge',
    'h.recover': 'Right the car', 'h.restart': 'Restart', 'h.settings': 'Settings (hold)', 'h.cam': 'Camera', 'h.zoom': 'Zoom',
    'h.sLevel': 'Manual suction: more / less', 'h.sMode': 'Suction auto / manual', 'h.tc': 'Traction control',
    'h.drag': 'drag', 'h.wheel': 'wheel', 'h.hold': 'hold',
    'h.tip': 'Xbox: A=✕ B=○ X=□ Y=△ · View=CREATE · Menu=OPTIONS · L3/Share=challenge. Tip: on the ramp hold R2 and the suction keeps you stuck; let go to peel off. When upside down, L1/R1 roll you back.',
  },
};

let lang = 'it';
try { lang = localStorage.getItem('roadster3d.lang') || ((navigator.language || 'en').toLowerCase().startsWith('it') ? 'it' : 'en'); } catch { lang = 'en'; }
const listeners = [];

export const getLang = () => lang;
export const T = (key, ...args) => {
  let s = (D[lang] && D[lang][key]) ?? D.it[key] ?? key;
  args.forEach((v, i) => { s = s.split('{' + i + '}').join(v); });
  return s;
};
export function applyI18n() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = T(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = T(el.dataset.i18nTitle);
}
export function setLang(l) {
  lang = l === 'it' ? 'it' : 'en';
  try { localStorage.setItem('roadster3d.lang', lang); } catch { }
  applyI18n();
  for (const f of listeners) f();
}
export const onLang = f => listeners.push(f);
