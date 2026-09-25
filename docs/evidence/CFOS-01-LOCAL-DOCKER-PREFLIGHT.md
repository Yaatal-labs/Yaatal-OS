# Local Docker preflight — reviewed evidence

## Scope and result

Read-only local Docker discovery requested by the user. DeepSeek V4 Flash collected inventory; parent independently verified the endpoint, image list, relevant image metadata and container list, then inspected the source revision declared by the image. No pull, build, container start/stop/create/exec, model call, credentials read, existing volume reuse or VPS access occurred. This replaces the worker draft's unsafe/incomplete launch recommendations.

Docker-first local evaluation is preferred. There is a local Yaatal inference-contract reference image, but no identifiable Cloudflare OS, full Engine API or Studio application image in the inspected local inventory. The reference image is NOT a substitute for the intended OS/agent evaluation.

## Primary evidence

- Effective context: `desktop-linux`; no DOCKER_HOST or DOCKER_CONTEXT override was set when checked.
- Endpoint: `npipe:////./pipe/dockerDesktopLinuxEngine` (local named pipe).
- Client/server: `29.4.0` / `29.4.0`; server `linux/amd64`.
- Candidate: `yaatal/inference-runtime:g0-local`, displayed size `121MB`.
- Image ID: `sha256:8eae557cac0f4a27adffabd19d21443efc7bed1ac6b266753590ab2ec6083a68` (local content ID, not a claimed registry manifest digest).
- Image source label: `https://github.com/Yaatal-labs/Yaatal-Engine`.
- Image revision label: `a4f8328e31fdbe0711d3adde3e158cc18e8a319d`.
- Image declared user: `10001:10001`; exposed port: `8080/tcp`.
- Existing `yaatal-postgres` and `yaatal-pgbouncer` containers are stopped; their stored mappings expose host ports 5432 and 6432 on all interfaces. Data provenance is unknown. Do NOT restart or attach to their volumes for this experiment.
- Other local images include HTR-01 test artifacts, Python, databases, Dograh and Docker extensions. They are not evidence of a Cloudflare OS installation. Existing unrelated services remain untouched.

Commands verified by parent: `docker context show`, targeted context inspect; formatted `docker version`; `docker image ls --no-trunc`; selected-field image inspect; formatted `docker ps -a`. Only relevant metadata was inspected, not image/container environments or credentials.

## Source verification — why the existing image is not the OS baseline

The labelled commit exists in the local Engine repository. Parent read these files with `git show` at that exact revision:
- `crates/yaatal-inference-runtime/src/main.rs`: constructs `ReferenceBackend`, not a real model worker.
- `src/backend.rs`: explicitly describes a deterministic reference backend and returns literal `reference response` with fixed token usage. Health/component declarations are reference states, not proof of loaded model weights.
- `src/http.rs`: requires explicit `YAATAL_INFERENCE_*` configuration for bind address, runtime/model identities, timeouts, concurrency and health state. A bare `docker run` is not a verified startup recipe.

OCI labels are declared provenance, not independent attestation of the binary. The container has NOT been executed here. Nevertheless the labelled source gives no basis for claiming a functional model, merchant API or Cloudflare OS is present. A successful fixture test would validate the contract transport only, never agent quality, real token cost or merchant integration.

## Source/build inventory (worker observations)

- Existing Engine Dockerfile and Studio Dockerfile were found, but no matching prebuilt application image was identified.
- Engine `docker-compose.dev.yml` describes supporting Postgres/PgBouncer services, not the full OS agent stack.
- No inspected Compose entry identified a Cloudflare OS/workerd service. The search was bounded, not a claim about all disks/registries/contexts.
- No suitable preloaded Node/Cloudflare OS dev image was identified in the local daemon inventory.

## Preferred next step — isolated upstream OS local-dev evaluation

1. Keep the VPS, existing application containers and existing database volumes out of scope.
2. Use pinned upstream Cloudflare OS/starter in a separate Docker-backed local-dev sandbox. This avoids changing global Windows Node/pnpm; it is not a production self-host deployment.
3. There is no ready OS application image in the inspected inventory. An appropriate pinned base-image pull and minimal upstream dev-container setup may be needed; both require the separately scoped local setup approval. Verify the pinned upstream startup instructions before authoring a container recipe. Do not invent an official published OS image or call a proposed recipe tested.
4. Proposed branch: `yaatal/cloudflare-os-adaptation`; source/config/evidence path: `C:/tmp/yaatal-cloudflare-os-eval/`. Additional Docker write set: explicitly named test images, containers and isolated network/volumes, to be listed before launch. No existing volumes may be reused.
5. Scope launch to a checked free `127.0.0.1` host port; keep production credentials and home/repository-wide/socket mounts out. No privileged or host-network mode. Constrain runtime outbound access to the approved dependency/model needs; a port mapping alone does not block egress.
6. Acceptance: real upstream UI, sign-in/admin boundary and an approved non-sensitive in-OS agent turn. A reference response or health endpoint does not pass agent acceptance. Reuse upstream evals for subsequent A/B customization.

## Rejected worker-draft recommendations

- `-p 8080:8080` is NOT loopback-only. Host bindings require an explicit `127.0.0.1` address.
- Docker default networking is NOT "no network"; `--network none` also prevents a host-published HTTP smoke test. Select an explicit isolation design rather than making both claims.
- No automatic restart of stopped Postgres/PgBouncer or reuse of unknown data.
- No bare fixture run, claimed static linking, guessed health route, real inference claims or mandatory Engine rebuild based solely on this inventory.
- No claim that local Cloudflare OS is impossible: only that a ready image was not identified, so isolated setup is still needed.
