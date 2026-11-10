// Plan repas : le PDF de la semaine (document vision/repas, déposé par le Raccourci iOS) affiché
// dans une grande fenêtre, page par page avec PDF.js (un PDF brut dans une fenêtre d'app web
// n'affiche souvent que sa première page sur iPad et iPhone). Ouvert à la page de la recette
// d'un plat, avec « On l'a fait ce soir » ; ou à la première page (bouton Recettes).
import { el } from "./outils.js";

// Édition « legacy » : compatible avec les Safari plus anciens (iPad resté en iPadOS 17).
// Copie gardée dans le dépôt (vendor/pdfjs, version 6.2.108) : pas de dépendance à un site tiers,
// et disponible hors connexion. Le CDN ne sert que de secours si la copie locale ne se charge pas.
const LOCAL = new URL("../vendor/pdfjs/", import.meta.url).href;
const CDN = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/legacy/build/";
let pdfjs = null;
async function chargerPdfjs() {
  if (pdfjs) return pdfjs;
  try {
    pdfjs = await import(LOCAL + "pdf.min.js");
    pdfjs.GlobalWorkerOptions.workerSrc = LOCAL + "pdf.worker.min.js";
  } catch (e) {
    pdfjs = await import(CDN + "pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = CDN + "pdf.worker.min.mjs";
  }
  return pdfjs;
}

// ctx : { F, db } ; plat : { repas, page } ou null ; fait : fonction appelée par « On l'a fait ce soir ».
export async function ouvrirRecette(ctx, plat, fait) {
  if (document.querySelector(".rc-fond")) return;
  const fond = el("div", "ac-fenetre-fond rc-fond");
  const f = el("div", "ac-fenetre rc-fenetre");
  f.setAttribute("role", "dialog"); f.setAttribute("aria-modal", "true");
  f.setAttribute("aria-label", plat ? plat.repas : "Plan repas");
  const titre = el("h2", "ac-fenetre-titre", plat ? plat.repas : "Plan repas de la semaine");
  const pages = el("div", "rc-pages");
  const msg = el("p", "ac-attente", "Ouverture du PDF…");
  pages.append(msg);
  const pied = el("div", "ac-fenetre-pied");
  const fermerBtn = el("button", "bouton secondaire", "Fermer"); fermerBtn.type = "button";
  pied.append(fermerBtn);
  if (plat && fait) {
    const ok = el("button", "bouton", "On l'a fait ce soir"); ok.type = "button";
    ok.onclick = async () => { ok.disabled = true; try { await fait(); fermer(); } catch (e) { ok.disabled = false; msg.textContent = `Non enregistré (${e.code || e.name}).`; } };
    pied.append(ok);
  }
  f.append(titre, pages, pied);
  fond.append(f);
  document.body.append(fond);
  let fini = false, secours = null;
  const fermer = () => { fini = true; fond.remove(); document.removeEventListener("keydown", echap); };
  const echap = e => { if (e.key === "Escape") fermer(); };
  document.addEventListener("keydown", echap);
  fermerBtn.onclick = fermer;
  fond.onclick = e => { if (e.target === fond) fermer(); };

  try {
    const snap = await ctx.F.getDoc(ctx.F.doc(ctx.db, "vision", "repas"));
    const d = snap.exists() ? snap.data() : null;
    if (!d || !d.pdf) { msg.textContent = "Le PDF n'a pas encore été envoyé par le Raccourci de l'iPhone."; return; }
    const octets = typeof d.pdf.toUint8Array === "function" ? d.pdf.toUint8Array()
      : Uint8Array.from(atob(String(d.pdf)), c => c.charCodeAt(0));
    secours = octets.slice();   // copie gardée : PDF.js vide le tableau qu'on lui donne
    const lib = await chargerPdfjs();
    const doc = await lib.getDocument({ data: octets }).promise;
    msg.remove();
    const cible = Math.min(Math.max(1, (plat && plat.page) || 1), doc.numPages);
    const largeur = pages.clientWidth || 600, dpr = window.devicePixelRatio || 1;
    // La page de la recette d'abord (visible tout de suite), puis toutes les pages dans l'ordre.
    const cadres = [];
    for (let i = 1; i <= doc.numPages; i++) { const c = el("canvas", "rc-page"); cadres.push(c); pages.append(c); }
    const rendre = async i => {
      const p = await doc.getPage(i);
      const v1 = p.getViewport({ scale: 1 });
      const v = p.getViewport({ scale: (largeur / v1.width) * dpr });
      const c = cadres[i - 1];
      c.width = v.width; c.height = v.height; c.style.aspectRatio = `${v.width} / ${v.height}`;
      await p.render({ canvasContext: c.getContext("2d"), viewport: v, canvas: c }).promise;
    };
    for (let i = 1; i <= cible; i++) cadres[i - 1].style.aspectRatio = "210 / 297";   // réserve la place avant rendu
    await rendre(cible);
    cadres[cible - 1].scrollIntoView({ block: "start" });
    for (let i = 1; i <= doc.numPages && !fini; i++) if (i !== cible) await rendre(i);
  } catch (e) {
    msg.textContent = `Affichage impossible sur cet appareil (${e.name}${e.message ? " : " + String(e.message).slice(0, 80) : ""}).`;
    if (!msg.isConnected) pages.prepend(msg);
    // Secours : la visionneuse PDF du navigateur, dans un nouvel onglet.
    if (secours) {
      const b = el("button", "bouton", "Ouvrir le PDF");
      b.type = "button";
      b.onclick = () => window.open(URL.createObjectURL(new Blob([secours], { type: "application/pdf" })), "_blank");
      pages.append(b);
    }
  }
}
