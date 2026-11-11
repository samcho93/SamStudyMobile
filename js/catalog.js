// irodmas.com 대문과 같은 규칙으로 강좌의 열림 여부를 계산하고 목록을 거른다. (public/index.html 의 canOpen · until)

export const FAVORITES = '__favorites';
export const KINDS = [['course', '강좌'], ['cert', '자격증'], ['builder', '빌더'], ['sim', '시뮬레이터'], ['tool', '도구'], ['etc', '기타']];

export const kindOf = (course) => (KINDS.some(([k]) => k === course.kind) ? course.kind : 'etc');

// 같은 출처의 경로(/강좌/)만 허용한다. javascript: 나 다른 사이트 주소는 열지 않는다.
export function safePath(value) {
  const text = String(value || '');
  return text.startsWith('/') && !text.startsWith('//') && !/[\s\\]/.test(text) ? text : null;
}

// ent: { 강좌ID: 만료시각(ms), all: 올패스 만료시각 }
export function accessInfo(course, { admin = false, ent = {}, now = Date.now() } = {}) {
  const until = Math.max(ent[course.id] || 0, ent.all || 0);
  if (admin) return { open: true, until, label: course.active ? '관리자' : '비공개', tone: 'own' };
  if (course.access === 'free') return { open: true, until: 0, label: '공개', tone: 'free' };
  if (until > now) {
    return { open: true, until, label: ent.all > now && !(ent[course.id] > now) ? '올패스' : '이용 중', tone: 'own' };
  }
  return { open: false, until: 0, label: '이용권', tone: 'lock' };
}

function matches(course, needle) {
  const k = course.card || {};
  return [course.title, course.summary, course.section, k.name, k.about, k.tag]
    .some((text) => String(text || '').toLowerCase().includes(needle));
}

// 열 수 있는 강좌(open)와 이용권이 필요한 강좌(locked)로 나눠 돌려준다.
export function filterCourses(courses, ctx, { kind = '', query = '', favorites = new Set() } = {}) {
  const needle = query.trim().toLowerCase();
  const open = [];
  const locked = [];
  for (const course of courses) {
    if (!safePath(course.path)) continue;
    if (kind === FAVORITES ? !favorites.has(course.id) : kind && kindOf(course) !== kind) continue;
    if (needle && !matches(course, needle)) continue;
    (accessInfo(course, ctx).open ? open : locked).push(course);
  }
  return { open, locked };
}

// 분야(section)별로 묶는다. 서버가 준 순서를 유지한다.
export function groupBySection(courses) {
  const groups = [];
  for (const course of courses) {
    const name = course.section || '기타';
    let group = groups.find((g) => g.name === name);
    if (!group) groups.push(group = { name, list: [] });
    group.list.push(course);
  }
  return groups;
}

export const kindsPresent = (courses) => KINDS.filter(([k]) => courses.some((c) => kindOf(c) === k));
