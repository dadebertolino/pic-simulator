; =============================================================================
; DEMO 9: SUBROUTINE E STACK
; =============================================================================
; Descrizione: Dimostra l'uso di subroutine annidate e lo stack
;              Il PIC16F84A ha uno stack di 8 livelli
;              Guarda il pannello "Stack" mentre esegui step-by-step!
; Difficoltà: Intermedio
; Concetti: CALL, RETURN, stack, subroutine annidate, passaggio parametri
;
; SUGGERIMENTO: Usa "Step" (F8) per vedere lo stack crescere e diminuire
; =============================================================================

    LIST P=16F84A

; === REGISTRI ===
STATUS  EQU 0x03
PORTB   EQU 0x06
TRISB   EQU 0x86
RP0     EQU 5

; === VARIABILI ===
    CBLOCK 0x0C
    PARAM1          ; Parametro per le subroutine
    PARAM2
    RESULT          ; Risultato
    TEMP
    DELAY1
    DELAY2
    ENDC

; === RESET ===
    ORG 0x00
    GOTO INIT

    ORG 0x04
    RETFIE

; =============================================================================
; INIZIALIZZAZIONE
; =============================================================================
INIT:
    BSF STATUS, RP0
    CLRF TRISB          ; PORTB output
    BCF STATUS, RP0
    CLRF PORTB

; =============================================================================
; PROGRAMMA PRINCIPALE
; Calcola: RESULT = (PARAM1 + PARAM2) * 2
; usando subroutine annidate
; =============================================================================
MAIN:
    ; Imposta parametri: 5 + 3 = 8, poi 8 * 2 = 16
    MOVLW 5
    MOVWF PARAM1
    MOVLW 3
    MOVWF PARAM2
    
    ; Chiama la funzione di calcolo (livello 1 di annidamento)
    CALL CALCOLA
    
    ; Mostra risultato sui LED
    MOVF RESULT, W
    MOVWF PORTB
    
    ; Pausa
    CALL PAUSA_LUNGA
    
    ; Prova con altri valori: 7 + 8 = 15, poi 15 * 2 = 30 (0x1E)
    MOVLW 7
    MOVWF PARAM1
    MOVLW 8
    MOVWF PARAM2
    
    CALL CALCOLA
    
    MOVF RESULT, W
    MOVWF PORTB
    
    CALL PAUSA_LUNGA
    
    GOTO MAIN

; =============================================================================
; SUBROUTINE: CALCOLA
; Calcola (PARAM1 + PARAM2) * 2
; Questa funzione chiama altre due subroutine (annidamento)
; Stack depth: 1 (chiamante) + 1 (SOMMA/RADDOPPIA) = 2 livelli
; =============================================================================
CALCOLA:
    ; Prima somma PARAM1 + PARAM2
    CALL SOMMA          ; Stack: 2 livelli
    
    ; Poi raddoppia il risultato
    CALL RADDOPPIA      ; Stack: 2 livelli
    
    RETURN              ; Stack: torna a 1 livello

; =============================================================================
; SUBROUTINE: SOMMA
; Input: PARAM1, PARAM2
; Output: RESULT = PARAM1 + PARAM2
; =============================================================================
SOMMA:
    MOVF PARAM1, W      ; W = PARAM1
    ADDWF PARAM2, W     ; W = PARAM1 + PARAM2
    MOVWF RESULT        ; RESULT = W
    RETURN

; =============================================================================
; SUBROUTINE: RADDOPPIA
; Input: RESULT
; Output: RESULT = RESULT * 2
; Usa la subroutine SHIFT_LEFT (ulteriore annidamento)
; Stack depth raggiunge 3 livelli qui!
; =============================================================================
RADDOPPIA:
    CALL SHIFT_LEFT     ; Stack: 3 livelli!
    RETURN

; =============================================================================
; SUBROUTINE: SHIFT_LEFT
; Moltiplica RESULT per 2 usando shift a sinistra
; Questo è il livello più profondo di annidamento
; =============================================================================
SHIFT_LEFT:
    BCF STATUS, 0       ; Clear Carry
    RLF RESULT, F       ; RESULT = RESULT << 1 (= RESULT * 2)
    RETURN

; =============================================================================
; SUBROUTINE: PAUSA_LUNGA
; Pausa visibile
; =============================================================================
PAUSA_LUNGA:
    CALL RITARDO        ; Annidamento: Main -> PAUSA_LUNGA -> RITARDO
    CALL RITARDO        ; Stack: 3 livelli
    CALL RITARDO
    RETURN

; =============================================================================
; SUBROUTINE: RITARDO
; =============================================================================
RITARDO:
    MOVLW 0xFF
    MOVWF DELAY1
R_L1:
    MOVLW 0xFF
    MOVWF DELAY2
R_L2:
    DECFSZ DELAY2, F
    GOTO R_L2
    DECFSZ DELAY1, F
    GOTO R_L1
    RETURN

    END
