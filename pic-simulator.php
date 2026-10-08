<?php
/**
 * Plugin Name: WebPicSimulator
 * Plugin URI: https://www.davidebertolino.it/progetti/pic-simulator/
 * Description: Simulatore web-based per microcontrollori PIC16 mid-range. 22 device supportati, 12 periferiche simulate, terminale USART, ADC, CCP/PWM, MSSP con bus virtuali I²C/SPI. Shortcodes: [pic_simulator] per simulatore, [pic_test_suite] per test automatici, [pic_dashboard] per gestione progetti.
 * Version: 3.2.0
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * Author: Prof. D. Bertolino
 * Author URI: https://www.davidebertolino.it
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: webpicsimulator
 * Update URI: https://github.com/dadebertolino/pic-simulator
 */

// Impedisci accesso diretto
if (!defined('ABSPATH')) {
    exit;
}

// Costanti
define('PIC_SIM_VERSION', '3.2.0');
define('PIC_SIM_DB_VERSION', '1.0.0');
define('PIC_SIM_PATH', plugin_dir_path(__FILE__));
define('PIC_SIM_URL', plugin_dir_url(__FILE__));
define('PIC_SIM_PLUGIN_FILE', __FILE__);

/* -------------------------------------------------------------------------
 * GitHub Auto-Updater (componente condiviso)
 * ---------------------------------------------------------------------- */
require_once PIC_SIM_PATH . 'includes/class-updater.php';
new DB_GitHub_Updater(PIC_SIM_PLUGIN_FILE, 'dadebertolino', 'pic-simulator');

// =============================================================================
// AUTOLOAD CLASSI
// =============================================================================

// Core
require_once PIC_SIM_PATH . 'includes/class-activator.php';
require_once PIC_SIM_PATH . 'includes/class-deactivator.php';

// Database
require_once PIC_SIM_PATH . 'includes/database/class-db-manager.php';

// API
require_once PIC_SIM_PATH . 'includes/api/class-api-projects.php';
require_once PIC_SIM_PATH . 'includes/api/class-api-files.php';
require_once PIC_SIM_PATH . 'includes/api/class-api-classes.php';
require_once PIC_SIM_PATH . 'includes/api/class-api-assignments.php';

// Frontend Dashboard
require_once PIC_SIM_PATH . 'includes/public/class-dashboard-controller.php';

/**
 * Classe principale del plugin
 */
class PIC_Simulator_Plugin {
    
    private static $instance = null;
    
    /** Asset gia' accodati in questa richiesta (simulatore / test suite). */
    private $assets_done = false;
    private $test_assets_done = false;
    
    /** Il simulatore e' gia' stato inserito in questa pagina. */
    private $simulator_rendered = false;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct() {
        // Check upgrade database
        add_action('plugins_loaded', [$this, 'check_db_upgrade']);
        
        add_action('init', [$this, 'init']);
        add_action('wp_enqueue_scripts', [$this, 'enqueue_scripts']);
        add_action('admin_menu', [$this, 'admin_menu']);
        
        // REST API
        add_action('rest_api_init', [$this, 'register_rest_routes']);
        
        // Legacy AJAX handlers (manteniamo per compatibilità)
        add_action('wp_ajax_pic_sim_save', [$this, 'ajax_save_project']);
        add_action('wp_ajax_pic_sim_load', [$this, 'ajax_load_project']);
        add_action('wp_ajax_pic_sim_list', [$this, 'ajax_list_projects']);
        add_action('wp_ajax_pic_sim_delete', [$this, 'ajax_delete_project']);
        
        // Shortcode simulatore (dashboard gestita da Dashboard_Controller)
        add_shortcode('pic_simulator', [$this, 'render_shortcode']);
        add_shortcode('pic_test_suite', [$this, 'render_test_suite']);
        
        // Enqueue test suite (separato)
        add_action('wp_enqueue_scripts', [$this, 'enqueue_test_scripts']);
        
        // Gutenberg block
        add_action('init', [$this, 'register_block']);
    }
    
    /**
     * Verifica se serve aggiornamento database
     */
    public function check_db_upgrade() {
        if (\PicSim\Activator::needs_upgrade()) {
            \PicSim\Activator::activate();
        }
    }
    
