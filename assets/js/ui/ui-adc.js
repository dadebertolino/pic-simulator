/**
 * UI ADC Module
 * Slider/potenziometri virtuali per canali analogici, stato conversione, risultato.
 */
class UIADC {
    constructor(ctx) {
        this.cpu = ctx.cpu;
        this.simulator = ctx.simulator;
        this.ui = ctx.ui;
    }

    rebuild() {
        var container = document.getElementById('adc-container');
        if (!container) return;
        container.innerHTML = '';

        var adc = this.cpu.getPeripheral('ADC');
        if (!adc) {
            container.closest('.pic-panel').style.display = 'none';
            return;
        }
        container.closest('.pic-panel').style.display = '';

        // Info bar
        var info = document.createElement('div');
        info.className = 'pic-adc-info';
        info.innerHTML =
            '<span class="pic-adc-res">10-bit</span>' +
            '<span class="pic-adc-ch" id="adc-sel-ch">CH0</span>' +
            '<span class="pic-adc-result" id="adc-result">0000</span>' +
            '<span class="pic-adc-conv" id="adc-conv-status">IDLE</span>';
        container.appendChild(info);

        // Canali slider
        var numCh = adc.getNumChannels();
        var grid = document.createElement('div');
        grid.className = 'pic-adc-channels';

        for (var i = 0; i < numCh; i++) {
            grid.appendChild(this._buildChannel(adc, i));
        }
        container.appendChild(grid);
    }

    _buildChannel(adc, ch) {
        var self = this;
        var row = document.createElement('div');
        row.className = 'pic-adc-channel';
        row.id = 'adc-ch-' + ch;

        // Label
        var label = document.createElement('span');
        label.className = 'pic-adc-ch-label';
        label.textContent = 'AN' + ch;
        row.appendChild(label);

        // Slider
        var slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'pic-adc-slider';
        slider.min = '0';
        slider.max = '1023';
        slider.value = String(adc.getChannelValue(ch));
        slider.id = 'adc-slider-' + ch;
        slider.addEventListener('input', function() {
            var val = parseInt(slider.value);
            adc.setChannelValue(ch, val);
            var valEl = document.getElementById('adc-val-' + ch);
            if (valEl) valEl.textContent = val;
            var voltEl = document.getElementById('adc-volt-' + ch);
            if (voltEl) voltEl.textContent = (val * 5.0 / 1023).toFixed(2) + 'V';
        });
        row.appendChild(slider);

        // Value display
        var valSpan = document.createElement('span');
        valSpan.className = 'pic-adc-ch-value';
        valSpan.id = 'adc-val-' + ch;
        valSpan.textContent = String(adc.getChannelValue(ch));
        row.appendChild(valSpan);

        // Voltage
        var voltSpan = document.createElement('span');
        voltSpan.className = 'pic-adc-ch-volt';
        voltSpan.id = 'adc-volt-' + ch;
        voltSpan.textContent = (adc.getChannelValue(ch) * 5.0 / 1023).toFixed(2) + 'V';
        row.appendChild(voltSpan);

        return row;
    }

    // ================================================================
    //  UPDATE
    // ================================================================

    update() {
        var adc = this.cpu.getPeripheral('ADC');
        if (!adc) return;

        var state = adc.getState();

        // Canale selezionato
        var chEl = document.getElementById('adc-sel-ch');
        if (chEl) chEl.textContent = 'CH' + state.channel;

        // Risultato
        var resEl = document.getElementById('adc-result');
        if (resEl) resEl.textContent = state.result.toString(10).padStart(4, ' ');

        // Stato conversione
        var convEl = document.getElementById('adc-conv-status');
        if (convEl) {
            if (!state.enabled) {
                convEl.textContent = 'OFF';
                convEl.className = 'pic-adc-conv';
            } else if (state.converting) {
                convEl.textContent = 'CONV';
                convEl.className = 'pic-adc-conv pic-adc-conv--active';
            } else {
                convEl.textContent = 'IDLE';
                convEl.className = 'pic-adc-conv pic-adc-conv--on';
            }
        }

        // Highlight canale selezionato
        var numCh = adc.getNumChannels();
        for (var i = 0; i < numCh; i++) {
            var row = document.getElementById('adc-ch-' + i);
            if (row) row.classList.toggle('pic-adc-ch-active', i === state.channel && state.enabled);
        }
    }

    setCpu(cpu) { this.cpu = cpu; }
}
