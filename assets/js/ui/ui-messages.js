/**
 * UI Messages Module
 * Status bar, messaggi, indicatore stato.
 */
class UIMessages {
    constructor(ctx) {
        this.ui = ctx.ui;
    }

    showMessage(text, type) {
        type = type || 'info';
        var container = document.getElementById('messages');
        if (!container) return;
        var msg = document.createElement('div');
        msg.className = 'message ' + type;
        msg.textContent = text;
        container.appendChild(msg);
        setTimeout(function() { msg.remove(); }, 5000);
    }

    showError(text) { this.showMessage(text, 'error'); }

    setStatusBar(state, text) {
        var indicator = document.getElementById('status-indicator');
        var textEl = document.getElementById('status-text');
        if (indicator) indicator.className = 'pic-status-indicator pic-status--' + state;
        if (textEl) textEl.textContent = text;
    }
}
