# UXR-04B : livraison de la session Studio native

[English](./UXR-04B-NATIVE-STUDIO-SESSION.md)

Statut : code et security review validés le 9 septembre 2026. La live acceptance attend le deploy du bootstrap Engine.

## Ce qui fonctionne

Le login Yaatal OS garde le JWT Engine dans le process Rust Tauri. Une commande native authentifiée demande à Engine un grant de 90 secondes, single-use et scoped sur `studio`. Rust valide le nonce de 43 caractères, la surface et le TTL avant de renvoyer le grant au shell.

Le shell livre ce grant uniquement à la frame Studio courante et à son origin exact. Il ne place pas le grant dans une URL, un log ou un stockage persistant. Studio envoie le nonce à son propre backend same-origin. Le backend le redeem server-to-server contre l'endpoint Engine fixe, valide la réponse d'identité sanitized et crée le cookie Studio opaque, HttpOnly et SameSite existant.

Le logout verrouille et désarme Studio avant le cleanup réseau, efface le JWT gardé par Rust et maintient Studio verrouillé si le cleanup échoue. La restauration de session, le reload de l'iframe, le remount, les réponses grant tardives et les réponses status tardives sont corrélés aux générations de session OS, de lifecycle de frame et de requête. Le travail stale est ignoré.

Le déverrouillage manuel par `STUDIO_CONTROL_TOKEN` reste disponible quand le bootstrap Engine n'est pas deploy.

## Dépendance Engine

Le contract requis existe déjà sur la branch Engine `yaatal/auth-whatsapp-bootstrap` :

- commits source : `b8d84368`, puis `160524e9` ;
- `POST /api/auth/bootstrap/start` authentifié ;
- `POST /api/auth/bootstrap` non authentifié et single-use ;
- digest du grant stocké à la place du nonce brut ;
- surface, expiration et replay vérifiés atomiquement.

Le test unit Engine ciblé est passé. Les request tests existent, mais leur linking n'a pas pu être relancé sur cette machine Windows par manque de disque et de paging-file. La branch n'est pas encore deploy sur l'endpoint Engine utilisé par Yaatal OS.

## Vérification fraîche

- Suite Python Studio : 97 passés, 1 skipped.
- Tests du shell OS : 16 passés.
- Tests du protocole OS : 3 passés.
- Tests Rust Tauri : 4 passés.
- `pnpm check` : passé.
- `pnpm build` : passé.
- Tauri `cargo fmt --check`, `cargo check` et `cargo test` : passés.
- Spec review : conforme.
- Code-quality et security review finales : approuvées.
- `git diff --check` : passé.

Les regressions exécutables couvrent le logout lorsque Studio est unmounted, Studio ready avant la restauration de session, le logout face à un grant en vol, le remount de l'iframe pendant un status pending, l'autorisation du WebSocket voice par un cookie bootstrap et un refresh de session tardif après logout.

## Ce qui n'est pas construit

- La révocation du JWT à l'échelle Engine ne fait pas partie du logout.
- Les mutations BOBO authentifiées n'ont pas encore de broker natif. Les paths actuels du catalogue SHOP, du détail produit et de la Commerce Sheet POC sont publics et n'en ont pas besoin.
- Le vrai bootstrap Engine-to-Studio natif n'a pas encore tourné contre un Engine deploy contenant `160524e9`.
- Le run final Telegram-to-Commerce-Sheet-to-receipt reste ouvert.

Ces gaps maintiennent UXR-06 ouvert. Ce checkpoint ne prétend pas finir l'auth de production.
