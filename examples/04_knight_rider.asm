; =============================================================================
; DEMO 4: LED SCORREVOLE (KNIGHT RIDER)
; =============================================================================
; Descrizione: Un singolo LED "scorre" avanti e indietro su PORTB
;              Effetto tipo "supercar" / Knight Rider
; Difficoltà: Intermedio
; Concetti: Rotazione bit, flag Carry, direzione di scorrimento
; =============================================================================

    LIST P=16F84A

; === REGISTRI ===
STATUS  EQU 0x03
PORTB   EQU 0x06
TRISB   EQU 0x86
RP0     EQU 5
C       EQU 0       ; Bit Carry nel registro STATUS

; === VARIABILI ===
    CBLOCK 0x0C
    PATTERN         ; Il pattern LED corrente
    DIRECTION       ; 0 = sinistra, 1 = destra
    DELAY1
    DELAY2
    ENDC

; === RESET ===
    ORG 0x00
    GOTO INIT

    ORG 0x04
    RETFIE

; === INIT ===
INIT:
    BSF STATUS, RP0
    CLRF TRISB          ; Tutto output
    BCF STATUS, RP0
    
    ; Inizia con LED su RB0
    MOVLW 0x01
    MOVWF PATTERN
    MOVWF PORTB
    
    CLRF DIRECTION      ; Inizia andando a sinistra

; === MAIN ===
MAIN:
    ; Mostra pattern corrente
    MOVF PATTERN, W
    MOVWF PORTB
    
    ; Ritardo
    CALL RITARDO
    
    ; Controlla direzione
    MOVF DIRECTION, F   ; Testa se DIRECTION = 0 (imposta flag Z)
    BTFSS STATUS, 2     ; Salta se Z = 1 (DIRECTION = 0)
    GOTO SCORRI_DX      ; DIRECTION != 0 -> scorri a destra

; === SCORRI A SINISTRA ===
SCORRI_SX:
    ; Shift a sinistra: moltiplica per 2
    BCF STATUS, C       ; Clear Carry
    RLF PATTERN, F      ; Ruota sinistra attraverso Carry
    
    ; Se il bit 7 è impostato, siamo al limite -> cambia direzione
    BTFSC PATTERN, 7    ; Salta se bit 7 = 0
    BSF DIRECTION, 0    ; Imposta direzione = destra
    
    GOTO MAIN

; === SCORRI A DESTRA ===
SCORRI_DX:
    ; Shift a destra: dividi per 2
    BCF STATUS, C       ; Clear Carry
    RRF PATTERN, F      ; Ruota destra attraverso Carry
    
    ; Se il bit 0 è impostato, siamo al limite -> cambia direzione
    BTFSC PATTERN, 0    ; Salta se bit 0 = 0
    CLRF DIRECTION      ; Direzione = sinistra
    
    GOTO MAIN

; === RITARDO ===
RITARDO:
    MOVLW 0x40
    MOVWF DELAY1
LOOP1:
    MOVLW 0xFF
    MOVWF DELAY2
LOOP2:
    DECFSZ DELAY2, F
    GOTO LOOP2
    DECFSZ DELAY1, F
    GOTO LOOP1
    RETURN

    END
