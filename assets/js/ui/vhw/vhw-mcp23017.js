/**
 * VHW MCP23017 - 16-bit I/O Expander (I²C)
 * Mostra 2 porte (GPA0-7, GPB0-7) con stato pin e direzione.
 */
class VHWMCP23017 {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.a2a1a0 = parseInt(cfg.addr) || 0;
        this.i2cAddr = 0x20 | this.a2a1a0;
        this.name = 'MCP23017 [0x' + this.i2cAddr.toString(16).toUpperCase() + ']';
        this.el = null;
        this._device = null;
    }

    render(container) {
        this.el = document.createElement('div');
        this.el.className = 'pic-vhw-mcp23017';
        this.el.innerHTML =
            '<div class="pic-mcp-ports">' +
            '<div class="pic-mcp-port" id="' + this.id + '-portA"><div class="pic-mcp-port-label">Port A</div></div>' +
            '<div class="pic-mcp-port" id="' + this.id + '-portB"><div class="pic-mcp-port-label">Port B</div></div>' +
            '</div>' +
            '<div class="pic-sensor-status" id="' + this.id + '-status">Dir A: -- B: -- | Out A: -- B: --</div>';
        container.appendChild(this.el);
        this._attachToI2CBus();
        this._renderPorts();
    }

    _attachToI2CBus() {
        var mssp = this.hw.cpu.getPeripheral('MSSP');
        if (!mssp || !mssp.i2cBus) return;
        var existing = mssp.i2cBus.devices.get(this.i2cAddr);
        if (existing) {
            this._device = existing;
        } else if (typeof VirtualMCP23017 !== 'undefined') {
            this._device = new VirtualMCP23017(this.a2a1a0);
            mssp.i2cBus.attach(this.i2cAddr, this._device);
        }
    }

    update() { this._renderPorts(); }

    _renderPorts() {
        if (!this._device) return;
        var regs = this._device.registers;
        var dirA = regs[0x00]; // IODIRA
        var dirB = regs[0x01]; // IODIRB
        var outA = regs[0x14]; // OLATA
        var outB = regs[0x15]; // OLATB
        var inA = regs[0x12];  // GPIOA
        var inB = regs[0x13];  // GPIOB

        this._renderPort(this.id + '-portA', 'A', dirA, outA, inA);
        this._renderPort(this.id + '-portB', 'B', dirB, outB, inB);

        var hex = function(v) { return '0x' + v.toString(16).toUpperCase().padStart(2, '0'); };
        var statusEl = document.getElementById(this.id + '-status');
        if (statusEl) statusEl.textContent = 'Dir A:' + hex(dirA) + ' B:' + hex(dirB) +
            ' | Out A:' + hex(outA) + ' B:' + hex(outB) + ' | In A:' + hex(inA) + ' B:' + hex(inB);
    }

    _renderPort(elId, label, dir, out, inp) {
        var el = document.getElementById(elId);
        if (!el) return;
        var html = '<div class="pic-mcp-port-label">Port ' + label + '</div><div class="pic-mcp-pins">';
        for (var i = 7; i >= 0; i--) {
            var isInput = (dir >> i) & 1;
            var val = isInput ? ((inp >> i) & 1) : ((out >> i) & 1);
            var cls = 'pic-mcp-pin' + (val ? ' on' : '') + (isInput ? ' input' : ' output');
            html += '<div class="' + cls + '"><div class="pic-mcp-pin-dot"></div><span>GP' + label + i + '</span></div>';
        }
        html += '</div>';
        el.innerHTML = html;
    }

    destroy() {}
}
