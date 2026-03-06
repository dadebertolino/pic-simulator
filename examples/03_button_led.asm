; =============================================================================
; DEMO 3: PULSANTE E LED
; =============================================================================
; Descrizione: Legge un pulsante su RB4 e accende un LED su RB0
;              Quando premi RB4, il LED si accende
; Difficoltà: Principiante
; Concetti: Input digitale, test bit, decisioni condizionali
; 
; ISTRUZIONI PER IL TEST:
; 1. Compila ed esegui (Run o Animate)
; 2. Clicca sul pin RB4 nel pannello I/O Ports per simulare il pulsante
; 3. Il LED su RB0 si accenderà quando RB4 è HIGH
; =============================================================================

    LIST P=16F84A

; === REGISTRI ===
STATUS  EQU 0x03
PORTB   EQU 0x06
TRISB   EQU 0x86
RP0     EQU 5

; === COSTANTI ===
PULSANTE EQU 4      ; Il pulsante è su RB4
LED      EQU 0      ; Il LED è su RB0

; === RESET ===
    ORG 0x00
    GOTO INIT

    ORG 0x04
    RETFIE

; === INIZIALIZZAZIONE ===
INIT:
    BSF STATUS, RP0     ; Bank 1
    
    ; Configura I/O:
    ; RB4 = input (pulsante) -> bit 4 = 1
    ; RB0 = output (LED) -> bit 0 = 0
    ; TRISB = 00010000 = 0x10
    MOVLW 0x10
    MOVWF TRISB
    
    BCF STATUS, RP0     ; Bank 0
    CLRF PORTB          ; LED spento

; === LOOP PRINCIPALE ===
; Legge continuamente il pulsante e aggiorna il LED
MAIN:
    ; Testa se il pulsante (RB4) è premuto (HIGH)
    BTFSC PORTB, PULSANTE   ; Salta prossima istruzione se RB4 = 0
    GOTO LED_ON             ; RB4 = 1 -> accendi LED
    
    ; RB4 = 0 -> spegni LED
    BCF PORTB, LED
    GOTO MAIN
    
LED_ON:
    ; Accendi il LED
    BSF PORTB, LED
    GOTO MAIN

    END
