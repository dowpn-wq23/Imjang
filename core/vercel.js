// Vercel(서울 리전) 배포용 — api/ 폴더의 각 파일이 이 함수로 core/api.js를 호출합니다.
// 공공데이터포털·네이버 부동산은 해외 서버 접속을 막을 수 있어서, 서울(icn1)에서 실행합니다 (vercel.json).
import { createApi } from './api.js';

const env = process.env;
const handleApi = createApi({
  VWORLD_KEY: env.VWORLD_KEY || '',
  VWORLD_DOMAIN: env.VWORLD_DOMAIN || 'http://localhost:3000', // PC용으로 VWorld에 등록한 주소를 그대로 사용
  DATA_GO_KR_KEY: env.DATA_GO_KR_KEY || '',
  NAVER_LAND_ENABLED: env.NAVER_LAND_ENABLED !== 'false',
});

const reply = (res, status, type, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
};

// pathOf(req) → '/api/parcel' 같은 경로. 쿼리 문자열은 요청 그대로 붙임
export const apiRoute = pathOf => async (req, res) => {
  const i = req.url.indexOf('?');
  const [status, body] = await handleApi(pathOf(req) + (i < 0 ? '' : req.url.slice(i)));
  reply(res, status, 'application/json; charset=utf-8', JSON.stringify(body));
};

// 서버의 /config.js와 같은 내용 (vercel.json에서 /config.js → /api/config)
export const configRoute = (req, res) =>
  reply(res, 200, 'text/javascript; charset=utf-8', `window.APP_CONFIG=${JSON.stringify({ naverKeyId: env.NAVER_MAP_KEY_ID || '' })};`);
