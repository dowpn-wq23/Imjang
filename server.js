// 임장지도 서버 — 외부 패키지 없이 Node 20.12+ 기본 기능만 사용
// 역할: 정적 파일 제공 + 공공 API(VWorld, data.go.kr) 프록시 (API 키 보호, CORS 회피, 캐시)
// API 처리 로직은 core/api.js (아이폰 앱과 공용)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from './core/api.js';

try { process.loadEnvFile(new URL('./.env', import.meta.url)); } catch { /* .env 없으면 환경변수 사용 */ }

const PORT = Number(process.env.PORT || 3000);
const NAVER_MAP_KEY_ID = process.env.NAVER_MAP_KEY_ID || '';
const VWORLD_KEY = process.env.VWORLD_KEY || '';
// Render에 배포하면 RENDER_EXTERNAL_URL(https://○○.onrender.com)이 자동으로 들어옴
const VWORLD_DOMAIN = process.env.VWORLD_DOMAIN || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
const DATA_GO_KR_KEY = process.env.DATA_GO_KR_KEY || '';
const NAVER_LAND_ENABLED = process.env.NAVER_LAND_ENABLED !== 'false';
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));
const handleApi = createApi({ VWORLD_KEY, VWORLD_DOMAIN, DATA_GO_KR_KEY, NAVER_LAND_ENABLED });

// ---------- 정적 파일 ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json; charset=utf-8' };

async function serveStatic(pathname, res) {
  const rel = normalize(decodeURIComponent(pathname === '/' ? '/index.html' : pathname)).replace(/^([/\\])+/, '');
  const file = join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { send(res, 404, 'Not found'); }
}

function send(res, status, body) {
  const isJson = typeof body !== 'string';
  res.writeHead(status, { 'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8' });
  res.end(isJson ? JSON.stringify(body) : body);
}

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  try {
    if (pathname === '/config.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      return res.end(`window.APP_CONFIG=${JSON.stringify({ naverKeyId: NAVER_MAP_KEY_ID })};`);
    }
    if (pathname.startsWith('/api/')) return send(res, ...(await handleApi(req.url)));
    return serveStatic(pathname, res);
  } catch (err) {
    console.error(err.message);
    send(res, err.status ?? 502, { error: err.message });
  }
}).listen(PORT, () => {
  console.log(`임장지도 실행 중 → http://localhost:${PORT}`);
  for (const [k, v] of Object.entries({ NAVER_MAP_KEY_ID, VWORLD_KEY, DATA_GO_KR_KEY })) if (!v) console.warn(`  ⚠ ${k} 미설정 (.env 확인)`);
});
