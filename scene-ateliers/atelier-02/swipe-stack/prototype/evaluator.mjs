export const SCENE_ID = "swipe-stack";
export const SCENE_NAME = "Swipe Stack";
export const DEFAULT_PARAMETERS = Object.freeze({"frameScale":0.5,"pileSpread":0.016,"visibleDepth":5,"throwArc":0.5,"settleCharacter":0.42});
export const CONTROL_DEFINITIONS = Object.freeze([{"id":"frameScale","label":"Frame scale","min":0.32,"max":0.68,"step":0.01,"integer":false},{"id":"pileSpread","label":"Pile spread","min":0.004,"max":0.035,"step":0.001,"integer":false},{"id":"visibleDepth","label":"Visible depth","min":2,"max":8,"step":1,"integer":true},{"id":"throwArc","label":"Throw arc","min":0.28,"max":0.72,"step":0.01,"integer":false},{"id":"settleCharacter","label":"Settle character","min":0,"max":1,"step":0.05,"integer":false}]);
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
  if (name === "recommended") return Array.from({ length: 5 }, (_, i) => makeItem(i, RATIOS[i % RATIOS.length], { storyRole: i === 5 - 1 ? "finale" : (i === 2 ? "spotlight" : "ordinary") }));
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

function rotated(ids, cycles, reverse) {
  const n=ids.length; if (n<2) return [...ids];
  const k=positiveModulo(cycles,n);
  return reverse ? ids.slice(n-k).concat(ids.slice(0,n-k)) : ids.slice(k).concat(ids.slice(0,k));
}
export function compileTimeline(options={}) {
  const items=validateItems(options.items||makeFixture("recommended"));
  const parameters=validateParameters(options.parameters);
  const mode=options.mode||"automatic", direction=options.direction==="reverse"?"reverse":"forward";
  const cycleCount=items.length===1?1:(mode==="directed"?4:items.length);
  const profile=[2,2,1,2]; let elapsed=0; const events=[];
  const add=(type,duration,data={})=>{const event={id:`${String(events.length).padStart(2,"0")}-${type}`,type,startMs:elapsed,endMs:elapsed+duration,...data};events.push(event);elapsed+=duration;return event;};
  add("entry",420);
  for(let cycle=0;cycle<cycleCount;cycle+=1){
    const speed=mode==="directed"?(profile[cycle]||1):1;
    add("cycle",1500/speed,{cycleIndex:cycle,boundaries:[{label:"anticipation-end",at:0.08},{label:"release-end",at:0.16},{label:"front-flight-end",at:0.40},{label:"occlusion-crossing",at:0.52},{label:"deck-advance-end",at:0.68},{label:"rear-tuck-end",at:0.84}]});
    add("rest",300,{cycleIndex:cycle+1});
  }
  add("finale-hold",720,{cycleIndex:cycleCount});
  add("exit",480,{cycleIndex:cycleCount});
  const cycleMinimumMs=1100, restMinimumMs=180;
  const minimumHonestDurationMs=420+cycleCount*(cycleMinimumMs+restMinimumMs)+720+480;
  if(mode==="fixed-duration"){
    const target=Number(options.fixedDurationMs||elapsed); if(!Number.isFinite(target)||target<minimumHonestDurationMs) throw new Error(`Fixed duration is below honest minimum ${minimumHonestDurationMs} ms.`);
    const durations=new Map(events.map(e=>[e.id,e.endMs-e.startMs]));
    let delta=target-elapsed;
    if(delta<0){
      let compression=-delta;
      for(const [type,floor] of [["rest",restMinimumMs],["cycle",cycleMinimumMs]]){
        const group=events.filter(e=>e.type===type); const capacity=group.reduce((sum,e)=>sum+Math.max(0,durations.get(e.id)-floor),0); const take=Math.min(compression,capacity);
        for(const e of group){const own=Math.max(0,durations.get(e.id)-floor);durations.set(e.id,durations.get(e.id)-(capacity?take*own/capacity:0));}
        compression-=take;
      }
      if(compression>1e-6) throw new Error("Fixed compiler exhausted honest compression capacity.");
    }else if(delta>0){
      const rests=events.filter(e=>e.type==="rest"); const recipients=rests.length?rests:events.filter(e=>e.type==="cycle");
      for(const e of recipients)durations.set(e.id,durations.get(e.id)+delta/recipients.length);
    }
    let cursor=0;for(const e of events){const d=durations.get(e.id);e.startMs=cursor;e.endMs=cursor+d;cursor+=d;}elapsed=target;events[events.length-1].endMs=target;
  }
  events.push({id:"terminal",type:"terminal",startMs:elapsed,endMs:elapsed,cycleIndex:cycleCount});
  return {sceneId:SCENE_ID,mode,direction,durationMs:elapsed,terminalTimeMs:elapsed,minimumHonestDurationMs,events,baseOrder:items.map(i=>i.id),cycleCount,parameters};
}

