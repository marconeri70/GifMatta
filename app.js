const MAX_PHOTOS = 20;
const MAX_VIDEO_SECONDS = 6;
const MAX_VIDEO_FRAMES = 32;
const MAX_HISTORY = 8;

const $ = selector => document.querySelector(selector);
const dom = {
  photoModeBtn: $("#photoModeBtn"),
  videoModeBtn: $("#videoModeBtn"),
  photoPanel: $("#photoPanel"),
  videoPanel: $("#videoPanel"),
  photoInput: $("#photoInput"),
  videoInput: $("#videoInput"),
  photoList: $("#photoList"),
  videoInfo: $("#videoInfo"),
  videoStart: $("#videoStart"),
  videoDuration: $("#videoDuration"),
  videoFps: $("#videoFps"),
  presetSelect: $("#presetSelect"),
  applyPresetBtn: $("#applyPresetBtn"),
  topText: $("#topText"),
  bottomText: $("#bottomText"),
  textColor: $("#textColor"),
  fontSize: $("#fontSize"),
  fontSizeValue: $("#fontSizeValue"),
  animationStyle: $("#animationStyle"),
  effectIntensity: $("#effectIntensity"),
  effectIntensityValue: $("#effectIntensityValue"),
  emojiSelect: $("#emojiSelect"),
  emojiSize: $("#emojiSize"),
  emojiSizeValue: $("#emojiSizeValue"),
  emojiX: $("#emojiX"),
  emojiY: $("#emojiY"),
  aspectRatio: $("#aspectRatio"),
  resolution: $("#resolution"),
  fitMode: $("#fitMode"),
  photoDelay: $("#photoDelay"),
  photoDelayLabel: $("#photoDelayLabel"),
  boomerang: $("#boomerang"),
  canvasWrap: $("#canvasWrap"),
  canvas: $("#previewCanvas"),
  emptyPreview: $("#emptyPreview"),
  refreshPreviewBtn: $("#refreshPreviewBtn"),
  generateBtn: $("#generateBtn"),
  progressBox: $("#progressBox"),
  progressBar: $("#progressBar"),
  progressText: $("#progressText"),
  resultBox: $("#resultBox"),
  resultImage: $("#resultImage"),
  resultMeta: $("#resultMeta"),
  downloadBtn: $("#downloadBtn"),
  shareBtn: $("#shareBtn"),
  recentGrid: $("#recentGrid"),
  clearHistoryBtn: $("#clearHistoryBtn"),
  installBtn: $("#installBtn"),
  toast: $("#toast")
};

const ctx = dom.canvas.getContext("2d", { willReadFrequently: true });
const state = {
  mode: "photo",
  photos: [],
  videoFile: null,
  videoUrl: null,
  video: null,
  currentBlob: null,
  currentUrl: null,
  deferredInstallPrompt: null,
  autoTimer: null,
  generationInProgress: false,
  generationQueued: false,
  previewToken: 0,
  recentUrls: [],
  activePresetKey: "auto"
};



const PRESET_LIBRARY = {
  auto: {
    top: "CHE FACCIA",
    bottom: "NON CE LA POSSO FARE",
    emoji: "😂",
    animation: "zoom"
  },
  monday: {
    top: "QUANDO È LUNEDÌ",
    bottom: "E TU NON SEI PRONTO",
    emoji: "🤦",
    animation: "slide"
  },
  salary: {
    top: "IO CHE ASPETTO",
    bottom: "LO STIPENDIO",
    emoji: "💸",
    animation: "pulse"
  },
  minute: {
    top: "QUANDO DICONO",
    bottom: "CI VUOLE SOLO UN MINUTO",
    emoji: "😑",
    animation: "shake"
  },
  problems: {
    top: "NESSUN PROBLEMA",
    bottom: "AVEVANO DETTO...",
    emoji: "🤣",
    animation: "dramatic"
  },
  shock: {
    top: "ASPETTA... COSA?",
    bottom: "IO SONO SCONVOLTO",
    emoji: "😱",
    animation: "shake"
  },
  work: {
    top: "IO A LAVORO",
    bottom: "DOPO 3 ORE DI SONNO",
    emoji: "🥴",
    animation: "slide"
  },
  hunger: {
    top: "QUANDO DICI",
    bottom: "MANGIO SOLO UNA COSA",
    emoji: "🍕",
    animation: "zoom"
  },
  love: {
    top: "QUANDO MI GUARDI COSÌ",
    bottom: "IO MI SCIOGLIO",
    emoji: "❤️",
    animation: "pulse"
  },
  weekend: {
    top: "IO CHE GUARDO",
    bottom: "ARRIVARE IL WEEKEND",
    emoji: "😎",
    animation: "zoom"
  },
  sleep: {
    top: "LA MIA FACCIA",
    bottom: "QUANDO SUONA LA SVEGLIA",
    emoji: "😴",
    animation: "dramatic"
  },
  victory: {
    top: "MISSIONE COMPIUTA",
    bottom: "GRANDE VITTORIA",
    emoji: "🏆",
    animation: "pulse"
  }
};

