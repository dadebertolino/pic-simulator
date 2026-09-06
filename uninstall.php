<?php
/**
 * Uninstall — WebPicSimulator
 * Eseguito da WordPress alla disinstallazione del plugin.
 *
 * Il simulatore non salva nulla: nessuna opzione, nessuna tabella, nessun
 * cron. I sorgenti Assembly restano sul PC dello studente e lo stato della
 * simulazione vive solo nel browser. L'unica traccia lasciata nel database
 * e' la cache dell'updater GitHub.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) exit;

global $wpdb;

// Rimuovi transient updater
$wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_dbgu_%'");
$wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_timeout_dbgu_%'");
