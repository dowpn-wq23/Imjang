// public/(지도 화면)과 core/api.js(데이터 조회)를 앱 안에 넣기 위해 mobile/generated/로 변환·복사합니다.
// 화면이나 API 코드를 고친 뒤 `npm run bundle-web` (npm start 하면 자동 실행)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const out = new URL('../generated/', import.meta.url);
mkdirSync(out, { recursive: true });

let html = read('public/index.html');
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error(`public/index.html에서 "${from.trim().slice(0, 60)}"를 찾지 못했습니다`);
  html = html.replace(from, () => to);
};
// 홈 화면 설치(PWA)용 태그는 앱에선 필요 없음
html = html.replace(/\s*<!-- 아이폰 사파리[\s\S]*?<meta name="theme-color"[^>]*>/, '');
swap('<link rel="stylesheet" href="style.css">', `<style>\n${read('public/style.css')}\n</style>`);
// 서버의 /config.js 대신 앱이 실행할 때 키를 끼워 넣는 자리
swap('<script src="/config.js"></script>', '<!--APP_CONFIG-->');
swap('<script src="app.js"></script>', `<script>\n${read('public/app.js').replace(/<\/script/gi, '<\\/script')}\n</script>`);

const banner = '// 자동 생성 파일 — 직접 고치지 마세요. 원본: ';
writeFileSync(new URL('web.js', out), `${banner}public/ (scripts/bundle-web.mjs)\nexport default ${JSON.stringify(html)};\n`);
writeFileSync(new URL('api-core.js', out), `${banner}core/api.js (scripts/bundle-web.mjs)\n${read('core/api.js')}`);
console.log(`앱용 화면 생성 완료 (${Math.round(html.length / 1024)}KB)`);
