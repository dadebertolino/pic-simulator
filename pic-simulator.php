<?php
/**
 * Plugin Name: WebPicSimulator
 * Plugin URI: https://www.davidebertolino.it/progetti/pic-simulator/
 * Description: Simulatore web-based per microcontrollori PIC16F84A. Uso: shortcode [pic_simulator]
 * Version: 1.0.1
 * Author: Prof. D. Bertolino
 * Author URI: https://www.davidebertolino.it
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: webpicsimulator
 * Requires at least: 5.8
 * Requires PHP: 7.4
 */

// Impedisci accesso diretto
if (!defined('ABSPATH')) {
    exit;
}

// Costanti
define('PICSIM_VERSION', '1.0.1');
define('PICSIM_PATH', plugin_dir_path(__FILE__));
define('PICSIM_URL', plugin_dir_url(__FILE__));
define('PICSIM_PLUGIN_FILE', __FILE__);

/* -------------------------------------------------------------------------
 * GitHub Auto-Updater (componente condiviso)
 * ---------------------------------------------------------------------- */
require_once PICSIM_PATH . 'inc/class-updater.php';
new DB_GitHub_Updater(PICSIM_PLUGIN_FILE, 'dadebertolino', 'pic-simulator');

/**
 * Classe principale plugin
 */
class WebPicSimulator {
    
    private static $instance = null;
    
    /** Un solo simulatore per pagina: vedi render_shortcode(). */
    private static $rendered = false;
    
    /** Hook della pagina di amministrazione, per l'enqueue mirato. */
    private $admin_hook = '';
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct() {
        add_action('wp_enqueue_scripts', [$this, 'register_assets']);
        add_shortcode('pic_simulator', [$this, 'render_shortcode']);
        add_action('admin_menu', [$this, 'admin_menu']);
        add_action('admin_enqueue_scripts', [$this, 'admin_assets']);
    }
    
    /**
     * Registra scripts e stili.
     *
     * La registrazione e' incondizionata: l'accodamento vero avviene in
     * enqueue_assets(), chiamato dallo shortcode. Il vecchio controllo su
     * $post->post_content non vedeva lo shortcode dentro blocchi FSE,
     * widget, template di page builder o campi personalizzati, e in quei
     * casi il simulatore veniva mostrato senza CSS ne' JS.
     */
    public function register_assets() {
        wp_register_style(
            'picsim-style',
            PICSIM_URL . 'assets/css/style.css',
            [],
            PICSIM_VERSION
        );
        
        // Ordine di caricamento importante: le dipendenze lo garantiscono
        wp_register_script(
            'picsim-cpu',
            PICSIM_URL . 'assets/js/pic16f84a.js',
            [],
            PICSIM_VERSION,
            true
        );
        
        wp_register_script(
            'picsim-assembler',
            PICSIM_URL . 'assets/js/assembler.js',
            [],
            PICSIM_VERSION,
            true
        );
        
        wp_register_script(
            'picsim-simulator',
            PICSIM_URL . 'assets/js/simulator.js',
            ['picsim-cpu', 'picsim-assembler'],
            PICSIM_VERSION,
            true
        );
        
        wp_register_script(
            'picsim-ui',
            PICSIM_URL . 'assets/js/ui.js',
            ['picsim-simulator'],
            PICSIM_VERSION,
            true
        );
        
        // Se lo shortcode e' rilevabile nel contenuto, accoda subito: cosi'
        // il CSS finisce nell'head. Altrimenti ci pensa lo shortcode stesso.
        global $post;
        if (is_a($post, 'WP_Post') && has_shortcode($post->post_content, 'pic_simulator')) {
            $this->enqueue_assets();
        }
    }
    
    /**
     * Accoda gli asset. Idempotente: WordPress ignora i doppioni.
     */
    public function enqueue_assets() {
        wp_enqueue_style('picsim-style');
        wp_enqueue_script('picsim-ui'); // le dipendenze trascinano gli altri
    }
    
    /**
     * Renderizza shortcode
     */
    public function render_shortcode($atts) {
        // L'interfaccia usa ID fissi (code-editor, btn-run, ...): due istanze
        // nella stessa pagina si romperebbero a vicenda in modo silenzioso.
        // Meglio dirlo che lasciare all'utente un simulatore inerte.
        if (self::$rendered) {
            return '<p class="picsim-notice"><strong>WebPicSimulator:</strong> '
                 . esc_html__('e\' possibile inserire un solo simulatore per pagina.', 'webpicsimulator')
                 . '</p>';
        }
        self::$rendered = true;
        
        $this->enqueue_assets();
        
        $atts = shortcode_atts([
            'height' => '800px',
            'fullwidth' => 'no'
        ], $atts);
        
        $height = $atts['height'];
        $is_fullwidth = ($atts['fullwidth'] === 'yes');
        
        // Composto grezzo qui, escapato all'output dal template.
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
        // L'hook restituito e' la chiave per caricare gli asset solo qui,
        // invece di ricostruirlo a mano come stringa.
        $this->admin_hook = add_options_page(
            'WebPicSimulator',
            'WebPicSimulator',
            'manage_options',
            'webpicsimulator',
            [$this, 'admin_page']
        );
    }
    
    /**
     * Design system condiviso, caricato solo sulla pagina del plugin.
     */
    public function admin_assets($hook) {
        if ($hook !== $this->admin_hook) {
            return;
        }
        
        wp_enqueue_style(
            'db-admin-ui',
            PICSIM_URL . 'assets/css/db-admin-ui.css',
            [],
            '1.0.0'
        );
    }
    
    public function admin_page() {
        include PICSIM_PATH . 'templates/admin/settings.php';
    }
}

// Inizializza
WebPicSimulator::get_instance();
