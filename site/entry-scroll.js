export const SEOUL_CENTER = Object.freeze({ longitude: 126.978, latitude: 37.5665 });
export const ENTRY_SCENE_IDS = Object.freeze(['country', 'sido', 'sigungu', 'dong']);

const SCENE_LEVELS = Object.freeze({ country: 13, sido: 11, sigungu: 8, dong: 6 });

export function getEntryScenes() {
    return ENTRY_SCENE_IDS.map(id => ({
        id,
        camera: { center: SEOUL_CENTER, level: SCENE_LEVELS[id] },
    }));
}

export function getScene(id) {
    return getEntryScenes().find(scene => scene.id === id) ?? null;
}

export function createEntryScroll({ sceneElements, mapController, observerFactory, reducedMotion, onSceneChange }) {
    let activeId = null;
    let observer = null;
    const elements = [...(sceneElements ?? [])];

    function applyScene(id) {
        const scene = getScene(id);
        if (!scene || activeId === id) return;

        activeId = id;
        mapController.setCamera({ ...scene.camera, animate: !reducedMotion });
        onSceneChange?.(scene);
    }

    if (observerFactory) {
        observer = observerFactory(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) applyScene(entry.target.dataset.mapScene);
            });
        }, { threshold: 0.5 });
        elements.forEach(element => observer.observe(element));
    } else {
        applyScene(elements[0]?.dataset.mapScene);
    }

    return {
        skip() {
            const dongElement = elements.find(element => element.dataset.mapScene === 'dong');
            dongElement?.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
            applyScene('dong');
        },
        destroy() {
            observer?.disconnect();
            observer = null;
        },
    };
}
