class VirtualMCP3008 extends VirtualSPIDevice {
    constructor() {
        super('MCP3008 ADC');
        this.channels = new Array(8);
        for (var i = 0; i < 8; i++) this.channels[i] = 0;
        this.transferState = 0;
        this.selectedChannel = 0;
    }

    select() {
        this.selected = true;
        this.transferState = 0;
    }

    transfer(byteIn) {
        var result = 0;
        switch (this.transferState) {
            case 0: // Start bit (should be 0x01)
                result = 0;
                break;
            case 1: // Config byte: bit 7=single/diff, bit 6-4=channel
                this.selectedChannel = (byteIn >> 4) & 0x07;
                var val = this.channels[this.selectedChannel] & 0x3FF;
                result = (val >> 8) & 0x03; // Top 2 bits
                break;
            case 2: // Low 8 bits
                result = this.channels[this.selectedChannel] & 0xFF;
                break;
        }
        this.transferState++;
        return result;
    }

    /**
     * Imposta valore canale (dalla UI).
     * @param {number} channel - 0-7
     * @param {number} value - 0-1023
     */
    setChannel(channel, value) {
        if (channel >= 0 && channel < 8) {
            this.channels[channel] = Math.max(0, Math.min(1023, Math.round(value)));
        }
    }

    getState() {
        return { name: this.name, channels: this.channels.slice() };
    }
}
