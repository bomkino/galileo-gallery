export const SCENE_ID = "hero-deck-object";
export const SCENE_NAME = "Hero Deck Object";
export const DEFAULT_PARAMETERS = Object.freeze({"heroScale":0.62,"supportSpread":0.16,"depth":0.12,"restingYaw":4,"handoffCharacter":0.48});
export const CONTROL_DEFINITIONS = Object.freeze([{"id":"heroScale","label":"Hero scale","min":0.42,"max":0.78,"step":0.01,"integer":false},{"id":"supportSpread","label":"Support spread","min":0.08,"max":0.28,"step":0.01,"integer":false},{"id":"depth","label":"Depth","min":0.04,"max":0.22,"step":0.01,"integer":false},{"id":"restingYaw","label":"Resting yaw","min":0,"max":10,"step":0.5,"integer":false},{"id":"handoffCharacter","label":"Handoff character","min":0,"max":1,"step":0.05,"integer":false}]);
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

export function compileTimeline(options={}){
 const items=validateItems(options.items||makeFixture("recommended"));const parameters=validateParameters(options.parameters);const mode=options.mode||"automatic",direction=options.direction==="reverse"?"reverse":"forward";const order=direction==="reverse"?[...items].reverse():items;const transfers=items.length===1?0:(mode==="directed"?4:order.length-1);const profile=[2,2,1,2];let elapsed=0;const events=[];const add=(type,duration,data={})=>{const event={id:`${String(events.length).padStart(2,"0")}-${type}`,type,startMs:elapsed,endMs:elapsed+duration,...data};events.push(event);elapsed+=duration;return event;};
 add("assembly",650,{heroStep:0});if(items.length===1)add("hero-rest",1500,{heroStep:0});else for(let step=0;step<transfers;step+=1){const speed=mode==="directed"?(profile[step]||1):1;add("handoff",1800/speed,{heroStep:step,boundaries:[{label:"rest-end",at:0.25},{label:"anticipation-end",at:0.36},{label:"outgoing-mid",at:0.50},{label:"authority-crossing",at:0.62},{label:"promotion-end",at:0.72},{label:"settle-end",at:0.90}]});}
 add("finale-hold",1000,{heroStep:transfers});add("exit",650,{heroStep:transfers});const minimumHonestDurationMs=650+transfers*1300+(items.length===1?1200:0)+1000+650;
 if(mode==="fixed-duration"){const target=Number(options.fixedDurationMs||elapsed);if(!Number.isFinite(target)||target<minimumHonestDurationMs)throw new Error(`Fixed duration is below honest minimum ${minimumHonestDurationMs} ms.`);const scalable=events.filter(e=>e.type==="handoff"||e.type==="hero-rest");const fixed=events.filter(e=>!scalable.includes(e)).reduce((s,e)=>s+e.endMs-e.startMs,0);const scale=(target-fixed)/scalable.reduce((s,e)=>s+e.endMs-e.startMs,0);let cursor=0;for(const e of events){let d=e.endMs-e.startMs;if(scalable.includes(e))d*=scale;e.startMs=cursor;e.endMs=cursor+d;cursor+=d;}elapsed=target;events[events.length-1].endMs=target;}
 events.push({id:"terminal",type:"terminal",startMs:elapsed,endMs:elapsed,heroStep:transfers});return{sceneId:SCENE_ID,mode,direction,durationMs:elapsed,terminalTimeMs:elapsed,minimumHonestDurationMs,events,order:order.map(i=>i.id),transfers,parameters};
}
export function evaluateScene(input={}){
 const items=validateItems(input.items||makeFixture("recommended"));const parameters=validateParameters(input.parameters);const stage=input.stage||DEFAULT_STAGE;const timeline=input.timeline||compileTimeline({items,parameters,mode:input.mode,direction:input.direction,fixedDurationMs:input.fixedDurationMs});const{event,progress,timeMs}=eventAt(timeline,finite(input.storyTimeMs??0,"storyTimeMs"));const order=timeline.order;const step=event.heroStep??0;const currentId=order[positiveModulo(step,order.length)];const nextId=order[positiveModulo(step+1,order.length)];const p=event.type==="handoff"?progress:0;const authorityNext=event.type==="handoff"&&p>=0.62;const motionSign=timeline.direction==="reverse"?-1:1;const heroId=authorityNext?nextId:currentId;const maxHeroH=Math.min(stage.height*parameters.heroScale,stage.width*0.72);const baseBox=fitBox(16/9,stage.width*0.68,maxHeroH);const cards=[];
 order.forEach((id,index)=>{const item=items.find(x=>x.id===id);let relative=positiveModulo(index-step,order.length);if(relative>order.length/2)relative-=order.length;let role=relative===0?"hero":relative===1?"incoming":relative===-1?"outgoing":"support";let x=stage.width/2,y=stage.height/2,scale=1,rotation=0,projectedYaw=0,z=10-Math.abs(relative),visible=Math.abs(relative)<=3,occluded=false;const signed=relative<0?-1:1;const supportDistance=Math.min(4,Math.abs(relative));if(role!=="hero"){x+=signed*stage.width*parameters.supportSpread*(0.72+supportDistance*0.18);y+=stage.height*0.035*supportDistance;scale=1-parameters.depth*(0.6+supportDistance*0.55);rotation=signed*parameters.restingYaw*(0.55+supportDistance*0.15);projectedYaw=-signed*parameters.restingYaw;z=60-supportDistance*8;}
 if(event.type==="assembly"){const q=smooth5(progress);x=lerp(stage.width/2+signed*stage.width*0.18,x,q);y=lerp(stage.height/2+stage.height*(0.16+supportDistance*0.02),y,q);if(role==="hero")scale*=lerp(0.9,1,q);}
 if(event.type==="handoff"){
   const curve=parameters.handoffCharacter;
   if(id===currentId){if(p<0.25){}else if(p<0.36){const q=smooth5((p-0.25)/0.11);x-=motionSign*stage.width*0.025*q;y-=stage.height*0.012*q;rotation-=motionSign*1.2*q;z=100;}else{const q=smooth5((p-0.36)/0.54);x=lerp(stage.width/2-motionSign*stage.width*0.025,stage.width/2-motionSign*stage.width*parameters.supportSpread*(0.82+curve*0.18),q);y=lerp(stage.height/2-stage.height*0.012,stage.height/2+stage.height*0.04,q);scale=lerp(1,1-parameters.depth*0.9,q);rotation=lerp(-motionSign*1.2,-motionSign*parameters.restingYaw,q);projectedYaw=lerp(0,motionSign*parameters.restingYaw,q);z=p<0.62?100:68;}}
   else if(id===nextId){const startX=stage.width/2+motionSign*stage.width*parameters.supportSpread*0.9;if(p<0.25){x=startX;scale=1-parameters.depth*0.9;rotation=motionSign*parameters.restingYaw;projectedYaw=-motionSign*parameters.restingYaw;z=68;}else{const q=smooth5(clamp((p-0.25)/0.47,0,1));x=lerp(startX,stage.width/2,q);y=lerp(stage.height/2+stage.height*0.04,stage.height/2,q);scale=lerp(1-parameters.depth*0.9,1,q);rotation=lerp(motionSign*parameters.restingYaw,0,q);projectedYaw=lerp(-motionSign*parameters.restingYaw,0,q);z=p>=0.62?100:76;}}
   else {const yieldP=smooth5(clamp((p-0.25)/0.47,0,1));x+=signed*stage.width*0.025*Math.sin(Math.PI*yieldP);}
 }
 if(items.length===1&&(event.type==="hero-rest"||event.type==="finale-hold")){const b=0.5-0.5*Math.cos(Math.PI*2*progress);y-=stage.height*0.005*b;scale*=1+0.003*b;z=100;}
 if(event.type==="finale-hold"&&id===currentId){z=100;}
 if(event.type==="exit"||event.type==="terminal"){const q=event.type==="terminal"?1:smooth5(progress);x+=signed*stage.width*0.35*q;y+=stage.height*0.8*q;}
 const box=fitBox(item.ratio,baseBox.width,baseBox.height);cards.push({id,item,sourceIndex:items.findIndex(x=>x.id===id),x,y,width:box.width,height:box.height,scale,rotation,projectedYaw,z,visible:visible&&y-box.height*scale/2<stage.height*1.1,occluded});});
 return commonFrame(timeline,items,parameters,stage,timeMs,event.type,event.type==="handoff"?p:progress,cards,{permutationOrFocus:{heroId,order},heroId,outgoingId:event.type==="handoff"?currentId:null,incomingId:event.type==="handoff"?nextId:null,authorityTransferred:authorityNext});
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
