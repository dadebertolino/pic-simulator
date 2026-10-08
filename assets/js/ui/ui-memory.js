/**
 * UI Memory Module
 * Viewer RAM, Program Memory, EEPROM con tabs.
 */
class UIMemory {
    constructor(ctx) {
        this.cpu = ctx.cpu;
        this.simulator = ctx.simulator;
        this.ui = ctx.ui;
        this.memoryViewType = 'ram';
    }

    init() {
        this.memoryViewType = 'ram';
        var self = this;
        document.querySelectorAll('.pic-memory-tab').forEach(function(tab) {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.pic-memory-tab').forEach(function(t) { t.classList.remove('active'); });
                tab.classList.add('active');
                self.memoryViewType = tab.dataset.type;
                self.updateMemoryView();
            });
        });
        this.updateMemoryView();
    }

    updateMemoryView() {
        const container = document.getElementById('memory-content');
        if (!container) return;
        
        let html = '';
        
        switch (this.memoryViewType) {
            case 'ram':
                html = this.renderRAMView();
                break;
            case 'program':
                html = this.renderProgramView();
                break;
            case 'eeprom':
                html = this.renderEEPROMView();
                break;
            case 'variables':
                html = this.renderVariablesView();
                break;
        }
        
        container.innerHTML = html;
    }

    renderRAMView() {
        var banks = this.cpu.config.banks || 2;
        var totalRows = banks >= 4 ? 32 : 16;  // 512 o 256 byte
        
        var html = '<table class="memory-table"><thead><tr><th></th>';
        for (var i = 0; i < 16; i++) {
            html += '<th>' + i.toString(16).toUpperCase() + '</th>';
        }
        html += '</tr></thead><tbody>';
        
        for (var row = 0; row < totalRows; row++) {
            var baseAddr = row * 16;
            var bankNum = Math.floor(baseAddr / 128);
            var isNewBank = (baseAddr % 128 === 0 && baseAddr > 0);
            
            if (isNewBank) {
                html += '<tr class="mem-bank-sep"><td colspan="17" class="mem-bank-label">Bank ' + bankNum + '</td></tr>';
            }
            
            html += '<tr><td class="addr">' + baseAddr.toString(16).toUpperCase().padStart(3, '0') + '</td>';
            for (var col = 0; col < 16; col++) {
                var addr = baseAddr + col;
                var value = addr < this.cpu.ram.length ? this.cpu.ram[addr] : 0;
                var localAddr = addr & 0x7F;
                var cls = '';
                if (localAddr <= 0x0B) cls = 'sfr';
                else if (localAddr >= 0x0C && localAddr <= 0x1F) cls = 'sfr-periph';
                html += '<td class="' + cls + '">' + value.toString(16).toUpperCase().padStart(2, '0') + '</td>';
            }
            html += '</tr>';
        }
        
        html += '</tbody></table>';
        return html;
    }

    renderProgramView() {
        let html = '<div class="program-list">';
        
        const startAddr = Math.max(0, this.cpu.PC - 10);
        const endAddr = Math.min(this.simulator.assemblyResult?.programMemory.length || 0, startAddr + 30);
        
        for (let addr = startAddr; addr < endAddr; addr++) {
            const word = this.cpu.programMemory[addr];
            const isCurrent = addr === this.cpu.PC;
            const hasBreakpoint = this.cpu.breakpoints.has(addr);
            
            let cls = 'program-line';
            if (isCurrent) cls += ' current';
            if (hasBreakpoint) cls += ' breakpoint';
            
            const disasm = PIC16Assembler.disassemble(word, addr);
            
            html += `<div class="${cls}">
                <span class="prog-addr">${addr.toString(16).toUpperCase().padStart(3, '0')}</span>
                <span class="prog-word">${word.toString(16).toUpperCase().padStart(4, '0')}</span>
                <span class="prog-disasm">${disasm}</span>
            </div>`;
        }
        
        html += '</div>';
        return html;
    }

    renderEEPROMView() {
        var eepSize = this.cpu.getEEPROMSize();
        var cols = eepSize > 128 ? 16 : 8;
        var rows = Math.ceil(eepSize / cols);
        
        var html = '<table class="memory-table"><thead><tr><th></th>';
        for (var i = 0; i < cols; i++) {
            html += '<th>' + i.toString(16).toUpperCase() + '</th>';
        }
        html += '</tr></thead><tbody>';
        
        for (var row = 0; row < rows; row++) {
            html += '<tr><td class="addr">' + (row * cols).toString(16).toUpperCase().padStart(2, '0') + '</td>';
            for (var col = 0; col < cols; col++) {
                var addr = row * cols + col;
                if (addr < eepSize) {
                    var value = this.cpu.readEEPROM(addr);
                    html += '<td>' + value.toString(16).toUpperCase().padStart(2, '0') + '</td>';
                } else {
                    html += '<td class="unused">--</td>';
                }
            }
            html += '</tr>';
        }
        
        html += '</tbody></table>';
        return html;
    }

    renderVariablesView() {
        var result = this.simulator.assemblyResult;
        var vars = result ? result.variables : {};
        var constants = this.simulator.assembler ? this.simulator.assembler.constants : {};
        var keys = Object.keys(vars);

        if (keys.length === 0) {
            return '<div class="pic-mem-empty">No variables declared. Use CBLOCK/ENDC or EQU in your source.</div>';
        }

        // Ordina per indirizzo
        keys.sort(function(a, b) { return vars[a] - vars[b]; });

        var html = '<table class="memory-table memory-table-vars">';
        html += '<thead><tr><th>Name</th><th>Addr</th><th>Hex</th><th>Dec</th><th>Bin</th></tr></thead><tbody>';

        for (var i = 0; i < keys.length; i++) {
            var name = keys[i];
            var addr = vars[name];
            var value = addr < this.cpu.ram.length ? this.cpu.ram[addr] : 0;
            html += '<tr>' +
                '<td class="var-name">' + name + '</td>' +
                '<td class="var-addr">0x' + addr.toString(16).toUpperCase().padStart(2, '0') + '</td>' +
                '<td class="var-hex">0x' + value.toString(16).toUpperCase().padStart(2, '0') + '</td>' +
                '<td class="var-dec">' + value + '</td>' +
                '<td class="var-bin">' + value.toString(2).padStart(8, '0') + '</td>' +
                '</tr>';
        }
        html += '</tbody></table>';

        // Costanti (EQU) — sezione separata
        var cKeys = Object.keys(constants);
        if (cKeys.length > 0) {
            cKeys.sort();
            html += '<div class="pic-var-section-label">Constants (EQU)</div>';
            html += '<table class="memory-table memory-table-vars">';
            html += '<thead><tr><th>Name</th><th>Value</th><th>Hex</th></tr></thead><tbody>';
            for (var j = 0; j < cKeys.length; j++) {
                var cName = cKeys[j];
                var cVal = constants[cName];
                html += '<tr>' +
                    '<td class="var-name">' + cName + '</td>' +
                    '<td class="var-dec">' + cVal + '</td>' +
                    '<td class="var-hex">0x' + cVal.toString(16).toUpperCase().padStart(2, '0') + '</td>' +
                    '</tr>';
            }
            html += '</tbody></table>';
        }

        return html;
    }

    updateProgramMemory() {
        if (this.memoryViewType === 'program') this.updateMemoryView();
    }

    update() { this.updateMemoryView(); }
    setCpu(cpu) { this.cpu = cpu; }
}
