<!-- /autoplan restore point: /home/sk/.gstack/projects/Projekts-Seasnoke/Projekts-Seasnoke-autoplan-restore-20260511-104816.md -->
# Plan: Enterprise Merge, True CI, and Worker Quota Limiter

## Summary

Three features to harden Seasnoke from a demo into a production-grade code review platform.

---

## Current State Audit (before writing code)

### Feature 1: Real Git Push & PR Creation

**User says:** "extracting a base64 diff and showing it in the UI"

**Reality — the backend already implements this end to end:**

- `app/crates/seasnoke-api/src/routes/runs.rs:292` — `merge_run()` handler accepts `{ task_id, diff, yolo }`, validates RBAC + CI gate, calls `create_or_merge_provider_change()`.
- `app/crates/seasnoke-api/src/routes/runs.rs:796` — `apply_patch_commit_and_push()` does `git clone --branch base`, `git checkout -B head`, `git apply --index`, `git commit`, `git push --force-with-lease`.
- `app/crates/seasnoke-api/src/routes/runs.rs:706` — `create_or_merge_provider_change()` iterates through provider-specific PR creation (GitHub REST API). YOLO mode also calls the merge API.

**Actual gap:** The DiffModal UI (`app/ui/src/components/DiffModal.tsx:46-73`) is limited — it shows the diff but gives zero feedback about what happens after clicking Merge. No status for "cloning repo...", "applying patch...", "pushing branch...", "creating PR...", "PR URL: https://...". The user gets a log line `[MERGE] Created provider pull request...` buried in a terminal component. No link they can click. No error detail beyond `[MERGE ERROR]`.

**What needs building (scoped to this feature):**

1. **Streaming merge status API** — Extend `merge_run` to be async with progress SSE. Or: add a WebSocket/channel that publishes merge stage events to `seasnoke:logs:{run_id}` so the terminal component shows live feedback.
2. **Merge result card** — After success, show a clickable PR link + copy-to-clipboard button in the DiffModal footer (not just a log line).
3. **Edge case hardening** — Handle: empty diff, merge conflict (git apply fails), branch already exists, PR creation 422 (GitHub validates branch names), token expired, repo archived, git not installed on API container.
4. **Delete temp dir on panic** — `apply_patch_commit_and_push` removes the temp dir on success but has no Drop guard — an early return or panic during clone/apply leaks `/tmp/seasnoke-merge-*` directories.
5. **Rate-limit the merge button** — Right now you can spam-click "Merge" and create duplicate PRs. Add a 429 or deduplication check.

### Feature 2: True Sandbox CI Extraction

**User says:** "pre-check endpoint is faking a passed CI status"

**Reality — the worker already runs real CI inside sandboxes:**

- `app/crates/seasnoke-worker/src/main.rs:438` — `run_repository_ci()` executes `cargo test` / `npm test` / `go test` / `python3 -m pytest` inside the microVM, captures exit code (line 463), and returns `VerificationReport { passed, output }`.
- CI runs during the agent loop, after each iteration. If CI passes, `ci_status` = `"passed"` is persisted to Postgres.

**Gap is in the API precheck endpoint, not the worker:**

- `app/crates/seasnoke-api/src/routes/runs.rs:402` — `precheck_run()` only does a DB check: "are all tasks done? any failures? ci_status column say passed?" It never re-executes tests.
- If a task's `ci_status` is `"passed"` because CI ran on a *different* diff (the agent produced new code after CI), the precheck passes with stale data.
- If the worker CI ran and passed but the diff was later edited by the user in Monaco, precheck still passes because it doesn't re-run CI on the edited diff.

**What needs building:**

