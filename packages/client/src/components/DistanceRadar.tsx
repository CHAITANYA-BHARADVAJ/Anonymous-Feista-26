import React from 'react';
import { CompassArrowIcon, UnlockIcon, SignalIcon } from './Icons';

interface DistanceRadarProps {
  distanceMeters: number | null;
  triggerRadius: number;
  locationReached: boolean;
  bearing?: number | null;
  accuracy?: number | null;
  onTriggerCheckIn?: () => void;
  isLoading?: boolean;
}

export default function DistanceRadar({
  distanceMeters,
  triggerRadius,
  locationReached,
  bearing,
  accuracy,
  onTriggerCheckIn,
  isLoading,
}: DistanceRadarProps) {
  if (locationReached) {
    return (
      <div className="flex items-center justify-between py-1 px-1">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono text-sm font-black">
            ✓
          </div>
          <div>
            <p className="font-semibold text-xs tracking-tight text-white uppercase font-mono">Location Discovered</p>
            <p className="text-[11px] text-emerald-400/90 font-medium">Clue intelligence decrypted</p>
          </div>
        </div>
        <span className="text-[10px] font-mono tracking-wider uppercase bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-3 py-1 rounded-lg">
          Target Cleared
        </span>
      </div>
    );
  }

  if (distanceMeters === null) {
    return (
      <div className="flex items-center justify-center gap-3 py-2 text-xs text-gray-400 font-mono">
        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
        <span className="tracking-wider uppercase text-[11px]">Acquiring Target Geofence…</span>
      </div>
    );
  }

  const isBurning = distanceMeters <= triggerRadius + 5;
  const isHot = !isBurning && distanceMeters <= 50;
  const isWarm = !isBurning && !isHot && distanceMeters <= 120;

  // Discrete precision steps: 10 segments
  const activeSegments = isBurning
    ? 10
    : isHot
    ? 7
    : isWarm
    ? 4
    : Math.max(1, Math.min(3, Math.round((1 - distanceMeters / 250) * 10)));

  const statusColor = isBurning
    ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
    : isHot
    ? 'text-amber-400 border-amber-500/40 bg-amber-500/10'
    : isWarm
    ? 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10'
    : 'text-gray-400 border-white/10 bg-white/5';

  const statusText = isBurning
    ? 'IN TARGET RANGE'
    : isHot
    ? 'SIGNAL HOT — VERY CLOSE'
    : isWarm
    ? 'APPROACHING SECTOR'
    : 'EXPLORING CAMPUS';

  return (
    <div className="flex flex-col gap-3 font-sans">
      {/* Top Telemetry Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SignalIcon className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400">
            RADAR TELEMETRY {accuracy ? `(±${Math.round(accuracy)}m)` : ''}
          </span>
        </div>

        <span className={`text-[10px] font-mono tracking-wider uppercase px-2.5 py-0.5 rounded-md border font-semibold ${statusColor}`}>
          {statusText}
        </span>
      </div>

      {/* Main Distance Readout & Directional Azimuth */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-black font-mono tracking-tighter text-white tabular-nums">
            {Math.round(distanceMeters)}
          </span>
          <span className="text-xs font-mono uppercase tracking-wider text-gray-400">METERS</span>
        </div>

        <div className="flex items-center gap-3">
          {bearing != null && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-950/80 border border-white/10" title="Compass Bearing to Target">
              <CompassArrowIcon className="w-5 h-5 text-cyan-400" angle={bearing} />
              <span className="text-xs font-mono text-gray-300 tabular-nums">{Math.round(bearing)}°</span>
            </div>
          )}

          {isBurning && onTriggerCheckIn && (
            <button
              onClick={onTriggerCheckIn}
              disabled={isLoading}
              className="px-4 py-2 bg-emerald-400 hover:bg-emerald-300 active:scale-95 text-gray-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-400/25 transition-all flex items-center gap-1.5 min-h-[40px]"
            >
              <UnlockIcon className="w-4 h-4" />
              <span>{isLoading ? 'Decrypting…' : 'Unlock Intel'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Segmented Signal Strength Meter */}
      <div className="grid grid-cols-10 gap-1.5 pt-1">
        {Array.from({ length: 10 }).map((_, idx) => {
          const filled = idx < activeSegments;
          const segmentColor = isBurning
            ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
            : isHot
            ? 'bg-amber-400'
            : isWarm
            ? 'bg-cyan-400'
            : 'bg-gray-400';

          return (
            <div
              key={idx}
              className={`h-1.5 rounded-sm transition-all duration-300 ${
                filled ? segmentColor : 'bg-white/10'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}
