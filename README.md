# WebPicSimulator v3.1.0

Simulatore web-based per microcontrollori **PIC16 mid-range**, plugin WordPress per uso didattico.

**140 file · 322K · 35.000+ righe di codice · 53 esempi ASM**

## Caratteristiche principali

- **22 PIC16** supportati (F83 → F887, F1847)
- **35 istruzioni** mid-range completamente emulate, 4-bank RAM, INDF 9-bit
- **13 periferiche core**: GPIO, TMR0/1/2, CCP/PWM, USART, ADC, EEPROM, Comparator, MSSP (SPI+I²C), bus 1-Wire
- **25 device virtuali** su 4 bus (I²C, SPI, 1-Wire, GPIO)
- **28 componenti Virtual Hardware** con pin configurabili
- **53 esempi ASM** pronti, da LED Blink a LCD I²C a WS2812 NeoPixel
- **Assembler integrato** con simboli automatici, __CONFIG, export .hex/.map
- **UI modulare** con 17 moduli e pannelli collassabili

## Requisiti

- WordPress 5.8+
- PHP 7.4+
- Browser moderno (Chrome, Firefox, Edge, Safari)

## Installazione

1. Scaricare `pic-simulator.zip`
2. WordPress Admin → Plugin → Aggiungi nuovo → Carica plugin
3. Attivare "WebPicSimulator"
4. Creare una pagina con lo shortcode `[pic_simulator]`

## Shortcode

| Shortcode | Descrizione |
|---|---|
| `[pic_simulator]` | Simulatore completo |
| `[pic_test_suite]` | Test suite automatica (22 test) |
| `[pic_dashboard]` | Dashboard progetti (fase futura) |

## Device PIC16 supportati (22)

**18-pin:** PIC16F83, F84, F84A, F627A, F628A, F648A, F818, F819, F1847
**20-pin:** PIC16F690
**28-pin:** PIC16F870, F872, F873A, F876A, F882, F883, F886
**40-pin:** PIC16F871, F874A, F877A, F884, F887

## Periferiche core (13)

| Periferica | Pannello UI |
|---|---|
| GPIO (A-E, 3-8 pin) | LED, switch, altFunc tooltip |
| TMR0 (8-bit, prescaler) | Timer panel con flags |
| TMR1 (16-bit, prescaler) | Timer panel |
| TMR2 (8-bit, PR2, postscaler) | Timer panel + barra progresso |
| CCP1/CCP2 (Capture/Compare/PWM) | Duty cycle bar |
| USART (TX/RX asincrono) | Terminale seriale virtuale |
| ADC (10-bit, 5-14 canali) | Slider potenziometri |
| EEPROM (64-256 byte) | Memory viewer |
| Comparatore (doppio, Vref) | LED uscite + slider tensione |
| MSSP (SPI + I²C master/slave) | Bus log colorato + device list |
| Bus I²C/SPI virtuali | Device esterni collegabili |
| Bus 1-Wire virtuale | Timing detection, ROM commands |

## Virtual Hardware — 28 componenti

### GPIO diretto

| Componente | Descrizione |
|---|---|
| 7-Segment (1 digit) | SVG, configurabile porta/bit/type (CC/CA) |
| 7-Segment (4 digit MUX) | Multiplexing con latch, active low/high |
| LED Bar | 1-8 LED, colore scelto (rosso/verde/giallo/blu) |
| Push Buttons | 1-8 pulsanti momentanei, touch support |
| DIP Switch | 1-8 switch toggle |
| LCD HD44780 (8-bit) | Dimensioni 8x1→40x4, debug HD44780 con command log |
| LCD HD44780 (4-bit) | Nibble sequencing, stessi display variabili |
| RGB LED | Pallino colorato con glow, barre R/G/B, hex code |
| Buzzer/Speaker | Nota musicale MIDI, frequenza Hz |
| Keypad 4x4 | Griglia cliccabile, scansione righe/colonne |
| RC Servo | SVG con lancetta rotante, pulse width, angolo 0-180° |
| HC-SR04 Ultrasonic | Slider distanza 2-400cm, barra colorata, echo timing |
| WS2812 NeoPixel Strip | 1-256 LED RGB, griglia configurabile (ledsPerRow), glow |
| L293D H-Bridge | 2 motori DC con disco rotante, velocità PWM %, direzione |
| KS0108 GLCD 128x64 | Canvas pixel, colore verde/blu/bianco |

### I²C

