(function (global) {
  "use strict";

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const mix = (from, to, amount) => from + (to - from) * amount;
  const smootherstep = (value) => {
    const amount = clamp(value, 0, 1);
    return amount * amount * amount * (amount * (amount * 6 - 15) + 10);
  };
  const bounded = (value, fallback, minimum, maximum) => Number.isFinite(value)
    ? clamp(value, minimum, maximum)
    : fallback;

  const defaults = Object.freeze({
    frameScale: 0.24,
    depthSpacing: 1,
    laneSpread: 3,
    nearPass: 1.9,
    arrivalScale: 0.66,
  });

  const DEFAULT_LANDMARKS = Object.freeze({
    entryEnd: 0.16,
    corridorEnd: 0.62,
    acquireEnd: 0.74,
    arrivalEnd: 0.86,
    holdEnd: 0.95,
    exitEnd: 1,
  });

  const MIN_SEGMENT_MS = Object.freeze({
    entry: 500,
    corridor: 1800,
    acquire: 550,
    arrival: 700,
    hold: 600,
    takeover: 350,
  });
  const MIN_DURATION_MS = Object.values(MIN_SEGMENT_MS).reduce((sum, value) => sum + value, 0);
  const MAX_DURATION_MS = 60000;
  const ratios = [16 / 9, 4 / 3, 1, 3 / 4, 16 / 10, 9 / 16, 3 / 2, 4 / 5];

  function fixtureItems(count) {
    return Array.from({ length: Math.max(0, Math.round(count)) }, (_, index) => ({
      id: `chapter-${String(index + 1).padStart(2, "0")}`,
      ratio: ratios[index % ratios.length],
      alpha: index % 7 === 5,
      video: index % 7 === 6,
      failed: index % 29 === 28,
      muted: false,
    }));
  }

  function targetIndex(items, requested) {
    if (Number.isInteger(requested)
      && requested >= 0
      && requested < items.length
      && !items[requested].muted) return requested;
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (!items[index].muted) return index;
    }
    return Math.max(0, items.length - 1);
  }

  function segmentDurationsFromFractions(durationMs, landmarks = DEFAULT_LANDMARKS) {
    return {
      entry: durationMs * landmarks.entryEnd,
      corridor: durationMs * (landmarks.corridorEnd - landmarks.entryEnd),
      acquire: durationMs * (landmarks.acquireEnd - landmarks.corridorEnd),
      arrival: durationMs * (landmarks.arrivalEnd - landmarks.acquireEnd),
      hold: durationMs * (landmarks.holdEnd - landmarks.arrivalEnd),
      takeover: durationMs * (landmarks.exitEnd - landmarks.holdEnd),
    };
  }

  function validateDirectedSegments(source) {
    if (!source || typeof source !== "object") {
      throw new Error("Directed Chapter Reveal requires explicit segment durations.");
    }
    const result = {};
    for (const key of Object.keys(MIN_SEGMENT_MS)) {
      const value = Number(source[key]);
      if (!Number.isFinite(value) || value < MIN_SEGMENT_MS[key]) {
        throw new Error(`Directed Chapter Reveal ${key} duration is below its readable minimum.`);
      }
      result[key] = value;
    }
    const duration = Object.values(result).reduce((sum, value) => sum + value, 0);
    if (duration > MAX_DURATION_MS) throw new Error("Directed Chapter Reveal duration is too long.");
    return result;
  }

  function landmarksFromSegments(segments) {
    const duration = Object.values(segments).reduce((sum, value) => sum + value, 0);
    let elapsed = 0;
    const next = (key) => {
      elapsed += segments[key];
      return elapsed / duration;
    };
    return Object.freeze({
      entryEnd: next("entry"),
      corridorEnd: next("corridor"),
      acquireEnd: next("acquire"),
      arrivalEnd: next("arrival"),
      holdEnd: next("hold"),
      exitEnd: next("takeover"),
    });
  }

  function compile({
    items = [],
    mode = "automatic",
    durationMs = 0,
    direction = "forward",
    targetSourceIndex,
    segmentDurationsMs,
  }) {
    if (!["automatic", "fixed-duration", "directed"].includes(mode)) {
      throw new Error("Chapter Reveal Timeline mode is invalid.");
    }
    const count = Math.max(1, items.length);
    const automaticDuration = clamp(6200 + count * 380, 7200, 14000);
    let duration;
    let segments;
    let landmarks;

    if (mode === "directed") {
      segments = validateDirectedSegments(segmentDurationsMs);
      duration = Object.values(segments).reduce((sum, value) => sum + value, 0);
      landmarks = landmarksFromSegments(segments);
    } else if (mode === "fixed-duration") {
      const requested = Number(durationMs);
      if (!Number.isFinite(requested) || requested < MIN_DURATION_MS || requested > MAX_DURATION_MS) {
        throw new Error(`Fixed Chapter Reveal duration must be ${MIN_DURATION_MS}–${MAX_DURATION_MS} ms.`);
      }
      duration = requested;
      landmarks = DEFAULT_LANDMARKS;
      segments = segmentDurationsFromFractions(duration, landmarks);
    } else {
      duration = automaticDuration;
      landmarks = DEFAULT_LANDMARKS;
      segments = segmentDurationsFromFractions(duration, landmarks);
    }

    const target = targetIndex(items, targetSourceIndex);
    return Object.freeze({
      mode,
      durationMs: Math.round(duration),
      direction: direction === "reverse" ? "reverse" : "forward",
      targetSourceIndex: target,
      landmarks,
      segmentDurationsMs: Object.freeze({ ...segments }),
      visualSkipLandmarkMs: Math.round(duration * landmarks.corridorEnd),
      minimumDurationMs: MIN_DURATION_MS,
    });
  }

  function hermite(from, to, tangentFrom, tangentTo, amount) {
    const t2 = amount * amount;
    const t3 = t2 * amount;
    return (2 * t3 - 3 * t2 + 1) * from
      + (t3 - 2 * t2 + amount) * tangentFrom
      + (-2 * t3 + 3 * t2) * to
      + (t3 - t2) * tangentTo;
  }

  function corridorMetrics(target, input) {
    const parameters = Object.assign({}, defaults, input.parameters || {});
    const depthScale = bounded(parameters.depthSpacing, defaults.depthSpacing, 0.65, 1.6);
    const near = 2.2;
    const far = 15 * depthScale;
    const spacing = 1.65 * depthScale;
    const targetStart = far + target * spacing;
    return { parameters, depthScale, near, far, spacing, targetStart };
  }

  function corridorPose(index, target, progress, input) {
    const width = Math.max(1, input.stageWidth);
    const height = Math.max(1, input.stageHeight);
    const items = input.items;
    const timeline = input.timeline;
    const { parameters, near, far, spacing, targetStart } = corridorMetrics(target, input);
    const portrait = height > width;
    const shortExtent = Math.min(width, height);
    const safeProgress = Math.max(0, progress);
    const travel = (targetStart - near) * Math.pow(safeProgress, 1.55);
    const worldZ = far + index * spacing - travel;
    const laneSign = ((index + target) % 2 === 0 ? -1 : 1)
      * (timeline.direction === "reverse" ? -1 : 1);
    const depthNormalized = clamp(
      (worldZ - near) / Math.max(1e-9, Math.max(targetStart, far) - near),
      0,
      1,
    );
    const worldX = laneSign * mix(
      bounded(parameters.nearPass, defaults.nearPass, 0.9, 2.4),
      bounded(parameters.laneSpread, defaults.laneSpread, 1.4, 4.4),
      depthNormalized,
    );
    const focal = (near + 4.5) / Math.max(0.35, worldZ + 4.5);
    const horizon = height * (portrait ? 0.38 : 0.41);
    const x = width / 2 + worldX * width * (portrait ? 0.24 : 0.20) * focal;
    const y = horizon + height * (1 - depthNormalized) * (portrait ? 0.29 : 0.32);
    const baseHeight = shortExtent
      * bounded(parameters.frameScale, defaults.frameScale, 0.16, 0.38);
    const ratio = bounded(items[index].ratio, 16 / 9, 0.05, 20);
    const frameHeight = baseHeight * focal;
    const frameWidth = frameHeight * ratio;
    const visible = worldZ > 1.15
      && worldZ < Math.max(18, targetStart + 2)
      && x + frameWidth / 2 > 0
      && x - frameWidth / 2 < width
      && y + frameHeight / 2 > 0
      && y - frameHeight / 2 < height;
    return {
      x,
      y,
      width: frameWidth,
      height: frameHeight,
      z: worldZ,
      worldX,
      worldZ,
      lane: laneSign,
      visible,
      region: worldZ <= near + 1.2
        ? "near-passage"
        : worldZ < far
          ? "corridor"
          : "distant-entry",
    };
  }

  function stageAt(normalizedTime, landmarks) {
    if (normalizedTime < landmarks.entryEnd) return "distant-entry";
    if (normalizedTime < landmarks.corridorEnd) return "accelerating-corridor";
    if (normalizedTime < landmarks.acquireEnd) return "target-acquire";
    if (normalizedTime < landmarks.arrivalEnd) return "straighten-grow-arrival";
    if (normalizedTime < landmarks.holdEnd) return "arrival-hold";
    return "composed-takeover";
  }

  function clearingProgressRequired(items, target, input) {
    const { near, far, spacing, targetStart } = corridorMetrics(target, input);
    const lastStart = far + Math.max(0, items.length - 1) * spacing;
    const requiredTravel = lastStart - (near - 1.5);
    const ratio = Math.max(1, requiredTravel / Math.max(1e-9, targetStart - near));
    return clamp(Math.pow(ratio, 1 / 1.55), 1, 5);
  }

  function evaluate(input) {
    const items = input.items || [];
    const timeline = input.timeline;
    const width = Math.max(1, input.stageWidth);
    const height = Math.max(1, input.stageHeight);
    const parameters = Object.assign({}, defaults, input.parameters || {});
    const storyTimeMs = Math.max(0, Number(input.timeMs) || 0);
    const normalizedTime = clamp(storyTimeMs / timeline.durationMs, 0, 1);
    const landmarks = timeline.landmarks || DEFAULT_LANDMARKS;
    const render = {
      artworkOpacity: 1,
      artworkFilter: "none",
      artworkBlendMode: "normal",
    };

    if (!items.length) {
      return {
        normalizedTime,
        storyTimeMs,
        stage: stageAt(normalizedTime, landmarks),
        targetSourceIndex: -1,
        frames: [],
        velocity: 0,
        finite: true,
        landmarks,
        visualSkipLandmarkMs: timeline.visualSkipLandmarkMs,
        render,
      };
    }

    const target = targetIndex(items, timeline.targetSourceIndex);
    if (input.reducedMotion) {
      const cross = Math.min(width, height)
        * bounded(parameters.arrivalScale, defaults.arrivalScale, 0.42, 0.82);
      return {
        normalizedTime,
        storyTimeMs,
        stage: "reduced-arrival",
        targetSourceIndex: target,
        velocity: 0,
        finite: true,
        landmarks,
        visualSkipLandmarkMs: timeline.visualSkipLandmarkMs,
        frames: items.map((item, index) => {
          const ratio = bounded(item.ratio, 16 / 9, 0.05, 20);
          const frameWidth = width >= height ? cross * ratio : cross;
          const frameHeight = width >= height ? cross : cross / ratio;
          return {
            id: item.id,
            sourceIndex: index,
            x: width / 2,
            y: height / 2,
            width: frameWidth,
            height: frameHeight,
            visible: index === target,
            z: 10000,
            opacity: 1,
            filter: "none",
            alpha: !!item.alpha,
            video: !!item.video,
            failed: !!item.failed,
            role: index === target ? "arrival" : "offstage",
          };
        }),
        render,
      };
    }

    const acquire = landmarks.acquireEnd;
    const arrival = landmarks.arrivalEnd;
    const arrivalInterval = Math.max(1e-9, arrival - acquire);
    const corridorProgress = clamp(normalizedTime / acquire, 0, 1);
    const clearRequired = clearingProgressRequired(items, target, {
      ...input,
      parameters,
      stageWidth: width,
      stageHeight: height,
      items,
      timeline,
    });
    const baseInput = {
      ...input,
      parameters,
      stageWidth: width,
      stageHeight: height,
      items,
      timeline,
    };

    const frames = items.map((item, index) => {
      let pose;
      let role = index === target ? "target" : "corridor";

      if (index !== target && normalizedTime >= acquire) {
        const clearAmount = clamp((normalizedTime - acquire) / arrivalInterval, 0, 1);
        const startTangent = arrivalInterval / acquire;
        const clearProgress = hermite(1, clearRequired, startTangent, 0, clearAmount);
        pose = corridorPose(index, target, clearProgress, baseInput);
        role = pose.visible ? "corridor-clearing" : "cleared-corridor";
      } else {
        pose = corridorPose(index, target, corridorProgress, baseInput);
      }

      if (index === target && normalizedTime >= acquire) {
        const epsilon = Math.min(1e-4, acquire / 10);
        const atAcquire = corridorPose(index, target, 1, baseInput);
        const beforeAcquire = corridorPose(
          index,
          target,
          (acquire - epsilon) / acquire,
          baseInput,
        );
        const derivative = {
          x: (atAcquire.x - beforeAcquire.x) / epsilon,
          y: (atAcquire.y - beforeAcquire.y) / epsilon,
          width: (atAcquire.width - beforeAcquire.width) / epsilon,
          height: (atAcquire.height - beforeAcquire.height) / epsilon,
        };
        const ratio = bounded(item.ratio, 16 / 9, 0.05, 20);
        const arrivalCross = Math.min(width, height)
          * bounded(parameters.arrivalScale, defaults.arrivalScale, 0.42, 0.82);
        const arrivalWidth = width >= height ? arrivalCross * ratio : arrivalCross;
        const arrivalHeight = width >= height ? arrivalCross : arrivalCross / ratio;

        if (normalizedTime < arrival) {
          const amount = clamp((normalizedTime - acquire) / arrivalInterval, 0, 1);
          pose = {
            ...atAcquire,
            x: hermite(atAcquire.x, width / 2, derivative.x * arrivalInterval, 0, amount),
            y: hermite(atAcquire.y, height / 2, derivative.y * arrivalInterval, 0, amount),
            width: Math.max(1, hermite(
              atAcquire.width,
              arrivalWidth,
              derivative.width * arrivalInterval,
              0,
              amount,
            )),
            height: Math.max(1, hermite(
              atAcquire.height,
              arrivalHeight,
              derivative.height * arrivalInterval,
              0,
              amount,
            )),
            visible: true,
            z: 1.4,
          };
          role = "arrival";
        } else if (normalizedTime < landmarks.holdEnd) {
          pose = {
            ...atAcquire,
            x: width / 2,
            y: height / 2,
            width: arrivalWidth,
            height: arrivalHeight,
            visible: true,
            z: 1.3,
          };
          role = "hold";
        } else {
          const amount = smootherstep(
            (normalizedTime - landmarks.holdEnd)
              / Math.max(1e-9, landmarks.exitEnd - landmarks.holdEnd),
          );
          const coverScale = Math.max(
            width / Math.max(1, arrivalWidth),
            height / Math.max(1, arrivalHeight),
          ) * 1.12;
          const drift = (timeline.direction === "reverse" ? -1 : 1)
            * width
            * 0.035
            * amount;
          pose = {
            ...atAcquire,
            x: width / 2 + drift,
            y: height / 2 + height * 0.025 * amount,
            width: arrivalWidth * mix(1, coverScale, amount),
            height: arrivalHeight * mix(1, coverScale, amount),
            visible: true,
            z: 0.8,
          };
          role = "takeover";
        }
      }

      return {
        id: item.id,
        sourceIndex: index,
        x: pose.x,
        y: pose.y,
        width: pose.width,
        height: pose.height,
        worldX: pose.worldX,
        worldZ: pose.worldZ,
        visible: pose.visible,
        z: Math.round(10000 - (Number.isFinite(pose.z) ? pose.z : 0) * 400)
          + (index === target ? 5000 : 0),
        opacity: 1,
        filter: "none",
        alpha: !!item.alpha,
        video: !!item.video,
        failed: !!item.failed,
        role,
        region: pose.region,
      };
    });

    const inHold = normalizedTime >= arrival && normalizedTime < landmarks.holdEnd;
    return {
      normalizedTime,
      storyTimeMs,
      stage: stageAt(normalizedTime, landmarks),
      targetSourceIndex: target,
      velocity: inHold ? 0 : 1 / timeline.durationMs,
      finite: true,
      landmarks,
      visualSkipLandmarkMs: timeline.visualSkipLandmarkMs,
      frames,
      render,
    };
  }

  const api = {
    defaults,
    landmarks: DEFAULT_LANDMARKS,
    minimumDurationMs: MIN_DURATION_MS,
    fixtureItems,
    compile,
    evaluate,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.ChapterRevealEvaluator = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
