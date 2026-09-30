# Studio → Yaatal OS Closure Runbook

Status: implementation branch `yaatal/studio-os-closure`
Scope: single-tenant POC; multitenancy and generalized continuity are deferred.

## 1. The runnable seam

```text
seller holds microphone
  → Studio /api/studio/voice (HttpOnly operator session)
  → Engine /api/voice/session (server-owned JWT)
  → yaatal-voice Qwen2.5-Omni backend (private OVH/Tailscale path)
  → final subtitle returns to Studio
  → Harness POST /edge-turn with live Engine product context
  → explicit Allow or Deny
  → absolute Engine PUT and/or OBS governed_action overlay
  → durable studio-turn.v1 digest receipt
```

Studio does not choose a voice model, send credentials from the browser, or
call Engine from model output. Engine owns request/session identity; Harness
owns behavioral policy; Studio owns the seller cockpit and visual execution.

LiveKit remains the room/mobile transport. This lean browser POC uses Engine's
authenticated voice WebSocket directly; it does not add a second LiveKit
agent or duplicate speech-core routing.

## 2. What must exist before deployment

### Engine

The deployed Engine revision must contain the work currently carried by:

- `yaatal/speech-core-livekit-seam-v3`
- `yaatal/qwen25-omni-voice-backend`

The second branch is stacked on the first. Merge or deploy the stack in that
order, then verify `GET /health` and the authenticated
`/api/voice/session?token=...` WebSocket.

Engine configuration:

```dotenv
JWT_SECRET=<production secret>
VOICE_SERVICE_URL=ws://<private-voice-host>:8082/session
```

If LiveKit clients are part of the same acceptance environment, also set
`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `LIVEKIT_URL`. They are not
required for Studio's direct Engine WebSocket path.

### Qwen voice service on the private GPU network

Run the Engine `yaatal-voice` binary from the Qwen branch with a private bind:

```dotenv
QWEN25_OMNI_BASE_URL=http://127.0.0.1:8091/v1/chat/completions
QWEN25_OMNI_MODEL=<qualified Yelly-O Small or Medium artifact>
QWEN25_OMNI_API_KEY=<host secret>
VOICE_SERVICE_BIND=<private-or-tailscale-ip>:8082
```

The vLLM-Omni endpoint, model name, and credential belong to the service
process. None is accepted from Studio or a WebSocket client. Each Studio turn
is a complete 16 kHz mono PCM16 WAV.

### Harness

Run `yaatal-edge-turn` as an internal HTTP service:

```dotenv
EDGE_TURN_PORT=8090
ENGINE_API_URL=http://<engine-private-host>:5150
YAATAL_TOKEN=<scoped Engine token>
EDGE_TURN_AUDIT_PATH=/data/edge-turn-audit.jsonl
MINIMIND_URL=http://127.0.0.1:<runner-port>/v1/propose
```

`MINIMIND_URL` is loopback-only in the current Harness. Co-locate its runner
with Harness. Harness currently accepts `mock` or `minimind`; Qwen3.8-27B is
not yet an `edge-turn.v1` backend and must not be implied by Studio config.

## 3. Studio configuration

Copy `.env.example` into the deployment secret/config surface. Required for a
real run:

```dotenv
ENGINE_API_URL=https://<engine-service>
HARNESS_URL=http://<harness-private-host>:8090

# Prefer a scoped service JWT. Login is the fallback, never both if avoidable.
STUDIO_JWT=<scoped Engine JWT>
# ENGINE_API_EMAIL=
# ENGINE_API_PASSWORD=

STUDIO_CONTROL_TOKEN=<high-entropy operator token>
STUDIO_COOKIE_SECURE=1
STUDIO_TURN_LEDGER=/app/data/studio-turns.jsonl
STUDIO_VOICE_TRANSCRIPT_CONFIDENCE=0.85
YAATAL_EDGE_MODEL_BACKEND=minimind
YAATAL_HARNESS_FALLBACK=0
STUDIO_DEMO_MODE=0
```

Optional `ENGINE_VOICE_WS_URL` overrides the derived Engine voice URL when it
is hosted separately. It is server-only. Mount `/app/data` persistently; a
container restart must not erase idempotency receipts.

Build with the source revision visible in `/health`:

```bash
docker build --build-arg STUDIO_GIT_SHA="$(git rev-parse HEAD)" -t yaatal-studio:<sha> .
```

Terminate TLS in front of Studio. Do not set `STUDIO_COOKIE_SECURE=0` outside
local HTTP development.

## 4. Operator and OBS setup

1. Open Studio over HTTPS.
2. Exchange `STUDIO_CONTROL_TOKEN` in the operator unlock form. The browser
   receives a short-lived HttpOnly, SameSite=Strict cookie; clear the token
   field after exchange.
3. Add these same-origin URLs as OBS Browser Sources:

   - `https://<studio-host>/overlays/product`
   - `https://<studio-host>/overlays/price`
   - `https://<studio-host>/overlays/sold-out`

