# Documents professionnels français — sources et limites

**État de la recherche : 11 septembre 2026.** Ce document est une fiche
d’implémentation, pas un avis juridique, fiscal, social ou une validation de
document. Les liens ci-dessous sont limités à Service Public, économie.gouv.fr,
impots.gouv.fr, GUSO, Urssaf et Légifrance. Les pages pouvant changer, conserver
la date de la dernière vérification dans chaque dossier.

## Règles de portée

- Séparer le parcours **prestation facturée** du parcours **embauche salariée**.
  Une facture ne remplace jamais un salaire, un contrat de travail, la paie, une
  DPAE ou une déclaration GUSO.
- Ne pas inventer un régime fiscal, un taux de TVA, une base légale
  d’exonération, une qualité d’intermittent ou une qualification de DJ.
- Pour cette première version, l’émission est **France métropolitaine /
  opérations domestiques, régime fiscal explicitement sélectionné et pris en
  charge**. Bloquer l’émission si le vendeur, le client, la territorialité, le
  régime de TVA ou la règle applicable sont inconnus. Les opérations
  transfrontalières, l’autoliquidation, l’autofacturation, les régimes
  particuliers et les devises étrangères nécessitent une analyse dédiée.
- Un PDF exporté est un rendu ou une archive. Il ne vaut ni signature
  électronique probante, ni transmission officielle, ni facture électronique
  conforme lorsque la réforme l’impose.

## Devis et contrats à préparer

### Devis

Un devis est une **offre de contrat** et engage les parties lorsqu’il est
accepté. Pour un consommateur, le prix doit être communiqué avant l’achat ; un
devis détaillé est obligatoire pour certaines prestations, pas pour toutes les
prestations. Le devis doit, selon la prestation concernée, être daté et
indiquer les parties, la description et le décompte détaillé (quantité, prix
unitaire), les frais de main-d’œuvre et de déplacement lorsqu’ils s’appliquent,
le prix HT/TTC et la TVA ou l’exonération, le caractère gratuit ou payant du
devis et la durée de validité de l’offre. La date et l’acceptation/signature
des deux parties doivent rester traçables.

Champs minimaux du module : vendeur légal, client et adresses, objet précis,
dates/lieu, lignes quantité–unité–prix, frais et remises, profil de TVA,
totaux HT/TVA/TTC, validité, acompte et conditions de paiement, conditions
d’annulation reportées ou relues par le professionnel, date et état
brouillon/accepté. Ne pas présenter un devis comme « obligatoire » lorsque la
prestation ne relève pas d’un texte spécial.

### Contrat et informations précontractuelles

Le contrat doit reprendre les parties, la prestation et ses limites, les dates,
le prix et les modalités d’exécution/paiement. Pour un client consommateur,
l’information précontractuelle doit aussi couvrir les caractéristiques
essentielles, le prix, les coordonnées du professionnel, les modalités de
paiement/exécution et de réclamation, les garanties légales, la durée et la
résiliation lorsqu’elles sont pertinentes, ainsi que le médiateur de la
consommation. Ces éléments sont des champs à vérifier ; ils ne constituent pas
un contrat juridique généré ou signé par l’application.

## Facture : champs obligatoires et taxes

### Identité et opération

Pour toute facture émise, prévoir au minimum :

| Bloc | Champs à contrôler |
| --- | --- |
| Émission | Date d’émission ; numéro unique ; date de livraison/fin de prestation ou d’acompte lorsqu’elle diffère. |
| Vendeur — EI | Nom et prénom, mention « **Entrepreneur individuel** » ou « **EI** », adresse, numéro Siren. |
| Vendeur — société | Dénomination sociale, numéro Siren, adresse du siège, forme juridique et capital social ; adresse de facturation si elle diffère du siège. |
| Client | Nom complet ou dénomination sociale, adresse et adresse de facturation lorsqu’elle diffère ; numéro de bon de commande s’il a été préalablement établi. |
| TVA | Numéro individuel de TVA du vendeur et, si applicable, celui du client professionnel ; l’exception des factures ne dépassant pas 150 € HT ne dispense pas d’examiner les autres mentions. |
| Lignes et totaux | Désignation précise, quantité, prix unitaire HT, taux de TVA ou mention de l’exonération ; remises acquises ; total HT, TVA par taux et total TTC. |
| Paiement | Date d’échéance ; conditions d’escompte ou « **Escompte pour paiement anticipé : néant** » si aucun escompte ; taux des pénalités de retard ; indemnité forfaitaire de recouvrement seulement dans la relation professionnelle. |

