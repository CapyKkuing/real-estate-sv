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
    }

    addEventListener(type, listener) {
        (this.listeners[type] ||= []).push(listener);
    }

    dispatch(type, init = {}) {
        this.listeners[type]?.forEach(listener => listener({ preventDefault() {}, ...init }));
    }

    append(...children) {
        this.children.push(...children);
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

    focus() {}
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
        'sido-select',
    ];
    const elements = Object.fromEntries(ids.map(id => [id, new FakeElement()]));
    elements['sido-select'].options = [
        { textContent: '시·도 선택', value: '' },
        { textContent: '서울특별시', value: '11' },
    ];
    const housingTrigger = new FakeElement('button');
    const mapTrigger = new FakeElement('button');
    const document = {
        body: new FakeElement('body'),
        createElement: tagName => new FakeElement(tagName),
        getElementById: id => elements[id],
        querySelectorAll(selector) {
            if (selector === '[data-entry-route="housing"]') return [housingTrigger];
            if (selector === '[data-entry-route="map"]') return [mapTrigger];
            return [];
        },
    };
    const stored = new Map();
    const location = { hash: '#home' };
    const mapConstruct = vi.fn();
    const resize = vi.fn();
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
        addEventListener() {},
    };

    return { document, elements, housingTrigger, mapConstruct, resize, stored, window };
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
});
