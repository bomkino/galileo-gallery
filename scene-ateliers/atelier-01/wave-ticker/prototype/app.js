(function () {
  "use strict";

  const CONFIG = {"evaluatorGlobal":"WaveTickerEvaluator","title":"Ribbon \u2014 Wave","studyDurationMs":8000,"paceMs":950,"finite":false,"rotatesCards":true,"hasTargetControl":false,"controls":[{"id":"frameScale","label":"Frame size","min":0.14,"max":0.32,"step":0.01,"unit":"\u00d7 cross axis","digits":2},{"id":"gap","label":"Minimum gap","min":0,"max":180,"step":1,"unit":"dp @ 1080","digits":0},{"id":"amplitude","label":"Amplitude","min":0.04,"max":0.24,"step":0.01,"unit":"\u00d7 cross axis","digits":2},{"id":"wavelength","label":"Wavelength","min":0.3,"max":0.9,"step":0.01,"unit":"\u00d7 major axis","digits":2},{"id":"tangentInfluence","label":"Tangent follow","min":0,"max":0.45,"step":0.01,"unit":"fraction","digits":2}]};
  const Evaluator = window[CONFIG.evaluatorGlobal];
  const sizes = { "16:9": [960, 540], "9:16": [540, 960], "1:1": [720, 720], "4:5": [640, 800] };
  const palette = ["#ef5b45", "#f0bd49", "#31a9a1", "#6678d8", "#b868cc", "#4c9e67", "#ef76a4", "#819a9f"];
  const byId = (id) => document.getElementById(id);
  const canvas = byId("canvas");
  const context = canvas.getContext("2d", { alpha: true });
  const stage = byId("stage");
  const scrub = byId("scrub");
  const timeValue = byId("timeValue");
  const countInput = byId("count");
  const canvasInput = byId("canvasPreset");
  const directionInput = byId("direction");
  const reducedInput = byId("reduced");
  const silhouetteInput = byId("silhouette");
  const compositeInput = byId("composite");
  const playButton = byId("play");
  const restartButton = byId("restart");
  const resetSceneButton = byId("resetScene");
  const status = byId("status");
  const announcement = byId("announcement");
  const landmarksElement = byId("landmarks");
  const sceneControlsElement = byId("sceneControls");
  const extraControlsElement = byId("extraControls");

  let parameters = { ...Evaluator.defaults };
  let playing = false;
  let lastFrameTime = 0;
  let animationFrame = 0;
  let durationMs = CONFIG.studyDurationMs || 8000;
  let currentTimeline = null;
  let currentState = null;
  let targetInput = null;
  let announceTimer = 0;

  function announce(message) {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => { announcement.textContent = message; }, 120);
  }

  function formatControl(control, value) {
    const suffix = control.unit ? ` ${control.unit}` : "";
    return `${Number(value).toFixed(control.digits)}${suffix}`;
  }

  function buildSceneControls() {
    sceneControlsElement.replaceChildren();
    for (const control of CONFIG.controls) {
      const wrapper = document.createElement("div");
      wrapper.className = "scene-control";
      const label = document.createElement("label");
      label.htmlFor = `parameter-${control.id}`;
      const name = document.createElement("span");
      name.textContent = control.label;
      label.append(name);
      const input = document.createElement("input");
      input.id = `parameter-${control.id}`;
      input.type = "range";
      input.min = String(control.min);
      input.max = String(control.max);
      input.step = String(control.step);
      input.value = String(parameters[control.id]);
      const output = document.createElement("output");
      output.htmlFor = input.id;
      output.textContent = formatControl(control, parameters[control.id]);
      input.addEventListener("input", () => {
        parameters = { ...parameters, [control.id]: Number(input.value) };
        output.textContent = formatControl(control, parameters[control.id]);
        render();
      });
      input.addEventListener("change", () => announce(`${control.label}: ${output.textContent}`));
      wrapper.append(label, input, output);
      sceneControlsElement.append(wrapper);
    }
  }

  function buildExtraControls() {
    extraControlsElement.replaceChildren();
    if (!CONFIG.hasTargetControl) return;
    const wrapper = document.createElement("div");
    wrapper.className = "context-grid";
    wrapper.style.marginTop = "10px";
    const label = document.createElement("label");
    label.className = "control";
    label.htmlFor = "target";
    const text = document.createElement("span");
    text.textContent = "Target";
    targetInput = document.createElement("select");
    targetInput.id = "target";
    for (const [value, copy] of [["auto", "Automatic · last"], ["first", "First"], ["middle", "Middle"], ["last", "Last"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = copy;
      targetInput.append(option);
    }
    targetInput.addEventListener("input", () => { setPlaying(false); render(); announce(`Target: ${targetInput.options[targetInput.selectedIndex].textContent}`); });
    label.append(text, targetInput);
    wrapper.append(label);
    extraControlsElement.append(wrapper);
  }

  function targetIndexFor(items) {
    if (!targetInput || !items.length || targetInput.value === "auto") return undefined;
    if (targetInput.value === "first") return 0;
    if (targetInput.value === "middle") return Math.floor((items.length - 1) / 2);
    return items.length - 1;
  }

  function timelineFor(items) {
    if (CONFIG.finite) {
      return Evaluator.compile({
        items,
        mode: "automatic",
        direction: directionInput.value,
        targetSourceIndex: targetIndexFor(items),
      });
    }
    return Evaluator.compile({
      mediaCount: items.length,
      paceMs: CONFIG.paceMs,
      direction: directionInput.value,
      durationMs: CONFIG.studyDurationMs,
    });
  }

  function roundedRect(x, y, width, height, radius) {
    const resolved = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.roundRect(x, y, width, height, resolved);
  }

  function drawArtwork(frame) {
    const width = frame.width;
    const height = frame.height;
    if (width < 1 || height < 1 || !Number.isFinite(width + height + frame.x + frame.y)) return;
    const scale = Number.isFinite(frame.scale) ? frame.scale : 1;
    context.save();
    context.translate(frame.x, frame.y);
    if (CONFIG.rotatesCards && Number.isFinite(frame.rotation)) context.rotate(frame.rotation * Math.PI / 180);
    context.scale(scale, scale);
    const x = -width / 2;
    const y = -height / 2;
    roundedRect(x, y, width, height, Math.min(width, height) * 0.035);
    context.clip();

    if (silhouetteInput.checked) {
      context.fillStyle = "#070707";
      context.fillRect(x, y, width, height);
    } else if (frame.failed) {
      context.fillStyle = "#2b2927";
      context.fillRect(x, y, width, height);
      context.strokeStyle = "#f4f1e9";
      context.lineWidth = Math.max(2, width * 0.008);
      context.setLineDash([10, 8]);
      context.strokeRect(x + width * 0.08, y + height * 0.08, width * 0.84, height * 0.84);
      context.setLineDash([]);
    } else {
      context.fillStyle = palette[frame.sourceIndex % palette.length];
      context.fillRect(x, y, width, height);
      context.globalAlpha = 0.22;
      context.fillStyle = "#fff";
      context.beginPath();
      context.arc(
        x + width * (0.2 + (frame.sourceIndex % 4) * 0.17),
        y + height * 0.34,
        Math.min(width, height) * 0.16,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.fillRect(x + width * 0.08, y + height * 0.65, width * 0.54, Math.max(2, height * 0.035));
      context.fillRect(x + width * 0.08, y + height * 0.73, width * 0.36, Math.max(2, height * 0.025));
      context.globalAlpha = 1;
      if (frame.alpha) {
        context.globalCompositeOperation = "destination-out";
        context.beginPath();
        context.arc(x + width * 0.72, y + height * 0.48, Math.min(width, height) * 0.18, 0, Math.PI * 2);
        context.fill();
        context.globalCompositeOperation = "source-over";
      }
    }

    if (!silhouetteInput.checked) {
      const label = frame.failed ? "FAILED" : frame.video ? "VIDEO" : String(frame.sourceIndex + 1).padStart(2, "0");
      context.fillStyle = "#fff";
      context.font = `700 ${Math.max(9, Math.min(width, height) * 0.10)}px ui-monospace, monospace`;
      context.textBaseline = "bottom";
      context.fillText(label, x + width * 0.06, y + height * 0.92);
    }
    context.restore();
  }

  function stateSummary(state, items) {
    const time = Number(scrub.value);
    const visible = state.frames.filter((frame) => frame.visible).length;
    if (CONFIG.finite) return `${(time / 1000).toFixed(3)} s · ${state.stage} · target ${state.targetSourceIndex >= 0 ? state.targetSourceIndex + 1 : "—"} · ${visible} visible`;
    if (CONFIG.evaluatorGlobal === "FilmstripRiverEvaluator") return `${(time / 1000).toFixed(3)} s · ${state.axis} · lanes ${state.laneDirection.map(value => value < 0 ? "←" : "→").join(" / ")} · ${visible} visible`;
    if (CONFIG.evaluatorGlobal === "WaveTickerEvaluator") return `${(time / 1000).toFixed(3)} s · ${state.axis} · ${state.path.waveCount} waves · ${visible} visible`;
    if (CONFIG.evaluatorGlobal === "DeckRiverEvaluator") return `${(time / 1000).toFixed(3)} s · fixed camera · ${visible} visible · ${state.path.arcLength.toFixed(2)} world-unit path`;
    const resolvedGap = state.geometry?.resolvedGapPx ?? 0;
    return `${(time / 1000).toFixed(3)} s · phase ${state.phase.toFixed(4)} · ${items.length} items · ${resolvedGap.toFixed(1)} px gap`;
  }

  function buildLandmarks(timeline) {
    landmarksElement.replaceChildren();
    let landmarks;
    if (CONFIG.finite) {
      const values = timeline.landmarks;
      landmarks = [
        ["Entry", 0],
        ["Corridor", values.entryEnd],
        ["Acquire", values.corridorEnd],
        ["Arrival", values.acquireEnd],
        ["Hold", values.arrivalEnd],
        ["Takeover", values.holdEnd],
        ["End", 1],
      ];
    } else {
      landmarks = [["Start", 0], ["¼", .25], ["½", .5], ["¾", .75], ["Seam", 1]];
    }
    for (const [label, fraction] of landmarks) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.fraction = String(fraction);
      button.addEventListener("click", () => {
        setPlaying(false);
        scrub.value = String(durationMs * fraction);
        render(false);
        announce(`${label} pose at ${(Number(scrub.value) / 1000).toFixed(3)} seconds`);
      });
      landmarksElement.append(button);
    }
  }

  function render(rebuildLandmarks = true) {
    const [width, height] = sizes[canvasInput.value];
    const items = Evaluator.fixtureItems(Number(countInput.value));
    currentTimeline = timelineFor(items);
    durationMs = currentTimeline.durationMs;
    scrub.max = String(durationMs);
    if (Number(scrub.value) > durationMs) scrub.value = String(durationMs);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      canvas.style.aspectRatio = `${width} / ${height}`;
    }
    const evaluatorInput = {
      items,
      parameters,
      timeline: currentTimeline,
      timeMs: Number(scrub.value),
      stageWidth: width,
      stageHeight: height,
      reducedMotion: reducedInput.checked,
    };
    if (CONFIG.evaluatorGlobal === "QuietCarouselEvaluator") {
      evaluatorInput.axis = height > width ? "vertical" : "horizontal";
      evaluatorInput.fitIntent = "contain";
    }
    currentState = Evaluator.evaluate(evaluatorInput);
    context.clearRect(0, 0, width, height);
    currentState.frames
      .filter((frame) => frame.visible)
      .sort((a, b) => a.z - b.z)
      .forEach(drawArtwork);
    const summary = stateSummary(currentState, items);
    status.textContent = summary;
    timeValue.textContent = `${(Number(scrub.value) / 1000).toFixed(3)} s`;
    canvas.setAttribute("aria-label", `${CONFIG.title}. ${summary}. Generated fixtures; human verdict pending.`);
    if (rebuildLandmarks) buildLandmarks(currentTimeline);
    window.__ATELIER_STATE__ = currentState;
  }

  function setPlaying(next) {
    if (next && reducedInput.checked) {
      playing = false;
      announce("Reduced motion is enabled. Use the scrubber or named poses.");
    } else {
      playing = !!next;
    }
    playButton.setAttribute("aria-pressed", String(playing));
    playButton.textContent = playing ? "Pause" : (CONFIG.finite && Number(scrub.value) >= durationMs ? "Replay" : "Play");
    lastFrameTime = 0;
    if (playing) animationFrame = requestAnimationFrame(tick);
    else cancelAnimationFrame(animationFrame);
  }

  function tick(now) {
    if (!playing) return;
    if (!lastFrameTime) lastFrameTime = now;
    const elapsed = now - lastFrameTime;
    lastFrameTime = now;
    const current = Number(scrub.value);
    const next = CONFIG.finite ? Math.min(durationMs, current + elapsed) : (current + elapsed) % durationMs;
    scrub.value = String(next);
    render(false);
    if (CONFIG.finite && next >= durationMs) {
      setPlaying(false);
      return;
    }
    animationFrame = requestAnimationFrame(tick);
  }

  playButton.addEventListener("click", () => {
    if (!playing && CONFIG.finite && Number(scrub.value) >= durationMs) scrub.value = "0";
    setPlaying(!playing);
    announce(playing ? "Playback started" : "Playback paused");
  });
  restartButton.addEventListener("click", () => {
    setPlaying(false);
    scrub.value = "0";
    render(false);
    announce("Returned to start pose");
  });
  scrub.addEventListener("input", () => { setPlaying(false); render(false); });
  scrub.addEventListener("change", () => announce(`Story time ${(Number(scrub.value) / 1000).toFixed(3)} seconds`));
  for (const input of [countInput, canvasInput, directionInput]) {
    input.addEventListener("input", () => { setPlaying(false); render(); });
  }
  reducedInput.addEventListener("input", () => {
    if (reducedInput.checked) setPlaying(false);
    render(false);
    announce(reducedInput.checked ? "Reduced motion enabled" : "Reduced motion disabled");
  });
  silhouetteInput.addEventListener("input", () => { render(false); announce(silhouetteInput.checked ? "Silhouette view enabled" : "Artwork fixture view enabled"); });
  compositeInput.addEventListener("input", () => {
    stage.className = `stage is-${compositeInput.value}`;
    render(false);
    announce(`${compositeInput.options[compositeInput.selectedIndex].textContent} composite`);
  });
  resetSceneButton.addEventListener("click", () => {
    parameters = { ...Evaluator.defaults };
    buildSceneControls();
    render(false);
    announce("Scene geometry reset to candidate defaults");
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) setPlaying(false); });

  const motionPreference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (motionPreference?.matches) reducedInput.checked = true;
  motionPreference?.addEventListener?.("change", (event) => {
    reducedInput.checked = event.matches;
    if (event.matches) setPlaying(false);
    render(false);
  });

  buildSceneControls();
  buildExtraControls();
  render();

  window.atelierPrototype = {
    setTimeMs(value) { setPlaying(false); scrub.value = String(Math.max(0, Math.min(durationMs, Number(value)))); render(false); },
    setCount(value) { setPlaying(false); countInput.value = String(value); render(); },
    setCanvas(value) { setPlaying(false); canvasInput.value = value; render(); },
    setDirection(value) { setPlaying(false); directionInput.value = value; render(); },
    setReducedMotion(value) { reducedInput.checked = !!value; if (value) setPlaying(false); render(false); },
    setComposite(value) { compositeInput.value = value; stage.className = `stage is-${value}`; render(false); },
    setSilhouette(value) { silhouetteInput.checked = !!value; render(false); },
    setParameter(id, value) {
      if (!(id in parameters)) throw new Error(`Unknown Scene parameter: ${id}`);
      parameters = { ...parameters, [id]: Number(value) };
      const input = byId(`parameter-${id}`);
      if (input) { input.value = String(value); input.dispatchEvent(new Event("input")); }
      else render(false);
    },
    setTarget(value) { if (!targetInput) throw new Error("This Scene has no target control."); targetInput.value = value; render(); },
    play() { if (CONFIG.finite && Number(scrub.value) >= durationMs) scrub.value = "0"; setPlaying(true); },
    pause() { setPlaying(false); },
    getState() { return JSON.parse(JSON.stringify(currentState)); },
    getDurationMs() { return durationMs; },
    getParameters() { return { ...parameters }; },
  };
})();
