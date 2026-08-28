import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateZoetrope} from '../zoetrope/prototype/evaluator.mjs';
import {evaluateVortex} from '../spiral-image-vortex/prototype/evaluator.mjs';
import {evaluateOrrery} from '../the-orrery/prototype/evaluator.mjs';
import {evaluateVitrine} from '../vitrine/prototype/evaluator.mjs';
import {evaluateShelf} from '../the-shelf/prototype/evaluator.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const scenes=['zoetrope','spiral-image-vortex','the-orrery','vitrine','the-shelf'];
const required=['S0_CHARTER_CANDIDATE.md','SCENE_DNA.md','CAPABILITY_AND_CONTROLS.json','TIMELINE_AND_EVALUATOR.md','SOURCE_FIDELITY_ALPHA_AND_LOOK.md','EDGE_RESOURCE_ACCESSIBILITY.md','PROVENANCE.md','TEST_VECTORS.json','HUMAN_REVIEW_PACKET.md','prototype/index.html','evidence/README.md'];
const checks=[];
const record=(id,fn)=>{try{fn();checks.push({id,status:'pass'})}catch(error){checks.push({id,status:'fail',message:error instanceof Error?error.message:String(error)})}};
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const parse=relative=>JSON.parse(read(relative));
function walk(directory){const files=[];for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const target=path.join(directory,entry.name);if(entry.isDirectory())files.push(...walk(target));else files.push(target)}return files}
const allFiles=walk(root);
const finite=value=>{if(typeof value==='number')assert.ok(Number.isFinite(value),'non-finite number');else if(Array.isArray(value)||ArrayBuffer.isView(value))Array.from(value).forEach(finite);else if(value&&typeof value==='object')Object.values(value).forEach(finite)};
const snapshot=value=>JSON.stringify(value);
const deterministic=(evaluate,input)=>{const before=snapshot(input),first=evaluate(input),second=evaluate(input);assert.equal(snapshot(input),before,'evaluator mutated input');assert.equal(snapshot(first),snapshot(second),'evaluator is nondeterministic');finite(first);return first};
const mapItems=state=>new Map(state.items.map(item=>[item.id,item]));
const matrixDistance=(a,b)=>Math.hypot(a.matrix[12]-b.matrix[12],a.matrix[13]-b.matrix[13],a.matrix[14]-b.matrix[14],a.matrix[0]-b.matrix[0],a.matrix[5]-b.matrix[5]);
const positionDistance=(a,b)=>Math.hypot((a.x??0)-(b.x??0),(a.y??0)-(b.y??0),(a.z??0)-(b.z??0));

