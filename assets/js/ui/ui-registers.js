/**
 * UI Registers Module (Dynamic)
 * Pannello registri che si adatta al device selezionato.
 */
class UIRegisters {
    constructor(ctx) {
        this.cpu = ctx.cpu;
        this.simulator = ctx.simulator;
        this.ui = ctx.ui;
        this._regElements = {};
    }

    /**
     * Definizione gruppi registri per device.
     * Ogni gruppo ha nome, lista registri [{name, addr, digits, tooltip}] e bit opzionali.
     * I gruppi vengono mostrati solo se i registri corrispondenti esistono nel device.
     */
    _getRegisterGroups() {
        return [
            {
                id: 'core', label: 'CPU Core', always: true,
                regs: [
                    { name: 'W', key: 'W', digits: 2, tip: 'Working register' },
                    { name: 'PC', key: 'PC', digits: 4, tip: 'Program Counter' },
                    { name: 'STATUS', addr: 0x03, digits: 2, tip: 'Status register' },
                    { name: 'FSR', addr: 0x04, digits: 2, tip: 'File Select Register' },
                    { name: 'PCLATH', addr: 0x0A, digits: 2, tip: 'PC Latch High' },
                    { name: 'INTCON', addr: 0x0B, digits: 2, tip: 'Interrupt Control' }
                ],
                bits: [
                    { id: 'c', label: 'C', tip: 'Carry', addr: 0x03, bit: 0 },
                    { id: 'dc', label: 'DC', tip: 'Digit Carry', addr: 0x03, bit: 1 },
                    { id: 'z', label: 'Z', tip: 'Zero', addr: 0x03, bit: 2 },
                    { id: 'pd', label: 'PD', tip: 'Power Down', addr: 0x03, bit: 3 },
                    { id: 'to', label: 'TO', tip: 'Timeout', addr: 0x03, bit: 4 },
                    { id: 'rp', label: 'RP', tip: 'Bank Select', addr: 0x03, bit: 5, width: 2 }
                ]
            },
            {
                id: 'timer0', label: 'Timer0', peripheral: 'TMR0',
                regs: [
                    { name: 'TMR0', addr: 0x01, digits: 2, tip: 'Timer0 value' },
                    { name: 'OPTION', addr: 0x81, digits: 2, tip: 'Option register' }
                ]
            },
            {
                id: 'timer1', label: 'Timer1', peripheral: 'TMR1',
                regs: [
                    { name: 'TMR1L', addr: 0x0E, digits: 2, tip: 'Timer1 low byte' },
                    { name: 'TMR1H', addr: 0x0F, digits: 2, tip: 'Timer1 high byte' },
                    { name: 'T1CON', addr: 0x10, digits: 2, tip: 'Timer1 control' }
                ]
            },
            {
                id: 'timer2', label: 'Timer2', peripheral: 'TMR2',
                regs: [
                    { name: 'TMR2', addr: 0x11, digits: 2, tip: 'Timer2 value' },
                    { name: 'T2CON', addr: 0x12, digits: 2, tip: 'Timer2 control' },
                    { name: 'PR2', addr: 0x92, digits: 2, tip: 'Timer2 period' }
                ]
            },
            {
                id: 'ccp', label: 'CCP', peripheral: 'CCP1',
                regs: [
                    { name: 'CCPR1L', addr: 0x15, digits: 2, tip: 'CCP1 low' },
                    { name: 'CCPR1H', addr: 0x16, digits: 2, tip: 'CCP1 high' },
                    { name: 'CCP1CON', addr: 0x17, digits: 2, tip: 'CCP1 control' }
                ]
            },
            {
                id: 'ccp2', label: 'CCP2', peripheral: 'CCP2',
                regs: [
                    { name: 'CCPR2L', addr: 0x1B, digits: 2, tip: 'CCP2 low' },
                    { name: 'CCPR2H', addr: 0x1C, digits: 2, tip: 'CCP2 high' },
                    { name: 'CCP2CON', addr: 0x1D, digits: 2, tip: 'CCP2 control' }
                ]
            },
            {
                id: 'usart', label: 'USART', peripheral: 'USART',
                regs: [
                    { name: 'TXREG', addr: 0x19, digits: 2, tip: 'Transmit data' },
                    { name: 'RCREG', addr: 0x1A, digits: 2, tip: 'Receive data' },
                    { name: 'RCSTA', addr: 0x18, digits: 2, tip: 'Receive status' },
                    { name: 'TXSTA', addr: 0x98, digits: 2, tip: 'Transmit status' },
                    { name: 'SPBRG', addr: 0x99, digits: 2, tip: 'Baud rate generator' }
                ]
            },
            {
                id: 'adc', label: 'ADC', peripheral: 'ADC',
                regs: [
                    { name: 'ADRESH', addr: 0x1E, digits: 2, tip: 'ADC result high' },
                    { name: 'ADRESL', addr: 0x9E, digits: 2, tip: 'ADC result low' },
                    { name: 'ADCON0', addr: 0x1F, digits: 2, tip: 'ADC control 0' },
                    { name: 'ADCON1', addr: 0x9F, digits: 2, tip: 'ADC control 1' }
                ]
            },
            {
                id: 'mssp', label: 'MSSP', peripheral: 'MSSP',
                regs: [
                    { name: 'SSPBUF', addr: 0x13, digits: 2, tip: 'SSP data buffer' },
                    { name: 'SSPCON', addr: 0x14, digits: 2, tip: 'SSP control 1' },
                    { name: 'SSPCON2', addr: 0x91, digits: 2, tip: 'SSP control 2' },
                    { name: 'SSPADD', addr: 0x93, digits: 2, tip: 'SSP address/baud' },
                    { name: 'SSPSTAT', addr: 0x94, digits: 2, tip: 'SSP status' }
                ]
            },
            {
                id: 'eeprom', label: 'EEPROM', peripheral: 'EEPROM',
                regs: [
                    { name: 'EEDATA', addr: 0x08, digits: 2, tip: 'EEPROM data' },
                    { name: 'EEADR', addr: 0x09, digits: 2, tip: 'EEPROM address' },
                    { name: 'EECON1', addr: 0x88, digits: 2, tip: 'EEPROM control' }
                ]
            },
            {
                id: 'irq', label: 'Interrupts', peripheralAny: ['TMR1','USART','ADC','MSSP','CCP1'],
                regs: [
                    { name: 'PIR1', addr: 0x0C, digits: 2, tip: 'Peripheral interrupt flags 1' },
                    { name: 'PIE1', addr: 0x8C, digits: 2, tip: 'Peripheral interrupt enable 1' },
                    { name: 'PIR2', addr: 0x0D, digits: 2, tip: 'Peripheral interrupt flags 2' },
                    { name: 'PIE2', addr: 0x8D, digits: 2, tip: 'Peripheral interrupt enable 2' }
                ]
            },
            {
                id: 'comparator', label: 'Comparator', peripheral: 'COMPARATOR',
                regs: [
                    { name: 'CMCON', addr: 0x1F, digits: 2, tip: 'Comparator control' },
                    { name: 'VRCON', addr: 0x9D, digits: 2, tip: 'Voltage reference' }
                ]
            }
        ];
    }

