import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessInfo, filterCourses, groupBySection, kindsPresent, safePath, FAVORITES } from '../js/catalog.js';
import { api, saveSnapshot, readSnapshot, clearSnapshot } from '../js/api.js';

const memoryStorage = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
};

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const courses = [
  { id: 'studyjava', title: 'Java', path: '/studyjava/', section: 'Programming', access: 'free', active: 1, kind: 'course', summary: '자바 기초', card: { tag: 'Language' } },
  { id: 'studyros2', title: 'ROS 2', path: '/studyros2/', section: 'Robotics', access: 'paid', active: 1, kind: 'course', summary: '로봇 운영체제', card: { name: 'ROS 2 입문' } },
  { id: 'samplc', title: 'samPLC', path: '/samplc/', section: 'Automation', access: 'paid', active: 1, kind: 'sim', summary: '래더 시뮬레이터' },
  { id: 'draft', title: 'Draft', path: '/draft/', section: 'Tools', access: 'paid', active: 0, kind: 'weird' },
  { id: 'evil', title: 'Evil', path: 'javascript:alert(1)', section: 'Tools', access: 'free', active: 1 },
];
const ids = (list) => list.map((c) => c.id);

test('공개 강좌는 누구나, 유료 강좌는 이용권 기간 안에서만 열린다', () => {
  assert.equal(accessInfo(courses[0], { now: NOW }).open, true);
  assert.equal(accessInfo(courses[1], { now: NOW }).open, false);
  assert.equal(accessInfo(courses[1], { ent: { studyros2: NOW + DAY }, now: NOW }).label, '이용 중');
  assert.equal(accessInfo(courses[1], { ent: { studyros2: NOW - 1 }, now: NOW }).open, false);   // 만료
  assert.equal(accessInfo(courses[1], { ent: { all: NOW + DAY }, now: NOW }).label, '올패스');
  assert.equal(accessInfo(courses[1], { ent: { all: NOW + DAY, studyros2: NOW + 2 * DAY }, now: NOW }).label, '이용 중');
  assert.equal(accessInfo(courses[3], { admin: true, now: NOW }).label, '비공개');                // 관리자는 비공개도 열림
  assert.equal(accessInfo(courses[1], { admin: true, now: NOW }).open, true);
});

test('열 수 있는 강좌와 잠긴 강좌를 나누고, 위험한 경로는 뺀다', () => {
  const ctx = { ent: { samplc: NOW + DAY }, now: NOW };
  const { open, locked } = filterCourses(courses, ctx);
  assert.deepEqual(ids(open), ['studyjava', 'samplc']);
  assert.deepEqual(ids(locked), ['studyros2', 'draft']);      // evil(javascript:) 제외
  assert.equal(safePath('//evil.com/x'), null);
  assert.equal(safePath('https://evil.com/x'), null);
  assert.equal(safePath('/ok/'), '/ok/');
});

test('분류·검색·즐겨찾기 필터', () => {
  const ctx = { now: NOW };
  assert.deepEqual(ids(filterCourses(courses, ctx, { kind: 'sim' }).locked), ['samplc']);
  assert.deepEqual(ids(filterCourses(courses, ctx, { kind: 'etc' }).locked), ['draft']);   // 알 수 없는 kind 는 기타
  assert.deepEqual(ids(filterCourses(courses, ctx, { query: '입문' }).locked), ['studyros2']);   // card.name 검색
  assert.deepEqual(ids(filterCourses(courses, ctx, { query: 'LANGUAGE' }).open), ['studyjava']);
  const fav = filterCourses(courses, ctx, { kind: FAVORITES, favorites: new Set(['studyjava', 'samplc']) });
  assert.deepEqual([...ids(fav.open), ...ids(fav.locked)], ['studyjava', 'samplc']);
});

test('분야별 묶음은 서버 순서를 유지하고, 있는 분류만 보여 준다', () => {
  const groups = groupBySection(courses.filter((c) => c.id !== 'evil'));
  assert.deepEqual(groups.map((g) => g.name), ['Programming', 'Robotics', 'Automation', 'Tools']);
  assert.deepEqual(kindsPresent(courses).map(([k]) => k), ['course', 'sim', 'etc']);
});

test('API: 오류 메시지·상태·오프라인을 구분한다', async () => {
  const reply = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });
  assert.deepEqual(await api('/api/me', undefined, reply(200, { ok: true, user: null })), { ok: true, user: null });
  await assert.rejects(api('/api/auth/login', { email: 'a', password: 'b' }, reply(401, { ok: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' })),
    (e) => e.status === 401 && /올바르지/.test(e.message));
  await assert.rejects(api('/api/me', undefined, async () => { throw new TypeError('fetch failed'); }), (e) => e.offline === true);
  const calls = [];
  await api('/api/auth/logout', {}, async (url, init) => { calls.push([url, init]); return { ok: true, status: 200, json: async () => ({ ok: true }) }; });
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].credentials, 'same-origin');
});

test('오프라인 사본은 로그인한 상태의 것만 쓰고 로그아웃하면 지운다', () => {
  const storage = memoryStorage();
  assert.equal(readSnapshot(storage), null);
  saveSnapshot({ me: { user: null }, catalog: { courses: [] }, at: 1 }, storage);
  assert.equal(readSnapshot(storage), null);                       // 비로그인 사본은 무시
  saveSnapshot({ me: { user: { email: 'a@b' } }, catalog: { courses }, at: 1 }, storage);
  assert.equal(readSnapshot(storage).me.user.email, 'a@b');
  clearSnapshot(storage);
  assert.equal(readSnapshot(storage), null);
});