| Device | Indirizzo | Descrizione |
|---|---|---|
| 24C02 EEPROM | 0x50-0x53 | Griglia 16x16 hex, bytes usati evidenziati |
| LM75 | 0x48-0x4F | Termometro 9-bit con slider |
| TMP102 | 0x48-0x4B | 12-bit, alert threshold |
| STTS751 | 0x48-0x4F | 12-bit ST, manufacturer ID |
| MCP9808 | 0x18-0x1F | 13-bit, 3 soglie alert (upper/lower/critical) con badge colorati |
| BMP280 | 0x76/0x77 | Temp + pressione, slider, registri calibrazione, debug panel |
| SHT21 | 0x40 | Temp + umidità, CRC-8, doppio slider |
| DS1307 RTC | 0x68 | Orologio digitale, registri BCD, Sync/Start-Stop |
| DS3231 RTC | 0x68 | 2 allarmi, temperatura interna, retrocompatibile DS1307 |
| PCF8563 RTC | 0x51 | NXP, VL bit, alarm flag, timer countdown |
| PCF8574 I/O | 0x27/0x3F | Backpack LCD I²C (modulo Amazon) |
| MCP23017 | 0x20-0x23 | 16-bit I/O, 2 porte, pin con direzione visualizzata |
| SSD1306 OLED | 0x3C/0x3D | Canvas 128x64, pixel scale 1-3x, command log |

### SPI

| Device | Descrizione |
|---|---|
| 74HC595 | 8 LED output, shift/latch register hex |
| MAX7219 | 8 digit 7-seg, intensity/scan/shutdown, BCD decode |
| MCP3008 | 8 canali ADC 10-bit con slider |

### 1-Wire

| Device | Descrizione |
|---|---|
| DS18B20 | Scratchpad viewer, bus event log, ROM code, risoluzione 9-12 bit |

## Esempi ASM (53)

| Categoria | Esempi |
|---|---|
| Basic | LED Blink, Knight Rider, Binary Counter |
| I/O | Button + LED |
| Interrupts | TMR0 Interrupt |
| EEPROM | Read/Write interno |
| Arithmetic | 8-bit Addition, Multiply 8x8 |
| Advanced | Lookup Table, Stack Demo |
| USART | Serial Hello World, Serial Echo |
| ADC | Read Channel 0, Threshold |
| CCP/PWM | PWM LED Dimmer |
| Timers | Timer1 Overflow |
| Comparator | Voltage Comparator |
| 877A | Multi-Port I/O, ADC + USART, Dual PWM |
| Virtual HW | 7-Seg Counter, 7-Seg 4D MUX, LED Bar VU, Buttons+LEDs, DIP+7Seg, LCD 8-bit, LCD 4-bit, LCD I²C, Servo Sweep, Servo+ADC, HC-SR04, WS2812 RGB, L293D Motors, Buzzer Melody, Keypad Scanner, RGB Color Cycle, KS0108 GLCD |
| I²C Devices | DS1307 RTC, DS3231 RTC+Temp, PCF8563 RTC, EEPROM 24C02, LM75, TMP102, STTS751, MCP9808 Alerts, BMP280, SHT21, MCP23017 I/O, SSD1306 OLED |
| SPI Devices | 74HC595 Shift Reg, MAX7219 8-Digit, MCP3008 ADC |
| 1-Wire | DS18B20 Read Temp |

## Funzionalità simulatore

- **Editor**: gutter unificata (breakpoint + numeri riga/indirizzi), scroll sincronizzato, Tab indent
- **Breakpoint**: click sulla gutter, lista breakpoints, rimozione individuale
- **Debug**: Step Into/Over/Out, Run, Animate, Reset
- **Build report**: toast popup con Flash/RAM/EEPROM/Stack usage, overflow detection
- **Stack**: overflow/underflow runtime con warning e stop automatico
- **Memory viewer**: 4 tab (RAM, Program, EEPROM, Variables CBLOCK)
- **Config VHW in ASM**: `; @VHW: type {config}` salvato/caricato automaticamente
- **Export**: .hex (Intel HEX con __CONFIG), .map (disassembly), .asm (con VHW config)

## Struttura file

