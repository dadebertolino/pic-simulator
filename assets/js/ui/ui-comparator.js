/**
 * UI Comparator Module
 * Stato comparatori, configurazione modo, tensioni input, Vref.
 */
class UIComparator {
    constructor(ctx) {
        this.cpu = ctx.cpu;
        this.simulator = ctx.simulator;
        this.ui = ctx.ui;
    }

    rebuild() {
        var container = document.getElementById('comparator-container');
        if (!container) return;
        container.innerHTML = '';

        var comp = this.cpu.getPeripheral('COMPARATOR');
        if (!comp) {
            container.closest('.pic-panel').style.display = 'none';
            return;
        }
        container.closest('.pic-panel').style.display = '';

        // Mode selector info
        var modeRow = document.createElement('div');
        modeRow.className = 'pic-comp-mode-row';
        modeRow.innerHTML =
            '<span class="pic-comp-label">Mode (CM2:0)</span>' +
            '<span class="pic-comp-mode" id="comp-mode">111 Off</span>';
        container.appendChild(modeRow);

        // Outputs
        var outRow = document.createElement('div');
        outRow.className = 'pic-comp-outputs';
        outRow.innerHTML =
            '<div class="pic-comp-out" id="comp-c1out"><span class="pic-comp-out-label">C1OUT</span><span class="pic-comp-out-led"></span></div>' +
            '<div class="pic-comp-out" id="comp-c2out"><span class="pic-comp-out-label">C2OUT</span><span class="pic-comp-out-led"></span></div>';
        container.appendChild(outRow);

        // Vref
        var vrefRow = document.createElement('div');
        vrefRow.className = 'pic-comp-vref-row';
        vrefRow.innerHTML =
            '<span class="pic-comp-label">Vref</span>' +
            '<span class="pic-comp-vref" id="comp-vref">Off</span>';
        container.appendChild(vrefRow);

        // Input voltages (4 slider AN0-AN3)
        var inputsLabel = document.createElement('div');
        inputsLabel.className = 'pic-comp-inputs-label';
        inputsLabel.textContent = 'Analog Inputs';
        container.appendChild(inputsLabel);

        var inputs = document.createElement('div');
        inputs.className = 'pic-comp-inputs';
        var self = this;
        for (var i = 0; i < 4; i++) {
            inputs.appendChild(this._buildInput(comp, i));
        }
        container.appendChild(inputs);

        // Flags
        var flags = document.createElement('div');
        flags.className = 'pic-comp-flags';
        flags.innerHTML =
            '<div class="pic-bit" id="comp-c1inv" title="C1 inversion">C1INV</div>' +
            '<div class="pic-bit" id="comp-c2inv" title="C2 inversion">C2INV</div>' +
            '<div class="pic-bit" id="comp-cis" title="Input switch">CIS</div>' +
            '<div class="pic-bit" id="comp-vren" title="Vref enable">VREN</div>';
        container.appendChild(flags);
    }

    _buildInput(comp, ch) {
        var row = document.createElement('div');
        row.className = 'pic-comp-input';

        var label = document.createElement('span');
        label.className = 'pic-comp-in-label';
        label.textContent = 'AN' + ch;
        row.appendChild(label);

        var slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'pic-adc-slider';
        slider.min = '0';
        slider.max = '500';
        slider.value = String(Math.round(comp.getInputVoltage(ch) * 100));
        slider.addEventListener('input', function() {
            var volts = parseInt(slider.value) / 100;
            comp.setInputVoltage(ch, volts);
            var vEl = document.getElementById('comp-vin-' + ch);
            if (vEl) vEl.textContent = volts.toFixed(2) + 'V';
        });
        row.appendChild(slider);

        var voltSpan = document.createElement('span');
        voltSpan.className = 'pic-comp-in-volt';
        voltSpan.id = 'comp-vin-' + ch;
        voltSpan.textContent = comp.getInputVoltage(ch).toFixed(2) + 'V';
        row.appendChild(voltSpan);

        return row;
    }

    // ================================================================
    //  UPDATE
    // ================================================================

    update() {
        var comp = this.cpu.getPeripheral('COMPARATOR');
        if (!comp) return;

        var state = comp.getState();

        // Mode
        var modeEl = document.getElementById('comp-mode');
        if (modeEl) {
            var modeNames = [
                '000 Reset', '001 3-in mux', '010 4-in Vref',
                '011 Common Vref', '100 Independent', '101 One comp',
                '110 Vref + out', '111 Off'
            ];
            modeEl.textContent = modeNames[state.mode] || String(state.mode);
        }

        // Outputs
        var c1El = document.getElementById('comp-c1out');
        if (c1El) c1El.classList.toggle('pic-comp-out-on', state.c1out);
        var c2El = document.getElementById('comp-c2out');
        if (c2El) c2El.classList.toggle('pic-comp-out-on', state.c2out);

        // Vref
        var vrefEl = document.getElementById('comp-vref');
        if (vrefEl) {
            vrefEl.textContent = state.vrefEnabled
                ? state.vref.toFixed(3) + 'V'
                : 'Off';
        }

        // Flags
        var cmcon = this.cpu.ram[comp.controlReg];
        this._setFlag('comp-c1inv', (cmcon >> 4) & 1);
        this._setFlag('comp-c2inv', (cmcon >> 5) & 1);
        this._setFlag('comp-cis', (cmcon >> 3) & 1);
        this._setFlag('comp-vren', state.vrefEnabled);
    }

    _setFlag(id, value) {
        var el = document.getElementById(id);
        if (el) el.classList.toggle('set', !!value);
    }

    setCpu(cpu) { this.cpu = cpu; }
}
