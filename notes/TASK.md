# SeaSnoke

SeaSnoke is a dark factory for software.

You describe a change in plain language. An isolated AI coding agent implements it, runs your repo's own checks, and QAs it in a real browser with the session recorded. Most tasks finish in 5 to 30 minutes, and the pull request is waiting when you look. No local dev environment, ever.

This file is the living tracker for that promise. Update the checkboxes when a slice ships or regresses. Do not mark a box done because the code path exists; mark it done when a real customer repo can finish that step without a human babysitting the DevBox.

Implementation lives in `app/` (Rust API, worker, harness, React UI). Marketing is `web/`. Docs are `docs/`.

---

## Factory loop

The product is one loop. Everything else is infrastructure for this loop.

```
plain-language task
        ↓
isolated DevBox (fresh clone, no shared disk)
        ↓
coding agent implements the change
        ↓
repo's own checks (ci / test / lint / build)
        ↓
real-browser QA with a recorded session
        ↓
pull request waiting (or YOLO merge, admin only)
```

| Promise | Status | Reality today |
| --- | --- | --- |
| Describe a change in plain language | **Partial** | Composer, Slack, Linear, GitHub, and `POST /api/intake/runs` all take a prompt. Intake still needs tenant env (`SLACK_TENANT_ID`, Linear key) and a fully onboarded GitHub repo. |
| Isolated AI coding agent | **Partial** | Threads can pick SeaSnoke (HTTP tools), Codex ACP, or Claude ACP. Codex/Claude still run inside the DevBox because they need the repo cwd; the harness is the ACP client. Grok/Kimi stay on the legacy run lane. Not certified on a customer Thread. |
| Runs the repo's own checks | **Partial** | Worker and Thread publish share `app/scripts/repository-ci.sh`. Production API/harness/worker are on this path. Not certified on a customer Thread. |
| QA in a real browser, session recorded | **Partial** | Headed Chromium records VP9 webm + H.264 mp4. Thread publish copies the file into `project_thread_qa_artifacts` and the dashboard plays it. Still not certified on a customer Thread with `certify-factory-thread.sh`. |
| PR waiting when you look | **Partial** | Thread publish now commits, pushes the head branch, and opens a GitHub PR after CI and QA. Run-lane GitHub App publish still exists. Not certified on a customer Thread. |
| 5–30 minutes, typical | **Unproven** | No SLO, no duration telemetry on the happy path. Cold DevBox install (Node LTS, agent CLIs, Chromium) will blow past 30 minutes on first boot. |
| No local dev environment, ever | **Customer promise, not our workflow** | That is what SeaSnoke sells. Building SeaSnoke itself still uses a laptop, `cargo`, and `pnpm`. Do not confuse the two. |

---

## Done

Shipped enough to use in staging. Not the same as "the factory is closed-loop."

### Control plane

- [x] Multi-tenant auth, RBAC, TOTP, machine API tokens
- [x] GitHub App install, repo grant, branch push, PR, webhook, CI status sync
- [x] Postgres as source of truth; Redis for queues and live logs
- [x] Operator dashboard: projects, composer, threads, kanban, settings, fleet
- [x] CRDT/sync gateway for optimistic UI (kanban, prompts, some thread events)

### Isolation

- [x] Single-use DevBox per run: fresh clone, no shared NFS between workers
- [x] Sandbox lifecycle behind `seasnoke-sandbox-api` (Docker today, remote/MicroVM capable)
- [x] In-box `seasnoke-devbox-exec` for HTTP exec, files, events, ACP websocket
- [x] Production worker/harness do not mount Docker socket or `/dev/kvm`

### Run-lane factory (legacy task path)

- [x] Prompt → queued run → worker → DevBox → agent → CI → visual QA attempt → PR or YOLO
- [x] ACP client in the worker; diffs and tool events render in sub-threads
- [x] SeaSnoke/Pi ACP (`pi-acp`) with BYOK model provider (OpenAI / Anthropic / xAI / Moonshot)
- [x] Codex ACP (`@agentclientprotocol/codex-acp`): API key or ChatGPT `auth.json` from `codex login --device-auth`
- [x] Claude Code ACP (`claude-agent-acp`) + Anthropic key
- [x] Grok Build ACP (`grok agent stdio`) + xAI key
- [x] Kimi ACP (`kimi acp`) + Moonshot/Kimi key
- [x] Runtime picker in the composer; `/codex`, `/claude`, `/grok`, `/kimi` on intake
- [x] Repo CI detection for the stacks listed above
- [x] Best-effort Chromium CDP capture + QA markdown on the PR
- [x] Deterministic PR evidence bundle (run, branch, verification, prompt)

### Thread-lane product (target)

- [x] Projects, Blueprints, Snapshots, project Threads
- [x] `seasnoke-harness` outside the DevBox, talking to the org model provider
- [x] Thread DevBox exec via `seasnoke-devbox-exec` when attached
- [x] Thread git/diff pane

