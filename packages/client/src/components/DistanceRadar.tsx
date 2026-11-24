import React, { useRef, useState, useMemo } from 'react';
import { CheckIcon, RefreshIcon, SignalIcon, UnlockIcon } from './Icons';
import {
  useCompassHeading,
  getCardinalDirection,
  unwrapAngle,
  getRelativeDirectionLabel,
} from '../hooks/useCompassHeading';

interface DistanceRadarProps {
  distanceMeters: number | null;
  triggerRadius: number;
  locationReached: boolean;
  bearing?: number | null; // Azimuth from player to target (0-360 deg relative to True North)
  accuracy?: number | null;
  gpsHeading?: number | null;
  onTriggerCheckIn?: () => void;
  isLoading?: boolean;
}

export default function DistanceRadar({
  distanceMeters,
  triggerRadius,
  locationReached,
  bearing,
  accuracy,
  gpsHeading,
  onTriggerCheckIn,
  isLoading,
}: DistanceRadarProps) {
  const dialRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const unwrappedArrowAngleRef = useRef(0);

  const {
    heading,
    rawSensorHeading,
    manualOffset,
    requestPermission,
    setManualOffset,
    resetToSensor,
  } = useCompassHeading(gpsHeading);

  // Calculate relative angle to target (where arrow points relative to top of device)
  const rawArrowAngle = useMemo(() => {
    if (bearing == null) return 0;
    return (bearing - heading + 360) % 360;
  }, [bearing, heading]);

  // Smooth continuous unwrapped angle to prevent 359->0 snap
  const smoothArrowAngle = useMemo(() => {
    const next = unwrapAngle(unwrappedArrowAngleRef.current, rawArrowAngle);
    unwrappedArrowAngleRef.current = next;
    return next;
  }, [rawArrowAngle]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    requestPermission().catch(() => {});
    updateHeadingFromPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging && e.buttons === 0) return;
    updateHeadingFromPointer(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    setIsDragging(false);
  };

  const updateHeadingFromPointer = (clientX: number, clientY: number) => {
    if (!dialRef.current) return;
    const rect = dialRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const pointerDeg = (Math.atan2(dy, dx) * (180 / Math.PI) + 90 + 360) % 360;
    const base = rawSensorHeading ?? (gpsHeading && gpsHeading >= 0 ? gpsHeading : 0);
    const newOffset = (pointerDeg - base + 360) % 360;
    setManualOffset(newOffset);
  };

  if (locationReached) {
    return (
      <div className="flex items-center justify-between py-0.5 px-0.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-400 shadow-inner">
            <CheckIcon className="w-4 h-4" />
          </div>
          <div>
            <p className="font-bold text-xs tracking-tight text-white uppercase font-mono">
              Target Landmarked
            </p>
            <p className="text-[11px] text-emerald-400/90 font-medium">Clue intelligence decrypted</p>
          </div>
        </div>
        <span className="text-[10px] font-mono tracking-wider uppercase bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-3 py-1 rounded-lg font-bold">
          Cleared
        </span>
      </div>
    );
  }

  if (distanceMeters === null) {
    return (
      <div className="flex items-center justify-center gap-3 py-2 text-xs text-zinc-400 font-mono">
        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
        <span className="tracking-wider uppercase text-[11px]">Acquiring Target Geofence…</span>
      </div>
    );
  }

  const isBurning = distanceMeters <= triggerRadius + 5;
  const isHot = !isBurning && distanceMeters <= 50;
  const isWarm = !isBurning && !isHot && distanceMeters <= 120;

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
    : 'text-zinc-400 border-white/10 bg-white/5';

  const statusText = isBurning
    ? 'IN TARGET RANGE'
    : isHot
    ? 'SIGNAL HOT — CLOSE'
    : isWarm
    ? 'APPROACHING SECTOR'
    : 'EXPLORING CAMPUS';

  const relativeGuidance = bearing != null ? getRelativeDirectionLabel(rawArrowAngle) : null;
  const cardinalText = bearing != null ? getCardinalDirection(bearing) : '';

  return (
    <div className="flex flex-col gap-2.5 font-sans">
      {/* Top Telemetry Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <SignalIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 truncate">
            RADAR {accuracy ? `(±${Math.round(accuracy)}m)` : ''}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {manualOffset !== 0 && (
            <button
              onClick={resetToSensor}
              className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-cyan-300 border border-cyan-500/30 transition-all flex items-center gap-1"
              title="Reset manual calibration to hardware sensor"
            >
              <RefreshIcon className="w-2.5 h-2.5" />
              <span>Reset</span>
            </button>
          )}

          <span
            className={`text-[9px] sm:text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded-md border font-semibold ${statusColor}`}
          >
            {statusText}
          </span>
        </div>
      </div>

      {/* Main Distance Readout & Interactive Moving Compass Arrow */}
      <div className="flex items-center justify-between gap-3">
        {/* Distance metrics */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl sm:text-4xl font-black font-mono tracking-tighter text-white tabular-nums">
              {Math.round(distanceMeters)}
            </span>
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">M</span>
          </div>
          {relativeGuidance && (
            <span className="text-[11px] font-mono text-cyan-300 font-bold uppercase tracking-wider mt-0.5 truncate">
              {relativeGuidance}
            </span>
          )}
        </div>

        {/* Dynamic & Movable Interactive Compass Widget */}
        <div className="flex items-center gap-2.5 shrink-0">
          {bearing != null && (
            <div
              ref={dialRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className={`relative w-16 h-16 rounded-full bg-[#07080b]/95 border-2 ${
                isDragging
                  ? 'border-cyan-400 shadow-lg shadow-cyan-400/20 scale-105'
                  : 'border-zinc-800 hover:border-zinc-700'
              } flex items-center justify-center cursor-grab active:cursor-grabbing select-none transition-transform touch-none shadow-xl`}
              title="Interactive Compass: Auto-rotates with device heading. Drag dial to manually align."
            >
              {/* Subtle concentric radar reticle */}
              <div className="absolute inset-2 rounded-full border border-white/[0.06] pointer-events-none" />
              <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgba(34,211,238,0.12)_55deg,transparent_60deg)] animate-radar-sweep pointer-events-none" />

              {/* Outer Cardinal Ring Indicators */}
              <span className="absolute top-1 text-[8px] font-mono font-black text-rose-500 leading-none">
                N
              </span>
              <span className="absolute right-1 text-[7px] font-mono text-zinc-500 leading-none">
                E
              </span>
              <span className="absolute bottom-1 text-[7px] font-mono text-zinc-500 leading-none">
                S
              </span>
              <span className="absolute left-1 text-[7px] font-mono text-zinc-500 leading-none">
                W
              </span>

              {/* Central Dynamic Direction Arrow */}
              <div
                className="relative z-10 flex items-center justify-center"
                style={{
                  transform: `rotate(${smoothArrowAngle}deg)`,
                  transition: isDragging
                    ? 'none'
                    : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                <svg
                  className="w-7 h-7 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon
                    points="12 2 19 21 12 17 5 21 12 2"
                    fill="currentColor"
                    fillOpacity="0.3"
                  />
                </svg>
              </div>

              {/* Bearing readout badge */}
              <div className="absolute -bottom-2 bg-zinc-900 border border-zinc-700 px-1.5 py-0.2 rounded text-[8px] font-mono text-zinc-200 font-bold tracking-tight z-20 tabular-nums">
                {Math.round(bearing)}° {cardinalText}
              </div>
            </div>
          )}

          {/* Unlock Intel Button when within trigger radius */}
          {isBurning && onTriggerCheckIn && (
            <button
              onClick={onTriggerCheckIn}
              disabled={isLoading}
              className="px-3.5 py-2.5 bg-emerald-400 hover:bg-emerald-300 active:scale-95 text-zinc-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-400/25 transition-all flex items-center gap-1.5 min-h-[44px]"
            >
              <UnlockIcon className="w-4 h-4" />
              <span>{isLoading ? 'Decrypting…' : 'Unlock'}</span>
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
            ? 'bg-amber-400 shadow-sm shadow-amber-400/50'
            : isWarm
            ? 'bg-cyan-400'
            : 'bg-zinc-400';

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