function init() {
  bindEvents();
  updateCanvasDimensions();
  renderEmptyCanvas();
  loadRecentGifs();
  applyPreset(dom.presetSelect?.value || "auto", { silent: true, onlyIfEmpty: true });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js").catch(error => {
      console.warn("Service worker non registrato:", error);
    });
  }
}

function bindEvents() {
  dom.photoModeBtn.addEventListener("click", () => setMode("photo"));
  dom.videoModeBtn.addEventListener("click", () => setMode("video"));
  dom.photoInput.addEventListener("change", handlePhotosSelected);
  dom.videoInput.addEventListener("change", handleVideoSelected);
  dom.photoList.addEventListener("click", handlePhotoAction);
  dom.generateBtn.addEventListener("click", () => generateGif(false));
  dom.shareBtn.addEventListener("click", shareCurrentGif);
  dom.refreshPreviewBtn.addEventListener("click", updatePreview);
  dom.clearHistoryBtn.addEventListener("click", clearHistory);
  dom.recentGrid.addEventListener("click", handleRecentAction);

  document.querySelectorAll(".template").forEach(button => {
    button.addEventListener("click", () => {
      const presetKey = button.dataset.preset || "auto";
      dom.presetSelect.value = presetKey;
      applyPreset(presetKey);
    });
  });

  dom.presetSelect.addEventListener("change", () => applyPreset(dom.presetSelect.value));
  dom.applyPresetBtn.addEventListener("click", () => applyPreset(dom.presetSelect.value));

  const previewInputs = [
    dom.topText, dom.bottomText, dom.textColor, dom.fontSize,
    dom.animationStyle, dom.effectIntensity,
    dom.emojiSelect, dom.emojiSize, dom.emojiX, dom.emojiY,
    dom.aspectRatio, dom.resolution, dom.fitMode,
    dom.videoStart, dom.videoDuration
  ];
  previewInputs.forEach(input => {
    input.addEventListener("input", debounce(updatePreview, 90));
    input.addEventListener("change", updatePreview);
  });

  const automaticInputs = [...previewInputs, dom.photoDelay, dom.videoFps, dom.boomerang];
  automaticInputs.forEach(input => {
    input.addEventListener("input", debounce(() => requestAutoGenerate(500), 180));
    input.addEventListener("change", () => requestAutoGenerate(250));
  });

  dom.fontSize.addEventListener("input", () => {
    dom.fontSizeValue.textContent = `${dom.fontSize.value} px`;
  });
  dom.effectIntensity.addEventListener("input", () => {
    dom.effectIntensityValue.textContent = `${dom.effectIntensity.value} / 10`;
  });
  dom.emojiSize.addEventListener("input", () => {
    dom.emojiSizeValue.textContent = `${dom.emojiSize.value} px`;
  });

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    dom.installBtn.classList.remove("hidden");
  });
  dom.installBtn.addEventListener("click", installApp);
  window.addEventListener("appinstalled", () => {
    dom.installBtn.classList.add("hidden");
    state.deferredInstallPrompt = null;
    showToast("GifFacile è stata installata.");
  });
}

function setMode(mode) {
  if (state.mode === mode) return;
  state.mode = mode;
  const isPhoto = mode === "photo";
  dom.photoModeBtn.classList.toggle("active", isPhoto);
  dom.videoModeBtn.classList.toggle("active", !isPhoto);
  dom.photoModeBtn.setAttribute("aria-selected", String(isPhoto));
  dom.videoModeBtn.setAttribute("aria-selected", String(!isPhoto));
  dom.photoPanel.classList.toggle("hidden", !isPhoto);
  dom.videoPanel.classList.toggle("hidden", isPhoto);
  dom.photoDelayLabel.classList.toggle("hidden", !isPhoto);
  updateGenerateState();
  updatePreview();
  requestAutoGenerate(250);
}

