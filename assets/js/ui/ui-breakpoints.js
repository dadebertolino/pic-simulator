/**
 * UI Breakpoints Module
 */
class UIBreakpoints {
    constructor(ctx) {
        this.cpu = ctx.cpu;
        this.simulator = ctx.simulator;
        this.ui = ctx.ui;
    }

    toggleBreakpointAtLine(line) {
        if (this.simulator.toggleBreakpointAtLine(line)) {
            this.ui.editorModule.updateGutter();
            this.updateBreakpointsList();
        }
    }

    clearAllBreakpoints() {
        this.simulator.clearAllBreakpoints();
        this.ui.editorModule.updateGutter();
        this.updateBreakpointsList();
        this.ui.showMessage('All breakpoints cleared', 'info');
    }

    updateBreakpointsList() {
        var container = document.getElementById('breakpoints-list');
        if (!container) return;
        var breakpoints = this.simulator.getBreakpoints();
        if (breakpoints.length === 0) {
            container.innerHTML = '<div class="no-breakpoints">No breakpoints set</div>';
            return;
        }
        var self = this;
        container.innerHTML = breakpoints.map(function(addr) {
            var line = self.simulator.getLineForAddress(addr);
            var instr = PIC16Assembler.disassemble(self.cpu.programMemory[addr], addr);
            return '<div class="breakpoint-item" data-addr="' + addr + '">' +
                '<span class="bp-icon">&#9679;</span>' +
                '<span class="bp-addr">0x' + addr.toString(16).toUpperCase().padStart(3, '0') + '</span>' +
                '<span class="bp-line">' + (line ? 'L' + line : '') + '</span>' +
                '<span class="bp-instr">' + instr + '</span>' +
                '<button class="bp-remove" data-bpaddr="' + addr + '">&times;</button></div>';
        }).join('');
        container.querySelectorAll('.bp-remove').forEach(function(btn) {
            btn.addEventListener('click', function() {
                self.removeBreakpoint(parseInt(btn.dataset.bpaddr));
            });
        });
    }

    removeBreakpoint(addr) {
        this.cpu.clearBreakpoint(addr);
        this.ui.editorModule.updateGutter();
        this.updateBreakpointsList();
    }

    update() { this.updateBreakpointsList(); }
    setCpu(cpu) { this.cpu = cpu; }
}
