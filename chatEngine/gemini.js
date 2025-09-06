// Generate text using Gemini 1.5 Flash; uses opts.apiKey and returns the first candidate or "..." on failure.
export async function generate(fullPrompt, opts){
  const key = opts?.apiKey;
  if (!key) return "...";
  try{
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ contents:[{parts:[{text:fullPrompt}]}], generationConfig:{temperature:0.7, topP:1, maxOutputTokens:192} })
    });
    if (!res.ok) return "...";
    const json = await res.json();
    return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "...";
  }catch(e){ return "..."; }
}
