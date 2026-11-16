import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getWolfveilSumiETextures } from '../src/components/game3d/wolfveil/WolfveilSumiETextures.mjs';

test('cave walls use columnar basalt, and open rock keeps the flow texture', () => {
  const suite = getWolfveilSumiETextures();
  assert.equal(suite.columnarBasalt.map.name, 'Wolfveil_SumiE_ColumnarBasalt_Albedo');
  assert.equal(suite.caveRock.map.name, 'Wolfveil_SumiE_CaveBasalt_Albedo');
  const img = suite.columnarBasalt.map.image;
  const at = (x, y) => {
    const i = (y * img.width + x) * 4;
    return img.data[i] + img.data[i + 1] + img.data[i + 2];
  };
  const joint = at(0, 40);
  const face = at(Math.round(img.width / 14), 40);
  assert.ok(face > joint + 30, `column face ${face} should be lighter than the joint ${joint}`);
  assert.ok(joint > 40, 'joints stay stone, not a black hole');
  const cave = readFileSync('src/components/game3d/wolfveil/WolfveilCaveSystem.js', 'utf8');
  assert.match(cave, /columnarBasalt\.map/);
  assert.match(cave, /SWV_Cave_BasaltRockWall/);
});