record('packet-required-surfaces',()=>{for(const scene of scenes)for(const file of required)assert.ok(fs.existsSync(path.join(root,scene,file)),`${scene}/${file} missing`)});
record('all-json-parses',()=>{for(const file of allFiles.filter(file=>file.endsWith('.json')))JSON.parse(fs.readFileSync(file,'utf8'))});
record('scene-identities-are-distinct',()=>{const sentences=scenes.map(scene=>read(`${scene}/S0_CHARTER_CANDIDATE.md`).match(/## Motion sentence\s+\n\n([^\n]+)/)?.[1]);assert.ok(sentences.every(Boolean));assert.equal(new Set(sentences).size,scenes.length)});
record('controls-are-causal-bounded-resettable',()=>{for(const scene of scenes){const controls=parse(`${scene}/CAPABILITY_AND_CONTROLS.json`).controls;assert.ok(controls.length>0,`${scene} has no controls`);const ids=new Set;for(const control of controls){assert.ok(!ids.has(control.id),`${scene}:${control.id} duplicate`);ids.add(control.id);assert.ok(control.defaultValue!==undefined,`${scene}:${control.id} default missing`);assert.ok(String(control.resetBehavior||'').length>0,`${scene}:${control.id} reset missing`);assert.ok(String(control.observable||'').length>=18,`${scene}:${control.id} observable missing`);if(control.kind==='range'){assert.ok(Number.isFinite(control.min)&&Number.isFinite(control.max)&&control.min<control.max,`${scene}:${control.id} invalid range`);assert.ok(control.defaultValue>=control.min&&control.defaultValue<=control.max,`${scene}:${control.id} default outside range`)}}}});
record('human-verdicts-remain-pending',()=>{for(const scene of scenes){const packet=read(`${scene}/HUMAN_REVIEW_PACKET.md`).toLowerCase();assert.match(packet,/verdict:\s*\*\*pending\*\*/);assert.doesNotMatch(packet,/verdict:\s*\*\*(approved|accepted|pass)/)}});
record('orrery-gate-discipline',()=>{const combined=['S0_CHARTER_CANDIDATE.md','SCENE_DNA.md','TIMELINE_AND_EVALUATOR.md','EDGE_RESOURCE_ACCESSIBILITY.md','PROVENANCE.md','HUMAN_REVIEW_PACKET.md'].map(file=>read(`the-orrery/${file}`)).join('\n');assert.ok(combined.includes('G10B preflight candidate'));assert.ok(combined.includes('blocked by G10A'));assert.doesNotMatch(combined,/implementation:\s*yes|integrated:\s*yes/i)});
record('clean-source-language',()=>{for(const scene of scenes){const source=read(`${scene}/SOURCE_FIDELITY_ALPHA_AND_LOOK.md`).toLowerCase();for(const phrase of ['opacity 1','normal blend','zero rgb'])assert.ok(source.includes(phrase),`${scene} missing ${phrase}`);assert.ok(source.includes('filter none')||source.includes('no filter'),`${scene} filter contract missing`)}});
record('evaluators-use-story-time-not-wall-clock',()=>{for(const scene of scenes){const source=read(`${scene}/prototype/evaluator.mjs`);assert.doesNotMatch(source,/Date\.now|performance\.now|requestAnimationFrame|setTimeout|Math\.random/,`${scene} evaluator owns wall clock or scheduling`)}});

record('zoetrope-deterministic-and-still-one',()=>{deterministic(evaluateZoetrope,{timeMs:1375,count:10});const first=evaluateZoetrope({timeMs:0,count:1}),later=evaluateZoetrope({timeMs:9000,count:1});assert.deepEqual(first.items,later.items);assert.equal(first.phase,'hold')});
record('zoetrope-boundary-continuity',()=>{for(let boundary=1120;boundary<11200;boundary+=1120){const before=mapItems(evaluateZoetrope({timeMs:boundary-.001,count:10})),after=mapItems(evaluateZoetrope({timeMs:boundary+.001,count:10}));for(const [id,item] of before){const next=after.get(id);assert.ok(next);assert.ok(positionDistance(item,next)<.001,`${id} jumps at ${boundary}`)}}});
record('zoetrope-reduced-motion-holds',()=>{const first=evaluateZoetrope({timeMs:800,count:10,reducedMotion:true}),later=evaluateZoetrope({timeMs:1000,count:10,reducedMotion:true});assert.equal(first.turn,later.turn)});
record('zoetrope-reverse-is-exact-inverse',()=>{const forward=evaluateZoetrope({timeMs:1375,count:10,direction:'forward'}),reverse=evaluateZoetrope({timeMs:1375,count:10,direction:'reverse'});assert.ok(Math.abs(forward.turn+reverse.turn)<1e-12);assert.deepEqual(forward.items.map(item=>item.id),reverse.items.map(item=>item.id))});

record('vortex-deterministic-immutable-finite',()=>deterministic(evaluateVortex,{timeMs:1375,count:24,width:1920,height:1080}));
record('vortex-visible-wraps-are-forbidden',()=>{let previous=evaluateVortex({timeMs:0,count:24,width:1920,height:1080});for(let time=5;time<=10000;time+=5){const current=evaluateVortex({timeMs:time,count:24,width:1920,height:1080}),before=mapItems(previous),after=mapItems(current);for(const [id,item] of before){const next=after.get(id),jump=matrixDistance(item,next);if(jump>3.2)assert.ok(item.opacity<=.02&&next.opacity<=.02,`${id} wraps visibly at ${time}ms (${item.opacity}, ${next.opacity})`)}previous=current}});
record('vortex-loop-closure',()=>{const start=evaluateVortex({timeMs:0,count:24}),end=evaluateVortex({timeMs:10000,count:24});assert.equal(snapshot(start),snapshot(end))});
record('vortex-reduced-motion-holds',()=>{const first=evaluateVortex({timeMs:1001,count:24,reducedMotion:true}),same=evaluateVortex({timeMs:1100,count:24,reducedMotion:true}),next=evaluateVortex({timeMs:1900,count:24,reducedMotion:true});assert.equal(snapshot(first),snapshot(same));assert.notEqual(snapshot(same),snapshot(next))});
record('vortex-dom-webgl-share-evaluator',()=>{assert.match(read('spiral-image-vortex/prototype/app.mjs'),/from'\.\/evaluator\.mjs'/);assert.match(read('spiral-image-vortex/prototype/webgl-comparison/app.mjs'),/from'\.\.\/evaluator\.mjs'/)});

record('orrery-deterministic-immutable-finite',()=>deterministic(evaluateOrrery,{timeMs:1375,count:18,width:1920,height:1080}));
record('orrery-one-item-is-still',()=>{const start=evaluateOrrery({timeMs:0,count:1}),later=evaluateOrrery({timeMs:9000,count:1});assert.equal(snapshot(start),snapshot(later));assert.equal(start.primary,0)});
record('orrery-epsilon-loop-closure',()=>{const before=mapItems(evaluateOrrery({timeMs:9999.999,count:18,width:1920,height:1080})),after=mapItems(evaluateOrrery({timeMs:0,count:18,width:1920,height:1080}));for(const [id,item] of before)assert.ok(matrixDistance(item,after.get(id))<.01,`${id} tears at loop seam`)});
record('orrery-every-exchange-continuous',()=>{const count=18;for(let step=1;step<count;step+=1){const boundary=step/count*10000,before=mapItems(evaluateOrrery({timeMs:boundary-.001,count})),after=mapItems(evaluateOrrery({timeMs:boundary+.001,count}));for(const [id,item] of before)assert.ok(matrixDistance(item,after.get(id))<.01,`${id} jumps at exchange ${step}`)}});
record('orrery-every-identity-becomes-primary',()=>{const count=18,seen=new Set;for(let step=0;step<count;step+=1)seen.add(evaluateOrrery({timeMs:(step+.1)/count*10000,count}).primary);assert.equal(seen.size,count)});
record('orrery-ring-turns-are-integers',()=>{for(const time of [0,1250,5000,9999.999,10000])finite(evaluateOrrery({timeMs:time,count:72,ringTurns:[1,-2,3]}));const source=read('the-orrery/TIMELINE_AND_EVALUATOR.md');assert.match(source,/integer number of signed revolutions/)});
record('orrery-reduced-motion-holds',()=>{const first=evaluateOrrery({timeMs:1001,count:18,reducedMotion:true}),same=evaluateOrrery({timeMs:1100,count:18,reducedMotion:true}),next=evaluateOrrery({timeMs:2001,count:18,reducedMotion:true});assert.equal(snapshot(first),snapshot(same));assert.notEqual(snapshot(same),snapshot(next))});
record('orrery-dom-webgl-share-evaluator',()=>{assert.match(read('the-orrery/prototype/app.mjs'),/from'\.\/evaluator\.mjs'/);assert.match(read('the-orrery/prototype/webgl-comparison/app.mjs'),/from'\.\.\/evaluator\.mjs'/)});

record('vitrine-deterministic-immutable-finite',()=>deterministic(evaluateVitrine,{timeMs:1750,count:6}));
record('vitrine-one-item-is-true-still',()=>{const start=evaluateVitrine({timeMs:0,count:1}),later=evaluateVitrine({timeMs:9000,count:1});assert.deepEqual(start.items,later.items);assert.equal(start.phase,'hold')});
record('vitrine-hold-is-visually-constant',()=>{const first=evaluateVitrine({timeMs:0,count:6}),later=evaluateVitrine({timeMs:1300,count:6});assert.deepEqual(first.items,later.items);assert.equal(first.phase,'hold');assert.equal(later.phase,'hold')});
record('vitrine-exchange-handoff-continuity',()=>{const before=mapItems(evaluateVitrine({timeMs:2159.999,count:6})),after=mapItems(evaluateVitrine({timeMs:2160,count:6})),incoming=before.get('frame-1'),primary=after.get('frame-1');assert.ok(incoming&&primary);assert.ok(positionDistance(incoming,primary)<.001);assert.ok(Math.abs(incoming.scale-primary.scale)<.001)});
record('vitrine-reduced-motion-is-discrete',()=>{const hold=evaluateVitrine({timeMs:1300,count:6,reducedMotion:true}),exchange=evaluateVitrine({timeMs:1500,count:6,reducedMotion:true});assert.equal(hold.progress,0);assert.equal(exchange.progress,1)});
record('vitrine-sleeps-during-holds',()=>{const source=read('vitrine/prototype/app.mjs');assert.match(source,/state\.phase==='hold'/);assert.match(source,/setTimeout/);assert.match(source,/clearTimeout/)});

record('shelf-deterministic-immutable-finite',()=>deterministic(evaluateShelf,{timeMs:1375,ratios:[1.78,.66,1,.8,1.5,.56]}));
record('shelf-one-item-is-still',()=>{const start=evaluateShelf({timeMs:0,ratios:[1.78]}),later=evaluateShelf({timeMs:9000,ratios:[1.78]});assert.equal(snapshot(start),snapshot(later));assert.equal(start.phase,'still')});
record('shelf-natural-widths',()=>{const ratios=[1.78,.66,1,.8],state=evaluateShelf({timeMs:0,ratios,stageHeight:1000,editionHeight:.4});state.items.forEach((item,index)=>assert.ok(Math.abs(item.width/item.height-ratios[index])<1e-9))});
record('shelf-baseline-is-stable',()=>{const state=evaluateShelf({timeMs:1375,ratios:[1.78,.66,1,.8],stageHeight:1000,shelfHeight:.69,editionHeight:.42});const baselineYs=new Set(state.items.map(item=>item.y));assert.equal(baselineYs.size,1)});
record('shelf-spotlight-finale-handoff',()=>{const input={ratios:[1.78,.66,1,.8,1.5,.56,1.2,.72],spotlightIndex:7},before=mapItems(evaluateShelf({...input,timeMs:6199.999})).get('frame-7'),afterState=evaluateShelf({...input,timeMs:6200}),after=mapItems(afterState).get('frame-7');assert.equal(afterState.phase,'finale');assert.ok(positionDistance(before,after)<.01);assert.ok(Math.abs(before.yaw-after.yaw)<.01);assert.ok(Math.abs(before.scale-after.scale)<.01)});
record('shelf-recycling-only-offstage',()=>{const input={ratios:[1.78,.66,1,.8,1.5,.56,1.2,.72],stageWidth:1200,stageHeight:800};let previous=evaluateShelf({...input,timeMs:0});for(let time=10;time<=40000;time+=10){const current=evaluateShelf({...input,timeMs:time}),before=mapItems(previous),after=mapItems(current);for(const [id,item] of before){const next=after.get(id);if(Math.abs(item.x-next.x)>1200)assert.ok(!item.visible&&!next.visible,`${id} recycles visibly at ${time}`)}previous=current}});
record('shelf-bounded-127',()=>{const state=evaluateShelf({timeMs:75000,ratios:Array.from({length:127},(_,index)=>.5+(index%9)*.2)});assert.equal(state.items.length,127);finite(state)});
record('shelf-spotlight-is-singular',()=>{const state=evaluateShelf({timeMs:5000,ratios:[1.78,.66,1,.8,1.5,.56,1.2,.72],spotlightIndex:7}),lifted=state.items.filter(item=>item.scale>1.0001);assert.deepEqual(lifted.map(item=>item.id),['frame-7'])});

record('review-surface-ux-contract',()=>{const html=read('review/index.html'),css=read('review/review.css'),js=read('review/review.js');for(const scene of scenes)assert.ok(js.includes(scene),`${scene} absent from review`);assert.match(html,/<button\b/);assert.match(html,/aria-live="polite"/);assert.match(css,/:focus-visible/);assert.match(css,/prefers-reduced-motion/);assert.match(css,/forced-colors/);assert.match(js,/addEventListener\('input'/);assert.match(js,/addEventListener\('change'/);assert.match(js,/requestAnimationFrame/);assert.match(js,/cancelAnimationFrame/);assert.match(js,/pagehide/);assert.match(css,/min-height:44px/);assert.doesNotMatch(js,/OrbitControls|camera\.position|pointermove.*camera/is)});
record('interaction-ownership-is-singular',()=>{const contract=parse('INTERACTION_OWNERSHIP.json'),ids=new Set;for(const operation of contract.operations){assert.ok(!ids.has(operation.id),`duplicate id ${operation.id}`);ids.add(operation.id);assert.ok(operation.owner&&operation.surface&&operation.commit);assert.ok(String(operation.alternativeRejected).length>=24)}});
record('renderer-matrix-complete',()=>{const matrix=parse('RENDERER_DECISION_MATRIX.json');assert.deepEqual(matrix.scenes.map(scene=>scene.sceneId),scenes);assert.equal(matrix.scenes.filter(scene=>scene.comparison).length,2);assert.equal(matrix.scenes.find(scene=>scene.sceneId==='the-orrery').blockedBy,'G10A')});
record('webgl-probes-are-explicit-and-clean',()=>{for(const scene of ['spiral-image-vortex','the-orrery']){const app=read(`${scene}/prototype/webgl-comparison/app.mjs`);assert.match(app,/drawArraysInstanced/);assert.match(app,/webglcontextlost/);assert.match(app,/webglcontextrestored/);for(const call of ['deleteTexture','deleteBuffer','deleteVertexArray','deleteProgram','observer.disconnect','cancelAnimationFrame'])assert.ok(app.includes(call),`${scene} missing ${call}`);assert.match(app,/Math\.min\(window\.devicePixelRatio\|\|1,2\)/);assert.match(app,/source\.rgb/);assert.doesNotMatch(app,/OrbitControls|bloom|grain|vignette|blur\(/i)}});
record('offline-prototypes',()=>{for(const file of allFiles.filter(file=>/\.(?:html|mjs|js)$/.test(file))){const source=fs.readFileSync(file,'utf8');assert.doesNotMatch(source,/<script[^>]+src=["']https?:|<link[^>]+href=["']https?:|import\s+.*from\s+["']https?:/,`${path.relative(root,file)} loads network code`)}});
record('claim-discipline',()=>{const all=allFiles.filter(file=>file.endsWith('.md')).map(file=>fs.readFileSync(file,'utf8')).join('\n').toLowerCase();assert.ok(all.includes('human verdict pending')||all.includes('verdict: **pending**'));assert.doesNotMatch(all,/human[- ]accepted:\s*yes|released:\s*yes|packaged:\s*yes|integrated:\s*yes/)});

const failures=checks.filter(check=>check.status==='fail');
const relativeFiles=allFiles.map(file=>path.relative(root,file)).sort();
const result={format:'galileo-atelier-gauntlet-result',version:1,generatedAt:new Date().toISOString(),sceneCount:scenes.length,fileCount:relativeFiles.length,checkCount:checks.length,passCount:checks.length-failures.length,failCount:failures.length,status:failures.length?'fail':'pass',checks,sourceDigest:crypto.createHash('sha256').update(relativeFiles.map(file=>`${file}\n${fs.statSync(path.join(root,file)).size}\n`).join('')).digest('hex')};
if(process.env.ATELIER_GAUNTLET_OUT)fs.writeFileSync(process.env.ATELIER_GAUNTLET_OUT,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(failures.length)process.exitCode=1;
