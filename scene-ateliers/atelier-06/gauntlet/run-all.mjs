import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {compileLightTableTimeline,evaluateLightTable} from '../light-table/prototype/core.mjs'
import {compileComparisonTimeline,evaluateComparison} from '../before-after-slider/prototype/core.mjs'
import {compileAnatomyTimeline,evaluateSlideAnatomy} from '../slide-anatomy-object/prototype/core.mjs'
import {compileBuildTimeline,evaluateBuildPreflight} from '../the-build/prototype/core.mjs'

const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
let checks=0
const check=(name,fn)=>{fn();checks++;console.log(`PASS ${name}`)}
const six=Array.from({length:6},(_,i)=>({id:`item-${i+1}`,ratio:[16/9,4/5,1][i%3]}))
const pair=[{id:'before',role:'before',ratio:16/9},{id:'after',role:'after',ratio:16/9}]
const source={id:'source',ratio:16/9,caption:'Caption'}

check('all fixed durations are literal',()=>{
 const lt=compileLightTableTimeline({mode:'fixed-duration',itemCount:6,fixedDurationMs:12345})
 const ba=compileComparisonTimeline({mode:'fixed-duration',fixedDurationMs:7300})
 const sa=compileAnatomyTimeline({mode:'fixed-duration',fixedDurationMs:6800,item:source,apparatus:{worldBacking:true,matte:true,guides:true}})
 const tb=compileBuildTimeline({mode:'fixed-duration',fixedDurationMs:14321,item:source,apparatus:{matte:true,guides:true}})
 assert.deepEqual([lt.durationMs,ba.durationMs,sa.durationMs,tb.durationMs],[12345,7300,6800,14321])
})
check('all directed modes differ from automatic',()=>{
 const values=[
  [compileLightTableTimeline({mode:'automatic',itemCount:6}),compileLightTableTimeline({mode:'directed',itemCount:6})],
  [compileComparisonTimeline({mode:'automatic'}),compileComparisonTimeline({mode:'directed'})],
  [compileAnatomyTimeline({mode:'automatic',item:source,apparatus:{matte:true,guides:true}}),compileAnatomyTimeline({mode:'directed',item:source,apparatus:{matte:true,guides:true}})],
  [compileBuildTimeline({mode:'automatic',item:source,apparatus:{matte:true,guides:true}}),compileBuildTimeline({mode:'directed',item:source,apparatus:{matte:true,guides:true}})]
 ];for(const [a,d] of values)assert.notEqual(a.durationMs,d.durationMs)
})
check('all Clean outputs are source-neutral',()=>{
 const states=[
  evaluateLightTable({items:six,timeline:compileLightTableTimeline({mode:'automatic',itemCount:6}),timeMs:1000,stageWidth:1920,stageHeight:1080}),
  evaluateComparison({items:pair,timeline:compileComparisonTimeline({mode:'automatic'}),timeMs:1000}),
  evaluateSlideAnatomy({item:source,timeline:compileAnatomyTimeline({mode:'automatic',item:source,apparatus:{matte:true,guides:true}}),timeMs:1000,stageWidth:1920,stageHeight:1080}),
  evaluateBuildPreflight({item:source,timeline:compileBuildTimeline({mode:'automatic',item:source,apparatus:{matte:true,guides:true}}),timeMs:1000,stageWidth:1920,stageHeight:1080})
 ];for(const state of states){assert.equal(state.render.artworkOpacity,1);assert.equal(state.render.artworkFilter,'none');assert.equal(state.render.blendMode,'normal')}
})
check('reduced motion is stable per Scene',()=>{
 const lt=compileLightTableTimeline({mode:'automatic',itemCount:6});assert.deepEqual(evaluateLightTable({items:six,timeline:lt,timeMs:0,stageWidth:1920,stageHeight:1080,reducedMotion:true}),evaluateLightTable({items:six,timeline:lt,timeMs:lt.durationMs-1,stageWidth:1920,stageHeight:1080,reducedMotion:true}))
 const ba=compileComparisonTimeline({mode:'automatic'});assert.deepEqual(evaluateComparison({items:pair,timeline:ba,timeMs:0,reducedMotion:true}),evaluateComparison({items:pair,timeline:ba,timeMs:ba.durationMs-1,reducedMotion:true}))
 const sa=compileAnatomyTimeline({mode:'automatic',item:source,apparatus:{matte:true,guides:true}});assert.deepEqual(evaluateSlideAnatomy({item:source,timeline:sa,timeMs:0,stageWidth:1920,stageHeight:1080,reducedMotion:true}),evaluateSlideAnatomy({item:source,timeline:sa,timeMs:sa.durationMs-1,stageWidth:1920,stageHeight:1080,reducedMotion:true}))
 const tb=compileBuildTimeline({mode:'automatic',item:source,apparatus:{matte:true,guides:true}});assert.deepEqual(evaluateBuildPreflight({item:source,timeline:tb,timeMs:0,stageWidth:1920,stageHeight:1080,reducedMotion:true}),evaluateBuildPreflight({item:source,timeline:tb,timeMs:tb.durationMs-1,stageWidth:1920,stageHeight:1080,reducedMotion:true}))
})
check('four identities do not collapse into one generic output',()=>{
 const outputs=[
  evaluateLightTable({items:six,timeline:compileLightTableTimeline({mode:'automatic',itemCount:6}),timeMs:1000,stageWidth:1920,stageHeight:1080}),
  evaluateComparison({items:pair,timeline:compileComparisonTimeline({mode:'automatic'}),timeMs:1000}),
  evaluateSlideAnatomy({item:source,timeline:compileAnatomyTimeline({mode:'automatic',item:source,apparatus:{matte:true,guides:true}}),timeMs:1000,stageWidth:1920,stageHeight:1080}),
  evaluateBuildPreflight({item:source,timeline:compileBuildTimeline({mode:'automatic',item:source,apparatus:{matte:true,guides:true}}),timeMs:1000,stageWidth:1920,stageHeight:1080})
 ];assert.deepEqual(outputs.map(x=>Object.keys(x).sort().join(',')),[...new Set(outputs.map(x=>Object.keys(x).sort().join(',')))])
})
check('no literal always-pass assertion remains',()=>{for(const scene of ['light-table','before-after-slider','slide-anatomy-object','the-build']){const text=readFileSync(resolve(root,scene,'prototype/verify.mjs'),'utf8');assert.doesNotMatch(text,/assert\.(?:ok|equal|strictEqual)\s*\(\s*true(?:\s*,\s*true)?\s*\)/);assert.doesNotMatch(text,/if\s*\(\s*false\s*\)/)}})
check('browser studies expose 44 px targets and live state',()=>{for(const scene of ['light-table','before-after-slider','slide-anatomy-object','the-build']){const html=readFileSync(resolve(root,scene,'prototype/index.html'),'utf8');assert.match(html,/44px/);assert.match(html,/aria-live="polite"/);assert.match(html,/pagehide/);assert.match(html,/requestAnimationFrame/);assert.match(html,/Pause/);assert.match(html,/Reset/)}})
check('The Build remains explicitly preflight',()=>{const html=readFileSync(resolve(root,'the-build/prototype/index.html'),'utf8');const charter=readFileSync(resolve(root,'the-build/S0_CHARTER_CANDIDATE.md'),'utf8');assert.match(html,/NOT AUTHORED PROCESS/);assert.match(charter,/G10C preflight/i);assert.doesNotMatch(charter,/production implementation complete/i)})
check('Slide Anatomy forbids inferred semantic layers',()=>{const charter=readFileSync(resolve(root,'slide-anatomy-object/S0_CHARTER_CANDIDATE.md'),'utf8');assert.match(charter,/may not infer semantic image layers/i)})
check('Before After never duplicates one source',()=>{const t=compileComparisonTimeline({mode:'automatic'});assert.throws(()=>evaluateComparison({items:[pair[0]],timeline:t,timeMs:0}),/insufficient-input/)})
console.log(`Atelier 06 cross-Scene gauntlet: ${checks} checks passed.`)
