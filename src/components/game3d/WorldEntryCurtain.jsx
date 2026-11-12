import './WorldEntryCurtain.css';

// Hold the existing entry scene until the real GameWorld3D actor and WebGL
// scene are ready. This curtain never owns character state, terrain or physics.
export default function WorldEntryCurtain({status='loading',error='',onRetry,onReturn}){
  const failed=status==='error';
  return (
    <section
      className={'axe-world-entry-curtain'+(status==='revealing'?' is-revealing':'')}
      aria-label="Game 3D world entry"
      aria-live="polite"
      aria-busy={status==='loading'}
    >
      <div className="axe-world-entry-curtain__shade" aria-hidden="true" />
      <div className="axe-world-entry-curtain__content">
        <span className="axe-world-entry-curtain__kicker">WOLFVEIL VALLEY</span>
        <h2>{failed?'World entry interrupted':'Your story continues'}</h2>
        {failed ? (
          <>
            <p role="alert">{error || 'The 3D world could not load. Please retry or return to your characters.'}</p>
            <div className="axe-world-entry-curtain__actions">
              <button type="button" onClick={onRetry}>Retry</button>
              <button type="button" onClick={onReturn}>Character selection</button>
            </div>
          </>
        ) : <p>Entering the living world…</p>}
        {!failed && <div className="axe-world-entry-curtain__progress" aria-hidden="true"><i /></div>}
      </div>
    </section>
  );
}
