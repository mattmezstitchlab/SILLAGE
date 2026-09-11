# Vercel — erreurs de build, configuration et portage de l'API

État au 2026-09-11. Ce document couvre : l'échec du build Vercel et sa cause, la
configuration de déploiement, les variables d'environnement, le portage de l'API
Express en Serverless Function, et ce qui reste non vérifiable sans accès au projet.

## 1. L'erreur de build (corrigée)

```
failed to load config from /vercel/path0/artifacts/soundtrack/vite.config.ts
error during build:
Error: PORT environment variable is required but was not provided.
```

### Cause

Les `vite.config.ts` (`artifacts/soundtrack`, `artifacts/mockup-sandbox`) venaient du
gabarit Replit et **levaient une exception au chargement de la config** si `PORT` ou
`BASE_PATH` étaient absents :

```ts
const rawPort = process.env.PORT;
if (!rawPort) throw new Error('PORT environment variable is required but was not provided.');
```

Replit injecte ces deux variables ; Vercel non. Or `PORT` ne sert qu'aux serveurs
`dev`/`preview` — `vite build` n'en a aucun besoin. Le build mourait donc avant de
compiler le premier module.

### Correctif

- `PORT` absent → `3000` (dev/preview uniquement) ; `PORT` fourni mais invalide →
  erreur explicite (comportement Replit conservé) ;
