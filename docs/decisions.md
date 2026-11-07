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

- **2026-11-07** — Un document par jour, deux couches : `calcule` (réécrit par la tâche) et `corrige` (saisi à la main, prioritaire, jamais écrasé). L'affichage fusionne `corrige` sur `calcule`.
- **2026-11-07** — Chaque proposition du moteur porte sa justification en clair et, le cas échéant, un point à vérifier. Un créneau peut rester « à confirmer » plutôt que recevoir une heure fausse.
- **2026-11-07** — Les heures de l'enfant scolarisé chez l'assistante maternelle se déduisent de celles de l'autre enfant et des horaires de l'école ; elles ne sont pas saisies.
- **2026-11-07** — Les horaires de travail du parent B ne sont pas lus d'un agenda : ils sont saisis dans l'app, jour par jour, sans valeur par défaut (« à saisir »).
- **2026-11-07** — Lecteur du semainier Excel repris d'AgendaPro sans changement de logique. Import depuis l'iPhone dans La Vision ; le résultat est stocké dans Firestore à l'import.
- **2026-11-07** — Pas d'heures contractuelles dans l'app : seulement les heures prévues (planning) et réelles (pointages).

## Module assistante maternelle

- **2026-11-07** — La Vision lit et écrit les pointages au format exact de Chez Nounou ; un créneau saisi dans l'une apparaît dans l'autre.
- **2026-11-07** — Geste principal : confirmation le soir, préremplie à partir du planning. Pointage en direct possible.
- **2026-11-07** — Grille mensuelle exportée en image ou en PDF, aux couleurs de l'app.

## Technique

- **2026-11-06** — API Claude : `claude-sonnet-5-5`, concaténer tous les blocs `text`.
- **2026-11-07** — Workflows sur Node 22, `actions/checkout@v5` et `actions/setup-node@v5` (les v4 tournent sur Node 20, déprécié).
