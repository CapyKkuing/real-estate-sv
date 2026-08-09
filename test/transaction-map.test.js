import { describe, expect, it, vi } from 'vitest';
import {
    applyEntryRegion,
    createTransactionMapPanel,
    getCurrentTransactionPage,
    publishTransactionMap,
    subscribeTransactionMap,
} from '../site/transaction-map.js';

class TestElement {
    constructor(document, tagName = 'div') {
        this.document = document;
        this.tagName = tagName;
        this.children = [];
        this.attributes = new Map();
        this.listeners = new Map();
        this._textContent = '';
        this.hidden = false;
        this.className = '';
        this.classList = {
            toggle: (name, enabled) => {
                const names = new Set(this.className.split(/\s+/).filter(Boolean));
                if (enabled) names.add(name);
                else names.delete(name);
                this.className = [...names].join(' ');
            },
        };
    }

    set id(value) {
        this.setAttribute('id', value);
    }

    get id() {
        return this.getAttribute('id') || '';
    }

    set textContent(value) {
        this.children = [];
        this._textContent = String(value);
    }

    get textContent() {
        return this.children.length
            ? this.children.map(child => child.textContent).join('')
            : this._textContent;
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
        if (name === 'id') this.document.elements.set(String(value), this);
    }

    getAttribute(name) {
        return this.attributes.get(name) || null;
    }

    append(...nodes) {
        this._textContent = '';
        this.children.push(...nodes);
    }

    replaceChildren(...nodes) {
        this._textContent = '';
        this.children = nodes;
    }

    addEventListener(type, listener) {
        this.listeners.set(type, listener);
    }

    click() {
        this.listeners.get('click')?.({ currentTarget: this });
    }

    querySelectorAll(selector) {
        return this.document.querySelectorAll(selector, this);
    }
}

class TestDocument {
    constructor() {
        this.elements = new Map();
        this.root = new TestElement(this, 'main');
    }

    createElement(tagName) {
        return new TestElement(this, tagName);
    }

