// Valises — gestes : balayage vers la gauche et appui long, avec les Pointer Events
// (doigt, souris, stylet).

// Le toucher qui termine un geste ne doit pas compter comme un appui simple : on avale le
// « click » qui suit, et l'on oublie cette consigne dès qu'un nouveau toucher commence.
let avaler = false;
document.addEventListener("pointerdown", () => { avaler = false; }, true);
document.addEventListener("click", e => {
  if (!avaler) return;
  avaler = false;
  e.stopPropagation(); e.preventDefault();
}, true);

// Glisser l'élément vers la gauche au-delà du seuil déclenche l'action ; sinon il revient en place.
// « pan-y » laisse le défilement vertical au navigateur et nous donne les mouvements horizontaux.
export function balayable(el, action, seuil = 90) {
  let x0 = 0, y0 = 0, dx = 0, phase = 0, doigt = null;   // 0 repos, 1 en attente, 2 glissement
  el.style.touchAction = "pan-y";
  el.addEventListener("pointerdown", e => {
    if (e.button) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; phase = 1; doigt = e.pointerId;
  });
  el.addEventListener("pointermove", e => {
    if (!phase || e.pointerId !== doigt) return;
    const ddx = e.clientX - x0, ddy = e.clientY - y0;
    if (phase === 1) {
      if (Math.abs(ddx) < 10 && Math.abs(ddy) < 10) return;
      if (Math.abs(ddx) <= Math.abs(ddy) || ddx > 0) { phase = 0; return; }
      phase = 2;
      try { el.setPointerCapture(doigt); } catch (err) { /* pointeur déjà relâché */ }
      el.classList.add("glisse");
    }
    dx = Math.min(0, ddx);
    el.style.transform = "translateX(" + dx + "px)";
  });
  const fin = e => {
    if (phase !== 2) { phase = 0; return; }
    phase = 0;
    avaler = true;
    el.classList.remove("glisse");
    if (e.type === "pointerup" && dx < -seuil) { el.style.transform = "translateX(-110%)"; action(); }
    else el.style.transform = "";
  };
  el.addEventListener("pointerup", fin);
  el.addEventListener("pointercancel", fin);
}

// Maintenir l'élément sans bouger déclenche l'action.
export function appuiLong(el, action, duree = 550) {
  let minuteur = null, x0 = 0, y0 = 0;
  const annuler = () => { clearTimeout(minuteur); minuteur = null; };
  el.addEventListener("pointerdown", e => {
    if (e.button) return;
    x0 = e.clientX; y0 = e.clientY; annuler();
    minuteur = setTimeout(() => { minuteur = null; avaler = true; action(); }, duree);
  });
  el.addEventListener("pointermove", e => { if (minuteur && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) annuler(); });
  ["pointerup", "pointercancel", "pointerleave"].forEach(t => el.addEventListener(t, annuler));
  el.addEventListener("contextmenu", e => e.preventDefault());
}

// Tiroir : glisser l'élément vers la gauche découvre un bouton posé derrière lui (une suppression, par exemple).
// Rien n'est fait par le geste seul : il faut ensuite toucher le bouton. Un seul tiroir ouvert à la fois ;
// toucher l'élément ou un autre endroit de l'écran le referme.
let refermer = null;
document.addEventListener("pointerdown", e => {
  if (refermer && !(e.target.closest && e.target.closest(".tiroir"))) refermer();
}, true);

export function tiroir(el, largeur = 104, ouvertAuDepart = false, surChange = () => {}) {
  let x0 = 0, y0 = 0, dx = 0, base = 0, phase = 0, doigt = null, ouvert = false;
  const fermer = () => regler(false);
  function regler(o, muet) {
    ouvert = o;
    el.classList.toggle("ouvert", o);
    el.style.transform = o ? "translateX(" + -largeur + "px)" : "";
    if (o) { if (refermer && refermer !== fermer) refermer(); refermer = fermer; }
    else if (refermer === fermer) refermer = null;
    if (!muet) surChange(o);
  }
  el.style.touchAction = "pan-y";
  if (ouvertAuDepart) regler(true, true);
  el.addEventListener("pointerdown", e => {
    if (e.button) return;
    x0 = e.clientX; y0 = e.clientY; base = ouvert ? -largeur : 0; dx = base; phase = 1; doigt = e.pointerId;
  });
  el.addEventListener("pointermove", e => {
    if (!phase || e.pointerId !== doigt) return;
    const ddx = e.clientX - x0, ddy = e.clientY - y0;
    if (phase === 1) {
      if (Math.abs(ddx) < 10 && Math.abs(ddy) < 10) return;
      if (Math.abs(ddx) <= Math.abs(ddy) || (!ouvert && ddx > 0)) { phase = 0; return; }
      phase = 2;
      try { el.setPointerCapture(doigt); } catch (err) { /* pointeur déjà relâché */ }
      el.classList.add("glisse");
    }
    dx = Math.max(-largeur - 24, Math.min(0, base + ddx));
    el.style.transform = "translateX(" + dx + "px)";
  });
  const fin = e => {
    if (phase !== 2) { phase = 0; return; }
    phase = 0;
    avaler = true;
    el.classList.remove("glisse");
    regler(e.type === "pointerup" && dx < -largeur / 2);
  };
  el.addEventListener("pointerup", fin);
  el.addEventListener("pointercancel", fin);
  // Tiroir ouvert : un toucher sur l'élément le referme au lieu de l'ouvrir.
  el.addEventListener("click", e => {
    if (!ouvert) return;
    e.preventDefault(); e.stopPropagation();
    fermer();
  }, true);
}
