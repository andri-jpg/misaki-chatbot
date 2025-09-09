// Spine & FX core
const { Application, Point, Texture, BLEND_MODES, SimpleRope } = PIXI;
const { Spine } = PIXI.spine;
const { FX } = revolt;

export const state = {
  settings: Vue.ref({
    language: "ch", bgmVolume: 0.3, fontSize: 18,
    position: { x: 0, y: 0 }, rotation: 0, scale: 1, talkVolume: 0.5,
    textPointX: 100, textPointY: 100, textureResolution: "2k",
    mouseTracking: false, panelDisplay: true, mouseTrial: true,
    enableChatLog: true,
    enableChatMemory: true,
    memoryTurns: 10,
    enableFewShot: true,
    talking: true, talkingInterval: 0, penetration: false, autoTalk: false,
    enableMic: false,
    micDeviceId: "",
    micVadThreshold: 0.6,
    asrUrl: "http://127.0.0.1:9880/mic",
    micMode : "client"
  }),
  app: Vue.ref({
    mouseDown: false, isAnimation: false, talkIndex: 1, isInterval: false,
    longTouch: false, patHead: false, touchBonePoint: { x: 0, y: 0 },
    mouseLocalPoint: { x: 0, y: 0 }, linearAlgebraScale: 1.1, talkCount: 0,
    chatBusy: false
  }),
  config: null,
  dialogEl: null,
  talkAudio: null,
  bgmAudio: null,
  chatAudio: null,
  pixiApp: null,
  spineModels: [],
  touchBone: null,
  fx: null,
  zIndexCounter: -100,
  initialized: false,
  hasPlayedStartIdle: false, 
};

let screenWidth = 0, screenHeight = 0;
let longTouchTimeout = 0;
let clickParticles = null;
let historyX = [], historyY = [], mousePositionForTrail = null, trailPoints = [];
const historySize = 20, ropeSize = 100;

export function loadConfigSync(url) {
  const txt = xhrGetSync(url);
  state.config = JSON.parse(txt);
}

export function mountPixi(spineContainerId = "spine") {
  screenWidth = window.innerWidth; screenHeight = window.innerHeight;
  state.fx = new FX();
  const app = new Application({ width: screenWidth, height: screenHeight, antialias: true, transparent: true });
  app.stage.interactive = true; app.stage.hitArea = app.screen; app.stage.sortableChildren = true;
  state.pixiApp = app;
  document.getElementById(spineContainerId).appendChild(app.view);
}

export function loadSpineAndFx() {
  
  const { settings, config, spineModels, pixiApp } = state;
  config.fileNames.forEach(name => {
    spineModels.push({ name, url: `./${settings.value.textureResolution}/${name}.skel` });
  });
  spineModels.forEach(m => pixiApp.loader.add(m.name, m.url));
  pixiApp.loader
    .add("fx_settings", "./default-bundle.json")
    .add("fx_spritesheet", "./revoltfx-spritesheet.json")
    .load(onAssetsLoaded);
}

