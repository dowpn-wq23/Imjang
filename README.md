# 임장지도

네이버 위성지도 위에서 토지·건물·아파트 정보를 바로 확인하는 임장용 웹앱입니다. (휴대폰 브라우저에서도 사용 가능)

## 기능

| 구분 | 기능 | 데이터 출처 |
|---|---|---|
| 공통 | 위성지도(위성+라벨) 기본, 일반/지형 전환 | 네이버 지도 API v3 |
| 공통 | **경사도** — A·B 두 지점을 찍으면 평균 경사(%, °), 높이차, 고도 단면도 | Open-Meteo Elevation (Copernicus DEM 90m) |
| 공통 | **거리뷰** — 파란 선 위를 찍으면 파노라마 표시 | 네이버 파노라마 |
| 공통 | **필지 정보** — 클릭한 토지의 공시지가(최신년도), 지목·면적·용도지역·도로접면, 토지이용계획, 공시지가 추이, 건축물대장 | VWorld(국토부) · 건축HUB |
| 아파트 | **실거래가** — 최근 24개월 매매, 평형별 필터, 추이 차트, 취소거래 표시 | 국토교통부 아파트 매매 실거래가 |
| 아파트 | **매물** — 네이버 부동산 스타일 목록 UI + 같은 위치로 네이버 부동산 열기 | (아래 "제약사항" 참고) |
| 상가·토지 | **지적편집도** (상가·토지 모드에서 자동 켜짐, 버튼으로 토글) | 네이버 지적편집도 레이어 |

## 실행 방법 (더블클릭)

1. 폴더 안의 **`실행하기.bat`** 를 더블클릭합니다.
2. 처음 한 번만 메모장이 열립니다 → 아래 "API 키 설정"에서 받은 키를 `=` 뒤에 붙여넣고 **저장(Ctrl+S) 후 메모장 닫기**.
3. 검은 창이 뜨고 잠시 뒤 브라우저에 지도가 열립니다.
4. 끝낼 때는 검은 창을 닫습니다. 다음부터는 1번만 하면 됩니다.

> 키를 고치고 싶으면 폴더의 `.env` 파일을 메모장으로 열어 수정한 뒤 다시 실행하세요.
> (윈도우 탐색기에서 `.env`가 안 보이면 상단 "보기 → 표시 → 숨긴 항목"을 켜세요.)

## 아이폰에서 바로 쓰기 (추천) — 사파리 + 홈 화면에 추가

앱 설치 없이 사파리로 엽니다. 공공 API·네이버 부동산은 브라우저에서 직접 부를 수 없어서(CORS),
중계 서버(`server.js`)를 PC 대신 무료 클라우드(Render)에 올려 둡니다. 한 번만 설정하면 PC는 꺼져 있어도 됩니다.

