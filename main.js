import {
  state, loadConfigSync, loadSettings, mountPixi, loadSpineAndFx,
  togglePanelDisplay, handleMouseDown, handleMouseUp, handleClick, handleMouseMove,
  saveSettings, showBubble, hideBubbleLater
} from './spineCore.js';
import { initMic, refreshMicDevices, selectMicDevice, startVoiceHold, stopVoiceHold } from './mic.js';
import { startTTSTalk, stopTTSTalk, fetchTTSBlob, playUrlAndWait } from './tts.js';
import { ask } from './chatEngine/index.js';

// Add missing createClickParticles function
function createClickParticles(x, y) {
  const particles = [];
  const particleCount = 8;
  
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.style.position = 'fixed';
    particle.style.left = x + 'px';
    particle.style.top = y + 'px';
    particle.style.width = '4px';
    particle.style.height = '4px';
    particle.style.backgroundColor = '#00ff88';
    particle.style.borderRadius = '50%';
    particle.style.pointerEvents = 'none';
    particle.style.zIndex = '9999';
    particle.style.transition = 'all 0.6s ease-out';
    
    document.body.appendChild(particle);
    particles.push(particle);
    
    // Animate particle
    setTimeout(() => {
      const angle = (i / particleCount) * Math.PI * 2;
      const distance = 50 + Math.random() * 30;
      const newX = x + Math.cos(angle) * distance;
      const newY = y + Math.sin(angle) * distance;
      
      particle.style.left = newX + 'px';
      particle.style.top = newY + 'px';
      particle.style.opacity = '0';
      particle.style.transform = 'scale(0)';
    }, 10);
    
    // Remove particle after animation
    setTimeout(() => {
      if (particle.parentNode) {
        particle.parentNode.removeChild(particle);
      }
    }, 600);
  }
}

// Make it globally available
window.createClickParticles = createClickParticles;

