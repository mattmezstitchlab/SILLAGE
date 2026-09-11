# Espace professionnel — contrat API

Cette API est **privée** : toutes les routes commencent par `/api/professional`
et nécessitent une session Clerk. L'identifiant d'identité canonique est
`sessionClaims.userId || userId`; aucune donnée de lien invité, d'événement
musical ou de DJ n'est acceptée. Une ressource d'un autre propriétaire répond
`404`.

## Ressources

- `PUT /professional/profile` crée ou remplace le profil légal. Une
  modification existante doit inclure sa `revision`; `DELETE` supprime le
  profil courant sans toucher aux snapshots déjà émis.
- `POST|GET /professional/clients` puis
  `GET|PATCH|DELETE /professional/clients/:clientId`.
- `POST|GET /professional/dossiers` puis
  `GET|PATCH|DELETE /professional/dossiers/:dossierId`.
- `POST|GET /professional/documents` puis
  `GET|PATCH|DELETE /professional/documents/:documentId`.
  Les documents sont `quote`, `contract` ou `invoice` et commencent en
  `draft`. `PATCH` exige la révision courante. Suppression et modification
  sont refusées après émission (`409`).

Les adresses ont la forme `{ line1, line2, postalCode, city, country }`.
Les montants sont des entiers en centimes (`quantity` est un entier), jamais
des nombres flottants. Les dossiers ont `pathway` égal à
`invoiced_service` ou `salaried_employment`; ce dernier conserve uniquement
les contacts, cachets/heures saisis manuellement et la checklist, et ne peut
pas produire un devis ou une facture.

## Émission et avoirs

`POST /professional/documents/:documentId/issue`

```json
{ "revision": 1, "idempotencyKey": "invoice-client-retry-001", "sourcesReviewed": true }
```

La facture doit avoir un client domestique français, un profil complet et les
éléments d'identité de la forme choisie : prénom/nom/Siren pour une EI, Siren,
forme et capital social pour une société. Le profil standard exige un numéro
de TVA et chaque ligne doit porter un taux présent dans les taux validés du
profil ; l'application n'invente pas de liste de taux. En franchise, le PDF
porte exactement `TVA non applicable, article 293 B du code général des
impôts`. Une facture doit aussi contenir une date de livraison/fin de
prestation (ou la date du dossier), une échéance et des conditions de
paiement ; un client professionnel doit fournir le taux des pénalités de
retard. L'escompte absent est affiché comme `Escompte pour paiement anticipé :
néant`. Les cas étrangers, l'exonération non documentée et la transmission
électronique réglementaire sont bloqués. La date est celle du serveur à Paris.
Le numéro `FAC-AAAA-0001` est attribué sous verrou (la série distincte `AVO`
est réservée aux avoirs et conservée séparément) et une relance idempotente
renvoie la même facture.

`POST /professional/documents/:invoiceId/credit-notes`

```json
{
  "amountCents": 12500,
  "title": "Annulation partielle",
  "reason": "Prestation réduite",
  "idempotencyKey": "credit-retry-001",
  "sourcesReviewed": true
}
```

L'avoir `AVO-AAAA-0001` est émis sous verrou et son montant positif ne peut
pas dépasser le reliquat de la facture d'origine. Sa TVA est calculée en
centimes, proportionnellement à la facture référencée, et la réponse expose
`originalInvoiceId`. La facture originale reste inchangée.

## Historique et PDF

Chaque sauvegarde crée une ligne dans
`GET /professional/documents/:documentId/revisions`. Le PDF est généré côté
serveur depuis un snapshot enregistré :
`GET /professional/documents/:documentId/download?revision=2`. Il répond
`application/pdf`, `Cache-Control: private, no-store` et une pièce jointe
avec nom nettoyé. Les versions de contrat archivées restent donc
téléchargeables. L'API ne signe jamais de lien de stockage public.

Les réponses d'erreur sont JSON `{ "error": "..." }` avec `400` (corps ou
règle métier), `401` (session absente), `404` (ressource privée absente) et
`409` (révision, émission, compteur ou crédit concurrencé).

`GET /professional/sources` expose `sourceReviewDate` et, pour chaque source
officielle, son titre, URL, `reviewedAt` et le résumé des points utilisés. Les
émissions restent bloquées si la fiche datée `docs/fr-documents-sources.md`
ne contient pas les sections de règles et les liens officiels attendus.