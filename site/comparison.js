import { calculateMedian } from './statistics.js';
import { summarizeRentTransactions } from './rent-transactions.js';

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
}

function formatPrice(value) {
    return value ? `${Math.round(value).toLocaleString()}만원` : '—';
}

export function initComparison(getCurrentAnalysis, loadRegulation) {
    const navigation = document.getElementById('comparison-nav');
    const section = document.getElementById('comparison-section');
    const addButton = document.getElementById('add-comparison-btn');
    const status = document.getElementById('comparison-status');
    const tableBody = document.getElementById('comparison-table-body');
    let targets = [];
    let isLoadingRegulation = false;

    function renderComparison() {
        if (!targets.length) {
            tableBody.innerHTML = '<tr><td colspan="8" class="comparison-empty">비교할 분석 결과를 추가해 주세요.</td></tr>';
            status.innerText = '먼저 지역 분석을 완료해 주세요.';
            return;
        }

        const metrics = targets.map(target => {
            const valid = target.data.filter(item => item.transactionMode !== 'rent' && !item.cancelled && item.price > 0);
            const pricesPerPyeong = valid
                .map(item => item.price / (Number.parseFloat(item.size) * 0.3025))
                .filter(Number.isFinite);
            return {
                ...target,
                count: valid.length,
                medianPrice: calculateMedian(valid.map(item => item.price)),
                medianPyeongPrice: calculateMedian(pricesPerPyeong),
                rent: summarizeRentTransactions(target.data)
            };
        });
        const maxPyeongPrice = Math.max(...metrics.map(item => item.medianPyeongPrice || 0), 1);
        tableBody.innerHTML = metrics.map(item => `
            <tr>
                <td><strong>${escapeHtml(item.label)}</strong><span class="comparison-types">${escapeHtml(item.types)}</span></td>
                <td>${escapeHtml(item.periodLabel)}</td>
                <td>${item.count.toLocaleString()}건</td>
                <td>${escapeHtml(formatPrice(item.medianPrice))}</td>
                <td><strong>${item.medianPyeongPrice ? `평당 ${Math.round(item.medianPyeongPrice).toLocaleString()}만원` : '면적 데이터 부족'}</strong><span class="comparison-trend" style="--comparison-width:${Math.round((item.medianPyeongPrice / maxPyeongPrice) * 100)}%"></span></td>
                <td>${item.rent.jeonseCount || item.rent.monthlyCount ? `<strong>전세 ${item.rent.jeonseCount}건 · 월세 ${item.rent.monthlyCount}건</strong><span class="comparison-types">보증금 중앙 ${Math.round(item.rent.medianDeposit).toLocaleString()}만원${item.rent.monthlyCount ? ` · 월 ${Math.round(item.rent.medianMonthlyRent).toLocaleString()}만원` : ''}</span>` : '<span class="comparison-pending">전월세 없음</span>'}</td>
                <td>${item.regulation
                    ? `<strong>건폐율 ${item.regulation.buildingCoverageLimitPercent}% · 용적률 ${item.regulation.floorAreaRatioLimitPercent}%</strong>`
                    : '<span class="comparison-pending">공식 조례 수치 없음</span>'}</td>
                <td><button class="text-button danger" type="button" data-remove-comparison="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.label)} 비교에서 제거">제거</button></td>
            </tr>
        `).join('');
        status.innerText = `${metrics[0].periodLabel} 동일 기준 · ${metrics.length}/3개 대상 비교 중`;
    }

    async function addCurrentComparison() {
        if (isLoadingRegulation) return;
        const current = getCurrentAnalysis();
        if (!current) return;
        if (targets.some(target => target.id === current.id)) {
            status.innerText = '이미 추가된 대상입니다.';
            return;
        }
        if (targets.length >= 3) {
            status.innerText = '비교 대상은 최대 3개까지 추가할 수 있습니다.';
            return;
        }
        if (targets.length && targets[0].period !== current.period) {
            status.innerText = '기준 월이 달라 추가할 수 없습니다. 같은 기준 월로 다시 분석해 주세요.';
            return;
        }
        isLoadingRegulation = true;
        addButton.disabled = true;
        status.innerText = '공식 조례 상한을 확인하는 중입니다.';
        try {
            const regulation = loadRegulation ? await loadRegulation(current) : null;
            targets = [...targets, { ...current, data: [...current.data], regulation }];
            renderComparison();
        } finally {
            isLoadingRegulation = false;
            addButton.disabled = false;
        }
    }

    addButton.addEventListener('click', addCurrentComparison);
    tableBody.addEventListener('click', event => {
        const button = event.target.closest('[data-remove-comparison]');
        if (!button) return;
        targets = targets.filter(target => target.id !== button.dataset.removeComparison);
        renderComparison();
    });
    navigation?.addEventListener('click', () => section.scrollIntoView({ behavior: 'smooth' }));
    renderComparison();

    return {
        setCurrentAvailable(isAvailable) {
            addButton.disabled = !isAvailable;
        }
    };
}
