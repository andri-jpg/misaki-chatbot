// Minimal ask router: pick engine (gemini|tflite), build a strict two-sentence prompt, generate, then sanitize.

import { cleanText } from './utils.js';
import * as gemini from './gemini.js';
import * as tflite from './tflite.js';

const ENGINES = { gemini, tflite };
export function getEngine(name='gemini'){ return ENGINES[name] || ENGINES.gemini; } // Select engine; default gemini.

export async function ask(engineName, userText, opts){
  const engine = getEngine(engineName);                 // Resolve engine module.
  const prompt = buildPrompt(userText, opts?.systemPrompt); // Compose prompt with mandatory policy.
  const raw = await engine.generate(prompt, opts);      // Generate with chosen engine.
  return cleanText(raw);                                // Normalize/strip output.
}

function buildPrompt(userText, systemPrompt=""){
  const policy = `
Output policy (MANDATORY):
- Plain text only. No emojis, no unicode icons, no markdown, no code fences.
- No role tags like "User:" or "Misaki:" in the answer.
- No stage directions or bracketed text. No quoting the user.
- Max two short sentences. Be neutral and detached.
Answer the user briefly.
`.trim();

  // To enable policy, uncomment the next line:
  // systemPrompt = `${(systemPrompt||"").trim()}\n\n${policy}`;
const finalTurn = `<|user|>
${userText} </s>
<|assistant|>`;

return `${systemPrompt}\n${finalTurn}`;
}