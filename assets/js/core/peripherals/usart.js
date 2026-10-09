/**
 * PIC16 USART Peripheral
 * Universal Synchronous/Asynchronous Receiver Transmitter
 * 
 * Registri gestiti:
 *   TXREG  (default 0x19) - Transmit data register
 *   RCREG  (default 0x1A) - Receive data register (2-deep FIFO)
 *   RCSTA  (default 0x18) - Receive status/control
 *     bit 4: CREN  - Continuous receive enable
 *     bit 5: SREN  - Single receive enable
 *     bit 6: RX9   - 9-bit receive enable
 *     bit 7: SPEN  - Serial port enable
 *   TXSTA  (default 0x98) - Transmit status/control
 *     bit 0: TX9D  - 9th bit of transmit data
 *     bit 1: TRMT  - Transmit shift register status (1=empty)
 *     bit 2: BRGH  - High baud rate select
 *     bit 4: SYNC  - Synchronous mode
 *     bit 5: TXEN  - Transmit enable
 *     bit 6: TX9   - 9-bit transmit enable
 *     bit 7: CSRC  - Clock source (sync mode)
 *   SPBRG  (default 0x99) - Baud rate generator
 * 
 * Baud rate: FOSC / (16 * (SPBRG + 1))  per BRGH=0 async
 *            FOSC / (64 * (SPBRG + 1))  per BRGH=1 async
 * 
 * Interfaccia per UI:
 *   - onTransmit callback: chiamato quando un byte viene trasmesso
 *   - receiveData(byte): inietta un byte nel buffer RX (da terminale virtuale)
 *   - txBuffer: storico dati trasmessi
 * 
 * Uso:
 *   var usart = new PIC16USART(cpu, specFromJSON);
 *   cpu.addPeripheral(usart);
 *   usart.onTransmit = function(byte) { terminal.write(byte); };
 *   usart.receiveData(0x41); // Riceve 'A'
 */

class PIC16USART extends PIC16Peripheral {
    constructor(cpu, config) {
        super('USART', cpu);
        config = config || {};
        
        // Indirizzi registri
        this.txReg = parseInt(config.txReg, 16) || 0x19;
        this.rxReg = parseInt(config.rxReg, 16) || 0x1A;
        this.statusReg = parseInt(config.statusReg, 16) || 0x18;   // RCSTA
        this.controlReg = parseInt(config.controlReg, 16) || 0x98;  // TXSTA
        this.baudReg = parseInt(config.baudReg, 16) || 0x99;        // SPBRG
        
        // Interrupt addresses
        var irqFlags = config.interruptFlags || {};
        var irqEn = config.interruptEnables || {};
        this.txPirAddr = this._resolveReg((irqFlags.tx || {}).reg, 0x0C);
        this.txPirBit = (irqFlags.tx || {}).bit !== undefined ? irqFlags.tx.bit : 4;
        this.rxPirAddr = this._resolveReg((irqFlags.rx || {}).reg, 0x0C);
        this.rxPirBit = (irqFlags.rx || {}).bit !== undefined ? irqFlags.rx.bit : 5;
        
        // TX state
        this.txShiftReg = 0;
        this.txShiftEmpty = true;
        this.txCycleCount = 0;
        
        // RX FIFO (2-deep come hardware reale)
        this.rxFIFO = [];
        this.rxOverrun = false;
        
        // Buffer storico per UI/terminale
        this.txBuffer = [];
        this.rxBuffer = [];
        this.maxBufferSize = 4096;
        
        // Callback per UI: chiamato quando un byte esce da TX
        this.onTransmit = null;
    }

    getRegisters() {
        return [this.txReg, this.rxReg, this.statusReg, this.controlReg, this.baudReg];
    }

    reset() {
        this.cpu.ram[this.txReg] = 0x00;
        this.cpu.ram[this.rxReg] = 0x00;
        this.cpu.ram[this.statusReg] = 0x00;   // RCSTA: SPEN=0
        this.cpu.ram[this.controlReg] = 0x02;   // TXSTA: TRMT=1 (shift reg empty)
        this.cpu.ram[this.baudReg] = 0x00;
        
        this.txShiftReg = 0;
        this.txShiftEmpty = true;
        this.txCycleCount = 0;
        this.rxFIFO = [];
        this.rxOverrun = false;
        this.txBuffer = [];
        this.rxBuffer = [];
    }

