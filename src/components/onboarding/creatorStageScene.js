import { createAvatarScene } from './avatarPreviewScene';

// Stage for the fused creator bodies (Eve / Adam): per-category camera framing,
// drag-to-rotate and live expression preview on top of the shared avatar scene.
export function createCreatorStage(mount, options = {}) {
  const { url, onReady, onError, onState, onCapabilities, ambientGaze = false } = options;

  const scene = createAvatarScene(mount, {
    url,
    config: {},
    orbit: true,
    onReady: () => {
      onState?.({ loading: false, error: '' });
      onCapabilities?.({ customization: { shapes: [] } });
      onReady?.();
    },
    onError: () => {
      onState?.({ loading: false, error: 'This device could not load the 3D preview.' });
      onError?.();
    },
  });

  if (onState) onState({ loading: true, error: '' });

  return {
    appearance(config) {
      scene.setAppearance(config);
    },
    focus(shot) {
      scene.setShot(shot === 'face' || shot === 'head' ? 'face' : 'body');
    },
    expression(morphs) {
      scene.setExpression(morphs || {});
    },
    rotate(amount) {
      scene.rotate(amount);
    },
    resetView() {
      scene.resetView();
    },
    setAmbientGaze() {
      /* idle gaze sway belongs to the authored body animations */
      return ambientGaze;
    },
    dispose() {
      scene.dispose();
    },
  };
}

export default createCreatorStage;