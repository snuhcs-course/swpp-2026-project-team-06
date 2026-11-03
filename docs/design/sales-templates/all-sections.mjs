import { demoFields as d } from './demo.mjs';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const refs={oasis:['오아시스 · 하우스 감귤','https://m.oasis.co.kr/product/detail/95810?categoryId=2'],namdo:['남도장터 · 베니하루카','https://www.jnmall.kr/product/22663'],gs:['GS SHOP · 황도 복숭아','https://m.gsshop.com/prd/prd.gs?prdid=1057581580&gsid=srcheshop-result&ispre=Y&kwd=%ED%99%A9%EB%8F%84&mseq=401139&rank=1&srp_ab=srchMA_df'],tomato:['그래도팜 · 토마토','https://tomarrow.com/the-fruit-of-history/?idx=261'],lotte:['롯데홈쇼핑 · 농부마음 감귤','https://m.lotteimall.com/goods/viewGoodsDetail.lotte?goods_no=1187843418'],dalcom:['달콤트리 · 감귤 상세이미지','https://cdn-optimized.imweb.me/upload/S202112213d3a1d3fd63cd/9a3b24b8b0569.jpg?w=1920'],sae:['새농 · 친환경 토마토','https://saenong.com/product/친환경-토마토2kg/10025/'],dill:['컬리 · 딜','https://www.kurly.com/goods/5001071'],powder:['싸리재 · 군고구마가루','https://m.ssarijai.com/product/zoom.html?product_no=121'],barley:['싸리재 · 유기농 압맥','https://m.ssarijai.com/product/zoom.html?product_no=568'],rice:['싸리재 · 수수부꾸미','https://ssarijai.com/product/싸리재-수수부꾸미만들기-구워먹는-수수부꾸미-냉동생지-60g-10개-수수떡-부꾸미-경단-통팥/272/category/79/display/1/'],curry:['컬리 · 티아시아 커리','https://www.kurly.com/goods/1000215475']};
Object.assign(refs,{
 kurly:['컬리 · 깐 마','https://www.kurly.com/goods/5035520'],
 ssari:['싸리재 · 옛날 미숫가루 스틱','https://m.ssarijai.com/product/detail.html?product_no=134'],
 apple:['새농 · 시나노골드 사과','https://saenong.com/product/시나노골드사과5kg경북영주17-19과-내외/12523/category/426/display/1/']
});

