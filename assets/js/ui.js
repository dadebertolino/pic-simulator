/**
 * WebPicSimulator UI Controller
 * Versione MVP - PIC16F84A only
 * Load/Save da PC locale
 */

class SimulatorUI {
    constructor(simulator) {
        this.simulator = simulator;
        this.cpu = simulator.cpu;
        
        // Editor
        this.editor = null;
        this.lineNumbers = null;
        this.lineHeight = 18;
        this.errorLines = [];
        
        // Animate mode
        this.animating = false;
        this.animateInterval = null;
        this.animateSpeed = 100;
        
        // Breakpoints
        this.breakpoints = new Set();
        
        // Memory view
        this.memoryType = 'ram';
        
        // Callbacks
        this.simulator.onUpdate = () => this.update();
        this.simulator.onBreakpoint = (addr) => this.onBreakpoint(addr);
        this.simulator.onError = (msg) => this.showError(msg);
        this.cpu.onPortChange = (port) => this.updatePort(port);
    }

    init() {
        this.initEditor();
        this.initControls();
        this.initPorts();
        this.initMemoryView();
        this.initKeyboard();
        this.loadSampleCode();
        this.update();
        this.setStatus('Ready', 'idle');
    }

    // === EDITOR ===
    
    initEditor() {
        this.editor = document.getElementById('code-editor');
        this.lineNumbers = document.getElementById('line-numbers');
        if (!this.editor) return;
        
        this.editor.addEventListener('input', () => this.onEditorChange());
        this.editor.addEventListener('scroll', () => this.syncScroll());
        this.editor.addEventListener('keydown', (e) => this.handleEditorKey(e));
        this.updateLineNumbers();
    }

    onEditorChange() {
        this.updateLineNumbers();
        this.clearErrors();
    }

    updateLineNumbers() {
        if (!this.editor || !this.lineNumbers) return;
        
        const lines = this.editor.value.split('\n');
        const sourceMap = this.simulator.assemblyResult?.sourceMap || {};
        const pcLine = this.simulator.getLineForAddress(this.cpu.PC);
        
        const lineToAddr = {};
        for (const [addr, line] of Object.entries(sourceMap)) {
            lineToAddr[line] = parseInt(addr);
        }
        
        let html = '';
        for (let i = 1; i <= lines.length; i++) {
            const addr = lineToAddr[i];
            const hasBreakpoint = this.breakpoints.has(addr);
            const isCurrent = (pcLine === i && this.simulator.assemblyResult?.success);
            const hasError = this.errorLines.includes(i);
            
            let cls = 'picsim__line-num';
            if (hasBreakpoint) cls += ' picsim__line-num--bp';
            if (isCurrent) cls += ' picsim__line-num--current';
            if (hasError) cls += ' picsim__line-num--error';
            
            const display = addr !== undefined 
                ? addr.toString(16).toUpperCase().padStart(3, '0')
                : i.toString().padStart(3, ' ');
            
            html += `<span class="${cls}" data-line="${i}" data-addr="${addr ?? ''}">${display}</span>\n`;
        }
        
        this.lineNumbers.innerHTML = html;
        
        this.lineNumbers.querySelectorAll('.picsim__line-num').forEach(el => {
            el.addEventListener('click', () => {
                const addr = parseInt(el.dataset.addr);
                if (!isNaN(addr)) this.toggleBreakpoint(addr);
            });
        });
        
        this.updateLineHighlight();
    }

    updateLineHighlight() {
        const highlight = document.getElementById('line-highlight');
        if (!highlight) return;
        
        const pcLine = this.simulator.getLineForAddress(this.cpu.PC);
        if (pcLine && this.simulator.assemblyResult?.success) {
            highlight.style.display = 'block';
            highlight.style.top = (10 + (pcLine - 1) * this.lineHeight - this.editor.scrollTop) + 'px';
        } else {
            highlight.style.display = 'none';
        }
    }

