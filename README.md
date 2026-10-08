# WebPicSimulator

Simulatore dei microcontrollori PIC16 nel browser: editor Assembly, assemblatore, debugger, periferiche
e hardware virtuale, più classi e consegne per la scuola.  
Niente MPLAB, niente programmatore, niente breadboard. Tutto nel tuo WordPress.

**Versione:** 3.2.0
**Autore:** [Davide Bertolino](https://www.davidebertolino.it)  
**Licenza:** GPL v2 or later  
**Richiede:** WordPress 5.8+, PHP 7.4+  
**GitHub:** [dadebertolino/pic-simulator](https://github.com/dadebertolino/pic-simulator)

---

## Cosa fa

### 🧠 22 PIC16 mid-range
- Le 35 istruzioni, con i cicli del chip: GOTO, CALL, RETURN e gli skip valgono 2 cicli, il salto
  al vettore di interrupt anche
- Memoria dati per banchi come sul datasheet: registri comuni a tutti i banchi, specchio dei GPR
  sul 16F84A, area comune 0x70-0x7F e registri ripetuti nei banchi 2 e 3 dei device a 4 banchi,
  indirizzamento indiretto con IRP:FSR che passa anche dalle periferiche
- Interrupt di INTCON e di periferica (PEIE, PIR/PIE), SLEEP con risveglio da INT, cambio su
  RB4-RB7, EEPROM e periferiche, anche con GIE = 0
- Periferiche: GPIO, Timer0 (con prescaler e conteggio per ciclo), Timer1, Timer2, CCP
  (capture, compare, PWM), USART, ADC, EEPROM dati, comparatori, MSSP (SPI e I²C master)
- EEPROM non volatile: il Reset la conserva, assemblare la riprogramma (0xFF + i dati di `DE`)
- Schede complete per **PIC16F84A, 16F628A e 16F877A**; gli altri 19 device usano le periferiche
  dichiarate nella loro scheda e gli indirizzi di famiglia (vedi *Limitazioni*)

### 🛠️ Assemblatore compatibile con MPASM
- Simboli del device scelto con `LIST P=` o `PROCESSOR`: registri, bit delle periferiche, EEPROM
  e PIR/PIE agli indirizzi giusti per ogni famiglia
- Il sorgente sceglie il device: un programma con `LIST P=16F877A` passa da solo al 16F877A
- Espressioni, `$`, `#define`, `EQU`/`SET`, `CBLOCK`, `BANKSEL` (anche RP1), `ORG`, `DW`, `DT`,
  `DE` in EEPROM, `__CONFIG`, etichette in stile MPASM, controlli di intervallo
- Errori in italiano con il numero di riga
- Esportazione Intel HEX (con la configuration word a 0x2007), file `.map` e `.asm`

### ▶️ Esecuzione e debug
- **Run** a tempo reale (un ciclo istruzione ogni 4 periodi di clock a 4 MHz) o rallentato a
  1/10, 1/100, 1/1000, o alla massima velocità; il tempo trascorso sul chip è nel footer
- **Animate** da 1 a 100 istruzioni al secondo, **Step**, **Step Over** (anche su subroutine da
  centinaia di migliaia di cicli, senza bloccare la pagina), **Step Out**, **Reset**
- Breakpoint dal margine dell'editor, registri, bit di STATUS, stack, memoria, watch, matrice degli
  interrupt, pannelli di timer, CCP, ADC, comparatori, MSSP e terminale seriale
- Pin delle porte cliccabili per simulare pulsanti e interruttori

### 🔌 Hardware virtuale
28 componenti collegati ai pin o ai bus del PIC, con pin e indirizzi configurabili: display a 7
segmenti, LCD HD44780 (8 bit, 4 bit, I²C), OLED SSD1306, GLCD KS0108, LED, strisce WS2812, pulsanti,
DIP switch, tastierino 4x4, servo, motori con L293D, cicalino, sensori di temperatura, umidità,
pressione e distanza, RTC, EEPROM 24C02, I/O expander, shift register, driver MAX7219, ADC MCP3008.
La configurazione si salva nel sorgente (`; @VHW:`). Elenco completo in *Hardware virtuale*.

### 📚 53 esempi pronti
Da LED Blink a LCD I²C, sensori, servo e strisce WS2812, ognuno con le istruzioni per l'hardware
virtuale da aggiungere. Ogni esempio è verificato da un test automatico.

### 🎓 Classi, consegne e progetti
- `[pic_dashboard]`: dashboard per docenti e studenti (richiede il login)
- Il docente crea classi con un codice di iscrizione, prepara un progetto modello e lo assegna
  con una scadenza; lo studente si iscrive col codice, inizia la consegna (riceve una copia del
  modello), lavora e la invia; il progetto si blocca e il docente lo valuta
- Docenti: utenti con ruolo Autore, Editore o Amministratore (capability `picsim_*` aggiunte
  all'attivazione). Studenti: qualunque utente registrato
- API REST `picsim/v1`; ogni rotta controlla chi può vedere o modificare classe, consegna e progetto

### 🔄 Aggiornamenti automatici
Il plugin controlla le Release su GitHub e propone l'aggiornamento dalla pagina Plugin, come quelli
di wordpress.org.

---

## Installazione

1. Scarica lo ZIP dell'ultima release da [GitHub](https://github.com/dadebertolino/pic-simulator/releases)
2. WordPress Admin → Plugin → Aggiungi nuovo → Carica plugin
3. Attiva **WebPicSimulator**
4. Crea una pagina con lo shortcode `[pic_simulator]`, e se servono classi e consegne una pagina
   con `[pic_dashboard]`

### Aggiornare dalla 3.1
La 3.1 non controllava GitHub, quindi la prima volta l'aggiornamento è manuale: Plugin → Aggiungi
nuovo → Carica plugin, scegli lo ZIP della 3.2 e conferma **Sostituisci la versione installata**.
Dalla 3.2 in poi gli aggiornamenti compaiono nella pagina Plugin.

**Non disinstallare** la 3.1 per installare la 3.2: la disinstallazione cancella le tabelle con
progetti, classi e consegne degli studenti (vedi *Privacy*).

---

## Shortcode

| Shortcode | Descrizione |
|---|---|
| `[pic_simulator]` | Il simulatore. Uno per pagina: un secondo mostra un avviso |
| `[pic_dashboard]` | Dashboard di progetti, classi e consegne (richiede il login) |
| `[pic_test_suite]` | Test interni del simulatore, nel browser |

Attributi di `[pic_simulator]`: `height` (default `800px`), `width` (`100%`), `max_width` (`none`),
`fullwidth="yes"` (tutta la larghezza della finestra), `theme` (`dark`). Lo stesso simulatore è
disponibile come blocco Gutenberg.

### Scorciatoie da tastiera

| Tasto | Azione |
|---|---|
| F5 | Assembla |
| Ctrl+F5 | Run / Stop |
| F6 | Animate |
| F7 / Esc | Stop |
| F8 / F11 | Step |
| Shift+F8 | Step Out |
| F10 | Step Over |
| F9 | Breakpoint sulla riga corrente |

---

## Device supportati

| Pin | Device |
|---|---|
| 18 | PIC16F83, F84, **F84A**, F627A, **F628A**, F648A, F818, F819, F1847 |
| 20 | PIC16F690 |
| 28 | PIC16F870, F872, F873A, F876A, F882, F883, F886 |
| 40 | PIC16F871, F874A, **F877A**, F884, F887 |

In grassetto i device con la scheda completa (mappa dei registri, bit, interrupt), verificati dai
test su ogni istruzione e periferica.

---

## Hardware virtuale

### Sui pin (GPIO)
7 segmenti (1 cifra, 4 cifre multiplexate), barra di LED, pulsanti, DIP switch, LCD HD44780 a 8 e 4
bit (da 8x1 a 40x4), LED RGB, cicalino, tastierino 4x4, servo RC, sensore a ultrasuoni HC-SR04,
striscia WS2812 (fino a 256 LED), doppio ponte H L293D, GLCD KS0108 128x64.

### I²C

| Device | Indirizzo | |
|---|---|---|
| 24C02 EEPROM | 0x50-0x53 | 256 byte, griglia esadecimale |
| LM75, TMP102, STTS751 | 0x48-0x4F | Temperatura |
| MCP9808 | 0x18-0x1F | Temperatura con tre soglie di allarme |
| BMP280 | 0x76/0x77 | Temperatura e pressione |
| SHT21 | 0x40 | Temperatura e umidità, CRC-8 |
| DS1307, DS3231 | 0x68 | RTC (DS3231 con allarmi e temperatura) |
| PCF8563 | 0x51 | RTC |
| PCF8574 | 0x20-0x27, 0x38-0x3F | I/O a 8 bit, backpack per LCD |
| MCP23017 | 0x20-0x27 | I/O a 16 bit |
| SSD1306 | 0x3C/0x3D | OLED 128x64 |

Gli RTC partono dall'ora del computer e avanzano con il tempo simulato.

### SPI (chip select configurabile, RA0 di default)
74HC595 (il pin di chip select fa da latch), MAX7219 (8 cifre), MCP3008 (ADC 10 bit, 8 canali).

### 1-Wire
DS18B20, su un pin a scelta, con scratchpad e registro degli eventi del bus.

---

## Esempi inclusi

| Categoria | Esempi |
|---|---|
| Base, I/O, interrupt | LED Blink, Knight Rider, Binary Counter, Button + LED, TMR0 Interrupt |
| EEPROM, aritmetica, avanzati | EEPROM Read/Write, 8-bit Addition, Multiply 8x8, Lookup Table, Stack Demo |
| Periferiche 628A | Serial Hello World, Serial Echo, PWM LED Dimmer, Timer1 Overflow, Voltage Comparator |
| Periferiche 877A | ADC Read, ADC Threshold, Multi-Port I/O, ADC + USART, Dual PWM |
| Hardware virtuale su GPIO | 7 segmenti, VU meter, pulsanti, DIP switch, LCD 8 e 4 bit, DS18B20, servo, HC-SR04, WS2812, KS0108, L293D, cicalino, tastierino, LED RGB |
| I²C | LCD, DS1307, 24C02, BMP280, LM75, SHT21, MCP23017, DS3231, MCP9808, TMP102, STTS751, PCF8563, SSD1306 |
| SPI | 74HC595, MAX7219, MCP3008 |

---

## Struttura cartelle

```
pic-simulator/
├── pic-simulator.php            # Plugin: asset, shortcode, blocco, REST, progetti AJAX, admin
├── uninstall.php                # Rimuove tabelle, opzioni e capability
├── includes/
│   ├── class-activator.php      # Tabelle, capability dei docenti, opzioni
│   ├── class-updater.php        # Aggiornamenti da GitHub Releases
│   ├── database/class-db-manager.php
│   ├── api/                     # REST picsim/v1: projects, files, classes, assignments
│   └── public/class-dashboard-controller.php   # [pic_dashboard]
├── templates/                   # simulator.php, test-suite.php
├── assets/
│   ├── css/                     # style.css, dashboard.css, test-suite.css
│   ├── data/                    # pic16-family.json e una scheda JSON per device
│   └── js/
│       ├── core/                # CPU, factory, assemblatore, motore, device loader
│       │   └── peripherals/     # GPIO, timer, CCP, USART, ADC, EEPROM, comparatori, MSSP, bus
│       │       └── devices/     # modelli dei device virtuali (I²C, SPI, 1-Wire, GPIO)
│       ├── ui/                  # moduli dell'interfaccia ed esempi (ui-manager.js)
│       │   └── vhw/             # componenti dell'hardware virtuale
│       └── *.js                 # dashboard, classi, consegne, progetti
└── tests/                       # unit (node:test) ed E2E (Playwright)
```

---

## Privacy

Nessuna richiesta a servizi esterni: niente font da CDN, niente analytics. Il simulatore gira nel
browser; il server riceve dati solo quando si salva un progetto o si usano classi e consegne.

Cosa resta sul server:
- **Classi, consegne e progetti** (`[pic_dashboard]`): tabelle `picsim_*` nel database, legate
  all'utente WordPress (iscrizioni alle classi, sorgenti dei progetti, voti e note del docente)
- **Progetti salvati dal simulatore** (pulsante Save): file JSON in
  `wp-content/uploads/pic-simulator-projects/`, una cartella per utente con un hash nel nome;
  ognuno legge solo i propri
- La cache dell'updater

Disinstallando il plugin si cancellano tabelle, opzioni e capability; la cartella
`pic-simulator-projects` resta e va rimossa a mano.

---

## Limitazioni

Questo è un simulatore didattico:
- Non sostituisce MPLAB X né un programmatore reale
- Solo 84A, 628A e 877A hanno la scheda completa: sugli altri device registri e bit che non
  stanno nella scheda o negli indirizzi di famiglia possono mancare, e le periferiche più recenti
  (per esempio i comparatori di 16F690 e 16F88x, il core enhanced del 16F1847) non sono fedeli
- Il watchdog timer non è implementato: un programma senza `CLRWDT` non viene resettato
- I tempi sono a livello di ciclo istruzione, senza i quattro quarti di ciclo (Q1-Q4); la scrittura
  in EEPROM e le trasmissioni I²C sono istantanee
- L'uscita PWM del CCP non pilota il pin: il duty si legge nel pannello CCP
- L'assemblatore non supporta macro, `#include` di file e compilazione condizionale
- Un solo simulatore per pagina

---

## Accessibilità (WCAG 2.1 AA)

Verificata con axe-core negli E2E: simulatore appena aperto, con errori di assemblaggio, in
esecuzione con breakpoint, con i pannelli delle periferiche e l'hardware virtuale, su desktop e su
telefono.

- Contrasto del testo ≥ 4,5:1, compresi valori dei registri, bit di STATUS accesi, messaggi e
  pannello errori
- Nome accessibile per tutti i controlli: select di device, velocità ed esempi, slider di Animate,
  ADC e comparatori, componente virtuale
- Memoria, terminale seriale e log MSSP raggiungibili da tastiera
- Su telefono testata e toolbar vanno a capo; nessuno scorrimento orizzontale

---

## Note tecniche

- **Tutto lato client**: CPU, periferiche, assemblatore e motore sono classi JavaScript senza
  dipendenze; il PHP registra asset, shortcode, blocco, pagina admin e API REST
- **Periferiche pluggabili**: ogni periferica registra i suoi indirizzi e riceve un tick per ciclo
  istruzione; `PIC16Factory` le crea dalla scheda JSON del device, `DeviceLoader.memoryLayout()`
  fornisce gli indirizzi che dipendono dalla famiglia (EEPROM, PIR/PIE, specchi della RAM)
- **Tempo reale**: a ogni tick (~60 al secondo) il motore esegue i cicli che il chip avrebbe eseguito
  nel tempo trascorso, con un tetto di 10 ms di calcolo per tick; se il browser resta indietro lo
  segnala invece di accumulare ritardo
- **Asset**: caricati solo nelle pagine che contengono lo shortcode o il blocco, anche da widget e
  page builder
- **Sicurezza**: nonce e capability su REST e AJAX, controllo di proprietà su classi, consegne,
  progetti e file; gli errori dell'assemblatore sono inseriti come testo, mai come HTML
- **Auto-updater**: controlla GitHub Releases ogni 12h; `Update URI` impedisce che WordPress proponga
  un plugin omonimo di wordpress.org

### Sviluppo

- `npm test`: unit test di CPU, assemblatore, motore e di ognuno dei 53 esempi (`tests/unit/`, solo
  Node)
- `npm run check-js`: sintassi dei file in `assets/js` e degli script inline nei file PHP
- `composer install && composer phpcs`: WordPress Coding Standards e compatibilità con PHP 7.4+

Test nel browser (Playwright): `npm ci`, `npx wp-env start`, `npm run env:setup`,
`npx playwright test`. Senza Docker, `npm run env:playground` avvia WordPress Playground sulla
stessa porta.

La CI esegue a ogni push sintassi PHP 7.4–8.5, PHPCS, il controllo JavaScript, gli unit test e gli
E2E; ogni notte gli E2E contro WordPress in sviluppo e PHP 8.4. Dettagli in [TESTING.md](TESTING.md).
Un tag `vX.Y.Z` pubblica la release solo se la CI passa, se tag, header `Version` e `PIC_SIM_VERSION`
coincidono e se il README ha la voce `### X.Y.Z`; lo ZIP allegato contiene la cartella
`pic-simulator/` senza test e file di sviluppo.

### Aggiungere un device virtuale

1. Il modello in `assets/js/core/peripherals/devices/` (`i2c-*.js`, `spi-*.js`, `gpio-*.js`): per
   l'I²C si collega a `mssp.i2cBus`, per l'SPI a `mssp.spiBus.attach(device, { port, pin })`
2. Il componente dell'interfaccia in `assets/js/ui/vhw/`
3. In `pic-simulator.php` il nome nelle liste dei file da caricare
4. In `ui-virtual-hw.js` i campi del dialogo (`_getDefaults()`) e il caso in `addComponent()`;
   nel template l'`<option>` del menu
5. Un test in `tests/unit/examples.test.js` se c'è un esempio che lo usa

---

## Changelog

### 3.2.0
**Una sola versione: la 3.x del sito su GitHub, con le correzioni e i test della 1.x**

La 3.1.0 era sviluppata fuori da git e pubblicata solo sul sito; GitHub aveva la linea 1.x, con il
solo 16F84A. La 3.2.0 parte dalla 3.1.0 e porta dentro le correzioni della 1.2.0, poi corregge i
difetti trovati scrivendo un test per ogni istruzione, periferica ed esempio.

**Allineamento:**
- Licenza GPL v2 or later (era indicata MIT), aggiornamenti da GitHub Releases, `Update URI`
- Progetti salvati dal simulatore: la cartella era comune e qualunque utente loggato poteva
  leggere, sovrascrivere e cancellare quelli di tutti; ora una cartella per utente
- Niente Google Fonts; asset caricati anche da blocchi, widget e page builder
- Ripristinati i caratteri accentati corrotti in 14 file

**Motore** (verificato su 16F84A, 16F628A e 16F877A):
- Il flag Z non veniva mai impostato (Knight Rider e ogni confronto sbagliavano)
- Timer0 non segnalava mai l'overflow (T0IF); ora conta per ciclo, resta fermo due cicli dopo una
  scrittura e non conta in SLEEP
- Nessun interrupt di periferica: mancavano PEIE e PIR/PIE
- EEPROM agli indirizzi del 16F84A su tutti i device: sul 16F877A occupava PORTD/PORTE/TRISD/TRISE;
  la fine scrittura accendeva INTE
- Mappa della memoria: specchio dei GPR del 84A, area comune, registri dei banchi 2 e 3, INDF
  attraverso le periferiche, PCL con PCLATH<4:0>
- SLEEP: risveglio con GIE = 0, istruzione dopo SLEEP eseguita prima del vettore; INTF e RBIF si
  alzano anche a interrupt disabilitato, RBIF solo dai pin in ingresso
- Run a tempo reale (prima 1000 istruzioni al secondo: minuti tra un cambio di LED e l'altro),
  Step Over asincrono, EEPROM che sopravvive al Reset
- Periferiche appena create senza reset: TRIS e OPTION_REG restavano a 0 fino al primo assemblaggio

**Assemblatore:**
- Nucleo della 1.x: espressioni, `$`, `#define`, etichette MPASM, controlli di intervallo, DE in EEPROM
- Mancavano i bit delle periferiche (GO, SSPIF, RCIF...): 20 esempi su 53 non si assemblavano
- Sul 16F877A PORTB valeva 0x106 e STATUS 0x183, e `BANKSEL STATUS` sceglieva il banco 3
- Nell'Intel HEX ogni NOP diventava 0x3FFF

**Hardware virtuale**: con la 3.1 nessun esempio I²C o SPI poteva funzionare.
- La MSSP non creava i bus e i componenti non si collegavano
- SPI: nessun device veniva selezionato; ora c'è il chip select (fronte di salita = latch)
- I²C: dopo un indirizzo in lettura il programma restava bloccato (bit R/W di SSPSTAT)
- RTC avanzati a ogni aggiornamento dell'interfaccia invece che col tempo simulato
- 1-Wire: il bit letto era quello dello slot successivo; il DS18B20 ora legge la temperatura
- MCP23017, PWM (CCPRxL), comparatori (modi del datasheet, CMIF), WS2812, servo
- LCD: si perdevano gli impulsi di EN a velocità reale; l'LCD I²C si fermava al primo comando
- Cambiando device i componenti restano collegati alla CPU nuova

**Esempi**: corretti Voltage Comparator, 7-Seg 4-Digit MUX (si bloccava alla terza cifra), LCD
I²C, LED Bar VU Meter, Servo Sweep e Servo + ADC (tempi tre volte più lunghi), Keypad Scanner.

**Interfaccia**: select della velocità di Run, cursore di Animate, tempo simulato, Step Over; un
programma con `LIST P=` sceglie il device; layout su telefono; accessibilità WCAG 2.1 AA; un
secondo simulatore nella stessa pagina mostra un avviso.

**Didattica**: l'elenco degli studenti di una classe dava id 0 a tutti (le azioni del docente su
uno studente non funzionavano).

**Test:** 250 unit test (ogni istruzione e periferica sui tre device, assemblatore, motore, ognuno
dei 53 esempi con il suo hardware virtuale) e 61 E2E (simulatore, hardware virtuale, accessibilità,
telefono, classi e consegne via REST con docenti e studenti, dashboard).

### 3.1.0 (marzo 2026)
- Hardware virtuale: 28 componenti con pin configurabili, 25 device virtuali su I²C, SPI, 1-Wire e GPIO
- Bus 1-Wire, display grafici SSD1306 e KS0108, servo, L293D, cicalino, tastierino, HC-SR04,
  WS2812, LED RGB, sensori e RTC I²C
- 53 esempi in 16 categorie; configurazione dell'hardware virtuale salvata nel sorgente
- Export `.asm` con la configurazione, duplicazione dei componenti, controllo degli indirizzi I²C

### 3.0.0 (gennaio 2026)
- Periferiche pluggabili, 22 device PIC16, assemblatore multi-device, RAM a 4 banchi
- Interfaccia a moduli, `__CONFIG` nell'Intel HEX, test suite nel browser
- Dashboard con progetti, classi e consegne, API REST

### Linea 1.x (solo PIC16F84A)
La 1.0.0–1.2.0, pubblicata su GitHub, confluisce nella 3.2.0: assemblatore riscritto, Run a tempo
reale, interfaccia accessibile e impianto di test e CI.

---

## Licenza

GPL v2 or later. Vedi [LICENSE](LICENSE).

---

## Autore

**Davide Bertolino**  
[www.davidebertolino.it](https://www.davidebertolino.it)
