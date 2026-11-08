// Empreinte stable d'une valeur (clés triées) : sert à n'écrire que ce qui a changé.
import crypto from 'node:crypto';

const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
  : (v && typeof v === 'object') ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'
  : JSON.stringify(v ?? null);
export const empreinte = v => crypto.createHash('sha1').update(canon(v)).digest('base64').slice(0, 16);
