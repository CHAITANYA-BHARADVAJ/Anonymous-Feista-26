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

const DEFAULT_MALE_RATE = 0.92;
const DEFAULT_MALE_PITCH = 0.84;

let activeTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSpeakTimer: ReturnType<typeof setTimeout> | null = null;
let autoplayCheckTimer: ReturnType<typeof setTimeout> | null = null;
let lastSpokenKey = '';
let lastSpokenAt = 0;
let cachedVoices: SpeechSynthesisVoice[] = [];
let voicesListenerAttached = false;

// Explicit male voice names and tokens across Windows, Edge Natural, Chrome/Google, Android, iOS, and macOS
const MALE_VOICE_PATTERNS: RegExp[] = [
  /google uk english male/i,
  /(?:^|[^a-z])male(?:[^a-z]|$)/i,
  /microsoft (?:david|mark|george|guy|ryan|christopher|eric|ravi|prabhat|andrew|brian|steffan|roger|brandon|jacob|tony|davis|jason|connor|liam|william|sam|mitchell|wayne|abeo|elimu|luke)\b/i,
  /\b(?:daniel|alex|rishi|aaron|arthur|oliver|gordon|fred|ralph|bruce|matthew|joey|justin|stephen|gregory|russell|eddy|reed|rocko)\b/i,
];

// Known female voices (including voices without "female" in their label such as Chrome's Google US English)
const FEMALE_VOICE_PATTERNS: RegExp[] = [
  /(?:^|[^a-z])female(?:[^a-z]|$)/i,
  /google us english(?!.*male)/i,
  /\b(?:zira|samantha|aria|jenny|karen|susan|hazel|catherine|victoria|tessa|veena|moira|heera|kalpana|neerja|swara|libby|sonia|mia|natasha|clara|molly|emily|luna|michelle|emma|ava|ana|ashley|amber|cora|elizabeth|monica|allison|nora|kate|serena|fiona|heather|joanna|kendra|kimberly|salli|ivy|kathy|vicki|agnes|princess|shelley|flo|grandma)\b/i,
];

function hasSpeechSupport(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

function clearVoiceTimers(): void {
  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
  if (pendingSpeakTimer) {
    clearTimeout(pendingSpeakTimer);
    pendingSpeakTimer = null;
  }
  if (autoplayCheckTimer) {
    clearTimeout(autoplayCheckTimer);
    autoplayCheckTimer = null;
  }
}

function refreshVoices(): SpeechSynthesisVoice[] {
  if (!hasSpeechSupport()) return [];
  const loaded = window.speechSynthesis.getVoices();
  if (loaded.length > 0) {
    cachedVoices = loaded;
  }
  if (!voicesListenerAttached) {
    voicesListenerAttached = true;
    try {
      window.speechSynthesis.addEventListener?.('voiceschanged', () => {
        const updated = window.speechSynthesis.getVoices();
        if (updated.length > 0) cachedVoices = updated;
      });
    } catch {}
  }
  return loaded.length > 0 ? loaded : cachedVoices;
}

/** Pick calm, deep male English PA voice available on the device */
function selectPaVoice(): { voice: SpeechSynthesisVoice | null; confirmedMale: boolean } {
  const voices = refreshVoices();
  if (!voices.length) return { voice: null, confirmedMale: false };

  const englishVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const pool = englishVoices.length > 0 ? englishVoices : voices;

  const isFemale = (voice: SpeechSynthesisVoice) =>
    FEMALE_VOICE_PATTERNS.some((pattern) => pattern.test(voice.name));

  for (const pattern of MALE_VOICE_PATTERNS) {
    const match = pool.find((v) => pattern.test(v.name) && !isFemale(v));
    if (match) return { voice: match, confirmedMale: true };
  }

  // Fallback to a voice not known to be female, otherwise first English voice with deep pitch shift
  const nonFemale = pool.find((v) => !isFemale(v));
  return { voice: nonFemale ?? pool[0] ?? null, confirmedMale: false };
}

/** Clamp pitch into male vocal range (drops unverified/female browser defaults into baritone register) */
function resolveMalePitch(requestedPitch: number | undefined, confirmedMale: boolean): number {
  const target = requestedPitch ?? DEFAULT_MALE_PITCH;
  const maxPitch = confirmedMale ? 0.85 : 0.72;
  return Math.max(0.55, Math.min(target, maxPitch));
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
    const { voice, confirmedMale } = selectPaVoice();
    const primer = new SpeechSynthesisUtterance('');
    if (voice) primer.voice = voice;
    primer.lang = voice?.lang || 'en-US';
    primer.pitch = resolveMalePitch(DEFAULT_MALE_PITCH, confirmedMale);
    primer.volume = 0;
    window.speechSynthesis.speak(primer);
  } catch {}
}

export function stopPaVoice() {
  clearVoiceTimers();
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
    rate = DEFAULT_MALE_RATE,
    pitch = DEFAULT_MALE_PITCH,
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
  } else {
    clearVoiceTimers();
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

  // Warm voice list early so async engines populate before startDelay ends
  refreshVoices();

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

  pendingSpeakTimer = setTimeout(() => {
    pendingSpeakTimer = null;
    if (useVoiceStore.getState().muted) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      const { voice, confirmedMale } = selectPaVoice();
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang || 'en-US';
      utterance.rate = rate;
      utterance.pitch = resolveMalePitch(pitch, confirmedMale);
      utterance.volume = 1;

      utterance.onstart = () => {
        started = true;
        useVoiceStore.getState().setAutoplayBlocked(false);
      };

      utterance.onend = () => {
        clearVoiceTimers();
        useVoiceStore.getState().setSpeakingState(false, null, tone);
      };

      utterance.onerror = () => {
        if (!started) {
          useVoiceStore.getState().setAutoplayBlocked(true);
          onStartBlocked?.();
        }
        clearVoiceTimers();
        useVoiceStore.getState().setSpeakingState(false, null, tone);
      };

      window.speechSynthesis.speak(utterance);

      // Detect silent autoplay blocks quickly (~900ms) on strict mobile browsers
      if (onStartBlocked) {
        autoplayCheckTimer = setTimeout(() => {
          autoplayCheckTimer = null;
          if (!started && !window.speechSynthesis.speaking && !useVoiceStore.getState().muted) {
            useVoiceStore.getState().setAutoplayBlocked(true);
            onStartBlocked();
          }
        }, 900);
      }
    } catch {
      clearVoiceTimers();
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
      rate: 1.0,
      pitch: 0.84,
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
