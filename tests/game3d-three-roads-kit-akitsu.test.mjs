// Akitsu's kit (public/game3d/threeroads/kits/akitsu.glb) against empireKitPieces.mjs.
import './fixtures/three-roads-sample/install.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineKitTests } from '../tools/threeroads/kits/common/kitTestCases.mjs';

defineKitTests('akitsu', test, assert);
