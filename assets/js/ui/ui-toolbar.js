/**
 * UI Toolbar Module
 * Controlli simulazione, keyboard shortcuts, build state, speed.
 */
class UIToolbar {
    constructor(ctx) {
        this.cpu = ctx.cpu;
        this.simulator = ctx.simulator;
        this.ui = ctx.ui;
        this.animating = false;
        this.animateInterval = null;
        this.animateSpeed = 100; // ms tra due istruzioni di Animate (10 Hz)
        this.assembled = false;
        this.sourceModified = false;
    }

    init() {
        var self = this;
        var btn = function(id, fn) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('click', function() { fn.call(self); });
        };
        btn('btn-assemble', this.assemble);
        btn('btn-run', this.run);
        btn('btn-animate', this.toggleAnimate);
        btn('btn-stop', this.stop);
        btn('btn-step', this.step);
        btn('btn-reset', this.reset);
        btn('btn-step-over', this.stepOver);
        btn('btn-step-out', this.stepOut);
        btn('btn-clear-breakpoints', function() { self.ui.clearAllBreakpoints(); });
        btn('btn-load-asm', this.loadAsmFile);
        btn('btn-export-hex', function() { self.ui.exportHex(); });
        btn('btn-export-map', function() { self.ui.exportMap(); });
        btn('btn-save', function() { self.ui.saveProject(); });
        btn('btn-export-asm', function() { self.ui.exportASM(); });
        btn('btn-load', function() { self.ui.loadProject(); });

        document.getElementById('asm-file-input')?.addEventListener('change', function(e) { self.handleAsmFile(e); });

        // Velocita' di Run come frazione del chip reale a 4 MHz
        var runSpeed = document.getElementById('run-speed');
        if (runSpeed) {
            runSpeed.addEventListener('change', function() {
                self.simulator.setSpeedFactor(runSpeed.value === 'max' ? Infinity : parseFloat(runSpeed.value));
            });
        }

        // Velocita' di Animate
        var speedSlider = document.getElementById('speed-slider');
        if (speedSlider) {
            speedSlider.addEventListener('input', function() { self.setAnimateSpeed(speedSlider.value); });
        }

        this.simulator.onStepOverDone = function() { self.onStepOverDone(); };

