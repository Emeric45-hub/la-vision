// Tâche planifiée : lit les agendas des deux parents, les vacances scolaires et les jours fériés,
// et écrit dans Firestore un document par jour (vision/agenda/jours/{AAAA-MM-JJ}).
//
// Règles (dépôt public) : les journaux n'affichent que des comptes ; seuls les jours modifiés
// sont écrits ; fenêtre J-7 à J+60 ; si une source est illisible, rien n'est écrit et l'erreur
// est notée dans vision/etat.agendas.
//
// Entrées : variables d'environnement ICS_A, ICS_B (adresses iCal), ICS_C (calendrier commun,
// facultatif), FIREBASE_SA (compte de service). L'adresse du calendrier scolaire est lue dans
// vision/config.sources.vacances ; les calendriers abonnés (publics) dans
// vision/config.sources.abonnements = [{ nom, url }], lus une fois par jour seulement.
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
// abonnes : { 'AAAA-MM-JJ': [événements avec leur source] } déjà lus (cache quotidien).
export function construireJours(ICAL, { texteA, texteB, texteVacances, texteC, abonnes }, du, au) {
  const A = lireAgenda(ICAL, texteA, du, au);
  const B = lireAgenda(ICAL, texteB, du, au);
  const Cc = texteC ? lireAgenda(ICAL, texteC, du, au) : {};
  const V = texteVacances ? lireAgenda(ICAL, texteVacances, du, au) : {};
  const fer = { ...feries(Number(du.slice(0, 4))), ...feries(Number(au.slice(0, 4))) };
  const jours = {};
  for (const j of joursEntre(du, au)) {
    jours[j] = {
      A: A[j] || [],
      B: B[j] || [],
      vacances: V[j] ? [...new Set(V[j].map(e => e.titre))].join(' · ') : null,
      ferie: fer[j] || null,
      C: [...(Cc[j] || []).map(e => ({ ...e, source: 'commun' })), ...((abonnes || {})[j] || [])]
        .sort((x, y) => (x.debut + x.titre).localeCompare(y.debut + y.titre))
    };
  }
  return jours;
}

// Calendriers abonnés : relus au plus une fois toutes les 20 h, sinon repris du cache Firestore.
// Un abonnement illisible n'empêche jamais la lecture des agendas.
async function abonnements(ICAL, fs, config, du, au) {
  const liste = (config.sources && config.sources.abonnements) || [];
  if (!liste.length) return { parJour: {}, bilan: { etat: 'non configuré' } };
  const cache = (await fs.lire('vision/agenda/sources/abonnements')) || {};
  const age = cache.lu ? Date.now() - new Date(cache.lu).getTime() : Infinity;
  if (age < 20 * 3600 * 1000 && cache.parJour) return { parJour: cache.parJour, bilan: { cache: true } };
  const parJour = {}; let ok = 0, ko = 0;
  for (const ab of liste) {
    try {
      const evs = lireAgenda(ICAL, await telecharger(ab.nom, ab.url), du, au);
      for (const [j, l] of Object.entries(evs)) (parJour[j] = parJour[j] || []).push(...l.map(e => ({ ...e, source: ab.nom })));
      ok++;
    } catch (e) { ko++; }
  }
  if (ok) await fs.ecrire([{ chemin: 'vision/agenda/sources/abonnements', donnees: { lu: new Date().toISOString(), parJour } }]);
  return { parJour: ok ? parJour : (cache.parJour || {}), bilan: { lus: ok, echecs: ko } };
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
    // Sources secondaires : leur échec est noté mais ne bloque pas les agendas des parents.
    let texteC = null, bilanC = { etat: 'non configuré' };
    if (process.env.ICS_C) {
      try { texteC = await telecharger('C', process.env.ICS_C.replace(/^webcal:/, 'https:')); bilanC = { lu: true }; }
      catch (e) { bilanC = { erreur: String(e.message).slice(0, 120) }; }
    }
    let ab = { parJour: {}, bilan: { etat: 'non configuré' } };
    try { ab = await abonnements(ICAL, fs, config, du, au); } catch (e) { ab.bilan = { erreur: String(e.message).slice(0, 120) }; }
    const jours = construireJours(ICAL, { texteA, texteB, texteVacances, texteC, abonnes: ab.parJour }, du, au);

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
        vacances: urlVacances ? { jours: Object.values(jours).filter(x => x.vacances).length } : { etat: 'non configuré' },
        C: { ...bilanC, evenements: compte('C') }, abonnements: ab.bilan
      },
      erreur: null
    };
    ecritures.push({ chemin: 'vision/etat', donnees: { agendas: bilan }, champsModifies: ['agendas'] });
    await fs.ecrire(ecritures);
    console.log(`Agendas : ${bilan.ecrits} jours écrits, ${bilan.inchanges} inchangés ; ` +
      `${bilan.sources.A.evenements} + ${bilan.sources.B.evenements} occurrences ; ` +
      `calendrier commun : ${bilan.sources.C.erreur ? 'échec' : bilan.sources.C.lu ? bilan.sources.C.evenements + ' occurrences (avec abonnements)' : 'non configuré'} ; ` +
      `abonnements : ${JSON.stringify(bilan.sources.abonnements)} ; ${Date.now() - t0} ms`);
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
