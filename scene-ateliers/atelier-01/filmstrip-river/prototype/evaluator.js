(function (global) {
  "use strict";

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const positiveModulo = (value, divisor) => ((value % divisor) + divisor) % divisor;
  const wrap = (value, extent) => positiveModulo(value + extent / 2, extent) - extent / 2;
  const bounded = (value, fallback, minimum, maximum) => Number.isFinite(value)
    ? clamp(value, minimum, maximum)
    : fallback;

  const defaults = Object.freeze({
    frameScale: 0.28,
    gap: 30,
    laneSeparation: 0.38,
    lanePhase: 0.5,
  });

  const ratios = [16 / 9, 4 / 3, 1, 3 / 4, 16 / 10, 9 / 16, 3 / 2, 4 / 5];

  function fixtureItems(count) {
    return Array.from({ length: Math.max(0, Math.round(count)) }, (_, index) => ({
      id: `strip-${String(index + 1).padStart(2, "0")}`,
      ratio: ratios[index % ratios.length],
      alpha: index % 7 === 5,
      video: index % 9 === 8,
      failed: index % 19 === 18,
    }));
  }

  function compile({ mediaCount, paceMs = 900, direction = "forward", durationMs = 0 }) {
    const count = Math.max(1, Math.round(mediaCount));
    const longestLaneCount = count === 1 ? 1 : Math.ceil(count / 2);
    const pace = bounded(paceMs, 900, 240, 4000);
    const baseDurationMs = clamp(longestLaneCount * pace, 3600, 30000);
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

  function laneSources(items, lane) {
    if (items.length === 1) return [{ item: items[0], sourceIndex: 0 }];
    const source = items
      .map((item, sourceIndex) => ({ item, sourceIndex }))
      .filter(({ sourceIndex }) => sourceIndex % 2 === lane);
    return source.length
      ? source
      : [{ item: items[lane % items.length], sourceIndex: lane % items.length }];
  }

  function buildPattern(source, axis, baseCross, requestedGapPx, majorExtent) {
    const dimensions = source.map(({ item, sourceIndex }) => {
      const ratio = bounded(item.ratio, 16 / 9, 0.05, 20);
      const width = axis === "horizontal" ? baseCross * ratio : baseCross;
      const height = axis === "horizontal" ? baseCross : baseCross / ratio;
      return {
        item,
        sourceIndex,
        width,
        height,
        major: axis === "horizontal" ? width : height,
      };
    });
    const maxMajor = Math.max(...dimensions.map((dimension) => dimension.major));
    const onePatternExtent = dimensions.reduce(
      (sum, dimension) => sum + dimension.major + requestedGapPx,
      0,
    );
    const requiredExtent = majorExtent + 2 * maxMajor + 2 * requestedGapPx;
    const repeats = Math.min(
      48,
      Math.max(1, Math.ceil(requiredExtent / Math.max(1, onePatternExtent))),
    );
    const slots = [];
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      for (const dimension of dimensions) slots.push({ ...dimension, repeat });
    }
    const contentExtent = slots.reduce((sum, slot) => sum + slot.major, 0);
    const minimumExtent = contentExtent + requestedGapPx * slots.length;
    return { slots, contentExtent, minimumExtent };
  }

  function resolvePattern(pattern, sharedExtent) {
    const gapPx = pattern.slots.length
      ? (sharedExtent - pattern.contentExtent) / pattern.slots.length
      : 0;
    const slots = [];
    let cursor = 0;
    for (const slot of pattern.slots) {
      slots.push({ ...slot, center: cursor + slot.major / 2 });
      cursor += slot.major + gapPx;
    }
    return {
      slots,
      extent: Math.max(1, cursor),
      origin: slots[0]?.center || 0,
      gapPx,
    };
  }

  function evaluate(input) {
    const items = input.items || [];
    const parameters = Object.assign({}, defaults, input.parameters || {});
    const width = Math.max(1, input.stageWidth);
    const height = Math.max(1, input.stageHeight);
    const timeline = input.timeline;
    const storyTimeMs = Math.max(0, Number(input.timeMs) || 0);
    const axis = height > width * 1.14 ? "vertical" : "horizontal";
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
        axis,
        lanes: [[], []],
        frames: [],
        laneDirection: [0, 0],
        laneSpeedPxPerMs: [0, 0],
        trackExtent: 0,
        render,
      };
    }

    const majorExtent = axis === "horizontal" ? width : height;
    const crossExtent = axis === "horizontal" ? height : width;
    const baseCross = crossExtent
      * bounded(parameters.frameScale, defaults.frameScale, 0.16, 0.36);
    const requestedGapPx = crossExtent
      * bounded(parameters.gap, defaults.gap, 0, 160)
      / 1080;
    const separation = crossExtent
      * bounded(parameters.laneSeparation, defaults.laneSeparation, 0.25, 0.58);
    const directionSign = timeline.direction === "reverse" ? -1 : 1;
    const localTimeMs = positiveModulo(storyTimeMs, timeline.durationMs);
    const rawPhase = positiveModulo(
      directionSign * timeline.cycles * localTimeMs / timeline.durationMs,
      1,
    );
    let phase = input.reducedMotion
      ? positiveModulo(Math.round(rawPhase * 8) / 8, 1)
      : rawPhase;

    const unresolved = [0, 1].map((lane) => buildPattern(
      laneSources(items, lane),
      axis,
      baseCross,
      requestedGapPx,
      majorExtent,
    ));
    const sharedExtent = Math.max(...unresolved.map((pattern) => pattern.minimumExtent));
    const patterns = unresolved.map((pattern) => resolvePattern(pattern, sharedExtent));
    const lanePhase = bounded(parameters.lanePhase, defaults.lanePhase, 0, 1);

    if (Number.isInteger(input.holdSourceIndex)
      && input.holdSourceIndex >= 0
      && input.holdSourceIndex < items.length) {
      const lane = items.length === 1 ? 0 : input.holdSourceIndex % 2;
      const pattern = patterns[lane];
      const target = pattern.slots.find((slot) => slot.sourceIndex === input.holdSourceIndex);
      if (target) {
        phase = lane === 0
          ? positiveModulo((target.center - pattern.origin) / pattern.extent, 1)
          : positiveModulo(
            -(target.center - pattern.origin) / pattern.extent - lanePhase,
            1,
          );
      }
    }

    const frames = [];
    for (const lane of [0, 1]) {
      const pattern = patterns[lane];
      const laneSign = lane === 0 ? -1 : 1;
      const travel = (phase + (lane === 1 ? lanePhase : 0))
        * pattern.extent
        * laneSign;
      for (let index = 0; index < pattern.slots.length; index += 1) {
        const slot = pattern.slots[index];
        const position = wrap(
          slot.center - pattern.origin + travel,
          pattern.extent,
        );
        const x = axis === "horizontal"
          ? width / 2 + position
          : width / 2 + (lane ? separation / 2 : -separation / 2);
        const y = axis === "horizontal"
          ? height / 2 + (lane ? separation / 2 : -separation / 2)
          : height / 2 + position;
        const frameMajor = axis === "horizontal" ? slot.width : slot.height;
        const visible = Math.abs(position) <= majorExtent / 2 + frameMajor;
        frames.push({
          id: `${slot.item.id}-lane-${lane}-repeat-${slot.repeat}`,
          sourceId: slot.item.id,
          sourceIndex: slot.sourceIndex,
          lane,
          repeat: slot.repeat,
          position,
          x,
          y,
          width: slot.width,
          height: slot.height,
          visible,
          z: 1000 + lane * 10 + index,
          opacity: 1,
          filter: "none",
          alpha: !!slot.item.alpha,
          video: !!slot.item.video,
          failed: !!slot.item.failed,
        });
      }
    }

    const held = Number.isInteger(input.holdSourceIndex);
    const normalizedVelocity = input.reducedMotion || held
      ? 0
      : directionSign * timeline.cycles / timeline.durationMs;
    const speed = input.reducedMotion || held
      ? 0
      : sharedExtent * timeline.cycles / timeline.durationMs;
    return {
      phase,
      velocity: normalizedVelocity,
      storyTimeMs,
      axis,
      laneDirection: [-directionSign, directionSign],
      laneSpeedPxPerMs: [-directionSign * speed, directionSign * speed],
      laneCenters: axis === "horizontal"
        ? [height / 2 - separation / 2, height / 2 + separation / 2]
        : [width / 2 - separation / 2, width / 2 + separation / 2],
      trackExtent: sharedExtent,
      requestedGapPx,
      resolvedGapPx: patterns.map((pattern) => pattern.gapPx),
      frames,
      render,
    };
  }

  const api = { defaults, fixtureItems, compile, evaluate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.FilmstripRiverEvaluator = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
