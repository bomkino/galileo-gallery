import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFileSync,existsSync,readdirSync,statSync} from 'node:fs'
import {join,relative,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const root=resolve(fileURLToPath(new URL('.',import.meta.url)))
const scenes=['light-table','before-after-slider','slide-anatomy-object','the-build']
const required=['S0_CHARTER_CANDIDATE.md','SCENE_DNA.md','CAPABILITY_AND_CONTROLS.json','TIMELINE_AND_EVALUATOR.md','SOURCE_FIDELITY_ALPHA_AND_LOOK.md','EDGE_RESOURCE_ACCESSIBILITY.md','PROVENANCE.md','TEST_VECTORS.json','HUMAN_REVIEW_PACKET.md','prototype/core.mjs','prototype/index.html','prototype/verify.mjs','evidence/EVIDENCE_MANIFEST.json','evidence/canonical.svg','evidence/story-states.svg']
let checks=0
const pass=(name)=>{checks++;console.log(`PASS ${name}`)}
for(const scene of scenes){for(const path of required){const absolute=join(root,scene,path);assert.equal(existsSync(absolute),true,`${scene}/${path} is missing`);assert.ok(statSync(absolute).size>0,`${scene}/${path} is empty`)}pass(`${scene}: required packet`)}
for(const scene of scenes){for(const json of ['CAPABILITY_AND_CONTROLS.json','TEST_VECTORS.json','evidence/EVIDENCE_MANIFEST.json'])JSON.parse(readFileSync(join(root,scene,json),'utf8'));pass(`${scene}: JSON parses`)}
for(const scene of scenes){const result=spawnSync(process.execPath,[join(root,scene,'prototype/verify.mjs')],{encoding:'utf8'});process.stdout.write(result.stdout);process.stderr.write(result.stderr);assert.equal(result.status,0,`${scene} verifier failed`);pass(`${scene}: substantive verifier`)}
for(const scene of scenes){const human=readFileSync(join(root,scene,'HUMAN_REVIEW_PACKET.md'),'utf8');assert.match(human,/verdict: pending/);assert.doesNotMatch(human,/verdict:\s*(?:pass|approved|accepted)/i);pass(`${scene}: human verdict remains pending`)}
for(const scene of scenes){const source=readFileSync(join(root,scene,'SOURCE_FIDELITY_ALPHA_AND_LOOK.md'),'utf8');for(const phrase of ['opacity 1','filter `none`','normal blend'])assert.ok(source.toLowerCase().includes(phrase.toLowerCase()),`${scene}: missing ${phrase}`);pass(`${scene}: source-clean contract`)}
for(const scene of scenes){const capability=JSON.parse(readFileSync(join(root,scene,'CAPABILITY_AND_CONTROLS.json'),'utf8'));assert.equal(capability.roundTrip,'exact-json-value-round-trip-required');assert.ok(Array.isArray(capability.controls)&&capability.controls.length>0);for(const control of capability.controls){assert.equal(control.resettable,true);assert.ok(Array.isArray(control.causes)&&control.causes.length>0)}pass(`${scene}: controls causal and resettable`)}
for(const scene of scenes){const vectors=JSON.parse(readFileSync(join(root,scene,'TEST_VECTORS.json'),'utf8'));assert.ok(vectors.vectors.length>=15);assert.ok(vectors.mutationSensitivity.length>=5);assert.ok(vectors.vectors.some(v=>v.id.includes('fixed')));assert.ok(vectors.vectors.some(v=>v.id.includes('directed')));assert.ok(vectors.vectors.some(v=>v.id.includes('reduced')));assert.ok(vectors.vectors.some(v=>v.id.includes('remount')));pass(`${scene}: vector breadth`)}
const forbidden=[/gh[pousr]_[A-Za-z0-9_]{20,}/,/sk-[A-Za-z0-9_-]{20,}/,/\/(?:Users|home)\/[^\s"']+/]
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(dir,entry.name)):[join(dir,entry.name)])}
for(const file of walk(root)){if(/\.(?:png|jpg|jpeg|gif|webp|zip|gz|mp4|mov)$/i.test(file))continue;const text=readFileSync(file,'utf8');for(const pattern of forbidden)assert.doesNotMatch(text,pattern,`leak in ${relative(root,file)}`)}pass('credential and absolute-path scan')
const finalReport=readFileSync(join(root,'FINAL_GAUNTLET_REPORT.md'),'utf8');for(const finding of ['always-pass','directed','reduced-motion','stable keyed nodes','mutation'])assert.ok(finalReport.toLowerCase().includes(finding.toLowerCase()),`final report missing ${finding}`);pass('gauntlet findings recorded')
console.log(`Atelier 06 packet verification: ${checks} gates passed.`)
