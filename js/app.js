import { DEFAULT_HUB, normalizeBase, loadHub, clearCachedHub } from './hub.js';
import { login, saveSession, clearSession, restoreSession } from './auth.js';
import { FAVORITES_GROUP, safeUrl, filterSections, findCard, countCards } from './catalog.js';

const PREF_KEY = 'samstudy.m.prefs';
const RECENT_MAX = 6;
const SLOW_LOAD_MS = 8000;

// ---- 저장값 -----------------------------------------------------------------
function loadPrefs() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { /* 깨진 값은 무시 */ }
  return { hubUrl: DEFAULT_HUB, favorites: [], recent: [], collapsed: [], ...saved };
}
const prefs = loadPrefs();
const savePrefs = () => localStorage.setItem(PREF_KEY, JSON.stringify(prefs));

// ---- 상태 -------------------------------------------------------------------
const state = {
  hub: null, fromCache: false, loadError: '', user: null,
  group: '', query: '', screen: 'boot', openCardId: null, installEvent: null,
};
const $app = document.getElementById('app');

// ---- DOM 도우미: 허브에서 받은 문자열은 항상 textContent로만 넣는다 ------------
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

function mount(...nodes) {
  $app.replaceChildren(...nodes);
}

let toastTimer = null;
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

const siteTitle = () => state.hub?.site?.site?.title || 'SamStudy';
const siteSubtitle = () => state.hub?.site?.site?.subtitle || '';
const formatTime = (ms) => new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// ---- 불러오기 ---------------------------------------------------------------
async function loadAndShow({ force = false } = {}) {
  const base = normalizeBase(prefs.hubUrl);
  if (!base) { state.loadError = '허브 주소가 올바르지 않습니다'; showSettings(); return; }
  try {
    const { hub, fromCache, error } = await loadHub(base);
    state.hub = hub;
    state.fromCache = fromCache;
    state.loadError = error ? error.message : '';
  } catch (err) {
    state.hub = null;
    state.loadError = err.message || '허브를 불러오지 못했습니다';
    showSettings();
    return;
  }
  state.user = restoreSession(state.hub.access);
  if (force && state.user) { showHome(); toast(state.fromCache ? '오프라인: 저장된 목록을 표시합니다' : '목록을 새로 불러왔습니다'); return; }
  state.user ? showHome() : showLogin();
}

// ---- 로그인 -----------------------------------------------------------------
function showLogin() {
  state.screen = 'login';
  const error = h('div', { class: 'error', role: 'alert' });
  const id = h('input', { class: 'field', placeholder: '아이디', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false', required: true });
  const pw = h('input', { class: 'field', type: 'password', placeholder: '비밀번호', autocomplete: 'current-password', required: true });
  const form = h('form', { class: 'login-form' },
    id, pw,
    h('div', { class: 'error-slot' }, error),
    h('button', { class: 'btn primary', type: 'submit' }, '로그인'),
    state.fromCache ? h('p', { class: 'note' }, '오프라인 상태입니다. 저장된 사용자 목록으로 로그인합니다.') : null);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!globalThis.crypto?.subtle) { error.textContent = '보안 연결(https)에서만 로그인할 수 있습니다'; return; }
    const user = await login(state.hub.access, id.value, pw.value);
    if (!user) { error.textContent = '아이디 또는 비밀번호가 올바르지 않습니다'; pw.value = ''; return; }
    saveSession(user);
    state.user = user;
    showHome();
  });
  mount(h('div', { class: 'login' },
    h('div', { class: 'logo' }, '📚'),
    h('h1', {}, siteTitle()),
    h('p', { class: 'sub' }, siteSubtitle()),
    form,
    h('button', { class: 'link', onclick: showSettings }, '허브 주소 설정')));
}

// ---- 홈 ---------------------------------------------------------------------
function cardRow(card) {
  const fav = prefs.favorites.includes(card.id);
  const initial = [...(card.title || '?')][0].toUpperCase();
  return h('div', { class: 'row' },
    h('button', { class: 'row-main', onclick: () => openCourse(card.id) },
      h('span', { class: 'avatar', style: `background: linear-gradient(135deg, ${cssColor(card.c1, '#4f46e5')}, ${cssColor(card.c2, '#7c3aed')})` }, initial),
      h('span', { class: 'row-text' },
        h('strong', {}, card.title),
        card.tag ? h('em', {}, card.tag) : null,
        card.desc ? h('span', { class: 'desc' }, card.desc) : null)),
    h('button', {
      class: `star${fav ? ' on' : ''}`, 'aria-label': fav ? '즐겨찾기 해제' : '즐겨찾기',
      onclick: () => toggleFavorite(card.id),
    }, fav ? '★' : '☆'));
}

