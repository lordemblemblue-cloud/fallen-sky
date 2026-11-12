import JadeSoulHUD from './JadeSoulHUD';

// TargetDisplay now lives within JadeSoulHUD's real upper-right map group.
// This avoids rendering two lock-on panels when changing world regions.
export default function GameHUD({ onOpenServices, serviceMode = false, ...servicesNavigation }) {
  return <JadeSoulHUD onOpenServices={onOpenServices}
    serviceMode={serviceMode} {...servicesNavigation} />;
}