4. Keep OBS capture/output control local. The cloud Studio sends only
   sanitized `governed_action` receipts to these Browser Sources.
5. Select a disposable Engine test product and record its original price and
   stock before the acceptance turn.

## 5. Acceptance sequence

Run in order. Stop on the first failure.

### A. Non-mutating readiness

From the unlocked cockpit, run OS readiness. It checks:

- operator auth and writable persistent ledger;
- Engine health, service identity, and real product context;
- Harness health;
- private voice URL construction without opening a billable model session;
- digest-only audit structure;
- governed overlay files and an active public update subscriber.

It does not call Ollama, allocate a GPU model, or mutate a product.

### B. Real no-write voice turn

Hold the microphone and say a neutral Wolof/French/English sentence that
should produce `noop` or `deny`. Confirm:

- `session_ready`, final subtitle, audio, and `turn_end` arrive;
- no Engine product changes;
- the ledger records a digest and decision, never raw speech.

### C. Governed visual action

Request a switch to the disposable product. Confirm Harness returns `Allow`,
the `product_info` overlay changes, and Engine state is unchanged.

### D. Governed Engine mutation

State one absolute test price. Confirm one governed receipt, the expected final
Engine value, and a matching price overlay update. A transport retry may repeat
the same absolute `PUT /api/products/{id}`; it cannot compound the price like
an increment would. Restore the original price through another governed
absolute turn or the Engine operator surface.

### E. Drop/retry/idempotency

During a disposable price turn, interrupt the browser network after sending
audio. Studio retries the retained in-memory WAV after 1, 2, then 4 seconds
using the same UUID. Confirm one governed receipt and one semantic state
change. Until Engine persists `X-Yaatal-Turn-Id` as an idempotency key, its
access log may show a retried absolute PUT after an ambiguous transport
failure. Restart Studio and replay the same UUID through the test harness; the
persistent ledger must return `deduplicated: true` without re-execution.

### F. Privacy and rollback

- Inspect Studio and Engine logs: no JWT, raw audio, transcript, prompt, model
  response, or internal token-bearing URL.
- Inspect public `/ws`: no subtitle/audio frames.
- Inspect `/api/studio/audit`: SHA-256 digest + decision/proposal/receipt only.
- Roll back the Studio image. Preserve `/app/data`; no schema migration is
  required. Restore the test product's original state.

## 6. Failure interpretation

| Symptom | Meaning | First action |
|---|---|---|
| `4401` on `/api/studio/voice` | missing/expired operator cookie | unlock Studio again |
| `engine_voice_auth_unavailable` | Studio lacks usable Engine identity | fix scoped JWT or service login |
| `engine_voice_unavailable` | Engine route or private voice sidecar is down | check Engine, `VOICE_SERVICE_URL`, Tailscale, then Qwen service |
| `harness_unavailable` | action proposal could not be governed | keep fail-closed; repair Harness/MiniMind |
| `final_subtitle_missing` | voice turn ended without actionable text | retry same audio/UUID; inspect voice backend digest logs |
| `engine_*_update_failed` | Allow was received but the absolute Engine PUT has no confirmed response | retry the same UUID; verify final Engine state because transport may have retried the same absolute value |
| OBS does not change | public receipt/Browser Source seam failed | check `/ws` and Browser Source URL; do not bypass Harness |

## 7. Explicitly out of scope

- multitenancy, tenant-specific control tokens, or tenant storage;
- a generalized Codex-like continuity platform;
- recording seller audio/transcripts for training;
- direct model-to-Engine tools;
- Qwen3.8-27B as a Harness backend (separate contract/policy task);
- automatic session creation/end in Engine (no current mutation contract).

