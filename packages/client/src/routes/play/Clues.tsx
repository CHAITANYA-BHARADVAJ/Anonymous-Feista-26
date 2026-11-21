import { useState, useMemo } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { api } from '../../lib/api';
import { useNavigate } from 'react-router-dom';
import DistanceRadar from '../../components/DistanceRadar';
import { computeDistanceMeters, computeBearingDegrees } from '../../lib/geo';
import ClueDropModal from '../../components/ClueDropModal';
import { useLocation } from '../../hooks/useLocation';
import { playClueUnlockedSound, triggerHaptic } from '../../lib/sound';
import { LockIcon, UnlockIcon, RadarIcon, ChevronRightIcon } from '../../components/Icons';

export default function Clues() {
  const currentLevel = useGameStore((s) => s.currentLevel)();
  const setProgress = useGameStore((s) => s.setProgress);
  const { pos } = useLocation();

  const [answer, setAnswer] = useState('');
  const [answerError, setAnswerError] = useState('');
  const [answerLoading, setAnswerLoading] = useState(false);
  const [revealedHints, setRevealedHints] = useState<Record<number, string>>({});
  const [hintLoading, setHintLoading] = useState<number | null>(null);
  const [showClueModal, setShowClueModal] = useState(false);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUploaded, setPhotoUploaded] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const navigate = useNavigate();

  const level = currentLevel?.level;
  const isCompleted = !!currentLevel?.completedAt;
  const revealedHintIds = useMemo(
    () => new Set(currentLevel?.hintReveals.map((r) => r.hintId) ?? []),
    [currentLevel?.hintReveals],
  );

  const hasGpsTarget = Boolean(level && level.targetLat != null && level.targetLng != null);
  const locationReached = !hasGpsTarget || Boolean(currentLevel?.locationReachedAt);
  const triggerRadius = level?.triggerRadiusMeters ?? 25;

  const distanceMeters = useMemo(() => {
    if (!pos || !level || level.targetLat == null || level.targetLng == null) return null;
    return computeDistanceMeters(pos.latitude, pos.longitude, level.targetLat, level.targetLng);
  }, [pos?.latitude, pos?.longitude, level?.targetLat, level?.targetLng]);

  const bearingDegrees = useMemo(() => {
    if (!pos || !level || level.targetLat == null || level.targetLng == null) return null;
    return computeBearingDegrees(pos.latitude, pos.longitude, level.targetLat, level.targetLng);
  }, [pos?.latitude, pos?.longitude, level?.targetLat, level?.targetLng]);

  async function handleCheckIn() {
    if (!currentLevel || !level || !pos || checkInLoading) return;
    setCheckInLoading(true);
    try {
      await api.reachLocation(level.id, pos.latitude, pos.longitude);
      playClueUnlockedSound();
      triggerHaptic();
      const data = await api.getParticipantGame();
      setProgress(data.progress);
      setShowClueModal(true);
    } catch (err: any) {
      alert(err.message ?? 'Proximity verification failed. Move closer to the target!');
    } finally {
      setCheckInLoading(false);
    }
  }

  if (!currentLevel || !level) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-20 text-center font-sans">
        <p className="text-gray-500 text-xs font-mono">NO ACTIVE INTELLIGENCE OBJECTIVE FOUND.</p>
      </div>
    );
  }

  async function submitAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!currentLevel || !level) return;
    setAnswerError('');
    setAnswerLoading(true);
    try {
      const res = await api.submitAnswer(level.id, answer.trim());
      if (res.correct) {
        const data = await api.getParticipantGame();
        setProgress(data.progress);
        if (res.nextLevelId) navigate('../home');
      }
    } catch (err: any) {
      setAnswerError(err.message ?? 'Verification rejected: incorrect solution');
      if ('vibrate' in navigator) navigator.vibrate(200);
    } finally {
      setAnswerLoading(false);
    }
  }

  async function useHint(hint: { id: number; orderIndex: number; penaltyMins: number }) {
    if (!currentLevel || !level || revealedHintIds.has(hint.id)) return;
    const freeHint = currentLevel.hintsUsed < (currentLevel.hintReveals.length - revealedHintIds.size + 1);
    const penalty = freeHint ? 0 : hint.penaltyMins;
    const msg =
      penalty > 0
        ? `REVEAL HINT #${hint.orderIndex}?\nIncurs a +${penalty} minute penalty to official team finish time.`
        : `REVEAL HINT #${hint.orderIndex}?`;
    if (!confirm(msg)) return;

    setHintLoading(hint.orderIndex);
    try {
      const res = await api.revealHint(level.id, hint.orderIndex);
      setRevealedHints((prev) => ({ ...prev, [hint.id]: res.text }));
      const data = await api.getParticipantGame();
      setProgress(data.progress);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setHintLoading(null);
    }
  }

  return (
    <div className="flex flex-col px-5 py-6 gap-5 pb-24 font-sans max-w-md mx-auto">
      {/* Dossier Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
            FIELD DOSSIER // STAGE 0{level.orderIndex}
          </span>
          <h1 className="text-xl font-black tracking-tight text-white mt-0.5">{level.title}</h1>
        </div>

        {locationReached ? (
          <span className="text-[10px] font-mono tracking-wider uppercase bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2.5 py-1 rounded-md font-bold">
            DECRYPTED
          </span>
        ) : (
          <span className="text-[10px] font-mono tracking-wider uppercase bg-amber-500/10 border border-amber-500/30 text-amber-300 px-2.5 py-1 rounded-md font-bold">
            LOCKED
          </span>
        )}
      </div>

      {/* Embedded Tactical Telemetry */}
      {hasGpsTarget && (
        <div className="bg-[#0c0e14] border border-white/[0.08] rounded-2xl p-4 shadow-xl">
          <DistanceRadar
            distanceMeters={distanceMeters}
            triggerRadius={triggerRadius}
            locationReached={locationReached}
            bearing={bearingDegrees}
            accuracy={pos?.accuracy}
            onTriggerCheckIn={handleCheckIn}
            isLoading={checkInLoading}
          />
        </div>
      )}

      {/* Clue Intel Body */}
      {locationReached ? (
        <div className="bg-[#0c0e14] border border-white/[0.08] rounded-3xl p-6 flex flex-col gap-3 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-bold">
              CLASSIFIED INTEL BRIEFING
            </span>
            <span className="text-[9px] font-mono text-gray-500 uppercase tracking-widest">
              RESTRICTED
            </span>
          </div>

          <p className="text-sm text-gray-100 font-normal leading-relaxed pt-1">
            {level.clueText}
          </p>
        </div>
      ) : (
        <div className="bg-[#0c0e14] border border-white/[0.08] rounded-3xl p-6 text-center flex flex-col items-center gap-3 shadow-xl">
          <div className="w-10 h-10 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-amber-400">
            <LockIcon className="w-5 h-5" />
          </div>

          <div>
            <h3 className="font-bold text-white text-sm uppercase tracking-wider font-mono">
              PHYSICAL GEOFENCE ENCRYPTION ACTIVE
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed mt-1 max-w-xs">
              This intelligence requires physical proximity verification. Navigate within {triggerRadius}m of the target landmark to decrypt.
            </p>
          </div>

          <button
            onClick={() => navigate('../map')}
            className="py-2.5 px-5 bg-cyan-400 hover:bg-cyan-300 active:scale-95 text-gray-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-cyan-400/20 transition-all flex items-center gap-2 mt-1 min-h-[42px]"
          >
            <RadarIcon className="w-4 h-4" />
            <span>Open Field Radar</span>
          </button>
        </div>
      )}

      {/* Location Guidance */}
      <div className="bg-[#0c0e14] border border-white/[0.08] rounded-2xl p-4 flex flex-col gap-1">
        <span className="text-[9px] font-mono uppercase tracking-widest text-gray-400 font-bold">
          CAMPUS NAVIGATION INTEL
        </span>
        <p className="text-xs text-gray-200 font-medium leading-relaxed">
          {level.locationHint}
        </p>
      </div>

      {/* External Intel Links */}
      {level.socialLinks.length > 0 && locationReached && (
        <div className="bg-[#0c0e14] border border-white/[0.08] rounded-2xl p-4 flex flex-col gap-2">
          <span className="text-[9px] font-mono uppercase tracking-widest text-gray-400 font-bold">
            EXTERNAL DOSSIER LINKS
          </span>
          <div className="flex flex-wrap gap-2">
            {level.socialLinks.map((sl, i) => (
              <a
                key={i}
                href={sl.url}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-cyan-300 text-xs font-mono uppercase hover:border-white/25 transition-all flex items-center gap-1.5"
              >
                <span>{sl.platform}</span>
                <span className="text-[10px]">↗</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Tactical Hints */}
      {!isCompleted && level.hints.length > 0 && locationReached && (
        <div className="bg-[#0c0e14] border border-white/[0.08] rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
            <span className="text-[9px] font-mono uppercase tracking-widest text-gray-400 font-bold">
              TACTICAL ASSISTANCE DECRYPTS
            </span>
            <span className="text-[10px] font-mono text-amber-400 font-bold">
              {currentLevel.hintsUsed}/3 USED
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {level.hints.map((hint) => {
              const revealed = revealedHintIds.has(hint.id) || revealedHints[hint.id];
              const text = revealedHints[hint.id];

              return (
                <div
                  key={hint.id}
                  className="bg-[#07080b] rounded-xl p-3 border border-white/[0.06]"
                >
                  {revealed && text ? (
                    <p className="text-xs text-amber-300 font-mono leading-relaxed">{text}</p>
                  ) : revealed ? (
                    <p className="text-xs text-gray-400 font-mono italic">Hint decrypted.</p>
                  ) : (
                    <button
                      onClick={() => useHint(hint)}
                      disabled={hintLoading === hint.orderIndex || currentLevel.hintsUsed >= 3}
                      className="w-full text-left text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center justify-between min-h-[36px]"
                    >
                      <span className="font-mono text-xs">REVEAL INTEL #{hint.orderIndex}</span>
                      <span className="text-[10px] font-mono bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-md text-amber-300">
                        +{hint.penaltyMins}M PENALTY
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Finale Objective Box OR Secret Decoder Form */}
      {level.isFinal ? (
        <div className="bg-[#0c0e14] border-2 border-emerald-500/40 rounded-3xl p-6 text-center flex flex-col gap-3 shadow-2xl relative overflow-hidden">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto font-mono font-bold text-sm">
            🏁
          </div>

          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-wider font-mono">
              GRAND FINALE OBJECTIVE
            </h3>
            <p className="text-xs text-gray-300 leading-relaxed mt-2 max-w-xs mx-auto">
              1. Intercept target operative at Amphitheatre.<br />
              2. Capture live photo together on your camera.<br />
              3. Sprint to <strong>Start Venue</strong> and present proof to coordinators!
            </p>
          </div>

          {/* Live Photo Upload Option */}
          <div className="pt-2 flex flex-col items-center gap-2">
            <label className="cursor-pointer py-3 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-mono font-bold text-xs shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2">
              <span>📷</span>
              <span>{photoUploading ? 'UPLOADING TO COMMAND DESK…' : photoUploaded ? '✓ PHOTO TRANSMITTED (TAP TO RE-TAKE)' : 'SNAP & TRANSMIT PHOTO'}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={photoUploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setPhotoError('');
                  setPhotoUploading(true);
                  try {
                    const fd = new FormData();
                    fd.append('photo', file);
                    await api.uploadPhoto(fd);
                    setPhotoUploaded(true);
                    triggerHaptic();
                  } catch (err: any) {
                    setPhotoError(err.message ?? 'Photo upload failed');
                  } finally {
                    setPhotoUploading(false);
                  }
                }}
              />
            </label>
            {photoError && (
              <p className="text-red-400 text-xs font-mono">{photoError}</p>
            )}
            {photoUploaded && (
              <p className="text-emerald-400 text-[11px] font-mono">
                ✓ Photo delivered to Event Control Queue! Sprint to Start Venue!
              </p>
            )}
          </div>

          <div className="p-3 bg-black/60 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-300 font-mono font-bold">
            COORDINATORS WILL CONFIRM PHOTO IN ADMIN OPERATIONS TO REGISTER OFFICIAL WINNER PODIUM.
          </div>
        </div>
      ) : !isCompleted ? (
        <form onSubmit={submitAnswer} className="flex flex-col gap-2 pt-1">
          <div className="relative">
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="ENTER DECODED SOLUTION…"
              className="w-full px-4 py-3.5 rounded-xl bg-[#0c0e14] border border-white/10 text-white placeholder-gray-600 font-mono text-sm tracking-wider uppercase focus:outline-none focus:border-cyan-400 transition-all"
            />
          </div>

          {answerError && (
            <p className="text-red-400 text-xs font-mono font-semibold px-1">{answerError}</p>
          )}

          <button
            type="submit"
            disabled={answerLoading || !answer.trim()}
            className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-gray-200 active:scale-95 text-gray-950 font-black text-xs uppercase tracking-widest shadow-xl transition-all min-h-[48px]"
          >
            {answerLoading ? 'TRANSMITTING SOLUTION…' : 'TRANSMIT DECODED SOLUTION →'}
          </button>
        </form>
      ) : (
        <div className="text-center text-emerald-300 text-xs font-mono font-bold py-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
          ✓ OBJECTIVE ACCOMPLISHED. ADVANCE TO NEXT STAGE.
        </div>
      )}

      {/* Clue Drop Modal */}
      {showClueModal && (
        <ClueDropModal
          levelTitle={level.title}
          orderIndex={level.orderIndex}
          clueText={level.clueText}
          locationHint={level.locationHint}
          onClose={() => setShowClueModal(false)}
        />
      )}
    </div>
  );
}
