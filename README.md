# WebPicSimulator

Simulatore del microcontrollore PIC16F84A nel browser: editor Assembly, assemblatore e debugger.  
Niente MPLAB, niente programmatore, niente breadboard. Tutto nel tuo WordPress.

**Versione:** 1.1.0
**Autore:** [Davide Bertolino](https://www.davidebertolino.it)  
**Licenza:** GPL v2 or later  
**Richiede:** WordPress 5.8+, PHP 7.4+  
**GitHub:** [dadebertolino/pic-simulator](https://github.com/dadebertolino/pic-simulator)

---

## Cosa fa

Lo studente scrive Assembly nell'editor, assembla e vede il programma girare istruzione per
istruzione, con registri, memoria e pin sotto gli occhi. Il simulatore riproduce il comportamento
del chip reale: banking della RAM, latch di porta distinti dai livelli sui pin, prescaler del
Timer0, vettore di interrupt a 0x004, stack hardware a 8 livelli che avvolge.

### 🧠 Core PIC16F84A
- Set di istruzioni completo a 14 bit, con i flag C, DC e Z
- 1K di memoria programma, 68 byte di GPR, 64 byte di EEPROM
- Banking Bank 0/Bank 1 con indirizzamento indiretto via INDF/FSR
- Stack hardware a 8 livelli
- Timer0 con prescaler configurabile e clock interno o esterno (RA4/T0CKI)
- Interrupt: Timer0, INT esterno su RB0, cambio su RB4-RB7, fine scrittura EEPROM
- EEPROM con la sequenza di sblocco 0x55/0xAA

### 🛠️ Assemblatore compatibile con MPASM
- Due passate con risoluzione delle etichette in avanti
- Etichette con i due punti (`LOOP:`) o in colonna 1 senza (`LOOP`)
- Direttive ORG, EQU, SET, CBLOCK/ENDC (anche `A, B, BUF:4`), DW, DT (anche stringhe), DE, DATA, RES, BANKSEL, RADIX, END
- `#define` come sostituzione testuale, anche per coppie registro/bit (`#define LED PORTB,0`)
- Espressioni negli operandi e nelle direttive: `+ - * / << >> & | ^ ~`, parentesi, `HIGH`/`LOW` e `$` (indirizzo corrente)
- Letterali esadecimali, binari, ottali, decimali e carattere in tutte le notazioni MPASM; radice predefinita decimale
- `DE` a partire da `ORG 0x2100` precarica la EEPROM
- Errori riga per riga, evidenziati nell'editor: simboli non definiti, numeri malformati e valori
  fuori intervallo (letterali, bit, indirizzi, memoria programma) non vengono mai convertiti in silenzio
- Disassemblatore, usato nella vista Programma

### ▶️ Esecuzione e debug
- Run, Step, Step Over, Animate e Reset
- **Run in tempo reale** come il chip a 4 MHz (un ciclo istruzione al µs), oppure rallentato
  (1/10, 1/100, 1/1000) o alla massima velocità del browser; il tempo simulato è mostrato accanto ai cicli
- Animate da 1 a 100 istruzioni al secondo, per seguire il programma riga per riga
- Breakpoint cliccabili sui numeri di riga
- Pannelli: Registri, bit di STATUS, Stack, Memoria (RAM/Programma/EEPROM), TMR0
- Celle di RAM ed EEPROM modificabili a mano durante l'esecuzione
- Pin di ingresso cliccabili per simulare pulsanti e segnali esterni

### 🎓 Uso in classe
- 10 esempi progressivi, dal blink LED alla macchina a stati
- Load e Save dei sorgenti `.asm` dal PC locale
- Modalità a schermo intero
- Scorciatoie da tastiera, attive solo quando il simulatore ha il focus

### 🔄 Aggiornamenti automatici
Gli aggiornamenti arrivano dalle release GitHub e compaiono nella pagina Plugin come per ogni altro
plugin.

---

## Installazione

1. Scarica lo ZIP dall'ultima [release](https://github.com/dadebertolino/pic-simulator/releases)
2. In WordPress: **Plugin → Aggiungi nuovo → Carica plugin**, scegli lo ZIP e attiva
3. Inserisci lo shortcode `[pic_simulator]` in una pagina

La pagina **Impostazioni → WebPicSimulator** riassume shortcode, scorciatoie e funzionalità.

---

## Shortcode

```
[pic_simulator]
[pic_simulator height="600px" fullwidth="yes"]
```

| Attributo | Default | Descrizione |
|-----------|---------|-------------|
| `height` | `800px` | Altezza del simulatore |
| `fullwidth` | `no` | Con `yes` si espande a tutta la larghezza della finestra |

È possibile inserire **un solo simulatore per pagina**: l'interfaccia usa identificatori fissi, e
il secondo shortcode mostra un avviso al posto del simulatore.

### Scorciatoie da tastiera

| Tasto | Azione |
|-------|--------|
| `F5` | Run / Stop |
| `F6` | Animate |
| `F8` | Step |
| `F10` | Step Over |
| `F11` | Schermo intero |
| `Ctrl+S` | Salva file ASM |
| `Ctrl+O` | Apri file ASM |
| `Esc` | Stop |

---

## Esempi inclusi

| # | File | Concetti |
|---|------|----------|
| 1 | `01_blink_led.asm` | Output, loop di ritardo, BSF/BCF |
| 2 | `02_binary_counter.asm` | INCF, output multi-bit |
| 3 | `03_button_led.asm` | Input, BTFSC/BTFSS |
| 4 | `04_knight_rider.asm` | RLF/RRF, flag Carry |
| 5 | `05_timer0_interrupt.asm` | TMR0, ISR, GIE/T0IE |
| 6 | `06_external_interrupt.asm` | INT su RB0, INTE/INTF |
| 7 | `07_eeprom.asm` | EEDATA, EECON1/EECON2 |
| 8 | `08_lookup_table.asm` | RETLW, PCL, computed GOTO |
| 9 | `09_subroutines_stack.asm` | CALL/RETURN, stack |
| 10 | `10_state_machine.asm` | Macchina a stati (semaforo) |

---

## Struttura cartelle

```
pic-simulator/
├── pic-simulator.php        # Bootstrap, shortcode, pagina admin
├── uninstall.php            # Pulizia alla disinstallazione
├── inc/
│   └── class-updater.php    # Aggiornamenti da GitHub Releases (condiviso)
├── assets/
│   ├── css/
│   │   ├── style.css        # Interfaccia del simulatore
│   │   └── db-admin-ui.css  # Design system admin (condiviso)
│   └── js/
│       ├── pic16f84a.js     # Core CPU: istruzioni, memoria, periferiche
│       ├── assembler.js     # Assemblatore a due passate e disassemblatore
│       ├── simulator.js     # Motore di esecuzione, tempo reale e breakpoint
│       └── ui.js            # Controller dell'interfaccia
├── templates/
│   ├── simulator.php        # Template HTML del simulatore
│   └── admin/
│       └── settings.php     # Pagina informazioni
├── examples/                # 10 programmi Assembly didattici
└── tests/                   # Unit (node:test) ed E2E (Playwright), esclusi dallo ZIP
```

---

## Privacy

Nessuna richiesta a servizi esterni: niente font da CDN, niente analytics, niente chiamate di rete
durante l'uso. I sorgenti restano sul PC dello studente e lo stato della simulazione vive solo nel
browser. Il plugin non scrive nulla nel database, a parte la cache dell'updater.

---

## Limitazioni

Questo è un simulatore didattico:
- Non sostituisce MPLAB X né un programmatore reale
- Il watchdog timer è dichiarato ma non implementato
- I tempi di ciclo sono approssimati: non c'è simulazione al quarto di ciclo
- Alcuni dettagli di temporizzazione sono semplificati (scrittura EEPROM istantanea, inibizione di TMR0 dopo la scrittura)
- L'assemblatore non supporta macro, `#include` di file e compilazione condizionale (`#ifdef`); `PAGESEL` non serve sul 16F84A e non è riconosciuto
- L'export Intel HEX esiste nel codice (`Simulator.exportHex()`) ma non è ancora collegato a un comando dell'interfaccia

---

## Note tecniche

- **Tutto lato client**: CPU, assemblatore e motore sono classi JavaScript senza dipendenze; il PHP
  registra solo asset, shortcode e pagina admin
- **Tempo reale**: a ogni tick (~60 al secondo) il motore esegue i cicli che il chip avrebbe eseguito
  nel tempo trascorso, con un tetto di 10 ms di calcolo per tick; se il browser resta indietro lo
  segnala invece di accumulare ritardo
- **Asset**: caricati solo nelle pagine che contengono lo shortcode, anche da blocchi, widget e page builder
- **Sicurezza**: gli errori dell'assemblatore sono inseriti come testo, mai come HTML; nessun dato
  inviato al server
- **Auto-updater**: controlla GitHub Releases ogni 12h; `Update URI` impedisce che WordPress proponga
  un plugin omonimo di wordpress.org

### Sviluppo

- `npm test`: unit test di CPU, assemblatore, motore ed esempi (`tests/unit/`, solo Node)
- `npm run check-js`: sintassi dei file in `assets/js` e degli script inline nei file PHP
- `composer install && composer phpcs`: WordPress Coding Standards e compatibilità con PHP 7.4+

Test nel browser (Playwright): `npm ci`, `npx wp-env start`, `npm run env:setup`,
`npx playwright test`. Senza Docker, `npm run env:playground` avvia WordPress Playground sulla
stessa porta.

La CI esegue a ogni push sintassi PHP 7.4–8.5, PHPCS, il controllo JavaScript, gli unit test e gli
E2E; ogni notte gli E2E contro WordPress in sviluppo e PHP 8.4. Dettagli in [TESTING.md](TESTING.md).
Un tag `vX.Y.Z` pubblica la release solo se la CI passa, se tag, header `Version` e `PICSIM_VERSION`
coincidono e se il README ha la voce `### X.Y.Z`; lo ZIP allegato contiene la cartella
`pic-simulator/` senza test e file di sviluppo.

---

## Changelog

### 1.1.0
**Run in tempo reale, assemblatore compatibile con MPASM, test e CI**

Minor: corregge i difetti emersi da un'analisi completa del plugin e aggiunge test automatici.

**Esecuzione:**
- Run gira in tempo reale come il chip a 4 MHz. Prima eseguiva 1000 istruzioni al secondo, mille
  volte meno: tra un cambio e l'altro dei LED negli esempi passavano da 30 a 400 secondi
- Nuova scelta della velocità di Run: tempo reale, 1/10, 1/100, 1/1000 o massima. Lo slider regola
  Animate ed è etichettato come tale
- Il tempo simulato è mostrato accanto ai cicli

**Correzioni del simulatore:**
- **Il flag Z non veniva mai impostato** (dalla 1.0.0): ogni test su `STATUS,Z` dopo `MOVF`, `XORLW`,
  `SUBWF`, `CLRF` e simili prendeva il ramo sbagliato. L'esempio 04 (Knight Rider) si spegneva al
  primo passo invece di far scorrere il LED
- La fine di una scrittura in EEPROM accendeva INTE (interrupt su RB0) se EEIE era attivo

**Assemblatore:**
- Diversi operandi venivano convertiti in silenzio in un valore sbagliato: `GOTO $` diventava
  `GOTO 0`, `#define X PORTB` faceva sparire l'istruzione spostando tutte le etichette successive,
  un simbolo non definito come `FETCH` diventava 0xFE, `B'0102'` diventava 2, `MOVLW V + 1`
  ignorava il `+1`. Ora ogni operando produce il valore giusto o un errore sulla sua riga
- Nuovi: espressioni, `HIGH`/`LOW`, `$`, etichette senza due punti, `CBLOCK` con virgole e `NOME:n`,
  `SET`, `BANKSEL`, `RADIX` e `LIST R=`, `DT` con stringhe, `DE` nella EEPROM, nomi dei bit del file
  `.inc` di Microchip (`NOT_RBPU`, `TMR0IE`…)
- Controlli di intervallo su letterali, registri, bit, destinazione, indirizzi e memoria programma
- `END` ferma la lettura come in MPASM; i caratteri (`'a'`) non vengono più resi maiuscoli

**Sicurezza:**
- Gli errori dell'assemblatore, che riportano l'operando così come scritto, erano inseriti come HTML:
  un file `.asm` con un tag `<img onerror>`, aperto da un utente loggato, eseguiva script nel sito

**Interfaccia:**
- La mini-toolbar va a capo invece di essere tagliata nei temi stretti e sul telefono
- Durante Run le porte si ridisegnano una volta per fotogramma, non a ogni scrittura su PORTB

**WordPress:**
- Updater 1.1.0: dopo l'aggiornamento riattiva il plugin solo se era attivo
- `Update URI` nell'intestazione: WordPress non può più proporre un plugin omonimo di wordpress.org
- Il `readme.txt` è stato rimosso: README e changelog stanno qui, come negli altri plugin

**Test:** 99 unit test (CPU, assemblatore, motore, comportamento dei 10 esempi) e 38 E2E nel browser
su desktop e telefono; CI a ogni push, run notturna su WordPress in sviluppo, rilascio automatico
dello ZIP al tag.

### 1.0.1
**Correzioni di 17 bug e allineamento allo standard dei plugin DB**

- Run, Step e Animate non partivano al primo click: un errore JavaScript bloccava ogni assemblaggio riuscito
- Il flag T0IF non veniva mai impostato, quindi gli interrupt del Timer0 non scattavano
- I breakpoint continuano a funzionare dopo un Reset
- Un CBLOCK senza ENDC segnala un errore invece di produrre in silenzio un programma vuoto
- Il valore di PORTA e PORTB mostrato tiene conto degli ingressi esterni, non solo del latch
- Le celle di memoria e i campi TRIS non vengono più azzerati mentre si scrivono
- Le scorciatoie da tastiera (F5, F11, Ctrl+S) non vengono più sottratte al resto della pagina
- Gli asset vengono caricati anche con temi a blocchi, widget e page builder
- Rimossa la dipendenza da Google Fonts: nessuna richiesta a domini esterni
- Aggiornamenti automatici dalle release GitHub

### 1.0.0
- Versione iniziale MVP

---

## Licenza

GPL v2 or later.  
Sei libero di utilizzare, modificare e distribuire questo plugin.

**Disclaimer:** questo progetto non è affiliato con Microchip Technology Inc. "PIC" e "MPLAB" sono
marchi registrati di Microchip Technology Inc.

---

## Autore

**Davide "the Prof." Bertolino**  
🌐 [davidebertolino.it](https://www.davidebertolino.it)  
✉️ info@davidebertolino.it
