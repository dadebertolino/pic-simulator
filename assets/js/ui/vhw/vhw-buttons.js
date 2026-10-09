class VHWButtons {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.port = cfg.port || 'A';
        this.count = Math.min(8, Math.max(1, parseInt(cfg.count) || 4));
        this.startBit = parseInt(cfg.startBit) || 0;
        this.name = 'Buttons [PORT' + this.port + ' R' + this.port + this.startBit + '-' + (this.startBit + this.count - 1) + ']';
    }

    render(container) {
        var row = document.createElement('div');
        row.className = 'pic-vhw-buttons';
        var self = this;
        for (var i = 0; i < this.count; i++) {
            (function(pin) {
                var btn = document.createElement('button');
                btn.className = 'pic-vhw-btn';
                btn.textContent = 'R' + self.port + pin;
                btn.addEventListener('mousedown', function() { self.hw.setPin(self.port, pin, 1); btn.classList.add('pressed'); });
                btn.addEventListener('mouseup', function() { self.hw.setPin(self.port, pin, 0); btn.classList.remove('pressed'); });
                btn.addEventListener('mouseleave', function() { self.hw.setPin(self.port, pin, 0); btn.classList.remove('pressed'); });
                // Touch support
                btn.addEventListener('touchstart', function(e) { e.preventDefault(); self.hw.setPin(self.port, pin, 1); btn.classList.add('pressed'); });
                btn.addEventListener('touchend', function(e) { e.preventDefault(); self.hw.setPin(self.port, pin, 0); btn.classList.remove('pressed'); });
                row.appendChild(btn);
            })(this.startBit + i);
        }
        container.appendChild(row);
    }

    update() {}
    destroy() {}
}

// ================================================================
//  DIP SWITCH (configurable)
// ================================================================

class VHWDipSwitch {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.port = cfg.port || 'B';
        this.count = Math.min(8, Math.max(1, parseInt(cfg.count) || 8));
        this.name = 'DIP Switch [PORT' + this.port + ' x' + this.count + ']';
    }

    render(container) {
        var row = document.createElement('div');
        row.className = 'pic-vhw-dip';
        var self = this;
        for (var i = 0; i < this.count; i++) {
            (function(pin) {
                var sw = document.createElement('div');
                sw.className = 'pic-vhw-dip-sw';
                sw.innerHTML = '<div class="pic-vhw-dip-toggle" id="' + self.id + '-dip-' + pin + '"></div><span>' + pin + '</span>';
                sw.addEventListener('click', function() {
                    var t = document.getElementById(self.id + '-dip-' + pin);
                    var isOn = t.classList.toggle('on');
                    self.hw.setPin(self.port, pin, isOn ? 1 : 0);
                });
                row.appendChild(sw);
            })(i);
        }
        container.appendChild(row);
    }

    update() {}
    destroy() {}
}