---

## Not done

Work that still blocks the sentence at the top of this file. Ordered by how much it breaks the factory promise.

### P0 — recorded browser QA is not the product yet

- [x] Install `ffmpeg` (and keep Chromium) in the DevBox image so a session recording is the default, not a lucky extra
- [x] Fail the factory step when a preview port is up and recording fails — do not silently write a green recap
- [x] Point the run recap at `.seasnoke/qa/session.webm` / `.gif` on the PR branch. Thread publish also stores a playable video on the Thread (`GET /api/projects/.../qa`) and the DevBox sidebar plays it.
- [x] Drive more than "open `/`": CDP follows up to three same-origin links from the preview
- [ ] Run the same QA step on the Thread lane, not only `seasnoke-worker` — publish starts a preview (`app/scripts/start-preview.sh`) then harness `visual_qa` fail-closed; not certified on a customer repo. Use `app/scripts/certify-factory-thread.sh`.

### P0 — PR / YOLO is not operator-safe

- [x] YOLO looks like a destructive action and asks for confirmation
- [x] One YOLO bit shared by composer and DiffModal
- [x] Merge failures (non-conflict) visible in the modal, not only logs
- [x] After a PR exists, the primary action is done/close, not "create pr"
- [x] Disabled merge shows the precheck reason on the button

### P0 — the loop is not one loop

- [ ] **One product surface.** Composer creates Project Threads (`POST /api/projects/.../threads`). Home lists Threads first. `/tasks/$runId` is wrapped as legacy history. `/api/runs` remains for history.
- [ ] **One agent loop.** New Thread turns run in `seasnoke-harness` outside the box. The worker ACP path still exists for leftover run-lane jobs. Do not add more in-VM agent runtimes.
- [ ] **SandboxManager.** `seasnoke-sandbox-manager` owns ensure/pause/destroy/exec/files. Harness `compute.rs` and worker `SandboxApiBackend` are adapters. Worker ACP/CI/QA still exist.
- [ ] **Thread DevBox API.** Lifecycle, exec, files, ports, and preview-proxy routes exist. Sidebar has create/pause/resume/destroy and preview open/stop. Not certified against a live DevBox.
- [ ] **One Thread table.** `agent_threads` is run-lane evidence. Existing messages are copied into `run_agent_events` (migration 053 + insert trigger). Recap reads `run_agent_events`. Product Threads stay in `project_threads`. Not certified live.

### P1 — time and trust

- [x] Pin Codex (`@agentclientprotocol/codex-acp@1.6.2`) and Claude ACP (`@agentclientprotocol/claude-agent-acp@0.70.0`) in the DevBox entrypoint, same style as `pi-acp@0.0.26`
- [ ] Warm base images with Node LTS, Chromium, ffmpeg, XFCE/Xvfb, and the selected agent CLI already installed — Dockerfile sets `SEASNOKE_REQUIRE_WARM_IMAGE=1`; entrypoint skips when warm and exits 2 when cold; not certified live
- [ ] Measure p50/p95 wall time from prompt to PR; treat >30 minutes as a defect — `GET /api/fleet/slo` and DB triggers exist; not certified on live traffic
- [ ] End-to-end certify one real repo through Codex ACP, Claude ACP, and SeaSnoke harness — unit tests are not that
- [ ] Live PTY, preview ports that actually route to the Thread DevBox, remote IDE later — preview proxy code exists; not certified live

### P1 — intake and tenancy

- [ ] Slack/Linear credentials in tenant settings, not host env only — `factory_intake_settings` is the product path; host env requires `SEASNOKE_ALLOW_HOST_INTAKE_CREDS=1`
- [ ] Billing / entitlements (quotas exist, Stripe does not)
- [ ] Multi-host worker scheduling (today: host-local)

### P2 — architecture leftovers

- [ ] Rename runtime id `pi` → `seasnoke` in API and UI
- [ ] Stop injecting model keys into the VM env once the agent is outside the box
- [ ] Curated, pinned sandbox images (no ad-hoc `apt-get` / `npm i -g` on the hot path) — warm exec image exists; entrypoint still installs if the image is cold
- [ ] SSO (intentionally out of V1)
- [ ] Presence is names on a sync channel, not a real multiplayer editor

---

## How to develop this project

SeaSnoke is built so that **customers** never open a local checkout. **You** still do, until this repo can factory itself. Work as if every change will be reviewed from a PR evidence bundle, not from your laptop demo.

### Layout

