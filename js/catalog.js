// 강좌 목록을 사용자 권한·학습 그룹·검색어·즐겨찾기로 걸러 낸다.

export const FAVORITES_GROUP = '__favorites';

export function safeUrl(value) {
  try {
    const url = new URL(String(value));
    return /^https?:$/.test(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function allCards(site) {
  return site.sections.flatMap((s) => s.cards.map((card) => ({ ...card, sectionId: s.id, sectionTitle: s.title })));
}

export function isAllowed(card, user) {
  return !user || !(user.deny || []).includes(card.id);
}

function matchesQuery(card, needle) {
  return [card.title, card.tag, card.desc].some((text) => typeof text === 'string' && text.toLowerCase().includes(needle));
}

// { group, query, favorites(Set) } 조건에 맞는 카드만 남기고, 카드가 없는 섹션은 뺀다.
export function filterSections(site, user, { group = '', query = '', favorites = new Set() } = {}) {
  const needle = query.trim().toLowerCase();
  return site.sections
    .map((section) => ({
      id: section.id,
      title: section.title,
      cards: section.cards.filter((card) => {
        if (!safeUrl(card.url) || !isAllowed(card, user)) return false;
        if (group === FAVORITES_GROUP) { if (!favorites.has(card.id)) return false; }
        else if (group && !(card.groups || []).includes(group)) return false;
        return !needle || matchesQuery(card, needle);
      }),
    }))
    .filter((section) => section.cards.length > 0);
}

export function findCard(site, id) {
  return allCards(site).find((card) => card.id === id) || null;
}

export function countCards(sections) {
  return sections.reduce((sum, s) => sum + s.cards.length, 0);
}
