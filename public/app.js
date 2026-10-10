'use strict';

// ===================== 유틸 =====================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (n == null || Number.isNaN(n) ? '-' : Number(n).toLocaleString('ko-KR'));
const PY = 3.305785;
const toPy = m2 => m2 / PY;
const ymd = s => (s && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6)}` : s || '-');

// 만원 단위 → "12억 3,000"
function eok(man) {
  if (man == null) return '-';
  const e = Math.floor(man / 10000), r = man % 10000;
  return e ? `${e}억${r ? ' ' + r.toLocaleString('ko-KR') : ''}` : `${man.toLocaleString('ko-KR')}만`;
}
// 원 단위 큰 금액 → "약 3억 2,000만원"
function wonShort(won) {
  if (won == null) return '-';
  const man = Math.round(won / 10000);
  if (man >= 1e8) { // 1조 이상
    const jo = Math.floor(man / 1e8), eokRest = Math.floor((man % 1e8) / 10000);
    return `약 ${jo}조${eokRest ? ` ${eokRest.toLocaleString('ko-KR')}억` : ''}원`;
  }
  return man >= 10000 ? `약 ${eok(man)}만원`.replace(/억만원$/, '억원') : `약 ${fmt(man)}만원`;
}

async function api(path) {
  if (window.ReactNativeWebView) return nativeApi(path); // 아이폰 앱: 서버 없이 앱이 직접 조회
  const r = await fetch(path);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

// 앱(React Native)에 요청을 넘기고 답을 기다림 — window.__imjangNative의 'api-result'로 돌아옴
const nativeCalls = new Map();
let nativeSeq = 0;
function nativeApi(path) {
  return new Promise((resolve, reject) => {
    const id = ++nativeSeq;
    nativeCalls.set(id, { resolve, reject });
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'api', id, path }));
  });
}

function haversine(a, b) {
  const R = 6371008.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const llObj = ll => ({ lat: ll.lat(), lng: ll.lng() });

// ===================== 상태 =====================
const state = {
  mode: 'apt',          // 'apt' | 'land'
  tool: 'info',         // 'info' | 'slope' | 'street'
  map: null, cadastral: null, street: null, cadastralOn: false,
  parcelShape: null, clickMarker: null, myMarker: null,
  slope: { points: [], markers: [], line: null },
  pano: null, panoMarker: null,
  current: null,        // { ll, parcel, land, trades, tradesErr, tradesLoading, listings, tab, area }
  reqId: 0,
};

// ===================== 네이버 지도 로딩 =====================
function loadNaverMaps() {
  const id = window.APP_CONFIG?.naverKeyId;
  if (!id) return Promise.reject(new Error(IN_APP ? '⚙ 설정에서 네이버 지도 Client ID를 입력하세요.' : '.env에 NAVER_MAP_KEY_ID가 설정되지 않았습니다.'));
  // 지금 열린 주소를 그대로 보여줘서 NCP 콘솔에 무엇을 등록해야 하는지 바로 알 수 있게 함
  const origin = IN_APP ? 'http://localhost:3000' : location.origin;
  window.navermap_authFailure = () =>
    showFatal(`네이버 지도 인증 실패: 네이버 클라우드 콘솔 → Maps → Application → Web 서비스 URL에 아래 주소를 그대로 추가하세요. (저장 후 반영까지 몇 분 걸릴 수 있습니다)\n\n${origin}`);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(id)}&submodules=panorama`;
    s.onload = resolve;
    s.onerror = () => reject(new Error('네이버 지도 스크립트를 불러오지 못했습니다.'));
    document.head.appendChild(s);
  });
}

function showFatal(msg) {
  const el = $('#fatal');
  el.innerHTML = `<b>시작할 수 없습니다</b><p>${esc(msg)}</p><p class="muted">README의 "API 키 설정"을 참고하세요.</p>
    ${IN_APP ? '<button class="btn" data-native="settings">API 키 설정</button>' : ''}`;
  el.classList.remove('hidden');
}

// ===================== iOS 앱(Expo) 연동 =====================
// 앱 안에서 열리면 GPS는 앱이 대신 받아주고(http 주소에서도 동작), 설정 버튼이 생깁니다.
const IN_APP = !!(window.ReactNativeWebView || window.IMJANG_APP);
const toNative = msg => window.ReactNativeWebView?.postMessage(JSON.stringify(msg));
if (IN_APP) document.body.classList.add('in-app');
document.addEventListener('click', e => {
  const t = e.target.closest('[data-native]');
  if (t) toNative({ type: t.dataset.native });
});
window.__imjangNative = msg => {
  if (msg.type === 'api-result') {
    const call = nativeCalls.get(msg.id);
    if (!call) return;
    nativeCalls.delete(msg.id);
    if (msg.status >= 200 && msg.status < 300) call.resolve(msg.body);
    else call.reject(new Error(msg.body?.error || `HTTP ${msg.status}`));
  }
  if (msg.type === 'location') showMyLocation(msg.lat, msg.lng);
  if (msg.type === 'location-error') setHint(`위치를 가져오지 못했습니다: ${msg.message}`);
};

