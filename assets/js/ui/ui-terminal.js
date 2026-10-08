/**
 * UI USART Terminal Module
 * Terminale virtuale: output TX, input RX, baud rate, contatori.
 */
class UITerminal {
    constructor(ctx) {
        this.cpu = ctx.cpu;
        this.simulator = ctx.simulator;
        this.ui = ctx.ui;
        this.echo = false;
        this._lastTxLen = 0;
    }

    rebuild() {
        var container = document.getElementById('terminal-container');
        if (!container) return;
        container.innerHTML = '';
        this._lastTxLen = 0;

        var usart = this.cpu.getPeripheral('USART');
        if (!usart) {
            container.closest('.pic-panel').style.display = 'none';
            return;
        }
        container.closest('.pic-panel').style.display = '';

        // Info bar
        var info = document.createElement('div');
        info.className = 'pic-term-info';
        info.innerHTML =
            '<span class="pic-term-baud" id="term-baud">9600</span>' +
            '<span class="pic-term-stat" id="term-stat">TX:0 RX:0</span>' +
            '<span class="pic-term-status" id="term-enabled">OFF</span>';
        container.appendChild(info);

        // TX output area
        var txLabel = document.createElement('div');
        txLabel.className = 'pic-term-label';
        txLabel.textContent = 'TX Output';
        container.appendChild(txLabel);

        var txArea = document.createElement('div');
        txArea.className = 'pic-term-output';
        txArea.id = 'term-tx';
        container.appendChild(txArea);

        // RX input area
        var rxRow = document.createElement('div');
        rxRow.className = 'pic-term-input-row';

        var rxInput = document.createElement('input');
        rxInput.type = 'text';
        rxInput.className = 'pic-term-input';
        rxInput.id = 'term-rx-input';
        rxInput.placeholder = 'Type to send...';
        rxInput.maxLength = 1;

        var self = this;
        rxInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                self._sendChar(13); // CR
                rxInput.value = '';
            } else if (e.key.length === 1) {
                e.preventDefault();
                self._sendChar(e.key.charCodeAt(0));
            }
        });
        rxRow.appendChild(rxInput);

        var sendBtn = document.createElement('button');
        sendBtn.className = 'pic-btn pic-btn-sm';
        sendBtn.textContent = 'Send';
        sendBtn.title = 'Send string';
        sendBtn.addEventListener('click', function() { self._sendString(); });
        rxRow.appendChild(sendBtn);

        container.appendChild(rxRow);

        // String input for bulk send
        var strRow = document.createElement('div');
        strRow.className = 'pic-term-input-row';

        var strInput = document.createElement('input');
        strInput.type = 'text';
        strInput.className = 'pic-term-input pic-term-input-wide';
        strInput.id = 'term-rx-string';
        strInput.placeholder = 'String to send + Enter';
        strInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { self._sendString(); }
        });
        strRow.appendChild(strInput);
        container.appendChild(strRow);

        // Controls
        var controls = document.createElement('div');
        controls.className = 'pic-term-controls';

        var clearBtn = document.createElement('button');
        clearBtn.className = 'pic-btn pic-btn-sm';
        clearBtn.textContent = 'Clear';
        clearBtn.addEventListener('click', function() { self._clear(); });
        controls.appendChild(clearBtn);

        var echoLabel = document.createElement('label');
        echoLabel.className = 'pic-term-echo';
        var echoCb = document.createElement('input');
        echoCb.type = 'checkbox';
        echoCb.addEventListener('change', function() { self.echo = echoCb.checked; });
        echoLabel.appendChild(echoCb);
        echoLabel.appendChild(document.createTextNode(' Echo'));
        controls.appendChild(echoLabel);

        var hexLabel = document.createElement('label');
        hexLabel.className = 'pic-term-echo';
        var hexCb = document.createElement('input');
        hexCb.type = 'checkbox';
        hexCb.id = 'term-hex-mode';
        hexCb.addEventListener('change', function() { self._refreshTx(); });
        hexLabel.appendChild(hexCb);
        hexLabel.appendChild(document.createTextNode(' Hex'));
        controls.appendChild(hexLabel);

        container.appendChild(controls);

        // Collega callback TX
        usart.onTransmit = function(byte) { self._onTxByte(byte); };
    }

    // ================================================================
    //  TX
    // ================================================================

    _onTxByte(byte) {
        var txEl = document.getElementById('term-tx');
        if (!txEl) return;

        var hexMode = document.getElementById('term-hex-mode');
        var isHex = hexMode && hexMode.checked;

        if (isHex) {
            txEl.textContent += byte.toString(16).toUpperCase().padStart(2, '0') + ' ';
        } else {
            if (byte === 10) {
                txEl.textContent += '\n';
            } else if (byte === 13) {
                // CR: ignora (LF gestisce il newline)
            } else if (byte >= 32 && byte < 127) {
                txEl.textContent += String.fromCharCode(byte);
            } else {
                txEl.textContent += '\\x' + byte.toString(16).toUpperCase().padStart(2, '0');
            }
        }

        // Auto-scroll
        txEl.scrollTop = txEl.scrollHeight;
    }

    _refreshTx() {
        var usart = this.cpu.getPeripheral('USART');
        if (!usart) return;
        var txEl = document.getElementById('term-tx');
        if (!txEl) return;

        var hexMode = document.getElementById('term-hex-mode');
        var isHex = hexMode && hexMode.checked;
        var buf = usart.getTxBuffer();

        if (isHex) {
            txEl.textContent = buf.map(function(b) {
                return b.toString(16).toUpperCase().padStart(2, '0');
            }).join(' ');
        } else {
            txEl.textContent = usart.getTxString();
        }
        txEl.scrollTop = txEl.scrollHeight;
    }

    // ================================================================
    //  RX
    // ================================================================

    _sendChar(charCode) {
        var usart = this.cpu.getPeripheral('USART');
        if (!usart) return;
        usart.receiveData(charCode);
        if (this.echo) this._onTxByte(charCode);
    }

    _sendString() {
        var strInput = document.getElementById('term-rx-string');
        if (!strInput || !strInput.value) return;
        var text = strInput.value;
        for (var i = 0; i < text.length; i++) {
            this._sendChar(text.charCodeAt(i));
        }
        this._sendChar(13); // CR
        this._sendChar(10); // LF
        strInput.value = '';
    }

    _clear() {
        var usart = this.cpu.getPeripheral('USART');
        if (usart) usart.clearBuffers();
        var txEl = document.getElementById('term-tx');
        if (txEl) txEl.textContent = '';
        this._lastTxLen = 0;
    }

    // ================================================================
    //  UPDATE
    // ================================================================

    update() {
        var usart = this.cpu.getPeripheral('USART');
        if (!usart) return;

        // Baud rate
        var baudEl = document.getElementById('term-baud');
        if (baudEl) baudEl.textContent = usart.getBaudRate(4000000) + ' baud';

        // Stats
        var statEl = document.getElementById('term-stat');
        if (statEl) statEl.textContent = 'TX:' + usart.txBuffer.length + ' RX:' + usart.rxBuffer.length;

        // Enabled
        var enEl = document.getElementById('term-enabled');
        if (enEl) {
            var on = usart.isEnabled();
            enEl.textContent = on ? 'ON' : 'OFF';
            enEl.classList.toggle('pic-term-on', on);
        }
    }

    setCpu(cpu) { this.cpu = cpu; }
}
