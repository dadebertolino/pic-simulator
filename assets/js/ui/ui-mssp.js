/**
 * UI MSSP Module
 * Pannello SPI/I²C: modo attivo, registri, log transazioni, dispositivi collegati.
 */
class UIMSSP {
    constructor(ctx) {
        this.cpu = ctx.cpu;
        this.simulator = ctx.simulator;
        this.ui = ctx.ui;
        this._lastLogLen = 0;
    }

    rebuild() {
        var container = document.getElementById('mssp-container');
        if (!container) return;
        container.innerHTML = '';
        this._lastLogLen = 0;

        var mssp = this.cpu.getPeripheral('MSSP');
        if (!mssp) {
            container.closest('.pic-panel').style.display = 'none';
            return;
        }
        container.closest('.pic-panel').style.display = '';

        // Info bar
        var info = document.createElement('div');
        info.className = 'pic-mssp-info';
        info.innerHTML =
            '<span class="pic-mssp-mode" id="mssp-mode">Disabled</span>' +
            '<span class="pic-mssp-stat" id="mssp-stat">BF:0</span>' +
            '<span class="pic-mssp-bus" id="mssp-bus-info"></span>';
        container.appendChild(info);

        // Registers grid
        var grid = document.createElement('div');
        grid.className = 'pic-mssp-grid';
        grid.innerHTML =
            '<div class="pic-mssp-field"><span class="pic-mssp-label">SSPBUF</span><span class="pic-mssp-value" id="mssp-buf">00</span></div>' +
            '<div class="pic-mssp-field"><span class="pic-mssp-label">SSPCON</span><span class="pic-mssp-value" id="mssp-con">00</span></div>' +
            '<div class="pic-mssp-field"><span class="pic-mssp-label">SSPSTAT</span><span class="pic-mssp-value" id="mssp-stat-reg">00</span></div>' +
            '<div class="pic-mssp-field"><span class="pic-mssp-label">SSPADD</span><span class="pic-mssp-value" id="mssp-add">00</span></div>';
        container.appendChild(grid);

        // Bus devices list
        var devSection = document.createElement('div');
        devSection.className = 'pic-mssp-devices';
        devSection.id = 'mssp-devices';
        container.appendChild(devSection);
        this._updateDeviceList(mssp);

        // Transaction log
        var logLabel = document.createElement('div');
        logLabel.className = 'pic-mssp-log-label';
        logLabel.innerHTML = '<span>Bus Log</span><button class="pic-btn pic-btn-sm" id="mssp-clear-log">Clear</button>';
        container.appendChild(logLabel);

        var logArea = document.createElement('div');
        logArea.className = 'pic-mssp-log';
        logArea.id = 'mssp-log';
        // Scorrevole: deve raggiungerlo anche la tastiera
        logArea.tabIndex = 0;
        logArea.setAttribute('role', 'log');
        logArea.setAttribute('aria-label', 'MSSP bus log');
        container.appendChild(logArea);

        var self = this;
        document.getElementById('mssp-clear-log')?.addEventListener('click', function() {
            mssp.clearLog();
            var el = document.getElementById('mssp-log');
            if (el) el.innerHTML = '';
            self._lastLogLen = 0;
        });
    }

    _updateDeviceList(mssp) {
        var el = document.getElementById('mssp-devices');
        if (!el) return;

        var devices = [];
        if (mssp.i2cBus) {
            var list = mssp.i2cBus.getDeviceList();
            for (var i = 0; i < list.length; i++) {
                devices.push('<span class="pic-mssp-dev' + (list[i].active ? ' active' : '') + '">' +
                    list[i].name + ' [' + list[i].address + ']</span>');
            }
        }
        if (mssp.spiBus) {
            var sList = mssp.spiBus.getDeviceList();
            for (var j = 0; j < sList.length; j++) {
                devices.push('<span class="pic-mssp-dev' + (sList[j].selected ? ' active' : '') + '">' +
                    sList[j].name + ' #' + sList[j].index + '</span>');
            }
        }
        el.innerHTML = devices.length > 0
            ? devices.join('')
            : '<span class="pic-mssp-no-dev">No devices attached</span>';
    }

    // ================================================================
    //  UPDATE
    // ================================================================

    update() {
        var mssp = this.cpu.getPeripheral('MSSP');
        if (!mssp) return;

        var state = mssp.getState();

        // Mode
        var modeEl = document.getElementById('mssp-mode');
        if (modeEl) {
            var modeLabels = {
                'disabled': 'Disabled',
                'spi_master': 'SPI Master',
                'spi_slave': 'SPI Slave',
                'i2c_master': 'I\u00B2C Master',
                'i2c_slave': 'I\u00B2C Slave',
                'unknown': '???'
            };
            modeEl.textContent = modeLabels[state.mode] || state.mode;
            modeEl.className = 'pic-mssp-mode pic-mssp-mode--' + state.mode.replace(/_/g, '-');
        }

        // BF
        var statEl = document.getElementById('mssp-stat');
        if (statEl) statEl.textContent = 'BF:' + (state.bufferFull ? '1' : '0');

        // Bus info
        var busEl = document.getElementById('mssp-bus-info');
        if (busEl) {
            var parts = [];
            if (state.hasSPIBus) parts.push('SPI');
            if (state.hasI2CBus) parts.push('I\u00B2C');
            busEl.textContent = parts.length > 0 ? parts.join('+') : '';
        }

        // Registers
        this._setHex('mssp-buf', mssp.bufReg);
        this._setHex('mssp-con', mssp.conReg);
        this._setHex('mssp-stat-reg', mssp.statReg);
        this._setHex('mssp-add', mssp.addReg);

        // Log (append only nuove entries)
        var log = mssp.getTransferLog();
        if (log.length > this._lastLogLen) {
            var logEl = document.getElementById('mssp-log');
            if (logEl) {
                for (var i = this._lastLogLen; i < log.length; i++) {
                    var entry = log[i];
                    var line = document.createElement('div');
                    line.className = 'pic-mssp-log-entry pic-mssp-log--' + entry.type.toLowerCase().replace(/_/g, '-');
                    line.textContent = this._formatLogEntry(entry);
                    logEl.appendChild(line);
                }
                logEl.scrollTop = logEl.scrollHeight;
            }
            this._lastLogLen = log.length;
        }

        // Device list (aggiorna active state)
        this._updateDeviceList(mssp);
    }

    _formatLogEntry(entry) {
        var hex = function(v) { return v.toString(16).toUpperCase().padStart(2, '0'); };
        switch (entry.type) {
            case 'SPI':
                return 'SPI  OUT:0x' + hex(entry.out) + ' IN:0x' + hex(entry.in);
            case 'SPI_RX':
                return 'SPI  RX:0x' + hex(entry.in);
            case 'I2C_TX':
                return 'I2C  TX:0x' + hex(entry.out) + (entry.in ? ' NACK' : ' ACK');
            case 'I2C_RX':
                return 'I2C  RX:0x' + hex(entry.in);
            case 'I2C_SLAVE_RX':
                return 'I2C  SLV:0x' + hex(entry.in);
            default:
                return entry.type + ' ' + hex(entry.out) + '/' + hex(entry.in);
        }
    }

    _setHex(id, addr) {
        var el = document.getElementById(id);
        if (el) el.textContent = this.cpu.ram[addr].toString(16).toUpperCase().padStart(2, '0');
    }

    setCpu(cpu) { this.cpu = cpu; }
}
