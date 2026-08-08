import { calculateMedian } from './statistics.js';
import { initComparison } from './comparison.js';
import { isAnalysisReady } from './query-readiness.js';
import { resolveTransactionLocation } from './transaction-location.js';
import { resolveTransactionStatus } from './transaction-status.js';
import { listPeriodMonths, selectHistoryMonths } from './history-period.js';
import { formatRentPrice, mapRentTransaction, RENT_SUPPORTED_TYPES } from './rent-transactions.js';
import { initEntryExperience } from './entry-experience.js';

/**
 * 부동산 분석 플랫폼 PRO v15
 *
 * [핵심 수정] API 응답 필드가 한글(아파트, 거래금액)이 아니라
 *             영문(aptNm, dealAmount)이었음 → 전면 수정 완료
 * [핵심 수정] Cloudflare Worker API로 프런트엔드와 백엔드 통합
 */

// 국토부 API 키는 Cloudflare Worker Secret에서만 사용합니다.
const API_ENDPOINT = '/api/real-estate';
const DEMO_SOURCE = '개발용 더미 데이터 (공식 연동 대기)';

// 1. 전국 17개 시/도 + 주요 시/군/구 법정동코드 (행정안전부 기준)
// ===================================================================
const REGION_DATA = {
    "11": {
        name: "서울특별시",
        guguns: [
            { code: "11680", name: "강남구" }, { code: "11740", name: "강동구" }, { code: "11305", name: "강북구" }, { code: "11500", name: "강서구" },
            { code: "11620", name: "관악구" }, { code: "11215", name: "광진구" }, { code: "11530", name: "구로구" }, { code: "11545", name: "금천구" },
            { code: "11350", name: "노원구" }, { code: "11320", name: "도봉구" }, { code: "11230", name: "동대문구" }, { code: "11590", name: "동작구" },
            { code: "11440", name: "마포구" }, { code: "11410", name: "서대문구" }, { code: "11650", name: "서초구" }, { code: "11200", name: "성동구" },
            { code: "11290", name: "성북구" }, { code: "11710", name: "송파구" }, { code: "11470", name: "양천구" }, { code: "11560", name: "영등포구" },
            { code: "11170", name: "용산구" }, { code: "11380", name: "은평구" }, { code: "11110", name: "종로구" }, { code: "11140", name: "중구" },
            { code: "11260", name: "중랑구" }
        ]
    },
    "26": {
        name: "부산광역시",
        guguns: [
            { code: "26110", name: "중구" }, { code: "26140", name: "서구" }, { code: "26170", name: "동구" }, { code: "26200", name: "영도구" },
            { code: "26230", name: "부산진구" }, { code: "26260", name: "동래구" }, { code: "26290", name: "남구" }, { code: "26320", name: "북구" },
            { code: "26350", name: "해운대구" }, { code: "26380", name: "사하구" }, { code: "26410", name: "금정구" }, { code: "26440", name: "강서구" },
            { code: "26470", name: "연제구" }, { code: "26500", name: "수영구" }, { code: "26530", name: "사상구" }, { code: "26710", name: "기장군" }
        ]
    },
    "27": {
        name: "대구광역시",
        guguns: [
            { code: "27110", name: "중구" }, { code: "27140", name: "동구" }, { code: "27170", name: "서구" }, { code: "27200", name: "남구" },
            { code: "27230", name: "북구" }, { code: "27260", name: "수성구" }, { code: "27290", name: "달서구" }, { code: "27710", name: "달성군" }
        ]
    },
    "28": {
        name: "인천광역시",
        guguns: [
            { code: "28110", name: "중구" }, { code: "28140", name: "동구" }, { code: "28177", name: "미추홀구" }, { code: "28185", name: "연수구" },
            { code: "28200", name: "남동구" }, { code: "28237", name: "부평구" }, { code: "28245", name: "계양구" }, { code: "28260", name: "서구" },
            { code: "28710", name: "강화군" }
        ]
    },
    "29": {
        name: "광주광역시",
        guguns: [
            { code: "29110", name: "동구" }, { code: "29140", name: "서구" }, { code: "29155", name: "남구" },
            { code: "29170", name: "북구" }, { code: "29200", name: "광산구" }
        ]
    },
    "30": {
        name: "대전광역시",
        guguns: [
            { code: "30110", name: "동구" }, { code: "30140", name: "중구" }, { code: "30170", name: "서구" },
            { code: "30200", name: "유성구" }, { code: "30230", name: "대덕구" }
        ]
    },
    "31": {
        name: "울산광역시",
        guguns: [
            { code: "31110", name: "중구" }, { code: "31140", name: "남구" }, { code: "31170", name: "동구" },
            { code: "31200", name: "북구" }, { code: "31710", name: "울주군" }
        ]
    },
    "36": {
        name: "세종특별자치시",
        guguns: [{ code: "36110", name: "세종특별자치시" }]
    },
    "41": {
        name: "경기도",
        guguns: [
            { code: "41111", name: "수원시 장안구" }, { code: "41113", name: "수원시 권선구" }, { code: "41115", name: "수원시 팔달구" }, { code: "41117", name: "수원시 영통구" },
            { code: "41131", name: "성남시 수정구" }, { code: "41133", name: "성남시 중원구" }, { code: "41135", name: "성남시 분당구" },
            { code: "41150", name: "의정부시" }, { code: "41171", name: "안양시 만안구" }, { code: "41173", name: "안양시 동안구" },
            { code: "41190", name: "부천시" }, { code: "41210", name: "광명시" }, { code: "41220", name: "평택시" },
            { code: "41271", name: "안산시 상록구" }, { code: "41273", name: "안산시 단원구" },
            { code: "41281", name: "고양시 덕양구" }, { code: "41285", name: "고양시 일산동구" }, { code: "41287", name: "고양시 일산서구" },
            { code: "41290", name: "과천시" }, { code: "41310", name: "구리시" }, { code: "41360", name: "남양주시" },
            { code: "41370", name: "오산시" }, { code: "41390", name: "시흥시" }, { code: "41410", name: "군포시" },
            { code: "41430", name: "의왕시" }, { code: "41450", name: "하남시" },
            { code: "41461", name: "용인시 처인구" }, { code: "41463", name: "용인시 기흥구" }, { code: "41465", name: "용인시 수지구" },
            { code: "41480", name: "파주시" }, { code: "41500", name: "이천시" }, { code: "41550", name: "안성시" },
            { code: "41570", name: "김포시" }, { code: "41590", name: "화성시" }, { code: "41610", name: "광주시" },
            { code: "41630", name: "양주시" }, { code: "41650", name: "포천시" }
        ]
    },
    "42": {
        name: "강원특별자치도",
        guguns: [
            { code: "42110", name: "춘천시" }, { code: "42130", name: "원주시" }, { code: "42150", name: "강릉시" },
            { code: "42170", name: "동해시" }, { code: "42190", name: "태백시" }, { code: "42210", name: "속초시" }, { code: "42230", name: "삼척시" }
        ]
    },
    "43": {
        name: "충청북도",
        guguns: [
            { code: "43111", name: "청주시 상당구" }, { code: "43112", name: "청주시 서원구" }, { code: "43113", name: "청주시 흥덕구" }, { code: "43114", name: "청주시 청원구" },
            { code: "43130", name: "충주시" }, { code: "43150", name: "제천시" }
        ]
    },
    "44": {
        name: "충청남도",
        guguns: [
            { code: "44131", name: "천안시 동남구" }, { code: "44133", name: "천안시 서북구" },
            { code: "44150", name: "공주시" }, { code: "44180", name: "보령시" }, { code: "44200", name: "아산시" },
            { code: "44210", name: "서산시" }, { code: "44230", name: "논산시" }, { code: "44270", name: "당진시" }
        ]
    },
    "45": {
        name: "전북특별자치도",
        guguns: [
            { code: "45111", name: "전주시 완산구" }, { code: "45113", name: "전주시 덕진구" },
            { code: "45130", name: "군산시" }, { code: "45140", name: "익산시" }, { code: "45180", name: "정읍시" }, { code: "45190", name: "남원시" }
        ]
    },
    "46": {
        name: "전라남도",
        guguns: [
            { code: "46110", name: "목포시" }, { code: "46130", name: "여수시" }, { code: "46150", name: "순천시" },
            { code: "46170", name: "나주시" }, { code: "46230", name: "광양시" }
        ]
    },
    "47": {
        name: "경상북도",
        guguns: [
            { code: "47111", name: "포항시 남구" }, { code: "47113", name: "포항시 북구" },
            { code: "47130", name: "경주시" }, { code: "47150", name: "김천시" }, { code: "47170", name: "안동시" },
            { code: "47190", name: "구미시" }, { code: "47210", name: "영주시" }, { code: "47230", name: "영천시" }
        ]
    },
    "48": {
        name: "경상남도",
        guguns: [
            { code: "48121", name: "창원시 의창구" }, { code: "48123", name: "창원시 성산구" },
            { code: "48125", name: "창원시 마산합포구" }, { code: "48127", name: "창원시 마산회원구" }, { code: "48129", name: "창원시 진해구" },
            { code: "48170", name: "진주시" }, { code: "48220", name: "통영시" }, { code: "48240", name: "사천시" },
            { code: "48250", name: "김해시" }, { code: "48330", name: "양산시" }
        ]
    },
    "50": {
        name: "제주특별자치도",
        guguns: [{ code: "50110", name: "제주시" }, { code: "50130", name: "서귀포시" }]
    }
};

