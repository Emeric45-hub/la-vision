// Tests de faisabilité de La Vision.
// Règle : le dépôt est public, donc ce script n'écrit JAMAIS de données personnelles
// dans les journaux. Seulement des comptages, des statuts et des durées.

import fs from 'node:fs';

const resultats = [];
function note(test, ok, detail) {
  resultats.push({ test, ok, detail });
  console.log(`${ok ? 'OK ' : 'ÉCHEC'} · ${test} · ${detail}`);
}

// 1. Agendas Google par adresse secrète iCal
async function testAgenda(nom, url) {
  if (!url) return note(`Agenda ${nom}`, false, 'secret absent');
  try {
    const t0 = Date.now();
    const r = await fetch(url);
    const txt = await r.text();
    if (!r.ok) return note(`Agenda ${nom}`, false, `HTTP ${r.status}`);
    const evenements = (txt.match(/BEGIN:VEVENT/g) || []).length;
    const gardes = (txt.match(/^SUMMARY:.*garde.*$/gim) || []).length;
    const avecNotes = (txt.match(/^DESCRIPTION:.+$/gm) || []).length;
    note(`Agenda ${nom}`, evenements > 0,
      `${evenements} événements lus, ${gardes} titres contenant « garde », ${avecNotes} avec description, ${Date.now() - t0} ms`);
  } catch (e) {
    note(`Agenda ${nom}`, false, `erreur réseau (${e.name})`);
  }
}

// 2. Météo Open-Meteo (Angers)
async function testMeteo() {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=47.47&longitude=-0.55'
      + '&hourly=temperature_2m,precipitation_probability,weather_code&forecast_days=2&timezone=Europe%2FParis';
    const r = await fetch(url);
    const j = await r.json();
    const i8 = j.hourly.time.findIndex(t => t.endsWith('T08:00'));
    note('Météo Open-Meteo', r.ok && i8 >= 0,
      `${j.hourly.time.length} heures reçues ; 8h : ${j.hourly.temperature_2m[i8]} °C, pluie ${j.hourly.precipitation_probability[i8]} %, code ${j.hourly.weather_code[i8]}`);
  } catch (e) {
    note('Météo Open-Meteo', false, `erreur (${e.name})`);
  }
}

// 3. Briefing par l'API Claude, sur des données fictives
async function testClaude() {
  if (!process.env.ANTHROPIC_API_KEY) return note('API Claude', false, 'secret absent');
  const donnees = {
    date: 'mardi 1er décembre',
    emeric: 'Sablé 9h40–17h puis garde 18h → 8h',
    lea: 'cabinet 8h30–18h',
    rose: 'nounou 8h35–18h', lou: 'école, nounou 16h30–18h',
    depot: 'Emeric 8h35', recuperation: 'Léa 18h',
    evenements: [{ heure: '17h', titre: 'Dentiste Lou', notes: 'apporter carnet de santé' }],
    meteo: '8h : 3 °C, sec ; 16h30 : 9 °C',
    diner: 'curry de chou-fleur'
  };
  try {
    const t0 = Date.now();
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5-5',
        max_tokens: 400,
        system: 'Tu rédiges le briefing du matin d’une famille, en français, en 4 phrases maximum, sans liste. Tu cites ce qu’il faut emporter.',
        messages: [{ role: 'user', content: JSON.stringify(donnees) }]
      })
    });
    const j = await r.json();
    if (!r.ok) return note('API Claude', false, `HTTP ${r.status} ${j?.error?.type || ''}`);
    const texte = j.content?.[0]?.text || '';
    note('API Claude', texte.length > 0,
      `${j.usage.input_tokens} jetons en entrée, ${j.usage.output_tokens} en sortie, ${Date.now() - t0} ms`);
    // Données fictives : on peut afficher le briefing produit
    console.log('--- Briefing produit (données fictives) ---\n' + texte);
    fs.writeFileSync('briefing-test.txt', texte);
  } catch (e) {
    note('API Claude', false, `erreur (${e.name})`);
  }
}

