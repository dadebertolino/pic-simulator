/**
 * VirtualRGBLed — Single RGB LED (common cathode)
 * 3 pins: R, G, B — PWM duty cycle controls brightness per channel.
 */
class VirtualRGBLed {
    constructor() {
        this.name = 'RGB LED';
        this.r = 0; this.g = 0; this.b = 0; // 0-255
        this._ch = [
            { high: 0, total: 0, window: 100, val: 0 },
            { high: 0, total: 0, window: 100, val: 0 },
            { high: 0, total: 0, window: 100, val: 0 }
        ];
    }

    tick(rPin, gPin, bPin) {
        this._tickCh(0, rPin);
        this._tickCh(1, gPin);
        this._tickCh(2, bPin);
        this.r = this._ch[0].val;
        this.g = this._ch[1].val;
        this.b = this._ch[2].val;
    }

    _tickCh(ch, pin) {
        var c = this._ch[ch];
        c.total++;
        if (pin) c.high++;
        if (c.total >= c.window) {
            c.val = Math.round((c.high / c.total) * 255);
            c.high = 0;
            c.total = 0;
        }
    }

    getHex() {
        return '#' + this._hex(this.r) + this._hex(this.g) + this._hex(this.b);
    }

    _hex(v) { return v.toString(16).toUpperCase().padStart(2, '0'); }

    getState() {
        return { r: this.r, g: this.g, b: this.b, hex: this.getHex() };
    }
}
