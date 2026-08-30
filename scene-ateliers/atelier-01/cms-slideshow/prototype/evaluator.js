(function (global) {
  "use strict";

  const TAU = Math.PI * 2;
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const positiveModulo = (value, divisor) => ((value % divisor) + divisor) % divisor;
  const smoothstep = (value) => {
    const amount = clamp(value, 0, 1);
    return amount * amount * (3 - 2 * amount);
  };
  const wrap = (value, extent) => positiveModulo(value + extent / 2, extent) - extent / 2;
  const bounded = (value, fallback, minimum, maximum) => Number.isFinite(value)
    ? clamp(value, minimum, maximum)
    : fallback;

  const defaults = Object.freeze({
    frameScale: 0.52,
    gap: 42,
    focusDepth: 0.12,
  });

  const ratios = [16 / 9, 4 / 3, 1, 3 / 4, 16 / 10, 9 / 16, 3 / 2, 4 / 5];

  function fixtureItems(count) {
    return Array.from({ length: Math.max(0, Math.round(count)) }, (_, index) => ({
      id: `quiet-${String(index + 1).padStart(2, "0")}`,
      ratio: ratios[index % ratios.length],
      alpha: index % 7 === 5,
      video: index % 7 === 6,
      failed: index % 13 === 12,
    }));
  }

  function compile({ mediaCount, paceMs = 1000, direction = "forward", durationMs = 0 }) {
    const count = Math.max(1, Math.round(mediaCount));
    const pace = bounded(paceMs, 1000, 180, 4000);
    const baseDurationMs = clamp(count * pace, 1800, 30000);
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

  function evaluate(input) {
    const items = input.items || [];
    const parameters = Object.assign({}, defaults, input.parameters || {});
    const width = Math.max(1, input.stageWidth);
    const height = Math.max(1, input.stageHeight);
    const axis = input.axis === "vertical" ? "vertical" : "horizontal";
    const timeline = input.timeline;
    const storyTimeMs = Math.max(0, Number(input.timeMs) || 0);
    const localTimeMs = positiveModulo(storyTimeMs, timeline.durationMs);
    const directionSign = timeline.direction === "reverse" ? -1 : 1;
    const rawPhase = positiveModulo(directionSign * timeline.cycles * localTimeMs / timeline.durationMs, 1);
    const count = items.length;
    const fit = input.fitIntent === "cover" ? "cover" : "contain";
    const render = {
      artworkOpacity: 1,
      artworkFilter: "none",
      artworkBlendMode: "normal",
      fit,
    };

    if (!count) {
      return {
        phase: 0,
        velocity: 0,
        storyTimeMs,
        axis,
        frames: [],
        geometry: { requestedGapPx: 0, resolvedGapPx: 0, loopExtent: 0 },
        render,
      };
    }

    const phase = input.reducedMotion && count > 1
      ? positiveModulo(Math.round(rawPhase * count) / count, 1)
      : rawPhase;
    const majorExtent = axis === "horizontal" ? width : height;
    const crossExtent = axis === "horizontal" ? height : width;
    const frameScale = bounded(parameters.frameScale, defaults.frameScale, 0.24, 0.78);
    const focusDepth = bounded(parameters.focusDepth, defaults.focusDepth, 0, 0.24);
    const baseCrossSize = crossExtent * frameScale;
    const requestedGapPx = crossExtent * bounded(parameters.gap, defaults.gap, 0, 240) / 1080;

    const dimensions = items.map((item) => {
      const ratio = bounded(item.ratio, 16 / 9, 0.05, 20);
      const frameWidth = axis === "horizontal" ? baseCrossSize * ratio : baseCrossSize;
      const frameHeight = axis === "horizontal" ? baseCrossSize : baseCrossSize / ratio;
      return {
        frameWidth,
        frameHeight,
        frameMajor: axis === "horizontal" ? frameWidth : frameHeight,
      };
    });

    const maxFrameMajor = Math.max(...dimensions.map((dimension) => dimension.frameMajor));
    const contentMajor = dimensions.reduce((sum, dimension) => sum + dimension.frameMajor, 0);
    const minimumLoopExtent = majorExtent + maxFrameMajor * 2 + requestedGapPx * 2;
    const resolvedGapPx = count > 1
      ? Math.max(requestedGapPx, (minimumLoopExtent - contentMajor) / count)
      : requestedGapPx;

    const centers = [];
    let cursor = 0;
    for (const dimension of dimensions) {
      centers.push(cursor + dimension.frameMajor / 2);
      cursor += dimension.frameMajor + resolvedGapPx;
    }
    const loopExtent = Math.max(1, cursor);
    const origin = centers[0] || 0;
    const focusRadius = Math.max(1, majorExtent * 0.56);

    const frames = items.map((item, index) => {
      const dimension = dimensions[index];
      const breathing = count === 1 && !input.reducedMotion
        ? Math.sin(phase * TAU) * majorExtent * 0.025
        : 0;
      const position = count === 1
        ? breathing
        : wrap(centers[index] - origin - phase * loopExtent, loopExtent);
      const distance = clamp(Math.abs(position) / focusRadius, 0, 1);
      const scale = 1 - focusDepth * smoothstep(distance);
      const x = axis === "horizontal" ? width / 2 + position : width / 2;
      const y = axis === "horizontal" ? height / 2 : height / 2 + position;
      const scaledMajor = dimension.frameMajor * scale;
      const visible = Math.abs(position) <= majorExtent / 2 + scaledMajor;
      return {
        id: item.id,
        sourceIndex: index,
        position,
        x,
        y,
        width: dimension.frameWidth,
        height: dimension.frameHeight,
        scale,
        z: 1000 - Math.round(distance * 1000),
        visible,
        alpha: !!item.alpha,
        video: !!item.video,
        failed: !!item.failed,
        opacity: 1,
        filter: "none",
      };
    });

    return {
      phase,
      velocity: input.reducedMotion ? 0 : directionSign * timeline.cycles / timeline.durationMs,
      storyTimeMs,
      axis,
      frames,
      geometry: { requestedGapPx, resolvedGapPx, loopExtent },
      render,
    };
  }

  const api = { defaults, fixtureItems, compile, evaluate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.QuietCarouselEvaluator = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
