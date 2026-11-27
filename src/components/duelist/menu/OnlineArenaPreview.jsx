import { useState } from 'react';
import { mapPicture } from './mapPictures.mjs';

// A regular static image. Never mount a canvas or load a map while browsing.
export default function OnlineArenaPreview({ mode, compact = false }) {
  const src = mapPicture(mode);
  const [failedSrc, setFailedSrc] = useState(null);
  return (
    <div className="relative overflow-hidden rounded border border-white/15 bg-slate-950"
      style={compact ? {width:'100%', height:'100%', minHeight:80} : {height:'clamp(130px, 28vh, 280px)'}}>
      {src && failedSrc !== src ? (
        <img src={src} alt="" width={960} height={540} loading="lazy" decoding="async" draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailedSrc(src)} />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-xs text-white/65">Map picture unavailable</div>
      )}
    </div>
  );
}
