const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const sources = Object.fromEntries(['reserved-shipping.js','delivery-info.js','purchase-benefit-dustuff.js'].map(name=>[name,fs.readFileSync(path.join(__dirname,'..',name),'utf8')]));
const item = (size) => `<div class="dropdown-item" data-size="${size}"><a class="_requireOption"><div class="tw-flex"><div><span class="margin-bottom-lg">${size}</span></div><button class="btn-restock">재입고 알림</button></div></a></div>`;
const markup = (options={}) => `<div class="prod-detail-section--delivery">배송</div><div id="prod_options">${options.sizeOnly?'':`<div><label data-opttype="color" data-title="Black"><input type="radio" name="color" checked></label><label data-opttype="color" data-title="White"><input type="radio" name="color"></label></div>`}${options.colorOnly?'':`<div class="_form_parent">${options.mobile?'':'<div class="option_title">Size (필수)*</div>'}<div class="form-select-wrap"><button class="dropdown-toggle">Size</button><div class="dropdown-menu">${item('M')}${item('L')}</div></div></div>`}</div>`;
const rule = (type, message, overrides={}) => ({ enabled:true,domain:'example.com',productId:'1',type,color:'Black',size:'M',message,...overrides });
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function page(t, rules, options={}, order=['reserved-shipping.js']) {
  const dom=new JSDOM(options.html||markup(options),{url:options.url||'https://example.com/shop_view?idx=1',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  dom.window.fetch=options.fetch|| (async()=>({ok:true,json:async()=>rules}));
  for(const file of order){dom.window.eval(sources[file]);await pause(240);}
  return {w:dom.window,d:dom.window.document};
}
const summary = d=>d.querySelector('[data-sheet-notice="reserved-summary"] .prod-detail-section__content')?.textContent;
test('긴 배송 요약은 같은 문구를 묶고 모든 옵션을 펼쳐 볼 수 있다',async t=>{
  const rules=Array.from({length:10},(_,i)=>rule('예약배송',i<8?'주문 후 15일':'10/8 이후 순차 출고',{size:'S'+i}));
  const {d,w}=await page(t,rules);
  const details=d.querySelector('[data-sheet-notice="reserved-summary"] details');assert.ok(details);assert.equal(details.open,false);
  const content=details.querySelector('div').textContent;
  for(let i=0;i<10;i++)assert.ok(content.includes('Black(S'+i+')'));
  assert.equal(content.match(/주문 후 15일/g).length,1);
  details.open=true;w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}));await pause(50);assert.equal(details.open,true);
});
test('일반 배송 문장/별표를 보존하고 출고 문장을 중복하지 않는다',async t=>{
  const {d}=await page(t,[rule('예약배송','* 주문일로부터 15일 후 순차 출고')]);assert.equal(summary(d),'Black(M) * 주문일로부터 15일 후 순차 출고');
});
test('날짜 전용 요약은 유지하되 혼합 문장과 추가 조건은 그대로 표시한다',async t=>{
  const {d}=await page(t,[rule('예약배송','10/8 이후 순차 출고'),rule('예약배송','10/9 이후 순차 출고',{size:'L'})]);assert.equal(summary(d),'Black(M) 10월 8일 / Black(L) 10월 9일 이후 순차 출고됩니다.');
  const p=await page(t,[rule('예약배송','10/8 이후 순차 출고 (변동 가능)'),rule('예약배송','주문 후 15일',{size:'L'})]);assert.equal(summary(p.d),'Black(M) 10/8 이후 순차 출고 (변동 가능) / Black(L) 주문 후 15일');
});
for(const order of [['delivery-info.js','reserved-shipping.js'],['reserved-shipping.js','delivery-info.js']])test('두 기능 로드 순서와 무관하게 배송 문구와 옵션 요약 공존: '+order.join(' → '),async t=>{
  const {d}=await page(t,[rule('배송정보','직접 쓴 배송 안내'),rule('예약배송','10/8')],{},order);assert.equal(d.querySelector('[data-sheet-notice="delivery"] .prod-detail-section__content').textContent,'직접 쓴 배송 안내');assert.ok(summary(d).includes('10월 8일'));assert.equal(d.querySelectorAll('[data-sheet-notice]').length,2);
});
test('옵션문구는 HTML 실행 없이 원문/줄바꿈을 표시하고 배송 배지나 요약을 만들지 않는다',async t=>{
  const text='* 한정 수량\n<img src=x onerror=alert(1)> & 안내';const {d}=await page(t,[rule('옵션문구',text)]);assert.equal(d.querySelector('.reserved-shipping-date').textContent,text);assert.equal(d.querySelectorAll('.reserved-shipping-badge,img,[data-sheet-notice]').length,0);
});
test('예약배송과 자유 문구를 함께 표시하며 정확한 옵션이 전체 규칙보다 우선한다',async t=>{
  const {d}=await page(t,[rule('옵션문구','공통',{color:'all',size:'all'}),rule('옵션문구','M 전용'),rule('예약배송','10/8')]);assert.deepEqual([...d.querySelector('[data-size="M"]').querySelectorAll('.reserved-shipping-date')].map(x=>x.textContent),['10/8','M 전용']);assert.equal(d.querySelector('[data-size="L"] .reserved-shipping-date').textContent,'공통');
});
test('색상 변경 시 이전 문구 제거 및 새 문구 표시, 문구 증식 없음',async t=>{
  const {d,w}=await page(t,[rule('옵션문구','검정 안내'),rule('옵션문구','흰색 안내',{color:'White',size:'L'})]);const white=d.querySelector('[data-title="White"] input');white.checked=true;white.dispatchEvent(new w.Event('change',{bubbles:true}));await pause(150);assert.equal(d.querySelector('[data-size="M"] .reserved-shipping-text'),null);assert.equal(d.querySelector('[data-size="L"] .reserved-shipping-date').textContent,'흰색 안내');assert.equal(d.querySelectorAll('.reserved-shipping-text').length,1);
});
test('사이즈 전용, 컬러 전용, 모바일 선택 이후에도 문구 유지',async t=>{
  const onlySize=await page(t,[rule('옵션문구','사이즈 안내',{color:''})],{sizeOnly:true});assert.equal(onlySize.d.querySelector('.reserved-shipping-date').textContent,'사이즈 안내');
  const onlyColor=await page(t,[rule('옵션문구','컬러 안내',{size:''})],{colorOnly:true});assert.equal(onlyColor.d.querySelector('.reserved-color-only').textContent,'컬러 안내');
  const mobile=await page(t,[rule('옵션문구','모바일 안내')],{mobile:true});mobile.d.querySelector('.dropdown-toggle').textContent='M';await pause(50);assert.equal(mobile.d.querySelector('.reserved-shipping-date').textContent,'모바일 안내');
});
test('다른 상품, 비활성 규칙은 표시하지 않는다',async t=>{
  const {d}=await page(t,[rule('옵션문구','꺼짐',{enabled:false}),rule('예약배송','다른 상품',{productId:'2'})]);assert.equal(d.querySelectorAll('.reserved-shipping-text,[data-sheet-notice]').length,0);
});