async function handlePhotosSelected(event) {
  const files = [...event.target.files].filter(file => file.type.startsWith("image/"));
  if (!files.length) return;

  const available = Math.max(0, MAX_PHOTOS - state.photos.length);
  const selected = files.slice(0, available);
  if (selected.length < files.length) showToast(`Puoi usare al massimo ${MAX_PHOTOS} foto.`);

  for (const file of selected) {
    try {
      const source = await loadImageSource(file);
      state.photos.push({ file, source, url: URL.createObjectURL(file) });
    } catch (error) {
      console.error(error);
      showToast(`Non riesco a leggere ${file.name}.`);
    }
  }
  event.target.value = "";
  renderPhotoList();
  updateGenerateState();
  await updatePreview();
  requestAutoGenerate(180);
}

async function loadImageSource(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      return createImageBitmap(file);
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function renderPhotoList() {
  if (!state.photos.length) {
    dom.photoList.innerHTML = "";
    return;
  }
  dom.photoList.innerHTML = state.photos.map((photo, index) => `
    <article class="photo-card">
      <img src="${escapeAttribute(photo.url)}" alt="Foto ${index + 1}">
      <span class="photo-order">${index + 1}</span>
      <div class="photo-actions">
        <button type="button" data-action="up" data-index="${index}" aria-label="Sposta prima" ${index === 0 ? "disabled" : ""}>←</button>
        <button type="button" data-action="down" data-index="${index}" aria-label="Sposta dopo" ${index === state.photos.length - 1 ? "disabled" : ""}>→</button>
        <button type="button" data-action="remove" data-index="${index}" aria-label="Rimuovi foto">×</button>
      </div>
    </article>
  `).join("");
}

function handlePhotoAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const index = Number(button.dataset.index);
  const action = button.dataset.action;
  if (!Number.isInteger(index) || !state.photos[index]) return;

  if (action === "remove") {
    const [removed] = state.photos.splice(index, 1);
    URL.revokeObjectURL(removed.url);
    if (removed.source?.close) removed.source.close();
  } else if (action === "up" && index > 0) {
    [state.photos[index - 1], state.photos[index]] = [state.photos[index], state.photos[index - 1]];
  } else if (action === "down" && index < state.photos.length - 1) {
    [state.photos[index + 1], state.photos[index]] = [state.photos[index], state.photos[index + 1]];
  }
  renderPhotoList();
  updateGenerateState();
  updatePreview();
  requestAutoGenerate(220);
}

async function handleVideoSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("video/")) {
    showToast("Seleziona un file video valido.");
    return;
  }
  clearVideo();
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await waitForEvent(video, "loadedmetadata", 15000);
    if (video.readyState < 2) {
      await waitForEvent(video, "loadeddata", 15000);
    }
    state.videoFile = file;
    state.videoUrl = url;
    state.video = video;
    const maxStart = Math.max(0, video.duration - 0.5);
    dom.videoStart.max = maxStart.toFixed(1);
    dom.videoDuration.max = Math.min(MAX_VIDEO_SECONDS, video.duration).toFixed(1);
    dom.videoDuration.value = Math.min(3, video.duration).toFixed(1);
    dom.videoInfo.innerHTML = `
      <strong>${escapeHtml(file.name)}</strong><br>
      Durata: ${formatDuration(video.duration)} · ${video.videoWidth}×${video.videoHeight}
    `;
    dom.videoInfo.classList.remove("hidden");
    updateGenerateState();
    await updatePreview();
    requestAutoGenerate(180);
  } catch (error) {
    console.error(error);
    URL.revokeObjectURL(url);
    showToast("Non riesco a leggere questo video. Prova con MP4 o WebM.");
  } finally {
    event.target.value = "";
  }
}

function clearVideo() {
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  if (state.video) {
    state.video.removeAttribute("src");
    state.video.load();
  }
  state.videoFile = null;
  state.videoUrl = null;
  state.video = null;
  dom.videoInfo.classList.add("hidden");
  dom.videoInfo.textContent = "";
}

