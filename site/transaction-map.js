let currentSnapshot = {
    query: null,
    items: [],
    total: 0,
    onSelect: null,
};
const listeners = new Set();

export async function applyEntryRegion(region, { controls, prepareDongOptions, runAnalysis }) {
    const sidoCode = String(region?.sidoCode || '');
    controls.sido.value = sidoCode;
    controls.sido.dispatchEvent?.(new Event('change'));

    const lawdCd = String(region?.lawdCd || '');
    if (!sidoCode || !lawdCd) return;

    controls.gugun.value = lawdCd;
    if (controls.gugun.value !== lawdCd) return;
    if (controls.date) controls.date.disabled = false;

    const preparedData = await prepareDongOptions();
    if (preparedData === null) return;

    const dongName = region.dongName || '';
    const dongOptions = Array.from(controls.dong.options || []);
    if (dongName && !dongOptions.some(option => option.value === dongName)) return;

    controls.dong.value = dongName;
    await runAnalysis();
}

export function getCurrentTransactionPage({ globalData, filteredData, currentPage, itemsPerPage }) {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage).map(item => ({
        item,
        dataIndex: globalData.indexOf(item),
    }));
}

export function publishTransactionMap(snapshot) {
    currentSnapshot = snapshot;
    listeners.forEach(listener => listener(currentSnapshot));
}

export function subscribeTransactionMap(listener) {
    listeners.add(listener);
    listener(currentSnapshot);
    return () => listeners.delete(listener);
}

function appendPanelField(document, container, label, value) {
    const field = document.createElement('p');
    field.className = 'transaction-map-filter';
    const name = document.createElement('span');
    name.className = 'transaction-map-filter-label';
    name.textContent = label;
    const text = document.createElement('span');
    text.className = 'transaction-map-filter-value';
    text.textContent = value || '전체';
    field.append(name, text);
    container.append(field);
}

function formatPanelList(values, labels = {}) {
    const list = Array.isArray(values) ? values : [];
    return list.map(value => labels[value] || value).join(', ') || '전체';
}

function getPanelRegionLabel(query) {
    if (query.regionLabel) return query.regionLabel;
    const labels = query.labels || {};
    return [labels.sido, labels.gugun, labels.dong].filter(Boolean).join(' ') || '선택한 지역';
}

function getPanelStateText(state, total) {
    if (state === 'loading') return '거래를 불러오는 중입니다.';
    if (state === 'partial') return `${total.toLocaleString()}건 · 일부 유형은 불러오지 못했습니다.`;
    if (state === 'empty') return '조건에 맞는 거래가 없습니다.';
    if (state === 'error') return '거래를 조회할 수 없습니다.';
    return `${total.toLocaleString()}건`;
}

function getPanelItemText(item) {
    const price = item.transactionMode === 'rent'
        ? [item.deposit, item.monthlyRent].filter(value => value !== undefined && value !== null && value !== '').join(' / ')
        : item.price;
    return [item.name, item.typeName, item.date, price].filter(value => value !== undefined && value !== null && value !== '').join(' · ') || '거래 상세 보기';
}

export function createTransactionMapPanel(document) {
    const panel = document.getElementById('transaction-map-panel');
    const toggle = document.getElementById('transaction-map-sheet-toggle');
    const region = document.getElementById('transaction-map-region');
    const count = document.getElementById('transaction-map-count');
    const filters = document.getElementById('transaction-map-filters');
    const list = document.getElementById('transaction-map-list');

    if (!panel || !toggle || !region || !count || !filters || !list) return { update() {} };

    let collapsed = /(?:^|\s)is-collapsed(?:\s|$)/.test(panel.className);
    const setCollapsed = next => {
        collapsed = next;
        panel.classList.toggle('is-collapsed', collapsed);
        toggle.setAttribute('aria-expanded', String(!collapsed));
        toggle.textContent = collapsed ? '결과 펼치기' : '결과 접기';
    };
    setCollapsed(collapsed);
    toggle.addEventListener('click', () => setCollapsed(!collapsed));

    return {
        update(snapshot = {}) {
            const query = snapshot.query;
            if (!query) {
                panel.hidden = true;
                list.replaceChildren();
                return;
            }

            const state = snapshot.state || 'success';
            const total = Number.isFinite(Number(snapshot.total)) ? Number(snapshot.total) : 0;
            const items = state === 'success' || state === 'partial'
                ? (Array.isArray(snapshot.items) ? snapshot.items : [])
                : [];
            panel.hidden = false;
            panel.setAttribute('data-state', state);
            region.textContent = getPanelRegionLabel(query);
            count.textContent = getPanelStateText(state, total);

            filters.replaceChildren();
            appendPanelField(document, filters, '거래', formatPanelList(query.transactionTypes || query.selectedModes, {
                trade: '매매', rent: '전월세', sale: '매매', jeonse: '전세', monthly: '월세',
            }));
            appendPanelField(document, filters, '유형', formatPanelList(query.propertyTypes || query.selectedTypes, {
                apt: '아파트', rhous: '연립·다세대', shous: '단독·다가구', office: '오피스텔',
                comm: '상업·업무', fact: '공장·창고', land: '토지', right: '분양·입주권',
            }));
            appendPanelField(document, filters, '기준 월', query.labels?.dealYmd || query.dealYmd || '전체');

            list.replaceChildren();
            if (!items.length) {
                const empty = document.createElement('li');
                empty.className = 'transaction-map-list-status';
                empty.textContent = getPanelStateText(state, total);
                list.append(empty);
                return;
            }

            items.forEach(({ item, dataIndex }) => {
                const listItem = document.createElement('li');
                listItem.className = 'transaction-map-list-item';
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'transaction-map-item';
                button.setAttribute('data-transaction-index', String(dataIndex));
                button.textContent = getPanelItemText(item || {});
                button.addEventListener('click', () => snapshot.onSelect?.(dataIndex));
                listItem.append(button);
                list.append(listItem);
            });
        },
    };
}
