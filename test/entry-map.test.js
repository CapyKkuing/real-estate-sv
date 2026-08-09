import { describe, expect, it, vi } from 'vitest';
import { ENTRY_MAP_STYLE_URL, createEntryMap } from '../site/entry-map.js';

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function createMapLibreFake(overrides = {}) {
    const handlers = {};
    const map = {
        addControl: vi.fn(),
        on: vi.fn((event, handler) => { handlers[event] = handler; }),
        remove: overrides.remove || vi.fn(),
        resize: overrides.resize || vi.fn(),
        getCenter: vi.fn(() => ({ lng: 126.978, lat: 37.5665 })),
        easeTo: vi.fn(),
        jumpTo: vi.fn(),
        dragPan: { enable: vi.fn(), disable: vi.fn() },
        scrollZoom: { enable: vi.fn(), disable: vi.fn() },
        touchZoomRotate: { enable: vi.fn(), disable: vi.fn() },
        doubleClickZoom: { enable: vi.fn(), disable: vi.fn() },
    };
    return {
        map,
        handlers,
        Map: vi.fn(function Map() { return map; }),
        NavigationControl: vi.fn(function NavigationControl() { return { type: 'navigation' }; }),
        GeolocateControl: vi.fn(function GeolocateControl() { return { type: 'geolocate' }; }),
    };
}

