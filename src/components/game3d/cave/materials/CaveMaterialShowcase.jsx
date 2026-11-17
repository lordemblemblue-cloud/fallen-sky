import { useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { listCaveMaterials } from './library.js';
import { createCaveMaterialShowcase, getCaveShowcaseFrame } from './showcase.js';

const GROUPS = [
  ['all', 'All surfaces'],
  ['pieces', 'Building pieces'],
  ['rock', 'Rock'],
  ['floor', 'Floors'],
  ['brick', 'Brick faces'],
  ['masonry', 'Masonry'],
  ['wood', 'Wood and iron'],
  ['approach', 'Approach'],
];

export function CaveMaterialShowcase({ focus = 'all', onFocus }) {
  const materials = listCaveMaterials();
  const active = materials.find((entry) => entry.id === focus);
  return (
    <div className="fixed inset-0 flex bg-[#12100e] text-[#f3ecdf]">
      <aside className="flex w-72 shrink-0 flex-col border-r border-white/10 bg-[#1b1814]">
        <div className="border-b border-white/10 px-4 py-4">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#c4b49a]">Game 3D cave</p>
          <h1 className="mt-1 font-serif text-2xl text-[#f6f0e4]">Surface library</h1>
          <p className="mt-2 text-sm leading-5 text-[#c9bfb0]">
            Shared materials and instanced pieces for the underground and the approach.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="mb-4 flex flex-wrap gap-1.5">
            {GROUPS.map(([id, label]) => (
              <FocusButton key={id} id={id} label={label} focus={focus} onFocus={onFocus} />
            ))}
          </div>
          {['Rock', 'Floor', 'Brick', 'Masonry', 'Wood', 'Approach'].map((group) => (
            <section key={group} className="mb-4">
              <h2 className="px-2 pb-1 text-[11px] uppercase tracking-[0.18em] text-[#a89880]">{group}</h2>
              <ul>
                {materials.filter((entry) => entry.group === group).map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => onFocus(entry.id)}
                      className={`w-full rounded px-2 py-1.5 text-left text-sm ${focus === entry.id ? 'bg-[#efe4cf] text-[#241c14]' : 'text-[#efe6d8] hover:bg-white/5'}`}
                    >
                      {entry.label}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </aside>
      <div className="relative min-w-0 flex-1">
        <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-xl rounded-md bg-black/45 px-4 py-3 backdrop-blur-sm">
          <p className="font-serif text-xl">{active ? active.label : titleFromFocus(focus)}</p>
          <p className="mt-1 text-sm leading-5 text-[#ddd4c6]">
            {active ? active.description : 'Drag to orbit. Each swatch is the albedo, normal, roughness, and occlusion set used in the cave.'}
          </p>
        </div>
        <Canvas
          shadows
          dpr={[1, 1.75]}
          camera={{ fov: 34, near: 0.08, far: 220, position: [0, 4, 10] }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.08;
            gl.shadowMap.enabled = true;
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
          }}
        >
          <color attach="background" args={['#161311']} />
          <Stage focus={focus} />
        </Canvas>
      </div>
    </div>
  );
}

function Stage({ focus }) {
  const [bundle, setBundle] = useState(null);
  const frame = useMemo(() => getCaveShowcaseFrame(focus), [focus]);
  useEffect(() => {
    let alive = true;
    let built = null;
    const timer = setTimeout(() => {
      built = createCaveMaterialShowcase({ focus });
      if (!alive) {
        built.dispose();
        built = null;
        return;
      }
      setBundle(built);
    }, 30);
    return () => {
      alive = false;
      clearTimeout(timer);
      built?.dispose();
      setBundle(null);
    };
  }, [focus]);

  return (
    <>
      <hemisphereLight args={['#e8eef5', '#3c342c', 0.78]} />
      <ambientLight intensity={0.16} />
      <directionalLight
        position={[7, 12, 8]}
        intensity={2.55}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.4}
        shadow-camera-far={80}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-bias={-0.00035}
      />
      <directionalLight position={[-6, 5, -4]} intensity={0.42} color="#9eb6c8" />
      <pointLight
        position={[frame.target[0] + 0.4, 2.15, frame.target[2] + 1.8]}
        intensity={7}
        distance={14}
        decay={2}
        color="#ffb16a"
      />
      {bundle ? <primitive object={bundle.object} /> : null}
      <CameraRig frame={frame} focus={focus} />
    </>
  );
}

function CameraRig({ frame, focus }) {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    camera.position.set(frame.position[0], frame.position[1], frame.position[2]);
    camera.near = 0.08;
    camera.far = 220;
    camera.lookAt(frame.target[0], frame.target[1], frame.target[2]);
    camera.updateProjectionMatrix();
  }, [camera, frame]);
  return (
    <OrbitControls
      key={focus}
      makeDefault
      target={frame.target}
      enableDamping
      maxPolarAngle={Math.PI * 0.49}
    />
  );
}

function FocusButton({ id, label, focus, onFocus }) {
  const active = focus === id;
  return (
    <button
      type="button"
      onClick={() => onFocus(id)}
      className={`rounded-full px-2.5 py-1 text-xs ${active ? 'bg-[#efe4cf] text-[#241c14]' : 'bg-white/5 text-[#efe6d8] hover:bg-white/10'}`}
    >
      {label}
    </button>
  );
}

function titleFromFocus(focus) {
  const names = {
    all: 'All cave surfaces',
    pieces: 'Building pieces',
    rock: 'Cave rock',
    floor: 'Cave floors',
    brick: 'Brick faces',
    masonry: 'Masonry',
    wood: 'Wood and iron',
    approach: 'Approach',
  };
  return names[focus] || 'Cave surfaces';
}
