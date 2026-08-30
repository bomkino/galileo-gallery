(function (global) {
  "use strict";

  const PATH_SAMPLES = 768;
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const positiveModulo = (value, divisor) => ((value % divisor) + divisor) % divisor;
  const bounded = (value, fallback, minimum, maximum) => Number.isFinite(value)
    ? clamp(value, minimum, maximum)
    : fallback;

  const defaults = Object.freeze({
    frameScale: 0.27,
    depthSpacing: 1,
    laneSpread: 3.1,
    nearPass: 1.9,
    visibleDepth: 14.5,
  });

  const ratios = [16 / 9, 4 / 3, 1, 3 / 4, 16 / 10, 9 / 16, 3 / 2, 4 / 5];

  function fixtureItems(count) {
    return Array.from({ length: Math.max(0, Math.round(count)) }, (_, index) => ({
      id: `river-${String(index + 1).padStart(2, "0")}`,
      ratio: ratios[index % ratios.length],
      alpha: index % 7 === 5,
      video: index % 9 === 8,
      failed: index % 17 === 16,
    }));
  }

  function compile({ mediaCount, paceMs = 1050, direction = "forward", durationMs = 0 }) {
    const count = Math.max(1, Math.round(mediaCount));
    const pace = bounded(paceMs, 1050, 240, 4000);
    const baseDurationMs = clamp(count * pace, 4200, 30000);
    const duration = durationMs > 0
      ? bounded(durationMs, baseDurationMs, 1000, 24 * 60 * 60 * 1000)
      : baseDurationMs;
    const cycles = durationMs > 0 ? Math.max(1, Math.round(duration / baseDurationMs)) : 1;
    return Object.freeze({
      durationMs: duration,
      cycles,
      direction: direction === "reverse" ? "reverse" : "forward",
    });
  }

  function pathControls(parameters) {
    const depthScale = bounded(parameters.depthSpacing, defaults.depthSpacing, 0.65, 1.6);
    const far = 15 * depthScale;
    const near = 2.15;
    const spread = bounded(parameters.laneSpread, defaults.laneSpread, 1.4, 4.2);
    const pass = bounded(parameters.nearPass, defaults.nearPass, 0.9, 2.4);
    const outer = Math.max(pass + 2.7, 4.8);
    return {
      far,
      near,
      points: [
        { x: -spread, z: far },
        { x: -spread * 0.92, z: far * 0.68 },
        { x: -pass, z: near },
        { x: -outer, z: 0.78 },
        { x: 0, z: -1.35 },
        { x: outer, z: 0.78 },
        { x: pass, z: near },
        { x: spread * 0.92, z: far * 0.68 },
        { x: spread, z: far },
        { x: 0, z: far + 2.4 },
      ],
    };
  }

  function hermite(a, b, tangentA, tangentB, amount) {
    const t2 = amount * amount;
    const t3 = t2 * amount;
    return (2 * t3 - 3 * t2 + 1) * a
      + (t3 - 2 * t2 + amount) * tangentA
      + (-2 * t3 + 3 * t2) * b
      + (t3 - t2) * tangentB;
  }

  function rawPathPoint(normalized, controls) {
    const points = controls.points;
    const count = points.length;
    const wrapped = positiveModulo(normalized, 1);
    const scaled = wrapped * count;
    const segment = Math.floor(scaled) % count;
    const amount = scaled - Math.floor(scaled);
    const p0 = points[(segment - 1 + count) % count];
    const p1 = points[segment];
    const p2 = points[(segment + 1) % count];
    const p3 = points[(segment + 2) % count];
    const tangentScale = 0.42;
    const tangent1 = {
      x: (p2.x - p0.x) * tangentScale,
      z: (p2.z - p0.z) * tangentScale,
    };
    const tangent2 = {
      x: (p3.x - p1.x) * tangentScale,
      z: (p3.z - p1.z) * tangentScale,
    };
    const region = segment <= 1
      ? "approach"
      : segment <= 5
        ? "camera-bypass"
        : segment <= 7
          ? "recede"
          : "far-return";
    return {
      x: hermite(p1.x, p2.x, tangent1.x, tangent2.x, amount),
      z: hermite(p1.z, p2.z, tangent1.z, tangent2.z, amount),
      rawU: wrapped,
      region,
    };
  }

  let arcCacheKey = "";
  let arcCacheTable = null;

  function buildArcTable(controls) {
    const samples = [];
    let length = 0;
    let previous = rawPathPoint(0, controls);
    samples.push({ u: 0, length: 0 });
    for (let index = 1; index <= PATH_SAMPLES; index += 1) {
      const u = index / PATH_SAMPLES;
      const point = rawPathPoint(u, controls);
      length += Math.hypot(point.x - previous.x, point.z - previous.z);
      samples.push({ u, length });
      previous = point;
    }
    return { samples, length };
  }

  function cachedArcTable(controls) {
    const key = controls.points.map((point) => `${point.x.toFixed(6)},${point.z.toFixed(6)}`).join("|");
    if (key !== arcCacheKey || !arcCacheTable) {
      arcCacheKey = key;
      arcCacheTable = buildArcTable(controls);
    }
    return arcCacheTable;
  }

  function pointAtArcFraction(fraction, controls, table) {
    const wrapped = positiveModulo(fraction, 1);
    const target = wrapped * table.length;
    let low = 0;
    let high = table.samples.length - 1;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (table.samples[middle].length <= target) low = middle;
      else high = middle;
    }
    const left = table.samples[low];
    const right = table.samples[high];
    const span = Math.max(1e-12, right.length - left.length);
    const amount = clamp((target - left.length) / span, 0, 1);
    const rawU = left.u + (right.u - left.u) * amount;
    return rawPathPoint(rawU, controls);
  }

  function evaluate(input) {
    const items = input.items || [];
    const parameters = Object.assign({}, defaults, input.parameters || {});
    const width = Math.max(1, input.stageWidth);
    const height = Math.max(1, input.stageHeight);
    const timeline = input.timeline;
    const storyTimeMs = Math.max(0, Number(input.timeMs) || 0);
    const render = {
      artworkOpacity: 1,
      artworkFilter: "none",
      artworkBlendMode: "normal",
    };

    if (!items.length) {
      return {
        phase: 0,
        velocity: 0,
        storyTimeMs,
        camera: { fixed: true },
        path: { closed: true, continuous: true, arcLength: 0, sampleCount: PATH_SAMPLES },
        frames: [],
        render,
      };
    }

    const directionSign = timeline.direction === "reverse" ? -1 : 1;
    const localTimeMs = positiveModulo(storyTimeMs, timeline.durationMs);
    const rawPhase = positiveModulo(directionSign * timeline.cycles * localTimeMs / timeline.durationMs, 1);
    const phase = input.reducedMotion ? positiveModulo(Math.round(rawPhase * 5) / 5, 1) : rawPhase;
    const portrait = height > width;
    const horizon = height * (portrait ? 0.39 : 0.42);
    const shortExtent = Math.min(width, height);
    const lateralScale = width * (portrait ? 0.24 : 0.20);
    const baseHeight = shortExtent * bounded(parameters.frameScale, defaults.frameScale, 0.18, 0.48);
    const visibleDepth = bounded(parameters.visibleDepth, defaults.visibleDepth, 7, 18);
    const controls = pathControls(parameters);
    const table = cachedArcTable(controls);
    const nearPlane = 1.2;

    const frames = items.map((item, index) => {
      const pathDistance = positiveModulo(index / items.length - phase, 1);
      const point = pointAtArcFraction(pathDistance, controls, table);
      const depthNormalized = clamp(
        (point.z - controls.near) / Math.max(1e-9, controls.far - controls.near),
        0,
        1,
      );
      const perspective = (controls.near + 4.5) / (point.z + 4.5);
      const screenX = width / 2 + point.x * lateralScale * perspective;
      const screenY = horizon + height * (1 - depthNormalized) * (portrait ? 0.25 : 0.30);
      const ratio = bounded(item.ratio, 16 / 9, 0.05, 20);
      const frameHeight = baseHeight * perspective;
      const frameWidth = frameHeight * ratio;
      const visible = point.z > nearPlane
        && point.z <= visibleDepth
        && screenX + frameWidth / 2 > 0
        && screenX - frameWidth / 2 < width
        && screenY + frameHeight / 2 > 0
        && screenY - frameHeight / 2 < height;
      return {
        id: item.id,
        sourceIndex: index,
        pathDistance,
        pathU: point.rawU,
        region: point.region,
        worldX: point.x,
        worldZ: point.z,
        x: screenX,
        y: screenY,
        width: frameWidth,
        height: frameHeight,
        scale: 1,
        perspective,
        z: Math.round(10000 - point.z * 500),
        yaw: 0,
        visible,
        opacity: 1,
        filter: "none",
        alpha: !!item.alpha,
        video: !!item.video,
        failed: !!item.failed,
      };
    });

    return {
      phase,
      velocity: input.reducedMotion ? 0 : directionSign * timeline.cycles / timeline.durationMs,
      storyTimeMs,
      camera: { fixed: true, horizon, nearPlane, visibleDepth },
      path: {
        closed: true,
        continuous: true,
        arcLength: table.length,
        sampleCount: PATH_SAMPLES,
        worldSpeed: input.reducedMotion
          ? 0
          : directionSign * table.length * timeline.cycles / timeline.durationMs,
      },
      frames,
      render,
    };
  }

  const api = { defaults, fixtureItems, compile, evaluate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.DeckRiverEvaluator = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
