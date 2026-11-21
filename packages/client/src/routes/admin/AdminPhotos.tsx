import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';

export default function AdminPhotos() {
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedPhoto, setSelectedPhoto] = useState<any | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  useEffect(() => {
    loadPhotos();
    const socket = getSocket();

    socket.on('admin:photo_submitted', () => {
      loadPhotos();
    });

    return () => {
      socket.off('admin:photo_submitted');
    };
  }, []);

  async function loadPhotos() {
    setLoading(true);
    try {
      const data = await api.getAdminPhotos();
      setPhotos(data);
    } catch (err) {
      console.error('Failed to load photos:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(id: number, status: 'approved' | 'rejected', teamId?: number, verifyFinish?: boolean) {
    let note = '';
    if (status === 'rejected') {
      const input = prompt('Reason for rejection (optional):', 'Target person not clearly visible');
      if (input === null) return;
      note = input;
    }

    setActionLoadingId(id);
    try {
      await api.reviewPhoto(id, status, note);
      if (verifyFinish && teamId) {
        await api.verifyTeamFinish(teamId);
        alert('✓ Photo approved & team finish officially verified.');
      }
      await loadPhotos();
    } catch (err: any) {
      alert(err.message ?? 'Failed to review photo');
    } finally {
      setActionLoadingId(null);
    }
  }

  const filteredPhotos = photos.filter((p) => {
    if (statusFilter === 'all') return true;
    return p.status === statusFilter;
  });

  const pendingCount = photos.filter((p) => p.status === 'pending').length;
  const approvedCount = photos.filter((p) => p.status === 'approved').length;
  const rejectedCount = photos.filter((p) => p.status === 'rejected').length;

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-7xl mx-auto pb-24 font-sans text-zinc-100">
      {/* Header Banner */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Photo Verification Desk</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1 font-mono">
            Review incoming verification photos taken by participants on campus.
          </p>
        </div>

        <button
          onClick={loadPhotos}
          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 border border-zinc-700"
        >
          ↻ Refresh Queue
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
        {[
          { id: 'all', label: `All (${photos.length})` },
          { id: 'pending', label: `Pending (${pendingCount})`, count: pendingCount },
          { id: 'approved', label: `Approved (${approvedCount})` },
          { id: 'rejected', label: `Rejected (${rejectedCount})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatusFilter(tab.id as any)}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              statusFilter === tab.id
                ? 'bg-zinc-100 text-zinc-950 font-bold'
                : 'bg-zinc-950 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
            }`}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Photos Grid */}
      {loading ? (
        <div className="py-16 text-center text-zinc-500 font-mono text-xs">LOADING QUEUE…</div>
      ) : filteredPhotos.length === 0 ? (
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-12 text-center text-zinc-500 font-mono text-xs flex flex-col items-center gap-2">
          <span>NO PHOTOS IN THIS QUEUE</span>
          <span className="text-zinc-600">
            {statusFilter === 'pending'
              ? 'All incoming photo submissions have been reviewed.'
              : 'Teams upload verification photos directly from their phone camera.'}
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPhotos.map((photo) => {
            const isPending = photo.status === 'pending';
            const isApproved = photo.status === 'approved';
            const isLoading = actionLoadingId === photo.id;

            return (
              <div
                key={photo.id}
                className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl overflow-hidden flex flex-col justify-between transition-all"
              >
                {/* Photo preview */}
                <div
                  onClick={() => setSelectedPhoto(photo)}
                  className="relative aspect-video bg-black cursor-pointer group overflow-hidden"
                >
                  <img
                    src={photo.filePath}
                    alt={`Photo by ${photo.team?.name}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-mono text-xs">
                    Click to Zoom
                  </div>

                  <div className="absolute top-2 right-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                        isPending
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : isApproved
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {photo.status}
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="p-3.5 flex flex-col gap-2">
                  <div>
                    <h4 className="font-semibold text-white text-sm">{photo.team?.name ?? 'Unknown Team'}</h4>
                    <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                      {new Date(photo.submittedAt).toLocaleTimeString()} • {new Date(photo.submittedAt).toLocaleDateString()}
                    </p>
                    {photo.reviewNote && (
                      <p className="text-xs text-zinc-400 font-mono mt-1 bg-zinc-950 p-1.5 rounded border border-zinc-800">
                        {photo.reviewNote}
                      </p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 pt-2 border-t border-zinc-800/80">
                    {isPending ? (
                      <>
                        <button
                          onClick={() => handleReview(photo.id, 'approved', photo.teamId, false)}
                          disabled={isLoading}
                          className="flex-1 py-1.5 px-3 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleReview(photo.id, 'approved', photo.teamId, true)}
                          disabled={isLoading}
                          className="py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs"
                          title="Approve photo and verify podium finish"
                        >
                          + Finish
                        </button>
                        <button
                          onClick={() => handleReview(photo.id, 'rejected')}
                          disabled={isLoading}
                          className="py-1.5 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono"
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center justify-between w-full text-xs font-mono text-zinc-500">
                        <span>Reviewed</span>
                        <button
                          onClick={() => handleReview(photo.id, isApproved ? 'rejected' : 'approved')}
                          className="text-zinc-400 hover:text-zinc-200 underline"
                        >
                          Change to {isApproved ? 'Reject' : 'Approve'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded Modal */}
      {selectedPhoto && (
        <div
          onClick={() => setSelectedPhoto(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden max-w-2xl w-full flex flex-col"
          >
            <div className="p-3.5 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-white text-sm">{selectedPhoto.team?.name}</h3>
                <p className="text-[11px] text-zinc-400 font-mono">
                  Submitted {new Date(selectedPhoto.submittedAt).toLocaleTimeString()}
                </p>
              </div>
              <button
                onClick={() => setSelectedPhoto(null)}
                className="w-7 h-7 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center font-mono text-xs"
              >
                ✕
              </button>
            </div>

            <div className="bg-black max-h-[65vh] flex items-center justify-center p-2">
              <img
                src={selectedPhoto.filePath}
                alt="Full preview"
                className="max-h-[60vh] w-auto object-contain rounded"
              />
            </div>

            <div className="p-3.5 border-t border-zinc-800 flex items-center justify-between">
              <span className="text-xs font-mono text-zinc-400">Status: {selectedPhoto.status}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    handleReview(selectedPhoto.id, 'approved');
                    setSelectedPhoto(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs"
                >
                  Approve Photo
                </button>
                <button
                  onClick={() => {
                    handleReview(selectedPhoto.id, 'rejected');
                    setSelectedPhoto(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
                >
                  Reject Photo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
