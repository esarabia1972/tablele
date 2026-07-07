"use client";

let actx: AudioContext | null = null;

export function ensureAudio() {
  if (typeof window === "undefined") return;
  if (!actx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      actx = new AudioContextClass();
    }
  }
}

export function tone(freq: number, t0: number, dur: number, type: OscillatorType = 'sine', vol = 0.25) {
  if (!actx) return;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type;
  o.frequency.value = freq;
  
  const now = actx.currentTime;
  g.gain.setValueAtTime(vol, now + t0);
  g.gain.exponentialRampToValueAtTime(0.001, now + t0 + dur);
  
  o.connect(g);
  g.connect(actx.destination);
  o.start(now + t0);
  o.stop(now + t0 + dur);
}

export function sndGood() {
  ensureAudio();
  tone(523, 0, 0.15);
  tone(659, 0.12, 0.15);
  tone(784, 0.24, 0.3);
}

export function sndBad() {
  ensureAudio();
  tone(220, 0, 0.3, 'triangle', 0.15);
}

export function sndWin() {
  ensureAudio();
  [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.14, 0.25));
}

// --- Text To Speech ---

const MALE_RE = /diego|jorge|juan|carlos|andr[eé]s|enrique|ra[uú]l|pablo|dami[aá]n|mat[ií]as|tom[aá]s|gonzalo|[aá]lvaro|arnau|reed|rocko|eddy|grandpa|abuelo|alonso|gerardo|hombre|masculin/i;

export function spanishVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  const all = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('es'));
  const males = all.filter(v => MALE_RE.test(v.name) && !/female|mujer|femenin/i.test(v.name));
  return males.length ? males : all;
}

export function scoreVoice(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase();
  const l = v.lang.toLowerCase();
  let s = 0;
  
  if (n.includes('google')) s += 50;
  if (n.includes('natural') || n.includes('neural') || n.includes('premium') || n.includes('enhanced') || n.includes('mejorada')) s += 60;
  
  if (/diego|jorge|juan|carlos|andr[eé]s|enrique|ra[uú]l|pablo|dami[aá]n|mat[ií]as|tom[aá]s|gonzalo|alvaro|álvaro|arnau|liam|reed|rocko|eddy|grandpa|alonso|gerardo/.test(n)) s += 45;
  if (/male|hombre|masculin/.test(n) && !/female|mujer|femenin/.test(n)) s += 45;
  
  if (/m[oó]nica|paulina|luciana|isabela|angelica|sabina|helena|elvira|dalia|camila|marisol|soledad|ximena|larissa|female|mujer|femenin|flo|sandy|shelley|grandma/.test(n)) s -= 40;
  if (n.includes('siri')) s += 20;
  
  if (l === 'es-ar') s += 25;
  else if (l === 'es-mx' || l === 'es-us' || l === 'es-419') s += 15;
  
  if (n.includes('espeak') || n.includes('compact') || n.includes('novelty')) s -= 100;
  if (v.localService === false) s += 10;
  return s;
}

export function bestVoice(): SpeechSynthesisVoice | null {
  const vs = spanishVoices();
  if (!vs.length) return null;
  return vs.sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
}

function doSpeak(text: string) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = bestVoice();
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else {
      // Sin voz elegida, al menos forzar idioma español
      u.lang = 'es-AR';
    }
    u.rate = 0.85;
    u.pitch = 1.05;
    speechSynthesis.speak(u);
  } catch (e) {
    console.error("Speech synthesis failed", e);
  }
}

export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  // En iOS getVoices() puede venir vacío al principio: esperar a que carguen
  // para no caer en la voz por defecto (que puede ser inglesa y lee mal los acentos).
  if (speechSynthesis.getVoices().length === 0) {
    let tries = 0;
    const iv = setInterval(() => {
      if (speechSynthesis.getVoices().length > 0 || ++tries >= 10) {
        clearInterval(iv);
        doSpeak(text);
      }
    }, 150);
    return;
  }
  doSpeak(text);
}

// Prefetch voices
if (typeof window !== "undefined" && 'speechSynthesis' in window) {
  speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}
