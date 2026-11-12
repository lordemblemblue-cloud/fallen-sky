import { useEffect, useRef, useState } from 'react';
import { createAvatarScene } from './avatarPreviewScene';

// Small live 3D preview of an avatar. Used by the HUD portrait and by the
// equipment screen, which pass the world avatar's config plus an optional
// model override.
export default function PlayerAvatarPreview({ config, modelUrlOverride, portrait = false, orbit = true, className = '' }) {
  const mount = useRef(null);
  const scene = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!mount.current) return undefined;
    scene.current = createAvatarScene(mount.current, {
      url: modelUrlOverride || null,
      config,
      portrait,
      orbit,
      onError: () => setFailed(true),
    });
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
    // The model URL decides what to load; appearance updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrlOverride, portrait]);

  useEffect(() => {
    scene.current?.setAppearance(config);
  }, [config]);

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0 }}>
      <div ref={mount} style={{ width: '100%', height: '100%' }} />
      {failed && (
        <span
          role="status"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.45)',
            textAlign: 'center',
            padding: 8,
          }}
        >
          Avatar preview unavailable
        </span>
      )}
    </div>
  );
}