---

# Procédure de fermeture Studio → Yaatal OS

Statut : branche `yaatal/studio-os-closure`
Périmètre : POC mono-tenant ; multitenancy et plateforme de continuité
générique sont reportés.

## 1. Chaîne exécutable

```text
micro vendeur
  → Studio /api/studio/voice (session opérateur HttpOnly)
  → Engine /api/voice/session (JWT détenu par le serveur)
  → backend privé Qwen2.5-Omni / yaatal-voice
  → sous-titre final
  → Harness POST /edge-turn + contexte produit Engine
  → Allow ou Deny explicite
  → PUT Engine absolu et/ou overlay OBS governed_action
  → reçu durable studio-turn.v1, sans parole brute
```

Engine garde l'identité et la session ; Harness garde la politique
comportementale ; Studio garde le cockpit vendeur et l'exécution visuelle.
LiveKit reste le transport room/mobile. Ce POC lean utilise directement le
WebSocket voix authentifié de l'Engine et ne duplique pas speech-core.

## 2. Prérequis

Déployer les branches Engine empilées dans cet ordre :

1. `yaatal/speech-core-livekit-seam-v3`
2. `yaatal/qwen25-omni-voice-backend`

Configurer `VOICE_SERVICE_URL` côté Engine. Sur le réseau GPU privé,
configurer `QWEN25_OMNI_BASE_URL`, `QWEN25_OMNI_MODEL`,
`QWEN25_OMNI_API_KEY` et `VOICE_SERVICE_BIND`. Ces valeurs ne doivent jamais
venir du navigateur.

Déployer Harness avec un audit persistant et le contexte Engine. Son backend
MiniMind doit être colocalisé car `MINIMIND_URL` est actuellement limité au
loopback. Les seuls backends `edge-turn.v1` disponibles sont `mock` et
`minimind` ; Qwen3.8-27B n'est pas encore câblé à ce contrat.

## 3. Configuration Studio

Les valeurs indispensables sont `ENGINE_API_URL`, `HARNESS_URL`, une identité
Engine de service (`STUDIO_JWT` de préférence), `STUDIO_CONTROL_TOKEN`, un
volume persistant pour `STUDIO_TURN_LEDGER`, et
`YAATAL_EDGE_MODEL_BACKEND=minimind`. Garder
`YAATAL_HARNESS_FALLBACK=0`, `STUDIO_DEMO_MODE=0` et le cookie sécurisé en
production.

L'hypothèse de confiance `STUDIO_VOICE_TRANSCRIPT_CONFIDENCE=0.85` est
explicite : le contrat voix actuel ne fournit pas encore une confiance ASR
calibrée. Elle devra disparaître quand le backend la retournera.

## 4. Mise en service et vérification

1. Ouvrir Studio en HTTPS et déverrouiller le cockpit avec le token opérateur.
2. Ajouter les trois Browser Sources OBS : `/overlays/product`,
   `/overlays/price`, `/overlays/sold-out`.
3. Lancer la readiness non destructive : Engine, identité, produits réels,
   Harness, config voix, audit privé, overlays et WebSocket doivent passer.
4. Faire un tour vocal `noop/deny` : aucun produit ne change.
5. Faire un changement visuel de produit autorisé : seul l'overlay change.
6. Sur un produit jetable, faire un prix absolu autorisé : un reçu gouverné et
   la bonne valeur finale Engine. Un retry transport peut répéter le même PUT
   absolu sans cumuler la modification.
7. Couper le réseau après l'envoi audio : les reprises 1/2/4 s gardent le même
   UUID et ne doivent jamais doubler l'action.
8. Redémarrer Studio, rejouer le même UUID et vérifier `deduplicated: true`.
9. Vérifier les logs, `/ws` public et l'audit : aucune parole, transcription,
   clé, URL tokenisée ou réponse modèle brute.
10. Restaurer le produit et l'image Studio. Conserver le volume du ledger.

## 5. Frontières maintenues

Cette livraison ne fait ni multitenancy, ni collecte audio pour entraînement,
ni appel direct modèle→Engine, ni backend Qwen3.8 dans Harness, ni fausse
création/fin de session Engine. Une panne Harness reste un refus d'agir.
