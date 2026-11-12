import CreatorStage from './CreatorStage';
import { CREATOR_SECTIONS } from './CharacterAppearanceEditor';

// The creator shell: brand bar, category rail, live 3D stage, the category
// panel and the save controls handed in by AvatarAppearanceDialog.
export default function CreatorStudio({
  config,
  shot,
  expression,
  onCapabilities,
  onCustomizationState,
  section,
  onSection,
  onRandomize,
  brand,
  kicker,
  topTools,
  title,
  panel,
  footer,
}) {
  return (
    <div className="creator-studio">
      <header className="creator-header">
        <div className="creator-brand">
          {brand}
          {kicker && <span className="creator-kicker">{kicker}</span>}
        </div>
        <div className="creator-tools">
          {onRandomize && (
            <button type="button" className="creator-tool" onClick={onRandomize}>
              Randomise
            </button>
          )}
          {topTools}
        </div>
      </header>

      <div className="creator-body">
        <nav className="creator-rail" aria-label="Creator categories">
          {CREATOR_SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`creator-rail-item${section === item.id ? ' is-active' : ''}`}
              onClick={() => onSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="creator-stage">
          <CreatorStage
            config={config}
            shot={shot}
            expression={expression}
            onCapabilities={onCapabilities}
            onCustomizationState={onCustomizationState}
          />
        </div>

        <section className="creator-panel" aria-label={title || 'Appearance'}>
          {title && <h2 className="creator-panel-title">{title}</h2>}
          {panel}
        </section>
      </div>

      <footer className="creator-footer">{footer}</footer>
    </div>
  );
}