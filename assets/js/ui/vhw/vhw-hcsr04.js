/**
 * VHW HC-SR04 — Ultrasonic distance sensor UI
 * Slider distanza, barra echo, visualizzazione timing.
 */
class VHWHCSR04 {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.trigPort = cfg.trigPort || 'B';
        this.trigPin = parseInt(cfg.trigPin) || 0;
        this.echoPort = cfg.echoPort || 'B';
        this.echoPin = parseInt(cfg.echoPin) || 1;
        this.initDist = parseFloat(cfg.dist) || 20;
        this.name = 'HC-SR04 [T=R' + this.trigPort + this.trigPin + ' E=R' + this.echoPort + this.echoPin + ']';
        this._sensor = null;
        this._gpio = null;
        this._lastMeasured = 0;
    }

    render(container) {
        container.innerHTML =
            '<div class="pic-vhw-sensor">' +
            '<div class="pic-sensor-readings">' +
            '<div class="pic-sensor-reading"><span class="pic-sensor-icon">\uD83D\uDCCF</span>' +
            '<span class="pic-sensor-value pic-hcsr04-val" id="' + this.id + '-dist">' + this.initDist.toFixed(1) + '</span>' +
            '<span class="pic-sensor-unit">cm</span></div></div>' +
            '<div class="pic-hcsr04-bar-wrap">' +
            '<div class="pic-hcsr04-bar" id="' + this.id + '-bar"><div class="pic-hcsr04-fill" id="' + this.id + '-fill"></div></div>' +
            '<div class="pic-hcsr04-marks"><span>2</span><span>100</span><span>200</span><span>300</span><span>400</span></div></div>' +
            '<div class="pic-sensor-slider"><label>Dist</label>' +
            '<input type="range" class="pic-adc-slider" id="' + this.id + '-slider" min="2" max="400" value="' + this.initDist + '" step="0.5">' +
            '<span class="pic-bmp-slider-val" id="' + this.id + '-sval">' + this.initDist + ' cm</span></div>' +
            '<div class="pic-hcsr04-timing" id="' + this.id + '-timing">Echo: ' + Math.round(this.initDist * 58) + ' \u00B5s</div>' +
            '<div class="pic-sensor-status" id="' + this.id + '-status">Trig=R' + this.trigPort + this.trigPin + ' Echo=R' + this.echoPort + this.echoPin + '</div>' +
            '</div>';

        this._attach();

        var self = this;
        document.getElementById(this.id + '-slider')?.addEventListener('input', function() {
            var v = parseFloat(this.value);
            if (self._sensor) self._sensor.setDistance(v);
            var s = document.getElementById(self.id + '-sval');
            if (s) s.textContent = v.toFixed(1) + ' cm';
        });
    }

    _attach() {
        if (typeof VirtualHCSR04 === 'undefined') return;
        this._sensor = new VirtualHCSR04();
        this._sensor.setDistance(this.initDist);

        var trigGpio = this.hw.cpu.getPeripheral('GPIO_' + this.trigPort);
        var echoGpio = this.hw.cpu.getPeripheral('GPIO_' + this.echoPort);
        if (!trigGpio) return;

        var sensor = this._sensor;
        var trigPin = this.trigPin;
        var echoPin = this.echoPin;
        var echoG = echoGpio || trigGpio;

        // Hook tick: read trigger, tick sensor, write echo
        if (!trigGpio._hcsrTicks) trigGpio._hcsrTicks = [];
        trigGpio._hcsrTicks.push({ sensor: sensor, trigPin: trigPin, echoGpio: echoG, echoPin: echoPin });

        if (!trigGpio._hcsrTickHooked) {
            trigGpio._hcsrTickHooked = true;
            var origTick = trigGpio.tick ? trigGpio.tick.bind(trigGpio) : null;
            trigGpio.tick = function(cycles) {
                if (origTick) origTick(cycles);
                var tris = trigGpio.cpu.ram[trigGpio.trisAddr];
                var data = trigGpio.cpu.ram[trigGpio.dataAddr];
                for (var i = 0; i < trigGpio._hcsrTicks.length; i++) {
                    var h = trigGpio._hcsrTicks[i];
                    // Read trigger pin (output from PIC)
                    var trigVal = !((tris >> h.trigPin) & 1) ? ((data >> h.trigPin) & 1) : 0;
                    // Tick sensor
                    var echoVal = h.sensor.tick(trigVal);
                    // Write echo to external input
                    h.echoGpio.setExternalPin(h.echoPin, echoVal);
                }
            };
        }
    }

    update() {
        if (!this._sensor) return;
        var state = this._sensor.getState();

        var distEl = document.getElementById(this.id + '-dist');
        if (distEl) distEl.textContent = state.distance.toFixed(1);

        var fillEl = document.getElementById(this.id + '-fill');
        if (fillEl) {
            var pct = ((state.distance - 2) / 398) * 100;
            fillEl.style.width = pct + '%';
            // Color: green < 100, yellow < 200, orange < 300, red > 300
            var color = pct < 25 ? '#3fb950' : pct < 50 ? '#f59e0b' : pct < 75 ? '#ff6b35' : '#ef4444';
            fillEl.style.background = color;
        }

        var timingEl = document.getElementById(this.id + '-timing');
        if (timingEl) {
            timingEl.textContent = 'Echo: ' + state.echoPulse + ' \u00B5s | State: ' + state.state;
        }
    }

    destroy() {
        var trigGpio = this.hw.cpu.getPeripheral('GPIO_' + this.trigPort);
        if (trigGpio && trigGpio._hcsrTicks && this._sensor) {
            var idx = trigGpio._hcsrTicks.findIndex(function(h) { return h.sensor === this._sensor; }.bind(this));
            if (idx >= 0) trigGpio._hcsrTicks.splice(idx, 1);
        }
    }
}