// 4. Écriture et relecture dans Firebase (projet existant)
async function testFirebase() {
  if (!process.env.FIREBASE_SA) return note('Firebase', false, 'secret absent');
  try {
    const admin = (await import('firebase-admin')).default;
    const sa = JSON.parse(process.env.FIREBASE_SA);
    admin.initializeApp({ credential: admin.credential.cert(sa) });
    const db = admin.firestore();
    const ref = db.collection('vision_test').doc('ping');
    const t0 = Date.now();
    await ref.set({ at: new Date().toISOString(), source: 'faisabilite' });
    const lu = await ref.get();
    note('Firebase', lu.exists, `écriture puis relecture dans vision_test/ping en ${Date.now() - t0} ms (projet ${sa.project_id})`);
  } catch (e) {
    note('Firebase', false, `erreur (${e.code || e.name})`);
  }
}

// 5. Menu de la cantine (Papillote et Cie) avec un navigateur sans écran
async function testCantine() {
  let browser;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch();
    const page = await browser.newPage();
    const appels = [];
    page.on('response', async (resp) => {
      const u = resp.url();
      if (resp.request().resourceType() === 'xhr' || resp.request().resourceType() === 'fetch') {
        appels.push(`${resp.status()} ${u.split('?')[0]}`);
      }
    });
    await page.goto('https://www.papillote-et-cie.fr/nutrition/nos-menus/', { waitUntil: 'networkidle', timeout: 60000 });
    const selects = await page.$$eval('select', els => els.map(s => ({
      name: s.name || s.id, options: Array.from(s.options).slice(0, 60).map(o => o.textContent.trim())
    })));
    console.log('--- Listes du formulaire ---');
    for (const s of selects) console.log(`${s.name} : ${s.options.length} options, dont Sainte-Gemmes : ${s.options.some(o => /sainte-gemmes/i.test(o))}`);

    // Tentative de sélection pas à pas (libellés vus sur la capture d'Emeric)
    const choisir = async (re) => {
      for (const s of await page.$$('select')) {
        const opts = await s.$$eval('option', os => os.map(o => ({ v: o.value, t: o.textContent.trim() })));
        const o = opts.find(x => re.test(x.t));
        if (o) { await s.selectOption(o.v); await page.waitForTimeout(2500); return true; }
      }
      return false;
    };
    const etapes = [
      ['commune', await choisir(/sainte-gemmes/i)],
      ['type', await choisir(/^école$/i)],
      ['établissement', await choisir(/grands jardins/i)],
      ['convives', await choisir(/maternelle/i)]
    ];
    await page.waitForTimeout(4000);
    const texte = (await page.innerText('main').catch(() => page.innerText('body'))).replace(/\s+\n/g, '\n');
    const jours = (texte.match(/lundi|mardi|jeudi|vendredi/gi) || []).length;
    console.log('--- Appels réseau du site ---\n' + [...new Set(appels)].slice(0, 30).join('\n'));
    console.log('--- Extrait de la page après sélection ---\n' + texte.slice(0, 1500));
    note('Menu cantine', etapes.every(e => e[1]) && jours > 0,
      `sélections : ${etapes.map(e => `${e[0]} ${e[1] ? 'ok' : 'non trouvé'}`).join(', ')} ; ${jours} mentions de jours dans la page`);
  } catch (e) {
    note('Menu cantine', false, `erreur (${e.name}: ${String(e.message).slice(0, 120)})`);
  } finally {
    if (browser) await browser.close();
  }
}

await testAgenda('Emeric', process.env.ICS_EMERIC);
await testAgenda('Léa', process.env.ICS_LEA);
await testMeteo();
await testClaude();
await testFirebase();
await testCantine();

const resume = ['## Tests de faisabilité', '', '| Test | Résultat | Détail |', '|---|---|---|',
  ...resultats.map(r => `| ${r.test} | ${r.ok ? '✅' : '❌'} | ${r.detail} |`)].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, resume + '\n');
console.log('\n' + resume);