    // ================================================================
    //  READ
    // ================================================================

    read(addr) {
        if (addr === this.rxReg) {
            return this._readRCREG();
        }
        if (addr === this.controlReg) {
            // TXSTA: TRMT bit riflette stato shift register
            var val = this.cpu.ram[this.controlReg];
            if (this.txShiftEmpty) val |= 0x02;  // TRMT=1
            else val &= ~0x02;
            return val;
        }
        return this.cpu.ram[addr];
    }

    _readRCREG() {
        if (this.rxFIFO.length > 0) {
            var byte = this.rxFIFO.shift();
            this.cpu.ram[this.rxReg] = byte;
            
            // Se FIFO vuoto dopo lettura, clear RCIF
            if (this.rxFIFO.length === 0) {
                this.cpu.ram[this.rxPirAddr] &= ~(1 << this.rxPirBit);
            }
            
            // Clear overrun se FIFO ha spazio
            if (this.rxFIFO.length < 2) {
                this.rxOverrun = false;
                this.cpu.ram[this.statusReg] &= ~0x02; // Clear OERR
            }
            
            return byte;
        }
        return this.cpu.ram[this.rxReg];
    }

    // ================================================================
    //  WRITE
    // ================================================================

    write(addr, value) {
        value &= 0xFF;
        
        if (addr === this.txReg) {
            this._writeTXREG(value);
            return;
        }
        
        if (addr === this.statusReg) {
            // RCSTA: scrivere CREN=0 resetta errori
            var old = this.cpu.ram[this.statusReg];
            this.cpu.ram[this.statusReg] = value;
            
            // Se CREN viene disabilitato, clear overrun
            if ((old & 0x10) && !(value & 0x10)) {
                this.rxOverrun = false;
                this.cpu.ram[this.statusReg] &= ~0x02;
            }
            this.notifyRegisterChange('RCSTA', value);
            return;
        }
        
        if (addr === this.controlReg) {
            this.cpu.ram[this.controlReg] = value;
            this.notifyRegisterChange('TXSTA', value);
            return;
        }
        
        this.cpu.ram[addr] = value;
        if (addr === this.baudReg) {
            this.notifyRegisterChange('SPBRG', value);
        }
    }

    _writeTXREG(value) {
        this.cpu.ram[this.txReg] = value;
        
        var rcsta = this.cpu.ram[this.statusReg];
        var txsta = this.cpu.ram[this.controlReg];
        
        // SPEN (RCSTA bit 7) e TXEN (TXSTA bit 5) devono essere attivi
        if (!(rcsta & 0x80) || !(txsta & 0x20)) return;
        
        // Trasferisci nel shift register (simulazione semplificata: istantanea)
        this.txShiftReg = value;
        this.txShiftEmpty = false;
        
        // Calcola cicli per trasmissione basati su baud rate
        var spbrg = this.cpu.ram[this.baudReg];
        var brgh = (txsta >> 2) & 0x01;
        // Cicli per byte = (SPBRG+1) * moltiplicatore * 10 (start+8data+stop)
        // Semplificato: trasmettiamo dopo N cicli proporzionali
        this.txCycleCount = (spbrg + 1) * (brgh ? 4 : 16);
        
        // Clear TXIF temporaneamente (buffer pieno)
        this.cpu.ram[this.txPirAddr] &= ~(1 << this.txPirBit);
    }

    // ================================================================
    //  TICK
    // ================================================================

    tick(cycles) {
        // Gestisci trasmissione in corso
        if (!this.txShiftEmpty) {
            this.txCycleCount--;
            if (this.txCycleCount <= 0) {
                this._completeTX();
            }
        }
    }

    _completeTX() {
        var byte = this.txShiftReg;
        this.txShiftEmpty = true;
        
        // Set TRMT (shift register empty)
        this.cpu.ram[this.controlReg] |= 0x02;
        
        // Set TXIF (buffer ready for next byte)
        this.cpu.ram[this.txPirAddr] |= (1 << this.txPirBit);
        
        // Salva nel buffer storico
        if (this.txBuffer.length >= this.maxBufferSize) {
            this.txBuffer.shift();
        }
        this.txBuffer.push(byte);
        
        // Callback UI
        if (this.onTransmit) {
            this.onTransmit(byte);
        }
    }

