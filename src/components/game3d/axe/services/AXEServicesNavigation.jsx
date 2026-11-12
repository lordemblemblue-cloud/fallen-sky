import { useLayoutEffect, useRef, useState } from 'react';
import { AXE_SERVICE_GROUPS } from './AXEServiceGroups';
import { measureAXEServicesArea, splitAXEServiceRows } from './AXEServicesNavigationLayout';

export default function AXEServicesNavigation({
  expanded = false,
  activeGroup = null,
  serviceMode = false,
  onToggle,
  onSelectGroup,
}) {
  const navigation = useRef(null);
  const measurement = useRef(null);
  const [area, setArea] = useState(null);
  const [rows, setRows] = useState([[0, ...AXE_SERVICE_GROUPS.map((_, index) => index + 1)]]);
  const open = expanded || serviceMode;

  useLayoutEffect(() => {
    const node = navigation.current;
    const hud = node?.closest('.jade-hud');
    const world = hud?.parentElement;
    if (!hud || !world) return undefined;

    let frame = 0;
    let observedWeather = null;
    let previousClearance = null;
    let previousNavigationBottom = null;
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;

    function update() {
      frame = 0;
      if (!node.isConnected || !measurement.current) return;
      const weather = world.querySelector('.game3d-world-weather');
      if (weather !== observedWeather) {
        if (observedWeather) resize?.unobserve?.(observedWeather);
        observedWeather = weather;
        if (weather) resize?.observe(weather);
      }
      const bounds = hud.getBoundingClientRect();
      const statusBounds = hud.querySelector('.jade-status')?.getBoundingClientRect();
      // Opening Services hides the weather widget without unmounting its live
      // forecast. Ignore its reserved width so the expanded navigation can
      // spread toward the compass instead of staying squeezed to 55vw.
      const weatherBounds = open ? null : weather?.getBoundingClientRect();
      const next = measureAXEServicesArea({
        bounds,
        status: statusBounds,
        weather: weatherBounds,
        compass: hud.querySelector('.jade-compass-block')?.getBoundingClientRect(),
      });
      setArea(previous => previous && previous.left === next.left &&
        previous.width === next.width && previous.top === next.top ? previous : next);
      const widths = Array.from(measurement.current.children, button => button.getBoundingClientRect().width);
      const nextRows = splitAXEServiceRows(widths, next.width);
      setRows(previous => JSON.stringify(previous) === JSON.stringify(nextRows) ? previous : nextRows);
      const navigationBottom = next.top + (open ? nextRows.length * 32 + (nextRows.length - 1) * 6 : 32);
      const actualNavigationBottom = Math.ceil(navigationBottom);
      // Expose the menu's real bottom separately from HP/weather clearance.
      // Appearance may claim some spare vertical space without touching the
      // Services / Blacksmith / Appearance / Companion / Spirituality buttons.
      if (actualNavigationBottom !== previousNavigationBottom) {
        previousNavigationBottom = actualNavigationBottom;
        world.style.setProperty('--axe-service-navigation-actual-bottom', `${actualNavigationBottom}px`);
      }
      const clearance = Math.ceil(Math.max(
        navigationBottom,
        (statusBounds?.bottom ?? bounds.top) - bounds.top,
        (weatherBounds?.bottom ?? bounds.top) - bounds.top,
      ));
      // Setting an unchanged style value every frame forces unnecessary style work
      // in the large live WebGL world; only commit a genuine clearance change.
      if (clearance !== previousClearance) {
        previousClearance = clearance;
        world.style.setProperty('--axe-service-navigation-bottom', `${clearance}px`);
      }
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    resize?.observe(hud);
    const status = hud.querySelector('.jade-status');
    if (status) resize?.observe(status);
    const compass = hud.querySelector('.jade-compass-block');
    if (compass) resize?.observe(compass);

    // Weather mounts asynchronously inside GameWorld3D. Check for replacement
    // occasionally instead of observing ALL subtree mutations of a live game
    // (combat/chat/quests can generate thousands of unrelated DOM updates).
    // Once found, ResizeObserver handles changes to its actual dimensions.
    const weatherProbe = window.setInterval(() => {
      if (world.querySelector('.game3d-world-weather') !== observedWeather) schedule();
    }, 1000);
    window.addEventListener('resize', schedule);
    update();
    return () => {
      resize?.disconnect();
      window.clearInterval(weatherProbe);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
      world.style.removeProperty('--axe-service-navigation-bottom');
      world.style.removeProperty('--axe-service-navigation-actual-bottom');
    };
  }, [open]);

  const groupButton = (group, measure = false) => (
    <button key={group.id} type="button" className="jade-service-option"
      {...(!measure ? {
        'aria-pressed': activeGroup === group.id,
        onClick: () => onSelectGroup?.(group.id),
      } : { tabIndex: -1 })}>{group.label}</button>
  );

  const servicesButton = (measure = false) => (
    <button type="button" className="jade-services-button"
      {...(measure ? { tabIndex: -1 } : {
        'aria-expanded': open,
        'aria-controls': 'game3d-services-options',
        onClick: onToggle,
        title: serviceMode ? 'Services navigation remains available while using a station' : 'Expand world services',
      })}>Services</button>
  );

  return (
    <nav ref={navigation} className="jade-services-navigation" aria-label="World services"
      data-expanded={open ? 'true' : 'false'}
      style={area ? { left: area.left, top: area.top, width: area.width } : undefined}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => { if (event.key !== 'Escape') event.stopPropagation(); }}>
      {!open && servicesButton()}
      <div className="jade-services-measure" aria-hidden="true" ref={measurement}>
        {servicesButton(true)}
        {AXE_SERVICE_GROUPS.map((group) => groupButton(group, true))}
      </div>
      {open && <div className="jade-services-options-scroll" id="game3d-services-options">
        <div className="jade-services-options">
          {rows.map((indices, index) => <div className="jade-services-row" key={index}>
            {indices.map((groupIndex) => groupIndex === 0
              ? <span key="services">{servicesButton()}</span>
              : groupButton(AXE_SERVICE_GROUPS[groupIndex - 1]))}
          </div>)}
        </div>
      </div>}
    </nav>
  );
}
