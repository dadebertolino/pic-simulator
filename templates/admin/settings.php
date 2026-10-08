<?php
/**
 * Template: Pagina Informazioni
 *
 * Variabili: nessuna (pagina di sola documentazione)
 */

if (!defined('ABSPATH')) exit;

$shortcuts = array(
    'F5'      => __('Run / Stop', 'webpicsimulator'),
    'F6'      => __('Animate', 'webpicsimulator'),
    'F8'      => __('Step', 'webpicsimulator'),
    'F10'     => __('Step Over', 'webpicsimulator'),
    'F11'     => __('Schermo intero', 'webpicsimulator'),
    'Ctrl+S'  => __('Salva file ASM', 'webpicsimulator'),
    'Ctrl+O'  => __('Apri file ASM', 'webpicsimulator'),
    'Ctrl+N'  => __('Nuovo programma', 'webpicsimulator'),
    'Ctrl+Invio' => __('Assembla', 'webpicsimulator'),
    'Esc'     => __('Stop', 'webpicsimulator'),
);

$features = array(
    __('Simulatore PIC16F84A: CPU, memoria, periferiche e interrupt', 'webpicsimulator'),
    __('Assembler a due passate con editor e segnalazione errori', 'webpicsimulator'),
    __('Load e Save dei sorgenti .asm dal PC locale, export Intel HEX', 'webpicsimulator'),
    __('Pannelli: Registri, Stack, Memoria, PORTA/PORTB, TMR0', 'webpicsimulator'),
    __('Run in tempo reale o rallentato, Step, Step Over, Animate, Reset e breakpoint', 'webpicsimulator'),
    __('10 esempi didattici, dal blink LED alla macchina a stati', 'webpicsimulator'),
);
?>
<div class="wrap">

    <div class="db-ui-page-header">
        <h1><?php esc_html_e('WebPicSimulator', 'webpicsimulator'); ?></h1>
        <div class="db-ui-actions">
            <span class="db-ui-badge db-ui-badge-primary">v<?php echo esc_html(PICSIM_VERSION); ?></span>
        </div>
    </div>

    <div class="db-ui-alert db-ui-alert-info">
        <span class="db-ui-alert-icon">💡</span>
        <span>
            <?php
            printf(
                /* translators: %s: shortcode */
                esc_html__('Inserisci lo shortcode %s in una pagina per mostrare il simulatore.', 'webpicsimulator'),
                '<code>[pic_simulator]</code>'
            );
            ?>
        </span>
    </div>

    <div class="db-ui-card">
        <div class="db-ui-card-header"><h3>⚙️ <?php esc_html_e('Opzioni dello shortcode', 'webpicsimulator'); ?></h3></div>
        <div class="db-ui-card-body">
            <table class="widefat striped">
                <thead>
                    <tr>
                        <th><?php esc_html_e('Attributo', 'webpicsimulator'); ?></th>
                        <th><?php esc_html_e('Default', 'webpicsimulator'); ?></th>
                        <th><?php esc_html_e('Descrizione', 'webpicsimulator'); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><code>height</code></td>
                        <td><code>800px</code></td>
                        <td><?php esc_html_e('Altezza del simulatore.', 'webpicsimulator'); ?></td>
                    </tr>
                    <tr>
                        <td><code>fullwidth</code></td>
                        <td><code>no</code></td>
                        <td><?php esc_html_e('Con "yes" il simulatore si espande a tutta la larghezza della finestra.', 'webpicsimulator'); ?></td>
                    </tr>
                </tbody>
            </table>

            <p>
                <strong><?php esc_html_e('Esempi:', 'webpicsimulator'); ?></strong><br>
                <code>[pic_simulator]</code><br>
                <code>[pic_simulator height="600px" fullwidth="yes"]</code>
            </p>
        </div>
    </div>

    <div class="db-ui-alert db-ui-alert-warning">
        <span class="db-ui-alert-icon">⚠️</span>
        <span><?php esc_html_e('È possibile inserire un solo simulatore per pagina: l\'interfaccia usa identificatori fissi.', 'webpicsimulator'); ?></span>
    </div>

    <div class="db-ui-card">
        <div class="db-ui-card-header"><h3>⌨️ <?php esc_html_e('Scorciatoie da tastiera', 'webpicsimulator'); ?></h3></div>
        <div class="db-ui-card-body">
            <p class="description">
                <?php esc_html_e('Attive solo quando il simulatore ha il focus o è a schermo intero. Su Mac, Cmd al posto di Ctrl.', 'webpicsimulator'); ?>
            </p>
            <table class="widefat striped">
                <tbody>
                <?php foreach ($shortcuts as $key => $label) : ?>
                    <tr>
                        <td style="width:120px"><kbd><?php echo esc_html($key); ?></kbd></td>
                        <td><?php echo esc_html($label); ?></td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>

    <div class="db-ui-card">
        <div class="db-ui-card-header"><h3>✅ <?php esc_html_e('Funzionalità', 'webpicsimulator'); ?></h3></div>
        <div class="db-ui-card-body">
            <ul>
            <?php foreach ($features as $feature) : ?>
                <li><?php echo esc_html($feature); ?></li>
            <?php endforeach; ?>
            </ul>
        </div>
    </div>

    <div class="db-ui-card">
        <div class="db-ui-card-header"><h3>🔄 <?php esc_html_e('Aggiornamenti', 'webpicsimulator'); ?></h3></div>
        <div class="db-ui-card-body">
            <p>
                <?php esc_html_e('Gli aggiornamenti arrivano dalle release GitHub e compaiono nella pagina Plugin come per qualsiasi altro plugin.', 'webpicsimulator'); ?>
            </p>
            <p>
                <a href="https://github.com/dadebertolino/pic-simulator" class="db-ui-btn db-ui-btn-sm" target="_blank" rel="noopener">
                    <?php esc_html_e('Repository GitHub', 'webpicsimulator'); ?> ↗
                </a>
            </p>
        </div>
    </div>

</div>
