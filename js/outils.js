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

// Un bloc garde sa taille ; s'il déborde, son contenu défile à l'intérieur et un fondu en bas
// signale qu'il reste à voir (classe « deborde »).
export function surveillerDebord(e) {
  if (!e || e.dataset.surveille) return;
  e.dataset.surveille = "1";
  const maj = () => e.classList.toggle("deborde", e.scrollHeight - e.scrollTop - e.clientHeight > 4);
  e.addEventListener("scroll", maj, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(maj).observe(e);
  requestAnimationFrame(maj);
}

/* ---------- Icônes de la barre du haut (dessins au trait, mêmes sur tous les appareils) ---------- */
const SVG = d => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICONES = {
  maison: SVG('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v11h14V9"/><path d="M10 20v-6h4v6"/>'),
  camera: SVG('<rect x="3" y="7" width="13" height="10" rx="2"/><path d="m16 11 5-3v8l-5-3"/>'),
  menu: SVG('<path d="M6 3v7a2 2 0 0 0 4 0V3"/><path d="M8 3v18"/><path d="M17 21V3c-2.2 1.6-3 4.6-3 8h3"/>'),
  roue: SVG('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>')
};

export function boutonIcone(icone, libelle, action) {
  const b = el("button", "ac-pilule ac-icone");
  b.type = "button"; b.innerHTML = icone; b.title = libelle; b.setAttribute("aria-label", libelle);
  b.onclick = action;
  return b;
}

// Raccourcis de l'appareil (famille.boutons = [{ libelle, dessin | icone, raccourci }]), lancés par
// shortcuts:// (le Raccourci doit exister sur l'appareil lui-même).
export function boutonsRaccourcis(fam) {
  return ((fam && fam.boutons) || []).map(x => {
    const dessin = ICONES[x.dessin] || ICONES[{ "🏠": "maison", "📹": "camera" }[x.icone]];
    const b = el("a", "ac-pilule ac-raccourci" + (dessin ? " ac-icone" : ""), dessin ? "" : x.libelle);
    if (dessin) { b.innerHTML = dessin; b.setAttribute("aria-label", x.libelle); b.title = x.libelle; }
    b.href = "shortcuts://run-shortcut?name=" + encodeURIComponent(x.raccourci);
    return b;
  });
}
