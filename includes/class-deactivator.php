<?php
/**
 * Plugin Deactivator
 * 
 * Gestisce la disattivazione del plugin.
 * NOTA: Non elimina dati, solo cleanup temporaneo.
 *
 * @package    PicSim
 * @subpackage PicSim/includes
 */

namespace PicSim;

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

class Deactivator {

    /**
     * Eseguito alla disattivazione del plugin
     * 
     * Non elimina tabelle o dati per sicurezza.
     * La rimozione completa avviene solo in uninstall.php
     */
    public static function deactivate() {
        // Pulisce eventuali transient
        self::clear_transients();
        
        // Pulisce scheduled events
        self::clear_scheduled_events();
        
        // Flush rewrite rules
        flush_rewrite_rules();
    }

    /**
     * Rimuove tutti i transient del plugin
     */
    private static function clear_transients() {
        global $wpdb;
        
        // Elimina transient con prefisso picsim_
        $wpdb->query(
            "DELETE FROM {$wpdb->options} 
             WHERE option_name LIKE '_transient_picsim_%' 
             OR option_name LIKE '_transient_timeout_picsim_%'"
        );
    }

    /**
     * Rimuove eventi schedulati
     */
    private static function clear_scheduled_events() {
        // Rimuove hook per auto-lock assegnazioni scadute
        $timestamp = wp_next_scheduled('picsim_check_due_assignments');
        if ($timestamp) {
            wp_unschedule_event($timestamp, 'picsim_check_due_assignments');
        }
        
        // Rimuove hook per pulizia log vecchi
        $timestamp = wp_next_scheduled('picsim_cleanup_old_logs');
        if ($timestamp) {
            wp_unschedule_event($timestamp, 'picsim_cleanup_old_logs');
        }
    }
}
