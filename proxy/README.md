# 고정 IP 공식 데이터 중계

이 서비스는 고정 공인 IPv4를 가진 VPS에서만 실행합니다. Worker는 이 중계 서버에만 연결하고, 중계 서버는 VWorld·법제처·공공데이터포털 세 호스트만 HTTPS GET으로 호출합니다.

## VPS 준비

1. 고정 공인 IPv4가 있는 Ubuntu VPS를 준비합니다.
2. `official-proxy.내도메인` 같은 서브도메인의 A 레코드를 VPS IPv4로 연결합니다.
3. VPS 방화벽에서 TCP 80, 443만 엽니다.
4. VWorld·법제처·공공데이터포털의 허용 IP/도메인에 VPS IPv4와 서브도메인을 등록합니다.

## 실행

VPS의 이 폴더에서 다음을 실행합니다.

```bash
cp .env.example .env
openssl rand -hex 32
```

`.env`의 `PROXY_HOSTNAME`에는 서브도메인을, `OFFICIAL_PROXY_TOKEN`에는 위 명령으로 만든 값을 넣습니다. 그 후 실행합니다.

```bash
docker compose up -d --build
curl https://official-proxy.내도메인/healthz
```

`{"ok":true}`가 나오면 Worker에 같은 값 두 개를 Secret으로 저장합니다. 값은 채팅·Git·문서에 넣지 않습니다.

```bash
npx wrangler secret put OFFICIAL_PROXY_URL
npx wrangler secret put OFFICIAL_PROXY_TOKEN
```

`OFFICIAL_PROXY_URL`에는 `https://official-proxy.내도메인`을 넣습니다. 두 Secret 저장과 Worker 배포는 VPS가 준비된 뒤에만 실행합니다.
