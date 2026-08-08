# 집길 스크롤 카카오 지도 진입 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고정 카카오 지도 위에서 전국→시도→시군구→읍면동으로 확대되는 진입 경험을 만들고, 같은 지역 상태를 주거 질문과 기존 실거래 분석에 연결한다.

**Architecture:** Worker는 브라우저용 카카오 지도 설정만 같은 출처 API로 제공한다. 프런트엔드는 카카오 지도 컨트롤러와 기존 OpenFreeMap 대체 컨트롤러를 동일한 최소 인터페이스로 감싼다. 스크롤, 위치 변환, 주거 조건 요약, 실거래 결과 패널, 주소 좌표화는 각각 작은 ES module로 분리하고, 기존 `site/main.js`는 조회·통계·상세 로직을 유지한 채 명시적인 연결 함수만 노출한다.

**Tech Stack:** Cloudflare Workers, TypeScript, 정적 HTML/CSS/ES modules, Kakao Maps Web JavaScript SDK `services`, MapLibre GL JS/OpenFreeMap fallback, Vitest 4, Cloudflare D1 기존 구성

## Global Constraints

- `npm run typecheck` may generate local `worker-configuration.d.ts`; it is ignored and must not be committed.

- 기준 설계는 `docs/superpowers/specs/2026-08-09-scroll-driven-kakao-map-entry-design.md`다.
- 이 계획을 승인하는 것만으로 제품 코드, 외부 서비스, 환경값, push, deploy를 변경하지 않는다.
- 구현은 현재 계획 전용 worktree에서만 시작한다. worktree 생성은 별도 구현 승인 후 `superpowers:using-git-worktrees`로 수행한다.
- 같은 worktree에서 여러 서브에이전트를 동시에 실행하지 않는다. Task를 번호순으로 직렬 실행한다.
- `Task 1개 = 담당 서브에이전트 1명 = 로컬 commit 1개`를 기본값으로 한다. QA에서 소스 변경이 없으면 빈 commit은 만들지 않는다.
- 서브에이전트는 배정된 파일만 수정하고 다른 Task의 변경을 되돌리지 않는다.
- 각 서브에이전트는 RED 테스트, 최소 구현, GREEN 테스트, diff 검토, 로컬 commit, 전체 SHA 보고까지 책임진다.
- 메인 스레드는 Task 원문 로그를 사용자에게 중계하지 않는다. Phase 종료 후 커밋 범위, 통합 테스트, 화면 확인, 남은 위험만 정리해 보고한다.
- Phase gate가 실패하면 다음 Phase를 시작하지 않는다. 원인과 수정 Task를 먼저 사용자에게 보고한다.
- 각 Phase 완료 보고 후 다음 Phase 시작은 사용자의 별도 승인을 받는다.
- push, PR, merge, Cloudflare secret 변경, Kakao 콘솔 도메인 변경, deploy는 이 계획의 구현 범위 밖이며 각각 별도 승인이 필요하다.
- 실제 카카오 JavaScript 키는 소스, 테스트 fixture, 문서, 로그, 스크린샷, commit에 남기지 않는다.
- 정확한 위치 좌표는 메모리의 현재 세션 상태로만 사용한다. `localStorage`, D1, Worker 요청, Worker 로그에 저장하거나 전송하지 않는다.
- 기존 매매·전세·월세, 취소 거래, 평당가, 상세, PNU, 건축물, 토지이용, 조례, 기간 분석, 비교 분석 로직을 복제하거나 재작성하지 않는다.
- `package.json`, lockfile, D1 schema, migration은 변경하지 않는다.
- 사용자가 Codex 화면에서 모델을 직접 선택한다. 아래 모델 표시는 권장값이며 자동 전환을 의미하지 않는다.

## 서브에이전트 운영 규칙

각 Task 시작 시 메인 스레드는 서브에이전트에게 다음 계약을 전달한다.

```text
소유 범위: Task에 적힌 파일만 수정
선행 조건: 직전 Task commit이 현재 HEAD인지 확인
필수 절차: RED → 최소 구현 → GREEN → 관련 회귀 → git diff --check → commit
금지: push, deploy, 외부 서비스 설정, 비밀값 조회·출력, 관련 없는 리팩터링
반환: full commit SHA, 변경 파일, 실행 명령과 결과, 남은 위험
```

메인 스레드의 Phase gate 보고 형식은 다음으로 고정한다.

```text
Phase N 결과: 통과/실패
사용자 체감 변화: 1~3줄
통합 검증: 명령과 통과 수
커밋 범위: 시작 SHA..종료 SHA
남은 위험: 있으면 1~3줄
다음 Phase: 범위와 권장 모델
```

---

## Phase 0. 지도 설정과 공급자 기반

### Task 1. Worker 지도 설정 API와 동적 SDK 로더

**권장 모델:** Sol High
**이유:** Worker 경계, secret 취급, 브라우저 SDK 로딩 실패 상태를 함께 다루는 보안·비동기 작업이다.

**담당 서브에이전트:** 지도 런타임 설정 담당
**선행 조건:** 설계 commit `b959983`이 포함된 구현 worktree

**Files:**

- Create: `src/map-config.ts`
- Create: `site/map-loader.js`
- Create: `test/map-config.test.ts`
- Create: `test/map-loader.test.js`
- Modify: `src/worker.ts`

**Interfaces:**

- Consumes: `WorkerEnv.KAKAO_MAP_JAVASCRIPT_KEY?: string`
- Produces: same-origin `GET /api/map-config`
- Produces response when configured: `{ provider: 'kakao', javascriptKey: string }`
- Produces response when missing: `{ provider: 'openfreemap' }`
- Produces frontend loader result: `{ provider: 'kakao', kakao }` or `{ provider: 'openfreemap', reason }`

- [ ] **Step 1: Write the failing Worker contract test**

```ts
import { describe, expect, it } from 'vitest'
import { handleMapConfigRequest } from '../src/map-config'

describe('map config', () => {
  it('returns only the browser-required Kakao setting', async () => {
    const response = handleMapConfigRequest(
      new Request('https://example.test/api/map-config'),
      'configured-test-key',
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({
      provider: 'kakao',
      javascriptKey: 'configured-test-key',
    })
  })

  it('falls back without exposing another binding', async () => {
    const response = handleMapConfigRequest(
      new Request('https://example.test/api/map-config'),
      undefined,
    )
    expect(await response.json()).toEqual({ provider: 'openfreemap' })
  })

  it('rejects non-GET methods', () => {
    const response = handleMapConfigRequest(
      new Request('https://example.test/api/map-config', { method: 'POST' }),
      'configured-test-key',
    )
    expect(response.status).toBe(405)
  })
})
```

- [ ] **Step 2: Run the Worker test and confirm RED**

Run: `npx vitest run test/map-config.test.ts`

Expected: FAIL because `src/map-config.ts` does not exist.

- [ ] **Step 3: Implement the smallest Worker handler and route**

```ts
export function handleMapConfigRequest(request: Request, javascriptKey?: string): Response {
  if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: { Allow: 'GET' } })
  }

  const body = javascriptKey
    ? { provider: 'kakao', javascriptKey }
    : { provider: 'openfreemap' }

  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } })
}
```

Add `KAKAO_MAP_JAVASCRIPT_KEY?: string` to `WorkerEnv` and `WorkerBindings`. Route `/api/map-config` before static assets and pass only this one binding to the handler. Do not add the value to `wrangler.jsonc`.

- [ ] **Step 4: Write the failing browser loader tests**

```js
import { describe, expect, it, vi } from 'vitest'
import { loadMapProvider } from '../site/map-loader.js'

it('loads Kakao with services and waits for maps.load', async () => {
  const load = vi.fn(callback => callback())
  const window = { kakao: { maps: { load } } }
  const document = createScriptDocument(() => window.kakao)
  const result = await loadMapProvider({
    fetchImpl: vi.fn(async () => ({
      ok: true,
      json: async () => ({ provider: 'kakao', javascriptKey: 'configured-test-key' }),
    })),
    document,
    window,
  })

  expect(document.lastScript.src).toContain('libraries=services')
  expect(document.lastScript.src).toContain('autoload=false')
  expect(load).toHaveBeenCalledOnce()
  expect(result.provider).toBe('kakao')
})

it('returns OpenFreeMap when config or script loading fails', async () => {
  const result = await loadMapProvider({
    fetchImpl: vi.fn(async () => ({ ok: false })),
    document: createScriptDocument(),
    window: {},
  })
  expect(result.provider).toBe('openfreemap')
})
```

`createScriptDocument` is a test-local fake. It records the appended script and invokes `onload` or `onerror`; production code must not export test helpers.