describe('entry map adapter', () => {
    it('creates one Seoul-centered OpenFreeMap with required controls and attribution', async () => {
        const maplibre = createMapLibreFake();
        const facade = createEntryMap({
            container: { id: 'entry-map' },
            maplibre,
            loadProvider: vi.fn().mockResolvedValue({ provider: 'openfreemap' }),
        });

        expect(facade.provider).toBe('pending');
        await expect(facade.ready).resolves.toMatchObject({ provider: 'openfreemap' });
        expect(maplibre.Map).toHaveBeenCalledWith(expect.objectContaining({
            style: ENTRY_MAP_STYLE_URL,
            center: [126.978, 37.5665],
            zoom: 10,
            attributionControl: true,
        }));
        expect(maplibre.map.addControl).toHaveBeenCalledTimes(2);
        expect(facade.getCenter()).toEqual({ longitude: 126.978, latitude: 37.5665 });
    });

    it('uses exact OpenFreeMap camera and interaction controls while marker methods stay no-ops', async () => {
        const maplibre = createMapLibreFake();
        const facade = createEntryMap({
            container: {},
            maplibre,
            loadProvider: vi.fn().mockResolvedValue({ provider: 'openfreemap' }),
        });
        await facade.ready;

        await facade.setCamera({ center: { longitude: 126.91, latitude: 37.55 }, level: 5, animate: true });
        await facade.setCamera({ center: { longitude: 127.1, latitude: 37.4 }, level: 20, animate: false });
        expect(maplibre.map.easeTo).toHaveBeenCalledWith({ center: [126.91, 37.55], zoom: 14 });
        expect(maplibre.map.jumpTo).toHaveBeenCalledWith({ center: [127.1, 37.4], zoom: 6 });

        await facade.setInteractive(false);
        await facade.setInteractive(true);
        for (const handler of [maplibre.map.dragPan, maplibre.map.scrollZoom, maplibre.map.touchZoomRotate, maplibre.map.doubleClickZoom]) {
            expect(handler.disable).toHaveBeenCalledOnce();
            expect(handler.enable).toHaveBeenCalledOnce();
        }
        await expect(facade.setPriceMarkers([], vi.fn())).resolves.toBeUndefined();
        await expect(facade.clearPriceMarkers()).resolves.toBeUndefined();
    });

    it('keeps the fallback notice when OpenFreeMap loads', async () => {
        const statuses = [];
        const maplibre = createMapLibreFake();
        const facade = createEntryMap({
            container: {},
            maplibre,
            loadProvider: vi.fn().mockResolvedValue({ provider: 'openfreemap' }),
            onStatus: value => statuses.push(value),
        });

        await facade.ready;
        maplibre.handlers.load();
        expect(statuses).toEqual(['fallback', 'fallback']);
    });

    it('exposes the resolved provider and replays a pre-ready resize', async () => {
        const pending = deferred();
        const resize = vi.fn();
        const facade = createEntryMap({
            container: {},
            maplibre: createMapLibreFake({ resize }),
            loadProvider: () => pending.promise,
        });

        expect(facade.provider).toBe('pending');
        facade.resize();
        pending.resolve({ provider: 'openfreemap' });
        await expect(facade.ready).resolves.toMatchObject({ provider: 'openfreemap' });
        expect(facade.provider).toBe('openfreemap');
        expect(resize).toHaveBeenCalledOnce();
    });

    it('falls back when the injected loader rejects', async () => {
        const facade = createEntryMap({
            container: {},
            maplibre: createMapLibreFake(),
            loadProvider: vi.fn().mockRejectedValue(new Error('sdk failed')),
        });

        await expect(facade.ready).resolves.toMatchObject({ provider: 'openfreemap' });
        expect(facade.provider).toBe('openfreemap');
    });

    it('falls back when the injected loader throws synchronously', async () => {
        const facade = createEntryMap({
            container: {},
            maplibre: createMapLibreFake(),
            loadProvider: vi.fn(() => { throw new Error('sdk failed'); }),
        });

        await expect(facade.ready).resolves.toMatchObject({ provider: 'openfreemap' });
        expect(facade.provider).toBe('openfreemap');
    });

    it('falls back when Kakao controller construction fails', async () => {
        const maplibre = createMapLibreFake();
        const kakao = {
            maps: {
                Map: vi.fn(() => { throw new Error('Kakao unavailable'); }),
                LatLng: vi.fn(),
                services: { Geocoder: vi.fn(), Status: { OK: 'OK' } },
                event: { clearInstance: vi.fn() },
            },
        };
        const facade = createEntryMap({
            container: {},
            maplibre,
            loadProvider: vi.fn().mockResolvedValue({ provider: 'kakao', kakao }),
        });

        await expect(facade.ready).resolves.toMatchObject({ provider: 'openfreemap' });
        expect(maplibre.Map).toHaveBeenCalledOnce();
    });

    it('does not leave a late map alive after destroy before readiness', async () => {
        const pending = deferred();
        const maplibre = createMapLibreFake();
        const facade = createEntryMap({
            container: {},
            maplibre,
            loadProvider: () => pending.promise,
        });

        facade.destroy();
        expect(facade.provider).toBe('none');
        pending.resolve({ provider: 'openfreemap' });
        await expect(facade.ready).resolves.toMatchObject({ provider: 'none' });
        expect(maplibre.Map).not.toHaveBeenCalled();
        expect(facade.getCenter()).toBeNull();
    });

    it('keeps the readiness result but clears current provider after destroy', async () => {
        const remove = vi.fn();
        const facade = createEntryMap({
            container: {},
            maplibre: createMapLibreFake({ remove }),
            loadProvider: vi.fn().mockResolvedValue({ provider: 'openfreemap' }),
        });

        const resolved = await facade.ready;
        expect(resolved.provider).toBe('openfreemap');
        expect(facade.provider).toBe('openfreemap');
        facade.destroy();
        facade.destroy();
        expect(facade.provider).toBe('none');
        await expect(facade.ready).resolves.toBe(resolved);
        expect(remove).toHaveBeenCalledOnce();
    });

    it('provides the complete empty-map contract when OpenFreeMap is unavailable', async () => {
        const statuses = [];
        const facade = createEntryMap({
            container: {},
            maplibre: undefined,
            loadProvider: vi.fn().mockResolvedValue({ provider: 'openfreemap' }),
            onStatus: value => statuses.push(value),
        });

        await expect(facade.ready).resolves.toMatchObject({ provider: 'none' });
        expect(facade.provider).toBe('none');
        expect(facade.getCenter()).toBeNull();
        expect(() => facade.resize()).not.toThrow();
        await expect(facade.setCamera({ center: { longitude: 0, latitude: 0 }, level: 10, animate: false })).resolves.toBeUndefined();
        await expect(facade.setInteractive(false)).resolves.toBeUndefined();
        await expect(facade.setPriceMarkers([], vi.fn())).resolves.toBeUndefined();
        await expect(facade.clearPriceMarkers()).resolves.toBeUndefined();
        await expect(facade.resolveRegion({ longitude: 0, latitude: 0 })).rejects.toThrow('region-unavailable');
        await expect(facade.geocodeAddress('없는 주소')).rejects.toThrow('geocode-unavailable');
        expect(() => {
            facade.destroy();
            facade.destroy();
        }).not.toThrow();
        expect(statuses).toEqual(['fallback', 'unavailable']);
    });
});
