export function listPeriodMonths(endMonth, count) {
    const year = Number(endMonth.slice(0, 4));
    const month = Number(endMonth.slice(4, 6));
    if (!/^\d{6}$/.test(endMonth) || month < 1 || month > 12 || count < 1) return [];

    return Array.from({ length: count }, (_, index) => {
        const date = new Date(Date.UTC(year, month - 1 - index, 1));
        return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    });
}

export function selectHistoryMonths(progress, periodMonths, limit = 3) {
    const allowed = new Set(periodMonths);
    const available = (progress?.availableMonths || []).filter(month => allowed.has(month));
    const missing = (progress?.missingMonths || []).filter(month => allowed.has(month));
    return {
        available,
        missing,
        monthsToLoad: [...new Set([...available, ...missing.slice(0, limit)])].slice(0, 8)
    };
}
