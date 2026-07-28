import { describe, expect, it } from 'vitest';
import { listPeriodMonths, selectHistoryMonths } from '../site/history-period.js';

describe('history period selection', () => {
    it('lists months across a year boundary', () => {
        expect(listPeriodMonths('202601', 3)).toEqual(['202601', '202512', '202511']);
    });

    it('loads stored months first and limits new collection to three months', () => {
        const result = selectHistoryMonths({
            availableMonths: ['202606', '202605'],
            missingMonths: ['202604', '202603', '202602', '202601']
        }, listPeriodMonths('202606', 6));

        expect(result.available).toEqual(['202606', '202605']);
        expect(result.missing).toHaveLength(4);
        expect(result.monthsToLoad).toEqual(['202606', '202605', '202604', '202603', '202602']);
    });
});
