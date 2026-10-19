// 임장지도 API 공통 모듈 — PC 서버(pc-server.js)와 아이폰 앱(mobile/)이 같이 씁니다.
// Node·React Native 양쪽에서 돌아가도록 fetch, AbortController, atob만 사용합니다.
// (mobile/에서는 `npm run bundle-web`이 이 파일을 mobile/generated/로 복사해서 씁니다)

// 쿼리 문자열 → { get(key) } (URLSearchParams 대용)
export function parseQuery(search) {
  const map = new Map();
  const dec = s => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; } };
  for (const part of String(search || '').replace(/^\?/, '').split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    const k = dec(i < 0 ? part : part.slice(0, i)), v = i < 0 ? '' : dec(part.slice(i + 1));
    if (!map.has(k)) map.set(k, v);
  }
  return { get: k => (map.has(k) ? map.get(k) : null) };
}

export function createApi({ VWORLD_KEY = '', VWORLD_DOMAIN = 'http://localhost:3000', DATA_GO_KR_KEY = '', NAVER_LAND_ENABLED = true } = {}) {
  // ---------- 공통 유틸 ----------
  const HOUR = 3600_000;
  const cache = new Map();
  async function cached(key, ttlMs, fn) {
    const hit = cache.get(key);
    if (hit && hit.exp > Date.now()) return hit.val;
    const val = await fn();
    cache.set(key, { val, exp: Date.now() + ttlMs });
    return val;
  }

  // AbortSignal.timeout은 폰(React Native)에 없을 수 있어서 직접 구현
  function timeout(ms) {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  }
  // URL·URLSearchParams도 폰에서는 일부만 지원돼서 쿼리 문자열을 직접 만듦
  const qs = params => Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const hostOf = url => (String(url).match(/^https?:\/\/([^/?#]+)([^?#]*)/) || []).slice(1).join('');

  // 접속 자체가 안 될 때 Node는 'fetch failed'만 알려줘서, 어느 사이트에서 왜 실패했는지 붙여 줌
  async function netFetch(url, opts = {}, ms = 15000) {
    try {
      return await fetch(url, { ...opts, signal: timeout(ms) });
    } catch (e) {
      const why = e.name === 'AbortError' ? `${ms / 1000}초 동안 응답 없음` : e.cause?.code || e.cause?.message || e.message;
      throw new Error(`${hostOf(url).split('/')[0]} 접속 실패 (${why}) — 서버가 해외에 있으면 한국 사이트가 접속을 막을 수 있습니다`);
    }
  }

  // 동시에 너무 많이 요청하면 공공데이터포털이 연결을 끊으므로 n개씩 나눠서 처리
  async function mapLimit(items, n, fn) {
    const out = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
    }));
    return out;
  }

  async function getText(url) {
    const res = await netFetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} (${hostOf(url)})`);
    return res.text();
  }

  const asArray = v => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v]);
  const num = v => (v == null || v === '' ? null : Number(String(v).replace(/[,\s]/g, '')));
  const pad2 = v => String(v).padStart(2, '0');

  // 공공데이터포털 XML은 구조가 단순(<item><태그>값</태그>…</item>)해서 정규식으로 충분
  function parseGovXml(txt) {
    const tag = name => (txt.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)) || [])[1];
    const items = [...txt.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, body]) => {
      const o = {};
      for (const [, k, v] of body.matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)) o[k] = decodeXml(v.trim());
      return o;
    });
    return {
      code: tag('resultCode') ?? tag('returnReasonCode'),
      msg: tag('resultMsg') ?? tag('returnAuthMsg'),
      total: Number(tag('totalCount') || items.length),
      items,
    };
  }
  const decodeXml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

  // ---------- VWorld (국토교통부 공간정보 오픈플랫폼) ----------
  function vworldUrl(path, params) {
    return `https://api.vworld.kr${path}?${qs({ key: VWORLD_KEY, domain: VWORLD_DOMAIN, format: 'json', ...params })}`;
  }

  async function vworldNed(op, params, rootKey) {
    const json = JSON.parse(await getText(vworldUrl(`/ned/data/${op}`, { numOfRows: '100', pageNo: '1', ...params })));
    if (json?.response?.status === 'ERROR') throw new Error(`VWorld ${op}: ${json.response.error?.text ?? 'ERROR'}`);
    return asArray(json?.[rootKey]?.field);
  }

  // ---------- data.go.kr (공공데이터포털) ----------
  async function dataGoKr(path, params) {
    const txt = await getText(`https://apis.data.go.kr${path}?${qs({ serviceKey: DATA_GO_KR_KEY, ...params })}`);
    let r;
    if (txt.trimStart().startsWith('<')) r = parseGovXml(txt);
    else {
      const j = JSON.parse(txt);
      const body = j?.response?.body ?? {};
      r = { code: j?.response?.header?.resultCode, msg: j?.response?.header?.resultMsg, total: Number(body.totalCount || 0), items: asArray(body.items?.item) };
    }
    if (r.code && !['00', '000', '0'].includes(String(r.code))) throw new Error(`data.go.kr ${r.code}: ${r.msg ?? ''}`);
    return r;
  }

  // ---------- API 핸들러 ----------
  // 좌표 → 필지(PNU, 지번, 공시지가, 경계)
  async function apiParcel(q) {
    const lat = Number(q.get('lat')), lng = Number(q.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [400, { error: 'lat, lng가 필요합니다' }];
    if (!VWORLD_KEY) return [500, { error: 'VWORLD_KEY가 설정되지 않았습니다 (PC: .env / 앱: ⚙ 설정)' }];
    const json = JSON.parse(await getText(vworldUrl('/req/data', {
      service: 'data', request: 'GetFeature', data: 'LP_PA_CBND_BUBUN',
      geomFilter: `POINT(${lng} ${lat})`, geometry: 'true', attribute: 'true', crs: 'EPSG:4326', size: '1',
    })));
    const r = json.response;
    if (r?.status === 'NOT_FOUND') return [404, { error: '이 위치에서 필지를 찾지 못했습니다' }];
    if (r?.status !== 'OK') throw new Error(`VWorld: ${r?.error?.text ?? r?.status}`);
    const f = r.result.featureCollection.features[0];
    return [200, { ...f.properties, geometry: f.geometry }];
  }

  // PNU → 토지특성(지목·면적·용도지역 등), 토지이용계획, 공시지가 추이, 건축물대장 표제부
  async function apiLand(pnu) {
    if (!/^\d{19}$/.test(pnu)) return [400, { error: 'PNU는 19자리 숫자입니다' }];
    const data = await cached(`land:${pnu}`, 24 * HOUR, async () => {
      const need = (key, name, fn) => (key ? fn() : Promise.reject(new Error(`${name}가 설정되지 않았습니다 (PC: .env / 앱: ⚙ 설정)`)));
      const [chars, uses, prices, bldg] = await Promise.allSettled([
        need(VWORLD_KEY, 'VWORLD_KEY', () => vworldNed('getLandCharacteristics', { pnu }, 'landCharacteristicss')),
        need(VWORLD_KEY, 'VWORLD_KEY', () => vworldNed('getLandUseAttr', { pnu }, 'landUses')),
        need(VWORLD_KEY, 'VWORLD_KEY', () => vworldNed('getIndvdLandPriceAttr', { pnu }, 'indvdLandPrices')),
        need(DATA_GO_KR_KEY, 'DATA_GO_KR_KEY', () => dataGoKr('/1613000/BldRgstHubService/getBrTitleInfo', {
          sigunguCd: pnu.slice(0, 5), bjdongCd: pnu.slice(5, 10), platGbCd: pnu[10] === '2' ? '1' : '0',
          bun: pnu.slice(11, 15), ji: pnu.slice(15, 19), numOfRows: '50', pageNo: '1', _type: 'json',
        })),
      ]);
      const ok = (r, fb) => (r.status === 'fulfilled' ? r.value : fb);
      const errors = { characteristics: chars, landUse: uses, prices, buildings: bldg };
      for (const k in errors) errors[k] = errors[k].status === 'rejected' ? errors[k].reason.message : undefined;

      const c = ok(chars, []).sort((a, b) => num(b.stdrYear) - num(a.stdrYear))[0];
      const seen = new Set();
      return {
        pnu,
        characteristics: c && {
          year: c.stdrYear, landCategory: c.lndcgrCodeNm, area: num(c.lndpclAr),
          zoning: [c.prposArea1Nm, c.prposArea2Nm].filter(v => v && v !== '지정되지않음').join(', '),
          useStatus: c.ladUseSittnNm, heightType: c.tpgrphHgCodeNm, shape: c.tpgrphFrmCodeNm, roadSide: c.roadSideCodeNm,
          price: num(c.pblntfPclnd),
        },
        landUse: ok(uses, [])
          .map(u => ({ name: u.prposAreaDstrcCodeNm, status: u.cnflcAtNm }))
          .filter(u => u.name && !seen.has(u.name) && seen.add(u.name)),
        prices: ok(prices, [])
          .map(p => ({ year: Number(p.stdrYear), price: num(p.pblntfPclnd) }))
          .filter(p => p.price).sort((a, b) => b.year - a.year)
          .filter((p, i, arr) => i === 0 || arr[i - 1].year !== p.year), // 같은 연도 중복(상·하반기 공시) 제거
        buildings: ok(bldg, { items: [] }).items.map(b => ({
          name: b.bldNm, dong: b.dongNm, purpose: b.mainPurpsCdNm, etcPurpose: b.etcPurps, structure: b.strctCdNm,
          totalArea: num(b.totArea), buildingArea: num(b.archArea), siteArea: num(b.platArea),
          floors: num(b.grndFlrCnt), basements: num(b.ugrndFlrCnt), households: num(b.hhldCnt),
          approved: b.useAprDay, coverageRatio: num(b.bcRat), floorAreaRatio: num(b.vlRat), isMain: b.mainAtchGbCdNm,
        })),
        errors,
      };
    });
    return [200, data];
  }

  // 아파트 매매 실거래가 (국토교통부) — 시군구·월 단위로 받아서 지번으로 필터링
  function recentYmds(months) {
    const d = new Date();
    return Array.from({ length: months }, (_, i) => {
      const t = new Date(d.getFullYear(), d.getMonth() - i, 1);
      return `${t.getFullYear()}${pad2(t.getMonth() + 1)}`;
    });
  }

  function aptTradesMonth(lawd, ymd) {
    const isRecent = recentYmds(3).includes(ymd); // 신고 기한(30일) 때문에 최근 달은 자주 갱신
    return cached(`apt:${lawd}:${ymd}`, isRecent ? 3 * HOUR : 7 * 24 * HOUR, async () => {
      const out = [];
      for (let page = 1; page <= 10; page++) {
        const { items, total } = await dataGoKr('/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade', {
          LAWD_CD: lawd, DEAL_YMD: ymd, numOfRows: '1000', pageNo: String(page),
        });
        out.push(...items);
        if (!items.length || out.length >= total) break;
      }
      return out;
    });
  }

  const normJibun = s => String(s ?? '').replace(/\s|산/g, '').replace(/^0+/, '').replace(/-0+$/, '');
  const normName = s => String(s ?? '').replace(/\s|\(.*?\)|아파트|APT/gi, '');

  async function apiAptTrades(q) {
    const pnu = q.get('pnu') ?? '';
    if (!/^\d{19}$/.test(pnu)) return [400, { error: 'PNU는 19자리 숫자입니다' }];
    if (!DATA_GO_KR_KEY) return [500, { error: 'DATA_GO_KR_KEY가 설정되지 않았습니다 (PC: .env / 앱: ⚙ 설정)' }];
    const months = Math.min(36, Math.max(1, Number(q.get('months')) || 12));
    const dong = (q.get('dong') ?? '').trim();
    const name = normName(q.get('name'));
    const lawd = pnu.slice(0, 5), umdCd = pnu.slice(5, 10);
    const bon = Number(pnu.slice(11, 15)), bu = Number(pnu.slice(15, 19));
    const jibun = bu ? `${bon}-${bu}` : String(bon);

    const all = (await mapLimit(recentYmds(months), 4, ymd => aptTradesMonth(lawd, ymd))).flat();
    const sameDong = r => (r.umdCd ? String(r.umdCd) === umdCd : !dong || r.umdNm === dong);
    let matchedBy = 'jibun';
    let rows = all.filter(r => sameDong(r) && normJibun(r.jibun) === jibun);
    if (!rows.length && name) {
      matchedBy = 'name';
      rows = all.filter(r => {
        const n = normName(r.aptNm);
        return sameDong(r) && n && (n.includes(name) || name.includes(n));
      });
    }
    const trades = rows.map(r => ({
      name: r.aptNm, dong: r.aptDong || '', area: num(r.excluUseAr), floor: num(r.floor), price: num(r.dealAmount),
      date: `${r.dealYear}-${pad2(r.dealMonth)}-${pad2(r.dealDay)}`, buildYear: r.buildYear,
      canceled: r.cdealType === 'O', cancelDate: r.cdealDay || '', type: r.dealingGbn || '',
    })).sort((a, b) => b.date.localeCompare(a.date));
    return [200, { pnu, jibun, months, matchedBy: rows.length ? matchedBy : null, trades }];
  }

  // ---------- 네이버 부동산 (비공식 내부 API, 참고: github.com/Seonh0/naver-land-mcp) ----------
  // 공식 API가 아니므로 개인 임장용으로만, 요청 간격 0.5초 이상을 지킵니다.
  const NL_BASE = 'https://new.land.naver.com/api';
  const NL_PAGE = 'https://new.land.naver.com/complexes';
  // 헤더·쿠키는 naver-land-mcp(config.py, naver_land.py)와 똑같이 맞춤
  const NL_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  };
  const NL_API_HEADERS = {
    ...NL_HEADERS,
    Accept: 'application/json, text/plain, */*',
    Referer: NL_PAGE,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let nlToken = null, nlCookie = '';
  async function naverLandToken(force = false) {
    if (!force && nlToken && nlToken.exp > Date.now() + 60_000) return nlToken.jwt;
    const res = await nlFetch(NL_PAGE, { headers: { ...NL_HEADERS, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' } });
    if (!res.ok) throw new Error(`네이버 부동산 HTTP ${res.status}`);
    // 메인 페이지에서 받은 쿠키를 이후 API 요청에 같이 보냄 (requests.Session과 같은 동작)
    const setCookies = res.headers.getSetCookie?.() ?? [];
    nlCookie = setCookies.map(c => c.split(';')[0]).join('; ');
    const html = await res.text();
    const jwt = html.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/)?.[0];
    if (!jwt) throw new Error('네이버 부동산 접속 토큰을 찾지 못했습니다');
    let exp = Date.now() + HOUR;
    try {
      const b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      exp = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))).exp * 1000;
    } catch { /* 기본 1시간 */ }
    nlToken = { jwt, exp };
    return jwt;
  }

  // 응답 자체가 없으면(네이버가 클라우드 서버 접속을 차단) 30분 동안은 10초씩 기다리지 않고 바로 안내
  const NL_NET_BLOCK_MS = 30 * 60_000;
  const NL_NET_BLOCK_MSG = '네이버 부동산이 클라우드 서버의 접속을 막고 있어 앱 안에서는 매물을 불러올 수 없습니다. 아래 "네이버 부동산에서 보기"를 눌러 확인하세요';
  async function nlFetch(url, opts) {
    try {
      return await netFetch(url, opts, 10000);
    } catch (e) {
      nlBlockedUntil = Date.now() + NL_NET_BLOCK_MS;
      nlBlockedMsg = NL_NET_BLOCK_MSG;
      throw Object.assign(new Error(`${NL_NET_BLOCK_MSG} (${e.message.split(' —')[0]})`), { status: 503 });
    }
  }

  let nlQueue = Promise.resolve(), nlLast = 0;
  function nlThrottle() {
    const turn = nlQueue.then(async () => {
      const wait = nlLast + 600 - Date.now();
      if (wait > 0) await sleep(wait);
      nlLast = Date.now();
    });
    nlQueue = turn.catch(() => {});
    return turn;
  }

  // 네이버가 429(요청 과다)로 막으면 그 시간 동안은 아예 요청하지 않고 쉽니다.
  let nlBlockedUntil = 0, nlBlockedMsg = '';
  const NL_COOLDOWN_MS = 10 * 60_000;

  async function naverLand(path, params = {}) {
    if (Date.now() < nlBlockedUntil) {
      const min = Math.ceil((nlBlockedUntil - Date.now()) / 60_000);
      throw Object.assign(new Error(nlBlockedMsg || `네이버 부동산이 접속을 일시 제한했습니다. 약 ${min}분 뒤 다시 시도하세요`), { status: 429 });
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const jwt = await naverLandToken(attempt > 0);
      await nlThrottle();
      const u = `${NL_BASE}${path}?${qs(params)}`;
      const res = await nlFetch(u, {
        headers: { ...NL_API_HEADERS, Authorization: `Bearer ${jwt}`, ...(nlCookie && { Cookie: nlCookie }) },
      });
      if (res.status === 429) {
        nlBlockedUntil = Date.now() + NL_COOLDOWN_MS;
        nlBlockedMsg = '';
        throw Object.assign(new Error('네이버 부동산이 접속을 일시 제한했습니다(요청 과다). 10분쯤 뒤 다시 시도하세요'), { status: 429 });
      }
      if (res.status === 401 || res.status === 403) continue; // 토큰 재발급 후 한 번만 재시도
      if (!res.ok) throw new Error(`네이버 부동산 HTTP ${res.status}`);
      const j = await res.json();
      if (j?.error) throw new Error(`네이버 부동산: ${j.error.message ?? JSON.stringify(j.error)}`);
      return j;
    }
    throw new Error('네이버 부동산이 요청을 거절했습니다. 잠시 후 다시 시도하세요');
  }

  // 네이버 가격 표기 → 만원 ('10억 5,000' → 105000, '9,500' → 9500, 읽을 수 없으면 null)
  function priceMan(text) {
    const t = String(text ?? '').replace(/[,\s]/g, '');
    const m = t.match(/^(?:(\d+(?:\.\d+)?)억)?(\d+)?$/);
    if (!t || !m || (!m[1] && !m[2])) return null;
    return Math.round(Number(m[1] || 0) * 10000) + Number(m[2] || 0);
  }
  // 최저가순 (월세는 보증금 → 월세 순), 가격을 읽을 수 없으면 맨 뒤
  const byPrice = (x, y) => (x.priceMan ?? Infinity) - (y.priceMan ?? Infinity) || (x.rentMan ?? 0) - (y.rentMan ?? 0);
  const nlOrder = new Map(); // 단지·거래유형별로 네이버가 받아준 정렬 방식 (prc 거부 시 rank)

  // ---------- 아파트 이름 검색 (자동완성) ----------
  // 네이버 부동산 단지 검색(앱에서만 됨) + VWorld 장소 검색(웹에서도 됨)을 합쳐 최대 10개
  const pick = (o, ...keys) => { for (const k of keys) if (o?.[k] != null && o[k] !== '') return o[k]; return undefined; };
  const normKey = s => String(s ?? '').replace(/\s|\(.*?\)|아파트/g, '').toLowerCase();

  async function searchNaver(query) {
    if (!NAVER_LAND_ENABLED) return [];
    const j = await cached(`nl:search:${query}`, 10 * 60_000, () => naverLand('/search', { keyword: query }));
    return asArray(j?.complexes).map(c => ({
      name: pick(c, 'complexName', 'name'),
      address: pick(c, 'cortarAddress', 'address', 'detailAddress') || '',
      type: pick(c, 'realEstateTypeName') || '',
      households: num(pick(c, 'totalHouseholdCount')),
      lat: num(pick(c, 'latitude', 'lat')), lng: num(pick(c, 'longitude', 'lng')),
      complexNo: String(pick(c, 'complexNo') ?? '') || undefined,
      source: 'naver',
    })).filter(c => c.name);
  }

  async function searchVworld(query) {
    if (!VWORLD_KEY) return [];
    const j = await cached(`vw:search:${query}`, HOUR, async () => JSON.parse(await getText(`https://api.vworld.kr/req/search?${qs({
      service: 'search', request: 'search', version: '2.0', crs: 'EPSG:4326', size: '15', page: '1',
      query, type: 'place', format: 'json', errorformat: 'json', key: VWORLD_KEY, domain: VWORLD_DOMAIN,
    })}`)));
    const r = j?.response;
    if (r?.status === 'NOT_FOUND') return [];
    if (r?.status !== 'OK') throw new Error(`VWorld 검색: ${r?.error?.text ?? r?.status}`);
    return asArray(r.result?.items)
      .filter(i => /아파트|주상복합|주택|오피스텔/.test(`${i.category ?? ''} ${i.title ?? ''}`))
      .map(i => ({
        name: i.title, address: i.address?.road || i.address?.parcel || '', type: '',
        lat: num(i.point?.y), lng: num(i.point?.x), source: 'vworld',
      })).filter(i => i.name && Number.isFinite(i.lat));
  }

  async function apiSearch(q) {
    const query = (q.get('q') ?? '').trim().slice(0, 40);
    if (!query) return [200, { query, items: [] }];
    const [nv, vw] = await Promise.allSettled([searchNaver(query), searchVworld(query)]);
    const items = [], seen = new Set();
    for (const it of [...(nv.value ?? []), ...(vw.value ?? [])]) {
      const k = normKey(it.name);
      if (seen.has(k)) continue;
      seen.add(k); items.push(it);
      if (items.length >= 10) break;
    }
    const errors = [nv, vw].filter(r => r.status === 'rejected').map(r => r.reason.message);
    if (!items.length && errors.length === 2) return [502, { error: errors.join(' / ') }];
    return [200, { query, items, naverOk: nv.status === 'fulfilled' }];
  }

  // 검색 결과에 좌표가 없을 때 단지 번호로 위치 조회
  async function apiComplexLocation(q) {
    const no = q.get('complexNo') ?? '';
    if (!/^\d+$/.test(no)) return [400, { error: '단지 번호가 필요합니다' }];
    const j = await cached(`nl:cxloc:${no}`, 24 * HOUR, () => naverLand(`/complexes/${no}`));
    const d = j?.complexDetail ?? {};
    const lat = num(d.latitude), lng = num(d.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [404, { error: '단지 위치를 찾지 못했습니다' }];
    return [200, { complexNo: no, name: d.complexName, address: d.address || d.cortarAddress || '', lat, lng }];
  }

  // 앱을 켜자마자 네이버 접속 토큰을 미리 받아 두면 첫 매물 조회가 빨라짐
  async function apiNaverWarmup() {
    if (!NAVER_LAND_ENABLED) return [200, { ok: false }];
    try { await naverLandToken(); return [200, { ok: true }]; } catch (e) { return [200, { ok: false, error: e.message }]; }
  }

  function distM(a, b) {
    const R = 6371008.8, rad = Math.PI / 180;
    const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  async function apiListings(q) {
    if (!NAVER_LAND_ENABLED) return [501, { error: '네이버 부동산 연동이 꺼져 있습니다' }];
    const pnu = q.get('pnu') ?? '';
    if (!/^\d{19}$/.test(pnu)) return [400, { error: 'PNU는 19자리 숫자입니다' }];
    const here = { lat: Number(q.get('lat')), lng: Number(q.get('lng')) };
    const tradeType = ['A1', 'B1', 'B2'].includes(q.get('tradeType')) ? q.get('tradeType') : 'A1';
    const name = normName(q.get('name'));
    const cortarNo = pnu.slice(0, 10); // 네이버 지역코드 = 법정동코드 10자리

    const complexes = await cached(`nl:cx:${cortarNo}`, 24 * HOUR, async () =>
      (await naverLand('/regions/complexes', { cortarNo, realEstateType: 'APT:ABYG:JGC', order: '' })).complexList ?? []);
    if (!complexes.length) return [404, { error: '이 동에는 네이버 부동산에 등록된 아파트 단지가 없습니다' }];

    const ranked = complexes
      .map(c => ({ ...c, dist: distM(here, { lat: Number(c.latitude), lng: Number(c.longitude) }) }))
      .sort((a, b) => a.dist - b.dist);
    const wanted = q.get('complexNo');
    const byName = name && ranked.find(c => { const n = normName(c.complexName); return n && (n.includes(name) || name.includes(n)); });
    const cx = ranked.find(c => String(c.complexNo) === wanted) || byName || ranked[0];
    const candidates = ranked.slice(0, 6).map(c => ({ complexNo: String(c.complexNo), name: c.complexName, dist: Math.round(c.dist) }));
    const complex = {
      complexNo: String(cx.complexNo), name: cx.complexName, households: num(cx.totalHouseholdCount),
      buildings: num(cx.totalBuildingCount), approved: cx.useApproveYmd, highFloor: num(cx.highFloor),
      dealCount: num(cx.dealCount), leaseCount: num(cx.leaseCount), rentCount: num(cx.rentCount),
      dist: Math.round(cx.dist), url: `${NL_PAGE}/${cx.complexNo}`,
    };

    // 한 번에 한 페이지(약 20건)만 받아 빨리 보여주고, 나머지는 앱의 '더 보기'로 받음.
    // 가격순(prc)으로 받으므로 1페이지에 최저가 매물이 들어옴. 네이버가 거부하면 랭킹순(rank)으로 받아 직접 정렬
    const page = Math.min(20, Math.max(1, Number(q.get('page')) || 1));
    const orderKey = `${complex.complexNo}:${tradeType}`;
    const fetchPage = order => cached(`nl:art:${orderKey}:${order}:${page}`, 10 * 60_000, () =>
      naverLand(`/articles/complex/${complex.complexNo}`, { tradeType, order, page: String(page) }));
    let j;
    try {
      j = await fetchPage(nlOrder.get(orderKey) || 'prc');
    } catch (e) {
      if (e.status || nlOrder.get(orderKey) === 'rank') throw e; // 차단·요청 과다는 그대로 알림
      nlOrder.set(orderKey, 'rank');
      j = await fetchPage('rank');
    }
    const articles = j.articleList ?? [];

    const listings = articles.map(a => ({
      articleNo: a.articleNo, tradeType: a.tradeTypeCode, price: a.dealOrWarrantPrc, rent: a.rentPrc && a.rentPrc !== '0' ? a.rentPrc : '',
      area: num(a.area2), supplyArea: num(a.area1), areaName: a.areaName, building: a.buildingName, floor: a.floorInfo,
      direction: a.direction, desc: a.articleFeatureDesc, tags: asArray(a.tagList), realtor: a.realtorName,
      confirmedAt: a.articleConfirmYmd, sameAddrCnt: num(a.sameAddrCnt),
      url: `${NL_PAGE}/${complex.complexNo}?articleNo=${a.articleNo}`,
      // 정렬용 숫자(만원). 읽을 수 없는 가격(협의 등)은 null → 맨 뒤
      priceMan: priceMan(a.dealOrWarrantPrc), rentMan: a.rentPrc && a.rentPrc !== '0' ? priceMan(a.rentPrc) : 0,
    }));
    listings.sort(byPrice);
    return [200, { complex, candidates, tradeType, listings, page, hasMore: !!j.isMoreData && listings.length > 0 }];
  }

  // '/api/parcel?lat=..' 같은 경로를 받아 [HTTP 상태, 응답 객체]를 돌려줌
  return async function handle(pathWithQuery) {
    const [pathname, search = ''] = String(pathWithQuery).split('?');
    const q = parseQuery(search);
    try {
      if (pathname === '/api/parcel') return await apiParcel(q);
      if (pathname.startsWith('/api/land/')) return await apiLand(pathname.slice('/api/land/'.length));
      if (pathname === '/api/apt-trades') return await apiAptTrades(q);
      if (pathname === '/api/listings') return await apiListings(q);
      if (pathname === '/api/naver-warmup') return await apiNaverWarmup();
      if (pathname === '/api/search') return await apiSearch(q);
      if (pathname === '/api/complex-location') return await apiComplexLocation(q);
      return [404, { error: 'Unknown API' }];
    } catch (err) {
      console.error(err.message);
      return [err.status ?? 502, { error: err.message }];
    }
  };
}
