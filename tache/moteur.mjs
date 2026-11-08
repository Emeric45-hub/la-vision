// Moteur de règles du planning de garde : calcule, pour un jour de semaine, qui dépose et qui
// récupère, les créneaux chez l'assistante maternelle des deux enfants, la justification et
// les points à vérifier. Fonction pure : aucune lecture ni écriture, tout arrive en paramètres.
//
// Vocabulaire générique (dépôt public) :
//   parent A : planning hospitalier (semainier) + agenda A ; parent B : horaires saisis + agenda B ;
//   enfant e1 : non scolarisé, toujours chez l'assistante maternelle ; enfant e2 : scolarisé.
// Les valeurs réelles (prénoms, heures, motifs) sont dans la configuration (cfg = config.famille).

// ---------- Heures ----------
export const enMin = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
export const enHeure = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
export const arrondiBas = h => enHeure(Math.floor(enMin(h) / 15) * 15);
export const arrondiHaut = h => enHeure(Math.ceil(enMin(h) / 15) * 15);
const plus = (h, min) => enHeure(enMin(h) + min);
const avant = (h1, h2) => enMin(h1) < enMin(h2);
export const affiche = h => h ? h.replace(/^0/, '').replace(':00', 'h').replace(':', 'h') : '?';

const veille = d => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
export const jourSemaine = d => new Date(d + 'T12:00:00Z').getUTCDay();   // 0 = dimanche

// ---------- Statut du parent A ----------
// Bases possibles : chm (journée au lieu de travail principal), site (lieu secondaire), fmc,
// conge, off (jour non travaillé), repos (repos après garde), inconnu. Plus deux drapeaux : gardeSoir et lendemain.
// Une garde est un événement dont le titre correspond au motif et qui commence ce jour
// (événement horaire ou sur la journée entière). Le lendemain se lit dans l'agenda de la veille.
const estGarde = (evs, motif, jour) => { const re = new RegExp(motif, 'i'); return (evs || []).some(e => re.test(e.titre) && e.debut.slice(0, 10) === jour); };

export function statutA(date, sem, agendaA, agendaVeilleA, cfg, points) {
  const gardeSoir = estGarde(agendaA, cfg.A.garde, date);
  let lendemain = estGarde(agendaVeilleA, cfg.A.garde, veille(date));

  let base = 'inconnu';
  const evs = sem ? sem.evenements : [];
  const titres = evs.map(e => e.titre);
  if (!sem) base = 'inconnu';
  else if (titres.some(t => cfg.A.semainier.repos.includes(t))) { base = 'repos'; lendemain = true; }
  else if (titres.some(t => cfg.A.semainier.off.includes(t))) base = 'off';
  else if (titres.some(t => cfg.A.semainier.conge.includes(t))) base = 'conge';
  else if (evs.some(e => e.note === cfg.A.site.lieu)) base = 'site';
  else if (titres.includes('FMC')) base = 'fmc';
  else if (evs.some(e => e.cls !== 'garde')) base = 'chm';

  const gardeSemainier = evs.some(e => e.cls === 'garde');
  if (sem && gardeSemainier !== gardeSoir) {
    points.push(gardeSoir
      ? `Garde de ${cfg.A.prenom} dans son agenda mais pas dans le semainier`
      : `Garde de ${cfg.A.prenom} dans le semainier mais pas dans son agenda`);
  }
  if (base === 'inconnu') points.push(`Planning de ${cfg.A.prenom} inconnu ce jour`);
  if (base === 'fmc') points.push(`${cfg.A.prenom} en formation : horaires à vérifier`);
  return { base, gardeSoir, lendemain, aLaMaison: base === 'conge' || base === 'off' };
}

