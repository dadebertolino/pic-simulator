<?php
/**
 * Plugin Name: WebPicSimulator
 * Plugin URI: https://example.com/webpicsimulator
 * Description: Simulatore web-based per microcontrollori PIC16F84A. Uso: shortcode [pic_simulator]
 * Version: 1.0.0
 * Author: Prof. D. Bertolino
 * License: MIT
 * Text Domain: webpicsimulator
 */

// Impedisci accesso diretto
if (!defined('ABSPATH')) {
    exit;
}

// Costanti
define('PICSIM_VERSION', '1.0.0');
define('PICSIM_PATH', plugin_dir_path(__FILE__));
define('PICSIM_URL', plugin_dir_url(__FILE__));

/**
 * Classe principale plugin
 */
class WebPicSimulator {
    
    private static $instance = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct() {
        add_action('wp_enqueue_scripts', [$this, 'enqueue_scripts']);
        add_shortcode('pic_simulator', [$this, 'render_shortcode']);
        add_action('admin_menu', [$this, 'admin_menu']);
    }
    
    /**
     * Carica scripts e stili
     */
    public function enqueue_scripts() {
        global $post;
        
        // Carica solo se shortcode presente
        if (!is_a($post, 'WP_Post') || !has_shortcode($post->post_content, 'pic_simulator')) {
            return;
        }
        
        // CSS
        wp_enqueue_style(
            'picsim-style',
            PICSIM_URL . 'assets/css/style.css',
            [],
            PICSIM_VERSION
        );
        
        // Google Fonts
        wp_enqueue_style(
            'picsim-fonts',
            'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap'
        );
        
        // JavaScript - ordine di caricamento importante
        wp_enqueue_script(
            'picsim-cpu',
            PICSIM_URL . 'assets/js/pic16f84a.js',
            [],
            PICSIM_VERSION,
            true
        );
        
        wp_enqueue_script(
            'picsim-assembler',
            PICSIM_URL . 'assets/js/assembler.js',
            [],
            PICSIM_VERSION,
            true
        );
        
        wp_enqueue_script(
            'picsim-simulator',
            PICSIM_URL . 'assets/js/simulator.js',
            ['picsim-cpu', 'picsim-assembler'],
            PICSIM_VERSION,
            true
        );
        
        wp_enqueue_script(
            'picsim-ui',
            PICSIM_URL . 'assets/js/ui.js',
            ['picsim-simulator'],
            PICSIM_VERSION,
            true
        );
    }
    
    /**
     * Renderizza shortcode
     */
    public function render_shortcode($atts) {
        $atts = shortcode_atts([
            'height' => '800px',
            'fullwidth' => 'no',
            'theme' => 'dark'
        ], $atts);
        
        $height = esc_attr($atts['height']);
        $is_fullwidth = ($atts['fullwidth'] === 'yes');
        
        $style = "height: {$height};";
        if ($is_fullwidth) {
            $style .= " width: 100vw; margin-left: calc(-50vw + 50%);";
        }
        
        ob_start();
        include PICSIM_PATH . 'templates/simulator.php';
        return ob_get_clean();
    }
    
    /**
     * Menu amministrazione
     */
    public function admin_menu() {
        add_options_page(
            'WebPicSimulator',
            'WebPicSimulator',
            'manage_options',
            'webpicsimulator',
            [$this, 'admin_page']
        );
    }
    
    public function admin_page() {
        ?>
        <div class="wrap">
            <h1>WebPicSimulator <small>v<?php echo PICSIM_VERSION; ?></small></h1>
            <p>by Prof. D. Bertolino</p>
            
            <h2>Uso</h2>
            <p>Inserisci lo shortcode <code>[pic_simulator]</code> in una pagina.</p>
            
            <h3>Opzioni</h3>
            <table class="form-table">
                <tr>
                    <th><code>height</code></th>
                    <td>Altezza (default: 800px)</td>
                </tr>
                <tr>
                    <th><code>fullwidth</code></th>
                    <td>yes/no - Espande a tutto schermo (default: no)</td>
                </tr>
            </table>
            
            <h3>Esempi</h3>
            <p><code>[pic_simulator]</code></p>
            <p><code>[pic_simulator height="600px" fullwidth="yes"]</code></p>
            
            <h2>Funzionalità</h2>
            <ul>
                <li>✅ Simulatore PIC16F84A completo</li>
                <li>✅ Editor ASM integrato</li>
                <li>✅ Load/Save file da PC locale</li>
                <li>✅ Pannelli: Registri, Stack, Memoria, PORTA/PORTB, TMR0</li>
                <li>✅ Gestione interrupt</li>
                <li>✅ Run, Step, Animate, Reset</li>
                <li>✅ Breakpoints</li>
            </ul>
            
            <h2>Shortcuts Tastiera</h2>
            <ul>
                <li><kbd>F5</kbd> - Run/Stop</li>
                <li><kbd>F6</kbd> - Animate</li>
                <li><kbd>F8</kbd> - Step</li>
                <li><kbd>F9</kbd> - Toggle Breakpoint</li>
                <li><kbd>Ctrl+S</kbd> - Save ASM</li>
                <li><kbd>Ctrl+O</kbd> - Load ASM</li>
                <li><kbd>Esc</kbd> - Stop</li>
            </ul>
        </div>
        <?php
    }
}

// Inizializza
WebPicSimulator::get_instance();
