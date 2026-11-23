import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createNameTags } from '../src/components/duelist/client/matchProps.mjs';

test('Duelist opponent HP is readable above the model and updates only when values change', () => {
  const drawn = [];
  const oldDocument = globalThis.document;
  globalThis.document = {
    createElement(name) {
      assert.equal(name, 'canvas');
      return {
        width: 0, height: 0,
        getContext(type) {
          assert.equal(type, '2d');
          return {
            clearRect() {}, fillRect() {}, strokeRect() {},
            strokeText(text) { drawn.push(text); },
            fillText(text) { drawn.push(text); },
          };
        },
      };
    },
  };
  const scene = new THREE.Scene();
  const tags = createNameTags(scene);
  try {
    tags.set('enemy', 'Arena Bot', 0xffc9b8, true);
    assert.equal(scene.children.length, 2, 'name and HP use two cheap sprites');
    const [label, hpSprite] = scene.children;
    assert.equal(hpSprite.visible, false, 'HP is hidden until a valid authoritative snapshot arrives');
    const actor = { chest: () => ({ x: 2, y: 1.4, z: 5 }) };
    tags.update({ enemy: actor }, () => false, () => ({ hp: 65, maxHp: 100 }));
    assert.equal(label.visible, true);
    assert.equal(hpSprite.visible, true);
    assert.ok(hpSprite.scale.x >= 1.8, 'HP tank must be large enough to read');
    assert.ok(hpSprite.position.y > actor.chest().y + 0.7, 'HP follows above fighter chest/head');
    assert.ok(drawn.includes('65 / 100'), 'actual HP values appear');
    const draws = drawn.length;
    tags.update({ enemy: actor }, () => false, () => ({ hp: 65, maxHp: 100 }));
    assert.equal(drawn.length, draws, 'unchanged HP is not redrawn every render frame');
    tags.update({ enemy: actor }, () => false, () => ({ hp: 25, maxHp: 100 }));
    assert.ok(drawn.includes('25 / 100'), 'damage refreshes the tank');
    tags.update({ enemy: actor }, () => true, () => ({ hp: 25, maxHp: 100 }));
    assert.equal(hpSprite.visible, false, 'dead or hidden enemy does not leave a floating HP label');
  } finally {
    tags.dispose();
    globalThis.document = oldDocument;
  }
  assert.equal(scene.children.length, 0, 'all GPU sprites and textures are cleaned up');
});

test('Duelist shows all nonlocal enemies and uses simulation HP rather than client-supplied data', () => {
  const source = readFileSync(new URL('../src/components/duelist/client/DuelistGame.jsx', import.meta.url), 'utf8');
  assert.match(source, /if \(s\.id !== me\(\)\) \{/);
  assert.match(source, /vitals \? \{ hp: vitals\.hp, maxHp: vitals\.max\.hp \} : null/);
  assert.match(source, /tags\.update\(actors,/);
});
