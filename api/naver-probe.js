// 진단용: Vercel(서울) 서버에서 네이버 부동산의 여러 주소에 접속되는지 시험해 결과를 보여줌
// 사용: https://<배포주소>/api/naver-probe 를 브라우저로 열기
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const TARGETS = [
  ['대조군: 네이버 메인', 'https://www.naver.com/'],
  ['new.land 메인 (현재 방식)', 'https://new.land.naver.com/complexes'],
  ['new.land API (토큰 없이)', 'https://new.land.naver.com/api/regions/complexes?cortarNo=1168010300&realEstateType=APT&order='],
  ['m.land 모바일 메인', 'https://m.land.naver.com/'],
  ['m.land 단지 목록 API', 'https://m.land.naver.com/complex/ajax/complexListByCortarNo?cortarNo=1168010300'],
  ['fin.land 새 부동산', 'https://fin.land.naver.com/'],
  ['land.naver.com', 'https://land.naver.com/'],
];

async function probe([name, url]) {
  const t = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', Accept: 'text/html,application/json,*/*' },
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.text()).replace(/\s+/g, ' ').slice(0, 120);
    return { name, url, ok: true, status: res.status, ms: Date.now() - t, location: res.headers.get('location') || '', body };
  } catch (e) {
    return { name, url, ok: false, ms: Date.now() - t, error: e.name === 'TimeoutError' ? '8초 동안 응답 없음 (차단 의심)' : e.cause?.code || e.message };
  }
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export default async function handler(req, res) {
  const results = await Promise.all(TARGETS.map(probe));
  const rows = results.map(r => `<tr class="${r.ok ? 'ok' : 'bad'}"><td><b>${esc(r.name)}</b><br><small>${esc(r.url)}</small></td>
    <td>${r.ok ? `HTTP ${r.status}${r.location ? `<br><small>→ ${esc(r.location)}</small>` : ''}` : `실패<br><small>${esc(r.error)}</small>`}</td>
    <td>${r.ms}ms</td></tr>`).join('');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>네이버 접속 진단</title>
<style>body{font:14px -apple-system,sans-serif;margin:16px;color:#16181d}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #e5e7eb;padding:8px 4px;vertical-align:top;word-break:break-all}
small{color:#6b7280}.ok td:nth-child(2){color:#047857;font-weight:700}.bad td:nth-child(2){color:#dc2626;font-weight:700}</style>
<h3>네이버 접속 진단 (서버 위치: ${esc(process.env.VERCEL_REGION || '알 수 없음')})</h3>
<p><small>${new Date().toISOString()} · 이 화면을 캡처해서 보내주세요</small></p><table>${rows}</table>`);
}
