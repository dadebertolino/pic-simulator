; =============================================================================
; DEMO 2: CONTATORE BINARIO
; =============================================================================
; Descrizione: Conta da 0 a 255 mostrando il valore binario su 8 LED (PORTB)
; Difficoltà: Principiante
; Concetti: Incremento, output multi-bit, visualizzazione binaria
; =============================================================================

    LIST P=16F84A

; === REGISTRI ===
STATUS  EQU 0x03
PORTB   EQU 0x06
TRISB   EQU 0x86
RP0     EQU 5

; === VARIABILI ===
    CBLOCK 0x0C
    COUNTER         ; Il nostro contatore 0-255
    DELAY1
    DELAY2
    ENDC

; === RESET ===
    ORG 0x00
    GOTO INIT

; === INTERRUPT (non usato) ===
    ORG 0x04
    RETFIE

; === INIZIALIZZAZIONE ===
INIT:
    ; Bank 1 - Configura PORTB tutto output
    BSF STATUS, RP0
    CLRF TRISB          ; Tutti i pin sono output (TRISB = 0x00)
    BCF STATUS, RP0     ; Torna a Bank 0
    
    ; Inizializza
    CLRF PORTB          ; Spegni tutti i LED
    CLRF COUNTER        ; Contatore = 0

; === LOOP PRINCIPALE ===
MAIN:
    ; Mostra il valore del contatore sui LED
    MOVF COUNTER, W     ; W = COUNTER
    MOVWF PORTB         ; PORTB = W (mostra sui LED)
    
    ; Aspetta un po' per vedere il conteggio
    CALL RITARDO
    
    ; Incrementa il contatore
    INCF COUNTER, F     ; COUNTER = COUNTER + 1
    ; Nota: quando COUNTER supera 255, torna automaticamente a 0
    
    GOTO MAIN           ; Ripeti

; === RITARDO ===
RITARDO:
    MOVLW 0x80          ; Ritardo più breve per vedere il conteggio
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
