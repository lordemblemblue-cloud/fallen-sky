import { CREATOR_BODIES, EXPRESSION_PRESETS, SHAPE_CONTROLS, expressionMorphs } from './avatarCustomization';
import { FACE_SHAPES } from './avatarAppearanceData';

export const CREATOR_SECTIONS = [
  { id: 'body', label: 'Body' },
  { id: 'face', label: 'Face' },
  { id: 'color', label: 'Colour' },
  { id: 'expression', label: 'Expression' },
];

export function creatorShot(section) {
  return section === 'face' ? 'face' : 'body';
}

const PALETTE = ['#f2d0b6', '#e0b393', '#c58a63', '#9a6144', '#6f4128', '#4a2a1a'];
const HAIR = ['#2a1d18', '#4b2f22', '#7b4a2b', '#a9743f', '#d9c48b', '#e8e4dd', '#2c2f3a', '#7a2e3a'];
const EYES = ['#5ca9c9', '#3f6f4a', '#6b4a86', '#8a6a3a', '#2f3b4a', '#a34f4f'];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function randomizeAppearance(config = {}) {
  return {
    ...config,
    skin_tone: pick(PALETTE),
    hair_color: pick(HAIR),
    eye_color: pick(EYES),
    face_shape: pick(FACE_SHAPES),
  };
}

const Row = ({ label, children }) => (
  <label className="cc-row">
    <span className="cc-row-label">{label}</span>
    {children}
  </label>
);

export default function CharacterAppearanceEditor({ config, setConfig, section = 'body', expression, onExpressionChange }) {
  const set = (patch) => setConfig((current) => ({ ...current, ...patch }));
  const setProportions = (patch) =>
    setConfig((current) => ({ ...current, body_proportions: { ...(current.body_proportions || {}), ...patch } }));

  if (section === 'face') {
    return (
      <div className="cc-panel">
        <Row label="Face shape">
          <select value={config.face_shape || 'oval'} onChange={(event) => set({ face_shape: event.target.value })}>
            {FACE_SHAPES.map((shape) => (
              <option key={shape} value={shape}>
                {shape}
              </option>
            ))}
          </select>
        </Row>
        <p className="cc-hint">Shape sliders appear when a body ships authored shape keys.</p>
      </div>
    );
  }

  if (section === 'color') {
    return (
      <div className="cc-panel">
        <Row label="Skin">
          <input type="color" value={config.skin_tone || '#b97855'} onChange={(event) => set({ skin_tone: event.target.value })} />
        </Row>
        <Row label="Hair">
          <input type="color" value={config.hair_color || '#2a1d18'} onChange={(event) => set({ hair_color: event.target.value })} />
        </Row>
        <Row label="Eyes">
          <input type="color" value={config.eye_color || '#5ca9c9'} onChange={(event) => set({ eye_color: event.target.value })} />
        </Row>
      </div>
    );
  }

  if (section === 'expression') {
    return (
      <div className="cc-panel">
        <div className="cc-expression-grid">
          {EXPRESSION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`cc-chip${expression?.preset === preset.id ? ' is-active' : ''}`}
              onClick={() => {
                const values = preset.values || {};
                onExpressionChange?.({ preset: preset.id, values, morphs: expressionMorphs(values) });
              }}
            >
              {preset.label || preset.id}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="cc-panel">
      <Row label="Body">
        <div className="cc-toggle">
          {['female', 'male'].map((gender) => (
            <button
              key={gender}
              type="button"
              className={`cc-chip${(config.gender === 'female' ? 'female' : 'male') === gender ? ' is-active' : ''}`}
              onClick={() => set({ gender })}
            >
              {gender === 'female' ? 'Eve' : 'Adam'}
            </button>
          ))}
        </div>
      </Row>

      <Row label={`Height ${Number(config.height_scale || 1).toFixed(2)}`}>
        <input
          type="range"
          min="0.85"
          max="1.15"
          step="0.01"
          value={Number(config.height_scale || 1)}
          onChange={(event) => set({ height_scale: Number(event.target.value) })}
        />
      </Row>

      <Row label={`Build ${Number(config.body_proportions?.width || 1).toFixed(2)}`}>
        <input
          type="range"
          min="0.9"
          max="1.1"
          step="0.01"
          value={Number(config.body_proportions?.width || 1)}
          onChange={(event) => setProportions({ width: Number(event.target.value) })}
        />
      </Row>

      <Row label={`Depth ${Number(config.body_proportions?.depth || 1).toFixed(2)}`}>
        <input
          type="range"
          min="0.9"
          max="1.1"
          step="0.01"
          value={Number(config.body_proportions?.depth || 1)}
          onChange={(event) => setProportions({ depth: Number(event.target.value) })}
        />
      </Row>

      <p className="cc-hint">
        {Object.keys(CREATOR_BODIES).length} creator bodies available · {SHAPE_CONTROLS.length} authored shape controls
        ship with the fused bodies.
      </p>
    </div>
  );
}