- [ ] **Step 5: Run the loader test and confirm RED**

Run: `npx vitest run test/map-loader.test.js`

Expected: FAIL because `site/map-loader.js` does not exist.

- [ ] **Step 6: Implement dynamic loading without a key literal in HTML**

```js
export async function loadMapProvider({ fetchImpl = fetch, document, window }) {
    try {
        const response = await fetchImpl('/api/map-config', { cache: 'no-store' });
        if (!response.ok) throw new Error('map-config');
        const config = await response.json();
        if (config.provider !== 'kakao' || !config.javascriptKey) throw new Error('map-config');

        await appendKakaoScript({ document, javascriptKey: config.javascriptKey });
        await new Promise(resolve => window.kakao.maps.load(resolve));
        return { provider: 'kakao', kakao: window.kakao };
    } catch {
        return { provider: 'openfreemap', reason: 'kakao-unavailable' };
    }
}
```

The private `appendKakaoScript` must append exactly one script, use `encodeURIComponent(javascriptKey)`, and reject on `script.onerror`. It must not log the URL because the URL contains the browser key.

- [ ] **Step 7: Verify and commit**

Run separately:

```text
npx vitest run test/map-config.test.ts test/map-loader.test.js test/worker.test.ts
npm run typecheck
git diff --check
```

Expected: all exit `0`.

```bash
git add src/map-config.ts src/worker.ts site/map-loader.js test/map-config.test.ts test/map-loader.test.js
git commit -m "feat: add runtime Kakao map configuration"
```

---

### Task 2. Kakao 지도 컨트롤러와 OpenFreeMap 대체

**권장 모델:** Sol High
**이유:** 서로 다른 지도 SDK를 최소 공통 인터페이스로 연결하고 오류 시 기존 지도를 살려야 한다.

**담당 서브에이전트:** 지도 공급자 어댑터 담당

**Files:**

- Create: `site/kakao-map.js`
- Create: `test/kakao-map.test.js`
- Modify: `site/entry-map.js`
- Modify: `site/entry-experience.js`
- Modify: `test/entry-map.test.js`
- Modify: `test/entry-experience.test.js`

**Interfaces:**

```ts
type Coordinates = { longitude: number; latitude: number };
type MarkerInput = { coordinates: Coordinates; label: string; itemIndices: number[]; summary: string };

// Kakao와 OpenFreeMap concrete controller의 공통 계약
type ConcreteMapController = {
    provider: 'kakao' | 'openfreemap',
    resize(): void,
    getCenter(): Coordinates | null,
    setCamera(camera: { center: Coordinates; level: number; animate: boolean }): void,
    setInteractive(enabled: boolean): void,
    resolveRegion(center: Coordinates): Promise<{ sidoCode: string; lawdCd: string; dongName: string }>,
    geocodeAddress(address: string): Promise<Coordinates>,
    setPriceMarkers(markers: MarkerInput[], onSelect: (index: number) => void): void,
    clearPriceMarkers(): void,
    destroy(): void,
};

// createEntryMap()이 즉시 반환하는 facade 계약
type EntryMapFacade = {
    get provider(): 'pending' | 'kakao' | 'openfreemap' | 'none',
    ready: Promise<ConcreteMapController>,
    resize(): void,
    getCenter(): Coordinates | null,
    setCamera(camera: { center: Coordinates; level: number; animate: boolean }): Promise<void>,
    setInteractive(enabled: boolean): Promise<void>,
    resolveRegion(center: Coordinates): Promise<{ sidoCode: string; lawdCd: string; dongName: string }>,
    geocodeAddress(address: string): Promise<Coordinates>,
    setPriceMarkers(markers: MarkerInput[], onSelect: (index: number) => void): Promise<void>,
    clearPriceMarkers(): Promise<void>,
    destroy(): void,
};
```

`ready`는 facade에만 있고 concrete controller에는 없다. Concrete controller의 `provider`는 고정값이고, facade의 `provider`는 getter다. Facade는 처음 `pending`을 반환하고 `ready`가 끝난 뒤 실제 `kakao` 또는 `openfreemap`을 반환해야 한다. 따라서 `await facade.ready`와 이후 `facade.provider`로 확정 공급자를 모두 조회할 수 있으며 영구적인 `pending` 값이 남지 않는다.

`createEntryMap()`과 `initEntryExperience()`은 기존처럼 동기적으로 컨트롤러를 반환한다. `initEntryExperience({ document, window, loadProvider = loadMapProvider })`가 Task 1의 `loadMapProvider`를 명시적으로 주입하고, facade 내부 `ready`가 비동기 공급자 선택을 끝낸다.

- [ ] **Step 1: Write failing Kakao controller contract tests**

```js
it('uses exact Kakao camera and interaction controls', () => {
  const kakao = createKakaoFake()
  const controller = createKakaoMapController({ container: {}, kakao })
  const center = { longitude: 126.978, latitude: 37.5665 }

  controller.setCamera({ center, level: 5, animate: true })
  expect(kakao.map.panTo).toHaveBeenCalledOnce()
  controller.setCamera({ center, level: 6, animate: false })
  expect(kakao.map.setCenter).toHaveBeenCalledOnce()
  expect(kakao.map.setLevel).toHaveBeenCalledWith(5)
  expect(kakao.map.setLevel).toHaveBeenCalledWith(6)

  controller.setInteractive(false)
  expect(kakao.map.setDraggable).toHaveBeenLastCalledWith(false)
  expect(kakao.map.setZoomable).toHaveBeenLastCalledWith(false)
  controller.setInteractive(true)
  expect(kakao.map.setDraggable).toHaveBeenLastCalledWith(true)
  expect(kakao.map.setZoomable).toHaveBeenLastCalledWith(true)
})

it('resolves legal regions and address coordinates', async () => {
  const kakao = createKakaoFake()
  const controller = createKakaoMapController({ container: {}, kakao })

  kakao.geocoder.coord2RegionCode.mockImplementation((_lng, _lat, callback) => {
    callback([{ region_type: 'B', code: '1111010100', region_1depth_name: '서울특별시', region_2depth_name: '종로구', region_3depth_name: '청운동' }], 'OK')
  })
  await expect(controller.resolveRegion({ longitude: 126.978, latitude: 37.5665 })).resolves.toMatchObject({
    sidoCode: '11', lawdCd: '11110', dongName: '청운동'
  })

  kakao.geocoder.addressSearch.mockImplementation((_address, callback) => {
    callback([{ x: '126.91', y: '37.55' }], 'OK')
  })
  await expect(controller.geocodeAddress('서울특별시 마포구 서교동 1-1')).resolves.toEqual({
    longitude: 126.91,
    latitude: 37.55,
  })
})

it('rejects Kakao service failures and keeps Task 11 marker signatures as no-ops', async () => {
  const kakao = createKakaoFake()
  const controller = createKakaoMapController({ container: {}, kakao })
  kakao.geocoder.coord2RegionCode.mockImplementation((_lng, _lat, callback) => callback([], 'ERROR'))
  kakao.geocoder.addressSearch.mockImplementation((_address, callback) => callback([], 'ZERO_RESULT'))

  await expect(controller.resolveRegion({ longitude: 126.978, latitude: 37.5665 })).rejects.toThrow('region-unavailable')
  await expect(controller.geocodeAddress('없는 주소')).rejects.toThrow('geocode-unavailable')
  expect(() => controller.setPriceMarkers([], vi.fn())).not.toThrow()
  expect(() => controller.clearPriceMarkers()).not.toThrow()
  expect(kakao.createdMarkers).toHaveLength(0)
})

it('cleans up Kakao listeners and container once', () => {
  const kakao = createKakaoFake()
  const container = { replaceChildren: vi.fn() }
  const controller = createKakaoMapController({ container, kakao })

  controller.destroy()
  controller.destroy()
  expect(kakao.maps.event.clearInstance).toHaveBeenCalledOnce()
  expect(container.replaceChildren).toHaveBeenCalledOnce()
})
```

