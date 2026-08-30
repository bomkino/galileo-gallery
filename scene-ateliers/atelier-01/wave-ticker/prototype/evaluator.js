(function (global) {
  "use strict";

  const TAU = Math.PI * 2;
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const positiveModulo = (value, divisor) => ((value % divisor) + divisor) % divisor;
  const wrap = (value, extent) => positiveModulo(value + extent / 2, extent) - extent / 2;
  const bounded = (value, fallback, minimum, maximum) => Number.isFinite(value)
    ? clamp(value, minimum, maximum)
    : fallback;

  const defaults = Object.freeze({
    frameScale: 0.23,
    gap: 38,
    amplitude: 0.15,
    wavelength: 0.52,
    tangentInfluence: 0.22,
  });

  const ratios = [16 / 9, 4 / 3, 1, 3 / 4, 16 / 10, 9 / 16, 3 / 2, 4 / 5];

  function fixtureItems(count) {
    return Array.from({ length: Math.max(0, Math.round(count)) }, (_, index) => ({
      id: `wave-${String(index + 1).padStart(2, "0")}`,
      ratio: ratios[index % ratios.length],
      alpha: index % 7 === 5,
      video: index % 7 === 6,
      failed: index % 23 === 22,
    }));
  }

  function compile({ mediaCount, paceMs = 950, direction = "forward", durationMs = 0 }) {
    const count = Math.max(1, Math.round(mediaCount));
    const pace = bounded(paceMs, 950, 260, 4000);
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

  function geometry(items, parameters, width, height) {
    const axis = height > width * 1.14 ? "vertical" : "horizontal";
    const majorExtent = axis === "horizontal" ? width : height;
    const crossExtent = axis === "horizontal" ? height : width;
    const baseCross = crossExtent
      * bounded(parameters.frameScale, defaults.frameScale, 0.14, 0.32);
    const requestedGapPx = crossExtent
      * bounded(parameters.gap, defaults.gap, 0, 180)
      / 1080;
    const source = items.map((item, sourceIndex) => {
      const ratio = bounded(item.ratio, 16 / 9, 0.05, 20);
      const frameWidth = axis === "horizontal" ? baseCross * ratio : baseCross;
      const frameHeight = axis === "horizontal" ? baseCross : baseCross / ratio;
      return {
        item,
        sourceIndex,
        frameWidth,
        frameHeight,
        major: axis === "horizontal" ? frameWidth : frameHeight,
      };
    });
    const maxMajor = Math.max(...source.map((item) => item.major));
    const oneExtent = source.reduce((sum, item) => sum + item.major + requestedGapPx, 0);
    const requiredExtent = majorExtent + 2 * maxMajor + 2 * requestedGapPx;
    const repeats = Math.min(
      48,
      Math.max(1, Math.ceil(requiredExtent / Math.max(1, oneExtent))),
    );
    const slots = [];
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      for (const item of source) slots.push({ ...item, repeat });
    }
    const contentExtent = slots.reduce((sum, item) => sum + item.major, 0);
    const minimumExtent = Math.max(
      contentExtent + requestedGapPx * slots.length,
      requiredExtent,
    );
    const requestedWavelength = majorExtent
      * bounded(parameters.wavelength, defaults.wavelength, 0.30, 0.90);
    const waveCount = Math.max(1, Math.ceil(minimumExtent / requestedWavelength));
    const extent = waveCount * requestedWavelength;
    const resolvedGapPx = (extent - contentExtent) / slots.length;
    const centers = [];
    let cursor = 0;
    for (const item of slots) {
      centers.push(cursor + item.major / 2);
      cursor += item.major + resolvedGapPx;
    }
    return {
      axis,
      majorExtent,
      crossExtent,
      slots,
      centers,
      origin: centers[0] || 0,
      extent,
      wavelength: requestedWavelength,
      waveCount,
      requestedGapPx,
      resolvedGapPx,
      amplitude: crossExtent
        * bounded(parameters.amplitude, defaults.amplitude, 0.04, 0.24),
    };
  }

  function evaluate(input) {
    const items = input.items || [];
    const parameters = Object.assign({}, defaults, input.parameters || {});
    const width = Math.max(1, input.stageWidth);
    const height = Math.max(1, input.stageHeight);
    const timeline = input.timeline;
    const storyTimeMs = Math.max(0, Number(input.timeMs) || 0);
    const emptyAxis = height > width * 1.14 ? "vertical" : "horizontal";
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
        axis: emptyAxis,
        frames: [],
        path: {
          closed: true,
          derivativeContinuous: true,
          extent: 0,
          wavelength: 0,
          waveCount: 0,
          amplitude: 0,
        },
        render,
      };
    }

    const state = geometry(items, parameters, width, height);
    const directionSign = timeline.direction === "reverse" ? -1 : 1;
    const localTimeMs = positiveModulo(storyTimeMs, timeline.durationMs);
    const rawPhase = positiveModulo(
      directionSign * timeline.cycles * localTimeMs / timeline.durationMs,
      1,
    );
    let phase = input.reducedMotion
      ? positiveModulo(Math.round(rawPhase * 8) / 8, 1)
      : rawPhase;

    if (Number.isInteger(input.holdSourceIndex)
      && input.holdSourceIndex >= 0
      && input.holdSourceIndex < items.length) {
      const slotIndex = state.slots.findIndex(
        (slot) => slot.sourceIndex === input.holdSourceIndex,
      );
      if (slotIndex >= 0) {
        phase = positiveModulo(
          (state.centers[slotIndex] - state.origin) / state.extent,
          1,
        );
      }
    }

    const frames = state.slots.map((slot, index) => {
      const position = wrap(
        state.centers[index] - state.origin - phase * state.extent,
        state.extent,
      );
      const theta = TAU * position / state.wavelength + Math.PI / 2;
      const wave = state.amplitude * Math.sin(theta);
      const slope = state.amplitude * (TAU / state.wavelength) * Math.cos(theta);
      const rawAngle = Math.atan(slope) * 180 / Math.PI;
      const rotation = clamp(
        rawAngle
          * bounded(parameters.tangentInfluence, defaults.tangentInfluence, 0, 0.45),
        -10,
        10,
      );
      const x = state.axis === "horizontal" ? width / 2 + position : width / 2 + wave;
      const y = state.axis === "horizontal" ? height / 2 + wave : height / 2 + position;
      const frameMajor = state.axis === "horizontal" ? slot.frameWidth : slot.frameHeight;
      const visible = Math.abs(position) <= state.majorExtent / 2 + frameMajor;
      return {
        id: `${slot.item.id}-repeat-${slot.repeat}`,
        sourceId: slot.item.id,
        sourceIndex: slot.sourceIndex,
        repeat: slot.repeat,
        x,
        y,
        width: slot.frameWidth,
        height: slot.frameHeight,
        position,
        wave,
        rotation: state.axis === "horizontal" ? rotation : -rotation,
        visible,
        z: 1000 + index,
        opacity: 1,
        filter: "none",
        alpha: !!slot.item.alpha,
        video: !!slot.item.video,
        failed: !!slot.item.failed,
      };
    });

    const held = Number.isInteger(input.holdSourceIndex);
    return {
      phase,
      velocity: input.reducedMotion || held
        ? 0
        : directionSign * timeline.cycles / timeline.durationMs,
      storyTimeMs,
      axis: state.axis,
      frames,
      path: {
        closed: true,
        derivativeContinuous: true,
        extent: state.extent,
        wavelength: state.wavelength,
        waveCount: state.waveCount,
        amplitude: state.amplitude,
        crestPosition: 0,
        requestedGapPx: state.requestedGapPx,
        resolvedGapPx: state.resolvedGapPx,
      },
      render,
    };
  }

  const api = { defaults, fixtureItems, compile, evaluate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.WaveTickerEvaluator = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
