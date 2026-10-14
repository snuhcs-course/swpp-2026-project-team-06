export const templates = [
  { id: 'basic', name: '산지 상점', en: '01 / 산지 상점', short: '큰 제목 · 선명한 상품 구성', description: '상품을 크게 보여주는 표지와 한눈에 읽히는 정보. 크림과 감귤빛으로 또렷하게.' },
  { id: 'magazine', name: '산지 화보', en: '02 / 산지 화보', short: '깊은 초록 · 사진 중심', description: '사진과 짧은 설명이 번갈아 이어지는 구성. 깊은 초록과 명조 제목으로 차분하게.' },
  { id: 'letter', name: '농가 이야기', en: '03 / 농가 이야기', short: '따뜻한 종이색 · 원문 중심', description: '상품 사진으로 시작해 농가의 이야기를 한 장면씩 읽는 구성. 담백하고 따뜻하게.' },
];
export const fieldNames = ['farm', 'name', 'headline', 'story', 'origin', 'variety', 'weight', 'composition', 'updates', 'packing', 'storage', 'delivery'];

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
  empty.append(element('span', 'empty-frame', '＋'), element('strong', '', '상품 사진을 더해 주세요'), element('small', '', '첫 번째 사진이 표지에 들어가요'));
  return empty;
}
function productSummary(data) {
  const entries = [['origin','원산지'], ['variety','품종'], ['weight','중량·구성']].filter(([key]) => data[key].trim());
  if (!entries.length) return null;
  const section = element('section', 'product-summary');
  section.append(element('h2', '', '상품 한눈에 보기'));
  const facts = element('dl', 'summary-facts');
  for (const [key, label] of entries) {
    const row = element('div', 'summary-fact');
    row.append(element('dt', '', label), element('dd', '', data[key]));
    facts.append(row);
  }
  section.append(facts);
  return section;
}
export function renderPage(templateId, data, photos) {
  const page = element('article', `sales-page ${templateId}`);
  page.setAttribute('aria-label', `${templates.find(t => t.id === templateId).name} 상세 본문`);
  const cover = element('header', 'product-cover');
  const top = element('div', 'page-top');
  top.append(element('b', '', 'farmclub'), element('span', '', data.farm.trim() || '농가의 상품 이야기'));
  const title = element('div', 'hero-copy');
  if (data.origin.trim()) title.append(element('p', 'origin-label', data.origin));
  title.append(element('h1', data.name.trim() ? '' : 'empty-title', data.name.trim() ? data.name : '우리 농가의\n상품 이름'));
  if (data.headline.trim()) title.append(element('p', 'headline', data.headline));
  const picture = element('div', 'hero-photo');
  picture.append(photos[0] ? photoFigure(photos[0]) : emptyPhoto());
  cover.append(top);
  if (templateId === 'letter') cover.append(picture, title);
  else cover.append(title, picture);
  page.append(cover);
  const summary = productSummary(data);
  if (summary) page.append(summary);
  const paragraphs = data.story.split(/\n\s*\n/).filter(text => text.trim());
  const chapters = paragraphs.map(text => ({ kind: 'story', label: '농가 이야기', text }));
  for (const [key, label] of [['composition', '상품 구성'], ['updates', '농가 소식']]) {
    if (data[key].trim()) chapters.push({ kind: key, label, text: data[key] });
  }
  const chapterCount = Math.max(chapters.length, photos.length - 1);
  for (let index = 0; index < chapterCount; index++) {
    const chapter = chapters[index];
    const section = element('section', `story-chapter chapter-${index % 2} ${chapter ? chapter.kind : 'gallery'}-chapter`);
    const copy = element('div', 'chapter-copy');
    const label = element('div', 'chapter-label');
    label.append(element('span', 'chapter-number', String(index + 1).padStart(2, '0')));
    if (!chapter || chapter.kind === 'story') label.append(element('span', '', chapter ? chapter.label : '사진으로 살펴보기'));
    copy.append(label);
    if (chapter) {
      if (chapter.kind !== 'story') copy.append(element('h2', 'chapter-title', chapter.label));
      if (chapter.kind === 'composition' && data.weight.trim()) copy.append(element('p', 'composition-weight', data.weight));
      copy.append(element('p', `chapter-text${chapter.text.length > 120 ? ' long-copy' : ''}`, chapter.text));
    }
    const photo = photos[index + 1] ? photoFigure(photos[index + 1]) : null;
    if (chapter?.kind === 'updates' && photo) section.append(photo, copy);
    else { section.append(copy); if (photo) section.append(photo); }
    page.append(section);
  }
  const details = [['packing', '포장 안내'], ['storage', '보관 안내'], ['delivery', '배송 안내']].filter(([key]) => data[key].trim());
  if (details.length) {
    const section = element('section', 'purchase-notes');
    section.append(element('h2', '', '주문 전 확인해 주세요'));
    for (const [key, label] of details) {
      const row = element('div', 'purchase-note');
      row.append(element('h3', '', label), element('p', '', data[key]));
      section.append(row);
    }
    page.append(section);
  }
  const footer = element('footer', 'page-footer');
  if (data.farm.trim()) footer.append(element('p', '', data.farm));
  footer.append(element('strong', '', 'farmclub'), element('span', '', '농가와 이어지는 이야기'));
  page.append(footer);
  return page;
}