// ===================================================================
// 2. 유형별 한글 이름
const TYPE_NAMES = {
    apt: "아파트", rhous: "연립/다세대", shous: "단독/다가구", office: "오피스텔",
    comm: "상업업무용", fact: "공장/창고", land: "토지", right: "분양/입주권"
};

// ===================================================================
// 3. DOM 요소 캐싱 및 전역 상태
// ===================================================================
const sidoSelect = document.getElementById('sido-select');
const gugunSelect = document.getElementById('gugun-select');
const dongSelect = document.getElementById('dong-select');
const dateSelect = document.getElementById('date-select');
const periodSelect = document.getElementById('period-select');
const fetchBtn = document.getElementById('fetch-live-btn');
const analysisBody = document.getElementById('analysis-body');
const updateTime = document.getElementById('update-time');
const queryStatus = document.getElementById('query-status');
const resultCount = document.getElementById('result-count');
const resultsSummary = document.getElementById('results-summary');
const metricPeriod = document.getElementById('metric-period');
const statTotal = document.getElementById('stat-total');
const statMedian = document.getElementById('stat-median');
const statAverage = document.getElementById('stat-average');
const statTypes = document.getElementById('stat-types');
const statValid = document.getElementById('stat-valid');
const statCancelled = document.getElementById('stat-cancelled');
const trendBars = document.getElementById('trend-bars');
const trendCaption = document.getElementById('trend-caption');
const trendSummary = document.getElementById('trend-summary');
const themeToggle = document.getElementById('theme-toggle');
const detailPanel = document.getElementById('detail-panel');
const detailClose = document.getElementById('detail-close');
const detailPrice = document.getElementById('detail-price');
const detailStatus = document.getElementById('detail-status');
const detailName = document.getElementById('detail-name');
const detailType = document.getElementById('detail-type');
const detailDate = document.getElementById('detail-date');
const detailSize = document.getElementById('detail-size');
const detailFloor = document.getElementById('detail-floor');
const detailYear = document.getElementById('detail-year');
const detailAddress = document.getElementById('detail-address');
const detailPnu = document.getElementById('detail-pnu');
const detailBuilding = document.getElementById('detail-building');
const detailLandUse = document.getElementById('detail-land-use');
const detailOrdinance = document.getElementById('detail-ordinance');
const detailContractType = document.getElementById('detail-contract-type');
const detailRenewalRight = document.getElementById('detail-renewal-right');
const detailPreviousRent = document.getElementById('detail-previous-rent');
const detailSource = document.getElementById('detail-source');
const detailConfidence = document.getElementById('detail-confidence');
const detailUpdated = document.getElementById('detail-updated');
const detailHistoryList = document.getElementById('detail-history-list');
const entryView = document.getElementById('entry-view');
const platformView = document.getElementById('platform-view');
const mapShell = document.getElementById('map-shell');
const mapShellLabel = document.getElementById('map-shell-label');
const mapShellTitle = document.getElementById('map-shell-title');
const mapShellDescription = document.getElementById('map-shell-description');
const entryBack = document.getElementById('entry-back');
const skipLink = document.querySelector('.skip-link');

// 페이지네이션 및 상태 변수
let globalData = [];
let filteredData = [];
let currentPage = 1;
let itemsPerPage = 30;
let sortMode = 'date-desc';
const columnVisibility = { property: true, price: true, date: true, analysis: true };
let lastQueryHadError = false;
let lastQueryHadPartialError = false;
let preparedData = [];
let preparedQueryKey = '';
let preparedHadPartialError = false;
let dongRequestId = 0;
let isPreparingDongs = false;
let demoDataActive = false;

const paginationContainer = document.getElementById('pagination-container');
const pageSizeSelect = document.getElementById('page-size');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');
const pageInfo = document.getElementById('page-info');
const sortSelect = document.getElementById('sort-select');
const exportCsvBtn = document.getElementById('export-csv-btn');
const columnsToggle = document.getElementById('columns-toggle');
const columnsMenu = document.getElementById('columns-menu');

// 히스토리 요소
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function setQueryStatus(message, state = '') {
    if (!queryStatus) return;
    queryStatus.innerText = demoDataActive ? `${message} · 개발용 더미 데이터` : message;
    if (state) queryStatus.dataset.state = state;
    else delete queryStatus.dataset.state;
}

function getSelectedTypes() {
    return Array.from(document.querySelectorAll('input[name="type"]:checked')).map(input => input.value);
}

function isDemoDataResponse(response) {
    const isDemo = response.headers.get('X-Data-Mode') === 'demo';
    if (isDemo) demoDataActive = true;
    return isDemo;
}

function getSelectedModes() {
    return Array.from(document.querySelectorAll('input[name="transaction-mode"]:checked')).map(input => input.value);
}

function getQuerySelection() {
    return {
        sidoCd: sidoSelect.value,
        lawdCd: gugunSelect.value,
        dealYmd: dateSelect.value,
        selectedTypes: getSelectedTypes(),
        selectedModes: getSelectedModes(),
        dong: dongSelect.value
    };
}

function getQueryKey(query = getQuerySelection()) {
    return [query.lawdCd, query.dealYmd, ...query.selectedTypes.sort(), ...query.selectedModes.sort()].join('|');
}

function syncFetchButton() {
    const query = getQuerySelection();
    fetchBtn.disabled = isPreparingDongs
        || preparedQueryKey !== getQueryKey(query)
        || !isAnalysisReady(query);
}

function setFetchButton(isLoading) {
    fetchBtn.innerHTML = isLoading
        ? '<span class="button-spinner" aria-hidden="true"></span><span>데이터 불러오는 중</span>'
        : '<span class="button-icon">↗</span><span>분석 시작</span>';
    if (isLoading) fetchBtn.disabled = true;
    else syncFetchButton();
}

function initTheme() {
    const savedTheme = localStorage.getItem('realEstateTheme');
    const preferredTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = savedTheme || preferredTheme;
    updateThemeButton();
}

function updateThemeButton() {
    if (!themeToggle) return;
    const isDark = document.documentElement.dataset.theme === 'dark';
    themeToggle.innerHTML = isDark ? '☼<span>라이트</span>' : '◐<span>다크</span>';
    themeToggle.setAttribute('aria-label', isDark ? '라이트모드로 전환' : '다크모드로 전환');
}

themeToggle?.addEventListener('click', () => {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem('realEstateTheme', nextTheme);
    updateThemeButton();
});

function formatPrice(value) {
    if (!value) return '—';
    return `${Math.round(value).toLocaleString()}만원`;
}

