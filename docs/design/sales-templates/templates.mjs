export const templates = [
  { id: 'basic', name: '산지 상점', en: '01 / FARM STORE', short: '도현 · 또렷하고 경쾌하게', description: '큰 제목과 선명한 색, 넉넉한 상품 사진. 산지의 활기를 담은 구성.' },
  { id: 'magazine', name: '농가 매거진', en: '02 / FIELD JOURNAL', short: '고운바탕 Bold · 사진 중심', description: '사진으로 시작해 명조 제목과 이야기로 이어지는 한 편의 매거진.' },
  { id: 'letter', name: '농가의 편지', en: '03 / A LETTER FROM', short: '고운바탕 · 조용하고 따뜻하게', description: '인사와 글을 먼저 읽고 사진을 만나는, 농가가 건네는 편지.' },
];
export const fieldNames = ['farm', 'name', 'headline', 'story', 'origin', 'variety', 'weight', 'storage', 'delivery'];

export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function photoFigure(photo, index) {
  const figure = element('figure', 'photo');
  const image = element('img');
  image.src = photo.url;
  image.alt = photo.caption.trim() || '사용자가 제공한 사진';
  figure.append(image);
  if (photo.caption.trim()) {
    const caption = element('figcaption');
    caption.append(element('span', 'photo-index', String(index + 1).padStart(2, '0')), element('span', '', photo.caption));
    figure.append(caption);
  }
  return figure;
}
function emptyPhoto() {
  const empty = element('div', 'photo-empty');
  empty.append(element('span', 'empty-frame', '＋'), element('strong', '', '우리 사진이 놓일 자리'), element('small', '', '사진을 추가하면 이 안내가 사라져요'));
  return empty;
}
function titleBlock(id, data) {
  const hero = element('header', 'hero-copy');
  hero.append(element('div', 'section-kicker', id === 'letter' ? '농가에서 보내는 편지' : id === 'magazine' ? 'FIELD NOTES / 농가 기록' : '농가에서 만나는 상품'));
  hero.append(element('h1', data.name.trim() ? '' : 'empty-title', data.name.trim() ? data.name : '상품 이름을\n넣어 주세요'));
  if (data.headline.trim()) hero.append(element('p', 'headline', data.headline));
  if (data.farm.trim()) hero.append(element('div', 'farm-line', data.farm));
  return hero;
}
function storyBlock(id, data) {
  if (!data.story.trim()) return null;
  const story = element('section', 'body-section story-section');
  story.append(element('div', 'section-kicker', id === 'letter' ? 'DEAR, YOU' : 'THE STORY'));
  story.append(element('h2', '', id === 'letter' ? '안녕하세요.' : '농가의 이야기를\n전합니다.'));
  const paragraphs = element('div', 'story-paragraphs');
  for (const text of data.story.split(/\n\s*\n/).filter(text => text.trim())) paragraphs.append(element('p', '', text));
  story.append(paragraphs);
  if (id === 'letter' && data.farm.trim()) story.append(element('p', 'letter-signature', `${data.farm} 드림`));
  return story;
}
export function renderPage(templateId, data, photos) {
  const page = element('article', `sales-page ${templateId}`);
  page.setAttribute('aria-label', `${templates.find(t => t.id === templateId).name} 상세 본문`);
  const top = element('div', 'page-top');
  top.append(element('b', '', 'farmclub'), element('span', '', '농가의 이야기, 식탁까지'));
  page.append(top);
  const hero = titleBlock(templateId, data);
  const heroPhoto = element('div', 'hero-photo');
  heroPhoto.append(photos[0] ? photoFigure(photos[0], 0) : emptyPhoto());
  const story = storyBlock(templateId, data);
  if (templateId === 'magazine') page.append(heroPhoto, hero);
  else page.append(hero);
  if (templateId === 'basic') page.append(heroPhoto);
  const quickFacts = [['origin','산지'], ['variety','품종'], ['weight','구성']].filter(([key]) => data[key].trim());
  if (templateId === 'basic' && quickFacts.length) {
    const strip = element('dl', 'quick-facts');
    for (const [key, label] of quickFacts) {
      const item = element('div'); item.append(element('dt', '', label), element('dd', '', data[key])); strip.append(item);
    }
    page.append(strip);
  }
  if (story) page.append(story);
  if (templateId === 'letter') page.append(heroPhoto);
  if (photos.length > 1) {
    const gallery = element('section', 'additional-photos');
    gallery.setAttribute('aria-label', '추가 사진');
    const heading = element('div', 'gallery-heading');
    heading.append(element('span', '', 'PHOTO NOTES'), element('span', '', '사진으로 전하는 농가'));
    gallery.append(heading);
    photos.slice(1).forEach((photo, index) => gallery.append(photoFigure(photo, index + 1)));
    page.append(gallery);
  }
  const facts = [['origin','원산지'], ['variety','품종'], ['weight','중량·구성'], ['storage','보관 안내'], ['delivery','배송 안내']].filter(([key]) => data[key].trim());
  if (facts.length) {
    const section = element('section', 'body-section facts-section');
    section.append(element('div', 'section-kicker', 'PRODUCT NOTES'), element('h2', '', '상품을 살펴보세요.'));
    const list = element('dl', 'facts');
    for (const [key, label] of facts) {
      const row = element('div', 'fact-row'); row.append(element('dt', '', label), element('dd', '', data[key])); list.append(row);
    }
    section.append(list); page.append(section);
  }
  const footer = element('footer', 'page-footer');
  footer.append(element('strong', '', 'farmclub'), element('span', '', '농가와 이어지는 이야기'));
  page.append(footer);
  return page;
}
