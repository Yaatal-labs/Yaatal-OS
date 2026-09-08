# UXR-06A : social checkout dans SELL

[English](./UXR-06A-EMBEDDED-SOCIAL-CHECKOUT.md)

Statut : validé le 8 septembre 2026.

## Ce qui a changé

La surface Studio SELL intégrée crée maintenant le `CommerceIntent` du POC, derrière son feature gate, pour le produit canonique sélectionné. Le dialog expose uniquement les liens renvoyés par le serveur Studio :

- lien de checkout à copier ;
- lien avec attribution livestream ;
- lien de partage WhatsApp ;
- lien de partage Telegram ;
- lien direct vers la Commerce Sheet.

La requête utilise la session opérateur HttpOnly existante. Aucun bearer token n'entre dans l'état de l'iframe, le `localStorage`, les logs ou les liens de partage. Une nouvelle requête produit annule et invalide la précédente. Les refresh Insights appliquent la même règle last-request-wins. Une réponse tardive ne peut donc pas masquer une conversion plus récente.

Le dialog Commerce Sheet est limité à la hauteur du viewport et reste scrollable sur un écran court. La grille media contient aussi le septième asset fallback labellisé, `cosmetics.webp`.

## Checkpoint traçable

- Commit de la feature : `5f01acb`.
- Hardening des races, du viewport et des tests comportementaux : `26c97b9`.
- Spec review : conforme.
- Code-quality review : approuvée, sans finding restant.
- Tests Commerce ciblés : 14 passés.
- Tests du workspace OS : 11 passés.
- `pnpm check` : passé.
- `pnpm build` : passé.
- Tests Rust Tauri : 2 passés.
- `git diff --check` : passé.

Le harness Node exécutable force les réponses checkout et Insights à arriver dans le désordre. Il prouve que le produit courant et le résultat de conversion le plus récent restent affichés.

## Ce qui n'est pas construit

- Un login natif unique ne bootstrap pas encore les sessions authentifiées Studio et BOBO. C'est UXR-04B.
- Le run d'acceptance natif final à 1280×800 et 900×600 reste à faire.
- L'Engine de production ne possède pas encore un `CommerceIntent` persisté, le stock transactionnel, le settlement PI-SPI ou l'autorité du receipt.
- Le posting privilégié automatique vers Telegram, WhatsApp ou les plateformes livestream ne fait pas partie de cette card. Le serveur renvoie des liens portables avec attribution.
- L'offline outbox reste à faire.

Ces gaps maintiennent UXR-06 ouvert. UXR-06A ferme uniquement le launcher SELL intégré et son comportement de concurrence, de sécurité et de layout.
