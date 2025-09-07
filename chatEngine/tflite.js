// WebGPU LLM wrapper using MediaPipe Tasks (.task): lazy singleton init, generateResponse, cleanup, and a quick self-test.

let llmInference = null;
let currentModelKey = null;

/**
 * Initializes the MediaPipe LlmInference task.
 * Acts as a singleton; re-initializes only if model/config changes.
 * @param {object} options - Configuration for the LLM model.
 */
export async function initLLM(options = {}) {
  // Destructure options with default values.
  const {
    modelAssetPath = './model/Llama-3.2-1B-Instruct_multi-prefill-seq_q8_ekv1280.task',
    maxTokens = 512,
    temperature = 0.78,
    topK = 64,
    topP = 0.95,
    randomSeed = 101,
    maxNumImages = 0,
    supportAudio = false
  } = options;

  // Create a unique key to identify the current model configuration.
  const modelKey = `${modelAssetPath}|${maxTokens}|${temperature}|${topK}|${topP}|${randomSeed}|${maxNumImages}|${supportAudio}`;
  // If model is already initialized with the same config, return it.
  if (llmInference && currentModelKey === modelKey) return llmInference;

  // Check for WebGPU browser support.
  if (!('gpu' in navigator)) {
    throw new Error("WebGPU is not available. Use a recent version of Chrome/Edge (HTTPS) and enable WebGPU.");
  }

  // If a different model instance exists, clean it up before re-initializing.
  if (llmInference) {
    try { llmInference.close(); } catch { }
    llmInference = null;
    currentModelKey = null;
  }

  // Dynamically import MediaPipe GenAI tasks.
  const { LlmInference, FilesetResolver } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai');
  // Set up the resolver for WASM files.
  const genai = await FilesetResolver.forGenAiTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm");

  // Create the LlmInference instance with the specified options.
  llmInference = await LlmInference.createFromOptions(genai, {
    baseOptions: { modelAssetPath },
    maxTokens,
    topK,
    topP,
    temperature,
    randomSeed,
    maxNumImages,
    supportAudio
  });

  // Store the key for the newly created instance.
  currentModelKey = modelKey;
  return llmInference;
}

/**
 * Generates a response from the LLM based on a given prompt, with custom stop tokens.
 * @param {string} fullPrompt - The user's input prompt.
 * @param {object} opts - Options, including tflite model config.
 * @returns {Promise<string>} - The generated response.
 */
export async function generate(fullPrompt, opts = {}) {
  // MODIFIED: Wrapped in a Promise to handle streaming and custom stop conditions.
  return new Promise(async (resolve, reject) => {
    try {
      await initLLM(opts.tflite || {});
      const formattedPrompt = `${fullPrompt}`;
      console.log("Formatted Prompt:", formattedPrompt);

      // Define your stop tokens.
      const stopTokens =['<s/>', '</s', '<s' , '<', '<<END>>', '<|user|>', '<|assistant|>'];
      let accumulatedResponse = '';
      let stopped = false;

      // Use the streaming callback of generateResponse.
      llmInference.generateResponse(formattedPrompt, (partialResult, done) => {
        // If we've already stopped, do nothing.
        if (stopped) return;

        accumulatedResponse += partialResult;

        // Check if any stop token is present in the accumulated response.
        for (const token of stopTokens) {
          if (accumulatedResponse.includes(token)) {
            stopped = true;
            // Get the text before the stop token.
            const finalResponse = accumulatedResponse.substring(0, accumulatedResponse.indexOf(token)).trim();
            resolve(finalResponse || "...");
            return; // Exit the callback
          }
        }

        // If generation is finished without finding a stop token.
        if (done) {
          stopped = true;
          resolve(accumulatedResponse.trim() || "...");
        }
      });
    } catch (error) {
      console.error('Error generating response:', error);
      reject(error); // Reject the promise on error
    }
  });
}


/**
 * Cleans up and releases the LLM resources.
 */
export function cleanup() {
  if (llmInference) {
    try { llmInference.close(); } catch { }
    // Reset global state.
    llmInference = null;
    currentModelKey = null;
  }
}

/**
 * Tests the LLM connection and generation capability.
 * @param {object} opts - Options for the LLM model.
 * @returns {Promise<object>} - An object indicating success or failure.
 */
export async function testConnection(opts = {}) {
  try {
    // Initialize the model.
    await initLLM(opts.tflite || {});
    // Attempt to generate a test response.
    const result = await generate('Hello', opts);
    // Return success if a valid response is generated.
    return { success: result !== "...", result };
  } catch (e) {
    // Return failure on error.
    return { success: false, error: e.message };
  }
}