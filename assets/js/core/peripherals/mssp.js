/**
 * PIC16 MSSP Peripheral
 * Master Synchronous Serial Port: SPI + I²C
 * 
 * Registri gestiti:
 *   SSPBUF  (0x13) - Data buffer
 *   SSPCON  (0x14) - Control 1 (SSPM3:0 mode, SSPEN, flags)
 *   SSPCON2 (0x91) - Control 2 (I²C master: SEN,PEN,RSEN,RCEN,ACKEN,ACKDT,ACKSTAT)
 *   SSPADD  (0x93) - Address/baud rate
 *   SSPSTAT (0x94) - Status (BF, R/W, S, P, D/A, CKE, SMP)
 * 
 * Modi (SSPM3:SSPM0 in SSPCON):
 *   0000-0011: SPI Master (Fosc/4, /16, /64, TMR2/2)
 *   0100-0101: SPI Slave (SS pin enabled/disabled)
 *   0110: I²C Slave 7-bit
 *   0111: I²C Slave 10-bit
 *   1000: I²C Master (baud = Fosc / (4*(SSPADD+1)))
 * 
 * Bus virtuali collegabili:
 *   mssp.attachSPIBus(bus)  - Collega un VirtualSPIBus
 *   mssp.attachI2CBus(bus)  - Collega un VirtualI2CBus
 */

class PIC16MSSP extends PIC16Peripheral {
    constructor(cpu, config) {
        super('MSSP', cpu);
        config = config || {};

        // Registri
        this.bufReg    = parseInt(config.bufferReg, 16) || 0x13;
        this.conReg    = parseInt(config.controlReg, 16) || 0x14;
        this.con2Reg   = parseInt(config.controlReg2, 16) || 0x91;
        this.addReg    = parseInt(config.addressReg, 16) || 0x93;
        this.statReg   = parseInt(config.statusReg, 16) || 0x94;

        // Interrupt
        var irqFlag = config.interruptFlag || {};
        this.pirAddr = this._resolveReg(irqFlag.reg, 0x0C);
        this.pirBit  = irqFlag.bit !== undefined ? irqFlag.bit : 3;

        // Bus virtuali
        this.spiBus = null;
        this.i2cBus = null;

        // SPI transfer state
        this.spiTransferring = false;
        this.spiCyclesLeft = 0;
        this.spiByteOut = 0;

        // I²C state machine
        this.i2cState = 'IDLE'; // IDLE, START, ADDR, DATA_TX, DATA_RX, ACK, STOP
        this.i2cCyclesLeft = 0;
        this.i2cAddress = 0;
        this.i2cRW = 0;  // 0=write, 1=read
        this.i2cByteOut = 0;
        this.i2cByteIn = 0;

        // Transfer log per UI/debug
        this.transferLog = [];
        this.maxLogSize = 256;

        // Callback generico per UI
        this.onTransfer = null;
    }

    getRegisters() {
        return [this.bufReg, this.conReg, this.con2Reg, this.addReg, this.statReg];
    }

    reset() {
        this.cpu.ram[this.bufReg]  = 0x00;
        this.cpu.ram[this.conReg]  = 0x00; // MSSP disabled
        this.cpu.ram[this.con2Reg] = 0x00;
        this.cpu.ram[this.addReg]  = 0x00;
        this.cpu.ram[this.statReg] = 0x00;

        this.spiTransferring = false;
        this.spiCyclesLeft = 0;
        this.i2cState = 'IDLE';
        this.i2cCyclesLeft = 0;
        this.transferLog = [];
    }

    // ================================================================
    //  BUS ATTACHMENT
    // ================================================================

    attachSPIBus(bus) { this.spiBus = bus; }
    attachI2CBus(bus) { this.i2cBus = bus; }
    detachSPIBus()    { this.spiBus = null; }
    detachI2CBus()    { this.i2cBus = null; }

    // ================================================================
    //  READ
    // ================================================================

