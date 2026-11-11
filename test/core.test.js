import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256, userHash, login, saveSession, restoreSession, clearSession } from '../js/auth.js';
import { normalizeBase, validateHub, loadHub, readCachedHub } from '../js/hub.js';
import { filterSections, findCard, safeUrl, FAVORITES_GROUP } from '../js/catalog.js';

const memoryStorage = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
};

const site = {
  site: { title: 'T', subtitle: 'S' },
  groups: [{ id: 'ai', name: 'AI' }, { id: 'embedded', name: '임베디드' }],
  sections: [
    { id: 'lang', title: 'Lang', cards: [
      { id: 'java', title: 'Java', url: 'https://x.test/java/', tag: 'Language', desc: '객체지향', groups: ['programmer'] },
      { id: 'py', title: 'Python', url: 'https://x.test/py/', tag: 'AI base', desc: '입문', groups: ['programmer', 'ai'] },
    ] },
    { id: 'hw', title: 'HW', cards: [
      { id: 'stm', title: 'STM32', url: 'https://x.test/stm/', tag: 'MCU', desc: '펌웨어', groups: ['embedded'] },
      { id: 'bad', title: 'Bad', url: 'javascript:alert(1)', groups: ['ai'] },
    ] },
  ],
};

test('허브와 같은 해시 규칙: sha256("samstudy|아이디|비밀번호")', async () => {
  assert.equal(await sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(await userHash('u', 'p'), await sha256('samstudy|u|p'));
});

test('로그인 성공·실패와 세션 복원', async () => {
  const access = { users: [{ id: 'kim', role: 'user', hash: await userHash('kim', 'pw1'), deny: ['stm'] }] };
  assert.equal(await login(access, 'kim', 'wrong'), null);
  assert.equal(await login(access, 'lee', 'pw1'), null);
  const user = await login(access, ' kim ', 'pw1');
  assert.equal(user.id, 'kim');
  assert.deepEqual(user.deny, ['stm']);

  const storage = memoryStorage();
  saveSession(user, storage);
  assert.equal(restoreSession(access, storage).id, 'kim');
  // 비밀번호가 바뀌면 (해시가 달라지면) 저장된 세션은 무효
  const changed = { users: [{ ...access.users[0], hash: await userHash('kim', 'new') }] };
  assert.equal(restoreSession(changed, storage), null);
  clearSession(storage);
  assert.equal(restoreSession(access, storage), null);
});

test('강좌 필터: 권한, 그룹, 검색, 즐겨찾기, 위험한 URL 제외', () => {
  const user = { id: 'kim', role: 'user', deny: ['stm'] };
  const ids = (sections) => sections.flatMap((s) => s.cards.map((c) => c.id));
  assert.deepEqual(ids(filterSections(site, null)), ['java', 'py', 'stm']);          // javascript: URL 제외
  assert.deepEqual(ids(filterSections(site, user)), ['java', 'py']);                 // 권한(deny) 적용
  assert.deepEqual(ids(filterSections(site, null, { group: 'ai' })), ['py']);
  assert.deepEqual(ids(filterSections(site, null, { query: '펌웨어' })), ['stm']);
  assert.deepEqual(ids(filterSections(site, null, { query: 'ai BASE' })), ['py']);   // 대소문자 무시, 태그 검색
  assert.deepEqual(ids(filterSections(site, user, { group: FAVORITES_GROUP, favorites: new Set(['stm', 'java']) })), ['java']);
  assert.equal(filterSections(site, null, { query: '없는검색어' }).length, 0);       // 빈 섹션은 사라짐
  assert.equal(findCard(site, 'py').sectionTitle, 'Lang');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('https://a.test/x'), 'https://a.test/x');
});

test('허브 주소 정규화와 설정 검증', () => {
  assert.equal(normalizeBase(' https://a.github.io/SamStudy '), 'https://a.github.io/SamStudy/');
  assert.equal(normalizeBase('https://a.github.io/SamStudy/?x=1#y'), 'https://a.github.io/SamStudy/');
  assert.equal(normalizeBase('ftp://a'), null);
  assert.equal(normalizeBase('not a url'), null);
  assert.equal(validateHub(site, { users: [{ id: 'a', hash: 'h' }] }), true);
  assert.equal(validateHub({ sections: [{}] }, { users: [] }), false);
  assert.equal(validateHub(site, { users: [{ id: 'a' }] }), false);
});

test('허브를 받아 캐시하고, 실패하면 캐시로 대체한다', async () => {
  const storage = memoryStorage();
  const base = 'https://hub.test/SamStudy/';
  const access = { users: [{ id: 'a', hash: 'h' }] };
  const okFetch = async (url) => ({ ok: true, json: async () => (String(url).includes('site-config') ? site : access) });
  const first = await loadHub(base, { fetchImpl: okFetch, storage });
  assert.equal(first.fromCache, false);
  assert.equal(readCachedHub(storage).base, base);

  const failFetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const second = await loadHub(base, { fetchImpl: failFetch, storage });
  assert.equal(second.fromCache, true);
  assert.match(second.error.message, /503/);

  // 다른 허브 주소의 캐시는 쓰지 않는다
  await assert.rejects(loadHub('https://other.test/', { fetchImpl: failFetch, storage }), /503/);
  // 깨진 응답은 거부한다
  const badFetch = async () => ({ ok: true, json: async () => ({ nope: 1 }) });
  await assert.rejects(loadHub(base, { fetchImpl: badFetch, storage: memoryStorage() }), /형식/);
});
