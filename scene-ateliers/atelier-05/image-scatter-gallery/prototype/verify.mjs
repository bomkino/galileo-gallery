import assert from "node:assert/strict"
import { sceneMeta, canonicalTimes, makeFixture, defaultControls, compileTimeline, evaluateScene, sourceVideoTimeSeconds } from "./evaluator.mjs"
const base = defaultControls()
const state = (fixture,time,options={}) => { const items=makeFixture(fixture); const controls={...base,...(options.controls??{})}; const timeline=compileTimeline({mode:options.mode??"automatic",itemCount:items.length,controls,direction:options.direction??"forward"}); return evaluateScene({items,controls,timeline,timeMs:time*timeline.durationMs,width:options.width??1920,height:options.height??1080,reducedMotion:options.reducedMotion??false,debug:false,selectedIndex:options.selectedIndex??0}) }
for (const fixture of ["one","two","recommended","bounded-many","mixed-failed"]) {
  const start=state(fixture,0), end=state(fixture,1)
  assert.deepEqual(start.cards.map(c=>c.id),end.cards.map(c=>c.id))
  for (let i=0;i<start.cards.length;i+=1) { assert.ok(Math.hypot(start.cards[i].x-end.cards[i].x,start.cards[i].y-end.cards[i].y)<1e-7); assert.equal(start.cards[i].visible,end.cards[i].visible); assert.equal(start.cards[i].routeId,end.cards[i].routeId); assert.equal(start.cards[i].artworkOpacity,1); assert.equal(start.cards[i].artworkFilter,"none"); assert.equal(start.cards[i].blendMode,"normal") }
}
const one=state("one",.5); assert.equal(one.cards.filter(c=>c.visible).length,1); assert.ok(Math.hypot(one.cards[0].fieldX-960,one.cards[0].fieldY-540)<1e-8)
const two=state("two",.5); const tv=two.cards.filter(c=>c.visible); assert.ok(tv[0].fieldX<960&&tv[1].fieldX>960)
const many=state("bounded-many",.5); assert.equal(many.cards.length,24); assert.ok(many.cards.filter(c=>c.visible).length<=12); assert.equal(new Set(many.cards.map(c=>c.routeId)).size,24)
for (const time of canonicalTimes) { const s=state("recommended",time); const exclusion=s.negativeSpace; for (const card of s.cards.filter(c=>c.visible)) { const d=Math.hypot((card.fieldX-exclusion.x)/exclusion.rx,(card.fieldY-exclusion.y)/exclusion.ry); assert.ok(d>=1.1,"stable field centres must preserve negative space") } }
const arcs=state("recommended",.12,{controls:{routeCharacter:"arcs"}}), hooks=state("recommended",.12,{controls:{routeCharacter:"hooks"}}); assert.notDeepEqual(arcs.cards.map(c=>[c.x,c.y]),hooks.cards.map(c=>[c.x,c.y]))
const low=state("recommended",.49,{controls:{energy:20,focusLift:0}}), high=state("recommended",.49,{controls:{energy:100,focusLift:70}}); assert.notDeepEqual(low.cards.map(c=>[c.x,c.y]),high.cards.map(c=>[c.x,c.y])); assert.ok(Math.max(...high.cards.map(c=>c.lift))>=Math.max(...low.cards.map(c=>c.lift)))
const reducedA=state("recommended",.2,{reducedMotion:true,selectedIndex:4}), reducedB=state("recommended",.7,{reducedMotion:true,selectedIndex:4}); assert.deepEqual(reducedA.cards.map(c=>[c.x,c.y,c.rotation,c.visible]),reducedB.cards.map(c=>[c.x,c.y,c.rotation,c.visible]))
const forward=state("recommended",.27), reverse=state("recommended",.73,{direction:"reverse"}); for(let i=0;i<forward.cards.length;i+=1) assert.ok(Math.hypot(forward.cards[i].x-reverse.cards[i].x,forward.cards[i].y-reverse.cards[i].y)<1e-6)
assert.ok(Math.abs(sourceVideoTimeSeconds(7000,6.4,true)-.6)<1e-12)
for(let frame=0;frame<2000;frame+=1){const s=state("bounded-many",frame/2000);assert.equal(s.cards.length,24);assert.ok(s.cards.filter(c=>c.visible).length<=12)}
console.log(JSON.stringify({sceneId:sceneMeta.id,result:"pass",checks:["exact seam","owned routes","stable negative space","one/two/many","bounded cohorts","causal controls","reduced motion","reverse retrace","source-video story time","bounded 2,000-frame observation"]},null,2))
