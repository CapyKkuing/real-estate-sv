import { describe, expect, it, vi } from 'vitest';
import {
    applyEntryRegion,
    getCurrentTransactionPage,
    publishTransactionMap,
    subscribeTransactionMap,
} from '../site/transaction-map.js';

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
});
