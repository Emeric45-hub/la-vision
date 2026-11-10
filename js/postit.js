// Post-it familial : un seul, partagé (document vision/postit). Dessin au doigt et texte,
// modifiables depuis tous les écrans ; affiché sur l'accueil et dans l'onglet « Post-it » du téléphone.
// Données : { traits: [{ c: couleur, e: épaisseur, g: gomme, p: "x,y;x,y…" }], texte, le }
// (coordonnées entières de 0 à 1000, indépendantes de la taille d'affichage).
import { el } from "./outils.js";

export const COULEURS = ["#1D1D1F", "#E3261F", "#2E7DF0", "#2E9E4F", "#E85A9B"];
export const EPAISSEURS = [7, 18];
const GOMME = 34;
const MAX_POINTS = 30000;   // garde le document bien sous la limite de Firestore

let C = null;
const S = { donnees: null, lu: false, montes: new Set() };

export function initPostit(ctx) {
  C = ctx;
  if (S.stop || !C.db) return;
  S.stop = C.F.onSnapshot(C.F.doc(C.db, "vision", "postit"), { includeMetadataChanges: true }, snap => {
    if (snap.metadata.fromCache && !snap.exists() && !S.lu) return;   // cache vide : pas une absence
    S.lu = true;
    S.donnees = snap.exists() ? snap.data() : {};
    for (const m of [...S.montes]) { if (!m.isConnected) S.montes.delete(m); else remplir(m); }
  }, () => {});
}

// Points « x,y;x,y » ↔ tableau [[x,y], …]
export const decoder = p => (p || "").split(";").filter(Boolean).map(c => c.split(",").map(Number));
export const encoder = pts => pts.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(";");

// Dessine les traits sur un canvas (fond transparent : le jaune du post-it est en dessous).
export function dessiner(canvas, traits) {
  const g = canvas.getContext("2d"), k = canvas.width / 1000;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.lineCap = "round"; g.lineJoin = "round";
  for (const t of traits || []) {
    const pts = Array.isArray(t.pts) ? t.pts : decoder(t.p);
    if (!pts.length) continue;
    g.globalCompositeOperation = t.g ? "destination-out" : "source-over";
    g.strokeStyle = t.c || COULEURS[0]; g.fillStyle = g.strokeStyle;
    g.lineWidth = (t.g ? GOMME : t.e || EPAISSEURS[0]) * k;
    if (pts.length === 1) { g.beginPath(); g.arc(pts[0][0] * k, pts[0][1] * k, g.lineWidth / 2, 0, 2 * Math.PI); g.fill(); continue; }
    g.beginPath(); g.moveTo(pts[0][0] * k, pts[0][1] * k);
    for (let i = 1; i < pts.length - 1; i++) {   // courbes lissées entre les milieux
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      g.quadraticCurveTo(pts[i][0] * k, pts[i][1] * k, mx * k, my * k);
    }
    const d = pts[pts.length - 1]; g.lineTo(d[0] * k, d[1] * k);
    g.stroke();
  }
  g.globalCompositeOperation = "source-over";
}

// Heure du dernier enregistrement : « 18h12 » aujourd'hui, « mar. 18h12 » avant.
function quand(ts) {
  const d = ts && ts.toDate ? ts.toDate() : null;
  if (!d) return "";
  const p = x => d.toLocaleString("fr-FR", { timeZone: "Europe/Paris", ...x });
  const jour = x => x.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  const h = p({ hour: "2-digit", minute: "2-digit" }).replace(":", "h");
  return jour(d) === jour(new Date()) ? h : `${p({ weekday: "short" })} ${h}`;
}

/* ---------- Le post-it affiché ---------- */
// Renvoie un post-it qui se met à jour seul ; un toucher ouvre l'éditeur.
export function postit(classe = "") {
  const p = el("button", "pi " + classe);
  p.type = "button"; p.setAttribute("aria-label", "Post-it : dessiner ou écrire");
  p.onclick = ouvrirEditeur;
  S.montes.add(p);
  remplir(p);
  return p;
}

function remplir(p) {
  const d = S.donnees;
  p.replaceChildren(el("span", "pi-scotch"));
  if (!S.lu) { p.append(el("span", "pi-attente", "…")); return; }
  const cv = el("canvas", "pi-dessin");
  cv.width = 600; cv.height = 600;
  dessiner(cv, d.traits);
  p.append(cv);
  if (d.texte) p.append(el("span", "pi-texte", d.texte));
  if (!d.texte && !(d.traits && d.traits.length)) p.append(el("span", "pi-vide", "Toucher pour dessiner ou écrire"));
  const q = quand(d.le);
  if (q && (d.texte || (d.traits && d.traits.length))) p.append(el("span", "pi-heure", q));
}

