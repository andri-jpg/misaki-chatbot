import {
  state, loadConfigSync, loadSettings, mountPixi, loadSpineAndFx,
  togglePanelDisplay, handleMouseDown, handleMouseUp, handleClick, handleMouseMove,
  saveSettings, showBubble, hideBubbleLater
} from './spineCore.js';

import { startTTSTalk, stopTTSTalk, fetchTTSBlob, playUrlAndWait } from './tts.js';
import { ask } from './chatEngine/index.js';

window.addEventListener('DOMContentLoaded', () => {
  // Initialize core systems
  loadConfigSync('./loadJson.json');
  loadSettings();

  // Setup PIXI renderer and load assets
  mountPixi('spine');
  loadSpineAndFx();

  const AI_STORE_KEY = `${state.config.fileNames[0]}:ai`;
  const LOGS_KEY = `${state.config.fileNames[0]}:logs`;

  const Root = {
    setup() {
      // Load AI preferences from localStorage with fallbacks
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
        // Active tab tracking
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
      // Load logs from localStorage
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

function buildMemoryFromLogs(logs, n, { excludeLatest = true, excludeId = null } = {}) {
  if (!Array.isArray(logs) || logs.length === 0) return "";

  // 1) Siapkan pool sumber data
  let pool = logs;

  // 2) Jika diminta exclude by id spesifik
  if (excludeId != null) {
    pool = pool.filter(e => e && e.id !== excludeId);
  } else if (excludeLatest && pool.length > 0) {
    // 3) Atau default: buang elemen paling terakhir
    pool = pool.slice(0, -1);
  }

  // 4) Ambil hanya role user/assistant lalu potong ke n*2 terakhir
  const recentLogs = pool
    .filter(e => e && (e.role === "user" || e.role === "assistant"))
    .slice(-n * 2);

  // 5) Format jadi string memory
  return recentLogs
    .map(logEntry => {
      const sanitizedText = sanitize(logEntry.text || "");
      return logEntry.role === "user"
        ? `<|user|>\n${sanitizedText}</s>`
        : `<|assistant|>\n${sanitizedText}</s>`;
    })
    .join("\n");
}

      function postProcessReply(text) {
        let s = String(text ?? '');

        s = s.replace(/^\s*(misaki|user)\s*:\s*/gi, '');
        s = s.replace(/\b(misaki|user)\s*:\s*/gi, '');

        const parts = s.split(/(?<=[.!?])\s+/).filter(Boolean);
        s = parts.slice(0, 2).join(' ').trim();
        return s || 'okay.';
      }


      // main.js

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


      // Build final system prompt from UI prompt + optional blocks (memory, examples)
      function buildSystemPrompt(ui) {
        const parts = [];

        // 1) Single source of truth: the UI system prompt
        const custom = sanitize(ui.ai.value.systemPrompt);
        if (custom) parts.push(custom);

        // 2) Optional: recent memory (last N turns)
        if (state.settings.value.enableChatMemory && ui.logs.value.length) {
          const k = Math.max(1, Math.min(50, Number(state.settings.value.memoryTurns || 10)));
          const mem = buildMemoryFromLogs(ui.logs.value, k);
          if (mem) parts.push(`\n${mem}`);
        }

        // 3) Optional: few-shot examples (no role labels)
        if (state.settings.value.enableFewShot) {
          parts.push(`Examples:\n${FEW_SHOT}`);
        }

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

      // Auto-save settings when changed
      Vue.watch(state.settings, saveSettings, { deep: true });

      // Auto-save AI preferences when changed
      Vue.watch(ui.ai, v => {
        localStorage.setItem(AI_STORE_KEY, JSON.stringify(v));
      }, { deep: true });

      // Handle chat message sending
      async function onSend() {
        const text = ui.chatInput.value.trim();
        if (!text || state.app.value.chatBusy) return;

        state.app.value.chatBusy = true;

        // Show thinking indicator
        showBubble('...thinking');

        try {
          //log: user
          addLog({ role: 'user', text });
          // Get LLM response
          const raw = await ask(ui.ai.value.engine, text, {
            apiKey: ui.ai.value.apiKey,
            systemPrompt: buildSystemPrompt(ui),
            tflite: state.config?.ai?.tflite || {}
          }
          )
          const reply = postProcessReply(raw);

          // Generate TTS audio blob (graceful fallback to null)
          const ttsUrlString = await fetchTTSBlob(reply, ui.ai.value.ttsUrl);

          // Display response text
          showBubble(reply);

          // Play audio if available
          if (ttsUrlString) {
            startTTSTalk(); // Start talk animation
            await playUrlAndWait(ttsUrlString);
            stopTTSTalk(); // Stop talk animation
          } else {
            // Show text briefly if no audio
            await new Promise(r => setTimeout(r, 1200));
          }
          // log: assistant
          addLog({
            role: 'assistant',
            text: reply,
            meta: {
              tts: Boolean(ttsUrlString)
            }
          });

          engine: ui.ai.value.engine,
            hideBubbleLater(1000);
          ui.chatInput.value = "";
        } catch (e) {
          console.warn('chat flow error:', e);
          showBubble('...failed');
          addLog({ role: 'error', text: String(e?.message || e) });
          hideBubbleLater(1200);
        } finally {
          state.app.value.chatBusy = false;
        }
      }

      return {
        settings: ui.settings,
        app: ui.app,
        ai: ui.ai,
        chatInput: ui.chatInput,
        activeTab: ui.activeTab,
        logs: ui.logs,
        togglePanelDisplay,
        onSend,
        clearLogs,
        exportLogs,
        handleMouseDown, handleMouseUp, handleClick, handleMouseMove
      };
    },
 template: `
      <el-button id="setting-button" class="setting-button" type="primary" @click="togglePanelDisplay">
        <el-icon><Setting/></el-icon> Settings
      </el-button>

      <el-card id="basetting" class="setting" v-show="settings.panelDisplay" shadow="hover">
        <template #header>
          <div class="setting-header">
            <span>Settings</span>
            <el-button type="text" @click="togglePanelDisplay" class="close-btn">
              <el-icon><Close/></el-icon>
            </el-button>
          </div>
        </template>

        <el-tabs v-model="activeTab" class="setting-tabs">
          <!-- Display & Position Tab -->
          <el-tab-pane label="Display" name="display">
            <el-form label-width="120px" label-position="left" size="small">
              <el-form-item label="Scale">
                <el-input-number v-model="settings.scale" :min="0.1" :max="10" :step="0.01" controls-position="right"/>
              </el-form-item>
              <el-form-item label="Position X">
                <el-input-number v-model="settings.position.x" :min="-5000" :max="5000" controls-position="right"/>
              </el-form-item>
              <el-form-item label="Position Y">
                <el-input-number v-model="settings.position.y" :min="-5000" :max="5000" controls-position="right"/>
              </el-form-item>
              <el-form-item label="Rotation">
                <el-input-number v-model="settings.rotation" :min="0" :max="6.3" :step="0.01" controls-position="right"/>
              </el-form-item>
            </el-form>
          </el-tab-pane>

          <!-- Text & UI Tab -->
          <el-tab-pane label="Text & UI" name="text">
            <el-form label-width="120px" label-position="left" size="small">
              <el-form-item label="Text X">
                <el-input-number v-model="settings.textPointX" :min="0" :max="5000" controls-position="right"/>
              </el-form-item>
              <el-form-item label="Text Y">
                <el-input-number v-model="settings.textPointY" :min="0" :max="5000" controls-position="right"/>
              </el-form-item>
              <el-form-item label="Font Size">
                <el-input-number v-model="settings.fontSize" :min="1" :max="200" controls-position="right"/>
              </el-form-item>
              <el-form-item label="Language">
                <el-radio-group v-model="settings.language" size="small">
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
            <el-form label-width="120px" label-position="left" size="small">
              <el-form-item label="BGM Volume">
                <el-slider v-model="settings.bgmVolume" :min="0" :max="1" :step="0.1" show-input/>
              </el-form-item>
              <el-form-item label="Voice Volume">
                <el-slider v-model="settings.talkVolume" :min="0" :max="1" :step="0.1" show-input/>
              </el-form-item>
            </el-form>
          </el-tab-pane>

          <!-- Mic (TODO) -->
      <el-tab-pane label="Mic (TODO)" name="mic">
        <el-alert
          title="on progress..."
          type="info"
          show-icon
          style="margin-bottom:12px"
        />
        <el-form label-width="140px" label-position="left" size="small">
          <el-form-item label="Enable Mic">
            <el-switch v-model="settings.enableMic" disabled />
          </el-form-item>
          <el-form-item label="Input Device">
            <el-select v-model="settings.micDeviceId" placeholder="Pilih perangkat" disabled style="width:100%">
              <el-option label="(Auto)" value="" />
            </el-select>
          </el-form-item>
          <el-form-item label="VAD Threshold">
            <el-slider
              v-model="settings.micVadThreshold"
              :min="0" :max="1" :step="0.05"
              show-input
              disabled
            />
          </el-form-item>
        </el-form>
      </el-tab-pane>

          <!-- AI Tab -->
          <el-tab-pane label="AI & Chat" name="ai">
            <el-form label-width="120px" label-position="left" size="small">
              <el-form-item label="Engine">
                <el-select v-model="ai.engine" style="width:100%">
                  <el-option label="Gemini (online)" value="gemini">
                    <span>Gemini (online)</span>
                    <el-tag size="small" type="success" style="margin-left:8px">Cloud</el-tag>
                  </el-option>
                  <el-option label="TFLite (local)" value="tflite">
                    <span>TFLite (local)</span>
                    <el-tag size="small" type="info" style="margin-left:8px">Local</el-tag>
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
                <el-input 
                  v-model="ai.ttsUrl" 
                  placeholder="http://127.0.0.1:9880/tts"
                  clearable
                >
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
        <el-input-number v-model="settings.memoryTurns" :min="1" :max="50" />
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
          <el-tab-pane label="Logs" name="logs">
         <el-form label-width="120px" label-position="left" size="small">
           <el-form-item label="Enable Logging">
             <el-switch v-model="settings.enableChatLog" />
           </el-form-item>
           <el-form-item>
             <el-space wrap>
               <el-button size="small" type="danger" @click="clearLogs">Clear</el-button>
               <el-button size="small" type="primary" @click="exportLogs">Export JSON</el-button>
               <el-tag>Entries: {{ logs.length }}</el-tag>
             </el-space>
           </el-form-item>
         </el-form>
         <el-table :data="logs.slice().reverse()" height="300" size="small" border>
           <el-table-column type="index" width="50" label="#" />
           <el-table-column label="Time" width="160">
             <template #default="{ row }">
               {{ new Date(row.ts).toLocaleString() }}
             </template>
           </el-table-column>
           <el-table-column prop="role" label="Role" width="100" />
           <el-table-column label="Text">
             <template #default="{ row }">
               <div style="white-space: pre-wrap">{{ row.text }}</div>
             </template>
           </el-table-column>
           <el-table-column label="Meta" width="140">
             <template #default="{ row }">
               <el-tag v-if="row.meta?.engine" size="small">{{ row.meta.engine }}</el-tag>
               <el-tag v-if="row.meta?.tts" size="small" type="success" style="margin-left:6px">TTS</el-tag>
             </template>
           </el-table-column>
         </el-table>
       </el-tab-pane>
        </el-tabs>
      </el-card>

      <div id="badialog" class="badialog"></div>

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

      <!-- Interaction area for character -->
<div
  class="interaction-area"
  :style="{ pointerEvents: settings.panelDisplay ? 'none' : 'auto' }"
  @click.stop="handleClick"
  @mousedown="handleMouseDown"
  @mouseup="handleMouseUp"
  @mousemove="handleMouseMove"
  @mouseleave="handleMouseUp"
/>
    `

  };

  const app = Vue.createApp(Root);
  app.use(ElementPlus);

  const vm = app.mount('#app');

  // Forward canvas events to interaction handlers
  const spineContainer = document.getElementById('spine');
  spineContainer.addEventListener('mousedown', vm.handleMouseDown);
  spineContainer.addEventListener('mouseup', vm.handleMouseUp);
  spineContainer.addEventListener('mouseleave', vm.handleMouseUp);
  spineContainer.addEventListener('mousemove', vm.handleMouseMove);
  spineContainer.addEventListener('click', vm.handleClick);
});