/**
 * UI Timers Module
 * Pannello Timer: TMR0 (8-bit), TMR1 (16-bit), TMR2 (8-bit + PR2).
 * Si adatta automaticamente alle periferiche presenti nel device.
 */
class UITimers {
    constructor(ctx) {
        this.cpu = ctx.cpu;
        this.simulator = ctx.simulator;
        this.ui = ctx.ui;
        this._els = {};
    }

    /**
     * Ricostruisce il pannello timer.
     * Chiamato da init() e da changeDevice().
     */
    rebuild() {
        var container = document.getElementById('timers-container');
        if (!container) return;
        container.innerHTML = '';
        this._els = {};

        var peripherals = this.cpu.peripherals.list();
        var hasTMR0 = peripherals.indexOf('TMR0') !== -1;
        var hasTMR1 = peripherals.indexOf('TMR1') !== -1;
        var hasTMR2 = peripherals.indexOf('TMR2') !== -1;

        if (!hasTMR0 && !hasTMR1 && !hasTMR2) {
            container.innerHTML = '<div class="pic-panel-empty">No timers</div>';
            return;
        }

        if (hasTMR0) this._buildTMR0(container);
        if (hasTMR1) this._buildTMR1(container);
        if (hasTMR2) this._buildTMR2(container);
    }

    // ================================================================
    //  TMR0
    // ================================================================

    _buildTMR0(container) {
        var section = this._section('TMR0', '8-bit Timer/Counter');
        var grid = this._grid();

        this._addField(grid, 'tmr0-val', 'TMR0', '00');
        this._addField(grid, 'tmr0-option', 'OPTION', 'FF');
        this._addField(grid, 'tmr0-src', 'Source', 'Int');
        this._addField(grid, 'tmr0-ps', 'Prescaler', '1:2');

        section.appendChild(grid);

        // Flag bits
        var flags = this._flags();
        this._addFlag(flags, 'tmr0-t0if', 'T0IF', 'TMR0 overflow flag');
        this._addFlag(flags, 'tmr0-t0ie', 'T0IE', 'TMR0 interrupt enable');
        this._addFlag(flags, 'tmr0-t0cs', 'T0CS', 'Clock source select');
        this._addFlag(flags, 'tmr0-psa', 'PSA', 'Prescaler assignment');
        section.appendChild(flags);

        container.appendChild(section);
    }

    // ================================================================
    //  TMR1
    // ================================================================

    _buildTMR1(container) {
        var section = this._section('TMR1', '16-bit Timer/Counter');
        var grid = this._grid();

        this._addField(grid, 'tmr1-val', 'TMR1', '0000', 4);
        this._addField(grid, 'tmr1-con', 'T1CON', '00');
        this._addField(grid, 'tmr1-src', 'Source', 'Int');
        this._addField(grid, 'tmr1-ps', 'Prescaler', '1:1');

        section.appendChild(grid);

        var flags = this._flags();
        this._addFlag(flags, 'tmr1-on', 'ON', 'Timer1 enable');
        this._addFlag(flags, 'tmr1-cs', 'CS', 'Clock source');
        this._addFlag(flags, 'tmr1-if', 'T1IF', 'Overflow flag');
        section.appendChild(flags);

        container.appendChild(section);
    }

    // ================================================================
    //  TMR2
    // ================================================================

    _buildTMR2(container) {
        var section = this._section('TMR2', '8-bit Timer + Period');
        var grid = this._grid();

        this._addField(grid, 'tmr2-val', 'TMR2', '00');
        this._addField(grid, 'tmr2-pr2', 'PR2', 'FF');
        this._addField(grid, 'tmr2-con', 'T2CON', '00');
        this._addField(grid, 'tmr2-ps', 'Pre:Post', '1:1 / 1:1');

        section.appendChild(grid);

        var flags = this._flags();
        this._addFlag(flags, 'tmr2-on', 'ON', 'Timer2 enable');
        this._addFlag(flags, 'tmr2-if', 'T2IF', 'Match flag');
        section.appendChild(flags);

        // Progress bar TMR2 vs PR2
        var bar = document.createElement('div');
        bar.className = 'pic-timer-bar';
        bar.innerHTML = '<div class="pic-timer-fill" id="tmr2-bar"></div>';
        section.appendChild(bar);

        container.appendChild(section);
    }

    // ================================================================
    //  UPDATE
    // ================================================================