`createKakaoFake()` must expose `maps.Map`, `LatLng`, `services.Geocoder`, `services.Status.OK`, `event.clearInstance`, and spies for `setCenter`, `panTo`, `setLevel`, `setDraggable`, and `setZoomable`. It must record marker construction so Task 2 can prove marker methods remain no-ops.

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run test/kakao-map.test.js`

Expected: FAIL because `site/kakao-map.js` does not exist.

- [ ] **Step 3: Implement the Kakao controller**

Use `kakao.maps.Map`, `LatLng`, `services.Geocoder`, `coord2RegionCode`, and `addressSearch`. Both service methods reject unless status is `kakao.maps.services.Status.OK` and a usable result exists. `geocodeAddress(address)` converts Kakao string coordinates to numbers and returns exactly `{ longitude, latitude }`.

```js
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
```

`setPriceMarkers(markers, onSelect)` and `clearPriceMarkers()` must keep these exact signatures but do no marker work until Task 11.

- [ ] **Step 4: Write failing facade, lifecycle, and entry integration tests**

Add these cases to `test/entry-map.test.js`:

```js
it('exposes the resolved provider and replays a pre-ready resize', async () => {
  const pending = deferred()
  const resize = vi.fn()
  const facade = createEntryMap({
    container: {},
    maplibre: createMapLibreFake({ resize }),
    loadProvider: () => pending.promise,
  })

  expect(facade.provider).toBe('pending')
  facade.resize()
  pending.resolve({ provider: 'openfreemap' })
  await expect(facade.ready).resolves.toMatchObject({ provider: 'openfreemap' })
  expect(facade.provider).toBe('openfreemap')
  expect(resize).toHaveBeenCalledOnce()
})

it('falls back when the injected loader rejects', async () => {
  const facade = createEntryMap({
    container: {},
    maplibre: createMapLibreFake(),
    loadProvider: vi.fn().mockRejectedValue(new Error('sdk failed')),
  })

  await expect(facade.ready).resolves.toMatchObject({ provider: 'openfreemap' })
  expect(facade.provider).toBe('openfreemap')
})

it('does not leave a late map alive after destroy before readiness', async () => {
  const pending = deferred()
  const remove = vi.fn()
  const facade = createEntryMap({
    container: {},
    maplibre: createMapLibreFake({ remove }),
    loadProvider: () => pending.promise,
  })

  facade.destroy()
  pending.resolve({ provider: 'openfreemap' })
  await facade.ready
  expect(remove).not.toHaveBeenCalled()
  expect(facade.getCenter()).toBeNull()
})
```

The same file must test the complete `EMPTY_MAP` behavior through a missing OpenFreeMap runtime: `resize`, `setCamera`, `setInteractive`, `setPriceMarkers`, `clearPriceMarkers`, and repeated `destroy` do not throw; `getCenter()` returns `null`; `resolveRegion()` and `geocodeAddress()` reject with the documented unavailable errors.

Add this integration case to `test/entry-experience.test.js`:

```js
it('injects the Task 1 loader and announces fallback without making init async', async () => {
  const harness = createControllerHarness()
  const loadProvider = vi.fn().mockRejectedValue(new Error('sdk failed'))

  const experience = initEntryExperience({ ...harness, loadProvider })
  expect(experience).toMatchObject({ setMode: expect.any(Function), destroy: expect.any(Function) })
  await vi.waitFor(() => {
    expect(loadProvider).toHaveBeenCalledWith({ document: harness.document, window: harness.window })
    expect(harness.elements['entry-map-status'].textContent).toBe('기본 지도로 표시 중')
  })
})
```

- [ ] **Step 5: Run facade and integration tests and confirm RED**

Run: `npx vitest run test/entry-map.test.js test/entry-experience.test.js`

Expected: FAIL because the current facade has no loader contract or deferred lifecycle, and `initEntryExperience()` does not inject Task 1's loader.

- [ ] **Step 6: Implement the synchronous facade, complete fallback, and loader injection**

`createEntryMap` keeps a synchronous facade and receives an asynchronous loader:

```js
export function createEntryMap({ container, maplibre, loadProvider, onStatus = () => {} }) {
    let controller = EMPTY_MAP;
    let resolvedProvider = 'pending';
    let resizePending = false;
    let destroyed = false;

    function createController(provider) {
        if (destroyed) {
            resolvedProvider = 'none';
            return EMPTY_MAP;
        }
        if (provider.provider === 'kakao') {
            try {
                return createKakaoMapController({ container, kakao: provider.kakao, onStatus });
            } catch {}
        }
        onStatus('fallback');
        return createOpenFreeMapController({ container, maplibre, onStatus });
    }

    const ready = Promise.resolve()
      .then(() => loadProvider())
      .catch(() => ({ provider: 'openfreemap', reason: 'loader-rejected' }))
      .then(provider => {
        controller = createController(provider);
        if (!destroyed) resolvedProvider = controller.provider;
        if (resizePending && controller !== EMPTY_MAP) {
            resizePending = false;
            controller.resize();
        }
        return controller;
      });

    return {
        get provider() { return resolvedProvider; },
        ready,
        resize() {
            if (controller === EMPTY_MAP) resizePending = true;
            else controller.resize();
        },
        getCenter: () => controller.getCenter(),
        setCamera: camera => ready.then(map => map.setCamera(camera)),
        setInteractive: enabled => ready.then(map => map.setInteractive(enabled)),
        resolveRegion: center => ready.then(map => map.resolveRegion(center)),
        geocodeAddress: address => ready.then(map => map.geocodeAddress(address)),
        setPriceMarkers: (markers, onSelect) => ready.then(map => map.setPriceMarkers(markers, onSelect)),
        clearPriceMarkers: () => ready.then(map => map.clearPriceMarkers()),
        destroy() {
            if (destroyed) return;
            destroyed = true;
            resizePending = false;
            controller.destroy();
            controller = EMPTY_MAP;
        },
    };
}
```

`EMPTY_MAP` must implement every concrete-controller method in the interface block without throwing synchronously:

```js
const EMPTY_MAP = Object.freeze({
    provider: 'none',
    resize() {},
    getCenter() { return null; },
    setCamera(_camera) {},
    setInteractive(_enabled) {},
    resolveRegion(_center) { return Promise.reject(new Error('region-unavailable')); },
    geocodeAddress(_address) { return Promise.reject(new Error('geocode-unavailable')); },
    setPriceMarkers(_markers, _onSelect) {},
    clearPriceMarkers() {},
    destroy() {},
});
```

Extract the current MapLibre construction into `createOpenFreeMapController()`, give it fixed `provider: 'openfreemap'`, and keep current controls and attribution. Implement `setCamera({ center, level, animate })` with `[center.longitude, center.latitude]`, `zoom = Math.max(6, Math.min(18, 19 - level))`, and `easeTo` when `animate` is true or `jumpTo` when false. Toggle available MapLibre handlers (`dragPan`, `scrollZoom`, `touchZoomRotate`, `doubleClickZoom`) in `setInteractive(enabled)`. Its region/geocode methods reject with the same unavailable errors; marker methods keep the exact no-op signatures through Task 11; `destroy()` remains idempotent and calls `map.remove()` once. Its load handler reports `fallback`, never `ready`, so the fallback notice is not overwritten after tiles load.

```js
function setCamera({ center, level, animate }) {
    const options = {
        center: [center.longitude, center.latitude],
        zoom: Math.max(6, Math.min(18, 19 - level)),
    };
    if (animate) map.easeTo(options);
    else map.jumpTo(options);
}

function setInteractive(enabled) {
    const method = enabled ? 'enable' : 'disable';
    [map.dragPan, map.scrollZoom, map.touchZoomRotate, map.doubleClickZoom]
        .forEach(handler => handler?.[method]?.());
}

