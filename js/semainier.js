// Lecteur du semainier Excel (planning hospitalier hebdomadaire).
//
// Logique reprise à l'identique de l'app AgendaPro (lireFeuille, construireJour,
// traiter). Seule différence : les constantes propres à la personne (initiales,
// horaires, libellés, lieux, date d'ancrage) ne sont plus écrites dans le code ;
// elles arrivent dans `P`, lu depuis la configuration Firestore.
//
// P = {
//   initiales: "AB",
//   horaires: { permanence:[d,f], visite, blocJournee, blocMatin, blocAprem, blocRobot,
//               orthoTot, orthoTard, csMatin, csAprem, repos, staff, garde,
//               siteCsMatin, siteCsAprem, siteBloc },
//   staffs: { "4": "Titre du staff du jeudi", ... },    // clé = jour (0 = dimanche)
//   salles: "^(S\\s*\\d+|ECHO\\s*\\d+)$",                // source de l'expression régulière
//   autres: { "LIBELLÉ": "Intitulé affiché", ... },
//   ancre: "AAAA-MM-JJ",                                 // un lundi de semaine « courte »
//   site: { motif: "SOURCE_REGEX", lieu: "Nom du site" } // site secondaire
// }

const norm = v => (v === null || v === undefined) ? "" : String(v).replace(/\s+/g, " ").trim();
const pad = n => String(n).padStart(2, "0");
export const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const minuit = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

function toDate(v) {
  if (v instanceof Date) return new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
  if (typeof v === "number") {
    const d = new Date(Date.UTC(1899, 11, 30 + Math.floor(v)));
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  return null;
}

// Prépare les réglages une fois pour toutes (expressions régulières, ancre).
export function preparer(P) {
  if (!P || !P.initiales || !P.horaires || !P.ancre || !P.site) {
    throw new Error("Configuration du semainier incomplète (initiales, horaires, ancre, site).");
  }
  const [a, m, j] = P.ancre.split("-").map(Number);
  return {
    INITIALES: String(P.initiales).toUpperCase(),
    H: P.horaires,
    STAFFS: P.staffs || {},
    SALLES: new RegExp(P.salles || "^$", "i"),
    AUTRES: P.autres || {},
    ANCRE: Date.UTC(a, m - 1, j),
    SITE: new RegExp(P.site.motif, "i"),
    LIEU: P.site.lieu || ""
  };
}

function semaineCourte(R, d) {
  const l = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return Math.round((l - R.ANCRE) / 604800000) % 2 === 0;
}
function mentionne(R, v) {
  const s = norm(v);
  return s ? s.split(/[^A-Za-zÀ-ÿ0-9]+/).some(t => t.toUpperCase() === R.INITIALES) : false;
}
function docteurJunior(v) {
  const m = norm(v).match(/DJ\s+([A-Z]{1,3})/i);
  return m ? m[1].toUpperCase() : null;
}

export function lireFeuille(XLSX, R, ws, num) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
  const lab = i => norm(rows[i] && rows[i][0]).toUpperCase();

  let iGarde = -1, iStatut = -1; const iBloc = [];
  for (let i = 0; i < rows.length; i++) {
    const L = lab(i);
    if (L === "GARDE" && iGarde < 0) iGarde = i;
    if (L === "BLOC") iBloc.push(i);
    if (L === R.INITIALES && iGarde >= 0 && iStatut < 0) iStatut = i;
  }
  if (iGarde < 0 || iBloc.length < 2) throw new Error("Structure inattendue dans « Semaine " + num + " ».");

  const debutAprem = iBloc[1];
  const dates = [];
  for (let c = 1; c <= 7; c++) dates.push(toDate(rows[1] && rows[1][c]));

  const collecte = (from, to) => {
    const parJour = [[], [], [], [], [], [], []];
    let dernier = "";
    for (let i = from; i < to; i++) {
      if (!rows[i]) continue;
      const brut = norm(rows[i][0]);
      if (brut) dernier = brut;
      for (let c = 1; c <= 7; c++) if (mentionne(R, rows[i][c])) parJour[c - 1].push({ label: dernier, valeur: norm(rows[i][c]) });
    }
    return parJour;
  };

  const gardes = [], statuts = [];
  for (let c = 1; c <= 7; c++) {
    gardes.push(mentionne(R, rows[iGarde] && rows[iGarde][c]));
    statuts.push(iStatut >= 0 ? norm(rows[iStatut] && rows[iStatut][c]) : "");
  }
  return { num, dates, matin: collecte(2, debutAprem), aprem: collecte(debutAprem, iGarde), gardes, statuts };
}