const referenceImages={
 oasis:{image:'https://oasisprodse.edge.naverncp.com/2025/7/1/6d6a23bb-4274-46d9-b490-efe4b952f212',from:'상품 사진을 크게 보여준 뒤 상품명과 설명을 분리합니다.',change:'중앙 상품명·보조 문구 아래에 넓은 왼쪽 정렬 설명을 둡니다. 사진은 전체 폭, 하단 실용 안내는 회색 바탕과 왼쪽 정렬로 맞췄습니다.'},
 namdo:{image:'https://qozywruyowzn3844493.gcdn.gov-ntruss.com/common/13cae665-07ba-4e61-b81e-69b8d949bd24',from:'강한 표지 뒤에 크기 비교와 중량별 구성을 집중해서 보여줍니다.',change:'크기·구성 구획을 참고했습니다. 현재 상세에는 선택한 상품의 구성만 표시하며, 실제 크기 사진과 개수는 생산자 자료가 필요합니다.'},
 lotte:{image:'https://kiwi4965.speedgabia.com/enjoy/AI/AI050_detail.jpg',from:'흰 바탕의 중앙 제목 → 짧은 구분선 → 중앙 문단 → 전체 폭 사진이 이어집니다.',change:'같은 중앙 축과 짧은 구분선을 적용했습니다. 농가 문단 다음에 전경·작업 사진을 전체 폭으로 두고 초록 표지·비대칭 배열을 없앴습니다.'},
 tomato:{image:'https://cdn.imweb.me/upload/S202103245a73dbc9cf936/5876a8fd5b3bd.jpg',from:'구성의 핵심을 큰 제목과 품종별 사진으로 설명합니다. 구성·보관 구획만 확인한 자료입니다.',change:'주황 중앙 제목·큰 중량 숫자·넓은 여백과 갈색 번호형 보관 안내를 적용했습니다. 품종별 사진과 실제 안내가 없는 자리는 미입력으로 남깁니다.'}
};
Object.assign(referenceImages,{
 dalcom:{image:refs.dalcom[1],from:'감귤의 특징을 번호와 확대 사진, 작업 사진으로 설명한 구획입니다.',change:'같은 제목 크기를 반복하기보다 중요한 설명과 실용 안내의 대비를 비교합니다. 당도·선별 주장은 옮기지 않았습니다.'},
 sae:{image:'https://saenong.com/web/upload/NNEditor/20250811/acbacecb536e95239261d2219ba77198.webp',from:'소개 문단 뒤 원물 사진, 특징, 보관·활용 안내를 구획합니다.',change:'새농 사과 시안과 함께 사진 앞뒤의 설명 길이와 배경 전환을 비교할 수 있습니다.'},
 kurly:{image:'./assets/references/kurly-excerpt.jpg',extra:'./assets/references/kurly-points.jpg',from:'상품 소개와 체크 포인트의 실제 화면 캡처입니다. 중앙 상품명과 가로선 뒤에 왼쪽 본문, 두 열 요약이 이어집니다.',change:'정보 요약형은 가로선 제목과 원산지·품종 요약을 적용하고, 품질 자료/표기 정보를 나란히 묶습니다. 상품 요약의 선 아이콘과 수확→선별→출하 도식을 사용합니다. 크기와 개수는 실제 자료가 있을 때만 표시하며 중량 비교는 하지 않습니다.'},
 ssari:{image:'./assets/references/ssari-excerpt.jpg',from:'상품 정보 구획의 실제 화면 캡처입니다. 큰 사진 다음 왼쪽 색선 제목과 짧은 항목별 설명을 배치합니다.',change:'안내 중심형은 색선 제목·짧은 행·테두리 표를 적용하고, 구성과 포장/보관 안내를 앞쪽에 모았습니다.'},
 apple:{image:'https://saenong.com/web/upload/NNEditor/20261006/08501e324b728b748db3eb72f5d1a7bd.webp',from:'산지명과 큰 상품명, 특징 문단, 밭 사진을 회색 바탕에서 교차합니다. 전체 상세 이미지입니다.',change:'산지 소개형은 농가명과 중앙 설명을 앞세우고 특징 → 농가 → 생산 순으로 사진을 연결합니다. 강조색은 팜클럽 주황을 씁니다.'}
});

