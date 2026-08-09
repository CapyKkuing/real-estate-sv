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

    await prepareDongOptions();
    controls.dong.value = region.dongName || '';
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
