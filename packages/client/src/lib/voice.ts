import { playKickoffFanfare, playPaChime, playZoneWarningAlarm, unlockAudioContext } from './sound';
import { PaTone, useVoiceStore } from '../stores/voiceStore';

interface SpeakOptions {
  priority?: 'high' | 'normal';
  chime?: 'pa' | 'kickoff' | 'alert' | 'none';
  tone?: PaTone;
  rate?: number;
  pitch?: number;
  onStartBlocked?: () => void;
}

let activeTimer: ReturnType<typeof setTimeout> | null = null;
let lastSpokenKey = '';
let lastSpokenAt = 0;

function hasSpeechSupport(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

/** Pick calm, deep male English PA voice available on the device */
function selectPaVoice(): SpeechSynthesisVoice | null {
  if (!hasSpeechSupport()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const englishVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const pool = englishVoices.length > 0 ? englishVoices : voices;

  // Strongly prefer natural male PA voices across Windows, Android, iOS, and macOS
  const malePatterns = [
    /google uk english male/i,
    /microsoft mark/i,
    /microsoft david/i,
    /microsoft george/i,
    /microsoft guy/i,
    /microsoft ryan/i,
    /microsoft christopher/i,
    /microsoft eric/i,
    /microsoft ravi/i,
    /microsoft prabhat/i,
    /\bdaniel\b/i,
    /\balex\b/i,
    /\brishi\b/i,
    /\baaron\b/i,
    /\barthur\b/i,
    /\bmale\b/i,
  ];

  for (const pattern of malePatterns) {
    const match = pool.find((v) => pattern.test(v.name));
    if (match) return match;
  }

  // Avoid obviously female voices if an unknown neutral/male fallback exists
  const nonFemale = pool.find(
    (v) => !/female|zira|samantha|aria|jenny|karen|susan|hazel|catherine|victoria|tessa|veena|moira/i.test(v.name),
  );
  return nonFemale ?? pool[0] ?? null;
}

/**
 * Call inside a user click/submit handler on mobile Safari/Chrome
 * to unlock both Web Audio and SpeechSynthesis cleanly.
 */
export function primeSpeechEngine() {
  unlockAudioContext();
  useVoiceStore.getState().setAutoplayBlocked(false);

  if (!hasSpeechSupport()) return;
  try {
    window.speechSynthesis.getVoices();
    const primer = new SpeechSynthesisUtterance('');
    primer.volume = 0;
    window.speechSynthesis.speak(primer);
  } catch {}
}

export function stopPaVoice() {
  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
  if (hasSpeechSupport()) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
  useVoiceStore.getState().setSpeakingState(false, null, 'pa');
}

/**
 * Speak a clear, actionable message with the Squid Game PA chime
 * in a calm male announcer tone plus live on-screen captions.
 */
export function speakPaMessage(text: string, options: SpeakOptions = {}) {
  const {
    priority = 'normal',
    chime = 'pa',
    tone = 'pa',
    rate = 0.92,
    pitch = 0.84,
    onStartBlocked,
  } = options;
  const store = useVoiceStore.getState();
  const cleanText = text.trim();
  if (!cleanText) return;

  // Deduplicate identical announcement bursts (e.g. multiple socket aliases)
  const now = Date.now();
  if (cleanText === lastSpokenKey && now - lastSpokenAt < 2500) {
    return;
  }
  lastSpokenKey = cleanText;
  lastSpokenAt = now;

  if (store.muted) return;

  if (priority === 'high') {
    stopPaVoice();
  } else if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }

  if (chime === 'pa') {
    playPaChime();
  } else if (chime === 'kickoff') {
    playKickoffFanfare();
  } else if (chime === 'alert') {
    playZoneWarningAlarm();
  }

  store.setSpeakingState(true, cleanText, tone);

  if (!hasSpeechSupport()) {
    activeTimer = setTimeout(() => {
      useVoiceStore.getState().setSpeakingState(false, null, tone);
    }, Math.max(4500, cleanText.length * 65));
    return;
  }

  const startDelay = chime === 'none' ? 50 : chime === 'kickoff' ? 680 : 520;
  let started = false;

  const fallbackMs = Math.max(5500, cleanText.length * 80) + startDelay;
  activeTimer = setTimeout(() => {
    if (!started && onStartBlocked) {
      useVoiceStore.getState().setAutoplayBlocked(true);
      onStartBlocked();
    }
    useVoiceStore.getState().setSpeakingState(false, null, tone);
  }, fallbackMs);

  setTimeout(() => {
    if (useVoiceStore.getState().muted) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      const voice = selectPaVoice();
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang || 'en-US';
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = 1;

      utterance.onstart = () => {
        started = true;
        useVoiceStore.getState().setAutoplayBlocked(false);
      };

      utterance.onend = () => {
        if (activeTimer) {
          clearTimeout(activeTimer);
          activeTimer = null;
        }
        useVoiceStore.getState().setSpeakingState(false, null, tone);
      };

      utterance.onerror = () => {
        if (!started) {
          useVoiceStore.getState().setAutoplayBlocked(true);
          onStartBlocked?.();
        }
        if (activeTimer) {
          clearTimeout(activeTimer);
          activeTimer = null;
        }
        useVoiceStore.getState().setSpeakingState(false, null, tone);
      };

      window.speechSynthesis.speak(utterance);

      // Detect silent autoplay blocks quickly (~900ms) on strict mobile browsers
      if (onStartBlocked) {
        setTimeout(() => {
          if (!started && !window.speechSynthesis.speaking && !useVoiceStore.getState().muted) {
            useVoiceStore.getState().setAutoplayBlocked(true);
            onStartBlocked();
          }
        }, 900);
      }
    } catch {
      useVoiceStore.getState().setSpeakingState(false, null, tone);
    }
  }, startDelay);
}