export function construireJour(R, date, matin, aprem, garde, statut) {
  const H = R.H;
  const courte = semaineCourte(R, date);
  const ev = [];
  const push = (titre, h, cls, note) => ev.push({ titre, debut: h ? h[0] : null, fin: h ? h[1] : null, cls, note: note || null });
  const S = statut.toUpperCase();
  const jour = date.getDay();

  if (garde) push("Garde", H.garde, "garde");

  const staff = () => { if (R.STAFFS[jour]) push(R.STAFFS[jour], H.staff, "staff"); };

  if (S === "CA") { push("Congés", null, "off"); return ev; }
  if (S === "CN") { push("Congé de naissance", null, "off"); return ev; }
  if (S === "AT") { push("Arrêt de travail", null, "off"); return ev; }
  if (S === "FMC") { push("FMC", null, "fmc"); return ev; }
  if (S === "RS" || S === "RSN") { push("Repos de sécurité", H.repos, "off"); return ev; }
  if (S === "0.9" || statut === "0,9") { push("Non travaillé (90 %)", null, "off"); return ev; }
  if (S === "ROBOT") { push("Bloc robot", H.blocRobot, "bloc"); staff(); return ev; }

  if (R.SITE.test(statut)) {
    push("Consultations", H.siteCsMatin, "cs", R.LIEU);
    if (courte) push("Bloc opératoire", H.siteBloc, "bloc", R.LIEU);
    else push("Consultations", H.siteCsAprem, "cs", R.LIEU);
    return ev;
  }

  const a = re => matin.some(x => re.test(x.label));
  const b = re => aprem.some(x => re.test(x.label));

  const perm = matin.find(x => /^PERMANENCE$/i.test(x.label));
  if (perm) {
    const dj = docteurJunior(perm.valeur);
    push("Permanence", H.permanence, "perm", dj ? "supervision DJ " + dj : null);
  }

  const visite = a(/^GYNECO$/i);
  if (visite) push("Visite gynéco", H.visite, "visite");

  const bM = a(/^BLOC$/i), bA = b(/^BLOC$/i);
  if (bM && bA) push("Bloc opératoire", H.blocJournee, "bloc");
  else if (bM) push("Bloc opératoire", H.blocMatin, "bloc");
  else if (bA) push("Bloc opératoire", H.blocAprem, "bloc");

  if (a(/ORTHO BLOC/i)) push("Bloc orthogénie", visite ? H.orthoTard : H.orthoTot, "bloc");
  if (b(/^ORTHOGENIE$/i)) push("Consultation orthogénie", H.csAprem, "cs");

  const salles = (liste, h) => liste.forEach(x => {
    if (R.SALLES.test(x.label)) push("Consultations", h, "cs", x.label.replace(/\s+/g, " "));
    else { const n = R.AUTRES[x.label.toUpperCase()]; if (n) push(n, h, "cs"); }
  });
  if (!perm) {
    salles(matin, H.csMatin);
    salles(aprem, H.csAprem);
  }

  matin.concat(aprem).forEach(x => {
    if (/[<>]/.test(x.valeur)) push("À vérifier : " + x.valeur, null, "off", x.label);
  });

  if (ev.some(e => e.cls !== "garde")) staff();
  return ev;
}

// Lit tout le classeur. Renvoie les jours à partir d'aujourd'hui qui ont au moins
// un événement : [{date: "AAAA-MM-JJ", semaine, evenements: [...]}], triés par date.
export function lireClasseur(XLSX, buf, P, maintenant = new Date()) {
  const R = preparer(P);
  const wb = XLSX.read(buf, { type: "array" });   // pas de cellDates : conversion maison, insensible au fuseau
  const auj = minuit(maintenant);
  const res = [];
  wb.SheetNames.forEach(nom => {
    const m = nom.match(/^Semaine\s+(\d+)$/i);
    if (!m) return;
    const num = parseInt(m[1], 10);
    const f = lireFeuille(XLSX, R, wb.Sheets[nom], num);
    const fin = f.dates[6] || f.dates[4];
    if (!fin || fin < auj) return;
    for (let i = 0; i < 7; i++) {
      const d = f.dates[i];
      if (!d || d < auj) continue;
      const evs = construireJour(R, d, f.matin[i], f.aprem[i], f.gardes[i], f.statuts[i]);
      if (evs.length) {
        evs.sort((x, y) => (x.debut || "").localeCompare(y.debut || ""));
        res.push({ date: iso(d), semaine: num, evenements: evs });
      }
    }
  });
  if (!res.length) throw new Error("Aucune vacation trouvée pour ces initiales à partir d'aujourd'hui. Vérifie que c'est le bon fichier.");
  // Plusieurs feuilles peuvent couvrir la même date : la dernière lue fait foi, comme dans AgendaPro.
  const parDate = {};
  res.forEach(j => { parDate[j.date] = j; });
  return Object.keys(parDate).sort().map(k => parDate[k]);
}
