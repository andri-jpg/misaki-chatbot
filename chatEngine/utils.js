export function cleanText(s){
  if (!s) return "...";
  let t = String(s);

  // strip role tags
  t = t.replace(/(^|\n)\s*(User|Misaki)\s*:\s*/gi, '$1');

  // strip code fences & markdown
  t = t.replace(/```[\s\S]*?```/g, ' ');
  t = t.replace(/[*_`~>#]/g, ' ');

  // strip bracketed stage directions
  t = t.replace(/\[[^\]]*\]|\([^)]+\)/g, ' ');

  // strip emojis & pictographs (range luas)
  t = t.replace(
    /[\p{Extended_Pictographic}\uFE0F\u200D\u2066-\u2069]/gu,
    ''
  );

  // strip quotes around full text
  t = t.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');

  // collapse whitespace
  t = t.replace(/\s+/g, ' ').trim();

  // keep it short
  if (t.length > 220) t = t.slice(0, 220).trim() + '...';
  return t || '...';
}
// === ADD di utils.js ===
export function sanitizeForPrompt(s = "") {
  // Jangan biarkan tag kontrol bersarang di dalam konten
  return String(s)
    .replace(/<\|(?:system|user|assistant)\|>/gi, "")
    .replace(/<\/s>/gi, "")
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'") // normalize quotes
    .trim();
}

const STOPS = ["<<END>>", "</s>", "<|user|>", "<|assistant|>"];

export function cutAtStops(text, stops = STOPS) {
  let end = text.length;
  for (const stop of stops) {
    const i = text.indexOf(stop);
    if (i !== -1 && i < end) end = i;
  }
  return text.slice(0, end);
}

export function cleanAssistantOut(raw) {
  if (!raw) return "...";
  let t = raw.split(/<\|assistant\|>/i).pop(); // ambil segmen setelah tag asisten terakhir
  t = cutAtStops(t);
  t = t.replace(
    /^(?:<\/?s>|<\/?\|?system\|?|<\/?\|?user\|?|<\/?\|?assistant\|?|\s|<[^>]{0,24}>)+/gi,
    ""
  );
  return t.trim() || "...";
}
