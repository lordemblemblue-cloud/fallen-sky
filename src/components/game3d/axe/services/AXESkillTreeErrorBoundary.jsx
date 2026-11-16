import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * A crash inside the optional branching Skill Tree must never white-screen
 * Game 3D or unmount its Services navigation.
 * React error boundaries cover rendering, lifecycle and constructors.
 * Skill points, mastery and loadouts remain owned by their existing stores.
 */
export default class AXESkillTreeErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, retries: 0 };
    this.retry = this.retry.bind(this);
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // The only runtime diagnostic channel available for user screenshots.
    // Do not transmit game data or character information.
    console.error('[Game3D/SkillTree] Render failure:', error, info?.componentStack || '');
  }
  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      // Switching category/path gives the new tree a clean chance to mount.
      this.setState({ error: null, retries: 0 });
    }
  }
  retry() {
    this.setState(previous => ({ error: null, retries: previous.retries + 1 }));
  }
  render() {
    if (!this.state.error) {
      // Incremented key ensures broken children do not retain stale state.
      return <div className="axe-hp-boundary-body" key={this.state.retries}>{this.props.children}</div>;
    }
    const detail = String(this.state.error?.message || 'Unknown UI error');
    return <section className="axe-hp-recovery" role="alert" aria-label="Skill Tree recovery">
      <AlertTriangle size={30} aria-hidden="true"/>
      <div>
        <h3>Skill Tree could not be displayed</h3>
        <p>The game is still available. Your equipped skills, mastery XP and skill points have not been changed by this screen.</p>
        <p className="axe-hp-recovery-detail">Error: {detail.slice(0, 180)}</p>
        <button type="button" onClick={this.retry}>
          <RotateCcw size={16} aria-hidden="true"/> Retry Skill Tree
        </button>
      </div>
    </section>;
  }
}
