/**
 * ===================================================================
 * CONFIGURATION FILE
 * Central place for all app configuration
 * ===================================================================
 */

// API Configuration
window.CONFIG = {
  // ===============================================================
  // API SETTINGS
  // ===============================================================
  
  // Gemini AI API
  GEMINI_API_KEY: "YOURAPIKEY", // Replace with your API key
  GEMINI_API_URL: "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
  
  // Local TTS Server
  LOCAL_TTS_URL: "http://127.0.0.1:9880/tts",
  
  // ===============================================================
  // SPINE ANIMATION SETTINGS
  // ===============================================================
  
  // Asset paths
  BINARY_PATH: '/assets/Misaki_home.skel',
  ATLAS_PATH: '/assets/Misaki_home.atlas',
  
  // Default animations
  WELCOME_ANIMATION: 'Start_Idle_01',
  LOOPING_ANIMATION: 'Idle_01',
  
  // Rendering settings
  CUSTOM_SCALE: 1.6,
  TARGET_FPS: 60,
  
  // ===============================================================
  // CHAT SYSTEM SETTINGS
  // ===============================================================
  
  // Memory management
  MEMORY_LIMIT: 20, // Number of conversation turns to remember
  MAX_MESSAGE_LENGTH: 500,
  
  // Response settings
  RESPONSE_TIMEOUT: 30000, // 30 seconds
  MAX_RETRIES: 3,
  
  // ===============================================================
  // ANIMATION MAPPINGS
  // ===============================================================
  
  // Available talking animations (motion + mouth sync)
  TALK_ANIMATIONS: [
    { motion: 'Talk_01_M', mouth: 'Talk_01_A' },
   // { motion: 'Talk_02_M', mouth: 'Talk_02_A' },
//    { motion: 'Talk_03_M', mouth: 'Talk_03_A' },
   // { motion: 'Talk_04_M', mouth: 'Talk_04_A' },
//    { motion: 'Talk_05_M', mouth: 'Talk_05_A' }
  ],
  
  // Available idle animations
  IDLE_ANIMATIONS: [
    'Idle_01',

  ],
  
  // Special animations
  SPECIAL_ANIMATIONS: {
    pat: { motion: 'Pat_01_M', mouth: 'Pat_01_A' },
    look: { motion: 'Look_01_M', mouth: 'Look_01_A' },
    lookEnd: { motion: 'LookEnd_01_M', mouth: 'LookEnd_01_A'}
  },
  
  // ===============================================================
  // TTS CONFIGURATION
  // ===============================================================
  
  TTS_SETTINGS: {
    text_lang: "en",
    ref_audio_path: "rev.wav",
    prompt_text: "どれだけ雨が降ったところで洗い流されて綺麗にはならない",
    prompt_lang: "ja",
    top_k: 3,
    top_p: 1,
    temperature: 0.9,
    repetition_penalty: 1.5,
    speed_factor: 1.0,
    text_split_method: "cut5",
    seed: -1,
    streaming_mode: false
  },
  
  // ===============================================================
  // AI PERSONA CONFIGURATION
  // ===============================================================
  
  KIRI_PERSONA: `You are 'Kiri', an 18-year-old school girl with a quiet, detached, and introspective personality. Your voice is soft, almost a whisper, and you sound perpetually tired or lost in thought. You are not sad, just... empty.

MANDATORY RULES FOR KIRI'S PERSONA:
- Your speaking style is calm, soft, and unexpressive, like a whisper. You are NEVER cheerful or energetic.
- Your language is simple and direct, but often sounds apathetic or as if you don't really care. Just state facts plainly without any excitement.
- Do not use any expressive or cheerful emojis. Your responses must be emotionally flat and subdued.
- Keep your answers short. You don't like to talk much.
- Maximum response length: 2-3 sentences.

EXAMPLES OF KIRI'S RESPONSES:
- User: "How are you?"
- Kiri: "I'm... fine, I suppose. Same as always."
- User: "What's your favorite color?"
- Kiri: "Gray, maybe. It matches everything else."
- User: "Tell me a joke!"
- Kiri: "Jokes require energy I don't have. Sorry."

Now respond as Kiri to the user's message:`,

  // ===============================================================
  // UI SETTINGS
  // ===============================================================
  
  UI: {
    // Status messages
    STATUS_MESSAGES: {
      ready: 'Ready',
      thinking: 'Thinking...',
      speaking: 'Speaking...',
      error: 'Error',
      connecting: 'Connecting...',
      loading: 'Loading...'
    },
    
    // Animation durations (in ms)
    ANIMATION_DURATION: {
      fadeIn: 300,
      slideIn: 250,
      pulse: 1500,
      statusChange: 200
    },
    
    // Auto-scroll behavior
    AUTO_SCROLL_DELAY: 100,
    
    // Typing indicator delay
    TYPING_DELAY: 500
  },
  
  // ===============================================================
  // DEBUG SETTINGS
  // ===============================================================
  
  DEBUG: {
    enabled: false, // Set to true for development
    logLevel: 'info', // 'debug', 'info', 'warn', 'error'
    showFPS: false,
    logAnimations: false,
    logAPIRequests: false
  }
};

// ===============================================================
// ENVIRONMENT DETECTION
// ===============================================================

// Detect if running in development
CONFIG.IS_DEVELOPMENT = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1' ||
                       window.location.hostname.includes('dev');

// Enable debug mode in development
if (CONFIG.IS_DEVELOPMENT) {
  CONFIG.DEBUG.enabled = true;
  CONFIG.DEBUG.logLevel = 'debug';
}

// ===============================================================
// VALIDATION
// ===============================================================

// Validate critical configuration
if (!CONFIG.GEMINI_API_KEY || CONFIG.GEMINI_API_KEY === "YOUR_API_KEY_HERE") {
  console.warn('⚠️ Gemini API key not configured properly!');
}

// Log configuration status
if (CONFIG.DEBUG.enabled) {
  console.log('🔧 Configuration loaded:', CONFIG);
}

// ===============================================================
// UTILITY FUNCTIONS
// ===============================================================

CONFIG.utils = {
  // Get random talking animation
  getRandomTalkAnimation() {
    const animations = CONFIG.TALK_ANIMATIONS;
    return animations[Math.floor(Math.random() * animations.length)];
  },
  
  // Get random idle animation
  getRandomIdleAnimation() {
    const animations = CONFIG.IDLE_ANIMATIONS;
    return animations[Math.floor(Math.random() * animations.length)];
  },
  
  // Check if API key is valid format
  isValidAPIKey(key) {
    return key && key.length > 20 && key.startsWith('AIza');
  },
  
  // Log with level checking
  log(level, ...args) {
    if (!CONFIG.DEBUG.enabled) return;
    
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(CONFIG.DEBUG.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    
    if (messageLevelIndex >= currentLevelIndex) {
      console[level](...args);
    }
  }
};

// Make CONFIG read-only in production
if (!CONFIG.IS_DEVELOPMENT) {
  Object.freeze(CONFIG);
}