function updateGenerateState() {
  const hasContent = state.mode === "photo" ? state.photos.length > 0 : Boolean(state.video);
  dom.generateBtn.disabled = !hasContent || state.generationInProgress;
  if (!state.generationInProgress) {
    dom.generateBtn.textContent = hasContent ? "⚡ Rigenera ora" : "⚡ Generazione automatica";
  }
}

function requestAutoGenerate(delay = 350) {
  const hasContent = state.mode === "photo" ? state.photos.length > 0 : Boolean(state.video);
  if (!hasContent) return;
  clearTimeout(state.autoTimer);
  if (state.generationInProgress) {
    state.generationQueued = true;
    return;
  }
  dom.generateBtn.textContent = "⚡ Creazione automatica…";
  state.autoTimer = setTimeout(() => generateGif(true), delay);
}

function updateCanvasDimensions() {
  const { width, height, className } = getOutputSize();
  if (dom.canvas.width !== width) dom.canvas.width = width;
  if (dom.canvas.height !== height) dom.canvas.height = height;
  dom.canvasWrap.className = `canvas-wrap ${className}`;
}

function getOutputSize() {
  const base = Number(dom.resolution.value) || 480;
  switch (dom.aspectRatio.value) {
    case "4:5": return { width: Math.round(base * 4 / 5), height: base, className: "ratio-4-5" };
    case "16:9": return { width: base, height: Math.round(base * 9 / 16), className: "ratio-16-9" };
    case "9:16": return { width: Math.round(base * 9 / 16), height: base, className: "ratio-9-16" };
    default: return { width: base, height: base, className: "ratio-1-1" };
  }
}

async function updatePreview() {
  const token = ++state.previewToken;
  updateCanvasDimensions();
  const source = state.mode === "photo" ? state.photos[0]?.source : state.video;
  if (!source) {
    renderEmptyCanvas();
    return;
  }

  try {
    if (state.mode === "video") {
      const start = clamp(Number(dom.videoStart.value) || 0, 0, Math.max(0, state.video.duration - 0.05));
      await seekVideo(state.video, start);
      if (token !== state.previewToken) return;
    }
    drawFrame(source, createAnimationFrameState(getResolvedAnimationStyle(), 0.35));
    dom.emptyPreview.classList.add("hidden");
  } catch (error) {
    console.warn("Anteprima non disponibile:", error);
  }
}

function renderEmptyCanvas() {
  updateCanvasDimensions();
  ctx.fillStyle = "#17131d";
  ctx.fillRect(0, 0, dom.canvas.width, dom.canvas.height);
  dom.emptyPreview.classList.remove("hidden");
}

function drawFrame(source, animationState = null) {
  const width = dom.canvas.width;
  const height = dom.canvas.height;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#15121b";
  ctx.fillRect(0, 0, width, height);
  drawMedia(source, width, height, dom.fitMode.value, animationState);
  drawReadabilityGradient(width, height);
  drawOverlay(width, height);
  ctx.restore();
}

function drawMedia(source, canvasWidth, canvasHeight, fit, animationState = null) {
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
  const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
  if (!sourceWidth || !sourceHeight) return;

  const scale = fit === "contain"
    ? Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight)
    : Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const x = (canvasWidth - drawWidth) / 2;
  const y = (canvasHeight - drawHeight) / 2;

  if (!animationState || animationState.style === "none") {
    ctx.drawImage(source, x, y, drawWidth, drawHeight);
    return;
  }

  ctx.save();
  ctx.translate(canvasWidth / 2 + animationState.dx, canvasHeight / 2 + animationState.dy);
  ctx.rotate(animationState.rotation);
  ctx.scale(animationState.scale, animationState.scale);
  ctx.drawImage(source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();
}


