import { fetchSnapshot, loginRequest, logoutRequest, saveSnapshot, readSnapshot, clearSnapshot } from './api.js';
import { FAVORITES, kindOf, kindsPresent, accessInfo, filterCourses, groupBySection, safePath } from './catalog.js';

const PREF_KEY = 'samstudy.m.prefs';
const RECENT_MAX = 6;
const SLOW_LOAD_MS = 8000;
const REFRESH_MS = 5 * 60_000;

// ---- 이 기기에만 저장하는 값 ----------------------------------------------------
function loadPrefs() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { /* 깨진 값은 무시 */ }
  return { favorites: [], recent: [], collapsed: [], lockedOpen: false, ...saved };
}
const prefs = loadPrefs();
const savePrefs = () => localStorage.setItem(PREF_KEY, JSON.stringify(prefs));

// ---- 상태 -------------------------------------------------------------------
const state = { snap: null, offline: false, kind: '', query: '', screen: 'boot', installEvent: null };
const $app = document.getElementById('app');

const me = () => state.snap?.me?.user || null;
const courses = () => state.snap?.catalog?.courses || [];
const ctx = () => ({ admin: !!state.snap?.catalog?.admin, ent: state.snap?.me?.entitlements || {}, now: Date.now() });

// ---- DOM 도우미: 서버에서 받은 문자열은 항상 textContent 로만 넣는다 ---------------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key === 'style') el.style.cssText = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return el;
}
const mount = (...nodes) => $app.replaceChildren(...nodes);

let toastTimer = null;
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

