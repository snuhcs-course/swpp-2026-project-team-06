/** DEV-463: local-only actual shared renderer for automatically planned fixtures. */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,copyFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getSourceStoryDesign} from '../packages/ui/src/sourceStoryDesign.ts';
const root=fileURLToPath(new URL('../',import.meta.url));
const [mode,...args]=process.argv.slice(2);
const value=name=>{const i=args.indexOf(name);return i<0?null:args[i+1]};
const kind=value('--kind')??'automatic';
if(!['automatic','copy'].includes(kind))throw Error('Unknown preview kind');
const slug=kind==='copy'?'copy-design-local':'automatic-design-local';
if(!['prepare','start'].includes(mode)||!value('--run'))throw Error('prepare|start --run PRIVATE_RUN [--port 8095]');
const run=await realpath(value('--run'));
const records=JSON.parse(await readFile(path.join(run,'records.json'),'utf8'));
const route=path.join(root,'apps/consumer/src/app',slug);
const assets=path.join(root,'apps/consumer/public/__automatic_design');
const marker='.dev463-owned';
async function own(dir){try{await mkdir(dir);await writeFile(path.join(dir,marker),'DEV-463 local-only\n');await writeFile(path.join(dir,'.gitignore'),'*\n')}catch(e){if(e.code!=='EEXIST')throw e;if(await readFile(path.join(dir,marker),'utf8')!=='DEV-463 local-only\n')throw Error('Unowned preview directory')}}
const fixtures={},copies=[];
for(const record of records){
 if(record.status!=='COMPILED_REQUIRES_TYPESCRIPT_VALIDATION')continue;
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(record.sourceId))throw Error('Invalid source id');
 const fixture=JSON.parse(await readFile(path.join(run,record.sourceId,'fixture.json'),'utf8'));
 if(fixture.provenance?.selection!=='AUTOMATIC_VISION_PLAN'||fixture.provenance?.sourceInput!=='ORIGINAL_RASTER_NO_CURATED_COORDINATES_OR_LAYOUT')throw Error('Not an automatic source plan');
 if(kind==='copy'&&!fixture.provenance?.sourceCopy)throw Error('Missing copy validation provenance');
 const design=getSourceStoryDesign(fixture.content.modules,fixture.design);
 if(!design)throw Error('Automatic plan rejected by shared TypeScript validator: '+record.sourceId);
 const expected=new Set(Object.values(design.media).map(m=>m.uri));
 for(const a of fixture.localAssets){
  if(!/^[a-zA-Z0-9_-]+\.png$/.test(a.name)||!expected.delete('/__automatic_design/'+a.name))throw Error('Unknown or duplicate asset');
  const source=await realpath(a.path);if(!source.startsWith(run+path.sep))throw Error('Asset outside private run');
  const bytes=await readFile(source);if(createHash('sha256').update(bytes).digest('hex')!==a.sha256)throw Error('Crop hash mismatch');copies.push({source,name:a.name});
 }
 if(expected.size)throw Error('Missing automatic crop');
 fixtures[record.sourceId]={content:fixture.content,design};
}
if(!Object.keys(fixtures).length)throw Error('No valid automatically planned fixture');
await own(route);await own(assets);
for(const c of copies)await copyFile(c.source,path.join(assets,c.name));
await writeFile(path.join(route,'fixtures.json'),JSON.stringify(fixtures,null,2)+'\n');
await writeFile(path.join(route,'index.tsx'),`import {ScrollView,View,Text,Pressable} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {ModuleStory} from '@farmclub/ui';
import fixtures from './fixtures.json';
export default function AutomaticDesignLocal(){
 const params=useLocalSearchParams<{source?:string;mode?:string}>(),router=useRouter();
 const ids=Object.keys(fixtures);const key=(params.source&&ids.includes(params.source)?params.source:ids[0]) as keyof typeof fixtures;
 const fixture=fixtures[key];let content:Parameters<typeof ModuleStory>[0]['content']=fixture.content;
 let design:unknown=fixture.design;
 if(params.mode==='default')design=undefined;
 if(params.mode==='hidden')content={...content,hiddenSectionIds:['taste']};
 if(params.mode==='empty')content={modules:[],hiddenSectionIds:[]};
 return <ScrollView style={{flex:1,backgroundColor:'#E8E2D8'}}><View style={{width:'100%',maxWidth:480,alignSelf:'center'}}>
 <View style={{padding:16,backgroundColor:'#FFF6E9',gap:8}}><Text style={{fontSize:14,lineHeight:20,color:'#493B2D'}}>${kind==='copy'?'Source-grounded copy experiment · fixed images and layout · human review pending':'Automatic visual-planning experiment · frozen text · bounded palette · human review pending'}</Text>
 {ids.map(id=><Pressable key={id} onPress={()=>router.setParams({source:id})} style={{padding:12,borderWidth:1,borderColor:'#65584A'}}><Text style={{fontSize:14,color:'#29251F'}}>{id===key?'✓ ':''}{id}</Text></Pressable>)}</View>
 <ModuleStory content={content} design={design}/></View></ScrollView>;
}
`);
console.log(JSON.stringify({status:kind==='copy'?'VALIDATED_COPY_LOCAL_PREVIEW':'VALIDATED_AUTOMATIC_LOCAL_PREVIEW',sources:Object.keys(fixtures),assets:copies.length,url:'/'+slug}));
if(mode==='start'){
 const port=Number(value('--port')??(kind==='copy'?8097:8095));if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
 const child=spawn(process.execPath,[path.join(root,'node_modules/expo/bin/cli'),'start','--web','--host','localhost','--port',String(port)],{cwd:path.join(root,'apps/consumer'),stdio:'inherit',env:{...process.env,CI:'1',EXPO_OFFLINE:'1',EXPO_NO_TELEMETRY:'1',EXPO_PUBLIC_API_MOCK:'0',EXPO_PUBLIC_API_URL:'http://127.0.0.1:1',EXPO_PUBLIC_CONSUMER_URL:'http://localhost:'+port,REACT_NATIVE_PACKAGER_HOSTNAME:'127.0.0.1'}});
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
 child.once('error',e=>{console.error(e.message);process.exitCode=1});child.once('exit',code=>{process.exitCode=code??0});
}