function applyPreset(presetKey, options = {}) {
  const { silent = false, onlyIfEmpty = false } = options;
  const preset = PRESET_LIBRARY[presetKey] || PRESET_LIBRARY.auto;
  state.activePresetKey = presetKey in PRESET_LIBRARY ? presetKey : "auto";
  dom.presetSelect.value = state.activePresetKey;

  if (!onlyIfEmpty || !dom.topText.value.trim()) dom.topText.value = preset.top || "";
  if (!onlyIfEmpty || !dom.bottomText.value.trim()) dom.bottomText.value = preset.bottom || "";
  if (!onlyIfEmpty || !dom.emojiSelect.value) dom.emojiSelect.value = preset.emoji || "";
  if ((dom.animationStyle.value === "auto" || !onlyIfEmpty) && preset.animation) {
    dom.animationStyle.value = dom.animationStyle.value === "none" && onlyIfEmpty ? "none" : preset.animation;
  }
  if (!silent) {
    showToast(`Idea applicata: ${dom.presetSelect.options[dom.presetSelect.selectedIndex].text}`);
  }
  updatePreview();
  requestAutoGenerate(220);
}

function getResolvedAnimationStyle() {
  const selected = dom.animationStyle.value || "auto";
  if (selected !== "auto") return selected;
  const preset = PRESET_LIBRARY[state.activePresetKey] || PRESET_LIBRARY.auto;
  if (preset?.animation) return preset.animation;
  if (state.mode === "photo" && state.photos.length <= 1) return "zoom";
  return "slide";
}

function createAnimationFrameState(style, progress) {
  const intensity = (Number(dom.effectIntensity.value) || 6) / 10;
  const wave = Math.sin(progress * Math.PI * 2);
  const ping = Math.sin(progress * Math.PI);
  const sway = Math.sin(progress * Math.PI * 4);
  let scale = 1;
  let dx = 0;
  let dy = 0;
  let rotation = 0;

  switch (style) {
    case "zoom":
      scale = 1 + 0.08 * intensity + 0.12 * progress * intensity;
      dx = Math.sin(progress * Math.PI * 2) * 10 * intensity;
      dy = -6 * ping * intensity;
      break;
    case "pulse":
      scale = 1 + (0.04 + 0.05 * intensity) * ping;
      dy = -4 * ping * intensity;
      break;
    case "shake":
      scale = 1.03 + 0.03 * intensity;
      dx = sway * 14 * intensity;
      dy = Math.cos(progress * Math.PI * 6) * 5 * intensity;
      rotation = sway * 0.03 * intensity;
      break;
    case "slide":
      scale = 1.04 + 0.03 * intensity;
      dx = (0.5 - progress) * 28 * intensity;
      rotation = (0.5 - progress) * 0.02 * intensity;
      break;
    case "spin":
      scale = 1.05 + 0.03 * intensity;
      rotation = wave * 0.04 * intensity;
      dy = -3 * ping * intensity;
      break;
    case "dramatic":
      scale = 1 + 0.05 * intensity + 0.15 * progress * intensity;
      dy = -12 * progress * intensity;
      rotation = -0.02 * intensity;
      break;
    default:
      return { style: "none", scale: 1, dx: 0, dy: 0, rotation: 0 };
  }

  return { style, scale, dx, dy, rotation };
}

function drawReadabilityGradient(width, height) {
  const top = ctx.createLinearGradient(0, 0, 0, height * 0.34);
  top.addColorStop(0, "rgba(0,0,0,.45)");
  top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, width, height * 0.34);

  const bottom = ctx.createLinearGradient(0, height * 0.63, 0, height);
  bottom.addColorStop(0, "rgba(0,0,0,0)");
  bottom.addColorStop(1, "rgba(0,0,0,.52)");
  ctx.fillStyle = bottom;
  ctx.fillRect(0, height * 0.6, width, height * 0.4);
}

