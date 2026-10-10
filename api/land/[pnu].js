import { apiRoute } from '../../core/vercel.js';
// /api/land/<PNU 19자리>
export default apiRoute(req => `/api/land/${req.query?.pnu ?? req.url.split('?')[0].split('/').pop()}`);
