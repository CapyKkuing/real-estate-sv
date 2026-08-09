import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    getQuestionStep,
    initEntryExperience,
    nextQuestionIndex,
    previousQuestionIndex,
} from '../site/entry-experience.js';
import { SEOUL_CENTER } from '../site/entry-scroll.js';
import { SEOUL_START_REGION } from '../site/location-region.js';

const MAPO_REGION = Object.freeze({
    source: 'current',
    center: Object.freeze({ latitude: 37.55, longitude: 126.91 }),
    sidoCode: '11',
    lawdCd: '11440',
    dongName: '망원동',
    label: '서울특별시 마포구 망원동',
});

const STORED_MAPO_REGION = Object.freeze({
    source: 'current',
    sidoCode: '11',
    lawdCd: '11440',
    dongName: '망원동',
    label: '서울특별시 마포구 망원동',
});

afterEach(() => vi.unstubAllGlobals());

class FakeElement {
    constructor(tagName = 'div') {
        this.tagName = tagName;
        this.children = [];
        this.dataset = {};
        this.hidden = false;
        this.disabled = false;
        this.textContent = '';
        this.value = '';
        this.options = [];
        this.listeners = {};
        this.parentElement = null;
        this.focus = vi.fn();
    }

    addEventListener(type, listener) {
        (this.listeners[type] ||= []).push(listener);
    }

    dispatch(type, init = {}) {
        return Promise.all((this.listeners[type] || []).map(listener => listener({ preventDefault() {}, ...init })));
    }

    click() {
        return this.dispatch('click');
    }

    append(...children) {
        this.children.push(...children);
        children.forEach(child => {
            if (child instanceof FakeElement) child.parentElement = this;
        });
        if (this.tagName === 'select') this.options.push(...children);
    }

    appendChild(child) {
        this.append(child);
    }

    replaceChildren(...children) {
        this.children = children;
    }

    setAttribute(name, value) {
        this[name] = value;
    }

    closest(selector) {
        if (selector !== '[hidden]') return null;
        for (let element = this; element; element = element.parentElement) {
            if (element.hidden) return element;
        }
        return null;
    }
}

function createControllerHarness() {
    const ids = [
        'entry-view',
        'platform-view',
        'entry-map',
        'entry-map-status',
        'entry-use-location',
        'entry-location-status',
        'entry-change-region',
        'entry-scenes',
        'entry-home-overlay',
        'housing-question-dialog',
        'housing-question-title',
        'housing-question-body',
        'housing-question-progress',
        'housing-question-close',
        'housing-question-previous',
        'housing-question-next',
        'entry-back',
        'entry-skip-dong',
        'entry-title',
        'main-content',
        'sido-select',
    ];
    const elements = Object.fromEntries(ids.map(id => [id, new FakeElement()]));
    elements['entry-change-region'].hidden = true;
    elements['sido-select'].options = [
        { textContent: '시·도 선택', value: '' },
        { textContent: '서울특별시', value: '11' },
    ];
    const housingTrigger = new FakeElement('button');
    const mapTrigger = new FakeElement('button');
    const platformHousingTrigger = new FakeElement('button');
    const platformMapTrigger = new FakeElement('button');
    const sceneElements = ['country', 'sido', 'sigungu', 'dong'].map(id => {
        const element = new FakeElement('section');
        element.dataset.mapScene = id;
        return element;
    });
    const skipLink = new FakeElement('a');
    housingTrigger.parentElement = elements['entry-home-overlay'];
    mapTrigger.parentElement = elements['entry-home-overlay'];
    platformHousingTrigger.parentElement = elements['platform-view'];
    platformMapTrigger.parentElement = elements['platform-view'];
    const document = {
        body: new FakeElement('body'),
        createElement: tagName => new FakeElement(tagName),
        getElementById: id => elements[id],
        querySelector: selector => selector === '.skip-link' ? skipLink : null,
        querySelectorAll(selector) {
            if (selector === '[data-entry-route="housing"]') return [housingTrigger];
            if (selector === '[data-entry-route="map"]') return [mapTrigger];
            if (selector === '[data-platform-mode="housing"]') return [platformHousingTrigger];
            if (selector === '[data-platform-mode="map"]') return [platformMapTrigger];
            if (selector === '[data-map-scene]') return sceneElements;
            return [];
        },
    };
    const stored = new Map();
    const location = { hash: '#home' };
    const mapConstruct = vi.fn();
    const resize = vi.fn();
    const windowListeners = {};
    const window = {
        location,
        history: {
            pushState(_state, _title, hash) {
                location.hash = hash;
            },
        },
        localStorage: {
            getItem: key => stored.get(key) ?? null,
            setItem: (key, value) => stored.set(key, value),
        },
        maplibregl: {
            Map: function EntryMap() {
                mapConstruct();
                return {
                    addControl() {},
                    on() {},
                    resize,
                    easeTo() {},
                    jumpTo() {},
                    remove() {},
                    getCenter: () => ({ lng: 126.978, lat: 37.5665 }),
                };
            },
            NavigationControl: function NavigationControl() {},
            GeolocateControl: function GeolocateControl() {},
        },
        addEventListener(type, listener) {
            (windowListeners[type] ||= []).push(listener);
        },
        dispatch(type) {
            windowListeners[type]?.forEach(listener => listener());
        },
    };
    const loadProvider = vi.fn().mockResolvedValue({ provider: 'openfreemap' });

    return {
        document,
        elements,
        housingTrigger,
        loadProvider,
        mapConstruct,
        mapTrigger,
        platformHousingTrigger,
        platformMapTrigger,
        resize,
        skipLink,
        sceneElements,
        stored,
        window,
    };
}

