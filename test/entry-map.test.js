import { describe, expect, it, vi } from 'vitest';
import { ENTRY_MAP_STYLE_URL, createEntryMap } from '../site/entry-map.js';

describe('entry map adapter', () => {
    it('creates one Seoul-centered map with required controls and attribution', () => {
        const addControl = vi.fn();
        const on = vi.fn();
        const remove = vi.fn();
        const resize = vi.fn();
        const Map = vi.fn(function Map() {
            return {
                addControl,
                on,
                remove,
                resize,
                getCenter: () => ({ lng: 126.978, lat: 37.5665 }),
            };
        });
        const maplibre = {
            Map,
            NavigationControl: vi.fn(function NavigationControl() { return { type: 'navigation' }; }),
            GeolocateControl: vi.fn(function GeolocateControl() { return { type: 'geolocate' }; }),
        };

        const controller = createEntryMap({ container: { id: 'entry-map' }, maplibre });

        expect(Map).toHaveBeenCalledWith(expect.objectContaining({
            style: ENTRY_MAP_STYLE_URL,
            center: [126.978, 37.5665],
            zoom: 10,
            attributionControl: true,
        }));
        expect(addControl).toHaveBeenCalledTimes(2);
        expect(controller.getCenter()).toEqual({ longitude: 126.978, latitude: 37.5665 });
        controller.resize();
        controller.destroy();
        expect(resize).toHaveBeenCalledOnce();
        expect(remove).toHaveBeenCalledOnce();
    });

    it('reports an unavailable runtime without throwing', () => {
        const statuses = [];
        const controller = createEntryMap({ container: {}, maplibre: undefined, onStatus: value => statuses.push(value) });

        expect(statuses).toEqual(['unavailable']);
        expect(controller.getCenter()).toBeNull();
    });
});