const cssColor = (value, fallback) => (/^#[0-9a-f]{3,8}$/i.test(String(value)) ? value : fallback);
const fmtDate = (ms) => new Date(ms).toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' });
const fmtTime = (ms) => new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const imgSrc = (value) => (typeof value === 'string' && /^(\/[^/]|https:\/\/)/.test(value) ? value : null);

// ---- 불러오기 ---------------------------------------------------------------
async function refresh({ quiet = false } = {}) {
  const hadUser = Boolean(me());
  const wasOffline = state.offline;
  try {
    state.snap = await fetchSnapshot();
    state.offline = false;
    if (me()) saveSnapshot(state.snap); else clearSnapshot();
  } catch (err) {
    if (!err.offline) { toast(err.message); }
    const cached = readSnapshot();
    if (cached) { state.snap = cached; state.offline = true; }
    else if (!state.snap) state.snap = { me: { user: null }, catalog: { courses: [] }, at: Date.now() };
  }
  if (hadUser && !me() && !state.offline) { clearSnapshot(); showLogin('로그인이 만료되었습니다. 다시 로그인하세요.'); return; }
  if (quiet && state.screen === 'home') {
    if (wasOffline !== state.offline) { showHome(); return; }   // 오프라인 배너가 바뀌었으면 화면을 다시 그린다
    const sub = document.getElementById('sub');
    if (sub) sub.textContent = homeSubtitle();
    drawChips(); drawHomeBody();
    return;
  }
  if (state.screen === 'viewer') return;
  me() ? showHome() : showLogin();
}

// ---- 로그인 -----------------------------------------------------------------
function showLogin(message = '') {
  state.screen = 'login';
  const error = h('div', { class: 'error', role: 'alert' }, message);
  const email = h('input', { class: 'field', type: 'email', placeholder: '이메일', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false', required: true });
  const pw = h('input', { class: 'field', type: 'password', placeholder: '비밀번호', autocomplete: 'current-password', required: true });
  const button = h('button', { class: 'btn primary', type: 'submit' }, '로그인');
  const form = h('form', { class: 'login-form' }, email, pw, h('div', { class: 'error-slot' }, error), button);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    button.disabled = true;
    error.textContent = '';
    try {
      await loginRequest(email.value.trim(), pw.value);
      await refresh();
    } catch (err) {
      error.textContent = err.offline ? '인터넷에 연결되어 있지 않습니다' : err.message;
      pw.value = '';
    } finally {
      button.disabled = false;
    }
  });
  mount(h('div', { class: 'login' },
    h('div', { class: 'logo' }, '📚'),
    h('h1', {}, 'SamStudy'),
    h('p', { class: 'sub' }, '분당융합기술교육원 AI응용소프트웨어과 온라인 강의실'),
    form,
    h('p', { class: 'links' },
      h('a', { href: '/login.html', target: '_blank', rel: 'noopener' }, '회원가입 · 비밀번호 찾기'),
      ' · ', h('button', { class: 'link', onclick: browsePublic }, '로그인 없이 공개 강좌 보기'))));
}

// 로그인 없이는 서버가 공개(무료) 강좌만 준다.
function browsePublic() {
  showHome();
}

// ---- 홈 ---------------------------------------------------------------------
function courseRow(course, locked) {
  const info = accessInfo(course, ctx());
  const k = course.card || {};
  const fav = prefs.favorites.includes(course.id);
  const shot = imgSrc(k.shot);
  const bg = `linear-gradient(135deg, ${cssColor(k.c1, '#065690')}, ${cssColor(k.c2, '#004369')})`;
  const name = k.name || course.title;
  const initial = [...(name || '?')][0].toUpperCase();
  const foot = locked ? '이용권이 필요합니다'
    : info.tone === 'free' ? '로그인 없이 열림'
    : info.until ? `${fmtDate(info.until)}까지` : '';
  return h('div', { class: `row${locked ? ' locked' : ''}` },
    h('button', { class: 'row-main', onclick: () => openCourse(course) },
      h('span', { class: 'thumb', style: `background:${bg}` }, shot ? h('img', { src: shot, alt: '', loading: 'lazy', onerror: (e) => e.target.remove() }) : null, initial),
      h('span', { class: 'row-text' },
        h('span', { class: 'meta' }, h('b', { class: `badge ${info.tone}` }, info.label), course.section ? h('small', {}, course.section) : null),
        h('strong', {}, name),
        h('span', { class: 'desc' }, k.about || course.summary || ''),
        foot ? h('small', { class: 'foot' }, foot) : null)),
    h('button', {
      class: `star${fav ? ' on' : ''}`, 'aria-label': fav ? '즐겨찾기 해제' : '즐겨찾기',
      onclick: () => { toggle(prefs.favorites, course.id); savePrefs(); drawChips(); drawHomeBody(); },
    }, fav ? '★' : '☆'));
}

function toggle(list, value) {
  const i = list.indexOf(value);
  if (i >= 0) list.splice(i, 1); else list.push(value);
}

function chips() {
  const chip = (id, label) => h('button', { class: `chip${state.kind === id ? ' on' : ''}`, onclick: () => { state.kind = id; drawChips(); drawHomeBody(); } }, label);
  return [chip('', '전체'), chip(FAVORITES, `★ 즐겨찾기${prefs.favorites.length ? ` ${prefs.favorites.length}` : ''}`),
    ...kindsPresent(courses()).map(([k, name]) => chip(k, name))];
}
function drawChips() {
  const el = document.getElementById('chips');
  if (el) el.replaceChildren(...chips());
}

function section(title, count, key, rows, { collapsible = true, collapsedByDefault = false } = {}) {
  const collapsed = !state.query && (collapsedByDefault ? !prefs.lockedOpen : prefs.collapsed.includes(key));
  return h('section', { class: 'sec' },
    h('button', {
      class: 'sec-head', 'aria-expanded': String(!collapsed), disabled: !collapsible,
      onclick: () => {
        if (collapsedByDefault) prefs.lockedOpen = !prefs.lockedOpen; else toggle(prefs.collapsed, key);
        savePrefs(); drawHomeBody();
      },
    }, h('span', {}, title), h('small', {}, `${count} ${collapsible ? (collapsed ? '▸' : '▾') : ''}`)),
    collapsed ? null : rows);
}

function drawHomeBody() {
  const box = document.getElementById('list');
  if (!box) return;
  const { open, locked } = filterCourses(courses(), ctx(), { kind: state.kind, query: state.query, favorites: new Set(prefs.favorites) });
  const nodes = [];
  if (!state.kind && !state.query) {
    const recent = prefs.recent.map((id) => open.find((c) => c.id === id)).filter(Boolean);
    if (recent.length) nodes.push(section('🕘 최근 본 강좌', recent.length, 'recent', recent.map((c) => courseRow(c, false)), { collapsible: false }));
  }
  for (const group of groupBySection(open)) {
    nodes.push(section(group.name, group.list.length, `s:${group.name}`, group.list.map((c) => courseRow(c, false))));
  }
  if (locked.length) {
    nodes.push(section('🔒 이용권이 필요한 강좌', locked.length, 'locked', locked.map((c) => courseRow(c, true)), { collapsedByDefault: true }));
  }
  if (!open.length && !locked.length) {
    nodes.push(h('div', { class: 'empty' }, state.kind === FAVORITES ? '즐겨찾기한 강좌가 없습니다. 강좌 오른쪽의 ☆를 눌러 추가하세요.' : '조건에 맞는 강좌가 없습니다.'));
  }
  box.replaceChildren(...nodes);
}

function homeSubtitle() {
  const user = me();
  const { open } = filterCourses(courses(), ctx());
  return user ? `${user.name || user.email} 님 · 볼 수 있는 강좌 ${open.length}개` : '공개 강좌';
}

function showHome() {
  state.screen = 'home';
  const user = me();
  const search = h('input', { class: 'search', type: 'search', placeholder: '강좌 검색', value: state.query });
  search.addEventListener('input', () => { state.query = search.value; drawHomeBody(); });
  mount(
    h('header', { class: 'topbar' },
      h('div', { class: 'titles' }, h('h1', {}, 'SamStudy'),
        h('small', { id: 'sub' }, homeSubtitle())),
      h('button', { class: 'icon-btn', 'aria-label': '새로고침', onclick: async () => { await refresh({ quiet: true }); toast(state.offline ? '오프라인: 저장된 목록입니다' : '목록을 새로 불러왔습니다'); } }, '🔄'),
      h('button', { class: 'icon-btn', 'aria-label': user ? '내 정보' : '로그인', onclick: () => (user ? showSettings() : showLogin()) }, user ? '👤' : '🔑')),
    h('main', {},
      state.offline ? h('div', { class: 'banner' }, `오프라인 · ${fmtTime(state.snap.at)}에 저장된 목록입니다`) : null,
      search, h('div', { class: 'chips', id: 'chips' }, chips()), h('div', { id: 'list' })));
  drawHomeBody();
}

// ---- 강좌 열기 --------------------------------------------------------------
function openCourse(course) {
  const info = accessInfo(course, ctx());
  const path = safePath(course.path);
  if (!path) return;
  if (!info.open) { showLockedSheet(course); return; }
  prefs.recent = [course.id, ...prefs.recent.filter((r) => r !== course.id)].slice(0, RECENT_MAX);
  savePrefs();
  history.pushState({ course: course.id }, '', `#course=${encodeURIComponent(course.id)}`);
  showViewer(course, path);
}

function showLockedSheet(course) {
  const name = course.card?.name || course.title;
  const close = () => document.getElementById('sheet')?.remove();
  document.body.append(h('div', { id: 'sheet', class: 'sheet', onclick: (e) => { if (e.target.id === 'sheet') close(); } },
    h('div', { class: 'sheet-body' },
      h('h2', {}, name),
      h('p', {}, me()
        ? '이 강좌는 이용권이 필요합니다. 이용권 페이지에서 구매하거나 받은 이용 키를 등록하세요.'
        : '이 강좌는 로그인과 이용권이 필요합니다.'),
      h('a', { class: 'btn primary', href: `/shop.html?need=${encodeURIComponent(course.id)}`, target: '_blank', rel: 'noopener' }, '이용권 · 이용 키 보기'),
      h('button', { class: 'btn', onclick: close }, '닫기'))));
}

function showViewer(course, path) {
  state.screen = 'viewer';
  const hint = h('div', { class: 'viewer-hint hidden' }, '불러오는 데 오래 걸립니다. ',
    h('a', { href: path, target: '_blank', rel: 'noopener' }, '브라우저에서 열기'));
  const frame = h('iframe', { class: 'frame', src: path, title: course.title, allow: 'fullscreen; clipboard-write' });
  const timer = setTimeout(() => hint.classList.remove('hidden'), SLOW_LOAD_MS);
  frame.addEventListener('load', () => { clearTimeout(timer); hint.classList.add('hidden'); });
  mount(
    h('header', { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': '뒤로', onclick: () => history.back() }, '←'),
      h('div', { class: 'titles' }, h('h1', {}, course.card?.name || course.title)),
      h('button', { class: 'icon-btn', 'aria-label': '다시 불러오기', onclick: () => { frame.src = path; } }, '⟳'),
      h('a', { class: 'icon-btn', 'aria-label': '브라우저에서 열기', href: path, target: '_blank', rel: 'noopener' }, '↗')),
    hint, frame);
}

window.addEventListener('popstate', () => {
  if (state.screen === 'viewer') { state.screen = 'home'; me() ? showHome() : showLogin(); }
});

// ---- 내 정보 ----------------------------------------------------------------
function showSettings() {
  state.screen = 'settings';
  const user = me();
  const { ent } = ctx();
  const now = Date.now();
  const titleOf = (id) => (id === 'all' ? '올패스 (공개된 모든 강좌)' : (courses().find((c) => c.id === id)?.title || id));
  const grants = Object.entries(ent).filter(([, until]) => until > now).sort((a, b) => a[1] - b[1]);
  const standalone = matchMedia('(display-mode: standalone)').matches;
  const link = (href, text) => h('a', { class: 'btn', href, target: '_blank', rel: 'noopener' }, text);
  mount(
    h('header', { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': '뒤로', onclick: showHome }, '←'),
      h('div', { class: 'titles' }, h('h1', {}, '내 정보'))),
    h('main', {},
      h('section', { class: 'panel' },
        h('h2', {}, user.name || user.email),
        h('p', {}, user.name ? user.email : ''),
        h('h2', {}, '내 이용권'),
        grants.length
          ? h('ul', { class: 'grants' }, grants.map(([id, until]) => h('li', {}, h('span', {}, titleOf(id)), h('small', {}, `${fmtDate(until)}까지`))))
          : h('p', {}, '이용권이 없습니다. 공개 강좌는 이용권 없이 볼 수 있습니다.'),
        h('div', {}, link('/shop.html', '이용권 · 이용 키'), link('/my.html', '결제 · 구독 내역'), link('/downloads.html', '프로그램 받기'),
          (user.perms || []).includes('courses') ? link('/admin.html', '관리자 화면') : null)),
      h('section', { class: 'panel' },
        h('h2', {}, '앱 설치'),
        standalone ? h('p', {}, '이미 앱으로 실행 중입니다.')
          : state.installEvent
            ? h('button', { class: 'btn primary', onclick: () => { state.installEvent.prompt(); state.installEvent = null; showSettings(); } }, '홈 화면에 설치')
            : h('p', {}, '브라우저 메뉴에서 "홈 화면에 추가"(안드로이드는 "앱 설치")를 누르세요. 아이폰은 Safari 공유 버튼 → "홈 화면에 추가"입니다.')),
      h('section', { class: 'panel' },
        h('button', { class: 'btn danger', onclick: async () => {
          try { await logoutRequest(); } catch { /* 오프라인이면 이 기기의 사본만 지움 */ }
          clearSnapshot(); state.snap = { me: { user: null }, catalog: { courses: [] }, at: Date.now() };
          await refresh();
        } }, '로그아웃'))));
}

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installEvent = e; });

// ---- 시작 -------------------------------------------------------------------
window.addEventListener('online', () => { if (state.offline) refresh({ quiet: true }); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.screen === 'home') refresh({ quiet: true }); });
setInterval(() => { if (!document.hidden && state.screen === 'home') refresh({ quiet: true }); }, REFRESH_MS);

refresh();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
