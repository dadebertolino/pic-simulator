/**
 * WebPicSimulator - Gutenberg Block
 * by Prof. D.Bertolino
 */
(function(blocks, element, blockEditor, components) {
    const el = element.createElement;
    const { InspectorControls } = blockEditor;
    const { PanelBody, TextControl, SelectControl } = components;

    blocks.registerBlockType('pic-simulator/simulator', {
        title: 'WebPicSimulator',
        icon: 'desktop',
        category: 'widgets',
        description: 'Embed WebPicSimulator - PIC16 microcontroller simulator by Prof. D.Bertolino',
        
        attributes: {
            height: {
                type: 'string',
                default: '800px'
            },
            theme: {
                type: 'string',
                default: 'dark'
            }
        },

        edit: function(props) {
            const { attributes, setAttributes } = props;

            return el('div', {},
                el(InspectorControls, {},
                    el(PanelBody, { title: 'Settings', initialOpen: true },
                        el(TextControl, {
                            label: 'Height',
                            value: attributes.height,
                            onChange: function(val) {
                                setAttributes({ height: val });
                            }
                        }),
                        el(SelectControl, {
                            label: 'Theme',
                            value: attributes.theme,
                            options: [
                                { label: 'Dark', value: 'dark' },
                                { label: 'Light', value: 'light' }
                            ],
                            onChange: function(val) {
                                setAttributes({ theme: val });
                            }
                        })
                    )
                ),
                el('div', {
                    style: {
                        background: '#0a0e14',
                        color: '#00d9ff',
                        padding: '40px',
                        textAlign: 'center',
                        borderRadius: '8px',
                        border: '2px dashed #2a3545'
                    }
                },
                    el('p', { style: { fontSize: '18px', margin: '0 0 5px' } }, 'âš¡ WebPicSimulator'),
                    el('p', { style: { fontSize: '11px', color: '#00d9ff', margin: '0 0 10px', fontStyle: 'italic' } }, 'by Prof. D.Bertolino'),
                    el('p', { style: { fontSize: '12px', color: '#6a7a8a', margin: 0 } }, 
                        'Height: ' + attributes.height + ' | Theme: ' + attributes.theme)
                )
            );
        },

        save: function() {
            // Rendering handled by PHP
            return null;
        }
    });
})(
    window.wp.blocks,
    window.wp.element,
    window.wp.blockEditor,
    window.wp.components
);
