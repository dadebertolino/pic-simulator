; =============================================================================
; DEMO 6: INTERRUPT ESTERNO (RB0/INT)
; =============================================================================
; Descrizione: Usa l'interrupt esterno sul pin RB0 per contare le pressioni
;              Ogni volta che RB0 va HIGH, incrementa un contatore mostrato
;              sui LED RB4-RB7
; Difficoltà: Avanzato
; Concetti: Interrupt esterno INT, fronte di salita/discesa, INTE, INTF
;
; ISTRUZIONI PER IL TEST:
; 1. Compila e avvia (Run)
; 2. Clicca ripetutamente su RB0 nel pannello I/O
; 3. Ogni click incrementerà il contatore visibile su RB4-RB7
; =============================================================================

    LIST P=16F84A

; === REGISTRI ===
STATUS  EQU 0x03
PORTB   EQU 0x06
INTCON  EQU 0x0B
OPTION_REG EQU 0x81
TRISB   EQU 0x86

; === BIT ===
RP0     EQU 5
GIE     EQU 7       ; Global Interrupt Enable
INTE    EQU 4       ; RB0/INT Interrupt Enable  
INTF    EQU 1       ; RB0/INT Interrupt Flag
INTEDG  EQU 6       ; Interrupt Edge Select (in OPTION_REG)

; === VARIABILI ===
    CBLOCK 0x0C
    W_TEMP
    STATUS_TEMP
    COUNTER         ; Contatore delle pressioni
    ENDC

; === RESET ===
    ORG 0x00
    GOTO INIT

; =============================================================================
; INTERRUPT SERVICE ROUTINE
; =============================================================================
    ORG 0x04
    
    ; Salva contesto
    MOVWF W_TEMP
    SWAPF STATUS, W
    MOVWF STATUS_TEMP
    
    ; È interrupt RB0?
    BTFSS INTCON, INTF
    GOTO ISR_EXIT
    
    ; Sì -> incrementa contatore
    INCF COUNTER, F
    
    ; Mostra contatore sui LED superiori (RB4-RB7)
    ; Shifta il contatore di 4 bit a sinistra
    SWAPF COUNTER, W    ; Scambia nibble: 0x0N -> 0xN0
    ANDLW 0xF0          ; Maschera solo i bit alti
    MOVWF PORTB         ; Mostra su RB4-RB7
    
    ; Pulisci flag (OBBLIGATORIO!)
    BCF INTCON, INTF
    
ISR_EXIT:
    ; Ripristina contesto
    SWAPF STATUS_TEMP, W
    MOVWF STATUS
    SWAPF W_TEMP, F
    SWAPF W_TEMP, W
    
    RETFIE

; =============================================================================
; INIZIALIZZAZIONE
; =============================================================================
INIT:
    BSF STATUS, RP0     ; Bank 1
    
    ; RB0 = input (interrupt)
    ; RB4-RB7 = output (LED)
    ; TRISB = 00001111 = 0x0F
    MOVLW 0x0F
    MOVWF TRISB
    
    ; Interrupt sul fronte di SALITA (0->1)
    ; INTEDG = 1 in OPTION_REG
    BSF OPTION_REG, INTEDG
    
    BCF STATUS, RP0     ; Bank 0
    
    ; Inizializza
    CLRF COUNTER
    CLRF PORTB
    
    ; Abilita interrupt:
    ; GIE = 1 (global)
    ; INTE = 1 (RB0/INT)
    MOVLW 0x90          ; 10010000
    MOVWF INTCON

; === MAIN ===
; Il programma principale può fare altro...
; Gli interrupt gestiscono il conteggio
MAIN:
    NOP
    GOTO MAIN

    END