    update() {
        var p = this.cpu.peripherals;

        // TMR0
        var tmr0 = p.get('TMR0');
        if (tmr0) {
            var option = this.cpu.ram[0x81];
            this._set('tmr0-val', this.cpu.ram[0x01], 2);
            this._set('tmr0-option', option, 2);
            var t0cs = (option >> 5) & 1;
            this._setText('tmr0-src', t0cs ? 'Ext (T0CKI)' : 'Internal');
            var psa = (option >> 3) & 1;
            if (psa === 0) {
                var ps = 1 << ((option & 0x07) + 1);
                this._setText('tmr0-ps', '1:' + ps);
            } else {
                this._setText('tmr0-ps', '1:1 (WDT)');
            }
            // Flags
            var intcon = this.cpu.ram[0x0B];
            this._setFlag('tmr0-t0if', intcon & 0x04);
            this._setFlag('tmr0-t0ie', intcon & 0x20);
            this._setFlag('tmr0-t0cs', t0cs);
            this._setFlag('tmr0-psa', psa);
        }

        // TMR1
        var tmr1 = p.get('TMR1');
        if (tmr1) {
            var val16 = tmr1.getValue16();
            this._set('tmr1-val', val16, 4);
            this._set('tmr1-con', this.cpu.ram[tmr1.controlReg], 2);
            var t1con = this.cpu.ram[tmr1.controlReg];
            this._setText('tmr1-src', (t1con & 0x02) ? 'Ext (T1CKI)' : 'Internal');
            this._setText('tmr1-ps', '1:' + (1 << ((t1con >> 4) & 0x03)));
            this._setFlag('tmr1-on', t1con & 0x01);
            this._setFlag('tmr1-cs', t1con & 0x02);
            this._setFlag('tmr1-if', this.cpu.ram[tmr1.pirAddr] & (1 << tmr1.pirBit));
        }

        // TMR2
        var tmr2 = p.get('TMR2');
        if (tmr2) {
            var t2con = this.cpu.ram[tmr2.controlReg];
            var tmr2val = this.cpu.ram[tmr2.reg];
            var pr2val = this.cpu.ram[tmr2.periodReg];
            this._set('tmr2-val', tmr2val, 2);
            this._set('tmr2-pr2', pr2val, 2);
            this._set('tmr2-con', t2con, 2);

            var preVal = t2con & 0x03;
            var pre = preVal === 0 ? 1 : (preVal === 1 ? 4 : 16);
            var post = ((t2con >> 3) & 0x0F) + 1;
            this._setText('tmr2-ps', '1:' + pre + ' / 1:' + post);

            this._setFlag('tmr2-on', t2con & 0x04);
            this._setFlag('tmr2-if', this.cpu.ram[tmr2.pirAddr] & (1 << tmr2.pirBit));

            // Progress bar
            var barEl = document.getElementById('tmr2-bar');
            if (barEl) {
                var pct = pr2val > 0 ? Math.min(100, Math.round(tmr2val / pr2val * 100)) : 0;
                barEl.style.width = pct + '%';
            }
        }
    }

    setCpu(cpu) { this.cpu = cpu; }

    // ================================================================
    //  DOM HELPERS
    // ================================================================

    _section(title, subtitle) {
        var s = document.createElement('div');
        s.className = 'pic-timer-section';
        s.innerHTML = '<div class="pic-timer-header"><span class="pic-timer-title">' + title +
            '</span><span class="pic-timer-sub">' + subtitle + '</span></div>';
        return s;
    }

    _grid() {
        var g = document.createElement('div');
        g.className = 'pic-timer-grid';
        return g;
    }

    _addField(grid, id, label, initial, digits) {
        var d = document.createElement('div');
        d.className = 'pic-timer-field';
        d.innerHTML = '<span class="pic-timer-label">' + label + '</span>' +
            '<span class="pic-timer-value" id="' + id + '">' + initial + '</span>';
        grid.appendChild(d);
        this._els[id] = { digits: digits || 2 };
    }

    _flags() {
        var f = document.createElement('div');
        f.className = 'pic-timer-flags';
        return f;
    }

    _addFlag(container, id, label, tooltip) {
        var f = document.createElement('div');
        f.className = 'pic-bit';
        f.id = id;
        f.title = tooltip;
        f.textContent = label;
        container.appendChild(f);
    }

    _set(id, value, digits) {
        var el = document.getElementById(id);
        if (el) el.textContent = value.toString(16).toUpperCase().padStart(digits || 2, '0');
    }

    _setText(id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    _setFlag(id, value) {
        var el = document.getElementById(id);
        if (el) el.classList.toggle('set', !!value);
    }
}
