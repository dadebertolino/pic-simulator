/**
 * UI Editor Module
 * Gestisce textarea ASM, gutter unificata (breakpoint + numeri riga), highlight.
 */
class UIEditor {
    constructor(ctx) {
        this.cpu = ctx.cpu;
        this.simulator = ctx.simulator;
        this.ui = ctx.ui;
        this.editor = null;
        this.gutter = null;
        this.lineHeight = 18;
        this.errorLines = [];
    }

    init() {
        this.editor = document.getElementById('code-editor');
        this.gutter = document.getElementById('editor-gutter');
        if (!this.editor) return;

        var self = this;

        this.editor.addEventListener('input', function() { self.onEditorChange(); });
        this.editor.addEventListener('scroll', function() { self.syncScroll(); });
        this.editor.addEventListener('keydown', function(e) { self.handleEditorKey(e); });

        // Event delegation per breakpoint click
        if (this.gutter) {
            this.gutter.addEventListener('click', function(e) {
                var bp = e.target.closest('.pic-gutter-bp.bp-clickable');
                if (bp) {
                    var line = parseInt(bp.dataset.line);
                    if (!isNaN(line)) self.ui.toggleBreakpointAtLine(line);
                }
            });
        }

        var cs = window.getComputedStyle(this.editor);
        this.lineHeight = parseInt(cs.lineHeight) || 18;
        this.updateGutter();
    }

    onEditorChange() {
        this.updateGutter();
        this.hideHighlight();
        this.ui.onSourceChanged();
    }

    // ================================================================
    //  GUTTER (breakpoint dots + line numbers, single scroll)
    // ================================================================

    updateGutter() {
        if (!this.gutter || !this.editor) return;

        var lines = this.editor.value.split('\n');
        var sourceMap = this.simulator.assemblyResult ? this.simulator.assemblyResult.sourceMap : {};
        var currentPCLine = this.simulator.getLineForAddress(this.cpu.PC);

        // Mappa riga → indirizzo
        var lineToAddr = {};
        for (var addr in sourceMap) {
            if (sourceMap.hasOwnProperty(addr)) lineToAddr[sourceMap[addr]] = parseInt(addr);
        }

        // Mappa righe con breakpoint
        var bps = this.simulator.getBreakpoints();
        var bpLines = {};
        for (var b = 0; b < bps.length; b++) {
            var bpLine = this.simulator.getLineForAddress(bps[b]);
            if (bpLine) bpLines[bpLine] = true;
        }

        // Genera righe gutter
        var html = '';
        for (var i = 1; i <= lines.length; i++) {
            var hasBreakpoint = !!bpLines[i];
            var isCurrent = (currentPCLine === i);
            var hasError = this.errorLines && this.errorLines.indexOf(i) !== -1;
            var addr2 = lineToAddr[i];
            var hasAddr = (addr2 !== undefined);

            // Row class
            var rowCls = 'pic-gutter-row';
            if (isCurrent) rowCls += ' current';
            if (hasError) rowCls += ' error';

            // BP dot
            var bpCls = 'pic-gutter-bp';
            if (hasAddr) bpCls += ' bp-clickable';
            if (hasBreakpoint) bpCls += ' bp-active';

            // Line number text
            var lnText = hasAddr
                ? addr2.toString(16).toUpperCase().padStart(3, '0')
                : i.toString().padStart(3, '\u00A0'); // &nbsp;

            html += '<div class="' + rowCls + '">' +
                '<span class="' + bpCls + '" data-line="' + i + '">\u25CF</span>' +
                '<span class="pic-gutter-ln">' + lnText + '</span>' +
                '</div>';
        }

        this.gutter.innerHTML = html;
        this.syncScroll();
        this.updateLineHighlight();
    }

    // ================================================================
    //  SCROLL SYNC
    // ================================================================

    syncScroll() {
        if (this.gutter && this.editor) {
            this.gutter.scrollTop = this.editor.scrollTop;
        }
        this.syncHighlightScroll();
    }

    syncHighlightScroll() {
        var highlight = document.getElementById('line-highlight');
        if (!highlight) return;
        var currentPCLine = this.simulator.getLineForAddress(this.cpu.PC);
        if (currentPCLine && this.simulator.assemblyResult && this.simulator.assemblyResult.success) {
            var top = 10 + (currentPCLine - 1) * this.lineHeight - this.editor.scrollTop;
            highlight.style.display = 'block';
            highlight.style.top = top + 'px';
            highlight.style.height = this.lineHeight + 'px';
        } else {
            highlight.style.display = 'none';
        }
    }

    updateLineHighlight() {
        var highlight = document.getElementById('line-highlight');
        if (!highlight) return;
        var currentPCLine = this.simulator.getLineForAddress(this.cpu.PC);
        if (currentPCLine && this.simulator.assemblyResult && this.simulator.assemblyResult.success) {
            var top = 10 + (currentPCLine - 1) * this.lineHeight;
            highlight.style.display = 'block';
            highlight.style.top = top + 'px';
            highlight.style.height = this.lineHeight + 'px';
        } else {
            highlight.style.display = 'none';
        }
    }

    // ================================================================
    //  EDITOR HELPERS
    // ================================================================

    handleEditorKey(e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            var start = this.editor.selectionStart;
            var end = this.editor.selectionEnd;
            this.editor.value = this.editor.value.substring(0, start) + '    ' + this.editor.value.substring(end);
            this.editor.selectionStart = this.editor.selectionEnd = start + 4;
            this.onEditorChange();
        }
    }

    highlightLine(line) {
        var scrollPos = (line - 5) * this.lineHeight;
        this.editor.scrollTop = Math.max(0, scrollPos);
        this.syncScroll();
    }

    clearHighlights() {}
    hideHighlight() {
        var highlight = document.getElementById('line-highlight');
        if (highlight) highlight.style.display = 'none';
    }
    getSource() { return this.editor ? this.editor.value : ''; }
    setSource(code) { if (this.editor) { this.editor.value = code; this.onEditorChange(); } }
    setErrorLines(lines) { this.errorLines = lines; this.updateGutter(); }
    clearErrorLines() { this.errorLines = []; }

    goToLine(line) {
        var lines = this.editor.value.split('\n');
        var charPos = 0;
        for (var i = 0; i < line - 1 && i < lines.length; i++) charPos += lines[i].length + 1;
        this.editor.focus();
        this.editor.selectionStart = charPos;
        this.editor.selectionEnd = charPos + (lines[line - 1] ? lines[line - 1].length : 0);
        this.highlightLine(line);
    }

    update() {
        this.updateGutter();
        var currentLine = this.simulator.getLineForAddress(this.cpu.PC);
        if (currentLine) this.highlightLine(currentLine);
    }
}