const cssColor = (value, fallback) => (/^#[0-9a-f]{3,8}$/i.test(String(value)) ? value : fallback);

function toggleFavorite(id) {
  const i = prefs.favorites.indexOf(id);
  if (i >= 0) prefs.favorites.splice(i, 1); else prefs.favorites.push(id);
  savePrefs();
  drawChips();
  drawList();
}

function groupChips() {
  const groups = state.hub.site.groups || [];
  const chip = (id, label) => h('button', {
    class: `chip${state.group === id ? ' on' : ''}`,
    onclick: () => { state.group = id; drawChips(); drawList(); },
  }, label);
  return [chip('', '전체'), chip(FAVORITES_GROUP, `★ 즐겨찾기${prefs.favorites.length ? ` ${prefs.favorites.length}` : ''}`),
    ...groups.map((g) => chip(g.id, g.name))];
}

function drawChips() {
  const el = document.getElementById('chips');
  if (el) el.replaceChildren(...groupChips());
}

function drawList() {
  const box = document.getElementById('list');
  if (!box) return;
  const sections = filterSections(state.hub.site, state.user, {
    group: state.group, query: state.query, favorites: new Set(prefs.favorites),
  });
  const nodes = [];
  const showRecent = !state.query && !state.group;
  if (showRecent) {
    const recent = prefs.recent
      .map((id) => findCard(state.hub.site, id))
      .filter((c) => c && filterSections({ sections: [{ id: 'x', title: '', cards: [c] }] }, state.user).length);
    if (recent.length) nodes.push(h('section', { class: 'sec' }, h('h2', {}, '🕘 최근 본 강좌'), recent.map(cardRow)));
  }
  const groupInfo = (state.hub.site.groups || []).find((g) => g.id === state.group);
  if (groupInfo?.desc) nodes.push(h('p', { class: 'group-desc' }, groupInfo.desc));
  for (const section of sections) {
    const collapsed = prefs.collapsed.includes(section.id) && !state.query;
    nodes.push(h('section', { class: 'sec' },
      h('button', {
        class: 'sec-head', 'aria-expanded': String(!collapsed),
        onclick: () => {
          const i = prefs.collapsed.indexOf(section.id);
          if (i >= 0) prefs.collapsed.splice(i, 1); else prefs.collapsed.push(section.id);
          savePrefs(); drawList();
        },
      }, h('span', {}, section.title), h('small', {}, `${section.cards.length} ${collapsed ? '▸' : '▾'}`)),
      collapsed ? null : section.cards.map(cardRow)));
  }
  if (!countCards(sections)) {
    nodes.push(h('div', { class: 'empty' }, state.group === FAVORITES_GROUP
      ? '즐겨찾기한 강좌가 없습니다. 강좌 오른쪽의 ☆를 눌러 추가하세요.' : '조건에 맞는 강좌가 없습니다.'));
  }
  box.replaceChildren(...nodes);
}

function showHome() {
  state.screen = 'home';
  const search = h('input', { class: 'search', type: 'search', placeholder: '강좌 검색', value: state.query });
  search.addEventListener('input', () => { state.query = search.value; drawList(); });
  mount(
    h('header', { class: 'topbar' },
      h('div', { class: 'titles' }, h('h1', {}, siteTitle()), siteSubtitle() ? h('small', {}, siteSubtitle()) : null),
      h('button', { class: 'icon-btn', 'aria-label': '새로고침', onclick: () => loadAndShow({ force: true }) }, '🔄'),
      h('button', { class: 'icon-btn', 'aria-label': '설정', onclick: showSettings }, '⚙️')),
    h('main', {},
      state.fromCache ? h('div', { class: 'banner' }, '오프라인 · 마지막으로 저장된 목록입니다') : null,
      search,
      h('div', { class: 'chips', id: 'chips' }, groupChips()),
      h('div', { id: 'list' })));
  drawList();
}

// ---- 강좌 열기 --------------------------------------------------------------
function openCourse(id) {
  const card = findCard(state.hub.site, id);
  const url = card && safeUrl(card.url);
  if (!url) return;
  prefs.recent = [id, ...prefs.recent.filter((r) => r !== id)].slice(0, RECENT_MAX);
  savePrefs();
  if (card.external) { window.open(url, '_blank', 'noopener'); drawList(); return; }
  state.openCardId = id;
  history.pushState({ course: id }, '', `#course=${encodeURIComponent(id)}`);
  showViewer(card, url);
}

function showViewer(card, url) {
  state.screen = 'viewer';
  const hint = h('div', { class: 'viewer-hint hidden' },
    '불러오는 데 오래 걸립니다. ', h('button', { class: 'link', onclick: () => window.open(url, '_blank', 'noopener') }, '브라우저에서 열기'));
  const frame = h('iframe', { class: 'frame', src: url, title: card.title, allow: 'fullscreen; clipboard-write', referrerpolicy: 'no-referrer-when-downgrade' });
  const timer = setTimeout(() => hint.classList.remove('hidden'), SLOW_LOAD_MS);
  frame.addEventListener('load', () => { clearTimeout(timer); hint.classList.add('hidden'); });
  mount(
    h('header', { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': '뒤로', onclick: () => history.back() }, '←'),
      h('div', { class: 'titles' }, h('h1', {}, card.title)),
      h('button', { class: 'icon-btn', 'aria-label': '다시 불러오기', onclick: () => { frame.src = url; } }, '⟳'),
      h('button', { class: 'icon-btn', 'aria-label': '브라우저에서 열기', onclick: () => window.open(url, '_blank', 'noopener') }, '↗')),
    hint, frame);
}

window.addEventListener('popstate', () => {
  if (state.screen === 'viewer' && state.hub) { state.openCardId = null; showHome(); }
});

// ---- 설정 -------------------------------------------------------------------
function showSettings() {
  state.screen = 'settings';
  const url = h('input', { class: 'field', value: prefs.hubUrl, autocapitalize: 'off', spellcheck: 'false', inputmode: 'url' });
  const standalone = matchMedia('(display-mode: standalone)').matches;
  mount(
    h('header', { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': '뒤로', onclick: () => (state.hub && state.user ? showHome() : state.hub ? showLogin() : loadAndShow()) }, '←'),
      h('div', { class: 'titles' }, h('h1', {}, '설정'))),
    h('main', {},
      state.loadError ? h('div', { class: 'banner error' }, state.loadError) : null,
      h('section', { class: 'panel' },
        h('h2', {}, '허브 주소'),
        h('p', {}, 'SamStudy 허브가 배포된 주소입니다. 이 주소의 site-config.json과 access-config.json을 읽습니다.'),
        url,
        h('button', { class: 'btn primary', onclick: async () => {
          const base = normalizeBase(url.value);
          if (!base) { toast('주소 형식이 올바르지 않습니다'); return; }
          if (base !== prefs.hubUrl) { clearCachedHub(); clearSession(); state.hub = null; state.user = null; }
          prefs.hubUrl = base; savePrefs(); state.loadError = '';
          await loadAndShow();
        } }, '저장하고 불러오기'),
        h('button', { class: 'btn', onclick: () => { url.value = DEFAULT_HUB; } }, '기본값'),
        state.hub ? h('p', { class: 'kv' }, `마지막 불러온 시각: ${formatTime(state.hub.fetchedAt)} · 강좌 ${state.hub.site.sections.reduce((n, s) => n + s.cards.length, 0)}개`) : null),
      state.user ? h('section', { class: 'panel' },
        h('h2', {}, '계정'),
        h('p', {}, `${state.user.id}${state.user.role === 'master' ? ' (관리자)' : ''}로 로그인됨`),
        h('button', { class: 'btn danger', onclick: () => { clearSession(); state.user = null; showLogin(); } }, '로그아웃')) : null,
      h('section', { class: 'panel' },
        h('h2', {}, '앱 설치'),
        standalone ? h('p', {}, '이미 앱으로 실행 중입니다.')
          : state.installEvent
            ? h('button', { class: 'btn primary', onclick: async () => { state.installEvent.prompt(); state.installEvent = null; showSettings(); } }, '홈 화면에 설치')
            : h('p', {}, '브라우저 메뉴에서 "홈 화면에 추가"(안드로이드는 "앱 설치")를 누르세요. 아이폰은 Safari 공유 버튼 → "홈 화면에 추가"입니다.')),
      h('section', { class: 'panel' },
        h('h2', {}, '안내'),
        h('p', {}, '강좌는 각 강좌 사이트를 앱 안에서 열어 보여 줍니다. 강좌 사이트 자체는 오프라인에서 열리지 않을 수 있습니다.'),
        h('p', {}, '로그인은 허브와 같은 계정을 쓰며 화면을 가리는 용도입니다. 강좌 주소를 아는 사람은 직접 열 수 있습니다.'))));
}

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installEvent = e; });

// ---- 시작 -------------------------------------------------------------------
loadAndShow();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
