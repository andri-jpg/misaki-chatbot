import { state } from './spineCore.js';


const TALK_A = "Talk_01_A";
const TALK_M = "Talk_01_M";

export function startTTSTalk(){
  try{
    const st = state.spineModels[0].spine.state;
    st.setEmptyAnimation(7,0);
    st.setEmptyAnimation(8,0);
    st.setAnimation(7, TALK_A, true);
    st.setAnimation(8, TALK_M, true);
  }catch(e){ console.warn('startTTSTalk', e); }
}
export function stopTTSTalk(){
  try{
    const st = state.spineModels[0].spine.state;
    st.setEmptyAnimation(7,0.25);
    st.setEmptyAnimation(8,0.25);
  }catch(e){}
}

// ----- Build payload from defaults + loadJson.json overrides -----
function buildTTSPayload(text){
  const cfg = state.config?.ai?.tts?.payload || {};
  // defaults that matched your previous server
  const base = {
    text_lang: "en",
    ref_audio_path: "rev.wav",
    prompt_text: "どれだけ雨が降ったところで洗い流されて綺麗にはならない",
    prompt_lang: "ja",
    top_k: 15, top_p: 1, temperature: 1, repetition_penalty: 1,
    speed_factor: 1.0, text_split_method: "cut5", seed: -1, streaming_mode: false,
    text
  };
  return { ...base, ...cfg, text }; // allow overrides but keep fresh text
}

let lastBlobUrl = null;

export async function fetchTTSBlob(text, ttsUrl){
  // return a Blob URL string on success; return null on failure (graceful)
  try{
    const payload = buildTTSPayload(text);
    const res = await fetch(ttsUrl, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      // capture server error text for debugging
      const errTxt = await res.text().catch(()=> '');
      console.warn(`TTS HTTP ${res.status}`, errTxt.slice(0, 300));
      return null;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    lastBlobUrl = url;
    return url;
  } catch (e) {
    console.warn('fetchTTSBlob error:', e);
    return null;
  }
}

export async function playUrlAndWait(urlString){
  if (!urlString) return; // nothing to play
  const el = document.getElementById('chataudio');
  el.src = urlString;
  el.currentTime = 0;

  await new Promise(resolve=>{
    const done = ()=>{ el.removeEventListener('ended', done); resolve(); };
    el.addEventListener('ended', done);
    el.play().catch(()=> resolve());
  });

  // cleanup
  try { el.pause(); el.currentTime = 0; } catch{}
  el.src = "";
  if (lastBlobUrl){ URL.revokeObjectURL(lastBlobUrl); lastBlobUrl = null; }
}