Une facture B2B est en principe obligatoire. Une facture B2C est notamment
obligatoire à la demande du particulier, pour une vente à distance et dans
certains cas intracommunautaires ; lorsqu’elle est émise, elle doit néanmoins
respecter les mentions applicables. Pour certaines catégories de biens vendus
à un particulier, ajouter l’existence et la durée de la garantie légale de
conformité.

### Régime de TVA

- **TVA collectée** : le taux et le montant doivent être justifiés par la
  situation de l’opération ; conserver le prix HT, le taux, le montant de TVA
  et le TTC par taux. Ne pas proposer une liste de taux supposés.
- **Franchise en base** : ne pas afficher de TVA et afficher exactement
  **« TVA non applicable, article 293 B du code général des impôts »**. Le
  franchisé reste assujetti à la TVA même s’il n’est pas redevable et ne doit
  pas faire apparaître de TVA sur sa facture.
- **Exonération ou autoliquidation** : exiger la base légale et la situation
  confirmées par le professionnel ; la mention « Autoliquidation » ou une
  référence d’exonération ne doit pas être ajoutée automatiquement.
- EI, micro-entreprise, société et activité principale ne suffisent pas à
  déduire le régime de TVA. Le régime sélectionné, sa preuve et la
  territorialité sont des prérequis de l’émission.

### Point de bascule 293 B / CIBS en 2026

Ne pas confondre la réforme de facturation électronique du 1er septembre 2026
avec la recodification de la TVA. La version Légifrance de l’article 293 B
court jusqu’au **1er janvier 2027**. L’ordonnance n° 2026-671 du 27 juillet
2026 a décalé du 1er septembre 2026 au **1er janvier 2027** l’entrée en vigueur
du transfert de la TVA du CGI vers le CIBS ; son rapport indique aussi que les
anciennes références au CGI pourront continuer à être utilisées jusqu’au
**30 juin 2028**. Au 11 septembre 2026, le libellé ci-dessus fondé sur
l’article 293 B reste donc le libellé prudent. Prévoir un libellé fiscal
configurable et revérifier le texte CIBS effectif avant de modifier le modèle
en 2027 ; ne pas remplacer 293 B simplement parce que la facturation
électronique commence en septembre 2026.

## Numérotation, émission et corrections

- Les factures ont un numéro unique fondé sur une séquence **chronologique,
  continue et unique**. Des séries séparées sont possibles seulement si les
  conditions d’exercice les justifient ; leur justification doit être
  conservée.
- Un brouillon reste modifiable. Après émission, ne pas modifier ni supprimer
  la facture originale : conserver son snapshot, son numéro et son historique.
- **Avant paiement** : une facture rectificative peut porter un nouveau numéro
  et la mention **« annule et remplace la facture n°… »** ; elle suit les mêmes
  modalités d’envoi que la facture initiale lorsqu’elle est électronique.
- **Après paiement** : corriger ou annuler par un **avoir**. L’avoir est un
  document à part entière, avec son propre numéro dans une séquence
  chronologique, continue et unique (même série ou série d’avoirs distincte
  justifiée). La facture originale ne change pas.
- L’émission doit être idempotente et atomique : aucun numéro réutilisé, aucune
  modification silencieuse, aucun trou effacé. Une tentative concurrente ou
  une réémission doit renvoyer l’émission existante ou une erreur explicite.

## Retard de paiement : B2B contre B2C

- En B2B, le délai de paiement doit figurer sur la facture et les CGV. À
  défaut de règle spéciale, le délai de principe est de 30 jours à compter de
  la réception de la marchandise ou de la réalisation de la prestation.