    /**
     * Ricostruisce il pannello registri in base alle periferiche del device corrente.
     */
    rebuildRegistersUI() {
        var container = document.getElementById('registers-container');
        if (!container) return;
        container.innerHTML = '';

        // Aggiorna nome device
        var devLabel = document.getElementById('reg-device-name');
        if (devLabel) devLabel.textContent = this.currentDeviceId;

        // Lista periferiche presenti
        var peripheralNames = this.cpu.peripherals.list();
        var groups = this._getRegisterGroups();

        // Mappa registri per update veloce
        this._regElements = {};

        for (var g = 0; g < groups.length; g++) {
            var group = groups[g];

            // Visibilita': always, oppure check peripheral
            var visible = false;
            if (group.always) {
                visible = true;
            } else if (group.peripheral) {
                visible = peripheralNames.indexOf(group.peripheral) !== -1;
            } else if (group.peripheralAny) {
                for (var pa = 0; pa < group.peripheralAny.length; pa++) {
                    if (peripheralNames.indexOf(group.peripheralAny[pa]) !== -1) {
                        visible = true;
                        break;
                    }
                }
            }
            if (!visible) continue;

            // Sezione
            var section = document.createElement('div');
            section.className = 'pic-reg-section';

            // Label del gruppo
            var label = document.createElement('div');
            label.className = 'pic-reg-group-label';
            label.textContent = group.label;
            section.appendChild(label);

            // Griglia registri
            var grid = document.createElement('div');
            grid.className = 'pic-registers-grid';

            for (var r = 0; r < group.regs.length; r++) {
                var reg = group.regs[r];
                var regId = 'reg-' + reg.name.toLowerCase().replace(/[^a-z0-9]/g, '');

                var div = document.createElement('div');
                div.className = 'pic-register';
                div.title = reg.tip || reg.name;
                div.innerHTML = '<span class="pic-reg-name">' + reg.name + '</span>' +
                    '<span class="pic-reg-value" id="' + regId + '">00</span>';
                grid.appendChild(div);

                // Salva mappatura per update rapido
                this._regElements[regId] = { addr: reg.addr, key: reg.key, digits: reg.digits || 2 };
            }
            section.appendChild(grid);

            // Bit indicators
            if (group.bits) {
                var bitsDiv = document.createElement('div');
                bitsDiv.className = 'pic-status-bits';
                for (var b = 0; b < group.bits.length; b++) {
                    var bit = group.bits[b];
                    var bitEl = document.createElement('div');
                    bitEl.className = 'pic-bit';
                    bitEl.id = 'bit-' + bit.id;
                    bitEl.title = bit.tip;
                    bitEl.textContent = bit.label;
                    bitsDiv.appendChild(bitEl);
                    // Salva per update
                    this._regElements['bit-' + bit.id] = { addr: bit.addr, bit: bit.bit, width: bit.width || 1 };
                }
                section.appendChild(bitsDiv);
            }

            container.appendChild(section);
        }
    }

