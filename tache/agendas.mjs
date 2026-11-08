// Tâche planifiée : lit les agendas des deux parents, les vacances scolaires et les jours fériés,
// et écrit dans Firestore un document par jour (vision/agenda/jours/{AAAA-MM-JJ}).
//
// Règles (dépôt public) : les journaux n'affichent que des comptes ; seuls les jours modifiés
// sont écrits ; fenêtre J-7 à J+60 ; si une source est illisible, rien n'est écrit et l'erreur
// est notée dans vision/etat.agendas.
//
// Entrées : variables d'environnement ICS_A, ICS_B (adresses iCal), FIREBASE_SA (compte de service).
// L'adresse du calendrier scolaire est lue dans vision/config.sources.vacances.
import { pathToFileURL } from 'node:url';
import { connecter } from './firestore.mjs';
import { lireAgenda, enParis, joursEntre, decaler } from './calendrier.mjs';
import { feries } from './feries.mjs';
import { empreinte } from './outils.mjs';
import { executerPlanning } from './planning.mjs';
import { cocherEcole } from './nounou.mjs';

export const AVANT = 7, APRES = 60;

export { empreinte };

// Construit le contenu de chaque jour de la fenêtre à partir des textes iCal.
export function construireJours(ICAL, { texteA, texteB, texteVacances }, du, au) {
  const A = lireAgenda(ICAL, texteA, du, au);
  const B = lireAgenda(ICAL, texteB, du, au);
  const V = texteVacances ? lireAgenda(ICAL, texteVacances, du, au) : {};
  const fer = { ...feries(Number(du.slice(0, 4))), ...feries(Number(au.slice(0, 4))) };
  const jours = {};
  for (const j of joursEntre(du, au)) {
    jours[j] = {
      A: A[j] || [],
      B: B[j] || [],
      vacances: V[j] ? [...new Set(V[j].map(e => e.titre))].join(' · ') : null,
      ferie: fer[j] || null
    };
  }
  return jours;
}

async function telecharger(nom, url) {
  if (!url) throw new Error(`source ${nom} absente`);
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`source ${nom} : HTTP ${r.status}`);
  const t = await r.text();
  if (!t.includes('BEGIN:VCALENDAR')) throw new Error(`source ${nom} : contenu non iCal`);
  return t;
}

export async function principal() {
  const t0 = Date.now();
  const ICAL = (await import(process.env.ICALJS || 'ical.js')).default;
  const fs = await connecter(JSON.parse(process.env.FIREBASE_SA));
  const maintenant = { __horodatage: new Date().toISOString() };
  try {
    const config = (await fs.lire('vision/config')) || {};
    const urlVacances = config.sources && config.sources.vacances;
    const [texteA, texteB, texteVacances] = await Promise.all([
      telecharger('A', process.env.ICS_A),
      telecharger('B', process.env.ICS_B),
      urlVacances ? telecharger('vacances', urlVacances) : null
    ]);

    const aujourdhui = enParis(new Date()).jour;
    const du = decaler(aujourdhui, -AVANT), au = decaler(aujourdhui, APRES);
    const jours = construireJours(ICAL, { texteA, texteB, texteVacances }, du, au);

    // Empreintes des jours déjà écrits : une seule lecture au lieu d'une par jour.
    const index = (await fs.lire('vision/agenda')) || {};
    const anciennes = index.empreintes || {};
    const nouvelles = {}, ecritures = [];
    for (const [j, contenu] of Object.entries(jours)) {
      nouvelles[j] = empreinte(contenu);
      if (anciennes[j] !== nouvelles[j]) ecritures.push({ chemin: `vision/agenda/jours/${j}`, donnees: contenu });
    }
    if (ecritures.length) ecritures.push({ chemin: 'vision/agenda', donnees: { empreintes: nouvelles, majLe: maintenant } });

    const compte = cle => Object.values(jours).reduce((n, x) => n + x[cle].length, 0);
    const bilan = {
      lu: maintenant, duree_ms: Date.now() - t0, du, au,
      ecrits: Math.max(0, ecritures.length - 1), inchanges: Object.keys(jours).length - Math.max(0, ecritures.length - 1),
      sources: {
        A: { evenements: compte('A') }, B: { evenements: compte('B') },
        vacances: urlVacances ? { jours: Object.values(jours).filter(x => x.vacances).length } : { etat: 'non configuré' }
      },
      erreur: null
    };
    ecritures.push({ chemin: 'vision/etat', donnees: { agendas: bilan }, champsModifies: ['agendas'] });
    await fs.ecrire(ecritures);
    console.log(`Agendas : ${bilan.ecrits} jours écrits, ${bilan.inchanges} inchangés ; ` +
      `${bilan.sources.A.evenements} + ${bilan.sources.B.evenements} occurrences ; ${Date.now() - t0} ms`);
  } catch (e) {
    // On garde la dernière lecture réussie (agendas.lu) et on note seulement l'échec.
    const message = String(e.message || e.name).slice(0, 200);
    await fs.ecrire([{ chemin: 'vision/etat', donnees: { agendas: { erreur: { quand: maintenant, message } } }, champsModifies: ['agendas.erreur'] }]);
    console.log('Échec des agendas : ' + message);
    process.exitCode = 1;
  }
  // Le planning se calcule même si la lecture des agendas a échoué (avec les derniers agendas connus).
  try {
    await executerPlanning(fs, enParis(new Date()).jour);
  } catch (e) {
    const message = String(e.message || e.name).slice(0, 200);
    await fs.ecrire([{ chemin: 'vision/etat', donnees: { planning: { erreur: { quand: maintenant, message } } }, champsModifies: ['planning.erreur'] }]);
    console.log('Échec du planning : ' + message);
    process.exitCode = 1;
  }
  // Jour d'école pour l'app de pointage (seulement si la case est vide).
  try {
    await cocherEcole(fs, enParis(new Date()).jour);
  } catch (e) {
    console.log('Jour d\'école non coché : ' + String(e.message || e.name).slice(0, 200));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await principal();
