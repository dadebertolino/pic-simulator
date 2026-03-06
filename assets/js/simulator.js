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
        this.speed = 1000; // Hz simulati
        this.realTimeMode = false;
        this.clockFrequency = 4000000; // 4MHz default
        
        // Timer per esecuzione
        this.runInterval = null;
        this.stepCount = 0;
        this.startTime = 0;
        
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
    }

    // === ASSEMBLY ===
    
    loadSource(source) {
        this.sourceCode = source;
        this.assemblyResult = this.assembler.assemble(source);
        
        if (this.assemblyResult.success) {
            this.cpu.reset();
            this.cpu.loadProgram(this.assemblyResult.programMemory);
            this.stepCount = 0;
        }
        
        return this.assemblyResult;
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

    stepOver() {
        if (!this.assemblyResult?.success) return false;
        
        const currentOpcode = this.cpu.programMemory[this.cpu.PC & 0x3FF];
        
        // Check if CALL instruction
        if ((currentOpcode >> 11) === 0x04) {
            // Set temporary breakpoint after CALL
            const returnAddr = (this.cpu.PC + 1) & 0x1FFF;
            const hadBreakpoint = this.cpu.breakpoints.has(returnAddr);
            
            if (!hadBreakpoint) {
                this.cpu.setBreakpoint(returnAddr);
            }
            
            this.run();
            
            // Will stop at breakpoint, then we remove it if it wasn't there before
            if (!hadBreakpoint) {
                // Clean up in onBreakpoint or after stop
            }
        } else {
            this.step();
        }
    }

    stepOut() {
        if (!this.assemblyResult?.success) return false;
        
        // Run until RETURN or RETFIE
        const checkReturn = () => {
            const opcode = this.cpu.programMemory[this.cpu.PC & 0x3FF];
            return opcode === 0x0008 || opcode === 0x0009;
        };
        
        this.runUntil(checkReturn, 10000);
        this.step(); // Execute the RETURN
    }

    run() {
        if (this.running) return;
        if (!this.assemblyResult?.success) return;
        
        this.running = true;
        this.startTime = performance.now();
        
        const stepsPerTick = Math.max(1, Math.floor(this.speed / 60));
        
        this.runInterval = setInterval(() => {
            for (let i = 0; i < stepsPerTick; i++) {
                if (!this.running) break;
                
                this.cpu.step();
                this.stepCount++;
                
                // Check breakpoint
                if (this.cpu.breakpoints.has(this.cpu.PC)) {
                    this.stop();
                    if (this.onBreakpoint) {
                        this.onBreakpoint(this.cpu.PC);
                    }
                    break;
                }
            }
            
            if (this.onUpdate) {
                this.onUpdate();
            }
        }, 16); // ~60fps update
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

    stop() {
        this.running = false;
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
        this.cpu.reset();
        this.stepCount = 0;
        
        if (this.assemblyResult?.success) {
            this.cpu.loadProgram(this.assemblyResult.programMemory);
        }
        
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
        return this.cpu.eeprom[addr] || 0;
    }

    writeEEPROM(addr, value) {
        if (addr < 64) {
            this.cpu.eeprom[addr] = value & 0xFF;
        }
    }

    getEEPROM() {
        return Array.from(this.cpu.eeprom);
    }

    // === UTILITIES ===
    
    getCurrentInstruction() {
        const addr = this.cpu.PC;
        const word = this.cpu.programMemory[addr & 0x3FF];
        return {
            address: addr,
            opcode: word,
            disassembly: PIC16Assembler.disassemble(word, addr),
            sourceLine: this.getLineForAddress(addr)
        };
    }

    getExecutionStats() {
        const elapsed = (performance.now() - this.startTime) / 1000;
        const simTime = this.cpu.cycles * 4 / this.clockFrequency;
        
        return {
            cycles: this.cpu.cycles,
            steps: this.stepCount,
            elapsed: elapsed,
            simulatedTime: simTime,
            effectiveSpeed: this.stepCount / elapsed,
            running: this.running
        };
    }

    setSpeed(hz) {
        this.speed = hz;
        
        // Restart if running
        if (this.running) {
            this.stop();
            this.run();
        }
    }

    setClockFrequency(hz) {
        this.clockFrequency = hz;
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
