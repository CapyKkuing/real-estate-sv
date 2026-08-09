import { describe, expect, it } from 'vitest';
import { getHousingSummaryChips } from '../site/housing-summary.js';

describe('housing summary chips', () => {
    it('maps a complete saved profile to the five editable chips', () => {
        const completeProfile = {
            answers: {
                householdType: '1인',
                homelessStatus: 'no-home',
                ageBand: '19-34',
                preferredRegion: 'text:마포구',
                incomeBand: '200-350',
                assetBand: '10000-25000',
                currentHousingCost: '30-60',
            },
        };

        expect(getHousingSummaryChips(completeProfile)).toEqual([
            { id: 'householdType', label: '1인 가구', questionIds: ['householdType'] },
            { id: 'homelessStatus', label: '무주택', questionIds: ['homelessStatus'] },
            { id: 'ageBand', label: '청년', questionIds: ['ageBand'] },
            { id: 'preferredRegion', label: '마포구', questionIds: ['preferredRegion'] },
            { id: 'details', label: '상세 조건', questionIds: ['incomeBand', 'assetBand', 'currentHousingCost'] },
        ]);
    });
});
