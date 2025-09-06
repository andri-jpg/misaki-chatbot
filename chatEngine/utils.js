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
