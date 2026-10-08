/**
 * VHW MCP3008 - 10-bit ADC 8-channel (SPI)
 * Slider per impostare tensione su ogni canale, mostra valore digitale.
 */
class VHWMCP3008 {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.channels = parseInt(cfg.channels) || 8;
        this.name = 'MCP3008 ADC (' + this.channels + 'ch)';
        this.el = null;
        this._device = null;
    }

    render(container) {
        this.el = document.createElement('div');
        this.el.className = 'pic-vhw-mcp3008';
        var html = '';
        for (var i = 0; i < this.channels; i++) {
            html += '<div class="pic-mcp3008-ch">' +
                '<label>CH' + i + '</label>' +
                '<input type="range" class="pic-adc-slider" id="' + this.id + '-ch' + i + '" min="0" max="1023" value="512">' +
                '<span class="pic-mcp3008-val" id="' + this.id + '-val' + i + '">512</span>' +
                '</div>';
        }
        html += '<div class="pic-sensor-status" id="' + this.id + '-status">10-bit, 8 channels, SPI</div>';
        this.el.innerHTML = html;
        container.appendChild(this.el);
        this._attachToSPIBus();
        this._bindSliders();
    }

    _attachToSPIBus() {
        var mssp = this.hw.cpu.getPeripheral('MSSP');
        if (!mssp || !mssp.spiBus) return;
        if (typeof VirtualMCP3008 !== 'undefined') {
            this._device = new VirtualMCP3008();
            mssp.spiBus.devices.push(this._device);
        }
    }

    _bindSliders() {
        var self = this;
        for (var i = 0; i < this.channels; i++) {
            (function(ch) {
                var slider = document.getElementById(self.id + '-ch' + ch);
                if (slider) {
                    slider.addEventListener('input', function() {
                        var val = parseInt(slider.value);
                        if (self._device) self._device.channels[ch] = val;
                        var valEl = document.getElementById(self.id + '-val' + ch);
                        if (valEl) valEl.textContent = val;
                    });
                }
            })(i);
        }
    }

    update() {
        if (!this._device) return;
        for (var i = 0; i < this.channels; i++) {
            var valEl = document.getElementById(this.id + '-val' + i);
            if (valEl) valEl.textContent = this._device.channels[i] || 0;
        }
    }

    destroy() {}
}
