// Tâche : menu de la cantine, lu une fois par jour sur le site du prestataire avec un navigateur
// sans écran (le Chrome déjà installé sur les machines de GitHub, piloté par playwright-core).
// Écrit vision/cantine = { lu, ecole: { 'AAAA-MM-JJ': [plats] }, loisirs: { … } }.
//
// Les noms (commune, école, accueil de loisirs) viennent de vision/config.famille.cantine :
// { commune, ecole, loisirs, convives } ; aucun nom de lieu dans le dépôt ni dans les journaux.
// Journaux : des comptes seulement. Une erreur n'efface jamais le menu déjà enregistré.
import { pathToFileURL } from 'node:url';
import { connecter } from './firestore.mjs';
import { lireMenus } from './cantine.js';

const SITE = 'https://www.papillote-et-cie.fr/nutrition/nos-menus/';
const echapper = s => new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

// Un passage par jour, à partir de 5 h (heure de Paris).
export function aFaire(cache, maintenant = new Date()) {
  const h = parseInt(maintenant.toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }), 10);
  if (h < 5) return false;
  if (!cache || !cache.lu) return true;
  const jourLu = new Date(cache.lu).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  return jourLu !== maintenant.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

async function lireSite(page, commune, type, etab, convives) {
  await page.goto(SITE, { waitUntil: 'networkidle', timeout: 60000 });
  const choisir = async re => {
    for (const s of await page.$$('select')) {
      const opts = await s.$$eval('option', os => os.map(o => ({ v: o.value, t: o.textContent.trim() })));
      const o = opts.find(x => re.test(x.t));
      if (o) { await s.selectOption(o.v); await page.waitForTimeout(2500); return true; }
    }
    return false;
  };
  for (const [nom, re] of [['commune', echapper(commune)], ['type', type], ['établissement', echapper(etab)], ['convives', echapper(convives)]]) {
    if (!(await choisir(re))) throw new Error(`liste « ${nom} » : choix introuvable`);
  }
  await page.waitForTimeout(4000);
  return page.innerText('main').catch(() => page.innerText('body'));
}

export async function executer() {
  const t0 = Date.now();
  const fs = await connecter(JSON.parse(process.env.FIREBASE_SA));
  const cache = await fs.lire('vision/cantine');
  if (!aFaire(cache) && !process.env.FORCER) { console.log('cantine : déjà lue aujourd\'hui'); return; }
  const config = await fs.lire('vision/config');
  const c = config && config.famille && config.famille.cantine;
  if (!c || !c.commune) { console.log('cantine : non configurée (famille.cantine)'); return; }

  const { chromium } = await import('playwright-core');
  const navigateur = await chromium.launch({ channel: 'chrome' });
  const limite = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);   // 2 semaines d'historique
  const garder = j => j >= limite;
  const res = { lu: new Date().toISOString() }, bilan = {};
  try {
    for (const [cle, type, etab] of [['ecole', /^école$/i, c.ecole], ['loisirs', /^accueil de loisirs$/i, c.loisirs]]) {
      if (!etab) continue;
      const anciens = Object.fromEntries(Object.entries((cache && cache[cle]) || {}).filter(([j]) => garder(j)));
      try {
        const page = await navigateur.newPage();
        const menus = lireMenus(await lireSite(page, c.commune, type, etab, c.convives || 'maternelle'));
        await page.close();
        res[cle] = { ...anciens, ...menus };
        bilan[cle] = Object.keys(menus).length;
      } catch (e) {
        res[cle] = anciens;
        bilan[cle] = 'erreur : ' + String(e.message).slice(0, 80);
      }
    }
  } finally { await navigateur.close(); }
  // Rien de lu nulle part : on garde le cache (et sa date) pour réessayer au passage suivant.
  if (!Object.values(bilan).some(v => typeof v === 'number' && v > 0)) {
    console.log(`cantine : aucun menu lu (${JSON.stringify(bilan)}), ${Date.now() - t0} ms`);
    process.exitCode = 1;
    return;
  }
  await fs.ecrire([{ chemin: 'vision/cantine', donnees: res }]);
  console.log(`cantine : jours avec menu ${JSON.stringify(bilan)} ; ${Date.now() - t0} ms`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  executer().catch(e => { console.log('cantine : échec (' + e.name + ')'); process.exitCode = 1; });
}
