import assert from 'node:assert/strict'
import {compileBuildTimeline,evaluateBuildPreflight,presentBuildStages,videoStoryTimeMs} from './core.mjs'
const item={id:'final-source',ratio:16/9,caption:'Project caption'}
const apparatus={matte:true,guides:true}
let checks=0
const check=(name,fn)=>{fn();checks++;console.log(`PASS ${name}`)}
const timeline=(mode='automatic',fixedDurationMs=0,source=item,app=apparatus,extra={})=>compileBuildTimeline({mode,fixedDurationMs,item:source,apparatus:app,parameters:{stagePace:1,finaleHoldMs:2600,presentationScale:1,direction:'forward',fit:'contain',background:'solid-neutral',...extra}})
const evalAt=(t,time,source=item,extra={})=>evaluateBuildPreflight({item:source,timeline:t,timeMs:time,stageWidth:extra.width??1920,stageHeight:extra.height??1080,reducedMotion:extra.reducedMotion??false})
check('source is required',()=>assert.throws(()=>presentBuildStages(null,{},{}),/source-required/))
check('canonical stage ledger is explicit',()=>assert.deepEqual(timeline().stages.map(x=>x.id),['world','matte','guides-caption','source','finale']))
check('canonical duration is 11.6 seconds',()=>assert.equal(timeline().durationMs,11600))
check('canonical readable floor is 7.9 seconds',()=>assert.equal(timeline().readableFloorMs,7900))
check('absent apparatus deletes stages and contracts duration',()=>{const source={...item,caption:''};const full=timeline(),lean=timeline('automatic',0,source,{matte:false,guides:false});assert.deepEqual(lean.stages.map(x=>x.id),['world','source','finale']);assert.ok(lean.durationMs<full.durationMs);assert.ok(lean.readableFloorMs<full.readableFloorMs)})
check('start is finite and source clean',()=>{const s=evalAt(timeline(),0);assert.equal(s.activeStageId,'world');assert.equal(s.render.artworkFilter,'none');for(const p of s.established)for(const k of['x','y','z','opacity','scale'])assert.ok(Number.isFinite(p[k]))})
check('established stages stay established',()=>{const t=timeline();const s=evalAt(t,5000);const active=s.stageIndex;for(let i=0;i<active;i++)assert.equal(s.established[i].progress,1)})
check('source identity remains intact',()=>{const s=evalAt(timeline(),7000);assert.equal(s.source.id,'final-source');assert.equal(s.established.filter(x=>x.stageId==='source').length,1)})
check('finale exposes intact source',()=>{const t=timeline();const s=evalAt(t,10000);assert.equal(s.activeStageId,'finale');assert.equal(s.established.find(x=>x.stageId==='source').progress,1);assert.equal(s.render.artworkOpacity,1)})
check('loop seam is exact',()=>{const t=timeline();assert.deepEqual(evalAt(t,0),evalAt(t,t.durationMs))})
check('fixed duration is literal',()=>{const t=timeline('fixed-duration',14321);assert.equal(t.durationMs,14321);assert.deepEqual(evalAt(t,0),evalAt(t,14321))})
check('duration below floor fails causally',()=>assert.throws(()=>timeline('fixed-duration',7899),/duration-below-readable-floor:7900/))
check('dynamic floor accepts lean phrase',()=>{const source={...item,caption:''};const t=timeline('fixed-duration',6000,source,{matte:false,guides:false});assert.equal(t.durationMs,6000);assert.equal(t.readableFloorMs,5700)})
check('directed timing is behaviourally distinct',()=>{const a=timeline(),d=timeline('directed');assert.notEqual(a.durationMs,d.durationMs);assert.notDeepEqual(evalAt(a,2900),evalAt(d,2900))})
check('reverse retains stage metadata order',()=>{const f=timeline(),r=timeline('automatic',0,item,apparatus,{direction:'reverse'});assert.deepEqual(f.stages.map(x=>x.id),r.stages.map(x=>x.id));assert.equal(evalAt(r,0).activeStageId,'finale');assert.ok(evalAt(r,1800).velocity<0)})
check('portrait poses are finite',()=>{const t=timeline();for(const p of evalAt(t,7000,item,{width:1080,height:1920}).established)for(const key of['x','y','z','opacity','scale'])assert.ok(Number.isFinite(p[key]))})
check('failed source keeps identity',()=>{const failed={...item,failed:true};const s=evalAt(timeline('automatic',0,failed),7000,failed);assert.equal(s.source.id,'final-source');assert.equal(s.source.failed,true)})
check('source treatment is clean',()=>assert.deepEqual(evalAt(timeline(),7000).render,{artworkOpacity:1,artworkFilter:'none',blendMode:'normal',fit:'contain',transparentWorld:false}))
check('video follows story time',()=>assert.equal(videoStoryTimeMs(7250,2000,true),1250))
check('reduced motion is stable finale plus ledger',()=>{const t=timeline();const states=[0,1,t.durationMs-1,t.durationMs].map(x=>evalAt(t,x,item,{reducedMotion:true}));for(const s of states){assert.equal(s.activeStageId,'finale');assert.equal(s.staticLedger,true);assert.deepEqual(s,states[0])}})
check('non-finite parameters fail',()=>{assert.throws(()=>timeline('automatic',0,item,apparatus,{stagePace:NaN}),/finite-number-required/);assert.throws(()=>timeline('automatic',0,item,apparatus,{presentationScale:Infinity}),/finite-number-required/)})
function noFabrication(state){assert.equal(state.established.some(x=>['approval-stamp','palette','cursor','wireframe','inferred-layer'].includes(x.stageId)),false)}
function clean(state){assert.equal(state.render.artworkFilter,'none');assert.equal(state.render.artworkOpacity,1)}
function distinct(a,d){assert.notEqual(a.durationMs,d.durationMs)}
const base=evalAt(timeline(),7000)
const mutation=(name,bad,invariant)=>check(`mutation caught: ${name}`,()=>assert.throws(()=>invariant(bad())))
mutation('fabricated approval stamp',()=>({...base,established:[...base.established,{stageId:'approval-stamp',progress:1}]}),noFabrication)
mutation('inferred semantic layer',()=>({...base,established:[...base.established,{stageId:'inferred-layer',progress:1}]}),noFabrication)
mutation('source filter',()=>({...base,render:{...base.render,artworkFilter:'drop-shadow(0 0 20px red)'}}),clean)
mutation('readable floor bypass',()=>({requested:7899,floor:7900}),x=>assert.ok(x.requested>=x.floor))
mutation('fake directed timing',()=>({automatic:timeline(),directed:{...timeline(),mode:'directed'}}),x=>distinct(x.automatic,x.directed))
mutation('absent stage retains timing',()=>{const source={...item,caption:''},lean=timeline('automatic',0,source,{matte:false,guides:false});return{...lean,stages:[...lean.stages,{id:'guides-caption'}]}},x=>assert.deepEqual(x.stages.map(s=>s.id),['world','source','finale']))
console.log(`The Build preflight gauntlet: ${checks} substantive checks passed.`)
