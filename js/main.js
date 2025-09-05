/**
 * ===================================================================
 * MAIN APPLICATION CONTROLLER
 * Coordinates all modules and handles global application state
 * ===================================================================
 */

class MisakiChatbotApp {
  constructor() {
    this.isInitialized = false;
    this.initializationPromise = null;
    this.modules = {
      spineManager: window.spineManager,
      chatManager: window.chatManager,
      apiClient: window.apiClient
    };
    
    // Application state
    this.appState = {
      isReady: false,
      hasErrors: false,
      currentMode: 'idle', // idle, chatting, speaking
      apiHealth: {
        gemini: 'unknown',
        tts: 'unknown'
      }
    };
    
    // Performance monitoring
    this.performance = {
      startTime: Date.now(),
      initTime: null,
      frameCount: 0,
      lastFPSCheck: Date.now()
    };
  }

  /**
   * ===============================================================
   * APPLICATION INITIALIZATION
   * ===============================================================
   */

  /**
   * Initialize the complete application
   */
  async init() {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._initializeApp();
    return this.initializationPromise;
  }

  /**
   * Internal initialization method
   */
  async _initializeApp() {
    try {
      CONFIG.utils.log('info', '🚀 Starting Misaki Chatbot App...');
      
      // Set initial status
      this.setGlobalStatus('loading', 'Loading...');
      
      // Initialize modules in sequence
      await this.initializeModules();
      
      // Setup global event listeners
      this.setupGlobalEventListeners();
      
      // Run health checks
      await this.runInitialHealthCheck();
      
      // Finalize initialization
      this.finalizeInitialization();
      
      CONFIG.utils.log('info', '✅ Misaki Chatbot App initialized successfully');
      
    } catch (error) {
      CONFIG.utils.log('error', '❌ App initialization failed:', error);
      this.handleInitializationError(error);
      throw error;
    }
  }

  /**
   * Initialize all modules
   */
  async initializeModules() {
    CONFIG.utils.log('debug', '🔧 Initializing modules...');
    
    // Initialize Chat Manager (UI setup)
    await this.modules.chatManager.init();
    CONFIG.utils.log('debug', '✅ Chat Manager initialized');
    
    // Initialize Spine Manager (WebGL + animations)
    await this.modules.spineManager.init();
    CONFIG.utils.log('debug', '✅ Spine Manager initialized');
    
    // Setup module interconnections
    this.setupModuleConnections();
    
    CONFIG.utils.log('info', '🔗 All modules initialized and connected');
  }

  /**
   * Setup connections between modules
   */
  setupModuleConnections() {
    // Spine Manager callbacks
    this.modules.spineManager.onAnimationComplete = (animation) => {
      CONFIG.utils.log('debug', `🎭 Animation completed: ${animation.motion}`);
      
      // Return to idle after talking animations
      if (animation.motion && animation.motion.includes('Talk')) {
        setTimeout(() => {
          this.modules.spineManager.returnToIdle();
        }, 500);
      }
    };
    
    this.modules.spineManager.onError = (error) => {
      CONFIG.utils.log('error', '❌ Spine Manager error:', error);
      this.handleModuleError('spine', error);
    };
    
    // API Client can be used by chat manager (already connected via global instance)
  }

