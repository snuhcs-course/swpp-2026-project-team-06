import { templates, fieldNames, element, renderPage } from './templates.mjs';

const $ = id => document.getElementById(id);
const data = Object.fromEntries(fieldNames.map(name => [name, '']));
const photos = [];
let selected = 'basic';
let compare = false;
let uploading = false;
let dirty = false;
let toastTimer;

function say(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500);
}

function choose(id) {
  selected = id;
  dirty = true;
  render();
}

for (const template of templates) {
  const button = element('button', 'template-option');
  button.type = 'button';
  button.dataset.template = template.id;
  button.setAttribute('aria-label', template.name);
  const mini = element('span', `mini-layout ${template.id}`);
  mini.setAttribute('aria-hidden', 'true');
  mini.append(element('i'), element('b'), element('b'));
  const copy = element('span', 'option-copy');
  copy.append(element('strong', '', template.name), element('small', '', template.short));
  const check = element('span', 'option-check', '✓');
  check.setAttribute('aria-hidden', 'true');
  button.append(mini, copy, check);
  button.addEventListener('click', () => choose(template.id));
  $('template-picker').append(button);
}

function render() {
  const current = templates.find(template => template.id === selected);
  $('active-kicker').textContent = compare ? 'THREE WAYS TO TELL YOUR STORY' : current.en;
  $('active-title').textContent = compare ? '같은 이야기, 다른 인상.' : current.name;
  $('active-description').textContent = compare ? '글과 사진은 그대로. 좌우로 넘기며 세 구성을 비교하세요.' : current.description;
  document.querySelectorAll('[data-template]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.template === selected)));
  $('single-view').setAttribute('aria-pressed', String(!compare));
  $('compare-view').setAttribute('aria-pressed', String(compare));
  const container = $('previews');
  const scrollLeft = container.scrollLeft;
  container.classList.toggle('compare', compare);
  container.replaceChildren();
  for (const template of compare ? templates : [current]) {
    const shell = element('div', 'preview-shell');
    shell.dataset.preview = template.id;
    const label = element('div', 'preview-label');
    label.append(element('strong', '', template.name));
    if (compare) {
      const pick = element('button', '', template.id === selected ? '선택됨 ✓' : '이 구성 선택');
      pick.setAttribute('aria-label', `${template.name} 적용`);
      pick.setAttribute('aria-pressed', String(template.id === selected));
      pick.addEventListener('click', () => {
        choose(template.id);
        document.querySelector(`[data-preview="${template.id}"] button`).focus({ preventScroll: true });
      });
      label.append(pick);
    } else label.append(element('span', '', `${$('preview-width').value}px 기준 · 반응형`));
    const frame = element('div', 'page-frame');
    const status = element('div', 'preview-status');
    status.append(element('span', '', '상품 상세'), element('span', '', '미리보기'));
    frame.append(status, renderPage(template.id, data, photos));
    shell.append(label, frame);
    container.append(shell);
  }
  container.scrollLeft = scrollLeft;
}

$('content-form').addEventListener('submit', event => event.preventDefault());
$('content-form').addEventListener('input', event => {
  const name = event.target.name;
  if (!fieldNames.includes(name)) return;
  data[name] = event.target.value;
  dirty = true;
  render();
});
$('single-view').addEventListener('click', () => { compare = false; render(); });
$('compare-view').addEventListener('click', () => { compare = true; render(); });
$('preview-width').addEventListener('change', () => {
  document.documentElement.style.setProperty('--preview-width', `${$('preview-width').value}px`);
  render();
});

function photoList() {
  $('photo-count').textContent = `${photos.length} / 6`;
  $('photos').disabled = uploading || photos.length >= 6;
  $('photo-list').replaceChildren();
  photos.forEach((photo, index) => {
    const row = element('div', 'photo-row');
    const thumbnail = element('img');
    thumbnail.src = photo.url;
    thumbnail.alt = '';
    const details = element('div');
    details.append(element('strong', '', `${index + 1}. ${photo.name}`));
    const caption = element('input');
    caption.setAttribute('aria-label', `사진 ${index + 1} 설명`);
    caption.placeholder = '사진 설명 (선택)';
    caption.maxLength = 200;
    caption.value = photo.caption;
    caption.addEventListener('input', () => { photo.caption = caption.value; dirty = true; render(); });
    details.append(caption);
    const actions = element('div', 'photo-actions');
    for (const [label, delta] of [['위로', -1], ['아래로', 1], ['삭제', 0]]) {
      const button = element('button', '', label);
      button.setAttribute('aria-label', `사진 ${index + 1} ${label}`);
      button.disabled = uploading || (delta !== 0 && (index + delta < 0 || index + delta >= photos.length));
      button.addEventListener('click', () => {
        if (!delta) {
          URL.revokeObjectURL(photo.url);
          photos.splice(index, 1);
        } else [photos[index], photos[index + delta]] = [photos[index + delta], photos[index]];
        dirty = true;
        photoList();
        render();
        $('photos').focus({ preventScroll: true });
      });
      actions.append(button);
    }
    row.append(thumbnail, details, actions);
    $('photo-list').append(row);
  });
}

async function validImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPG·PNG·WebP 사진만 사용할 수 있어요.');
  if (file.size > 10 * 1024 * 1024) throw new Error('사진은 장당 10MB 이하로 골라 주세요.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (image.naturalWidth * image.naturalHeight > 40000000) throw new Error('사진은 4천만 화소 이하로 골라 주세요.');
    return { url, name: file.name, caption: '' };
  } catch (error) {
    URL.revokeObjectURL(url);
    if (error instanceof Error && error.message.includes('화소')) throw error;
    throw new Error('읽을 수 없는 사진이에요. 다른 파일을 골라 주세요.');
  }
}

$('photos').addEventListener('change', async event => {
  if (uploading) return;
  const files = [...event.target.files];
  if (!files.length) return;
  uploading = true;
  $('export').disabled = true;
  photoList();
  $('upload-status').textContent = '사진을 확인하고 있어요…';
  const errors = [];
  for (const file of files) {
    if (photos.length >= 6) { errors.push('사진은 최대 6장까지 담을 수 있어요.'); break; }
    try { photos.push(await validImage(file)); dirty = true; }
    catch (error) { errors.push(`${file.name}: ${error.message}`); }
  }
  uploading = false;
  $('export').disabled = false;
  $('photos').value = '';
  $('upload-status').textContent = [...new Set(errors)].join(' ');
  photoList();
  render();
});

$('export').addEventListener('click', () => {
  const content = { templateId: selected, fields: { ...data }, photos: photos.map(({ name, caption }) => ({ filename: name, caption })), note: '사진 파일은 포함되지 않습니다. 실제 게시 데이터가 아닌 디자인 편집안입니다.' };
  const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
  const link = element('a');
  link.href = url;
  link.download = `farmclub-${selected}-draft.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  say('편집안을 내려받았어요. 사진 원본은 따로 보관해 주세요.');
});
window.addEventListener('beforeunload', event => {
  if (!dirty && !uploading) return;
  event.preventDefault();
  event.returnValue = '';
});
render();
photoList();
