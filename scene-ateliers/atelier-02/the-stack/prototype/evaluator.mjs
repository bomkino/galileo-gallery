export const SCENE_ID = "the-stack";
export const SCENE_NAME = "Calm Stack";
export const DEFAULT_PARAMETERS = Object.freeze({"frameScale":0.52,"pileDepth":6,"restingLooseness":0.34,"breathAmount":0.28,"advanceCharacter":0.32});
export const CONTROL_DEFINITIONS = Object.freeze([{"id":"frameScale","label":"Frame scale","min":0.34,"max":0.7,"step":0.01,"integer":false},{"id":"pileDepth","label":"Pile depth","min":2,"max":8,"step":1,"integer":true},{"id":"restingLooseness","label":"Resting looseness","min":0,"max":1,"step":0.05,"integer":false},{"id":"breathAmount","label":"Breath amount","min":0,"max":1,"step":0.05,"integer":false},{"id":"advanceCharacter","label":"Advance character","min":0,"max":1,"step":0.05,"integer":false}]);
export const DEFAULT_STAGE = Object.freeze({ width: 960, height: 540 });
export const FPS = 24;

const RATIOS = [16 / 9, 9 / 16, 1, 4 / 5, 2576 / 1080, 3 / 2, 2 / 3, 5 / 4];
const COLORS = ["#c85f4b", "#4d7194", "#d0a54d", "#6c8b67", "#8a668d", "#577f7f", "#b06e82", "#817052"];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const positiveModulo = (v, n) => ((v % n) + n) % n;
const smooth5 = (value) => { const t = clamp(value, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
const smooth3 = (value) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const round = (v, digits = 4) => Number(v.toFixed(digits));
const finite = (v, name) => { if (!Number.isFinite(v)) throw new Error(`${name} must be finite.`); return v; };

function stableHash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function makeItem(index, ratio = RATIOS[index % RATIOS.length], overrides = {}) {
  const id = overrides.id || `media-${String(index + 1).padStart(2, "0")}`;
  return {
    id,
    ratio,
    kind: overrides.kind || (index === 4 ? "video" : "image"),
    sourceOffsetMs: overrides.sourceOffsetMs ?? (index === 4 ? 730 : 0),
    status: overrides.status || "ok",
    alpha: overrides.alpha || false,
    storyRole: overrides.storyRole || "ordinary",
    color: overrides.color || COLORS[index % COLORS.length],
  };
}

function ordinaryEight() {
  return RATIOS.map((ratio, index) => makeItem(index, ratio, {
    storyRole: index === 2 || index === 5 ? "spotlight" : index === 7 ? "finale" : "ordinary",
  }));
}

export function makeFixture(name = "ordinary-eight") {
  const base = ordinaryEight();
  if (name === "one") return [makeItem(0, 16 / 9, { storyRole: "finale" })];
  if (name === "two") return [makeItem(0, 4 / 5), makeItem(1, 16 / 9, { storyRole: "finale" })];
  if (name === "recommended") return Array.from({ length: 6 }, (_, i) => makeItem(i, RATIOS[i % RATIOS.length], { storyRole: i === 6 - 1 ? "finale" : (i === 2 ? "spotlight" : "ordinary") }));
  if (name === "awkward-seven") return base.slice(0, 7).map((item, i, arr) => ({ ...item, storyRole: i === arr.length - 1 ? "finale" : item.storyRole }));
  if (name === "many-24") return Array.from({ length: 24 }, (_, i) => makeItem(i, RATIOS[i % RATIOS.length], { storyRole: i === 23 ? "finale" : (i % 7 === 3 ? "spotlight" : "ordinary") }));
  if (name === "alpha") return base.map((item, i) => i === 3 ? { ...item, id: "media-alpha", alpha: true, color: "#5f7394" } : item);
  if (name === "failed") return base.map((item, i) => i === 2 ? { ...item, id: "media-failed", status: "failed" } : item);
  if (name === "mixed") return base;
  return base;
}

export function sourceVideoTimeMs(storyTimeMs, item) {
  return Math.max(0, finite(storyTimeMs, "storyTimeMs")) + Math.max(0, item.sourceOffsetMs || 0);
}

function validateItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 24) throw new Error("Media count must be 1–24.");
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== "string" || !item.id) throw new Error("Every item needs a stable ID.");
    if (ids.has(item.id)) throw new Error("Media IDs must be unique.");
    ids.add(item.id);
    if (!Number.isFinite(item.ratio) || item.ratio <= 0 || item.ratio > 20) throw new Error("Media ratio is invalid.");
  }
  return items;
}

