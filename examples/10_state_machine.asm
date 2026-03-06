; =============================================================================
; DEMO 10: MACCHINA A STATI - SEMAFORO
; =============================================================================
; Descrizione: Implementa un semaforo con 3 LED usando una macchina a stati
;              Verde (RB0) -> Giallo (RB1) -> Rosso (RB2) -> Verde...
; Difficoltà: Intermedio
; Concetti: Macchina a stati finiti, switch-case con computed GOTO
;
; Schema LED:
;   RB0 = Verde
;   RB1 = Giallo  
;   RB2 = Rosso
; =============================================================================

    LIST P=16F84A

; === REGISTRI ===
STATUS  EQU 0x03
PORTB   EQU 0x06
PCL     EQU 0x02
TRISB   EQU 0x86
RP0     EQU 5

; === STATI ===
STATO_VERDE   EQU 0
STATO_GIALLO  EQU 1
STATO_ROSSO   EQU 2

; === PATTERN LED ===
LED_VERDE   EQU 0x01    ; 00000001 - solo RB0
LED_GIALLO  EQU 0x02    ; 00000010 - solo RB1
LED_ROSSO   EQU 0x04    ; 00000100 - solo RB2

; === VARIABILI ===
    CBLOCK 0x0C
    STATO           ; Stato corrente del semaforo
    TIMER           ; Contatore per durata stato
    DELAY1
    DELAY2
    ENDC

; === DURATE (in unità di ritardo) ===
DURATA_VERDE  EQU 10
DURATA_GIALLO EQU 3
DURATA_ROSSO  EQU 10

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
    
    ; Inizia con semaforo verde
    MOVLW STATO_VERDE
    MOVWF STATO
    
    MOVLW LED_VERDE
    MOVWF PORTB
    
    MOVLW DURATA_VERDE
    MOVWF TIMER

; =============================================================================
; LOOP PRINCIPALE - Macchina a Stati
; =============================================================================
MAIN:
    ; Aspetta un "tick"
    CALL RITARDO
    
    ; Decrementa timer
    DECFSZ TIMER, F
    GOTO MAIN           ; Timer non zero -> continua
    
    ; Timer scaduto -> cambia stato
    CALL PROSSIMO_STATO
    
    GOTO MAIN

; =============================================================================
; PROSSIMO_STATO
; Transizione allo stato successivo
; =============================================================================
PROSSIMO_STATO:
    ; Carica stato corrente
    MOVF STATO, W
    
    ; Computed GOTO - salta alla gestione dello stato corrente
    ADDWF PCL, F
    GOTO DA_VERDE       ; Se STATO = 0
    GOTO DA_GIALLO      ; Se STATO = 1
    GOTO DA_ROSSO       ; Se STATO = 2

; --- Transizione da VERDE ---
DA_VERDE:
    ; Verde -> Giallo
    MOVLW STATO_GIALLO
    MOVWF STATO
    
    MOVLW LED_GIALLO
    MOVWF PORTB
    
    MOVLW DURATA_GIALLO
    MOVWF TIMER
    RETURN

; --- Transizione da GIALLO ---
DA_GIALLO:
    ; Giallo -> Rosso
    MOVLW STATO_ROSSO
    MOVWF STATO
    
    MOVLW LED_ROSSO
    MOVWF PORTB
    
    MOVLW DURATA_ROSSO
    MOVWF TIMER
    RETURN

; --- Transizione da ROSSO ---
DA_ROSSO:
    ; Rosso -> Verde (ciclo completo)
    MOVLW STATO_VERDE
    MOVWF STATO
    
    MOVLW LED_VERDE
    MOVWF PORTB
    
    MOVLW DURATA_VERDE
    MOVWF TIMER
    RETURN

; =============================================================================
; RITARDO - Un "tick" del semaforo
; =============================================================================
RITARDO:
    MOVLW 0x30
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
