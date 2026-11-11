// 허브와 같은 로그인 규칙: sha256("samstudy|아이디|비밀번호")를 access-config.json의 hash와 비교한다.
// 정적 사이트의 로그인은 화면을 가리는 용도이며 강좌 페이지 자체를 보호하지는 않는다.

const SESSION_KEY = 'samstudy.m.session';

export async function sha256(text) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const userHash = (id, password) => sha256(`samstudy|${id}|${password}`);

export function normalizeUsers(access) {
  return access.users.map((u) => ({
    id: u.id,
    hash: u.hash,
    role: u.role === 'master' ? 'master' : 'user',
    deny: Array.isArray(u.deny) ? u.deny : [],
  }));
}

export async function login(access, id, password) {
  const hash = await userHash(id.trim(), password);
  return normalizeUsers(access).find((u) => u.id === id.trim() && u.hash === hash) || null;
}

export function saveSession(user, storage = localStorage) {
  storage.setItem(SESSION_KEY, JSON.stringify({ id: user.id, hash: user.hash }));
}

export function clearSession(storage = localStorage) {
  storage.removeItem(SESSION_KEY);
}

// 저장된 세션이 현재 사용자 목록과 맞을 때만 유효하다. 비밀번호가 바뀌었거나 사용자가 지워졌다면 로그아웃된다.
export function restoreSession(access, storage = localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(SESSION_KEY) || 'null');
    if (!saved) return null;
    return normalizeUsers(access).find((u) => u.id === saved.id && u.hash === saved.hash) || null;
  } catch {
    return null;
  }
}
