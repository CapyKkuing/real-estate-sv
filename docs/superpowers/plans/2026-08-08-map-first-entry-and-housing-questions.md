# Map-First Entry and Housing Questions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 지도 중심 첫 화면에서 두 경로를 동등하게 제공하고, 임대주택 경로는 지도 위 7단계 질문 팝업으로, 실거래 경로는 기존 분석 화면으로 즉시 연결한다.

**Architecture:** 하나의 실제 지도 인스턴스를 첫 화면에 유지하고 `home`, `housing`, `map` 세 상태만 전환한다. 경로 상태, 지도 어댑터, 질문·로컬 저장, DOM 제어를 각각 작은 프런트엔드 모듈로 분리하고 `site/main.js`는 초기화와 기존 분석 기능만 담당한다. 이번 계획은 상위 설계의 구현 경계 1·2만 포함하며, 공식 임대공고 핀·실거래 지역 집계·단지 좌표는 가짜 데이터 없이 후속 데이터 계획에서 연결한다.

**Tech Stack:** 정적 HTML/CSS/ES modules, MapLibre GL JS `5.12.0` CDN, OpenFreeMap Liberty style, Vitest 4, Cloudflare Workers static assets

## Global Constraints

- 첫 화면 문구는 `조건과 시세를 함께 보고, 살 곳을 정하세요.`를 그대로 사용한다.
- 두 진입 카드의 크기, 여백, 제목 크기, 화살표 위치를 동일하게 유지한다.
- 데스크톱 기준은 `1440px`이며 `1280px`에서도 가로 잘림이 없어야 한다.
- 모바일 기준은 `390px`이며 가로 스크롤과 화면 밖 잘림을 허용하지 않는다.
- 임대주택 질문은 데스크톱 우측 팝업, 모바일 하단 시트로 표시하고 지도 인스턴스를 다시 만들지 않는다.
- 한 화면에는 한 질문만 표시하며 첫 질문은 `희망 지역`이다.
- 질문 팝업 열기·닫기·이전·다음 이동 시 포커스를 명확히 관리한다.
- 개인 조건은 `localStorage`에만 저장하고 서버 요청, 로그, URL에 포함하지 않는다.
- 이름, 주민번호, 상세 증빙, 계좌정보는 질문하거나 저장하지 않는다.
- 공식 데이터가 연결되지 않은 지도 레이어는 숨기고 가짜 시세·가짜 공고 핀을 만들지 않는다.
- 지도 출처와 외부 지도 장애 상태를 읽을 수 있는 문구로 표시한다.
- `site/main.js`에 새 기능 전체를 추가하지 않고 책임별 모듈로 분리한다.
- 기존 매매·전세·월세 조회, 기간 분석, 상세, 비교 기능을 유지한다.
- 구현 커밋은 작업별로 만들되 push, merge, deploy는 별도 사용자 승인 전 실행하지 않는다.
- Windows 셸 명령은 Git Bash에서 실행한다.

## Scope Split

이 계획이 완성하는 범위는 다음 두 단위다.

1. 두 개의 동등한 입구와 실제 지도 셸
2. 지도 위 7단계 질문 팝업과 브라우저 조건 저장

다음 항목은 독립 데이터 서브시스템이므로 이 계획에 섞지 않는다.

- 공식 임대주택·주거비 지원 공고 수집, 정규화, D1 스냅샷
- 실거래 지역 집계와 지도 시세 마커
- 단지·건물 좌표, 확대 단계 가격 핀, 지역·단지·주소 통합 지오코딩
- 신청 가능성 판정, 월 실부담 계산, 추천 결과

위 데이터가 준비되기 전 첫 화면은 지도와 지역 선택만 제공하고, 시세·공고 범례에는 확인되지 않은 숫자를 표시하지 않는다.

실행 시작 시 이미 수정된 `site/index.html`, `site/main.js`, `site/style.css`, `test/frontend.test.ts`는 승인 과정에서 만든 진입 화면 프로토타입이다. 이를 되돌리거나 별도 초기화하지 않고 Task 4·5의 최종 구현에 흡수한다. 각 앞선 작업은 새 모듈과 해당 테스트만 stage하여 프로토타입 변경이 중간 커밋에 섞이지 않게 한다.

---

### Task 1: Entry Route State

**Files:**
- Create: `site/entry-route.js`
- Create: `test/entry-route.test.js`

**Interfaces:**
- Consumes: 브라우저 `location.hash`, `history.pushState`
- Produces: `ENTRY_MODE`, `readEntryMode(hash)`, `hashForEntryMode(mode)`, `writeEntryMode(history, location, mode)`

- [ ] **Step 1: Write the failing route-state test**

