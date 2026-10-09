/**
 * UI CCP/PWM Module
 * Visualizza stato CCP1/CCP2: modo attivo, valore CCPR, duty cycle PWM.
 * Si adatta automaticamente al numero di moduli CCP presenti.
 */
class UICCP {
    constructor(ctx) {
        this.cpu = ctx.cpu;
        this.simulator = ctx.simulator;
        this.ui = ctx.ui;
    }

    rebuild() {
        var container = document.getElementById('ccp-container');
        if (!container) return;
        container.innerHTML = '';

        var peripherals = this.cpu.peripherals.list();
        var ccpList = peripherals.filter(function(n) { return n.indexOf('CCP') === 0; });

        if (ccpList.length === 0) {
            container.closest('.pic-panel').style.display = 'none';
            return;
        }
        container.closest('.pic-panel').style.display = '';

        for (var i = 0; i < ccpList.length; i++) {
            this._buildCCP(container, ccpList[i]);
        }
    }

    _buildCCP(container, name) {
        var section = document.createElement('div');
        section.className = 'pic-ccp-section';
        section.id = 'ccp-section-' + name;

        // Header
        var header = document.createElement('div');
        header.className = 'pic-ccp-header';
        header.innerHTML =
            '<span class="pic-ccp-name">' + name + '</span>' +
            '<span class="pic-ccp-mode" id="ccp-mode-' + name + '">Off</span>';
        section.appendChild(header);

        // Grid valori
        var grid = document.createElement('div');
        grid.className = 'pic-ccp-grid';
        grid.innerHTML =
            '<div class="pic-ccp-field"><span class="pic-ccp-label">CCPR</span>' +
            '<span class="pic-ccp-value" id="ccp-ccpr-' + name + '">0000</span></div>' +
            '<div class="pic-ccp-field"><span class="pic-ccp-label">CON</span>' +
            '<span class="pic-ccp-value" id="ccp-con-' + name + '">00</span></div>';
        section.appendChild(grid);

        // PWM duty bar (visibile solo in modo PWM)
        var pwmBlock = document.createElement('div');
        pwmBlock.className = 'pic-ccp-pwm';
        pwmBlock.id = 'ccp-pwm-' + name;
        pwmBlock.innerHTML =
            '<div class="pic-ccp-duty-row">' +
            '<span class="pic-ccp-label">Duty</span>' +
            '<span class="pic-ccp-duty-pct" id="ccp-duty-pct-' + name + '">0%</span></div>' +
            '<div class="pic-ccp-duty-bar"><div class="pic-ccp-duty-fill" id="ccp-duty-bar-' + name + '"></div></div>' +
            '<div class="pic-ccp-duty-info" id="ccp-duty-info-' + name + '">10-bit: 0 / Period: 0</div>';
        section.appendChild(pwmBlock);

        // Capture info (visibile solo in modo Capture)
        var capBlock = document.createElement('div');
        capBlock.className = 'pic-ccp-capture';
        capBlock.id = 'ccp-cap-' + name;
        capBlock.innerHTML =
            '<span class="pic-ccp-label">Edge</span>' +
            '<span class="pic-ccp-value" id="ccp-cap-edge-' + name + '">--</span>';
        section.appendChild(capBlock);

        // Compare info
        var cmpBlock = document.createElement('div');
        cmpBlock.className = 'pic-ccp-compare';
        cmpBlock.id = 'ccp-cmp-' + name;
        cmpBlock.innerHTML =
            '<span class="pic-ccp-label">Action</span>' +
            '<span class="pic-ccp-value" id="ccp-cmp-action-' + name + '">--</span>';
        section.appendChild(cmpBlock);

        container.appendChild(section);
    }

    // ================================================================
    //  UPDATE
    // ================================================================

    update() {
        var peripherals = this.cpu.peripherals.list();
        var ccpList = peripherals.filter(function(n) { return n.indexOf('CCP') === 0; });

        for (var i = 0; i < ccpList.length; i++) {
            this._updateCCP(ccpList[i]);
        }
    }

    _updateCCP(name) {
        var ccp = this.cpu.getPeripheral(name);
        if (!ccp) return;

        var state = ccp.getState();
        var con = this.cpu.ram[ccp.controlReg];

        // Mode
        var modeEl = document.getElementById('ccp-mode-' + name);
        if (modeEl) {
            var modeText = state.mode.toUpperCase();
            if (state.mode === 'pwm') modeText = 'PWM';
            modeEl.textContent = modeText;
            modeEl.className = 'pic-ccp-mode pic-ccp-mode--' + state.mode;
        }

        // CCPR value
        var ccprEl = document.getElementById('ccp-ccpr-' + name);
        if (ccprEl) ccprEl.textContent = state.ccprValue.toString(16).toUpperCase().padStart(4, '0');

        // CON
        var conEl = document.getElementById('ccp-con-' + name);
        if (conEl) conEl.textContent = con.toString(16).toUpperCase().padStart(2, '0');

        // PWM block
        var pwmBlock = document.getElementById('ccp-pwm-' + name);
        if (pwmBlock) pwmBlock.style.display = state.mode === 'pwm' ? '' : 'none';

        if (state.mode === 'pwm') {
            var pctEl = document.getElementById('ccp-duty-pct-' + name);
            if (pctEl) pctEl.textContent = state.pwmPercent + '%';

            var barEl = document.getElementById('ccp-duty-bar-' + name);
            if (barEl) barEl.style.width = Math.min(100, state.pwmPercent) + '%';

            var infoEl = document.getElementById('ccp-duty-info-' + name);
            if (infoEl) {
                var tmr2 = this.cpu.getPeripheral('TMR2');
                var pr2 = tmr2 ? this.cpu.ram[tmr2.periodReg] : 0;
                infoEl.textContent = '10-bit: ' + state.pwmDuty + ' / PR2: ' + pr2;
            }
        }

        // Capture block
        var capBlock = document.getElementById('ccp-cap-' + name);
        if (capBlock) capBlock.style.display = state.mode === 'capture' ? '' : 'none';

        if (state.mode === 'capture') {
            var edgeEl = document.getElementById('ccp-cap-edge-' + name);
            if (edgeEl) {
                var modeRaw = state.modeRaw;
                var edges = { 4: 'Falling', 5: 'Rising', 6: '4th rising', 7: '16th rising' };
                edgeEl.textContent = edges[modeRaw] || '--';
            }
        }

        // Compare block
        var cmpBlock = document.getElementById('ccp-cmp-' + name);
        if (cmpBlock) cmpBlock.style.display = state.mode === 'compare' ? '' : 'none';

        if (state.mode === 'compare') {
            var actEl = document.getElementById('ccp-cmp-action-' + name);
            if (actEl) {
                var actions = { 8: 'Set pin', 9: 'Clear pin', 10: 'IRQ only', 11: 'Reset TMR1' };
                actEl.textContent = actions[state.modeRaw] || '--';
            }
        }
    }

    setCpu(cpu) { this.cpu = cpu; }
}