    /**
     * Registra REST API routes
     */
    public function register_rest_routes() {
        // Status endpoint
        register_rest_route('picsim/v1', '/status', [
            'methods' => 'GET',
            'callback' => function() {
                return [
                    'status' => 'ok',
                    'version' => PIC_SIM_VERSION,
                    'db_version' => get_option('picsim_db_version', '0.0.0'),
                    'user_logged_in' => is_user_logged_in()
                ];
            },
            'permission_callback' => '__return_true'
        ]);
        
        // Projects API
        $projects_api = new \PicSim\API\API_Projects();
        $projects_api->register_routes();
        
        // Files API
        $files_api = new \PicSim\API\API_Files();
        $files_api->register_routes();
        
        // Classes API
        $classes_api = new \PicSim\API\API_Classes();
        $classes_api->register_routes();
        
        // Assignments API
        $assignments_api = new \PicSim\API\API_Assignments();
        $assignments_api->register_routes();
    }
    
    public function init() {
        // Crea directory per progetti se non esiste
        $upload_dir = wp_upload_dir();
        $projects_dir = $upload_dir['basedir'] . '/pic-simulator-projects';
        if (!file_exists($projects_dir)) {
            wp_mkdir_p($projects_dir);
            // Proteggi la directory
            file_put_contents($projects_dir . '/.htaccess', 'Deny from all');
            file_put_contents($projects_dir . '/index.php', '<?php // Silence is golden');
        }
    }
    
