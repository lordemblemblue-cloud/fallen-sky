import { Zap } from 'lucide-react';
import { isSpiritualPreviewMode } from '../previewMaxMode';

// Legacy Character Hub button, now routed through the same fail-closed,
// explicitly configured test-preview gate as the Spiritual service panel.
// Hiding a button is not server authorization; the test boost it invokes
// must remain an in-memory overlay, never a live character-save mutation.

export function isEditorMode() {
  return isSpiritualPreviewMode();
}

// Shared button — small, accent-tinted, uppercase. Renders null when not in
// edit/preview/game-dev context so the published app never shows it.
export default function MaxOutButton({ onClick, accent = '#ffd86b', label = 'Max Out', title }) {
  if (!isEditorMode()) return null;
  return (
    <button
      onClick={onClick}
      title={title || 'Editor only — instantly max out this system'}
      className="ml-2 py-2 px-3 rounded-sm text-[10px] tracking-[0.2em] uppercase font-bold transition-all whitespace-nowrap"
      style={{
        background: `${accent}1f`,
        border: `1px solid ${accent}`,
        color: accent,
        boxShadow: `0 0 10px ${accent}33`,
      }}
    >
      <Zap className="mr-1 inline h-3 w-3" aria-hidden="true" />{label}
    </button>
  );
}