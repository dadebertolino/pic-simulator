<?php
/**
 * Dashboard Public Controller
 * 
 * Gestisce rendering e enqueue scripts per dashboard frontend.
 * Da includere nel plugin principale.
 *
 * @package    PicSim
 * @subpackage PicSim/public
 */

namespace PicSim\Frontend;

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

class Dashboard_Controller {

    /**
     * Inizializza controller
     */
    public function __construct() {
        add_shortcode('pic_dashboard', [$this, 'render_shortcode']);
        add_action('wp_enqueue_scripts', [$this, 'enqueue_scripts']);
    }

    /**
     * Enqueue scripts e styles per dashboard
     */
    public function enqueue_scripts() {
        global $post;
        
        // Carica solo se shortcode presente
        if (!is_a($post, 'WP_Post') || 
            (!has_shortcode($post->post_content, 'pic_dashboard') &&
             !has_shortcode($post->post_content, 'pic_simulator'))) {
            return;
        }

        // CSS Dashboard
        wp_enqueue_style(
            'picsim-dashboard',
            PIC_SIM_URL . 'assets/css/dashboard.css',
            [],
            PIC_SIM_VERSION
        );

        // Google Fonts
        wp_enqueue_style(
            'picsim-fonts',
            'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'
        );

        // API Client (PRIMA di tutto)
        wp_enqueue_script(
            'picsim-api',
            PIC_SIM_URL . 'assets/js/api-client.js',
            [],
            PIC_SIM_VERSION,
            true
        );

        // Dashboard Controller
        wp_enqueue_script(
            'picsim-dashboard',
            PIC_SIM_URL . 'assets/js/dashboard.js',
            ['picsim-api'],
            PIC_SIM_VERSION,
            true
        );

        // Project List
        wp_enqueue_script(
            'picsim-project-list',
            PIC_SIM_URL . 'assets/js/project-list.js',
            ['picsim-dashboard'],
            PIC_SIM_VERSION,
            true
        );

        // Project Wizard
        wp_enqueue_script(
            'picsim-project-wizard',
            PIC_SIM_URL . 'assets/js/project-wizard.js',
            ['picsim-dashboard'],
            PIC_SIM_VERSION,
            true
        );

        // Project Editor
        wp_enqueue_script(
            'picsim-project-editor',
            PIC_SIM_URL . 'assets/js/project-editor.js',
            ['picsim-dashboard'],
            PIC_SIM_VERSION,
            true
        );

        // Class Manager
        wp_enqueue_script(
            'picsim-class-manager',
            PIC_SIM_URL . 'assets/js/class-manager.js',
            ['picsim-dashboard'],
            PIC_SIM_VERSION,
            true
        );

        // Assignment Manager
        wp_enqueue_script(
            'picsim-assignment-manager',
            PIC_SIM_URL . 'assets/js/assignment-manager.js',
            ['picsim-dashboard'],
            PIC_SIM_VERSION,
            true
        );

        // Localizza script con config API
        wp_localize_script('picsim-api', 'picsimAPI', [
            'root'  => esc_url_raw(rest_url('picsim/v1/')),
            'nonce' => wp_create_nonce('wp_rest')
        ]);

        // Localizza script con info utente
        wp_localize_script('picsim-dashboard', 'picsimUser', [
            'id'        => get_current_user_id(),
            'name'      => wp_get_current_user()->display_name,
            'isTeacher' => current_user_can('picsim_manage_classes'),
            'isAdmin'   => current_user_can('manage_options')
        ]);
    }

    /**
     * Renderizza shortcode dashboard
     * 
     * @param array $atts Attributi shortcode
     * @return string HTML
     */
    public function render_shortcode($atts) {
        // Verifica login
        if (!is_user_logged_in()) {
            return $this->render_login_required();
        }

        $atts = shortcode_atts([
            'height'    => 'auto',
            'min_height'=> '600px',
        ], $atts);

        $style = '';
        if ($atts['height'] !== 'auto') {
            $style .= 'height:' . esc_attr($atts['height']) . ';';
        }
        if ($atts['min_height']) {
            $style .= 'min-height:' . esc_attr($atts['min_height']) . ';';
        }

        $is_teacher = current_user_can('picsim_manage_classes') ? 'true' : 'false';

        return sprintf(
            '<div id="picsim-dashboard-root" style="%s"></div>
            <script>
                document.addEventListener("DOMContentLoaded", function() {
                    if (typeof PicSim !== "undefined" && PicSim.Dashboard) {
                        PicSim.Dashboard.init(
                            document.getElementById("picsim-dashboard-root"),
                            { isTeacher: %s }
                        );
                    }
                });
            </script>',
            esc_attr($style),
            $is_teacher
        );
    }

    /**
     * Render messaggio login required
     */
    private function render_login_required() {
        $login_url = wp_login_url(get_permalink());
        
        return sprintf(
            '<div class="picsim-login-required" style="
                text-align: center;
                padding: 60px 20px;
                background: #334155;
                border-radius: 12px;
                color: #f1f5f9;
            ">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" style="margin-bottom: 16px;">
                    <rect x="3" y="11" width="18" height="11" rx="2"/>
                    <path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
                <h3 style="margin: 0 0 8px; font-size: 18px;">Accesso richiesto</h3>
                <p style="margin: 0 0 20px; color: #cbd5e1;">Effettua il login per accedere alla dashboard progetti.</p>
                <a href="%s" style="
                    display: inline-block;
                    padding: 12px 28px;
                    background: #38bdf8;
                    color: #1e293b;
                    text-decoration: none;
                    border-radius: 8px;
                    font-weight: 600;
                ">Accedi</a>
            </div>',
            esc_url($login_url)
        );
    }
}

// Inizializza
new Dashboard_Controller();
