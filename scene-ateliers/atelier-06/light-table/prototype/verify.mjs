import assert from 'node:assert/strict'
import {compileLightTableTimeline,evaluateLightTable,rectanglesOverlap,videoStoryTimeMs} from './core.mjs'

const items=(count)=>Array.from({length:count},(_,index)=>({id:`item-${String(index+1).padStart(2,'0')}`,ratio:[16/9,4/5,1,9/16][index%4],caption:index%2?`Caption ${index+1}`:'',failed:index===9}))
const params={travelMs:700,holdMs:900,inspectionScale:1.08,direction:'forward',fit:'contain',captions:'active-only'}
let checks=0
const check=(name,fn)=>{fn();checks+=1;process.stdout.write(`PASS ${name}\n`)}
const timeline=(count,mode='automatic',fixedDurationMs=0,direction='forward')=>compileLightTableTimeline({mode,itemCount:count,parameters:{...params,direction},fixedDurationMs})
const evaluate=(count,t,timeMs,extra={})=>evaluateLightTable({items:items(count),timeline:t,timeMs,stageWidth:extra.width??1920,stageHeight:extra.height??1080,reducedMotion:extra.reducedMotion??false})

check('one item remains one item',()=>{const t=timeline(1);const state=evaluate(1,t,0);assert.equal(state.cells.length,1);assert.equal(state.activeIndex,0)})
check('two item pair preserves identity',()=>{const t=timeline(2);assert.deepEqual(evaluate(2,t,0).cells.map(x=>x.id),['item-01','item-02'])})
check('ordinary six has no resting collisions',()=>{const t=timeline(6);const cells=evaluate(6,t,2000).cells;for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++)assert.equal(rectanglesOverlap(cells[i],cells[j],1),false)})
check('dense twenty-four has no resting collisions',()=>{const t=timeline(24);const cells=evaluate(24,t,18850).cells;assert.equal(cells.length,24);for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++)assert.equal(rectanglesOverlap(cells[i],cells[j],1),false)})
check('portrait reduces columns without reordering',()=>{const t=timeline(6);const state=evaluate(6,t,3200,{width:1080,height:1920});assert.deepEqual(state.cells.map(x=>x.id),items(6).map(x=>x.id));assert.ok(new Set(state.cells.map(x=>Math.round(x.x))).size<=3)})
check('automatic loop seam is exact',()=>{const t=timeline(6);const a=evaluate(6,t,0),b=evaluate(6,t,t.durationMs);assert.deepEqual({phase:a.phase,active:a.activeIndex,loupe:a.loupe,cells:a.cells},{phase:b.phase,active:b.activeIndex,loupe:b.loupe,cells:b.cells})})
check('fixed duration is literal',()=>{const t=timeline(6,'fixed-duration',12345);assert.equal(t.durationMs,12345);assert.equal(evaluate(6,t,12345).phase,0)})
check('directed timing is behaviourally distinct',()=>{const a=timeline(6),d=timeline(6,'directed');assert.notEqual(a.durationMs,d.durationMs);const at=evaluate(6,a,4800),dt=evaluate(6,d,4800);assert.notDeepEqual({segment:at.segmentId,active:at.activeIndex,phase:at.phase},{segment:dt.segmentId,active:dt.activeIndex,phase:dt.phase})})
check('reverse negates velocity',()=>{const f=evaluate(6,timeline(6),2400),r=evaluate(6,timeline(6,'automatic',0,'reverse'),2400);assert.equal(Math.sign(f.velocity),1);assert.equal(Math.sign(r.velocity),-1)})
check('reduced motion is stable across seam',()=>{const t=timeline(6);const states=[0,1,t.durationMs-1,t.durationMs].map(time=>evaluate(6,t,time,{reducedMotion:true}));for(const state of states)assert.deepEqual(state,states[0])})
check('failed media keeps identity and slot',()=>{const t=timeline(12);const cell=evaluate(12,t,4000).cells[9];assert.equal(cell.id,'item-10');assert.equal(cell.failed,true)})
check('source treatment is clean',()=>{const t=timeline(6);assert.deepEqual(evaluate(6,t,0).render,{artworkOpacity:1,artworkFilter:'none',blendMode:'normal',fit:'contain'})})
check('video follows story time',()=>{assert.equal(videoStoryTimeMs(7250,2000,true),1250);assert.equal(videoStoryTimeMs(7250,2000,false),2000)})
check('non-finite input fails',()=>{assert.throws(()=>compileLightTableTimeline({mode:'automatic',itemCount:6,parameters:{holdMs:NaN}}),/finite-number-required/);assert.throws(()=>compileLightTableTimeline({mode:'automatic',itemCount:6,parameters:{inspectionScale:Infinity}}),/finite-number-required/)})
check('invalid ratios fail',()=>{const t=timeline(1);assert.throws(()=>evaluateLightTable({items:[{id:'bad',ratio:0}],timeline:t,timeMs:0,stageWidth:1920,stageHeight:1080}),/finite-number-required/)})

function assertClean(render){assert.equal(render.artworkOpacity,1);assert.equal(render.artworkFilter,'none');assert.equal(render.blendMode,'normal')}
function assertDirectedDistinct(automatic,directed){assert.notEqual(automatic.durationMs,directed.durationMs)}
function assertReverse(forward,reverse){assert.equal(Math.sign(forward.velocity),-Math.sign(reverse.velocity))}
function assertStableReduced(states){for(const state of states.slice(1))assert.deepEqual(state,states[0])}
function mutation(name,makeBad,invariant){check(`mutation caught: ${name}`,()=>assert.throws(()=>invariant(makeBad()))) }
const base=evaluate(6,timeline(6),2200)
mutation('source tint/filter',()=>({...base,render:{...base.render,artworkFilter:'sepia(1)'}}),bad=>assertClean(bad.render))
mutation('fake directed mode',()=>({automatic:timeline(6),directed:{...timeline(6),mode:'directed'}}),bad=>assertDirectedDistinct(bad.automatic,bad.directed))
mutation('broken reversal',()=>({forward:base,reverse:{...base,velocity:base.velocity}}),bad=>assertReverse(bad.forward,bad.reverse))
mutation('reduced-motion seam jump',()=>{const stable=evaluate(6,timeline(6),0,{reducedMotion:true});return [stable,{...stable,activeIndex:stable.activeIndex+1}]},bad=>assertStableReduced(bad))
mutation('return-path corruption',()=>{const a=evaluate(6,timeline(6),0);const b={...a,loupe:{...a.loupe,x:a.loupe.x+1}};return [a,b]},bad=>assert.deepEqual(bad[0],bad[1]))

console.log(`Light Table gauntlet: ${checks} substantive checks passed.`)
