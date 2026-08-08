export function createKakaoMapController({ container, kakao, onStatus = () => {} }) {
    const map = new kakao.maps.Map(container, {
        center: new kakao.maps.LatLng(36.5, 127.8),
        level: 13,
    });
    const geocoder = new kakao.maps.services.Geocoder();
    let destroyed = false;

    function setCamera({ center, level, animate }) {
        const target = new kakao.maps.LatLng(center.latitude, center.longitude);
        map.setLevel(level);
        if (animate) map.panTo(target);
        else map.setCenter(target);
    }

    function setInteractive(enabled) {
        map.setDraggable(Boolean(enabled));
        map.setZoomable(Boolean(enabled));
    }

    function resolveRegion({ longitude, latitude }) {
        return new Promise((resolve, reject) => {
            geocoder.coord2RegionCode(longitude, latitude, (results, status) => {
                const result = results?.find(item => item.region_type === 'B');
                if (status !== kakao.maps.services.Status.OK || !result?.code || result.code.length < 5) {
                    reject(new Error('region-unavailable'));
                    return;
                }
                resolve({
                    sidoCode: result.code.slice(0, 2),
                    lawdCd: result.code.slice(0, 5),
                    dongName: result.region_3depth_name,
                });
            });
        });
    }

    function geocodeAddress(address) {
        return new Promise((resolve, reject) => {
            geocoder.addressSearch(address, (results, status) => {
                const result = results?.[0];
                const longitude = Number(result?.x);
                const latitude = Number(result?.y);
                if (status !== kakao.maps.services.Status.OK || !Number.isFinite(longitude) || !Number.isFinite(latitude)) {
                    reject(new Error('geocode-unavailable'));
                    return;
                }
                resolve({ longitude, latitude });
            });
        });
    }

    function setPriceMarkers(_markers, _onSelect) {}
    function clearPriceMarkers() {}

    function destroy() {
        if (destroyed) return;
        destroyed = true;
        clearPriceMarkers();
        kakao.maps.event.clearInstance(map);
        container.replaceChildren();
    }

    onStatus('ready');

    return {
        provider: 'kakao',
        resize: () => map.relayout(),
        getCenter: () => ({ longitude: map.getCenter().getLng(), latitude: map.getCenter().getLat() }),
        setCamera,
        setInteractive,
        resolveRegion,
        geocodeAddress,
        setPriceMarkers,
        clearPriceMarkers,
        destroy,
    };
}
