# 부동산 분석 PRO

국토교통부 실거래가 API를 사용하는 정적 대시보드와 API 프록시를 하나의 Cloudflare Worker로 통합한 프로젝트입니다.

## 구성

- `site/`: 대시보드 정적 파일과 OG 썸네일
- `src/worker.ts`: 허용된 8개 국토부 API만 호출하는 Worker API
- `test/`: API 라우팅, 입력 검증, 비밀키 비노출, OG 메타데이터 테스트
- `wrangler.jsonc`: Cloudflare Workers Static Assets 설정

브라우저는 같은 출처의 `/api/real-estate`만 호출합니다. 국토부·VWorld·국가법령정보 인증값은 소스에 저장하지 않고 Cloudflare Secret으로만 주입합니다.

## 로컬 확인

```bash
npm ci
npm test
npm run typecheck
npm run check:frontend
npm run build
```

로컬 실행이 필요한 경우 프로젝트 루트에 커밋되지 않는 `.dev.vars`를 만들고 다음 값을 넣은 뒤 `npx wrangler dev`를 실행합니다.

```dotenv
DATA_GO_KR_SERVICE_KEY=발급받은_서비스키
VWORLD_API_KEY=발급받은_vworld_키
LAW_API_OC=발급받은_law_oc
```

## Cloudflare 배포

운영 Worker 이름은 `real-estate-sv`이며 GitHub `main` 푸시가 Cloudflare 빌드와 배포를 실행합니다.

```bash
npx wrangler secret put DATA_GO_KR_SERVICE_KEY
npx wrangler secret put VWORLD_API_KEY
npx wrangler secret put LAW_API_OC
npm run deploy
```

`VWORLD_API_KEY`는 PNU 토지이용계획, `LAW_API_OC`는 관할 도시계획 조례 원문과 상한값 조회에 사용합니다. 두 값은 Cloudflare Secret으로만 주입하며 브라우저에 노출하지 않습니다.

새 배포의 조회 기능과 OG 썸네일을 확인한 후 기존 Netlify 사이트와 Render 서비스는 중지할 수 있습니다. 기존 프런트엔드에 포함됐던 키는 노출된 것으로 보고 공공데이터포털에서 재발급하는 것을 권장합니다.
