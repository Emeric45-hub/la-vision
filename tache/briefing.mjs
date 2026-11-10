// Tâche : briefing du matin (6h30) et du soir (17h30). Rassemble les faits (planning, agendas,
// rappels du Raccourci, météo, cantine, plat prévu), les fait rédiger par Claude et écrit
// vision/briefing = { cle, moment, date, texte, ia, essentiel, le }. Réécrit seulement si l'essentiel
// de la journée change (au plus une fois par heure). Journaux : des comptes seulement.
import { pathToFileURL } from 'node:url';
import { connecter } from './firestore.mjs';
import { empreinte } from './outils.mjs';
import { decaler } from './calendrier.mjs';
import { moment, jourDuPlanning, faitsDuJour, essentiel, doitEcrire, cleMoment, consigne, secours } from './briefing.js';
import { lire as lireRaccourci, repartir } from '../js/raccourci.js';
import { url as urlMeteo, creneaux, SEUILS } from '../js/meteo.js';
import { pourEnfant } from './cantine.js';

const MODELE = 'claude-sonnet-5-5';
const ici = () => {
  const d = new Date();
  return { date: d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }),
    heure: d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }) };
};

async function rediger(texte) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODELE, max_tokens: 1500, messages: [{ role: 'user', content: texte }] })
  });
  if (!r.ok) throw new Error('API Claude HTTP ' + r.status);
  const j = await r.json();
  // Concaténer tous les blocs de texte (le premier peut être un bloc de réflexion).
  const t = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  if (!t) throw new Error('réponse vide');
  return { texte: t, jetons: j.usage ? (j.usage.input_tokens || 0) + '/' + (j.usage.output_tokens || 0) : '?' };
}

export async function executer() {
  const t0 = Date.now();
  const { date, heure } = ici();
  const m = moment(heure);
  if (!m) { console.log('briefing : avant 6h30, celui de la veille reste affiché'); return; }
  const fs = await connecter(JSON.parse(process.env.FIREBASE_SA));
  const demain = decaler(date, 1);
  const docs = await fs.lireLot(['vision/config', 'vision/briefing', 'vision/raccourci', 'vision/cantine', 'vision/plats',
    `vision/planning/jours/${date}`, `vision/planning/jours/${demain}`, `vision/agenda/jours/${date}`, `vision/agenda/jours/${demain}`]);
  const fam = (docs['vision/config'] || {}).famille;
  if (!fam) { console.log('briefing : configuration absente'); return; }

  const jA = jourDuPlanning(docs[`vision/planning/jours/${date}`], fam);
  const jD = jourDuPlanning(docs[`vision/planning/jours/${demain}`], fam);
  const faits = { moment: m, date, heure: m === 'matin' ? '6h30' : '17h30' };
  if (m === 'matin') faits.aujourdhui = faitsDuJour(date, jA, docs[`vision/agenda/jours/${date}`], fam);
  else { faits.ceSoir = faitsDuJour(date, jA, docs[`vision/agenda/jours/${date}`], fam); faits.demain = faitsDuJour(demain, jD, docs[`vision/agenda/jours/${demain}`], fam); }

  // Rappels du jour (Raccourci iOS)
  const rac = lireRaccourci(docs['vision/raccourci']);
  if (!rac.erreur) faits.rappelsDuJour = repartir(rac.rappels, date).jour.map(r => r.titre + (r.heure ? ' (' + r.heure.replace(':', 'h') + ')' : '') + (r.retard ? ' (en retard)' : ''));
  // Cantine de midi (matin seulement)
  const lieu = jA && jA.aff && jA.aff.e2, cant = docs['vision/cantine'] || {};
  const src = lieu === 'ecole' ? 'ecole' : (lieu === 'alae' || lieu === 'centre') ? 'loisirs' : null;
  if (m === 'matin' && src) { const p = pourEnfant((cant[src] || {})[date]); if (p.length) faits.cantineMidi = p; }
  // Plat prévu ce soir
  const P = docs['vision/plats'];
  if (P && P.plats) { const reste = P.plats.filter(p => !(P.faits || []).includes(p.id)); if (reste[0]) faits.platPrevuCeSoir = reste[0].repas; }
  // Météo
  if (fam.meteo) {
    try {
      const r = await fetch(urlMeteo(fam.meteo.lat, fam.meteo.lon));
      if (r.ok) {
        const x = creneaux(await r.json(), date, demain, heure, { ...SEUILS, ...(fam.meteo.seuils || {}) });
        faits.meteo = { conseil: x.conseil, creneaux: x.creneaux.map(c => `${c.libelle} : ${c.temp}° (ressenti ${c.ressenti}°), pluie ${c.pluie} %`) };
      }
    } catch (e) { /* sans météo */ }
  }

  const cle = cleMoment(m, date), emp = empreinte(essentiel(faits));
  const actuel = docs['vision/briefing'];
  if (!doitEcrire(actuel, emp, Date.now(), cle) && !process.env.FORCER) { console.log(`briefing : à jour (${m})`); return; }

  let texte, ia = true, jetons = '-';
  try { ({ texte, jetons } = await rediger(consigne(faits, fam))); }
  catch (e) { texte = secours(faits); ia = false; console.log('briefing : rédaction impossible (' + String(e.message).slice(0, 60) + '), texte de secours'); }
  await fs.ecrire([{ chemin: 'vision/briefing', donnees: { cle, moment: m, date, texte, ia, essentiel: emp, le: { __horodatage: new Date().toISOString() } } }]);
  console.log(`briefing : ${m} écrit (${texte.split(/\s+/).length} mots, IA ${ia ? 'oui' : 'non'}, jetons ${jetons}) ; ${Date.now() - t0} ms`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  executer().catch(e => { console.log('briefing : échec (' + e.name + ')'); process.exitCode = 1; });
}
