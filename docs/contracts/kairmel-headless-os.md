# Kairmel headless OS service contract supplement

Reviewed 2026-10-13. Contract/design evidence only. No services were migrated, deployed or granted new credentials by this document. Implemented means present in the pinned source, not accepted in production.

## Reuse and source basis

The Engine review context includes the local, unpublished `docs/plans/2026-10-13-kairmel-unified-platform-proposal.md`; it has no public source URL yet. Reuse the [October 8 runbook](https://github.com/Yaatal-labs/Yaatal-Engine/blob/yaatal/board-r08-r24-2026-10-12/docs/plans/2026-10-08-UNIFICATION-RUNBOOK.md) for prior service ownership. Its October 8 deployment observations and plan-only statuses require reconciliation with subsequent merges. Its money-unit descriptions must not override current code. [UXR-05](../scopes/UXR-05-CATALOG-UNIFICATION.md), [UXR-06](../scopes/UXR-06-UNIFIED-ACCEPTANCE.md) and the [September React plan](../plans/2026-09-10-unified-ui-execution-plan.md) retain evidence for the earlier Studio/BOBO desktop work. They do not prove a hosted Kairmel Windows/Android release.

This supplement records the missing service seams. Sources inspected:

| Source | Pin | Files that decide behavior |
|---|---|---|
| Yaatal-OS | `a002ff1` | `apps/token-gateway/src/{index,ledger}.ts`; `apps/token-gateway/migrations/0008_payment_ref_global.sql`; `apps/marche-api/src/{index,listings}.ts`; `apps/marche-api/src/auth/{cookies,sessions,identity,engine}.ts`; `apps/marche/src/{manifest/types,host/bridge-host,ui/app}.ts`; `apps/cloudflare-os/gatekeepers/gatekeeper-yaatal/src/{yaatal,catalog}.ts` |
| Kairmel PR #37 | `1fa2ef1` | `worker/api/routes/{appRoutes,commerceRoutes,authRoutes}.ts`; `worker/api/controllers/{commerce,marche}/controller.ts`; `worker/api/controllers/commerce/types.ts`; `worker/database/services/AuthService.ts`; `worker/services/engine/seller.ts`; `worker/services/deployer/yaatalGateway{Accounts,Activity,Keys}.ts`; `worker/services/marche/client.ts`; `src/routes/discover/index.tsx` |
| Engine main | `3fec6c4e` | `crates/yaatal-api/src/controllers/{commerce,whatsapp_partner_auth}.rs`; `crates/yaatal-api/src/services/{sheet_payments,token_credits}.rs`; `crates/yaatal-core/src/models/credit_outbox.rs` |

Verified repository remotes: [OS route dispatcher](https://github.com/Yaatal-labs/Yaatal-OS/blob/a002ff1/apps/token-gateway/src/index.ts), [Marché dispatcher](https://github.com/Yaatal-labs/Yaatal-OS/blob/a002ff1/apps/marche-api/src/index.ts), [Kairmel commerce routes](https://github.com/Yaatal-labs/kairmel-platform/blob/1fa2ef1/worker/api/routes/commerceRoutes.ts), [Engine credit delivery](https://github.com/Yaatal-labs/Yaatal-Engine/blob/3fec6c4e/crates/yaatal-api/src/services/token_credits.rs). Paths above are repository-relative source references, not claims that every pinned source file is deployed.

## Authority and sessions

Kairmel owns its React/VibeSDK product experience and builder state. Engine owns verified commerce identity (`pid`), products, orders, payment receipts, escrow, delivery transitions and payout decisions. OS gateway retains its usage ledger and micro-XOF balance. Marché retains listing review and its sandboxed mini-app host. Cloudflare OS Gadgets, Blueprints and Gatekeepers remain a separate runtime, not components of the React builder.

Kairmel authenticates the person through its existing session. Server code loads `users.enginePid` using the authenticated Kairmel user ID. `sellerFor` exchanges that stored pid through `@yaatal/client/server` partner authentication for a short Engine session. Engine's existing session route is `POST /api/auth/whatsapp/partner/session` with the partner secret in `X-Engine-Auth-Secret`; this is a server-only capability. Never accept a renderer's pid or gateway account ID as authority.

The existing authenticated WhatsApp linking flow (`/api/auth/link/whatsapp/{start,status,verify}`) links a Google/email account to its Engine identity. `AuthService.linkWhatsAppIdentity` refuses conflicting identities with 409, and can retire only an empty WhatsApp placeholder under transactional checks. It preserves an existing gateway-account link. Do not replace this with an all-account merge or a shared token.

Gateway account creation is idempotent by Engine pid and is attempted on WhatsApp sign-in/link when auto-account configuration permits. A gateway failure does not block sign-in; later sign-in retries. The issuer credential scopes gateway accounts by `accounts.issuer`, not by browser session. Kairmel must derive the current user's pid before every private gateway read.

Marché currently authenticates independently through Engine WhatsApp partner start/status/verify. Its 30-day `__Host-marche_session` is HttpOnly, Secure, SameSite=Lax, Path=/, with no Domain; only its keyed hash is stored. A Kairmel session on `kairmel.com` does not authenticate `marche.kairmel.com`. Putting a link or route in Kairmel does not change this. Keep that separation visible until the proposed crossing below exists.

## Implemented endpoint matrix

Gateway paths are relative to its configured origin (`api.kairmel.com` in the product direction). Marché paths are relative to its catalogue Worker origin. Configuration and deployment still need their own evidence. Gateway errors are `{error:{type,code,message}}`; Marché errors are `{error:{type,message}}`, except the manifest/id conflict variants shown below. Every dispatcher can return 404 for an unknown route and 500 for an unexpected service failure. JSON bodies may produce 400/413. These are HTTP contracts, not a claim that one SDK wraps them all.

### Gateway

| Method/path | Current owner and principal | Request | Success response/status | Refusals and side effects |
|---|---|---|---|---|
| `GET /v1/models` | Gateway; public | None | 200 `{object:"list",data:[{id,object:"model",owned_by:"yaatal",tier,pricing:{currency:"XOF",input_per_million,output_per_million},max_output_tokens,residency}]}` | Public CORS `*`; no debit |
| `POST /v1/chat/completions` | Gateway; bearer account API key | OpenAI-compatible `model,messages`, optional `stream`; `x-yaatal-data-class` defaults to operational | 200 completion or SSE; public model ID in output | 401 invalid key, 400 invalid request/class, 403 disallowed data class, 404 model, 402 exhausted balance, 429 upstream limit, 502 upstream failure, 503 no upstream. Successful inference writes usage and debits; SSE metering completes asynchronously. Do not automatically replay inference on disconnect |
| `GET /v1/balance` | Gateway; bearer account API key | None | 200 `{account:{id,name},balance_xof,recent:LedgerRow[]}` | 401 invalid key. Reads only this key's account; not a merchant browser identity endpoint |
| `PUT /admin/accounts/by-pid/:pid` | Gateway; admin or configured issuer | UUID pid; empty body or `{name?}` (1..80 characters) | 200 `{id,engine_pid,created,balance_xof}` | 400 invalid pid/body; 401 credential; issuer gets 404 on another issuer's account. Creates an account if absent; no key or credit |
| `GET /admin/accounts/by-pid/:pid` | Gateway; admin or credit credential | UUID pid | 200 `{id,engine_pid,balance_xof}` | 400/401/404. Credit bridge lookup only; issuer cannot use this route |
| `GET /admin/accounts/by-pid/:pid/activity?limit=50` | Gateway; admin or account's issuer | UUID pid; integer limit clamped 1..200 | 200 `{id,engine_pid,balance_xof,recent:LedgerRow[],by_model:[{model,amount_xof,calls}]}` | 400 non-integer limit, 401 credential, 404 missing/other issuer; no-store. Model totals cover 30 days |
| `POST /admin/accounts/:id/keys` | Gateway; admin or account's issuer | `{label}` (1..200 characters) | 201 `{key_id,api_key}` | 401/404 scope, 400 input. Mints raw key once; Kairmel injects it into the deployed app's Worker secret and retains only key ID |
| `DELETE /admin/keys/:id` | Gateway; admin or key account's issuer | Key ID | 200 `{revoked:boolean}` | 401/404 scope. Revokes only this key; does not erase balance |
| `POST /admin/accounts/:id/credits` | Gateway; admin or credit credential | `{xof,note,payment_ref?}`; credit credential requires reference; whole XOF 1..1,000,000,000 | 200 `{balance_xof,applied}` | 400 validation/missing reference, 401 credential, 404 account, 409 reference already funded another account. Atomic credit+ledger write; same-account replay `applied:false` |
| `POST /admin/accounts/:id/issuer` | Gateway; admin only | `{issuer:string\|null}`; lowercase letters/digits/hyphens 1..32 | 200 `{issuer}` | 400/401/404. Assigns account issuer; must not become a browser or generic BFF operation |
| `GET /admin/usage?days=30` | Gateway; admin only | Integer days 1..366 | 200 report from `src/report.ts:usageReport` | 400/401, no-store; global reporting must remain restricted |

`LedgerRow` is `{kind,amount_xof,model,input_tokens,output_tokens,estimated:boolean,note,payment_ref,at}`; nullable values are preserved. Gateway `POST /admin/accounts` and `POST /admin/keys/revoke` also exist for admin operations; they are not required for the Kairmel integration. Issuer cannot add credits, assign issuers or read global reports. Credit credential cannot mint keys, upsert accounts or read activity. Privileged credentials never enter the browser.

The current Kairmel key client returns null on mint failure and logs best-effort revoke failures. A deploy succeeding is therefore not evidence that its per-app AI key was provisioned or its old key revoked. Keep a separately inspectable deployment result.

### Kairmel adapters already available

Success envelopes are `{success:true,data:T}`; failures are `{success:false,error:{name,message,code?,type?},message?}`. Auth middleware applies before controllers. Commerce responses are private/no-store. Keep existing `@yaatal/client` methods and its `YaatalApiError` behavior; do not build a second Engine client for routes it already supports.

| Method/path | Principal and request | Success data/status | Error behavior and side effects |
|---|---|---|---|
| `GET /api/commerce/ai-credit` | Authenticated Kairmel user; no pid parameter | 200 `{linked:false}` or `{linked:true,balanceXof,recent:AiCreditMovement[],byModel:[{model,amountXof,calls}]}` | Existing BFF loads stored enginePid. Gateway 404 maps to empty linked activity; failures/timeouts (5 s) map 502. Unlinked user is not represented as zero balance |
| `GET /api/commerce/token-packs` | Authenticated user | 200 `[{label,fcfa,token}]` | Reads configured offers; absent/malformed configuration yields empty list |
| `POST /api/commerce/token-packs/:token/buy` | Authenticated user; configured offer token | 200 `{receiptId,paymentStatus,payUrl:string\|null}` | 404 unknown offer, 403 WhatsApp link required, 503 partner config, Engine 4xx preserved, other failures 502. Creates an Engine Wave checkout with a fresh random idempotency key on each call |
| `GET /api/commerce/deliveries` and `PATCH /api/commerce/deliveries/:id` | Authenticated user's short Engine session; PATCH `{status:"shipped"\|"delivered"\|"cancelled"}` | 200 Engine delivery DTO, including optional `delivery_status`, `shipped_at`, `delivered_at` | 400 malformed request; Engine 409 tells user to refresh. Source at PR #37 includes shipped; Engine owns valid online/COD transitions. Contact is merchant-private |
| `POST /api/apps/:id/marche` | Owner only; `{description,category,icon?,permissions?}` | 200 `{listingId,status}` | 400 invalid/undeployed, 404 missing/other owner's app, 409 listing conflict, 503 not configured, 502 catalogue failure, 500 unexpected failure. Server derives id/name/url/author and owner; updates local listing record |
| `GET /api/apps/:id/marche` | Owner only; app ID | 200 `{listingId,status,reason?}` | 404 app/unpublished/listing, 503 config, 502 upstream, 500 unexpected. Refreshes local status, so this read has a local metadata write |

`AiCreditMovement` is `{kind,amountXof,model:string|null,inputTokens:number|null,outputTokens:number|null,estimated:boolean,note:string|null,paymentRef:string|null,at}`. The adapter is already implemented in `worker/services/deployer/yaatalGatewayActivity.ts`; a new credit-read BFF would duplicate it. Its numeric coercion is not strict upstream schema validation; malformed successful responses need a bounded adapter hardening task if this becomes release-critical.

### Marché

| Method/path | Current principal/request | Success response/status | Refusals and effects |
|---|---|---|---|
| `GET /v1/catalogue` | Public; no query contract | 200 `{apps:AppManifest[]}`, approved only, sorted by name | CORS `*`, public cache 60 s; read only |
| `POST /v1/listings` | Publisher bearer; `{manifest:AppManifest,owner:string}` | 201 new / 200 replacement `{id,status}` | 401 credential, 400 validation with `{error:{type:"invalid_manifest",messages:string[]}}` for manifest errors, 409 `{error:{type:"id_taken"}}` on different owner. Replacement enters review; publisher is a service credential, not user-scoped authorization |
| `GET /v1/listings/:id` | Publisher bearer | 200 `{id,status,reason?,updated_at}` | 401/404. No per-user owner check at this service read; Kairmel owner middleware/controller supplies that boundary |
| `GET /admin/listings?status=pending\|approved\|rejected` | Admin bearer | 200 `{listings:[{id,owner,status,reason?,updated_at}]}` | 400 filter, 401; no-store. Publisher credential cannot review |
| `POST /admin/listings/:id/approve` | Admin bearer | 200 `{id,status,updated_at}` | 401/404; makes manifest available publicly |
| `POST /admin/listings/:id/reject` | Admin bearer; `{reason}` 1..2000 characters | 200 `{id,status,reason,updated_at}` | 400/401/404; records rejection |
| `POST /v1/auth/whatsapp/start` | Same-origin JSON request; no login | 200 `{id,whatsapp_url,expires_in_seconds}` | 415 content type, 403 origin, 429 rate limit, 503 config, 502 Engine. Creates Engine login attempt; existing limit 5/IP/10 min |
| `GET /v1/auth/whatsapp/status?id=...` | Public nonce ID | 200 `{status}` | 400 ID, 503 config, 502 Engine; no-store |
| `POST /v1/auth/whatsapp/verify` | Same-origin JSON `{id,code}`; six-digit code | 200 `{signedIn:true}` plus host session cookie | 400 input, 401 invalid code, 415/403, 429 (10/IP/10 min), 503/502. Creates local session only after Engine verification |
| `GET /v1/me` | Marché cookie (optional) | 200 `{signedIn:boolean}` | 503 config; no-store. Does not reveal pid |
| `GET /v1/me/identity?app=...` | Marché cookie; validated app ID | 200 `{id:string}` | 400 app, 401 signed-out, 503 config; HMAC-SHA256 of `pid:appId`, stable per app, never raw pid |
| `POST /v1/auth/logout` | Same-origin JSON; cookie optional | 200 `{signedIn:false}` plus cleared cookie | 415/403/503; deletes local session if present |

`AppManifest` is `{id,name,description,icon,url,category,author,permissions:("identity"|"share"|"pay")[]}`. Validate using Marché's current validator; preserve stable manifest ID and consent key. Kairmel `publishListing`/`getListingStatus` return discriminated results for network, invalid_manifest, id_taken, not_found and unexpected HTTP errors. They trust successful JSON bodies; malformed success JSON can throw to the controller's 500 path. A new catalogue adapter must validate successful data explicitly.

## Session crossing and mini-app constraints

The first catalogue read needs no account crossing. Discover currently calls Kairmel's own public-app list (`usePaginatedApps({type:'public'})` and `/api/apps/public`); it is not Marché's approved catalogue. Publishing/listing polling exists; browsing that catalogue within Kairmel does not.

For later shared login, reuse Kairmel session validation and Engine's stored pid. Proposed crossing: Kairmel's server requests a short-lived, single-use, audience-bound handoff from Marché; a top-level navigation redeems it on Marché's origin and issues its existing host-only cookie. Bind issuance to the initiating Kairmel session, destination origin and validated return path. Atomically consume the handoff, use no-store, reject expired/replayed/cross-account or injected destinations, and expose neither pid nor partner secret in the navigation. Revocation/account switch must invalidate outstanding handoffs and clear host consent/session state. Do not share cookies through a parent Domain or loosen auth CORS.

This handoff and coordinated logout are proposed, unimplemented contracts. No endpoint or schema exists for them in the inspected code. An implementation card must define persistence, TTL, binding proof, explicit method/path, responses and concurrency tests before adding routes. Use canonical Google native handoff tests as security examples, not as interchangeable Marché tokens.

Retain Marché's host: exact iframe window and origin validation, declared permissions, user consent, and per-app identity. Sandbox is `allow-scripts allow-same-origin allow-forms allow-popups`; same-origin mini-apps are rejected. Do not render untrusted app JavaScript in Kairmel's document or pass Kairmel cookies/JWT to it. `identity` returns `{userId}`; share uses the existing host; declared `pay` currently returns `not_implemented`. Other bridge failures are `not_signed_in`, `permission_denied`, `unknown_method` or `internal_error`. A declared pay permission is not proof of integrated online payment.

## Money, delivery and runtime boundaries

Online payment remains required product scope alongside COD's trust and conversion funnel. Use the existing Engine Commerce Sheet and payment rails. A payment-browser return is navigation evidence; Engine settlement is payment evidence.

Paid token packs start in Engine's `awaiting_payment` outbox, become `pending` on eligible settlement, and reach the gateway with `payment_ref=tx_id`. Failed/cancelled payments do not fund credit. By default, sandbox settlements enter `sandbox` rather than `pending` and do not fund credit. Existing `COMMERCE_SANDBOX_SETTLES=1` or `true` overrides that behavior: sandbox settlement can enter `pending` and fund the configured gateway. `sheet_payments.rs:sandbox_settles` has no production-environment guard, so production must leave this staging/test override disabled. Gateway's global payment-reference index prevents a settlement funding two accounts; retry returns `applied:false` for the original account. Preserve this credit retry path. Kairmel's fresh per-call buy UUID means a repeated purchase request can create another checkout; retry-safe purchase initiation is a separate bounded Engine/Kairmel contract task, not an OS business-code change.

Keep COD order placement, delivery, cash collection and reconciliation separate from online settlement, escrow release and payout. Delivery completion must not manufacture online payment. Optional local couriers and possible cross-border/DHL shipment legs are proposed services, not existing partnerships or adapters. Engine needs role/assignment and collection authority contracts before exposing buyer contact to a courier. Goods revenue, delivery/service fees and AI usage credit are distinct accounting facts; fee payer/timing/share remain product choices.

Cloudflare catalogue Gatekeeper methods `listProducts`/`getProduct` are implemented read-only RPC, require observation approval, and read one deployment-configured merchant's public catalogue. `getAutoApprovableActions` is empty; writes throw. Its verifier does not authenticate a merchant principal. Private orders, inactive stock, cross-merchant switching or a general all-account BFF require a new verified principal scope; current deployment configuration cannot provide that authorization.

The runbook selects the VPS speech-core talker/Kairmel brain voice pipeline. OS `apps/voice` still contains a Workers prototype using a deployment API key; gateway `/voix/*` and `/agents/yaatal-voice/*` proxy through its VOICE binding. These declarations prove code exists, not that a shared merchant voice billing/session contract or retirement is complete. Follow the runbook's caller/traffic/archive checks before removing it. R-24 Assistant Ventes remains proposed and unbuilt: select one runner/runtime in the R-24 spike; Engine must own bindings, proposals, confirmation and execution. Do not implement it independently in Cloudflare OS and another runner.

## Smallest runtime follow-up

Add approved public Marché catalogue browsing to Kairmel using existing `GET /v1/catalogue`, current manifest validation and the existing Marché host for launch. Keep it visibly separate from Discover's Kairmel public sites until a combined catalogue contract is agreed. No new identity grants, credit BFF, review UI or service migration is needed for this slice.

Acceptance: a signed-out person can browse an approved listing; pending/rejected listings never appear; existing Discover public sites still load; malformed manifests fail validation; unavailable catalogue shows an honest retry/empty state; navigation can open the configured Marché host on web/Windows/Android. Launch preserves sandbox, per-app identity consent and the current independent sign-in. If identity or pay is unavailable, show that state; do not fabricate a shared session or successful payment. Record the configured origin and service/source pin without secrets.

Remaining implementation choices: placement of the public catalogue route, shared Marché login/logout handoff, per-principal Cloudflare private access, selected R-24 runner, strict upstream DTO validation, retry-safe token purchase initiation, courier assignment/collection model and monetization terms. Real online payment/settlement and physical native/media acceptance remain launch gates; this public catalogue slice does not close them.
