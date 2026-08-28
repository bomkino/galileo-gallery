import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluateZoetrope} from '../zoetrope/prototype/evaluator.mjs';
import {evaluateVortex} from '../spiral-image-vortex/prototype/evaluator.mjs';
import {evaluateOrrery} from '../the-orrery/prototype/evaluator.mjs';
import {evaluateVitrine} from '../vitrine/prototype/evaluator.mjs';
import {evaluateShelf} from '../the-shelf/prototype/evaluator.mjs';

let seed=0x04a71e2d;
const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/0x100000000};
const between=(min,max)=>min+(max-min)*random();
const integer=(min,max)=>Math.floor(between(min,max+1));
const choose=values=>values[integer(0,values.length-1)];
const finite=value=>{if(typeof value==='number')assert.ok(Number.isFinite(value));else if(Array.isArray(value)||ArrayBuffer.isView(value))Array.from(value).forEach(finite);else if(value&&typeof value==='object')Object.values(value).forEach(finite)};
const uniqueIds=state=>assert.equal(new Set(state.items.map(item=>item.id)).size,state.items.length);
const mapItems=state=>new Map(state.items.map(item=>[item.id,item]));
const matrixDistance=(a,b)=>Math.hypot(a.matrix[12]-b.matrix[12],a.matrix[13]-b.matrix[13],a.matrix[14]-b.matrix[14],a.matrix[0]-b.matrix[0],a.matrix[5]-b.matrix[5]);
const positionDistance=(a,b)=>Math.hypot((a.x??0)-(b.x??0),(a.y??0)-(b.y??0),(a.z??0)-(b.z??0));
const cases=[];
const run=(scene,iterations,fn)=>{for(let index=0;index<iterations;index+=1){try{fn(index);cases.push({scene,index,status:'pass'})}catch(error){cases.push({scene,index,status:'fail',message:error instanceof Error?error.message:String(error)})}}};

run('zoetrope',500,()=>{
  const input={timeMs:between(0,200000),count:integer(0,80),advanceMs:between(160,900),holdMs:between(250,1800),direction:choose(['forward','reverse']),radius:between(1.6,4.8),reducedMotion:random()<.2};
  const state=evaluateZoetrope(input);finite(state);uniqueIds(state);assert.equal(state.items.length,Math.max(0,Math.min(64,Math.round(input.count))));
  if(state.items.length===1){const later=evaluateZoetrope({...input,timeMs:input.timeMs+9999});assert.deepEqual(state.items,later.items)}
});

run('spiral-image-vortex',500,()=>{
  const input={timeMs:between(0,10000),count:integer(1,120),width:between(320,4096),height:between(320,4096),radius:between(1.4,4.2),pitch:between(3.8,9.2),turns:between(1.5,4.5),planeScale:between(.45,1.4),direction:choose(['forward','reverse']),reducedMotion:false};
  const state=evaluateVortex(input),next=evaluateVortex({...input,timeMs:input.timeMs+.001});finite(state);uniqueIds(state);assert.equal(state.items.length,Math.min(96,input.count));assert.ok(state.items.every(item=>item.opacity>=0&&item.opacity<=1));
  const after=mapItems(next);for(const item of state.items){const target=after.get(item.id),jump=matrixDistance(item,target);if(jump>.1)assert.ok(item.opacity<=.02&&target.opacity<=.02,`${item.id} visible fuzz wrap`)}
});

run('the-orrery',500,()=>{
  const turns=[choose([-6,-5,-4,-3,-2,-1,1,2,3,4,5,6]),choose([-6,-5,-4,-3,-2,-1,1,2,3,4,5,6]),choose([-6,-5,-4,-3,-2,-1,1,2,3,4,5,6])];
  const input={timeMs:between(0,10000),count:integer(1,90),width:between(320,4096),height:between(320,4096),ringSpread:between(.7,1.8),ringTilt:between(-24,24),primaryScale:between(1.1,2.1),ringTurns:turns,direction:choose(['forward','reverse']),reducedMotion:false};
  const state=evaluateOrrery(input),next=evaluateOrrery({...input,timeMs:input.timeMs+.001});finite(state);uniqueIds(state);assert.equal(state.items.length,Math.min(72,input.count));assert.ok(state.primary>=0&&state.primary<state.items.length);
  const after=mapItems(next);for(const item of state.items)assert.ok(matrixDistance(item,after.get(item.id))<.05,`${item.id} exchange discontinuity`);
  const beforeLoop=mapItems(evaluateOrrery({...input,timeMs:9999.999})),start=mapItems(evaluateOrrery({...input,timeMs:0}));for(const [id,item] of beforeLoop)assert.ok(matrixDistance(item,start.get(id))<.05,`${id} loop discontinuity`)
});

run('vitrine',500,()=>{
  const input={timeMs:between(0,100000),count:integer(0,30),holdMs:between(600,6000),exchangeMs:between(280,1800),approachDistance:between(.1,.55),primaryScale:between(.42,.82),axis:choose(['horizontal','vertical']),direction:choose(['forward','reverse']),reducedMotion:false};
  const state=evaluateVitrine(input),next=evaluateVitrine({...input,timeMs:input.timeMs+.001});finite(state);uniqueIds(state);assert.ok(state.items.length<=2);
  const after=mapItems(next);for(const item of state.items){const target=after.get(item.id);if(target)assert.ok(positionDistance(item,target)<.01&&Math.abs(item.scale-target.scale)<.01,`${item.id} handoff discontinuity`)}
});

run('the-shelf',500,()=>{
  const requested=integer(0,150),ratios=Array.from({length:requested},()=>between(.2,5)),spotlight=requested&&random()<.65?integer(0,Math.min(126,requested-1)):-1;
  const input={timeMs:between(0,120000),ratios,stageWidth:between(320,4096),stageHeight:between(320,4096),editionHeight:between(.24,.62),gap:between(8,180),perspectiveDeg:between(0,32),paceMs:between(240,2400),shelfHeight:between(.55,.82),spotlightIndex:spotlight,spotlightStartMs:between(0,10000),seekMs:between(200,1600),holdMs:between(0,2400),releaseMs:between(200,1600),finaleMs:between(0,1600),lift:between(.04,.24),direction:choose(['forward','reverse']),reducedMotion:false};
  const state=evaluateShelf(input),next=evaluateShelf({...input,timeMs:input.timeMs+.001});finite(state);uniqueIds(state);assert.equal(state.items.length,Math.min(127,requested));assert.ok(state.items.every(item=>item.width>0&&item.height>0));
  const after=mapItems(next);for(const item of state.items){const target=after.get(item.id);if(Math.abs(item.x-target.x)>input.stageWidth)assert.ok(!item.visible&&!target.visible,`${item.id} visible shelf wrap`);else assert.ok(positionDistance(item,target)<.05,`${item.id} shelf discontinuity`)}
});

const failures=cases.filter(item=>item.status==='fail');
const report={format:'galileo-atelier-fuzz-result',version:1,seed:'0x04a71e2d',generatedAt:new Date().toISOString(),status:failures.length?'fail':'pass',caseCount:cases.length,passCount:cases.length-failures.length,failCount:failures.length,failures:failures.slice(0,100)};
if(process.env.ATELIER_FUZZ_OUT)fs.writeFileSync(process.env.ATELIER_FUZZ_OUT,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(failures.length)process.exitCode=1;