```js
import { describe, expect, it, vi } from 'vitest';
import {
    ENTRY_MODE,
    hashForEntryMode,
    readEntryMode,
    writeEntryMode,
} from '../site/entry-route.js';

describe('entry route state', () => {
    it('maps only the approved hashes to entry modes', () => {
        expect(readEntryMode('')).toBe(ENTRY_MODE.HOME);
        expect(readEntryMode('#home')).toBe(ENTRY_MODE.HOME);
        expect(readEntryMode('#housing')).toBe(ENTRY_MODE.HOUSING);
        expect(readEntryMode('#map')).toBe(ENTRY_MODE.MAP);
        expect(readEntryMode('#unknown')).toBe(ENTRY_MODE.HOME);
    });

    it('does not write the same hash twice', () => {
        const history = { pushState: vi.fn() };
        const location = { hash: '#housing' };
        writeEntryMode(history, location, ENTRY_MODE.HOUSING);
        expect(history.pushState).not.toHaveBeenCalled();

        writeEntryMode(history, location, ENTRY_MODE.MAP);
        expect(history.pushState).toHaveBeenCalledWith(null, '', '#map');
    });

    it('creates a stable hash for every mode', () => {
        expect(hashForEntryMode(ENTRY_MODE.HOME)).toBe('#home');
        expect(hashForEntryMode(ENTRY_MODE.HOUSING)).toBe('#housing');
        expect(hashForEntryMode(ENTRY_MODE.MAP)).toBe('#map');
    });
});
```

- [ ] **Step 2: Run the new test and verify the module is missing**

Run: `npx vitest run test/entry-route.test.js`

Expected: FAIL because `site/entry-route.js` does not exist.

- [ ] **Step 3: Implement the route contract**

```js
export const ENTRY_MODE = Object.freeze({
    HOME: 'home',
    HOUSING: 'housing',
    MAP: 'map',
});

const VALID_MODES = new Set(Object.values(ENTRY_MODE));

export function readEntryMode(hash) {
    const mode = String(hash || '').replace(/^#/, '');
    return VALID_MODES.has(mode) ? mode : ENTRY_MODE.HOME;
}

export function hashForEntryMode(mode) {
    return `#${VALID_MODES.has(mode) ? mode : ENTRY_MODE.HOME}`;
}

export function writeEntryMode(history, location, mode) {
    const hash = hashForEntryMode(mode);
    if (location.hash !== hash) history.pushState(null, '', hash);
}
```

- [ ] **Step 4: Run the route-state test**

Run: `npx vitest run test/entry-route.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the route module**

```bash
git add site/entry-route.js test/entry-route.test.js
git commit -m "refactor: isolate entry route state"
```

---

### Task 2: Housing Profile and Local-Only Persistence

**Files:**
- Create: `site/housing-profile.js`
- Create: `test/housing-profile.test.js`

**Interfaces:**
- Consumes: Web Storage-compatible object with `getItem`, `setItem`, `removeItem`
- Produces: `HOUSING_PROFILE_STORAGE_KEY`, `HOUSING_QUESTIONS`, `createHousingProfile()`, `answerHousingQuestion(profile, questionId, value, now)`, `loadHousingProfile(storage)`, `saveHousingProfile(storage, profile)`, `clearHousingProfile(storage)`

- [ ] **Step 1: Write failing tests for the exact seven questions and storage boundary**

```js
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
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `npx vitest run test/housing-profile.test.js`

Expected: FAIL because `site/housing-profile.js` does not exist.

- [ ] **Step 3: Define the exact question catalog**

```js
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
```

금액 단위는 화면에서 `만원`으로 명시한다. 선택값은 숫자 추정이나 자격 판정에 사용하지 않고 이 단계에서는 그대로 보관한다.

- [ ] **Step 4: Implement immutable state and defensive storage parsing**

```js
const PROFILE_VERSION = 1;

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
```

- [ ] **Step 5: Run the targeted test**

Run: `npx vitest run test/housing-profile.test.js`

Expected: PASS.

- [ ] **Step 6: Commit the local profile boundary**

```bash
git add site/housing-profile.js test/housing-profile.test.js
git commit -m "feat: add local housing profile flow"
```

---

### Task 3: Real Map Runtime Adapter

**Files:**
- Create: `site/entry-map.js`
- Create: `test/entry-map.test.js`

**Interfaces:**
- Consumes: `HTMLElement container`, injected `maplibre` global, optional `onStatus(status)` callback
- Produces: `ENTRY_MAP_STYLE_URL`, `createEntryMap({ container, maplibre, onStatus })` returning `{ resize(), getCenter(), destroy() }`

- [ ] **Step 1: Write a failing adapter test with a fake MapLibre runtime**

```js
import { describe, expect, it, vi } from 'vitest';
import { ENTRY_MAP_STYLE_URL, createEntryMap } from '../site/entry-map.js';

