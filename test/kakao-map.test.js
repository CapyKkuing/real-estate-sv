import { describe, expect, it, vi } from 'vitest';
import { createKakaoMapController } from '../site/kakao-map.js';

function createKakaoFake() {
    const createdMarkers = [];
    const map = {
        relayout: vi.fn(),
        getCenter: vi.fn(() => ({ getLng: () => 127.8, getLat: () => 36.5 })),
        setCenter: vi.fn(),
        panTo: vi.fn(),
        setLevel: vi.fn(),
        setDraggable: vi.fn(),
        setZoomable: vi.fn(),
    };
    const geocoder = {
        coord2RegionCode: vi.fn(),
        addressSearch: vi.fn(),
    };
    const kakao = {
        map,
        geocoder,
        createdMarkers,
        maps: {
            Map: vi.fn(function Map() { return map; }),
            LatLng: vi.fn(function LatLng(latitude, longitude) {
                return { getLat: () => latitude, getLng: () => longitude };
            }),
            Marker: vi.fn(function Marker(options) {
                createdMarkers.push(options);
                return {};
            }),
            services: {
                Geocoder: vi.fn(function Geocoder() { return geocoder; }),
                Status: { OK: 'OK' },
            },
            event: { clearInstance: vi.fn() },
        },
    };
    return kakao;
}

describe('Kakao map controller', () => {
    it('uses exact Kakao camera and interaction controls', () => {
        const kakao = createKakaoFake();
        const controller = createKakaoMapController({ container: {}, kakao });
        const center = { longitude: 126.978, latitude: 37.5665 };

        controller.setCamera({ center, level: 5, animate: true });
        expect(kakao.map.panTo).toHaveBeenCalledOnce();
        controller.setCamera({ center, level: 6, animate: false });
        expect(kakao.map.setCenter).toHaveBeenCalledOnce();
        expect(kakao.map.setLevel).toHaveBeenCalledWith(5);
        expect(kakao.map.setLevel).toHaveBeenCalledWith(6);

        controller.setInteractive(false);
        expect(kakao.map.setDraggable).toHaveBeenLastCalledWith(false);
        expect(kakao.map.setZoomable).toHaveBeenLastCalledWith(false);
        controller.setInteractive(true);
        expect(kakao.map.setDraggable).toHaveBeenLastCalledWith(true);
        expect(kakao.map.setZoomable).toHaveBeenLastCalledWith(true);
    });

    it('resolves legal regions and address coordinates', async () => {
        const kakao = createKakaoFake();
        const controller = createKakaoMapController({ container: {}, kakao });

        kakao.geocoder.coord2RegionCode.mockImplementation((_lng, _lat, callback) => {
            callback([{
                region_type: 'B',
                code: '1111010100',
                region_1depth_name: '서울특별시',
                region_2depth_name: '종로구',
                region_3depth_name: '청운동',
            }], 'OK');
        });
        await expect(controller.resolveRegion({ longitude: 126.978, latitude: 37.5665 })).resolves.toMatchObject({
            sidoCode: '11', lawdCd: '11110', dongName: '청운동',
        });

        kakao.geocoder.addressSearch.mockImplementation((_address, callback) => {
            callback([{ x: '126.91', y: '37.55' }], 'OK');
        });
        await expect(controller.geocodeAddress('서울특별시 마포구 서교동 1-1')).resolves.toEqual({
            longitude: 126.91,
            latitude: 37.55,
        });
    });

    it('rejects Kakao service failures and keeps Task 11 marker signatures as no-ops', async () => {
        const kakao = createKakaoFake();
        const controller = createKakaoMapController({ container: {}, kakao });
        kakao.geocoder.coord2RegionCode.mockImplementation((_lng, _lat, callback) => callback([], 'ERROR'));
        kakao.geocoder.addressSearch.mockImplementation((_address, callback) => callback([], 'ZERO_RESULT'));

        await expect(controller.resolveRegion({ longitude: 126.978, latitude: 37.5665 })).rejects.toThrow('region-unavailable');
        await expect(controller.geocodeAddress('없는 주소')).rejects.toThrow('geocode-unavailable');
        expect(() => controller.setPriceMarkers([], vi.fn())).not.toThrow();
        expect(() => controller.clearPriceMarkers()).not.toThrow();
        expect(kakao.createdMarkers).toHaveLength(0);
    });

    it('cleans up Kakao listeners and container once', () => {
        const kakao = createKakaoFake();
        const container = { replaceChildren: vi.fn() };
        const controller = createKakaoMapController({ container, kakao });

        controller.destroy();
        controller.destroy();
        expect(kakao.maps.event.clearInstance).toHaveBeenCalledOnce();
        expect(container.replaceChildren).toHaveBeenCalledOnce();
    });
});