function onAssetsLoaded(loader, resources) {
  
  state.fx.initBundle(resources.fx_settings.data);
  state.pixiApp.ticker.add(() => state.fx.update());

  // spawn
  state.spineModels.forEach(model => {
    model.spine = new Spine(resources[model.name].spineData);
    const s = state.settings.value;
    s.position.x = s.position.x === 0 ? state.pixiApp.screen.width / 2 : s.position.x;
    s.position.y = s.position.y === 0 ? state.pixiApp.screen.height : s.position.y;
    model.spine.x = s.position.x; model.spine.y = s.position.y; model.spine.scale.set(s.scale);
    state.pixiApp.stage.addChild(model.spine);
    model.spine.zIndex = state.zIndexCounter;
    safeStartIdle(model.spine);
    // welcome → idle loop
  });

  // event SFX & bubble
  state.spineModels.forEach(model => {
    model.spine?.state.addListener({
      event: (entry, event) => {
        if (state.app.value.chatBusy) return;
        if (event.data.name.includes("MemorialLobby")) {
          const parts = event.data.name.split("/");
          state.talkAudio.src = `./sound/${parts[parts.length - 1]}.wav`;
          state.talkAudio.currentTime = 0;
          state.talkAudio.play().catch(() => { });
          const lang = state.settings.value.language;
          if (lang) {
            const line = dialogueData[lang]?.[event.data.name] || "";
            state.dialogEl.innerHTML = line;
            state.dialogEl.classList.add("opacity-in");
          }
        }
      },
      complete: (entry) => {
        const a = state.app.value, s = state.settings.value;
        if (!((entry.trackIndex == 3 || (entry.trackIndex == 4 && entry.animation.name == "<empty>")) && (a.talkCount++, a.talkCount % 2 != 0))
          && !(a.longTouch || entry.animation.name == "Idle_01" || entry.trackIndex == 10)) {
          if (entry.trackIndex == 5 || entry.trackIndex == 6) {
            model.spine?.state.setEmptyAnimation(entry.trackIndex, 0.8);
            return;
          }
          if (entry.trackIndex == 3 || entry.trackIndex == 4) {
            setTimeout(() => { a.isInterval = false; }, s.talkingInterval * 1000);
          }
          if (state.config.animationIndex.length > 0) { playNextAnimationInSequence(); return; }
          if (a.talkCount % 4 == 0) a.isAnimation = false;
          state.dialogEl?.classList.remove("opacity-in");
        }
      }
    });
  });

  // init DOM
  initDOM();
  // audio bgm
  state.bgmAudio.src = "./sound/Theme.wav"; state.bgmAudio.loop = true;
  state.bgmAudio.volume = state.settings.value.bgmVolume;
  state.bgmAudio.play().catch(() => { });
  state.talkAudio.volume = state.settings.value.talkVolume;
  
  // load serifu
  parseDialogueFile("./serifu.txt");

  // visual fx + mouse trail
  initBackgroundParticles();
  initMouseTrail();

  // eye follow loop
  setupEyeLoop();

  state.initialized = true;
  saveSettings();
}

let dialogueData = { ch: {}, jp: {}, en: {}, th: {}, kr: {}, vi: {}, ru: {} };

function initDOM() {
  
  state.dialogEl = document.getElementById("badialog");
  state.talkAudio = document.getElementById("talkaudio");
  state.chatAudio = document.getElementById("chataudio");
  state.bgmAudio = document.getElementById("bgmaudio");
  state.touchBone = state.spineModels[0].spine?.skeleton.findBone(state.config.touchbone);
  const s = state.settings.value;
  state.dialogEl.style.marginLeft = `${s.textPointX}px`;
  state.dialogEl.style.marginTop = `${s.textPointY}px`;
  state.dialogEl.style.fontSize = `${s.fontSize}px`;
  state.dialogEl.style.fontFamily = s.language === "ch" ? "TJL" : s.language === "jp" ? "XW" : "Microsoft YaHei";
  
}

export function saveSettings() {
  if (!state.initialized) return;
  const s = state.settings.value;
  state.spineModels.forEach(m => {
    m.spine?.scale.set(s.scale);
    m.spine.x = s.position.x; m.spine.y = s.position.y; m.spine.rotation = s.rotation;
  });
  state.talkAudio.volume = s.talkVolume;
  state.bgmAudio.volume = s.bgmVolume;
  localStorage.setItem(state.config.fileNames[0], JSON.stringify(s));
}

export function loadSettings() {
  const key = state.config.fileNames[0];
  const raw = localStorage.getItem(key);
  if (raw) Object.assign(state.settings.value, JSON.parse(raw));
}

export function togglePanelDisplay() {
  state.settings.value.panelDisplay = !state.settings.value.panelDisplay;
}

export function handleMouseDown(ev) {
  if (state.app.value.chatBusy) return;
  state.app.value.mouseDown = true;
  longTouchTimeout = setTimeout(() => {
    state.app.value.longTouch = true;
    if (state.app.value.patHead && !state.app.value.isAnimation) {
      state.spineModels[0].spine?.state.setAnimation(5, `${state.config.headAnimation}_A`, false);
      state.spineModels[0].spine?.state.setAnimation(6, `${state.config.headAnimation}_M`, false);
    }
  }, 100);
  state.spineModels[0].spine.state.data.defaultMix = 0.8;
  const gp = { x: ev.clientX, y: ev.clientY };
  const cp = getCharacterSpacePoint(gp, { x: state.spineModels[0].spine.x, y: state.spineModels[0].spine.y }, state.settings.value.scale);
  const lp = state.touchBone.worldToLocal(cp);
  state.app.value.patHead = isWithinRadius(400 * state.settings.value.scale, lp);
  createClickParticles(ev.clientX, ev.clientY);
}