    /**
     * Accoda gli asset del simulatore.
     *
     * Dall'hook wp_enqueue_scripts solo se lo shortcode e' nel contenuto del
     * post, cosi' il CSS finisce nell'head. Lo shortcode e il blocco lo
     * richiamano con $force: il controllo sul contenuto non vede lo shortcode
     * in blocchi riutilizzabili, widget, template FSE e page builder, e li'
     * il simulatore restava senza CSS ne' JS.
     */
    public function enqueue_scripts($force = false) {
        if ($this->assets_done) {
            return;
        }
        if (true !== $force) {
            global $post;
            if (!is_a($post, 'WP_Post') || !has_shortcode($post->post_content, 'pic_simulator')) {
                return;
            }
        }
        $this->assets_done = true;
        
        // CSS
        wp_enqueue_style(
            'pic-simulator-style',
            PIC_SIM_URL . 'assets/css/style.css',
            [],
            PIC_SIM_VERSION
        );
        
        // Nessun font da CDN esterno (GDPR): Inter e JetBrains Mono si usano
        // se installati, altrimenti i font di sistema dello stack CSS.
        
        // JavaScript - Device Loader (prima di tutto)
        wp_enqueue_script(
            'pic-sim-device-loader',
            PIC_SIM_URL . 'assets/js/core/device-loader.js',
            [],
            PIC_SIM_VERSION,
            true
        );
        
        // JavaScript - Peripheral system (prima del core)
        wp_enqueue_script(
            'pic-sim-peripherals',
            PIC_SIM_URL . 'assets/js/core/pic16-peripherals.js',
            [],
            PIC_SIM_VERSION,
            true
        );
        
        // JavaScript - Peripheral modules
        wp_enqueue_script(
            'pic-sim-gpio',
            PIC_SIM_URL . 'assets/js/core/peripherals/gpio.js',
            ['pic-sim-peripherals'],
            PIC_SIM_VERSION,
            true
        );
        
        wp_enqueue_script(
            'pic-sim-tmr0',
            PIC_SIM_URL . 'assets/js/core/peripherals/tmr0.js',
            ['pic-sim-peripherals'],
            PIC_SIM_VERSION,
            true
        );
        
        wp_enqueue_script(
            'pic-sim-eeprom',
            PIC_SIM_URL . 'assets/js/core/peripherals/eeprom.js',
            ['pic-sim-peripherals'],
            PIC_SIM_VERSION,
            true
        );
        
        wp_enqueue_script(
            'pic-sim-tmr1',
            PIC_SIM_URL . 'assets/js/core/peripherals/tmr1.js',
            ['pic-sim-peripherals'],
            PIC_SIM_VERSION,
            true
        );
        
        wp_enqueue_script(
            'pic-sim-tmr2',
            PIC_SIM_URL . 'assets/js/core/peripherals/tmr2.js',
            ['pic-sim-peripherals'],
            PIC_SIM_VERSION,
            true
        );
        
        wp_enqueue_script(
            'pic-sim-ccp',
            PIC_SIM_URL . 'assets/js/core/peripherals/ccp.js',
            ['pic-sim-peripherals'],
            PIC_SIM_VERSION,
            true
        );
        
        wp_enqueue_script(
            'pic-sim-usart',
            PIC_SIM_URL . 'assets/js/core/peripherals/usart.js',
            ['pic-sim-peripherals'],
            PIC_SIM_VERSION,
            true
        );
        
        wp_enqueue_script(
            'pic-sim-adc',
            PIC_SIM_URL . 'assets/js/core/peripherals/adc.js',
            ['pic-sim-peripherals'],
            PIC_SIM_VERSION,
            true
        );
        
        wp_enqueue_script(
            'pic-sim-comparator',
            PIC_SIM_URL . 'assets/js/core/peripherals/comparator.js',
            ['pic-sim-peripherals'],
            PIC_SIM_VERSION,
            true
        );
        
        wp_enqueue_script(
            'pic-sim-virtual-bus',
            PIC_SIM_URL . 'assets/js/core/peripherals/virtual-bus.js',
            [],
            PIC_SIM_VERSION,
            true
        );
        
        wp_enqueue_script(
            'pic-sim-onewire-bus',
            PIC_SIM_URL . 'assets/js/core/peripherals/onewire-bus.js',
            [],
            PIC_SIM_VERSION,
            true
        );
        
        wp_enqueue_script(
            'pic-sim-virtual-devices',
            PIC_SIM_URL . 'assets/js/core/peripherals/virtual-devices.js',
            ['pic-sim-virtual-bus'],
            PIC_SIM_VERSION,
            true
        );
        
        // Virtual device modules (I²C + SPI)
        $device_files = [
            'i2c-24c02', 'i2c-lm75', 'i2c-pcf8574', 'i2c-mcp23017',
            'i2c-ds1307', 'i2c-bmp280', 'i2c-sht21',
            'i2c-ds3231', 'i2c-mcp9808',
            'i2c-tmp102', 'i2c-stts751', 'i2c-pcf8563',
            'i2c-ssd1306',
            'spi-74hc595', 'spi-mcp3008', 'spi-max7219'
        ];
        // 1-Wire device files
        $ow_device_files = ['ow-ds18b20'];
        // GPIO device files
        $gpio_device_files = ['gpio-servo', 'gpio-hcsr04', 'gpio-ws2812', 'gpio-ks0108', 'gpio-l293d', 'gpio-buzzer', 'gpio-keypad', 'gpio-rgb-led'];
        foreach (array_merge($ow_device_files, $gpio_device_files) as $dev) {
            wp_enqueue_script(
                'pic-sim-dev-' . $dev,
                PIC_SIM_URL . 'assets/js/core/peripherals/devices/' . $dev . '.js',
                ['pic-sim-onewire-bus'],
                PIC_SIM_VERSION,
                true
            );
        }
        foreach ($device_files as $dev) {
            wp_enqueue_script(
                'pic-sim-dev-' . $dev,
                PIC_SIM_URL . 'assets/js/core/peripherals/devices/' . $dev . '.js',
                ['pic-sim-virtual-bus'],
                PIC_SIM_VERSION,
                true
            );
        }
        
        wp_enqueue_script(
            'pic-sim-mssp',
            PIC_SIM_URL . 'assets/js/core/peripherals/mssp.js',
            ['pic-sim-peripherals', 'pic-sim-virtual-bus'],
            PIC_SIM_VERSION,
            true
        );
        
        // JavaScript - CPU core
        wp_enqueue_script(
            'pic-sim-cpu',
            PIC_SIM_URL . 'assets/js/core/pic16-core.js',
            ['pic-sim-device-loader', 'pic-sim-peripherals', 'pic-sim-gpio', 'pic-sim-tmr0', 'pic-sim-eeprom', 'pic-sim-tmr1', 'pic-sim-tmr2', 'pic-sim-ccp', 'pic-sim-usart', 'pic-sim-adc', 'pic-sim-comparator', 'pic-sim-mssp'],
            PIC_SIM_VERSION,
            true
        );
        
        // JavaScript - Device Factory (dopo core e periferiche)
        wp_enqueue_script(
            'pic-sim-factory',
            PIC_SIM_URL . 'assets/js/core/pic16-factory.js',
            ['pic-sim-cpu', 'pic-sim-gpio', 'pic-sim-tmr0', 'pic-sim-eeprom', 'pic-sim-tmr1', 'pic-sim-tmr2', 'pic-sim-ccp', 'pic-sim-usart', 'pic-sim-adc', 'pic-sim-comparator', 'pic-sim-mssp'],
            PIC_SIM_VERSION,
            true
        );
        
        wp_enqueue_script(
            'pic-sim-assembler',
            PIC_SIM_URL . 'assets/js/core/assembler.js',
            [],
            PIC_SIM_VERSION,
            true
        );
        
        wp_enqueue_script(
            'pic-sim-simulator',
            PIC_SIM_URL . 'assets/js/core/simulator.js',
            ['pic-sim-cpu', 'pic-sim-assembler'],
            PIC_SIM_VERSION,
            true
        );
        
        // JavaScript - UI Modules
        $ui_modules = [
            'ui-messages'     => [],
            'ui-editor'       => ['pic-sim-ui-messages'],
            'ui-toolbar'      => ['pic-sim-ui-messages'],
            'ui-registers'    => ['pic-sim-ui-messages'],
            'ui-ports'        => ['pic-sim-ui-messages'],
            'ui-memory'       => ['pic-sim-ui-messages'],
            'ui-breakpoints'  => ['pic-sim-ui-messages'],
            'ui-watches'      => ['pic-sim-ui-messages'],
            'ui-timers'       => ['pic-sim-ui-messages'],
            'ui-terminal'     => ['pic-sim-ui-messages'],
            'ui-ccp'          => ['pic-sim-ui-messages'],
            'ui-adc'          => ['pic-sim-ui-messages'],
            'ui-comparator'   => ['pic-sim-ui-messages'],
            'ui-mssp'         => ['pic-sim-ui-messages'],
            'ui-interrupts'   => ['pic-sim-ui-messages'],
            'ui-virtual-hw'   => ['pic-sim-ui-messages'],
        ];
        
        foreach ($ui_modules as $module => $deps) {
            wp_enqueue_script(
                'pic-sim-' . $module,
                PIC_SIM_URL . 'assets/js/ui/' . $module . '.js',
                array_merge(['pic-sim-simulator'], $deps),
                PIC_SIM_VERSION,
                true
            );
        }
        
        // Virtual Hardware component modules
        $vhw_files = [
            'vhw-7seg', 'vhw-lcd', 'vhw-led-bar', 'vhw-buttons',
            'vhw-rtc', 'vhw-eeprom', 'vhw-bmp280', 'vhw-lm75', 'vhw-sht21',
            'vhw-ds3231', 'vhw-mcp9808',
            'vhw-tmp102', 'vhw-stts751', 'vhw-pcf8563',
            'vhw-ds18b20',
            'vhw-servo',
            'vhw-hcsr04',
            'vhw-ws2812',
            'vhw-ssd1306', 'vhw-ks0108',
            'vhw-l293d',
            'vhw-buzzer', 'vhw-keypad', 'vhw-rgb-led',
            'vhw-mcp23017', 'vhw-74hc595', 'vhw-max7219', 'vhw-mcp3008'
        ];
        foreach ($vhw_files as $vhw) {
            wp_enqueue_script(
                'pic-sim-' . $vhw,
                PIC_SIM_URL . 'assets/js/ui/vhw/' . $vhw . '.js',
                ['pic-sim-ui-virtual-hw'],
                PIC_SIM_VERSION,
                true
            );
        }
        
        // UI Manager (coordinatore, caricato dopo tutti i moduli)
        wp_enqueue_script(
            'pic-sim-ui',
            PIC_SIM_URL . 'assets/js/ui/ui-manager.js',
            ['pic-sim-simulator', 'pic-sim-ui-editor', 'pic-sim-ui-toolbar', 
             'pic-sim-ui-registers', 'pic-sim-ui-ports', 'pic-sim-ui-memory',
             'pic-sim-ui-breakpoints', 'pic-sim-ui-watches', 'pic-sim-ui-messages',
             'pic-sim-ui-timers', 'pic-sim-ui-terminal', 'pic-sim-ui-ccp', 'pic-sim-ui-adc',
             'pic-sim-ui-comparator', 'pic-sim-ui-mssp', 'pic-sim-ui-interrupts',
             'pic-sim-ui-virtual-hw'],
            PIC_SIM_VERSION,
            true
        );
        
        wp_enqueue_script(
            'pic-sim-storage',
            PIC_SIM_URL . 'assets/js/core/storage-wp.js',
            ['pic-sim-ui', 'jquery'],
            PIC_SIM_VERSION,
            true
        );
        
        // Configurazione per JS (path dati e AJAX)
        wp_localize_script('pic-sim-device-loader', 'picSimConfig', [
            'dataPath' => PIC_SIM_URL,
            'version' => PIC_SIM_VERSION
        ]);
        
        // Localizza script per AJAX
        wp_localize_script('pic-sim-storage', 'picSimAjax', [
            'ajaxurl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('pic_sim_nonce')
        ]);
    }
    