function renderMetrics(data) {
    const total = data.length;
    const trades = data.filter(item => item.transactionMode !== 'rent');
    const rents = data.filter(item => item.transactionMode === 'rent');
    const cancelled = trades.filter(item => item.cancelled);
    const valid = data.filter(item => !item.cancelled);
    const prices = trades.filter(item => !item.cancelled).map(item => item.price).filter(price => Number.isFinite(price) && price > 0);
    const median = calculateMedian(prices);
    const average = prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : 0;
    const types = new Set(valid.map(item => item.typeName).filter(Boolean));
    const periodLabel = dateSelect.options[dateSelect.selectedIndex]?.text || '조회 전';

    statTotal.innerText = total ? valid.length.toLocaleString() : '—';
    statMedian.innerText = formatPrice(median);
    statAverage.innerText = formatPrice(average);
    statTypes.innerText = types.size ? `${types.size}종` : '—';
    statValid.innerText = total ? valid.length.toLocaleString() : '—';
    statCancelled.innerText = total ? cancelled.length.toLocaleString() : '—';
    metricPeriod.innerText = total ? periodLabel : '조회 전';
    resultCount.innerText = `${total.toLocaleString()}건`;
    resultsSummary.innerText = total
        ? `${periodLabel} · 매매 ${trades.length.toLocaleString()}건 · 전월세 ${rents.length.toLocaleString()}건 · 취소 ${cancelled.length.toLocaleString()}건`
        : '조회 조건을 선택하면 거래가 표시됩니다.';
}

function renderTrend(data) {
    const monthMap = new Map();
    data.filter(item => !item.cancelled && item.transactionMode !== 'rent').forEach(item => {
        if (!item.date || !item.price) return;
        const month = item.date.slice(0, 7);
        const current = monthMap.get(month) || [];
        current.push(item.price);
        monthMap.set(month, current);
    });
    const months = [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-8);
    if (!trendBars || !months.length) {
        if (trendBars) trendBars.innerHTML = '<div class="chart-empty">분석을 시작하면 월별 흐름을 보여드립니다.</div>';
        if (trendCaption) trendCaption.innerText = '데이터를 조회하면 표시됩니다';
        if (trendSummary) trendSummary.innerText = '분석을 시작하면 유효 거래의 월별 가격 흐름이 표시됩니다.';
        return;
    }

    const values = months.map(([, prices]) => calculateMedian(prices));
    const max = Math.max(...values);
    const min = Math.min(...values);
    const span = Math.max(max - min, 1);
    trendBars.innerHTML = months.map(([month], index) => {
        const height = 28 + ((values[index] - min) / span) * 62;
        const label = `${month.slice(5)}월 중앙 거래가 ${Math.round(values[index]).toLocaleString()}만원`;
        return `<span class="trend-bar${index === months.length - 1 ? ' is-latest' : ''}" style="height:${height}%" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"></span>`;
    }).join('');
    trendCaption.innerText = `${months[0][0].replace('-', '.')} — ${months[months.length - 1][0].replace('-', '.')}`;
    if (trendSummary) {
        trendSummary.innerText = `${months.map(([month], index) => `${month.replace('-', '년 ')}월 중앙 거래가 ${Math.round(values[index]).toLocaleString()}만원`).join('. ')}.`;
    }
}

// ===================================================================
// 4. 날짜 자동 생성 (현재 시점 기준)
// ===================================================================
function initDateOptions() {
    const now = new Date(); // 항상 현재 시점
    for (let i = 0; i < 60; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const opt = document.createElement('option');
        opt.value = `${yyyy}${mm}`;
        opt.innerText = `${yyyy}년 ${mm}월`;
        // 전월을 기본값으로 (실거래 신고 지연 30일 고려)
        if (i === 1) opt.selected = true;
        dateSelect.appendChild(opt);
    }
}

// ===================================================================
// 5. 시/도 선택 → 시/군/구 동적 로딩
// ===================================================================
function markQueryDirty() {
    if (globalData.length) setQueryStatus('조회 조건이 바뀌었습니다. 다시 분석해 주세요.');
    comparisonController.setCurrentAvailable(false);
}

function resetDongOptions(message = '읍/면/동 선택') {
    dongSelect.innerHTML = `<option value="">${message}</option>`;
    dongSelect.disabled = true;
    preparedData = [];
    preparedQueryKey = '';
    preparedHadPartialError = false;
    isPreparingDongs = false;
    dongRequestId += 1;
    syncFetchButton();
}

sidoSelect.addEventListener('change', () => {
    const sidoCode = sidoSelect.value;
    gugunSelect.innerHTML = '<option value="">시/군/구 선택</option>';
    gugunSelect.disabled = !sidoCode;
    dateSelect.disabled = true;
    resetDongOptions('시/군/구 선택 후 조회');
    if (sidoCode && REGION_DATA[sidoCode]) {
        REGION_DATA[sidoCode].guguns.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.code;
            opt.innerText = g.name;
            gugunSelect.appendChild(opt);
        });
    }
    markQueryDirty();
});

gugunSelect.addEventListener('change', () => {
    dateSelect.disabled = !gugunSelect.value;
    resetDongOptions(gugunSelect.value ? '읍/면/동 불러오는 중' : '시/군/구 선택 후 조회');
    markQueryDirty();
    if (gugunSelect.value) prepareDongOptions();
});

dateSelect.addEventListener('change', () => {
    resetDongOptions('읍/면/동 불러오는 중');
    markQueryDirty();
    prepareDongOptions();
});

document.querySelectorAll('input[name="type"]').forEach(checkbox => checkbox.addEventListener('change', () => {
    resetDongOptions(gugunSelect.value ? '읍/면/동 불러오는 중' : '시/군/구 선택 후 조회');
    markQueryDirty();
    if (gugunSelect.value) prepareDongOptions();
}));

document.querySelectorAll('input[name="transaction-mode"]').forEach(checkbox => checkbox.addEventListener('change', () => {
    resetDongOptions(gugunSelect.value ? '읍·면·동을 불러오는 중' : '시/군/구 선택 후 조회');
    markQueryDirty();
    if (gugunSelect.value) prepareDongOptions();
}));

// ===================================================================
// 6. [핵심] API 호출 로직 (영문 필드명 + Cloudflare Worker)
// ===================================================================

/**
 * 단일 유형의 데이터를 API에서 가져오는 함수
 *
 * ⭐ 핵심 수정: API 응답 필드가 한글이 아니라 영문입니다!
 * - aptNm (아파트명), dealAmount (거래금액), excluUseAr (전용면적)
 * - dealYear (년), dealMonth (월), dealDay (일)
 * - umdNm (법정동명)
 */
