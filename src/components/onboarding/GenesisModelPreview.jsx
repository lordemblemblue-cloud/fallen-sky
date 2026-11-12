import { useEffect, useRef, useState } from 'react';
import { createAvatarScene } from './avatarPreviewScene';

// The authored preview for the animated platform bodies (v5). The fused creator
// bodies use creatorStageScene instead.
export default function GenesisModelPreview({
  config,
  compact = false,
  stage = 'body',
  focus = 'body',
  onCapabilities,
  onCustomizationState,
}) {
  const mount = useRef(null);
  const scene = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!mount.current) return undefined;
    onCustomizationState?.({ loading: true, error: '' });
    scene.current = createAvatarScene(mount.current, {
      config,
      portrait: focus === 'face',
      orbit: true,
      onReady: () => {
        onCustomizationState?.({ loading: false, error: '' });
        // Shape controls are authored on the fused bodies; the platform bodies
        // expose colour and proportion controls only.
        onCapabilities?.({ customization: { shapes: [] } });
      },
      onError: () => {
        setFailed(true);
        onCustomizationState?.({ loading: false, error: 'This device could not load the 3D preview.' });
      },
    });
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.gender, config.creator_body]);

  useEffect(() => {
    scene.current?.setAppearance(config);
  }, [config]);

  useEffect(() => {
    scene.current?.setShot(focus === 'face' ? 'face' : stage || 'body');
  }, [focus, stage]);

  return (
    <div
      className={compact ? 'genesis-preview genesis-preview--compact' : 'genesis-preview'}
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      <div ref={mount} style={{ width: '100%', height: '100%' }} />
      {failed && (
        <span role="status" className="genesis-preview-status">
          3D preview unavailable on this device
        </span>
      )}
    </div>
  );
}