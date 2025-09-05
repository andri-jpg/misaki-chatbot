/**
 * ===================================================================
 * CHAT MANAGER
 * Handles chat UI, conversation flow, and user interactions
 * ===================================================================
 */

class ChatManager {
  constructor() {
    // DOM elements
    this.chatMessages = null;
    this.chatInput = null;
    this.sendBtn = null;
    this.typingIndicator = null;
    this.statusIndicator = null;
    this.ttsAudio = null;
    
    // Chat state
    this.conversationHistory = [];
    this.isProcessing = false;
    this.currentAudioUrl = null;
    
    // UI settings
    this.maxMessages = 50; // Limit messages in UI for performance
    this.autoScrollDelay = CONFIG.UI.AUTO_SCROLL_DELAY;
    
    // Initialize after DOM is ready
    this.initPromise = null;
  }

  /**
   * ===============================================================
   * INITIALIZATION
   * ===============================================================
   */

  /**
   * Initialize chat manager
   */
  init() {
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = new Promise((resolve) => {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          this.setupDOM();
          this.setupEventListeners();
          resolve();
        });
      } else {
        this.setupDOM();
        this.setupEventListeners();
        resolve();
      }
    });
    
    return this.initPromise;
  }

  /**
   * Setup DOM element references
   */
  setupDOM() {
    this.chatMessages = document.getElementById('chat-messages');
    this.chatInput = document.getElementById('chat-input');
    this.sendBtn = document.getElementById('send-btn');
    this.typingIndicator = document.getElementById('typing-indicator');
    this.statusIndicator = document.getElementById('status-indicator');
    this.ttsAudio = document.getElementById('tts-audio');
    
    // Validate required elements
    const requiredElements = [
      'chatMessages', 'chatInput', 'sendBtn', 
      'typingIndicator', 'statusIndicator', 'ttsAudio'
    ];
    
    for (const element of requiredElements) {
      if (!this[element]) {
        throw new Error(`Required element not found: ${element}`);
      }
    }
    
    CONFIG.utils.log('debug', '🎨 Chat DOM elements initialized');
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Send button click
    this.sendBtn.addEventListener('click', () => this.handleSendMessage());
    
    // Input enter key
    this.chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSendMessage();
      }
    });
    
    // Input validation
    this.chatInput.addEventListener('input', () => this.validateInput());
    
    // Audio events
    this.ttsAudio.addEventListener('ended', () => this.handleAudioEnded());
    this.ttsAudio.addEventListener('error', (e) => this.handleAudioError(e));
    
    // Animation control buttons
    this.setupAnimationControls();
    
    CONFIG.utils.log('debug', '🎧 Event listeners setup complete');
  }

  /**
   * Setup animation control buttons
   */
  setupAnimationControls() {
    const animationControls = document.getElementById('animation-controls');
    if (!animationControls) return;
    
    const buttons = animationControls.querySelectorAll('button');
    buttons.forEach(button => {
      button.addEventListener('click', () => {
        const motion = button.dataset.motion;
        const mouth = button.dataset.mouth || null;
        
        if (motion && window.spineManager) {
          window.spineManager.playAnimation(motion, mouth);
        }
      });
    });
  }

  /**
   * ===============================================================
   * MESSAGE HANDLING
   * ===============================================================
   */

  /**
   * Handle send message action
   */
  async handleSendMessage() {
    const message = this.chatInput.value.trim();
    
    if (!message || this.isProcessing) {
      return;
    }
    
    if (message.length > CONFIG.MAX_MESSAGE_LENGTH) {
      this.showError(`Message too long. Maximum ${CONFIG.MAX_MESSAGE_LENGTH} characters.`);
      return;
    }
    
    try {
      this.isProcessing = true;
      this.disableInput();
      
      // Add user message to UI
      this.addMessage('You', message, true);
      this.clearInput();
      
      // Show processing state
      this.setStatus('thinking', CONFIG.UI.STATUS_MESSAGES.thinking);
      this.showTypingIndicator(true);
      
      // Get AI response
      const response = await this.getAIResponse(message);
      
      // Update conversation history
      this.updateConversationHistory(message, response);
      
      // Hide typing and show response
      this.showTypingIndicator(false);
      this.addMessage('Misaki', response);
      
      // Play animation and generate audio
      await this.handleResponseActions(response);
      
    } catch (error) {
      CONFIG.utils.log('error', '❌ Message handling failed:', error);
      this.showTypingIndicator(false);
      this.addMessage('Misaki', '...something went wrong. Maybe try again later.');
      this.setStatus('error', CONFIG.UI.STATUS_MESSAGES.error);
      
      setTimeout(() => {
        this.setStatus('ready', CONFIG.UI.STATUS_MESSAGES.ready);
      }, 3000);
      
    } finally {
      this.isProcessing = false;
      this.enableInput();
    }
  }

  /**
   * Get AI response from API
   */
  async getAIResponse(userMessage) {
    const prompt = window.apiClient.buildConversationPrompt(
      userMessage, 
      this.conversationHistory
    );
    
    return await window.apiClient.getGeminiResponse(prompt);
  }

  /**
   * Handle response actions (animation + TTS)
   */
  async handleResponseActions(response) {
    // Play talking animation
    if (window.spineManager && window.spineManager.isReady()) {
      window.spineManager.playRandomTalkAnimation();
    }
    
    // Generate and play TTS
    try {
      await this.generateAndPlayTTS(response);
    } catch (error) {
      CONFIG.utils.log('warn', '⚠️ TTS failed, continuing without audio:', error.message);
      this.setStatus('ready', CONFIG.UI.STATUS_MESSAGES.ready + ' (No Voice)');
    }
  }

  /**
   * ===============================================================
   * TTS HANDLING
   * ===============================================================
   */

  /**
   * Generate and play TTS audio
   */
  async generateAndPlayTTS(text) {
    try {
      const audioBlob = await window.apiClient.generateTTS(text);
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Clean up previous audio URL
      if (this.currentAudioUrl) {
        URL.revokeObjectURL(this.currentAudioUrl);
      }
      
      this.currentAudioUrl = audioUrl;
      this.ttsAudio.src = audioUrl;
      
      await this.ttsAudio.play();
      this.setStatus('speaking', CONFIG.UI.STATUS_MESSAGES.speaking);
      
    } catch (error) {
      CONFIG.utils.log('error', '❌ TTS playback failed:', error);
      throw error;
    }
  }

  /**
   * Handle audio playback ended
   */
  handleAudioEnded() {
    this.setStatus('ready', CONFIG.UI.STATUS_MESSAGES.ready);
    
    // Return to idle animation
    if (window.spineManager) {
      setTimeout(() => {
        window.spineManager.returnToIdle();
      }, 500);
    }
    
    // Clean up audio URL
    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = null;
    }
  }

  /**
   * Handle audio playback error
   */
  handleAudioError(event) {
    CONFIG.utils.log('error', '❌ Audio playback error:', event);
    this.setStatus('ready', CONFIG.UI.STATUS_MESSAGES.ready + ' (Audio Error)');
  }

  /**
   * ===============================================================
   * UI MANAGEMENT
   * ===============================================================
   */

  /**
   * Add message to chat interface
   */
  addMessage(sender, message, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
    
    // Sanitize message content
    const sanitizedMessage = this.sanitizeHTML(message);
    messageDiv.innerHTML = `<strong>${this.sanitizeHTML(sender)}:</strong> ${sanitizedMessage}`;
    
    this.chatMessages.appendChild(messageDiv);
    
    // Limit messages for performance
    this.limitMessages();
    
    // Auto-scroll to bottom
    setTimeout(() => {
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }, this.autoScrollDelay);
    
    CONFIG.utils.log('debug', `💬 Added ${isUser ? 'user' : 'bot'} message`);
  }

  /**
   * Show/hide typing indicator
   */
  showTypingIndicator(show) {
    if (this.typingIndicator) {
      this.typingIndicator.style.display = show ? 'block' : 'none';
      
      if (show) {
        setTimeout(() => {
          this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }, this.autoScrollDelay);
      }
    }
  }

  /**
   * Set status indicator
   */
  setStatus(status, message) {
    if (this.statusIndicator) {
      this.statusIndicator.className = `status-${status}`;
      this.statusIndicator.textContent = message;
    }
    
    CONFIG.utils.log('debug', `📊 Status: ${status} - ${message}`);
  }

  /**
   * Show error message
   */
  showError(message) {
    this.addMessage('System', `❌ ${message}`, false);
    this.setStatus('error', 'Error');
    
    setTimeout(() => {
      this.setStatus('ready', CONFIG.UI.STATUS_MESSAGES.ready);
    }, 3000);
  }

  /**
   * Disable input controls
   */
  disableInput() {
    if (this.chatInput) this.chatInput.disabled = true;
    if (this.sendBtn) this.sendBtn.disabled = true;
  }

  /**
   * Enable input controls
   */
  enableInput() {
    if (this.chatInput) {
      this.chatInput.disabled = false;
      this.chatInput.focus();
    }
    if (this.sendBtn) this.sendBtn.disabled = false;
  }

  /**
   * Clear input field
   */
  clearInput() {
    if (this.chatInput) {
      this.chatInput.value = '';
    }
  }

  /**
   * Validate input content
   */
  validateInput() {
    if (!this.chatInput || !this.sendBtn) return;
    
    const message = this.chatInput.value.trim();
    const isValid = message.length > 0 && message.length <= CONFIG.MAX_MESSAGE_LENGTH;
    
    this.sendBtn.disabled = !isValid || this.isProcessing;
    
    // Show character count if approaching limit
    if (message.length > CONFIG.MAX_MESSAGE_LENGTH * 0.8) {
      const remaining = CONFIG.MAX_MESSAGE_LENGTH - message.length;
      this.chatInput.title = `${remaining} characters remaining`;
    } else {
      this.chatInput.title = '';
    }
  }

  /**
   * Limit messages in chat for performance
   */
  limitMessages() {
    if (!this.chatMessages) return;
    
    const messages = this.chatMessages.querySelectorAll('.message:not(.typing-indicator)');
    
    while (messages.length > this.maxMessages) {
      messages[0].remove();
    }
  }

  /**
   * Sanitize HTML content
   */
  sanitizeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * ===============================================================
   * CONVERSATION MANAGEMENT
   * ===============================================================
   */

  /**
   * Update conversation history
   */
  updateConversationHistory(userMessage, botResponse) {
    this.conversationHistory.push(`User: ${userMessage}`);
    this.conversationHistory.push(`Kiri: ${botResponse}`);
    
    // Limit memory to prevent context overflow
    if (this.conversationHistory.length > CONFIG.MEMORY_LIMIT) {
      this.conversationHistory = this.conversationHistory.slice(2);
    }
    
    CONFIG.utils.log('debug', `🧠 Conversation history updated (${this.conversationHistory.length} entries)`);
  }

  /**
   * Clear conversation history
   */
  clearConversationHistory() {
    this.conversationHistory = [];
    CONFIG.utils.log('info', '🧹 Conversation history cleared');
  }

  /**
   * Get conversation history
   */
  getConversationHistory() {
    return [...this.conversationHistory]; // Return copy
  }

  /**
   * Export conversation as text
   */
  exportConversation() {
    const messages = this.chatMessages.querySelectorAll('.message:not(.typing-indicator)');
    const conversation = Array.from(messages).map(msg => msg.textContent).join('\n');
    
    return conversation;
  }

  /**
   * ===============================================================
   * UTILITY METHODS
   * ===============================================================
   */

  /**
   * Focus input field
   */
  focusInput() {
    if (this.chatInput && !this.chatInput.disabled) {
      this.chatInput.focus();
    }
  }

  /**
   * Check if chat is ready for input
   */
  isReady() {
    return !this.isProcessing && this.chatInput && !this.chatInput.disabled;
  }

  /**
   * Get current processing state
   */
  getProcessingState() {
    return {
      isProcessing: this.isProcessing,
      inputEnabled: this.chatInput ? !this.chatInput.disabled : false,
      hasHistory: this.conversationHistory.length > 0
    };
  }

  /**
   * ===============================================================
   * ADVANCED FEATURES
   * ===============================================================
   */

  /**
   * Send predefined message
   */
  async sendPredefinedMessage(message) {
    if (this.isProcessing) return false;
    
    this.chatInput.value = message;
    await this.handleSendMessage();
    return true;
  }

  /**
   * Add system message
   */
  addSystemMessage(message) {
    this.addMessage('System', message, false);
  }

  /**
   * Set chat theme
   */
  setTheme(theme) {
    const chatInterface = document.getElementById('chat-interface');
    if (chatInterface) {
      chatInterface.className = `chat-interface theme-${theme}`;
    }
  }

  /**
   * ===============================================================
   * EVENT HANDLERS
   * ===============================================================
   */

  /**
   * Handle window resize
   */
  handleResize() {
    // Adjust chat interface size on mobile
    if (window.innerWidth < 768) {
      const chatInterface = document.getElementById('chat-interface');
      if (chatInterface) {
        chatInterface.style.width = '95%';
        chatInterface.style.right = '2.5%';
      }
    }
  }

  /**
   * Handle window focus
   */
  handleWindowFocus() {
    this.focusInput();
  }

  /**
   * Handle visibility change
   */
  handleVisibilityChange() {
    if (document.hidden) {
      // Pause TTS if playing
      if (this.ttsAudio && !this.ttsAudio.paused) {
        this.ttsAudio.pause();
      }
    }
  }

  /**
   * ===============================================================
   * CLEANUP
   * ===============================================================
   */

  /**
   * Cleanup resources
   */
  destroy() {
    // Clean up audio URLs
    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = null;
    }
    
    // Stop audio playback
    if (this.ttsAudio) {
      this.ttsAudio.pause();
      this.ttsAudio.src = '';
    }
    
    // Clear conversation history
    this.clearConversationHistory();
    
    // Reset state
    this.isProcessing = false;
    
    CONFIG.utils.log('info', '🧹 Chat Manager destroyed');
  }

  /**
   * ===============================================================
   * DEBUG METHODS
   * ===============================================================
   */

  /**
   * Get debug info
   */
  getDebugInfo() {
    return {
      isProcessing: this.isProcessing,
      conversationLength: this.conversationHistory.length,
      messagesInUI: this.chatMessages ? this.chatMessages.children.length : 0,
      currentAudioUrl: this.currentAudioUrl !== null,
      inputFocused: this.chatInput === document.activeElement
    };
  }

  /**
   * Simulate user message (for testing)
   */
  simulateUserMessage(message) {
    if (CONFIG.DEBUG.enabled) {
      this.chatInput.value = message;
      this.handleSendMessage();
    }
  }
}

// Create global instance
window.chatManager = new ChatManager();