/* ---------- Éditeur (fenêtre au centre de l'écran) ---------- */
export function ouvrirEditeur() {
  if (!C || !C.db || document.querySelector(".pi-fenetre-fond")) return;
  const d = S.donnees || {};
  let traits = (d.traits || []).map(t => ({ ...t, pts: decoder(t.p) }));
  let couleur = COULEURS[0], epaisseur = EPAISSEURS[0], gomme = false, modifie = false;

  const fond = el("div", "ac-fenetre-fond pi-fenetre-fond");
  const f = el("div", "ac-fenetre pi-fenetre");
  f.setAttribute("role", "dialog"); f.setAttribute("aria-modal", "true"); f.setAttribute("aria-label", "Post-it");

  // Outils
  const outils = el("div", "pi-outils");
  const pastilles = COULEURS.map(c => {
    const b = el("button", "pi-couleur"); b.type = "button"; b.style.background = c; b.setAttribute("aria-label", "Couleur");
    b.onclick = () => { couleur = c; gomme = false; maj(); };
    return b;
  });
  const traitsBtn = EPAISSEURS.map((e, i) => {
    const b = el("button", "pi-outil", i ? "Gros" : "Fin"); b.type = "button";
    b.onclick = () => { epaisseur = e; gomme = false; maj(); };
    return b;
  });
  const gommeBtn = el("button", "pi-outil", "Gomme"); gommeBtn.type = "button"; gommeBtn.onclick = () => { gomme = true; maj(); };
  const annulerBtn = el("button", "pi-outil", "↶"); annulerBtn.type = "button"; annulerBtn.setAttribute("aria-label", "Annuler le dernier trait");
  annulerBtn.onclick = () => { traits.pop(); modifie = true; rendre(); };
  const effacerBtn = el("button", "pi-outil", "Tout effacer"); effacerBtn.type = "button";
  effacerBtn.onclick = () => {
    if (effacerBtn.dataset.ok) { traits = []; texte.value = ""; modifie = true; rendre(); delete effacerBtn.dataset.ok; effacerBtn.textContent = "Tout effacer"; return; }
    effacerBtn.dataset.ok = "1"; effacerBtn.textContent = "Confirmer ?";
    setTimeout(() => { delete effacerBtn.dataset.ok; effacerBtn.textContent = "Tout effacer"; }, 3000);
  };
  outils.append(...pastilles, ...traitsBtn, gommeBtn, annulerBtn, effacerBtn);
  function maj() {
    pastilles.forEach((b, i) => b.classList.toggle("actif", !gomme && COULEURS[i] === couleur));
    traitsBtn.forEach((b, i) => b.classList.toggle("actif", !gomme && EPAISSEURS[i] === epaisseur));
    gommeBtn.classList.toggle("actif", gomme);
  }

  // Zone de dessin
  const zone = el("div", "pi pi-grand");
  const cv = el("canvas", "pi-dessin");
  zone.append(cv);
  const ajuster = () => { const r = zone.getBoundingClientRect(); const px = Math.round(r.width * (window.devicePixelRatio || 1)); cv.width = px; cv.height = px; rendre(); };
  const rendre = () => dessiner(cv, traits);
  let enCours = null;
  const pos = e => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(1000, (e.clientX - r.left) / r.width * 1000)), Math.max(0, Math.min(1000, (e.clientY - r.top) / r.height * 1000))]; };
  cv.addEventListener("pointerdown", e => {
    e.preventDefault(); cv.setPointerCapture(e.pointerId);
    enCours = { c: couleur, e: epaisseur, g: gomme, pts: [pos(e)] };
    traits.push(enCours); modifie = true; rendre();
  });
  cv.addEventListener("pointermove", e => {
    if (!enCours) return;
    const [x, y] = pos(e), [px, py] = enCours.pts[enCours.pts.length - 1];
    if (Math.hypot(x - px, y - py) < 3) return;   // allège le tracé
    enCours.pts.push([x, y]); rendre();
  });
  const fin = () => { enCours = null; };
  cv.addEventListener("pointerup", fin); cv.addEventListener("pointercancel", fin);

  const texte = el("input", "note ac-fenetre-champ"); texte.type = "text"; texte.maxLength = 80;
  texte.placeholder = "Un mot (facultatif)"; texte.value = d.texte || "";
  texte.oninput = () => { modifie = true; };

  const msg = el("p", "ac-aide", "");
  const pied = el("div", "ac-fenetre-pied");
  const fermerBtn = el("button", "bouton secondaire", "Fermer"); fermerBtn.type = "button";
  const ok = el("button", "bouton", "Enregistrer"); ok.type = "button";
  pied.append(fermerBtn, ok);
  f.append(outils, zone, texte, msg, pied);
  fond.append(f);
  document.body.append(fond);
  maj(); ajuster();
  window.addEventListener("resize", ajuster);

  const fermer = () => { fond.remove(); window.removeEventListener("resize", ajuster); document.removeEventListener("keydown", echap); };
  const echap = e => { if (e.key === "Escape") fermerBtn.click(); };
  document.addEventListener("keydown", echap);
  fermerBtn.onclick = () => {
    if (modifie && !fermerBtn.dataset.ok) { fermerBtn.dataset.ok = "1"; fermerBtn.textContent = "Fermer sans enregistrer ?"; return; }
    fermer();
  };
  ok.onclick = async () => {
    const enreg = traits.filter(t => t.pts.length).map(t => ({ c: t.c, e: t.e, g: !!t.g, p: encoder(t.pts) }));
    const n = traits.reduce((s, t) => s + t.pts.length, 0);
    if (n > MAX_POINTS) { msg.textContent = "Dessin trop chargé : efface une partie avant d'enregistrer."; return; }
    ok.disabled = true; msg.textContent = "Enregistrement…";
    try {
      await C.F.setDoc(C.F.doc(C.db, "vision", "postit"), { traits: enreg, texte: texte.value.trim(), le: C.F.serverTimestamp() });
      fermer();
    } catch (e) { ok.disabled = false; msg.textContent = `Non enregistré (${e.code || e.name}).`; }
  };
}

/* ---------- Onglet du téléphone ---------- */
export function afficherPostit() {
  const racine = document.getElementById("vue-postit");
  if (!racine) return;
  const c = el("div", "carte pi-page");
  c.append(postit("pi-page-postit"), el("p", "ac-aide", "Touche le post-it pour dessiner ou écrire. Il s'affiche aussi sur l'iPad."));
  racine.replaceChildren(c);
}