    read(addr) {
        if (addr === this.bufReg) {
            // Lettura SSPBUF clears BF
            this.cpu.ram[this.statReg] &= ~0x01; // Clear BF
            return this.cpu.ram[this.bufReg];
        }
        if (addr === this.conReg) {
            return this.cpu.ram[this.conReg];
        }
        return this.cpu.ram[addr];
    }

    // ================================================================
    //  WRITE
    // ================================================================

    write(addr, value) {
        value &= 0xFF;

        if (addr === this.bufReg) {
            this._writeSSPBUF(value);
            return;
        }

        if (addr === this.con2Reg) {
            this._writeSSPCON2(value);
            return;
        }

        this.cpu.ram[addr] = value;

        if (addr === this.conReg) {
            this.notifyRegisterChange('SSPCON', value);
        } else if (addr === this.statReg) {
            // SSPSTAT: solo bit 6,7 scrivibili (CKE, SMP)
            this.cpu.ram[this.statReg] = (this.cpu.ram[this.statReg] & 0x3F) | (value & 0xC0);
        } else if (addr === this.addReg) {
            this.notifyRegisterChange('SSPADD', value);
        }
    }

    _writeSSPBUF(value) {
        var sspcon = this.cpu.ram[this.conReg];
        if (!(sspcon & 0x20)) return; // SSPEN must be set

        var mode = sspcon & 0x0F;
        this.cpu.ram[this.bufReg] = value;

        if (mode <= 0x05) {
            // SPI mode: avvia trasferimento
            this._startSPITransfer(value, mode);
        } else if (mode === 0x08 || mode === 0x0B) {
            // I²C Master: scrive dato sul bus
            this._i2cMasterWriteByte(value);
        }
    }

    _writeSSPCON2(value) {
        var old = this.cpu.ram[this.con2Reg];
        this.cpu.ram[this.con2Reg] = value;

        var sspcon = this.cpu.ram[this.conReg];
        if (!(sspcon & 0x20)) return;
        var mode = sspcon & 0x0F;
        if (mode !== 0x08 && mode !== 0x0B) return; // Solo I²C master

        // Detect bit che passano da 0→1
        var rising = value & ~old;

        if (rising & 0x01) this._i2cStartCondition();   // SEN
        if (rising & 0x02) this._i2cRestartCondition();  // RSEN
        if (rising & 0x04) this._i2cStopCondition();     // PEN
        if (rising & 0x08) this._i2cReceiveEnable();     // RCEN
        if (rising & 0x10) this._i2cAckSequence();       // ACKEN
    }

    // ================================================================
    //  SPI
    // ================================================================

    _startSPITransfer(byteOut, mode) {
        this.spiByteOut = byteOut;
        this.spiTransferring = true;

        // Cicli per trasferimento (8 bit)
        var cyclePer;
        switch (mode & 0x03) {
            case 0: cyclePer = 4;  break; // Fosc/4
            case 1: cyclePer = 16; break; // Fosc/16
            case 2: cyclePer = 64; break; // Fosc/64
            case 3: cyclePer = 8;  break; // TMR2/2 (approx)
        }
        this.spiCyclesLeft = cyclePer * 8;

        // Clear BF
        this.cpu.ram[this.statReg] &= ~0x01;
    }

    _completeSPITransfer() {
        this.spiTransferring = false;
        var byteIn = 0xFF;

        // Scambia byte col bus SPI
        if (this.spiBus) {
            byteIn = this.spiBus.transfer(this.spiByteOut);
        }

        // Risultato in SSPBUF
        this.cpu.ram[this.bufReg] = byteIn;

        // Set BF + SSPIF
        this.cpu.ram[this.statReg] |= 0x01;
        this.cpu.ram[this.pirAddr] |= (1 << this.pirBit);

        this._logTransfer('SPI', this.spiByteOut, byteIn);
    }