- Les pénalités B2B sont exigibles sans rappel à partir du lendemain de
  l’échéance. Le taux doit être choisi selon le contrat et le taux légal
  applicable (à défaut, le Code de commerce prévoit notamment le taux BCE
  majoré de 10 points, sans pouvoir être inférieur à trois fois l’intérêt
  légal) ; ne pas figer un taux sans vérifier la période.
- En cas de retard d’un client professionnel, ajouter la mention et le montant
  de l’**indemnité forfaitaire de 40 €** pour frais de recouvrement. Elle est
  due de plein droit par le professionnel retardataire et ne peut être
  réclamée que dans cette relation professionnelle.
- En B2C, ne jamais ajouter automatiquement la ligne « indemnité forfaitaire
  40 € ». La source Service Public la limite au client professionnel ; toute
  autre pénalité consommateur doit être vérifiée séparément avant d’être
  générée.

## Facturation électronique : calendrier au 11 septembre 2026

- Depuis le **1er septembre 2026**, toutes les entreprises établies en France
  et assujetties à la TVA, y compris le franchisé en base, doivent être en
  mesure de **recevoir les factures B2B du champ** sous forme électronique via
  une plateforme agréée.
- Depuis cette date, les grandes entreprises et les ETI doivent aussi
  **émettre** électroniquement. Les PME et micro-entreprises ont l’obligation
  d’émettre à compter du **1er septembre 2027**. Des obligations d’e-reporting
  dépendent de l’opération et du profil.
- Aux dates d’émission correspondantes, prévoir aussi les quatre mentions
  nouvelles : **Siren du client professionnel**, adresse de livraison si elle
  diffère de l’adresse de facturation, indication « livraisons de biens »,
  « prestations de services » ou les deux, et mention **« Option pour le
  paiement de la taxe d’après les débits »** si cette option a été exercée.
- Une facture image/PDF, un PDF bureautique ou un PDF envoyé par courriel ne
  constitue pas une facture électronique : il manque notamment le socle de
  données structuré et l’intermédiation de la plateforme agréée. L’application
  peut produire un PDF pour relecture, remise hors champ ou archivage, mais ne
  doit pas le présenter comme transmis réglementairement.
- Implémentation : distinguer `pdf_export` de `e_invoice_transmitted`. Sans
  intégration à une plateforme agréée, bloquer la prétention de conformité et
  la transmission B2B lorsque l’obligation d’émission du vendeur est active ;
  ne pas simuler un accusé de réception, un e-reporting ou un raccordement.

## Dossier spectacle : checklist préparatoire

### Choisir la bonne voie

- **Prestation facturée** : le fournisseur exerce réellement une prestation
  indépendante et remet un devis/contrat/facture.
- **Emploi salarié** : un employeur engage une personne et doit préparer
  contrat, DPAE, DUS/GUSO, salaire et cotisations. Le dossier spectacle ne doit
  jamais produire une facture pour remplacer ce parcours.

### GUSO : conditions vérifiées

Le GUSO est réservé aux employeurs dont l’activité principale n’est pas la
diffusion ou la production de spectacles, l’exploitation d’un lieu de spectacle
ou d’un parc de loisirs. Sont notamment visés les particuliers, commerçants,
professions libérales, associations, entreprises, CSE, hôtels/restaurants et
personnes publiques. Il facilite l’embauche d’un artiste ou d’un technicien
pour un spectacle vivant.

Le spectacle vivant est une représentation publique d’une œuvre avec la
présence physique d’au moins un artiste du spectacle. Une prestation
enregistrée (studio/CD) ne relève pas du GUSO. Le nombre de représentations
déclarées au GUSO n’est pas limité ; pour un employeur dont l’activité
principale n’est pas le spectacle, le récépissé de déclaration d’entrepreneur
de spectacles vivants valant licence devient obligatoire **au-delà de six
représentations par an (à partir de la 7e)**. Une activité principale de
spectacle doit faire vérifier l’obligation de récépissé/licence sans appliquer
le seuil de l’employeur occasionnel.

### Artiste, DJ et présomption de salariat

L’article L. 7121-2 cite notamment l’artiste de variétés et le musicien parmi
les artistes du spectacle. L’article L. 7121-3 présume contrat de travail le
contrat rémunéré qui s’assure le concours d’un artiste du spectacle, lorsque
celui-ci n’exerce pas cette activité dans des conditions impliquant son
inscription au registre du commerce et des sociétés.