// ---------- Statut du parent B ----------
export function statutB(date, agendaB, agendaVeilleB, saisie, cfg) {
  const garde = estGarde(agendaB, cfg.B.garde, date);
  const lendemain = estGarde(agendaVeilleB, cfg.B.garde, veille(date));
  // Congé ou repos notés dans l'agenda (titres configurés), sauf si une saisie dit autre chose
  const noteAgenda = motif => motif ? agendaB.some(e => new RegExp(motif, 'i').test(e.titre.trim())) : false;
  const s = saisie || (noteAgenda(cfg.B.conge) ? { type: 'conge' } : noteAgenda(cfg.B.repos) ? { type: 'repos' } : {});
  const type = garde ? 'garde' : lendemain ? 'lendemain'
    : s.type === 'travail' && s.debut && s.fin ? 'travail'
    : s.type === 'repos' ? 'repos' : s.type === 'conge' ? 'conge' : 'a_saisir';
  return { type, debut: type === 'travail' ? s.debut : null, fin: type === 'travail' ? s.fin : null };
}

// ---------- Lieu de l'enfant scolarisé pendant les vacances ----------
function modeVacances(agendaB, cfg, corrige) {
  const m = cfg.motsVacances;
  const reConges = new RegExp(cfg.nounou.conges, 'i');
  for (const e of agendaB) {
    const t = e.titre;
    if (reConges.test(t)) continue;                       // « congés de l'assistante maternelle » ≠ « chez l'assistante maternelle »
    for (const mode of ['alae', 'centre', 'nounou']) if (m[mode] && new RegExp(m[mode], 'i').test(t)) return mode;   // motif absent = ignoré
  }
  return corrige && corrige.e2 ? corrige.e2 : null;
}

