import fs from "node:fs"
import crypto from "node:crypto"
import {DEFAULTS,FIXTURES,CANVASES,evaluate,canonicalSnapshot,DURATION_MS,compileTimeline} from "./evaluator.mjs"
const digest=(v)=>crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex")
const directedDuration=compileTimeline({...DEFAULTS,mode:"directed"}).durationMs
const specs=[
  {id:"start-five-wide",fixture:"five",canvas:"wide",timeMs:0},
  {id:"open-five-wide",fixture:"five",canvas:"wide",timeMs:1848},
  {id:"spotlight-hold-five",fixture:"five",canvas:"wide",timeMs:3948},
  {id:"spotlight-return-five",fixture:"five",canvas:"wide",timeMs:5460},
  {id:"finale-five",fixture:"five",canvas:"wide",timeMs:6384},
  {id:"seam-five",fixture:"five",canvas:"wide",timeMs:DURATION_MS},
  {id:"two-wide",fixture:"two",canvas:"wide",timeMs:1848},
  {id:"mixed-wide",fixture:"mixed",canvas:"wide",timeMs:3948,controls:{featuredIndex:4}},
  {id:"mixed-portrait",fixture:"mixed",canvas:"portrait",timeMs:1848,controls:{featuredIndex:4}},
  {id:"many-window",fixture:"many127",canvas:"wide",timeMs:3948,controls:{featuredIndex:64}},
  {id:"directed-rhythm",fixture:"five",canvas:"wide",timeMs:Math.round(directedDuration*0.22),controls:{mode:"directed"}},
  {id:"fixed-reverse",fixture:"five",canvas:"wide",timeMs:4321,controls:{mode:"fixed-duration",fixedDurationMs:12347,direction:"reverse"}},
]
const vectors=specs.map(spec=>{
  const controls={...DEFAULTS,...(spec.controls||{})}
  const snapshot=canonicalSnapshot(evaluate({items:FIXTURES[spec.fixture],stage:CANVASES[spec.canvas],controls,timeMs:spec.timeMs}))
  return {...spec,controls:spec.controls||{},expectedSha256:digest(snapshot),expected:snapshot}
})
const out={schemaVersion:1,scene:{id:"slide-fan",versionCandidate:1},generatedBy:"prototype/generate-vectors.mjs",vectors}
fs.writeFileSync(new URL("../TEST_VECTORS.json",import.meta.url),JSON.stringify(out,null,2)+"\n")