const benefitMarkup = '<div class="_item_detail_wrap"><h1 class="view_tit">Autograph T-shirt <span class="ns-icon">SALE</span></h1><div class="prod-detail-section prod-detail-section--delivery">배송</div></div><div id="prod_detail_body"></div>';
test('함께 설치한 기능은 API를 한 번만 조회하고 중복 설치도 같은 결과를 낸다',async t=>{
  let calls=0;const rules=[rule('배송정보','배송 안내'),rule('옵션문구','옵션 안내')];
  const {d}=await page(t,rules,{fetch:async()=>{calls++;return{ok:true,json:async()=>rules};}},['delivery-info.js','reserved-shipping.js','delivery-info.js','reserved-shipping.js']);
  assert.equal(calls,1);assert.equal(d.querySelectorAll('[data-sheet-notice="delivery"]').length,1);assert.equal(d.querySelectorAll('.reserved-shipping-text').length,1);
});
test('배송정보는 기본 도메인에서도 표시하고 단독 설치로 줄바꿈을 보존한다',async t=>{
  const {d}=await page(t,[rule('배송정보','첫 줄\n둘째 줄',{domain:'nvsbf.com'})],{url:'https://neverseenbefore.imweb.me/shop_view?idx=1'},['delivery-info.js']);
  const content=d.querySelector('[data-sheet-notice="delivery"] .prod-detail-section__content');assert.ok(content);assert.equal(content.textContent,'첫 줄\n둘째 줄');assert.equal(content.style.whiteSpace,'pre-wrap');
});
test('잘못된 행 하나가 같은 응답의 정상 옵션 문구를 막지 않는다',async t=>{
  const {d}=await page(t,[null,rule('옵션문구','정상 문구')]);assert.equal(d.querySelector('.reserved-shipping-date')?.textContent,'정상 문구');
});
test('세트상품 링크는 기본 도메인을 지원하고 여러 행의 입력 순서를 유지한다',async t=>{
  const {d}=await page(t,[rule('구매혜택','할인 받고 {상품명} 셋업으로 구매하러 가기→',{domain:'dustuff.co.kr',setupProductId:'2',setupTitle:'Autograph T-shirt / Switchback Pants SET',discount:'14%'}),rule('구매혜택','두 번째 링크',{domain:'dustuff.co.kr',setupProductId:'3'})],{html:benefitMarkup,url:'https://dustystuff.imweb.me/shop_view?idx=1'},['purchase-benefit-dustuff.js']);
  const links=[...d.querySelectorAll('.benefit-injected a')];assert.equal(links.length,2);assert.equal(links[0].textContent,'14% 할인 받고 Switchback Pants 셋업으로 구매하러 가기→');assert.equal(new URL(links[0].href).searchParams.get('idx'),'2');assert.equal(links[1].textContent,'두 번째 링크');
});
test('세트 구성명과 현재 상품명이 다르면 상대 상품을 잘못 추측하지 않는다',async t=>{
  const {d}=await page(t,[rule('구매혜택','{상품명} 구매하기',{setupProductId:'2',setupTitle:'Different Top / Pants SET'})],{html:benefitMarkup},['purchase-benefit-dustuff.js']);
  assert.equal(d.querySelector('.benefit-injected a')?.textContent,'Different Top / Pants SET 구매하기');
});
test('세트상품은 할인율이 없으면 할인 표현을 제거하고 HTML을 실행하지 않는다',async t=>{
  const {d}=await page(t,[rule('구매혜택','할인 받고 <img src=x onerror=alert(1)> {상품명}',{setupProductId:'2',setupTitle:'Autograph T-shirt / Pants SET'})],{html:benefitMarkup},['purchase-benefit-dustuff.js']);
  assert.equal(d.querySelector('.benefit-injected a')?.textContent,'<img src=x onerror=alert(1)> Pants');assert.equal(d.querySelectorAll('.benefit-injected img').length,0);
});
test('상세 본문이 없어도 상품 정보 영역이 있으면 세트상품 안내를 표시한다',async t=>{
  const {d}=await page(t,[rule('구매혜택','세트상품 보기',{setupProductId:'2'})],{html:benefitMarkup.replace('<div id="prod_detail_body"></div>','')},['purchase-benefit-dustuff.js']);assert.equal(d.querySelector('.benefit-injected a')?.textContent,'세트상품 보기');
});
test('네트워크 오류는 한 번만 재시도하고 정상 응답 후 안내를 복구한다',async t=>{
  let attempts=0;const rules=[rule('옵션문구','복구됨')];const {d}=await page(t,rules,{fetch:async()=>{attempts++;if(attempts===1)throw Error('temporary');return{ok:true,json:async()=>rules};}});
  await pause(100);assert.equal(attempts,2);assert.equal(d.querySelector('.reserved-shipping-date')?.textContent,'복구됨');
});
test('상품 옵션 영역이 통째로 교체되어도 다시 표시하며 무관한 리뷰 영역은 건드리지 않는다',async t=>{
  const {d}=await page(t,[rule('옵션문구','다시 표시')]);const old=d.querySelector('#prod_options');const holder=d.createElement('div');holder.innerHTML=markup();old.replaceWith(holder.querySelector('#prod_options'));await pause(60);assert.equal(d.querySelector('.reserved-shipping-date')?.textContent,'다시 표시');
  const notice=d.querySelector('.reserved-shipping-text');const reviews=d.createElement('section');reviews.textContent='리뷰가 추가됨';d.body.append(reviews);await pause(30);assert.equal(d.querySelector('.reserved-shipping-text'),notice);
});
test('화면 요소 대기는 제한 시간이 지나면 종료한다',async t=>{
  const {w}=await page(t,[]);const start=Date.now();assert.equal(await w.__IMWEB_PRODUCT_NOTICES_V1__.waitFor('.does-not-exist',20),null);assert.ok(Date.now()-start<500);
});
test('서버가 조회 불가로 판정한 세트상품은 오래된 할인이나 링크를 표시하지 않는다',async t=>{
  const {d}=await page(t,[rule('구매혜택','세트상품 구매',{setupProductId:'2',setupTitle:'Old SET',discount:'20%',setupAvailable:false})],{html:benefitMarkup},['purchase-benefit-dustuff.js']);assert.equal(d.querySelectorAll('.benefit-injected').length,0);
});
test('뒤로 가기로 복원된 페이지에서도 옵션 영역 교체를 계속 감지한다',async t=>{
  const {d,w}=await page(t,[rule('옵션문구','복원 안내')]);w.dispatchEvent(new w.PageTransitionEvent('pagehide',{persisted:true}));w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}));const holder=d.createElement('div');holder.innerHTML=markup();d.querySelector('#prod_options').replaceWith(holder.querySelector('#prod_options'));await pause(60);assert.equal(d.querySelector('.reserved-shipping-date')?.textContent,'복원 안내');
});
