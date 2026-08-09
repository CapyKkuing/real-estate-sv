import { describe, expect, it, vi } from 'vitest';
import {
    createEntryScroll,
    getEntryScenes,
    getScene,
    SEOUL_CENTER,
} from '../site/entry-scroll.js';

function createHarness() {
    let callback;
    const observer = {
        disconnect: vi.fn(),
        observe: vi.fn(),
        enter(id) {
            callback([{ isIntersecting: true, target: sceneElements.find(element => element.dataset.mapScene === id) }]);
        },
    };
    const sceneElements = ['country', 'sido', 'sigungu', 'dong'].map(id => ({
        dataset: { mapScene: id },
        scrollIntoView: vi.fn(),
    }));

    return {
        observer,
        observerFactory: handler => {
            callback = handler;
            return observer;
        },
        sceneElements,
    };
}

describe('entry scroll scenes', () => {
    it('returns the fixed Seoul camera sequence', () => {
        expect(getEntryScenes()).toEqual([
            { id: 'country', camera: { center: SEOUL_CENTER, level: 13 } },
            { id: 'sido', camera: { center: SEOUL_CENTER, level: 11 } },
            { id: 'sigungu', camera: { center: SEOUL_CENTER, level: 8 } },
            { id: 'dong', camera: { center: SEOUL_CENTER, level: 6 } },
        ]);
        expect(getScene('dong')).toEqual(getEntryScenes()[3]);
        expect(getScene('unknown')).toBeNull();
    });

    it('moves once when the active scene changes', () => {
        const { observer, observerFactory, sceneElements } = createHarness();
        const mapController = { setCamera: vi.fn(), setInteractive: vi.fn() };
        const scroll = createEntryScroll({ sceneElements, mapController, observerFactory, reducedMotion: false });

        observer.enter('sido');
        observer.enter('sido');

        expect(mapController.setCamera).toHaveBeenCalledWith({
            center: SEOUL_CENTER,
            level: 11,
            animate: true,
        });
        expect(mapController.setCamera).toHaveBeenCalledOnce();
        scroll.destroy();
    });

    it('retargets the active and subsequent scroll scenes after location resolves', () => {
        const { observer, observerFactory, sceneElements } = createHarness();
        const mapController = { setCamera: vi.fn(), setInteractive: vi.fn() };
        const scroll = createEntryScroll({ sceneElements, mapController, observerFactory, reducedMotion: false });
        const center = { longitude: 126.91, latitude: 37.55 };

        scroll.setCenter(center);
        expect(mapController.setCamera).toHaveBeenLastCalledWith({ center, level: 13, animate: true });
        observer.enter('sido');
        expect(mapController.setCamera).toHaveBeenLastCalledWith({ center, level: 11, animate: true });
        scroll.destroy();
    });

    it('applies only the first scene when IntersectionObserver is unavailable', () => {
        const { sceneElements } = createHarness();
        const mapController = { setCamera: vi.fn(), setInteractive: vi.fn() };
        const scroll = createEntryScroll({ sceneElements, mapController, observerFactory: null, reducedMotion: false });

        expect(mapController.setCamera).toHaveBeenCalledWith({ center: SEOUL_CENTER, level: 13, animate: true });
        expect(mapController.setCamera).toHaveBeenCalledOnce();
        scroll.destroy();
    });

    it('scrolls to dong and applies its camera exactly once when skipped', () => {
        const { observerFactory, sceneElements } = createHarness();
        const mapController = { setCamera: vi.fn(), setInteractive: vi.fn() };
        const scroll = createEntryScroll({ sceneElements, mapController, observerFactory, reducedMotion: true });

        scroll.skip();

        expect(sceneElements[3].scrollIntoView).toHaveBeenCalledOnce();
        expect(mapController.setCamera).toHaveBeenCalledWith({ center: SEOUL_CENTER, level: 6, animate: false });
        expect(mapController.setCamera).toHaveBeenCalledOnce();
        scroll.destroy();
    });
});