1. **[여기를 눌러 Render에 배포](https://render.com/deploy?repo=https://github.com/dowpn-wq23/Imjang)** → GitHub 계정으로 로그인
2. API 키 3개(`NAVER_MAP_KEY_ID`, `VWORLD_KEY`, `DATA_GO_KR_KEY`)에 PC의 `.env` 값을 붙여넣기 → **Deploy Blueprint**
3. 몇 분 뒤 생긴 주소(`https://imjang-map-xxxx.onrender.com`)를 [네이버 클라우드 콘솔](https://console.ncloud.com) → Maps → Application → **Web 서비스 URL**에 추가
   (VWorld는 PC용 등록 주소를 그대로 쓰므로 바꿀 필요 없음)
4. 아이폰 **사파리**로 그 주소 열기 → **공유(□↑) → 홈 화면에 추가**

> Render 무료 요금제는 15분 동안 안 쓰면 잠들어서, 오랜만에 열면 30초~1분 걸립니다.

## (선택) 아이폰 앱 — Expo, 서버 필요 없음

`mobile/`의 앱은 **PC 서버 없이 혼자 동작**합니다. 지도 화면이 앱 안에 들어 있고, 공공 API·네이버 부동산은 앱(내 폰)이 직접 조회합니다.
API 키는 앱 첫 화면(또는 지도 왼쪽 위 ⚙)에서 입력하며, 그 아이폰에만 저장됩니다.

- 네이버 클라우드 Maps의 Web 서비스 URL에 `http://localhost:3000`이 등록돼 있어야 합니다 (PC용으로 이미 등록했다면 그대로 OK).
- 네이버 부동산 요청이 클라우드가 아닌 내 폰(한국 IP)에서 나가서 차단될 가능성이 낮습니다.

### 설치 방법
**A. 테스트 (무료, 처음 한 번 PC 필요)** — Expo Go
1. 아이폰 App Store에서 **Expo Go** 설치
2. PC에서 **`아이폰으로-테스트하기.bat`** 더블클릭 → 윈도우 방화벽 창이 뜨면 **허용**
3. 화면에 나온 QR을 아이폰 기본 카메라로 찍기 → Expo Go에서 임장지도가 열림
4. 첫 화면에서 API 키 3개 입력 → 저장

> 이 방식은 앱 코드를 PC에서 받아오므로 PC가 켜져 있고 같은 와이파이여야 열립니다.
> PC 없이 Expo Go로 열려면 [expo.dev](https://expo.dev) 무료 계정을 만들고 `mobile/`에서 `npx eas-cli@latest update`로 앱을 올립니다.

**B. 내 아이폰에 정식 앱으로 설치 (Apple 개발자 계정, 연 $99)**
1. [Apple Developer Program](https://developer.apple.com/programs/) 가입
2. `mobile/`에서 `npx eas-cli@latest build -p ios` → 클라우드에서 빌드 (Mac 필요 없음)
3. `npx eas-cli@latest submit -p ios` → TestFlight 앱으로 설치

### 화면을 고쳤을 때
지도 화면 원본은 `public/`, 데이터 조회 원본은 `core/api.js` 하나입니다. 고친 뒤 `mobile/`에서 `npm run bundle-web`을 실행하면
앱용 파일(`mobile/generated/`)이 다시 만들어집니다 (`npm start`·`아이폰으로-테스트하기.bat`은 자동 실행).

## API 키 설정

### 1) 네이버 지도 — `NAVER_MAP_KEY_ID`
- [네이버 클라우드 플랫폼](https://console.ncloud.com) → Services → **Maps** → Application 등록
- API 선택: **Dynamic Map** (거리뷰 파노라마 포함)
- **Web 서비스 URL**에 `http://localhost:3000` 등록 (폰에서 쓸 주소도 추가)
- 발급된 **Client ID**를 넣습니다.

### 2) VWorld — `VWORLD_KEY`, `VWORLD_DOMAIN`
- [vworld.kr](https://www.vworld.kr) → 인증키 발급 (서비스 URL: `http://localhost:3000`)
- 사용 API: 2D 데이터 API(연속지적도 `LP_PA_CBND_BUBUN`), 토지특성정보, 토지이용계획정보, 개별공시지가정보
- `VWORLD_DOMAIN`은 키 발급 때 등록한 URL과 같아야 합니다.

### 3) 공공데이터포털 — `DATA_GO_KR_KEY`
- [data.go.kr](https://www.data.go.kr)에서 아래 2개 **활용신청** (보통 즉시~1시간 내 승인)
  - 국토교통부_아파트 매매 실거래가 자료
  - 국토교통부_건축HUB_건축물대장정보 서비스
- 마이페이지의 **일반 인증키(Decoding)** 를 넣습니다.

## 휴대폰에서 임장할 때
- 휴대폰의 "내 위치"(GPS)는 **HTTPS 주소에서만** 동작합니다.
- 가장 쉬운 방법: PC에서 서버를 켜고 `cloudflared tunnel --url http://localhost:3000` 같은 터널로 HTTPS 주소를 받은 뒤, 그 주소를 네이버(NCP) Web 서비스 URL에도 추가합니다.
- 장기적으로는 Render/Fly.io 등에 배포하고 그 도메인을 NCP·VWorld에 등록하세요.

## 제약사항 (중요)

- **토지이음**은 공개 API가 없습니다. 대신 토지이음과 같은 원천 데이터(국토부 VWorld·건축HUB)를 사용하고, 패널에 "토지이음" 바로가기 링크를 둡니다.
- **네이버 부동산 매물**은 [naver-land-mcp](https://github.com/Seonh0/naver-land-mcp)와 같은 비공식 내부 API를 씁니다(아파트만).
  - 공식 API가 아니라서 네이버가 언제든 막을 수 있고(429 "요청 과다"), 막히면 10분간 요청을 멈춘 뒤 "네이버 부동산에서 보기" 버튼으로 안내합니다.
  - 개인 임장용으로만 쓰고, 끄려면 `.env`에서 `NAVER_LAND_ENABLED=false`.
- eiass(환경영향평가) **토지이용정보 API**는 환경영향평가 *사업코드*로 조회하는 API라서, 지도에서 누른 필지의 용도지역 조회에는 쓸 수 없습니다. 필지별 용도지역은 토지이음과 같은 원천인 VWorld 토지이용계획 API로 가져옵니다.
- **경사도**는 90m 해상도 DEM 기준이라 짧은 골목·옹벽·단차는 반영되지 않습니다. 정밀도가 필요하면 국토지리정보원 5m DEM을 서버에 올려 `measureSlope`의 고도 조회만 교체하면 됩니다.
- **실거래가 매칭**은 클릭한 필지의 지번 = 신고 지번으로 찾고, 없으면 건축물대장의 건물명으로 찾습니다. 단지가 여러 필지에 걸쳐 있으면 단지 안 다른 곳을 눌러보세요.

## 파일 구성
- `server.js` — PC/웹용 서버: 정적 파일 + API 프록시
- `core/api.js` — 공공 API·네이버 부동산 조회 로직 (서버와 아이폰 앱이 공용)
- `mobile/` — 아이폰 앱 (Expo). `mobile/generated/`는 `npm run bundle-web`이 만드는 파일
- `public/index.html`, `public/app.js`, `public/style.css` — 지도 앱
- `public/manifest.webmanifest`, `public/icons/` — 아이폰 홈 화면 설치용 앱 정보·아이콘
- `render.yaml` — Render 클라우드 배포 설정
