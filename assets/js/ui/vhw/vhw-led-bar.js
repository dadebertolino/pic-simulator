class VHWLedBar {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.port = cfg.port || 'B';
        this.count = Math.min(8, Math.max(1, parseInt(cfg.count) || 8));
        this.color = cfg.color || 'red';
        this.name = 'LED Bar [PORT' + this.port + ' x' + this.count + ']';
    }

    render(container) {
        var colors = { red: '#ff3333', green: '#33ff33', yellow: '#ffcc33', blue: '#3388ff' };
        this._color = colors[this.color] || '#ff3333';
        var el = document.createElement('div');
        el.className = 'pic-led-bar';
        for (var i = this.count - 1; i >= 0; i--) {
            var led = document.createElement('div');
            led.className = 'pic-led-bar-led';
            led.id = this.id + '-led-' + i;
            led.innerHTML = '<div class="pic-led-bar-light"></div><span class="pic-led-bar-label">R' + this.port + i + '</span>';
            el.appendChild(led);
        }
        container.appendChild(el);
    }

    update() {
        var val = this.hw.getPortByte(this.port);
        for (var i = 0; i < this.count; i++) {
            var el = document.getElementById(this.id + '-led-' + i);
            if (!el) continue;
            var isOn = !!(val & (1 << i));
            el.classList.toggle('on', isOn);
            var light = el.querySelector('.pic-led-bar-light');
            if (light) {
                light.style.background = isOn ? this._color : '';
                light.style.boxShadow = isOn ? '0 0 6px ' + this._color : '';
            }
        }
    }

    destroy() {}
}
