const PROFILE_VERSION = 1;

export const HOUSING_PROFILE_STORAGE_KEY = 'jipgilHousingProfile.v1';

export const HOUSING_QUESTIONS = Object.freeze([
    { id: 'preferredRegion', title: '어느 지역에서 살고 싶나요?', type: 'region' },
    { id: 'householdType', title: '함께 사는 가구 형태를 알려주세요.', type: 'choice', options: ['1인', '부부', '자녀 포함', '기타'] },
    { id: 'homelessStatus', title: '현재 무주택 상태인가요?', type: 'choice', options: ['no-home', 'owns-home', 'unknown'] },
    { id: 'ageBand', title: '정책 확인을 위한 나이 구간을 선택하세요.', type: 'choice', options: ['under-19', '19-34', '35-64', '65-plus'] },
    { id: 'incomeBand', title: '가구 월소득 구간을 선택하세요.', type: 'choice', options: ['under-200', '200-350', '350-500', 'over-500', 'unknown'] },
    { id: 'assetBand', title: '가구 자산 구간을 선택하세요.', type: 'choice', options: ['under-10000', '10000-25000', '25000-35000', 'over-35000', 'unknown'] },
    { id: 'currentHousingCost', title: '현재 월 주거비 구간을 선택하세요.', type: 'choice', options: ['none', 'under-30', '30-60', '60-100', 'over-100'] },
]);

export function createHousingProfile() {
    return { version: PROFILE_VERSION, answers: {}, updatedAt: null };
}

export function answerHousingQuestion(profile, questionId, value, now = new Date().toISOString()) {
    if (!HOUSING_QUESTIONS.some(question => question.id === questionId)) return profile;
    return {
        version: PROFILE_VERSION,
        answers: { ...profile.answers, [questionId]: value },
        updatedAt: now,
    };
}

export function toStoredPreferredRegion(region) {
    return {
        source: region.source,
        sidoCode: region.sidoCode,
        lawdCd: region.lawdCd,
        dongName: region.dongName,
        label: region.label,
    };
}

export function loadHousingProfile(storage) {
    try {
        const parsed = JSON.parse(storage.getItem(HOUSING_PROFILE_STORAGE_KEY) || 'null');
        if (parsed?.version === PROFILE_VERSION && parsed.answers && typeof parsed.answers === 'object') return parsed;
    } catch {}
    return createHousingProfile();
}

export function saveHousingProfile(storage, profile) {
    storage.setItem(HOUSING_PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function clearHousingProfile(storage) {
    storage.removeItem(HOUSING_PROFILE_STORAGE_KEY);
}
