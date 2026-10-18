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
 namdo:{image:'https://qozywruyowzn3844493.gcdn.gov-ntruss.com/common/13cae665-07ba-4e61-b81e-69b8d949bd24',from:'강한 표지 뒤에 크기 비교와 중량별 구성을 집중해서 보여줍니다.',change:'낱개 중량과 박스 중량을 구분하고, 5kg·10kg은 같은 표 안에서 비교합니다.'},
 lotte:{image:'https://kiwi4965.speedgabia.com/enjoy/AI/AI050_detail.jpg',from:'흰 바탕의 중앙 제목 → 짧은 구분선 → 중앙 문단 → 전체 폭 사진이 이어집니다.',change:'같은 중앙 축과 짧은 구분선을 적용했습니다. 농가 문단 다음에 전경·작업 사진을 전체 폭으로 두고 초록 표지·비대칭 배열을 없앴습니다.'},
 tomato:{image:'https://cdn.imweb.me/upload/S202103245a73dbc9cf936/5876a8fd5b3bd.jpg',from:'구성의 핵심을 큰 제목과 품종별 사진으로 설명합니다. 구성·보관 구획만 확인한 자료입니다.',change:'주황 중앙 제목·큰 중량 숫자·넓은 여백과 갈색 번호형 보관 안내를 적용했습니다. 품종별 사진과 실제 안내가 없는 자리는 미입력으로 남깁니다.'}
};
Object.assign(referenceImages,{
 dalcom:{image:refs.dalcom[1],from:'감귤의 특징을 번호와 확대 사진, 작업 사진으로 설명한 구획입니다.',change:'같은 제목 크기를 반복하기보다 중요한 설명과 실용 안내의 대비를 비교합니다. 당도·선별 주장은 옮기지 않았습니다.'},
 sae:{image:'https://saenong.com/web/upload/NNEditor/20250811/acbacecb536e95239261d2219ba77198.webp',from:'소개 문단 뒤 원물 사진, 특징, 보관·활용 안내를 구획합니다.',change:'새농 사과 시안과 함께 사진 앞뒤의 설명 길이와 배경 전환을 비교할 수 있습니다.'},
 kurly:{image:'./assets/references/kurly-excerpt.jpg',extra:'./assets/references/kurly-points.jpg',from:'상품 소개와 체크 포인트의 실제 화면 캡처입니다. 중앙 상품명과 가로선 뒤에 왼쪽 본문, 두 열 요약이 이어집니다.',change:'정보 요약형은 가로선 제목과 원산지·품종 요약을 적용하고, 품질 자료/표기 정보를 나란히 묶습니다. 컬리의 주장은 사용하지 않았습니다.'},
 ssari:{image:'./assets/references/ssari-excerpt.jpg',from:'상품 정보 구획의 실제 화면 캡처입니다. 큰 사진 다음 왼쪽 색선 제목과 짧은 항목별 설명을 배치합니다.',change:'안내 중심형은 색선 제목·짧은 행·테두리 표를 적용하고, 구성과 포장/보관 안내를 앞쪽에 모았습니다.'},
 apple:{image:'https://saenong.com/web/upload/NNEditor/20261006/08501e324b728b748db3eb72f5d1a7bd.webp',from:'산지명과 큰 상품명, 특징 문단, 밭 사진을 회색 바탕에서 교차합니다. 전체 상세 이미지입니다.',change:'산지 소개형은 농가명과 중앙 설명을 앞세우고 특징 → 농가 → 생산 순으로 사진을 연결합니다. 강조색은 팜클럽 주황을 씁니다.'}
});

