# Yaatal-Studio

[🇬🇧 English](README.md) · 🇫🇷 Français

Outillage de commerce social taillé pour le marché africain — production de
contenu voix + vidéo et vente en direct sur OBS pour le commerce
wolof/français.

## Qu'est-ce que c'est ?

Yaatal-Studio est la couche production de contenu et livestream de la stack
Yaatal. **Ce qui existe dans ce dépôt aujourd'hui, c'est la couche `live/`**
(vente en livestream via OBS) plus des specs de conception pour le reste. Les
couches voix et vidéo sont des forks vendorisés prévus qui **n'ont pas encore
été importés**.

## Statut : construit vs prévu

| Couche | Statut |
|---|---|
| `live/obs_controller` | ✅ Construit — contrôle OBS via obsws-python (vérifié avec obsws-python 1.8.0) |
| `live/mcp_server` | ✅ Construit — 15 outils OBS exposés via MCP (FastMCP, stdio) |
| `live/agent_loop` | ✅ Construit (prototype) — détection d'intention wolof/français à base de règles ; l'entrée STT est mock uniquement (`inject_text`) ; l'entrée commentaires dispose d'une source Engine réelle et générique par plateforme (`WhatsAppSource`, interroge `/api/social/events` — `platform="whatsapp"` par défaut, `platform="telegram"` fonctionnera dès que l'Engine ingèrera Telegram), en plus du chemin mock `add_comment()` |
| `live/nfc_controller` | ✅ Construit (prototype) — registre de cartes + gestionnaire de tap ; la boucle de lecture matérielle est mock uniquement |
| `live/nfc_delivery` | ✅ Construit — confirmation par code câblée sur l'endpoint Engine réel ; le statut par code reste un stub |
| `live/qr_overlay` | ✅ Construit — génération de QR + overlay OBS ; les routes de deep-link qu'il encode ne sont pas encore servies par l'Engine |
| `live/overlays`, `live/scenes`, `live/multistream` | ✅ Construit — overlays HTML, blueprint de scène (pas une collection OBS importable), configs RTMP |
| `live/data_faucet` | ✅ Construit — enregistreur de session local et soumis au consentement (`SessionRecorder`) ; ajoute les commentaires en direct dans un JSONL par session pour le dataset privé Kallaama, hors bande (jamais uploadé par ce dépôt) ; une interface `record_utterance()` existe pour les transcriptions vocales mais rien ne produit de transcription pour l'instant (le STT est encore mock uniquement) |
| `voice/` (fork Voicebox) | 🔲 Prévu — pas encore vendorisé |
| `video/` (forks MoneyPrinterTurbo + MotionForge) | 🔲 Prévu — pas encore vendorisé |
| `yaatal/` (modèles wolof, prompts, détection, commerce, sdk) | 🔲 Specs uniquement — les READMEs décrivent le plan ; aucun modèle ni code pour l'instant |
| `integrations/` (MCPs meta-ads / dsers / shopify) | 🔲 Specs uniquement |

## Architecture de licence

Tout ce qui **se trouve actuellement dans ce dépôt** est un travail original
de Yaatal Labs. Les modules de la couche `live/` marqués MIT ci-dessous sont
destinés à une publication sous MIT ; `agent_loop`, `nfc_controller`,
`nfc_delivery`, `qr_overlay`, `data_faucet`, et tout ce qui se trouve sous
`yaatal/` sont propriétaires. (Les fichiers de licence ne sont pas encore
commités — ils arriveront avec la première release taguée.)

| Couche | Licence | Source |
|---|---|---|
| `live/obs_controller/` | MIT (prévu) | Original — encapsule [obsws-python](https://github.com/aatikturk/obsws-python) (MIT) |
| `live/mcp_server/` | MIT (prévu) | Original — serveur FastMCP pour le contrôle OBS |
| `live/agent_loop/` | Propriétaire | Original — détection d'intention STT, surveillance des commentaires, veille d'engagement |
| `live/nfc_controller/` | Propriétaire | Original — lecteur de carte NFC → actions OBS (contrôleur physique du vendeur) |
| `live/nfc_delivery/` | Propriétaire | Original — pont de confirmation de livraison NFC vers Yaatal Engine |
| `live/qr_overlay/` | Propriétaire | Original — QR codes sur le stream OBS → deep links vers la marketplace Engine |
| `live/overlays/` | MIT (prévu) | Original — templates HTML Browser Source |
| `live/scenes/` | MIT (prévu) | Original — blueprint de scène OBS en JSON |
| `live/multistream/` | MIT (prévu) | Original — templates de config de routage RTMP |
| `live/data_faucet/` | Propriétaire | Original — enregistreur de session soumis au consentement, alimentant le dataset privé Kallaama |

Upstreams vendorisés prévus (MIT — chacun conservera sa LICENSE d'origine à
l'import) :

| Couche prévue | Upstream |
|---|---|
| `voice/voicebox/` | [jamiepine/voicebox](https://github.com/jamiepine/voicebox) (MIT) |
| `video/MoneyPrinterTurbo/` | [harry0703/MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) (MIT) |
| `video/composition/motionforge/` | [codedbytahir/motionforge](https://github.com/codedbytahir/motionforge) (MIT) |

OBS Studio (GPLv2) est utilisé tel quel via son API WebSocket — une frontière
de licence propre qui ne déclenche pas d'obligations GPL sur le code de
Yaatal. Aucune dépendance AGPL. (Remotion a été rejeté pour sa licence payante
source-available ; OpenMontage pour l'AGPL.)

## Structure des répertoires (actuelle)

```
Yaatal-Studio/
├── live/                             # OBS livestream selling layer (BUILT)
│   ├── obs_controller/               # Python wrapper around obsws-python
│   ├── mcp_server/                   # FastMCP server — OBS control as MCP tools
│   ├── agent_loop/                   # STT intent detection + comment monitor + engagement
│   ├── nfc_controller/               # Physical NFC cards → seller controls the stream
│   ├── nfc_delivery/                 # NFC delivery confirmation → Engine closes order
│   ├── nfc_viewer/                   # DEPRECATED — replaced by nfc_delivery
│   ├── qr_overlay/                   # QR codes on stream → deep links → Engine marketplace
│   ├── overlays/                     # HTML Browser Source templates (price, CTA, etc.)
│   ├── scenes/                       # OBS scene blueprint JSON (manual setup — see its README)
│   ├── multistream/                  # RTMP routing configs (Facebook, YouTube, TikTok)
│   └── data_faucet/                  # Consent-gated session recorder → local JSONL for Kallaama
│
├── yaatal/                           # Proprietary layer — SPECS ONLY today
│   ├── wolof-models/                 # (planned) Wolof TTS/STT models + training scripts
│   ├── prompts/                      # (planned) Wolof/French prompt templates
│   ├── detection/                    # (planned) African market signal detection
│   ├── commerce/                     # (spec) points to Yaatal-Engine (separate repo)
│   └── sdk/                          # (spec) points to Yaatal-SDK (separate repo)
│
└── integrations/                     # SPECS ONLY — meta-ads / dsers / shopify MCPs
```

Prévu (pas encore dans le dépôt) : `voice/voicebox/`,
`video/MoneyPrinterTurbo/`, `video/composition/motionforge/`.

## Inventaire des modèles wolof

Déplacé vers [`docs/WOLOF-MODEL-INVENTORY.md`](docs/WOLOF-MODEL-INVENTORY.md) —
les modèles HF tiers vérifiés côté licence (TTS + STT/ASR), la voie de repli.
Le plan de référence reste les modèles maison ci-dessous.


## Modèles IA : cible vs état actuel

La détection d'intention et le câblage voix de Studio **visent les modèles
maison de Yaatal**, entraînés dans la branche `ml/edge-voice-lane` du dépôt
Engine (lane R&D, non fusionnée dans `main`) — les modèles wolof tiers de HF
de [`docs/WOLOF-MODEL-INVENTORY.md`](docs/WOLOF-MODEL-INVENTORY.md) sont le **repli**, pas le plan.

| Rôle | Modèle cible | Statut dans Studio aujourd'hui |
|---|---|---|
| Oreilles (ASR) | `yaatal-wa-ears-granite` | 🔲 Non câblé — le STT est mock uniquement (`inject_text`) |
| Cerveau (intention / routage d'outils) | `yaatal-tool-router-granite-350m-v2` (slot-F1 0.969) | 🔲 Non câblé — `live/agent_loop` utilise un lexique wolof/français à base de règles |
| Bouche (TTS) | `yaatal-wolof-moss-tts-nano` | 🔲 Non câblé — aucune intégration TTS pour l'instant |

Le focus R&D actuel est **MiniMind-O** : un modèle omni Apache-2.0 unique
destiné à entendre/parler/appeler des outils en wolof, consolidant à terme
les trois organes ci-dessus. Tant que rien de tout cela n'a atterri, Studio
garde son lexique à base de règles et son STT mock (voir « construit vs
prévu » ci-dessus) ; les modèles HF de `docs/WOLOF-MODEL-INVENTORY.md` restent la voie de repli
si des modèles tiers venaient à être câblés avant les modèles maison.

## Démarrage (couche live/)

```bash
git clone https://github.com/Yaatal-labs/Yaatal-Studio.git
cd Yaatal-Studio

# OBS control + MCP server
pip install -r live/obs_controller/requirements.txt   # obsws-python, mcp

# Run the MCP server (OBS must be running with WebSocket enabled, port 4455)
python -m live.mcp_server.server

# Serve the overlays for OBS browser sources (separate terminal)
cd live/overlays && python -m http.server 8000

# Optional: standalone NFC delivery confirmation server
pip install -r live/nfc_delivery/requirements.txt
uvicorn --factory live.nfc_delivery.server:app_factory --port 8080
```

L'entrée STT de l'agent loop et le lecteur NFC tournent en mode mock par
défaut (`STTListener.inject_text(...)`, `NFCReader.inject_tap(...)`) — le
STT micro réel et le lecteur ACR122U sont du travail d'intégration, suivi
dans la roadmap. L'entrée commentaires dispose d'une source de plateforme
réelle : `WhatsAppSource` (`live/agent_loop/whatsapp_source.py`) interroge
`GET /api/social/events` de l'Engine et alimente
`CommentMonitor.add_comment(...)` — la même interface que celle utilisée par
les appels mock/manuels `add_comment()`. Cela nécessite l'Engine déployé
avec cet endpoint actif et `YAATAL_ENGINE_URL` / `YAATAL_TOKEN` configurés
(c'est un no-op sans URL Engine) ; faire transiter du vrai trafic WhatsApp
nécessite aussi des identifiants webhook WhatsApp configurés côté Engine.
Les sources de commentaires Facebook Live / TikTok Live / YouTube Live chat
sont encore prévues.

Le trafic de commentaires de chaque session est aussi exactement le langage
de commerce wolof/français sur lequel s'entraîne la lane ML privée (dataset
Kallaama, `ml/edge-voice-lane` dans Yaatal-Engine) — `live/data_faucet`
(`SessionRecorder`) le capture au lieu de laisser l'agent loop le jeter
après usage. C'est opt-in et local uniquement : désactivé sauf si le vendeur
a défini `YAATAL_DATA_CONSENT=1` sur ce poste **et** que `YAATAL_DATA_DIR`
(par défaut `./data/kallaama`) est accessible en écriture ; si l'un des deux
manque, chaque méthode est un no-op. Les commentaires sont pseudonymisés
(sha256 sur 8 caractères hex du handle/numéro, la valeur brute n'est jamais
écrite) et ajoutés à un fichier JSONL par session — rien n'est relu et rien
ne quitte la machine ; la lane ML privée collecte les fichiers hors bande.
`record_utterance()` est l'interface équivalente pour les transcriptions
vocales, câblée pour plus tard — le STT de l'agent loop est encore mock
uniquement, donc rien ne l'appelle pour l'instant.

## Roadmap

1. **Vendoriser les forks** — importer Voicebox, MoneyPrinterTurbo, MotionForge avec leurs licences MIT
2. **Câbler le TTS wolof** — intégrer `bilalfaye/speecht5_tts-wolof` (MIT) dans Voicebox comme moteur personnalisé
3. **Câbler le STT wolof** — charger `cifope/whisper-small-wolof` (Apache 2.0) dans Faster-Whisper
4. **TTS français** — configurer Kokoro (Apache 2.0, déjà dans Voicebox) pour la narration en français
5. **Pipeline vidéo** — adapter MoneyPrinterTurbo pour des scripts wolof/français
6. **Composition** — remplacer Remotion (source-available, payant au-delà de 3 employés) par MotionForge (MIT)
7. **Vente en direct** — câbler le serveur MCP OBS à la gateway, tester avec de vrais vendeurs à Dakar
8. **Sous-titres en direct** — STT → `send_caption` → stream OBS (français d'abord, wolof à mesure que le STT s'améliore)
9. **Durcissement de l'agent loop** — vrai STT micro, API de plateforme restantes (Facebook Live, TikTok Live, YouTube Live chat — WhatsApp est fait via `WhatsAppSource`), revue par un locuteur natif du lexique de déclenchement wolof ; une fois le vrai STT en place, câbler ses transcriptions dans `SessionRecorder.record_utterance()` (`live/data_faucet` — l'interface existe déjà, inutilisée jusque-là)
10. **Matériel du contrôleur NFC** — boucle de lecture nfcpy/ACR122U (actuellement mock)
11. **Couche de détection** — détection de signaux du marché africain (TikTok Sénégal, Instagram diaspora, Google Trends)
12. **Intégration Engine** — voir « Manques côté Engine » ci-dessous ; catalogue produit → scènes, rupture de stock → inventaire, clips → pipeline vidéo, registre NFC → catalogue Engine

## Flux hybride (résumé)

**Le marchand propose / le modèle exécute / l'Engine dispose.** Studio produit
le livestream et les déclencheurs du monde physique — des liens profonds QR
portant un `live_session_id` pour attribuer chaque vente au direct qui l'a
générée, et des stickers NFC sur les colis portant des codes de livraison à
usage unique : un tap du client confirme la livraison, libère le séquestre et
clôt la commande côté Engine. Schéma complet, table des liens profonds,
mécanique NFC et registre des écarts Engine :
[`docs/COMMERCE-FLOW.md`](docs/COMMERCE-FLOW.md).


## Licence

- Les upstreams vendorisés prévus conserveront leurs licences MIT à l'import
- Tout le travail original de ce dépôt est © Yaatal Labs, tous droits
  réservés (le régime de licence par module selon le tableau ci-dessus
  arrivera avec la première release)
