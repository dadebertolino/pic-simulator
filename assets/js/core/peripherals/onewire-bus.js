/**
 * Virtual 1-Wire Bus
 * Emula il protocollo 1-Wire intercettando le transizioni GPIO.
 *
 * Protocollo 1-Wire timing (standard speed):
 * - RESET pulse: master pulls low ≥480µs, releases, device pulls low 60-240µs (presence)
 * - WRITE 0: master pulls low 60-120µs
 * - WRITE 1: master pulls low 1-15µs, releases rest of 60µs slot
 * - READ: master pulls low 1-15µs, samples at ~15µs, device drives 0 or releases for 1
 *
 * Nel simulatore, contiamo cicli CPU. A 4MHz → 1µs = 1 ciclo.
 * I timing sono rilassati per tollerare implementazioni ASM imprecise.
 */

class VirtualOneWireBus {
    constructor() {
        /** @type {Map<string, VirtualOneWireDevice>} ROM code (hex string) → device */
        this.devices = new Map();

        // Stato bus
        this._pinState = 1;         // Stato corrente del pin (1=idle, 0=pulled low)
        this._prevPinState = 1;
        this._lowCycles = 0;        // Contatore cicli pin basso
        this._highCycles = 0;       // Contatore cicli pin alto
        this._state = 'IDLE';       // IDLE, RESET_WAIT, PRESENCE, ROM_CMD, DEVICE_CMD, READ_BIT, WRITE_BIT

        // Comunicazione
        this._bitBuffer = [];       // Bit ricevuti
        this._byteCount = 0;
        this._currentCmd = 0;
        this._selectedDevice = null;
        this._searchState = null;

        // Risposta device
        this._responseBits = [];    // Bit che il device vuole trasmettere
        this._responseIndex = 0;
        this._slotBit = 1;          // Livello imposto dal device nello slot di lettura corrente
        this._slotIsRead = false;

        // Thresholds (in cicli CPU, standard speed @ 4MHz)
        this.RESET_MIN = 200;       // Min cicli low per reset (rilassato da 480)
        this.WRITE0_MIN = 30;       // Min cicli low per write 0
        this.WRITE1_MAX = 20;       // Max cicli low per write 1 / read init
        this.SLOT_TIME = 70;        // Durata totale time slot

        // Callback UI
        this.onBusEvent = null;     // function(event, data)
    }

    /**
     * Collega un device 1-Wire al bus.
     * @param {VirtualOneWireDevice} device
     */
    attach(device) {
        this.devices.set(device.romCode, device);
    }

    detach(romCode) {
        this.devices.delete(romCode);
    }

    /**
     * Chiamato dal GPIO ad ogni cambio del pin 1-Wire.
     * @param {number} pinValue - 0 o 1
     */
    pinWrite(pinValue) {
        this._prevPinState = this._pinState;
        this._pinState = pinValue;

        if (this._prevPinState === 1 && pinValue === 0) {
            // Falling edge: master pulls low. Se il device ha bit da
            // trasmettere, questo e' uno slot di lettura e il bit e' quello
            // che il master campionera' dopo il rilascio (~15 us).
            this._highCycles = 0;
            this._lowCycles = 0;
            this._slotIsRead = this._responseBits.length > 0 && this._responseIndex < this._responseBits.length;
            this._slotBit = this._slotIsRead ? this._responseBits[this._responseIndex++] : 1;
        } else if (this._prevPinState === 0 && pinValue === 1) {
            // Rising edge: master releases
            this._processSlot(this._lowCycles);
            this._lowCycles = 0;
        }
    }

    /**
     * Chiamato dal GPIO per leggere il pin (master read).
     * Se un device sta rispondendo, il bus può essere tirato basso.
     * @returns {number} 0 o 1
     */
    pinRead() {
        // Impulso di presenza dopo un reset: il device tiene la linea bassa
        if (this._state === 'PRESENCE') return 0;
        // Slot di lettura: il bit fissato al fronte di discesa (1 = linea rilasciata)
        return this._slotBit;
    }

    /**
     * Tick: chiamato ad ogni ciclo CPU.
     */
    tick() {
        if (this._pinState === 0) {
            this._lowCycles++;
        } else {
            this._highCycles++;
            // Finito lo slot il device rilascia la linea
            if (this._highCycles > 45) this._slotBit = 1;
        }

        // Presenza: dopo reset, il device tira basso dopo ~15-60µs per 60-240µs
        if (this._state === 'PRESENCE_WAIT' && this._highCycles > 15) {
            this._state = 'PRESENCE';
            this._presenceCycles = 0;
        }
        if (this._state === 'PRESENCE') {
            this._presenceCycles++;
            if (this._presenceCycles > 120) {
                this._state = 'ROM_CMD';
                this._bitBuffer = [];
                this._emit('presence', { devices: this.devices.size });
            }
        }
    }

    /**
     * Processa un time slot basandosi sulla durata del low pulse.
     */
    _processSlot(lowCycles) {
        // RESET detection
        if (lowCycles >= this.RESET_MIN) {
            this._state = 'PRESENCE_WAIT';
            this._highCycles = 0;
            this._selectedDevice = null;
            this._bitBuffer = [];
            this._responseBits = [];
            this._responseIndex = 0;
            // Notifica tutti i device
            this.devices.forEach(function(dev) { dev.onReset(); });
            this._emit('reset', {});
            return;
        }

        // Durante PRESENCE non processiamo slot normali
        if (this._state === 'PRESENCE_WAIT' || this._state === 'PRESENCE') return;

        // Time slot: write o read
        if (this._state === 'ROM_CMD' || this._state === 'DEVICE_CMD') {
            if (this._slotIsRead) {
                // READ slot: il bit e' stato scelto al fronte di discesa
                this._slotIsRead = false;
                if (this._responseIndex >= this._responseBits.length) {
                    this._responseBits = [];
                    this._responseIndex = 0;
                }
            } else {
                // WRITE slot: determina bit dal timing
                var bit = (lowCycles <= this.WRITE1_MAX) ? 1 : 0;
                this._bitBuffer.push(bit);

                // Byte completo
                if (this._bitBuffer.length === 8) {
                    var byte = 0;
                    for (var i = 0; i < 8; i++) {
                        byte |= (this._bitBuffer[i] << i); // LSB first
                    }
                    this._bitBuffer = [];
                    this._processByte(byte);
                }
            }
        }
    }

