# Décisions techniques

Chaque décision est datée. Une décision remplacée reste listée, barrée, avec la date du changement.

## Architecture

- **2026-11-05** — Application web (PWA) sur GitHub Pages, stockage Firestore dans le projet Firebase déjà utilisé par Chez Nounou et Diversif.
- **2026-11-05** — La lecture des agendas, l'application des règles et les briefings tournent dans une tâche GitHub Actions planifiée (toutes les 30 min), pas sur un téléphone.
- **2026-11-05** — Ce qui est déterministe (planning, conflits, heures) est calculé par le code. L'IA ne rédige que le briefing ; l'app fonctionne sans elle.
- **2026-11-05** — Indicateur de fraîcheur par source (vert / orange / rouge), seuils provisoires réglables.
- **2026-11-06** — Raccourcis iOS réservés aux données qui n'existent que chez Apple. Ils écrivent par l'API REST Firestore avec un jeton Firebase Auth (en-tête `Referer` obligatoire : la clé d'API est restreinte par référent HTTP).

## Dépôt public

- **2026-11-07** — Le dépôt reste public (GitHub Pages gratuit l'exige). En conséquence :
  - code générique, sans donnée familiale ;
  - paramètres familiaux dans un document de configuration Firestore protégé ;
  - journaux limités à des comptes ;
  - tests sur données fictives ;
  - noms de lieux des tests de cantine passés en secrets (`CANTINE_COMMUNE`, `CANTINE_ECOLE`, `CANTINE_LOISIRS`).

## Sécurité Firestore

- **2026-11-07** — Deux protections cumulées :
  1. inscriptions désactivées dans Firebase Authentication (plus aucune création de compte depuis un client) ;
  2. règles limitées à l'UID du compte famille, et non à `request.auth != null` (la configuration web étant publique, n'importe qui pourrait sinon créer un compte et lire les données).
- **2026-11-07** — Ordre imposé : changer le mot de passe du compte famille, ajouter la connexion dans Chez Nounou et Diversif, vérifier qu'elles fonctionnent connectées, **puis seulement** fermer les règles. Fermer d'abord rendrait les deux apps silencieusement vides (cache Firestore sans erreur).

## Planning

- **2026-11-07** — Les heures de l'enfant scolarisé chez l'assistante maternelle se déduisent de celles de l'autre enfant et des horaires de l'école ; elles ne sont pas saisies.
- **2026-11-07** — Les horaires de travail du parent B ne sont pas lus d'un agenda : ils sont saisis dans l'app, jour par jour, sans valeur par défaut (« à saisir »).
- **2026-11-07** — Lecteur du semainier Excel repris d'AgendaPro sans changement de logique ; les constantes propres à la personne (initiales, horaires, libellés, lieux, ancre) sont passées en paramètres lus dans la configuration. Équivalence vérifiée sur 400 classeurs aléatoires (0 différence). Import depuis le téléphone dans La Vision ; seuls les jours modifiés sont réécrits ; les jours passés et les jours absents du nouveau fichier ne sont pas touchés. Les retouches manuelles faites dans AgendaPro (stockées sur l'appareil) ne sont pas reprises. Elles sont rares : on corrige dans La Vision.
- **2026-11-07** — Pas d'heures contractuelles dans l'app : seulement les heures prévues (planning) et réelles (pointages).
- **2026-11-07** — Chaque proposition du moteur porte sa justification en clair et, le cas échéant, un point à vérifier. Un créneau peut rester « à confirmer » plutôt que recevoir une heure fausse.

### Schéma Firestore (validé le 2026-11-07)

| Chemin | Écrit par | Contenu |
|---|---|---|
| `vision/config` | App (réglages) | Paramètres familiaux : parents A et B, enfants 1 et 2, école, jours particuliers, sources, semainier |
| `vision/planning/jours/{AAAA-MM-JJ}` | Tâche (`calcule`), app (`corrige`, `saisies.B`, `valide`) | Planning du jour en couches |
| `vision/semainier/jours/{AAAA-MM-JJ}` | App (import) | Événements du semainier pour le parent A |
| `vision/agenda/jours/{AAAA-MM-JJ}` | Tâche | Événements des agendas, vacances scolaires, jours fériés |
| `vision/etat` | Tâche et app | Fraîcheur de chaque source, dernier passage du moteur, erreurs |

Couches d'un jour de planning :
- `calcule` : réécrit par la tâche ; justification et points à vérifier inclus.
- `corrige` : seulement les champs modifiés à la main ; jamais écrasé.
- `saisies.B` : début et fin de travail du parent B ; vide = « à saisir ».
- `valide` : copie de l'affichage au moment où le mois est validé.

