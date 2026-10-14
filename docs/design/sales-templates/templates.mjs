export const templates = [
  { id: 'basic', name: '기본 상품형', en: '01 / THE ESSENTIAL', short: '사진과 정보를 또렷하게', description: '대표 사진에서 상품 정보까지. 필요한 내용을 차분하게 정리해요.' },
  { id: 'magazine', name: '매거진형', en: '02 / THE EDITORIAL', short: '사진 사이로 이어지는 이야기', description: '깊은 초록과 큰 제목. 사진을 중심으로 농가의 이야기를 펼쳐요.' },
  { id: 'letter', name: '농가 편지형', en: '03 / THE LETTER', short: '글에 마음을 담는 구성', description: '종이 위에 놓은 사진과 글. 농가가 직접 건네는 편지처럼 읽혀요.' },
];

export const fieldNames = ['farm', 'name', 'headline', 'story', 'origin', 'variety', 'weight', 'storage', 'delivery'];

/** User strings only enter textContent; they never become markup or styles. */
export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function photoFigure(photo) {
  const figure = element('figure', 'photo');
  const image = element('img');
  image.src = photo.url;
  image.alt = photo.caption.trim() || '사용자가 제공한 사진';
  figure.append(image);
  if (photo.caption.trim()) figure.append(element('figcaption', '', photo.caption));
  return figure;
}

function emptyPhoto() {
  const empty = element('div', 'photo-empty');
  empty.append(element('span', 'empty-frame', '＋'), element('strong', '', '우리 사진이 놓일 자리'), element('small', '', '사진을 추가하면 이 안내가 사라져요'));
  return empty;
}

/** All layouts share the same source fields and photo order, without generated copy. */
export function renderPage(templateId, data, photos) {
  const page = element('article', `sales-page ${templateId}`);
  page.setAttribute('aria-label', `${templates.find(t => t.id === templateId).name} 상세 본문`);
  const top = element('div', 'page-top');
  top.append(element('b', '', 'farmclub'), element('span', '', 'FROM THE FARM'));
  page.append(top);
  const hero = element('header', 'hero-copy');
  hero.append(element('div', 'section-kicker', templateId === 'letter' ? '농가에서 전하는 이야기' : '사진과 글로 만나는 상품'));
  hero.append(element('h1', data.name.trim() ? '' : 'empty-title', data.name.trim() ? data.name : '상품 이름을\n넣어 주세요'));
  if (data.headline.trim()) hero.append(element('p', '', data.headline));
  else hero.append(element('p', 'source-hint', '한 줄 소개를 입력하면 여기에 담겨요.'));
  if (data.farm.trim()) hero.append(element('div', 'farm-line', data.farm));
  page.append(hero);
  const heroPhoto = element('div', 'hero-photo');
  heroPhoto.append(photos[0] ? photoFigure(photos[0]) : emptyPhoto());
  page.append(heroPhoto);

  if (data.story.trim()) {
    const story = element('section', 'body-section story-section');
    story.append(element('div', 'section-kicker', templateId === 'magazine' ? '01 — STORY' : 'OUR STORY'));
    story.append(element('h2', '', templateId === 'letter' ? '안녕하세요.' : '전하고 싶은 이야기'));
    story.append(element('p', '', data.story));
    if (templateId === 'letter' && data.farm.trim()) story.append(element('p', 'letter-signature', `${data.farm} 드림`));
    page.append(story);
  }
  if (photos.length > 1) {
    const gallery = element('section', 'additional-photos');
    gallery.setAttribute('aria-label', '추가 사진');
    photos.slice(1).forEach(photo => gallery.append(photoFigure(photo)));
    page.append(gallery);
  }
  const facts = [['origin','원산지'], ['variety','품종'], ['weight','중량·구성'], ['storage','보관 안내'], ['delivery','배송 안내']].filter(([key]) => data[key].trim());
  if (facts.length) {
    const section = element('section', 'body-section facts-section');
    section.append(element('div', 'section-kicker', templateId === 'magazine' ? '02 — DETAILS' : 'GOOD TO KNOW'), element('h2', '', '살펴보고 선택하세요'));
    const list = element('dl', 'facts');
    for (const [key, label] of facts) {
      const row = element('div', 'fact-row');
      row.append(element('dt', '', label), element('dd', '', data[key]));
      list.append(row);
    }
    section.append(list);
    page.append(section);
  }
  const footer = element('footer', 'page-footer');
  footer.append(element('strong', '', 'farmclub'), element('span', '', '농가와 이어지는 이야기'));
  page.append(footer);
  return page;
}
