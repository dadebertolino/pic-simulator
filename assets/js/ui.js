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
        
        // Nome del sorgente: quello del file caricato, usato da Save ed export HEX.
        this.fileName = 'programma.asm';
        
        // Memory view
        this.memoryType = 'ram';
        
        // Cella/campo attualmente aperto in editing: sospende il ridisegno
        // periodico, che altrimenti lo distruggerebbe sotto le dita.
        this.editing = null;
        
        // Callbacks
        this.simulator.onUpdate = () => this.update();
        this.simulator.onBreakpoint = (addr) => this.onBreakpoint(addr);
        this.simulator.onError = (msg) => this.showError(msg);
        this.simulator.onStepOverDone = () => this.onStepOverDone();
        // Durante Run update() ridisegna le porte a ogni tick: aggiornarle
        // anche a ogni scrittura significherebbe migliaia di ridisegni al
        // secondo in un loop che scrive su PORTB.
        this.cpu.onPortChange = (port) => {
            if (!this.simulator.running) this.updatePort(port);
        };
    }

    init() {
        this.initEditor();
        this.initControls();
        this.initPorts();
        this.initMemoryView();
        this.initKeyboard();
        this.loadSampleCode();
        this.update();
        this.setStatus('Pronto', 'idle');
    }

    // === EDITOR ===
    
    initEditor() {
        this.editor = document.getElementById('code-editor');
        this.lineNumbers = document.getElementById('line-numbers');
        if (!this.editor) return;
        
        this.editor.addEventListener('input', () => this.onEditorChange());
        this.editor.addEventListener('scroll', () => this.syncScroll());
        this.editor.addEventListener('keydown', (e) => this.handleEditorKey(e));
        
        // Listener delegato: collegato una volta sola, sopravvive ai rebuild
        // della colonna dei numeri di riga.
        this.lineNumbers?.addEventListener('click', (e) => {
            const el = e.target.closest('.picsim__line-num');
            if (!el) return;
            const addr = parseInt(el.dataset.addr);
            if (!isNaN(addr)) this.toggleBreakpoint(addr);
        });
        
        this.updateLineNumbers();
    }

    onEditorChange() {
        this.updateLineNumbers();
        this.clearErrors();
    }

    updateLineNumbers() {
        if (!this.editor || !this.lineNumbers) return;
        
        const lineCount = this.editor.value.split('\n').length;
        const result = this.simulator.assemblyResult;
        
        // La struttura (quante righe, con quale indirizzo) dipende solo dal
        // testo e dall'ultimo assemblaggio. Durante Run update() arriva a
        // ~60 fps: ricostruirla ogni volta e' sprecato, e a ogni innerHTML
        // gli input aperti perderebbero il focus.
        if (lineCount !== this.lineNumCount || result !== this.lineNumResult) {
            this.lineNumCount = lineCount;
            this.lineNumResult = result;
            this.renderLineNumbers(lineCount, result?.sourceMap || {});
        }
        
        this.refreshLineNumberStates();
        this.updateLineHighlight();
    }

    renderLineNumbers(lineCount, sourceMap) {
        const lineToAddr = {};
        for (const [addr, line] of Object.entries(sourceMap)) {
            lineToAddr[line] = parseInt(addr);
        }
        
        let html = '';
        for (let i = 1; i <= lineCount; i++) {
            const addr = lineToAddr[i];
            const display = addr !== undefined 
                ? addr.toString(16).toUpperCase().padStart(3, '0')
                : i.toString().padStart(3, ' ');
            
            html += `<span class="picsim__line-num" data-line="${i}" data-addr="${addr ?? ''}">${display}</span>\n`;
        }
        
        this.lineNumbers.innerHTML = html;
        this.lineNumEls = Array.from(this.lineNumbers.querySelectorAll('.picsim__line-num'));
    }

    refreshLineNumberStates() {
        if (!this.lineNumEls) return;
        
        const pcLine = this.simulator.getLineForAddress(this.cpu.PC);
        const assembled = !!this.simulator.assemblyResult?.success;
        
        for (const el of this.lineNumEls) {
            const line = parseInt(el.dataset.line);
            const addr = parseInt(el.dataset.addr);
            
            el.classList.toggle('picsim__line-num--bp', !isNaN(addr) && this.breakpoints.has(addr));
            el.classList.toggle('picsim__line-num--current', assembled && pcLine === line);
            el.classList.toggle('picsim__line-num--error', this.errorLines.includes(line));
        }
    }

    updateLineHighlight() {
        const highlight = document.getElementById('line-highlight');
        if (!highlight) return;
        
        const pcLine = this.simulator.getLineForAddress(this.cpu.PC);
        if (pcLine && this.simulator.assemblyResult?.success) {
            highlight.style.display = 'block';
            // 8px = padding-top di .picsim__editor
            highlight.style.top = (8 + (pcLine - 1) * this.lineHeight - this.editor.scrollTop) + 'px';
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
        document.getElementById('btn-hex')?.addEventListener('click', () => this.exportHex());
        document.getElementById('file-input')?.addEventListener('change', (e) => this.handleFileLoad(e));
        
        // Velocita' di Run: due select (toolbar completa e mini) sincronizzate.
        const runSpeeds = ['run-speed', 'run-speed2'].map(id => document.getElementById(id)).filter(Boolean);
        runSpeeds.forEach(select => select.addEventListener('change', () => {
            const value = select.value;
            runSpeeds.forEach(other => { other.value = value; });
            this.simulator.setSpeedFactor(value === 'max' ? Infinity : parseFloat(value));
        }));
        
        // Velocita' di Animate: due slider (toolbar completa e mini) sincronizzati.
        const sliders = ['speed-slider', 'speed-slider2'].map(id => document.getElementById(id)).filter(Boolean);
        sliders.forEach(slider => slider.addEventListener('input', () => this.setAnimateSpeed(slider.value, sliders)));
    }

    /**
     * Slider da 1 a 5: 1, 2, 10, 20, 100 istruzioni al secondo. Se Animate
     * e' in corso riparte subito al nuovo ritmo.
     */
    setAnimateSpeed(position, sliders = []) {
        const hz = [1, 2, 10, 20, 100][parseInt(position, 10) - 1] || 10;
        this.animateSpeed = 1000 / hz;
        
        sliders.forEach(slider => {
            slider.value = position;
            slider.setAttribute('aria-valuetext', `${hz} istruzion${hz === 1 ? 'e' : 'i'} al secondo`);
        });
        ['speed-value', 'speed-value2'].forEach(id => {
            const label = document.getElementById(id);
            if (label) label.textContent = hz + ' Hz';
        });
        
        if (this.animating) {
            clearInterval(this.animateInterval);
            this.animateInterval = setInterval(() => this.animateTick(), this.animateSpeed);
        }
    }

    initKeyboard() {
        this.container = document.getElementById('pic-simulator');
        
        // Un click su un'area non focalizzabile (pannelli, pin, sfondo)
        // lascerebbe il focus sul body e disattiverebbe le scorciatoie:
        // in quel caso lo spostiamo sul contenitore, che e' tabindex="-1".
        this.container?.addEventListener('mousedown', (e) => {
            if (!e.target.closest('input, textarea, select, button, a')) {
                this.container.focus({ preventScroll: true });
            }
        });
        
        document.addEventListener('keydown', (e) => {
            // Le scorciatoie valgono solo quando il simulatore e' in uso.
            // Il listener e' su document (serve per intercettare F5 ovunque
            // dentro il widget), ma senza questa guardia il plugin rubava
            // F5 e Ctrl+S all'intera pagina WordPress che lo ospita.
            if (!this.isActive()) return;
            
            const inEditor = document.activeElement === this.editor;
            // Su Mac le scorciatoie usano Cmd: Ctrl+S resterebbe al browser.
            const mod = e.ctrlKey || e.metaKey;
            
            if (e.key === 'F5') { e.preventDefault(); mod ? this.assemble() : (this.simulator.running || this.animating ? this.stop() : this.run()); }
            else if (e.key === 'F6') { e.preventDefault(); this.toggleAnimate(); }
            else if (e.key === 'F8' && !inEditor) { e.preventDefault(); this.step(); }
            else if (e.key === 'F10' && !inEditor) { e.preventDefault(); this.stepOver(); }
            else if (e.key === 'Escape') { e.preventDefault(); this.stop(); }
            else if (mod && e.key === 'n') { e.preventDefault(); this.newProgram(); }
            else if (mod && e.key === 's') { e.preventDefault(); this.saveFile(); }
            else if (mod && e.key === 'o') { e.preventDefault(); this.loadFile(); }
            else if (mod && e.key === 'Enter') { e.preventDefault(); this.assemble(); }
        });
    }

    /**
     * Il simulatore ha il focus (o e' a schermo intero) e puo' quindi
     * catturare le scorciatoie da tastiera.
     */
    isActive() {
        if (!this.container) return false;
        return this.container.contains(document.activeElement)
            || document.fullscreenElement === this.container
            || this.container.classList.contains('picsim--fullscreen');
    }

    // === ACTIONS ===
    
    assemble() {
        this.stop();
        this.clearErrors();
        const result = this.simulator.loadSource(this.getSource());
        if (result.success) {
            this.setStatus(`Assemblato: ${result.programMemory.length} parole`, 'success');
            this.simulator.reset();
        } else {
            this.showAssemblyErrors(result.errors);
            this.setStatus(`Errori di assemblaggio: ${result.errors.length}`, 'error');
        }
        this.update();
    }

    run() {
        if (!this.simulator.assemblyResult?.success) { this.assemble(); if (!this.simulator.assemblyResult?.success) return; }
        this.stopAnimate();
        this.simulator.run();
        this.setStatus('In esecuzione...', 'running');
        this.updateButtons(true);
    }

    toggleAnimate() { this.animating ? this.stopAnimate() : this.startAnimate(); }

    startAnimate() {
        if (!this.simulator.assemblyResult?.success) { this.assemble(); if (!this.simulator.assemblyResult?.success) return; }
        this.simulator.stop();
        this.animating = true;
        this.setStatus('Animate in corso...', 'running');
        this.updateButtons(true);
        
        this.animateInterval = setInterval(() => this.animateTick(), this.animateSpeed);
    }

    animateTick() {
        this.simulator.step();
        this.update();
        if (this.breakpoints.has(this.cpu.PC)) { this.stopAnimate(); this.onBreakpoint(this.cpu.PC); }
    }

    stopAnimate() {
        this.animating = false;
        if (this.animateInterval) { clearInterval(this.animateInterval); this.animateInterval = null; }
        this.updateButtons(false);
    }

    stop() {
        this.stopAnimate();
        this.simulator.stop();
        this.setStatus('Fermo', 'idle');
        this.updateButtons(false);
        this.update();
    }

    step() {
        if (!this.simulator.assemblyResult?.success) { this.assemble(); if (!this.simulator.assemblyResult?.success) return; }
        this.stopAnimate();
        this.simulator.stop();
        this.simulator.step();
        this.afterStep('Step');
    }

    stepOver() {
        if (!this.simulator.assemblyResult?.success) { this.assemble(); if (!this.simulator.assemblyResult?.success) return; }
        if (this.simulator.running) return;
        this.stopAnimate();
        
        if (this.simulator.stepOver() === 'call') {
            // La subroutine gira nel ciclo di Run: i pulsanti restano quelli di Run
            // finche' onStepOverDone o un breakpoint non la fermano.
            this.setStatus('Step Over in corso...', 'running');
            this.updateButtons(true);
        } else {
            this.afterStep('Step');
        }
    }

    onStepOverDone() {
        this.updateButtons(false);
        this.afterStep('Step Over');
    }

    /** Stato, ridisegno e riga corrente in vista dopo uno Step o uno Step Over. */
    afterStep(label) {
        this.setStatus(label, 'idle');
        this.update();
        const pcLine = this.simulator.getLineForAddress(this.cpu.PC);
        if (pcLine) this.scrollToLine(pcLine);
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
        this.setStatus('Breakpoint a 0x' + addr.toString(16).toUpperCase().padStart(3, '0'), 'warning');
        const line = this.simulator.getLineForAddress(addr);
        if (line) this.scrollToLine(line);
    }

    /**
     * Elenco dei breakpoint. Si ricostruisce solo quando cambia: rifarlo a
     * ogni update() (60 volte al secondo durante Run) sostituiva il
     * pulsante tra mousedown e mouseup, e il click andava perso.
     */
    updateBreakpointsList() {
        const list = document.getElementById('breakpoints-list');
        if (!list) return;
        
        const key = Array.from(this.breakpoints).sort((a, b) => a - b).join(',');
        if (key === this.breakpointsKey) return;
        this.breakpointsKey = key;
        
        if (!this.breakpointsListBound) {
            this.breakpointsListBound = true;
            list.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-addr]');
                if (btn) this.toggleBreakpoint(parseInt(btn.dataset.addr, 10));
            });
        }
        
        if (this.breakpoints.size === 0) {
            list.innerHTML = '<div class="picsim__hint">Click sui numeri di riga</div>';
            return;
        }
        
        let html = '';
        Array.from(this.breakpoints).sort((a, b) => a - b).forEach(addr => {
            const hex = '0x' + addr.toString(16).toUpperCase().padStart(3, '0');
            html += `<div class="picsim__bp-item"><span>${hex}</span>`
                 +  `<button class="picsim__btn-tiny" data-addr="${addr}" aria-label="Rimuovi il breakpoint a ${hex}">✕</button></div>`;
        });
        list.innerHTML = html;
    }

    // === NEW / LOAD / SAVE ===
    
    newProgram() {
        if (this.getSource().trim() && !confirm('Creare un nuovo programma? Il codice attuale andrà perso.')) return;
        this.fullReset();
        this.fileName = 'programma.asm';
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
            this.fileName = file.name;
            this.setStatus('Caricato: ' + file.name, 'success'); 
        };
        reader.readAsText(file);
    }

    /** Scarica un file generato nel browser. */
    download(name, text) {
        const blob = new Blob([text], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Revocare subito l'URL puo' annullare il download in alcuni browser.
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    saveFile() {
        this.download(this.fileName, this.getSource());
        this.setStatus('Salvato: ' + this.fileName, 'success');
    }

    /** Intel HEX del programma, come lo produrrebbe MPASM per il programmatore. */
    exportHex() {
        if (!this.simulator.assemblyResult?.success) { this.assemble(); if (!this.simulator.assemblyResult?.success) return; }
        const name = this.fileName.replace(/\.[^.]*$/, '') + '.hex';
        this.download(name, this.simulator.exportHex() + '\n');
        this.setStatus('Esportato: ' + name, 'success');
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
                    this.setStatus(`R${port}${bit} è configurato come uscita`, 'warning');
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
        
        // Blocca la riscrittura periodica del campo TRIS mentre e' aperto.
        this.editing = { kind: 'tris', port: el.dataset.port };
        
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
        
        let finished = false;
        
        const closeEdit = () => {
            this.editing = null;
            this.updatePort(port);
        };
        
        const saveValue = () => {
            if (finished) return;
            finished = true;
            
            let val = parseInt(input.value, 16);
            if (isNaN(val)) val = currentVal;
            val = Math.max(0, Math.min(255, val));
            
            // Per PORTA solo 5 bit (0-4)
            if (port === 'A') val &= 0x1F;
            
            this.cpu.ram[trisAddr] = val;
            closeEdit();
            this.setStatus(`TRIS${port} = ${val.toString(16).toUpperCase().padStart(2, '0')} (${val.toString(2).padStart(8, '0')})`, 'success');
        };
        
        input.addEventListener('blur', saveValue);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); saveValue(); }
            else if (e.key === 'Escape') { e.preventDefault(); finished = true; closeEdit(); }
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
        const trisBeingEdited = this.editing?.kind === 'tris' && this.editing.port === port;
        if (trisEl && !trisBeingEdited) {
            trisEl.textContent = tris.toString(16).toUpperCase().padStart(2, '0');
        }
        
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
        
        // Listener delegato sul contenitore, che sopravvive ai rebuild della griglia.
        document.getElementById('memory-view')?.addEventListener('click', (e) => {
            const cell = e.target.closest('.picsim__mem-val--editable');
            if (cell) this.editMemoryCell(cell);
        });
        
        this.updateMemoryView();
    }

    updateMemoryView() {
        const container = document.getElementById('memory-view');
        if (!container) return;
        
        // Durante Run update() arriva a ~60 fps. Ricostruire la griglia a ogni
        // giro distruggerebbe la cella aperta in editing e sprecherebbe lavoro:
        // la struttura si ricostruisce solo quando cambia davvero, poi si
        // aggiornano i soli valori.
        if (this.editing) return;
        
        const pc = this.cpu.PC;
        const windowStart = this.programWindowStart(pc);
        const structureKey = this.memoryType === 'program'
            ? 'program:' + windowStart
            : this.memoryType;
        
        if (structureKey !== this.memoryStructureKey) {
            this.memoryStructureKey = structureKey;
            this.buildMemoryView(container, windowStart);
        }
        
        this.refreshMemoryValues(pc);
    }

    /**
     * Inizio della finestra di 17 istruzioni mostrata nella vista Program.
     * Resta ferma finche' il PC e' visibile: si ri-centra solo quando esce,
     * cosi' la lista non sobbalza a ogni step e non va ricostruita.
     */
    programWindowStart(pc) {
        const ROWS = 17;
        const maxStart = Math.max(0, 1024 - ROWS);
        const current = this.progWindowStart;
        
        if (current !== undefined && pc >= current && pc < current + ROWS) {
            return current;
        }
        
        this.progWindowStart = Math.min(maxStart, Math.max(0, pc - 4));
        return this.progWindowStart;
    }

    buildMemoryView(container, windowStart) {
        let html = '<div class="picsim__mem-grid">';
        
        if (this.memoryType === 'program') {
            const last = Math.min(1023, windowStart + 16);
            
            for (let addr = windowStart; addr <= last; addr++) {
                html += `<div class="picsim__mem-instr" data-addr="${addr}">`
                     +  `<span>${addr.toString(16).toUpperCase().padStart(3, '0')}</span>`
                     +  '<span class="picsim__mem-word"></span>'
                     +  '<span class="picsim__mem-disasm"></span></div>';
            }
        } else {
            const isRam = (this.memoryType === 'ram');
            const origin = isRam ? 0x0C : 0x00;
            const type = isRam ? 'ram' : 'eeprom';
            
            for (let row = 0; row < 8; row++) {
                const base = origin + row * 8;
                html += `<div class="picsim__mem-row"><span class="picsim__mem-addr">${base.toString(16).toUpperCase().padStart(2, '0')}</span>`;
                for (let col = 0; col < 8 && base + col <= (isRam ? 0x4F : 0x3F); col++) {
                    const addr = base + col;
                    html += `<span class="picsim__mem-val picsim__mem-val--editable" data-type="${type}" data-addr="${addr}" title="Click per editare"></span>`;
                }
                html += '</div>';
            }
        }
        
        html += '</div>';
        container.innerHTML = html;
        
        this.memoryCells = Array.from(container.querySelectorAll('.picsim__mem-val'));
        this.memoryRows = Array.from(container.querySelectorAll('.picsim__mem-instr'));
    }

    refreshMemoryValues(pc) {
        const hex = (v, n) => v.toString(16).toUpperCase().padStart(n, '0');
        
        if (this.memoryType === 'program') {
            for (const row of this.memoryRows || []) {
                const addr = parseInt(row.dataset.addr);
                const word = this.cpu.programMemory[addr];
                row.classList.toggle('picsim__mem-instr--current', addr === pc);
                row.querySelector('.picsim__mem-word').textContent = hex(word, 4);
                row.querySelector('.picsim__mem-disasm').textContent = PIC16Assembler.disassemble(word, addr);
            }
            return;
        }
        
        const source = this.memoryType === 'ram' ? this.cpu.ram : this.cpu.eeprom;
        for (const cell of this.memoryCells || []) {
            cell.textContent = hex(source[parseInt(cell.dataset.addr)], 2);
        }
    }

    editMemoryCell(cell) {
        // Se già in editing, esci
        if (cell.querySelector('input')) return;
        
        // Blocca il ridisegno periodico finche' la cella e' aperta.
        this.editing = { kind: 'memory' };
        
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
        
        // Enter salva e rimuove l'input, il che scatena anche blur: senza
        // questa guardia saveValue girerebbe due volte.
        let finished = false;
        
        const closeEdit = () => {
            this.editing = null;
            this.memoryStructureKey = null; // forza il rebuild della griglia
            this.updateMemoryView();
        };
        
        const saveValue = () => {
            if (finished) return;
            finished = true;
            
            let val = parseInt(input.value, 16);
            if (isNaN(val)) val = currentVal;
            val = Math.max(0, Math.min(255, val)); // Clamp 0-255
            
            if (type === 'ram') {
                this.cpu.ram[addr] = val;
            } else {
                this.cpu.eeprom[addr] = val;
            }
            
            closeEdit();
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
                finished = true;
                closeEdit();
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
        
        const simTime = document.getElementById('sim-time');
        if (simTime) {
            simTime.textContent = this.formatTime(this.simulator.getSimulatedTime());
            // La CPU del browser non riesce a tenere la velocita' scelta.
            const lagging = this.simulator.running && this.simulator.lagging;
            simTime.classList.toggle('picsim__sim-time--lagging', lagging);
            simTime.title = lagging ? 'Il browser non riesce a simulare a questa velocità' : '';
        }
        
        const instr = this.simulator.getCurrentInstruction();
        document.getElementById('current-instruction').textContent = `${instr.address.toString(16).toUpperCase().padStart(3, '0')}: ${instr.disassembly}`;
        
        const tmr0Bar = document.getElementById('tmr0-bar');
        if (tmr0Bar) tmr0Bar.style.width = (s.TMR0 / 255 * 100) + '%';
        document.getElementById('tmr0-display').textContent = s.TMR0.toString(16).toUpperCase().padStart(2, '0');
        
        const opt = s.OPTION;
        document.getElementById('prescaler-value').textContent = (opt & 0x08) ? 'WDT' : '1:' + (1 << ((opt & 0x07) + 1));
        document.getElementById('tmr0-source').textContent = (opt & 0x20) ? 'esterna (RA4)' : 'interna';
    }

    /** Secondi in µs, ms o s, con tre cifre significative circa. */
    formatTime(seconds) {
        if (seconds < 1e-3) return (seconds * 1e6).toFixed(0) + ' µs';
        if (seconds < 1) return (seconds * 1e3).toFixed(1) + ' ms';
        return seconds.toFixed(3) + ' s';
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
        // I messaggi riportano l'operando cosi' come scritto nel sorgente:
        // vanno inseriti come testo, mai come HTML. Un .asm altrui aperto da
        // un utente loggato eseguirebbe altrimenti script nell'origine del sito.
        panel.textContent = '';
        errors.forEach(err => {
            const row = document.createElement('div');
            row.className = 'picsim__error';
            const line = document.createElement('span');
            line.textContent = 'Riga ' + (err.line || '?');
            const msg = document.createElement('span');
            msg.textContent = err.message;
            row.append(line, msg);
            panel.appendChild(row);
        });
        panel.classList.add('picsim__errors--visible');
        this.updateLineNumbers();
    }

    clearErrors() {
        this.errorLines = [];
        const panel = document.getElementById('error-panel');
        if (panel) { panel.innerHTML = ''; panel.classList.remove('picsim__errors--visible'); }
    }

    showError(msg) { this.setStatus('Errore: ' + msg, 'error'); }

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
        const hex = document.getElementById('btn-hex');
        if (hex) hex.disabled = running;
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