    /**
     * Ricezione SPI slave: byte iniettato dall'esterno.
     */
    receiveSPI(byteIn) {
        var sspcon = this.cpu.ram[this.conReg];
        if (!(sspcon & 0x20)) return;
        var mode = sspcon & 0x0F;
        if (mode !== 0x04 && mode !== 0x05) return;

        this.cpu.ram[this.bufReg] = byteIn;
        this.cpu.ram[this.statReg] |= 0x01; // BF
        this.cpu.ram[this.pirAddr] |= (1 << this.pirBit);
        this._logTransfer('SPI_RX', 0, byteIn);
    }

    // ================================================================
    //  I²C MASTER
    // ================================================================

    _i2cStartCondition() {
        this.i2cState = 'START';
        this.i2cCyclesLeft = this._i2cBitTime();

        if (this.i2cBus) this.i2cBus.start();

        // Set S bit in SSPSTAT
        this.cpu.ram[this.statReg] |= 0x08;
        this.cpu.ram[this.statReg] &= ~0x10; // Clear P
    }

    _i2cRestartCondition() {
        this.i2cState = 'START';
        this.i2cCyclesLeft = this._i2cBitTime();
        if (this.i2cBus) this.i2cBus.start();
        this.cpu.ram[this.statReg] |= 0x08;
    }

    _i2cStopCondition() {
        this.i2cState = 'IDLE';
        this.i2cCyclesLeft = this._i2cBitTime();
        if (this.i2cBus) this.i2cBus.stop();

        // Set P, clear S
        this.cpu.ram[this.statReg] |= 0x10;
        this.cpu.ram[this.statReg] &= ~0x08;

        // Clear PEN, set SSPIF
        this.cpu.ram[this.con2Reg] &= ~0x04;
        this.cpu.ram[this.pirAddr] |= (1 << this.pirBit);
    }

    _i2cMasterWriteByte(value) {
        if (this.i2cState === 'START') {
            // Primo byte dopo START = indirizzo
            this.i2cAddress = (value >> 1) & 0x7F;
            this.i2cRW = value & 0x01;
            this.cpu.ram[this.statReg] = (this.cpu.ram[this.statReg] & ~0x04) |
                (this.i2cRW ? 0x04 : 0x00); // R/W bit
            this.cpu.ram[this.statReg] &= ~0x20; // D/A = 0 (address)
        } else {
            this.cpu.ram[this.statReg] |= 0x20; // D/A = 1 (data)
        }

        var ack = true;
        if (this.i2cBus) {
            ack = this.i2cBus.write(value);
        }

        // ACKSTAT: 0=ACK ricevuto, 1=NACK
        if (ack) this.cpu.ram[this.con2Reg] &= ~0x40;
        else this.cpu.ram[this.con2Reg] |= 0x40;

        this.i2cState = 'DATA_TX';

        // Set BF temporaneamente, poi clear + SSPIF
        this.cpu.ram[this.statReg] &= ~0x01; // Clear BF (trasmissione completata)
        this.cpu.ram[this.pirAddr] |= (1 << this.pirBit);

        this._logTransfer('I2C_TX', value, ack ? 0 : 1);
    }

    _i2cReceiveEnable() {
        // RCEN: abilita ricezione di un byte dal bus
        this.i2cState = 'DATA_RX';
        this.i2cCyclesLeft = this._i2cBitTime() * 9; // 8 data + 1 ack

        var byteIn = 0xFF;
        if (this.i2cBus) {
            byteIn = this.i2cBus.read();
        }

        this.cpu.ram[this.bufReg] = byteIn;
        this.cpu.ram[this.statReg] |= 0x01; // BF
        this.cpu.ram[this.statReg] |= 0x20; // D/A = 1

        // Clear RCEN
        this.cpu.ram[this.con2Reg] &= ~0x08;

        // SSPIF
        this.cpu.ram[this.pirAddr] |= (1 << this.pirBit);

        this._logTransfer('I2C_RX', 0, byteIn);
    }