// ---------- Calcul d'un jour ----------
// entree = { date, sem, agenda: {A, B, vacances, ferie}, saisieB, corrige }
// Renvoie null pour un samedi ou un dimanche.
function calculerBase(entree, cfg) {
  const { date, sem, saisieB, corrige } = entree;
  const ag = entree.agenda || { A: [], B: [], vacances: null, ferie: null };
  const agV = entree.agendaVeille || { A: [], B: [] };
  const A = ag.A || [], B = ag.B || [];
  const js = jourSemaine(date);
  if (js === 0 || js === 6) return null;

  const pA = cfg.A.prenom, pB = cfg.B.prenom, n1 = cfg.enfants.e1.prenom, n2 = cfg.enfants.e2.prenom;
  const points = [], pourquoi = [];
  const sA = statutA(date, sem, A, agV.A || [], cfg, points);
  const sB = statutB(date, B, agV.B || [], saisieB, cfg);
  const E = cfg.ecole;
  const vacances = ag.vacances || null, ferie = ag.ferie || null;
  const reConges = new RegExp(cfg.nounou.conges, 'i');
  const nounouEnConges = A.concat(B).some(e => reConges.test(e.titre));
  const nounouOuverte = cfg.nounou.jours.includes(js) && !ferie && !nounouEnConges;
  const exception = (E.exceptions || {})[date.slice(5)] || {};

  const res = {
    date, jour: js, ferie, vacances,
    A: { statut: sA.base, gardeSoir: sA.gardeSoir, lendemain: sA.lendemain },
    B: { statut: sB.type, debut: sB.debut, fin: sB.fin },
    depot: null, recup: null, e1: null, e2: null,
    justification: pourquoi, points
  };
  if (sA.gardeSoir && sB.type === 'garde') points.push(`${pA} et ${pB} de garde le même jour`);

  // Jour férié, congés de l'assistante maternelle
  if (ferie) { points.length = 0; pourquoi.push(`Férié : ${ferie}`); res.e2 = { mode: 'maison', creneaux: [] }; return res; }
  const ecole = !vacances && E.jours.includes(js);
  const mercrediScolaire = !vacances && js === E.mercredi.jour;
  if (!nounouOuverte) {
    pourquoi.push(nounouEnConges ? "Assistante maternelle en congés" : "Assistante maternelle fermée");
    if (!(sA.aLaMaison || ['repos', 'conge'].includes(sB.type))) points.push("Assistante maternelle fermée : qui garde les enfants ?");
    res.e2 = { mode: ecole ? 'ecole' : 'maison', creneaux: [] };
    return res;
  }

  // ---------- Mercredi en période scolaire ----------
  if (mercrediScolaire) {
    let qui;
    if (sA.aLaMaison) qui = 'A';
    else if (sB.type !== 'travail' && sB.type !== 'garde') qui = 'B';
    else { qui = 'B'; points.push(`Mercredi : ${pA} et ${pB} travaillent tous les deux ?`); }
    if (sB.type === 'lendemain' && qui === 'B') points.push(`Mercredi lendemain de garde de ${pB} : qui dépose à ${affiche(E.mercredi.e1[0])} ?`);
    const [d, f] = E.mercredi.e1;
    res.depot = { qui, heure: d, aConfirmer: false };
    res.recup = { qui, heure: f, ecole: false, aConfirmer: false };
    res.e1 = { creneaux: [{ debut: d, fin: f }], aConfirmer: false };
    res.e2 = { mode: 'alae', creneaux: [] };
    pourquoi.push(`Mercredi : ${qui === 'A' ? pA : pB} à la maison ; ${n1} ${affiche(d)}–${affiche(f)}, ${n2} à l'accueil de loisirs ${affiche(E.mercredi.alae[0])}–${affiche(E.mercredi.alae[1])}`);
    return res;
  }

  // ---------- Parent B en congé : personne chez l'assistante maternelle ----------
  if (sB.type === 'conge') {
    pourquoi.push(`${pB} en congé : pas d'assistante maternelle`);
    res.e2 = { mode: ecole ? 'ecole' : 'maison', creneaux: [] };
    return res;
  }

  // ---------- Dépôt ----------
  let depot;
  const debutB = sB.type === 'travail' ? arrondiBas(plus(sB.debut, -cfg.B.avantDebut)) : null;
  if (sA.base === 'site' && !sA.lendemain) {
    depot = { qui: 'A', heure: cfg.A.site.depot }; pourquoi.push(`${pA} au site secondaire : il dépose à ${affiche(depot.heure)}`);
  } else if (sB.type === 'lendemain') {
    if (sA.lendemain) { depot = { qui: null, heure: null }; points.push(`Lendemain de garde pour ${pA} et ${pB} : qui dépose ?`); }
    else if (sA.aLaMaison) { depot = { qui: 'A', heure: cfg.A.conge.depot }; pourquoi.push(`Lendemain de garde de ${pB}, ${pA} à la maison : il dépose à ${affiche(depot.heure)}`); }
    else { depot = { qui: 'A', heure: cfg.A.depotTot }; pourquoi.push(`Lendemain de garde de ${pB} : ${pA} dépose les deux enfants à ${affiche(depot.heure)} en partant`); }
  } else if (sA.aLaMaison && !sA.lendemain) {
    depot = { qui: 'A', heure: cfg.A.conge.depot }; pourquoi.push(`${pA} en congé : il dépose à ${affiche(depot.heure)}`);
  } else if (sB.type === 'garde') {
    depot = { qui: 'B', heure: cfg.B.jourGarde.depot }; pourquoi.push(`${pB} de garde : elle dépose à ${affiche(depot.heure)}`);
  } else if (sB.type === 'travail') {
    let h = debutB;
    if (ecole && avant(E.entree, h)) h = E.entree;
    depot = { qui: 'B', heure: h };
    pourquoi.push(`${pB} commence à ${affiche(sB.debut)} : dépôt à ${affiche(h)}`);
  } else {
    depot = { qui: 'B', heure: null };
    points.push(sB.type === 'repos' ? `${pB} en repos : horaires de ${n1} à saisir` : `Horaires de ${pB} à saisir`);
  }
  if (depot.heure && avant(depot.heure, cfg.nounou.ouverture)) points.push(`Dépôt avant ${affiche(cfg.nounou.ouverture)}`);

  // ---------- Récupération ----------
  let recup;
  const finB = sB.type === 'travail' ? arrondiHaut(plus(sB.fin, cfg.B.apresFin)) : null;
  const retourA = sA.gardeSoir ? null
    : sA.lendemain ? cfg.A.lendemainGarde.recup
    : sA.aLaMaison ? cfg.A.conge.recup
    : sA.base === 'site' ? cfg.A.site.retour
    : (sA.base === 'chm' || sA.base === 'fmc') ? cfg.A.chm.retour : null;

  if (sB.type === 'lendemain') {
    recup = { qui: 'B', heure: cfg.B.lendemainGarde.recup }; pourquoi.push(`Lendemain de garde de ${pB} : elle récupère à ${affiche(recup.heure)}`);
  } else if (sB.type === 'garde') {
    if (retourA) { recup = { qui: 'A', heure: retourA }; pourquoi.push(sA.aLaMaison ? `${pA} en congé : il récupère à ${affiche(retourA)}` : `${pB} de garde : ${pA} récupère en rentrant, ${affiche(retourA)}`); }
    else { recup = { qui: null, heure: null }; points.push(`${pB} de garde et ${pA} indisponible le soir : qui récupère ?`); }
  } else if (sB.type === 'repos') {
    recup = { qui: 'B', heure: null };
  } else if (sA.lendemain && !sA.gardeSoir) {
    recup = { qui: 'A', heure: retourA }; pourquoi.push(`Lendemain de garde de ${pA} : il récupère à ${affiche(retourA)}`);
  } else if (sA.aLaMaison && !sA.gardeSoir) {
    recup = { qui: 'A', heure: retourA }; pourquoi.push(`${pA} en congé : il récupère à ${affiche(retourA)}`);
  } else if (sA.base === 'site' && retourA) {
    if (finB && avant(finB, retourA)) { recup = { qui: 'B', heure: finB }; pourquoi.push(`${pB} finit avant le retour de ${pA} : elle récupère à ${affiche(finB)}`); }
    else { recup = { qui: 'A', heure: retourA }; pourquoi.push(`${pA} au site secondaire : il récupère à ${affiche(retourA)}`); }
  } else if (finB) {
    if (avant(cfg.nounou.fermeture, finB)) {
      if (retourA && !avant(cfg.nounou.fermeture, retourA)) { recup = { qui: 'A', heure: retourA }; pourquoi.push(`${pB} finit trop tard : ${pA} récupère à ${affiche(retourA)}`); }
      else { recup = { qui: 'B', heure: finB }; points.push(`Récupération après ${affiche(cfg.nounou.fermeture)}`); }
    } else { recup = { qui: 'B', heure: finB }; pourquoi.push(`${pB} finit à ${affiche(sB.fin)} : récupération à ${affiche(finB)}`); }
  } else {
    recup = { qui: 'B', heure: null };
    if (sB.type === 'a_saisir' && !points.includes(`Horaires de ${pB} à saisir`)) points.push(`Horaires de ${pB} à saisir`);
  }
  // Jour à fermeture anticipée (ex. 24 décembre) : les parents finissent plus tôt.
  if (exception.fin && recup.heure && avant(exception.fin, recup.heure)) {
    recup.heure = exception.fin; pourquoi.push(`Fermeture à ${affiche(exception.fin)} : récupération avancée`);
  }
  // Jour d'école : une récupération avant la sortie se fait à l'école, à la sortie.
  recup.ecole = false;
  if (ecole && recup.heure && !avant(E.sortie, recup.heure)) { recup.heure = E.sortie; recup.ecole = true; }
  if (ecole && sB.type === 'repos') { recup.heure = null; }
  depot.aConfirmer = !depot.heure; recup.aConfirmer = !recup.heure;

  // ---------- Créneaux des enfants ----------
  const fermeture = exception.fin || null;
  res.depot = depot; res.recup = recup;
  res.e1 = depot.heure && recup.heure
    ? { creneaux: [{ debut: depot.heure, fin: recup.heure }], aConfirmer: false }
    : { creneaux: [], aConfirmer: true };

  if (ecole) {
    const cr = [];
    if (sB.type !== 'repos') {
      if (depot.heure && avant(depot.heure, E.entree)) cr.push({ debut: depot.heure, fin: E.entree });
      if (recup.heure && !recup.ecole && avant(E.sortie, recup.heure)) cr.push({ debut: E.sortie, fin: recup.heure });
    }
    res.e2 = { mode: 'ecole', creneaux: cr };
    if (sB.type === 'repos') pourquoi.push(`${pB} en repos : ${n2} à l'école sans périscolaire`);
  } else {
    // Vacances scolaires (ou jour sans école)
    const mode = vacances ? modeVacances(B, cfg, corrige) : 'maison';
    if (!mode) { points.push(`Vacances : où va ${n2} ?`); res.e2 = { mode: null, creneaux: [] }; }
    else if (mode === 'nounou') res.e2 = { mode, creneaux: res.e1.creneaux.slice() };
    else {
      res.e2 = { mode, creneaux: [] };
      const plage = E.vacances[mode];
      if (plage) {
        const fin = fermeture || plage[1];
        if (depot.heure && avant(depot.heure, plage[0])) res.e2.creneaux.push({ debut: depot.heure, fin: plage[0] });
        if (recup.heure && avant(fin, recup.heure)) {
          res.e2.creneaux.push({ debut: fin, fin: recup.heure });
          pourquoi.push(`${mode === 'alae' ? "L'accueil de loisirs" : 'Le centre aéré'} ferme à ${affiche(fin)} : l'assistante maternelle va chercher ${n2}`);
        }
      }
    }
  }
  if (sB.type === 'repos') { res.e1.aConfirmer = true; res.e1.creneaux = []; }
  return res;
}

