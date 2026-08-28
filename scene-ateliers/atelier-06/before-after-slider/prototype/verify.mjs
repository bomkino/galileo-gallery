import assert from 'node:assert/strict'
import {compileComparisonTimeline,evaluateComparison,videoStoryTimeMs} from './core.mjs'
const items=[{id:'before-source',role:'before',ratio:16/9},{id:'after-source',role:'after',ratio:16/9}]
let checks=0
const check=(name,fn)=>{fn();checks++;console.log(`PASS ${name}`)}
const timeline=(mode='automatic',fixedDurationMs=0,extra={})=>compileComparisonTimeline({mode,fixedDurationMs,parameters:{travelMs:1200,holdMs:650,orientation:'vertical',startSide:'before',fit:'contain',...extra}})
const evalAt=(t,time,extra={})=>evaluateComparison({items,timeline:t,timeMs:time,...extra})
check('requires two sources',()=>{const t=timeline();assert.throws(()=>evaluateComparison({items:[items[0]],timeline:t,timeMs:0}),/insufficient-input/);assert.throws(()=>evaluateComparison({items:[...items,{id:'third',role:'after',ratio:1}],timeline:t,timeMs:0}),/ambiguous-extra-input/)})
check('roles remain stable',()=>{const s=evalAt(timeline(),1000);assert.equal(s.sources.before.id,'before-source');assert.equal(s.sources.after.id,'after-source')})
check('start is before',()=>assert.equal(evalAt(timeline(),0).reveal,0))
check('outward travel is continuous',()=>{const t=timeline();const a=evalAt(t,700),b=evalAt(t,1000),c=evalAt(t,1500);assert.ok(a.reveal<=b.reveal&&b.reveal<=c.reveal)})
check('end hold has zero velocity',()=>{const t=timeline();const s=evalAt(t,2000);assert.equal(s.reveal,1);assert.equal(s.velocity,0)})
check('return velocity is negative',()=>{const t=timeline();const s=evalAt(t,2800);assert.ok(s.reveal>0&&s.reveal<1);assert.ok(s.velocity<0)})
check('loop seam is exact',()=>{const t=timeline();assert.deepEqual(evalAt(t,0),evalAt(t,t.durationMs))})
check('fixed duration is exact',()=>{const t=timeline('fixed-duration',7300);assert.equal(t.durationMs,7300);assert.deepEqual(evalAt(t,0),evalAt(t,7300))})
check('directed differs from automatic',()=>{const a=timeline(),d=timeline('directed');assert.notEqual(a.durationMs,d.durationMs);assert.notDeepEqual(evalAt(a,2400),evalAt(d,2400))})
check('start-after inverts reveal but not roles',()=>{const t=timeline('automatic',0,{startSide:'after'});const s=evalAt(t,0);assert.equal(s.reveal,1);assert.equal(s.sources.before.id,'before-source');assert.equal(s.sources.after.id,'after-source')})
check('horizontal changes clip axis',()=>{const t=timeline('automatic',0,{orientation:'horizontal'});const s=evalAt(t,1200);assert.equal(s.orientation,'horizontal');assert.equal(s.divider.axis,'y');assert.equal(s.clip.right,0)})
check('reduced motion is stable half split',()=>{const t=timeline();for(const time of[0,1,t.durationMs-1,t.durationMs])assert.equal(evalAt(t,time,{reducedMotion:true}).reveal,.5)})
check('failed side preserves role identity',()=>{const failed=[{...items[0],failed:true},items[1]];const s=evaluateComparison({items:failed,timeline:timeline(),timeMs:0});assert.equal(s.sources.before.id,'before-source');assert.equal(s.sources.before.failed,true);assert.equal(s.sources.after.id,'after-source')})
check('source treatment is clean and opaque',()=>assert.deepEqual(evalAt(timeline(),0).render,{artworkOpacity:1,artworkFilter:'none',blendMode:'normal',fit:'contain',opaqueOutput:true}))
check('video uses story time',()=>{assert.equal(videoStoryTimeMs(7250,2000,true),1250);assert.equal(videoStoryTimeMs(7250,3000,true),1250)})
check('non-finite parameters fail',()=>{assert.throws(()=>compileComparisonTimeline({mode:'automatic',parameters:{travelMs:NaN}}),/finite-number-required/);assert.throws(()=>compileComparisonTimeline({mode:'automatic',parameters:{dividerWidth:Infinity}}),/finite-number-required/)})
check('fixed duration floor is enforced',()=>assert.throws(()=>timeline('fixed-duration',300),/finite-number-required/))
function clean(s){assert.equal(s.render.artworkFilter,'none');assert.equal(s.render.artworkOpacity,1)}
function distinct(a,d){assert.notEqual(a.durationMs,d.durationMs)}
function returns(s){assert.ok(s.velocity<0)}
function exact(a,b){assert.deepEqual(a,b)}
const base=evalAt(timeline(),1000)
const mutation=(name,bad,invariant)=>check(`mutation caught: ${name}`,()=>assert.throws(()=>invariant(bad())))
mutation('source tint',()=>({...base,render:{...base.render,artworkFilter:'contrast(1.2)'}}),clean)
mutation('fake directed timing',()=>({a:timeline(),d:{...timeline(),mode:'directed'}}),x=>distinct(x.a,x.d))
mutation('broken return velocity',()=>({...evalAt(timeline(),2800),velocity:Math.abs(evalAt(timeline(),2800).velocity)}),returns)
mutation('hard seam reset',()=>({a:evalAt(timeline(),0),b:{...evalAt(timeline(),0),reveal:1}}),x=>exact(x.a,x.b))
mutation('role swap',()=>({...base,sources:{before:base.sources.after,after:base.sources.before}}),x=>{assert.equal(x.sources.before.id,'before-source')})
console.log(`Before / After gauntlet: ${checks} substantive checks passed.`)
