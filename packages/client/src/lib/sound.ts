// Zero-dependency Web Audio API synthesizer for instant chimes & radar pings

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/** Triumphant 4-note celebration chime when clue location is reached */
export function playClueUnlockedSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  notes.forEach((freq, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + index * 0.12);

    gain.gain.setValueAtTime(0, ctx.currentTime + index * 0.12);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + index * 0.12 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + index * 0.12 + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime + index * 0.12);
    osc.stop(ctx.currentTime + index * 0.12 + 0.45);
  });
}

/** Crisp 2-note ascending chime for correct answer submitted or checkpoint claimed */
export function playSuccessSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const notes = [659.25, 1046.5]; // E5, C6
  notes.forEach((freq, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + index * 0.1);

    gain.gain.setValueAtTime(0, ctx.currentTime + index * 0.1);
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + index * 0.1 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + index * 0.1 + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime + index * 0.1);
    osc.stop(ctx.currentTime + index * 0.1 + 0.4);
  });
}

/** Low-frequency descending buzz for incorrect answer or action rejected */
export function playErrorSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.3);

  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.35);
}

/** Tactical 3-beep radio chime for incoming mission control announcements */
export function playAnnouncementSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const times = [0, 0.1, 0.2];
  times.forEach((t) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime + t);

    gain.gain.setValueAtTime(0, ctx.currentTime + t);
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.07);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime + t);
    osc.stop(ctx.currentTime + t + 0.08);
  });
}

/** Urgent warble siren for entering unauthorized restricted hazard zones */
export function playZoneWarningAlarm() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'square';
  osc.frequency.setValueAtTime(700, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.15);
  osc.frequency.linearRampToValueAtTime(700, ctx.currentTime + 0.3);
  osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.45);

  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.65);
}

/** Radar proximity pulse sound */
export function playRadarPing(proximity: 'cold' | 'warm' | 'hot' | 'burning') {
  const ctx = getAudioContext();
  if (!ctx) return;

  const freqMap = {
    cold: 440,
    warm: 660,
    hot: 880,
    burning: 1174,
  };

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(freqMap[proximity], ctx.currentTime);

  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.3);
}

/** Haptic device vibration */
export function triggerHaptic(pattern: number[] = [200, 100, 200, 100, 400]) {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {}
  }
}