    /**
     * Renderizza shortcode
     */
    public function render_shortcode($atts) {
        // L'interfaccia usa ID fissi: un secondo simulatore nella stessa
        // pagina duplicherebbe gli ID e resterebbe inerte. Meglio dirlo.
        if ($this->simulator_rendered) {
            return '<p class="picsim-notice"><strong>WebPicSimulator:</strong> '
                 . esc_html__('e\' possibile inserire un solo simulatore per pagina.', 'webpicsimulator')
                 . '</p>';
        }
        $this->simulator_rendered = true;
        
        $atts = shortcode_atts([
            'height' => '800px',
            'width' => '100%',
            'max_width' => 'none',
            'fullwidth' => 'no',
            'theme' => 'dark'
        ], $atts);
        
        $this->enqueue_scripts(true);
        
        // Fullwidth override
        if ($atts['fullwidth'] === 'yes' || $atts['fullwidth'] === 'true' || $atts['fullwidth'] === '1') {
            $atts['width'] = '100vw';
            $atts['max_width'] = 'none';
        }
        
        ob_start();
        include PIC_SIM_PATH . 'templates/simulator.php';
        return ob_get_clean();
    }
    
    /**
     * Renderizza shortcode test suite
     */
    public function render_test_suite($atts) { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.Found -- firma degli shortcode
        $this->enqueue_test_scripts(true);
        ob_start();
        include PIC_SIM_PATH . 'templates/test-suite.php';
        return ob_get_clean();
    }
    