function findQuestionControl(harness, ariaLabel) {
    return harness.elements['housing-question-body'].children.find(element => element['aria-label'] === ariaLabel);
}

function readStoredProfile(harness) {
    return JSON.parse(harness.stored.get('jipgilHousingProfile.v1'));
}

describe('entry experience question navigation', () => {
    const questions = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

    it('returns a one-based progress contract', () => {
        expect(getQuestionStep(1, questions)).toEqual({ index: 1, current: 2, total: 3, question: questions[1] });
    });

    it('clamps next and previous navigation', () => {
        expect(nextQuestionIndex(2, 3)).toBe(2);
        expect(nextQuestionIndex(0, 3)).toBe(1);
        expect(previousQuestionIndex(0)).toBe(0);
        expect(previousQuestionIndex(2)).toBe(1);
    });
});

describe('entry experience controller', () => {
    it('hands the selected region to both transaction entry paths without persisting coordinates', async () => {
        const harness = createControllerHarness();
        const onRegionChange = vi.fn();
        const onOpenTransaction = vi.fn();
        const experience = initEntryExperience({ ...harness, onRegionChange, onOpenTransaction });

        experience.setRegion(MAPO_REGION);
        await harness.mapTrigger.click();
        await harness.platformMapTrigger.click();

        expect(onRegionChange).toHaveBeenLastCalledWith(STORED_MAPO_REGION);
        expect(onOpenTransaction).toHaveBeenNthCalledWith(1, MAPO_REGION);
        expect(onOpenTransaction).toHaveBeenNthCalledWith(2, MAPO_REGION);
        expect(experience.getRegion()).toBe(MAPO_REGION);
    });

    it('keeps the derived selected region when a later housing answer is saved', async () => {
        const harness = createControllerHarness();
        vi.stubGlobal('Option', function Option(textContent, value) { return { textContent, value }; });
        const experience = initEntryExperience({ ...harness, onRegionChange: vi.fn() });

        experience.setRegion(MAPO_REGION);
        await harness.housingTrigger.click();
        await harness.elements['housing-question-next'].click();
        const firstHouseholdChoice = harness.elements['housing-question-body'].children[0].children[1].children[0];
        await firstHouseholdChoice.dispatch('change');

        expect(readStoredProfile(harness).answers).toMatchObject({
            preferredRegion: STORED_MAPO_REGION,
            householdType: '1인',
        });
    });

    it('does not auto-query an arbitrary district for Seoul fallback', async () => {
        const harness = createControllerHarness();
        const onOpenTransaction = vi.fn();
        const fetchClick = vi.fn();
        harness.elements['fetch-live-btn'] = { click: fetchClick };
        const experience = initEntryExperience({ ...harness, onOpenTransaction });

        experience.setRegion(SEOUL_START_REGION);
        await harness.mapTrigger.click();

        expect(onOpenTransaction).toHaveBeenCalledWith(expect.objectContaining({ sidoCode: '11', lawdCd: null }));
        expect(fetchClick).not.toHaveBeenCalled();
    });

    it('does not request location until the explicit start action', async () => {
        const harness = createControllerHarness();
        const center = { latitude: 37.55, longitude: 126.91 };
        let resolveLocation;
        const geolocation = {
            getCurrentPosition: vi.fn(success => { resolveLocation = success; }),
        };
        const mapController = {
            destroy: vi.fn(),
            getCenter: vi.fn(() => center),
            resize: vi.fn(),
            resolveRegion: vi.fn().mockResolvedValue({
                sidoCode: '11', lawdCd: '11440', dongName: '망원동', label: '망원동',
            }),
        };
        const entryScroll = { destroy: vi.fn(), setCenter: vi.fn(), skip: vi.fn() };
        const onRegionChange = vi.fn();

        const experience = initEntryExperience({ ...harness, geolocation, mapController, entryScroll, onRegionChange });

        expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
        const click = harness.elements['entry-use-location'].click();

        expect(geolocation.getCurrentPosition).toHaveBeenCalledOnce();
        expect(harness.elements['entry-use-location'].disabled).toBe(true);
        resolveLocation({ coords: center });
        await click;

        expect(entryScroll.setCenter).toHaveBeenCalledWith(center);
        expect(onRegionChange).toHaveBeenCalledWith({
            source: 'current',
            sidoCode: '11',
            lawdCd: '11440',
            dongName: '망원동',
            label: '망원동',
        });
        expect(harness.elements['entry-use-location'].disabled).toBe(false);
        expect(harness.elements['entry-location-status'].textContent).toContain('망원동에서 시작합니다');
        expect(harness.elements['entry-location-status'].textContent).toContain('카카오에 전송');
        expect(harness.elements['entry-location-status'].textContent).toContain('저장되지 않습니다');
        expect(harness.elements['entry-change-region'].hidden).toBe(true);
        experience.destroy();
    });

    it('ignores a pending location completion after the experience is destroyed', async () => {
        const harness = createControllerHarness();
        const center = { latitude: 37.55, longitude: 126.91 };
        let resolveLocation;
        const geolocation = {
            getCurrentPosition: vi.fn(success => { resolveLocation = success; }),
        };
        const mapController = {
            destroy: vi.fn(),
            getCenter: vi.fn(() => center),
            resize: vi.fn(),
            resolveRegion: vi.fn().mockResolvedValue({
                sidoCode: '11', lawdCd: '11440', dongName: '망원동', label: '망원동',
            }),
        };
        const entryScroll = { destroy: vi.fn(), setCenter: vi.fn(), skip: vi.fn() };
        const experience = initEntryExperience({ ...harness, geolocation, mapController, entryScroll });
        const request = harness.elements['entry-use-location'].click();

        expect(harness.elements['entry-use-location'].disabled).toBe(true);
        experience.destroy();
        const statusBeforeCompletion = harness.elements['entry-location-status'].textContent;
        resolveLocation({ coords: center });
        await request;

        expect(entryScroll.setCenter).not.toHaveBeenCalled();
        expect(harness.elements['entry-location-status'].textContent).toBe(statusBeforeCompletion);
        expect(harness.elements['entry-use-location'].disabled).toBe(true);
    });

    it('falls back to Seoul and opens manual region selection without another location request', async () => {
        const harness = createControllerHarness();
        const geolocation = {
            getCurrentPosition: vi.fn((_success, failure) => failure(new Error('denied'))),
        };
        const mapController = {
            destroy: vi.fn(),
            getCenter: vi.fn(() => SEOUL_CENTER),
            resize: vi.fn(),
            resolveRegion: vi.fn(),
        };
        const entryScroll = { destroy: vi.fn(), setCenter: vi.fn(), skip: vi.fn() };
        const onRegionChange = vi.fn();
        initEntryExperience({ ...harness, geolocation, mapController, entryScroll, onRegionChange });

        await harness.elements['entry-use-location'].click();

        expect(entryScroll.setCenter).toHaveBeenCalledWith(SEOUL_CENTER);
        expect(onRegionChange).toHaveBeenCalledWith({
            source: 'seoul',
            sidoCode: '11',
            lawdCd: null,
            dongName: '',
            label: '서울특별시',
        });
        expect(harness.elements['entry-location-status'].textContent).toContain('현재 위치를 확인하지 못해 서울에서 시작합니다');
        expect(harness.elements['entry-change-region'].hidden).toBe(false);
        await harness.elements['entry-change-region'].click();
        expect(harness.document.body.dataset.entryMode).toBe('map');
        expect(geolocation.getCurrentPosition).toHaveBeenCalledOnce();
    });

    it('continues the Seoul fallback UI when region persistence throws', async () => {
        const harness = createControllerHarness();
        const geolocation = {
            getCurrentPosition: vi.fn((_success, failure) => failure(new Error('denied'))),
        };
        const mapController = {
            destroy: vi.fn(),
            getCenter: vi.fn(() => SEOUL_CENTER),
            resize: vi.fn(),
            resolveRegion: vi.fn(),
        };
        const entryScroll = { destroy: vi.fn(), setCenter: vi.fn(), skip: vi.fn() };
        const onRegionChange = vi.fn(() => { throw new Error('storage unavailable'); });
        initEntryExperience({ ...harness, geolocation, mapController, entryScroll, onRegionChange });

        await expect(harness.elements['entry-use-location'].click()).resolves.toEqual([undefined]);

        expect(entryScroll.setCenter).toHaveBeenCalledWith(SEOUL_CENTER);
        expect(harness.elements['entry-location-status'].textContent).toContain('현재 위치를 확인하지 못해 서울에서 시작합니다');
        expect(harness.elements['entry-change-region'].hidden).toBe(false);
        expect(harness.elements['entry-use-location'].disabled).toBe(false);
    });

    it('stores the resolved housing region label without coordinates', async () => {
        const harness = createControllerHarness();
        const center = { latitude: 37.55, longitude: 126.91 };
        const mapController = {
            destroy: vi.fn(),
            getCenter: vi.fn(() => center),
            resize: vi.fn(),
            resolveRegion: vi.fn().mockResolvedValue({
                sidoCode: '11', lawdCd: '11440', dongName: '망원동', label: '',
            }),
        };
        const entryScroll = { destroy: vi.fn(), setCenter: vi.fn(), skip: vi.fn() };
        vi.stubGlobal('Option', function Option(textContent, value) { return { textContent, value }; });
        initEntryExperience({ ...harness, mapController, entryScroll });

        await harness.housingTrigger.click();
        await harness.elements['housing-question-body'].children[0].click();

        expect(mapController.resolveRegion).toHaveBeenCalledWith(center);
        expect(readStoredProfile(harness).answers.preferredRegion).toBe('text:망원동');
        expect(JSON.stringify(readStoredProfile(harness))).not.toContain('map:');
        expect(JSON.stringify(readStoredProfile(harness))).not.toContain('126.91');
        expect(JSON.stringify(readStoredProfile(harness))).not.toContain('37.55');
    });

    it('keeps the question title focused after pointer navigation advances a question', async () => {
        const harness = createControllerHarness();
        const mapController = {
            destroy: vi.fn(),
            getCenter: vi.fn(() => ({ latitude: 37.55, longitude: 126.91 })),
            resize: vi.fn(),
            setCamera: vi.fn(),
            resolveRegion: vi.fn().mockResolvedValue({ label: '마포구' }),
        };
        vi.stubGlobal('Option', function Option(textContent, value) { return { textContent, value }; });
        initEntryExperience({ ...harness, mapController });

        await harness.housingTrigger.click();
        harness.elements['housing-question-title'].focus.mockClear();
        await harness.elements['housing-question-body'].children[0].click();
        await harness.elements['housing-question-next'].click();

        expect(harness.elements['housing-question-title'].focus).toHaveBeenLastCalledWith({ preventScroll: true });
    });

    it('hides scroll scenes and skip controls outside home mode', () => {
        const harness = createControllerHarness();
        vi.stubGlobal('Option', function Option(textContent, value) { return { textContent, value }; });
        const controller = initEntryExperience(harness);

        controller.setMode('map');
        expect(harness.elements['entry-scenes'].hidden).toBe(true);
        expect(harness.elements['entry-skip-dong'].hidden).toBe(true);

        controller.setMode('housing');
        expect(harness.elements['entry-scenes'].hidden).toBe(true);
        expect(harness.elements['entry-skip-dong'].hidden).toBe(true);

        controller.setMode('home');
        expect(harness.elements['entry-scenes'].hidden).toBe(false);
        expect(harness.elements['entry-skip-dong'].hidden).toBe(false);
    });

    it('initializes and tears down the entry scroll controller', () => {
        const harness = createControllerHarness();
        const destroy = vi.fn();
        const skip = vi.fn();
        const createScroll = vi.fn(() => ({ destroy, skip }));

        const experience = initEntryExperience({ ...harness, createScroll });

        expect(createScroll).toHaveBeenCalledWith(expect.objectContaining({
            sceneElements: harness.sceneElements,
            reducedMotion: false,
        }));
        harness.elements['entry-skip-dong'].dispatch('click');
        expect(skip).toHaveBeenCalledOnce();
        experience.destroy();
        expect(destroy).toHaveBeenCalledOnce();
    });

    it('keeps one map instance while switching between entry modes', async () => {
        const harness = createControllerHarness();
        vi.stubGlobal('Option', function Option(textContent, value) { return { textContent, value }; });

        const controller = initEntryExperience(harness);
        controller.setMode('map');
        controller.setMode('housing');
        await vi.waitFor(() => expect(harness.mapConstruct).toHaveBeenCalledOnce());

        expect(harness.elements['platform-view'].hidden).toBe(true);
        expect(harness.elements['housing-question-dialog'].hidden).toBe(false);
        expect(harness.document.body.dataset.entryMode).toBe('housing');
        expect(harness.resize).toHaveBeenCalledOnce();
    });

    it('injects the Task 1 loader and announces fallback without making init async', async () => {
        const harness = createControllerHarness();
        const loadProvider = vi.fn().mockRejectedValue(new Error('sdk failed'));

        const experience = initEntryExperience({ ...harness, loadProvider });
        expect(experience).toMatchObject({ setMode: expect.any(Function), destroy: expect.any(Function) });
        await vi.waitFor(() => {
            expect(loadProvider).toHaveBeenCalledWith({ document: harness.document, window: harness.window });
            expect(harness.elements['entry-map-status'].textContent).toBe('기본 지도로 표시 중');
        });
    });

    it('saves answers through all seven questions and closes on completion', () => {
        const harness = createControllerHarness();
        vi.stubGlobal('Option', function Option(textContent, value) { return { textContent, value }; });
        initEntryExperience(harness);

        harness.housingTrigger.dispatch('click');
        const questionBody = harness.elements['housing-question-body'];
        const next = harness.elements['housing-question-next'];
        const directRegion = questionBody.children[2];
        directRegion.value = '마포구';
        directRegion.dispatch('change');
        next.dispatch('click');

        for (let question = 1; question < 7; question += 1) {
            const firstRadio = questionBody.children[0].children[1].children[0];
            firstRadio.dispatch('change');
            next.dispatch('click');
        }

        const profile = JSON.parse([...harness.stored.values()][0]);
        expect(Object.keys(profile.answers)).toHaveLength(7);
        expect(profile.answers.preferredRegion).toBe('text:마포구');
        expect(harness.elements['housing-question-dialog'].hidden).toBe(true);
        expect(harness.elements['entry-home-overlay'].hidden).toBe(false);
    });

    it('restores a persisted preferred-region selection when housing opens', () => {
        const harness = createControllerHarness();
        vi.stubGlobal('Option', function Option(textContent, value) { return { textContent, value }; });
        harness.window.location.hash = '#housing';
        harness.stored.set('jipgilHousingProfile.v1', JSON.stringify({
            version: 1,
            answers: { preferredRegion: 'sido:11' },
            updatedAt: '2026-08-08T09:00:00.000Z',
        }));

        initEntryExperience(harness);

        expect(findQuestionControl(harness, '광역 지역 선택').value).toBe('11');
        expect(harness.elements['housing-question-next'].disabled).toBe(false);
    });

    it('restores a persisted direct preferred-region answer when housing opens', () => {
        const harness = createControllerHarness();
        vi.stubGlobal('Option', function Option(textContent, value) { return { textContent, value }; });
        harness.window.location.hash = '#housing';
        harness.stored.set('jipgilHousingProfile.v1', JSON.stringify({
            version: 1,
            answers: { preferredRegion: 'text:마포구' },
            updatedAt: '2026-08-08T09:00:00.000Z',
        }));

        initEntryExperience(harness);

        expect(findQuestionControl(harness, '원하는 지역명 직접 입력').value).toBe('마포구');
        expect(harness.elements['housing-question-next'].disabled).toBe(false);
    });

    it('keeps preferred-region controls and persistence consistent when switching or clearing', () => {
        const harness = createControllerHarness();
        vi.stubGlobal('Option', function Option(textContent, value) { return { textContent, value }; });
        harness.window.location.hash = '#housing';
        initEntryExperience(harness);

        const regionSelect = findQuestionControl(harness, '광역 지역 선택');
        const directRegion = findQuestionControl(harness, '원하는 지역명 직접 입력');
        const next = harness.elements['housing-question-next'];

        regionSelect.value = '11';
        regionSelect.dispatch('change');
        expect(readStoredProfile(harness).answers.preferredRegion).toBe('sido:11');

        directRegion.value = '마포구';
        directRegion.dispatch('change');
        expect(regionSelect.value).toBe('');
        expect(readStoredProfile(harness).answers.preferredRegion).toBe('text:마포구');

        directRegion.value = '';
        directRegion.dispatch('change');
        expect(readStoredProfile(harness).answers).not.toHaveProperty('preferredRegion');
        expect(next.disabled).toBe(true);

        regionSelect.value = '11';
        regionSelect.dispatch('change');
        regionSelect.value = '';
        regionSelect.dispatch('change');
        expect(readStoredProfile(harness).answers).not.toHaveProperty('preferredRegion');
        expect(next.disabled).toBe(true);
    });

    it('moves the skip link and focus to the visible map and home targets', () => {
        const harness = createControllerHarness();
        const controller = initEntryExperience(harness);
        harness.elements['entry-title'].focus.mockClear();

        controller.setMode('map');
        expect(harness.skipLink.href).toBe('#main-content');
        expect(harness.elements['main-content']['tabindex']).toBe('-1');
        expect(harness.elements['main-content'].focus).toHaveBeenCalledWith({ preventScroll: true });

        controller.setMode('home');
        expect(harness.skipLink.href).toBe('#entry-main');
        expect(harness.elements['entry-title']['tabindex']).toBe('-1');
        expect(harness.elements['entry-title'].focus).toHaveBeenCalledWith({ preventScroll: true });
    });

    it('restores a visible housing trigger after Escape closes the dialog', () => {
        const harness = createControllerHarness();
        vi.stubGlobal('Option', function Option(textContent, value) { return { textContent, value }; });
        let overlayHiddenWhenFocused = null;
        harness.housingTrigger.focus.mockImplementation(() => {
            overlayHiddenWhenFocused = harness.elements['entry-home-overlay'].hidden;
        });
        initEntryExperience(harness);

        harness.housingTrigger.dispatch('click');
        expect(harness.skipLink.href).toBe('#entry-main');
        expect(harness.elements['housing-question-close'].focus).toHaveBeenCalledWith({ preventScroll: true });
        harness.elements['housing-question-dialog'].dispatch('keydown', { key: 'Escape' });

        expect(harness.elements['housing-question-dialog'].hidden).toBe(true);
        expect(harness.housingTrigger.focus).toHaveBeenCalledWith({ preventScroll: true });
        expect(overlayHiddenWhenFocused).toBe(false);
    });

    it('does not restore a trigger hidden by closing the housing dialog', () => {
        const harness = createControllerHarness();
        vi.stubGlobal('Option', function Option(textContent, value) { return { textContent, value }; });
        const controller = initEntryExperience(harness);
        controller.setMode('map');

        harness.platformHousingTrigger.dispatch('click');
        harness.elements['entry-title'].focus.mockClear();
        harness.elements['housing-question-dialog'].dispatch('keydown', { key: 'Escape' });

        expect(harness.platformHousingTrigger.focus).not.toHaveBeenCalled();
        expect(harness.elements['entry-title'].focus).toHaveBeenCalledWith({ preventScroll: true });
    });

    it('focuses the visible target after popstate navigation', () => {
        const harness = createControllerHarness();
        initEntryExperience(harness);
        harness.elements['entry-title'].focus.mockClear();

        harness.window.location.hash = '#map';
        harness.window.dispatch('popstate');
        expect(harness.skipLink.href).toBe('#main-content');
        expect(harness.elements['main-content'].focus).toHaveBeenCalledWith({ preventScroll: true });

        harness.window.location.hash = '#home';
        harness.window.dispatch('popstate');
        expect(harness.skipLink.href).toBe('#entry-main');
        expect(harness.elements['entry-title'].focus).toHaveBeenCalledWith({ preventScroll: true });
    });
});