1. **Precheck triggers re-execution** — `POST /api/runs/{id}/precheck` should push a `TaskMessage { task_type: "ci_only" }` to `seasnoke:tasks:pending`. The worker picks it up, creates a fresh sandbox, clones the repo, applies the *current* diff (or the user-edited diff from the request body), runs `repository_ci_command()`, captures the exit code, and publishes the result. The API precheck endpoint should poll/wait for this result (5-minute timeout) before responding.
2. **CI-only task type** — Add `TaskMessage { task_type: "ci_only", diff: String }` so the worker knows this is not a coding agent task. The worker skips the agent loop, just clones → applies diff → runs CI → reports.
3. **Precheck endpoint accepts diff parameter** — `POST /api/runs/{id}/precheck` body should include `{ diff: string }` so the CI runs against the edited diff, not the original agent-produced diff.
4. **Block merge without precheck freshness** — Track `precheck_timestamp` and `precheck_diff_hash` on the run. If the diff was edited after the last precheck, the merge button stays disabled with "Pre-check must be re-run after editing."
5. **CI timeout and resource limits** — CI inside sandbox already has 512MB RAM / 1 CPU. Add a hard timeout (e.g., 10 minutes per CI run) so a hung test suite doesn't permanently block the precheck endpoint.

### Feature 3: Worker-Side Quota Draining (The Scheduler)

**User says:** "no host-level protection"

**Reality — the worker already has a capacity check:**

- `app/crates/seasnoke-worker/src/main.rs:125` — `wait_for_worker_capacity()` queries org `compute_quota` vs active `tasks.status = 'running'` count. Blocks until `running < quota`.

**Gaps:**

1. **Postgres-counted, not semaphore-based** — Under high concurrency with multiple workers, the `SELECT → read running → decide to launch → insert` window creates a TOCTOU race. Two workers can both see `running = 4, quota = 5` and both launch a sandbox, hitting 6 running.
2. **No host-level hard cap** — The worker has no self-limiting mechanism beyond the org quota check. If Postgres is slow or the quota query returns zero rows (missing tenant), the worker skips the check entirely (line 159: `warn!("Skipping scheduler quota check for missing tenant"); return Ok(());`) and launches a sandbox anyway. A 50-agent swarm with a missing tenant would bypass the guard.
3. **Single-instance worker** — Redis BRPOP means only one worker picks up a task. But nothing prevents running multiple worker processes that each independently check their own `running` count.

**What needs building:**

1. **`tokio::sync::Semaphore` per-worker process** — Add a semaphore initialized to a `MAX_CONCURRENT_SANDBOXES` env var (default: the number of KVM slots available on the host). `process_next_task` acquires a permit before creating a sandbox and drops it on completion.
2. **Token-bucket or semaphore in Redis** — For multi-worker setups, use a Redis Lua script that atomically checks active sandbox count against per-org quota and increments only if under. Replace the current `SELECT + sleep(2) + retry` loop (`lines 133-173`) with a single atomic Redis call.
3. **Org quota enforcement at enqueue time (already done, verify)** — The API's `create_run` already checks `compute_quota` before pushing to Redis (`runs.rs:63-240`). Verify this gate is tight and add a `MAX_QUEUE_DEPTH` per-org as a backpressure mechanism.
4. **Prometheus metric** — Expose `seasnoke_active_sandboxes` gauge and `seasnoke_quota_blocked_total` counter on the worker's metrics endpoint so operators can see saturation.
5. **Host memory check** — Before creating a sandbox, check `sysinfo` or `/proc/meminfo` to ensure the host has enough free RAM for another 512MB sandbox. If below threshold, block and publish `HOST_MEMORY_LOW` to the log channel.

---

## Implementation Order

These three features have dependencies:

1. **Feature 3 (Scheduler) first** — A proper semaphore protects the host before we enqueue CI-only tasks (Feature 2 introduces a new task type that pulls from the same queue). Without a semaphore, a swarm of CI-only tasks could DoS the worker.
2. **Feature 2 (True CI) second** — Adds `ci_only` task type, reworks precheck endpoint, adds freshness tracking.
3. **Feature 1 (Merge UX hardening) last** — Streaming progress, clickable PR links, edge case hardening. Depends on Feature 2 for precheck freshness tracking to work correctly.

---

## Affected Files