    syncScroll() {
        if (this.lineNumbers) this.lineNumbers.scrollTop = this.editor.scrollTop;
        this.updateLineHighlight();
    }

    handleEditorKey(e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = this.editor.selectionStart;
            this.editor.value = this.editor.value.substring(0, start) + '    ' + this.editor.value.substring(this.editor.selectionEnd);
            this.editor.selectionStart = this.editor.selectionEnd = start + 4;
            this.onEditorChange();
        }
    }

    getSource() { return this.editor?.value || ''; }
    setSource(code) { if (this.editor) { this.editor.value = code; this.onEditorChange(); } }

    scrollToLine(line) {
        if (!this.editor) return;
        this.editor.scrollTop = Math.max(0, (line - 5) * this.lineHeight);
        this.syncScroll();
    }

    // === CONTROLS ===
    
    initControls() {
        document.getElementById('btn-new')?.addEventListener('click', () => this.newProgram());
        document.getElementById('btn-assemble')?.addEventListener('click', () => this.assemble());
        document.getElementById('btn-run')?.addEventListener('click', () => this.run());
        document.getElementById('btn-animate')?.addEventListener('click', () => this.toggleAnimate());
        document.getElementById('btn-stop')?.addEventListener('click', () => this.stop());
        document.getElementById('btn-step')?.addEventListener('click', () => this.step());
        document.getElementById('btn-step-over')?.addEventListener('click', () => this.stepOver());
        document.getElementById('btn-reset')?.addEventListener('click', () => this.reset());
        document.getElementById('btn-clear-breakpoints')?.addEventListener('click', () => this.clearAllBreakpoints());
        document.getElementById('btn-load')?.addEventListener('click', () => this.loadFile());
        document.getElementById('btn-save')?.addEventListener('click', () => this.saveFile());
        document.getElementById('file-input')?.addEventListener('change', (e) => this.handleFileLoad(e));
        
        const speedSlider = document.getElementById('speed-slider');
        if (speedSlider) {
            speedSlider.addEventListener('input', (e) => {
                const speeds = [1000, 500, 100, 50, 10];
                const labels = ['1 Hz', '2 Hz', '10 Hz', '20 Hz', '100 Hz'];
                const val = parseInt(e.target.value) - 1;
                this.animateSpeed = speeds[val] || 100;
                document.getElementById('speed-value').textContent = labels[val] || '10 Hz';
            });
        }
    }

    initKeyboard() {
        document.addEventListener('keydown', (e) => {
            const inEditor = document.activeElement === this.editor;
            
            if (e.key === 'F5') { e.preventDefault(); e.ctrlKey ? this.assemble() : (this.simulator.running || this.animating ? this.stop() : this.run()); }
            else if (e.key === 'F6') { e.preventDefault(); this.toggleAnimate(); }
            else if (e.key === 'F8' && !inEditor) { e.preventDefault(); this.step(); }
            else if (e.key === 'F10' && !inEditor) { e.preventDefault(); this.stepOver(); }
            else if (e.key === 'Escape') { e.preventDefault(); this.stop(); }
            else if (e.ctrlKey && e.key === 'n') { e.preventDefault(); this.newProgram(); }
            else if (e.ctrlKey && e.key === 's') { e.preventDefault(); this.saveFile(); }
            else if (e.ctrlKey && e.key === 'o') { e.preventDefault(); this.loadFile(); }
            else if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); this.assemble(); }
        });
    }

    // === ACTIONS ===
    
    assemble() {
        this.stop();
        this.clearErrors();
        const result = this.simulator.loadSource(this.getSource());
        if (result.success) {
            this.setStatus('Assembled: ' + result.programMemory.length + ' words', 'success');
            this.simulator.reset();
        } else {
            this.showAssemblyErrors(result.errors);
            this.setStatus('Assembly failed', 'error');
        }
        this.update();
    }

    run() {
        if (!this.simulator.assemblyResult?.success) { this.assemble(); if (!this.simulator.assemblyResult?.success) return; }
        this.stopAnimate();
        this.simulator.run();
        this.setStatus('Running...', 'running');
        this.updateButtons(true);
    }

    toggleAnimate() { this.animating ? this.stopAnimate() : this.startAnimate(); }

    startAnimate() {
        if (!this.simulator.assemblyResult?.success) { this.assemble(); if (!this.simulator.assemblyResult?.success) return; }
        this.simulator.stop();
        this.animating = true;
        this.setStatus('Animating...', 'running');
        this.updateButtons(true);
        
        this.animateInterval = setInterval(() => {
            this.simulator.step();
            this.update();
            if (this.breakpoints.has(this.cpu.PC)) { this.stopAnimate(); this.onBreakpoint(this.cpu.PC); }
        }, this.animateSpeed);
    }

    stopAnimate() {
        this.animating = false;
        if (this.animateInterval) { clearInterval(this.animateInterval); this.animateInterval = null; }
        this.updateButtons(false);
    }

    stop() {
        this.stopAnimate();
        this.simulator.stop();
        this.setStatus('Stopped', 'idle');
        this.updateButtons(false);
        this.update();
    }

    step() {
        if (!this.simulator.assemblyResult?.success) { this.assemble(); if (!this.simulator.assemblyResult?.success) return; }
        this.stopAnimate();
        this.simulator.stop();
        this.simulator.step();
        this.setStatus('Step', 'idle');
        this.update();
        const pcLine = this.simulator.getLineForAddress(this.cpu.PC);
        if (pcLine) this.scrollToLine(pcLine);
    }

    stepOver() {
        const opcode = this.cpu.programMemory[this.cpu.PC];
        if ((opcode & 0x3800) === 0x2000) { // CALL
            const nextAddr = this.cpu.PC + 1;
            const maxCycles = this.cpu.cycles + 10000;
            this.simulator.step();
            while (this.cpu.PC !== nextAddr && this.cpu.cycles < maxCycles && !this.breakpoints.has(this.cpu.PC)) {
                this.simulator.step();
            }
            this.update();
        } else {
            this.step();
        }
    }

    reset() { this.stop(); this.simulator.reset(); this.setStatus('Reset', 'idle'); this.update(); }

    // === BREAKPOINTS ===
    
    toggleBreakpoint(addr) {
        if (this.breakpoints.has(addr)) { this.breakpoints.delete(addr); this.cpu.clearBreakpoint(addr); }
        else { this.breakpoints.add(addr); this.cpu.setBreakpoint(addr); }
        this.updateLineNumbers();
        this.updateBreakpointsList();
    }

    clearAllBreakpoints() {
        this.breakpoints.forEach(addr => this.cpu.clearBreakpoint(addr));
        this.breakpoints.clear();
        this.updateLineNumbers();
        this.updateBreakpointsList();
    }

    onBreakpoint(addr) {
        this.stop();
        this.setStatus('Breakpoint @ 0x' + addr.toString(16).toUpperCase().padStart(3, '0'), 'warning');
        const line = this.simulator.getLineForAddress(addr);
        if (line) this.scrollToLine(line);
    }

    updateBreakpointsList() {
        const list = document.getElementById('breakpoints-list');
        if (!list) return;
        if (this.breakpoints.size === 0) { list.innerHTML = '<div class="picsim__hint">Click sui numeri di riga</div>'; return; }
        
        let html = '';
        this.breakpoints.forEach(addr => {
            html += `<div class="picsim__bp-item"><span>0x${addr.toString(16).toUpperCase().padStart(3, '0')}</span><button class="picsim__btn-tiny" data-addr="${addr}">✕</button></div>`;
        });
        list.innerHTML = html;
        list.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => this.toggleBreakpoint(parseInt(btn.dataset.addr))));
    }

    // === NEW / LOAD / SAVE ===
    
    newProgram() {
        if (this.getSource().trim() && !confirm('Creare un nuovo programma? Il codice attuale andrà perso.')) return;
        this.fullReset();
        this.setSource('; Nuovo programma PIC16F84A\n; Scrivi il tuo codice qui...\n\n    ORG 0x000\n\nMAIN:\n    ; Il tuo codice...\n    GOTO MAIN\n\n    END\n');
        this.setStatus('Nuovo programma', 'success');
    }

    fullReset() {
        // Stop simulazione
        this.stop();
        
        // Reset CPU e memoria
        this.cpu.reset();
        this.simulator.assemblyResult = null;
        
        // Pulisci breakpoints
        this.breakpoints.forEach(addr => this.cpu.clearBreakpoint(addr));
        this.breakpoints.clear();
        
        // Pulisci errori
        this.clearErrors();
        
        // Aggiorna UI
        this.update();
        this.updateBreakpointsList();
    }
    
    loadFile() { const input = document.getElementById('file-input'); if (input) { input.value = ''; input.click(); } }

    handleFileLoad(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => { 
            this.fullReset();
            this.setSource(ev.target.result); 
            this.setStatus('Loaded: ' + file.name, 'success'); 
        };
        reader.readAsText(file);
    }

    saveFile() {
        const blob = new Blob([this.getSource()], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'program.asm';
        a.click();
        URL.revokeObjectURL(a.href);
        this.setStatus('Saved: program.asm', 'success');
    }

    // === PORTS ===
    
    initPorts() {
        // Click sui pin per toggle input
        document.querySelectorAll('.picsim__pin').forEach(pin => {
            pin.addEventListener('click', () => {
                const port = pin.dataset.port;
                const bit = parseInt(pin.dataset.bit);
                const tris = port === 'A' ? this.cpu.ram[0x85] : this.cpu.ram[0x86];
                if (tris & (1 << bit)) {
                    // È un input, toggle valore esterno
                    const current = port === 'A' ? this.cpu.externalPortA : this.cpu.externalPortB;
                    this.cpu.setExternalInput(port, bit, (current & (1 << bit)) ? 0 : 1);
                    this.updatePort(port);
                    const updated = port === 'A' ? this.cpu.externalPortA : this.cpu.externalPortB;
                    this.setStatus(`R${port}${bit} = ${(updated & (1 << bit)) ? 1 : 0}`, 'success');
                } else {
                    this.setStatus(`R${port}${bit} è configurato come OUTPUT`, 'warning');
                }
            });
        });
        
        // Click sui TRIS per editare
        document.querySelectorAll('.picsim__tris-val').forEach(trisEl => {
            trisEl.addEventListener('click', (e) => this.editTris(e.target));
        });
        
        this.updatePort('A');
        this.updatePort('B');
    }

    editTris(el) {
        if (el.querySelector('input')) return;
        
        const port = el.dataset.port;
        const trisAddr = port === 'A' ? 0x85 : 0x86;
        const currentVal = this.cpu.ram[trisAddr];
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'picsim__tris-input';
        input.value = currentVal.toString(16).toUpperCase().padStart(2, '0');
        input.maxLength = 2;
        
        el.textContent = '';
        el.appendChild(input);
        input.focus();
        input.select();
        
        const saveValue = () => {
            let val = parseInt(input.value, 16);
            if (isNaN(val)) val = currentVal;
            val = Math.max(0, Math.min(255, val));
            
            // Per PORTA solo 5 bit (0-4)
            if (port === 'A') val &= 0x1F;
            
            this.cpu.ram[trisAddr] = val;
            this.updatePort(port);
            this.setStatus(`TRIS${port} = ${val.toString(16).toUpperCase().padStart(2, '0')} (${val.toString(2).padStart(8, '0')})`, 'success');
        };
        
        input.addEventListener('blur', saveValue);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); saveValue(); }
            else if (e.key === 'Escape') { e.preventDefault(); this.updatePort(port); }
        });
    }

    updatePort(port) {
        const data = port === 'A' ? this.cpu.ram[0x05] : this.cpu.ram[0x06];
        const tris = port === 'A' ? this.cpu.ram[0x85] : this.cpu.ram[0x86];
        const ext = port === 'A' ? this.cpu.externalPortA : this.cpu.externalPortB;
        // Valore letto sui pin: latch sugli output, livello esterno sugli input.
        // E' quello che leggerebbe il programma, non il solo latch.
        const pins = this.cpu.readPortPins(port);
        
        const valueEl = document.getElementById(`port${port.toLowerCase()}-value`);
        if (valueEl) valueEl.textContent = pins.toString(16).toUpperCase().padStart(2, '0');
        
        const trisEl = document.getElementById(`tris${port.toLowerCase()}-value`);
        if (trisEl) trisEl.textContent = tris.toString(16).toUpperCase().padStart(2, '0');
        
        document.querySelectorAll(`#port${port.toLowerCase()}-pins .picsim__pin`).forEach(pinEl => {
            const bit = parseInt(pinEl.dataset.bit);
            const isInput = (tris >> bit) & 1;
            const value = isInput ? ((ext >> bit) & 1) : ((data >> bit) & 1);
            
            pinEl.classList.toggle('picsim__pin--input', isInput);
            pinEl.classList.toggle('picsim__pin--output', !isInput);
            pinEl.classList.toggle('picsim__pin--high', value === 1);
            pinEl.classList.toggle('picsim__pin--low', value === 0);
            
            // Aggiorna tooltip con info direzione
            const dir = isInput ? 'INPUT' : 'OUTPUT';
            const state = value ? 'HIGH' : 'LOW';
            pinEl.title = `R${port}${bit} - ${dir} - ${state}`;
        });
    }

    // === MEMORY ===
    
    initMemoryView() {
        document.querySelectorAll('.picsim__memory-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.picsim__memory-tab').forEach(t => t.classList.remove('picsim__memory-tab--active'));
                tab.classList.add('picsim__memory-tab--active');
                this.memoryType = tab.dataset.type;
                this.updateMemoryView();
            });
        });
        this.updateMemoryView();
    }

    updateMemoryView() {
        const container = document.getElementById('memory-view');
        if (!container) return;
        
        let html = '<div class="picsim__mem-grid">';
        
        if (this.memoryType === 'ram') {
            for (let row = 0; row < 8; row++) {
                const base = 0x0C + row * 8;
                html += `<div class="picsim__mem-row"><span class="picsim__mem-addr">${base.toString(16).toUpperCase().padStart(2, '0')}</span>`;
                for (let col = 0; col < 8 && base + col <= 0x4F; col++) {
                    const addr = base + col;
                    const val = this.cpu.ram[addr].toString(16).toUpperCase().padStart(2, '0');
                    html += `<span class="picsim__mem-val picsim__mem-val--editable" data-type="ram" data-addr="${addr}" title="Click per editare">${val}</span>`;
                }
                html += '</div>';
            }
        } else if (this.memoryType === 'program') {
            const pc = this.cpu.PC;
            for (let addr = Math.max(0, pc - 4); addr <= Math.min(1023, pc + 12); addr++) {
                const word = this.cpu.programMemory[addr];
                const cur = addr === pc ? ' picsim__mem-instr--current' : '';
                html += `<div class="picsim__mem-instr${cur}"><span>${addr.toString(16).toUpperCase().padStart(3, '0')}</span><span>${word.toString(16).toUpperCase().padStart(4, '0')}</span><span>${PIC16Assembler.disassemble(word, addr)}</span></div>`;
            }
        } else if (this.memoryType === 'eeprom') {
            for (let row = 0; row < 8; row++) {
                const base = row * 8;
                html += `<div class="picsim__mem-row"><span class="picsim__mem-addr">${base.toString(16).toUpperCase().padStart(2, '0')}</span>`;
                for (let col = 0; col < 8; col++) {
                    const addr = base + col;
                    const val = this.cpu.eeprom[addr].toString(16).toUpperCase().padStart(2, '0');
                    html += `<span class="picsim__mem-val picsim__mem-val--editable" data-type="eeprom" data-addr="${addr}" title="Click per editare">${val}</span>`;
                }
                html += '</div>';
            }
        }
        
        html += '</div>';
        container.innerHTML = html;
        
        // Aggiungi event listeners per editing
        container.querySelectorAll('.picsim__mem-val--editable').forEach(cell => {
            cell.addEventListener('click', (e) => this.editMemoryCell(e.target));
        });
    }

    editMemoryCell(cell) {
        // Se già in editing, esci
        if (cell.querySelector('input')) return;
        
        const type = cell.dataset.type;
        const addr = parseInt(cell.dataset.addr);
        const currentVal = type === 'ram' ? this.cpu.ram[addr] : this.cpu.eeprom[addr];
        
        // Crea input
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'picsim__mem-input';
        input.value = currentVal.toString(16).toUpperCase().padStart(2, '0');
        input.maxLength = 2;
        
        // Sostituisci contenuto
        cell.textContent = '';
        cell.appendChild(input);
        input.focus();
        input.select();
        
        // Handler per salvare
        const saveValue = () => {
            let val = parseInt(input.value, 16);
            if (isNaN(val)) val = currentVal;
            val = Math.max(0, Math.min(255, val)); // Clamp 0-255
            
            if (type === 'ram') {
                this.cpu.ram[addr] = val;
            } else {
                this.cpu.eeprom[addr] = val;
            }
            
            this.updateMemoryView();
            this.setStatus(`${type.toUpperCase()}[${addr.toString(16).toUpperCase()}] = ${val.toString(16).toUpperCase().padStart(2, '0')}`, 'success');
        };
        
        // Eventi
        input.addEventListener('blur', saveValue);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveValue();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.updateMemoryView();
            }
        });
    }

    // === REGISTERS ===
    
    updateRegisters() {
        const s = this.cpu.getState();
        document.getElementById('reg-w').textContent = s.W.toString(16).toUpperCase().padStart(2, '0');
        document.getElementById('reg-pc').textContent = s.PC.toString(16).toUpperCase().padStart(3, '0');
        document.getElementById('reg-status').textContent = s.STATUS.toString(16).toUpperCase().padStart(2, '0');
        document.getElementById('reg-fsr').textContent = s.FSR.toString(16).toUpperCase().padStart(2, '0');
        document.getElementById('reg-option').textContent = s.OPTION.toString(16).toUpperCase().padStart(2, '0');
        document.getElementById('reg-intcon').textContent = s.INTCON.toString(16).toUpperCase().padStart(2, '0');
        document.getElementById('reg-tmr0').textContent = s.TMR0.toString(16).toUpperCase().padStart(2, '0');
        document.getElementById('reg-pclath').textContent = s.PCLATH.toString(16).toUpperCase().padStart(2, '0');
        
        document.getElementById('bit-c')?.classList.toggle('picsim__bit--set', s.STATUS & 0x01);
        document.getElementById('bit-dc')?.classList.toggle('picsim__bit--set', s.STATUS & 0x02);
        document.getElementById('bit-z')?.classList.toggle('picsim__bit--set', s.STATUS & 0x04);
        document.getElementById('bit-pd')?.classList.toggle('picsim__bit--set', s.STATUS & 0x08);
        document.getElementById('bit-to')?.classList.toggle('picsim__bit--set', s.STATUS & 0x10);
        document.getElementById('bit-rp0')?.classList.toggle('picsim__bit--set', s.STATUS & 0x20);
        
        document.getElementById('cycles-count').textContent = s.cycles.toLocaleString();
        
        const instr = this.simulator.getCurrentInstruction();
        document.getElementById('current-instruction').textContent = `${instr.address.toString(16).toUpperCase().padStart(3, '0')}: ${instr.disassembly}`;
        
        const tmr0Bar = document.getElementById('tmr0-bar');
        if (tmr0Bar) tmr0Bar.style.width = (s.TMR0 / 255 * 100) + '%';
        document.getElementById('tmr0-display').textContent = s.TMR0.toString(16).toUpperCase().padStart(2, '0');
        
        const opt = s.OPTION;
        document.getElementById('prescaler-value').textContent = (opt & 0x08) ? 'WDT' : '1:' + (1 << ((opt & 0x07) + 1));
        document.getElementById('tmr0-source').textContent = (opt & 0x20) ? 'External' : 'Internal';
    }

    updateStack() {
        const container = document.getElementById('stack-view');
        if (!container) return;
        const s = this.cpu.getState();
        let html = '';
        for (let i = 0; i < 8; i++) {
            const isTop = i === ((s.stackPointer - 1 + 8) % 8) && s.stackPointer > 0;
            html += `<div class="picsim__stack-item${isTop ? ' picsim__stack-item--top' : ''}"><span>${i}</span><span>${s.stack[i].toString(16).toUpperCase().padStart(4, '0')}</span></div>`;
        }
        container.innerHTML = html;
        document.getElementById('stack-depth').textContent = `${s.stackPointer}/8`;
    }

    // === ERRORS ===
    
    showAssemblyErrors(errors) {
        const panel = document.getElementById('error-panel');
        if (!panel) return;
        this.errorLines = errors.map(e => e.line).filter(l => l);
        let html = '';
        errors.forEach(err => { html += `<div class="picsim__error"><span>Line ${err.line || '?'}</span><span>${err.message}</span></div>`; });
        panel.innerHTML = html;
        panel.classList.add('picsim__errors--visible');
        this.updateLineNumbers();
    }

    clearErrors() {
        this.errorLines = [];
        const panel = document.getElementById('error-panel');
        if (panel) { panel.innerHTML = ''; panel.classList.remove('picsim__errors--visible'); }
    }

    showError(msg) { this.setStatus('Error: ' + msg, 'error'); }

    // === STATUS ===
    
    setStatus(text, type = 'idle') {
        document.getElementById('status-text').textContent = text;
        const dot = document.getElementById('status-dot');
        if (dot) dot.className = 'picsim__status-dot picsim__status-dot--' + type;
    }

    updateButtons(running) {
        document.getElementById('btn-run').disabled = running;
        document.getElementById('btn-stop').disabled = !running && !this.animating;
        document.getElementById('btn-step').disabled = running;
        document.getElementById('btn-step-over').disabled = running;
        const btn = document.getElementById('btn-animate');
        if (btn) btn.textContent = this.animating ? '⏸ Pause' : '⏯ Animate';
    }

    update() {
        this.updateRegisters();
        this.updateStack();
        this.updatePort('A');
        this.updatePort('B');
        this.updateMemoryView();
        this.updateLineNumbers();
        this.updateBreakpointsList();
    }

    loadSampleCode() {
        this.setSource(`; PIC16F84A - Blink LED su RB0
; WebPicSimulator by Prof. D. Bertolino

    LIST P=16F84A

; === REGISTRI ===
STATUS  EQU 0x03
PORTB   EQU 0x06
TRISB   EQU 0x86
RP0     EQU 5

; === VARIABILI ===
    CBLOCK 0x0C
    COUNT1
    COUNT2
    ENDC

; === RESET VECTOR ===
    ORG 0x00
    GOTO START

; === INTERRUPT VECTOR ===
    ORG 0x04
    RETFIE

; === PROGRAMMA ===
START:
    BSF STATUS, RP0     ; Bank 1
    CLRF TRISB          ; PORTB output
    BCF STATUS, RP0     ; Bank 0
    CLRF PORTB

MAIN:
    BSF PORTB, 0        ; LED ON
    CALL DELAY
    BCF PORTB, 0        ; LED OFF
    CALL DELAY
    GOTO MAIN

DELAY:
    MOVLW 0xFF
    MOVWF COUNT1
LOOP1:
    MOVLW 0xFF
    MOVWF COUNT2
LOOP2:
    DECFSZ COUNT2, F
    GOTO LOOP2
    DECFSZ COUNT1, F
    GOTO LOOP1
    RETURN

    END
`);
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = SimulatorUI;
