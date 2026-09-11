# Sillage

Application en français pour composer, organiser et partager la bande-son complète d'un mariage.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- La version connectée utilise des comptes organisateurs et une sauvegarde serveur ; les anciennes données locales ne doivent être importées que sur action explicite.
- Les extraits du catalogue servent à découvrir la musique, sans téléchargement. Les fichiers audio importés restent privés ; les liens invités ne donnent jamais accès à leur lecture. Un transfert DJ distinct autorise seulement le compte destinataire à télécharger une sélection explicitement approuvée.
- Un transfert DJ est une sélection figée, pas un partage évolutif de playlist : ajouter ensuite des morceaux à une playlist ne doit jamais étendre automatiquement les droits accordés. La révocation bloque les nouvelles demandes, pas les copies déjà reçues ni les transferts déjà démarrés.
- Ne pas inventer de BPM, tonalité ou énergie lorsque la source ne fournit pas ces informations. Les transitions sur fichiers importés ne constituent pas un moteur de beatmatching professionnel.
- Garder les services de recherche, prévisualisation, bibliothèque, collaboration, Timeline et compatibilité remplaçables pour de futures intégrations officielles.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

- Priorité à la boucle rechercher → écouter → ajouter → placer dans la Timeline → construire l'enchaînement → partager.
- Identité musicale premium originale, noir/anthracite/blanc cassé, couleurs subtiles issues des pochettes ; pas de copie Spotify/Apple Music ni de tableau de bord administratif.
- Titres sans empattement, en capitales, légers et resserrés, d'après la référence fournie.
- Préserver la qualité des interactions avant d'ajouter des fonctions secondaires ; mobile particulièrement adapté aux invités.

## Gotchas

- Ambiances par événement : Studio sombre, Éditorial clair, Signature avec photo privée. Aperçu local avant enregistrement ; Annuler conserve le thème enregistré. Une photo n'est visible aux invités qu'après consentement explicite enregistré. Les images sont décodées/réencodées sans métadonnées, stockées à part de l'audio ; les accès invités contrôlent le lien et le consentement actuels.

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