describe('entry map adapter', () => {
    it('creates one Seoul-centered map with required controls and attribution', () => {
        const addControl = vi.fn();
        const on = vi.fn();
        const remove = vi.fn();
        const resize = vi.fn();
        const Map = vi.fn(() => ({ addControl, on, remove, resize, getCenter: () => ({ lng: 126.978, lat: 37.5665 }) }));
        const maplibre = {
            Map,
            NavigationControl: vi.fn(() => ({ type: 'navigation' })),
            GeolocateControl: vi.fn(() => ({ type: 'geolocate' })),
        };

        const controller = createEntryMap({ container: { id: 'entry-map' }, maplibre });

        expect(Map).toHaveBeenCalledWith(expect.objectContaining({
            style: ENTRY_MAP_STYLE_URL,
            center: [126.978, 37.5665],
            zoom: 10,
            attributionControl: true,
        }));
        expect(addControl).toHaveBeenCalledTimes(2);
        expect(controller.getCenter()).toEqual({ longitude: 126.978, latitude: 37.5665 });
        controller.resize();
        controller.destroy();
        expect(resize).toHaveBeenCalledOnce();
        expect(remove).toHaveBeenCalledOnce();
    });

    it('reports an unavailable runtime without throwing', () => {
        const statuses = [];
        const controller = createEntryMap({ container: {}, maplibre: undefined, onStatus: value => statuses.push(value) });
        expect(statuses).toEqual(['unavailable']);
        expect(controller.getCenter()).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `npx vitest run test/entry-map.test.js`

Expected: FAIL because `site/entry-map.js` does not exist.

- [ ] **Step 3: Implement the provider-isolated adapter**

```js
export const ENTRY_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

const EMPTY_MAP = Object.freeze({
    resize() {},
    getCenter() { return null; },
    destroy() {},
});

export function createEntryMap({ container, maplibre, onStatus = () => {} }) {
    if (!container || !maplibre?.Map) {
        onStatus('unavailable');
        return EMPTY_MAP;
    }

    const map = new maplibre.Map({
        container,
        style: ENTRY_MAP_STYLE_URL,
        center: [126.978, 37.5665],
        zoom: 10,
        minZoom: 6,
        maxZoom: 18,
        attributionControl: true,
    });

    map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibre.GeolocateControl({ positionOptions: { enableHighAccuracy: false }, trackUserLocation: false }), 'top-right');
    map.on('load', () => onStatus('ready'));
    map.on('error', () => onStatus('error'));

    return {
        resize: () => map.resize(),
        getCenter() {
            const center = map.getCenter();
            return { longitude: center.lng, latitude: center.lat };
        },
        destroy: () => map.remove(),
    };
}
```

- [ ] **Step 4: Run the adapter test**

Run: `npx vitest run test/entry-map.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the map runtime boundary**

```bash
git add site/entry-map.js test/entry-map.test.js
git commit -m "feat: add real entry map runtime"
```

---

### Task 4: Entry Experience Controller and Seven-Step Question Flow

**Files:**
- Create: `site/entry-experience.js`
- Create: `test/entry-experience.test.js`
- Modify: `site/main.js:1-18,650-718,1500-1511`

**Interfaces:**
- Consumes: `ENTRY_MODE`, `createEntryMap()`, `HOUSING_QUESTIONS`, housing-profile functions, existing `sido-select` and `gugun-select`
- Produces: `getQuestionStep(index, questions)`, `nextQuestionIndex(index, total)`, `previousQuestionIndex(index)`, `initEntryExperience({ document, window })`

- [ ] **Step 1: Write failing tests for question navigation boundaries**

```js
import { describe, expect, it } from 'vitest';
import {
    getQuestionStep,
    nextQuestionIndex,
    previousQuestionIndex,
} from '../site/entry-experience.js';

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
```

- [ ] **Step 2: Run the test and verify the controller is missing**

Run: `npx vitest run test/entry-experience.test.js`

Expected: FAIL because `site/entry-experience.js` does not exist.

- [ ] **Step 3: Implement the pure navigation helpers**

```js
export function getQuestionStep(index, questions) {
    const safeIndex = Math.max(0, Math.min(index, questions.length - 1));
    return { index: safeIndex, current: safeIndex + 1, total: questions.length, question: questions[safeIndex] };
}

export function nextQuestionIndex(index, total) {
    return Math.min(index + 1, total - 1);
}

export function previousQuestionIndex(index) {
    return Math.max(index - 1, 0);
}
```

- [ ] **Step 4: Implement the DOM controller around the tested state modules**

The controller owns one state object and never recreates the map when the route changes:

```js
import { ENTRY_MODE, readEntryMode, writeEntryMode } from './entry-route.js';
import { createEntryMap } from './entry-map.js';
import {
    HOUSING_QUESTIONS,
    answerHousingQuestion,
    loadHousingProfile,
    saveHousingProfile,
} from './housing-profile.js';

const OPTION_LABELS = Object.freeze({
    '1인': '1인 가구',
    '부부': '부부',
    '자녀 포함': '자녀 포함 가구',
    '기타': '그 외 가구',
    'no-home': '무주택',
    'owns-home': '주택 보유',
    'unknown': '잘 모르겠어요',
    'under-19': '19세 미만',
    '19-34': '19~34세',
    '35-64': '35~64세',
    '65-plus': '65세 이상',
    'under-200': '200만원 미만',
    '200-350': '200만~350만원',
    '350-500': '350만~500만원',
    'over-500': '500만원 이상',
    'under-10000': '1억원 미만',
    '10000-25000': '1억~2억 5천만원',
    '25000-35000': '2억 5천만~3억 5천만원',
    'over-35000': '3억 5천만원 이상',
    'none': '현재 주거비 없음',
    'under-30': '30만원 미만',
    '30-60': '30만~60만원',
    '60-100': '60만~100만원',
    'over-100': '100만원 이상',
});

export function initEntryExperience({ document, window }) {
    const elements = {
        entryView: document.getElementById('entry-view'),
        platformView: document.getElementById('platform-view'),
        map: document.getElementById('entry-map'),
        mapStatus: document.getElementById('entry-map-status'),
        homeOverlay: document.getElementById('entry-home-overlay'),
        questionDialog: document.getElementById('housing-question-dialog'),
        questionTitle: document.getElementById('housing-question-title'),
        questionBody: document.getElementById('housing-question-body'),
        questionProgress: document.getElementById('housing-question-progress'),
        closeQuestion: document.getElementById('housing-question-close'),
        previousQuestion: document.getElementById('housing-question-previous'),
        nextQuestion: document.getElementById('housing-question-next'),
    };
    const mapController = createEntryMap({
        container: elements.map,
        maplibre: window.maplibregl,
        onStatus: status => {
            elements.mapStatus.dataset.state = status;
            elements.mapStatus.textContent = status === 'ready'
                ? '지도 연결됨'
                : '지도를 불러오지 못했습니다. 아래 경로 선택은 계속 사용할 수 있습니다.';
        },
    });
    let questionIndex = 0;
    let profile = loadHousingProfile(window.localStorage);
    let lastTrigger = null;

    function recordAnswer(questionId, value) {
        profile = answerHousingQuestion(profile, questionId, value);
        saveHousingProfile(window.localStorage, profile);
        elements.nextQuestion.disabled = false;
    }

    function renderQuestion() {
        const step = getQuestionStep(questionIndex, HOUSING_QUESTIONS);
        const savedAnswer = profile.answers[step.question.id];
        elements.questionProgress.textContent = `${step.current} / ${step.total}`;
        elements.questionTitle.textContent = step.question.title;
        elements.questionBody.replaceChildren();

        if (step.question.type === 'region') {
            const currentArea = document.createElement('button');
            currentArea.type = 'button';
            currentArea.textContent = '현재 지도 주변';
            currentArea.addEventListener('click', () => {
                const center = mapController.getCenter();
                if (center) recordAnswer(step.question.id, `map:${center.longitude},${center.latitude}`);
            });

            const regionSelect = document.createElement('select');
            regionSelect.setAttribute('aria-label', '광역 지역 선택');
            regionSelect.append(new Option('시·도 선택', ''));
            const analysisRegionSelect = document.getElementById('sido-select');
            [...analysisRegionSelect.options].filter(option => option.value).forEach(option => {
                regionSelect.append(new Option(option.textContent, option.value));
            });
            regionSelect.addEventListener('change', () => {
                if (regionSelect.value) recordAnswer(step.question.id, `sido:${regionSelect.value}`);
            });

            const directRegion = document.createElement('input');
            directRegion.type = 'search';
            directRegion.placeholder = '원하는 지역명 직접 입력';
            directRegion.setAttribute('aria-label', '원하는 지역명 직접 입력');
            directRegion.addEventListener('change', () => {
                const value = directRegion.value.trim();
                if (value) recordAnswer(step.question.id, `text:${value}`);
            });
            elements.questionBody.append(currentArea, regionSelect, directRegion);
        } else {
            const choices = document.createElement('fieldset');
            const legend = document.createElement('legend');
            legend.textContent = '하나를 선택하세요';
            choices.append(legend);
            step.question.options.forEach(value => {
                const label = document.createElement('label');
                const input = document.createElement('input');
                const text = document.createElement('span');
                input.type = 'radio';
                input.name = step.question.id;
                input.value = value;
                input.checked = savedAnswer === value;
                input.addEventListener('change', () => recordAnswer(step.question.id, value));
                text.textContent = OPTION_LABELS[value] || value;
                label.append(input, text);
                choices.append(label);
            });
            elements.questionBody.append(choices);
        }

        elements.previousQuestion.disabled = questionIndex === 0;
        elements.nextQuestion.disabled = !savedAnswer;
        elements.nextQuestion.textContent = step.current === step.total ? '조건 저장' : '다음';
        elements.questionTitle.focus({ preventScroll: true });
    }

    function setMode(mode, updateHash = true) {
        elements.entryView.hidden = false;
        elements.homeOverlay.hidden = mode !== ENTRY_MODE.HOME;
        elements.questionDialog.hidden = mode !== ENTRY_MODE.HOUSING;
        elements.platformView.hidden = mode !== ENTRY_MODE.MAP;
        document.body.dataset.entryMode = mode;
        if (updateHash) writeEntryMode(window.history, window.location, mode);
        if (mode === ENTRY_MODE.HOUSING) renderQuestion();
        mapController.resize();
    }

    function openHousing(trigger) {
        lastTrigger = trigger;
        setMode(ENTRY_MODE.HOUSING);
        elements.closeQuestion.focus({ preventScroll: true });
    }

    function closeHousing() {
        saveHousingProfile(window.localStorage, profile);
        setMode(ENTRY_MODE.HOME);
        lastTrigger?.focus({ preventScroll: true });
    }

    document.querySelectorAll('[data-entry-route="housing"]').forEach(button => {
        button.addEventListener('click', () => openHousing(button));
    });
    document.querySelectorAll('[data-entry-route="map"]').forEach(button => {
        button.addEventListener('click', () => setMode(ENTRY_MODE.MAP));
    });
    document.querySelectorAll('[data-platform-mode="housing"]').forEach(button => {
        button.addEventListener('click', () => openHousing(button));
    });
    document.querySelectorAll('[data-platform-mode="map"]').forEach(button => {
        button.addEventListener('click', () => setMode(ENTRY_MODE.MAP));
    });
    document.querySelectorAll('a[href="#home"]').forEach(link => {
        link.addEventListener('click', event => {
            event.preventDefault();
            setMode(ENTRY_MODE.HOME);
        });
    });
    elements.closeQuestion.addEventListener('click', closeHousing);
    elements.previousQuestion.addEventListener('click', () => {
        questionIndex = previousQuestionIndex(questionIndex);
        renderQuestion();
    });
    elements.nextQuestion.addEventListener('click', () => {
        if (!profile.answers[HOUSING_QUESTIONS[questionIndex].id]) return;
        if (questionIndex === HOUSING_QUESTIONS.length - 1) {
            closeHousing();
            return;
        }
        questionIndex = nextQuestionIndex(questionIndex, HOUSING_QUESTIONS.length);
        renderQuestion();
    });
    elements.questionDialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeHousing();
    });
    document.getElementById('entry-back')?.addEventListener('click', () => setMode(ENTRY_MODE.HOME));
    window.addEventListener('popstate', () => setMode(readEntryMode(window.location.hash), false));
    setMode(readEntryMode(window.location.hash), false);

    return { setMode, destroy: () => mapController.destroy() };
}
```

`Option` 생성자는 테스트에서 실행하지 않는 브라우저 전용 `initEntryExperience()` 내부에만 존재한다. 직접 지역명은 `textContent`와 폼 값으로만 다루며 `innerHTML`로 삽입하지 않는다. 마지막 단계의 `조건 저장`은 결과 추천을 실행하지 않고 팝업을 닫는다.

- [ ] **Step 5: Replace the inline entry routing block in `site/main.js`**

Add the import and one initialization call:

```js
import { initEntryExperience } from './entry-experience.js';

const entryExperience = initEntryExperience({ document, window });
```

Remove `PLATFORM_COPY`, `setLocationHash`, `resetViewportScroll`, `openPlatform`, `openEntry`, `syncPlatformRoute`, and their current route listeners. Do not change the existing query, results, detail, comparison, or theme functions.

- [ ] **Step 6: Run focused tests and the frontend syntax check**

Run: `npx vitest run test/entry-route.test.js test/housing-profile.test.js test/entry-map.test.js test/entry-experience.test.js`

Run: `npm run check:frontend`

Expected: both commands exit `0`.

- [ ] **Step 7: Commit the controller integration**

```bash
git add site/entry-experience.js site/main.js test/entry-experience.test.js
git commit -m "feat: connect entry routes and housing questions"
```

---

### Task 5: Approved Map-First Markup and Responsive Styling

**Files:**
- Create: `site/entry.css`
- Modify: `site/index.html:18-107`
- Modify: `site/style.css:87-143,365-385,445-451`
- Modify: `test/frontend.test.ts:82-99`

**Interfaces:**
- Consumes: IDs required by `initEntryExperience()` and `data-entry-route` buttons
- Produces: one persistent `#entry-map`, equal route cards, `#housing-question-dialog`, accessible progress and controls, honest map/data status

- [ ] **Step 1: Strengthen the frontend contract before changing markup**

Replace the existing entry test with assertions for the approved structure:

```ts
it('provides an accessible map-first entry and housing question surface', async () => {
  const [html, entryStyle, script] = await Promise.all([
    readFile(resolve('site/index.html'), 'utf8'),
    readFile(resolve('site/entry.css'), 'utf8'),
    readFile(resolve('site/entry-experience.js'), 'utf8'),
  ])

  for (const id of [
    'entry-view',
    'entry-map',
    'entry-map-status',
    'entry-home-overlay',
    'housing-question-dialog',
    'housing-question-progress',
    'housing-question-title',
    'housing-question-body',
    'housing-question-close',
    'housing-question-previous',
    'housing-question-next',
  ]) expect(html).toContain(`id="${id}"`)

  expect(html.match(/data-entry-route="housing"/g)).toHaveLength(2)
  expect(html.match(/data-entry-route="map"/g)).toHaveLength(2)
  expect(html).toContain('조건과 시세를 함께 보고, 살 곳을 정하세요.')
  expect(html).toContain('aria-modal="false"')
  expect(html).toContain('aria-live="polite"')
  expect(entryStyle).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
  expect(entryStyle).toMatch(/@media \(max-width: 720px\)[\s\S]*grid-template-columns: 1fr/)
  expect(script).toContain('preventScroll: true')
})
```

- [ ] **Step 2: Run the frontend test and verify the new contract fails**

Run: `npx vitest run test/frontend.test.ts`

Expected: FAIL because `entry.css` and the approved map/dialog IDs do not exist.

- [ ] **Step 3: Replace the decorative SVG with the persistent map stage**

Pin the no-bundler map runtime in `<head>` before the local styles and keep `package.json` and `package-lock.json` unchanged:

```html
<link rel="preconnect" href="https://tiles.openfreemap.org">
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.css">
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="entry.css">
<script src="https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.js" defer></script>
```

The adapter is the only JavaScript file allowed to read `window.maplibregl`. This keeps a future provider change out of the entry controller and existing analysis code.

The entry section must use this semantic structure:

```html
<section id="entry-view" class="entry-view" aria-labelledby="entry-title">
    <header class="entry-header">
        <a class="entry-brand" href="#home" aria-label="집길 홈">집길</a>
        <nav class="entry-nav" aria-label="주요 메뉴">
            <button type="button" data-entry-route="housing">주거 찾기</button>
            <button type="button" data-entry-route="map">실거래 지도</button>
            <a href="#entry-guide">이용 안내</a>
        </nav>
        <span class="entry-status"><i aria-hidden="true"></i> 데이터는 조회 시 상태 확인</span>
    </header>
    <main id="entry-main" class="entry-main">
        <div id="entry-map" class="entry-map" aria-label="지역을 탐색하는 지도"></div>
        <p id="entry-map-status" class="entry-map-status" data-state="loading" aria-live="polite">지도 연결 중</p>
        <section id="entry-home-overlay" class="entry-home-overlay">
            <div class="entry-copy">
                <h1 id="entry-title" tabindex="-1">조건과 시세를 함께 보고, 살 곳을 정하세요.</h1>
                <p>임대주택과 실제 매매·전월세 가격을 같은 지도에서 이어서 확인합니다.</p>
            </div>
            <div class="entry-routes">
                <article class="entry-route entry-route-housing">
                    <span>01 · 맞춤 안내</span>
                    <h2>내게 맞는 주거 찾기</h2>
                    <p>임대주택, 주거비 지원, 예상 월 부담을 내 조건에 맞춰 확인합니다.</p>
                    <button type="button" data-entry-route="housing">내 조건으로 찾아보기 <span aria-hidden="true">→</span></button>
                </article>
                <article class="entry-route entry-route-map">
                    <span>02 · 바로 탐색</span>
                    <h2>지도에서 실거래 찾기</h2>
                    <p>지역 시세와 단지별 매매·전세·월세 거래를 질문 없이 확인합니다.</p>
                    <button type="button" data-entry-route="map">실거래 지도 열기 <span aria-hidden="true">→</span></button>
                </article>
            </div>
        </section>
        <aside id="housing-question-dialog" class="housing-question" role="dialog" aria-modal="false" aria-labelledby="housing-question-title" hidden>
            <button id="housing-question-close" class="housing-question-close" type="button" aria-label="질문 닫기">×</button>
            <p id="housing-question-progress" class="housing-question-progress" aria-live="polite">1 / 7</p>
            <h2 id="housing-question-title" tabindex="-1">어느 지역에서 살고 싶나요?</h2>
            <div id="housing-question-body"></div>
            <div class="housing-question-actions">
                <button id="housing-question-previous" type="button">이전</button>
                <button id="housing-question-next" type="button">다음</button>
            </div>
        </aside>
        <p class="entry-map-attribution">© OpenFreeMap · © OpenMapTiles · Data from OpenStreetMap</p>
    </main>
    <footer id="entry-guide" class="entry-footer">
        <span>실거래는 국토교통부 등 공식 출처를 사용합니다.</span>
        <span>각 조회 결과에서 출처와 마지막 확인 시각을 표시합니다.</span>
    </footer>
</section>
```

`#platform-view`에서는 기존 장식용 `#map-shell`을 제거한다. `#entry-view`의 실제 지도는 `map` 모드에서도 숨기지 않고, 기존 분석 화면은 지도 아래 이어서 표시한다.

- [ ] **Step 4: Add the dedicated design rules in `site/entry.css`**

Use the approved color and layout contract:

```css
.entry-main { position: relative; min-height: calc(100svh - 84px); overflow: clip; background: #e9f0ed; }
.entry-map { position: absolute; inset: 0; min-height: 680px; }
.entry-map::after { position: absolute; inset: 0; pointer-events: none; content: ""; background: linear-gradient(90deg, rgba(245, 248, 247, .94) 0%, rgba(245, 248, 247, .62) 42%, rgba(245, 248, 247, .12) 68%); }
.entry-home-overlay { position: relative; z-index: 2; display: grid; min-height: calc(100svh - 84px); align-content: end; gap: 40px; width: min(1320px, calc(100% - 64px)); margin: 0 auto; padding: 96px 0 48px; pointer-events: none; }
.entry-copy, .entry-routes { pointer-events: auto; }
.entry-copy h1 { max-width: 14ch; margin: 0; color: #17313c; font-family: "MaruBuri", "Nanum Myeongjo", Georgia, serif; font-size: clamp(48px, 4.4vw, 68px); line-height: 1.08; }
.entry-routes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; max-width: 920px; }
.entry-route { display: grid; min-height: 220px; grid-template-rows: auto auto 1fr auto; padding: 28px; border: 1px solid rgba(23, 49, 60, .16); border-radius: 18px; backdrop-filter: blur(16px); }
.entry-route-housing { background: rgba(23, 92, 84, .95); color: #fff; }
.entry-route-map { background: rgba(255, 255, 255, .94); color: #17313c; }
.housing-question { position: absolute; z-index: 4; top: 50%; right: max(32px, calc((100vw - 1320px) / 2)); width: min(420px, calc(100% - 48px)); max-height: calc(100svh - 140px); overflow: auto; padding: 32px; border: 1px solid rgba(23, 49, 60, .16); border-radius: 22px; background: rgba(255, 255, 255, .96); box-shadow: 0 26px 70px rgba(23, 49, 60, .22); transform: translateY(-50%); }
.entry-map-status, .entry-map-attribution { position: absolute; z-index: 3; bottom: 12px; margin: 0; padding: 5px 8px; border-radius: 5px; background: rgba(255, 255, 255, .9); color: #526b73; font-size: 10px; }
.entry-map-status { left: 12px; bottom: 38px; }
.entry-map-attribution { right: 12px; }
```

Add mobile behavior under the existing `@media (max-width: 720px)` block:

```css
@media (max-width: 720px) {
    .entry-main { min-height: calc(100svh - 70px); overflow: clip; }
    .entry-map { min-height: 100%; }
    .entry-map::after { background: linear-gradient(180deg, rgba(245, 248, 247, .4) 0%, rgba(245, 248, 247, .78) 50%, rgba(245, 248, 247, .97) 100%); }
    .entry-home-overlay { min-height: calc(100svh - 70px); width: calc(100% - 32px); gap: 24px; padding: 104px 0 28px; }
    .entry-copy h1 { max-width: 12ch; font-size: clamp(36px, 10vw, 46px); }
    .entry-routes { grid-template-columns: 1fr; gap: 10px; }
    .entry-route { min-height: 172px; padding: 22px; }
    .housing-question { position: fixed; top: auto; right: 0; bottom: 0; left: 0; width: 100%; max-height: min(68svh, 620px); border-radius: 24px 24px 0 0; transform: none; }
}
```

Remove the superseded `.entry-map-art`, `.map-shell`, `.map-shell-canvas`, `.map-shell-copy`, and `.map-shell-legend` rules from `site/style.css`. Keep shared color variables and all existing analysis styles unchanged.

- [ ] **Step 5: Run tests and production build**

Run: `npm test`

Run: `npm run typecheck`

Run: `npm run check:frontend`

Run: `npm run build`

Expected: all commands exit `0`.

- [ ] **Step 6: Commit the approved visual implementation**

```bash
git add site/index.html site/entry.css site/style.css test/frontend.test.ts
git commit -m "feat: implement map-first entry design"
```

---

### Task 6: Manual QA Gate and Accessibility Regression

**Files:**
- Modify only if an observed defect requires it: `site/index.html`, `site/entry.css`, `site/entry-experience.js`
- Evidence: `.codex-progress/entry-map-qa/desktop-home.png`
- Evidence: `.codex-progress/entry-map-qa/desktop-housing.png`
- Evidence: `.codex-progress/entry-map-qa/mobile-home.png`
- Evidence: `.codex-progress/entry-map-qa/mobile-housing.png`

**Interfaces:**
- Consumes: locally served built site and browser controls
- Produces: four screenshots plus an observed pass/fail record; `.codex-progress` remains untracked

- [ ] **Step 1: Start the local Worker once**

Run: `npx wrangler dev --local --port 8787`

Expected: Wrangler prints a local URL and remains running. Do not start a second server if port `8787` is already owned by this project.

- [ ] **Step 2: Verify the desktop home state at 1440×1000**

Observe all of the following before capturing `desktop-home.png`:

- real map tiles render and attribution is visible
- both cards are fully visible without horizontal scrolling
- card width, height, heading size, and arrow alignment match
- keyboard Tab reaches both routes and map controls
- no fake price or housing-count marker is present

- [ ] **Step 3: Verify the desktop housing state**

Open `내 조건으로 찾아보기` and observe all of the following before capturing `desktop-housing.png`:

- right-side popup appears while the map stays visible
- progress starts at `1 / 7`
- the first question is the preferred region
- the map canvas has not been recreated and the viewport has not jumped
- Escape closes the popup and restores focus to the trigger
- closing and reopening restores the last local answer

- [ ] **Step 4: Verify the transaction path**

Return home, choose `실거래 지도 열기`, and observe:

- no question popup opens
- the existing analysis filters appear directly after the map
- existing 시도 → 시군구 → 기준월 → optional 읍면동 flow remains usable
- browser Back returns to the exact home route

- [ ] **Step 5: Verify the 390×844 mobile states**

Observe all of the following before capturing `mobile-home.png` and `mobile-housing.png`:

- no horizontal scrolling at `390px`
- header shows the logo and data state without clipping
- two cards stack vertically with equal inner spacing
- question appears as a bottom sheet
- map top and current area remain visible above the sheet
- touch targets are at least `44px` high

- [ ] **Step 6: Verify the map failure state**

Block `tiles.openfreemap.org` in browser DevTools and reload. Observe:

- route cards and housing questions remain usable
- `#entry-map-status` announces the failure in text
- the page does not show an endless loading spinner

Restore network access after this check.

- [ ] **Step 7: Run the final regression suite once**

Run: `npm test && npm run typecheck && npm run check:frontend && npm run build`

Expected: every command exits `0` after any QA fix.

- [ ] **Step 8: Commit only QA fixes, if any**

If QA required source changes:

```bash
git add site/index.html site/entry.css site/entry-experience.js test/frontend.test.ts
git commit -m "fix: resolve entry map QA findings"
```

If no source change was required, do not create an empty commit. Do not add `.codex-progress` to Git.

## Definition of Done

- `#home` shows one real map with two equal entry cards.
- `#housing` keeps that map mounted and opens the seven-step desktop popup or mobile bottom sheet.
- question data survives close/reopen only in `localStorage` and is never sent to the Worker.
- `#map` opens the existing transaction analysis without showing housing questions.
- map/CDN failure does not block either route and is communicated in text.
- 1440px, 1280px, and 390px layouts have no horizontal clipping.
- all tests, typecheck, frontend syntax check, and dry-run build pass.
- manual QA screenshots exist locally and are not committed.
- no push, merge, deploy, D1 migration, or external-service setting change occurs in this plan.

## Follow-up Plans After This One

1. 공식 임대공고 수집·정규화·D1 스냅샷과 지도 공고 레이어
2. 실거래 지역 집계 API와 줌 단계별 시세 마커
3. 단지·건물 좌표와 지역·단지·주소 통합 검색
4. 브라우저 신청 가능성 판정, 월 실부담, 추천 결과
