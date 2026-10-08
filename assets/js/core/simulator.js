/**
 * PIC16 Simulator Engine
 * Gestisce esecuzione, timing, e interfaccia con GUI
 */

class Simulator {
    constructor(cpu, assembler) {
        this.cpu = cpu;
        this.assembler = assembler;
        
        // Stato simulazione
        this.running = false;
        this.clockFrequency = 4000000; // 4MHz default
        // Velocita' di Run come frazione del tempo reale: 1 = un ciclo
        // istruzione ogni 4 periodi di clock, come sul chip; Infinity = il
        // piu' veloce possibile.
        this.speedFactor = 1;
        
        // Timer per esecuzione
        this.runInterval = null;
        this.stepCount = 0;
        this.startTime = 0;
        this.tickMs = 16;          // ~60 aggiornamenti al secondo
        this.tickBudgetMs = 10;    // tempo di calcolo massimo per tick
        this.now = () => performance.now(); // sostituibile nei test
        this.lagging = false;      // la CPU non riesce a stare al passo
        
        // Source code
        this.sourceCode = '';
        this.assemblyResult = null;
        
        // History per undo (opzionale)
        this.history = [];
        this.maxHistory = 100;
        
        // Callbacks
        this.onUpdate = null;
        this.onStop = null;
        this.onError = null;
        this.onBreakpoint = null;
        this.onStepOverDone = null;
        
        this.stepOverTarget = null;   // { pc, sp } durante uno Step Over
        this.stepOverSpeed = 1;
    }

    // === ASSEMBLY ===
    
    loadSource(source) {
        this.sourceCode = source;
        this.assemblyResult = this.assembler.assemble(source);
        
        if (this.assemblyResult.success) {
            this.cpu.reset();
            this.loadIntoCpu();
            this.stepCount = 0;
        }
        
        return this.assemblyResult;
    }

    /**
     * Programma il micro, come un programmatore: memoria programma, EEPROM
     * cancellata (0xFF) e poi i dati dichiarati con DE a 0x2100.
     */
    loadIntoCpu() {
        this.cpu.loadProgram(this.assemblyResult.programMemory);
        this.cpu.eraseEeprom();
        const eep = this.cpu.getPeripheral('EEPROM');
        (this.assemblyResult.eepromData || []).forEach((value, addr) => {
            if (value !== undefined && eep) eep.writeByte(addr, value);
        });
    }

    /** Indice di una parola della memoria programma (dimensione del device). */
    programIndex(pc) {
        return pc & (this.cpu.config.programSize - 1);
    }

    getSourceMap() {
        return this.assemblyResult ? this.assemblyResult.sourceMap : {};
    }

    getLineForAddress(addr) {
        return this.assemblyResult?.sourceMap[addr] || null;
    }

    getAddressForLine(line) {
        if (!this.assemblyResult) return null;
        for (const [addr, l] of Object.entries(this.assemblyResult.sourceMap)) {
            if (l === line) return parseInt(addr);
        }
        return null;
    }

    // === EXECUTION CONTROL ===
    
    step() {
        if (!this.assemblyResult?.success) return false;
        
        const prevPC = this.cpu.PC;
        this.saveState();
        
        try {
            this.cpu.step();
            this.stepCount++;
            
            // Check breakpoint
            if (this.cpu.breakpoints.has(this.cpu.PC)) {
                this.stop();
                if (this.onBreakpoint) {
                    this.onBreakpoint(this.cpu.PC);
                }
            }
            
            if (this.onUpdate) {
                this.onUpdate();
            }
            
            return true;
        } catch (e) {
            if (this.onError) {
                this.onError(e.message);
            }
            return false;
        }
    }

    /**
     * Step Over: su una CALL esegue l'intera subroutine e si ferma
     * all'istruzione dopo la CALL, allo stesso livello di stack (cosi' una
     * chiamata ricorsiva non lo ferma prima). Gira nel ciclo di Run alla
     * massima velocita', senza limite di cicli: anche un ritardo da
     * centinaia di migliaia di cicli finisce in pochi millisecondi senza
     * bloccare la pagina. I breakpoint dentro la subroutine lo fermano.
     *
     * Restituisce 'call' se e' partita l'esecuzione (fine annunciata da
     * onStepOverDone), 'step' se l'istruzione non era una CALL, false se
     * non c'e' un programma.
     */
    stepOver() {
        if (!this.assemblyResult?.success || this.running) return false;
        
        const opcode = this.cpu.programMemory[this.programIndex(this.cpu.PC)];
        if ((opcode >> 11) !== 0x04) {
            this.step();
            return 'step';
        }
        
        this.stepOverTarget = { pc: (this.cpu.PC + 1) & 0x1FFF, sp: this.cpu.stackPointer };
        this.stepOverSpeed = this.speedFactor;
        this.speedFactor = Infinity;
        
        this.saveState();
        this.cpu.step(); // la CALL
        this.stepCount++;
        this.run();
        return 'call';
    }