// ===================== 아이폰 홈 화면 설치 안내 =====================
// 사파리로 열었고 아직 홈 화면 앱으로 실행한 게 아니면 한 번 안내 (닫으면 다시 안 띄움)
(() => {
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  let dismissed = false;
  try { dismissed = localStorage.getItem('imjang:installTip') === 'off'; } catch { /* 무시 */ }
  if (!isIOS || standalone || IN_APP || dismissed) return;
  const tip = $('#install-tip');
  tip.classList.remove('hidden');
  tip.querySelector('.install-tip-close').addEventListener('click', () => {
    tip.classList.add('hidden');
    try { localStorage.setItem('imjang:installTip', 'off'); } catch { /* 무시 */ }
  });
})();

loadNaverMaps().then(init).catch(e => showFatal(e.message));

function init() {
  const N = naver.maps;
  let center = new N.LatLng(37.5665, 126.978), zoom = 17;
  try {
    const saved = JSON.parse(localStorage.getItem('imjang:view') || 'null');
    if (saved) { center = new N.LatLng(saved.lat, saved.lng); zoom = saved.zoom; }
  } catch { /* 저장된 위치 없음 */ }

  state.map = new N.Map('map', {
    center, zoom,
    mapTypeId: N.MapTypeId.HYBRID,   // 위성 + 도로/지명 라벨
    mapTypeControl: true,
    mapTypeControlOptions: { style: N.MapTypeControlStyle.BUTTON, position: N.Position.TOP_RIGHT },
    zoomControl: true,
    zoomControlOptions: { position: N.Position.RIGHT_CENTER },
    scaleControl: true,
  });
  state.cadastral = new N.CadastralLayer();
  state.street = new N.StreetLayer();

  N.Event.addListener(state.map, 'click', e => onMapClick(e.coord));
  N.Event.addListener(state.map, 'idle', () => {
    const c = state.map.getCenter();
    try { localStorage.setItem('imjang:view', JSON.stringify({ lat: c.lat(), lng: c.lng(), zoom: state.map.getZoom() })); } catch { /* 무시 */ }
  });

  $$('.mode-tabs button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $$('.tools [data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('#btn-cadastral').addEventListener('click', () => setCadastral(!state.cadastralOn));
  $('#btn-locate').addEventListener('click', locateMe);
  $('.panel-close').addEventListener('click', closePanel);
  $('.panel-grip').addEventListener('click', () => $('#panel').classList.toggle('expanded'));
  $('.pano-close').addEventListener('click', closePano);
  $('#panel-body').addEventListener('click', onPanelClick);

  setMode('apt');
  setTool('info');
}

// ===================== 모드 / 도구 =====================
function setMode(mode) {
  state.mode = mode;
  $$('.mode-tabs button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  document.body.dataset.mode = mode;
  setCadastral(mode === 'land'); // 상가·토지 모드는 지적편집도가 기본
  if (state.current?.parcel) {
    if (mode === 'land') state.current.tab = 'land';
    renderInfo();
  }
}

function setCadastral(on) {
  state.cadastralOn = on;
  state.cadastral.setMap(on ? state.map : null);
  $('#btn-cadastral').classList.toggle('active', on);
}

const HINTS = {
  info: '건물이나 토지를 누르면 정보를 보여줍니다',
  slope: '출발 지점(A)을 누르세요',
  street: '파란 선(거리뷰 촬영 도로) 위를 누르세요',
};

function setTool(tool) {
  if (state.tool === 'slope' && tool !== 'slope') clearSlope();
  state.tool = tool;
  $$('.tools [data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  state.street.setMap(tool === 'street' ? state.map : null);
  setHint(HINTS[tool]);
}

let hintTimer;
function setHint(text) {
  const el = $('#hint');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

function onMapClick(ll) {
  if (state.tool === 'info') showParcel(ll);
  else if (state.tool === 'slope') addSlopePoint(ll);
  else if (state.tool === 'street') openPano(ll);
}

// ===================== 패널 =====================
function openPanel(html) {
  $('#panel-body').innerHTML = html;
  $('#panel').classList.remove('hidden');
}
function closePanel() {
  $('#panel').classList.add('hidden');
  $('#panel').classList.remove('expanded');
  state.parcelShape?.setMap(null);
  state.clickMarker?.setMap(null);
  state.current = null;
  if (state.tool === 'slope') clearSlope();
}
const loadingBox = text => `<div class="loading"><span class="spinner"></span>${esc(text)}</div>`;
const errorBox = text => `<div class="error">${esc(text)}</div>`;

function onPanelClick(e) {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const cur = state.current;
  switch (t.dataset.action) {
    case 'tab':
      cur.tab = t.dataset.tab;
      if (cur.tab === 'trades') ensureTrades();
      if (cur.tab === 'listings') ensureListings();
      renderInfo();
      break;
    case 'area': cur.area = t.dataset.area; renderInfo(); break;
    case 'listing-type': cur.listingType = t.dataset.type; ensureListings(); renderInfo(); break;
    case 'complex': cur.complexNo = t.dataset.complex; ensureListings(); renderInfo(); break;
    case 'retry-listings': delete cur.listings[listingKey(cur)]; ensureListings(); renderInfo(); break;
    case 'pano': openPano(cur.ll); break;
    case 'retry-trades': cur.trades = null; cur.tradesErr = null; ensureTrades(); renderInfo(); break;
  }
}

// ===================== 필지 정보 (토지이음 데이터) =====================
async function showParcel(ll) {
  const id = ++state.reqId;
  placeClickMarker(ll);
  openPanel(loadingBox('필지 조회 중…'));
  try {
    const parcel = await api(`/api/parcel?lat=${ll.lat()}&lng=${ll.lng()}`);
    if (id !== state.reqId) return;
    drawParcel(parcel.geometry);
    state.current = { ll, parcel, land: null, tab: 'land', area: 'all', listingType: 'A1' };
    renderInfo();
    const land = await api(`/api/land/${parcel.pnu}`).catch(e => ({ fatal: e.message }));
    if (id !== state.reqId) return;
    state.current.land = land;
    if (state.mode === 'apt') ensureTrades();
    renderInfo();
  } catch (e) {
    if (id === state.reqId) openPanel(errorBox(e.message));
  }
}

function placeClickMarker(ll) {
  if (!state.clickMarker) {
    state.clickMarker = new naver.maps.Marker({
      map: state.map, position: ll,
      icon: { content: '<div class="dot"></div>', anchor: new naver.maps.Point(7, 7) },
    });
  } else {
    state.clickMarker.setPosition(ll);
    state.clickMarker.setMap(state.map);
  }
}

function drawParcel(geometry) {
  state.parcelShape?.setMap(null);
  if (!geometry) return;
  const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  const paths = polys.flatMap(rings => rings.map(ring => ring.map(([x, y]) => new naver.maps.LatLng(y, x))));
  state.parcelShape = new naver.maps.Polygon({
    map: state.map, paths, clickable: false,
    strokeColor: '#ffd400', strokeWeight: 3, fillColor: '#ffd400', fillOpacity: 0.18,
  });
}

function dongOf(addr) {
  // "서울특별시 강남구 대치동 316" → "대치동"
  const parts = String(addr || '').split(/\s+/);
  return parts.length >= 2 ? parts[parts.length - 2] : '';
}

function ensureTrades() {
  const cur = state.current;
  if (!cur?.parcel || cur.trades || cur.tradesLoading || state.mode !== 'apt') return;
  if (!cur.land) return; // 건물명(이름 매칭 백업용)이 필요하므로 토지정보 이후에 호출
  cur.tradesLoading = true;
  const name = cur.land.buildings?.find(b => b.name)?.name || '';
  const q = new URLSearchParams({ pnu: cur.parcel.pnu, dong: dongOf(cur.parcel.addr), name, months: '24' });
  api(`/api/apt-trades?${q}`)
    .then(r => { cur.trades = r; })
    .catch(e => { cur.tradesErr = e.message; })
    .finally(() => { cur.tradesLoading = false; if (state.current === cur) renderInfo(); });
}

// 매물은 거래유형(매매/전세/월세)·단지별로 따로 불러와 둡니다: cur.listings["단지번호|A1"]
function listingKey(cur) { return `${cur.complexNo || ''}|${cur.listingType}`; }

function ensureListings() {
  const cur = state.current;
  if (!cur?.parcel || state.mode !== 'apt') return;
  cur.listings ??= {};
  const key = listingKey(cur);
  if (cur.listings[key]) return;
  cur.listings[key] = { loading: true };
  const q = new URLSearchParams({
    pnu: cur.parcel.pnu, lat: cur.ll.lat(), lng: cur.ll.lng(), tradeType: cur.listingType,
    name: cur.land?.buildings?.find(b => b.name)?.name || '',
  });
  if (cur.complexNo) q.set('complexNo', cur.complexNo);
  api(`/api/listings?${q}`)
    .then(r => {
      cur.listings[key] = r;
      if (!cur.complexNo) { cur.complexNo = r.complex.complexNo; cur.listings[listingKey(cur)] = r; }
    })
    .catch(e => { cur.listings[key] = { error: e.message }; })
    .finally(() => { if (state.current === cur) renderInfo(); });
}

function naverLandUrl(ll) {
  const a = state.mode === 'apt' ? 'APT:ABYG:JGC' : 'SG:SMS:GJCG:TJ';
  const page = state.mode === 'apt' ? 'complexes' : 'offices';
  return `https://new.land.naver.com/${page}?ms=${ll.lat().toFixed(6)},${ll.lng().toFixed(6)},17&a=${a}`;
}
const eumUrl = pnu => `https://www.eum.go.kr/web/ar/lu/luLandDet.jsp?pnu=${pnu}&mode=search&isNoScr=script&selGbn=umd`;

function renderInfo() {
  const cur = state.current;
  if (!cur?.parcel) return;
  const p = cur.parcel;
  const bldName = cur.land?.buildings?.find(b => b.name)?.name;
  const tabs = state.mode === 'apt'
    ? [['land', '토지·건물'], ['trades', '실거래가'], ['listings', '매물']]
    : [['land', '토지·건물'], ['listings', '매물']];
  if (!tabs.some(([k]) => k === cur.tab)) cur.tab = 'land';

  let body;
  if (cur.tab === 'trades') body = renderTrades(cur);
  else if (cur.tab === 'listings') body = renderListings(cur);
  else body = renderLand(cur);

  openPanel(`
    <div class="ph">
      ${bldName ? `<div class="ph-name">${esc(bldName)}</div>` : ''}
      <div class="ph-addr">${esc(p.addr)}</div>
      <div class="ph-links">
        <button data-action="pano" class="chip">거리뷰</button>
        <a class="chip" href="${eumUrl(p.pnu)}" target="_blank" rel="noopener">토지이음</a>
        <a class="chip" href="${naverLandUrl(cur.ll)}" target="_blank" rel="noopener">네이버부동산</a>
      </div>
    </div>
    <div class="tabs">${tabs.map(([k, label]) =>
      `<button data-action="tab" data-tab="${k}" class="${cur.tab === k ? 'active' : ''}">${label}</button>`).join('')}</div>
    <div class="tab-body">${body}</div>`);
}

function renderLand(cur) {
  const { parcel: p, land } = cur;
  // 1) 공시지가: 토지특성/공시지가 API 최신값 → 없으면 필지 레이어 값
  const latest = land?.prices?.[0];
  const price = latest?.price ?? land?.characteristics?.price ?? (Number(p.jiga) || null);
  const priceYear = latest?.year ?? land?.characteristics?.year ?? p.gosi_year;
  const c = land?.characteristics;
  const area = c?.area;

  let html = `
    <section class="kpi">
      <div class="kpi-label">개별공시지가 ${priceYear ? `(${esc(priceYear)}년)` : ''}</div>
      <div class="kpi-value">${price ? fmt(price) : '-'}<small>원/㎡</small></div>
      ${price ? `<div class="kpi-sub">평당 ${fmt(Math.round(price * PY))}원${area ? ` · 필지 전체 ${wonShort(price * area)}` : ''}</div>` : ''}
    </section>`;

  if (!land) return html + loadingBox('토지이용계획·건축물 정보 조회 중…');
  if (land.fatal) return html + errorBox(land.fatal);

  if (c) {
    html += `<section><h4>토지 특성 <span class="muted">${esc(c.year)}년 기준</span></h4>
      <dl class="grid">
        <dt>지목</dt><dd>${esc(c.landCategory || '-')}</dd>
        <dt>면적</dt><dd>${area ? `${fmt(area)}㎡ <span class="muted">(${toPy(area).toFixed(1)}평)</span>` : '-'}</dd>
        <dt>용도지역</dt><dd><b>${esc(c.zoning || '-')}</b></dd>
        <dt>이용상황</dt><dd>${esc(c.useStatus || '-')}</dd>
        <dt>지형</dt><dd>${esc([c.heightType, c.shape].filter(Boolean).join(' · ') || '-')}</dd>
        <dt>도로접면</dt><dd>${esc(c.roadSide || '-')}</dd>
      </dl></section>`;
  }

  if (land.landUse?.length) {
    const inc = land.landUse.filter(u => u.status === '포함');
    const etc = land.landUse.filter(u => u.status !== '포함');
    html += `<section><h4>토지이용계획</h4>
      <div class="tags">${inc.map(u => `<span class="tag">${esc(u.name)}</span>`).join('')}</div>
      ${etc.length ? `<div class="tags">${etc.map(u => `<span class="tag tag-weak" title="${esc(u.status)}">${esc(u.name)} <i>${esc(u.status)}</i></span>`).join('')}</div>` : ''}
    </section>`;
  }

  if (land.prices?.length > 1) {
    const rows = land.prices.slice(0, 6);
    html += `<section><h4>공시지가 추이 <span class="muted">원/㎡</span></h4><table class="tbl">
      ${rows.map((r, i) => {
        const prev = land.prices[i + 1];
        const ch = prev?.price ? ((r.price / prev.price - 1) * 100) : null;
        return `<tr><td>${r.year}</td><td class="r">${fmt(r.price)}</td>
          <td class="r ${ch > 0 ? 'up' : ch < 0 ? 'down' : ''}">${ch == null ? '' : `${ch > 0 ? '+' : ''}${ch.toFixed(1)}%`}</td></tr>`;
      }).join('')}</table></section>`;
  }

  if (land.buildings?.length) {
    html += `<section><h4>건축물대장 <span class="muted">${land.buildings.length}동</span></h4>
      ${land.buildings.slice(0, 12).map(b => `
        <div class="bcard">
          <div class="bcard-t">${esc([b.name, b.dong].filter(Boolean).join(' ') || '(건물명 없음)')}
            <span class="muted">${esc(b.purpose || '')}</span></div>
          <div class="bcard-m">
            ${b.floors != null ? `지상 ${b.floors}층${b.basements ? `/지하 ${b.basements}층` : ''}` : ''}
            ${b.totalArea ? ` · 연면적 ${fmt(Math.round(b.totalArea))}㎡` : ''}
            ${b.households ? ` · ${fmt(b.households)}세대` : ''}
          </div>
          <div class="bcard-m muted">
            사용승인 ${ymd(b.approved)}
            ${b.coverageRatio ? ` · 건폐율 ${b.coverageRatio}%` : ''}${b.floorAreaRatio ? ` · 용적률 ${b.floorAreaRatio}%` : ''}
            ${b.structure ? ` · ${esc(b.structure)}` : ''}
          </div>
        </div>`).join('')}
      ${land.buildings.length > 12 ? `<div class="muted">외 ${land.buildings.length - 12}동</div>` : ''}
    </section>`;
  } else if (!land.errors?.buildings) {
    html += `<section><h4>건축물대장</h4><div class="muted">등록된 건축물이 없습니다 (나대지·도로 등).</div></section>`;
  }

  const errs = Object.entries(land.errors || {}).filter(([, v]) => v);
  if (errs.length) html += `<div class="note">일부 정보를 불러오지 못했습니다: ${errs.map(([, v]) => esc(v)).join(' / ')}</div>`;
  html += `<div class="foot">PNU ${esc(p.pnu)} · 출처: 국토교통부(VWorld·건축HUB). 토지이음과 동일한 원천 데이터입니다.</div>`;
  return html;
}

// ===================== 실거래가 =====================
function renderTrades(cur) {
  if (cur.tradesErr) return errorBox(cur.tradesErr) + `<button class="btn" data-action="retry-trades">다시 시도</button>`;
  if (!cur.trades) return loadingBox('국토교통부 실거래가 조회 중… (최근 24개월)');
  const { trades, matchedBy, jibun, months } = cur.trades;
  if (!trades.length) {
    return `<div class="empty">최근 ${months}개월간 이 필지(${esc(jibun)})의 아파트 매매 신고가 없습니다.
      <p class="muted">아파트가 아니거나, 단지의 대표 지번이 다른 필지일 수 있어요. 단지 안의 다른 위치도 눌러보세요.</p></div>`;
  }

  // 전용면적별 그룹 (네이버 부동산처럼 평형 칩)
  const areaKey = a => a.toFixed(2);
  const groups = new Map();
  for (const t of trades) {
    const k = areaKey(t.area);
    groups.set(k, (groups.get(k) || 0) + 1);
  }
  const areas = [...groups.keys()].sort((a, b) => a - b);
  if (cur.area !== 'all' && !groups.has(cur.area)) cur.area = 'all';
  const list = cur.area === 'all' ? trades : trades.filter(t => areaKey(t.area) === cur.area);
  const valid = list.filter(t => !t.canceled);
  const last = valid[0];
  const max = valid.reduce((m, t) => (!m || t.price > m.price ? t : m), null);

  return `
    ${matchedBy === 'name' ? `<div class="note">지번 일치 거래가 없어 단지명으로 찾은 결과입니다.</div>` : ''}
    <div class="chips">
      <button data-action="area" data-area="all" class="chip ${cur.area === 'all' ? 'active' : ''}">전체</button>
      ${areas.map(k => `<button data-action="area" data-area="${k}" class="chip ${cur.area === k ? 'active' : ''}">
        ${Math.round(toPy(+k))}평 <span class="muted">${(+k).toFixed(1)}㎡</span></button>`).join('')}
    </div>
    <div class="kpi-row">
      <div><div class="kpi-label">최근 거래</div><div class="kpi-value sm">${last ? eok(last.price) : '-'}</div>
        <div class="kpi-sub">${last ? `${last.date} · ${last.floor}층` : ''}</div></div>
      <div><div class="kpi-label">최고가 (${months}개월)</div><div class="kpi-value sm">${max ? eok(max.price) : '-'}</div>
        <div class="kpi-sub">${max ? `${max.date} · ${max.floor}층` : ''}</div></div>
      <div><div class="kpi-label">거래 건수</div><div class="kpi-value sm">${valid.length}건</div>
        <div class="kpi-sub">${list.length - valid.length ? `취소 ${list.length - valid.length}건 제외` : ''}</div></div>
    </div>
    ${tradeChart(valid)}
    <table class="tbl trades">
      <thead><tr><th>계약일</th><th>면적</th><th>층</th><th class="r">거래가</th></tr></thead>
      <tbody>${list.slice(0, 100).map(t => `
        <tr class="${t.canceled ? 'canceled' : ''}">
          <td>${t.date.slice(2).replace(/-/g, '.')}</td>
          <td>${t.area.toFixed(1)}㎡${t.dong ? ` <span class="muted">${esc(t.dong)}</span>` : ''}</td>
          <td>${t.floor}</td>
          <td class="r"><b>${eok(t.price)}</b>${t.canceled ? ' <span class="badge">취소</span>' : ''}${t.type === '직거래' ? ' <span class="badge weak">직거래</span>' : ''}</td>
        </tr>`).join('')}</tbody>
    </table>
    <div class="foot">${esc(trades[0].name)} · 출처: 국토교통부 아파트 매매 실거래가 (신고 기한 30일로 최근 거래는 늦게 반영될 수 있음)</div>`;
}

function tradeChart(rows) {
  if (rows.length < 2) return '';
  const W = 340, H = 130, P = { l: 44, r: 8, t: 10, b: 20 };
  const ts = rows.map(r => +new Date(r.date)), ps = rows.map(r => r.price);
  const t0 = Math.min(...ts), t1 = Math.max(...ts);
  let p0 = Math.min(...ps), p1 = Math.max(...ps);
  const pad = (p1 - p0) * 0.1 || p1 * 0.05;
  p0 -= pad; p1 += pad;
  const x = t => P.l + ((t - t0) / (t1 - t0 || 1)) * (W - P.l - P.r);
  const y = p => P.t + (1 - (p - p0) / (p1 - p0)) * (H - P.t - P.b);
  const ticks = [p0 + pad, (p0 + p1) / 2, p1 - pad];
  const label = v => (v >= 10000 ? `${(v / 10000).toFixed(1)}억` : `${Math.round(v / 1000) / 10}천`);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="거래가 추이">
    ${ticks.map(v => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/>
      <text x="${P.l - 6}" y="${y(v) + 4}" text-anchor="end">${label(v)}</text>`).join('')}
    <text x="${P.l}" y="${H - 4}">${rows.at(-1).date.slice(0, 7)}</text>
    <text x="${W - P.r}" y="${H - 4}" text-anchor="end">${rows[0].date.slice(0, 7)}</text>
    ${rows.map(r => `<circle cx="${x(+new Date(r.date)).toFixed(1)}" cy="${y(r.price).toFixed(1)}" r="3.5"><title>${r.date} ${eok(r.price)} (${r.floor}층, ${r.area}㎡)</title></circle>`).join('')}
  </svg>`;
}

// ===================== 매물 (네이버 부동산 스타일) =====================
const LISTING_TYPES = [['A1', '매매'], ['B1', '전세'], ['B2', '월세']];
function renderListings(cur) {
  const openBtn = url => `<a class="btn primary" href="${url}" target="_blank" rel="noopener">네이버 부동산에서 보기</a>`;
  if (state.mode !== 'apt') {
    return `<div class="empty">상가·토지 매물은 아직 앱 안에서 보여주지 않습니다. 같은 위치의 네이버 부동산을 열어보세요.</div>${openBtn(naverLandUrl(cur.ll))}`;
  }
  const L = cur.listings?.[listingKey(cur)];
  const typeName = Object.fromEntries(LISTING_TYPES);
  const chips = `<div class="chips">${LISTING_TYPES.map(([k, l]) =>
    `<button data-action="listing-type" data-type="${k}" class="chip ${cur.listingType === k ? 'active' : ''}">${l}</button>`).join('')}</div>`;

  if (!L || L.loading) return chips + loadingBox('네이버 부동산 매물 조회 중…');
  if (L.error) {
    return chips + `<div class="empty"><b>매물을 불러오지 못했습니다</b><p class="muted">${esc(L.error)}</p>
      <button class="btn" data-action="retry-listings">다시 시도</button>${openBtn(naverLandUrl(cur.ll))}</div>`;
  }

  const c = L.complex;
  const others = (L.candidates || []).filter(x => x.complexNo !== c.complexNo);
  const head = `
    <div class="cx">
      <div class="cx-t">${esc(c.name)} ${c.dist > 150 ? `<span class="muted">· 클릭 위치에서 ${fmt(c.dist)}m</span>` : ''}</div>
      <div class="cx-m muted">${[c.households && `${fmt(c.households)}세대`, c.buildings && `${c.buildings}개동`, c.highFloor && `최고 ${c.highFloor}층`, c.approved && `${String(c.approved).slice(0, 4)}년 입주`].filter(Boolean).join(' · ')}</div>
      <div class="cx-m">매매 <b>${fmt(c.dealCount)}</b> · 전세 <b>${fmt(c.leaseCount)}</b> · 월세 <b>${fmt(c.rentCount)}</b></div>
    </div>
    ${others.length ? `<div class="chips"><span class="muted chips-label">다른 단지</span>${others.map(o =>
      `<button data-action="complex" data-complex="${esc(o.complexNo)}" class="chip">${esc(o.name)}</button>`).join('')}</div>` : ''}`;

  if (!L.listings.length) return head + chips + `<div class="empty">${typeName[cur.listingType]} 매물이 없습니다.</div>` + openBtn(c.url);
  return head + chips + `<div class="muted small">${L.listings.length}건 · 네이버 부동산 랭킹순</div>` + L.listings.map(i => `
    <a class="lcard" href="${esc(i.url)}" target="_blank" rel="noopener">
      <div class="lcard-price"><span class="lcard-type">${esc(typeName[i.tradeType] || '')}</span> ${esc(i.price)}${i.rent ? ` / ${esc(i.rent)}` : ''}</div>
      <div class="lcard-m">${esc(i.building || '')} · ${esc(i.areaName || '')}${i.area ? `/${esc(i.area)}㎡` : ''}${i.floor ? ` · ${esc(i.floor)}층` : ''}${i.direction ? ` · ${esc(i.direction)}` : ''}</div>
      ${i.desc ? `<div class="lcard-d">${esc(i.desc)}</div>` : ''}
      ${i.tags?.length ? `<div class="tags">${i.tags.slice(0, 4).map(t => `<span class="tag tag-weak">${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="lcard-f muted">${esc(i.realtor || '')}${i.confirmedAt ? ` · 확인 ${ymd(i.confirmedAt)}` : ''}${i.sameAddrCnt > 1 ? ` · 중개사 ${i.sameAddrCnt}곳` : ''}</div>
    </a>`).join('') + openBtn(c.url);
}

// ===================== 경사도 / 높이차 =====================
function clearSlope() {
  const s = state.slope;
  s.markers.forEach(m => m.setMap(null));
  s.line?.setMap(null);
  s.points = []; s.markers = []; s.line = null;
}

function addSlopePoint(ll) {
  const s = state.slope;
  if (s.points.length >= 2) clearSlope();
  s.points.push(ll);
  const label = s.points.length === 1 ? 'A' : 'B';
  s.markers.push(new naver.maps.Marker({
    map: state.map, position: ll,
    icon: { content: `<div class="pin">${label}</div>`, anchor: new naver.maps.Point(13, 13) },
  }));
  if (s.points.length === 1) { setHint('도착 지점(B)을 누르세요'); return; }
  s.line = new naver.maps.Polyline({ map: state.map, path: s.points, strokeColor: '#ffd400', strokeWeight: 4, strokeOpacity: 0.95 });
  measureSlope(s.points[0], s.points[1]);
}

async function measureSlope(A, B) {
  const id = ++state.reqId;
  state.current = null;
  openPanel(loadingBox('고도 조회 중…'));
  const a = llObj(A), b = llObj(B);
  const dist = haversine(a, b);
  const n = Math.max(2, Math.min(100, Math.ceil(dist / 10) + 1)); // 약 10m 간격, 최대 100점
  const pts = Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
  });
  try {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${pts.map(p => p.lat.toFixed(6)).join(',')}&longitude=${pts.map(p => p.lng.toFixed(6)).join(',')}`;
    const j = await fetch(url).then(r => (r.ok ? r.json() : Promise.reject(new Error(`고도 API 오류 (HTTP ${r.status})`))));
    if (id !== state.reqId) return;
    renderSlope(dist, j.elevation);
  } catch (e) {
    if (id === state.reqId) openPanel(errorBox(e.message));
  }
}

function slopeGrade(pct) {
  const a = Math.abs(pct);
  if (a < 3) return ['평지', 'ok'];
  if (a < 8) return ['완만', 'ok'];
  if (a < 12) return ['다소 경사 (도보 부담)', 'warn'];
  if (a < 20) return ['급경사', 'bad'];
  return ['매우 급경사', 'bad'];
}

function renderSlope(dist, elev) {
  const h0 = elev[0], h1 = elev.at(-1), dh = h1 - h0;
  const pct = (dh / dist) * 100, deg = (Math.atan2(dh, dist) * 180) / Math.PI;
  const hi = Math.max(...elev), lo = Math.min(...elev);
  // 누적 오르막/내리막
  let up = 0, down = 0;
  for (let i = 1; i < elev.length; i++) { const d = elev[i] - elev[i - 1]; d > 0 ? (up += d) : (down -= d); }
  const [grade, cls] = slopeGrade(pct);

  // 단면도 SVG
  const W = 340, H = 140, P = { l: 36, r: 8, t: 10, b: 22 };
  const span = Math.max(hi - lo, 2), base = lo - span * 0.15, top = hi + span * 0.15;
  const x = i => P.l + (i / (elev.length - 1)) * (W - P.l - P.r);
  const y = h => P.t + (1 - (h - base) / (top - base)) * (H - P.t - P.b);
  const line = elev.map((h, i) => `${x(i).toFixed(1)},${y(h).toFixed(1)}`).join(' ');
  const area = `${P.l},${H - P.b} ${line} ${W - P.r},${H - P.b}`;

  openPanel(`
    <div class="ph"><div class="ph-name">경사도 · 높이차</div><div class="ph-addr">A → B 직선 구간</div></div>
    <div class="kpi-row">
      <div><div class="kpi-label">평균 경사</div><div class="kpi-value sm">${pct.toFixed(1)}%</div><div class="kpi-sub">${deg.toFixed(1)}° · <span class="grade ${cls}">${grade}</span></div></div>
      <div><div class="kpi-label">높이차 (B−A)</div><div class="kpi-value sm">${dh >= 0 ? '+' : ''}${dh.toFixed(1)}m</div><div class="kpi-sub">A ${h0.toFixed(0)}m → B ${h1.toFixed(0)}m</div></div>
      <div><div class="kpi-label">수평거리</div><div class="kpi-value sm">${dist >= 1000 ? (dist / 1000).toFixed(2) + 'km' : dist.toFixed(0) + 'm'}</div><div class="kpi-sub">도보 약 ${Math.max(1, Math.round(dist / 67))}분</div></div>
    </div>
    <svg class="chart profile" viewBox="0 0 ${W} ${H}" role="img" aria-label="고도 단면도">
      <polygon points="${area}" class="fill"/><polyline points="${line}" class="stroke"/>
      <text x="${P.l - 6}" y="${y(hi) + 4}" text-anchor="end">${hi.toFixed(0)}m</text>
      <text x="${P.l - 6}" y="${y(lo) + 4}" text-anchor="end">${lo.toFixed(0)}m</text>
      <text x="${P.l}" y="${H - 6}">A</text><text x="${W - P.r}" y="${H - 6}" text-anchor="end">B</text>
    </svg>
    <dl class="grid">
      <dt>최고 / 최저</dt><dd>${hi.toFixed(1)}m / ${lo.toFixed(1)}m</dd>
      <dt>누적 오르막</dt><dd>${up.toFixed(1)}m</dd>
      <dt>누적 내리막</dt><dd>${down.toFixed(1)}m</dd>
    </dl>
    <div class="note">고도는 Copernicus 90m 해상도 DEM(Open-Meteo) 기준이라 짧은 구간(100m 미만)·옹벽·건물 단차는 반영되지 않습니다. 대략적인 지형 경향 확인용으로 쓰세요.</div>`);
  setHint('다시 누르면 새 구간을 잽니다');
}

// ===================== 거리뷰 (파노라마) =====================
function openPano(ll) {
  const wrap = $('#pano-wrap');
  wrap.classList.remove('hidden');
  document.body.classList.add('pano-open');
  if (!state.pano) {
    state.pano = new naver.maps.Panorama('pano', { position: ll, pov: { pan: 0, tilt: 0, fov: 100 }, aroundControl: true });
    naver.maps.Event.addListener(state.pano, 'pano_status', status => $('#pano-msg').classList.toggle('hidden', status === 'OK'));
    naver.maps.Event.addListener(state.pano, 'position_changed', () => {
      const pos = state.pano.getPosition();
      state.panoMarker?.setPosition(pos);
      state.map.panTo(pos);
    });
  } else {
    state.pano.setPosition(ll);
    const el = $('#pano');
    state.pano.setSize?.(new naver.maps.Size(el.clientWidth, el.clientHeight));
  }
  if (!state.panoMarker) {
    state.panoMarker = new naver.maps.Marker({
      map: state.map, position: ll,
      icon: { content: '<div class="pano-pin"></div>', anchor: new naver.maps.Point(11, 11) },
    });
  } else {
    state.panoMarker.setPosition(ll);
    state.panoMarker.setMap(state.map);
  }
  state.map.panTo(ll);
}

function closePano() {
  $('#pano-wrap').classList.add('hidden');
  document.body.classList.remove('pano-open');
  state.panoMarker?.setMap(null);
}

// ===================== 내 위치 =====================
function locateMe() {
  setHint('현재 위치 확인 중…');
  if (IN_APP) return toNative({ type: 'locate' });
  if (!navigator.geolocation) return setHint('이 브라우저는 위치 기능을 지원하지 않습니다');
  navigator.geolocation.getCurrentPosition(pos => showMyLocation(pos.coords.latitude, pos.coords.longitude),
    err => setHint(`위치를 가져오지 못했습니다 (${err.message}). 휴대폰 브라우저는 HTTPS 주소에서만 동작합니다.`),
    { enableHighAccuracy: true, timeout: 10000 });
}

function showMyLocation(lat, lng) {
  if (!state.map) return;
  const ll = new naver.maps.LatLng(lat, lng);
  state.map.setCenter(ll);
  state.map.setZoom(18);
  if (!state.myMarker) {
    state.myMarker = new naver.maps.Marker({ map: state.map, position: ll, icon: { content: '<div class="me"></div>', anchor: new naver.maps.Point(9, 9) } });
  } else state.myMarker.setPosition(ll);
}