Le mot **DJ** ne suffit donc pas à déduire le statut : demander le rôle réel,
la prestation en direct devant public, la présence physique, l’organisateur et
les conditions d’exercice. Ne jamais déduire automatiquement « intermittent »
ou « artiste salarié » du seul intitulé DJ ; lorsqu’il existe un doute,
bloquer l’orientation automatique et demander une vérification professionnelle.

### Dates et pièces à préparer

Checklist minimale sans stocker de données sensibles inutiles :

1. employeur, artiste/technicien, lieu, public, date(s), objet, rôle et
   présence physique ;
2. cachet/salaire brut, heures ou dates de répétition, avantages et frais
   saisis manuellement ; aucune paie ou cotisation certifiée par l’application ;
3. choix du contrat écrit ou de la DUS, convention collective à vérifier et
   conditions d’emploi ;
4. **DPAE** à adresser à l’Urssaf avant la prise de fonction ou le début de la
   période d’essai, au plus tôt dans les 8 jours précédant l’embauche ;
5. **DUS** GUSO saisissable au plus tôt 1 mois avant la prestation et au plus
   tard 15 jours après ; les cotisations et contributions doivent être
   régularisées dans les 15 jours suivant la fin du contrat ;
6. la DUS vaut contrat de travail à défaut de contrat conforme et doit être
   remise au salarié au plus tard dans les 2 jours suivant l’embauche ; le
   salaire net est versé directement par l’employeur.

L’application peut garder dates, états et cases à cocher, mais ne transmet pas
de DPAE/DUS, ne calcule pas une paie certifiée et ne stocke pas de numéro de
sécurité sociale ou de pièce d’identité si le parcours officiel ne l’exige pas
dans l’application. Le responsable doit finaliser la démarche sur Urssaf/GUSO.

## Garde-fous d’émission

Bloquer l’émission (avec raison lisible) si :

- identité légale ou adresse d’une partie manquante, numéro fiscal requis
  absent, client étranger ou territorialité non vérifiée ;
- régime de TVA absent, non pris en charge, exonération/autoliquidation
  non-documentée, ou taux saisi non validé ;
- un document du parcours salarié est demandé comme facture ;
- un B2B soumis à l’émission électronique est marqué « conforme » sans
  transmission par plateforme agréée ;
- une facture émise est modifiée, supprimée ou renumérotée directement.

Le produit ne couvre pas ici les taux de TVA non confirmés, les opérations
cross-border, la paie, le calcul certifié des cotisations, la déclaration
GUSO/Urssaf, la signature électronique probante, le e-reporting ou une
validation juridique individualisée.

## Sources officielles vérifiées

Dates = date affichée par la source quand elle est disponible ; sinon date de
vérification de cette fiche (11/09/2026).