    stepOut() {
        if (!this.assemblyResult?.success) return false;
        
        // Run until RETURN or RETFIE
        const checkReturn = () => {
            const opcode = this.cpu.programMemory[this.programIndex(this.cpu.PC)];
            return opcode === 0x0008 || opcode === 0x0009 || (opcode >> 10) === 0x0D;
        };
        
        this.runUntil(checkReturn, 10000);
        this.step(); // Execute the RETURN
    }

    runUntil(condition, maxSteps = 100000) {
        let steps = 0;
        while (steps < maxSteps && !condition()) {
            this.cpu.step();
            this.stepCount++;
            steps++;
            
            if (this.cpu.breakpoints.has(this.cpu.PC)) {
                break;
            }
        }
        
        if (this.onUpdate) {
            this.onUpdate();
        }
    }

    run() {
        if (this.running) return;
        if (!this.assemblyResult?.success) return;
        
        this.running = true;
        this.startTime = this.now();
        this.syncClock();
        
        this.runInterval = setInterval(() => this.runTick(), this.tickMs);
    }

    /** Ciclo istruzione al secondo da simulare (Infinity = massima velocita'). */
    cyclesPerSecond() {
        return this.clockFrequency / 4 * this.speedFactor;
    }

    /** Riallinea l'orologio reale a quello simulato, da qui in avanti. */
    syncClock() {
        this.clockOriginTime = this.now();
        this.clockOriginCycles = this.cpu.cycles;
        this.lagging = false;
    }

    /**
     * Esegue i cicli che la CPU simulata avrebbe eseguito nel tempo reale
     * trascorso. Il numero di istruzioni per tick non e' fisso: dipende
     * dalla velocita' scelta e dal tempo davvero passato, cosi' un tick in
     * ritardo recupera. Ogni tick ha comunque un tetto di tempo di calcolo,
     * perche' la pagina resti reattiva.
     */
    runTick() {
        if (!this.running) return;
        
        const start = this.now();
        const rate = this.cyclesPerSecond();
        const target = isFinite(rate)
            ? this.clockOriginCycles + (start - this.clockOriginTime) / 1000 * rate
            : Infinity;
        const deadline = start + this.tickBudgetMs;
        
        let steps = 0;
        while (this.running && this.cpu.cycles < target) {
            // Leggere l'orologio costa: lo si fa ogni 1024 istruzioni.
            if ((++steps & 0x3FF) === 0 && this.now() > deadline) break;
            
            this.cpu.step();
            this.stepCount++;
            
            const over = this.stepOverTarget;
            if (over && this.cpu.PC === over.pc && this.cpu.stackPointer === over.sp) {
                this.stop();
                if (this.onStepOverDone) {
                    this.onStepOverDone();
                }
                break;
            }
            
            if (this.cpu.breakpoints.has(this.cpu.PC)) {
                this.stop();
                if (this.onBreakpoint) {
                    this.onBreakpoint(this.cpu.PC);
                }
                break;
            }
        }
        
        // Se la CPU resta indietro di oltre 100 ms non si accumula debito:
        // si riparte da adesso, altrimenti a ogni pausa (scheda in secondo
        // piano, breakpoint di un altro tick) seguirebbe una raffica.
        if (this.running && isFinite(rate) && target - this.cpu.cycles > rate * 0.1) {
            this.syncClock();
            this.lagging = true;
        }
        
        if (this.onUpdate) {
            this.onUpdate();
        }
    }

    stop() {
        this.running = false;
        // Uno Step Over interrotto (Stop, breakpoint) restituisce la velocita' scelta.
        if (this.stepOverTarget) {
            this.speedFactor = this.stepOverSpeed;
            this.stepOverTarget = null;
        }
        if (this.runInterval) {
            clearInterval(this.runInterval);
            this.runInterval = null;
        }
        
        if (this.onStop) {
            this.onStop();
        }
    }

    reset() {
        this.stop();
        // Reset del micro: memoria programma ed EEPROM restano come sono.
        this.cpu.reset();
        this.stepCount = 0;
        
        if (this.onUpdate) {
            this.onUpdate();
        }
    }