export function evaluateScene(input={}){
  const items=validateItems(input.items||makeFixture("recommended")); const parameters=validateParameters(input.parameters); const stage=input.stage||DEFAULT_STAGE;
  const timeline=input.timeline||compileTimeline({items,parameters,mode:input.mode,direction:input.direction,fixedDurationMs:input.fixedDurationMs});
  const {event,progress,timeMs}=eventAt(timeline,finite(input.storyTimeMs??0,"storyTimeMs")); const reverse=timeline.direction==="reverse";
  const completed=event.type==="cycle"?event.cycleIndex:(event.cycleIndex??0); const beforeOrder=rotated(timeline.baseOrder,completed,reverse); const afterOrder=rotated(timeline.baseOrder,completed+(event.type==="cycle"?1:0),reverse);
  const activeId=beforeOrder[0]; const signed=reverse?-1:1; const maxH=Math.min(stage.height*parameters.frameScale,stage.width*0.62); const baseBox=fitBox(16/9,stage.width*0.58,maxH);
  const cycleP=event.type==="cycle"?progress:0; const advanceP=event.type==="cycle"?smooth5(clamp((cycleP-0.28)/0.40,0,1)):0; const settledOrder=(event.type==="cycle"&&cycleP<1)?beforeOrder:afterOrder;
  const ids=event.type==="cycle"?beforeOrder:settledOrder; const cards=[];
  ids.forEach((id,depthIndex)=>{
    const item=items.find(x=>x.id===id); const depth=depthIndex; const visibleDepth=Math.min(parameters.visibleDepth,items.length); if(depth>=visibleDepth && id!==activeId)return;
    let x=stage.width/2+depth*stage.width*parameters.pileSpread; let y=stage.height/2+depth*stage.height*parameters.pileSpread*0.48; let scale=1-depth*0.018; let rotation=(depth%2?1:-1)*depth*0.45; let z=80-depth; let occluded=false;
    if(event.type==="entry"){const p=smooth5(progress);x+=signed*(1-p)*stage.width*0.18;y+=(1-p)*stage.height*0.14;}
    if(event.type==="cycle"&&id===activeId&&items.length>1){
      const arc=parameters.throwArc; if(cycleP<0.08){const p=smooth5(cycleP/0.08);x-=signed*stage.width*0.025*p;rotation-=signed*2*p;z=120;}
      else if(cycleP<0.16){const p=smooth5((cycleP-0.08)/0.08);x+=signed*stage.width*0.08*p;y-=stage.height*0.03*p;rotation+=signed*6*p;z=120;}
      else if(cycleP<0.40){const p=smooth5((cycleP-0.16)/0.24);x+=signed*stage.width*arc*p;y-=stage.height*(0.08+0.18*Math.sin(Math.PI*p));rotation+=signed*(7+20*p);z=120;}
      else if(cycleP<0.52){const p=smooth5((cycleP-0.40)/0.12);x+=signed*stage.width*lerp(arc,0.13,p);y+=stage.height*lerp(-0.08,0.035,p);rotation+=signed*lerp(27,3,p);scale*=lerp(1,0.94,p);z=p<0.72?120:-20;occluded=p>=0.62;}
      else if(cycleP<0.84){const p=smooth5((cycleP-0.52)/0.32);const bottom=Math.min(visibleDepth-1,items.length-1);x=lerp(stage.width/2+signed*stage.width*0.13,stage.width/2+bottom*stage.width*parameters.pileSpread,p);y=lerp(stage.height/2+stage.height*0.035,stage.height/2+bottom*stage.height*parameters.pileSpread*0.48,p);rotation=lerp(signed*3,(bottom%2?1:-1)*bottom*0.45,p);scale=lerp(0.94,1-bottom*0.018,p);z=-20;occluded=p<0.58;}
      else {const p=smooth5((cycleP-0.84)/0.16);const bottom=Math.min(visibleDepth-1,items.length-1);const settleAmp=(0.004+parameters.settleCharacter*0.008)*stage.width*(1-p)*Math.sin(p*Math.PI*2);x=stage.width/2+bottom*stage.width*parameters.pileSpread+settleAmp;y=stage.height/2+bottom*stage.height*parameters.pileSpread*0.48;rotation=(bottom%2?1:-1)*bottom*0.45;scale=1-bottom*0.018;z=80-bottom;}
    } else if(event.type==="cycle"&&items.length>1&&depthIndex>0){
      const nextDepth=depthIndex-1;x=lerp(x,stage.width/2+nextDepth*stage.width*parameters.pileSpread,advanceP);y=lerp(y,stage.height/2+nextDepth*stage.height*parameters.pileSpread*0.48,advanceP);scale=lerp(scale,1-nextDepth*0.018,advanceP);rotation=lerp(rotation,(nextDepth%2?1:-1)*nextDepth*0.45,advanceP);z=Math.round(80-lerp(depthIndex,nextDepth,advanceP));
    } else if(event.type==="cycle"&&items.length===1){const p=0.5-0.5*Math.cos(Math.PI*2*cycleP);y-=stage.height*0.012*p;scale*=1+0.018*p;}
    if(event.type==="exit"||event.type==="terminal"){const p=event.type==="terminal"?1:smooth5(progress);y+=stage.height*1.15*p;}
    const box=fitBox(item.ratio,baseBox.width,baseBox.height); const visible=x+box.width*scale/2>-stage.width*0.1&&x-box.width*scale/2<stage.width*1.1&&y-box.height*scale/2<stage.height*1.1;
    cards.push({id,item,sourceIndex:items.findIndex(x=>x.id===id),x,y,width:box.width,height:box.height,scale,rotation,projectedYaw:0,z,visible,occluded});
  });
  return commonFrame(timeline,items,parameters,stage,timeMs,event.type,event.type==="cycle"?cycleP:progress,cards,{permutationOrFocus:event.type==="cycle"&&cycleP<1?beforeOrder:afterOrder,activeId:event.type==="cycle"?activeId:null,coveredHandoff:event.type==="cycle"&&cycleP>=0.474&&cycleP<0.705});
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
