// irodmas.com(paygate Worker)의 API. 같은 출처에서 열리므로 로그인 쿠키(HttpOnly)가 그대로 따라간다.

const SNAPSHOT_KEY = 'samstudy.m.snapshot';

export async function api(path, body, fetchImpl = (...a) => fetch(...a)) {
  const init = body === undefined
    ? { credentials: 'same-origin' }
    : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  let res;
  try {
    res = await fetchImpl(path, init);
  } catch {
    throw Object.assign(new Error('네트워크에 연결할 수 없습니다'), { offline: true });
  }
  const data = await res.json().catch(() => ({ ok: false, error: '응답을 읽지 못했습니다.' }));
  if (!res.ok || data.ok === false) {
    throw Object.assign(new Error(data.error || '요청에 실패했습니다.'), { status: res.status });
  }
  return data;
}

export const fetchSnapshot = async (fetchImpl) => {
  const [me, catalog] = await Promise.all([api('/api/me', undefined, fetchImpl), api('/api/catalog', undefined, fetchImpl)]);
  return { me, catalog, at: Date.now() };
};

export const loginRequest = (email, password, fetchImpl) => api('/api/auth/login', { email, password }, fetchImpl);
export const logoutRequest = (fetchImpl) => api('/api/auth/logout', {}, fetchImpl);

// 오프라인에서 마지막 목록을 보여 주기 위한 사본. 로그아웃하면 지운다.
export function saveSnapshot(snapshot, storage = localStorage) {
  try { storage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot)); } catch { /* 저장 공간 부족은 무시 */ }
}

export function readSnapshot(storage = localStorage) {
  try {
    const snap = JSON.parse(storage.getItem(SNAPSHOT_KEY) || 'null');
    return snap?.me?.user && Array.isArray(snap?.catalog?.courses) ? snap : null;
  } catch {
    return null;
  }
}

export function clearSnapshot(storage = localStorage) {
  storage.removeItem(SNAPSHOT_KEY);
}