    /**
     * Aggiorna tutti i valori dei registri visualizzati.
     */
    updateRegisters() {
        if (!this._regElements) return;

        for (var id in this._regElements) {
            if (!this._regElements.hasOwnProperty(id)) continue;
            var def = this._regElements[id];
            var el = document.getElementById(id);
            if (!el) continue;

            if (def.bit !== undefined) {
                // Bit indicator
                var val;
                if (def.width && def.width > 1) {
                    val = (this.cpu.ram[def.addr] >> def.bit) & ((1 << def.width) - 1);
                } else {
                    val = (this.cpu.ram[def.addr] >> def.bit) & 0x01;
                }
                el.classList.toggle('set', val !== 0);
                if (def.width > 1) el.textContent = val;
            } else {
                // Register value
                var value;
                if (def.key === 'W') {
                    value = this.cpu.W;
                } else if (def.key === 'PC') {
                    value = this.cpu.PC;
                } else if (def.addr !== undefined) {
                    value = this.cpu.ram[def.addr];
                } else {
                    continue;
                }
                el.textContent = value.toString(16).toUpperCase().padStart(def.digits, '0');
            }
        }

        // Cycles
        var cyclesEl = document.getElementById('cycles');
        if (cyclesEl) cyclesEl.textContent = this.cpu.cycles.toLocaleString();

        // Stack
        var state = this.cpu.getState();
        this.updateStack(state.stack, state.stackPointer, state.stackUsed, state.stackOverflow, state.stackUnderflow);
    }

    setRegisterValue(id, value, digits) {
        var el = document.getElementById(id);
        if (el) {
            el.textContent = value.toString(16).toUpperCase().padStart(digits || 2, '0');
        }
    }

    setBitIndicator(id, value) {
        var el = document.getElementById(id);
        if (el) {
            el.classList.toggle('set', value !== 0);
        }
    }

    updateStack(stack, sp, used, overflow, underflow) {
        var container = document.getElementById('stack-view');
        if (!container) return;
        container.innerHTML = '';

        // Status header
        var header = document.createElement('div');
        header.className = 'stack-header';
        var statusText = used + '/' + stack.length;
        if (overflow) statusText += ' <span class="stack-warn">OVERFLOW</span>';
        if (underflow) statusText += ' <span class="stack-warn">UNDERFLOW</span>';
        header.innerHTML = '<span class="stack-depth">Depth: ' + statusText + '</span>';
        container.appendChild(header);

        for (var i = 0; i < stack.length; i++) {
            var entry = document.createElement('div');
            entry.className = 'stack-entry';
            var isCurrent = (used > 0 && i === ((sp - 1 + stack.length) % stack.length));
            var isUsed = false;
            // Determina se questa entry è "usata" (contiene un return address valido)
            if (used > 0) {
                // Le entries usate vanno da (sp - used) a (sp - 1) modulo length
                var base = (sp - used + stack.length) % stack.length;
                var pos = (i - base + stack.length) % stack.length;
                isUsed = pos < used;
            }
            if (isCurrent) entry.classList.add('current');
            if (isUsed) entry.classList.add('used');
            if (overflow) entry.classList.add('stack-overflow');
            entry.innerHTML = '<span class="stack-index">' + i + ':</span> ' +
                '<span class="stack-value">0x' + stack[i].toString(16).toUpperCase().padStart(3, '0') + '</span>';
            container.appendChild(entry);
        }
    }

    updateRegister(name, value) {
        // Callback per cambio registro specifico — update rapido
        var id = 'reg-' + name.toLowerCase().replace(/[^a-z0-9]/g, '');
        this.setRegisterValue(id, value);
    }



    update() {
        this.updateRegisters();
    }

    setCpu(cpu) {
        this.cpu = cpu;
        this.rebuildRegistersUI();
    }
}