// =========================================================================
// SIMPLE, ACTIONABLE SQUID GAME PA SCRIPTS
// =========================================================================

export function announceArenaWelcome(teamName?: string | null, onStartBlocked?: () => void) {
  const squad = teamName?.trim() ? `Team ${teamName.trim()}` : 'Players';
  const script =
    `Attention. Welcome, Players. ${squad}, you are successfully logged in to Campus Hunt. ` +
    `Remember, this is a real-world campus simulation game. Watch out for campus traffic, stay out of red restricted zones, and play fair. ` +
    `Get ready and wait for the game to start.`;

  speakPaMessage(script, {
    priority: 'high',
    chime: 'pa',
    tone: 'pa',
    rate: 0.92,
    pitch: 0.84,
    onStartBlocked,
  });
}

export function announceGameStarted() {
  speakPaMessage(
    'Game on, Players! The hunt has officially started! Look at the arrow and distance meter on your screen and move fast to your first spot. When you reach close, your clue opens automatically. Solve it, type the answer to unlock the next location, and race to win! Move out now!',
    {
      priority: 'high',
      chime: 'kickoff',
      tone: 'success',
      rate: 1.03,
      pitch: 0.94,
    },
  );
}

export function announceGamePaused() {
  speakPaMessage(
    'Attention, Players. The game is paused for a moment. Please stay where you are and wait until the timer starts again.',
    { priority: 'high', chime: 'pa', tone: 'pa' },
  );
}

export function announceGameResumed() {
  speakPaMessage(
    'Attention, Players. The game has started again. Keep walking toward the location shown on your radar.',
    { priority: 'high', chime: 'pa', tone: 'pa' },
  );
}

export function announceGameEnded() {
  speakPaMessage(
    'Attention, Players. The hunt is now over and all times are saved. Please head back to the start desk right away.',
    { priority: 'high', chime: 'pa', tone: 'pa' },
  );
}

export function announceClueDecrypted(stageNumber: number, isFinal?: boolean) {
  if (isFinal) {
    speakPaMessage(
      'You reached the final location at Sports Complex. Scan Wi-Fi for the hotspot, find our volunteer holding the red clipboard on the bleachers, and deliver the final passphrase.',
      { priority: 'high', chime: 'pa', tone: 'finale' },
    );
  } else {
    speakPaMessage(
      `Stage ${stageNumber} unlocked. Next step: read the clue on your screen, solve the puzzle here, and enter the answer below to get your next location.`,
      { priority: 'normal', chime: 'pa', tone: 'success' },
    );
  }
}

export function announceStageAdvance(nextStageNumber: number | null, isFinal?: boolean) {
  if (isFinal) {
    speakPaMessage(
      'Great job. You solved all ten clues and unlocked the final location. Head to the Sports Complex, scan for the Wi-Fi hotspot to locate our volunteer with the red clipboard, and deliver the final passphrase.',
      { priority: 'high', chime: 'pa', tone: 'finale' },
    );
  } else if (nextStageNumber) {
    speakPaMessage(
      `Correct answer. Now on Stage ${nextStageNumber}. Check the radar arrow and walk to your next location.`,
      { priority: 'normal', chime: 'pa', tone: 'success' },
    );
  }
}

export function announceZoneBreach(label: string | null, penaltyMins: number) {
  const sector = label ? ` at ${label}` : '';
  speakPaMessage(
    `Warning, Players. You stepped into a restricted area${sector}. Turn around and leave right now. A ${penaltyMins} minute penalty was added.`,
    { priority: 'high', chime: 'alert', tone: 'alert' },
  );
}

export function announceCommandBroadcast(
  message: string,
  kind: string,
  teamName?: string | null,
) {
  const prefix =
    kind === 'nudge'
      ? `Message for ${teamName ? `Team ${teamName}` : 'your team'}:`
      : 'Announcement for all players:';
  speakPaMessage(`${prefix} ${message}`, {
    priority: 'normal',
    chime: 'pa',
    tone: kind === 'nudge' ? 'alert' : 'pa',
  });
}

export function announceVerifiedFinish(teamName?: string | null) {
  const squad = teamName?.trim() ? `Team ${teamName.trim()}` : 'Players';
  speakPaMessage(
    `Well done, ${squad}. Your finish is confirmed. Please wait near the main stage for the final results.`,
    { priority: 'high', chime: 'pa', tone: 'success' },
  );
}

export function announcePhotoRejected(reason?: string | null) {
  const detail = reason?.trim() ? ` Reason: ${reason.trim()}.` : '';
  speakPaMessage(
    `Attention, Players. Your finale photo was rejected.${detail} Please take a clearer live photo and upload it again.`,
    { priority: 'high', chime: 'alert', tone: 'alert' },
  );
}

export function announcePhotoApproved() {
  speakPaMessage(
    'Your finale photo has been approved by Event Control.',
    { priority: 'normal', chime: 'pa', tone: 'success' },
  );
}
