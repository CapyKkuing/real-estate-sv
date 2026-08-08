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
    it('starts with the preferred-region question and contains seven safe questions', () => {
        expect(HOUSING_QUESTIONS).toHaveLength(7);
        expect(HOUSING_QUESTIONS[0].id).toBe('preferredRegion');
        expect(HOUSING_QUESTIONS.map(question => question.id)).toEqual([
            'preferredRegion',
            'householdType',
            'homelessStatus',
            'ageBand',
            'incomeBand',
            'assetBand',
            'currentHousingCost',
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
