export function isAnalysisReady({ sidoCd, lawdCd, dealYmd, selectedTypes, selectedModes }) {
    return Boolean(sidoCd && lawdCd && dealYmd && selectedTypes.length && selectedModes.length);
}
