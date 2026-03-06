; =============================================================================
; DEMO 5: TIMER0 CON INTERRUPT
; =============================================================================
; Descrizione: Usa il Timer0 per generare interrupt periodici
;              Ogni overflow del timer, il LED su RB0 cambia stato (toggle)
; Difficoltà: Intermedio/Avanzato
; Concetti: Timer0, prescaler, interrupt, ISR, GIE, T0IE, T0IF
;
; NOTA: In modalità Animate vedrai il LED cambiare più lentamente
;       perché ogni interrupt richiede diversi cicli
; =============================================================================

    LIST P=16F84A

; === REGISTRI ===
INDF    EQU 0x00
TMR0    EQU 0x01    ; Registro Timer0
PCL     EQU 0x02
STATUS  EQU 0x03
FSR     EQU 0x04
PORTA   EQU 0x05
PORTB   EQU 0x06
INTCON  EQU 0x0B    ; Registro controllo interrupt
OPTION_REG EQU 0x81 ; Registro opzioni (Bank 1)
TRISA   EQU 0x85
TRISB   EQU 0x86

; === BIT DI STATUS ===
RP0     EQU 5       ; Selezione banco
Z       EQU 2       ; Flag Zero
C       EQU 0       ; Flag Carry

; === BIT DI INTCON ===
GIE     EQU 7       ; Global Interrupt Enable
T0IE    EQU 5       ; Timer0 Interrupt Enable
T0IF    EQU 2       ; Timer0 Interrupt Flag

; === BIT DI OPTION_REG ===
T0CS    EQU 5       ; Timer0 Clock Source (0=interno, 1=esterno)
PSA     EQU 3       ; Prescaler Assignment (0=Timer0, 1=WDT)
; PS2:PS0 = bit 2:0 -> seleziona rapporto prescaler

; === VARIABILI ===
    CBLOCK 0x0C
    W_TEMP          ; Salvataggio W durante interrupt
    STATUS_TEMP     ; Salvataggio STATUS durante interrupt
    ENDC

; =============================================================================
; VETTORE DI RESET
; =============================================================================
    ORG 0x00
    GOTO INIT

; =============================================================================
; VETTORE DI INTERRUPT
; Quando TMR0 va in overflow, il PIC salta qui
; =============================================================================
    ORG 0x04
    
    ; --- Salva contesto ---
    ; È importante salvare W e STATUS perché l'ISR potrebbe modificarli
    MOVWF W_TEMP        ; Salva W
    SWAPF STATUS, W     ; Salva STATUS (SWAPF non modifica i flag)
    MOVWF STATUS_TEMP
    
    ; --- Gestisci l'interrupt ---
    ; Verifica se è stato Timer0 a generare l'interrupt
    BTFSS INTCON, T0IF  ; Timer0 overflow?
    GOTO ISR_END        ; No -> esci
    
    ; Sì, è Timer0 -> toggle LED su RB0
    MOVLW 0x01          ; Maschera per bit 0
    XORWF PORTB, F      ; XOR toggle: 0->1, 1->0
    
    ; Pulisci il flag interrupt (OBBLIGATORIO!)
    ; Se non lo fai, l'interrupt si ripete immediatamente
    BCF INTCON, T0IF
    
ISR_END:
    ; --- Ripristina contesto ---
    SWAPF STATUS_TEMP, W
    MOVWF STATUS
    SWAPF W_TEMP, F
    SWAPF W_TEMP, W
    
    RETFIE              ; Ritorna e riabilita GIE

; =============================================================================
; INIZIALIZZAZIONE
; =============================================================================
INIT:
    ; --- Configura I/O ---
    BSF STATUS, RP0     ; Bank 1
    CLRF TRISB          ; PORTB tutto output
    
    ; --- Configura Timer0 ---
    ; OPTION_REG:
    ; bit 5 (T0CS) = 0 -> clock interno (Fosc/4)
    ; bit 3 (PSA)  = 0 -> prescaler assegnato a Timer0
    ; bit 2:0      = 111 -> prescaler 1:256
    ; Valore: 00000111 = 0x07
    MOVLW 0x07
    MOVWF OPTION_REG
    
    BCF STATUS, RP0     ; Bank 0
    
    ; --- Inizializza Timer0 ---
    CLRF TMR0           ; Timer parte da 0
    
    ; --- Abilita interrupt ---
    ; INTCON:
    ; bit 7 (GIE)  = 1 -> abilita interrupt globali
    ; bit 5 (T0IE) = 1 -> abilita interrupt Timer0
    ; Valore: 10100000 = 0xA0
    MOVLW 0xA0
    MOVWF INTCON
    
    ; LED inizialmente spento
    CLRF PORTB

; =============================================================================
; LOOP PRINCIPALE
; Il programma principale non fa nulla - tutto è gestito dall'interrupt
; =============================================================================
MAIN:
    NOP                 ; Non fare nulla
    GOTO MAIN           ; Loop infinito
    
    ; Il LED lampeggia automaticamente grazie all'interrupt del Timer0!

    END