const definitions=[
 ['맛·향·과즙·식감','oasis','맛은 기존 원문 사용. 향·과즙·식감 설명은 추가 자료 필요.'],['판매 규격','oasis','실제 선별 규격과 사진 필요.'],['손에 든 크기 사진','namdo','현재는 기존 가상 농가 사진의 배치 예시. 실판매에는 해당 상품을 손 위에 든 실제 원본으로 교체. 임의 비율·실측 수치 추가 없음.'],['낱개 중량','namdo','낱개 실측 중량 필요. 선택한 박스 중량은 상품 구성에 한 번만 표시.'],['한 상자에 담기는 개수','gs','선택한 상품의 개수 또는 생산자가 확인한 개수 범위 필요. 중량으로 개수를 추정하지 않음.'],['상품 구성','gs','선택한 상품의 제공된 구성만 표시. 다른 중량을 다시 비교하지 않음.'],['품종별 외형','tomato','현재 하우스 감귤만 있음. 다른 품종 사진을 만들지 않음.'],['혼합 구성 규칙','tomato','혼합 상품에만 적용. 감귤에 적용 미확정.'],['수확·선별·포장 과정','lotte','기존 원문과 예시 사진 사용. 세부 선별·포장 방식은 미입력.'],['배송 상자·내부 구성','lotte','기존 박스 사진은 배치 예시이며 실제 출고 증빙 아님.'],['선별 방식·품질 기록','dalcom','실측값·측정일·측정 대상·인증 원본 없음.'],['먹는 시점','dalcom','해당 품종에 대해 확인한 안내 필요.'],['껍질·과육 단면','sae','실제 단면 사진 없음. 생성하거나 다른 상품에서 가져오지 않음.'],['활용 메뉴','sae','사용자 제공 메뉴와 실제 사진 필요.'],['소분·보관','dill','해당 상품에 맞는 보관 조건 필요.'],['사용 시점·팁','dill','사용자가 제공한 조리·활용 안내 필요.'],['개봉 전·후 보관','powder','실제 상품 상태에 맞는 전후 보관 안내 필요.'],['외형 변화 FAQ','powder','정상 특성과 문제가 있는 상태를 구분할 사진·답변 필요.'],['가공 과정·이유','barley','가공식품용 구성 예시. 감귤에 적용 미확정.'],['원재료·함량·인증','barley','라벨·원본 인증 자료 필요. 감귤에 사실 추가 없음.'],['조리 전·후 상태','rice','조리 상품용 구성 예시. 해당 상품의 실제 사진 필요.'],['조리 주의점','rice','시간·온도·도구 등 검증된 안내 필요.'],['옵션별 맛 비교','curry','중량 옵션에 맛 차이를 만들지 않음. 맛이 다른 옵션에 적용.'],['취향별 선택','curry','실제 품종·맛 차이가 있을 때만 설명. 현재 비교 자료 없음.']
];
const photo=(name,caption)=>`<figure class="product-photo"><div class="photo-frame"><img src="./assets/demo/${name}.jpg" alt="${esc(caption)}" decoding="async"></div><figcaption>${esc(caption)}</figcaption></figure>`;
const item=(n,content)=>`<div class="item item-${n}" data-item="${n}">${content}</div>`;
const rasterIcon=name=>`<img class="raster-icon" src="./assets/icons/${name}.png" width="56" height="56" alt="" aria-hidden="true" decoding="async">`;
const sectionTitle=(key,title)=>`<h2><img class="section-icon" src="./assets/headings/${key}.png" width="36" height="36" alt="" aria-hidden="true"><span>${esc(title)}</span></h2>`;
const processGraphic=()=>`<ol class="graphic-process">${[['harvest','수확'],['select','선별'],['send','출하']].map(([name,label],i)=>`<li>${rasterIcon(name)}<span class="process-step">0${i+1}</span><b>${label}</b></li>`).join('')}</ol>`;
// One presentation, with independent content modules. The old six variants are archived.
const groups=[
 {key:'cover',title:'상품 소개',keys:['hero','summary']},
 {key:'composition',title:'받으실 구성',keys:['6','5']},
 {key:'taste',title:'맛과 크기',keys:['1','2','3','13']},
 {key:'production',title:'품질과 생산 과정',keys:['11','9']},
 {key:'packing',title:'포장과 배송',keys:['10','delivery']},
 {key:'storage',title:'보관 방법',keys:['15']},
 {key:'faq',title:'구매 전 확인',keys:['18','support']},
 {key:'farm',title:'농가 이야기',keys:['story','farmPhotos']},
 {key:'footer',title:'농가 소식',keys:['updates']}
];
const extras={hero:'대표 사진',summary:'상품 요약',story:'농가 소개 문구',farmPhotos:'농가 사진',updates:'소식 안내 문구',delivery:'출고·배송 안내',support:'상품 문제·문의 안내'};
const populated={
 1:item(1,`<p class="lead">${esc(d.flavor)}</p>`),
 2:item(2,`<p>${esc(d.size)}</p>`),
 3:item(3,`<h3>손에 들었을 때</h3>${photo('harvest-hand','손에 든 감귤 · 가상 농가 예시 사진')}<p class="size-example-note">사진 배치 예시이며, 판매 상품의 실제 크기 증빙은 아닙니다.</p>`),
 6:item(6,`<p class="composition">${esc(d.composition)}</p>`),
 9:item(9,`<p>${esc(d.harvest)}</p>${processGraphic()}`),
 10:item(10,photo('tangerine-box','상자 배치 예시 · 실제 출고 증빙 아님'))
};
const draftRows=rows=>`<dl class="draft-rows">${rows.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
const draftPhoto=label=>`<div class="draft-photo">${rasterIcon('photo')}<b>${label}</b><span>실제 사진이 들어갈 자리</span></div>`;
const draftModules={
 '13':draftPhoto('껍질과 과육 단면 사진'),
 '5':`<h3>한 상자에 담기는 개수</h3><p class="draft-count">약 <span>—</span> ~ <span>—</span>개</p><p class="draft-caption">생산자가 확인한 개수 범위</p>`,
 '11':`<h3>품질 확인 기록</h3>${draftRows([['확인 항목','측정·선별 항목'],['측정값과 날짜','확인된 수치 · 측정일'],['근거 자료','실제 측정 사진 또는 기록']])}`,
 delivery:`<h3>언제, 어떻게 받나요?</h3>${draftRows([['출고 예정','생산자가 안내할 출고 시기'],['배송 방법','택배사 · 포장 방식'],['배송 조건','배송비 · 추가 비용 · 제한 지역']])}`,
 '15':`<ol class="draft-steps"><li><b>받은 뒤</b><span>수령 직후 확인할 내용</span></li><li><b>보관할 때</b><span>확인된 보관 장소·조건</span></li><li><b>먹기 전</b><span>상품에 맞는 준비 방법</span></li></ol>`,
 '18':`<h3>자주 묻는 질문</h3><div class="draft-faq"><b>Q. 크기나 외형 차이는 어느 정도인가요?</b><p>생산자가 확인한 허용 범위와 설명</p><b>Q. 어떤 상태일 때 문의하면 되나요?</b><p>상품 상태를 판단할 실제 기준</p></div>`,
 support:`<h3>받은 상품에 문제가 있다면</h3>${draftRows([['문의 방법','연락 채널 · 접수 방법'],['확인 자료','사진 등 접수에 필요한 자료'],['처리 안내','판매자가 정한 교환·환불 절차']])}`
};
const draftModule=key=>`<div class="draft-module" data-draft="${key}"><span class="draft-tag">구성 예시 · 자료 입력 전</span>${draftModules[key]}</div>`;
const keys=groups.flatMap(g=>g.keys);
const defaults=['hero','summary','story','farmPhotos','updates',...Object.keys(populated)];
const storageKey='farmclub.single-detail.modules.v1';
const handStorageKey='farmclub.single-detail.hand-illustration.v1';
const handChoices={photo:'예시 사진',small:'작은 크기',medium:'중간 크기',large:'큰 크기'};
let handChoice='photo';
try{const saved=localStorage.getItem(handStorageKey);if(Object.hasOwn(handChoices,saved))handChoice=saved;}catch{}
const handPicker=()=>`<fieldset class="hand-picker"><legend>크기 표현 선택</legend><div class="hand-options">${Object.entries(handChoices).map(([key,label])=>`<label><input type="radio" name="hand-choice" value="${key}"><img src="${key==='photo'?'./assets/demo/harvest-hand.jpg':`./assets/size-guide/outline-${key}.png`}" alt="" width="88" height="88"><span>${label}</span></label>`).join('')}</div><p>그림의 크기 차이는 표현 예시예요. 상품의 실측 규격과 일치하는지 확인해 주세요.</p></fieldset>`;
function handContent(){
 if(handChoice==='photo')return populated[3];
 return item(3,`<h3>손에 올렸을 때</h3><figure class="hand-illustration"><div class="hand-reference"><img src="./assets/size-guide/outline-${handChoice}.png" alt="손 위의 감귤 · ${handChoices[handChoice]} 설명용 일러스트" width="1254" height="1254"><div class="hand-measure"><span>기준 손 길이</span><b>18<span>cm</span></b><small>손끝~손목<br>비교용 가정</small></div></div><figcaption>크기 설명용 일러스트 · 실제 규격 아님</figcaption></figure>`);
}
let enabled=new Set(defaults);
let storageAvailable=true;
try{
 const saved=JSON.parse(localStorage.getItem(storageKey));
 if(saved?.version===2&&Array.isArray(saved.enabled)&&saved.enabled.every(k=>typeof k==='string'))enabled=new Set(saved.enabled.filter(k=>keys.includes(k)));
}catch{storageAvailable=false;}
const labelFor=key=>extras[key]||definitions[Number(key)-1][0];
const ready=key=>['hero','summary','story','farmPhotos','updates'].includes(key)||Object.hasOwn(populated,key);
const panel=document.querySelector('#modules');
panel.innerHTML=groups.map(g=>`<details class="module-group" open><summary>${g.title}<span data-group-count="${g.key}"></span></summary><label class="group-toggle"><input type="checkbox" data-group="${g.key}">이 구역 전체</label>${g.keys.map(k=>`<label class="module-row"><input type="checkbox" data-module="${k}"><span>${k==='3'?'손 위 크기 표현':labelFor(k)}</span>${ready(k)?'':'<small>자료 필요</small>'}</label>${k==='3'?handPicker():''}`).join('')}</details>`).join('');
const detail=document.querySelector('#detail');
function save(){
 try{localStorage.setItem(storageKey,JSON.stringify({version:2,enabled:[...enabled]}));storageAvailable=true;}catch{storageAvailable=false;}
}
function syncControls(){
 panel.querySelectorAll('[name="hand-choice"]').forEach(el=>el.checked=el.value===handChoice);
 panel.querySelectorAll('[data-module]').forEach(el=>el.checked=enabled.has(el.dataset.module));
 for(const g of groups){
  const count=g.keys.filter(k=>enabled.has(k)).length;
  const el=panel.querySelector(`[data-group="${g.key}"]`);
  el.checked=count===g.keys.length;el.indeterminate=count>0&&count<g.keys.length;
  panel.querySelector(`[data-group-count="${g.key}"]`).textContent=`${count}/${g.keys.length}`;
 }
 document.querySelector('#module-count').textContent=`${enabled.size}개 요소 표시 중`;
 document.querySelector('#save-status').textContent=storageAvailable?'구성 선택은 이 브라우저에 저장돼요.':'이 브라우저에 저장할 수 없어 현재 화면에서만 유지돼요.';
}
function cover(){
 return `<header class="product-cover" id="section-cover">${enabled.has('hero')?`<div class="cover-photo">${photo('basket','감귤 한 바구니')}</div>`:''}<div class="cover-copy">${enabled.has('summary')?`<p class="farm-name">${esc(d.farm)}</p>`:''}<h1>하우스 감귤</h1>${enabled.has('summary')?`<p class="cover-intro">${esc(d.headline)}</p><dl class="cover-facts graphic-facts"><div>${rasterIcon('pin')}<dt>원산지</dt><dd>${esc(d.origin)}</dd></div><div>${rasterIcon('fruit')}<dt>품종</dt><dd>${esc(d.variety)}</dd></div></dl>`:''}</div></header>`;
}
function farm(){
 if(!enabled.has('story')&&!enabled.has('farmPhotos'))return '';
 const story=enabled.has('story');const photos=enabled.has('farmPhotos');
 return `<section class="section farm-section" id="section-farm">${sectionTitle('farm','강씨네 귤밭 이야기')}${story?`<blockquote>${esc(d.story.split('\n\n')[0])}</blockquote>`:''}${photos?photo('greenhouse','농가의 풍경'):''}${story||photos?`<div class="farm-note${story&&photos?' paired':''}">${photos?photo('farmer','밭을 돌보는 손길'):''}${story?`<p>${esc(d.story.split('\n\n')[1])}</p>`:''}</div>`:''}${photos?photo('branch','나무에 열린 감귤'):''}</section>`;
}
function render(){
 let html=cover();const visible=[{key:'cover',title:'상품 소개'}];
 for(const g of groups){
  if(g.key==='cover'||g.key==='footer')continue;
  if(g.key==='farm'){
   const body=farm();if(body){html+=body;visible.push(g);}continue;
  }
  const selected=g.keys.filter(k=>enabled.has(k));
  if(!selected.length)continue;
  html+=`<section class="section section-${g.key}" id="section-${g.key}">${sectionTitle(g.key,g.title)}${selected.map(k=>k==='3'?handContent():populated[k]||draftModule(k)).join('')}</section>`;
  visible.push(g);
 }
 if(enabled.has('updates')){html+=`<footer class="product-footer" id="section-footer"><b>${esc(d.farm)}</b><p>${esc(d.updates)}</p></footer>`;visible.push(groups.at(-1));}
 detail.innerHTML=html;
 document.querySelector('#sections').innerHTML=visible.map(g=>`<a href="#section-${g.key}">${g.title}</a>`).join('');
 document.querySelector('#empty-notice').hidden=enabled.size>0;
 const pending=[...enabled].filter(k=>!ready(k)).length;
 document.querySelector('#pending-notice').hidden=pending===0;
 document.querySelector('#pending-notice').textContent=`${pending}개 항목은 자료 입력 전의 구성 예시로 펼쳐 보여요. 표시된 안내는 실제 판매 정보가 아니에요.`;
 syncControls();
}
panel.addEventListener('change',e=>{
 const input=e.target;
 if(input.matches('[name="hand-choice"]')){
  if(!Object.hasOwn(handChoices,input.value))return;
  handChoice=input.value;enabled.add('3');save();
  try{localStorage.setItem(handStorageKey,handChoice);}catch{storageAvailable=false;}
  render();return;
 }
 if(input.matches('[data-module]')){if(input.checked)enabled.add(input.dataset.module);else enabled.delete(input.dataset.module);}
 else if(input.matches('[data-group]')){for(const k of groups.find(g=>g.key===input.dataset.group).keys){if(input.checked)enabled.add(k);else enabled.delete(k);}}
 else return;
 save();render();
});
document.querySelector('#select-all').addEventListener('click',()=>{enabled=new Set(keys);save();render();});
document.querySelector('#select-none').addEventListener('click',()=>{enabled.clear();save();render();});
document.querySelector('#restore-default').addEventListener('click',()=>{enabled=new Set(defaults);save();render();});
function renderReference(key){
 const r=referenceImages[key];const name=refs[key][0];
 document.querySelector('.reference-pane').scrollTop=0;
 document.querySelector('#reference-notes').innerHTML=`<p><b>참고한 점</b>${esc(r.from)}</p><p><b>이전 비교에서 적용한 점</b>${esc(r.change)}</p>`;
 const link=document.querySelector('#reference-link');link.href=refs[key][1];link.textContent=name+' 원본 ↗';
 const old=document.querySelector('#reference-image');const img=new Image();img.id='reference-image';img.alt=name+' 원본 상세이미지';img.referrerPolicy='no-referrer';
 const error=document.querySelector('#reference-error');error.hidden=true;
 img.addEventListener('error',()=>{if(document.querySelector('#reference-image')!==img)return;img.hidden=true;error.hidden=false;});
 img.src=r.image;old.replaceWith(img);
 const extra=document.querySelector('#reference-extra');extra.replaceChildren();
 if(r.extra){const supplement=new Image();supplement.src=r.extra;supplement.alt=name+' 체크 포인트 구획';supplement.addEventListener('error',()=>{if(!extra.contains(supplement))return;supplement.hidden=true;error.hidden=false;});extra.append(supplement);}
}

document.querySelector('#reference').innerHTML=Object.keys(referenceImages).map(k=>`<option value="${k}">${refs[k][0]}</option>`).join('');
document.querySelector('#reference').value='kurly';
document.querySelector('#reference').addEventListener('change',e=>renderReference(e.target.value));
document.querySelector('#audit-list').innerHTML=definitions.map(([title,key,note],i)=>keys.includes(String(i+1))?`<li><b>${i+1}. ${title}</b><p>${note}</p><a href="${esc(refs[key][1])}" target="_blank" rel="noreferrer">${refs[key][0]} ↗</a></li>`:'').join('');
const board=document.querySelector('#board');
function setView(view){board.dataset.view=view;document.querySelectorAll('.mobile-views button[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));}
document.querySelector('#compare').addEventListener('change',e=>{board.classList.toggle('comparing',e.target.checked);if(!e.target.checked)setView('design');});
document.querySelectorAll('.mobile-views button[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
document.querySelector('#width').addEventListener('change',e=>document.documentElement.style.setProperty('--preview-width',e.target.value+'px'));
const url=new URL(location.href);url.searchParams.delete('template');url.searchParams.delete('graphics');history.replaceState(null,'',url);
render();renderReference('kurly');setView('design');