| File | Feature | Changes |
|---|---|---|
| `app/crates/seasnoke-worker/src/main.rs` | F3, F2 | Semaphore, `ci_only` task type, host memory check, Prometheus gauge |
| `app/crates/seasnoke-api/src/routes/runs.rs` | F2, F1 | Reworked precheck, streaming merge progress, PR URL in response |
| `app/crates/seasnoke-types/src/lib.rs` | F2 | Add `task_type: "ci_only"` variant, `diff` field to TaskMessage |
| `app/ui/src/components/DiffModal.tsx` | F1 | Merge progress UI, PR result card, precheck freshness indicator |
| `app/ui/src/store.ts` | F1 | New state: mergeProgress, prUrl, precheckFreshness |
| `app/docker-compose.yml` | F3 | `MAX_CONCURRENT_SANDBOXES` env var |
| `app/crates/seasnoke-api/Cargo.toml` | F3 | Maybe `sysinfo` crate for host checks (if the API also needs it) |

## GSTACK REVIEW REPORT — CEO Phase

### CEO Dual Voices — Consensus Table

| Dimension | Claude Subagent | Codex | Consensus |
|---|---|---|---|
| 1. Right problem to solve? | NO — hardening wrong product; trust UX is the actual gap | NO — engineering frame, not enterprise-product frame | **CONFIRMED: both agree the problem framing is off** |
| 2. Premises valid? | NO — assumes hand-edited diffs are primary workflow, doesn't question the merge-as-goal premise | NO — assumes KVM isolation is the buying reason; doesn't prove it | **CONFIRMED: premises are under-argued** |
| 3. Scope calibration correct? | NO — F3 before F1 inverts value delivery; scheduler protects against nonexistent scale | NO — CI rebuild instead of CI integration; YOLO merge too early | **CONFIRMED: scope is misordered and misweighted** |
| 4. Alternatives sufficiently explored? | NO — lighter CI paths (API subprocess, native CI poll) unexplored | NO — native CI integration, evidence-bundle model, policy engine unexplored | **CONFIRMED: alternatives dismissed** |
| 5. Competitive/market risks covered? | Partially — agent trust boundary not addressed | NO — no buyer persona, no moat beyond KVM, competitive risk understated | **DISAGREE: Claude sees partial coverage, Codex sees full gap. Both agree it's insufficient.** |
| 6. 6-month trajectory sound? | NO — ships infrastructure first, user value last | NO — hardens demo's weak spots; doesn't establish why Seasnoke deserves to exist | **CONFIRMED: trajectory is correctable but currently backwards** |

CONFIRMED on 5/6 dimensions. DISAGREE on 1 (competitive coverage — Claude sees partial, Codex sees none).

### CEO Findings Summary

#### CRITICAL Findings

**C1: Cross-Tenant CI Status Overwrite** (Claude subagent, from code audit)
`persist_task_status` in `worker/src/main.rs:232` runs `UPDATE runs SET ci_status = $1 WHERE id = $2` with NO tenant_id clause. Multi-tenant deployments can have CI statuses overwritten across orgs. The `TaskMessage` already has `tenant_id` — pass it through.
**Fix:** Add `AND tenant_id = $N` to every `runs` UPDATE in `persist_task_status`.

**C2: Plan Addresses Engineering Hardening, Not Buyer Value** (BOTH voices independently)
Enterprise buyers don't buy streaming progress bars. They buy trust isolation, policy enforcement, audit provenance, and reduction of review burden. The plan's 3 features are all infrastructure plumbing. No user-visible value ships until step 3.
**Fix:** Restructure to ship at least one user-visible improvement per feature. Inline the smaller fixes (PR link, merge debounce, semaphore) immediately.

#### HIGH Findings

