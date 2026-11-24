import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';

const REJECTION_PRESETS = [
  'Target landmark not clearly identifiable',
  'Operative squad faces obscured or missing',
  'Incorrect campus sector or wrong angle',
  'Low lighting or blurry image quality',
];

export default function AdminPhotos() {
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedPhoto, setSelectedPhoto] = useState<any | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  // Rejection Dialog Modal
  const [rejectDialogPhoto, setRejectDialogPhoto] = useState<any | null>(null);
  const [customRejectReason, setCustomRejectReason] = useState(REJECTION_PRESETS[0]);

  // Toast feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warn' } | null>(null);

  function showToast(message: string, type: 'success' | 'warn' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

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

  async function handleApprove(id: number, teamId?: number, verifyFinish?: boolean) {
    setActionLoadingId(id);
    try {
      await api.reviewPhoto(id, 'approved', '');
      if (verifyFinish && teamId) {
        await api.verifyTeamFinish(teamId);
        showToast('Photo approved & team finish officially verified.', 'success');
      } else {
        showToast('Photo approved successfully.', 'success');
      }
      await loadPhotos();
      if (selectedPhoto?.id === id) setSelectedPhoto(null);
    } catch (err: any) {
      showToast(err.message ?? 'Failed to approve photo', 'warn');
    } finally {
      setActionLoadingId(null);
    }
  }

  function openRejectDialog(photo: any) {
    setRejectDialogPhoto(photo);
    setCustomRejectReason(REJECTION_PRESETS[0]);
  }

  async function handleConfirmReject() {
    if (!rejectDialogPhoto) return;
    const photoId = rejectDialogPhoto.id;
    setActionLoadingId(photoId);

    try {
      await api.reviewPhoto(photoId, 'rejected', customRejectReason.trim());
      showToast(`Photo rejected: ${customRejectReason.trim()}`, 'warn');
      setRejectDialogPhoto(null);
      await loadPhotos();
      if (selectedPhoto?.id === photoId) setSelectedPhoto(null);
    } catch (err: any) {
      showToast(err.message ?? 'Failed to reject photo', 'warn');
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
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-7xl mx-auto pb-24 font-sans text-zinc-100 relative">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
          <div
            className={`px-4 py-2.5 rounded-xl border shadow-2xl flex items-center gap-2.5 text-xs font-medium backdrop-blur-xl ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200 shadow-emerald-950/50'
                : 'bg-zinc-900/90 border-amber-500/40 text-amber-200 shadow-black/80'
            }`}
          >
            {toast.type === 'success' ? (
              <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

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
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 border border-zinc-700 transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Refresh Queue</span>
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
            className={`px-3 py-1.5 rounded-xl border transition-all ${
              statusFilter === tab.id
                ? 'bg-zinc-800 border-zinc-600 text-white font-bold shadow-sm'
                : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Photos Grid */}
      {filteredPhotos.length === 0 ? (
        <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-12 text-center text-zinc-500 font-mono text-xs">
          NO PHOTOS MATCHING ACTIVE FILTER.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredPhotos.map((photo) => {
            const isApproved = photo.status === 'approved';
            const isRejected = photo.status === 'rejected';
            const isPending = photo.status === 'pending';
            const isLoading = actionLoadingId === photo.id;

            return (
              <div
                key={photo.id}
                className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl overflow-hidden flex flex-col group hover:border-zinc-700 transition-all shadow-lg"
              >
                {/* Photo Image with overlay */}
                <div
                  onClick={() => setSelectedPhoto(photo)}
                  className="relative aspect-video bg-black cursor-pointer overflow-hidden flex items-center justify-center group"
                >
                  <img
                    src={photo.filePath}
                    alt={`Submitted by ${photo.team?.name}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="px-2.5 py-1 rounded-lg bg-zinc-900/90 text-white text-[10px] font-mono border border-zinc-700 flex items-center gap-1.5">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                      </svg>
                      Inspect Fullscreen
                    </span>
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`absolute top-2.5 right-2.5 text-[9px] font-mono px-2 py-0.5 rounded-md font-bold uppercase tracking-wider backdrop-blur-md ${
                      isApproved
                        ? 'bg-emerald-950/80 border border-emerald-500/40 text-emerald-300'
                        : isRejected
                        ? 'bg-rose-950/80 border border-rose-500/40 text-rose-300'
                        : 'bg-amber-950/80 border border-amber-500/40 text-amber-300'
                    }`}
                  >
                    {photo.status}
                  </span>
                </div>

                {/* Details */}
                <div className="p-3.5 flex flex-col gap-2.5 flex-1 justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-white text-xs tracking-tight truncate">
                        {photo.team?.name ?? `Team #${photo.teamId}`}
                      </h3>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {new Date(photo.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {photo.reviewNote && (
                      <p className="text-[10px] text-zinc-400 mt-1 italic font-mono truncate">
                        "{photo.reviewNote}"
                      </p>
                    )}
                  </div>

                  {/* Action Controls */}
                  <div className="flex items-center gap-1.5 pt-2 border-t border-zinc-800/80">
                    {isPending ? (
                      <>
                        <button
                          onClick={() => handleApprove(photo.id, photo.teamId, true)}
                          disabled={isLoading}
                          className="flex-1 py-1.5 px-2.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs tracking-tight transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Approve & Verify</span>
                        </button>
                        <button
                          onClick={() => openRejectDialog(photo)}
                          disabled={isLoading}
                          className="py-1.5 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          <span>Reject</span>
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center justify-between w-full text-xs font-mono text-zinc-500">
                        <span>Reviewed</span>
                        <button
                          onClick={() => (isApproved ? openRejectDialog(photo) : handleApprove(photo.id, photo.teamId))}
                          disabled={isLoading}
                          className="text-zinc-400 hover:text-zinc-200 underline font-sans text-xs transition-colors"
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

      {/* Rejection Dialog Modal */}
      {rejectDialogPhoto && (
        <div
          onClick={() => setRejectDialogPhoto(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-5 flex flex-col gap-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Reject Photo Submission</h3>
                <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                  Squad: {rejectDialogPhoto.team?.name ?? `Team #${rejectDialogPhoto.teamId}`}
                </p>
              </div>
              <button
                onClick={() => setRejectDialogPhoto(null)}
                className="w-7 h-7 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Select Reason</label>
              <div className="space-y-1.5">
                {REJECTION_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCustomRejectReason(preset)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all border ${
                      customRejectReason === preset
                        ? 'bg-rose-950/60 border-rose-500/40 text-rose-200 font-medium'
                        : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <div className="pt-2">
                <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold block mb-1">
                  Custom Feedback Note (Optional)
                </label>
                <input
                  type="text"
                  value={customRejectReason}
                  onChange={(e) => setCustomRejectReason(e.target.value)}
                  placeholder="Enter rejection reason for operative..."
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:outline-none focus:border-rose-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setRejectDialogPhoto(null)}
                className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReject}
                disabled={actionLoadingId === rejectDialogPhoto.id || !customRejectReason.trim()}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all disabled:opacity-50"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Inspector Modal */}
      {selectedPhoto && (
        <div
          onClick={() => setSelectedPhoto(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden max-w-2xl w-full flex flex-col shadow-2xl"
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
                  onClick={() => handleApprove(selectedPhoto.id, selectedPhoto.teamId, true)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-all active:scale-95"
                >
                  Approve Photo
                </button>
                <button
                  onClick={() => openRejectDialog(selectedPhoto)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-all active:scale-95"
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
