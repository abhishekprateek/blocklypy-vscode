import svgPanZoom from 'svg-pan-zoom';

window.addEventListener('DOMContentLoaded', () => {
    getPanZoom();
});

window.addEventListener('resize', () => {
    panzoomFitCenter();
});

type PythonPreviewWebviewMessage = { command: 'setContent'; content: string };

window.addEventListener(
    'message',
    (event: MessageEvent<{ command?: string; content?: string }>) => {
        const data = event.data as PythonPreviewWebviewMessage;
        const { command, content } = data || {};
        if (command === 'setContent') {
            setContent(content || '');
        }
    },
);

function setContent(data: string) {
    _panzoomInstance = undefined;

    const element = document.getElementById('graph-container');
    const svg = element?.querySelector('svg');
    if (svg) {
        svg.remove();
    }
    if (element) {
        // intentionally not sanitizing SVG content to avoid breaking it
        element.innerHTML = data ?? '';
    }

    getPanZoom(false); // clear cache and re-init
    panzoomFitCenter();
}

let _panzoomInstance: ReturnType<typeof svgPanZoom> | undefined = undefined;
function getPanZoom(allowcached = true) {
    const element = document.getElementById('graph-container');
    const svg = element?.querySelector('svg');
    if (svg && (!_panzoomInstance || !allowcached)) {
        // requestAnimationFrame(() => {
        _panzoomInstance = svgPanZoom(svg, {
            panEnabled: true,
            zoomEnabled: true,
            controlIconsEnabled: true,
            fit: true,
            center: true,
            zoomScaleSensitivity: 0.4, // Lower = slower zoom, higher = faster (default is 0.2)
        });
    }
    return _panzoomInstance;
}

function panzoomFitCenter() {
    const instance = getPanZoom();
    if (instance) {
        try {
            instance.resize();
            instance.fit();
            instance.center();
        } catch {
            // NOOP
        }
    }
}
