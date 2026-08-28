import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateZoetrope} from '../zoetrope/prototype/evaluator.mjs';
import {evaluateVortex} from '../spiral-image-vortex/prototype/evaluator.mjs';
import {evaluateOrrery} from '../the-orrery/prototype/evaluator.mjs';
import {evaluateVitrine} from '../vitrine/prototype/evaluator.mjs';
import {evaluateShelf} from '../the-shelf/prototype/evaluator.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const results=[];
const test=(id,fn)=>{try{fn();results.push({id,status:'pass'})}catch(error){results.push({id,status:'fail',message:error instanceof Error?error.message:String(error)})}};
const stableIds=(first,second)=>assert.deepEqual(first.items.map(item=>item.id),second.items.map(item=>item.id));
const changed=(first,second,label)=>assert.notEqual(JSON.stringify(first),JSON.stringify(second),`${label} produced no observable change`);
const finite=value=>{if(typeof value==='number')assert.ok(Number.isFinite(value));else if(Array.isArray(value)||ArrayBuffer.isView(value))Array.from(value).forEach(finite);else if(value&&typeof value==='object')Object.values(value).forEach(finite)};
function walk(directory){const files=[];for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const target=path.join(directory,entry.name);if(entry.isDirectory())files.push(...walk(target));else files.push(target)}return files}

// Metamorphic checks change one reachable input while preserving identity and unrelated semantics.
test('zoetrope-radius-is-causal',()=>{const first=evaluateZoetrope({timeMs:1375,count:10,radius:1.6}),second=evaluateZoetrope({timeMs:1375,count:10,radius:4.8});stableIds(first,second);changed(first.items.map(item=>[item.x,item.z]),second.items.map(item=>[item.x,item.z]),'radius')});
test('zoetrope-direction-is-inverse-not-reindex',()=>{const forward=evaluateZoetrope({timeMs:1375,count:10,direction:'forward'}),reverse=evaluateZoetrope({timeMs:1375,count:10,direction:'reverse'});stableIds(forward,reverse);assert.ok(Math.abs(forward.turn+reverse.turn)<1e-12)});
test('zoetrope-timing-is-causal',()=>{const fast=evaluateZoetrope({timeMs:500,count:10,advanceMs:420,holdMs:700}),slow=evaluateZoetrope({timeMs:500,count:10,advanceMs:900,holdMs:700});changed(fast.turn,slow.turn,'advance duration')});
test('zoetrope-invalid-numerics-are-bounded',()=>finite(evaluateZoetrope({timeMs:Number.POSITIVE_INFINITY,count:100000,radius:Number.NaN,advanceMs:-2,holdMs:99999})));

test('vortex-radius-pitch-turns-scale-are-causal',()=>{const input={timeMs:1375,count:24,width:1920,height:1080},first=evaluateVortex({...input,radius:1.4,pitch:3.8,turns:1.5,planeScale:.45}),second=evaluateVortex({...input,radius:4.2,pitch:9.2,turns:4.5,planeScale:1.4});stableIds(first,second);changed(first.items.map(item=>[item.x,item.y,item.z,item.width]),second.items.map(item=>[item.x,item.y,item.z,item.width]),'Vortex geometry controls')});
test('vortex-canvas-ratio-is-causal',()=>{const wide=evaluateVortex({timeMs:1375,count:24,width:1920,height:1080}),portrait=evaluateVortex({timeMs:1375,count:24,width:1080,height:1920});stableIds(wide,portrait);changed(wide.items.map(item=>item.x),portrait.items.map(item=>item.x),'canvas ratio')});
test('vortex-direction-is-inverse-phase',()=>{const forward=evaluateVortex({timeMs:1375,count:24,direction:'forward'}),reverse=evaluateVortex({timeMs:1375,count:24,direction:'reverse'});stableIds(forward,reverse);assert.ok(Math.abs(((forward.phase+reverse.phase)%1))<1e-12||Math.abs(((forward.phase+reverse.phase)%1)-1)<1e-12)});
test('vortex-count-bounds-and-keeps-stable-prefix',()=>{const small=evaluateVortex({timeMs:1375,count:12}),large=evaluateVortex({timeMs:1375,count:500});assert.equal(small.items.length,12);assert.equal(large.items.length,96);assert.deepEqual(small.items.map(item=>item.id),large.items.slice(0,12).map(item=>item.id))});