  /**
   * Setup global event listeners
   */
  setupGlobalEventListeners() {
    // Window resize
    window.addEventListener('resize', () => {
      this.modules.spineManager.handleResize();
      this.modules.chatManager.handleResize();
    });
    
    // Window focus
    window.addEventListener('focus', () => {
      this.modules.chatManager.handleWindowFocus();
    });
    
    // Visibility change
    document.addEventListener('visibilitychange', () => {
      this.modules.chatManager.handleVisibilityChange();
    });
    
    // Unload cleanup
    window.addEventListener('beforeunload', () => {
      this.cleanup();
    });
    
    // Error handling
    window.addEventListener('error', (event) => {
      CONFIG.utils.log('error', '❌ Global error:', event.error);
      this.handleGlobalError(event.error);
    });
    
    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      CONFIG.utils.log('error', '❌ Unhandled promise rejection:', event.reason);
      this.handleGlobalError(event.reason);
    });
    
    CONFIG.utils.log('debug', '🎧 Global event listeners setup complete');
  }

  /**
   * Run initial health check
   */
  async runInitialHealthCheck() {
    CONFIG.utils.log('debug', '🏥 Running initial health check...');
    
    try {
      const healthResults = await this.modules.apiClient.healthCheck();
      
      this.appState.apiHealth.gemini = healthResults.gemini.status;
      this.appState.apiHealth.tts = healthResults.tts.status;
      
      // Log health status
      const geminiStatus = healthResults.gemini.status === 'ok' ? '✅' : '❌';
      const ttsStatus = healthResults.tts.status === 'ok' ? '✅' : '⚠️';
      
      CONFIG.utils.log('info', `🏥 API Health Check:`);
      CONFIG.utils.log('info', `   Gemini API: ${geminiStatus} ${healthResults.gemini.status}`);
      CONFIG.utils.log('info', `   TTS API: ${ttsStatus} ${healthResults.tts.status}`);
      
      // Show health status to user
      if (healthResults.gemini.status !== 'ok') {
        this.modules.chatManager.addSystemMessage('⚠️ AI service may not be available');
      }
      
      if (healthResults.tts.status !== 'ok') {
        this.modules.chatManager.addSystemMessage('⚠️ Voice synthesis may not be available');
      }
      
    } catch (error) {
      CONFIG.utils.log('warn', '⚠️ Health check failed:', error.message);
      this.modules.chatManager.addSystemMessage('⚠️ Some services may not be available');
    }
  }

  /**
   * Finalize initialization
   */
  finalizeInitialization() {
    this.performance.initTime = Date.now() - this.performance.startTime;
    this.isInitialized = true;
    this.appState.isReady = true;
    
    // Set ready status
    this.setGlobalStatus('ready', 'Ready');
    
    // Focus chat input
    this.modules.chatManager.focusInput();
    
    // Show welcome message
    if (CONFIG.DEBUG.enabled) {
      this.modules.chatManager.addSystemMessage(
        `🎉 App initialized in ${this.performance.initTime}ms`
      );
    }
    
    // Start performance monitoring if enabled
    if (CONFIG.DEBUG.showFPS) {
      this.startPerformanceMonitoring();
    }
    
    CONFIG.utils.log('info', `🎉 App ready! (${this.performance.initTime}ms)`);
  }

  /**
   * ===============================================================
   * STATUS MANAGEMENT
   * ===============================================================
   */

  /**
   * Set global application status
   */
  setGlobalStatus(status, message) {
    this.appState.currentMode = status;
    this.modules.chatManager.setStatus(status, message);
    
    // Emit custom event for other systems
    window.dispatchEvent(new CustomEvent('app-status-change', {
      detail: { status, message }
    }));
  }

  /**
   * Get current application state
   */
  getAppState() {
    return {
      ...this.appState,
      isInitialized: this.isInitialized,
      modules: {
        spineReady: this.modules.spineManager.isReady(),
        chatReady: this.modules.chatManager.isReady(),
      },
      performance: { ...this.performance }
    };
  }

  /**
   * ===============================================================
   * ERROR HANDLING
   * ===============================================================
   */

  /**
   * Handle initialization errors
   */
  handleInitializationError(error) {
    this.appState.hasErrors = true;
    this.setGlobalStatus('error', 'Initialization Failed');
    
    // Try to show error in UI if possible
    if (this.modules.chatManager && this.modules.chatManager.chatMessages) {
      this.modules.chatManager.addSystemMessage(
        `❌ Initialization failed: ${error.message}`
      );
    } else {
      // Fallback to alert if UI not available
      alert(`App failed to initialize: ${error.message}`);
    }
  }

  /**
   * Handle module errors
   */
  handleModuleError(moduleName, error) {
    CONFIG.utils.log('error', `❌ ${moduleName} module error:`, error);
    
    this.appState.hasErrors = true;
    this.modules.chatManager.addSystemMessage(
      `⚠️ ${moduleName} error: ${error.message}`
    );
  }

  /**
   * Handle global errors
   */
  handleGlobalError(error) {
    CONFIG.utils.log('error', '❌ Global error:', error);
    
    // Don't flood the user with error messages
    if (this.appState.hasErrors) return;
    
    this.appState.hasErrors = true;
    
    if (this.modules.chatManager) {
      this.modules.chatManager.addSystemMessage(
        '⚠️ An unexpected error occurred'
      );
      
      setTimeout(() => {
        this.appState.hasErrors = false;
      }, 5000);
    }
  }

  /**
   * ===============================================================
   * PERFORMANCE MONITORING
   * ===============================================================
   */

  /**
   * Start performance monitoring
   */
  startPerformanceMonitoring() {
    setInterval(() => {
      const now = Date.now();
      const deltaTime = now - this.performance.lastFPSCheck;
      
      if (deltaTime >= 1000) {
        const fps = Math.round((this.performance.frameCount * 1000) / deltaTime);
        
        CONFIG.utils.log('debug', `📊 FPS: ${fps}`);
        
        this.performance.frameCount = 0;
        this.performance.lastFPSCheck = now;
        
        // Update status if FPS is too low
        if (fps < 30 && CONFIG.DEBUG.enabled) {
          CONFIG.utils.log('warn', '⚠️ Low FPS detected');
        }
      }
      
      this.performance.frameCount++;
    }, 16); // ~60fps check interval
  }

  /**
   * ===============================================================
   * PUBLIC API METHODS
   * ===============================================================
   */

  /**
   * Send message programmatically
   */
  async sendMessage(message) {
    if (!this.isInitialized || !this.appState.isReady) {
      throw new Error('App not ready');
    }
    
    return await this.modules.chatManager.sendPredefinedMessage(message);
  }

  /**
   * Play animation
   */
  playAnimation(motion, mouth = null) {
    if (!this.isInitialized) {
      throw new Error('App not ready');
    }
    
    return this.modules.spineManager.playAnimation(motion, mouth);
  }

  /**
   * Get conversation history
   */
  getConversationHistory() {
    return this.modules.chatManager.getConversationHistory();
  }

  /**
   * Clear conversation
   */
  clearConversation() {
    this.modules.chatManager.clearConversationHistory();
    
    // Clear chat UI
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
      chatMessages.innerHTML = `
        <div class="message bot-message">
          <strong>Misaki:</strong> ...hello. I'm here if you want to talk, I guess.
        </div>
      `;
    }
  }

  /**
   * ===============================================================
   * DEVELOPMENT TOOLS
   * ===============================================================
   */

  /**
   * Get debug information
   */
  getDebugInfo() {
    if (!CONFIG.DEBUG.enabled) return null;
    
    return {
      app: this.getAppState(),
      chat: this.modules.chatManager.getDebugInfo(),
      config: CONFIG,
      modules: Object.keys(this.modules)
    };
  }

  /**
   * Run diagnostic tests
   */
  async runDiagnostics() {
    if (!CONFIG.DEBUG.enabled) return null;
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      app: this.getAppState(),
      health: await this.modules.apiClient.healthCheck(),
      spine: {
        initialized: this.modules.spineManager.isReady(),
        currentAnimation: this.modules.spineManager.getCurrentAnimation()
      }
    };
    
    CONFIG.utils.log('debug', '🔍 Diagnostics:', diagnostics);
    return diagnostics;
  }

  /**
   * ===============================================================
   * CLEANUP
   * ===============================================================
   */

  /**
   * Cleanup resources
   */
  cleanup() {
    CONFIG.utils.log('info', '🧹 Cleaning up application...');
    
    // Cleanup modules
    if (this.modules.spineManager) {
      this.modules.spineManager.destroy();
    }
    
    if (this.modules.chatManager) {
      this.modules.chatManager.destroy();
    }
    
    // Reset state
    this.isInitialized = false;
    this.appState.isReady = false;
    
    CONFIG.utils.log('info', '✅ Cleanup complete');
  }
}