        document.addEventListener('keydown', function(e) { self.handleKeyboard(e); });
        this.updateSimulationButtons();
    }

    handleKeyboard(e) {
        var inEditor = document.activeElement === (this.ui.editorModule ? this.ui.editorModule.editor : null);
        switch (e.key) {
            case 'F5': e.preventDefault(); if (e.ctrlKey) { this.simulator.running || this.animating ? this.stop() : this.run(); } else { this.assemble(); } break;
            case 'F6': e.preventDefault(); this.toggleAnimate(); break;
            case 'F7': e.preventDefault(); this.stop(); break;
            case 'F8': e.preventDefault(); if (e.shiftKey) this.stepOut(); else this.step(); break;
            case 'F10': e.preventDefault(); this.stepOver(); break;
            case 'F11': e.preventDefault(); this.step(); break;
            case 'Escape': e.preventDefault(); this.stop(); break;
            case 'F9': if (!inEditor) { e.preventDefault(); var cl = this.simulator.getLineForAddress(this.cpu.PC); if (cl) this.ui.toggleBreakpointAtLine(cl); } break;
        }
    }

    assemble() { this.ui.assemble(); }

    run() {
        if (!this.canSimulate()) return;
        this.simulator.run();
        this.setRunningState(true);
    }

    toggleAnimate() { if (this.animating) this.stopAnimate(); else this.startAnimate(); }

    startAnimate() {
        if (!this.canSimulate()) return;
        this.animating = true;
        this.setRunningState(true, 'animate');
        var self = this;
        this.animateInterval = setInterval(function() {
            self.cpu.step();
            self.simulator.stepCount++;
            self.ui.update();
            if (self.cpu.breakpoints.has(self.cpu.PC)) {
                self.stopAnimate();
                self.ui.onBreakpoint(self.cpu.PC);
            }
        }, this.animateSpeed);
    }

    stopAnimate() {
        this.animating = false;
        if (this.animateInterval) { clearInterval(this.animateInterval); this.animateInterval = null; }
        this.setRunningState(false);
    }

    stop() {
        this.simulator.stop();
        this.stopAnimate();
        this.setRunningState(false);
        this.ui.update();
    }

    step() { if (!this.canSimulate()) return; this.simulator.step(); }
    /**
     * Step Over: su una CALL la subroutine gira nel ciclo di Run alla
     * massima velocita'; i pulsanti restano quelli di Run finche'
     * onStepOverDone o un breakpoint non la fermano.
     */
    stepOver() {
        if (!this.canSimulate() || this.simulator.running) return;
        if (this.animating) this.stopAnimate();
        if (this.simulator.stepOver() === 'call') {
            this.setRunningState(true);
            this.ui.setStatusBar('running', 'Step Over...');
        }
    }

    onStepOverDone() {
        this.setRunningState(false);
        this.ui.setStatusBar('assembled', 'Step Over');
        this.ui.update();
    }

    /**
     * Slider da 1 a 5: 1, 2, 10, 20, 100 istruzioni al secondo. Se Animate
     * e' in corso riparte subito al nuovo ritmo.
     */
    setAnimateSpeed(position) {
        var hz = [1, 2, 10, 20, 100][parseInt(position, 10) - 1] || 10;
        this.animateSpeed = 1000 / hz;

        var slider = document.getElementById('speed-slider');
        if (slider) slider.setAttribute('aria-valuetext', hz + (hz === 1 ? ' instruction' : ' instructions') + ' per second');
        var label = document.getElementById('speed-value');
        if (label) label.textContent = hz + ' Hz';

        if (this.animating) {
            this.stopAnimate();
            this.startAnimate();
        }
    }
    stepOut() { if (!this.canSimulate()) return; this.simulator.stepOut(); }

    reset() {
        if (!this.assembled) return;
        this.simulator.reset();
        this.setRunningState(false);
        this.cpu.onPortChange = function(port, value) { this.ui.updatePort(port); }.bind(this);
        this.cpu.onRegisterChange = function(name, value) { this.ui.updateRegister(name, value); }.bind(this);
        this.updateSimulationButtons();
        this.ui.update();
    }

    canSimulate() {
        if (!this.assembled) { this.ui.showMessage('Assemble first (F5)', 'warning'); return false; }
        if (this.sourceModified) { this.ui.showMessage('Source modified — reassemble (F5)', 'warning'); return false; }
        return true;
    }

    onAssemblySuccess() { this.assembled = true; this.sourceModified = false; this.updateSimulationButtons(); }
    onAssemblyFail() { this.assembled = false; this.sourceModified = false; this.updateSimulationButtons(); }
    onSourceChanged() {
        if (this.assembled) { this.sourceModified = true; this.updateSimulationButtons(); this.ui.setStatusBar('ready', 'Modified'); }
    }

    updateSimulationButtons() {
        var canSim = this.assembled && !this.sourceModified;
        var simBtns = ['btn-run','btn-animate','btn-step','btn-step-over','btn-step-out','btn-reset'];
        for (var i = 0; i < simBtns.length; i++) { var b = document.getElementById(simBtns[i]); if (b) b.disabled = !canSim; }
        var dlBtns = ['btn-export-hex','btn-export-map'];
        for (var j = 0; j < dlBtns.length; j++) { var d = document.getElementById(dlBtns[j]); if (d) d.disabled = !this.assembled; }
        var stop = document.getElementById('btn-stop'); if (stop) stop.disabled = true;
        var asm = document.getElementById('btn-assemble'); if (asm) asm.classList.toggle('pic-btn-needs-rebuild', this.sourceModified);
        var ea = document.querySelector('.pic-editor-area');
        if (ea) { ea.classList.toggle('source-modified', this.sourceModified); ea.classList.toggle('source-assembled', this.assembled && !this.sourceModified); }
    }

    setRunningState(running, mode) {
        mode = mode || 'run';
        var isAnimating = running && mode === 'animate';
        document.getElementById('btn-run').disabled = running;
        document.getElementById('btn-stop').disabled = !running;
        document.getElementById('btn-step').disabled = running;
        document.getElementById('btn-step-over').disabled = running;
        var ao = document.getElementById('btn-animate');
        var so = document.getElementById('btn-step-out');
        if (running) { if (ao) ao.disabled = !isAnimating; if (so) so.disabled = true; if (ao) ao.classList.toggle('active', isAnimating); }
        else { if (ao) { ao.disabled = false; ao.classList.remove('active'); } if (so) so.disabled = false; }
        document.body.classList.toggle('running', running);
        document.body.classList.toggle('animating', isAnimating);
        
        if (running && mode === 'run') this.ui.setStatusBar('running', 'Running');
        else if (isAnimating) this.ui.setStatusBar('animating', 'Animating');
        else if (this.assembled && !this.sourceModified) this.ui.setStatusBar('assembled', 'Halted');
        else this.ui.setStatusBar('ready', 'Ready');
    }

    loadAsmFile() { var el = document.getElementById('asm-file-input'); if (el) { el.value = ''; el.click(); } }
    handleAsmFile(e) {
        var file = e.target.files[0]; if (!file) return;
        var self = this;
        var reader = new FileReader();
        reader.onload = function(ev) {
            self.ui.setSource(ev.target.result);
            self.assembled = false; self.sourceModified = false;
            self.updateSimulationButtons();
            self.ui.showMessage('Loaded: ' + file.name + ' — press Assemble', 'success');
        };
        reader.readAsText(file);
        e.target.value = '';
    }
}
