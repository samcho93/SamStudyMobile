// SamStudy 허브가 게시한 site-config.json(강좌 목록)과 access-config.json(사용자·권한)을 읽는다.
// 허브를 고치면 이 앱에도 바로 반영되고, 오프라인에서는 마지막으로 받은 사본을 쓴다.

export const DEFAULT_HUB = 'https://samcho93.github.io/SamStudy/';
const CACHE_KEY = 'samstudy.m.hub';

export function normalizeBase(value) {
  try {
    const url = new URL(String(value).trim());
    if (!/^https?:$/.test(url.protocol)) return null;
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

// 허브 설정이 이 앱이 읽을 수 있는 모양인지 확인한다.
export function validateHub(site, access) {
  return Boolean(
    site && typeof site === 'object' && Array.isArray(site.sections) && site.sections.every((s) => Array.isArray(s.cards))
    && access && typeof access === 'object' && Array.isArray(access.users)
    && access.users.every((u) => u && typeof u.id === 'string' && typeof u.hash === 'string'),
  );
}

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${new URL(url).pathname.split('/').pop()} 불러오기 실패 (${res.status})`);
  return res.json();
}

export async function fetchHub(base, fetchImpl = (...a) => fetch(...a)) {
  const stamp = `?t=${Date.now()}`;
  const [site, access] = await Promise.all([
    getJson(new URL(`site-config.json${stamp}`, base).toString(), fetchImpl),
    getJson(new URL(`access-config.json${stamp}`, base).toString(), fetchImpl),
  ]);
  if (!validateHub(site, access)) throw new Error('허브 설정 형식이 올바르지 않습니다');
  return { site, access, base, fetchedAt: Date.now() };
}

export function readCachedHub(storage = localStorage) {
  try {
    const hub = JSON.parse(storage.getItem(CACHE_KEY) || 'null');
    return hub && validateHub(hub.site, hub.access) ? hub : null;
  } catch {
    return null;
  }
}

export function writeCachedHub(hub, storage = localStorage) {
  try {
    storage.setItem(CACHE_KEY, JSON.stringify(hub));
  } catch { /* 저장 공간이 부족하면 캐시 없이 동작 */ }
}

export function clearCachedHub(storage = localStorage) {
  storage.removeItem(CACHE_KEY);
}

// 새로 받고, 실패하면 캐시를 쓴다. 둘 다 없으면 오류를 던진다.
export async function loadHub(base, { fetchImpl, storage } = {}) {
  try {
    const hub = await fetchHub(base, fetchImpl);
    writeCachedHub(hub, storage);
    return { hub, fromCache: false };
  } catch (err) {
    const cached = readCachedHub(storage);
    if (cached && cached.base === base) return { hub: cached, fromCache: true, error: err };
    throw err;
  }
}
