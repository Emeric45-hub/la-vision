// Accès minimal à Firestore par son API REST, avec un compte de service.
// Évite la bibliothèque firebase-admin, longue à installer à chaque passage.
import crypto from 'node:crypto';

const b64url = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

async function jeton(sa) {
  const maintenant = Math.floor(Date.now() / 1000);
  const entete = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const charge = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat: maintenant, exp: maintenant + 3600
  }));
  const signature = b64url(crypto.createSign('RSA-SHA256').update(entete + '.' + charge).sign(sa.private_key));
  const r = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: entete + '.' + charge + '.' + signature })
  });
  if (!r.ok) throw new Error(`jeton Firestore refusé (HTTP ${r.status})`);
  return (await r.json()).access_token;
}

// --- Conversion entre valeurs JavaScript et valeurs typées Firestore ---
// Une date à enregistrer comme horodatage s'écrit { __horodatage: "ISO" }.
export function versFirestore(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(versFirestore) } };
  if (v.__horodatage) return { timestampValue: v.__horodatage };
  return { mapValue: { fields: champs(v) } };
}
export const champs = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, versFirestore(v)]));

export function depuisFirestore(v) {
  if (!v) return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(depuisFirestore);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, depuisFirestore(x)]));
  return null;
}

export async function connecter(sa) {
  const t = await jeton(sa);
  const racine = `projects/${sa.project_id}/databases/(default)/documents`;
  const api = 'https://firestore.googleapis.com/v1/';
  const appel = async (chemin, options = {}) => {
    const r = await fetch(api + chemin, { ...options, headers: { authorization: 'Bearer ' + t, 'content-type': 'application/json' } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Firestore HTTP ${r.status}`);
    return r.json();
  };
  return {
    nom: chemin => `${racine}/${chemin}`,
    // Lit un document ; renvoie null s'il n'existe pas.
    async lire(chemin) {
      const d = await appel(`${racine}/${chemin}`);
      return d ? depuisFirestore({ mapValue: { fields: d.fields || {} } }) : null;
    },
    // Lit plusieurs documents en un appel par centaine ; renvoie { chemin: données | null }.
    async lireLot(chemins) {
      const res = {};
      for (let i = 0; i < chemins.length; i += 100) {
        const lot = chemins.slice(i, i + 100);
        const r = await appel(`${racine}:batchGet`, { method: 'POST', body: JSON.stringify({ documents: lot.map(c => `${racine}/${c}`) }) });
        for (const x of r || []) {
          const nom = (x.found ? x.found.name : x.missing).slice(racine.length + 1);
          res[nom] = x.found ? depuisFirestore({ mapValue: { fields: x.found.fields || {} } }) : null;
        }
      }
      return res;
    },
    // Applique des écritures par lots de 400 (limite Firestore : 500).
    // ecritures = [{ chemin, donnees, champsModifies?, siAbsent? }] ; champsModifies limite l'écriture à ces champs ;
    // siAbsent fait échouer le lot si le document existe déjà.
    async ecrire(ecritures) {
      for (let i = 0; i < ecritures.length; i += 400) {
        const writes = ecritures.slice(i, i + 400).map(e => ({
          update: { name: `${racine}/${e.chemin}`, fields: champs(e.donnees) },
          ...(e.champsModifies ? { updateMask: { fieldPaths: e.champsModifies } } : {}),
          ...(e.siAbsent ? { currentDocument: { exists: false } } : {})
        }));
        await appel(`${racine}:commit`, { method: 'POST', body: JSON.stringify({ writes }) });
      }
    }
  };
}
