/**
 * UI Interrupt Viewer Module
 * Matrice interrupt flags/enables con highlight quando scattano.
 * Si adatta al device mostrando solo le sorgenti presenti.
 */
class UIInterrupts {
    constructor(ctx) {
        this.cpu = ctx.cpu;
        this.simulator = ctx.simulator;
        this.ui = ctx.ui;
        this._rows = [];
        this._prevFlags = 0;
    }

    rebuild() {
        var container = document.getElementById('interrupts-container');
        if (!container) return;
        container.innerHTML = '';
        this._rows = [];
        this._prevFlags = 0;

        var peripherals = this.cpu.peripherals.list();
        // Senza PIR (16F84A) INTCON.6 e' EEIE, non PEIE
        var hasPir = (this.cpu.config.pir || []).length > 0;
        var eep = this.cpu.getPeripheral('EEPROM');
        var ee = eep ? eep.regs : null;

        // Definizione sorgenti interrupt
        // { name, flagAddr, flagBit, enAddr, enBit, peripheral (opzionale) }
        var sources = [
            { name: 'GIE',  flagAddr: 0x0B, flagBit: 7, enAddr: -1, enBit: -1, always: true, isGlobal: true },
            { name: 'PEIE', flagAddr: 0x0B, flagBit: 6, enAddr: -1, enBit: -1, always: hasPir, isGlobal: true },
            { name: 'T0IF', flagAddr: 0x0B, flagBit: 2, enAddr: 0x0B, enBit: 5, always: true },
            { name: 'INTF', flagAddr: 0x0B, flagBit: 1, enAddr: 0x0B, enBit: 4, always: true },
            { name: 'RBIF', flagAddr: 0x0B, flagBit: 0, enAddr: 0x0B, enBit: 3, always: true },
            { name: 'TMR1IF', flagAddr: 0x0C, flagBit: 0, enAddr: 0x8C, enBit: 0, peripheral: 'TMR1' },
            { name: 'TMR2IF', flagAddr: 0x0C, flagBit: 1, enAddr: 0x8C, enBit: 1, peripheral: 'TMR2' },
            { name: 'CCP1IF', flagAddr: 0x0C, flagBit: 2, enAddr: 0x8C, enBit: 2, peripheral: 'CCP1' },
            { name: 'SSPIF',  flagAddr: 0x0C, flagBit: 3, enAddr: 0x8C, enBit: 3, peripheral: 'MSSP' },
            { name: 'TXIF',   flagAddr: 0x0C, flagBit: 4, enAddr: 0x8C, enBit: 4, peripheral: 'USART' },
            { name: 'RCIF',   flagAddr: 0x0C, flagBit: 5, enAddr: 0x8C, enBit: 5, peripheral: 'USART' },
            { name: 'ADIF',   flagAddr: 0x0C, flagBit: 6, enAddr: 0x8C, enBit: 6, peripheral: 'ADC' },
            { name: 'CCP2IF', flagAddr: 0x0D, flagBit: 0, enAddr: 0x8D, enBit: 0, peripheral: 'CCP2' },
            { name: 'EEIF', flagAddr: ee ? ee.flag.addr : 0x88, flagBit: ee ? ee.flag.bit : 4,
              enAddr: ee ? ee.enable.addr : 0x0B, enBit: ee ? ee.enable.bit : 6, peripheral: 'EEPROM' }
        ];

        // Filtra: mostra solo sorgenti il cui peripheral esiste (o always)
        var visible = [];
        for (var i = 0; i < sources.length; i++) {
            var s = sources[i];
            if (s.always || peripherals.indexOf(s.peripheral) !== -1) {
                visible.push(s);
            }
        }

        if (visible.length === 0) {
            container.closest('.pic-panel').style.display = 'none';
            return;
        }
        container.closest('.pic-panel').style.display = '';

        // Global enables header
        var globals = document.createElement('div');
        globals.className = 'pic-irq-globals';
        container.appendChild(globals);

        // Table
        var table = document.createElement('div');
        table.className = 'pic-irq-table';

        // Header row
        var headerRow = document.createElement('div');
        headerRow.className = 'pic-irq-row pic-irq-header-row';
        headerRow.innerHTML =
            '<span class="pic-irq-name-col">Source</span>' +
            '<span class="pic-irq-col">Flag</span>' +
            '<span class="pic-irq-col">En</span>';
        table.appendChild(headerRow);

        for (var j = 0; j < visible.length; j++) {
            var src = visible[j];

            if (src.isGlobal) {
                // GIE/PEIE go in globals bar
                var gEl = document.createElement('div');
                gEl.className = 'pic-bit';
                gEl.id = 'irq-g-' + src.name.toLowerCase();
                gEl.title = src.name;
                gEl.textContent = src.name;
                globals.appendChild(gEl);
                this._rows.push({ id: 'irq-g-' + src.name.toLowerCase(), type: 'global', src: src });
                continue;
            }

            var row = document.createElement('div');
            row.className = 'pic-irq-row';
            row.id = 'irq-row-' + src.name.toLowerCase();

            var nameSpan = document.createElement('span');
            nameSpan.className = 'pic-irq-name';
            nameSpan.textContent = src.name;
            row.appendChild(nameSpan);

            var flagSpan = document.createElement('span');
            flagSpan.className = 'pic-irq-flag';
            flagSpan.id = 'irq-f-' + src.name.toLowerCase();
            flagSpan.textContent = '0';
            row.appendChild(flagSpan);

            var enSpan = document.createElement('span');
            enSpan.className = 'pic-irq-en';
            enSpan.id = 'irq-e-' + src.name.toLowerCase();
            enSpan.textContent = '0';
            row.appendChild(enSpan);

            table.appendChild(row);
            this._rows.push({ id: src.name.toLowerCase(), type: 'source', src: src });
        }

        container.appendChild(table);
    }

    // ================================================================
    //  UPDATE
    // ================================================================

    update() {
        for (var i = 0; i < this._rows.length; i++) {
            var r = this._rows[i];
            var src = r.src;

            if (r.type === 'global') {
                var gEl = document.getElementById(r.id);
                if (gEl) {
                    var gVal = (this.cpu.ram[src.flagAddr] >> src.flagBit) & 1;
                    gEl.classList.toggle('set', !!gVal);
                }
                continue;
            }

            var flag = (this.cpu.ram[src.flagAddr] >> src.flagBit) & 1;
            var en = (src.enAddr >= 0) ? (this.cpu.ram[src.enAddr] >> src.enBit) & 1 : 0;
            var active = flag && en;

            var fEl = document.getElementById('irq-f-' + r.id);
            if (fEl) {
                fEl.textContent = flag ? '1' : '0';
                fEl.classList.toggle('pic-irq-set', !!flag);
            }

            var eEl = document.getElementById('irq-e-' + r.id);
            if (eEl) {
                eEl.textContent = en ? '1' : '0';
                eEl.classList.toggle('pic-irq-set', !!en);
            }

            var rowEl = document.getElementById('irq-row-' + r.id);
            if (rowEl) {
                rowEl.classList.toggle('pic-irq-active', active);
                rowEl.classList.toggle('pic-irq-fired', active);
            }
        }
    }

    setCpu(cpu) { this.cpu = cpu; }
}
