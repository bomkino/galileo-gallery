import assert from 'node:assert/strict'
import {compileAnatomyTimeline,evaluateSlideAnatomy,presentPlanes,videoStoryTimeMs} from './core.mjs'
const baseItem={id:'source-slide',ratio:16/9,caption:'Project caption'}
const apparatus={worldBacking:true,matte:true,guides:true}
let checks=0
const check=(name,fn)=>{fn();checks++;console.log(`PASS ${name}`)}
const timeline=(mode='automatic',item=baseItem,app=apparatus,fixedDurationMs=0,extra={})=>compileAnatomyTimeline({mode,item,apparatus:app,fixedDurationMs,parameters:{separation:.14,viewAngleDeg:7,openMs:900,holdMs:1400,closeMs:900,direction:'forward',fit:'contain',...extra}})
const evalAt=(t,time,item=baseItem,extra={})=>evaluateSlideAnatomy({item,timeline:t,timeMs:time,stageWidth:extra.width??1920,stageHeight:extra.height??1080,reducedMotion:extra.reducedMotion??false})
check('source is required',()=>assert.throws(()=>presentPlanes(null,{}),/source-required/))
check('flat source remains one source plane',()=>{const planes=presentPlanes(baseItem,apparatus);assert.equal(planes.filter(x=>x.kind==='source').length,1);assert.equal(planes.find(x=>x.kind==='source').sourceId,'source-slide')})
check('only explicit apparatus exists',()=>assert.deepEqual(presentPlanes({...baseItem,caption:''},{worldBacking:false,matte:false,guides:false}).map(x=>x.id),['source']))
check('empty caption removes plane and duration',()=>{const empty={...baseItem,caption:''};const withCaption=timeline('automatic',baseItem),without=timeline('automatic',empty);assert.equal(without.planes.some(x=>x.id==='caption'),false);assert.ok(without.durationMs<withCaption.durationMs)})
check('closed start',()=>{const t=timeline();const s=evalAt(t,0);assert.equal(s.openness,0);assert.equal(s.state,'opening')})
check('opening is monotonic',()=>{const t=timeline();const values=[0,200,450,700,899].map(x=>evalAt(t,x).openness);assert.deepEqual(values,[...values].sort((a,b)=>a-b))})
check('open hold is settled',()=>{const t=timeline();const s=evalAt(t,1300);assert.equal(s.openness,1);assert.equal(s.velocity,0);assert.equal(s.state,'open')})
check('closing velocity is negative',()=>{const t=timeline();const s=evalAt(t,t.durationMs-450);assert.ok(s.velocity<0);assert.ok(s.openness>0&&s.openness<1)})
check('return path is exact inverse',()=>{const t=timeline();const outward=evalAt(t,450),closing=evalAt(t,t.durationMs-450);assert.equal(outward.openness,closing.openness);for(let i=0;i<outward.planes.length;i++)assert.deepEqual(outward.planes[i],closing.planes[i])})
check('loop seam is exact',()=>{const t=timeline();assert.deepEqual(evalAt(t,0),evalAt(t,t.durationMs))})
check('fixed duration is exact',()=>{const t=timeline('fixed-duration',baseItem,apparatus,6800);assert.equal(t.durationMs,6800);assert.deepEqual(evalAt(t,0),evalAt(t,6800))})
check('directed is behaviourally distinct',()=>{const a=timeline(),d=timeline('directed');assert.notEqual(a.durationMs,d.durationMs);assert.notDeepEqual(evalAt(a,1600),evalAt(d,1600))})
check('reverse preserves plane order',()=>{const f=timeline(),r=timeline('automatic',baseItem,apparatus,0,{direction:'reverse'});assert.deepEqual(evalAt(f,0).planes.map(x=>x.id),evalAt(r,0).planes.map(x=>x.id));assert.equal(evalAt(r,0).openness,1)})
check('portrait poses remain finite',()=>{const t=timeline();for(const p of evalAt(t,900,baseItem,{width:1080,height:1920}).planes)for(const key of['x','y','z','rotateX','rotateY','opacity'])assert.ok(Number.isFinite(p[key]))})
check('failed source keeps identity',()=>{const item={...baseItem,failed:true};const s=evalAt(timeline('automatic',item),100,item);assert.equal(s.source.id,'source-slide');assert.equal(s.source.failed,true)})
check('source treatment is clean',()=>assert.deepEqual(evalAt(timeline(),100).render,{artworkOpacity:1,artworkFilter:'none',blendMode:'normal',fit:'contain',transparentWorld:true}))
check('video uses story time',()=>assert.equal(videoStoryTimeMs(7250,2000,true),1250))
check('reduced motion is stable open anatomy',()=>{const t=timeline();const states=[0,1,t.durationMs-1,t.durationMs].map(x=>evalAt(t,x,baseItem,{reducedMotion:true}));for(const s of states){assert.equal(s.openness,1);assert.equal(s.state,'open');assert.deepEqual(s,states[0])}})
check('non-finite parameters fail',()=>{assert.throws(()=>timeline('automatic',baseItem,apparatus,0,{separation:NaN}),/finite-number-required/);assert.throws(()=>timeline('automatic',baseItem,apparatus,0,{viewAngleDeg:Infinity}),/finite-number-required/)})
function oneSource(state){assert.equal(state.planes.filter(x=>x.kind==='source').length,1)}
function clean(state){assert.equal(state.render.artworkFilter,'none')}
function exact(a,b){assert.deepEqual(a,b)}
const base=evalAt(timeline(),450)
const mutation=(name,bad,invariant)=>check(`mutation caught: ${name}`,()=>assert.throws(()=>invariant(bad())))
mutation('semantic layer inferred',()=>({...base,planes:[...base.planes,{id:'inferred-headline',kind:'source'}]}),oneSource)
mutation('source filter added',()=>({...base,render:{...base.render,artworkFilter:'brightness(.8)'}}),clean)
mutation('closing path corruption',()=>{const t=timeline(),a=evalAt(t,450),b=evalAt(t,t.durationMs-450);b.planes=b.planes.map((p,i)=>i? p:{...p,x:p.x+1});return[a,b]},x=>exact(x[0],x[1]))
mutation('empty caption ghost plane',()=>{const empty={...baseItem,caption:''},t=timeline('automatic',empty);return{...evalAt(t,0,empty),planes:[...evalAt(t,0,empty).planes,{id:'caption',kind:'apparatus'}]}},x=>assert.equal(x.planes.some(p=>p.id==='caption'),false))
mutation('fake directed timing',()=>({a:timeline(),d:{...timeline(),mode:'directed'}}),x=>assert.notEqual(x.a.durationMs,x.d.durationMs))
console.log(`Slide Anatomy gauntlet: ${checks} substantive checks passed.`)
