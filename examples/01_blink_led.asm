; =============================================================================
; DEMO 1: BLINK LED
; =============================================================================
; Descrizione: Accende e spegne un LED su RB0 con un ritardo software
; Difficoltà: Principiante
; Concetti: Output digitale, loop di ritardo, istruzioni base
; =============================================================================

    LIST P=16F84A

; === DEFINIZIONE REGISTRI ===
; I registri sono locazioni di memoria speciali che controllano il PIC
STATUS  EQU 0x03    ; Registro di stato (contiene i flag Z, C, DC, RP0...)
PORTB   EQU 0x06    ; Registro dati PORTB (legge/scrive i pin RB0-RB7)
TRISB   EQU 0x86    ; Registro direzione PORTB (1=input, 0=output)
RP0     EQU 5       ; Bit 5 di STATUS seleziona il banco di memoria

; === VARIABILI IN RAM ===
; CBLOCK definisce un blocco di variabili consecutive
; La RAM utente inizia all'indirizzo 0x0C
    CBLOCK 0x0C
    DELAY1          ; Contatore esterno del ritardo
    DELAY2          ; Contatore interno del ritardo
    ENDC

; === VETTORE DI RESET ===
; Quando il PIC si accende o viene resettato, inizia da qui
    ORG 0x00
    GOTO INIT       ; Salta all'inizializzazione

; === VETTORE INTERRUPT ===
; Se si verifica un interrupt, il PIC salta qui
    ORG 0x04
    RETFIE          ; Ritorna dall'interrupt (non usato in questo esempio)

; === INIZIALIZZAZIONE ===
INIT:
    ; Seleziona Bank 1 per accedere a TRISB
    BSF STATUS, RP0     ; Bank 1 (RP0 = 1)
    
    ; Configura RB0 come output (bit = 0)
    ; TRISB = 11111110 binario = 0xFE
    MOVLW 0xFE          ; W = 11111110
    MOVWF TRISB         ; TRISB = W
    
    ; Torna al Bank 0 per accedere a PORTB
    BCF STATUS, RP0     ; Bank 0 (RP0 = 0)
    
    ; Spegni tutti i LED inizialmente
    CLRF PORTB          ; PORTB = 0

; === LOOP PRINCIPALE ===
MAIN:
    ; Accendi LED (RB0 = 1)
    BSF PORTB, 0        ; Set bit 0 di PORTB
    CALL RITARDO        ; Aspetta
    
    ; Spegni LED (RB0 = 0)
    BCF PORTB, 0        ; Clear bit 0 di PORTB
    CALL RITARDO        ; Aspetta
    
    GOTO MAIN           ; Ripeti all'infinito

; === SUBROUTINE RITARDO ===
; Crea un ritardo usando due loop annidati
; Ritardo ≈ 256 * 256 * 3 cicli = ~196000 cicli
RITARDO:
    MOVLW 0xFF          ; Carica 255 nel registro W
    MOVWF DELAY1        ; Inizializza contatore esterno
    
LOOP_EXT:
    MOVLW 0xFF          ; Carica 255
    MOVWF DELAY2        ; Inizializza contatore interno
    
LOOP_INT:
    DECFSZ DELAY2, F    ; Decrementa DELAY2, salta se zero
    GOTO LOOP_INT       ; Se non zero, continua loop interno
    
    DECFSZ DELAY1, F    ; Decrementa DELAY1, salta se zero
    GOTO LOOP_EXT       ; Se non zero, continua loop esterno
    
    RETURN              ; Fine ritardo

    END