function drawOverlay(width, height) {
  const requestedSize = Number(dom.fontSize.value) || 42;
  const scaleFactor = width / 480;
  const fontSize = Math.max(18, Math.round(requestedSize * scaleFactor));
  const padding = Math.max(12, Math.round(width * 0.035));

  drawMemeText(dom.topText.value, "top", fontSize, padding, width, height);
  drawMemeText(dom.bottomText.value, "bottom", fontSize, padding, width, height);

  const emoji = dom.emojiSelect.value;
  if (emoji) {
    const emojiSize = Math.max(24, Math.round((Number(dom.emojiSize.value) || 72) * scaleFactor));
    const x = width * (Number(dom.emojiX.value) / 100);
    const y = height * (Number(dom.emojiY.value) / 100);
    ctx.save();
    ctx.font = `${emojiSize}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,.45)";
    ctx.shadowBlur = Math.max(3, emojiSize * 0.08);
    ctx.fillText(emoji, x, y);
    ctx.restore();
  }
}

function drawMemeText(rawText, position, initialSize, padding, width, height) {
  const text = rawText.trim().toUpperCase();
  if (!text) return;

  let fontSize = initialSize;
  let lines = [];
  const maxWidth = width - padding * 2;
  while (fontSize >= 16) {
    ctx.font = `900 ${fontSize}px Impact, Haettenschweiler, "Arial Black", sans-serif`;
    lines = wrapText(text, maxWidth);
    const widest = Math.max(...lines.map(line => ctx.measureText(line).width));
    if (widest <= maxWidth && lines.length <= 3) break;
    fontSize -= 2;
  }

  const lineHeight = fontSize * 1.06;
  const totalHeight = lines.length * lineHeight;
  const startY = position === "top"
    ? padding + fontSize * 0.82
    : height - padding - totalHeight + fontSize * 0.82;

  ctx.save();
  ctx.font = `900 ${fontSize}px Impact, Haettenschweiler, "Arial Black", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeStyle = "rgba(0,0,0,.96)";
  ctx.lineWidth = Math.max(3, fontSize * 0.13);
  ctx.fillStyle = dom.textColor.value || "#ffffff";
  lines.forEach((line, index) => {
    const y = startY + index * lineHeight;
    ctx.strokeText(line, width / 2, y, maxWidth);
    ctx.fillText(line, width / 2, y, maxWidth);
  });
  ctx.restore();
}

function wrapText(text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function generateGif(isAutomatic = false) {
  const hasContent = state.mode === "photo" ? state.photos.length > 0 : Boolean(state.video);
  if (!hasContent) return;
  if (state.generationInProgress) {
    state.generationQueued = true;
    return;
  }

  clearTimeout(state.autoTimer);
  state.generationInProgress = true;
  state.generationQueued = false;
  setBusy(true);
  dom.resultBox.classList.add("hidden");
  setProgress(3, isAutomatic ? "Creazione automatica della GIF…" : "Preparazione della GIF…");

  try {
    if (!window.SimpleGifEncoder) throw new Error("Motore GIF non disponibile");
    updateCanvasDimensions();
    const { width, height } = getOutputSize();
    const gif = new window.SimpleGifEncoder(width, height, { repeat: 0 });

    if (state.mode === "photo") {
      await encodePhotoFrames(gif, width, height);
    } else {
      await encodeVideoFrames(gif, width, height);
    }

    setProgress(96, "Completamento del file…");
    const bytes = gif.finish();
    const blob = new Blob([bytes], { type: "image/gif" });
    if (!blob.size || gif.frameCount < 1) throw new Error("GIF vuota");

    showResult(blob, width, height);
    await saveGifToHistory(blob, width, height);
    await loadRecentGifs();
    setProgress(100, "GIF pronta automaticamente!");
    showToast("GIF creata automaticamente.");
    setTimeout(() => dom.progressBox.classList.add("hidden"), 700);
  } catch (error) {
    console.error(error);
    dom.progressBox.classList.add("hidden");
    showToast(`Non è stato possibile creare la GIF: ${error.message || "errore sconosciuto"}.`, 5200);
  } finally {
    state.generationInProgress = false;
    setBusy(false);
    if (state.generationQueued) {
      state.generationQueued = false;
      requestAutoGenerate(250);
    }
  }
}

async function encodePhotoFrames(gif, width, height) {
  const delay = Number(dom.photoDelay.value) || 600;
  const style = getResolvedAnimationStyle();
  const base = [...state.photos];
  const sequence = dom.boomerang.checked && base.length > 1
    ? [...base, ...base.slice(1, -1).reverse()]
    : base;
  const totalUnits = sequence.length;

  for (let i = 0; i < sequence.length; i++) {
    const photo = sequence[i];
    const framesPerPhoto = sequence.length === 1
      ? Math.max(8, Math.round(8 + (Number(dom.effectIntensity.value) || 6) / 2))
      : style === "none" ? 1 : 4;
    const perFrameDelay = Math.max(70, Math.round(delay / framesPerPhoto));

    for (let frameIndex = 0; frameIndex < framesPerPhoto; frameIndex++) {
      const progress = framesPerPhoto === 1 ? 0.5 : frameIndex / (framesPerPhoto - 1);
      const animState = createAnimationFrameState(style, progress);
      drawFrame(photo.source, animState);
      encodeCurrentCanvas(gif, perFrameDelay, width, height);
      const currentUnit = i + (frameIndex + 1) / framesPerPhoto;
      const percent = 8 + Math.round((currentUnit / totalUnits) * 84);
      setProgress(percent, sequence.length === 1
        ? `Animazione foto singola ${frameIndex + 1} di ${framesPerPhoto}…`
        : `Elaborazione foto ${i + 1} di ${sequence.length}…`);
      await nextPaint();
    }
  }
}

async function encodeVideoFrames(gif, width, height) {
  const video = state.video;
  const fps = clamp(Number(dom.videoFps.value) || 6, 4, 10);
  const start = clamp(Number(dom.videoStart.value) || 0, 0, Math.max(0, video.duration - 0.5));
  const availableDuration = Math.max(0.5, video.duration - start);
  const duration = clamp(Number(dom.videoDuration.value) || 3, 0.5, Math.min(MAX_VIDEO_SECONDS, availableDuration));
  const wantsBoomerang = dom.boomerang.checked;
  const maxBaseFrames = wantsBoomerang ? Math.floor(MAX_VIDEO_FRAMES / 2) : MAX_VIDEO_FRAMES;
  const frameCount = Math.max(2, Math.min(maxBaseFrames, Math.ceil(duration * fps)));
  const frameDelay = Math.round(1000 / fps);
  const captured = wantsBoomerang ? [] : null;

  for (let i = 0; i < frameCount; i++) {
    const time = start + (i / Math.max(1, frameCount - 1)) * Math.max(0, duration - 0.02);
    await seekVideo(video, Math.min(time, video.duration - 0.01));
    const progress = frameCount <= 1 ? 0.5 : i / (frameCount - 1);
    drawFrame(video, createAnimationFrameState(getResolvedAnimationStyle(), progress));
    const imageData = ctx.getImageData(0, 0, width, height);
    if (captured) captured.push(imageData);
    encodeImageData(gif, imageData, frameDelay, width, height);
    const totalFrames = wantsBoomerang ? frameCount * 2 - 2 : frameCount;
    const percent = 8 + Math.round(((i + 1) / totalFrames) * 84);
    setProgress(percent, `Estrazione fotogramma ${i + 1} di ${frameCount}…`);
    await nextPaint();
  }

  if (captured && captured.length > 2) {
    const reverseFrames = captured.slice(1, -1).reverse();
    for (let i = 0; i < reverseFrames.length; i++) {
      encodeImageData(gif, reverseFrames[i], frameDelay, width, height);
      const done = frameCount + i + 1;
      const total = frameCount + reverseFrames.length;
      const percent = 8 + Math.round((done / total) * 84);
      setProgress(percent, `Creazione effetto boomerang ${i + 1} di ${reverseFrames.length}…`);
      await nextPaint();
    }
  }
}

function encodeCurrentCanvas(gif, delay, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  encodeImageData(gif, imageData, delay, width, height);
}

function encodeImageData(gif, imageData, delay, width, height) {
  if (imageData.width !== width || imageData.height !== height) {
    throw new Error("Dimensioni del fotogramma non valide");
  }
  gif.addFrame(imageData.data, delay);
}

function showResult(blob, width, height) {
  if (state.currentUrl) URL.revokeObjectURL(state.currentUrl);
  state.currentBlob = blob;
  state.currentUrl = URL.createObjectURL(blob);
  dom.resultImage.src = state.currentUrl;
  dom.downloadBtn.href = state.currentUrl;
  dom.downloadBtn.download = `gif-facile-${Date.now()}.gif`;
  dom.resultMeta.textContent = `${width}×${height} px · ${formatBytes(blob.size)}`;
  dom.resultBox.classList.remove("hidden");
  dom.resultBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function shareCurrentGif() {
  if (!state.currentBlob) return;
  const file = new File([state.currentBlob], "gif-facile.gif", { type: "image/gif" });
  try {
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({ title: "La mia GIF", text: "Creata con GifFacile", files: [file] });
    } else {
      showToast("La condivisione diretta non è supportata. Scarica la GIF e condividila dalla galleria.");
    }
  } catch (error) {
    if (error.name !== "AbortError") showToast("Condivisione non riuscita.");
  }
}

async function installApp() {
  if (!state.deferredInstallPrompt) {
    showToast("Apri il menu del browser e scegli “Aggiungi a schermata Home”.");
    return;
  }
  state.deferredInstallPrompt.prompt();
  await state.deferredInstallPrompt.userChoice;
  state.deferredInstallPrompt = null;
  dom.installBtn.classList.add("hidden");
}

function setBusy(busy) {
  dom.generateBtn.disabled = busy;
  dom.generateBtn.textContent = busy ? "⏳ Creazione in corso…" : "⚡ Rigenera ora";
  if (!busy) updateGenerateState();
  document.querySelectorAll("input, select, .mode-tab, .template").forEach(control => {
    control.disabled = busy;
  });
  dom.progressBox.classList.toggle("hidden", !busy);
}

function setProgress(percent, text) {
  dom.progressBar.style.width = `${clamp(percent, 0, 100)}%`;
  dom.progressText.textContent = text;
}

async function seekVideo(video, time) {
  if (!Number.isFinite(time)) return;
  if (Math.abs(video.currentTime - time) < 0.015 && video.readyState >= 2) return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timeout durante la lettura del video"));
    }, 8000);
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(video.error || new Error("Errore video"));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = clamp(time, 0, Math.max(0, video.duration - 0.001));
  });
}

