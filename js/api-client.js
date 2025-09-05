/**
 * ===================================================================
 * API CLIENT
 * Handles all external API communications
 * ===================================================================
 */

class APIClient {
  constructor() {
    this.retryCount = 0;
    this.maxRetries = CONFIG.MAX_RETRIES;
    this.timeout = CONFIG.RESPONSE_TIMEOUT;
  }

  /**
   * ===============================================================
   * GEMINI AI API
   * ===============================================================
   */

  /**
   * Send request to Gemini API
   */
  async getGeminiResponse(prompt) {
    if (!CONFIG.GEMINI_API_KEY || CONFIG.GEMINI_API_KEY === "YOUR_API_KEY_HERE") {
      throw new Error("Gemini API key not configured");
    }

    CONFIG.utils.log('debug', '🤖 Sending request to Gemini API...');

    const requestBody = {
      contents: [{ 
        parts: [{ text: prompt }] 
      }],
      generationConfig: {
        temperature: 0.7,
        topP: 1,
        maxOutputTokens: 256,
        stopSequences: [],
        candidateCount: 1
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH", 
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        }
      ]
    };

    try {
      const response = await this.makeRequest(
        `${CONFIG.GEMINI_API_URL}?key=${CONFIG.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Gemini API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      
      // Validate response structure
      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        throw new Error('Invalid response format from Gemini API');
      }

      const responseText = data.candidates[0].content.parts[0].text;
      
      CONFIG.utils.log('debug', '✅ Gemini API response received');
      
      if (CONFIG.DEBUG.logAPIRequests) {
        CONFIG.utils.log('debug', 'Response:', responseText);
      }

      return responseText;

    } catch (error) {
      CONFIG.utils.log('error', '❌ Gemini API request failed:', error.message);
      
      // Retry logic
      if (this.retryCount < this.maxRetries && this.shouldRetry(error)) {
        this.retryCount++;
        CONFIG.utils.log('info', `🔄 Retrying Gemini request (${this.retryCount}/${this.maxRetries})`);
        await this.delay(1000 * this.retryCount); // Progressive delay
        return this.getGeminiResponse(prompt);
      }
      
      this.retryCount = 0;
      throw error;
    }
  }

  /**
   * ===============================================================
   * TTS API
   * ===============================================================
   */

  /**
   * Generate speech from text using local TTS API
   */
  async generateTTS(text) {
    if (!text || text.trim().length === 0) {
      throw new Error('No text provided for TTS generation');
    }

    CONFIG.utils.log('debug', '🎤 Generating TTS audio...');

    const payload = {
      ...CONFIG.TTS_SETTINGS,
      text: text.trim()
    };

    try {
      const response = await this.makeRequest(CONFIG.LOCAL_TTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`TTS API error: ${response.status} - ${errorText}`);
      }

      const audioBlob = await response.blob();
      
      if (audioBlob.size === 0) {
        throw new Error('TTS API returned empty audio data');
      }

      CONFIG.utils.log('debug', '✅ TTS audio generated successfully');
      return audioBlob;

    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error(`TTS server unavailable at ${CONFIG.LOCAL_TTS_URL}. Is the server running?`);
      }
      
      CONFIG.utils.log('error', '❌ TTS generation failed:', error.message);
      throw error;
    }
  }

  /**
   * ===============================================================
   * UTILITY METHODS
   * ===============================================================
   */

  /**
   * Make HTTP request with timeout
   */
  async makeRequest(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response;
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      
      throw error;
    }
  }

  /**
   * Check if error should trigger a retry
   */
  shouldRetry(error) {
    // Retry on network errors or 5xx server errors
    const retryableErrors = [
      'TypeError', // Network errors
      'fetch',     // Fetch failures
      '500',       // Internal server error
      '502',       // Bad gateway
      '503',       // Service unavailable
      '504'        // Gateway timeout
    ];
    
    return retryableErrors.some(errorType => 
      error.message.includes(errorType) || 
      error.name === errorType
    );
  }

  /**
   * Delay utility for retries
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset retry counter
   */
  resetRetryCount() {
    this.retryCount = 0;
  }

  /**
   * ===============================================================
   * CONVERSATION BUILDER
   * ===============================================================
   */

  /**
   * Build full prompt with conversation history
   */
  buildConversationPrompt(userMessage, conversationHistory) {
    const historyString = conversationHistory.join('\n');
    
    let prompt = CONFIG.KIRI_PERSONA;
    
    if (historyString.length > 0) {
      prompt += `\n\nConversation History:\n${historyString}`;
    }
    
    prompt += `\n\nUser: ${userMessage}\nKiri:`;
    
    if (CONFIG.DEBUG.logAPIRequests) {
      CONFIG.utils.log('debug', 'Full prompt:', prompt);
    }
    
    return prompt;
  }

  /**
   * ===============================================================
   * HEALTH CHECK
   * ===============================================================
   */

  /**
   * Check if Gemini API is accessible
   */
  async checkGeminiHealth() {
    try {
      const response = await this.getGeminiResponse("Hi");
      return { status: 'ok', service: 'gemini' };
    } catch (error) {
      return { 
        status: 'error', 
        service: 'gemini', 
        error: error.message 
      };
    }
  }

  /**
   * Check if TTS API is accessible
   */
  async checkTTSHealth() {
    try {
      // Simple health check - just ping the endpoint
      const response = await this.makeRequest(CONFIG.LOCAL_TTS_URL.replace('/tts', '/health'), {
        method: 'GET'
      });
      
      if (response.ok) {
        return { status: 'ok', service: 'tts' };
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      return { 
        status: 'error', 
        service: 'tts', 
        error: error.message 
      };
    }
  }

  /**
   * Comprehensive health check
   */
  async healthCheck() {
    CONFIG.utils.log('debug', '🏥 Running API health check...');
    
    const [geminiHealth, ttsHealth] = await Promise.allSettled([
      this.checkGeminiHealth(),
      this.checkTTSHealth()
    ]);

    const results = {
      gemini: geminiHealth.status === 'fulfilled' ? 
        geminiHealth.value : 
        { status: 'error', service: 'gemini', error: geminiHealth.reason.message },
      tts: ttsHealth.status === 'fulfilled' ? 
        ttsHealth.value : 
        { status: 'error', service: 'tts', error: ttsHealth.reason.message }
    };

    CONFIG.utils.log('info', '🏥 Health check results:', results);
    return results;
  }
}

// Create global instance
window.apiClient = new APIClient();