export function validateParameters(input = {}) {
  const next = { ...DEFAULT_PARAMETERS, ...input };
  for (const control of CONTROL_DEFINITIONS) {
    const value = next[control.id];
    if (!Number.isFinite(value) || value < control.min || value > control.max) throw new Error(`${control.id} is outside its candidate bounds.`);
    if (control.integer && !Number.isInteger(value)) throw new Error(`${control.id} must be an integer.`);
  }
  return next;
}

function fitBox(ratio, maxWidth, maxHeight) {
  let width = maxWidth;
  let height = width / ratio;
  if (height > maxHeight) { height = maxHeight; width = height * ratio; }
  return { width, height };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  if (typeof value === "number") return round(value, 6);
  return value;
}
export function canonicalFrame(frame) {
  const copy = { ...frame, cards: frame.cards.map((card) => ({ ...card })) };
  delete copy.debug;
  return canonical(copy);
}

function artworkMarkup(item, width, height, silhouette) {
  const x = -width / 2, y = -height / 2;
  if (silhouette) return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#111"/>`;
  if (item.status === "failed") {
    return `<g data-source-artwork="failed"><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#d8d4cc"/><path d="M ${x} ${y} L ${x + width} ${y + height} M ${x + width} ${y} L ${x} ${y + height}" stroke="#504d49" stroke-width="${Math.max(2, Math.min(width,height)*0.025)}"/><text x="0" y="4" text-anchor="middle" font-family="sans-serif" font-size="${Math.max(9, Math.min(width,height)*0.09)}" fill="#302f2d">MISSING · ${item.id}</text></g>`;
  }
  if (item.alpha) {
    const r = Math.min(width, height) * 0.34;
    return `<g data-source-artwork="alpha"><circle cx="0" cy="0" r="${r}" fill="${item.color}" opacity="0.24"/><circle cx="0" cy="0" r="${r*0.78}" fill="${item.color}" opacity="0.48"/><circle cx="0" cy="0" r="${r*0.56}" fill="${item.color}" opacity="0.74"/><circle cx="0" cy="0" r="${r*0.34}" fill="${item.color}"/><path d="M ${-r*0.58} 0 H ${r*0.58}" stroke="#fff" stroke-width="${Math.max(2,r*0.05)}" opacity="0.9"/></g>`;
  }
  const h = stableHash(item.id);
  const inset = Math.max(4, Math.min(width, height) * 0.08);
  const stripe = Math.max(3, Math.min(width, height) * 0.035);
  const circleX = ((h % 43) / 42 - 0.5) * width * 0.34;
  const circleY = (((h >>> 6) % 41) / 40 - 0.5) * height * 0.3;
  return `<g data-source-artwork="opaque"><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${item.color}"/><rect x="${x+inset}" y="${y+inset}" width="${Math.max(1,width-inset*2)}" height="${stripe}" fill="#f6f2e8" opacity="0.9"/><circle cx="${circleX}" cy="${circleY}" r="${Math.min(width,height)*0.18}" fill="#1f2326" opacity="0.82"/><path d="M ${x+inset} ${y+height-inset} H ${x+width-inset}" stroke="#f6f2e8" stroke-width="${stripe*0.7}"/><text x="${x+inset}" y="${y+height-inset*1.45}" font-family="sans-serif" font-size="${Math.max(8, Math.min(width,height)*0.07)}" fill="#f6f2e8">${item.id}</text></g>`;
}

