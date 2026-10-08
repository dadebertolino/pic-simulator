/**
 * VirtualWS2812 — Addressable RGB LED Strip (WS2811/WS2812B/NeoPixel)
 *
 * Protocol: single-wire, bit-banging
 * Bit 1: HIGH ~800ns, LOW ~450ns (total ~1.25µs)
 * Bit 0: HIGH ~400ns, LOW ~850ns (total ~1.25µs)
 * Reset: LOW > 50µs → latch data
 *
 * Data format: 24 bits per LED (GRB order), MSB first
 * G7-G0, R7-R0, B7-B0
 *
 * At 4MHz: 1 cycle = 1µs (0.25µs per cycle at actual speed)
 * Thresholds are relaxed for simulator timing.
 */
class VirtualWS2812 {
    constructor(numLeds) {
        this.name = 'WS2812B Strip';
        this.numLeds = numLeds || 8;
        // LED colors: array of {r, g, b} 0-255
        this.leds = [];
        for (var i = 0; i < this.numLeds; i++) {
            this.leds.push({ r: 0, g: 0, b: 0 });
        }

        // Timing state
        this._pinPrev = 0;
        this._highCycles = 0;
        this._lowCycles = 0;
        this._bitBuffer = [];       // Received bits
        this._byteBuffer = [];      // Received bytes
        this._latched = false;

        // Thresholds (relaxed for 4MHz PIC)
        // At 4MHz: 1 cycle ≈ 1µs but instructions take 1-2 cycles
        // Real timing: 0.4µs/0.8µs but we use cycle counts
        this.BIT1_MIN_HIGH = 3;    // Min cycles HIGH for bit 1
        this.BIT0_MAX_HIGH = 2;    // Max cycles HIGH for bit 0
        this.RESET_MIN_LOW = 25;   // Min cycles LOW for reset/latch
    }

    /**
     * Tick: chiamato ad ogni ciclo CPU con lo stato del pin.
     * @param {number} pinValue - 0 o 1
     */
    tick(pinValue) {
        if (pinValue) {
            this._highCycles++;
            // Se eravamo LOW abbastanza a lungo → reset/latch
            if (this._pinPrev === 0 && this._lowCycles >= this.RESET_MIN_LOW) {
                this._latchData();
            }
            this._lowCycles = 0;
        } else {
            this._lowCycles++;
            // Falling edge: bit completo
            if (this._pinPrev === 1 && this._highCycles > 0) {
                var bit = (this._highCycles >= this.BIT1_MIN_HIGH) ? 1 : 0;
                this._bitBuffer.push(bit);
                // Byte completo (8 bit, MSB first)
                if (this._bitBuffer.length === 8) {
                    var byte = 0;
                    for (var i = 0; i < 8; i++) {
                        byte = (byte << 1) | this._bitBuffer[i];
                    }
                    this._byteBuffer.push(byte);
                    this._bitBuffer = [];
                }
            }
            this._highCycles = 0;
        }
        this._pinPrev = pinValue;
    }

    /**
     * Latch: applica i byte ricevuti ai LED (GRB order).
     */
    _latchData() {
        if (this._byteBuffer.length < 3) {
            this._byteBuffer = [];
            this._bitBuffer = [];
            return;
        }

        var numComplete = Math.floor(this._byteBuffer.length / 3);
        var count = Math.min(numComplete, this.numLeds);

        for (var i = 0; i < count; i++) {
            var g = this._byteBuffer[i * 3];
            var r = this._byteBuffer[i * 3 + 1];
            var b = this._byteBuffer[i * 3 + 2];
            this.leds[i] = { r: r, g: g, b: b };
        }

        this._byteBuffer = [];
        this._bitBuffer = [];
        this._latched = true;
    }

    /**
     * Imposta un LED direttamente (per test).
     */
    setLed(index, r, g, b) {
        if (index >= 0 && index < this.numLeds) {
            this.leds[index] = { r: r & 0xFF, g: g & 0xFF, b: b & 0xFF };
        }
    }

    getState() {
        return {
            numLeds: this.numLeds,
            leds: this.leds.slice(),
            bytesReceived: this._byteBuffer.length,
            bitsReceived: this._bitBuffer.length
        };
    }
}
