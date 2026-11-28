import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const ts=createRequire(import.meta.url)('typescript');
const code=ts.transpileModule(readFileSync(new URL('../apps/producer/src/lib/PageReviewActions.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function mount(changes={}){
 const exports={},state=[],calls=[];let cursor=0,edits=0;
 const jsx=(type,props)=>({type,props});
 vm.runInNewContext(code,{exports,require:id=>{
  if(id==='react')return{useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>state[i]=v]}};
  if(id==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'Fragment'};
  if(id==='react-native')return{View:'View',TextInput:'TextInput'};
  if(id==='@farmclub/ui')return{Button:'Button',T:'T'};
  throw Error(id);
 }});
 const item={bindingHash:'a'.repeat(64),pending:true,canKeep:true,originalValue:'Full source paragraph',pages:[5,6],messages:['Check'],requiresNote:false,decision:null,...changes};
 let value=item.originalValue;
 function nodes(n){return !n?[]:Array.isArray(n)?n.flatMap(nodes):typeof n==='object'?[n,...nodes(n.props?.children)]:[]}
 function render(){cursor=0;return nodes(exports.PageReviewActions({item,value,busy:false,onAction:(...a)=>calls.push(a),onEdit:()=>edits++}))}
 function button(label){const b=render().find(n=>n.type==='Button'&&n.props.label===label);assert.ok(b,label);return b.props}
 return{render,button,calls,item,change:v=>value=v,edits:()=>edits};
}
test('DEV-452 AC-SRC-11: producer can keep, edit, omit and reopen a passage',()=>{
 const m=mount();m.button('확인했어요').onPress();m.button('직접 수정').onPress();
 m.change('Corrected paragraph');m.button('수정 내용으로 확인').onPress();m.button('본문에서 제외').onPress();
 assert.deepEqual(m.calls,[['KEEP',''],['EDIT',''],['OMIT','']]);assert.equal(m.edits(),1);
 m.item.pending=false;m.button('검토 되돌리기').onPress();assert.equal(m.calls.at(-1)[0],'REOPEN');
});
test('DEV-452 AC-SRC-5: price check needs a note and preserves the entered explanation',()=>{
 const m=mount({requiresNote:true});assert.equal(m.button('확인했어요').disabled,true);
 m.render().find(n=>n.type==='TextInput').props.onChangeText('Current settings verified');
 assert.equal(m.button('확인했어요').disabled,false);m.button('확인했어요').onPress();
 assert.deepEqual(m.calls,[['KEEP','Current settings verified']]);
});
test('DEV-452 AC-SRC-5: restricted source offers correction or exclusion and full original context',()=>{
 const m=mount({canKeep:false});assert.ok(!m.render().some(n=>n.type==='Button'&&n.props.label==='확인했어요'));
 m.button('원문과 비교').onPress();assert.ok(m.render().some(n=>n.props?.children==='Full source paragraph'));
 m.button('본문에서 제외').onPress();assert.equal(m.calls[0][0],'OMIT');
});