    /**
     * Enqueue script/style per test suite
     */
    public function enqueue_test_scripts($force = false) {
        if ($this->test_assets_done) {
            return;
        }
        if (true !== $force) {
            global $post;
            if (!is_a($post, 'WP_Post') || !has_shortcode($post->post_content, 'pic_test_suite')) {
                return;
            }
        }
        $this->test_assets_done = true;
        
        // CSS
        wp_enqueue_style('pic-test-suite-style', PIC_SIM_URL . 'assets/css/test-suite.css', [], PIC_SIM_VERSION);
        
        // Core JS (solo engine, no UI simulatore)
        $core_scripts = [
            'pic-sim-device-loader'   => 'assets/js/core/device-loader.js',
            'pic-sim-peripherals'     => 'assets/js/core/pic16-peripherals.js',
            'pic-sim-gpio'            => 'assets/js/core/peripherals/gpio.js',
            'pic-sim-tmr0'            => 'assets/js/core/peripherals/tmr0.js',
            'pic-sim-tmr1'            => 'assets/js/core/peripherals/tmr1.js',
            'pic-sim-tmr2'            => 'assets/js/core/peripherals/tmr2.js',
            'pic-sim-eeprom'          => 'assets/js/core/peripherals/eeprom.js',
            'pic-sim-ccp'             => 'assets/js/core/peripherals/ccp.js',
            'pic-sim-usart'           => 'assets/js/core/peripherals/usart.js',
            'pic-sim-adc'             => 'assets/js/core/peripherals/adc.js',
            'pic-sim-comparator'      => 'assets/js/core/peripherals/comparator.js',
            'pic-sim-virtual-bus'     => 'assets/js/core/peripherals/virtual-bus.js',
            'pic-sim-virtual-devices' => 'assets/js/core/peripherals/virtual-devices.js',
            'pic-sim-mssp'            => 'assets/js/core/peripherals/mssp.js',
            'pic-sim-cpu'             => 'assets/js/core/pic16-core.js',
            'pic-sim-factory'         => 'assets/js/core/pic16-factory.js',
            'pic-sim-assembler'       => 'assets/js/core/assembler.js',
        ];
        
        $prev = [];
        foreach ($core_scripts as $handle => $path) {
            wp_enqueue_script($handle, PIC_SIM_URL . $path, $prev, PIC_SIM_VERSION, true);
            $prev = [$handle];
        }
        
        // Test runner
        wp_enqueue_script('pic-test-runner', PIC_SIM_URL . 'assets/js/test-runner.js',
            ['pic-sim-factory', 'pic-sim-assembler'], PIC_SIM_VERSION, true);
        
        // Config per device loader
        wp_localize_script('pic-sim-device-loader', 'picSimConfig', [
            'dataPath' => PIC_SIM_URL,
            'version' => PIC_SIM_VERSION
        ]);
    }
    
