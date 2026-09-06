=== WebPicSimulator ===
Contributors: dadebertolino
Tags: pic, microcontroller, simulator, assembly, education
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Simulatore PIC16F84A per il browser: scrivi, assembla ed esegui Assembly senza installare nulla.

== Description ==

**WebPicSimulator** permette di scrivere, assemblare e simulare codice Assembly per microcontrollori PIC16F84A direttamente nel browser, senza toolchain da installare e senza hardware.

Nato per l'uso didattico negli istituti tecnici, gira interamente lato client: nessun dato lascia il browser dello studente.

= Funzionalita = 

* Core PIC16F84A completo: CPU, RAM, EEPROM, stack a 8 livelli, Timer0 con prescaler, interrupt
* Assembler a due passate con etichette, direttive (ORG, EQU, CBLOCK, DT, DW) e segnalazione errori riga per riga
* Editor integrato con numeri di riga, indirizzi e breakpoint cliccabili
* Esecuzione Run, Step, Step Over, Animate e Reset, con velocita' regolabile
* Pannelli: Registri, bit di STATUS, Stack, Memoria (RAM/Programma/EEPROM), PORTA/PORTB, TMR0
* Pin di ingresso cliccabili per simulare pulsanti e segnali esterni
* Load e Save dei sorgenti .asm dal PC locale
* 10 esempi didattici progressivi, dal blink LED alla macchina a stati

= Privacy = 

Nessuna richiesta a servizi esterni: niente font da CDN, niente analytics, niente chiamate di rete. La simulazione avviene interamente nel browser.

== Installation ==

1. Carica la cartella `pic-simulator` in `/wp-content/plugins/`
2. Attiva il plugin dal menu 'Plugin' in WordPress
3. Usa lo shortcode `[pic_simulator]` in qualsiasi pagina

Gli aggiornamenti successivi arrivano dalle release GitHub e compaiono nella pagina Plugin come per ogni altro plugin.

== Frequently Asked Questions ==

= Posso inserire due simulatori nella stessa pagina? =

No. L'interfaccia usa identificatori fissi, quindi due istanze si romperebbero a vicenda: il secondo shortcode mostra un avviso al posto del simulatore.

= Serve una connessione a internet? =

Solo per caricare la pagina. La simulazione, l'assemblaggio e il caricamento degli esempi avvengono senza servizi esterni.

= Quali direttive Assembly sono supportate? =

ORG, EQU, CBLOCK/ENDC, DW, DT, DE, DATA, RES. LIST, PROCESSOR, __CONFIG, RADIX e END vengono accettate e ignorate.

== Changelog ==

= 1.0.1 =
* Corretto un errore che impediva a Run/Step/Animate di partire al primo click
* Corretto l'overflow di TMR0: il flag T0IF non veniva mai impostato e gli
  interrupt del Timer0 non scattavano
* I breakpoint continuano a funzionare dopo un Reset
* Segnalato come errore un CBLOCK senza ENDC, che prima produceva in silenzio
  un programma vuoto
* Il valore di PORTA/PORTB mostrato tiene conto degli ingressi esterni
* Le celle di memoria e i campi TRIS non vengono piu' azzerati mentre si scrivono
* Le scorciatoie da tastiera (F5, F11, Ctrl+S) non vengono piu' sottratte al
  resto della pagina
* Gli asset vengono caricati anche con temi a blocchi, widget e page builder
* Rimossa la dipendenza da Google Fonts (nessuna richiesta a domini esterni)

= 1.0.0 =
* Versione iniziale MVP
