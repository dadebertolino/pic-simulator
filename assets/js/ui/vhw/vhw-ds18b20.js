/**
 * VHW DS18B20 — 1-Wire Temperature Sensor UI
 * Hooks into GPIO write() and read() for real-time timing detection.
 */
class VHWDS18B20 {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.port = cfg.port || 'A';
        this.pin = parseInt(cfg.pin) || 0;
        this.initTemp = parseFloat(cfg.temp) || 25;
        this.serial = cfg.serial || '000000000001';
        this.name = 'DS18B20 [R' + this.port + this.pin + ']';
        this._device = null;
        this._bus = null;
        this._busLog = [];
        this._gpio = null;
        this._origWrite = null;
        this._origRead = null;
        this._origTick = null;
        this._lastPinVal = 1;
    }

    render(container) {
        container.innerHTML =
            '<div class="pic-vhw-sensor">' +
            '<div class="pic-sensor-readings">' +
            '<div class="pic-sensor-reading"><span class="pic-sensor-icon">\uD83C\uDF21</span>' +
            '<span class="pic-sensor-value" id="' + this.id + '-temp">' + this.initTemp.toFixed(2) + '</span>' +
            '<span class="pic-sensor-unit">\u00B0C</span></div>' +
            '<div class="pic-ds-res" id="' + this.id + '-res">12-bit</div></div>' +
            '<div class="pic-sensor-slider"><label>Temp</label>' +
            '<input type="range" class="pic-adc-slider" id="' + this.id + '-slider" min="-55" max="125" value="' + this.initTemp + '" step="0.0625">' +
            '<span class="pic-bmp-slider-val" id="' + this.id + '-sval">' + this.initTemp + '\u00B0C</span></div>' +
            '<div class="pic-ds-rom" id="' + this.id + '-rom">ROM: --</div>' +
            '<details class="pic-lcd-debug"><summary>Scratchpad & Bus</summary>' +
            '<div class="pic-lcd-debug-body">' +
            '<div class="pic-ds-scratch" id="' + this.id + '-scratch"></div>' +
            '<div class="pic-ds-buslog" id="' + this.id + '-log"></div>' +
            '</div></details>' +
            '<div class="pic-sensor-status" id="' + this.id + '-status">1-Wire on R' + this.port + this.pin + '</div>' +
            '</div>';

        this._attach();

        var self = this;
        document.getElementById(this.id + '-slider')?.addEventListener('input', function() {
            var v = parseFloat(this.value);
            if (self._device) self._device.setTemperature(v);
            var s = document.getElementById(self.id + '-sval');
            if (s) s.textContent = v.toFixed(2) + '\u00B0C';
        });
    }

    _attach() {
        if (typeof VirtualOneWireBus === 'undefined' || typeof VirtualDS18B20 === 'undefined') return;

        this._bus = new VirtualOneWireBus();
        this._device = new VirtualDS18B20(this.serial);
        this._device.setTemperature(this.initTemp);
        this._bus.attach(this._device);

        this._gpio = this.hw.cpu.getPeripheral('GPIO_' + this.port);
        if (!this._gpio) return;

        var bus = this._bus;
        var pin = this.pin;
        var self = this;

        // === HOOK 1: GPIO write() — intercetta ogni BCF/BSF TRIS/PORT ===
        this._origWrite = this._gpio.write.bind(this._gpio);
        this._gpio.write = function(addr, value) {
            self._origWrite(addr, value);
            self._updateBusFromGPIO();
        };

        // === HOOK 2: GPIO read() — quando PIC legge il pin, restituisci stato bus ===
        this._origRead = this._gpio.read.bind(this._gpio);
        this._gpio.read = function(addr) {
            // Prima di leggere, aggiorna externalValue dal bus
            if (addr === self._gpio.dataAddr) {
                var busVal = bus.pinRead();
                if (busVal) {
                    self._gpio.externalValue |= (1 << pin);
                } else {
                    self._gpio.externalValue &= ~(1 << pin);
                }
            }
            return self._origRead(addr);
        };

        // === HOOK 3: tick() — avanza il bus ad ogni ciclo CPU ===
        this._origTick = this._gpio.tick ? this._gpio.tick.bind(this._gpio) : null;
        var existingOwTick = this._gpio._owTick;
        this._gpio._owTick = this._gpio._owTick || [];
        this._gpio._owTick.push(bus);

        if (!this._gpio._owTickHooked) {
            this._gpio._owTickHooked = true;
            var origT = this._origTick;
            this._gpio.tick = function(cycles) {
                if (origT) origT(cycles);
                var buses = self._gpio._owTick;
                if (buses) {
                    for (var i = 0; i < buses.length; i++) {
                        buses[i].tick();
                    }
                }
                // Update pin from bus each tick
                self._updateBusFromGPIO();
            };
        }

        // Bus event log
        bus.onBusEvent = function(event, data) {
            var msg = '';
            switch (event) {
                case 'reset': msg = 'RESET'; break;
                case 'presence': msg = 'PRESENCE (' + data.devices + ' dev)'; break;
                case 'romCmd':
                    var cmds = { 0xCC: 'SKIP ROM', 0x33: 'READ ROM', 0x55: 'MATCH ROM', 0xF0: 'SEARCH' };
                    msg = 'ROM: ' + (cmds[data.cmd] || '0x' + data.cmd.toString(16).toUpperCase());
                    break;
                case 'deviceCmd':
                    var dcmds = { 0x44: 'CONVERT T', 0xBE: 'READ SCRATCHPAD', 0x4E: 'WRITE SCRATCHPAD',
                                  0x48: 'COPY SP\u2192EE', 0xB8: 'RECALL EE', 0xB4: 'READ POWER' };
                    msg = 'CMD: ' + (dcmds[data.cmd] || '0x' + data.cmd.toString(16).toUpperCase());
                    break;
                case 'matchRom':
                    msg = 'MATCH: ' + data.rom + (data.found ? ' OK' : ' NOT FOUND');
                    break;
            }
            if (msg) {
                self._busLog.push(msg);
                if (self._busLog.length > 15) self._busLog.shift();
            }
        };

        // Render ROM
        var romEl = document.getElementById(this.id + '-rom');
        if (romEl) {
            var rc = this._device.romCode;
            romEl.textContent = 'ROM: ' + rc.match(/.{2}/g).join(' ');
        }
    }

    /**
     * Determina lo stato del pin e notifica il bus.
     * Pin output (TRIS=0): valore = latch (PORT bit)
     * Pin input (TRIS=1): bus released → pull-up → high
     */
    _updateBusFromGPIO() {
        if (!this._gpio || !this._bus) return;
        var tris = this.hw.cpu.ram[this._gpio.trisAddr];
        var data = this.hw.cpu.ram[this._gpio.dataAddr];
        var pinIsOutput = !((tris >> this.pin) & 1);
        var pinVal;
        if (pinIsOutput) {
            pinVal = (data >> this.pin) & 1;
        } else {
            // Input: bus è released (pull-up → 1), a meno che device non tiri basso
            pinVal = this._bus.pinRead();
        }
        if (pinVal !== this._lastPinVal) {
            this._bus.pinWrite(pinVal);
            this._lastPinVal = pinVal;
        }
    }

    update() {
        if (!this._device) return;

        var el = document.getElementById(this.id + '-temp');
        if (el) el.textContent = this._device.getTemperature().toFixed(2);

        var resEl = document.getElementById(this.id + '-res');
        if (resEl) resEl.textContent = this._device.getResolution() + '-bit';

        // Scratchpad
        var spEl = document.getElementById(this.id + '-scratch');
        if (spEl) {
            var sp = this._device.scratchpad;
            var hex = function(v) { return v.toString(16).toUpperCase().padStart(2, '0'); };
            var raw16 = sp[0] | (sp[1] << 8);
            var rawSigned = raw16 > 32767 ? raw16 - 65536 : raw16;
            spEl.innerHTML =
                '<div class="dbg-data">Temp: ' + hex(sp[1]) + ' ' + hex(sp[0]) +
                ' (raw: ' + rawSigned + ' \u2192 ' + (rawSigned * 0.0625).toFixed(4) + '\u00B0C)</div>' +
                '<div class="dbg-cmd">TH: ' + hex(sp[2]) + ' (' + sp[2] + '\u00B0C) | TL: ' + hex(sp[3]) + ' (' + sp[3] + '\u00B0C)</div>' +
                '<div class="dbg-cmd">Config: ' + hex(sp[4]) + ' (' + this._device.getResolution() + '-bit)</div>' +
                '<div class="dbg-data" style="margin-top:2px">SP: ' + Array.from(sp).map(hex).join(' ') + '</div>';
        }

        // Bus log
        var logEl = document.getElementById(this.id + '-log');
        if (logEl && this._busLog.length > 0) {
            logEl.innerHTML = this._busLog.map(function(m) {
                var cls = m.startsWith('CMD') ? 'dbg-data' : 'dbg-cmd';
                return '<div class="' + cls + '">' + m + '</div>';
            }).join('');
        }
    }

    destroy() {
        // Ripristina GPIO originale
        if (this._gpio) {
            if (this._origWrite) this._gpio.write = this._origWrite;
            if (this._origRead) this._gpio.read = this._origRead;
            if (this._gpio._owTick && this._bus) {
                var idx = this._gpio._owTick.indexOf(this._bus);
                if (idx >= 0) this._gpio._owTick.splice(idx, 1);
            }
        }
    }
}
