import { useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useNavigate } from 'react-router-dom';

export default function Camera() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'pending' | 'approved' | 'rejected'>('idle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  function handleCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setStatus('idle');
    setError('');
  }

  async function submit() {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.uploadPhoto(file);
      if (res.error) throw new Error(res.error);
      setStatus('pending');
    } catch (err: any) {
      setError(err.message ?? 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  if (status === 'pending') {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center gap-6">
        <div className="text-6xl">⏳</div>
        <h2 className="text-2xl font-bold">Submission Received!</h2>
        <p className="text-gray-400">The admin is reviewing your photo. You'll be notified when it's approved.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col px-6 py-8 gap-6 pb-24">
      <h2 className="text-xl font-bold text-center">📸 Final Photo</h2>
      <p className="text-sm text-gray-400 text-center">
        Take a live photo with the target person using your camera. Gallery uploads are not allowed.
      </p>

      {/* Hidden file input — capture=environment prevents gallery */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        className="hidden"
        onChange={handleCapture}
      />

      {preview ? (
        <div className="relative rounded-2xl overflow-hidden bg-gray-800">
          <img src={preview} alt="Captured" className="w-full object-cover max-h-80" />
          <button
            onClick={() => { setPreview(null); setFile(null); }}
            className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full h-48 rounded-2xl border-2 border-dashed border-gray-600 flex flex-col items-center justify-center gap-2 text-gray-400 active:bg-gray-800"
        >
          <span className="text-4xl">📷</span>
          <span className="text-sm">Tap to open camera</span>
        </button>
      )}

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      {preview && (
        <button
          onClick={submit}
          disabled={loading}
          className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 text-white font-bold text-lg min-h-[44px]"
        >
          {loading ? 'Uploading…' : 'Submit Photo for Review'}
        </button>
      )}
    </div>
  );
}