test('orrery-ring-spread-tilt-primary-scale-are-causal',()=>{const input={timeMs:1375,count:18,width:1920,height:1080},first=evaluateOrrery({...input,ringSpread:.7,ringTilt:-24,primaryScale:1.1}),second=evaluateOrrery({...input,ringSpread:1.8,ringTilt:24,primaryScale:2.1});stableIds(first,second);changed(first.items.map(item=>[item.x,item.y,item.z,item.scale]),second.items.map(item=>[item.x,item.y,item.z,item.scale]),'Orrery controls')});
test('orrery-ring-turns-are-causal-and-integerised',()=>{const first=evaluateOrrery({timeMs:1375,count:18,ringTurns:[1,-2,3]}),second=evaluateOrrery({timeMs:1375,count:18,ringTurns:[2,-3,4]});stableIds(first,second);changed(first.items.map(item=>[item.x,item.y,item.z]),second.items.map(item=>[item.x,item.y,item.z]),'ring turns');finite(evaluateOrrery({timeMs:1375,count:18,ringTurns:[1.4,-2.4,0]}))});
test('orrery-canvas-ratio-is-causal',()=>{const wide=evaluateOrrery({timeMs:1375,count:18,width:1920,height:1080}),portrait=evaluateOrrery({timeMs:1375,count:18,width:1080,height:1920});stableIds(wide,portrait);changed(wide.items.map(item=>item.x),portrait.items.map(item=>item.x),'canvas ratio')});
test('orrery-direction-changes-primary-order-without-reindexing',()=>{const forward=evaluateOrrery({timeMs:1375,count:18,direction:'forward'}),reverse=evaluateOrrery({timeMs:1375,count:18,direction:'reverse'});stableIds(forward,reverse);assert.notEqual(forward.primary,reverse.primary)});
test('orrery-count-is-bounded',()=>{assert.equal(evaluateOrrery({count:999,timeMs:1}).items.length,72)});

test('vitrine-hold-and-exchange-are-distinct',()=>{const hold=evaluateVitrine({timeMs:1000,count:6}),exchange=evaluateVitrine({timeMs:1700,count:6});assert.equal(hold.phase,'hold');assert.equal(exchange.phase,'exchange');changed(hold.items,exchange.items,'exchange')});
test('vitrine-distance-axis-scale-are-causal',()=>{const input={timeMs:1750,count:6},first=evaluateVitrine({...input,approachDistance:.1,axis:'horizontal',primaryScale:.42}),second=evaluateVitrine({...input,approachDistance:.55,axis:'vertical',primaryScale:.82});stableIds(first,second);changed(first.items,second.items,'distance, axis, and scale')});
test('vitrine-timings-are-causal',()=>{const first=evaluateVitrine({timeMs:1000,count:6,holdMs:600,exchangeMs:280}),second=evaluateVitrine({timeMs:1000,count:6,holdMs:6000,exchangeMs:1800});assert.notEqual(first.phase,second.phase)});
test('vitrine-reverse-preserves-object-identities',()=>{const forward=evaluateVitrine({timeMs:3000,count:6,direction:'forward'}),reverse=evaluateVitrine({timeMs:3000,count:6,direction:'reverse'});assert.equal(forward.currentIndex,1);assert.equal(reverse.currentIndex,5);finite(forward);finite(reverse)});
test('vitrine-count-is-bounded',()=>assert.equal(evaluateVitrine({count:999,timeMs:1}).durationMs,(1400+760)*24));