**H1: CI Should Integrate, Not Reproduce** (BOTH voices independently)
Re-implementing CI in KVM sandboxes (install deps, run tests) duplicates what GitHub Actions/GitLab CI already does. The strategic path is: create PR → poll native CI status → gate merge on native CI pass. Only fall back to sandbox CI if no native CI exists.
**Fix:** F2 should poll provider CI status (GitHub Check Runs API, GitLab Pipeline API). Fall back to sandbox CI for repos without configured CI.

**H2: Implementation Order Inverted** (BOTH voices independently)
F3 (Scheduler) → F2 (CI) → F1 (Merge UX) delivers user-visible value last. F3 protects against a CI-only task DoS threat that doesn't exist until F2 builds CI-only tasks.
**Fix:** Reorder to F1 (small wins first: PR link, debounce, Drop guard) → F2 (CI integration) → F3 (scheduler hardening). Ship value incrementally.

**H3: Redis-Lua Can't Enforce Per-Tenant Quotas** (Claude subagent, architectural)
The plan proposes replacing Postgres-based quota checks with Redis Lua atomic ops. But Redis doesn't know about per-tenant quotas in Postgres. You'd need to cache quota values in Redis (cache invalidation problem) or accept host-global-only limits.
**Fix:** Keep Postgres for per-tenant quota at enqueue time (already exists). Add a simple `tokio::sync::Semaphore` for host-level max concurrency only. Skip Redis Lua for now.

**H4: Zero User-Visible Value Until Final Step** (Claude subagent)
If implementation takes 2-3 weeks, users see zero improvement. Ship the PR link (15 min), merge debounce (5 min), and precheck freshness indicator (30 min) on day 1.
**Fix:** Break F1 into independently shippable slices. F1a: PR URL in DiffModal. F1b: Merge button debounce. F1c: Drop guard on temp dirs.

#### MEDIUM Findings

**M1: Git Subprocess Blocks Actix Async Runtime** (Claude subagent)
`apply_patch_commit_and_push` uses `std::process::Command` (blocking) inside an Actix async handler. `git clone` of large repos starves the thread pool.
**Fix:** Wrap in `tokio::task::spawn_blocking` and add a timeout.

**M2: Hand-Edited Diff Workflow Unquestioned** (Claude subagent)
The plan assumes users manually edit AI-generated diffs in Monaco. This may be an anti-pattern for an AI coding agent product. The primary workflow should be "reject with feedback → agent re-generates."
**Fix:** Decide whether hand-edited diffs are primary or edge case. If edge case, ship "Send feedback to agent" first. If primary, the editor needs syntax awareness.

### CEO Dream State Delta

```
CURRENT STATE                          THIS PLAN                         12-MONTH IDEAL
─────────────────────────────────────────────────────────────────────────────────────────
Agent produces diff                    + Streaming merge progress       Agent produces evidence bundle
User sees raw diff in Monaco            + CI re-executes on demand        User sees trust score, explanation
Merge creates PR silently              + Semaphore prevents overcommit  Policy engine gates every action
No visibility into CI results          + Clickable PR link              CI delegates to customer's pipeline
Worker has simple quota check          + Temp dir Drop guard            Audit trail proves every command
                                       + Rate-limited merge             Enterprise: SSO, SCIM, secrets vault
                                       → Leaves: trust, governance,      → Seasnoke as control plane for
                                         buyer clarity, policy, audit      governed autonomous code execution
                                         on the table
```

### Premises — Presented for User Confirmation

The plan rests on these premises:

