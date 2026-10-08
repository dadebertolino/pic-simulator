<?php
/**
 * Template: PIC Simulator Test Suite
 * Shortcode: [pic_test_suite]
 */
if (!defined('ABSPATH')) exit;
?>
<div class="pic-test-suite" id="pic-test-suite">
    <header class="pic-test-header">
        <h2>WebPicSimulator &mdash; Test Suite</h2>
        <div class="pic-test-controls">
            <button class="pic-test-btn pic-test-btn-run" id="test-run-all">&#9654; Run All</button>
            <button class="pic-test-btn" id="test-stop">Stop</button>
            <span class="pic-test-stats" id="test-stats">0 / 0</span>
        </div>
    </header>
    <div class="pic-test-progress">
        <div class="pic-test-progress-bar" id="test-progress"></div>
    </div>
    <div class="pic-test-results" id="test-results">
        <div class="pic-test-placeholder">Press "Run All" to start tests</div>
    </div>
    <footer class="pic-test-footer">
        <span>WebPicSimulator v<?php echo esc_html(PIC_SIM_VERSION); ?></span>
        <span>&copy; <?php echo esc_html(gmdate('Y')); ?> Prof. D. Bertolino</span>
    </footer>
</div>

<script>
document.addEventListener('DOMContentLoaded', async function() {
    // Carica device loader
    var deviceLoader = null;
    if (typeof DeviceLoader !== 'undefined') {
        deviceLoader = new DeviceLoader();
        try {
            await deviceLoader.init(picSimConfig.dataPath || '');
        } catch(e) { console.warn('DeviceLoader init failed', e); }
    }

    // Passa al test runner
    if (typeof PicTestRunner !== 'undefined') {
        var runner = new PicTestRunner(deviceLoader);
        window.picTestRunner = runner;
        
        document.getElementById('test-run-all').addEventListener('click', function() {
            runner.runAll();
        });
        document.getElementById('test-stop').addEventListener('click', function() {
            runner.stop();
        });
    }
});
</script>
