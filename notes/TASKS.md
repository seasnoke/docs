# SeaSnoke remaining work

Working loop over the factory gaps in [TASK.md](TASK.md). Implementation boxes below are checked when this repo's tests pass. TASK.md still withholds "factory done" until a customer repo is certified.

## Loop 1 — SandboxManager

- [x] Create `app/crates/seasnoke-sandbox-manager` with ensure / pause / resume / destroy / exec / health
- [x] Normalize DevBox statuses to `creating | ready | busy | idle | paused | resuming | destroyed | error`
- [x] Harness `compute.rs` calls the manager; no Docker socket in harness
- [x] Worker sandbox-api HTTP ensure/destroy uses the same manager client

## Loop 2 — Thread DevBox API

- [x] Migration: events, preview ports, status remap, pause/destroy timestamps
- [x] Routes under `/api/projects/{id}/threads/{thread_id}/devbox` (GET, POST, pause, resume, DELETE, events)
- [x] API writes lifecycle events

## Loop 3 — Thread sidebar

- [x] Right sidebar shows status badge, backend, heartbeat, last error
- [x] Create / pause / resume / destroy controls

## Loop 4 — Thread-lane recorded QA

- [x] Share the worker QA script (repo-root parameterized)
- [x] Publish enqueues a harness `publish` job
- [x] Harness runs repository CI then QA; fail closed when a preview is up and recording fails
- [x] Start `dev`/`preview` before QA when the repo has that script (`app/scripts/start-preview.sh`)
- [x] Harness publish commits, pushes, and opens a GitHub pull request after CI and QA
- [x] Persist the session recording on the Thread and play it in the dashboard (`/qa` + `<video>`)
- [ ] Certified on a real customer repo (unit tests are not that; `app/scripts/certify-factory-thread.sh`)

## Loop 5 — One product surface

- [x] Composer creates a Project Thread, not `POST /api/runs`
- [x] Hide unused AgentChat import from the primary project layout (legacy `/tasks/$runId` and `/api/runs` remain for history)
- [x] Home Recent work lists Project Threads first; `/tasks/$runId` is labeled legacy history

## Loop 6 — One agent loop / one Thread table

- [x] Do not add in-VM ACP runtimes
- [x] `agent_threads` documented as run-lane evidence only
- [x] Pin Codex (`@agentclientprotocol/codex-acp@1.6.2`) and Claude ACP (`@agentclientprotocol/claude-agent-acp@0.70.0`) in the DevBox entrypoint
- [x] Fold existing `agent_threads` rows into `run_agent_events` and dual-write via trigger
- [x] Run recap reads `run_agent_events` (not `agent_thread_messages`)

## Loop 7 — Thread DevBox exec / files / preview

- [x] SandboxManager `read_file` / `write_file` plus exec
- [x] Routes: exec, files/content, ports, preview proxy
- [x] Pause/destroy close preview ports; resume revalidates health
- [x] Sidebar Preview section with open/stop for 3000/5173/8080
- [x] Thread git status/diff goes through SandboxManager (no direct `/exec/wait`)

## Loop 8 — Duration SLO

- [x] Persist `duration_ms` / `slo_breached` (>30 min) on runs and project threads
- [x] `GET /api/fleet/slo` returns p50/p95 over 14 days; Prometheus gauges
- [ ] Live p50/p95 on a real factory day (unit tests are not that)

## Loop 9 — Intake and warm image

- [x] Slack/Linear host env only with `SEASNOKE_ALLOW_HOST_INTAKE_CREDS=1`; tenant settings are the product path
- [x] Warm `seasnoke-devbox-exec` image: Node 22, Chromium, ffmpeg, pinned agent CLIs
- [x] Entrypoint skips apt/npm when the image is already warm
- [x] Cold image fails closed when `SEASNOKE_REQUIRE_WARM_IMAGE=1` (baked into `seasnoke-devbox-exec`)
- [ ] Live certify the warm image on a customer repo

## Out of this loop

These stay open until a real environment can prove them:

- Live certify one customer repo (`SEASNOKE_API_TOKEN` + `SEASNOKE_CERT_MUTATE=1 app/scripts/certify-factory-thread.sh`)
- Production API/worker/harness/sandbox-api rebuilt 2026-08-22T11:54Z (fba5d14 + AppleDouble ignore). Migrations applied on API startup. Warm `seasnoke-devbox-exec:latest` is current (rebuild was a cache hit). Mutating cert still needs a SeaSnoke API token.
- Live PTY (preview proxy code exists, not certified)
- Billing / Stripe
- Multi-host scheduling
- SSO
- Rename stored runtime id `pi` → `seasnoke` (alias already accepted)
- Presence as a real editor
- Stop injecting model keys into the VM