export function renderSceneSvg(frame, options = {}) {
  const width = frame.stage.width, height = frame.stage.height;
  const silhouette = Boolean(options.silhouette);
  let background = "";
  if (options.checker) {
    background = `<defs><pattern id="checker" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="32" fill="#f2f2f2"/><rect width="16" height="16" fill="#bdbdbd"/><rect x="16" y="16" width="16" height="16" fill="#bdbdbd"/></pattern></defs><rect width="100%" height="100%" fill="url(#checker)"/>`;
  } else if (options.matte) background = `<rect width="100%" height="100%" fill="${options.matte}" data-reviewer-matte="true"/>`;
  const cards = [...frame.cards].filter((card) => card.visible).sort((a,b) => a.z - b.z || a.sourceIndex - b.sourceIndex);
  const cardSvg = cards.map((card) => {
    const projectedX = Math.max(0.12, Math.cos((card.projectedYaw || 0) * Math.PI / 180));
    return `<g data-id="${card.id}" data-z="${card.z}" data-occluded="${card.occluded}" transform="translate(${card.x} ${card.y}) rotate(${card.rotation}) scale(${card.scale * projectedX} ${card.scale})">${artworkMarkup(card.item, card.width, card.height, silhouette)}</g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-scene="${SCENE_ID}" data-phase="${frame.phase}">${background}${cardSvg}</svg>`;
}

function eventAt(timeline, timeMs) {
  const clamped = clamp(timeMs, 0, timeline.durationMs);
  const event = timeline.events.find((candidate) => clamped >= candidate.startMs && clamped < candidate.endMs) || timeline.events[timeline.events.length - 1];
  const duration = Math.max(1, event.endMs - event.startMs);
  const progress = event.type === "terminal" ? 1 : clamp((clamped - event.startMs) / duration, 0, 1);
  return { event, progress, timeMs: clamped };
}

function commonFrame(timeline, items, parameters, stage, timeMs, phase, phaseProgress, cards, extra = {}) {
  const sourceVideoTimes = Object.fromEntries(items.filter((item) => item.kind === "video").map((item) => [item.id, sourceVideoTimeMs(timeMs, item)]));
  return {
    sceneId: SCENE_ID,
    storyTimeMs: round(timeMs, 3),
    phase,
    phaseProgress: round(phaseProgress, 6),
    stage: { width: stage.width, height: stage.height },
    parameters,
    renderPolicy: { fit: "contain", artworkOpacity: 1, artworkFilter: "none", artworkBlend: "normal", sceneBackground: "none" },
    sourceVideoTimes,
    terminal: timeMs >= timeline.durationMs,
    cards: cards.map((card) => ({ ...card, x:round(card.x), y:round(card.y), width:round(card.width), height:round(card.height), scale:round(card.scale), rotation:round(card.rotation), projectedYaw:round(card.projectedYaw || 0), z:Math.round(card.z), opacity:1, filter:"none", blend:"normal" })),
    ...extra,
  };
}

function rotated(ids,cycles,reverse){const n=ids.length;if(n<2)return[...ids];const k=positiveModulo(cycles,n);return reverse?ids.slice(n-k).concat(ids.slice(0,n-k)):ids.slice(k).concat(ids.slice(0,k));}
export function compileTimeline(options={}){
 const items=validateItems(options.items||makeFixture("recommended"));const parameters=validateParameters(options.parameters);const mode=options.mode||"automatic",direction=options.direction==="reverse"?"reverse":"forward";const cycleCount=items.length===1?1:(mode==="directed"?4:items.length);const profile=[2,2,1,2];let elapsed=0;const events=[];
 const add=(type,duration,data={})=>{const event={id:`${String(events.length).padStart(2,"0")}-${type}`,type,startMs:elapsed,endMs:elapsed+duration,...data};events.push(event);elapsed+=duration;return event;};
 add("entry",650);for(let cycle=0;cycle<cycleCount;cycle+=1){const speed=mode==="directed"?(profile[cycle]||1):1;add("calm-cycle",2400/speed,{cycleIndex:cycle,boundaries:[{label:"rest-end",at:0.55},{label:"lift-end",at:0.64},{label:"drift-end",at:0.76},{label:"handoff-end",at:0.82},{label:"return-end",at:0.93}]});}
 add("finale-hold",1000,{cycleIndex:cycleCount});add("exit",600,{cycleIndex:cycleCount});const minimumHonestDurationMs=650+cycleCount*1700+1000+600;
 if(mode==="fixed-duration"){const target=Number(options.fixedDurationMs||elapsed);if(!Number.isFinite(target)||target<minimumHonestDurationMs)throw new Error(`Fixed duration is below honest minimum ${minimumHonestDurationMs} ms.`);const scalable=events.filter(e=>e.type==="calm-cycle");const fixed=events.filter(e=>!scalable.includes(e)).reduce((s,e)=>s+e.endMs-e.startMs,0);const scale=(target-fixed)/scalable.reduce((s,e)=>s+e.endMs-e.startMs,0);let cursor=0;for(const e of events){let d=e.endMs-e.startMs;if(scalable.includes(e))d*=scale;e.startMs=cursor;e.endMs=cursor+d;cursor+=d;}elapsed=target;events[events.length-1].endMs=target;}
 events.push({id:"terminal",type:"terminal",startMs:elapsed,endMs:elapsed,cycleIndex:cycleCount});return{sceneId:SCENE_ID,mode,direction,durationMs:elapsed,terminalTimeMs:elapsed,minimumHonestDurationMs,events,baseOrder:items.map(i=>i.id),cycleCount,parameters};
}
export function evaluateScene(input={}){
 const items=validateItems(input.items||makeFixture("recommended"));const parameters=validateParameters(input.parameters);const stage=input.stage||DEFAULT_STAGE;const timeline=input.timeline||compileTimeline({items,parameters,mode:input.mode,direction:input.direction,fixedDurationMs:input.fixedDurationMs});const{event,progress,timeMs}=eventAt(timeline,finite(input.storyTimeMs??0,"storyTimeMs"));const reverse=timeline.direction==="reverse";const completed=event.type==="calm-cycle"?event.cycleIndex:(event.cycleIndex??0);const before=rotated(timeline.baseOrder,completed,reverse),after=rotated(timeline.baseOrder,completed+(event.type==="calm-cycle"?1:0),reverse);const activeId=before[0];const signed=reverse?-1:1;const p=event.type==="calm-cycle"?progress:0;const baseH=Math.min(stage.height*parameters.frameScale,stage.width*0.66);const baseBox=fitBox(16/9,stage.width*0.6,baseH);const visibleDepth=Math.min(parameters.pileDepth,items.length);const advanceP=event.type==="calm-cycle"?smooth5(clamp((p-0.64)/0.29,0,1)):0;const ids=event.type==="calm-cycle"?before:after;const cards=[];
 ids.forEach((id,depth)=>{if(depth>=visibleDepth&&id!==activeId)return;const item=items.find(x=>x.id===id);const h=stableHash(id);const loose=parameters.restingLooseness;const dx=(((h%31)/30)-0.5)*stage.width*0.018*loose;const dy=((((h>>>5)%29)/28)-0.5)*stage.height*0.012*loose;const dr=((((h>>>10)%23)/22)-0.5)*2.4*loose;let slot=depth;let x=stage.width/2+dx+slot*stage.width*0.009;let y=stage.height/2+dy+slot*stage.height*0.006;let rotation=dr+slot*0.18*(slot%2?1:-1);let scale=1-slot*0.012;let z=80-slot;let occluded=false;
 const breath=(0.5-0.5*Math.cos(Math.PI*2*clamp(p/0.55,0,1)))*parameters.breathAmount; if(event.type==="calm-cycle"&&p<=0.55){y-=stage.height*0.0045*breath*(1-depth/Math.max(1,visibleDepth));scale*=1+0.003*breath;}
 if(event.type==="entry"){const q=smooth5(progress);x+=signed*(1-q)*stage.width*0.06;y+=(1-q)*stage.height*(0.04+depth*0.01);}
 if(event.type==="calm-cycle"&&id===activeId&&items.length>1){const corridor=stage.width*(0.075+parameters.advanceCharacter*0.065);if(p<0.55){}else if(p<0.64){const q=smooth5((p-0.55)/0.09);y-=stage.height*0.018*q;rotation+=signed*0.8*q;}else if(p<0.76){const q=smooth5((p-0.64)/0.12);x+=signed*corridor*q;y-=stage.height*0.018;rotation+=signed*lerp(0.8,1.8,q);z=100;}else if(p<0.82){const q=smooth5((p-0.76)/0.06);x+=signed*corridor*(1-q*0.55);y=lerp(y-stage.height*0.018,stage.height/2+stage.height*0.025,q);rotation=lerp(signed*1.8,signed*0.5,q);z=q<0.55?100:-10;occluded=q>=0.45;}else if(p<0.93){const q=smooth5((p-0.82)/0.11);const bottom=visibleDepth-1;x=lerp(stage.width/2+signed*corridor*0.45,stage.width/2+bottom*stage.width*0.009,q);y=lerp(stage.height/2+stage.height*0.025,stage.height/2+bottom*stage.height*0.006,q);rotation=lerp(signed*0.5,bottom*0.18*(bottom%2?1:-1),q);scale=lerp(0.97,1-bottom*0.012,q);z=-10;occluded=q<0.58;}else{const q=smooth5((p-0.93)/0.07);const bottom=visibleDepth-1;x=stage.width/2+bottom*stage.width*0.009+dx*(1-q);y=stage.height/2+bottom*stage.height*0.006+dy*(1-q);rotation=lerp(signed*0.2,bottom*0.18*(bottom%2?1:-1),q);scale=1-bottom*0.012;z=80-bottom;}}
 else if(event.type==="calm-cycle"&&items.length>1&&depth>0){const nd=depth-1;x=lerp(x,stage.width/2+nd*stage.width*0.009+dx,advanceP);y=lerp(y,stage.height/2+nd*stage.height*0.006+dy,advanceP);scale=lerp(scale,1-nd*0.012,advanceP);z=Math.round(80-lerp(depth,nd,advanceP));}
 if(event.type==="calm-cycle"&&items.length===1){const b=(0.5-0.5*Math.cos(Math.PI*2*p))*parameters.breathAmount;y-=stage.height*0.006*b;scale*=1+0.004*b;}
 if(event.type==="exit"||event.type==="terminal"){const q=event.type==="terminal"?1:smooth5(progress);y+=stage.height*1.12*q;}
 const box=fitBox(item.ratio,baseBox.width,baseBox.height);cards.push({id,item,sourceIndex:items.findIndex(x=>x.id===id),x,y,width:box.width,height:box.height,scale,rotation,projectedYaw:0,z,visible:y-box.height*scale/2<stage.height*1.1,occluded});});
 return commonFrame(timeline,items,parameters,stage,timeMs,event.type,event.type==="calm-cycle"?p:progress,cards,{permutationOrFocus:event.type==="calm-cycle"&&p<1?before:after,activeId:event.type==="calm-cycle"?activeId:null,coveredHandoff:event.type==="calm-cycle"&&p>=0.787&&p<0.884});
}

export function evidenceTimes(timeline) {
  const nonTerminal = timeline.events.filter((event) => event.type !== "terminal");
  const characteristic = nonTerminal.find((event) => /flight|travel|drift|promotion|approach|transition|cycle/.test(event.type)) || nonTerminal[Math.min(1, nonTerminal.length - 1)] || timeline.events[0];
  const hold = nonTerminal.find((event) => /hold|dwell|rest/.test(event.type)) || characteristic;
  const finale = [...nonTerminal].reverse().find((event) => /finale|hold/.test(event.type)) || nonTerminal[nonTerminal.length - 1];
  const exit = nonTerminal.find((event) => event.type === "exit") || finale;
  return {
    start: 0,
    characteristic: (characteristic.startMs + characteristic.endMs) / 2,
    hold: (hold.startMs + hold.endMs) / 2,
    finale: (finale.startMs + finale.endMs) / 2,
    exit: (exit.startMs + exit.endMs) / 2,
    seam: timeline.durationMs,
  };
}

export function canonicalSamples(timeline, fps = FPS) {
  const epsilon = 1000 / fps;
  const samples = [];
  const seen = new Set();
  const add = (label, timeMs) => {
    const bounded = clamp(timeMs, 0, timeline.durationMs);
    const key = `${label}:${bounded.toFixed(6)}`;
    if (!seen.has(key)) { seen.add(key); samples.push({ label, timeMs: round(bounded, 6) }); }
  };
  for (const event of timeline.events) {
    add(`${event.id}:before-start`, event.startMs - epsilon);
    add(`${event.id}:start`, event.startMs);
    add(`${event.id}:after-start`, event.startMs + epsilon);
    if (event.boundaries) {
      for (const boundary of event.boundaries) {
        const t = event.startMs + (event.endMs - event.startMs) * boundary.at;
        add(`${event.id}:${boundary.label}:before`, t - epsilon);
        add(`${event.id}:${boundary.label}`, t);
        add(`${event.id}:${boundary.label}:after`, t + epsilon);
      }
    }
    add(`${event.id}:before-end`, event.endMs - epsilon);
    add(`${event.id}:end`, event.endMs);
    add(`${event.id}:after-end`, event.endMs + epsilon);
  }
  return samples.sort((a,b) => a.timeMs - b.timeMs || a.label.localeCompare(b.label));
}

export const internal = { clamp, lerp, positiveModulo, smooth5, smooth3, stableHash, fitBox, eventAt, commonFrame, validateItems };
