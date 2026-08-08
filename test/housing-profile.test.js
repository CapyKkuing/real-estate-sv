import { describe, expect, it } from 'vitest';
import {
    HOUSING_PROFILE_STORAGE_KEY,
    HOUSING_QUESTIONS,
    answerHousingQuestion,
    clearHousingProfile,
    createHousingProfile,
    loadHousingProfile,
    saveHousingProfile,
} from '../site/housing-profile.js';

function memoryStorage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key),
    };
}

describe('housing profile', () => {
    it('provides the exact seven safe questions in their required order', () => {
        expect(HOUSING_QUESTIONS).toEqual([
            { id: 'preferredRegion', title: '어느 지역에서 살고 싶나요?', type: 'region' },
            { id: 'householdType', title: '함께 사는 가구 형태를 알려주세요.', type: 'choice', options: ['1인', '부부', '자녀 포함', '기타'] },
            { id: 'homelessStatus', title: '현재 무주택 상태인가요?', type: 'choice', options: ['no-home', 'owns-home', 'unknown'] },
            { id: 'ageBand', title: '정책 확인을 위한 나이 구간을 선택하세요.', type: 'choice', options: ['under-19', '19-34', '35-64', '65-plus'] },
            { id: 'incomeBand', title: '가구 월소득 구간을 선택하세요.', type: 'choice', options: ['under-200', '200-350', '350-500', 'over-500', 'unknown'] },
            { id: 'assetBand', title: '가구 자산 구간을 선택하세요.', type: 'choice', options: ['under-10000', '10000-25000', '25000-35000', 'over-35000', 'unknown'] },
            { id: 'currentHousingCost', title: '현재 월 주거비 구간을 선택하세요.', type: 'choice', options: ['none', 'under-30', '30-60', '60-100', 'over-100'] },
        ]);
    });

    it('returns a new profile instead of mutating the previous value', () => {
        const initial = createHousingProfile();
        const updated = answerHousingQuestion(initial, 'homelessStatus', 'no-home', '2026-08-08T09:00:00.000Z');
        expect(initial.answers).toEqual({});
        expect(updated.answers.homelessStatus).toBe('no-home');
        expect(updated.updatedAt).toBe('2026-08-08T09:00:00.000Z');
    });

    it('saves, restores, and clears only the versioned local profile', () => {
        const storage = memoryStorage();
        const profile = answerHousingQuestion(createHousingProfile(), 'ageBand', '19-34', '2026-08-08T09:00:00.000Z');
        saveHousingProfile(storage, profile);
        expect(loadHousingProfile(storage)).toEqual(profile);
        clearHousingProfile(storage);
        expect(storage.getItem(HOUSING_PROFILE_STORAGE_KEY)).toBeNull();
    });

    it('ignores corrupt or differently versioned storage', () => {
        const storage = memoryStorage();
        storage.setItem(HOUSING_PROFILE_STORAGE_KEY, '{broken');
        expect(loadHousingProfile(storage)).toEqual(createHousingProfile());
        storage.setItem(HOUSING_PROFILE_STORAGE_KEY, JSON.stringify({ version: 99, answers: {} }));
        expect(loadHousingProfile(storage)).toEqual(createHousingProfile());
    });
});
