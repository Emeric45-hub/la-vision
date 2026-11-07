// Lecture d'un agenda iCal : occurrences (séries comprises) ventilées par jour, en heure de Paris.
const FUSEAU = 'Europe/Paris';
const pad = n => String(n).padStart(2, '0');
const MAX_NOTES = 2000;

// "AAAA-MM-JJ" et "HH:MM" d'un instant, en heure de Paris
const fmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
export function enParis(date) {
  const p = Object.fromEntries(fmt.formatToParts(date).map(x => [x.type, x.value]));
  return { jour: `${p.year}-${p.month}-${p.day}`, heure: `${p.hour}:${p.minute}` };
}
export function joursEntre(debut, fin) {          // bornes incluses, "AAAA-MM-JJ"
  const out = [];
  const d = new Date(debut + 'T12:00:00Z'), f = new Date(fin + 'T12:00:00Z');
  for (; d <= f; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}
export const decaler = (jour, n) => { const d = new Date(jour + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dateIcal = t => `${t.year}-${pad(t.month)}-${pad(t.day)}`;

// Une occurrence → { jours: [...], evenement: {...} }
function occurrence(item, debut, fin) {
  const evenement = {
    titre: item.summary || '',
    journee: debut.isDate,
    lieu: item.location || null,
    notes: item.description ? String(item.description).slice(0, MAX_NOTES) : null
  };
  if (debut.isDate) {
    const j1 = dateIcal(debut);
    const j2 = fin ? decaler(dateIcal(fin), -1) : j1;   // fin exclusive en iCal
    evenement.debut = j1; evenement.fin = j2 < j1 ? j1 : j2;
    return { jours: joursEntre(j1, evenement.fin), evenement };
  }
  const a = enParis(debut.toJSDate());
  const b = enParis((fin || debut).toJSDate());
  evenement.debut = `${a.jour}T${a.heure}`; evenement.fin = `${b.jour}T${b.heure}`;
  // Un événement qui finit pile à minuit n'occupe pas le jour suivant.
  const dernier = (b.heure === '00:00' && b.jour > a.jour) ? decaler(b.jour, -1) : b.jour;
  return { jours: joursEntre(a.jour, dernier < a.jour ? a.jour : dernier), evenement };
}

// Renvoie { "AAAA-MM-JJ": [evenement, ...] } pour les jours de la fenêtre [du, au].
export function lireAgenda(ICAL, texte, du, au) {
  const racine = new ICAL.Component(ICAL.parse(texte));
  racine.getAllSubcomponents('vtimezone').forEach(tz => {
    const id = tz.getFirstPropertyValue('tzid');
    if (id && !ICAL.TimezoneService.has(id)) ICAL.TimezoneService.register(tz);
  });

  // Regroupe les exceptions (RECURRENCE-ID) avec leur série
  const series = new Map(), isoles = [];
  for (const c of racine.getAllSubcomponents('vevent')) {
    if (c.getFirstPropertyValue('status') === 'CANCELLED' && !c.hasProperty('recurrence-id')) continue;
    const uid = c.getFirstPropertyValue('uid') || Math.random().toString(36);
    if (!series.has(uid)) series.set(uid, { maitre: null, exceptions: [] });
    if (c.hasProperty('recurrence-id')) series.get(uid).exceptions.push(c);
    else series.get(uid).maitre = c;
  }

  const parJour = {};
  const ajouter = ({ jours, evenement }, annule) => {
    if (annule) return;
    for (const j of jours) if (j >= du && j <= au) (parJour[j] = parJour[j] || []).push(evenement);
  };
  const limite = ICAL.Time.fromDateString(decaler(au, 32));   // marge : une exception peut avoir été déplacée dans la fenêtre

  for (const { maitre, exceptions } of series.values()) {
    if (!maitre) { exceptions.forEach(c => isoles.push(c)); continue; }
    const ev = new ICAL.Event(maitre, { exceptions });
    if (!ev.isRecurring()) {
      ajouter(occurrence(ev, ev.startDate, ev.endDate));
      continue;
    }
    const it = ev.iterator();
    for (let t = it.next(), n = 0; t && n < 20000; t = it.next(), n++) {
      if (t.compare(limite) > 0) break;
      const d = ev.getOccurrenceDetails(t);
      ajouter(occurrence(d.item, d.startDate, d.endDate), d.item.component.getFirstPropertyValue('status') === 'CANCELLED');
    }
  }
  for (const c of isoles) {
    const ev = new ICAL.Event(c);
    ajouter(occurrence(ev, ev.startDate, ev.endDate), c.getFirstPropertyValue('status') === 'CANCELLED');
  }

  // Ordre stable : par début puis par titre (sert à détecter les changements)
  for (const j in parJour) parJour[j].sort((x, y) => (x.debut + x.titre).localeCompare(y.debut + y.titre));
  return parJour;
}