async function fetchSingleType(type, lawdCd, dealYmd) {
    if (!TYPE_NAMES[type]) return [];

    const params = new URLSearchParams({ type, lawdCd, dealYmd });
    const url = `${API_ENDPOINT}?${params.toString()}`;

    try {
        const response = await fetch(url);
        const isDemo = isDemoDataResponse(response);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[${type}] HTTP 에러 ${response.status}:`, errorText);
            throw new Error(`HTTP ${response.status}`);
        }

        const resData = await response.json();

        // API 에러 체크
        // ⭐ 핵심 수정: resultCode가 "00"이 아니라 "000"으로 오는 경우가 있음!
        //    따라서 startsWith("00")으로 체크해야 정상 동작합니다.
        const resultCode = resData.response?.header?.resultCode || '';
        if (!resultCode.startsWith("00")) {
            const resultMessage = resData.response?.header?.resultMsg || '알 수 없는 API 오류';
            console.warn(`[${type}] API 오류 (코드: ${resultCode}): ${resultMessage}`);
            throw new Error(`${type} API 오류: ${resultMessage}`);
        }

        const items = resData.response?.body?.items?.item;
        if (!items) return [];

        const list = Array.isArray(items) ? items : [items];

        // ⭐ 영문 필드명을 사용하여 데이터 파싱
        // 각 유형별로 실제 API가 반환하는 필드명이 모두 다름! (직접 검증 완료)
        return list.map(item => {
            // 매물 이름: 유형별로 필드명이 다름
            // - apt(아파트): aptNm
            // - rhous(연립다세대): mhouseNm
            // - shous(단독다가구): 별도 필드 없음 → 법정동+지번 사용
            // - office(오피스텔): offiNm
            // - comm(상업업무용): 별도 필드 없음 → 법정동+지번 사용
            // - land(토지): 별도 필드 없음 → 법정동+지번 사용
            // - right(분양입주권): aptNm
            const location = resolveTransactionLocation(item);
            const displayJibun = location.jibun;

            const name = item.aptNm       // 아파트, 분양입주권
                || item.mhouseNm    // 연립다세대
                || item.offiNm      // 오피스텔
                || `${item.umdNm || ''} ${displayJibun}`.trim()  // 나머지 (법정동 + 지번)
                || "매물정보 없음";

            // 전용면적: 유형별로 필드명이 모두 다름!
            // - apt(아파트): excluUseAr (전용면적)
            // - rhous(연립다세대): excluUseAr (전용면적)
            // - shous(단독다가구): totalFloorAr (연면적), plottageAr (대지면적)
            // - office(오피스텔): excluUseAr (전용면적)
            // - comm(상업업무용): buildingAr (건물면적), plottageAr (대지면적)
            // - land(토지): dealArea (거래면적)
            // - right(분양입주권): excluUseAr (전용면적)
            // - fact(공장): buildingAr 또는 plottageAr
            // 면적 종류 및 값 판별
            let size = 0;
            let sizeLabel = "면적";

            // 1. 전용면적이 명시되어 있으면 최우선 (아파트, 오피스텔 등)
            if (item.excluUseAr) { 
                size = item.excluUseAr; 
                sizeLabel = "전용"; 
            } 
            // 2. 상업업무용(comm)의 경우 buildingAr가 사실상 구분상가의 전용면적임
            else if (type === 'comm' && item.buildingAr) {
                size = item.buildingAr;
                // 건물유형이 '집합'이면 구분상가이므로 [전용], 아니면 [건물]로 표시
                const isJiphap = (item.buildingType || "").includes("집합");
                sizeLabel = isJiphap ? "전용" : "건물";
            }
            else if (item.totalFloorAr) { size = item.totalFloorAr; sizeLabel = "연면적"; }
            else if (item.buildingAr) { size = item.buildingAr; sizeLabel = "건물"; }
            else if (item.dealArea) { size = item.dealArea; sizeLabel = "거래"; }
            else if (item.plottageAr) { size = item.plottageAr; sizeLabel = "대지"; }
            else { size = 0; sizeLabel = "면적"; }

            // 건물 용도/유형 정보 (있으면 표시)
            const buildingType = item.buildingType || item.buildingUse || item.houseType || '';

            // 거래금액: 쉼표 포함 문자열 → 숫자로 변환
            const rawPrice = String(item.dealAmount || '0').replace(/,/g, '').trim();
            const price = parseInt(rawPrice) || 0;

            // 계약일자: 년, 월, 일 조합
            const year = item.dealYear || '0000';
            const month = String(item.dealMonth || '01').padStart(2, '0');
            const day = String(item.dealDay || '01').padStart(2, '0');

            const transactionStatus = resolveTransactionStatus(item);

            // 층수 포맷팅 (지하층 표시)
            let floorText = item.floor || '-';
            if (floorText !== '-') {
                const floorNum = parseInt(floorText);
                if (!isNaN(floorNum)) {
                    if (floorNum < 0) {
                        floorText = `지하 ${Math.abs(floorNum)}층`;
                    } else {
                        floorText = `${floorNum}층`;
                    }
                } else if (typeof floorText === 'string' && floorText.toUpperCase().startsWith('B')) {
                    // "B1" 같은 문자열 대응
                    floorText = `지하 ${floorText.substring(1)}층`;
                } else {
                    floorText = `${floorText}층`;
                }
            }

            return {
                name: name,
                type: type,
                typeName: TYPE_NAMES[type] || type,
                size: String(size),
                sizeLabel: sizeLabel, // 면적 종류 추가
                price: price,
                date: `${year}-${month}-${day}`,
                floor: floorText,                   // 층수 (포맷팅됨)
                buildYear: item.buildYear || '-',   // 건축년도
                umdNm: item.umdNm || '',            // 법정동명
                jibun: displayJibun,                // 복구된 지번 적용
                buildingType: buildingType,          // 건물 용도
                ...transactionStatus,
                source: isDemo ? DEMO_SOURCE : '국토교통부 실거래가 Open API',
                confidence: isDemo ? '개발용 샘플 거래' : location.confidence
            };
        });
    } catch (e) {
        console.error(`[${type}] 데이터 수집 실패:`, e);
        throw e;
    }
}

/**
 * 체크된 모든 유형에 대해 병렬 API 호출 후 결과 병합
 */
async function fetchSingleRentType(type, lawdCd, dealYmd, selectedModes) {
    if (!RENT_SUPPORTED_TYPES.has(type)) return [];
    const params = new URLSearchParams({ type, lawdCd, dealYmd });
    const response = await fetch(`${API_ENDPOINT}/rent?${params}`);
    const isDemo = isDemoDataResponse(response);
    if (!response.ok) throw new Error(`rent HTTP ${response.status}`);
    const payload = await response.json();
    return (payload.normalizedRent?.items || [])
        .filter(item => selectedModes.includes(item.rentType))
        .map(item => mapRentTransaction(
            item,
            TYPE_NAMES,
            isDemo ? DEMO_SOURCE : undefined,
            isDemo ? '개발용 샘플 전월세 거래' : undefined,
        ));
}

async function getMultiTypeData() {
    lastQueryHadError = false;
    lastQueryHadPartialError = false;
    demoDataActive = false;
    const lawdCd = gugunSelect.value;
    const dealYmd = dateSelect.value;
    const selectedCheckboxes = document.querySelectorAll('input[name="type"]:checked');

    if (!lawdCd) {
        setQueryStatus('시·군·구를 먼저 선택해 주세요.', 'error');
        return null;
    }
    if (selectedCheckboxes.length === 0) {
        setQueryStatus('부동산 유형을 하나 이상 선택해 주세요.', 'error');
        return null;
    }

    const selectedTypes = Array.from(selectedCheckboxes).map(cb => cb.value);
    const selectedModes = getSelectedModes();
    if (selectedModes.length === 0) {
        setQueryStatus('거래 구분을 하나 이상 선택해 주세요.', 'error');
        return null;
    }

    try {
        const requests = [];
        selectedTypes.forEach(type => {
            if (selectedModes.includes('trade')) requests.push({ label: `매매-${type}`, promise: fetchSingleType(type, lawdCd, dealYmd) });
            if (selectedModes.includes('jeonse') || selectedModes.includes('monthly')) {
                if (RENT_SUPPORTED_TYPES.has(type)) requests.push({ label: `전월세-${type}`, promise: fetchSingleRentType(type, lawdCd, dealYmd, selectedModes) });
            }
        });
        if (requests.length === 0) {
            setQueryStatus('선택한 유형은 전월세 조회를 지원하지 않습니다.', 'error');
            return null;
        }
        const results = await Promise.allSettled(
            requests.map(request => request.promise)
        );

        let combined = [];
        const failedTypes = [];

        results.forEach((result, i) => {
            if (result.status === 'fulfilled' && result.value) {
                combined = [...combined, ...result.value];
                console.log(`[${requests[i].label}] ${result.value.length}건 수집 완료`);
            } else if (result.status === 'rejected') {
                console.error(`[${requests[i].label}] 실패:`, result.reason);
                failedTypes.push(requests[i].label);
            }
        });

        if (failedTypes.length === requests.length) {
            lastQueryHadError = true;
            setQueryStatus('데이터 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.', 'error');
            return null;
        }
        if (failedTypes.length) lastQueryHadPartialError = true;

        // 계약일 기준 최신순 정렬
        combined.sort((a, b) => new Date(b.date) - new Date(a.date));
        return combined;

    } catch (e) {
        setQueryStatus('데이터 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.', 'error');
        return null;
    }
}

async function loadHistoryTrend(query, currentData) {
    if (!query.selectedModes.includes('trade')) return currentData;
    const periodMonths = listPeriodMonths(query.dealYmd, Number(periodSelect.value));
    if (periodMonths.length <= 1) return currentData;

    const statusResults = await Promise.allSettled(query.selectedTypes.map(async type => {
        const params = new URLSearchParams({ type, lawdCd: query.lawdCd, dealYmd: query.dealYmd });
        const response = await fetch(`${API_ENDPOINT}/history?${params}`);
        isDemoDataResponse(response);
        if (!response.ok) throw new Error(`history HTTP ${response.status}`);
        return { type, payload: await response.json() };
    }));

    const requests = [];
    let availableCount = 0;
    let missingCount = 0;
    statusResults.forEach(result => {
        if (result.status !== 'fulfilled') return;
        const selection = selectHistoryMonths(result.value.payload.progress, periodMonths);
        availableCount += selection.available.length;
        missingCount += selection.missing.length;
        selection.monthsToLoad
            .filter(month => month !== query.dealYmd)
            .forEach(month => requests.push(fetchSingleType(result.value.type, query.lawdCd, month)));
    });

    const loaded = await Promise.allSettled(requests);
    const historicalData = loaded.flatMap(result => result.status === 'fulfilled' ? result.value : []);
    const combined = [...currentData, ...historicalData];
    const filtered = query.dong ? combined.filter(item => item.umdNm === query.dong) : combined;
    renderTrend(filtered);

    if (demoDataActive) {
        const loadedMonths = new Set(filtered.map(item => item.date?.slice(0, 7)).filter(Boolean)).size;
        setQueryStatus(`${filteredData.length.toLocaleString()}건 분석 완료 · 추이 ${loadedMonths}개월 표시`, 'warning');
        return filtered;
    }

    if (statusResults.some(result => result.status === 'rejected')) {
        setQueryStatus('기준 월 분석은 완료했지만 과거 수집 상태 일부를 확인하지 못했습니다.', 'warning');
        return filtered;
    }
    const loadedMonths = new Set(filtered.map(item => item.date?.slice(0, 7)).filter(Boolean)).size;
    setQueryStatus(
        `${filteredData.length.toLocaleString()}건 분석 완료 · 추이 ${loadedMonths}개월 표시 · 저장 ${availableCount}개월 · 수집 대기 ${missingCount}개월`,
        missingCount ? 'warning' : 'success'
    );
    return filtered;
}

async function prepareDongOptions() {
    const query = getQuerySelection();
    if (!query.sidoCd || !query.lawdCd || !query.dealYmd || query.selectedTypes.length === 0 || query.selectedModes.length === 0) {
        const message = query.selectedTypes.length === 0
            ? '부동산 유형 선택 후 조회'
            : '시/군/구 선택 후 조회';
        resetDongOptions(message);
        return null;
    }

    const requestId = ++dongRequestId;
    const queryKey = getQueryKey(query);
    isPreparingDongs = true;
    dongSelect.disabled = true;
    dongSelect.innerHTML = '<option value="">읍/면/동 불러오는 중</option>';
    syncFetchButton();
    setQueryStatus('선택한 조건의 읍·면·동 목록을 불러오고 있습니다.');

    const data = await getMultiTypeData();
    if (requestId !== dongRequestId || queryKey !== getQueryKey()) return null;

    isPreparingDongs = false;
    if (data === null) {
        resetDongOptions('읍/면/동 조회 실패');
        return null;
    }

    const dongs = [...new Set(data.map(item => item.umdNm).filter(Boolean))].sort();
    preparedData = data;
    preparedQueryKey = queryKey;
    preparedHadPartialError = lastQueryHadPartialError;
    dongSelect.innerHTML = '<option value="">시/군/구 전체</option>';
    dongs.forEach(dong => {
        const option = document.createElement('option');
        option.value = dong;
        option.innerText = dong;
        dongSelect.appendChild(option);
    });
    dongSelect.disabled = dongs.length === 0;
    syncFetchButton();

    if (dongs.length) {
        setQueryStatus('시·군·구 전체를 조회하거나 읍·면·동을 선택해 좁혀볼 수 있습니다.', preparedHadPartialError ? 'warning' : '');
    } else {
        setQueryStatus('선택한 조건에 조회 가능한 읍·면·동이 없습니다. 다른 기준 월이나 유형을 선택해 보세요.');
    }
    return data;
}

// ===================================================================
// 7. 인라인 분석 기능 (평당가 즉시 산출)
// ===================================================================
function runInlineAnalysis(btn, size, price, label = '면적') {
    const row = btn.closest('tr');
    if (!row) return;
    const target = row.querySelector('.analysis-target');
    if (!target) return;
    const detailAction = target.querySelector('[data-action="detail"]')?.outerHTML || '';
    const sizeNum = parseFloat(size);

    if (sizeNum <= 0 || isNaN(sizeNum)) {
        target.innerHTML = `<span style="color: #ef4444; font-size: 0.85rem;">면적 정보 없음</span>${detailAction}`;
        return;
    }

    const py = (sizeNum * 0.3025).toFixed(1);
    const ppp = Math.round(price / (sizeNum * 0.3025));

    target.innerHTML = `
        <div class="analysis-detail">
            <span class="area-badge" title="계산기준: ${escapeHtml(label)}">${escapeHtml(label)} ${escapeHtml(size)}㎡ (${py}평)</span>
            <span class="price-col">평당 ${ppp.toLocaleString()}만원</span>
            <button class="small-reset-btn" type="button" data-action="reset" data-size="${escapeHtml(size)}" data-price="${price}" data-label="${escapeHtml(label)}">↩</button>
            ${detailAction}
        </div>
    `;
}

function resetRow(btn, size, price, label) {
    const target = btn.closest('.analysis-target');
    if (!target) return;
    const detailAction = target.querySelector('[data-action="detail"]')?.outerHTML || '';
    target.innerHTML = `<button class="analyze-btn" type="button" data-action="analyze" data-size="${escapeHtml(size)}" data-price="${price}" data-label="${escapeHtml(label)}">평당가 산출</button>${detailAction}`;
}

// ===================================================================
// 8. 렌더링 및 페이지네이션
// ===================================================================
function sortTransactions(data) {
    return [...data].sort((a, b) => {
        if (sortMode === 'price-desc') return b.price - a.price;
        if (sortMode === 'price-asc') return a.price - b.price;
        if (sortMode === 'size-desc') return (Number.parseFloat(b.size) || 0) - (Number.parseFloat(a.size) || 0);
        return new Date(b.date) - new Date(a.date);
    });
}

function syncColumnVisibility() {
    document.querySelectorAll('[data-column]').forEach(cell => {
        cell.hidden = !columnVisibility[cell.dataset.column];
    });
    document.querySelectorAll('[data-column-toggle]').forEach(input => {
        input.checked = columnVisibility[input.dataset.columnToggle];
    });
}

function csvCell(value) {
    const text = String(value ?? '');
    const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replace(/"/g, '""')}"`;
}

function exportCsv() {
    if (!filteredData.length) {
        setQueryStatus('먼저 분석 결과를 조회해 주세요.', 'error');
        return;
    }

    const headers = ['매물 정보', '유형', '거래 구분', '거래 금액/보증금(만원)', '월세(만원)', '계약일', '면적', '면적 기준', '법정동', '지번', '층', '건축연도', '원천 데이터'];
    const rows = filteredData.map(item => [
        item.name,
        item.typeName,
        item.transactionMode === 'rent' ? (item.rentType === 'monthly' ? '월세' : '전세') : (item.cancelled ? '취소' : '매매'),
        item.price,
        item.monthlyRent || '',
        item.date,
        item.size,
        item.sizeLabel,
        item.umdNm,
        item.jibun,
        item.floor,
        item.buildYear,
        item.source || '국토교통부 실거래가 Open API'
    ]);
    const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = `real-estate-${dateSelect.value || 'analysis'}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
    setQueryStatus(`${filteredData.length.toLocaleString()}건을 CSV로 저장했습니다.`, 'success');
}

function renderTable() {
    exportCsvBtn.disabled = filteredData.length === 0;
    if (filteredData.length === 0) {
        analysisBody.innerHTML = `<tr><td colspan="4" class="empty-state"><span class="empty-icon">⌕</span><strong>조회된 데이터가 없습니다.</strong><span>다른 유형, 지역 또는 기준 월을 선택해 보세요.</span></td></tr>`;
        paginationContainer.style.display = 'none';
        renderMetrics([]);
        renderTrend([]);
        syncColumnVisibility();
        return;
    }

    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const pageData = filteredData.slice(startIdx, endIdx);

    analysisBody.innerHTML = pageData.map(item => {
        const dataIndex = globalData.indexOf(item);
        const isRent = item.transactionMode === 'rent';
        const statusLabel = isRent ? (item.rentType === 'monthly' ? '월세' : '전세') : (item.cancelled ? '취소' : '유효');
        const priceLabel = isRent ? formatRentPrice(item) : `${item.price.toLocaleString()}만원`;
        const analysisAction = isRent
            ? `<span class="area-badge">${escapeHtml(item.sizeLabel)} ${escapeHtml(item.size)}㎡</span>`
            : `<button class="analyze-btn" type="button" data-action="analyze" data-size="${escapeHtml(item.size)}" data-price="${item.price}" data-label="${escapeHtml(item.sizeLabel)}">평당가 산출</button>`;
        return `
        <tr>
            <td data-column="property" data-label="매물 정보">
                <strong style="display:block; margin-bottom: 2px;">${escapeHtml(item.name)}</strong>
                <div style="font-size: 0.85rem; color: var(--muted); margin-bottom: 4px;">
                    ${escapeHtml(item.umdNm)} ${escapeHtml(item.jibun)} ${item.floor !== '-' ? `<span style="margin-left:5px; color:#ccc;">|</span> ${escapeHtml(item.floor)}` : ''}
                </div>
                <span class="type-tag type-${escapeHtml(item.type)}">${escapeHtml(item.typeName)}</span>
                <span class="transaction-status${item.cancelled ? ' is-cancelled' : ''}">${statusLabel}</span>
            </td>
            <td data-column="price" data-label="거래 금액" style="font-weight:700; color: var(--accent)">${escapeHtml(priceLabel)}</td>
            <td data-column="date" data-label="계약일">${escapeHtml(item.date)}</td>
            <td data-column="analysis" data-label="면적·평당가" class="analysis-target">
                ${analysisAction}
                <button class="detail-button" type="button" data-action="detail" data-index="${dataIndex}">상세</button>
            </td>
        </tr>
    `;
    }).join('');

    // 페이지네이션 UI 업데이트
    paginationContainer.style.display = 'flex';
    pageInfo.innerText = `${currentPage} / ${totalPages} (총 ${filteredData.length}건)`;

    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages;
    syncColumnVisibility();
}

async function loadDetailPnu(item) {
    if (!item.jibun || !item.umdNm) {
        detailPnu.innerText = '지번 정보 부족';
        return;
    }
    const sidoName = sidoSelect.options[sidoSelect.selectedIndex]?.text || '';
    const gugunName = gugunSelect.options[gugunSelect.selectedIndex]?.text || '';
    const address = `${sidoName} ${gugunName} ${item.umdNm}`.trim();
    detailPnu.innerText = '공식 법정동 코드 확인 중';
    detailBuilding.innerText = 'PNU 확인 중';
    detailLandUse.innerText = 'PNU 확인 중';
    detailOrdinance.innerText = 'PNU 확인 중';
    try {
        const params = new URLSearchParams({ address, jibun: item.jibun });
        const response = await fetch(`${API_ENDPOINT}/pnu?${params}`);
        const isDemo = isDemoDataResponse(response);
        if (!response.ok) {
            detailPnu.innerText = response.status === 404 ? '공식 코드 매칭 실패' : '조회 실패';
            return;
        }
        const result = await response.json();
        if (result.kind !== 'matched') {
            detailPnu.innerText = '공식 코드 매칭 실패';
            detailBuilding.innerText = 'PNU 매칭 실패';
            detailLandUse.innerText = 'PNU 매칭 실패';
            detailOrdinance.innerText = 'PNU 매칭 실패';
            return;
        }
        detailPnu.innerText = `${result.pnu}${isDemo ? ' · 개발용 더미' : ''}`;
        void loadDetailBuilding(result.pnu);
        void loadDetailLandUse(result.pnu);
    } catch (error) {
        if (error instanceof TypeError || error instanceof SyntaxError) {
            detailPnu.innerText = '조회 실패';
            return;
        }
        throw error;
    }
}

async function loadDetailLandUse(pnu) {
    detailLandUse.innerText = '토지이용계획 확인 중';
    detailOrdinance.innerText = '토지이용계획 확인 후 조회';
    try {
        const response = await fetch(`${API_ENDPOINT}/land-use?${new URLSearchParams({ pnu })}`);
        const isDemo = isDemoDataResponse(response);
        if (!response.ok) {
            detailLandUse.innerText = response.status === 503 ? '운영 토지이용 API 키 설정 필요' : '조회 실패';
            return;
        }
        const result = await response.json();
        if (result.kind !== 'found') {
            detailLandUse.innerText = '공식 토지이용계획 없음';
            detailOrdinance.innerText = '용도지역 자료 없음';
            return;
        }
        const zoning = result.zoning ? `${result.zoning.name} · 기준 ${result.zoning.sourceUpdatedOn || '자료 없음'}` : '용도지역 자료 없음';
        const restrictions = result.restrictions.length ? ` · ${result.restrictions.map(item => item.name).join(', ')}` : '';
        detailLandUse.innerText = `${zoning}${restrictions}${isDemo ? ' · 개발용 더미' : ''}`;
        if (result.zoning) {
            const sidoName = sidoSelect.options[sidoSelect.selectedIndex]?.text || '';
            const gugunName = gugunSelect.options[gugunSelect.selectedIndex]?.text || '';
            void loadDetailOrdinance({
                jurisdictionCode: gugunSelect.value,
                jurisdictionName: `${sidoName} ${gugunName}`.trim(),
                zoneCode: result.zoning.code,
                zoneName: result.zoning.name,
            });
        }
    } catch (error) {
        if (error instanceof TypeError || error instanceof SyntaxError) {
            detailLandUse.innerText = '조회 실패';
            return;
        }
        throw error;
    }
}

async function loadDetailOrdinance(query) {
    detailOrdinance.innerText = '조례 상한 확인 중';
    try {
        const response = await fetch(`${API_ENDPOINT}/ordinance?${new URLSearchParams(query)}`);
        const isDemo = isDemoDataResponse(response);
        if (!response.ok) {
            detailOrdinance.innerText = response.status === 503 ? '운영 법령 API 인증값 설정 필요' : '조회 실패';
            return;
        }
        const result = await response.json();
        if (result.kind !== 'found') {
            detailOrdinance.innerText = '공식 조례 자료 없음';
            return;
        }
        const source = `${isDemo ? '개발용 더미 · ' : ''}${result.source.title} · 시행 ${result.source.effectiveOn || '자료 없음'}`;
        const sourceLink = result.source.sourceUrl
            ? ` · <a href="${escapeHtml(result.source.sourceUrl)}" target="_blank" rel="noreferrer">공식 원문</a>`
            : '';
        detailOrdinance.innerHTML = result.regulation
            ? `건폐율 ${result.regulation.buildingCoverageLimitPercent}% · 용적률 ${result.regulation.floorAreaRatioLimitPercent}% · ${escapeHtml(source)}${sourceLink}`
            : `${escapeHtml(source)} · 용도지역 수치 자동 매칭 없음${sourceLink}`;
    } catch (error) {
        if (error instanceof TypeError || error instanceof SyntaxError) {
            detailOrdinance.innerText = '조회 실패';
            return;
        }
        throw error;
    }
}

async function loadDetailBuilding(pnu) {
    detailBuilding.innerText = '건축물대장 확인 중';
    try {
        const response = await fetch(`${API_ENDPOINT}/building?${new URLSearchParams({ pnu })}`);
        const isDemo = isDemoDataResponse(response);
        if (!response.ok) {
            detailBuilding.innerText = response.status === 404 ? '등록 건축물 없음' : '조회 실패';
            return;
        }
        const result = await response.json();
        if (result.kind !== 'found') {
            detailBuilding.innerText = result.kind === 'ambiguous' ? '건축물 다건: 주소로 확인 필요' : '등록 건축물 없음';
            return;
        }
        const building = result.profile;
        const name = building.name ? `${building.name} · ` : '';
        const coverage = building.buildingCoveragePercent === null ? '건폐율 자료 없음' : `건폐율 ${building.buildingCoveragePercent}%`;
        const floorArea = building.floorAreaRatioPercent === null ? '용적률 자료 없음' : `용적률 ${building.floorAreaRatioPercent}%`;
        detailBuilding.innerText = `${name}${building.primaryPurpose} · 연면적 ${Number(building.totalFloorAreaSquareMeters).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}㎡ · ${building.aboveGroundFloorCount}/${building.belowGroundFloorCount}층 · ${coverage} · ${floorArea} · 사용승인 ${building.approvedOn}${isDemo ? ' · 개발용 더미' : ''}`;
    } catch (error) {
        if (error instanceof TypeError || error instanceof SyntaxError) {
            detailBuilding.innerText = '조회 실패';
            return;
        }
        throw error;
    }
}

function openDetail(index) {
    const item = globalData[index];
    if (!item || !detailPanel) return;
    const isRent = item.transactionMode === 'rent';
    detailPrice.innerText = isRent ? formatRentPrice(item) : formatPrice(item.price);
    detailStatus.innerText = isRent ? (item.rentType === 'monthly' ? '월세 계약' : '전세 계약') : (item.cancelled ? `취소 거래${item.cancelDate ? ` · ${item.cancelDate}` : ''}` : '유효 거래');
    detailStatus.classList.toggle('is-cancelled', Boolean(item.cancelled));
    detailName.innerText = item.name || '—';
    detailType.innerText = item.typeName || '—';
    detailDate.innerText = item.date || '—';
    detailSize.innerText = item.size ? `${item.sizeLabel || '면적'} ${item.size}㎡` : '—';
    detailFloor.innerText = item.floor || '—';
    detailYear.innerText = item.buildYear || '—';
    detailAddress.innerText = `${item.umdNm || ''} ${item.jibun || ''}`.trim() || '—';
    void loadDetailPnu(item);
    detailContractType.innerText = isRent ? (item.contractType || '자료 없음') : '해당 없음';
    detailRenewalRight.innerText = isRent ? (item.renewalRightUsed === true ? '사용' : item.renewalRightUsed === false ? '미사용' : '자료 없음') : '해당 없음';
    detailPreviousRent.innerText = isRent && item.previousDeposit !== null && item.previousDeposit !== undefined
        ? `보증금 ${item.previousDeposit.toLocaleString()}만원${item.previousMonthlyRent ? ` / 월 ${item.previousMonthlyRent.toLocaleString()}만원` : ''}`
        : '자료 없음';
    detailSource.innerText = item.source || '국토교통부 실거래가 Open API';
    detailConfidence.innerText = item.confidence || '원천 거래 확인';
    detailUpdated.innerText = updateTime.innerText || '조회 시각 미정';

    const related = globalData
        .filter(candidate => candidate.name === item.name && candidate.umdNm === item.umdNm && candidate.jibun === item.jibun)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);
    detailHistoryList.innerHTML = related.map(transaction => `
        <article class="detail-history-item">
            <strong>${escapeHtml(transaction.transactionMode === 'rent' ? formatRentPrice(transaction) : formatPrice(transaction.price))}</strong>
            <span>${escapeHtml(transaction.date)} · ${transaction.transactionMode === 'rent' ? (transaction.rentType === 'monthly' ? '월세' : '전세') : (transaction.cancelled ? '취소 거래' : '유효 거래')}</span>
        </article>
    `).join('') || '<p class="history-empty">같은 주소의 추가 거래가 없습니다.</p>';
    detailPanel.hidden = false;
    detailPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

detailClose?.addEventListener('click', () => {
    detailPanel.hidden = true;
});

analysisBody.addEventListener('click', event => {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) return;
    const action = actionTarget.dataset.action;
    const size = actionTarget.dataset.size || '';
    const price = Number(actionTarget.dataset.price || 0);
    const label = actionTarget.dataset.label || '면적';
    if (action === 'analyze') runInlineAnalysis(actionTarget, size, price, label);
    if (action === 'reset') resetRow(actionTarget, size, price, label);
    if (action === 'detail') openDetail(Number(actionTarget.dataset.index));
});

columnsToggle.addEventListener('click', () => {
    const isOpen = columnsToggle.getAttribute('aria-expanded') === 'true';
    columnsToggle.setAttribute('aria-expanded', String(!isOpen));
    columnsMenu.hidden = isOpen;
});

document.querySelectorAll('[data-column-toggle]').forEach(input => {
    input.addEventListener('change', event => {
        const checkbox = event.target;
        const visibleCount = Object.values(columnVisibility).filter(Boolean).length;
        if (!checkbox.checked && visibleCount === 1) {
            checkbox.checked = true;
            setQueryStatus('열은 하나 이상 표시해야 합니다.', 'error');
            return;
        }
        columnVisibility[checkbox.dataset.columnToggle] = checkbox.checked;
        syncColumnVisibility();
    });
});

document.addEventListener('click', event => {
    if (!event.target.closest('.columns-control')) {
        columnsMenu.hidden = true;
        columnsToggle.setAttribute('aria-expanded', 'false');
    }
});

exportCsvBtn.addEventListener('click', exportCsv);

pageSizeSelect.addEventListener('change', (e) => {
    itemsPerPage = parseInt(e.target.value);
    currentPage = 1;
    renderTable();
});

sortSelect.addEventListener('change', (event) => {
    sortMode = event.target.value;
    filteredData = sortTransactions(filteredData);
    currentPage = 1;
    renderTable();
});

prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        renderTable();
    }
});

nextPageBtn.addEventListener('click', () => {
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        renderTable();
    }
});

dongSelect.addEventListener('change', () => {
    markQueryDirty();
    syncFetchButton();
});

// ===================================================================
// 9. 최근 분석 리포트 (LocalStorage)
// ===================================================================
function saveHistory(data, lawdCd, dealYmd, selectedTypes, dong) {
    if (!data || data.length === 0) return;

    // 시도/구군 이름 찾기
    const sidoName = sidoSelect.options[sidoSelect.selectedIndex].text;
    const gugunName = gugunSelect.options[gugunSelect.selectedIndex].text;
    const locationName = `${sidoName} ${gugunName} ${dong}`.trim();

    const typesText = selectedTypes.map(t => TYPE_NAMES[t]).join(', ');

    const historyItem = {
        id: Date.now(),
        title: locationName,
        desc: `${dealYmd.substring(0, 4)}년 ${dealYmd.substring(4, 6)}월 | ${typesText}`,
        count: data.length,
        lawdCd: lawdCd,
        sidoCd: sidoSelect.value,
        dealYmd: dealYmd,
        dong: dong,
        selectedTypes: selectedTypes,
        timestamp: new Date().getTime()
    };

    let history = [];
    try {
        const stored = JSON.parse(localStorage.getItem('realEstateHistory') || '[]');
        history = Array.isArray(stored) ? stored : [];
    } catch (error) {
        console.warn('기존 분석 기록이 손상되어 새 기록으로 시작합니다.', error);
    }
    // 중복 조건 제거 후 맨 앞에 추가, 최대 10개
    history.unshift(historyItem);
    if (history.length > 10) history = history.slice(0, 10);

    localStorage.setItem('realEstateHistory', JSON.stringify(history));

    // 실제 데이터는 용량이 크므로 세션에 저장하거나 다시 조회하게 유도할 수 있지만, 
    // 여기서는 화면 전환용으로 데이터를 잠시 보관하는 용도(또는 재조회)로 사용합니다.
    // 캐시 용량 제한상 파라미터만 저장하고 클릭 시 재조회하도록 구현.
    renderHistory();
}

function renderHistory() {
    let history = [];
    try {
        const stored = JSON.parse(localStorage.getItem('realEstateHistory') || '[]');
        history = Array.isArray(stored) ? stored : [];
    } catch (error) {
        console.warn('저장된 분석 기록을 읽지 못했습니다.', error);
    }

    if (history.length === 0) {
        historyList.innerHTML = '<p class="history-empty">저장된 분석이 없습니다.</p>';
        return;
    }

    historyList.innerHTML = history.map(item => {
        const selectedTypes = Array.isArray(item.selectedTypes) ? item.selectedTypes.join(',') : '';
        return `
        <button class="history-card" type="button" data-sido="${escapeHtml(item.sidoCd)}" data-lawd="${escapeHtml(item.lawdCd)}" data-month="${escapeHtml(item.dealYmd)}" data-dong="${escapeHtml(item.dong || '')}" data-types="${escapeHtml(selectedTypes)}">
            <h4>${escapeHtml(item.title)}</h4>
            <p>${escapeHtml(item.desc)}</p>
            <span class="count-badge">${escapeHtml(item.count)}건</span>
        </button>
    `;
    }).join('');
}

historyList.addEventListener('click', event => {
    const card = event.target.closest('.history-card');
    if (!card) return;
    window.loadHistoryItem(card.dataset.sido, card.dataset.lawd, card.dataset.month, card.dataset.dong || '', card.dataset.types || '');
});

window.loadHistoryItem = async function (sidoCd, lawdCd, dealYmd, dong, typesStr) {
    sidoSelect.value = String(sidoCd);
    sidoSelect.dispatchEvent(new Event('change'));
    gugunSelect.value = lawdCd;
    dateSelect.disabled = false;
    dateSelect.value = dealYmd;

    const types = String(typesStr || '').split(',');
    document.querySelectorAll('input[name="type"]').forEach(cb => {
        cb.checked = types.includes(cb.value);
    });

    await prepareDongOptions();
    if (!dong || [...dongSelect.options].some(option => option.value === dong)) {
        dongSelect.value = dong;
        syncFetchButton();
        fetchBtn.click();
    } else {
        setQueryStatus('저장된 읍·면·동을 현재 조건에서 찾을 수 없습니다.', 'error');
    }
};

clearHistoryBtn.addEventListener('click', () => {
    localStorage.removeItem('realEstateHistory');
    renderHistory();
});

// ===================================================================
// 10. 조회 버튼 이벤트 (멀티 필터 결과 렌더링)
// ===================================================================
fetchBtn.addEventListener('click', async () => {
    const query = getQuerySelection();
    if (!isAnalysisReady(query)) {
        setQueryStatus('시·도, 시·군·구, 기준 월을 순서대로 선택해 주세요.', 'error');
        syncFetchButton();
        return;
    }

    setFetchButton(true);
    setQueryStatus(query.dong ? '선택한 읍·면·동의 거래를 분석하고 있습니다.' : '선택한 시·군·구 전체 거래를 분석하고 있습니다.');
    analysisBody.innerHTML = `<tr><td colspan="4" class="empty-state"><span class="empty-icon loading-mark">◌</span><strong>데이터를 불러오는 중입니다.</strong><span>여러 유형을 선택하면 결과를 합쳐 정리합니다.</span></td></tr>`;
    paginationContainer.style.display = 'none';

    const data = preparedQueryKey === getQueryKey(query) ? preparedData : null;

    if (data !== null) {
        globalData = data;
        filteredData = sortTransactions(query.dong ? data.filter(item => item.umdNm === query.dong) : data);
        currentPage = 1;

        renderTable();
        renderMetrics(filteredData);
        renderTrend(filteredData);

        if (filteredData.length > 0) {
            comparisonController.setCurrentAvailable(true);
            updateTime.innerText = new Date().toLocaleTimeString();
            setQueryStatus(
                preparedHadPartialError
                    ? `${filteredData.length.toLocaleString()}건을 확인했습니다. 일부 유형은 연결에 실패했습니다.`
                    : `${filteredData.length.toLocaleString()}건을 확인했습니다.`,
                preparedHadPartialError ? 'warning' : 'success'
            );

            saveHistory(filteredData, query.lawdCd, query.dealYmd, query.selectedTypes, query.dong);
            await loadHistoryTrend(query, filteredData);
        } else {
            comparisonController.setCurrentAvailable(false);
            setQueryStatus(query.dong ? '선택한 읍·면·동에 조건과 일치하는 거래가 없습니다.' : '선택한 시·군·구에 조건과 일치하는 거래가 없습니다.');
        }
    } else {
        analysisBody.innerHTML = '<tr><td colspan="4" class="empty-state"><span class="empty-icon">!</span><strong>조회 조건이 변경되었습니다.</strong><span>읍·면·동 목록을 다시 불러온 뒤 분석해 주세요.</span></td></tr>';
        globalData = [];
        filteredData = [];
        comparisonController.setCurrentAvailable(false);
        setQueryStatus('읍·면·동 목록을 다시 불러온 뒤 분석해 주세요.', 'error');
        renderMetrics([]);
        renderTrend([]);
    }

    setFetchButton(false);
});

async function loadComparisonRegulation(current) {
    const item = current.data.find(candidate => candidate.jibun && candidate.umdNm);
    if (!item) return null;
    try {
        const address = `${current.jurisdictionName} ${item.umdNm}`.trim();
        const pnuResponse = await fetch(`${API_ENDPOINT}/pnu?${new URLSearchParams({ address, jibun: item.jibun })}`);
        if (!pnuResponse.ok) return null;
        const pnuResult = await pnuResponse.json();
        if (pnuResult.kind !== 'matched') return null;
        const landUseResponse = await fetch(`${API_ENDPOINT}/land-use?${new URLSearchParams({ pnu: pnuResult.pnu })}`);
        if (!landUseResponse.ok) return null;
        const landUse = await landUseResponse.json();
        if (landUse.kind !== 'found' || !landUse.zoning) return null;
        const ordinanceResponse = await fetch(`${API_ENDPOINT}/ordinance?${new URLSearchParams({
            jurisdictionCode: current.lawdCd,
            jurisdictionName: current.jurisdictionName,
            zoneCode: landUse.zoning.code,
            zoneName: landUse.zoning.name,
        })}`);
        if (!ordinanceResponse.ok) return null;
        const ordinance = await ordinanceResponse.json();
        return ordinance.kind === 'found' ? ordinance.regulation : null;
    } catch (error) {
        if (error instanceof TypeError || error instanceof SyntaxError) return null;
        throw error;
    }
}

const comparisonController = initComparison(() => {
    if (!filteredData.length) return null;
    const query = getQuerySelection();
    const sidoName = sidoSelect.options[sidoSelect.selectedIndex]?.text || '';
    const gugunName = gugunSelect.options[gugunSelect.selectedIndex]?.text || '';
    return {
        id: [query.lawdCd, query.dealYmd, query.dong, ...query.selectedTypes.sort()].join('|'),
        label: `${sidoName} ${gugunName} ${query.dong}`.trim(),
        period: query.dealYmd,
        periodLabel: dateSelect.options[dateSelect.selectedIndex]?.text || query.dealYmd,
        types: query.selectedTypes.map(type => TYPE_NAMES[type]).filter(Boolean).join(', '),
        lawdCd: query.lawdCd,
        jurisdictionName: `${sidoName} ${gugunName}`.trim(),
        data: filteredData
    };
}, loadComparisonRegulation);

// ===================================================================
// 11. 초기화
// ===================================================================
initDateOptions();
gugunSelect.disabled = true;
dateSelect.disabled = true;
resetDongOptions('시/군/구 선택 후 조회');
initTheme();
renderMetrics([]);
renderTrend([]);
renderHistory();
const entryExperience = initEntryExperience({ document, window });

console.log("🚀 부동산 분석 PRO v15 - Cloudflare 통합 모드");