```
pic-simulator/                     # 140 file
├── pic-simulator.php              # Plugin principale v3.1.0
├── README.md
├── uninstall.php
│
├── includes/                      # PHP backend
│   ├── class-activator.php
│   ├── class-deactivator.php
│   ├── database/class-db-manager.php
│   ├── api/ (projects, files, classes, assignments)
│   └── public/class-dashboard-controller.php
│
├── templates/
│   ├── simulator.php              # Template simulatore
│   ├── test-suite.php
│   └── dashboard.php
│
├── assets/
│   ├── css/style.css              # 3.448 righe
│   ├── data/devices/              # 22 JSON PIC16
│   │
│   └── js/
│       ├── core/                  # Engine (7 file)
│       │   ├── pic16-core.js      # CPU, istruzioni, RAM, stack
│       │   ├── pic16-factory.js   # Factory device → CPU + periferiche
│       │   ├── assembler.js       # ASM → 14-bit machine code
│       │   ├── simulator.js       # Controller esecuzione
│       │   ├── device-loader.js   # Carica JSON device
│       │   ├── pic16-peripherals.js
│       │   ├── storage-wp.js
│       │   │
│       │   └── peripherals/       # 13 moduli periferiche
│       │       ├── gpio.js, tmr0.js, tmr1.js, tmr2.js
│       │       ├── ccp.js, usart.js, adc.js, eeprom.js
│       │       ├── comparator.js, mssp.js
│       │       ├── virtual-bus.js, virtual-devices.js
│       │       ├── onewire-bus.js
│       │       │
│       │       └── devices/       # 25 device virtuali
│       │           ├── i2c-*.js   (15 file: sensori, RTC, EEPROM, I/O, OLED)
│       │           ├── spi-*.js   (3 file: 74HC595, MAX7219, MCP3008)
│       │           ├── ow-*.js    (1 file: DS18B20)
│       │           └── gpio-*.js  (6 file: servo, HC-SR04, WS2812, KS0108, L293D, buzzer, keypad, RGB)
│       │
│       ├── ui/                    # 17 moduli UI
│       │   ├── ui-manager.js      # Coordinatore + 53 esempi
│       │   ├── ui-editor.js       # Editor + gutter + breakpoints
│       │   ├── ui-toolbar.js      # Controlli + shortcuts
│       │   ├── ui-virtual-hw.js   # Framework Virtual Hardware
│       │   └── ui-*.js            # Registri, porte, memory, timers, etc.
│       │
│       └── ui/vhw/                # 28 componenti Virtual Hardware
│           ├── vhw-7seg.js, vhw-lcd.js, vhw-led-bar.js, vhw-buttons.js
│           ├── vhw-rtc.js, vhw-ds3231.js, vhw-pcf8563.js
│           ├── vhw-eeprom.js, vhw-bmp280.js, vhw-lm75.js, vhw-sht21.js
│           ├── vhw-tmp102.js, vhw-stts751.js, vhw-mcp9808.js
│           ├── vhw-mcp23017.js, vhw-74hc595.js, vhw-max7219.js, vhw-mcp3008.js
│           ├── vhw-ds18b20.js, vhw-servo.js, vhw-hcsr04.js
│           ├── vhw-ws2812.js, vhw-ssd1306.js, vhw-ks0108.js
│           ├── vhw-l293d.js, vhw-buzzer.js, vhw-keypad.js, vhw-rgb-led.js
```

## Keyboard shortcuts

| Tasto | Azione |
|---|---|
| F5 | Assembla |
| Ctrl+F5 | Run/Stop |
| F6 | Animate |
| F7 / Esc | Stop |
| F8 | Step Into |
| Shift+F8 | Step Out |
| F10 | Step Over |

## Aggiungere un nuovo device virtuale

1. Creare `assets/js/core/peripherals/devices/i2c-newdevice.js` (device class)
2. Creare `assets/js/ui/vhw/vhw-newdevice.js` (UI component)
3. In `pic-simulator.php`: aggiungere nome ai array `$device_files` e `$vhw_files`
4. In `ui-virtual-hw.js`: aggiungere entry in `_getDefaults()`, case in `addComponent()`
5. In `simulator.php`: aggiungere `<option>` nel dropdown

## Licenza

MIT — Prof. D. Bertolino

## Changelog

### v3.1.0 (Marzo 2025)
- **Virtual Hardware**: 28 componenti con pin configurabili e dialog di configurazione
- **25 device virtuali** su I²C (15), SPI (3), 1-Wire (1), GPIO (6)
- **Architettura modulare**: 1 file per device, 1 file per UI, enqueue automatico
- **Bus 1-Wire** con timing detection per DS18B20
- **Display grafici**: SSD1306 OLED 128x64 (I²C), KS0108 GLCD 128x64 (parallelo)
- **Attuatori**: RC Servo (SVG rotante), L293D DC Motors (dual H-bridge), Buzzer
- **Input**: Keypad 4x4 (cliccabile), HC-SR04 Ultrasonic (slider distanza)
- **LED**: WS2812 NeoPixel (griglia configurabile fino a 256), RGB LED
- **Sensori I²C**: LM75, TMP102, STTS751, MCP9808, BMP280, SHT21
- **RTC I²C**: DS1307, DS3231 (allarmi + temp), PCF8563
- **53 esempi ASM** in 16 categorie
- **Salvataggio config VHW** nel sorgente ASM (tag `; @VHW:`)
- **Export .asm** con configurazione VHW incorporata
- **Duplicate [+]** button su ogni componente
- **Conflict check** indirizzi I²C con warning
- Fix: gutter editor unificata, breakpoint event delegation, toast build report
- Fix: statistiche compilazione corrette per device, stack overflow runtime

### v3.0.0 (Gennaio 2025)
- Architettura periferiche pluggabili
- 22 device PIC16 supportati
- 12 periferiche simulate
- UI modulare (16 moduli)
- Assembler multi-device
- Supporto 4 bank RAM
- __CONFIG nell'export .hex
- Test suite automatica
