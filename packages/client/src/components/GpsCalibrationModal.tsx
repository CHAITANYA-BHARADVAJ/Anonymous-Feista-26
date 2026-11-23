import { useState } from 'react';
import { triggerHaptic } from '../lib/sound';

interface GpsCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  pos: GeolocationCoordinates | null;
  refreshLocation: () => void;
}

export default function GpsCalibrationModal({
  isOpen,
  onClose,
  pos,
  refreshLocation,
}: GpsCalibrationModalProps) {
  const [recalibrating, setRecalibrating] = useState(false);
  const [lastCalibrationTime, setLastCalibrationTime] = useState<string | null>(null);

  if (!isOpen) return null;

  const accuracy = pos ? Math.round(pos.accuracy) : null;
  const isExcellent = accuracy != null && accuracy <= 10;
  const isFair = accuracy != null && accuracy > 10 && accuracy <= 25;
  const isPoor = accuracy == null || accuracy > 25;

  const accuracyRating = isExcellent ? 'EXCELLENT' : isFair ? 'FAIR / ACCEPTABLE' : 'POOR';
  const accuracyColor = isExcellent
    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
    : isFair
    ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
    : 'text-rose-400 border-rose-500/30 bg-rose-500/10';

  const accuracyBarWidth = accuracy != null ? Math.max(5, Math.min(100, (30 / accuracy) * 100)) : 10;

  async function handleForceRecalibrate() {
    setRecalibrating(true);
    triggerHaptic([50, 50, 50]);

    try {
      refreshLocation();
      await new Promise((r) => setTimeout(r, 1200));
      setLastCalibrationTime(new Date().toLocaleTimeString());
      triggerHaptic([80, 50, 120]);
    } finally {
      setRecalibrating(false);
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1600] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 flex flex-col gap-5 max-w-sm w-full shadow-2xl relative select-none font-sans"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-950/80 border border-cyan-400/40 flex items-center justify-center text-sm text-cyan-300">
              🛰️
            </div>
            <div>
              <span className="text-[9px] font-mono uppercase tracking-widest text-cyan-400 font-bold block">
                FIELD INSTRUMENT DIAGNOSTIC
              </span>
              <h3 className="text-base font-black text-white">GPS Sensor Calibration</h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center text-xs font-mono transition-colors"
          >
            ✕
          </button>
        </div>

        {/* 1. Live Precision Status Card */}
        <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-400 font-bold uppercase tracking-wider">Positioning Precision:</span>
            <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] border ${accuracyColor}`}>
              {accuracyRating} (±{accuracy ?? '?'}m)
            </span>
          </div>

          {/* Visual Accuracy Bar */}
          <div className="w-full h-2 rounded-full bg-zinc-950 overflow-hidden border border-zinc-800">
            <div
              className={`h-full transition-all duration-500 ${
                isExcellent ? 'bg-emerald-400' : isFair ? 'bg-amber-400' : 'bg-rose-400'
              }`}
              style={{ width: `${accuracyBarWidth}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
            <span>Target: &lt; 20m perimeter</span>
            <span>{pos ? '🟢 Satellite Fix Active' : '🟡 Searching Constellation…'}</span>
          </div>
        </div>

        {/* 2. Live Coordinates Readout */}
        <div className="grid grid-cols-2 gap-2 text-left font-mono">
          <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-2.5">
            <span className="text-[9px] text-zinc-500 uppercase block">Latitude</span>
            <span className="text-xs text-white font-bold truncate block">
              {pos ? pos.latitude.toFixed(6) : '—'}
            </span>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-2.5">
            <span className="text-[9px] text-zinc-500 uppercase block">Longitude</span>
            <span className="text-xs text-white font-bold truncate block">
              {pos ? pos.longitude.toFixed(6) : '—'}
            </span>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-2.5">
            <span className="text-[9px] text-zinc-500 uppercase block">Heading</span>
            <span className="text-xs text-white font-bold block">
              {pos?.heading != null && !isNaN(pos.heading) ? `${Math.round(pos.heading)}°` : 'Compass Mode'}
            </span>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-2.5">
            <span className="text-[9px] text-zinc-500 uppercase block">Altitude / Speed</span>
            <span className="text-xs text-white font-bold block">
              {pos?.altitude ? `${Math.round(pos.altitude)}m` : 'Ground'}
            </span>
          </div>
        </div>

        {/* 3. Compass Figure-8 Reset Guide */}
        <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/40 border border-cyan-400/20 flex items-center justify-center text-xl shrink-0 font-mono text-cyan-400">
            ♾️
          </div>
          <div className="text-left">
            <span className="text-[10px] font-mono font-bold text-white uppercase block">
              Compass Sensor Recalibration
            </span>
            <p className="text-[11px] text-zinc-400 leading-tight mt-0.5 font-sans">
              Wave your phone in an <strong>Infinity (∞) pattern</strong> in the air for 5 seconds to clear magnetic interference from buildings.
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={recalibrating}
            onClick={handleForceRecalibrate}
            className="w-full py-3 px-4 bg-cyan-500 hover:bg-cyan-400 active:scale-95 text-zinc-950 font-black text-xs font-mono uppercase tracking-widest rounded-xl shadow-xl transition-all flex items-center justify-center gap-2"
          >
            {recalibrating ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                <span>PULLING HIGH-ACCURACY FIX…</span>
              </>
            ) : (
              <>
                <span>🎯</span>
                <span>FORCE SENSOR RECALIBRATION</span>
              </>
            )}
          </button>

          {lastCalibrationTime && (
            <span className="text-[10px] font-mono text-emerald-400 text-center">
              ✓ Calibrated at {lastCalibrationTime}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
