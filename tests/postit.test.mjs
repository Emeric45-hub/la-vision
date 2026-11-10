// Tests du codage des traits du post-it.
import assert from 'node:assert/strict';
import { encoder, decoder } from '../js/postit.js';

assert.equal(encoder([[0, 0], [12.4, 999.6], [1000, 500]]), '0,0;12,1000;1000,500');
assert.deepEqual(decoder('0,0;12,1000;1000,500'), [[0, 0], [12, 1000], [1000, 500]]);
assert.deepEqual(decoder(''), []);
assert.deepEqual(decoder(undefined), []);
console.log('post-it : tous les scénarios passent');