    // ================================================================
    //  RECEIVE (dall'esterno / terminale virtuale)
    // ================================================================

    /**
     * Inietta un byte nel buffer di ricezione.
     * Simula la ricezione di un dato dalla linea seriale.
     * @param {number} byte - Valore 0-255
     */
    receiveData(byte) {
        byte &= 0xFF;
        
        var rcsta = this.cpu.ram[this.statusReg];
        
        // SPEN e CREN devono essere attivi
        if (!(rcsta & 0x80) || !(rcsta & 0x10)) return;
        
        // Salva nel buffer storico
        if (this.rxBuffer.length >= this.maxBufferSize) {
            this.rxBuffer.shift();
        }
        this.rxBuffer.push(byte);
        
        // FIFO a 2 livelli
        if (this.rxFIFO.length >= 2) {
            // Overrun!
            this.rxOverrun = true;
            this.cpu.ram[this.statusReg] |= 0x02; // Set OERR
            return;
        }
        
        this.rxFIFO.push(byte);
        this.cpu.ram[this.rxReg] = this.rxFIFO[0]; // Primo byte visibile
        
        // Set RCIF (data available)
        this.cpu.ram[this.rxPirAddr] |= (1 << this.rxPirBit);
    }

    // ================================================================
    //  API PER UI / TERMINALE
    // ================================================================

    /**
     * Restituisce il buffer TX (storico dati trasmessi).
     * @returns {number[]}
     */
    getTxBuffer() {
        return this.txBuffer.slice();
    }

    /**
     * Restituisce il buffer TX come stringa ASCII.
     * @returns {string}
     */
    getTxString() {
        return this.txBuffer.map(function(b) {
            if (b >= 32 && b < 127) return String.fromCharCode(b);
            if (b === 10) return '\n';
            if (b === 13) return '\r';
            return '.';
        }).join('');
    }

    /**
     * Svuota i buffer TX/RX (per UI clear terminal).
     */
    clearBuffers() {
        this.txBuffer = [];
        this.rxBuffer = [];
    }

    /**
     * Calcola il baud rate corrente.
     * @param {number} fosc - Frequenza oscillatore in Hz (default 4MHz)
     * @returns {number}
     */
    getBaudRate(fosc) {
        fosc = fosc || 4000000;
        var spbrg = this.cpu.ram[this.baudReg];
        var txsta = this.cpu.ram[this.controlReg];
        var brgh = (txsta >> 2) & 0x01;
        var sync = (txsta >> 4) & 0x01;
        
        if (sync) {
            return fosc / (4 * (spbrg + 1));
        }
        return brgh ? fosc / (16 * (spbrg + 1)) : fosc / (64 * (spbrg + 1));
    }

    /**
     * Verifica se la porta seriale e' abilitata.
     * @returns {boolean}
     */
    isEnabled() {
        return !!(this.cpu.ram[this.statusReg] & 0x80); // SPEN
    }

    _resolveReg(name, defaultAddr) {
        var map = { 'PIR1': 0x0C, 'PIR2': 0x0D, 'PIE1': 0x8C, 'PIE2': 0x8D };
        return (name && map[name] !== undefined) ? map[name] : defaultAddr;
    }

    getState() {
        var txsta = this.cpu.ram[this.controlReg];
        var rcsta = this.cpu.ram[this.statusReg];
        return {
            enabled: !!(rcsta & 0x80),
            txEnabled: !!(txsta & 0x20),
            rxEnabled: !!(rcsta & 0x10),
            baudRate: this.getBaudRate(),
            spbrg: this.cpu.ram[this.baudReg],
            brgh: (txsta >> 2) & 0x01,
            sync: (txsta >> 4) & 0x01,
            trmt: this.txShiftEmpty,
            txBufferLen: this.txBuffer.length,
            rxFIFOLen: this.rxFIFO.length,
            overrun: this.rxOverrun
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PIC16USART;
}
