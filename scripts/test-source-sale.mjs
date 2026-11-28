// DEV-452 AC-04-8/AC-SRC-11: preview saved private content without applying it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
const ts = createRequire(import.meta.url)('typescript');
function load(state) {
  const exports = {}, calls = [], released = [];
  const api = { isMock: false, sourceAnalysis: { config: async()=>({enabled:true}) }, productWorkspace: { salePreview: async id=>{calls.push(id); return state;} } };
  const code=ts.transpileModule(readFileSync(new URL('../apps/producer/src/lib/sourceSale.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,URL:{revokeObjectURL:u=>released.push(u)},require:id=> {
    if(id==='@farmclub/api')return api;
    if(id==='./sourcePhoto')return {sourcePhotoUrl:async(_,s)=>`blob:${s.id}`};
    throw new Error(`Unexpected dependency ${id}`);
  }});
  return {...exports,calls,released};
}
const state = ()=>({batch:{sources:[{id:'cover'}]},current:true,processingIssues:[],reviewPending:0,draft:{id:'draft',version:3,snapshot:{representativeAssetId:'cover',previewModules:[{id:'hero',texts:[{fieldKey:'name',value:'Saved private title'}],photoAssetIds:['cover'],illustrationId:null}]}}});
test('DEV-452 AC-SRC-11: sales preview uses saved private text and photos without changing public product',async()=>{
  const m=load(state()), product={productId:'p',version:4,photos:['public.jpg'],moduleDetail:{schemaVersion:1,modules:[]}};
  const before=JSON.stringify(product), preview=await m.salePage(product);
  assert.equal(preview.product.moduleDetail.modules[0].texts[0].value,'Saved private title');
  assert.equal(preview.product.photos[0],'blob:cover');
  assert.equal(JSON.stringify(product),before);
  assert.deepEqual(m.calls,['p']);
  assert.equal(m.salePageWarnings(preview.state).length,0);
  preview.release();
  assert.deepEqual(m.released,['blob:cover']);
});
test('DEV-452 AC-04-8: private preview remains available while stale reading and owner checks block submission',async()=>{
  const s=state();s.current=false;s.processingIssues=[{itemId:'failed'}];s.reviewPending=2;
  const m=load(s),preview=await m.salePage({productId:'p',photos:[]});
  assert.equal(preview.product.moduleDetail.modules[0].texts[0].value,'Saved private title');
  const warnings=m.salePageWarnings(preview.state).join(' ');
  assert.match(warnings,/최신/);assert.match(warnings,/읽지 못한/);assert.match(warnings,/2개/);
});

test('DEV-452 AC-SRC-9: long page text height converges and shrinks after editing',()=>{
  const exports={};
  const code=ts.transpileModule(readFileSync(new URL('../apps/producer/src/lib/sourcePageHeight.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{exports});
  let intrinsic=700;
  const el={style:{height:'40px'},scrollTop:15,get scrollHeight(){return Math.max(intrinsic,parseFloat(this.style.height)-2);}};
  for(let i=0;i<100;i++) el.style.height=`${exports.pageTextHeight(el)}px`;
  assert.equal(el.style.height,'702px');assert.equal(el.scrollTop,15);
  intrinsic=30;el.style.height=`${exports.pageTextHeight(el)}px`;
  assert.equal(el.style.height,'40px');
});