**Affichage champ par champ** : `corrige.x`, sinon `valide.x`, sinon `calcule.x`.

**Après validation du mois** : le moteur continue de calculer mais ne modifie plus `valide`. Toute différence entre `calcule` et `valide` devient un point à vérifier sur le jour concerné, avec un bouton « Appliquer ». Un changement appliqué après l'envoi de la grille marque le mois « grille modifiée depuis l'envoi ».

### Tâche planifiée

- **2026-11-07** — Les tâches planifiées tournent dans un dépôt **privé** dédié, `la-vision-tache`, qui ne contient que les déclencheurs et les secrets ; il exécute le code du dossier `tache/` de ce dépôt (branche `main`). Raisons : la désactivation automatique après 60 jours sans activité est décrite pour les dépôts publics ; les journaux deviennent privés. Pas de commit automatique pour maintenir un dépôt « actif ».
- **2026-11-07** — Quota : 2 000 minutes par mois pour les dépôts privés d'un compte gratuit, chaque job arrondi à la minute supérieure, blocage (sans facturation) au-delà. Fréquence des agendas : toutes les 30 min de 4 h à 21 h UTC, toutes les 2 h la nuit (39 passages par jour, ≈ 1 200 min par mois si chaque passage reste sous la minute). Si un passage dépasse la minute : passer à un passage par heure en journée.
- **2026-11-07** — Pour tenir sous la minute : écriture Firestore par l'API REST (compte de service signé localement), une seule dépendance (ical.js), mise en cache.
- **2026-11-07** — Agendas : séries, exceptions et fuseaux lus avec ical.js ; jours fériés calculés (pas de source externe) ; adresse du calendrier scolaire dans la configuration Firestore (`sources.vacances`). Une empreinte par jour, stockée dans `vision/agenda`, évite de relire tous les jours à chaque passage. Si une source est illisible, rien n'est écrit et l'erreur est notée dans `vision/etat.agendas.erreur` ; la dernière lecture réussie (`agendas.lu`) est conservée.
- **2026-11-07** — N'écrit que les documents dont le contenu a changé ; ne recalcule pas les jours passés ; fenêtre de calcul limitée (J-7 à J+60). Le quota gratuit Firestore est partagé avec Chez Nounou et Diversif.

### Moteur de règles (2026-11-08)