export function handleMouseUp() {
  if (state.app.value.chatBusy) return;
  clearTimeout(longTouchTimeout);
  if (!state.app.value.longTouch && state.settings.value.penetration) playRandomTalkAnimation();
  if (state.app.value.patHead && state.app.value.longTouch && !state.app.value.isAnimation) {
    state.spineModels[0].spine?.state.setAnimation(5, `${state.config.headAnimationEnd}_A`, false);
    state.spineModels[0].spine?.state.setAnimation(6, `${state.config.headAnimationEnd}_M`, false);
  }
  state.app.value.mouseLocalPoint.x = 0; state.app.value.mouseLocalPoint.y = 0;
  state.app.value.mouseDown = false; state.app.value.longTouch = false; state.app.value.patHead = false;
}

export function handleClick() {
  if (state.app.value.chatBusy) return;
  if (!state.settings.value.penetration) playRandomTalkAnimation();
}

export function handleMouseMove(ev) {
  if (state.settings.value.mouseTrial) mousePositionForTrail = { x: ev.clientX, y: ev.clientY };
  if (state.settings.value.mouseTracking || state.app.value.longTouch) {
    const gp = { x: ev.clientX, y: ev.clientY };
    const cp = getCharacterSpacePoint(gp, { x: state.spineModels[0].spine.x, y: state.spineModels[0].spine.y }, state.settings.value.scale);
    const lp = state.touchBone.parent.worldToLocal(cp);
    state.app.value.mouseLocalPoint.x = lp.x;
    state.app.value.mouseLocalPoint.y = lp.y;
  }
}


export function playRandomTalkAnimation() {
  const a = state.app.value, s = state.settings.value;
  if (a.isAnimation || a.isInterval || !s.talking) return;
  const st = state.spineModels[0].spine?.state;
  st.setEmptyAnimation(3, 0);
  const A = st.addAnimation(3, `Talk_0${a.talkIndex}_A`, false, 0); if (A) A.mixDuration = 1;
  st.addEmptyAnimation(3, 1, 0);
  st.setEmptyAnimation(4, 0);
  const M = st.addAnimation(4, `Talk_0${a.talkIndex}_M`, false, 0); if (M) M.mixDuration = 1;
  st.addEmptyAnimation(4, 1, 0);
  a.isAnimation = true; a.isInterval = true;
  a.talkIndex >= state.config.talkMax ? a.talkIndex = 1 : a.talkIndex++;
}

// ========== helpers ==========
function xhrGetSync(url) {
  const r = new XMLHttpRequest(); r.open("GET", url, false);
  r.overrideMimeType("text/html;charset=utf-8"); r.send(null);
  return r.status === 200 ? r.responseText : "{}";
}

function parseDialogueFile(url) {
  const text = xhrGetSync(url); if (!text) return;
  const lines = text.split('\n'); let i = 0;
  const langCount = Object.keys(dialogueData).length;
  console.log(langCount);
  state.spineModels[0].spine.spineData.events.forEach(ev => {
    if (ev.name !== "Talk") {
      if (state.config.language.includes("jp")) dialogueData.jp[ev.name] = lines[i];
      if (state.config.language.includes("en")) dialogueData.ch[ev.name] = lines[i + Math.floor(lines.length / langCount)];
      if (state.config.language.includes("en")) dialogueData.en[ev.name] = lines[i + Math.floor(lines.length / langCount * 2)];
      if (state.config.language.includes("th")) dialogueData.th[ev.name] = lines[i + Math.floor(lines.length / langCount * 3)];
      if (state.config.language.includes("kr")) dialogueData.kr[ev.name] = lines[i + Math.floor(lines.length / langCount * 4)];
      if (state.config.language.includes("vi")) dialogueData.vi[ev.name] = lines[i + Math.floor(lines.length / langCount * 5)];
      if (state.config.language.includes("ru")) dialogueData.ru[ev.name] = lines[i + Math.floor(lines.length / langCount * 6)];
      i++;
    }
  });
}


function safeStartIdle(spine) {
  const state = spine.state;
  const idle  = "Idle_01";
  const start = "Start_Idle_01";

  const cur = state.getCurrent(0);

  if (!cur) {
    state.setAnimation(0, start, false);
    state.addAnimation(0, idle, true, 0);
    return;
  }

  if (cur.animation && cur.animation.name === start) {
    if (!cur.next || !cur.next.animation || cur.next.animation.name !== idle) {
      state.addAnimation(0, idle, true, 0);
    }
    return;
  }

  if (!cur.animation || cur.animation.name !== idle) {
    state.setAnimation(0, idle, true);
  }
}