test('shelf-gap-and-edition-height-are-causal',()=>{const input={timeMs:1375,ratios:[1.78,.66,1,.8]},first=evaluateShelf({...input,gap:8,editionHeight:.24}),second=evaluateShelf({...input,gap:180,editionHeight:.62});stableIds(first,second);changed(first.items.map(item=>[item.width,item.x]),second.items.map(item=>[item.width,item.x]),'gap and edition height')});
test('shelf-perspective-is-geometric-only',()=>{const input={timeMs:1375,ratios:[1.78,.66,1,.8]},flat=evaluateShelf({...input,perspectiveDeg:0}),deep=evaluateShelf({...input,perspectiveDeg:32});stableIds(flat,deep);assert.deepEqual(flat.items.map(item=>[item.x,item.y,item.width,item.height]),deep.items.map(item=>[item.x,item.y,item.width,item.height]));changed(flat.items.map(item=>item.yaw),deep.items.map(item=>item.yaw),'perspective')});
test('shelf-spotlight-lift-is-causal-and-singular',()=>{const input={timeMs:5000,ratios:[1.78,.66,1,.8,1.5,.56,1.2,.72],spotlightIndex:7},low=evaluateShelf({...input,lift:.04}),high=evaluateShelf({...input,lift:.24});stableIds(low,high);const changedIds=low.items.filter((item,index)=>item.y!==high.items[index].y).map(item=>item.id);assert.deepEqual(changedIds,['frame-7'])});
test('shelf-direction-changes-path-not-identities',()=>{const input={timeMs:1375,ratios:[1.78,.66,1,.8]},forward=evaluateShelf({...input,direction:'forward'}),reverse=evaluateShelf({...input,direction:'reverse'});stableIds(forward,reverse);changed(forward.items.map(item=>item.x),reverse.items.map(item=>item.x),'direction')});
test('shelf-pace-is-causal',()=>{const input={timeMs:1375,ratios:[1.78,.66,1,.8]},fast=evaluateShelf({...input,paceMs:240}),slow=evaluateShelf({...input,paceMs:2400});stableIds(fast,slow);changed(fast.items.map(item=>item.x),slow.items.map(item=>item.x),'pace')});
test('shelf-ratio-extremes-are-bounded',()=>{const state=evaluateShelf({timeMs:1,ratios:[.001,100,Number.NaN,...Array(200).fill(1)]});assert.equal(state.items.length,127);finite(state);assert.ok(state.items.every(item=>item.width/item.height>=.2&&item.width/item.height<=5))});

test('prototype-sources-have-no-network-or-framework-imports',()=>{for(const file of walk(root).filter(file=>/prototype[/\\].*\.(?:html|mjs|js)$/.test(file))){const source=fs.readFileSync(file,'utf8');assert.doesNotMatch(source,/https?:\/\//,file);assert.doesNotMatch(source,/from\s+['"](?:three|@react-three|ogl|regl|deck\.gl)/,file)}});
test('review-scrub-has-transient-and-commit-events',()=>{const source=fs.readFileSync(path.join(root,'review/review.js'),'utf8');assert.match(source,/addEventListener\('input'/);assert.match(source,/addEventListener\('change'/);assert.match(source,/postTime\(false\)/);assert.match(source,/postTime\(true\)/)});
test('webgl-loss-and-disposal-are-executable',()=>{for(const scene of ['spiral-image-vortex','the-orrery']){const source=fs.readFileSync(path.join(root,scene,'prototype/webgl-comparison/app.mjs'),'utf8');for(const token of ["addEventListener('webglcontextlost'","addEventListener('webglcontextrestored'",'gl.deleteTexture','gl.deleteBuffer','gl.deleteVertexArray','gl.deleteProgram','observer.disconnect()'])assert.ok(source.includes(token),`${scene} missing ${token}`)}});
test('webgl-probes-consume-shared-evaluators',()=>{assert.match(fs.readFileSync(path.join(root,'spiral-image-vortex/prototype/webgl-comparison/app.mjs'),'utf8'),/evaluateVortex/);assert.match(fs.readFileSync(path.join(root,'the-orrery/prototype/webgl-comparison/app.mjs'),'utf8'),/evaluateOrrery/)});
test('no-generic-camera-controls',()=>{const sources=walk(root).filter(file=>/\.(?:html|js|mjs)$/.test(file)).map(file=>fs.readFileSync(file,'utf8')).join('\n');assert.doesNotMatch(sources,/OrbitControls|TrackballControls|FlyControls|PointerLockControls/)});

const failures=results.filter(result=>result.status==='fail');
const report={format:'galileo-atelier-adversarial-result',version:1,generatedAt:new Date().toISOString(),status:failures.length?'fail':'pass',checkCount:results.length,passCount:results.length-failures.length,failCount:failures.length,results};
if(process.env.ATELIER_ADVERSARIAL_OUT)fs.writeFileSync(process.env.ATELIER_ADVERSARIAL_OUT,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(failures.length)process.exitCode=1;
