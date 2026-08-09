import { formatHousingAnswer, formatPreferredRegion } from './housing-profile.js';

function chip(id, label) {
    return { id, label, questionIds: [id] };
}

export function getHousingSummaryChips(profile) {
    const answers = profile.answers || {};
    return [
        chip('householdType', formatHousingAnswer(answers.householdType)),
        chip('homelessStatus', formatHousingAnswer(answers.homelessStatus)),
        chip('ageBand', formatHousingAnswer(answers.ageBand)),
        chip('preferredRegion', formatPreferredRegion(answers.preferredRegion)),
        { id: 'details', label: '상세 조건', questionIds: ['incomeBand', 'assetBand', 'currentHousingCost'] },
    ];
}
