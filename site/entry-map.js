export const ENTRY_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

const EMPTY_MAP = Object.freeze({
    resize() {},
    getCenter() { return null; },
    destroy() {},
});

export function createEntryMap({ container, maplibre, onStatus = () => {} }) {
    if (!container || !maplibre?.Map) {
        onStatus('unavailable');
        return EMPTY_MAP;
    }

    let map;
    try {
        map = new maplibre.Map({
            container,
            style: ENTRY_MAP_STYLE_URL,
            center: [126.978, 37.5665],
            zoom: 10,
            minZoom: 6,
            maxZoom: 18,
            attributionControl: true,
        });

        map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
        map.addControl(new maplibre.GeolocateControl({ positionOptions: { enableHighAccuracy: false }, trackUserLocation: false }), 'top-right');
        map.on('load', () => onStatus('ready'));
        map.on('error', () => onStatus('error'));
    } catch {
        try {
            map?.remove?.();
        } catch {}
        onStatus('error');
        return EMPTY_MAP;
    }

    return {
        resize: () => map.resize(),
        getCenter() {
            const center = map.getCenter();
            return { longitude: center.lng, latitude: center.lat };
        },
        destroy: () => map.remove(),
    };
}
