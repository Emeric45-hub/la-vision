// Valises — pictogrammes au trait (grille de 24, un seul tracé par pictogramme).
// Le nom d'un pictogramme est enregistré avec le sac ; un nom inconnu retombe sur « sac ».
export const ICONES = {
  sac: "M5.5 9h13l1.5 10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z M9 9V7.5a3 3 0 0 1 6 0V9",
  trousse: "M4 10a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M4 12h16 M12 12v2.5 M9 8V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1",
  nuit: "M20 14.2A8 8 0 1 1 9.8 4a6.2 6.2 0 0 0 10.2 10.2z",
  bandouliere: "M5 10h14l1 9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z M8 10V8a4 4 0 0 1 8 0v2 M9.5 14h5",
  repas: "M7 3v18 M4 3v5a3 3 0 0 0 6 0V3 M17 21V3c-2.2 1.2-3.5 4-3.5 8H17",
  piscine: "M3 8c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0 M3 13c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0 M3 18c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0",
  valise: "M5 8h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2 M8 8v12 M16 8v12",
  sacados: "M6 10a6 6 0 0 1 12 0v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z M9.5 4.6V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v.6 M9 21v-5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5 M9.5 10h5",
  papiers: "M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z M7 14.5c.6-1.4 3.4-1.4 4 0 M9 11.2a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6z M14.5 10h3.5 M14.5 14h3.5",
  apart: "M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16z M3.5 8 12 12.5 20.5 8 M12 12.5v8",
  masque: "M5 7h14a2 2 0 0 1 2 2v3a4 4 0 0 1-4 4h-1.2a2 2 0 0 1-1.7-1l-.6-1a1.7 1.7 0 0 0-3 0l-.6 1a2 2 0 0 1-1.7 1H7a4 4 0 0 1-4-4V9a2 2 0 0 1 2-2z",
  chaussures: "M3 18v-7c1.5.8 3 .8 4.5 0L10 8l3 4 5.2 1.6A3.5 3.5 0 0 1 21 17v1z M3 15.5h17.6",
  chevron: "M9 6l6 6-6 6",
  retour: "M15 6l-6 6 6 6",
  coche: "M5 12.5l4.5 4.5L19 7.5",
  plus: "M12 5v14 M5 12h14"
};

const NS = "http://www.w3.org/2000/svg";

// Élément <svg> décoratif (le libellé voisin porte le sens).
export function picto(nom, taille = 26, epaisseur = 1.8) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", taille);
  svg.setAttribute("height", taille);
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("picto");
  svg.style.strokeWidth = epaisseur;
  const trace = document.createElementNS(NS, "path");
  trace.setAttribute("d", ICONES[nom] || ICONES.sac);
  svg.appendChild(trace);
  return svg;
}
