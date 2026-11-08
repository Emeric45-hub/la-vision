// Petits outils partagés par les écrans de l'app.
import { calculerJour, fusionner, partieValidee } from "../tache/moteur.js";

export const pad = n => String(n).padStart(2, "0");
export const decaler = (d, n) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const aujourdhui = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
export const maintenant = () => new Date().toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
export const canon = v => Array.isArray(v) ? "[" + v.map(canon).join(",") + "]"
  : (v && typeof v === "object") ? "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}"
  : JSON.stringify(v ?? null);
export const propre = v => JSON.parse(JSON.stringify(v));   // retire les « undefined », refusés par Firestore
export const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };

// Lecture d'une plage de documents (identifiants = dates) depuis le serveur.
export async function lirePlage(C, chemin, du, au) {
  const { collection, query, where, documentId, getDocsFromServer } = C.F;
  const q = query(collection(C.db, ...chemin), where(documentId(), ">=", du), where(documentId(), "<=", au));
  const res = {};
  (await getDocsFromServer(q)).forEach(d => { res[d.id] = d.data(); });
  return res;
}

// Jour affiché : calcul local pour aujourd'hui et après, calcul enregistré pour les jours passés,
// puis superposition validé / corrigé. src = { agenda, sem, plan } indexés par date.
export function jourAffiche(d, src, fam) {
  const p = src.plan[d] || {};
  const passe = d < aujourdhui();
  const calc = passe ? (p.calcule || null) : calculerJour({
    date: d, sem: src.sem[d] || null,
    agenda: src.agenda[d] || undefined, agendaVeille: src.agenda[decaler(d, -1)] || undefined,
    saisieB: p.saisies ? p.saisies.B : null, corrige: p.corrige || null
  }, fam);
  const aff = fusionner(calc, p.corrige, p.valide, fam);
  const ecart = !!(calc && p.valide && p.valide.calculeAlors && canon(partieValidee(calc)) !== canon(p.valide.calculeAlors));
  return { d, p, calc, aff, ecart, passe };
}

// Choix d'une heure par listes (heures, minutes par pas de 5) : le sélecteur
// natif <input type="time"> ignore le pas sur Chrome et Safari.
export function heureInput(val, surChange, libelle) {
  const box = el("span", "heure");
  box.setAttribute("role", "group"); box.setAttribute("aria-label", libelle);
  const [h0, m0] = (val || "").split(":");
  const liste = (valeurs, actuel, lib) => {
    const s = document.createElement("select"); s.setAttribute("aria-label", `${libelle} (${lib})`);
    s.append(new Option("––", ""));
    const vs = actuel && !valeurs.includes(actuel) ? [...valeurs, actuel].sort() : valeurs;
    for (const v of vs) s.append(new Option(v, v));
    s.value = actuel || "";
    return s;
  };
  const sh = liste(Array.from({ length: 24 }, (_, i) => pad(i)), h0, "heures");
  const sm = liste(Array.from({ length: 12 }, (_, i) => pad(i * 5)), m0, "minutes");
  Object.defineProperty(box, "value", { get: () => (sh.value && sm.value ? `${sh.value}:${sm.value}` : "") });
  sh.onchange = () => { if (sh.value && !sm.value) sm.value = "00"; if (box.value) surChange(box.value); };
  sm.onchange = () => { if (box.value) surChange(box.value); };
  box.append(sh, el("span", "heure-sep", ":"), sm);
  return box;
}
