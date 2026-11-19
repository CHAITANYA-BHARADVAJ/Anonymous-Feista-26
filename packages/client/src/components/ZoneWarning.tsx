import { useEffect, useState } from 'react';
import { getSocket } from '../lib/socket';

export default function ZoneWarning() {
  const [warning, setWarning] = useState<{ label: string | null; penaltyMins: number } | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socket.on('zone:entered', (data: { label: string | null; penaltyMins: number }) => {
      setWarning(data);
      if ('vibrate' in navigator) navigator.vibrate([300, 100, 300, 100, 300]);
      setTimeout(() => setWarning(null), 6000);
    });
    return () => { socket.off('zone:entered'); };
  }, []);

  if (!warning) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-900/80 p-6">
      <div className="bg-red-700 rounded-2xl p-8 max-w-sm text-center shadow-2xl">
        <div className="text-6xl mb-4">🚫</div>
        <h2 className="text-2xl font-bold mb-2">Restricted Zone!</h2>
        <p className="text-lg mb-4">
          {warning.label ? `You entered: ${warning.label}` : 'You entered a restricted area.'}
        </p>
        <p className="text-red-200 font-semibold">+{warning.penaltyMins} minute penalty applied</p>
        <button
          onClick={() => setWarning(null)}
          className="mt-6 w-full py-3 rounded-xl bg-white text-red-800 font-bold text-base min-h-[44px]"
        >
          Got it, leaving now
        </button>
      </div>
    </div>
  );
}