    // === STATE MANAGEMENT ===
    
    saveState() {
        if (this.history.length >= this.maxHistory) {
            this.history.shift();
        }
        
        this.history.push({
            W: this.cpu.W,
            PC: this.cpu.PC,
            ram: new Uint8Array(this.cpu.ram),
            stack: new Uint16Array(this.cpu.stack),
            stackPointer: this.cpu.stackPointer,
            cycles: this.cpu.cycles,
            sleeping: this.cpu.sleeping
        });
    }

    undo() {
        if (this.history.length === 0) return false;
        
        const state = this.history.pop();
        this.cpu.W = state.W;
        this.cpu.PC = state.PC;
        this.cpu.ram = state.ram;
        this.cpu.stack = state.stack;
        this.cpu.stackPointer = state.stackPointer;
        this.cpu.cycles = state.cycles;
        this.cpu.sleeping = state.sleeping;
        this.stepCount--;
        
        if (this.onUpdate) {
            this.onUpdate();
        }
        
        return true;
    }

    // === BREAKPOINTS ===
    
    toggleBreakpoint(addr) {
        this.cpu.toggleBreakpoint(addr);
    }

    toggleBreakpointAtLine(line) {
        const addr = this.getAddressForLine(line);
        if (addr !== null) {
            this.toggleBreakpoint(addr);
            return true;
        }
        return false;
    }

    getBreakpoints() {
        return Array.from(this.cpu.breakpoints);
    }

    clearAllBreakpoints() {
        this.cpu.breakpoints.clear();
    }

    // === EXTERNAL I/O ===
    
    setPin(port, pin, value) {
        this.cpu.setExternalInput(port, pin, value ? 1 : 0);
        
        if (this.onUpdate) {
            this.onUpdate();
        }
    }

    getPortState(port) {
        return this.cpu.getPortOutput(port);
    }

    // === EEPROM ===
    
    readEEPROM(addr) {
        return this.cpu.readEEPROM(addr);
    }

    writeEEPROM(addr, value) {
        var eep = this.cpu.getPeripheral('EEPROM');
        if (eep) eep.writeByte(addr, value & 0xFF);
    }

    getEEPROM() {
        return this.cpu.getEEPROMData();
    }

    // === UTILITIES ===
    
    getCurrentInstruction() {
        const addr = this.cpu.PC;
        const word = this.cpu.programMemory[this.programIndex(addr)];
        return {
            address: addr,
            opcode: word,
            disassembly: PIC16Assembler.disassemble(word, addr),
            sourceLine: this.getLineForAddress(addr)
        };
    }

    getExecutionStats() {
        const elapsed = (this.now() - this.startTime) / 1000;
        const simTime = this.getSimulatedTime();
        
        return {
            cycles: this.cpu.cycles,
            steps: this.stepCount,
            elapsed: elapsed,
            simulatedTime: simTime,
            effectiveSpeed: this.stepCount / elapsed,
            running: this.running
        };
    }

    /**
     * Compatibilita' con il cursore della 3.1: istruzioni al secondo.
     * Equivale a setSpeedFactor(hz / cicli al secondo del clock).
     */
    setSpeed(hz) {
        this.setSpeedFactor(hz / (this.clockFrequency / 4));
    }

    /** Frazione del tempo reale (1, 0.1, ...) o Infinity per la massima. */
    setSpeedFactor(factor) {
        this.speedFactor = factor;
        // Cambiando ritmo in corsa si riparte da adesso, senza recuperi.
        this.syncClock();
    }

    setClockFrequency(hz) {
        this.clockFrequency = hz;
        this.syncClock();
    }

    /** Tempo trascorso sul chip simulato, in secondi. */
    getSimulatedTime() {
        return this.cpu.cycles * 4 / this.clockFrequency;
    }

    // === EXPORT ===
    
    exportHex() {
        if (!this.assemblyResult?.success) return null;
        return this.assembler.toIntelHex();
    }

    exportState() {
        return JSON.stringify({
            cpu: this.cpu.getState(),
            source: this.sourceCode,
            breakpoints: this.getBreakpoints()
        }, null, 2);
    }

    importState(json) {
        try {
            const data = JSON.parse(json);
            
            if (data.source) {
                this.loadSource(data.source);
            }
            
            if (data.breakpoints) {
                this.clearAllBreakpoints();
                for (const bp of data.breakpoints) {
                    this.cpu.setBreakpoint(bp);
                }
            }
            
            return true;
        } catch (e) {
            return false;
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Simulator;
}
