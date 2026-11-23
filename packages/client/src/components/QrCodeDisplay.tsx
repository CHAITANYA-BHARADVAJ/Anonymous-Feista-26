import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeSvgWriter } from '@zxing/library';

interface QrCodeDisplayProps {
  url: string;
  size?: number;
  label?: string;
}

export default function QrCodeDisplay({ url, size = 150, label }: QrCodeDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !url) return;
    try {
      const writer = new BrowserQRCodeSvgWriter();
      const svg = writer.write(url, size, size);
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.setAttribute('style', 'display: block; max-width: 100%;');
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(svg);
    } catch (err) {
      console.warn('QR Code generation error:', err);
    }
  }, [url, size]);

  useEffect(() => {
    if (!isExpanded || !modalContainerRef.current || !url) return;
    try {
      const writer = new BrowserQRCodeSvgWriter();
      const svg = writer.write(url, 280, 280);
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      modalContainerRef.current.innerHTML = '';
      modalContainerRef.current.appendChild(svg);
    } catch (err) {
      console.warn('Modal QR generation error:', err);
    }
  }, [isExpanded, url]);

  return (
    <>
      <div className="flex flex-col items-center bg-zinc-900 border border-zinc-800 rounded-2xl p-3 gap-2 shadow-lg w-full max-w-xs mx-auto">
        {/* QR Canvas Container */}
        <div
          onClick={() => setIsExpanded(true)}
          className="bg-white p-2.5 rounded-xl shadow cursor-pointer hover:opacity-95 transition-all flex items-center justify-center w-[150px] h-[150px]"
          title="Tap to enlarge for easier teammate scanning"
        >
          <div ref={containerRef} className="w-full h-full flex items-center justify-center" />
        </div>

        {/* Scan Instruction */}
        <div className="flex flex-col items-center text-center gap-0.5">
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-cyan-400 flex items-center gap-1">
            <span>📱</span> {label ?? "SCAN WITH TEAMMATE'S PHONE"}
          </span>
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="text-[10px] font-mono text-zinc-400 hover:text-white underline transition-colors"
          >
            Tap to Enlarge (Full Scan) ↗
          </button>
        </div>
      </div>

      {/* Enlarged QR Modal for Far Scanning */}
      {isExpanded && (
        <div
          onClick={() => setIsExpanded(false)}
          className="fixed inset-0 z-[1500] bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 flex flex-col items-center gap-4 max-w-sm w-full text-center shadow-2xl relative"
          >
            <button
              onClick={() => setIsExpanded(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center text-sm font-mono transition-colors"
            >
              ✕
            </button>

            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                TEAMMATE INTEL RECON
              </span>
              <h4 className="text-base font-bold text-white mt-0.5">Scan Dossier Link</h4>
              <p className="text-xs text-zinc-400 font-mono mt-1 break-all px-2">
                {url}
              </p>
            </div>

            {/* Giant White QR Canvas */}
            <div className="bg-white p-4 rounded-2xl shadow-2xl w-[280px] h-[280px] flex items-center justify-center">
              <div ref={modalContainerRef} className="w-full h-full flex items-center justify-center" />
            </div>

            <p className="text-[11px] font-mono text-zinc-400">
              Hold teammate's phone camera 1–2 feet away to inspect social media profile.
            </p>

            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="w-full py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-200 font-mono text-xs uppercase tracking-wider font-bold transition-all"
            >
              Close QR View
            </button>
          </div>
        </div>
      )}
    </>
  );
}
