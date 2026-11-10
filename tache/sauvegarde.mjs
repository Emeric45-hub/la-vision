// Tâche : sauvegarde hebdomadaire de Firestore dans un fichier JSON, déposé ensuite par le
// workflow comme pièce jointe du passage (dépôt privé, conservée 90 jours). Le plan gratuit de
// Firebase n'a pas de sauvegarde automatique.
//
// Deux temps : « node sauvegarde.mjs » écrit le fichier (une fois par semaine, sinon sort aussitôt) ;
// « node sauvegarde.mjs --confirmer » note la sauvegarde dans vision/etat.sauvegarde, une fois le
// fichier déposé. Parcours : collections de la racine, leurs documents, les sous-collections de
// ces documents (deux niveaux, ce qui couvre les trois apps du projet).
// Format : { fait, documents: { chemin: champs bruts Firestore } } (valeurs typées, restaurables
// telles quelles). Journaux : des comptes seulement ; le fichier ne quitte jamais le dépôt privé.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { connecter } from './firestore.mjs';
import { exclu, aFaire } from './sauvegarde.js';

const FICHIER = process.env.SAUVEGARDE_FICHIER || 'sauvegarde.json';
const sortie = (cle, valeur) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${cle}=${valeur}\n`); };

export async function exporter(base) {
  const documents = {}; let collections = 0;
  const prendre = async cheminCollection => {
    collections++;
    const docs = (await base.lister(cheminCollection)).filter(d => !exclu(d.chemin));
    for (const d of docs) if (d.champs) documents[d.chemin] = d.champs;
    return docs;
  };
  for (const racine of await base.collections()) {
    for (const d of await prendre(racine)) {
      for (const sous of await base.collections(d.chemin)) {
        if (!exclu(`${d.chemin}/${sous}`)) await prendre(`${d.chemin}/${sous}`);
      }
    }
  }
  return { documents, collections };
}

export async function executer(confirmer) {
  const t0 = Date.now();
  const base = await connecter(JSON.parse(process.env.FIREBASE_SA));
  if (confirmer) {
    const n = Number(process.env.SAUVEGARDE_DOCUMENTS) || 0;
    await base.ecrire([{ chemin: 'vision/etat', donnees: { sauvegarde: { le: { __horodatage: new Date().toISOString() }, documents: n } }, champsModifies: ['sauvegarde'] }]);
    console.log(`sauvegarde : notée (${n} documents)`);
    return;
  }
  const etat = (await base.lire('vision/etat')) || {};
  if (!aFaire(etat.sauvegarde) && !process.env.FORCER) { console.log('sauvegarde : faite cette semaine'); return; }
  const { documents, collections } = await exporter(base);
  const n = Object.keys(documents).length;
  if (!n) throw new Error('aucun document lu');
  const texte = JSON.stringify({ fait: new Date().toISOString(), documents });
  fs.writeFileSync(FICHIER, texte);
  sortie('fait', 'true'); sortie('documents', n);
  sortie('nom', 'sauvegarde-' + new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }));
  console.log(`sauvegarde : ${n} documents, ${collections} collections, ${Math.round(texte.length / 1024)} Ko ; ${Date.now() - t0} ms`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  executer(process.argv.includes('--confirmer')).catch(e => { console.log('sauvegarde : échec (' + String(e.message || e.name).slice(0, 80) + ')'); process.exitCode = 1; });
}