    /**
     * Registra blocco Gutenberg
     */
    public function register_block() {
        if (!function_exists('register_block_type')) {
            return;
        }
        
        wp_register_script(
            'pic-simulator-block',
            PIC_SIM_URL . 'assets/js/block.js',
            ['wp-blocks', 'wp-element', 'wp-editor', 'wp-components'],
            PIC_SIM_VERSION,
            false
        );
        
        register_block_type('pic-simulator/simulator', [
            'editor_script' => 'pic-simulator-block',
            'render_callback' => [$this, 'render_shortcode'],
            'attributes' => [
                'height' => ['type' => 'string', 'default' => '800px'],
                'theme' => ['type' => 'string', 'default' => 'dark']
            ]
        ]);
    }
    
    /**
     * Menu amministrazione
     */
    public function admin_menu() {
        add_options_page(
            'WebPicSimulator Settings',
            'WebPicSimulator',
            'manage_options',
            'webpicsimulator',
            [$this, 'admin_page']
        );
    }
    
    public function admin_page() {
        ?>
        <div class="wrap">
            <h1>WebPicSimulator <small>v<?php echo esc_html(PIC_SIM_VERSION); ?></small></h1>
            <p>by Prof. D.Bertolino</p>
            
            <h2>Shortcodes Disponibili</h2>
            <table class="form-table">
                <tr>
                    <th><code>[pic_simulator]</code></th>
                    <td>Inserisce il simulatore PIC completo</td>
                </tr>
                <tr>
                    <th><code>[pic_dashboard]</code></th>
                    <td>Inserisce la dashboard gestione progetti (richiede login)</td>
                </tr>
            </table>
            
            <h2>Opzioni Shortcode [pic_simulator]</h2>
            <table class="form-table">
                <tr>
                    <th>Parametro</th>
                    <th>Default</th>
                    <th>Descrizione</th>
                </tr>
                <tr>
                    <td><code>height</code></td>
                    <td>800px</td>
                    <td>Altezza del simulatore</td>
                </tr>
                <tr>
                    <td><code>width</code></td>
                    <td>100%</td>
                    <td>Larghezza del simulatore</td>
                </tr>
                <tr>
                    <td><code>fullwidth</code></td>
                    <td>no</td>
                    <td>Espande oltre il container del tema (yes/no)</td>
                </tr>
                <tr>
                    <td><code>theme</code></td>
                    <td>dark</td>
                    <td>Tema (dark/light)</td>
                </tr>
            </table>
            
            <h3>Esempi</h3>
            <p><code>[pic_simulator]</code> - Default</p>
            <p><code>[pic_simulator fullwidth="yes"]</code> - Larghezza schermo</p>
            <p><code>[pic_dashboard]</code> - Dashboard progetti</p>
            
            <h2>Database</h2>
            <p>
                <strong>Versione DB:</strong> <?php echo esc_html(get_option('picsim_db_version', 'non installato')); ?>
            </p>
            <?php
            global $wpdb;
            $tables = [
                $wpdb->prefix . 'picsim_projects',
                $wpdb->prefix . 'picsim_files',
                $wpdb->prefix . 'picsim_classes',
                $wpdb->prefix . 'picsim_class_students',
                $wpdb->prefix . 'picsim_assignments'
            ];
            echo '<ul>';
            foreach ($tables as $table) {
                $exists = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table)) === $table;
                $status = $exists ? '✅' : '❌';
                // Nome di tabella dal prefisso di WordPress: un identificatore non
                // si passa come placeholder (%i esiste solo da WordPress 6.2).
                // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $count = $exists ? $wpdb->get_var('SELECT COUNT(*) FROM `' . esc_sql($table) . '`') : '-';
                echo '<li>' . esc_html($status) . ' <code>' . esc_html($table) . '</code> - ' . esc_html($count) . ' record</li>';
            }
            echo '</ul>';
            
            if (isset($_GET['reinstall_db'], $_GET['_wpnonce'])
                && wp_verify_nonce(sanitize_text_field(wp_unslash($_GET['_wpnonce'])), 'picsim_reinstall')
                && current_user_can('manage_options')) {
                \PicSim\Activator::activate();
                echo '<div class="notice notice-success"><p>Database reinstallato!</p></div>';
            }
            ?>
            <p>
                <a href="<?php echo esc_url(wp_nonce_url(admin_url('options-general.php?page=webpicsimulator&reinstall_db=1'), 'picsim_reinstall')); ?>" 
                   class="button" 
                   onclick="return confirm('Reinstallare le tabelle del database?');">
                    Reinstalla Tabelle DB
                </a>
            </p>
            
            <h2>REST API Endpoints</h2>
            <p>Base URL: <code><?php echo esc_html(rest_url('picsim/v1/')); ?></code></p>
            <ul>
                <li><code>GET/POST /projects</code> - Lista/Crea progetti</li>
                <li><code>GET/PUT/DELETE /projects/{id}</code> - Singolo progetto</li>
                <li><code>GET/POST /projects/{id}/files</code> - Files progetto</li>
                <li><code>GET/POST /classes</code> - Classi (docenti)</li>
                <li><code>GET/POST /assignments</code> - Assegnazioni</li>
            </ul>
            
            <h2>Permessi Utente</h2>
            <p>Per abilitare un utente come docente (gestione classi), aggiungi la capability <code>picsim_manage_classes</code>.</p>
            <p>
                <?php
                $current_user = wp_get_current_user();
                $is_teacher = current_user_can('picsim_manage_classes');
                echo 'Utente corrente: <strong>' . esc_html($current_user->display_name) . '</strong> - ';
                echo esc_html($is_teacher ? '✅ Docente' : '👤 Studente');
                ?>
            </p>
        </div>
        <?php
    }
    
    // === AJAX HANDLERS ===
    //
    // Salvataggio rapido dei progetti dal simulatore (storage-wp.js), su file
    // JSON. Ogni utente ha una sua cartella: prima la cartella era comune e
    // qualunque utente loggato poteva elencare, leggere, sovrascrivere e
    // cancellare i progetti di tutti. Il nome della cartella contiene un hash
    // non indovinabile, perche' il .htaccess non protegge su nginx.
    
    private function get_projects_root() {
        $upload_dir = wp_upload_dir();
        return $upload_dir['basedir'] . '/pic-simulator-projects';
    }
    
    /** Cartella dei progetti dell'utente corrente, creata al primo uso. */
    private function get_projects_dir() {
        $user_id = get_current_user_id();
        $dir = $this->get_projects_root() . '/u' . $user_id . '-' . substr(wp_hash('picsim-projects-' . $user_id), 0, 16);
        if (!is_dir($dir)) {
            wp_mkdir_p($dir);
            file_put_contents($dir . '/index.php', '<?php // Silence is golden');
        }
        return $dir;
    }
    
    /**
     * File di un progetto dell'utente corrente, o null. Accetta anche i file
     * salvati nella cartella comune dalle versioni precedenti, ma solo se il
     * JSON indica come autore l'utente corrente.
     */
    private function find_project_file($name) {
        $own = $this->get_projects_dir() . '/' . $name . '.json';
        if (file_exists($own)) {
            return $own;
        }
        $legacy = $this->get_projects_root() . '/' . $name . '.json';
        if (file_exists($legacy)) {
            $data = json_decode(file_get_contents($legacy), true);
            if (is_array($data) && (int) ($data['user_id'] ?? 0) === get_current_user_id()) {
                return $legacy;
            }
        }
        return null;
    }
    
    /** Nome del progetto dalla richiesta, ripulito per l'uso come nome di file. */
    private function request_project_name($source) {
        return sanitize_file_name(wp_unslash($source['name'] ?? ''));
    }
    
    public function ajax_save_project() {
        check_ajax_referer('pic_sim_nonce', 'nonce');
        
        if (!is_user_logged_in()) {
            wp_send_json_error(['message' => 'Login required']);
        }
        
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- verificato da check_ajax_referer
        $name = $this->request_project_name($_POST);
        if (empty($name)) {
            wp_send_json_error(['message' => 'Project name required']);
        }
        
        // phpcs:disable WordPress.Security.NonceVerification.Missing,WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- nonce verificato; il sorgente e' salvato come testo JSON e mai stampato come HTML
        $data = [
            'name' => $name,
            'source' => wp_unslash($_POST['source'] ?? ''),
            'breakpoints' => json_decode(wp_unslash($_POST['breakpoints'] ?? '[]'), true),
            'watches' => json_decode(wp_unslash($_POST['watches'] ?? '[]'), true),
            'user_id' => get_current_user_id(),
            'modified' => current_time('c'),
            'device' => 'PIC16F84A'
        ];
        // phpcs:enable
        
        $file = $this->get_projects_dir() . '/' . $name . '.json';
        
        if (file_put_contents($file, wp_json_encode($data, JSON_PRETTY_PRINT))) {
            wp_send_json_success(['message' => 'Project saved']);
        } else {
            wp_send_json_error(['message' => 'Failed to save']);
        }
    }
    
    public function ajax_load_project() {
        check_ajax_referer('pic_sim_nonce', 'nonce');
        
        // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- verificato da check_ajax_referer
        $file = $this->find_project_file($this->request_project_name($_GET));
        if (!$file) {
            wp_send_json_error(['message' => 'Project not found']);
        }
        
        $data = json_decode(file_get_contents($file), true);
        wp_send_json_success(['project' => $data]);
    }
    
    public function ajax_list_projects() {
        check_ajax_referer('pic_sim_nonce', 'nonce');
        
        $files = glob($this->get_projects_dir() . '/*.json') ?: [];
        // Progetti salvati dalle versioni precedenti nella cartella comune: solo i propri.
        foreach (glob($this->get_projects_root() . '/*.json') ?: [] as $legacy) {
            if ($this->find_project_file(basename($legacy, '.json')) === $legacy) {
                $files[] = $legacy;
            }
        }
        
        $projects = [];
        foreach ($files as $file) {
            $data = json_decode(file_get_contents($file), true);
            if ($data) {
                $projects[] = [
                    'name' => $data['name'] ?? basename($file, '.json'),
                    'modified' => $data['modified'] ?? gmdate('c', filemtime($file)),
                    'device' => $data['device'] ?? 'PIC16F84A'
                ];
            }
        }
        
        usort($projects, function($a, $b) {
            return strtotime($b['modified']) - strtotime($a['modified']);
        });
        
        wp_send_json_success(['projects' => $projects]);
    }
    
    public function ajax_delete_project() {
        check_ajax_referer('pic_sim_nonce', 'nonce');
        
        if (!is_user_logged_in()) {
            wp_send_json_error(['message' => 'Login required']);
        }
        
        // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- verificato da check_ajax_referer
        $file = $this->find_project_file($this->request_project_name($_GET));
        
        if ($file && unlink($file)) {
            wp_send_json_success(['message' => 'Project deleted']);
        } else {
            wp_send_json_error(['message' => 'Failed to delete']);
        }
    }
}

// Inizializza plugin
PIC_Simulator_Plugin::get_instance();

// =============================================================================
// HOOKS ATTIVAZIONE / DISATTIVAZIONE
// =============================================================================

register_activation_hook(__FILE__, function() {
    \PicSim\Activator::activate();
});

register_deactivation_hook(__FILE__, function() {
    \PicSim\Deactivator::deactivate();
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Ottiene istanza DB Manager
 * 
 * @return \PicSim\Database\DB_Manager
 */
function picsim_db() {
    return \PicSim\Database\DB_Manager::get_instance();
}

/**
 * Verifica se utente può gestire classi
 */
function picsim_can_manage_classes() {
    return current_user_can('picsim_manage_classes');
}

/**
 * Verifica se utente può valutare submissions
 */
function picsim_can_grade() {
    return current_user_can('picsim_grade_submissions');
}