    /**
     * Processa un byte ricevuto (dopo 8 bit).
     */
    _processByte(byte) {
        if (this._state === 'ROM_CMD') {
            this._currentCmd = byte;
            this._emit('romCmd', { cmd: byte });

            switch (byte) {
                case 0xCC: // SKIP ROM: seleziona tutti i device
                    this._selectedDevice = this.devices.values().next().value || null;
                    this._state = 'DEVICE_CMD';
                    break;

                case 0x33: // READ ROM: device invia 8 byte ROM code
                    if (this.devices.size === 1) {
                        var dev = this.devices.values().next().value;
                        this._selectedDevice = dev;
                        this._sendROMCode(dev);
                    }
                    break;

                case 0x55: // MATCH ROM: master invia 8 byte, seleziona device specifico
                    this._matchBuffer = [];
                    this._state = 'MATCH_ROM';
                    break;

                case 0xF0: // SEARCH ROM
                    // Simplified: non implementato completamente
                    this._state = 'IDLE';
                    break;

                default:
                    this._state = 'IDLE';
            }
        } else if (this._state === 'MATCH_ROM') {
            this._matchBuffer.push(byte);
            if (this._matchBuffer.length === 8) {
                var romStr = this._matchBuffer.map(function(b) {
                    return b.toString(16).toUpperCase().padStart(2, '0');
                }).join('');
                this._selectedDevice = null;
                var self = this;
                this.devices.forEach(function(dev, key) {
                    if (key === romStr) self._selectedDevice = dev;
                });
                this._state = this._selectedDevice ? 'DEVICE_CMD' : 'IDLE';
                this._emit('matchRom', { rom: romStr, found: !!this._selectedDevice });
            }
        } else if (this._state === 'DEVICE_CMD') {
            if (this._selectedDevice) {
                var response = this._selectedDevice.onCommand(byte);
                if (response && response.length > 0) {
                    this._queueResponse(response);
                }
                this._emit('deviceCmd', { cmd: byte, device: this._selectedDevice.name });
            }
        }
    }

    /**
     * Invia il ROM code del device (8 byte, LSB first per ogni byte).
     */
    _sendROMCode(device) {
        var bytes = [];
        for (var i = 0; i < device.romCode.length; i += 2) {
            bytes.push(parseInt(device.romCode.substr(i, 2), 16));
        }
        this._queueResponse(bytes);
    }

    /**
     * Prepara i bit di risposta (LSB first per ogni byte).
     */
    _queueResponse(bytes) {
        this._responseBits = [];
        for (var b = 0; b < bytes.length; b++) {
            for (var i = 0; i < 8; i++) {
                this._responseBits.push((bytes[b] >> i) & 1);
            }
        }
        this._responseIndex = 0;
    }

    _emit(event, data) {
        if (this.onBusEvent) this.onBusEvent(event, data);
    }

    getDeviceList() {
        var list = [];
        this.devices.forEach(function(dev, rom) {
            list.push({ rom: rom, name: dev.name, state: dev.getState() });
        });
        return list;
    }

    reset() {
        this._state = 'IDLE';
        this._slotBit = 1;
        this._slotIsRead = false;
        this._pinState = 1;
        this._prevPinState = 1;
        this._bitBuffer = [];
        this._responseBits = [];
        this._selectedDevice = null;
    }
}

// ================================================================
//  1-Wire DEVICE BASE CLASS
// ================================================================

class VirtualOneWireDevice {
    /**
     * @param {string} name - Nome device
     * @param {number} familyCode - Codice famiglia 1-Wire (es. 0x28 per DS18B20)
     * @param {string} serialHex - 6 byte serial in hex (es. "0000000001A2")
     */
    constructor(name, familyCode, serialHex) {
        this.name = name || '1-Wire Device';
        this.familyCode = familyCode || 0x00;
        // ROM Code: 8 byte = family(1) + serial(6) + CRC(1), LSB first
        var serial = serialHex || '000000000001';
        var romBytes = [this.familyCode];
        for (var i = 0; i < 6; i++) {
            romBytes.push(parseInt(serial.substr(i * 2, 2), 16));
        }
        romBytes.push(this._crc8(romBytes));
        this.romCode = romBytes.map(function(b) { return b.toString(16).toUpperCase().padStart(2, '0'); }).join('');
    }

    _crc8(data) {
        var crc = 0;
        for (var i = 0; i < data.length; i++) {
            var byte = data[i];
            for (var j = 0; j < 8; j++) {
                var mix = (crc ^ byte) & 0x01;
                crc >>= 1;
                if (mix) crc ^= 0x8C;
                byte >>= 1;
            }
        }
        return crc;
    }

    /** Reset ricevuto */
    onReset() {}

    /**
     * Comando device ricevuto (dopo ROM command).
     * @param {number} cmd
     * @returns {number[]|null} Byte di risposta, o null
     */
    onCommand(cmd) { return null; }

    /** Byte dati ricevuto (dopo comando) */
    onData(byte) {}

    getState() { return { name: this.name, rom: this.romCode }; }
}