Code : `tache/moteur.js` (fonction pure, chargée aussi par l'app), appelé par `tache/planning.mjs` à la suite de la lecture des agendas. Paramètres dans `vision/config.famille` ; tests sur une famille fictive (`tests/moteur.test.mjs`).

- Jours de semaine seulement, fenêtre aujourd'hui → J+60, jours passés jamais recalculés.
- Statut du parent A : semainier (journée au lieu principal, site secondaire, congé, jour non travaillé, repos après garde, formation) ; gardes lues dans son agenda (l'agenda fait foi ; un écart avec le semainier est un point à vérifier).
- Statut du parent B : garde et lendemain de garde lus dans son agenda (garde = événement dont le titre correspond au motif, commençant ce jour) ; sinon saisie dans l'app (travail début–fin, repos, congé), sinon « à saisir ».
- Dépôt, par ordre de priorité : A au site secondaire (sauf lendemain de sa garde) ; lendemain de garde de B → A tôt (ou à l'heure de congé s'il est à la maison) ; garde de B → B à l'heure fixée ; A en congé → A ; sinon B, une heure avant son début (`avantDebut`), arrondi au quart d'heure inférieur, au plus tard à l'entrée de l'école les jours d'école.
- Récupération : lendemain de garde de B → B à la sortie ; garde de B → A à son heure de retour ; lendemain de garde de A → A ; A en congé → A ; A au site secondaire → A, sauf si B rentre avant ; sinon B, une heure après sa fin (`apresFin`), arrondi au quart d'heure supérieur ; au-delà de la fermeture de l'assistante maternelle, A s'il rentre avant, sinon point à vérifier. Un jour d'école, une récupération avant la sortie se fait à l'école, à la sortie.
- Enfant scolarisé un jour d'école : chez l'assistante maternelle du dépôt à l'entrée, puis de la sortie à la récupération ; jamais de périscolaire. B en repos : école sans créneau, horaires du petit « à saisir ».
- Mercredi en période scolaire : le parent à la maison (A s'il ne travaille pas, sinon B) ; petit 9h–13h, aîné à l'accueil de loisirs. Mercredi de vacances : jour ordinaire.
- Vacances : lieu de l'aîné lu dans l'agenda de B (mots configurés, « congés de l'assistante maternelle » testé en premier), sinon choix fait dans l'app (`corrige.e2`), sinon point à vérifier. Pas de plafond d'entrée d'école. Fermeture anticipée par date (`ecole.exceptions`).
- Jours sans assistante maternelle : week-end, férié, congés de l'assistante maternelle (motif dans l'un des deux agendas), B en congé. Si les deux parents travaillent, point à vérifier.
- Économie Firestore : une clé résume les entrées (empreintes des agendas, import du semainier, configuration, `vision/planning.majLe`) ; clé inchangée = ni lecture ni écriture. L'app doit mettre à jour `vision/planning.majLe` à chaque saisie ou correction. Un calcul complet lit environ 140 documents et n'écrit que les jours modifiés (champ `calcule` seul).

Corrections du 2026-11-08, après relecture de novembre et décembre :
- Les gardes peuvent être notées sur la journée entière : une garde est un événement qui **commence** ce jour ; le lendemain de garde se lit dans l'agenda de la veille (le calcul lit aussi la veille de chaque jour et les week-ends).
- A en congé prime sur la garde de B : A dépose et récupère.
- Accueil de loisirs ou centre aéré fermé avant la récupération : l'assistante maternelle va chercher l'aîné (créneau de la fermeture à la récupération), sans point à vérifier.
- Jour à fermeture anticipée (`ecole.exceptions`, ex. 24/12) : les parents finissent plus tôt, récupération avancée à la fermeture pour les deux enfants.
- Jour férié : aucun point à vérifier.
- Congé de B lu dans son agenda (`B.conge`, titre exact, ex. « Vacances » seul ; « Vacances scolaires » ne compte pas). Une saisie dans l'app prime.
- Repos de B lu de même dans son agenda (`B.repos`, ex. « Off … »).
- « Centre aéré » et « accueil de loisirs » désignent la même structure : les deux mots sont configurés vers le même lieu.
- Les exceptions ponctuelles (rendez-vous, arrangement avec l'assistante maternelle) relèvent des corrections manuelles de l'étape 6.
- Rendez-vous et absences : le moteur ne les interprète pas, il les signale. (1) Un événement dont le titre contient le prénom d'un enfant, un jour où cet enfant est confié : point à vérifier avec le titre et l'horaire ; le titre est gardé dans `calcule.notes` pour la grille. (2) Un événement horaire de 12 h ou plus d'un parent, qui n'est ni une garde ni un congé, ni un autre motif reconnu : point « absent ? ». Pas de configuration supplémentaire.

### Écran Planning du mois (2026-11-08)

- Pensé pour l'iPad en paysage et l'ordinateur : grille du lundi au vendredi et panneau du jour ; sous 900 px, le panneau passe sous la grille.
- **Le moteur tourne aussi dans l'app** (`js/planning.js` importe `tache/moteur.js`) : une saisie ou une correction s'affiche immédiatement, sans attendre la tâche. Les jours passés affichent ce qui a été enregistré, sans recalcul. Lecture par mois : agendas (mois + veille), semainier, planning, état du mois (`vision/planning/mois/{AAAA-MM}`).
- Fusion pour l'affichage (`fusionner`) : champ par champ `corrige`, sinon `valide.affiche`, sinon calcul ; champs `depot {qui, heure}`, `recup {qui, heure}`, `e1` (confié ou non), `e2` (lieu), `note`. Créneaux recalculés à partir des heures et lieux affichés quand une couche surcharge le calcul.
- Corrections dans le panneau du jour : enfant 1 confié ou non ; dépôt et récupération (qui et heure, pas de 15 min) ; lieu de l'enfant 2 (école, accueil de loisirs, assistante maternelle, avec nous) ; note (80 caractères). « Annuler les modifications » supprime `corrige`.
- Écran des horaires du parent B : un jour par ligne ; début et fin, « Off », « Vacances » ou « Effacer » ; enregistrement à chaque changement (`saisies.B`) ; gardes et lendemains affichés sans saisie ; repos et congé lus dans son agenda présentés comme tels.
- Validation : enregistre pour chaque jour non passé `valide = { affiche, calculeAlors, le }` et `vision/planning/mois/{AAAA-MM}.valideLe`. Ensuite, l'affichage suit `valide` ; un écart entre le calcul et `calculeAlors` devient un point, avec « Appliquer le nouveau calcul » ; une correction après validation est marquée « modifié depuis la validation » (`corrige.apresValidation`).
- Chaque écriture met à jour `vision/planning.majLe` pour que la tâche recalcule.

## Module assistante maternelle

- **2026-11-07** — La Vision lit et écrit les pointages au format exact de Chez Nounou ; un créneau saisi dans l'une apparaît dans l'autre.
- **2026-11-07** — Geste principal : confirmation le soir, préremplie à partir du planning. Pointage en direct possible.
- **2026-11-07** — Confirmation du soir : avant d'écrire, lire les sessions déjà présentes pour ce jour et cet enfant. S'il y en a, les montrer au lieu d'en créer (pas de doublons).
- **2026-11-07** — `schooldays` : écrits aujourd'hui par Chez Nounou, à la main, à trois endroits (case du jour, formulaire d'ajout de créneau, fiche d'un jour), avec `true` comme `false`. Un jour marqué `true` déclenche dans Chez Nounou la découpe des créneaux autour des heures d'école et, le jour même, un décompte automatique du soir à partir de la sortie d'école tant qu'aucun créneau du soir n'existe. La Vision n'écrit un `schooldays` que s'il est absent, n'écrase jamais une valeur existante, et n'écrit `true` que les jours où le planning prévoit l'école **et** l'assistante maternelle après l'école.
- **2026-11-07** — Grille mensuelle exportée en image ou en PDF, aux couleurs de l'app.

## Technique

- **2026-11-06** — API Claude : `claude-sonnet-5-5`, concaténer tous les blocs `text`.
- **2026-11-07** — Workflows sur Node 22, `actions/checkout@v5` et `actions/setup-node@v5` (les v4 tournent sur Node 20, déprécié).

## 2026-11-08 — Saisie des heures par listes

Le sélecteur natif `<input type="time">` ignore l'attribut `step` dans son menu (Chrome affiche toutes les minutes). Les heures se saisissent donc par deux listes : heures, puis minutes par pas de 5. Choisir l'heure seule met les minutes à 00. Une heure déjà enregistrée hors du pas reste affichée telle quelle.

## 2026-11-08 — Module assistante maternelle (étape 7)

- Créneaux lus et écrits dans `nounou/{journal}/sessions` au format de l'app de pointage ; le journal vient de `famille.nounou.journal` (configuration Firestore). Clés des enfants : `famille.enfants.e1.cle` / `e2.cle`.
- Écoute en temps réel de la semaine en cours (`onSnapshot`, métadonnées incluses) : tant que la lecture n'est pas confirmée par le serveur, les totaux affichent « — » et les boutons sont désactivés.
- Totaux calculés exactement comme l'app de pointage (créneau en cours compté jusqu'à maintenant ; le jour même, soir d'école compté dès la sortie tant qu'aucun créneau du soir n'existe, si le jour est coché « école »).
- Pointage : même logique que l'app de pointage (heure arrondie à 5 min ; « Départ » de l'enfant scolarisé après la sortie = créneau sortie → maintenant ; coupe du créneau du matin à l'heure d'entrée de `famille.ecole.entree`).
- Confirmation : un créneau prévu n'est proposé que si aucun créneau pointé ne le recouvre (aucun doublon). Le soir, à partir de l'heure de récupération prévue (18h à défaut) ; les jours passés de la semaine restés sans pointage sont proposés à part.
- `schooldays` : coché par l'app et par la tâche planifiée (aujourd'hui seulement), uniquement si le document est absent (transaction côté app, précondition `exists: false` côté tâche), et seulement quand `ecoleAvecNounou` est vrai.

## 2026-11-08 — Grille mensuelle pour l'assistante maternelle (étape 8)

- Image PNG A4 paysage (2400 × 1697), dessinée sur un canvas sans bibliothèque. Disposition reprise du document utilisé jusqu'ici : titre du mois en rouge, année dessous, bandeau rouge des jours (lundi → vendredi), numéro du jour puis deux lignes centrées, chacune à la couleur de l'enfant (`famille.enfants.*.couleur`, celles de l'app de pointage) : enfant non scolarisé « dépôt (initiale) - récupération (initiale) », créneaux de l'enfant scolarisé chez la nounou « a - b / c - d ». « - » sans accueil ; note du jour en italique. Une seule taille de texte pour toute la grille. Pas de petits calendriers, pas de total.
- Envoi par le menu Partager (iPad, iPhone) ou téléchargement (Mac). Pas de PDF : la grille part en photo.
- À chaque envoi, le texte de chaque jour est mémorisé dans `vision/planning/mois/{YYYY-MM}.envoi` ; l'écran Planning signale ensuite « grille envoyée le … · n jours modifiés depuis » et marque les jours concernés. `valideLe` et `envoi` s'écrivent en `mergeFields` pour ne pas s'effacer l'un l'autre.
