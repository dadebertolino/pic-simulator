; =============================================================================
; DEMO 8: TABELLA DI LOOKUP
; =============================================================================
; Descrizione: Usa una tabella in memoria programma per convertire valori
;              Esempio: converte un numero 0-9 nel pattern per display 7-seg
; Difficoltà: Intermedio
; Concetti: RETLW, PCL, tabelle, indirizzamento con offset
;
; Pattern display 7 segmenti (catodo comune):
;     a
;    ---
;   f| |b
;    -g-
;   e| |c
;    ---
;     d
;
; Bit: 0=a, 1=b, 2=c, 3=d, 4=e, 5=f, 6=g
; =============================================================================

    LIST P=16F84A

; === REGISTRI ===
STATUS  EQU 0x03
PORTB   EQU 0x06
PCLATH  EQU 0x0A    ; Parte alta del Program Counter
PCL     EQU 0x02    ; Parte bassa del Program Counter
TRISB   EQU 0x86
RP0     EQU 5

; === VARIABILI ===
    CBLOCK 0x0C
    DIGIT           ; Cifra corrente 0-9
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
    
    CLRF DIGIT          ; Inizia da 0

; =============================================================================
; LOOP PRINCIPALE
; Mostra i numeri 0-9 in sequenza
; =============================================================================
MAIN:
    ; Converti cifra in pattern 7-seg
    MOVF DIGIT, W       ; W = cifra
    CALL TABELLA_7SEG   ; W = pattern
    MOVWF PORTB         ; Mostra pattern
    
    ; Ritardo
    CALL RITARDO
    
    ; Incrementa cifra
    INCF DIGIT, F
    
    ; Se DIGIT > 9, torna a 0
    MOVLW 10
    SUBWF DIGIT, W      ; W = DIGIT - 10
    BTFSC STATUS, 0     ; Se Carry=1, DIGIT >= 10
    CLRF DIGIT          ; Reset a 0
    
    GOTO MAIN

; =============================================================================
; TABELLA LOOKUP PER DISPLAY 7 SEGMENTI
; Input: W = cifra (0-9)
; Output: W = pattern per display 7-segmenti
;
; Come funziona:
; 1. W viene sommato a PCL (Program Counter Low)
; 2. Il PC salta alla RETLW corrispondente
; 3. RETLW carica il valore costante in W e ritorna
; =============================================================================
TABELLA_7SEG:
    ; Assicurati che W sia nel range 0-9
    ANDLW 0x0F          ; Limita a 4 bit
    
    ; Aggiungi l'offset alla tabella
    ADDWF PCL, F        ; PCL = PCL + W (salta avanti)
    
    ; Tabella: ogni RETLW corrisponde a una cifra
    ;          gfedcba (bit 6-0)
    RETLW 0x3F          ; 0: 0111111 - segmenti a,b,c,d,e,f
    RETLW 0x06          ; 1: 0000110 - segmenti b,c
    RETLW 0x5B          ; 2: 1011011 - segmenti a,b,d,e,g
    RETLW 0x4F          ; 3: 1001111 - segmenti a,b,c,d,g
    RETLW 0x66          ; 4: 1100110 - segmenti b,c,f,g
    RETLW 0x6D          ; 5: 1101101 - segmenti a,c,d,f,g
    RETLW 0x7D          ; 6: 1111101 - segmenti a,c,d,e,f,g
    RETLW 0x07          ; 7: 0000111 - segmenti a,b,c
    RETLW 0x7F          ; 8: 1111111 - tutti i segmenti
    RETLW 0x6F          ; 9: 1101111 - segmenti a,b,c,d,f,g

; =============================================================================
; RITARDO
; =============================================================================
RITARDO:
    MOVLW 0x80
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
