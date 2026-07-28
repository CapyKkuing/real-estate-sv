import { describe, expect, it } from 'vitest';
import { formatRentPrice, mapRentTransaction, summarizeRentTransactions } from '../site/rent-transactions.js';

const typeNames = { apt: '아파트', shous: '단독/다가구' };

describe('rental frontend model', () => {
    it('maps normalized monthly rent', () => {
        const item = mapRentTransaction({ rentType: 'monthly', propertyType: 'apt', propertyName: '테스트아파트', districtName: '구로동', jibun: '1-2', areaSquareMeters: 84.9, contractDate: '2026-06-09', depositTenThousandWon: 10000, monthlyRentTenThousandWon: 85, floor: '12', buildYear: 2018, contractType: '갱신', renewalRightUsed: true }, typeNames);
        expect(item).toMatchObject({ transactionMode: 'rent', deposit: 10000, monthlyRent: 85, contractType: '갱신', renewalRightUsed: true });
        expect(formatRentPrice(item)).toBe('보증금 10,000만원 / 월 85만원');
    });

    it('uses address fallback and formats jeonse', () => {
        const item = mapRentTransaction({ rentType: 'jeonse', propertyType: 'shous', propertyName: null, districtName: '가리봉동', jibun: null, areaSquareMeters: null, contractDate: '2026-06-18', depositTenThousandWon: 25000, monthlyRentTenThousandWon: 0 }, typeNames);
        expect(item.name).toBe('가리봉동');
        expect(formatRentPrice(item)).toBe('전세 25,000만원');
    });

    it('summarizes mixed jeonse and monthly rent', () => {
        expect(summarizeRentTransactions([
            { transactionMode: 'trade', price: 50000 },
            { transactionMode: 'rent', rentType: 'jeonse', deposit: 20000, monthlyRent: 0 },
            { transactionMode: 'rent', rentType: 'monthly', deposit: 1000, monthlyRent: 60 }
        ])).toEqual({ jeonseCount: 1, monthlyCount: 1, medianDeposit: 10500, medianMonthlyRent: 60 });
    });
});
