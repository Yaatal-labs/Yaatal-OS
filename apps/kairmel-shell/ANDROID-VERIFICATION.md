# Vérification Android

Le shell Android existe déjà dans `main`. Cette vérification réutilise le projet
Tauri, ses tests Rust, sa page hors ligne et le contrat
[Google natif](NATIVE-GOOGLE-AUTH.md). Elle ne crée pas de second shell.
Les instructions de préparation du SDK restent dans le [README](README.md#android).

## Configuration existante

La version de référence est `0.1.1`, paquet `com.kairmel.app`, Android minimum 24.
La lecture du JSON et du manifeste XML confirme les permissions `INTERNET`,
`CAMERA`, `RECORD_AUDIO` et `MODIFY_AUDIO_SETTINGS`. La caméra et le microphone
sont déclarés facultatifs : leur absence ne doit pas empêcher l'installation.

Le filtre de `.MainActivity`, en mode `singleTask`, accepte
`com.kairmel.app://auth/callback` avec les catégories `DEFAULT` et `BROWSABLE`.
`MainActivity.kt` applique les marges des barres système et des découpes d'écran
au contenu. Ces déclarations ne prouvent pas le fonctionnement sur un téléphone.

## Génération Gradle

`tauri.settings.gradle` est un résultat de compilation contenant les chemins
absolus du cache Cargo de la machine. La copie suivie dans `main` ne contient pas
`tauri-plugin-deep-link`. Ce décalage ne justifie pas une correction manuelle :
`tauri-build` génère ce fichier et `app/tauri.build.gradle.kts` depuis les
dépendances Android déclarées par Cargo, avant la compilation Gradle.
Le plugin `deep-link` génère aussi le filtre du manifeste depuis la configuration
Tauri. Conserver le bloc marqué `DEEP LINK PLUGIN`.

Lancer la compilation depuis `apps/kairmel-shell` avec la CLI Tauri :

```sh
pnpm tauri android build --debug --apk --target aarch64 --ci
```

Cette commande produit un APK de développement et utilise la clé de débogage
Android. Elle ne demande pas la clé de signature du paquet de test distribué.
Ne pas lancer Gradle directement depuis une copie fraîche : les fichiers
générés, dont `app/tauri.build.gradle.kts` ignoré par Git, doivent d'abord exister.
Ne pas relancer `android init` pour réparer les inclusions de plugins : le projet
Android contient déjà les permissions et les marges nécessaires au shell.

## Preuve de compilation

La vérification du 13 octobre 2026 part d'une archive Git de `a002ff1`, sans
sorties Cargo ou Gradle ni fichier de signature copié. Les dépendances Node
déjà installées sont réutilisées. L'archive est placée hors du workspace Engine
et hors de OneDrive : une copie imbriquée dans Engine fait découvrir à Cargo le
workspace parent et échoue avant la compilation.

Outils utilisés : Rust stable `1.94.0`, CLI Tauri `2.12.0`, JDK 17, SDK Android 37, NDK
`27.2.12479018`, cible Rust `aarch64-linux-android`. Le verrou Cargo contient
`tauri-build 2.7.0`, `tauri-plugin-deep-link 2.6.0` et `tauri-plugin-opener 2.7.0`.

La première tentative a échoué lors de l'écriture du cache généré du plugin
`deep-link` dans le registre Cargo, hors des chemins autorisés par le sandbox.
La même commande a réussi avec l'accès nécessaire aux caches Cargo et Gradle.
La génération Tauri a inclus `tauri-android`, `tauri-plugin-deep-link` et
`tauri-plugin-opener` dans les deux fichiers Gradle, sans correction manuelle.

| Source compilée | Résultat | SHA-256 de l'APK de débogage |
| --- | --- | --- |
| Archive propre `a002ff1` | CLI terminée avec succès, APK arm64 produit | `ca1d8b40c57333e8c5a453b04e91a47b8744f3264683d37805bcb91b8fa0e4ea` |
| Même archive avec les quatre fichiers Rust alignés de cette branche | CLI terminée avec succès, même cible réutilisée | `94afea922a29076a3f4a53d8f1314aacc9e0e589f21c60aa9a7c71db205df3d6` |

Les fichiers copiés sont `build.rs`, `src/config.rs`, `src/kairmel.rs` et
`src/menu.rs` ; leurs empreintes correspondent aux fichiers de cette branche.
L'APK aligné contient 245 940 095 octets et reste dans le dossier temporaire de
vérification. Les avertissements existants de Gradle/AGP et Kotlin concernent des
API dépréciées ; ils n'ont pas empêché la compilation. Les six tests hors ligne
existants ont réussi avec `vitest run --configLoader runner`.

Aucun paquet n'est installé, signé pour distribution ou publié par cette
vérification. Aucun fichier Gradle généré, manifeste Android ou fichier de
signature n'est ajouté au diff de cette branche.

## Recette sur téléphone

La recette reste à effectuer sur une version installée. Noter le téléphone,
la version Android, la version du WebView, le paquet et la version de l'app,
les origines utilisées et le résultat de chaque cas. Garder les codes de
connexion et les jetons hors des captures et des journaux partagés.

| Cas | Résultat attendu | État de cette vérification |
| --- | --- | --- |
| Démarrage et navigation | Kairmel s'ouvre ; le passage vers Marché reste dans l'app. | Non testé sur téléphone. |
| Mode avion au démarrage | La page hors ligne apparaît ; « Réessayer » revient à Kairmel après le retour du réseau. | Tests de la logique hors ligne existants ; recette appareil à faire. |
| Google | Le navigateur système s'ouvre ; le retour validé donne une session dans le WebView. | Contrat et tests Rust existants ; connexion réelle à faire. |
| Retour Google annulé ou périmé | Pas de session créée ; une nouvelle tentative reste possible. | Recette appareil à faire. |
| Vidéo en direct | Après consentement, la caméra et le microphone publient un flux reçu par un second appareil. | Permissions déclarées ; capture et transmission non testées. |
| Refus caméra ou micro | Pas de capture ; l'app reste utilisable et permet une nouvelle tentative après autorisation. | Recette appareil à faire. |
| Barres système et découpe | Navigation, boutons et contenu restent accessibles en portrait et paysage. | Marges présentes dans Kotlin ; observation appareil à faire. |
| Reprise de l'app | Après le passage en arrière-plan, la navigation et la connexion restent utilisables. | Recette appareil à faire. |

Une compilation réussie ne valide ni Google en production, ni WebRTC, ni les
permissions à l'exécution, ni la signature et la mise à jour du paquet distribué.
Le contrat Google dépend des routes serveur décrites dans
[NATIVE-GOOGLE-AUTH.md](NATIVE-GOOGLE-AUTH.md). Une preuve de direct nécessite
une émission et une réception réelles avec un compte vendeur autorisé.