- `BASE_PATH` absent → `/` (l'app est servie à la racine du domaine).

## 2. Configuration Vercel

Deux configurations sont possibles selon le **Root Directory** du projet Vercel.
Vercel ne lit que le `vercel.json` situé dans ce Root Directory.

| Root Directory | Fichier lu | Ce qui est déployé |
| --- | --- | --- |
| **`.` (racine du dépôt)** ← recommandé | `vercel.json` | SPA **et** API (`/api/*`) |
| `artifacts/soundtrack` | `artifacts/soundtrack/vercel.json` | SPA seul, `/api/*` en 404 |

> Le log d'origine montrait `> @workspace/soundtrack@0.0.0 build
> /vercel/path0/artifacts/soundtrack` : le Root Directory était
> `artifacts/soundtrack`. **Pour avoir l'API, il faut le passer à la racine du dépôt**
> (Settings → General → Root Directory).

Réglages portés par `vercel.json` (racine) :

| Réglage | Valeur | Pourquoi |
| --- | --- | --- |
| Framework Preset | `null` (Other) | la racine n'est pas une app Vite |
| Build Command | `pnpm --filter @workspace/soundtrack run build` | le `build` racine enchaîne `pnpm run typecheck`, qui échoue (§6) |
| Output Directory | `artifacts/soundtrack/dist/public` | ⚠️ `dist/public`, pas `dist` |
| Node.js Version | `22.x` | `.replit` vise Node 24 ; Vite 7 exige ≥ 20.19 / 22.12 |
| Install Command | (vide) | Vercel installe tout le workspace pnpm depuis la racine |

Routage :

```json
"rewrites": [
  { "source": "/api/(.*)", "destination": "/api" },
  { "source": "/((?!api/).*)", "destination": "/index.html" }
]
```

- la 1ʳᵉ envoie tout `/api/*` vers la Serverless Function `api/index.ts` en
  **conservant le chemin d'origine**, donc `app.use("/api", router)` continue de
  matcher (y compris le proxy Clerk `/api/__clerk`) ;
- la 2ᵉ est le fallback SPA (wouter + Clerk utilisent `/sign-in`, `/app/timeline`,
  `/dj-transfers/:id`…). Les `rewrites` Vercel s'appliquent après la recherche dans le
  système de fichiers, donc `/assets/*`, `favicon.svg`, `logo.svg`, `robots.txt` sont
  servis directement.

## 3. Variables d'environnement

Modèles : `artifacts/soundtrack/.env.example` (frontend) et
`artifacts/api-server/.env.example` (API).

### Frontend (inlinées au build par Vite → variables de **build**)

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | oui | clé publique Clerk (`pk_test_…` / `pk_live_…`) |
| `VITE_CLERK_PIN_PUBLISHABLE_KEY` | recommandé (`true`) | utilise la clé telle quelle |
| `VITE_CLERK_PROXY_URL` | non | seulement si le trafic Clerk passe par l'API |

**Le piège Clerk** : `App.tsx` appelle `publishableKeyFromHost(hostname, clé)`. Dans
`@clerk/shared/dist/keys.js`, cette fonction ne renvoie la clé fournie **que si c'est
une `pk_test_`** ; sinon elle en fabrique une à partir du nom d'hôte
(`clerk.<hostname>` encodé en base64). C'est voulu sur Replit (plusieurs domaines
personnalisés → plusieurs instances Clerk), mais sur `*.vercel.app` cela produit une
instance inexistante : le build passe, l'authentification échoue. D'où l'opt-in
`VITE_CLERK_PIN_PUBLISHABLE_KEY` (désactivé par défaut, le comportement Replit est
inchangé).

### API (Serverless Function)

| Variable | Obligatoire | Notes |
| --- | --- | --- |
| `DATABASE_URL` | oui | `lib/db/src/index.ts` **throw au chargement** sans elle. Utiliser un **pooler** (Neon/Supabase/RDS Proxy) : chaque instance de fonction ouvre son propre pool `pg`. |
| `CLERK_SECRET_KEY` | oui | sans elle, **tous** les `/api/*` renvoient 500 `Missing Clerk Secret Key` (vérifié localement). |
| `CLERK_PUBLISHABLE_KEY` | oui | utilisée par `clerkMiddleware`. |
| `PRIVATE_OBJECT_DIR` | oui | ex. `/mon-bucket/sillage-private`. |
| `PUBLIC_OBJECT_SEARCH_PATHS` | si objets publics | liste séparée par des virgules. |
| `GOOGLE_APPLICATION_CREDENTIALS` | oui (hors Replit) | JSON d'un service account, ou workload identity. |
| `OBJECT_STORAGE_PROVIDER` | non | `replit` \| `gcs` ; auto-détecté (`REPL_ID` présent → `replit`). |
| `GCS_PROJECT_ID` | non | projet GCS si l'ADC ne le porte pas. |

## 4. Portage de l'API Express sur Vercel

`api/index.ts` (racine) exporte l'app Express de `@workspace/api-server` comme
handler. Contrairement à `src/index.ts` (point d'entrée Replit/conteneur), il ne lit
pas `PORT` et n'appelle pas `listen()` : c'est Vercel qui invoque le handler.

Le seul vrai couplage à Replit était le stockage objet : `objectStorage.ts`
construisait un client GCS pointé sur le **sidecar Replit** (`127.0.0.1:1106`) et
faisait signer les URL par ce sidecar. C'est maintenant sélectionné par provider :

- **`replit`** (défaut sur Replit) : comportement inchangé — credentials
  `external_account` vers le sidecar + signature par le sidecar ;
- **`gcs`** (défaut partout ailleurs) : `new Storage()` sans options → Application
  Default Credentials, et signature **v4** locale via `file.getSignedUrl()`.

`audioStorage.requestPrivateAudioUpload()` passe par le même `signPrivateUploadURL()`
au lieu d'appeler le sidecar en dur. Les ACL (`objectAcl.ts`) n'utilisaient que des
métadonnées custom GCS → portables telles quelles. `documentPdf.ts` ne touche aucun
stockage (génération PDF pure). Rien d'autre dans `src/` ne référence le sidecar.

`logger.ts` n'active plus `pino-pretty` lorsque `VERCEL` est défini : c'est une
devDependency, absente du runtime serverless, et un transport pino ferait échouer le
cold start.

### Contraintes Vercel à connaître

- **Corps de requête limité à 4,5 Mo.** Les images de thème acceptent jusqu'à
  8 Mo (`MAX_THEME_IMAGE_BYTES`) via `multer.memoryStorage()` → les photos lourdes
  seront refusées par la plateforme avant d'atteindre Express. Soit abaisser la
  limite, soit passer par un upload direct signé comme pour l'audio.
- L'audio, lui, ne transite pas par la fonction : le navigateur PUT directement sur
  l'URL signée (`Search.tsx`), ce qui reste valable avec les URL signées GCS.
- **Durée d'exécution** : 10 s (Hobby) / 60 s (Pro) par défaut. `maxDuration` n'est
  pas déclaré dans `vercel.json` pour ne pas faire échouer un déploiement Hobby.
- `/tmp` seul écrivable, et éphémère.
- `sharp` est un module natif : il est embarqué par le traceur de Vercel, mais c'est
  le point à surveiller au premier déploiement.

## 5. Vérifications réellement exécutées

| Vérification | Résultat |
| --- | --- |
| `pnpm run build` dans `artifacts/soundtrack`, **sans** `PORT`/`BASE_PATH` (commande Vercel) | ✅ `✓ built in 4.79s` → `dist/public/{index.html,assets,…}` |
| `pnpm --filter @workspace/soundtrack run build` depuis la racine (`buildCommand` du `vercel.json`) | ✅ idem |
| `pnpm --filter @workspace/mockup-sandbox run build`, sans env | ✅ `✓ built in 1.90s` |
| `vite preview` sur le build | ✅ port 3000 par défaut ; `/` et `/app/timeline` → 200 HTML ; `/assets/*.js` → 200 |
| Build avec `VITE_CLERK_PIN_PUBLISHABLE_KEY=true` | ✅ clé inlinée dans le bundle |
| `pnpm --filter @workspace/api-server run build` (esbuild) | ✅ `⚡ Done in 416ms` |
| Bundle CJS de `api/index.ts` (forme produite par `@vercel/node`) | ✅ `module.exports = { default }`, `__esModule = true`, `typeof default = function`, `app.listen = function` |
| Requête réelle sur l'app exportée (`NODE_ENV=production`, `DATABASE_URL` factice) | ✅ `GET /api/healthz` → `200 {"status":"ok"}` ; `GET /api/nope` → `404` |
| Même test **sans** `CLERK_SECRET_KEY` | ❌ `500 Missing Clerk Secret Key` → variable obligatoire |
| Signature d'URL avec un service account factice, `OBJECT_STORAGE_PROVIDER` auto | ✅ `objectStorageProvider = gcs`, `https://storage.googleapis.com/<bucket>/<object>` avec `X-Goog-Signature` et `X-Goog-Credential=…/auto/storage/goog4_request` |
| `tsc --noEmit` soundtrack **sur clone frais** (état Vercel) | 111 erreurs, dans 13 fichiers (`pages/Professional/*`, `lib/theme.tsx`, `lib/dj-transfers.ts`…) — aucune dans `App.tsx` ni `vite.config.ts` |
| `tsc --noEmit` soundtrack **après `pnpm run typecheck:libs`** | 2 erreurs (`DocumentEditor.tsx` : `purchaseOrderNumber` absent de `ProfessionalDocumentInput`) |
| `tsc --noEmit` api-server, clone frais / après `typecheck:libs` | 25 / 6 erreurs, dans `documentPdf.ts`, `sillage.ts`, `djTransfers.ts`, `professionalDocuments.ts`, `eventTheme.ts`, `health.ts` — **aucune** dans `objectStorage.ts`, `audioStorage.ts`, `logger.ts` |

**Non vérifiable ici** : le build Vercel lui-même (pas d'accès au projet), le runtime
Clerk (pas de clés réelles), l'accès GCS réel (aucun bucket/crédential), et les
requêtes SQL (pas de Postgres).

## 6. Autres points relevés

- **Typecheck cassé, et le nombre d'erreurs dépend de l'état du dépôt.** Mesuré :
  sur un clone frais (ce que voit Vercel) → 111 erreurs dans `soundtrack`, 25 dans
  `api-server` ; après `pnpm run typecheck:libs` → 2 et 6. Cause : les `tsconfig.json`
  déclarent des `references` vers `lib/*`, et TypeScript redirige les imports vers les
  `.d.ts` générées par `tsc --build` quand elles existent (`lib/*/dist` n'est pas
  versionné). Conséquence : `pnpm run build` à la racine est rouge, d'où le
  `buildCommand` du `vercel.json` ciblé sur le seul package soundtrack. Tout ceci est
  antérieur à ces changements (vérifié par `git stash`) et n'affecte pas le
  déploiement, qui ne lance que `vite build`.
- **`.env` non ignoré** : aucune règle `.env` dans `.gitignore` (aucun `.env` suivi,
  mais rien n'empêchait un commit de secrets). Règles ajoutées, `.env.example`
  conservés.
- **Version pnpm non épinglée** : Vercel a deviné `pnpm@10.x` d'après la date de
  création du projet. Pour des builds reproductibles, ajouter
  `"packageManager": "pnpm@10.x.y"` au `package.json` racine — non fait pour ne pas
  imposer un téléchargement corepack aux postes de dev.
- **Bundle > 500 kB** : `index-*.js` ≈ 766 kB (220 kB gzip). Un `React.lazy` par page
  améliorerait le premier chargement.
