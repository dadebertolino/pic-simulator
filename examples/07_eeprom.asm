; =============================================================================
; DEMO 7: LETTURA E SCRITTURA EEPROM
; =============================================================================
; Descrizione: Dimostra come leggere e scrivere la EEPROM interna
;              Salva un contatore in EEPROM, così sopravvive al reset
; Difficoltà: Avanzato
; Concetti: EEPROM, EEDATA, EEADR, EECON1, EECON2, sequenza di scrittura
;
; PROVA: esegui per qualche secondo, premi Stop e poi Reset: il contatore
;        riparte dal valore salvato. Come sul chip reale, la EEPROM non
;        si cancella con il Reset ma quando riprogrammi il PIC: nel
;        simulatore quando riassembli (o ricarichi la pagina). Appena
;        programmata vale 0xFF, quindi la prima volta il conteggio parte
;        da 0xFF.
; =============================================================================

    LIST P=16F84A

; === REGISTRI ===
STATUS  EQU 0x03
PORTB   EQU 0x06
EEDATA  EQU 0x08    ; Dato da leggere/scrivere
EEADR   EQU 0x09    ; Indirizzo EEPROM (0-63)
INTCON  EQU 0x0B
EECON1  EQU 0x88    ; Controllo EEPROM (Bank 1)
EECON2  EQU 0x89    ; Registro per sequenza scrittura (Bank 1)
TRISB   EQU 0x86

; === BIT ===
RP0     EQU 5
; Bit di EECON1:
RD      EQU 0       ; Read control bit
WR      EQU 1       ; Write control bit
WREN    EQU 2       ; Write enable bit
WRERR   EQU 3       ; Write error flag
EEIF    EQU 4       ; Write complete interrupt flag

; === VARIABILI ===
    CBLOCK 0x0C
    COUNTER
    DELAY1
    DELAY2
    ENDC

; === COSTANTE ===
EE_ADDR EQU 0x00    ; Indirizzo EEPROM dove salvare il contatore

; === RESET ===
    ORG 0x00
    GOTO INIT

    ORG 0x04
    RETFIE

; =============================================================================
; INIZIALIZZAZIONE
; =============================================================================
INIT:
    BSF STATUS, RP0     ; Bank 1
    CLRF TRISB          ; PORTB output
    BCF STATUS, RP0     ; Bank 0
    
    ; Leggi il valore salvato dalla EEPROM
    CALL LEGGI_EEPROM
    
    ; Il valore letto è ora in W, mettilo nel contatore
    MOVWF COUNTER
    MOVWF PORTB         ; Mostra sui LED

; =============================================================================
; LOOP PRINCIPALE
; Incrementa il contatore, lo salva in EEPROM e lo mostra
; =============================================================================
MAIN:
    CALL RITARDO
    
    ; Incrementa contatore
    INCF COUNTER, F
    
    ; Mostra sui LED
    MOVF COUNTER, W
    MOVWF PORTB
    
    ; Salva in EEPROM
    CALL SCRIVI_EEPROM
    
    GOTO MAIN

; =============================================================================
; SUBROUTINE: LEGGI EEPROM
; Input: nessuno (usa EE_ADDR come indirizzo)
; Output: W = dato letto
; =============================================================================
LEGGI_EEPROM:
    ; Imposta indirizzo da leggere
    MOVLW EE_ADDR
    MOVWF EEADR
    
    ; Avvia lettura
    BSF STATUS, RP0     ; Bank 1
    BSF EECON1, RD      ; RD = 1 -> inizia lettura
    BCF STATUS, RP0     ; Bank 0
    
    ; Il dato è immediatamente disponibile in EEDATA
    MOVF EEDATA, W
    
    RETURN

; =============================================================================
; SUBROUTINE: SCRIVI EEPROM
; Input: COUNTER contiene il valore da scrivere
; ATTENZIONE: La scrittura EEPROM richiede una sequenza specifica!
; =============================================================================
SCRIVI_EEPROM:
    ; Imposta indirizzo
    MOVLW EE_ADDR
    MOVWF EEADR
    
    ; Imposta dato da scrivere
    MOVF COUNTER, W
    MOVWF EEDATA
    
    ; Inizia sequenza di scrittura
    BSF STATUS, RP0     ; Bank 1
    
    ; Abilita scrittura
    BSF EECON1, WREN    ; WREN = 1
    
    ; Disabilita interrupt durante la sequenza critica
    BCF INTCON, GIE
    
    ; *** SEQUENZA OBBLIGATORIA ***
    ; Devi scrivere 0x55 poi 0xAA in EECON2
    ; Questo previene scritture accidentali
    MOVLW 0x55
    MOVWF EECON2
    MOVLW 0xAA
    MOVWF EECON2
    
    ; Avvia scrittura
    BSF EECON1, WR      ; WR = 1 -> inizia scrittura
    
    ; Riabilita interrupt
    BSF INTCON, GIE
    
    ; Aspetta completamento (WR torna a 0)
ATTENDI_SCRITTURA:
    BTFSC EECON1, WR    ; WR ancora 1?
    GOTO ATTENDI_SCRITTURA
    
    ; Disabilita scrittura (sicurezza)
    BCF EECON1, WREN
    
    BCF STATUS, RP0     ; Bank 0
    
    RETURN

; =============================================================================
; RITARDO
; =============================================================================
RITARDO:
    MOVLW 0x60
    MOVWF DELAY1
R_LOOP1:
    MOVLW 0xFF
    MOVWF DELAY2
R_LOOP2:
    DECFSZ DELAY2, F
    GOTO R_LOOP2
    DECFSZ DELAY1, F
    GOTO R_LOOP1
    RETURN

    END
