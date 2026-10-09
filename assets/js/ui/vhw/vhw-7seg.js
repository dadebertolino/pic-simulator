class VHW7Seg1 {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.port = cfg.segPort || 'B';
        this.start = parseInt(cfg.segStart) || 0;
        this.dpBit = parseInt(cfg.dpBit);
        if (isNaN(this.dpBit)) this.dpBit = 7;
        this.invert = (cfg.type === 'ca');
        this.name = '7-Seg [PORT' + this.port + ' b' + this.start + '-' + (this.start + 6) + ', dp=b' + this.dpBit + ']';
        this.el = null;
    }

    render(container) {
        this.el = document.createElement('div');
        this.el.className = 'pic-7seg';
        container.appendChild(this.el);
    }

    update() {
        if (!this.el) return;
        var raw = this.hw.getPortByte(this.port);
        var val = 0;
        for (var i = 0; i < 7; i++) {
            if (raw & (1 << (this.start + i))) val |= (1 << i);
        }
        if (raw & (1 << this.dpBit)) val |= 0x80;
        if (this.invert) val ^= 0xFF;
        this.el.innerHTML = this._svg(val);
    }

    _svg(val) {
        var on = function(bit) { return (val >> bit) & 1; };
        var c = function(bit) { return on(bit) ? '#ff3333' : '#1a1a2e'; };
        return '<svg viewBox="0 0 60 100" class="pic-7seg-svg">' +
            '<rect x="12" y="5" width="30" height="5" rx="2" fill="' + c(0) + '"/>' +
            '<rect x="43" y="10" width="5" height="30" rx="2" fill="' + c(1) + '"/>' +
            '<rect x="43" y="50" width="5" height="30" rx="2" fill="' + c(2) + '"/>' +
            '<rect x="12" y="82" width="30" height="5" rx="2" fill="' + c(3) + '"/>' +
            '<rect x="6" y="50" width="5" height="30" rx="2" fill="' + c(4) + '"/>' +
            '<rect x="6" y="10" width="5" height="30" rx="2" fill="' + c(5) + '"/>' +
            '<rect x="12" y="43" width="30" height="5" rx="2" fill="' + c(6) + '"/>' +
            '<circle cx="54" cy="87" r="3" fill="' + c(7) + '"/>' +
            '</svg>';
    }

    destroy() {}
}

// ================================================================
//  7-SEGMENT 4 DIGIT MUX (configurable)
// ================================================================

class VHW7Seg4 {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.segPort = cfg.segPort || 'B';
        this.selPort = cfg.selPort || 'A';
        this.selStart = parseInt(cfg.selStart) || 0;
        this.activeLow = cfg.activeLow !== 'high';
        this.digits = [0, 0, 0, 0];
        this.name = '7-Seg 4D [seg=PORT' + this.segPort + ', sel=PORT' + this.selPort + ']';
        this.el = null;
    }

    render(container) {
        this.el = document.createElement('div');
        this.el.className = 'pic-7seg-multi';
        for (var i = 0; i < 4; i++) {
            var d = document.createElement('div');
            d.className = 'pic-7seg';
            d.id = this.id + '-d' + i;
            this.el.appendChild(d);
        }
        container.appendChild(this.el);
    }

    update() {
        if (!this.el) return;
        var segs = this.hw.getPortByte(this.segPort);
        var sel = (this.hw.getPortByte(this.selPort) >> this.selStart) & 0x0F;
        for (var i = 0; i < 4; i++) {
            var active = this.activeLow ? !(sel & (1 << i)) : !!(sel & (1 << i));
            if (active) this.digits[i] = segs;
        }
        for (var j = 0; j < 4; j++) {
            var el = document.getElementById(this.id + '-d' + j);
            if (el) el.innerHTML = VHW7Seg1.prototype._svg(this.digits[j]);
        }
    }

    destroy() {}
}