map.on('load', () => onStatus('fallback'));
```

The facade rules are mandatory:

- Every operation called before `ready` is safe. Promise-returning operations wait for `ready`; `getCenter()` returns `null` before readiness.
- A pre-ready `resize()` is remembered and replayed once after controller creation so the initial `setMode()` resize is not lost.
- `destroy()` is idempotent. If called before readiness, late provider resolution must not construct a map; if construction already occurred, the concrete controller is destroyed immediately.
- A synchronous throw or rejected Promise from `loadProvider` selects OpenFreeMap. Kakao construction failure also selects OpenFreeMap. `ready` must not reject for either case.

Wire Task 1's loader explicitly in `site/entry-experience.js` without making initialization asynchronous. Add this import:

```js
import { loadMapProvider } from './map-loader.js';
```

Change the existing function signature to:

```js
export function initEntryExperience({ document, window, loadProvider = loadMapProvider }) {
```

Replace only the current `createEntryMap(...)` call with:

```js
const mapController = createEntryMap({
    container: elements.map,
    maplibre: window.maplibregl,
    loadProvider: () => loadProvider({ document, window }),
    onStatus: status => {
        elements.mapStatus.dataset.state = status;
        elements.mapStatus.textContent = status === 'ready'
            ? '지도 연결됨'
            : status === 'fallback'
                ? '기본 지도로 표시 중'
                : '지도를 불러오지 못했습니다. 아래 경로 선택은 계속 사용할 수 있습니다.';
    },
});
```

Do not change the existing manual transaction selects in `site/main.js`. The fallback notice changes only map status copy; manual 시도·시군구·읍면동 selection and existing query behavior remain available.

- [ ] **Step 7: Verify and commit**

Run separately:

```text
npx vitest run test/kakao-map.test.js test/entry-map.test.js test/entry-experience.test.js test/map-loader.test.js
npm test
node --check site/kakao-map.js
node --check site/entry-map.js
node --check site/entry-experience.js
npm run check:frontend
git diff --check
```

Expected: all exit `0`.

```bash
git add site/kakao-map.js site/entry-map.js site/entry-experience.js test/kakao-map.test.js test/entry-map.test.js test/entry-experience.test.js
git commit -m "feat: add Kakao map controller with fallback"
```

### Phase 0 Gate — 메인 스레드

- [ ] Verify both Task commit SHAs are descendants of the Phase start SHA.
- [ ] Run `npx vitest run test/map-config.test.ts test/map-loader.test.js test/kakao-map.test.js test/entry-map.test.js test/entry-experience.test.js test/worker.test.ts`.
- [ ] Run the full regression suite with `npm test`.
- [ ] Run `npm run typecheck`, `npm run check:frontend`, and `npm run build` separately.
- [ ] Search tracked source with `git grep -n "KAKAO_MAP_JAVASCRIPT_KEY\|dapi.kakao.com"` and verify there is no actual key literal and no static SDK URL containing a key.
- [ ] Load the site without a Kakao setting and observe OpenFreeMap plus the `기본 지도로 표시 중` state. Then manually select 시도, 시군구, and 읍면동 in the existing region filters, run the transaction lookup, and verify the result/list flow remains usable without Kakao geocoding.
- [ ] Report only the Phase 0 summary and wait for Phase 1 approval.

---

## Phase 1. 스크롤 진입과 지역 상태

### Task 3. 4단계 스크롤 장면과 고정 지도

**권장 모델:** Terra Medium
**이유:** 승인된 UI 구조를 기존 정적 페이지에 추가하는 일반 기능 구현이며 상태 경계가 명확하다.

**담당 서브에이전트:** 스크롤 장면 담당

**Files:**

- Create: `site/entry-scroll.js`
- Create: `test/entry-scroll.test.js`
- Modify: `site/index.html`
- Modify: `site/entry.css`
- Modify: `test/frontend.test.ts`

**Interfaces:**

- Consumes: four `[data-map-scene]` elements, `IntersectionObserver`, map controller
- Produces: `createEntryScroll({ scenes, mapController, observerFactory, reducedMotion, onSceneChange })`
- Scene values: `country`, `sido`, `sigungu`, `dong`

- [ ] **Step 1: Write the failing pure scene tests**

```js
expect(getEntryScenes({ center: SEOUL_CENTER, region: null })).toEqual([
  { id: 'country', level: 13 },
  { id: 'sido', level: 11 },
  { id: 'sigungu', level: 8 },
  { id: 'dong', level: 6 },
])

it('moves once when the active scene changes', () => {
  const mapController = { setCamera: vi.fn(), setInteractive: vi.fn() }
  const scroll = createEntryScroll({ scenes: getEntryScenes(input), mapController, observerFactory })
  observer.enter('sido')
  observer.enter('sido')
  expect(mapController.setCamera).toHaveBeenCalledOnce()
  scroll.destroy()
})
```

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run test/entry-scroll.test.js`

Expected: FAIL because `site/entry-scroll.js` does not exist.

- [ ] **Step 3: Implement scene transitions without wheel hijacking**

```js
export const ENTRY_SCENE_IDS = Object.freeze(['country', 'sido', 'sigungu', 'dong']);

export function createEntryScroll({ sceneElements, mapController, observerFactory, reducedMotion, onSceneChange }) {
    let activeId = null;
    const observer = observerFactory(entries => {
        const entry = entries.find(item => item.isIntersecting);
        const id = entry?.target?.dataset?.mapScene;
        if (!id || id === activeId) return;
        activeId = id;
        const scene = getScene(id);
        mapController.setCamera({ ...scene, animate: !reducedMotion });
        mapController.setInteractive(id === 'dong');
        onSceneChange(id);
    });
    sceneElements.forEach(element => observer.observe(element));
    return { skip, destroy: () => observer.disconnect() };
}
```

Do not register `wheel` handlers and do not call `preventDefault()` on scroll. The skip button scrolls the `dong` scene into view and directly applies that scene once.

- [ ] **Step 4: Add semantic scenes and sticky layout**

`site/index.html` must contain one sticky map stage and four content scenes. The final scene contains equal-weight `내게 맞는 주거 찾기` and `지도에서 실거래 찾기` buttons. `site/entry.css` uses `position: sticky; top: 0; min-height: 100svh` for the map stage and normal document flow for scene triggers. Add `prefers-reduced-motion: reduce` rules that remove camera-related transition decoration.

- [ ] **Step 5: Verify and commit**

Run separately:

```text
npx vitest run test/entry-scroll.test.js test/frontend.test.ts
npm run check:frontend
git diff --check
```

Expected: all exit `0`.

```bash
git add site/entry-scroll.js site/index.html site/entry.css test/entry-scroll.test.js test/frontend.test.ts
git commit -m "feat: add scroll-driven map scenes"
```

---

### Task 4. 사용자 동작 위치 권한과 서울 대체

**권장 모델:** Sol High
**이유:** 권한, 시간 초과, 외부 좌표 변환, 개인정보 비저장 조건을 정확히 다뤄야 한다.

**담당 서브에이전트:** 위치·개인정보 담당

**Files:**

- Create: `site/location-region.js`
- Create: `test/location-region.test.js`
- Modify: `site/entry-experience.js`
- Modify: `site/index.html`
- Modify: `test/entry-experience.test.js`

**Interfaces:**

```js
{
    source: 'current' | 'search' | 'seoul',
    center: { longitude: number, latitude: number },
    sidoCode: string,
    lawdCd: string | null,
    dongName: string,
    label: string,
}
```

- [ ] **Step 1: Write failing success and fallback tests**

```js
it('requests location only after start and stores no coordinates', async () => {
  const geolocation = createGeolocationSuccess({ latitude: 37.55, longitude: 126.91 })
  const storage = createStorageSpy()
  const result = await resolveStartRegion({ geolocation, mapController, storage, timeoutMs: 1000 })

  expect(result.source).toBe('current')
  expect(result.lawdCd).toBe('11440')
  expect(storage.setItem).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining('37.55'))
})

it.each(['denied', 'timeout', 'unsupported', 'resolve-failed'])('%s starts in Seoul without an arbitrary district', async reason => {
  const result = await resolveFallbackCase(reason)
  expect(result).toMatchObject({ source: 'seoul', sidoCode: '11', lawdCd: null, dongName: '', label: '서울특별시' })
})
```

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run test/location-region.test.js`

Expected: FAIL because `site/location-region.js` does not exist.

- [ ] **Step 3: Implement explicit permission flow**

```js
export const SEOUL_START_REGION = Object.freeze({
    source: 'seoul',
    center: { longitude: 126.978, latitude: 37.5665 },
    sidoCode: '11',
    lawdCd: null,
    dongName: '',
    label: '서울특별시',
});

export async function resolveStartRegion({ geolocation, mapController, timeoutMs = 8000 }) {
    if (!geolocation?.getCurrentPosition) return SEOUL_START_REGION;
    try {
        const center = await getCurrentPositionOnce(geolocation, timeoutMs);
        const region = await mapController.resolveRegion(center);
        return { source: 'current', center, ...region };
    } catch {
        return SEOUL_START_REGION;
    }
}
```

Do not pass `storage` or `fetch` into production location resolution. Exact coordinates remain only in the returned in-memory object. The UI must disclose that coordinates go to Kakao for region conversion and are not saved by this service.

- [ ] **Step 4: Wire only the `내 주변에서 시작` button**

Page load and first scroll must not call `navigator.geolocation`. The button disables while resolving, announces success or `현재 위치를 확인하지 못해 서울에서 시작합니다`, and exposes `지역 변경` after fallback.

- [ ] **Step 5: Verify and commit**

Run separately:

```text
npx vitest run test/location-region.test.js test/entry-experience.test.js
npm run check:frontend
git diff --check
```

Expected: all exit `0`.

```bash
git add site/location-region.js site/entry-experience.js site/index.html test/location-region.test.js test/entry-experience.test.js
git commit -m "feat: add privacy-safe location start"
```

---

### Task 5. 주거·실거래가 공유하는 지역 상태와 진입 연결

**권장 모델:** Sol High
**이유:** 진입 라우팅, 기존 조회 폼, 주거 프로필이 하나의 지역 계약을 공유하는 통합 작업이다.

**담당 서브에이전트:** 진입 상태 통합 담당

**Files:**

- Modify: `site/entry-experience.js`
- Modify: `site/main.js`
- Modify: `site/housing-profile.js`
- Modify: `test/entry-experience.test.js`
- Modify: `test/housing-profile.test.js`
- Modify: `test/frontend.test.ts`

**Interfaces:**

- `initEntryExperience({ ..., onRegionChange, onOpenTransaction })`
- `onRegionChange(region)` publishes only derived region fields to persistence
- `onOpenTransaction(region)` opens transaction mode without automatically querying `lawdCd: null`

- [ ] **Step 1: Write failing handoff tests**

```js
it('hands the same selected region to both entry paths', () => {
  const onRegionChange = vi.fn()
  const onOpenTransaction = vi.fn()
  const experience = initEntryExperience({ document, window, mapController, onRegionChange, onOpenTransaction })

  experience.setRegion(MAPO_REGION)
  document.querySelector('[data-entry-route="map"]').click()

  expect(onRegionChange).toHaveBeenLastCalledWith(MAPO_REGION)
  expect(onOpenTransaction).toHaveBeenCalledWith(MAPO_REGION)
})

it('does not auto-query an arbitrary district for Seoul fallback', () => {
  experience.setRegion(SEOUL_START_REGION)
  document.querySelector('[data-entry-route="map"]').click()
  expect(onOpenTransaction).toHaveBeenCalledWith(expect.objectContaining({ sidoCode: '11', lawdCd: null }))
  expect(fetchButton.click).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run test/entry-experience.test.js test/housing-profile.test.js`

Expected: FAIL because the callbacks and derived-region persistence do not exist.

- [ ] **Step 3: Add the region contract without storing coordinates**

```js
export function toStoredPreferredRegion(region) {
    return {
        source: region.source,
        sidoCode: region.sidoCode,
        lawdCd: region.lawdCd,
        dongName: region.dongName,
        label: region.label,
    };
}
```

The stored profile must contain no `center`, `latitude`, or `longitude`. Existing legacy `sido:` and `text:` answers remain readable until the user saves a new derived region; do not add a migration layer beyond the existing profile reader.

- [ ] **Step 4: Add minimal callbacks to the entry controller**

```js
export function initEntryExperience({ document, window, onRegionChange = () => {}, onOpenTransaction = () => {} }) {
    let selectedRegion = SEOUL_START_REGION;
    function setRegion(region) {
        selectedRegion = region;
        onRegionChange(toStoredPreferredRegion(region));
    }
    function openTransaction() {
        setMode(ENTRY_MODE.MAP);
        onOpenTransaction(selectedRegion);
    }
    return { setMode, setRegion, getRegion: () => selectedRegion, destroy };
}
```

In `main.js`, provide the callbacks but do not duplicate the existing analysis fetch. Task 8 will connect region values to the form and query pipeline.

- [ ] **Step 5: Verify and commit**

Run separately:

```text
npx vitest run test/entry-experience.test.js test/housing-profile.test.js test/frontend.test.ts
npm run check:frontend
git diff --check
```

Expected: all exit `0`.

```bash
git add site/entry-experience.js site/main.js site/housing-profile.js test/entry-experience.test.js test/housing-profile.test.js test/frontend.test.ts
git commit -m "feat: share entry region across service paths"
```

### Phase 1 Gate — 메인 스레드

- [ ] Run focused tests for `entry-scroll`, `location-region`, `entry-experience`, `housing-profile`, and `frontend`.
- [ ] Run `npm run check:frontend` and `npm run build`.
- [ ] Browser QA at 1440×1000 and 390×844: sticky map, four scene changes, skip, current-location button, Seoul fallback, both final routes.
- [ ] Emulate `prefers-reduced-motion` and verify camera changes are instant.
- [ ] Inspect Application Storage and network requests; verify exact coordinates are absent from local storage and project-server requests.
- [ ] Verify fallback Seoul selects only 서울 and does not trigger a district query.
- [ ] Report only the Phase 1 summary and wait for Phase 2 approval.

---

## Phase 2. 주거 질문 중앙화와 축소 조건 바

### Task 6. 중앙 질문창·모바일 하단 시트·포커스 버그 수정

**권장 모델:** Luna Medium
**이유:** 범위가 CSS, 포커스 표시, 반응형 배치로 제한된 작은 UI 수정이다.

**담당 서브에이전트:** 질문 UI·접근성 담당

**Files:**

- Modify: `site/entry.css`
- Modify: `site/entry-experience.js`
- Modify: `site/index.html`
- Modify: `test/entry-experience.test.js`
- Modify: `test/frontend.test.ts`

**Interfaces:**

- Desktop: centered dialog, `width: min(520px, calc(100% - 48px))`
- Mobile `<= 720px`: fixed bottom sheet with map visible above
- Pointer/touch navigation: no title rectangle
- Keyboard navigation: `:focus-visible` high-contrast outline remains

- [ ] **Step 1: Write failing UI contract assertions**

```ts
expect(entryStyle).toMatch(/\.housing-question\s*\{[\s\S]*left:\s*50%[\s\S]*translate\(-50%,\s*-50%\)/)
expect(entryStyle).toMatch(/\.housing-question-title:focus-visible[\s\S]*outline:\s*3px/)
expect(entryStyle).not.toMatch(/\.housing-question-title:focus(?!-visible)/)
expect(entryStyle).toMatch(/@media \(max-width: 720px\)[\s\S]*bottom:\s*0/)
```

Add an interaction test that advances a question through a pointer click and confirms the title still receives programmatic focus while the stylesheet contract uses `:focus-visible`.

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run test/frontend.test.ts test/entry-experience.test.js`

Expected: FAIL because the dialog is right-aligned and the current focus selector is too broad.

- [ ] **Step 3: Apply the approved positioning and focus rule**

```css
.housing-question {
    position: fixed;
    top: 50%;
    left: 50%;
    width: min(520px, calc(100% - 48px));
    max-height: calc(100svh - 96px);
    transform: translate(-50%, -50%);
}

.housing-question-title:focus { outline: none; }
.housing-question-title:focus-visible {
    outline: 3px solid #0b6f63;
    outline-offset: 6px;
}

@media (max-width: 720px) {
    .housing-question {
        top: auto;
        right: 0;
        bottom: 0;
        left: 0;
        width: 100%;
        max-height: min(68svh, 620px);
        transform: none;
    }
}
```

Keep `questionTitle.focus({ preventScroll: true })` for screen-reader announcement. Do not replace it with focus removal.

- [ ] **Step 4: Verify and commit**

Run separately:

```text
npx vitest run test/frontend.test.ts test/entry-experience.test.js
npm run check:frontend
git diff --check
```

Expected: all exit `0`.

```bash
git add site/entry.css site/entry-experience.js site/index.html test/entry-experience.test.js test/frontend.test.ts
git commit -m "fix: center housing questions and preserve focus cues"
```

---

### Task 7. 저장 후 축소 칩과 단일 질문 편집

**권장 모델:** Terra Medium
**이유:** 기존 프로필 로직과 DOM 상태를 연결하는 중간 규모 기능이며 설계가 확정되어 있다.

**담당 서브에이전트:** 주거 조건 요약 담당

**Files:**

- Create: `site/housing-summary.js`
- Create: `test/housing-summary.test.js`
- Modify: `site/housing-profile.js`
- Modify: `site/entry-experience.js`
- Modify: `site/index.html`
- Modify: `site/entry.css`
- Modify: `test/housing-profile.test.js`
- Modify: `test/entry-experience.test.js`
- Modify: `test/frontend.test.ts`

**Interfaces:**

- `getHousingSummaryChips(profile)` returns five chips: household, homelessness, age, region, details
- `openHousingQuestion(questionId)` opens exactly one question editor
- `onOpenTransaction(storedPreferredRegion)` powers `이 지역 실거래 보기`

- [ ] **Step 1: Write failing chip model tests**

```js
expect(getHousingSummaryChips(completeProfile)).toEqual([
  { id: 'householdType', label: '1인 가구', questionIds: ['householdType'] },
  { id: 'homelessStatus', label: '무주택', questionIds: ['homelessStatus'] },
  { id: 'ageBand', label: '청년', questionIds: ['ageBand'] },
  { id: 'preferredRegion', label: '마포구', questionIds: ['preferredRegion'] },
  { id: 'details', label: '상세 조건', questionIds: ['incomeBand', 'assetBand', 'currentHousingCost'] },
])
```

Add an interaction test: completing question 7 hides the large dialog, shows the compact bar, clicking the household chip opens only `householdType`, saving updates the chip immediately.

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run test/housing-summary.test.js test/entry-experience.test.js`

Expected: FAIL because summary chips and single-question editing do not exist.

- [ ] **Step 3: Implement pure chip mapping**

```js
export function getHousingSummaryChips(profile) {
    const answers = profile.answers || {};
    return [
        chip('householdType', formatAnswer('householdType', answers.householdType)),
        chip('homelessStatus', formatAnswer('homelessStatus', answers.homelessStatus)),
        chip('ageBand', formatAnswer('ageBand', answers.ageBand)),
        chip('preferredRegion', formatPreferredRegion(answers.preferredRegion)),
        { id: 'details', label: '상세 조건', questionIds: ['incomeBand', 'assetBand', 'currentHousingCost'] },
    ];
}
```

Move display label mapping out of `entry-experience.js` only where needed for both questions and chips. Do not redesign the seven-question data model.

- [ ] **Step 4: Add compact bar and single-question editor**

The large dialog transitions to a compact `#housing-summary-bar` after `조건 저장`. Chip buttons use `data-housing-edit`. The details chip editor may show the three detail questions in the existing single-question sequence, while every other chip opens one question only. Saving closes the editor and rerenders chips. `이 지역 실거래 보기` calls the existing `onOpenTransaction` callback.

- [ ] **Step 5: Verify and commit**

Run separately:

```text
npx vitest run test/housing-summary.test.js test/housing-profile.test.js test/entry-experience.test.js test/frontend.test.ts
npm run check:frontend
git diff --check
```

Expected: all exit `0`.

```bash
git add site/housing-summary.js site/housing-profile.js site/entry-experience.js site/index.html site/entry.css test/housing-summary.test.js test/housing-profile.test.js test/entry-experience.test.js test/frontend.test.ts
git commit -m "feat: add editable housing condition chips"
```

### Phase 2 Gate — 메인 스레드

- [ ] Run all housing, entry experience, and frontend tests.
- [ ] Run `npm run check:frontend` and `npm run build`.
- [ ] Browser QA at 1440×1000: dialog center and max width 520px.
- [ ] Browser QA at 390×844: bottom sheet leaves the map visible and has no horizontal overflow.
- [ ] Pointer/touch next: no red rectangle. Keyboard next: visible 3px focus cue.
- [ ] Complete seven questions, inspect five chips, edit each core chip, edit details, use `이 지역 실거래 보기`.
- [ ] Report only the Phase 2 summary and wait for Phase 3 approval.

---

## Phase 3. 기존 실거래 분석을 지도 패널에 연결

### Task 8. 진입 지역을 기존 조회 폼과 실행 파이프라인에 연결

**권장 모델:** Sol High
**이유:** 1,400줄 규모의 기존 `main.js`에서 조회 로직을 복제하지 않고 안전한 연결점을 추출해야 한다.

**담당 서브에이전트:** 실거래 조회 브리지 담당

**Files:**

- Create: `site/transaction-map.js`
- Create: `test/transaction-map.test.js`
- Modify: `site/main.js`
- Modify: `test/frontend.test.ts`

**Interfaces:**

- `applyEntryRegion(region)` sets existing sido/sigungu/dong controls
- `runAnalysis()` contains the existing fetch-button handler body
- `getCurrentTransactionPage()` returns visible page items plus query labels
- `subscribeTransactionMap(listener)` publishes after query, sort, and pagination changes

- [ ] **Step 1: Write failing bridge tests around explicit dependencies**

```js
it('applies a full region then runs the existing analysis once', async () => {
  const controls = createTransactionControls()
  const runAnalysis = vi.fn()
  await applyEntryRegion(MAPO_REGION, { controls, prepareDongOptions, runAnalysis })

  expect(controls.sido.value).toBe('11')
  expect(controls.gugun.value).toBe('11440')
  expect(controls.dong.value).toBe('서교동')
  expect(runAnalysis).toHaveBeenCalledOnce()
})

it('applies Seoul fallback without choosing a district or querying', async () => {
  const controls = createTransactionControls()
  const runAnalysis = vi.fn()
  await applyEntryRegion(SEOUL_START_REGION, { controls, prepareDongOptions, runAnalysis })
  expect(controls.sido.value).toBe('11')
  expect(controls.gugun.value).toBe('')
  expect(runAnalysis).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run test/transaction-map.test.js`

Expected: FAIL because `site/transaction-map.js` does not exist.

- [ ] **Step 3: Extract the current click body without changing behavior**

```js
async function runAnalysis() {
    const query = getQuerySelection();
    if (!isAnalysisReady(query)) {
        setQueryStatus('시·도, 시·군·구, 기준 월을 순서대로 선택해 주세요.', 'error');
        syncFetchButton();
        return;
    }
    // Move the current fetchBtn click body here unchanged.
}

fetchBtn.addEventListener('click', runAnalysis);
```

Do not create a second API path. `window.loadHistoryItem` and entry-region handoff call the same `runAnalysis()`.

- [ ] **Step 4: Publish only current visible results**

```js
function getCurrentTransactionPage() {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage).map((item, offset) => ({
        item,
        dataIndex: start + offset,
    }));
}

function publishTransactionMap() {
    transactionMapController.update({
        query: getQuerySelection(),
        items: getCurrentTransactionPage(),
        total: filteredData.length,
        onSelect: openDetail,
    });
}
```

Call it after successful analysis, empty/error state, sort change, page change, and items-per-page change. Use existing data indices so list and marker selection open the same `openDetail(index)` function.

- [ ] **Step 5: Verify and commit**

Run separately:

```text
npx vitest run test/transaction-map.test.js test/query-readiness.test.js test/rent-transactions.test.js test/statistics.test.js test/frontend.test.ts
npm run check:frontend
git diff --check
```

Expected: all exit `0`.

```bash
git add site/transaction-map.js site/main.js test/transaction-map.test.js test/frontend.test.ts
git commit -m "feat: connect entry regions to transaction analysis"
```

---

### Task 9. 데스크톱 우측 패널과 모바일 하단 시트

**권장 모델:** Terra Medium
**이유:** 데이터 브리지가 생긴 뒤 기존 결과를 반응형 패널로 표현하는 일반 UI 기능이다.

**담당 서브에이전트:** 실거래 지도 패널 담당

**Files:**

- Create: `site/transaction-map.css`
- Modify: `site/transaction-map.js`
- Modify: `site/index.html`
- Modify: `site/main.js`
- Modify: `test/transaction-map.test.js`
- Modify: `test/frontend.test.ts`

**Interfaces:**

- Desktop: map plus right panel
- Mobile: map plus collapsible bottom sheet
- Panel states: loading, success, partial warning, empty, error
- Panel controls reuse existing transaction type, property type, date, region values

- [ ] **Step 1: Write failing panel render tests**

```js
controller.update({
  state: 'success',
  query: { regionLabel: '서울 마포구', transactionTypes: ['sale'], dealYmd: '202608' },
  items: [transaction],
  total: 1,
  onSelect,
})

expect(document.getElementById('transaction-map-count').textContent).toContain('1건')
expect(document.querySelectorAll('[data-transaction-index]')).toHaveLength(1)
document.querySelector('[data-transaction-index="0"]').click()
expect(onSelect).toHaveBeenCalledWith(0)
```

Add frontend assertions for `#transaction-map-panel`, `#transaction-map-sheet-toggle`, `aria-expanded`, desktop grid, and the `720px` bottom-sheet breakpoint.

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run test/transaction-map.test.js test/frontend.test.ts`

Expected: FAIL because the panel markup and styles do not exist.

- [ ] **Step 3: Add the panel shell and render states**

```html
<aside id="transaction-map-panel" class="transaction-map-panel" aria-labelledby="transaction-map-title" hidden>
  <button id="transaction-map-sheet-toggle" type="button" aria-expanded="true">결과 접기</button>
  <h2 id="transaction-map-title">이 지역 실거래</h2>
  <p id="transaction-map-region"></p>
  <p id="transaction-map-count" aria-live="polite"></p>
  <div id="transaction-map-filters"></div>
  <div id="transaction-map-list"></div>
</aside>
```

Render text through `textContent` or created nodes. Do not interpolate upstream transaction fields into raw `innerHTML`.

- [ ] **Step 4: Add responsive layout without moving the map off-screen**

Desktop uses a fixed-width right panel inside the entry map stage. Mobile uses a fixed bottom sheet with collapsed and expanded states. Collapsed state must expose the current region, count, and expand button while allowing map interaction.

- [ ] **Step 5: Verify and commit**

Run separately:

```text
npx vitest run test/transaction-map.test.js test/frontend.test.ts
npm run check:frontend
git diff --check
```

Expected: all exit `0`.

```bash
git add site/transaction-map.js site/transaction-map.css site/index.html site/main.js test/transaction-map.test.js test/frontend.test.ts
git commit -m "feat: add responsive transaction map panel"
```

### Phase 3 Gate — 메인 스레드

- [ ] Run transaction map, query readiness, rent, statistics, pagination, frontend, and entry tests.
- [ ] Run `npm run check:frontend` and `npm run build`.
- [ ] At 1440px verify map plus right panel; at 390px verify collapsed/expanded bottom sheet and map interaction.
- [ ] Verify full-region handoff queries once and Seoul fallback waits for a sigungu selection.
- [ ] Verify sale, jeonse, monthly rent, property types, date, sort, pagination, loading, empty, and error states.
- [ ] Open an item from the panel and confirm the existing detail/PNU/building/land-use/ordinance surface opens.
- [ ] Report only the Phase 3 summary and wait for Phase 4 approval.

---

## Phase 4. 실제 거래 주소 좌표화와 가격 핀

### Task 10. 고유 주소 20개 좌표화, 세션 캐시, 최신 요청 보호

**권장 모델:** Sol High
**이유:** 외부 비동기 요청, 중복 제거, 성공·실패 캐시, stale response 방지가 핵심 정확성 조건이다.

**담당 서브에이전트:** 거래 주소 좌표화 담당

**Files:**

- Modify: `site/transaction-location.js`
- Modify: `site/transaction-map.js`
- Modify: `test/transaction-location.test.js`
- Modify: `test/transaction-map.test.js`

**Interfaces:**

- `buildTransactionAddress(item, queryLabels): string | null`
- `getUniqueTransactionAddresses(items, queryLabels, limit = 20)`
- `createTransactionGeocoder({ geocodeAddress, cache = new Map() })`
- `geocodeGeneration` integer prevents old results from applying

- [ ] **Step 1: Write failing address and race tests**

```js
expect(getUniqueTransactionAddresses(items, labels, 20)).toHaveLength(20)
expect(getUniqueTransactionAddresses([sameAddress, sameAddress], labels, 20)).toHaveLength(1)
expect(buildTransactionAddress({ umdNm: '서교동', jibun: '123-4' }, labels)).toBe('서울특별시 마포구 서교동 123-4')
expect(buildTransactionAddress({ umdNm: '서교동', jibun: '123-*' }, labels)).toBeNull()

it('caches success and failure for the browser session', async () => {
  const geocodeAddress = vi.fn().mockResolvedValueOnce({ longitude: 126.9, latitude: 37.5 }).mockRejectedValueOnce(new Error('none'))
  const geocoder = createTransactionGeocoder({ geocodeAddress })
  await geocoder.resolve('서울특별시 마포구 서교동 1-1')
  await geocoder.resolve('서울특별시 마포구 서교동 1-1')
  expect(geocodeAddress).toHaveBeenCalledOnce()
})

it('ignores an older geocode generation', async () => {
  const first = deferred()
  const controller = createTransactionMapController(dependencies(first))
  controller.update(snapshotA)
  controller.update(snapshotB)
  first.resolve(oldCoordinates)
  await flushPromises()
  expect(mapController.setPriceMarkers).not.toHaveBeenCalledWith(expect.arrayContaining(oldCoordinates), expect.anything())
})
```

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run test/transaction-location.test.js test/transaction-map.test.js`

Expected: FAIL because address composition, cache, limit, and generation protection do not exist.

- [ ] **Step 3: Implement safe address selection and cache**

```js
export function getUniqueTransactionAddresses(items, labels, limit = 20) {
    const seen = new Set();
    const results = [];
    for (const item of items) {
        const address = buildTransactionAddress(item, labels);
        if (!address || seen.has(address)) continue;
        seen.add(address);
        results.push({ address, item });
        if (results.length === limit) break;
    }
    return results;
}
```

Reject missing or masked lot numbers. Cache both `{ status: 'success', coordinates }` and `{ status: 'failure' }` in one in-memory `Map`. Do not persist it to `localStorage` or D1.

- [ ] **Step 4: Apply only the latest result set**

```js
let geocodeGeneration = 0;

async function refreshMarkers(snapshot) {
    const generation = ++geocodeGeneration;
    const resolved = await resolveVisibleAddresses(snapshot.items, snapshot.query);
    if (generation !== geocodeGeneration) return;
    mapController.setPriceMarkers(resolved.filter(item => item.coordinates), snapshot.onSelect);
}
```

On fallback map or missing geocoder, clear markers and keep the list. Do not substitute regional center coordinates.

- [ ] **Step 5: Verify and commit**

Run separately:

```text
npx vitest run test/transaction-location.test.js test/transaction-map.test.js
npm run check:frontend
git diff --check
```

Expected: all exit `0`.

```bash
git add site/transaction-location.js site/transaction-map.js test/transaction-location.test.js test/transaction-map.test.js
git commit -m "feat: geocode visible transaction addresses safely"
```

---

### Task 11. 카카오 가격 핀과 기존 거래 상세 연결

**권장 모델:** Terra Medium
**이유:** 좌표화 결과가 준비된 뒤 지도 마커와 기존 상세 콜백을 연결하는 명확한 기능 작업이다.

**담당 서브에이전트:** 가격 핀·상세 연결 담당

**Files:**

- Modify: `site/kakao-map.js`
- Modify: `site/transaction-map.js`
- Modify: `site/entry.css`
- Modify: `test/kakao-map.test.js`
- Modify: `test/transaction-map.test.js`
- Modify: `test/frontend.test.ts`

**Interfaces:**

- Marker input: `{ coordinates, label, itemIndices, summary }`
- Marker label uses actual sale price or rent deposit/monthly rent formatting
- Marker click selects the first associated current-page item and opens existing detail

- [ ] **Step 1: Write failing marker tests**

```js
controller.setPriceMarkers([
  {
    coordinates: { longitude: 126.91, latitude: 37.55 },
    label: '8.4억',
    itemIndices: [3, 7],
    summary: '서교동 123-4 · 2건',
  },
], onSelect)

expect(kakao.createdMarkers).toHaveLength(1)
kakao.triggerMarkerClick(0)
expect(onSelect).toHaveBeenCalledWith(3)

controller.clearPriceMarkers()
expect(kakao.createdMarkers[0].setMap).toHaveBeenLastCalledWith(null)
```

Add a transaction map test that failed geocodes produce zero markers and successful duplicate-address trades produce one marker with a `2건` summary.

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run test/kakao-map.test.js test/transaction-map.test.js`

Expected: FAIL because price marker rendering and detail selection are incomplete.

- [ ] **Step 3: Implement accessible custom overlays or markers**

Create one Kakao marker/overlay per successful unique address. Its DOM button text contains the price label and an accessible label with address and count. Store listeners and marker instances so `clearPriceMarkers()` removes all of them before the next page is applied.

```js
function selectMarker(marker, onSelect) {
    const index = marker.itemIndices[0];
    if (Number.isInteger(index)) onSelect(index);
}
```

Do not display a pin for unresolved, masked, failed, or stale coordinates.

- [ ] **Step 4: Verify and commit**

Run separately:

```text
npx vitest run test/kakao-map.test.js test/transaction-map.test.js test/frontend.test.ts
npm run check:frontend
git diff --check
```

Expected: all exit `0`.

```bash
git add site/kakao-map.js site/transaction-map.js site/entry.css test/kakao-map.test.js test/transaction-map.test.js test/frontend.test.ts
git commit -m "feat: connect real transaction price markers"
```

### Phase 4 Gate — 메인 스레드

- [ ] Run Kakao map, transaction location, transaction map, pagination, detail-related frontend tests.
- [ ] Run `npm run check:frontend` and `npm run build`.
- [ ] With mocked Kakao services, verify duplicate removal, 20-address cap, success/failure cache, stale generation rejection.
- [ ] In browser, query a page with address data and verify only successful real coordinates show pins.
- [ ] Change filter and page quickly; verify old pins never reappear.
- [ ] Click a pin and list item; both must open the same existing detail data.
- [ ] Block geocoding; verify the transaction list remains usable and no fake center pins appear.
- [ ] Report only the Phase 4 summary and wait for Phase 5 approval.

---

## Phase 5. 통합 품질과 출시 준비 상태 확인

### Task 12. 대체 지도·개인정보·접근성·성능 통합 보강

**권장 모델:** Sol High
**이유:** 전체 경로의 실패 상태, 개인정보 경계, 접근성, 회귀를 한 번에 감사하고 필요한 최소 수정만 해야 한다.

**담당 서브에이전트:** 통합 안정성 담당

**Files:**

- Modify only when a failing contract requires it: `site/map-loader.js`, `site/entry-map.js`, `site/entry-scroll.js`, `site/location-region.js`, `site/entry-experience.js`, `site/transaction-map.js`, `site/index.html`, `site/entry.css`, `site/transaction-map.css`, `src/map-config.ts`, `src/worker.ts`
- Modify matching tests for every behavioral fix

**Interfaces:**

- Kakao config/SDK/map/geocoder failures never block manual real-estate lookup
- Location coordinates never persist or reach project server
- Reduced motion, keyboard, touch, screen-reader status, no horizontal overflow
- Rapid filter changes only apply latest API and geocode results

- [ ] **Step 1: Add one failing integration test per observed gap**

Required test matrix:

```text
map config missing -> OpenFreeMap + manual filters
Kakao script error -> OpenFreeMap + manual filters
geolocation denied/error/timeout/unsupported -> Seoul only, no auto-query
coord2RegionCode failure -> Seoul only
addressSearch partial failure -> list remains, failed pins absent
reduced motion -> animate false
rapid update -> only latest markers and result text
```

Do not add speculative tests for states that cannot occur in the implemented code.

- [ ] **Step 2: Run focused integration tests and confirm each new test RED before its fix**

Run the smallest matching test file for each observed gap. Record the failing assertion in the Task report.

- [ ] **Step 3: Apply only required fixes**

Do not refactor modules that already pass their contracts. User-facing failure messages must be plain Korean and `aria-live` where the state changes asynchronously.

- [ ] **Step 4: Run security and privacy checks**

Run separately:

```text
git grep -n "KAKAO_MAP_JAVASCRIPT_KEY\|javascriptKey\|latitude\|longitude" -- src site test
git diff --check
npm audit --omit=dev
```

Inspect every match. Expected: no actual key; coordinates only in transient in-memory map/location/geocode code and non-secret test fixtures; no new high or critical production dependency finding.

- [ ] **Step 5: Run the full automated suite and commit**

Run separately:

```text
npm test
npm run typecheck
npm run check:frontend
npm run build
```

Expected: all exit `0`.

If Task 12 changed source or tests:

```bash
git add <only Task 12 changed source and matching test files>
git commit -m "fix: harden map entry integration"
```

If no change is required, do not create an empty commit. Return the verified HEAD SHA.

---

### Task 13. 전체 브라우저 QA와 릴리스 증거

**권장 모델:** Sol High
**이유:** 최종 통합 검수는 여러 화면, 권한 상태, 기존 분석 회귀, 배포 빌드를 함께 판단해야 한다.

**담당 서브에이전트:** 최종 QA 담당

**Files:**

- Evidence only: `.omo/evidence/scroll-kakao-map-entry/`
- Modify product files only when an observed defect has a direct minimal fix; add matching regression test
- Never stage `.omo/` or `.codex-progress/`

**Interfaces:**

- Produces desktop screenshots at 1440×1000 and 1280×900
- Produces mobile screenshots at 390×844
- Produces a scenario ledger containing URL, viewport, action, observed result, console status
- Produces final automated validation logs and Git state

- [ ] **Step 1: Start one local Worker**

Run: `npx wrangler dev --local --port 8787`

Expected: one local server at `http://127.0.0.1:8787`. Do not start a duplicate process if this project already owns the port.

- [ ] **Step 2: Verify desktop scenarios**

At 1440×1000 and 1280×900 observe:

1. fixed map and four scroll scenes
2. intro skip
3. current location allow and Seoul fallback
4. final two equal entry actions
5. centered housing dialog
6. compact chips and single-chip editing
7. transaction right panel
8. sale/jeonse/monthly rent query
9. real successful-coordinate pins only
10. list and pin detail opening
11. no horizontal clipping or console error

- [ ] **Step 3: Verify mobile scenarios**

At 390×844 observe:

1. map remains visible behind the housing bottom sheet
2. chip bar fits without horizontal page scroll
3. transaction sheet collapses and expands
4. collapsed sheet leaves map gestures available
5. all buttons and chips have at least 44px touch size
6. no title focus rectangle after touch next

- [ ] **Step 4: Verify accessibility and failure scenarios**

Use keyboard only for route choice, seven questions, chip editing, transaction list, detail close. Emulate reduced motion. Deny geolocation. Block the Kakao SDK request. Fail some address searches. In every case verify readable status text and the existing manual real-estate flow.

- [ ] **Step 5: Run existing feature regression**

Manually verify:

1. 시도→시군구→기준월→구 전체 조회
2. optional 읍면동 조회
3. 취소 거래 표시
4. 평당가 산출 후 상세 버튼 유지
5. 매매·전세·월세 표시
6. CSV, 정렬, 페이지당 개수, 페이지 이동
7. 기간 분석과 3개 비교
8. PNU, 건축물, 토지이용, 조례 상세

- [ ] **Step 6: Run final commands once**

Run separately:

```text
npm test
npm run typecheck
npm run check:frontend
npm run build
git diff --check
git status --short --branch
```

Expected: all checks exit `0`; only approved local evidence or pre-existing untracked files remain untracked.

- [ ] **Step 7: Commit only verified QA fixes**

If QA found and fixed a defect, stage only its source and regression test and commit:

```bash
git commit -m "fix: resolve final map entry QA findings"
```

If no source change was required, do not create an empty commit. Never push or deploy in this Task.

### Phase 5 Gate — 메인 스레드

- [ ] Verify every Task report is stamped with the exact commit SHA used in final QA.
- [ ] Review `git diff` from Phase 0 start to current HEAD for unrelated changes and secret leakage.
- [ ] Personally inspect desktop and mobile screenshots plus the scenario ledger.
- [ ] Personally rerun `npm test`, `npm run typecheck`, `npm run check:frontend`, and `npm run build` once at final HEAD.
- [ ] Confirm push, PR, merge, deploy, Kakao console, and Cloudflare secret were not changed.
- [ ] Report only the Phase 5 result, full local commit range, observable behavior, validation counts, residual risks, and the separate approvals still needed for external configuration/push/deploy.

---

## Definition of Done

- The first screen keeps one map visible while scroll scenes move from country to neighborhood.
- Geolocation is requested only after `내 주변에서 시작` and failure starts in Seoul without an arbitrary district query.
- Exact coordinates are not stored or sent to the project server.
- Kakao is primary when configured; OpenFreeMap and manual transaction filters remain usable when it is not.
- Housing questions are centered on desktop and a bottom sheet on mobile.
- Pointer/touch transitions do not show the red title rectangle; keyboard focus remains visible.
- Completing questions leaves five compact chips and each selected condition can be edited without restarting all questions.
- The housing region opens the transaction map through the same existing official data query.
- Desktop shows a right result panel; mobile shows a collapsible bottom sheet.
- Only successfully geocoded real visible addresses, maximum 20 unique addresses, create price pins.
- Old geocode results never overwrite newer filters or pages.
- Pins and list rows open the same existing transaction detail.
- All automated checks and the required desktop/mobile/failure/accessibility QA scenarios pass.
- No external configuration, push, merge, or deployment occurs without separate approval.

## Phase별 모델 요약

| Phase | Task | 권장 모델 | 추론 단계 |
|---|---|---|---|
| 0 | 1. 지도 설정 API·SDK 로더 | Sol | High |
| 0 | 2. Kakao·OpenFreeMap 컨트롤러 | Sol | High |
| 1 | 3. 스크롤 장면·고정 지도 | Terra | Medium |
| 1 | 4. 위치 권한·서울 대체 | Sol | High |
| 1 | 5. 공유 지역 상태·진입 연결 | Sol | High |
| 2 | 6. 질문창·포커스 수정 | Luna | Medium |
| 2 | 7. 축소 칩·단일 편집 | Terra | Medium |
| 3 | 8. 기존 조회 브리지 | Sol | High |
| 3 | 9. 실거래 반응형 패널 | Terra | Medium |
| 4 | 10. 좌표화·캐시·경쟁 방지 | Sol | High |
| 4 | 11. 가격 핀·상세 연결 | Terra | Medium |
| 5 | 12. 통합 안정성·보안 | Sol | High |
| 5 | 13. 전체 브라우저 QA | Sol | High |

## 구현 시작 방식

1. **Subagent-Driven (권장):** 현재 스레드가 관리자가 되어 Task마다 서브에이전트를 한 명씩 직렬 실행한다. Phase gate에서 메인 스레드가 직접 통합 검증하고 결과만 사용자에게 보고한다.
2. **Inline Execution:** 현재 스레드가 모든 Task를 직접 순서대로 구현한다. 서브에이전트 분리와 Task별 독립 검토 이점이 줄어든다.

사용자가 선택한 운영 방식은 1번이다. 실제 구현은 별도 승인 후 Phase 0, Task 1부터 시작한다.
