import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEOUL_CENTER } from '../site/entry-scroll.js';
import { resolveStartRegion, SEOUL_START_REGION } from '../site/location-region.js';

afterEach(() => vi.useRealTimers());

function createGeolocationSuccess(center) {
    return {
        getCurrentPosition: vi.fn(success => success({
            coords: { latitude: center.latitude, longitude: center.longitude },
        })),
    };
}

describe('start region resolution', () => {
    it('normalizes a missing region label from dongName', async () => {
        const center = { latitude: 37.55, longitude: 126.91 };
        const geolocation = createGeolocationSuccess(center);
        const mapController = {
            resolveRegion: vi.fn().mockResolvedValue({ sidoCode: '11', lawdCd: '11440', dongName: '망원동' }),
        };

        const result = await resolveStartRegion({ geolocation, mapController });

        expect(result).toEqual({
            source: 'current',
            center,
            sidoCode: '11',
            lawdCd: '11440',
            dongName: '망원동',
            label: '망원동',
        });
        expect(mapController.resolveRegion).toHaveBeenCalledWith(center);
    });

    it.each(['denied', 'timeout', 'unsupported', 'resolve-failed'])(
        '%s starts in Seoul without an arbitrary district',
        async reason => {
            const geolocation = reason === 'unsupported'
                ? {}
                : reason === 'resolve-failed'
                    ? createGeolocationSuccess({ latitude: 37.55, longitude: 126.91 })
                    : { getCurrentPosition: vi.fn((_success, failure) => failure(new Error(reason))) };
            const mapController = {
                resolveRegion: reason === 'resolve-failed'
                    ? vi.fn().mockRejectedValue(new Error('region-unavailable'))
                    : vi.fn(),
            };

            const result = await resolveStartRegion({ geolocation, mapController });

            expect(result).toMatchObject({
                source: 'seoul',
                center: SEOUL_CENTER,
                sidoCode: '11',
                lawdCd: null,
                dongName: '',
                label: '서울특별시',
            });
            expect(result).toBe(SEOUL_START_REGION);
        },
    );

    it('falls back after the location request time limit', async () => {
        vi.useFakeTimers();
        const pending = resolveStartRegion({
            geolocation: { getCurrentPosition: vi.fn() },
            mapController: { resolveRegion: vi.fn() },
            timeoutMs: 10,
        });

        await vi.advanceTimersByTimeAsync(10);

        await expect(pending).resolves.toMatchObject({
            source: 'seoul',
            center: SEOUL_CENTER,
            sidoCode: '11',
            lawdCd: null,
            dongName: '',
            label: '서울특별시',
        });
    });
});
