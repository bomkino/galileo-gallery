export const SCENE_ID = "opening-reel";
export const SCENE_NAME = "Opening Reel";
export const DEFAULT_PARAMETERS = Object.freeze({"frameScale":0.46,"gap":0.08,"travelCharacter":0.45,"spotlightScale":1.38,"finaleScale":1.62});
export const CONTROL_DEFINITIONS = Object.freeze([{"id":"frameScale","label":"Frame scale","min":0.28,"max":0.72,"step":0.01,"integer":false},{"id":"gap","label":"Gap","min":0.02,"max":0.18,"step":0.005,"integer":false},{"id":"travelCharacter","label":"Travel character","min":0,"max":1,"step":0.05,"integer":false},{"id":"spotlightScale","label":"Spotlight scale","min":1.1,"max":1.65,"step":0.01,"integer":false},{"id":"finaleScale","label":"Finale scale","min":1.15,"max":1.85,"step":0.01,"integer":false}]);
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
    storyRole: index === 1 || index === 3 || index === 5 ? "spotlight" : index === 7 ? "finale" : "ordinary",
  }));
}

export function makeFixture(name = "ordinary-eight") {
  const base = ordinaryEight();
  if (name === "one") return [makeItem(0, 16 / 9, { storyRole: "finale" })];
  if (name === "two") return [makeItem(0, 4 / 5), makeItem(1, 16 / 9, { storyRole: "finale" })];
  if (name === "recommended") return Array.from({ length: 8 }, (_, i) => makeItem(i, RATIOS[i % RATIOS.length], { storyRole: i === 8 - 1 ? "finale" : ([1,3,5].includes(i) ? "spotlight" : "ordinary") }));
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

export function compileTimeline(options = {}) {
  const items = validateItems(options.items || makeFixture("ordinary-eight"));
  const parameters = validateParameters(options.parameters);
  const mode = options.mode || "automatic";
  const direction = options.direction === "reverse" ? "reverse" : "forward";
  const included = items.filter((item) => item.storyRole !== "skip");
  const ordered = direction === "reverse" ? [...included].reverse() : included;
  const cueItems = ordered.filter((item, index) => item.storyRole === "spotlight" || item.storyRole === "finale" || index === ordered.length - 1);
  const uniqueCues = cueItems.filter((item, index, arr) => arr.findIndex((x) => x.id === item.id) === index);
  const finale = uniqueCues[uniqueCues.length - 1] || ordered[ordered.length - 1];
  let elapsed = 0;
  const events = [];
  const add = (type, duration, data = {}) => { const event = { id:`${String(events.length).padStart(2,"0")}-${type}`, type, startMs:elapsed, endMs:elapsed+duration, ...data }; events.push(event); elapsed += duration; return event; };
  add("lead-in", 450, { focusIndex: direction === "reverse" ? ordered.length : -1 });
  let previous = direction === "reverse" ? ordered.length : -1;
  const speedProfile = [2,2,1,2];
  uniqueCues.forEach((item, cueIndex) => {
    const target = ordered.findIndex((x) => x.id === item.id);
    const distance = Math.max(1, Math.abs(target - previous));
    const speed = mode === "directed" ? (speedProfile[cueIndex] || 1) : 1;
    const travel = Math.max(420, (520 + distance * 150) / speed);
    add("travel", travel, { fromIndex:previous, toIndex:target, targetId:item.id, cueIndex });
    if (item.id === finale.id) {
      add("finale-grow", 500, { targetIndex:target, targetId:item.id });
      add("finale-hold", 900, { targetIndex:target, targetId:item.id });
    } else {
      add("spotlight-grow", 340, { targetIndex:target, targetId:item.id });
      add("spotlight-hold", 620, { targetIndex:target, targetId:item.id });
      add("spotlight-return", 300, { targetIndex:target, targetId:item.id });
    }
    previous = target;
  });
  add("exit", 620, { targetIndex: ordered.findIndex((x) => x.id === finale.id), targetId:finale.id });
  const automaticDurationMs = elapsed;
  const minimumHonestDurationMs = events.reduce((sum,event) => sum + (event.type === "travel" ? Math.min(420,event.endMs-event.startMs) : event.endMs-event.startMs),0);
  if (mode === "fixed-duration") {
    const target = Number(options.fixedDurationMs || automaticDurationMs);
    if (!Number.isFinite(target) || target < minimumHonestDurationMs) throw new Error(`Fixed duration is below honest minimum ${minimumHonestDurationMs} ms.`);
    const delta = target - elapsed;
    const travelEvents = events.filter((event) => event.type === "travel");
    const capacities = new Map(travelEvents.map((event) => [event.id, Math.max(0, (event.endMs - event.startMs) - 420)]));
    const capacityTotal = [...capacities.values()].reduce((sum, value) => sum + value, 0);
    let cursor = 0;
    for (const event of events) {
      let duration = event.endMs - event.startMs;
      if (event.type === "travel" && travelEvents.length) {
        if (delta >= 0) duration += delta / travelEvents.length;
        else duration += delta * (capacityTotal > 0 ? capacities.get(event.id) / capacityTotal : 1 / travelEvents.length);
      }
      if (event.type === "travel" && duration < 420 - 1e-6) throw new Error("Fixed compiler violated minimum travel duration.");
      event.startMs = cursor; event.endMs = cursor + duration; cursor += duration;
    }
    elapsed = target;
    events[events.length - 1].endMs = target;
  }
  events.push({ id:"terminal", type:"terminal", startMs:elapsed, endMs:elapsed, targetId:finale.id, targetIndex:ordered.findIndex((x)=>x.id===finale.id) });
  return { sceneId:SCENE_ID, mode, direction, durationMs:elapsed, terminalTimeMs:elapsed, minimumHonestDurationMs, events, orderedIds:ordered.map((x)=>x.id), includedIds:ordered.map((x)=>x.id), finaleId:finale.id, parameters };
}

export function evaluateScene(input = {}) {
  const items = validateItems(input.items || makeFixture("ordinary-eight"));
  const parameters = validateParameters(input.parameters);
  const stage = input.stage || DEFAULT_STAGE;
  const timeline = input.timeline || compileTimeline({ items, parameters, mode:input.mode, direction:input.direction, fixedDurationMs:input.fixedDurationMs });
  const { event, progress, timeMs } = eventAt(timeline, finite(input.storyTimeMs ?? 0,"storyTimeMs"));
  const ordered = timeline.orderedIds.map((id) => items.find((item) => item.id === id));
  const directionSign = timeline.direction === "reverse" ? -1 : 1;
  let focus = event.toIndex ?? event.targetIndex ?? event.focusIndex ?? 0;
  if (event.type === "travel") focus = lerp(event.fromIndex, event.toIndex, smooth5(progress));
  if (event.type === "lead-in") focus = event.focusIndex;
  const cross = Math.min(stage.height * parameters.frameScale, stage.width * 0.52);
  const maxRatio = Math.max(...ordered.map((item)=>item.ratio));
  const nominalWidth = Math.min(stage.width*0.48, cross*maxRatio);
  const stride = nominalWidth + stage.width * parameters.gap;
  const targetIndex = event.targetIndex ?? event.toIndex ?? 0;
  let emphasis = 0;
  if (event.type === "spotlight-grow" || event.type === "finale-grow") emphasis = smooth5(progress);
  if (event.type === "spotlight-hold" || event.type === "finale-hold") emphasis = 1;
  if (event.type === "spotlight-return") emphasis = 1-smooth5(progress);
  const finaleMode = event.type.startsWith("finale") || event.type === "exit" || event.type === "terminal";
  const exitProgress = event.type === "exit" ? smooth5(progress) : event.type === "terminal" ? 1 : 0;
  const cards = ordered.map((item,index) => {
    const maxH = cross;
    const box = fitBox(item.ratio, stage.width*0.48, maxH);
    const laneSeed = stableHash(item.id);
    const laneY = (((laneSeed % 19)/18)-0.5) * stage.height * 0.055;
    const laneRot = ((((laneSeed>>>5)%17)/16)-0.5)*3.6;
    const relative = index-focus;
    const selected = index === targetIndex;
    const selectedScale = selected ? lerp(1, event.type.startsWith("finale") || event.type === "exit" || event.type === "terminal" ? parameters.finaleScale : parameters.spotlightScale, emphasis || (finaleMode && selected ? 1 : 0)) : 1;
    const yieldAmount = selected ? 0 : Math.sign(index-targetIndex) * stage.width * 0.075 * emphasis / Math.max(1,Math.abs(index-targetIndex));
    let x = stage.width/2 + relative*stride + yieldAmount;
    let y = stage.height/2 + laneY;
    if (finaleMode && !selected) x += Math.sign(index-targetIndex || directionSign) * stage.width * 1.2 * (event.type === "finale-grow" ? smooth5(progress) : 1);
    if (selected && exitProgress) y -= stage.height * 1.25 * exitProgress;
    const offstage = x + box.width*selectedScale/2 < -stage.width*0.08 || x - box.width*selectedScale/2 > stage.width*1.08 || y + box.height*selectedScale/2 < -stage.height*0.08;
    return { id:item.id, item, sourceIndex:items.findIndex((x)=>x.id===item.id), x, y, width:box.width, height:box.height, scale:selectedScale, rotation:selected ? laneRot*(1-emphasis) : laneRot, projectedYaw:0, z:selected?100:Math.max(1,50-Math.abs(relative)), visible:!offstage, occluded:false };
  });
  return commonFrame(timeline,items,parameters,stage,timeMs,event.type,progress,cards,{ cueId:event.targetId || null, focusPosition:round(focus), permutationOrFocus:timeline.orderedIds, terminalFrame:event.type==="terminal"?"empty-stage":"finite" });
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
