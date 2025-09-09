// mic.js
import { state } from './spineCore.js';

/**
 * Mode:
 *  - settings.micMode === 'client' -> rekam di browser (MediaRecorder), kirim ke ASR_URL (POST /asr)
 *  - settings.micMode === 'server' -> backend yang rekam; tombol hanya trigger /mic/on dan /mic/transcript
 */

let mediaStream = null;
let mediaRecorder = null;
let chunks = [];
let holdTimer = null;
let deviceCache = null;

// --- Utils ---
function toNumberOrNull(s){
  if (s === "" || s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function pickMimeType(){
  const prefer = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg'
  ];
  for (const mt of prefer){
    if (MediaRecorder.isTypeSupported(mt)) return mt;
  }
  return '';
}
async function postBlobASR(asrUrl, blob){
  // Kirim raw body (Content-Type sesuai blob)
  const res = await fetch(asrUrl, {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob
  });
  if (!res.ok){
    const errTxt = await res.text().catch(()=> '');
    throw new Error(`ASR HTTP ${res.status}: ${errTxt.slice(0,300)}`);
  }
  // Support JSON {text:"..."} atau plain text
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')){
    const j = await res.json();
    return j.text ?? '';
  }
  return (await res.text()) || '';
}

// ========== Public APIs ==========

export async function initMic(settings){
  // Server mode: load model & start server mic
  if (settings.micMode === 'server'){
    await fetch('http://127.0.0.1:9880/mic/on').catch(()=>{});
  }
  // Client mode: permission akan diminta saat hold pertama
  return true;
}

export async function refreshMicDevices(settings){
  try{
    if (settings.micMode === 'server'){
      // ambil dari backend
      const r = await fetch('http://127.0.0.1:9880/mic/devices');
      const j = await r.json();
      deviceCache = j.devices || [];
    }else{
      // client: query dari browser (hanya label tersedia jika sudah grant)
      await navigator.mediaDevices.getUserMedia({ audio: true }).catch(()=>{});
      const devices = await navigator.mediaDevices.enumerateDevices();
      deviceCache = devices
        .filter(d => d.kind === 'audioinput')
        .map((d, idx) => ({
          index: d.deviceId || String(idx),
          name: d.label || `Mic ${idx}`,
          max_input_channels: 1,
          default_samplerate: 48000
        }));
    }
    // expose ke template dengan global sederhana
    window.__micDevices = deviceCache;
  }catch(e){
    console.warn('refreshMicDevices failed', e);
    window.__micDevices = [];
  }
}

export async function selectMicDevice(settings){
  try{
    if (settings.micMode === 'server'){
      const idx = toNumberOrNull(settings.micDeviceId);
      if (idx == null) return; // auto
      await fetch(`http://127.0.0.1:9880/mic/select?index=${idx}`).catch(()=>{});
    } else {
      // client: tidak perlu panggil server; simpan saja id untuk constraints nanti
      // (getUserMedia saat hold akan gunakan deviceId ini)
    }
  }catch(e){
    console.warn('selectMicDevice fail', e);
  }
}

export async function startVoiceHold(settings){
  if (settings.micMode === 'server'){
    // nothing to start on client; server sudah capturing.
    // kamu bisa tambahkan indikator saja.
    return true;
  }

  // Client Upload mode: start MediaRecorder
  const constraints = {
    audio: settings.micDeviceId
      ? { deviceId: settings.micDeviceId, channelCount: 1 }
      : { channelCount: 1 }
  };

  // minta izin & stream
  mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

  const mimeType = pickMimeType();
  mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : {});
  chunks = [];

  mediaRecorder.ondataavailable = (e)=> { if (e.data && e.data.size) chunks.push(e.data); };
  mediaRecorder.start(25); // timeslice ms

  // safety: auto-stop kalau kelamaan (60s)
  clearTimeout(holdTimer);
  holdTimer = setTimeout(()=>{ tryStop(); }, 60000);
  return true;
}

export async function stopVoiceHold(settings){
  if (settings.micMode === 'server'){
let text = '';
  for (let i=0; i<4; i++){ // ~1s total
  const r = await fetch('http://127.0.0.1:9880/mic/asr?clear=true');
  const j = await r.json().catch(()=> ({}));
  text = j.text || '';
  if (text) break;
  await new Promise(res=> setTimeout(res, 250));
  }
  return text;
  }
  // Client Upload: finalize & kirim blob
  await tryStop();
  const blob = new Blob(chunks, { type: (chunks[0]?.type || 'audio/webm') });
  chunks = [];

  let text = '';
  try{
    text = await postBlobASR(settings.asrUrl, blob);
  }catch(e){
    console.warn('ASR upload fail', e);
  }
  return text || '';
}

// ========== internal stop helper ==========
async function tryStop(){
  clearTimeout(holdTimer);
  if (mediaRecorder && mediaRecorder.state !== 'inactive'){
    await new Promise(res=>{
      const done = ()=>{ mediaRecorder.removeEventListener('stop', done); res(); };
      mediaRecorder.addEventListener('stop', done);
      try { mediaRecorder.stop(); } catch { res(); }
    });
  }
  if (mediaStream){
    mediaStream.getTracks().forEach(t=> t.stop());
  }
  mediaRecorder = null;
  mediaStream = null;
}
