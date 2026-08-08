import { ENTRY_MODE, readEntryMode, writeEntryMode } from './entry-route.js';
import { createEntryMap } from './entry-map.js';
import { loadMapProvider } from './map-loader.js';
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

export function initEntryExperience({ document, window, loadProvider = loadMapProvider }) {
    const elements = {
        skipLink: document.querySelector('.skip-link'),
        entryView: document.getElementById('entry-view'),
        entryTitle: document.getElementById('entry-title'),
        platformView: document.getElementById('platform-view'),
        mainContent: document.getElementById('main-content'),
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
        loadProvider: () => loadProvider({ document, window }),
        onStatus: status => {
            elements.mapStatus.dataset.state = status;
            elements.mapStatus.textContent = status === 'ready'
                ? '지도 연결됨'
                : status === 'fallback'
                    ? '기본 지도로 표시 중'
                    : '지도를 불러오지 못했습니다. 아래 경로 선택은 계속 사용할 수 있습니다.';
        },
    });
    let questionIndex = 0;
    let profile = loadHousingProfile(window.localStorage);
    let lastTrigger = null;

    function focusMode(mode) {
        if (mode === ENTRY_MODE.HOUSING) {
            elements.closeQuestion.focus({ preventScroll: true });
            return;
        }
        const target = mode === ENTRY_MODE.MAP ? elements.mainContent : elements.entryTitle;
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
    }

    function isVisible(element) {
        return Boolean(element && !element.hidden && !element.closest?.('[hidden]'));
    }

    function recordAnswer(questionId, value) {
        profile = answerHousingQuestion(profile, questionId, value);
        saveHousingProfile(window.localStorage, profile);
        elements.nextQuestion.disabled = false;
    }

    function clearAnswer(questionId) {
        const answers = { ...profile.answers };
        delete answers[questionId];
        profile = { ...profile, answers, updatedAt: new Date().toISOString() };
        saveHousingProfile(window.localStorage, profile);
        elements.nextQuestion.disabled = true;
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
            if (typeof savedAnswer === 'string' && savedAnswer.startsWith('sido:')) {
                regionSelect.value = savedAnswer.slice('sido:'.length);
            }
            regionSelect.addEventListener('change', () => {
                directRegion.value = '';
                if (regionSelect.value) {
                    recordAnswer(step.question.id, `sido:${regionSelect.value}`);
                } else {
                    clearAnswer(step.question.id);
                }
            });

            const directRegion = document.createElement('input');
            directRegion.type = 'search';
            if (typeof savedAnswer === 'string' && savedAnswer.startsWith('text:')) {
                directRegion.value = savedAnswer.slice('text:'.length);
            }
            directRegion.placeholder = '원하는 지역명 직접 입력';
            directRegion.setAttribute('aria-label', '원하는 지역명 직접 입력');
            directRegion.addEventListener('change', () => {
                const value = directRegion.value.trim();
                regionSelect.value = '';
                if (value) {
                    recordAnswer(step.question.id, `text:${value}`);
                } else {
                    clearAnswer(step.question.id);
                }
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
        elements.skipLink.setAttribute('href', mode === ENTRY_MODE.MAP ? '#main-content' : '#entry-main');
        if (updateHash) writeEntryMode(window.history, window.location, mode);
        if (mode === ENTRY_MODE.HOUSING) renderQuestion();
        mapController.resize();
        focusMode(mode);
    }

    function openHousing(trigger) {
        lastTrigger = trigger;
        setMode(ENTRY_MODE.HOUSING);
    }

    function closeHousing() {
        const trigger = lastTrigger;
        lastTrigger = null;
        saveHousingProfile(window.localStorage, profile);
        setMode(ENTRY_MODE.HOME);
        if (isVisible(trigger)) trigger.focus({ preventScroll: true });
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