const definitions=[
 ['맛·향·과즙·식감','oasis','맛은 기존 원문 사용. 향·과즙·식감 설명은 추가 자료 필요.'],['판매 규격','oasis','실제 선별 규격과 사진 필요.'],['기준 물체와 크기 비교','namdo','자 또는 기준 물체와 함께 촬영한 실제 사진 필요.'],['낱개·박스 중량','namdo','박스 중량은 기존 예시. 낱개 중량은 실측 필요.'],['중량별 옵션 비교','gs','기존 시안의 5kg·10kg 사용. 수량·포장 차이는 미입력.'],['수량 기준·편차','gs','중량 우선인지 수량 확정인지 농가 기준 필요.'],['품종별 외형','tomato','현재 하우스 감귤만 있음. 다른 품종 사진을 만들지 않음.'],['혼합 구성 규칙','tomato','혼합 상품에만 적용. 감귤에 적용 미확정.'],['수확·선별·포장 과정','lotte','기존 원문과 예시 사진 사용. 세부 선별·포장 방식은 미입력.'],['배송 상자·내부 구성','lotte','기존 박스 사진은 배치 예시이며 실제 출고 증빙 아님.'],['선별 방식·품질 기록','dalcom','실측값·측정일·측정 대상·인증 원본 없음.'],['먹는 시점','dalcom','해당 품종에 대해 확인한 안내 필요.'],['껍질·과육 단면','sae','실제 단면 사진 없음. 생성하거나 다른 상품에서 가져오지 않음.'],['활용 메뉴','sae','사용자 제공 메뉴와 실제 사진 필요.'],['소분·보관','dill','해당 상품에 맞는 보관 조건 필요.'],['사용 시점·팁','dill','사용자가 제공한 조리·활용 안내 필요.'],['개봉 전·후 보관','powder','실제 상품 상태에 맞는 전후 보관 안내 필요.'],['외형 변화 FAQ','powder','정상 특성과 문제가 있는 상태를 구분할 사진·답변 필요.'],['가공 과정·이유','barley','가공식품용 구성 예시. 감귤에 적용 미확정.'],['원재료·함량·인증','barley','라벨·원본 인증 자료 필요. 감귤에 사실 추가 없음.'],['조리 전·후 상태','rice','조리 상품용 구성 예시. 해당 상품의 실제 사진 필요.'],['조리 주의점','rice','시간·온도·도구 등 검증된 안내 필요.'],['옵션별 맛 비교','curry','중량 옵션에 맛 차이를 만들지 않음. 맛이 다른 옵션에 적용.'],['취향별 선택','curry','실제 품종·맛 차이가 있을 때만 설명. 현재 비교 자료 없음.']
];
const photo=(name,caption)=>`<figure class="product-photo"><img src="./assets/demo/${name}.jpg" alt="${esc(caption)}" decoding="async"><figcaption>${esc(caption)}</figcaption></figure>`;
const missing=(label='미입력')=>`<span class="missing">${label}</span>`;
const photoSlot=label=>`<div class="photo-slot" role="img" aria-label="${esc(label)} 사진 미등록"><span>${label}</span><small>사진 미등록</small></div>`;
const table=(headers,rows)=>`<table><thead><tr>${headers.map(s=>`<th scope="col">${s}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((s,i)=>i===0?`<th scope="row">${s}</th>`:`<td>${s}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const lineRows=rows=>`<dl class="information-list">${rows.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
const item=(n,content)=>`<div class="item item-${n}" data-item="${n}">${content}</div>`;
const minor=(title,body)=>`<h3>${title}</h3>${body}`;
const conditional='<span class="conditional">해당 상품 적용 전 · 구성 예시</span>';
const items={
1:item(1,`<p class="lead">${esc(d.flavor)}</p>${lineRows([['향·과즙·식감',missing()]])}`),
2:item(2,`<p>${esc(d.size)}</p>${lineRows([['판매 규격',missing()]])}`),
3:item(3,minor('실물 크기 비교',photoSlot('기준 물체와 함께 촬영한 감귤'))),
4:item(4,`<div class="weight-pair"><div><span>낱개 중량</span><strong>— <small>g</small></strong>${missing('실측 미입력')}</div><div><span>한 박스</span><strong>5 <small>kg</small></strong><small>기존 예시 구성</small></div></div>`),
5:item(5,table(['중량 옵션','5<span class="unit">kg</span>','10<span class="unit">kg</span>'],[['낱개 크기',missing(),missing()],['예상 수량',missing(),missing()],['포장 차이',missing(),missing()]])),
6:item(6,`<p class="composition">${esc(d.composition)}</p>${lineRows([['수량 기준',missing()],['자연 편차',missing()]])}`),
7:item(7,minor('품종',`<div class="variety-line"><strong>${esc(d.variety)}</strong><span>기존 예시</span></div>${lineRows([['다른 품종',missing()]])}`)),
8:item(8,minor('혼합 구성',`${conditional}${lineRows([['품종 범위·선택 방법',missing()]])}`)),
9:item(9,`${photo('harvest-hand','감귤을 살펴보는 손길')}<p>${esc(d.harvest)}</p><ol class="process"><li><b>수확</b><span>농가 원문</span></li><li><b>선별</b>${missing()}</li><li><b>포장</b>${missing()}</li></ol>`),
10:item(10,`${photo('tangerine-box','상자 배치 예시 · 실제 출고 증빙 아님')}${lineRows([['출고 상자·완충 포장',missing()],['동봉 구성',missing()]])}`),
11:item(11,`<div class="evidence"><h3>품질 확인 기록</h3><p class="evidence-empty">등록된 품질 자료가 없습니다.</p>${lineRows([['선별 기준',missing()],['측정값·측정일',missing()],['측정 대상·방법',missing()]])}</div>`),
12:item(12,minor('먹는 시점',lineRows([['상품 상태별 안내',missing()]]))),
13:item(13,minor('껍질과 과육',photoSlot('실제 감귤 단면'))),
14:item(14,minor('활용 메뉴',`<div class="paired-slots">${photoSlot('활용 사진')}${photoSlot('활용 사진')}</div>${lineRows([['메뉴·설명',missing()]])}`)),
15:item(15,`<ol class="care-list"><li><b>소분 방법</b>${missing()}</li><li><b>용기·보관 환경</b>${missing()}</li><li><b>꺼내 먹을 때</b>${missing()}</li></ol>`),
16:item(16,minor('사용할 때',lineRows([['활용 시점·방법',missing()]]))),
17:item(17,`<div class="storage-pair"><div><h3>개봉 전</h3>${missing('보관 안내 미입력')}</div><div><h3>개봉 후</h3>${missing('보관 안내 미입력')}</div></div>`),
18:item(18,`<div class="faq"><h3>색이나 모양이 다른가요?</h3>${missing('농가 답변 미입력')}<h3>받은 상품에 문제가 있나요?</h3>${missing('문의 절차 미입력')}</div>`),
19:item(19,minor('가공 과정',`${conditional}<ol class="process"><li><b>원료 준비</b>${missing()}</li><li><b>가공</b>${missing()}</li><li><b>완성</b>${missing()}</li></ol>`)),
20:item(20,minor('원재료·인증',lineRows([['원재료·함량',missing()],['인증번호·유효기간',missing()],['인증 적용 대상',missing()]]))),
21:item(21,minor('조리 전과 후',`${conditional}<div class="paired-slots">${photoSlot('조리 전')}${photoSlot('조리 후')}</div>`)),
22:item(22,minor('조리 주의점',lineRows([['해동·조리 도구',missing()],['시간·온도',missing()]]))),
23:item(23,minor('옵션별 맛 비교',`${conditional}${table(['비교 기준','옵션 A','옵션 B'],[['맛·향',missing(),missing()],['식감',missing(),missing()]])}`)),
24:item(24,minor('취향별 선택',`<p class="compact-note">품종·맛이 다른 옵션의 비교 구성</p>${lineRows([['옵션별 선택 안내',missing()]])}`))
};
const groups={
 taste:{title:'맛과 과육',body:items[1]+items[13]},
 size:{title:'크기와 중량',body:items[2]+items[4]+items[3]},
 options:{title:'옵션과 구성',body:items[5]+items[6]+items[7]+items[8]+items[23]+items[24]},
 production:{title:'생산 과정과 품질',body:items[9]+items[11]+items[19]+items[20]},
 packing:{title:'포장 안내',body:items[10]},
 usage:{title:'활용과 조리',body:items[12]+items[14]+items[16]+items[21]+items[22]},
 storage:{title:'보관 방법',body:items[15]+items[17]},
 faq:{title:'자주 묻는 질문',body:items[18]}
};
const variants={
 product:{name:'상품 중심형',description:'상품 사진과 핵심 정보부터. 크기와 옵션을 확인한 뒤 생산·포장 과정을 살펴봅니다.',reference:'oasis',order:['taste','size','options','production','farm','packing','usage','storage','faq']},
 photo:{name:'사진 중심형',description:'밭의 전경과 작업 사진을 따라갑니다. 농가 이야기와 생산 과정을 앞에 두었습니다.',reference:'lotte',order:['farm','production','taste','size','options','packing','usage','storage','faq']},
 comparison:{name:'구성 비교형',description:'옵션과 품종을 먼저 비교합니다. 짧은 표지 다음에 중량·수량·맛의 차이를 모았습니다.',reference:'tomato',order:['options','size','taste','production','packing','farm','usage','storage','faq']},
 editorial:{name:'정보 요약형',description:'중앙 상품명 아래 얇은 구분선. 핵심 사실과 품질 자료를 묶고 사진 옆에 설명을 붙입니다.',reference:'kurly',order:['taste','production','size','options','usage','packing','storage','farm','faq']},
 guide:{name:'안내 중심형',description:'구성과 받는 모습을 먼저 확인합니다. 왼쪽 색선 제목, 짧은 안내 행과 표로 정보를 촘촘하게 읽습니다.',reference:'ssari',order:['options','packing','storage','usage','taste','size','production','farm','faq']},
 origin:{name:'산지 소개형',description:'농가명과 상품 특징을 앞세웁니다. 회색 바탕의 설명과 큰 밭 사진을 교차해 산지를 소개합니다.',reference:'apple',order:['taste','farm','production','size','options','packing','usage','storage','faq']}
};
const detail=document.querySelector('#detail');
function farm(key){
 const opening=`<section class="section farm-section" id="section-farm"><h2>강씨네 귤밭 이야기</h2>`;
 const quote=`<blockquote>${esc(d.story.split('\n\n')[0])}</blockquote>`;
 const paragraph=`<p>${esc(d.story.split('\n\n')[1])}</p>`;
 // Lotte places its centered story above each full-width photograph.
 if(key==='photo')return opening+quote+`<div class="farm-pictures">${photo('greenhouse','농가의 풍경')}</div>`+paragraph+`<div class="farm-pictures">${photo('farmer','밭을 돌보는 손길')}</div>`+photo('branch','나무에 열린 감귤')+'</section>';
 if(key==='origin')return opening+quote+photo('greenhouse','농가의 풍경')+paragraph+`<div class="farm-pictures">${photo('farmer','밭을 돌보는 손길')}${photo('branch','나무에 열린 감귤')}</div></section>`;
 if(key==='editorial'||key==='guide')return opening+quote+photo('greenhouse','농가의 풍경')+`<div class="farm-note">${photo('farmer','밭을 돌보는 손길')}${paragraph}</div>`+photo('branch','나무에 열린 감귤')+'</section>';
 return opening+`<div class="farm-pictures">${photo('greenhouse','농가의 풍경')}${photo('farmer','밭을 돌보는 손길')}</div>`+quote+paragraph+photo('branch','나무에 열린 감귤')+'</section>';
}
function cover(){return `<header class="product-cover"><div class="cover-photo">${photo('basket','감귤 한 바구니')}</div><div class="cover-copy"><p class="farm-name">${esc(d.farm)}</p><h1>하우스 감귤</h1><p class="cover-intro">${esc(d.headline)}</p><dl class="cover-facts"><div><dt>원산지</dt><dd>${esc(d.origin)}</dd></div><div><dt>품종</dt><dd>${esc(d.variety)}</dd></div></dl></div></header>`;}
// Keep numeric option headings on one line, including longer source values.
function fitOptionHeadings(){
 for(const cell of detail.querySelectorAll('.item-5 thead th:not(:first-child)')){
  cell.style.fontSize='';
  const available=cell.clientWidth-10;
  const range=document.createRange();range.selectNodeContents(cell);
  const width=range.getBoundingClientRect().width;
  if(width>available&&available>0)cell.style.fontSize=(parseFloat(getComputedStyle(cell).fontSize)*available/width)+'px';
 }
}
new ResizeObserver(fitOptionHeadings).observe(detail);
window.addEventListener('resize',fitOptionHeadings);
const requested=new URLSearchParams(location.search).get('template');
let active=Object.hasOwn(variants,requested)?requested:'product';
function groupBody(key,group){
 if(key==='editorial'&&group==='production')return `<div class="fact-pair">${items[11]}${items[20]}</div>`+items[9]+items[19];
 if(key==='guide'&&group==='options')return items[6]+items[5]+`<div class="option-notes">${items[7]}${items[8]}</div>`+items[23]+items[24];
 return groups[group].body;
}
function render(key){
 const url=new URL(location.href);if(key==='product')url.searchParams.delete('template');else url.searchParams.set('template',key);history.replaceState(null,'',url);
 active=key;const v=variants[key];detail.className=key;
 detail.innerHTML=cover()+v.order.map(k=>k==='farm'?farm(key):`<section id="section-${k}" class="section section-${k}"><h2>${groups[k].title}</h2>${groupBody(key,k)}</section>`).join('')+`<footer class="product-footer"><b>${esc(d.farm)}</b><p>${esc(d.updates)}</p></footer>`;
 document.querySelector('#design-index').textContent=`시안 0${Object.keys(variants).indexOf(key)+1}`;
 document.querySelector('#design-name').textContent=v.name;
 document.querySelector('#design-description').textContent=v.description;
 document.querySelector('#sections').innerHTML=v.order.map(k=>`<a href="#section-${k}">${k==='farm'?'농가 이야기':groups[k].title}</a>`).join('');
 document.querySelectorAll('[data-template]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.template===key)));
 document.querySelector('#reference').value=v.reference;renderReference(v.reference);
 fitOptionHeadings();document.fonts.ready.then(fitOptionHeadings);
}
function renderReference(key){
 const r=referenceImages[key];const name=refs[key][0];
 document.querySelector('.reference-pane').scrollTop=0;
 document.querySelector('#reference-notes').innerHTML=`<p><b>참고한 점</b>${esc(r.from)}</p><p><b>이번 시안</b>${esc(r.change)}</p>`;
 const link=document.querySelector('#reference-link');link.href=refs[key][1];link.textContent=name+' 원본 ↗';
 const old=document.querySelector('#reference-image');const img=new Image();img.id='reference-image';img.alt=name+' 원본 상세이미지';img.referrerPolicy='no-referrer';
 const error=document.querySelector('#reference-error');error.hidden=true;
 img.addEventListener('error',()=>{if(document.querySelector('#reference-image')!==img)return;img.hidden=true;error.hidden=false;});
 img.src=r.image;old.replaceWith(img);
 const extra=document.querySelector('#reference-extra');extra.replaceChildren();
 if(r.extra){const supplement=new Image();supplement.src=r.extra;supplement.alt=name+' 체크 포인트 구획';supplement.addEventListener('error',()=>{if(!extra.contains(supplement))return;supplement.hidden=true;error.hidden=false;});extra.append(supplement);}
}
document.querySelector('#templates').innerHTML=Object.entries(variants).map(([key,v],i)=>`<button data-template="${key}" aria-pressed="${i===0}"><span>0${i+1}</span><div><b>${v.name}</b><small>${['상품 → 규격 → 과정','농가 → 과정 → 상품','옵션 → 규격 → 상품','특징 → 품질 → 활용','구성 → 포장 → 안내','특징 → 산지 → 과정'][i]}</small></div></button>`).join('');
document.querySelectorAll('[data-template]').forEach(b=>b.addEventListener('click',()=>{const hash=location.hash;render(b.dataset.template);if(hash.startsWith('#section-'))document.getElementById(hash.slice(1))?.scrollIntoView({block:'start'});}));
document.querySelector('#reference').innerHTML=Object.keys(referenceImages).map(k=>`<option value="${k}">${refs[k][0]}</option>`).join('');
document.querySelector('#reference').addEventListener('change',e=>renderReference(e.target.value));
document.querySelector('#audit-list').innerHTML=definitions.map(([title,key,note],i)=>`<li><b>${i+1}. ${title}</b><p>${note}</p><a href="${esc(refs[key][1])}" target="_blank" rel="noreferrer">${refs[key][0]} ↗</a></li>`).join('');
const board=document.querySelector('#board');
document.querySelector('#compare').addEventListener('change',e=>{board.classList.toggle('comparing',e.target.checked);if(!e.target.checked)setView('design');});
function setView(view){board.dataset.view=view;document.querySelectorAll('.mobile-views button[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));}
document.querySelectorAll('.mobile-views button[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
document.querySelector('#width').addEventListener('change',e=>document.documentElement.style.setProperty('--preview-width',e.target.value+'px'));
render(active);setView('design');
