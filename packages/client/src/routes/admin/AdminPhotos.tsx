import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';

export default function AdminPhotos() {
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejecting, setRejecting] = useState<number | null>(null);

  useEffect(() => {
    reload();
    const socket = getSocket();
    socket.on('photo:new_submission', reload);
    return () => { socket.off('photo:new_submission', reload); };
  }, []);

  async function reload() {
    const data = await api.getPhotos();
    setPhotos(data);
  }

  async function approve(id: number) {
    setLoading(id);
    try { await api.reviewPhoto(id, 'approved'); await reload(); }
    finally { setLoading(null); }
  }

  async function reject(id: number) {
    setLoading(id);
    try {
      await api.reviewPhoto(id, 'rejected', rejectNote);
      setRejecting(null);
      setRejectNote('');
      await reload();
    } finally { setLoading(null); }
  }

  return (
    <div className="p-4 flex flex-col gap-4 pb-10">
      <h2 className="text-lg font-bold">Photo Review Queue ({photos.length})</h2>
      {photos.length === 0 && (
        <div className="text-center text-gray-500 py-12">No pending submissions.</div>
      )}
      {photos.map((photo) => (
        <div key={photo.id} className="bg-gray-800 rounded-2xl overflow-hidden">
          <img
            src={`/uploads/${photo.filePath.replace(/\\/g, '/').split('uploads/')[1] ?? photo.filePath}`}
            alt="Submission"
            className="w-full max-h-72 object-cover"
          />
          <div className="p-4">
            <p className="font-semibold">{photo.team?.name}</p>
            <p className="text-xs text-gray-500 mb-4">
              Submitted {new Date(photo.submittedAt).toLocaleString()}
            </p>

            {rejecting === photo.id ? (
              <div className="flex flex-col gap-2">
                <input
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Rejection reason (optional)"
                  className="w-full px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm focus:outline-none"
                />
                <div className="flex gap-2">
                  <button onClick={() => setRejecting(null)} className="flex-1 py-2 rounded-xl bg-gray-700 text-white text-sm min-h-[44px]">
                    Cancel
                  </button>
                  <button onClick={() => reject(photo.id)} disabled={loading === photo.id}
                    className="flex-1 py-2 rounded-xl bg-red-700 text-white text-sm font-semibold min-h-[44px]">
                    {loading === photo.id ? 'Rejecting…' : 'Confirm Reject'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setRejecting(photo.id)}
                  className="flex-1 py-2 rounded-xl bg-gray-700 text-white text-sm font-semibold min-h-[44px]"
                >
                  ✗ Reject
                </button>
                <button
                  onClick={() => approve(photo.id)}
                  disabled={loading === photo.id}
                  className="flex-1 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold min-h-[44px]"
                >
                  {loading === photo.id ? 'Approving…' : '✓ Approve & Declare Winner'}
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
