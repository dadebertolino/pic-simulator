# WebPicSimulator

**Simulatore PIC16F84A per WordPress**

Un plugin didattico che simula un microcontrollore Microchip PIC16F84A direttamente nel browser. Editor Assembly, assemblatore, debugger con breakpoint e pannelli di ispezione. Nessuna toolchain da installare, nessun hardware richiesto.

**Versione:** 1.0.1  
**Autore:** Davide Bertolino  
**Licenza:** GPL v2 or later  
**Richiede WordPress:** 5.8+  
**Richiede PHP:** 7.4+  

---

## Descrizione

WebPicSimulator porta la programmazione dei microcontrollori in classe senza MPLAB, senza programmatore e senza breadboard. Lo studente scrive Assembly nell'editor, assembla, e vede il programma girare istruzione per istruzione con registri, memoria e pin sotto gli occhi.

Tutto avviene lato client: nessun dato lascia il browser, nessuna chiamata a servizi esterni. Il simulatore riproduce il comportamento del chip reale — banking della RAM, latch di porta distinti dai livelli sui pin, prescaler del Timer0, vettore di interrupt a 0x004, stack hardware a 8 livelli che avvolge.

---

## Caratteristiche

### Core PIC16F84A
- Set di istruzioni completo a 14 bit
- 1K di memoria programma, 68 byte di GPR, 64 byte di EEPROM
- Banking Bank 0/Bank 1 con indirizzamento indiretto via INDF/FSR
- Stack hardware a 8 livelli
- Timer0 con prescaler configurabile e clock interno o esterno (RA4/T0CKI)
- Interrupt: Timer0, INT esterno su RB0, cambio su RB4-RB7, fine scrittura EEPROM
- EEPROM con la sequenza di sblocco 0x55/0xAA

### Assemblatore
- Due passate con risoluzione delle etichette in avanti
- Etichette con i due punti (`LOOP:`) o in colonna 1 senza (`LOOP`), come in MPASM
- Direttive ORG, EQU, SET, CBLOCK/ENDC (anche `A, B, BUF:4`), DW, DT (anche stringhe), DE, DATA, RES, BANKSEL, RADIX, END
- `#define` come sostituzione testuale, anche per coppie registro/bit (`#define LED PORTB,0`)
- Espressioni negli operandi e nelle direttive: `+ - * / << >> & | ^ ~`, parentesi, `HIGH`/`LOW` e `$` (indirizzo corrente)
- Letterali esadecimali, binari, ottali, decimali e carattere in tutte le notazioni MPASM; radice predefinita decimale
- `DE` a partire da `ORG 0x2100` precarica la EEPROM
- Errori riportati riga per riga, evidenziati nell'editor: simboli non definiti, numeri malformati e valori fuori intervallo (letterali, bit, indirizzi, memoria programma) non vengono mai convertiti in silenzio
- Disassemblatore, usato nella vista Programma

### Debugger
- Run, Step, Step Over, Animate e Reset, con velocità regolabile
- Breakpoint cliccabili sui numeri di riga
- Pannelli: Registri, bit di STATUS, Stack, Memoria (RAM/Programma/EEPROM), TMR0
- Celle di RAM ed EEPROM editabili a mano durante l'esecuzione
- Pin di ingresso cliccabili per simulare pulsanti e segnali esterni
- Vista Programma con disassemblato e istruzione corrente evidenziata

### Uso in classe
- 10 esempi progressivi, dal blink LED alla macchina a stati
- Load e Save dei sorgenti `.asm` dal PC locale
- Modalità a schermo intero
- Scorciatoie da tastiera, attive solo quando il simulatore ha il focus

---

## Installazione

1. Carica la cartella `pic-simulator` in `/wp-content/plugins/`
2. Attiva il plugin dal menu **Plugin** in WordPress
3. Inserisci lo shortcode `[pic_simulator]` in una pagina

Gli aggiornamenti successivi arrivano dalle release GitHub e compaiono nella pagina Plugin come per ogni altro plugin.

### Shortcode

```
[pic_simulator]
[pic_simulator height="600px" fullwidth="yes"]
```

| Attributo | Default | Descrizione |
|-----------|---------|-------------|
| `height` | `800px` | Altezza del simulatore |
| `fullwidth` | `no` | Con `yes` si espande a tutta la larghezza della finestra |

È possibile inserire **un solo simulatore per pagina**: l'interfaccia usa identificatori fissi.

---

## Scorciatoie

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

## Struttura

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
│       ├── simulator.js     # Motore di esecuzione e breakpoint
│       └── ui.js            # Controller dell'interfaccia
├── templates/
│   ├── simulator.php        # Template HTML del simulatore
│   └── admin/
│       └── settings.php     # Pagina informazioni
├── examples/                # 10 programmi Assembly didattici
└── tests/                   # Unit (node:test) ed E2E (Playwright), esclusi dallo ZIP
```

Test, CI e rilascio sono descritti in [TESTING.md](TESTING.md).

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

## Privacy

Nessuna richiesta a servizi esterni: niente font da CDN, niente analytics, niente chiamate di rete durante l'uso. Il plugin non scrive nulla nel database, a parte la cache dell'updater.

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

## Licenza

GPL v2 or later

Sei libero di utilizzare, modificare e distribuire questo plugin.

**Disclaimer:** Questo progetto non è affiliato con Microchip Technology Inc. "PIC" e "MPLAB" sono marchi registrati di Microchip Technology Inc.

---

## Autore

**Davide "the Prof." Bertolino**

- 🌐 [www.davidebertolino.it](https://www.davidebertolino.it)
- ✉️ info@davidebertolino.it