1. **"Merge UX is the primary enterprise gap"** — Both CEO voices disagree. The gap is trust (review quality, CI evidence, agent provenance), not merge button polish.
2. **"Sandbox CI is better than native CI integration"** — Both voices disagree. Polling GitHub/GitLab CI status is simpler, faster, and aligns with developer workflows.
3. **"Scheduler should ship before CI re-execution"** — Both voices see this as inverted. Ship user value first; harden scale when scale arrives.
4. **"KVM isolation is the product moat"** — Both voices flag this as insufficient for enterprise buying. Policy, audit, and governance are the missing layers.
5. **"Hand-edited diffs are a primary workflow"** — Claude flags this as questionable for an AI agent product. Agent re-generation with feedback may be the better paradigm.

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | CEO | Run both dual voices | Mechanical | P6 (bias toward action) | Always run Codex + Claude, per autoplan rules | Skip/single-voice |
| 2 | CEO | Mode: SELECTIVE EXPANSION | Mechanical | P6 (bias toward action) | /autoplan CEO default | SCOPE EXPANSION, HOLD SCOPE |
| 3 | CEO | Accept premises 1-5 as stated by user | Deferred to user gate | Gates require human judgment | Premises are never auto-decided | N/A |
| 4 | CEO | Merge UX → user-visible slices first | Taste | P5 (explicit over clever) | 15-min PR link ships faster than 2-week streaming | Full streaming merge first |
| 5 | CEO | CI → integrate with native CI, not sandbox CI | Mechanical | P3 (pragmatic) + P1 (completeness) | Both voices agree; native CI covers more edge cases | Sandbox CI for precheck |
| 6 | CEO | Scheduler → simple semaphore, skip Redis Lua | Mechanical | P5 (explicit over clever) | Redis Lua adds cache invalidation problem without solving tenant quotas | Full Redis-Lua distributed scheduler |
| 7 | CEO | Reorder to F1→F2→F3 | Mechanical | P6 (bias toward action) + P2 (boil lakes) | Ship value immediately; revisit scale concerns when needed | F3→F2→F1 |
| 8 | CEO | Fix cross-tenant CI overwrite bug | Mechanical | P1 (completeness) | Security/data corruption; both voices flag it | Defer to later |
**PREMISE GATE RESULT (2026-05-11): User chose "Redirect — integrate with native CI instead of sandbox CI."** F2 revised: poll provider CI status (GitHub Check Runs, GitLab Pipelines) as primary path. Sandbox CI becomes fallback for repos without native CI configured. CI-only task type dropped from scope.

## GSTACK REVIEW REPORT — Design Phase

### UI Scope: DiffModal Only
The only UI changes are to `DiffModal.tsx` and `store.ts`: progress indicator, PR result card, freshness badge. No new screens.

### Design Review (7 Dimensions)

**1. Information Hierarchy: 8/10** — Merge button prominent in footer. CI badge visible. PR card lands in same footer. PASS.

**2. Interaction States: 6/10** — GAP: only idle + disabled covered. Missing: success card, progress states, network error. Plan addresses (F1 items 1-2). Auto-decided: add all 5 progress states (P1, completeness 9/10 vs 6/10).

**3. Empty/Error/Partial: 5/10** — GAP: empty diff shows active merge, broken CI doesn't explain. Plan addresses (F1 item 3, F2 item 4). Auto-decided: add warnings (P1).

**4. Responsive: 9/10** — Full-screen overlay with max-w-6xl, scrollable Monaco. Mobile irrelevant for code review. PASS.

**5. Accessibility: 5/10** — No ARIA labels, focus trap. Deferred to TODOS.md. Auto-decided: defer (P3, real impact minimal for dev tool).

**6. Specificity: 7/10** — Names components, state vars, API calls. PASS.

**7. Design System: N/A** — No DESIGN.md.

| Dimension | Score | Verdict |
|---|---|---|
| Information Hierarchy | 8/10 | PASS |
| Interaction States | 6/10 | GAP (in plan) |
| Empty/Error/Partial | 5/10 | GAP (in plan) |
| Responsive | 9/10 | PASS |
| Accessibility | 5/10 | DEFERRED |
| Specificity | 7/10 | PASS |
| Design System | N/A | N/A |

