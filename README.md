# Tesla Roadster 3D

🇮🇹 Italiano · [🇬🇧 English below](#english)

Simulatore 3D nel browser: guidi una Tesla Roadster con il (chiacchierato) pacchetto di propulsori a gas freddo SpaceX e la ventola di aspirazione sotto il pianale. Sali sulla rampa a J, resta appeso a testa in giù, capovolgiti con i getti laterali, distruggi casse, affronta l'anello sopraelevato. **Nessuna installazione, nessuna build, funziona offline.** Si controlla soprattutto con il **controller PS5 (DualSense)**, ma anche con la tastiera.

> Progetto amatoriale non ufficiale. Non affiliato a Tesla o SpaceX.

## Avvio rapido

Serve solo **Python 3** (per un mini server locale: i moduli ES non funzionano da `file://`) e un browser moderno (**Chrome, Edge** o Firefox).

### macOS
1. Scarica il progetto (*Code → Download ZIP*) e decomprimilo, oppure `git clone`.
2. Doppio clic su **`start-mac.command`**.
   - La prima volta: clic destro → **Apri** → **Apri** (Gatekeeper).
   - Se non parte: da Terminale, `chmod +x start-mac.command` e riprova.
3. Il browser si apre su `http://localhost:8000`.

### Windows
1. Installa [Python 3](https://www.python.org/downloads/) spuntando **"Add python.exe to PATH"**.
2. Scarica e decomprimi il progetto.
3. Doppio clic su **`start-windows.bat`**. Il browser si apre su `http://localhost:8000`.

### Qualsiasi sistema (Terminale)
```bash
python3 serve.py        # Windows: py -3 serve.py
# poi apri http://localhost:8000
```
Per chiudere il server: `Ctrl+C` (o chiudi la finestra del terminale).

### Online (GitHub Pages)
Nel tuo fork: *Settings → Pages → Source: GitHub Actions*. Il workflow incluso pubblica il gioco su `https://<utente>.github.io/<repo>/`.

## Controller PS5 (consigliato)

1. Collega il DualSense via **USB-C** oppure **Bluetooth** (tieni premuti `PS` + `Create` finché la barra luminosa lampeggia, poi accoppialo dalle impostazioni Bluetooth).
2. Apri il gioco e **premi un tasto qualsiasi**: il controller viene riconosciuto automaticamente (compare una notifica).
3. Funzionano anche DualShock 4 e controller Xbox (mappatura normalizzata: A=✕, B=○, X=□, Y=△, Menu=Options, View=Create, L3=prossima sfida).

| Controller PS5 | Azione | Tastiera |
|---|---|---|
| R2 / L2 | Accelera / frena e retromarcia | W / S |
| Stick sinistro | Sterza (in aria: beccheggio/imbardata) | A D · W S |
| ✕ | Getti di sollevamento | Spazio |
| ○ | Boost posteriore | Shift |
| □ | Getti frenanti anteriori | C |
| L1 / R1 | Capriola laterale / giro su sé stessa | Q / E |
| △ | Cambia visuale | V |
| Touchpad / L3 | Prossima sfida | T |
| D-pad ↑ ↓ | Livello di aspirazione manuale | M / N |
| D-pad → | Aspirazione automatica / manuale | G |
| D-pad ← | Controllo di trazione | H |
| Stick destro | Ruota la telecamera | trascina col mouse |
| R3 | Zoom | Z / rotella |
| CREATE | Raddrizza l'auto | F |
| OPTIONS | Ricomincia (tenuto premuto: impostazioni) | R (P: impostazioni) |

Nel gioco, il pulsante **Controls** mostra sempre la mappa dei comandi.

### Il controller non viene rilevato?
- Premi un tasto *dopo* aver aperto la pagina (il browser espone il gamepad solo dopo un input).
- Usa Chrome o Edge; chiudi altre app che usano il controller (Steam, PS Remote Play, DS4Windows).
- Prova un altro cavo USB (alcuni sono solo di ricarica).

## Funzionalità
- Auto a corpo rigido: gomme Pacejka, sterzo Ackermann, cerchio d'attrito, ESC, controllo di trazione, aspirazione ΔP·A.
- 10 propulsori con controllo d'assetto fly-by-wire, particelle di gas che collidono con il mondo.
- Griglia di test (rampe 10–40°, dossi, scale, muro, salto lungo, anello sopraelevato, casse, salita), parco acrobazie, colline.
- Telecamera stile GTA, minimappa, gas / grip / spinta regolabili, italiano e inglese.

## Modello 3D (opzionale)
Il modello della Tesla **non è incluso** (licenza sconosciuta). Senza `models/tesla-roadster-2026.glb` il gioco usa un'auto procedurale generata dal codice. Se hai un modello tuo, copialo in `models/tesla-roadster-2026.glb`. Vedi [CREDITS.md](CREDITS.md).

## Licenza
MIT (codice). Asset di terze parti: vedi CREDITS.md.

---

<a id="english"></a>
# English

A free-roam 3D physics sandbox in the browser: drive a Tesla Roadster fitted with the rumoured SpaceX cold-gas thruster package and underfloor suction fan. Climb the J-ramp, hang upside-down, flip with the side thrusters, smash crates, hit the banked ring. **No install, no build step, works offline.** Designed primarily for the **PS5 DualSense controller**, keyboard also supported.

> Unofficial fan project. Not affiliated with Tesla or SpaceX.

## Quick start

Requires **Python 3** (tiny local server; ES modules don't load from `file://`) and Chrome, Edge or Firefox.

| OS | How |
|---|---|
| macOS | double-click `start-mac.command` (first time: right-click → Open; if needed `chmod +x start-mac.command`) |
| Windows | install [Python 3](https://www.python.org/downloads/) (tick *Add to PATH*), double-click `start-windows.bat` |
| Any | `python3 serve.py` (Windows: `py -3 serve.py`), then open http://localhost:8000 |

**Online:** enable *Settings → Pages → Source: GitHub Actions* on your fork; the included workflow publishes the game at `https://<user>.github.io/<repo>/`.

## PS5 controller

Connect the DualSense via USB-C or Bluetooth, open the game and press any button: it is detected automatically. PS4 and Xbox pads work too (Xbox: A=✕ B=○ X=□ Y=△, Menu=Options, View=Create, L3=next challenge). See the table above for the full mapping (also shown in-game under **Controls**).

If the pad isn't detected: press a button after the page loaded, use Chrome/Edge, close apps that grab the controller (Steam, Remote Play, DS4Windows), try another USB cable.

## Model
The Tesla model file is not included. Without `models/tesla-roadster-2026.glb` the game uses a procedural car. Drop your own model at that path if you have one. See [CREDITS.md](CREDITS.md).

## License
MIT (code). Third-party assets: see CREDITS.md.