| Source officielle | Date affichée / vérifiée | Points utilisés |
| --- | --- | --- |
| [Service Public Entreprendre — Mentions obligatoires sur une facture](https://entreprendre.service-public.fr/vosdroits/F31808) | Vérifié le 11/08/2026 | Identité EI/société et client, lignes, TVA, échéance, pénalités, 40 €, franchise. |
| [Service Public Entreprendre — Tout savoir sur la facturation](https://entreprendre.service-public.fr/vosdroits/F23208) | Vérifié le 07/08/2026 | Facturation, réforme, impossibilité de modifier une facture émise, rectificative et avoir. |
| [Service Public Entreprendre — Délais de paiement entre professionnels](https://entreprendre.service-public.fr/vosdroits/F23211) | Vérifié le 07/08/2026 | Délai de principe B2B et pénalités. |
| [Économie — Mentions obligatoires d’une facture](https://www.economie.gouv.fr/entreprises/gerer-son-entreprise-au-quotidien/gerer-sa-comptabilite-et-ses-demarches/mentions-obligatoires-dune-facture-tout-savoir) | Écrit le 25/02/2026 | Nouvelles mentions, calendrier et règles générales. |
| [Économie/DGCCRF — Devis](https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/devis) | Écrit le 20/01/2023 | Devis détaillé, offre de contrat, acceptation, durée de validité et champs selon prestation. |
| [Légifrance — Code de la consommation, articles L. 111-1 et R. 111-1](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044142438) | Versions vérifiées le 11/09/2026 | Informations précontractuelles consommateur ; voir aussi [R. 111-1](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000045987238). |
| [Légifrance — CGI, annexe II, article 242 nonies A](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000050811276) | Version depuis le 01/01/2025 ; dispositions e-facture au 01/09/2026/2027 | Numéro chronologique, données de lignes, TVA, exonération, autoliquidation et mentions électroniques. |
| [Légifrance — Code de commerce, article L. 441-9](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000038414397) | Vérifié le 11/09/2026 | Mentions de facturation et délais sur la facture. |
| [Légifrance — Code de commerce, article L. 441-10](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000038414392) et [article D. 441-5](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000043197457) | L. 441-10 vérifié le 11/09/2026 ; D. 441-5 en vigueur depuis le 27/02/2021 | Pénalités B2B, exigibilité sans rappel et indemnité forfaitaire de 40 €. |
| [Légifrance — CGI, article 293 B](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000048826700) | Version du 01/03/2025 au 01/01/2027 | Franchise en base ; libellé 293 B encore applicable au 11/09/2026. |
| [Légifrance — rapport de l’ordonnance n° 2026-671 du 27/07/2026](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000054497139) | 27/07/2026 | Report du transfert TVA CGI → CIBS au 01/01/2027 et maintien des références CGI jusqu’au 30/06/2028. |
| [Impots — Je passe à la facturation électronique](https://www.impots.gouv.fr/professionnel/je-passe-la-facturation-electronique) | Publié le 16/10/2024, modifié le 01/09/2026 | Démarrage du dispositif et documentation officielle. |
| [Impots — Franchisé en base, suis-je concerné ?](https://www.impots.gouv.fr/professionnel/questions/franchise-en-base-micro-entrepreneur-ou-auto-entrepreneur-suis-je-concerne) | Publié le 15/11/2024, modifié le 16/01/2026 | Assujetti non redevable : réception, émission et données selon calendrier. |
| [Impots — Un PDF envoyé par mail est-il une facture électronique ?](https://www.impots.gouv.fr/professionnel/questions/est-ce-quune-facture-envoyee-par-mail-est-une-facture-electronique) | Publié le 15/11/2024, modifié le 16/01/2026 | PDF ordinaire non électronique ; socle structuré et plateforme agréée. |
| [Impots — Plateformes agréées](https://www.impots.gouv.fr/facturation-electronique-et-plateformes-agreees) | Vérifié le 11/09/2026 | Rôle de la plateforme agréée, transmission facture et e-reporting. |
| [GUSO — Accueil et conditions](https://www.guso.fr/information) | Vérifié le 11/09/2026 | Employeurs éligibles, spectacle vivant et embauche. |
| [GUSO — Déclarations](https://www.guso.fr/information/faq/declarations.html) | Vérifié le 11/09/2026 | Présence physique, DUS 1 mois avant/15 jours après, valeur de contrat, remise sous 2 jours. |
| [GUSO — Paiement](https://www.guso.fr/information/faq/paiement.html) | Vérifié le 11/09/2026 | Cotisations/contributions dans les 15 jours suivant la fin du contrat et salaire net direct. |
| [GUSO — Réglementation](https://www.guso.fr/information/faq/reglementation.html) et [informations réglementaires](https://www.guso.fr/information/les-services-du-guso/informations-reglementaires.html) | Vérifié le 11/09/2026 | Pas de limite GUSO ; récépissé valant licence au-delà de 6 représentations. |
| [Urssaf — DPAE](https://www.urssaf.fr/accueil/employeur/embaucher-gerer-salaries/embaucher/declaration-prealable-embauche.html) | Vérifié le 11/09/2026 | DPAE avant prise de fonction, au plus tôt 8 jours avant. |
| [Légifrance — Code du travail, article L. 7121-2](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032859810) et [article L. 7121-3](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044056630) | L. 7121-2 depuis le 09/07/2016 ; L. 7121-3 depuis le 01/01/2023 | Catégories d’artistes et présomption de contrat de travail. |