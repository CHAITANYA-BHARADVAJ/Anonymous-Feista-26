import React from 'react';
import { UnlockIcon } from './Icons';

interface ClueDropModalProps {
  levelTitle: string;
  orderIndex: number;
  clueText: string;
  locationHint?: string;
  onClose: () => void;
}

export default function ClueDropModal({
  levelTitle,
  orderIndex,
  clueText,
  locationHint,
  onClose,
}: ClueDropModalProps) {
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-2xl animate-fade-in font-sans">
      <div className="bg-[#0c0e14] border border-white/[0.12] rounded-3xl p-6 max-w-sm w-full shadow-2xl relative overflow-hidden flex flex-col gap-4">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff08_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 relative z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <UnlockIcon className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold">
                STAGE 0{orderIndex} VERIFIED
              </span>
              <p className="text-xs text-white font-bold">{levelTitle}</p>
            </div>
          </div>

          <span className="text-[9px] font-mono tracking-wider uppercase bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded font-bold">
            DECRYPTED
          </span>
        </div>

        <div className="bg-[#07080b] rounded-2xl p-4 border border-white/[0.08] relative z-10 flex flex-col gap-3 max-h-60 overflow-y-auto">
          <div>
            <span className="text-[9px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
              CLASSIFIED CLUE INTEL
            </span>
            <p className="text-sm text-gray-100 leading-relaxed font-normal mt-1">
              {clueText}
            </p>
          </div>

          {locationHint && (
            <div className="pt-2.5 border-t border-white/[0.06]">
              <span className="text-[9px] font-mono uppercase tracking-widest text-amber-400 font-bold">
                CAMPUS NAVIGATION GUIDANCE
              </span>
              <p className="text-xs text-gray-300 font-medium mt-0.5">{locationHint}</p>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full py-3.5 px-4 bg-white hover:bg-gray-200 active:scale-95 text-gray-950 font-black text-xs uppercase tracking-widest rounded-xl shadow-xl transition-all relative z-10 min-h-[46px]"
        >
          Engage Objective →
        </button>
      </div>
    </div>
  );
}
