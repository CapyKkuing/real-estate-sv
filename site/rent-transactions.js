export const RENT_SUPPORTED_TYPES = new Set(['apt', 'rhous', 'shous', 'office']);

export function mapRentTransaction(item, typeNames, source = '국토교통부 전월세 실거래가 Open API', confidence = '공식 전월세 거래 확인') {
    const name = item.propertyName || `${item.districtName || ''} ${item.jibun || ''}`.trim() || '매물정보 없음';
    return {
        transactionMode: 'rent', rentType: item.rentType, name,
        type: item.propertyType, typeName: typeNames[item.propertyType] || item.propertyType,
        size: String(item.areaSquareMeters || 0), sizeLabel: '전용', price: item.depositTenThousandWon,
        date: item.contractDate, floor: item.floor ? `${item.floor}층` : '-', buildYear: item.buildYear || '-',
        umdNm: item.districtName || '', jibun: item.jibun || '', cancelled: false,
        deposit: item.depositTenThousandWon, monthlyRent: item.monthlyRentTenThousandWon,
        contractTerm: item.contractTerm, contractType: item.contractType,
        renewalRightUsed: item.renewalRightUsed,
        previousDeposit: item.previousDepositTenThousandWon,
        previousMonthlyRent: item.previousMonthlyRentTenThousandWon,
        source, confidence
    };
}

export function formatRentPrice(item) {
    return item.rentType === 'monthly'
        ? `보증금 ${item.deposit.toLocaleString()}만원 / 월 ${item.monthlyRent.toLocaleString()}만원`
        : `전세 ${item.deposit.toLocaleString()}만원`;
}

export function summarizeRentTransactions(items) {
    const rents = items.filter(item => item.transactionMode === 'rent');
    const median = values => {
        const sorted = [...values].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        return sorted.length ? (sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2) : 0;
    };
    return {
        jeonseCount: rents.filter(item => item.rentType === 'jeonse').length,
        monthlyCount: rents.filter(item => item.rentType === 'monthly').length,
        medianDeposit: median(rents.map(item => item.deposit)),
        medianMonthlyRent: median(rents.filter(item => item.rentType === 'monthly').map(item => item.monthlyRent))
    };
}