    getElementById(id) {
        return this.elements.get(id) || null;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector, root = this.root) {
        const match = element => {
            const dataMatch = selector.match(/^\[data-transaction-index(?:=\"([^\"]+)\")?\]$/);
            if (dataMatch) return element.getAttribute('data-transaction-index') !== null
                && (!dataMatch[1] || element.getAttribute('data-transaction-index') === dataMatch[1]);
            return selector.startsWith('#') && element.id === selector.slice(1);
        };
        const found = [];
        const visit = element => {
            if (match(element)) found.push(element);
            element.children.forEach(visit);
        };
        visit(root);
        return found;
    }
}

function createPanelDocument() {
    const document = new TestDocument();
    const panel = document.createElement('aside');
    panel.id = 'transaction-map-panel';
    const toggle = document.createElement('button');
    toggle.id = 'transaction-map-sheet-toggle';
    const region = document.createElement('p');
    region.id = 'transaction-map-region';
    const count = document.createElement('p');
    count.id = 'transaction-map-count';
    const filters = document.createElement('div');
    filters.id = 'transaction-map-filters';
    const list = document.createElement('ul');
    list.id = 'transaction-map-list';
    panel.append(toggle, region, count, filters, list);
    document.root.append(panel);
    return document;
}

const MAPO_REGION = {
    source: 'current',
    sidoCode: '11',
    lawdCd: '11440',
    dongName: '서교동',
    label: '서울특별시 마포구 서교동',
};

const SEOUL_START_REGION = {
    source: 'seoul',
    sidoCode: '11',
    lawdCd: null,
    dongName: '',
    label: '서울특별시',
};

function createTransactionControls() {
    const controls = {
        sido: { value: '', dispatchEvent: vi.fn() },
        gugun: { value: '' },
        dong: { value: '', options: [{ value: '' }, { value: '서교동' }] },
        date: { disabled: true },
    };
    controls.sido.dispatchEvent.mockImplementation(() => {
        controls.gugun.value = '';
        controls.dong.value = '';
        controls.date.disabled = true;
    });
    return controls;
}

describe('transaction map bridge', () => {
    it('applies a full region in control order then runs the existing analysis once', async () => {
        const controls = createTransactionControls();
        const prepareDongOptions = vi.fn(async () => {
            expect(controls.sido.value).toBe('11');
            expect(controls.gugun.value).toBe('11440');
            expect(controls.date.disabled).toBe(false);
            return [];
        });
        const runAnalysis = vi.fn(() => {
            expect(controls.dong.value).toBe('서교동');
        });

        await applyEntryRegion(MAPO_REGION, { controls, prepareDongOptions, runAnalysis });

        expect(controls.sido.dispatchEvent).toHaveBeenCalledOnce();
        expect(prepareDongOptions).toHaveBeenCalledOnce();
        expect(controls.dong.value).toBe('서교동');
        expect(runAnalysis).toHaveBeenCalledOnce();
    });

    it('does not run analysis when a superseding request makes dong preparation stale', async () => {
        const controls = createTransactionControls();
        const runAnalysis = vi.fn();

        await applyEntryRegion(MAPO_REGION, {
            controls,
            prepareDongOptions: vi.fn().mockResolvedValue(null),
            runAnalysis,
        });

        expect(controls.dong.value).toBe('');
        expect(runAnalysis).not.toHaveBeenCalled();
    });

    it('does not run analysis when the requested dong is not selectable', async () => {
        const controls = createTransactionControls();
        controls.dong.options = [{ value: '' }];
        const runAnalysis = vi.fn();

        await applyEntryRegion(MAPO_REGION, {
            controls,
            prepareDongOptions: vi.fn().mockResolvedValue([]),
            runAnalysis,
        });

        expect(controls.dong.value).toBe('');
        expect(runAnalysis).not.toHaveBeenCalled();
    });

    it('applies Seoul fallback without choosing a district or querying', async () => {
        const controls = createTransactionControls();
        const prepareDongOptions = vi.fn();
        const runAnalysis = vi.fn();

        await applyEntryRegion(SEOUL_START_REGION, { controls, prepareDongOptions, runAnalysis });

        expect(controls.sido.value).toBe('11');
        expect(controls.gugun.value).toBe('');
        expect(prepareDongOptions).not.toHaveBeenCalled();
        expect(runAnalysis).not.toHaveBeenCalled();
    });

    it('keeps global detail indices after filtering and sorting the visible page', () => {
        const first = { id: 'first' };
        const second = { id: 'second' };
        const third = { id: 'third' };

        expect(getCurrentTransactionPage({
            globalData: [first, second, third],
            filteredData: [third, first, second],
            currentPage: 1,
            itemsPerPage: 2,
        })).toEqual([
            { item: third, dataIndex: 2 },
            { item: first, dataIndex: 0 },
        ]);
    });

    it('publishes the full query and replaces stale visible items with an empty page', () => {
        const snapshots = [];
        const unsubscribe = subscribeTransactionMap(snapshot => snapshots.push(snapshot));
        const query = {
            sidoCd: '11',
            lawdCd: '11440',
            dealYmd: '202607',
            selectedTypes: ['apt', 'office'],
            selectedModes: ['trade', 'rent'],
            dong: '서교동',
            labels: {
                sido: '서울특별시',
                gugun: '마포구',
                dong: '서교동',
                dealYmd: '2026년 7월',
            },
        };
        const onSelect = vi.fn();

        publishTransactionMap({ query, items: [{ item: { id: 1 }, dataIndex: 4 }], total: 1, onSelect });
        publishTransactionMap({ query, items: [], total: 0, onSelect });

        expect(snapshots.at(-1)).toEqual({ query, items: [], total: 0, onSelect });
        unsubscribe();
    });

    it('renders the current page and opens the existing global detail index', () => {
        const document = createPanelDocument();
        const controller = createTransactionMapPanel(document);
        const onSelect = vi.fn();

        controller.update({
            state: 'success',
            query: {
                regionLabel: '서울 마포구',
                transactionTypes: ['sale'],
                propertyTypes: ['apt'],
                dealYmd: '202608',
            },
            items: [{ item: { name: '테스트 아파트', typeName: '아파트', date: '2026-08-01', price: 123000 }, dataIndex: 4 }],
            total: 1,
            onSelect,
        });

        expect(document.getElementById('transaction-map-count').textContent).toContain('1건');
        expect(document.querySelectorAll('[data-transaction-index]')).toHaveLength(1);
        expect(document.getElementById('transaction-map-list').children[0].tagName).toBe('li');
        document.querySelector('[data-transaction-index="4"]').click();
        expect(onSelect).toHaveBeenCalledWith(4);
    });

    it('mirrors jeonse and monthly rent controls with Korean labels', () => {
        const document = createPanelDocument();
        const controller = createTransactionMapPanel(document);

        controller.update({
            state: 'success',
            query: { regionLabel: '서울 마포구', selectedModes: ['jeonse', 'monthly'], dealYmd: '202608' },
            items: [],
            total: 0,
            onSelect: vi.fn(),
        });

        expect(document.getElementById('transaction-map-filters').textContent).toContain('전세, 월세');
    });

    it('replaces stale visible items with an error state', () => {
        const document = createPanelDocument();
        const controller = createTransactionMapPanel(document);
        const query = { regionLabel: '서울 마포구', transactionTypes: ['sale'], dealYmd: '202608' };

        controller.update({
            state: 'success',
            query,
            items: [{ item: { name: '기존 거래' }, dataIndex: 0 }],
            total: 1,
            onSelect: vi.fn(),
        });
        controller.update({ state: 'error', query, items: [], total: 0, onSelect: vi.fn() });

        expect(document.querySelectorAll('[data-transaction-index]')).toHaveLength(0);
        expect(document.getElementById('transaction-map-count').textContent).toContain('조회할 수 없습니다');
    });
});
