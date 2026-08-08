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

    it('reports ready when the map loads', () => {
        const handlers = {};
        const maplibre = {
            Map: function Map() {
                return {
                    addControl() {},
                    on(event, handler) { handlers[event] = handler; },
                    remove() {},
                    resize() {},
                    getCenter() { return { lng: 126.978, lat: 37.5665 }; },
                };
            },
            NavigationControl: function NavigationControl() {},
            GeolocateControl: function GeolocateControl() {},
        };
        const statuses = [];

        createEntryMap({ container: {}, maplibre, onStatus: value => statuses.push(value) });
        handlers.load();

        expect(statuses).toEqual(['ready']);
    });

    it('reports error when the map emits an asynchronous error', () => {
        const handlers = {};
        const maplibre = {
            Map: function Map() {
                return {
                    addControl() {},
                    on(event, handler) { handlers[event] = handler; },
                    remove() {},
                    resize() {},
                    getCenter() { return { lng: 126.978, lat: 37.5665 }; },
                };
            },
            NavigationControl: function NavigationControl() {},
            GeolocateControl: function GeolocateControl() {},
        };
        const statuses = [];

        createEntryMap({ container: {}, maplibre, onStatus: value => statuses.push(value) });
        handlers.error();

        expect(statuses).toEqual(['error']);
    });

    it('reports error and returns an empty controller when construction throws', () => {
        const statuses = [];
        const maplibre = {
            Map: function Map() { throw new Error('MapLibre unavailable'); },
            NavigationControl: function NavigationControl() {},
            GeolocateControl: function GeolocateControl() {},
        };

        const controller = createEntryMap({ container: {}, maplibre, onStatus: value => statuses.push(value) });

        expect(statuses).toEqual(['error']);
        expect(controller.getCenter()).toBeNull();
        expect(() => {
            controller.resize();
            controller.destroy();
        }).not.toThrow();
    });

    it('cleans up and reports error when control registration throws', () => {
        const remove = vi.fn();
        const statuses = [];
        const maplibre = {
            Map: function Map() {
                return {
                    addControl() { throw new Error('Control unavailable'); },
                    on() {},
                    remove,
                    resize() {},
                    getCenter() { return { lng: 126.978, lat: 37.5665 }; },
                };
            },
            NavigationControl: function NavigationControl() {},
            GeolocateControl: function GeolocateControl() {},
        };

        const controller = createEntryMap({ container: {}, maplibre, onStatus: value => statuses.push(value) });

        expect(statuses).toEqual(['error']);
        expect(remove).toHaveBeenCalledOnce();
        expect(controller.getCenter()).toBeNull();
    });
});