window.addEventListener('DOMContentLoaded', () => {
  // Load konfigurasi & settings
  loadConfigSync('./loadJson.json');
  loadSettings();

  const AI_STORE_KEY = `${state.config.fileNames[0]}:ai`;
  const LOGS_KEY = `${state.config.fileNames[0]}:logs`;

  const Root = {
    setup() {
      const savedAI = (() => {
        try { return JSON.parse(localStorage.getItem(AI_STORE_KEY) || '{}'); } catch { return {}; }
      })();

      const defaultEngine = savedAI.engine || state.config?.ai?.defaultEngine || 'gemini';
      const defaultTtsUrl = savedAI.ttsUrl || 'http://127.0.0.1:9880/tts';
      const defaultKey = savedAI.apiKey || '';
      const defaultSP = (savedAI.systemPrompt || `
You are "Misaki", an 18-year-old girl. Quiet, detached, soft voice. Sound tired.
Rules:
- Plain text only. No emojis. No markdown. No ASCII art. No role tags.
- No feelings or stage directions. No brackets. No quotes around the answer.
      `.trim());

      const ui = {
        settings: state.settings,
        app: state.app,
        activeTab: Vue.ref('display'),
        logs: Vue.ref([]),
        ai: Vue.ref({
          engine: defaultEngine,
          apiKey: defaultKey,
          ttsUrl: defaultTtsUrl,
          systemPrompt: defaultSP
        }),
        chatInput: Vue.ref("")
      };

      // Default Mic fields
      if (ui.settings.value.enableMic === undefined) ui.settings.value.enableMic = false;
      if (ui.settings.value.micMode === undefined) ui.settings.value.micMode = 'client';
      if (ui.settings.value.asrUrl === undefined) ui.settings.value.asrUrl = 'http://127.0.0.1:9880/asr';
      if (ui.settings.value.micDeviceId === undefined) ui.settings.value.micDeviceId = '';
      if (ui.settings.value.micVadThreshold === undefined) ui.settings.value.micVadThreshold = 0.5;

      try {
        const raw = localStorage.getItem(LOGS_KEY);
        if (raw) ui.logs.value = JSON.parse(raw);
      } catch { }

      function saveLogs() {
        try { localStorage.setItem(LOGS_KEY, JSON.stringify(ui.logs.value)); } catch { }
      }
      function sanitize(s) {
        return String(s ?? '').replace(/\s+/g, ' ').trim();
      }

      // Devices reaktif (ganti window.__micDevices)
      const devices = Vue.ref([]);
      async function pullDevicesIntoRef() {
        devices.value = Array.isArray(window.__micDevices) ? window.__micDevices : [];
      }

      // Mic handlers
      const recording = Vue.ref(false);

      if (ui.settings.value.enableMic) {
        initMic(ui.settings.value).catch(e => console.warn('mic init fail', e));
      }

      Vue.watch(() => ui.settings.value.enableMic, async (on) => {
        try {
          if (on) {
            await initMic(ui.settings.value);
            await refreshMicDevices(ui.settings.value);
            await pullDevicesIntoRef();
            if (ui.settings.value.micDeviceId !== "") {
              await selectMicDevice(ui.settings.value);
            }
          } else {
            try { await fetch('http://127.0.0.1:9880/mic/off'); } catch { }
          }
        } catch (e) {
          console.warn('toggle mic error', e);
        }
      });

      async function onRefreshMicDevices() {
        try {
          await refreshMicDevices(ui.settings.value);
          await pullDevicesIntoRef();
        } catch (e) {
          console.warn('refresh mic devices error', e);
          devices.value = [];
        }
      }

      Vue.watch(() => ui.settings.value.micDeviceId, async () => {
        try {
          await selectMicDevice(ui.settings.value);
        } catch (e) {
          console.warn('select device error', e);
        }
      });

      async function onMicPress() {
        if (!ui.settings.value.enableMic || state.app.value.chatBusy) return;
        recording.value = true;
        try {
          await startVoiceHold(ui.settings.value);
        } catch (e) {
          console.warn('startVoiceHold fail', e);
          recording.value = false;
        }
      }
      async function onMicRelease() {
        if (!recording.value) return;
        try {
          const text = await stopVoiceHold(ui.settings.value);
          if (text && typeof text === 'string') {
            ui.chatInput.value = (ui.chatInput.value ? (ui.chatInput.value + ' ') : '') + text;
          }
        } catch (e) {
          console.warn('stopVoiceHold fail', e);
        } finally {
          recording.value = false;
        }
      }

      // Prompt utils
      const FEW_SHOT = [
        '<|user|>',
        'What are you doing this weekend?</s>',
        '<|assistant|>',
        'Probably just watch the dust settle. It\'s quieter than going out.</s>',
        '<|user|>',
        'I\'m so excited, I bought a new game!</s>',
        '<|assistant|>',
        '*Another bright, loud world...* Hope the loading screens are short for you.</s>',
        '<|user|>',
        'how to make fried rice?</s>',
        '<|assistant|>',
        'The oil always sizzles so loudly. It\'s... a lot. Why do you ask?</s>',
      ].join('\n');

      function buildMemoryFromLogs(logs, n, { excludeLatest = true, excludeId = null } = {}) {
        if (!Array.isArray(logs) || logs.length === 0) return "";
        let pool = logs;
        if (excludeId != null) pool = pool.filter(e => e && e.id !== excludeId);
        else if (excludeLatest && pool.length > 0) pool = pool.slice(0, -1);
        const recentLogs = pool.filter(e => e && (e.role === "user" || e.role === "assistant")).slice(-n * 2);
        return recentLogs.map(logEntry => {
          const sanitizedText = sanitize(logEntry.text || "");
          return logEntry.role === "user" ? `<|user|>\n${sanitizedText}</s>` : `<|assistant|>\n${sanitizedText}</s>`;
        }).join("\n");
      }

      function postProcessReply(text) {
        let s = String(text ?? '');
        s = s.replace(/^\s*(misaki|user)\s*:\s*/gi, '');
        s = s.replace(/\b(misaki|user)\s*:\s*/gi, '');
        const parts = s.split(/(?<=[.!?])\s+/).filter(Boolean);
        s = parts.slice(0, 2).join(' ').trim();
        return s || 'okay.';
      }

      function buildSystemPrompt(ui) {
        const parts = [];
        const custom = sanitize(ui.ai.value.systemPrompt);
        if (custom) parts.push(custom);
        if (state.settings.value.enableChatMemory && ui.logs.value.length) {
          const k = Math.max(1, Math.min(50, Number(state.settings.value.memoryTurns || 10)));
          const mem = buildMemoryFromLogs(ui.logs.value, k);
          if (mem) parts.push(`\n${mem}`);
        }
        if (state.settings.value.enableFewShot) parts.push(`Examples:\n${FEW_SHOT}`);
        return parts.join('\n\n');
      }

      function addLog(entry) {
        if (!state.settings.value.enableChatLog) return;
        ui.logs.value.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          ts: Date.now(),
          ...entry
        });
        if (ui.logs.value.length > 500) ui.logs.value.splice(0, ui.logs.value.length - 500);
        saveLogs();
      }
      function clearLogs() {
        ui.logs.value = [];
        saveLogs();
        ElementPlus.ElMessage.success('Logs cleared');
      }
      function exportLogs() {
        const blob = new Blob([JSON.stringify(ui.logs.value, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'chat-logs.json';
        a.click();
        URL.revokeObjectURL(url);
      }

      Vue.watch(state.settings, saveSettings, { deep: true });
      Vue.watch(ui.ai, v => {
        localStorage.setItem(AI_STORE_KEY, JSON.stringify(v));
      }, { deep: true });

      async function onSend() {
        const text = ui.chatInput.value.trim();
        if (!text || state.app.value.chatBusy) return;

        state.app.value.chatBusy = true;
        showBubble('...thinking');

        try {
          addLog({ role: 'user', text });

          const raw = await ask(ui.ai.value.engine, text, {
            apiKey: ui.ai.value.apiKey,
            systemPrompt: buildSystemPrompt(ui),
            tflite: state.config?.ai?.tflite || {}
          });
          const reply = postProcessReply(raw);

          const ttsUrlString = await fetchTTSBlob(reply, ui.ai.value.ttsUrl);

          showBubble(reply);

          if (ttsUrlString) {
            startTTSTalk();
            await playUrlAndWait(ttsUrlString);
            stopTTSTalk();
          } else {
            await new Promise(r => setTimeout(r, 12000));
          }

          addLog({
            role: 'assistant',
            text: reply,
            meta: { tts: Boolean(ttsUrlString), engine: ui.ai.value.engine }
          });

          hideBubbleLater(20000);
          ui.chatInput.value = "";
        } catch (e) {
          console.warn('chat flow error:', e);
          showBubble('...failed');
          addLog({ role: 'error', text: String(e?.message || e) });
          hideBubbleLater(12000);
        } finally {
          state.app.value.chatBusy = false;
        }
      }

      return {
        // state
        settings: ui.settings,
        app: ui.app,
        ai: ui.ai,
        chatInput: ui.chatInput,
        activeTab: ui.activeTab,
        logs: ui.logs,
        devices,

        // actions
        togglePanelDisplay,
        onSend,
        clearLogs,
        exportLogs,
        handleMouseDown, handleMouseUp, handleClick, handleMouseMove,

        // mic
        recording,
        onMicPress,
        onMicRelease,
        refreshMicDevices: onRefreshMicDevices
      };
    },
template: `
  <div>
    <el-button id="setting-button" class="setting-button" type="primary" @click="togglePanelDisplay">
      <el-icon><Setting/></el-icon>
      Settings
    </el-button>

    <el-card id="basetting" class="setting" v-show="settings.panelDisplay" shadow="hover">
      <template #header>
        <div class="setting-header">
          <span>Settings</span>
          <el-button type="text" @click="togglePanelDisplay" class="close-btn">
            <el-icon><Close/></el-icon>
            Close
          </el-button>
        </div>
      </template>

      <el-tabs v-model="activeTab" class="setting-tabs">
        <!-- Display & Position Tab -->
        <el-tab-pane label="Display" name="display">
          <el-form label-width="120px" label-position="left" size="default">
            <el-form-item label="Scale">
              <div class="slider-container">
                <el-slider v-model="settings.scale" :min="0.1" :max="10" :step="0.01" show-input />
              </div>
            </el-form-item>
            <el-form-item label="Position X">
              <div class="slider-container">
                <el-slider v-model="settings.position.x" :min="-1000" :max="1000" :step="1" show-input />
              </div>
            </el-form-item>
            <el-form-item label="Position Y">
              <div class="slider-container">
                <el-slider v-model="settings.position.y" :min="-500" :max="1000" :step="1" show-input />
              </div>
            </el-form-item>
            <el-form-item label="Rotation">
              <div class="slider-container">
                <el-slider v-model="settings.rotation" :min="0" :max="6.28" :step="0.01" show-input />
              </div>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- Text & UI Tab -->
        <el-tab-pane label="Text & UI" name="text">
          <el-form label-width="120px" label-position="left" size="default">
            <el-form-item label="Text X">
              <div class="slider-container">
                <el-slider v-model="settings.textPointX" :min="0" :max="2000" :step="1" show-input />
              </div>
            </el-form-item>
            <el-form-item label="Text Y">
              <div class="slider-container">
                <el-slider v-model="settings.textPointY" :min="0" :max="2000" :step="1" show-input />
              </div>
            </el-form-item>
            <el-form-item label="Font Size">
              <div class="slider-container">
                <el-slider v-model="settings.fontSize" :min="8" :max="72" :step="1" show-input />
              </div>
            </el-form-item>
            <el-form-item label="Language">
              <el-radio-group v-model="settings.language" size="default">
                <el-radio-button label="ch">中文</el-radio-button>
                <el-radio-button label="jp">日本語</el-radio-button>
                <el-radio-button label="en">EN</el-radio-button>
                <el-radio-button label="th">TH</el-radio-button>
                <el-radio-button label="kr">KR</el-radio-button>
                <el-radio-button label="vi">VI</el-radio-button>
                <el-radio-button label="ru">RU</el-radio-button>
                <el-radio-button label="">None</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- Audio Tab -->
        <el-tab-pane label="Audio" name="audio">
          <el-form label-width="120px" label-position="left" size="default">
            <el-form-item label="BGM Volume">
              <el-slider v-model="settings.bgmVolume" :min="0" :max="1" :step="0.05" show-input :format-tooltip="val => (val * 100).toFixed(0) + '%'" />
            </el-form-item>
            <el-form-item label="Voice Volume">
              <el-slider v-model="settings.talkVolume" :min="0" :max="1" :step="0.05" show-input :format-tooltip="val => (val * 100).toFixed(0) + '%'" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- Mic -->
        <el-tab-pane label="Mic" name="mic">
          <el-form label-width="140px" label-position="left" size="default">
            <el-form-item label="Enable Mic">
              <el-switch v-model="settings.enableMic" />
            </el-form-item>

            <el-form-item label="Mode">
              <el-radio-group v-model="settings.micMode" size="default">
                <el-radio-button label="client">Client Upload</el-radio-button>
                <el-radio-button label="server">Server Mic</el-radio-button>
              </el-radio-group>
            </el-form-item>

            <el-form-item v-if="settings.micMode==='client'" label="ASR URL">
              <el-input v-model="settings.asrUrl" placeholder="http://127.0.0.1:9880/asr" clearable />
            </el-form-item>

            <el-form-item label="Input Device">
              <el-space wrap>
                <el-select v-model="settings.micDeviceId" placeholder="(Auto)" style="min-width: 200px;">
                  <el-option :label="'(Auto)'" :value="''" />
                  <el-option
                    v-for="d in devices"
                    :key="d.index"
                    :label="d.name + ' (id:' + d.index + ')'"
                    :value="String(d.index)"
                  />
                </el-select>
                <el-button size="default" @click="refreshMicDevices(settings)">Refresh</el-button>
              </el-space>
            </el-form-item>

            <el-form-item label="VAD Threshold">
              <el-slider
                v-model="settings.micVadThreshold"
                :min="0" :max="1" :step="0.05"
                show-input
                :format-tooltip="val => (val * 100).toFixed(0) + '%'"
              />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- AI Tab -->
        <el-tab-pane label="AI & Chat" name="ai">
          <el-form label-width="120px" label-position="left" size="default">
            <el-form-item label="Engine">
              <el-select v-model="ai.engine">
                <el-option label="Gemini (online)" value="gemini">
                  <span>Gemini (online)</span>
                  <el-tag size="small" type="success">Cloud</el-tag>
                </el-option>
                <el-option label="TFLite (local)" value="tflite">
                  <span>TFLite (local)</span>
                  <el-tag size="small" type="info">Local</el-tag>
                </el-option>
              </el-select>
            </el-form-item>

            <el-form-item v-if="ai.engine==='gemini'" label="API Key">
              <el-input
                v-model="ai.apiKey"
                type="password"
                show-password
                placeholder="Paste Gemini API Key"
                clearable
              />
            </el-form-item>

            <el-form-item label="TTS URL">
              <el-input v-model="ai.ttsUrl" placeholder="http://127.0.0.1:9880/tts" clearable>
                <template #prepend>
                  <el-icon><Microphone/></el-icon>
                </template>
              </el-input>
            </el-form-item>

            <el-form-item label="System Prompt">
              <el-input
                v-model="ai.systemPrompt"
                type="textarea"
                :rows="6"
                placeholder="Define character personality and behavior..."
              />
            </el-form-item>

            <el-divider>Memory & Few-shot</el-divider>
            <el-form-item label="Use Log Memory">
              <el-switch v-model="settings.enableChatMemory" />
            </el-form-item>
            <el-form-item label="Memory Turns">
              <div class="slider-container">
                <el-slider v-model="settings.memoryTurns" :min="1" :max="50" :step="1" show-input />
              </div>
            </el-form-item>
            <el-form-item label="Enable Few-shot">
              <el-switch v-model="settings.enableFewShot" />
            </el-form-item>
            <el-alert
              title="Memory and few-shot help the AI maintain context and character consistency."
              type="info"
              show-icon
            />
          </el-form>
        </el-tab-pane>

        <!-- Logs -->
        <el-tab-pane label="Logs" name="logs">
          <el-form label-width="120px" label-position="left" size="default">
            <el-form-item label="Enable Logging">
              <el-switch v-model="settings.enableChatLog" />
            </el-form-item>
            <el-form-item>
              <el-space wrap>
                <el-button size="default" type="danger" @click="clearLogs">Clear</el-button>
                <el-button size="default" type="primary" @click="exportLogs">Export JSON</el-button>
                <el-tag>Entries: {{ logs.length }}</el-tag>
              </el-space>
            </el-form-item>
          </el-form>
          <el-table :data="logs.slice().reverse()" height="300" size="default" border>
            <el-table-column type="index" width="50" label="#" />
            <el-table-column label="Time" width="160">
              <template #default="{ row }">
                {{ new Date(row.ts).toLocaleString() }}
              </template>
            </el-table-column>
            <el-table-column prop="role" label="Role" width="100" />
            <el-table-column label="Text">
              <template #default="{ row }">
                <div>{{ row.text }}</div>
              </template>
            </el-table-column>
            <el-table-column label="Meta" width="140">
              <template #default="{ row }">
                <el-tag v-if="row.meta?.engine" size="small">{{ row.meta.engine }}</el-tag>
                <el-tag v-if="row.meta?.tts" size="small" type="success">TTS</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <div id="badialog" class="badialog"></div>

    <!-- Mount point untuk Spine/PIXI -->
    <div id="spine"></div>

    <!-- Audio element untuk TTS -->
    <audio id="chataudio"></audio>

    <el-card class="chatdock" shadow="hover">
      <div class="chat-input-container">
        <el-input
          v-model="chatInput"
          placeholder="Type to talk with the character..."
          size="large"
          :disabled="app.chatBusy"
          @keyup.enter="!app.chatBusy && onSend()"
          clearable
        >
          <template #prepend>
            <el-icon><ChatDotRound/></el-icon>
          </template>

          <template #append v-if="settings.enableMic">
            <el-tooltip :content="recording ? 'Release to send' : 'Hold to record'" placement="top">
              <el-button
                :type="recording ? 'danger' : 'primary'"
                :loading="false"
                :disabled="app.chatBusy"
                @mousedown.prevent="onMicPress"
                @mouseup.prevent="onMicRelease"
                @mouseleave.prevent="onMicRelease"
                @touchstart.prevent="onMicPress"
                @touchend.prevent="onMicRelease"
              >
                <el-icon><Microphone/></el-icon>
                <span>{{ recording ? 'REC' : 'Mic' }}</span>
              </el-button>
            </el-tooltip>
          </template>
        </el-input>

        <el-button
          type="primary"
          size="large"
          :loading="app.chatBusy"
          :disabled="app.chatBusy || !chatInput.trim()"
          @click="onSend"
        >
          <el-icon v-if="!app.chatBusy"><Position/></el-icon>
          Send
        </el-button>
      </div>
    </el-card>

    <div
      class="interaction-area"
      :class="{ 'pe-none': settings.panelDisplay }"
      @click.stop="handleClick"
      @mousedown="handleMouseDown"
      @mouseup="handleMouseUp"
      @mousemove="handleMouseMove"
      @mouseleave="handleMouseUp"
    />
  </div>
`
  };

  const app = Vue.createApp(Root);
  app.use(ElementPlus);
  // register icons from CDN (index.html harus sudah memuat @element-plus/icons-vue IIFE)
  if (window.ElementPlusIconsVue) {
    for (const [key, component] of Object.entries(window.ElementPlusIconsVue)) {
      app.component(key, component);
    }
  }

  const vm = app.mount('#app');

  // Mount PIXI SETELAH #app ada → #spine sudah ada
  mountPixi('spine');
  loadSpineAndFx();

  // Forward canvas events
  const spineContainer = document.getElementById('spine');
  if (spineContainer) {
    spineContainer.addEventListener('mousedown', vm.handleMouseDown);
    spineContainer.addEventListener('mouseup', vm.handleMouseUp);
    spineContainer.addEventListener('mouseleave', vm.handleMouseUp);
    spineContainer.addEventListener('mousemove', vm.handleMouseMove);
    spineContainer.addEventListener('click', vm.handleClick);
  } else {
    console.warn('#spine not found in DOM');
  }
});