// ---------- Alertes tirées des agendas ----------
// Le moteur n'interprète pas les rendez-vous (leur effet sur les horaires n'est pas déductible) :
// il les signale. Deux cas :
//  - un événement dont le titre contient le prénom d'un enfant, un jour où cet enfant est confié ;
//  - un événement horaire d'un parent de 12 h ou plus (congrès, formation…) qui n'est pas une garde.
const minutes = s => Date.parse(s.length === 10 ? s + 'T00:00Z' : s + 'Z') / 60000;
const echapper = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function alertes(res, entree, cfg) {
  const ag = entree.agenda || {};
  const reconnus = [cfg.A.garde, cfg.B.garde, cfg.B.conge, cfg.B.repos, cfg.nounou.conges,
    ...Object.values(cfg.motsVacances || {})].filter(Boolean).map(m => new RegExp(m, 'i'));
  const connu = t => reconnus.some(re => re.test(t.trim()));
  const notes = [];
  const enfants = [['e1', cfg.enfants.e1.prenom], ['e2', cfg.enfants.e2.prenom]];
  for (const [cle, prenom] of enfants) {
    const confie = cle === 'e1' ? !!res.e1 : !!(res.e2 && res.e2.mode && res.e2.mode !== 'maison');
    if (!confie) continue;
    const re = new RegExp('(^|[^\\p{L}])' + echapper(prenom) + '($|[^\\p{L}])', 'iu');
    for (const e of (ag.A || []).concat(ag.B || [])) {
      if (!re.test(e.titre) || connu(e.titre) || notes.includes(e.titre)) continue;
      notes.push(e.titre);
      const plage = e.journee ? '' : ` (${affiche(e.debut.slice(11))}–${affiche(e.fin.slice(11))})`;
      res.points.push(`${e.titre}${plage} : horaires de ${prenom} ?`);
    }
  }
  for (const [qui, evs] of [['A', ag.A || []], ['B', ag.B || []]]) {
    for (const e of evs) {
      if (e.journee || connu(e.titre)) continue;
      if (minutes(e.fin) - minutes(e.debut) < 12 * 60) continue;
      const msg = `${e.titre} : ${cfg[qui].prenom} absent${qui === 'B' ? 'e' : ''} ?`;
      if (!res.points.includes(msg)) res.points.push(msg);
    }
  }
  if (notes.length) res.notes = notes;
  return res;
}

export function calculerJour(entree, cfg) {
  const res = calculerBase(entree, cfg);
  if (!res || res.ferie) return res;
  return alertes(res, entree, cfg);
}
