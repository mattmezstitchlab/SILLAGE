# Déploiement Vercel

Ce document explique l'échec du build Vercel constaté le 2026-09-11, sa cause, le
correctif appliqué, et ce qui reste à faire pour que l'application **fonctionne**
(pas seulement compile) sur Vercel.

## 1. L'erreur

```
failed to load config from /vercel/path0/artifacts/soundtrack/vite.config.ts
error during build:
Error: PORT environment variable is required but was not provided.
```

### Cause

`artifacts/soundtrack/vite.config.ts` (et `artifacts/mockup-sandbox/vite.config.ts`)
étaient générés par le gabarit Replit et **levaient une exception au chargement de la
config** si `PORT` ou `BASE_PATH` n'étaient pas présents dans l'environnement :

```ts
const rawPort = process.env.PORT;
if (!rawPort) throw new Error('PORT environment variable is required but was not provided.');
```

Sur Replit ces deux variables sont injectées par la plateforme au moment du run.
Sur Vercel, `vite build` est lancé sans elles → la config Vite ne peut même pas être
chargée, donc le build s'arrête avant de compiler quoi que ce soit. `PORT` n'a pourtant
aucune utilité pour un `vite build` (il ne sert qu'aux serveurs `dev` / `preview`).

### Correctif appliqué

Les deux `vite.config.ts` utilisent maintenant des valeurs par défaut au lieu de lever :

- `PORT` absent → `3000` (ne sert qu'à `dev` / `preview`) ;
- `PORT` fourni mais invalide → erreur explicite (comportement Replit conservé) ;
- `BASE_PATH` absent → `/` (l'application est servie à la racine du domaine).

Vérification locale : `pnpm --filter @workspace/soundtrack run build` **sans** `PORT`
ni `BASE_PATH` produit `dist/public/{index.html,assets,favicon.svg,logo.svg,robots.txt}`.

## 2. Réglages du projet Vercel

Le log montre que le build a été lancé dans `/vercel/path0/artifacts/soundtrack`
(`> @workspace/soundtrack@0.0.0 build /vercel/path0/artifacts/soundtrack`) : le
**Root Directory** du projet Vercel est donc `artifacts/soundtrack`. C'est ce qu'il
faut conserver.

| Réglage (Settings) | Valeur |
| --- | --- |
| Root Directory | `artifacts/soundtrack` |
| Framework Preset | Vite (aussi déclaré dans `vercel.json`) |
| Build Command | `pnpm run build` |
| Output Directory | `dist/public` ⚠️ et non `dist` |
| Install Command | laisser vide (Vercel installe tout le workspace pnpm depuis la racine) |
| Node.js Version | 22.x (`.replit` vise Node 24 ; Vite 7 exige ≥ 20.19 / 22.12) |

Le fichier `artifacts/soundtrack/vercel.json` déclare ces valeurs ainsi que le
fallback SPA indispensable (wouter + Clerk utilisent des routes côté client
`/sign-in`, `/app/timeline`, `/dj-transfers/:id`…) :

```json
{ "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }] }
```

Les `rewrites` Vercel s'appliquent après la recherche dans le système de fichiers,
donc `/assets/*`, `/favicon.svg`, `/logo.svg` et `/robots.txt` continuent d'être servis
directement. `/api/*` est exclu du fallback pour ne pas renvoyer du HTML aux appels API.

> ⚠️ Si le Root Directory est changé pour la racine du dépôt, `vercel.json` ne sera plus
> lu et le build échouera autrement : `package.json#build` à la racine enchaîne
> `pnpm run typecheck`, qui **échoue aujourd'hui** (voir §5).

## 3. Variables d'environnement à saisir sur Vercel

Ce sont des variables de **build** pour Vite (inlinées dans le bundle au moment du
build, pas au runtime). Modèle : `artifacts/soundtrack/.env.example`.

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | oui | clé publique Clerk (`pk_test_…` ou `pk_live_…`) |
| `VITE_CLERK_PIN_PUBLISHABLE_KEY` | recommandé (`true`) | utilise la clé ci-dessus telle quelle |
| `VITE_CLERK_PROXY_URL` | non | seulement si le trafic Clerk passe par l'API |

### Le piège Clerk

`App.tsx` appelle `publishableKeyFromHost(window.location.hostname, VITE_CLERK_PUBLISHABLE_KEY)`.
Cette fonction (voir `@clerk/shared/dist/keys.js`) ne renvoie la clé fournie **que si
c'est une clé de développement** (`pk_test_`) ; sinon elle en fabrique une à partir du
nom d'hôte : `clerk.<hostname>` encodé en base64. C'est voulu sur Replit (plusieurs
domaines personnalisés → plusieurs instances Clerk), mais sur un domaine
`*.vercel.app` cela produit une clé pointing vers une instance Clerk inexistante, et
l'authentification échoue alors que le build est vert.

D'où l'option ajoutée, désactivée par défaut pour ne rien changer au comportement Replit :

```ts
const clerkPubKey =
  import.meta.env.VITE_CLERK_PIN_PUBLISHABLE_KEY === 'true' && explicitClerkKey
    ? explicitClerkKey
    : publishableKeyFromHost(window.location.hostname, explicitClerkKey);
```

Sur Vercel : `VITE_CLERK_PIN_PUBLISHABLE_KEY=true` + la clé de l'instance.

## 4. Ce qui n'est PAS réglé : le backend

Le frontend appelle l'API en **chemin relatif sur le même origin** :
`fetch('/api/events/…/theme')`, `/api/events/…/share`, `/api/share/:id`,
`/api/professional/…` (voir `src/lib/theme.tsx`, `src/pages/Collaborate.tsx`,
`src/pages/Professional/*`).

Sur Replit, le déploiement `router = "application"` sert le SPA **et**
`@workspace/api-server` (Express 5) sur le même domaine. Sur Vercel, avec Root
Directory `artifacts/soundtrack`, **seul le SPA statique est déployé** : le build
passe, la landing et l'écran de connexion s'affichent, mais tous les appels `/api/*`
renverront 404 (aucun fichier, et exclu du fallback SPA).

Trois options, par ordre de simplicité :

1. **Garder l'API ailleurs** (Render, Fly, Railway, un conteneur) et faire pointer le
   frontend dessus. Nécessite d'introduire une variable `VITE_API_BASE_URL` et de la
   passer à `setBaseUrl()` de `@workspace/api-client-react` — mais les `fetch('/api/…')`
   codés en dur dans `theme.tsx` / `Collaborate.tsx` / `Professional/*` doivent aussi
   être repris. Attention CORS + cookies (`credentials: 'include'` exige
   `SameSite=None; Secure` et une origine explicite côté Express).
2. **Porter l'API en Serverless Functions Vercel** : exporter l'app Express depuis un
   fichier `api/index.ts` et router `/api/(.*)` dessus. Prévoir les limites :
   `multer`/uploads sur disque → `/tmp` uniquement, `sharp` (natif), `@google-cloud/storage`
   externalisé par `build.mjs`, taille et durée d'exécution des fonctions, et
   `DATABASE_URL` Postgres compatible serverless (pooler).
3. **Rester sur Replit** pour le runtime et n'utiliser Vercel que pour des previews.

Côté API, les variables nécessaires : `PORT` (toujours requis au démarrage par
`artifacts/api-server/src/index.ts`), `DATABASE_URL`, `CLERK_PUBLISHABLE_KEY`
/ secret, et l'accès Object Storage.

## 5. Autres points relevés pendant l'analyse

- **Typecheck cassé** : `pnpm --filter @workspace/soundtrack run typecheck` remonte
  111 erreurs (TS7006/TS7031 principalement, dans `src/pages/Professional/*`,
  `src/lib/theme.tsx`, `src/lib/dj-transfers.ts`…), et `@workspace/api-server` échoue
  aussi. C'est antérieur à ce correctif (vérifié par `git stash`). Sans impact sur le
  déploiement actuel puisque Vercel n'exécute que `vite build`, mais
  `pnpm run build` à la racine du dépôt est rouge.
- **`.env` non ignoré** : aucune règle `.env` dans `.gitignore` (aucun fichier `.env`
  n'est suivi actuellement, mais rien n'empêchait un commit accidentel de secrets).
  Règles ajoutées, `.env.example` conservé.
- **Version pnpm non épinglée** : Vercel a deviné `pnpm@10.x` d'après la date de création
  du projet (avertissement `Detected pnpm-lock.yaml 9`). Pour des builds reproductibles,
  ajouter `"packageManager": "pnpm@10.x.y"` au `package.json` racine — non fait ici pour
  ne pas imposer un téléchargement corepack aux postes de dev.
- **Bundle > 500 kB** : `index-*.js` fait ~766 kB (220 kB gzip), avertissement Vite.
  Un code-splitting des pages (`React.lazy`) améliorerait le premier chargement.
- **`preinstall`** : le script racine supprime `package-lock.json`/`yarn.lock` et impose
  pnpm. Compatible avec Vercel tant que le package manager détecté reste pnpm.