function waitForEvent(target, eventName, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout: ${eventName}`));
    }, timeoutMs);
    const onEvent = event => {
      cleanup();
      resolve(event);
    };
    const onError = () => {
      cleanup();
      reject(target.error || new Error("Errore di caricamento"));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      target.removeEventListener(eventName, onEvent);
      target.removeEventListener("error", onError);
    };
    target.addEventListener(eventName, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

function nextPaint() {
  return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function showToast(message, duration = 3300) {
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => dom.toast.classList.remove("show"), duration);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

// Cronologia locale con IndexedDB
const DB_NAME = "giffacile-db";
const STORE_NAME = "gifs";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveGifToHistory(blob, width, height) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).add({ blob, width, height, size: blob.size, createdAt: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    await trimHistory();
  } catch (error) {
    console.warn("Cronologia non disponibile:", error);
  }
}

async function getAllHistory() {
  const db = await openDb();
  const items = await new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

async function trimHistory() {
  const items = await getAllHistory();
  const extra = items.slice(MAX_HISTORY);
  if (!extra.length) return;
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    extra.forEach(item => tx.objectStore(STORE_NAME).delete(item.id));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadRecentGifs() {
  state.recentUrls.forEach(url => URL.revokeObjectURL(url));
  state.recentUrls = [];
  try {
    const items = await getAllHistory();
    if (!items.length) {
      dom.recentGrid.innerHTML = '<p class="muted">Le GIF create verranno conservate soltanto su questo dispositivo.</p>';
      return;
    }
    dom.recentGrid.innerHTML = items.map(item => {
      const url = URL.createObjectURL(item.blob);
      state.recentUrls.push(url);
      const date = new Date(item.createdAt).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
      return `
        <article class="recent-item">
          <img src="${url}" alt="GIF creata il ${escapeAttribute(date)}">
          <div class="recent-item-info">
            <strong>${item.width}×${item.height}</strong>
            <small>${date} · ${formatBytes(item.size)}</small>
            <div class="recent-item-actions">
              <a href="${url}" download="gif-facile-${item.id}.gif">Scarica</a>
              <button type="button" data-delete-id="${item.id}" aria-label="Elimina GIF">×</button>
            </div>
          </div>
        </article>
      `;
    }).join("");
  } catch (error) {
    console.warn(error);
    dom.recentGrid.innerHTML = '<p class="muted">La cronologia locale non è disponibile in questo browser.</p>';
  }
}

async function handleRecentAction(event) {
  const button = event.target.closest("button[data-delete-id]");
  if (!button) return;
  const id = Number(button.dataset.deleteId);
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    await loadRecentGifs();
  } catch (error) {
    showToast("Non riesco a eliminare questa GIF.");
  }
}

async function clearHistory() {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    await loadRecentGifs();
    showToast("Cronologia svuotata.");
  } catch (error) {
    showToast("Non riesco a svuotare la cronologia.");
  }
}

init();
