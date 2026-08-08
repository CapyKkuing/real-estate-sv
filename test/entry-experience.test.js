import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    getQuestionStep,
    initEntryExperience,
    nextQuestionIndex,
    previousQuestionIndex,
} from '../site/entry-experience.js';

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
        this.listeners[type]?.forEach(listener => listener({ preventDefault() {}, ...init }));
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
        'entry-home-overlay',
        'housing-question-dialog',
        'housing-question-title',
        'housing-question-body',
        'housing-question-progress',
        'housing-question-close',
        'housing-question-previous',
        'housing-question-next',
        'entry-back',
        'entry-title',
        'main-content',
        'sido-select',
    ];
    const elements = Object.fromEntries(ids.map(id => [id, new FakeElement()]));
    elements['sido-select'].options = [
        { textContent: '시·도 선택', value: '' },
        { textContent: '서울특별시', value: '11' },
    ];
    const housingTrigger = new FakeElement('button');
    const mapTrigger = new FakeElement('button');
    const platformHousingTrigger = new FakeElement('button');
    const skipLink = new FakeElement('a');
    housingTrigger.parentElement = elements['entry-home-overlay'];
    mapTrigger.parentElement = elements['entry-home-overlay'];
    platformHousingTrigger.parentElement = elements['platform-view'];
    const document = {
        body: new FakeElement('body'),
        createElement: tagName => new FakeElement(tagName),
        getElementById: id => elements[id],
        querySelector: selector => selector === '.skip-link' ? skipLink : null,
        querySelectorAll(selector) {
            if (selector === '[data-entry-route="housing"]') return [housingTrigger];
            if (selector === '[data-entry-route="map"]') return [mapTrigger];
            if (selector === '[data-platform-mode="housing"]') return [platformHousingTrigger];
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

    return {
        document,
        elements,
        housingTrigger,
        mapConstruct,
        platformHousingTrigger,
        resize,
        skipLink,
        stored,
        window,
    };
}

function findQuestionControl(harness, ariaLabel) {
    return harness.elements['housing-question-body'].children.find(element => element['aria-label'] === ariaLabel);
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
    it('keeps one map instance while switching between entry modes', () => {
        const harness = createControllerHarness();
        vi.stubGlobal('Option', function Option(textContent, value) { return { textContent, value }; });

        const controller = initEntryExperience(harness);
        controller.setMode('map');
        controller.setMode('housing');

        expect(harness.mapConstruct).toHaveBeenCalledOnce();
        expect(harness.elements['platform-view'].hidden).toBe(true);
        expect(harness.elements['housing-question-dialog'].hidden).toBe(false);
        expect(harness.document.body.dataset.entryMode).toBe('housing');
        expect(harness.resize).toHaveBeenCalledTimes(3);
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
