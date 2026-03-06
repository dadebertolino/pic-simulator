# WebPicSimulator - Esempi Didattici

Questa cartella contiene 10 programmi di esempio per imparare
la programmazione Assembly del PIC16F84A.

## Elenco Esempi

### Livello Principiante

| # | File | Descrizione | Concetti |
|---|------|-------------|----------|
| 1 | `01_blink_led.asm` | LED lampeggiante | Output, loop ritardo, BSF/BCF |
| 2 | `02_binary_counter.asm` | Contatore binario 0-255 | INCF, output multi-bit |
| 3 | `03_button_led.asm` | Pulsante controlla LED | Input, BTFSC/BTFSS |

### Livello Intermedio

| # | File | Descrizione | Concetti |
|---|------|-------------|----------|
| 4 | `04_knight_rider.asm` | LED scorrevole | RLF/RRF, flag Carry |
| 8 | `08_lookup_table.asm` | Tabella 7-segmenti | RETLW, PCL, computed GOTO |
| 9 | `09_subroutines_stack.asm` | Subroutine annidate | CALL/RETURN, Stack |
| 10 | `10_state_machine.asm` | Semaforo | Macchina a stati |

### Livello Avanzato

| # | File | Descrizione | Concetti |
|---|------|-------------|----------|
| 5 | `05_timer0_interrupt.asm` | Timer0 con interrupt | TMR0, ISR, GIE/T0IE |
| 6 | `06_external_interrupt.asm` | Interrupt su RB0 | INT, INTE/INTF |
| 7 | `07_eeprom.asm` | Lettura/Scrittura EEPROM | EEDATA, EECON1/2 |

## Come Usare gli Esempi

1. Apri il simulatore in WordPress
2. Clicca **Load** nella toolbar
3. Seleziona uno dei file `.asm`
4. Clicca **Assembla**
5. Usa **Run**, **Animate** o **Step** per eseguire

## Suggerimenti

- Usa **Animate** per vedere l'esecuzione passo-passo visivamente
- Usa **Step** (F8) per esaminare ogni istruzione
- Guarda i pannelli laterali per vedere:
  - **Registers**: W, PC, STATUS, TMR0...
  - **I/O Ports**: stato dei pin (clicca per simulare input)
  - **Stack**: chiamate a subroutine
  - **Memory**: contenuto RAM/EEPROM

## Note sul Simulatore

- I pin configurati come **INPUT** (bordo giallo) possono essere cliccati
- I pin configurati come **OUTPUT** (bordo blu) mostrano lo stato
- Il colore verde indica un livello HIGH (1)
- Il colore scuro indica un livello LOW (0)

## Autore

Prof. D. Bertolino
