import { SEOUL_CENTER } from './entry-scroll.js';

export const SEOUL_START_REGION = Object.freeze({
    source: 'seoul',
    center: SEOUL_CENTER,
    sidoCode: '11',
    lawdCd: null,
    dongName: '',
    label: '서울특별시',
});

function getCurrentPositionOnce(geolocation, timeoutMs) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const complete = (callback, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            callback(value);
        };
        const timer = setTimeout(() => complete(reject, new Error('location-timeout')), timeoutMs);

        try {
            geolocation.getCurrentPosition(
                position => complete(resolve, {
                    longitude: position.coords.longitude,
                    latitude: position.coords.latitude,
                }),
                error => complete(reject, error),
                { timeout: timeoutMs },
            );
        } catch (error) {
            complete(reject, error);
        }
    });
}

export async function resolveStartRegion({ geolocation, mapController, timeoutMs = 8000 }) {
    if (!geolocation?.getCurrentPosition) return SEOUL_START_REGION;

    try {
        const center = await getCurrentPositionOnce(geolocation, timeoutMs);
        const region = await mapController.resolveRegion(center);
        return { source: 'current', center, ...region, label: region.label || region.dongName };
    } catch {
        return SEOUL_START_REGION;
    }
}
