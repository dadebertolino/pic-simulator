/**
 * UI Watches Module
 */
class UIWatches {
    constructor(ctx) {
        this.cpu = ctx.cpu;
        this.simulator = ctx.simulator;
        this.ui = ctx.ui;
        this.watches = [];
    }

    init() {
        var self = this;
        var btn = document.getElementById('btn-add-watch');
        if (btn) btn.addEventListener('click', function() {
            var input = document.getElementById('watch-input');
            if (input && input.value.trim()) { self.addWatch(input.value.trim()); input.value = ''; }
        });
    }

    addWatch(expr) { this.watches.push(expr); this.updateWatches(); }
    removeWatch(index) { this.watches.splice(index, 1); this.updateWatches(); }

    updateWatches() {
        var container = document.getElementById('watches-list');
        if (!container) return;
        container.innerHTML = '';
        var self = this;
        this.watches.forEach(function(expr, i) {
            var value = self.evaluateWatch(expr);
            var item = document.createElement('div');
            item.className = 'watch-item';
            item.innerHTML = '<span class="watch-expr">' + expr + '</span><span class="watch-value">' + value + '</span><button class="watch-remove" data-idx="' + i + '">&times;</button>';
            item.querySelector('.watch-remove').addEventListener('click', function() { self.removeWatch(i); });
            container.appendChild(item);
        });
    }

    evaluateWatch(expr) {
        try {
            var upper = expr.toUpperCase();
            if (this.simulator.assembler.registers[upper] !== undefined) {
                var addr = this.simulator.assembler.registers[upper];
                return '0x' + this.cpu.ram[addr].toString(16).toUpperCase().padStart(2, '0');
            }
            if (this.simulator.assemblyResult && this.simulator.assemblyResult.variables[upper] !== undefined) {
                var addr2 = this.simulator.assemblyResult.variables[upper];
                return '0x' + this.cpu.ram[addr2].toString(16).toUpperCase().padStart(2, '0');
            }
            var addr3 = parseInt(expr, 16);
            if (!isNaN(addr3) && addr3 < 256) return '0x' + this.cpu.ram[addr3].toString(16).toUpperCase().padStart(2, '0');
            return '?';
        } catch(e) { return 'ERR'; }
    }

    update() { this.updateWatches(); }
    setCpu(cpu) { this.cpu = cpu; }
}