| Path | What it is |
| --- | --- |
| `app/` | The product. Rust workspace + `ui/` dashboard. Treat this as the git root for almost all work. |
| `app/crates/seasnoke-api/` | Gateway: auth, GitHub App, runs, threads, settings |
| `app/crates/seasnoke-worker/` | Legacy factory: ACP in the DevBox, CI, visual QA, publish |
| `app/crates/seasnoke-harness/` | Thread agent loop **outside** the DevBox |
| `app/crates/seasnoke-sandbox-api/` | Only process that talks to Docker / remote isolation |
| `app/crates/seasnoke-devbox-exec/` | Tiny HTTP+ACP server **inside** the DevBox |
| `app/ui/` | React + Tailwind operator UI |
| `web/` | Marketing site |
| `docs/` | Public docs |

Read `app/ARCHITECTURE.md` and `app/docs/threads-devbox-architecture.md` before adding a third execution path. There are already two. Do not add a third.

### Hard rules

- React files stay under **500 lines**. Split, do not append.
- Rust files over **1000 lines** get split.
- Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- `app/AGENTS.md` says: push `main` so production can pick it up. UI on `app/ui` deploys to Cloudflare Pages on commit. API/worker deploy by SSH to `root@vm` (see `app/docs/v1-production-deployment.md`). Do not force-push `main`.
- Do not commit `.env`, keys, or ChatGPT `auth.json`.
- Dashboard UI is system sans-serif. Monospace is only `pre`/`code` inside `.agent-chat` and `.chat-message`.
- Avoid React #185 loops: do not put a freshly allocated callback in a `useEffect` dependency array and then `setState` unconditionally. `useCallback`, and keep `setQueryData` identity-stable when nothing changed.

### Which lane am I in?

Ask this before writing code.

1. **Customer factory job** (prompt in, PR out) — today that is `seasnoke-worker` + ACP + `visual_qa.rs` + `ci.rs`. Changing Codex/Claude/Grok/Kimi, CI detection, or browser recording belongs here.
2. **Project Thread chat** — `seasnoke-harness` + model provider + `seasnoke-devbox-exec`. No in-VM `codex-acp`. Do not "just" wire Codex into Threads by copying the worker command into the harness.
3. **Isolation / lifecycle** — `seasnoke-sandbox-api` only. Worker and harness must not grow Docker/KVM knowledge.
4. **Operator UI** — `app/ui`. Keep run/task language from spreading; new chrome should say Thread / DevBox.

Convergence direction (do not invert it):

1. SandboxManager from harness `compute.rs` (Docker first, MicroVM later)
2. `seasnoke-devbox-exec` in every box; stop putting model keys in the VM
3. Coding turns move to `seasnoke-harness` (or a shared crate)
4. Worker shrinks to create/destroy, clone, CI shell, QA browser
5. Runtime id `pi` → `seasnoke`; settings = model provider + extra harness credentials
6. Hide legacy run/task surfaces

### Local loop (building SeaSnoke)

From `app/`:

```sh
cp crates/seasnoke-api/.env.example crates/seasnoke-api/.env
cp ui/.env.example ui/.env
docker compose up -d postgres redis
cargo run -p seasnoke-api
cargo run -p seasnoke-harness
cargo run -p seasnoke-worker
# optional, if you are touching isolation:
cargo run -p seasnoke-sandbox-api
cd ui && pnpm install && pnpm dev
```

UI `http://127.0.0.1:3000`, API `http://127.0.0.1:8080`. Set `LOCAL_ENV=true` in the UI env if the built UI would otherwise hit production. Or `docker compose up --build`.

Production: UI `https://app.seasnoke.com`, API `https://api.seasnoke.com`.

### Checks to run before you call a change done

Match the factory: run **this repo's** checks, not vibes.

```sh
# Rust — from app/
cargo test --offline
# or a tight slice, e.g.
cargo test -p seasnoke-worker --offline
cargo test -p seasnoke-api --offline
cargo test -p seasnoke-types --offline

# UI — from app/ui/
pnpm lint
pnpm test:source
# After React edits, do not regress:
npx -y react-doctor@latest . --verbose --diff
```

If the change is visual, take a screenshot and put it in the PR/chat. If the change is a factory step (CI, QA, PR), attach the run recap / `.seasnoke/qa` artifacts, not a claim that it "should work."

### How to take work off this file

1. Pick one unchecked box. Write the acceptance test in the PR body in one sentence ("A Codex run against repo X opens a PR that contains `.seasnoke/qa/session.webm` and a green `pnpm test` log").
2. Stay in one lane. Do not "while I'm here" add another ACP runtime inside the VM.
3. Implement in `app/`. Keep React ≤500 lines, Rust splits at 1000.
4. Run the checks above. Deploy UI via commit; deploy API/worker on the VM if the path is live.
5. Flip the checkbox in this file in the same change. If it is only unit-tested, leave it unchecked and note "code exists, not certified."

### What "done" means here

A box is done when an operator can describe a change in SeaSnoke, walk away, and come back to a PR that already ran the repo's checks and includes a browser session recording. Until that is true for Threads — not only the legacy run lane — the factory is still being built.