## GSTACK REVIEW REPORT — Eng Phase

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│  DiffModal.tsx               runs.rs                          │
│  [progress][1] ──POST/merge─> merge_run()                    │
│  [PR card][1]                ├─ dedup guard[2]                │
│  [freshness][3]──POST/prechk─> precheck_run()                │
│                              │  └─ poll native CI[4]:          │
│                              │     GitHub Check Runs API      │
│                              │     GitLab Pipelines API       │
│  useRunSSE.ts <──SSE── publish(seasnoke:logs:{id})            │
│                              │                                │
│  Provider (GH/GL)            │  apply_patch_commit_and_push() │
│  ┌─────────────────┐        │  ├─ spawn_blocking[5]          │
│  │ GitHub Actions   │<─push──┤  ├─ git clone/apply/commit    │
│  │ GitLab CI        │        │  ├─ git push                  │
│  │ • tests run      │──poll─>│  └─ Drop guard[5]             │
│  └─────────────────┘        │                                │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  seasnoke-worker/src/main.rs                                  │
│  Semaphore(MAX_CONCURRENT)[6]                                 │
│  process_next_task()                                          │
│  ├─ semaphore.acquire()                                       │
│  ├─ BRPOP tasks:pending                                       │
│  ├─ execute_in_sandbox() (unchanged)                         │
│  │   ├─ agent loop                                            │
│  │   ├─ run_repository_ci() (unchanged)                      │
│  │   └─ review agent (unchanged)                             │
│  └─ persist_task_status() [+tenant_id][7]                    │
│      └─ UPDATE runs SET ci_status WHERE id AND tenant_id      │
│                                                               │
│  KEY: [1] merge progress, PR card   [5] spawn_blocking + Drop │
│       [2] dedup guard               [6] host-level semaphore  │
│       [3] freshness indicator       [7] cross-tenant fix      │
│       [4] native CI polling                                  │
└──────────────────────────────────────────────────────────────┘
```

### Test Plan

| Codepath | Test Type | Status |
|---|---|---|
| merge dedup rejects concurrent | Integration | NEW |
| progress events published to Redis | Unit | NEW |
| poll GitHub Check Runs API | Integration | NEW |
| poll GitLab Pipelines API | Integration | NEW |
| no native CI → fallback to sandbox | Integration | NEW |
| diff hash unchanged → skip re-check | Unit | NEW |
| Drop guard removes temp dir on panic | Unit | NEW |
| semaphore respects MAX_CONCURRENT | Unit | NEW |
| tenant_id scopes UPDATE correctly | Integration | NEW |
| semaphore released on error | Unit | NEW |
| merge debounce prevents double POST | Component | NEW |

### Failure Modes Registry

| Failure | Detection | Recovery | Sev |
|---|---|---|---|
| Git missing on API | Startup health check | Clear error + install instruction | CRIT |
| Token expired mid-merge | 401 from provider | Catch, return actionable error | HIGH |
| Branch exists (race) | 409 from git push | Retry with timestamp suffix | MED |
| Native CI hung (timeout) | 5-min poll timeout | Return "CI timeout" + YOLO option | HIGH |
| Semaphore permit leak | Prometheus gauge drift | Arc<Semaphore>, alert on mismatch | LOW |
| git apply merge conflict | Non-zero exit | Show conflict; suggest agent re-run | HIGH |
| Temp dir leak on panic | Drop guard | + find /tmp/seasnoke-merge-* -mtime +1 -delete cron | MED |
| Cross-tenant CI overwrite | Integration test | Blocks merge if test fails | CRIT |

### Cross-Phase Themes

**"Ship user value incrementally"** — Flagged in CEO (both voices) and Design (interaction states). Progress streaming + result surfacing is the highest-leverage change.

**"CI should be the customer's, not Seasnoke's"** — Strongest cross-voice agreement in CEO. User confirmed: native CI integration over sandbox CI.

## Affected Files (Revised)

| File | Changes |
|---|---|
| `app/crates/seasnoke-worker/src/main.rs` | Semaphore[6], `tenant_id` in UPDATE[7] |
| `app/crates/seasnoke-api/src/routes/runs.rs` | Dedup guard[2], native CI poll[4], `spawn_blocking`[5], Drop guard[5], progress events |
| `app/ui/src/components/DiffModal.tsx` | Progress[1], PR card[1], freshness badge[3] |
| `app/ui/src/store.ts` | mergeProgress, prUrl, precheckFreshness |
| `app/docker-compose.yml` | `MAX_CONCURRENT_SANDBOXES` env var |

## GSTACK REVIEW REPORT — DX Phase

### DX Scope: Developer-Tool Product
Seasnoke IS a developer tool (code review platform, API endpoints, worker internals). DX scope applies.

### DX Scorecard (8 Dimensions)

**1. Getting Started (TTHW): 7/10**
Running locally: `docker compose up` with 4 services. Postgres + Redis + API + Worker + UI. One command. The `MAX_CONCURRENT_SANDBOXES` env var is well-documented in the plan. No change to onboarding.

**2. API/CLI Design: 6/10** → GAP
`POST /api/runs/{id}/merge` body is `{ task_id, diff, yolo }`. The `yolo` boolean is a trap door — no confirmation dialog, admin gets merge power silently. The merge response is `{ success, message }` — message is a freeform string, not machine-parseable. No standard error format across endpoints (some return `{ error }`, some return `{ status, error }`).
**Auto-decided: Add structured response `{ success, pr_url, provider }` separate from message. Rejected: Freeform only (P1, completeness 8 vs 5).**

**3. Error Messages: 4/10** → GAP
Current: `[MERGE ERROR] Unknown error` (DiffModal.tsx:60). The API returns `{ error: "CI pre-checks must pass" }` (409) and `{ error: "Run not found" }` (404). No machine-readable error codes, no remediation hints. The plan adds error detail but doesn't specify format.
**Auto-decided: Standard error envelope `{ error: { code: string, message: string, remediation: string? } }`. Rejected: Freeform strings (P1, developer ergonomics).**

**4. Documentation: 3/10** → GAP but out of scope
README covers high-level architecture. No API reference, no OpenAPI spec, no environment variable docs. Not addressed in this plan. Flagged for TODOS.md.

**5. Upgrade Path: N/A** — No public release yet. V0.1.0 per CHANGELOG.

**6. Observability (Logs + Metrics): 5/10** → GAP
Worker has Prometheus metrics (`/metrics`). API has Prometheus metrics. Plan adds `seasnoke_active_sandboxes` gauge. Good. But no structured logging — merge errors are `{ error: "string" }` with no correlation ID, no request tracing. Not addressed.
**Auto-decided: Add `X-Request-ID` header propagation and include in error responses. Simple, high-value. Rejected: Full tracing (P3, pragmatic — OpenTelemetry is ocean, not lake).**

**7. Configuration: 8/10**
`MAX_CONCURRENT_SANDBOXES` is well-defined. Redis URL, database URL, API key all env-var-based. Consistent with existing patterns. PASS.

**8. Extensibility: 6/10**
The semaphore + Drop guard pattern is generic. Native CI polling is provider-abstracted (GitHub + GitLab). No plugin system, but none needed at this scale. PASS.

### DX Consensus Table

| Dimension | Score | Verdict |
|---|---|---|
| Getting Started | 7/10 | PASS |
| API/CLI Design | 6/10 | GAP — structured merge response |
| Error Messages | 4/10 | GAP — standard error envelope |
| Documentation | 3/10 | DEFERRED (not in scope) |
| Upgrade Path | N/A | N/A (pre-v1) |
| Observability | 5/10 | GAP — request ID propagation |
| Configuration | 8/10 | PASS |
| Extensibility | 6/10 | PASS |
| **Overall** | **5.6/10** | 4 gaps, 1 deferred |

### TTHW Assessment
Current: `docker compose up` → 5 minutes to running. Post-plan: unchanged. The new env var is additive, no breaking changes.

### DX Implementation Checklist
1. Structured merge response: `{ success, pr_url, provider }`
2. Standard error envelope: `{ error: { code, message, remediation? } }`
3. Request ID propagation: echo `X-Request-ID` in responses, log on errors
4. Document `MAX_CONCURRENT_SANDBOXES` in README

---

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | CEO | Run both dual voices | Mechanical | P6 | Always run Codex + Claude | Skip |
| 2 | CEO | Mode: SELECTIVE EXPANSION | Mechanical | P6 | /autoplan default | Others |
| 3 | CEO | Premises → user confirms | Deferred to user | Gate | Never auto-decided | N/A |
| 4 | CEO | Merge UX → slices first | Taste | P5 | 15-min PR link > 2-week streaming | Full streaming |
| 5 | CEO | CI → native integration | Mechanical | P3+P1 | Both voices agree; simpler, covers more | Sandbox CI |
| 6 | CEO | Scheduler → simple semaphore | Mechanical | P5 | Redis Lua can't enforce tenant quotas | Full Redis-Lua |
| 7 | CEO | Fix cross-tenant CI bug | Mechanical | P1 | Security; both voices flag | Defer |
| 8 | Design | Add all 5 merge progress states | Mechanical | P1 | Completeness (9/10 vs 6/10) | Show only success/fail |
| 9 | Design | Add empty/error warnings | Mechanical | P1 | Completeness | Defer |
| 10 | Design | Defer accessibility | Mechanical | P3 | Real impact minimal for dev tool | Add now |
| 11 | Eng | spawn_blocking for git ops | Mechanical | P1 | Prevents thread pool starvation | Keep blocking |
| 12 | Eng | structured merge response | Mechanical | P1 | Machine-parseable PR URL | Freeform string |
| 13 | DX | Standard error envelope | Mechanical | P1 | Developer ergonomics, completeness | Freeform strings |
| 14 | DX | Request ID propagation | Taste | P5 | Simple, high-value; not full tracing | Full OpenTelemetry |

---

## /autoplan Final Approval Gate

### Decisions Made: 14 total (13 auto-decided, 1 user-confirmed premise gate)

### Auto-Decided: 13 decisions (see audit trail above)

### User Challenges: none — both voices agreed on CI direction, user confirmed.

### Your Choices (taste decisions): 2

**Choice 1: Merge UX → user-visible slices first** (CEO, D4)
I recommend shipping the PR link (15 min) and merge debounce (5 min) before full streaming progress (2h). Full streaming from the start is also viable — just slower to deliver value.
→ If you pick full streaming: first user improvement ships in 2h instead of 20m.

**Choice 2: Request ID propagation** (DX, D14)
I recommend adding `X-Request-ID` echo (15 min). Full OpenTelemetry tracing is also viable — more diagnostic power but adds tracing infrastructure.
→ If you pick full tracing: do it in a follow-up plan. It's an ocean, not a lake.

### Review Scores

| Phase | Dual Voices | Consensus | Key Findings |
|---|---|---|---|
| CEO | Codex + Claude subagent | **5/6 confirmed** | Product framing off; CI should integrate; inverted order |
| Design | Skipped (UI scope too small) | N/A | 2 UI gaps (in plan), 1 deferred |
| Eng | Architecture-only | Sound given revised scope | Cross-tenant bug (CRITICAL), spawn_blocking needed |
| DX | Single-model | **5.6/10 overall** | API design + error messages are the gaps |

### Cross-Phase Themes

**"Ship user value incrementally"** — Flagged in CEO (both voices) and Design. The high-confidence fix: break F1 into 20-minute slices that each ship a visible improvement.

**"CI belongs to the customer, not Seasnoke"** — Strongest CEO consensus. User redirected the plan to native CI integration. Architecture confirms it's one API call away.

### Deferred to TODOS.md
- Accessibility (ARIA labels, focus trap) — deferred to post-v1 polish
- Full OpenTelemetry tracing — deferred to follow-up plan
- "Send feedback to agent" flow (alternative to hand-edited diffs) — product decision needed
- API documentation / OpenAPI spec — not in this plan's scope

### Approval Options

Plan file updated at `/home/sk/Projekts/Projekts-Seasnoke/plan-enterprise-merge-ci-scheduler.md` with full review report.
