import { createKakaoMapController } from './kakao-map.js';

export const ENTRY_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

const EMPTY_MAP = Object.freeze({
    provider: 'none',
    resize() {},
    getCenter() { return null; },
    setCamera(_camera) {},
    setInteractive(_enabled) {},
    resolveRegion(_center) { return Promise.reject(new Error('region-unavailable')); },
    geocodeAddress(_address) { return Promise.reject(new Error('geocode-unavailable')); },
    setPriceMarkers(_markers, _onSelect) {},
    clearPriceMarkers() {},
    destroy() {},
});

function createOpenFreeMapController({ container, maplibre, onStatus }) {
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
        map.on('load', () => onStatus('fallback'));
        map.on('error', () => onStatus('error'));
    } catch {
        try {
            map?.remove?.();
        } catch {}
        onStatus('error');
        return EMPTY_MAP;
    }

    let destroyed = false;

    function setCamera({ center, level, animate }) {
        const options = {
            center: [center.longitude, center.latitude],
            zoom: Math.max(6, Math.min(18, 19 - level)),
        };
        if (animate) map.easeTo(options);
        else map.jumpTo(options);
    }

    function setInteractive(enabled) {
        const method = enabled ? 'enable' : 'disable';
        [map.dragPan, map.scrollZoom, map.touchZoomRotate, map.doubleClickZoom]
            .forEach(handler => handler?.[method]?.());
    }

    function destroy() {
        if (destroyed) return;
        destroyed = true;
        map.remove();
    }

    return {
        provider: 'openfreemap',
        resize: () => map.resize(),
        getCenter() {
            const center = map.getCenter();
            return { longitude: center.lng, latitude: center.lat };
        },
        setCamera,
        setInteractive,
        resolveRegion: () => Promise.reject(new Error('region-unavailable')),
        geocodeAddress: () => Promise.reject(new Error('geocode-unavailable')),
        setPriceMarkers(_markers, _onSelect) {},
        clearPriceMarkers() {},
        destroy,
    };
}

export function createEntryMap({ container, maplibre, loadProvider, onStatus = () => {} }) {
    let controller = EMPTY_MAP;
    let currentProvider = 'pending';
    let resizePending = false;
    let destroyed = false;

    function createController(provider) {
        if (destroyed) {
            currentProvider = 'none';
            return EMPTY_MAP;
        }
        if (provider.provider === 'kakao') {
            try {
                return createKakaoMapController({ container, kakao: provider.kakao, onStatus });
            } catch {}
        }
        onStatus('fallback');
        return createOpenFreeMapController({ container, maplibre, onStatus });
    }

    const ready = Promise.resolve()
        .then(() => loadProvider())
        .catch(() => ({ provider: 'openfreemap', reason: 'loader-rejected' }))
        .then(provider => {
            controller = createController(provider);
            if (!destroyed) currentProvider = controller.provider;
            if (resizePending && controller !== EMPTY_MAP) {
                resizePending = false;
                controller.resize();
            }
            return controller;
        });

    return {
        get provider() { return currentProvider; },
        ready,
        resize() {
            if (controller === EMPTY_MAP) resizePending = true;
            else controller.resize();
        },
        getCenter: () => controller.getCenter(),
        setCamera: camera => ready.then(map => map.setCamera(camera)),
        setInteractive: enabled => ready.then(map => map.setInteractive(enabled)),
        resolveRegion: center => ready.then(map => map.resolveRegion(center)),
        geocodeAddress: address => ready.then(map => map.geocodeAddress(address)),
        setPriceMarkers: (markers, onSelect) => ready.then(map => map.setPriceMarkers(markers, onSelect)),
        clearPriceMarkers: () => ready.then(map => map.clearPriceMarkers()),
        destroy() {
            currentProvider = 'none';
            if (destroyed) return;
            destroyed = true;
            resizePending = false;
            controller.destroy();
            controller = EMPTY_MAP;
        },
    };
}