/**
 * ===============================================================
 * APPLICATION STARTUP
 * ===============================================================
 */

// Create global app instance
window.misakiApp = new MisakiChatbotApp();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  try {
    CONFIG.utils.log('info', '🌟 DOM ready, starting app initialization...');
    await window.misakiApp.init();
  } catch (error) {
    CONFIG.utils.log('error', '💥 Failed to start application:', error);
  }
});

// Service worker registration (if available)
window.addEventListener('load', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => CONFIG.utils.log('debug', '📱 Service worker registered'))
      .catch((error) => CONFIG.utils.log('debug', '📱 Service worker registration failed:', error));
  }
});

/**
 * ===============================================================
 * GLOBAL DEVELOPER TOOLS (DEBUG MODE ONLY)
 * ===============================================================
 */

if (CONFIG.DEBUG.enabled) {
  // Expose useful functions to console
  window.dev = {
    app: () => window.misakiApp,
    config: () => CONFIG,
    debug: () => window.misakiApp.getDebugInfo(),
    diagnostics: () => window.misakiApp.runDiagnostics(),
    sendMessage: (msg) => window.misakiApp.sendMessage(msg),
    playAnimation: (motion, mouth) => window.misakiApp.playAnimation(motion, mouth),
    clearChat: () => window.misakiApp.clearConversation(),
    health: () => window.apiClient.healthCheck()
  };
  
  CONFIG.utils.log('info', '🛠️ Developer tools available via window.dev');
}