    _i2cAckSequence() {
        // Invia ACK/NACK basato su ACKDT (bit 5)
        var ackdt = (this.cpu.ram[this.con2Reg] >> 5) & 0x01;
        if (this.i2cBus) {
            this.i2cBus.ack(!ackdt); // ACKDT=0 → ACK, ACKDT=1 → NACK
        }

        // Clear ACKEN
        this.cpu.ram[this.con2Reg] &= ~0x10;

        // SSPIF
        this.cpu.ram[this.pirAddr] |= (1 << this.pirBit);
    }

    _i2cBitTime() {
        // Cicli per un bit I²C = 4 * (SSPADD + 1)
        return 4 * ((this.cpu.ram[this.addReg] & 0x7F) + 1);
    }

    /**
     * Ricezione I²C slave: dato iniettato dall'esterno.
     */
    receiveI2C(value) {
        var sspcon = this.cpu.ram[this.conReg];
        if (!(sspcon & 0x20)) return;
        var mode = sspcon & 0x0F;
        if (mode !== 0x06 && mode !== 0x07) return;

        this.cpu.ram[this.bufReg] = value;
        this.cpu.ram[this.statReg] |= 0x01; // BF
        this.cpu.ram[this.pirAddr] |= (1 << this.pirBit);
        this._logTransfer('I2C_SLAVE_RX', 0, value);
    }

    // ================================================================
    //  TICK
    // ================================================================

    tick(cycles) {
        // SPI transfer countdown
        if (this.spiTransferring) {
            this.spiCyclesLeft--;
            if (this.spiCyclesLeft <= 0) {
                this._completeSPITransfer();
            }
        }

        // I²C: countdown per operazioni asincrone (START/STOP)
        if (this.i2cCyclesLeft > 0) {
            this.i2cCyclesLeft--;
            if (this.i2cCyclesLeft <= 0) {
                // Operazione completata
                if (this.i2cState === 'START') {
                    this.cpu.ram[this.con2Reg] &= ~0x03; // Clear SEN, RSEN
                    this.cpu.ram[this.pirAddr] |= (1 << this.pirBit);
                }
            }
        }
    }

    // ================================================================
    //  LOG & DEBUG
    // ================================================================

    _logTransfer(type, out, inVal) {
        if (this.transferLog.length >= this.maxLogSize) {
            this.transferLog.shift();
        }
        var entry = { type: type, out: out, in: inVal, cycle: this.cpu.cycles };
        this.transferLog.push(entry);

        if (this.onTransfer) this.onTransfer(entry);
    }

    getTransferLog() { return this.transferLog.slice(); }
    clearLog() { this.transferLog = []; }

    getMode() {
        var sspcon = this.cpu.ram[this.conReg];
        if (!(sspcon & 0x20)) return 'disabled';
        var mode = sspcon & 0x0F;
        if (mode <= 0x03) return 'spi_master';
        if (mode <= 0x05) return 'spi_slave';
        if (mode <= 0x07) return 'i2c_slave';
        if (mode === 0x08 || mode === 0x0B) return 'i2c_master';
        return 'unknown';
    }

    _resolveReg(name, defaultAddr) {
        var map = { 'PIR1': 0x0C, 'PIR2': 0x0D, 'PIE1': 0x8C, 'PIE2': 0x8D };
        return (name && map[name] !== undefined) ? map[name] : defaultAddr;
    }

    getState() {
        return {
            mode: this.getMode(),
            modeRaw: this.cpu.ram[this.conReg] & 0x0F,
            enabled: !!(this.cpu.ram[this.conReg] & 0x20),
            bufferFull: !!(this.cpu.ram[this.statReg] & 0x01),
            i2cState: this.i2cState,
            spiTransferring: this.spiTransferring,
            hasSPIBus: !!this.spiBus,
            hasI2CBus: !!this.i2cBus,
            logSize: this.transferLog.length
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PIC16MSSP;
}
