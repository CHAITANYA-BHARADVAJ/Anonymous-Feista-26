import { useGameStore } from '../stores/gameStore';

export default function AnnouncementBanner() {
  const announcements = useGameStore((s) => s.announcements);
  if (!announcements.length) return null;
  const latest = announcements[0];

  return (
    <div className="bg-brand-900 border-b border-brand-600 px-4 py-2 text-center text-sm font-medium animate-pulse">
      📢 {latest.message}
    </div>
  );
}
