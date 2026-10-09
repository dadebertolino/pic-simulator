<?php
/**
 * Uninstall Script
 * 
 * Eseguito quando il plugin viene eliminato (non solo disattivato).
 * Rimuove TUTTI i dati: tabelle, opzioni, capabilities.
 *
 * @package PicSim
 */

// Se non chiamato da WordPress uninstall, esci
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

global $wpdb;

// =============================================================================
// RIMOZIONE TABELLE
// =============================================================================

$tables = [
    $wpdb->prefix . 'picsim_activity_log',
    $wpdb->prefix . 'picsim_class_students',
    $wpdb->prefix . 'picsim_assignments',
    $wpdb->prefix . 'picsim_files',
    $wpdb->prefix . 'picsim_classes',
    $wpdb->prefix . 'picsim_projects'
];

foreach ($tables as $table) {
    $wpdb->query("DROP TABLE IF EXISTS $table");
}

// =============================================================================
// RIMOZIONE OPZIONI
// =============================================================================

$options = [
    'picsim_db_version',
    'picsim_default_device',
    'picsim_default_clock',
    'picsim_max_files_per_project',
    'picsim_max_file_size',
    'picsim_autosave_interval',
    'picsim_enable_classes',
    'picsim_enable_assignments',
    'picsim_join_code_length'
];

foreach ($options as $option) {
    delete_option($option);
}

// =============================================================================
// RIMOZIONE CAPABILITIES
// =============================================================================

$capabilities = [
    'picsim_manage_classes',
    'picsim_create_assignments',
    'picsim_grade_submissions',
    'picsim_view_class_projects',
    'picsim_manage_all'
];

$roles = ['administrator', 'editor', 'author', 'contributor', 'subscriber'];

foreach ($roles as $role_name) {
    $picsim_role = get_role($role_name);
    if ($picsim_role) {
        foreach ($capabilities as $cap) {
            $picsim_role->remove_cap($cap);
        }
    }
}

// =============================================================================
// RIMOZIONE TRANSIENT
// =============================================================================

$wpdb->query(
    "DELETE FROM {$wpdb->options} 
     WHERE option_name LIKE '_transient_picsim_%' 
     OR option_name LIKE '_transient_timeout_picsim_%'"
);

// Cache dell'updater GitHub (componente condiviso dei plugin DB)
$wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_dbgu_%' OR option_name LIKE '_transient_timeout_dbgu_%'");

// =============================================================================
// RIMOZIONE USER META
// =============================================================================

$wpdb->query(
    "DELETE FROM {$wpdb->usermeta} 
     WHERE meta_key LIKE 'picsim_%'"
);

// =============================================================================
// RIMOZIONE PROGETTI SALVATI DAL SIMULATORE
// =============================================================================

// Pulsante Save del simulatore: file JSON in uploads/pic-simulator-projects/,
// una cartella per utente. Si cancellano con le tabelle: sono dati degli utenti.
$picsim_upload_dir = wp_upload_dir();
$picsim_projects_dir = trailingslashit($picsim_upload_dir['basedir']) . 'pic-simulator-projects';
if (is_dir($picsim_projects_dir)) {
    require_once ABSPATH . 'wp-admin/includes/file.php';
    if (WP_Filesystem()) {
        global $wp_filesystem;
        $wp_filesystem->rmdir($picsim_projects_dir, true);
    }
}
