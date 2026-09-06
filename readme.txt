=== WebPicSimulator ===
Contributors: profbertolino
Tags: pic, microcontroller, simulator, assembly, education
Requires at least: 5.0
Tested up to: 6.4
Stable tag: 1.0.1
License: MIT

Simulatore web-based per microcontrollori PIC16F84A per uso didattico.

== Description ==

WebPicSimulator permette di scrivere, assemblare e simulare codice Assembly per microcontrollori PIC16F84A direttamente nel browser.

== Installation ==

1. Carica la cartella `pic-simulator` in `/wp-content/plugins/`
2. Attiva il plugin dal menu 'Plugin' in WordPress
3. Usa lo shortcode `[pic_simulator]` in qualsiasi pagina

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