function playNextAnimationInSequence() {
  state.spineModels.some((m, i) => {
    if ((state.config.animationIndex.length > 0 && m.name == state.config.animationIndex[0].name) || state.config.mixType == 1) {
      state.zIndexCounter = state.config.mixType == 1 ? state.config.indexs[i] : state.zIndexCounter + 10;
      m.spine.zIndex = state.zIndexCounter;
      m.spine?.state.setAnimation(0, state.config.animationIndex[0].animationName, false);
      try {
        m.spine.state.addAnimation(0, "Idle_01", true, 0);
        m.spine.state.setAnimation(10, state.config.bgString, true);
      } catch (e) { }
      state.config.animationIndex.shift();
      state.app.value.isAnimation = true;
      return false;
    }
  });
}

function initBackgroundParticles() {
  const c = state.config.particle;
  const p = state.fx.getParticleEmitter(c.particleName);
  p.core._settings.width = screenWidth * c.width;
  p.core._settings.height = screenHeight * c.height;
  p.x = screenWidth * c.x; p.y = screenHeight * c.y;
  p.init(state.pixiApp.stage, c.autoPlay);
}

function initMouseTrail() {
  const tex = Texture.from('./trail.png');
  for (let i = 0; i < historySize; i++) { historyX.push(0); historyY.push(0); }
  for (let i = 0; i < ropeSize; i++) { trailPoints.push(new Point(0, 0)); }
  const rope = new SimpleRope(tex, trailPoints); rope.blendMode = BLEND_MODES.ADD;
  state.pixiApp.stage.addChild(rope);
  state.pixiApp.ticker.add(() => {
    if (!mousePositionForTrail) return;
    historyX.pop(); historyX.unshift(mousePositionForTrail.x);
    historyY.pop(); historyY.unshift(mousePositionForTrail.y);
    for (let i = 0; i < ropeSize; i++) {
      const t = i / ropeSize * historySize;
      trailPoints[i].x = interpolate(historyX, t);
      trailPoints[i].y = interpolate(historyY, t);
    }
  });
}
function getPoint(idx, arr) { if (idx < 0) idx = 0; if (idx > arr.length - 1) idx = arr.length - 1; return arr[idx]; }
function getTan(i, f, arr) { return f * (getPoint(i + 1, arr) - getPoint(i - 1, arr)) / 2; }
function interpolate(arr, t, f = 1) {
  const i = Math.floor(t), t0 = getTan(i, f, arr), t1 = getTan(i + 1, f, arr); const p0 = getPoint(i, arr), p1 = getPoint(i + 1, arr); t -= i; const t2 = t * t, t3 = t * t2;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * t0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * t1;
}

function setupEyeLoop() {
  setInterval(() => {
    const bone = state.touchBone; if (!bone) return;
    const s = state.settings.value, a = state.app.value;
    a.mouseLocalPoint = clampMagnitude(state.config.eyeRadius * s.scale, a.mouseLocalPoint);
    if (Math.abs(bone.x - a.mouseLocalPoint.x) > 1 || Math.abs(bone.y - a.mouseLocalPoint.y) > 1) {
      bone.x = (bone.x + a.mouseLocalPoint.x) / a.linearAlgebraScale;
      bone.y = (bone.y + a.mouseLocalPoint.y) / a.linearAlgebraScale;
      state.spineModels[0].spine?.skeleton.updateWorldTransform();
    }
  }, 20);
}
function clampMagnitude(max, v) { const m = Math.hypot(v.x, v.y); if (max < m) { v.x = v.x * max / m; v.y = v.y * max / m; } return v; }
function getCharacterSpacePoint(p, o, sc) { return { x: (p.x - o.x) / sc, y: (p.y - o.y) / sc }; }
function isWithinRadius(r, p) { return Math.hypot(p.x, p.y) <= r; }

export function showBubble(text) {
  state.dialogEl.textContent = text || "";
  state.dialogEl.classList.add("opacity-in");
}
export function hideBubbleLater(ms = 1000) {
  setTimeout(() => state.dialogEl.classList.remove("opacity-in"), ms);
}