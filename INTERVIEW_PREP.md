# Launchpad — Interview Prep (AI Role)

Use this doc to talk about **Launchpad** as “one AI tool I geeked out about.”  
You built it yourself; it sits at the intersection of **local dev orchestration** and **AI-assisted coding (Cursor)**.

---

## 30-second pitch

> “I geeked out over building **Launchpad** — a personal dashboard that manages all my local projects and is designed specifically for how I work with **Cursor**. Instead of juggling terminals, Docker Desktop, and port conflicts every time I spin up a new app with an AI agent, I have one place to see what’s running, start/stop services, and copy structured prompts that tell Cursor exactly which ports to use and what YAML to write. It turned AI-assisted development from chaotic to repeatable.”

---

## 60–90 second story (STAR-friendly)

**Situation:** I run many local projects (React, FastAPI, Docker/n8n, etc.) and increasingly build new ones with Cursor. Every new project meant: find free ports, edit `~/projects.yaml`, fight Docker after a crash, and paste vague instructions into the agent.

**Task:** I wanted a single control plane — not another SaaS — that understood my machine and my AI workflow.

**Action:** I built Launchpad: Express API + React UI, config in `~/projects.yaml`, live port health checks, one-click start/stop (including Docker preflight), and a side panel that generates **Cursor-ready prompts** with available ports + YAML templates. I also added in-UI YAML paste so Cursor’s output can go straight back into the registry.

**Result:** New projects go from “idea in Cursor” to “registered, port-safe, runnable from a button” in minutes. Docker stacks recover from bad state automatically. The tool is small but it’s the glue between me and my AI coding agent.

---

## What Launchpad is (fundamentals)

| Concept | Detail |
|--------|--------|
| **Type** | Local-first dev dashboard / control plane |
| **Config** | `~/projects.yaml` — single source of truth for all projects |
| **Frontend** | React 18 + Vite on `:4001` |
| **Backend** | Node.js + Express on `:4000` |
| **Proxy** | Vite proxies `/api/*` → Express (long timeout for Docker cold starts) |
| **Users** | Just you (personal productivity tool) |
| **AI angle** | Optimized handoff to **Cursor** via structured prompts and YAML merge |

**Core capabilities:**
1. List projects (pinned + rest)
2. Poll port liveness (frontend/backend) every few seconds
3. Start / stop projects from the UI
4. Open project URL in browser
5. Show occupied vs available ports
6. Copy YAML sample, port list, or full **Cursor Prompt**
7. Paste YAML from Cursor → merge into `~/projects.yaml`

---

## Architecture

```
Browser (:4001)
    │
    ▼
Vite dev server  ──proxy /api──▶  Express (:4000)
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
              ~/projects.yaml    child_process      net (TCP)
              read/write         spawn / exec       port checks
                    │                 │
                    ▼                 ▼
              Project registry    bash, docker,
                                  npm, uvicorn…
```

**Data flow — Start (non-Docker):**
1. `POST /start/:name`
2. Read project from YAML
3. If port already alive → return “already running”
4. `spawn('bash', ['-c', start_command])` detached
5. Wait ~2s → TCP check on configured port
6. Return success/failure + log tail

**Data flow — Start (Docker):**
1. Detect Docker project (compose file, `docker` in command, or `runtime: docker`)
2. `docker info` → if fail, `open -a Docker` + poll up to ~90s
3. `docker compose -p lp-<project> up -d --remove-orphans`
4. On stale container errors → purge stack + retry
5. Poll port up to ~60s
6. Surface human-readable phases in UI (“Waiting for Docker…”, “Repairing Docker stack…”)

**Data flow — Cursor handoff:**
1. UI computes next free FE port (from 5173) and BE port (from 8000)
2. **Cursor Prompt** copies: available ports + instruction + YAML template
3. User pastes into Cursor → agent configures new project
4. User pastes result into **Paste & Update YAML** → `POST /projects` merges by `name`

---

## Tech stack

| Layer | Technology |
|-------|------------|
| UI | React 18, inline CSS design tokens |
| Build | Vite 5 |
| API | Express 4, CORS, JSON body (1MB limit) |
| Config I/O | `yaml` package — parse/stringify |
| Process mgmt | `child_process` (`spawn`, `execSync`) |
| Health | Node `net` — TCP connect to localhost:port |
| Docker | `docker compose` via bash, isolated project names `lp-*` |
| Dev | `concurrently` runs API + Vite together |

**Key files:**
- `server.js` — all API logic, Docker orchestration, YAML merge
- `src/App.jsx` — dashboard, side panel, YAML paste, project cards
- `vite.config.js` — API proxy with 180s timeout
- `~/projects.yaml` — live project registry

---

## API reference (speak confidently)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/projects` | Load all projects from YAML |
| `POST` | `/projects` | Merge pasted YAML (update by `name`, append if new) |
| `GET` | `/status/:name` | Port status + `docker` flag + `progress` |
| `GET` | `/progress/:name` | In-flight start phase |
| `POST` | `/start/:name` | Start project (Docker-aware) |
| `POST` | `/stop/:name` | Stop (compose down or port kill) |

---

## `projects.yaml` schema

```yaml
projects:
  - name: local-n8n
    path: ~/local n8n
    frontend_port: 5177
    backend_port: 8002
    description: "Locally hosted n8n via Docker"
    pinned: false
    start_command: "cd ~/local\\ n8n && docker compose up -d"
    # optional:
    url: "https://..."      # external link, no ports
    runtime: docker         # force Docker handling
```

**Auto-detection** (if `start_command` missing):
- `docker-compose.yml` → `docker compose up -d`
- `package.json` with `dev` script → `npm run dev`
- `main.py` → `uvicorn main:app --reload`

---

## Why this is an “AI tool” story (not just a dev tool)

Interviewers may ask: *“Launchpad isn’t an LLM — why is this relevant for an AI role?”*

**Strong answers:**

1. **Context engineering for agents**  
   The Cursor Prompt is deliberately structured: available ports, explicit instruction (“change the ports to these and give me YAML”), and a schema example. That reduces hallucinated ports and inconsistent config.

2. **Human–AI loop design**  
   Launchpad closes the loop: AI generates YAML → human pastes → system validates and persists → UI reflects new state. You designed the *interface* between agent and environment.

3. **Grounding AI in real constraints**  
   Ports, Docker state, and process lifecycle are machine facts. The tool grounds Cursor in what’s actually free and running on your laptop.

4. **Failure modes of AI-assisted dev**  
   You hit real issues (Docker ghost containers, Express dying, 503 proxy errors) and built resilience — same mindset as production AI systems: reliability, clear errors, retries.

5. **Personal AI ops**  
   As coding agents become default, developers need **local control planes**. Launchpad is your version of MLOps/dev-env ops at personal scale.

---

## Technical highlights to mention

1. **TCP port probing** — lightweight liveness without HTTP assumptions  
2. **Detached process spawn** — long-running dev servers survive API request  
3. **Docker preflight** — daemon readiness before compose  
4. **Isolated Compose project names (`lp-*`)** — avoids ghost container IDs after Docker Desktop crashes  
5. **Stale state recovery** — purge + recreate on “No such container”  
6. **Friendly error mapping** — `docker.sock` errors → user-readable messages  
7. **YAML merge API** — accepts snippet, list, or full file; wraps bare list items  
8. **Progress polling** — UI polls faster during start to show Docker phases  

---

## Challenges you solved (good “depth” stories)

| Problem | What happened | What you did |
|---------|---------------|--------------|
| Port collisions | New Cursor projects clashed with existing apps | Side panel computes next free ports; Cursor Prompt embeds them |
| Raw Docker errors | `docker.sock` dumped into UI | `friendlyDockerError()` maps to plain English |
| Ghost containers | `No such container: aaec134fc3f7` after Docker quit | Run compose under `lp-<project>`; purge + recreate on failure |
| API 503 | Vite up, Express down | Documented `npm run dev`; discussed LaunchAgent / single-process production serve |
| YAML from Cursor | Agents paste partial snippets | Server wraps `projects:\n` + merges by name |
| Slow Docker starts | 2s port check too short | 60s poll for Docker; 180s Vite proxy timeout |

---

## Design tradeoffs (shows maturity)

| Choice | Why | Tradeoff |
|--------|-----|----------|
| YAML file vs database | Simple, editable, git-friendly | No concurrent-write safety |
| TCP check vs HTTP health | Works for any service | Doesn’t verify app correctness |
| `spawn` vs PM2 | Minimal dependencies | No auto-restart on crash |
| Dev: Vite + Express | Fast iteration | Two processes to keep alive |
| Merge YAML in UI | Fast Cursor loop | Rewrites file (may drop comments) |
| `lp-*` compose names | Escapes corrupted default project state | Slightly different from manual `docker compose` in terminal |

---

## What you’d improve next (if asked)

- Serve production build from Express (single process, no 503 split-brain)
- macOS LaunchAgent / Dock app — no terminal to start Launchpad
- `runtime: docker` in YAML for all compose projects explicitly
- WebSocket for start progress instead of polling
- Port conflict detection before start (not just registry-based “available”)
- Optional auth if ever exposed beyond localhost

---

## Numbers you can cite (adjust to your reality)

- **~10+** projects in registry (launchpad, trackers, n8n, resume UI, etc.)
- **2 ports** tracked per project (FE/BE) where applicable
- **90s** max wait for Docker Desktop
- **60s** port poll for Docker cold start
- **5s** status poll interval (1s while starting)
- **0** manual terminal commands for routine project start/stop (goal state)

---

## Likely interview questions & answers

### 1. “What AI tool did you geek out about?”

**Answer:**  
“I geeked out building **Launchpad** — it’s not a foundation model, but it’s the control plane I built for how I actually use **Cursor**. It manages my local projects, tracks ports, starts Docker stacks, and generates structured prompts so Cursor knows exactly which ports are free and how to format `projects.yaml`. It made AI-assisted development feel repeatable instead of fragile.”

---

### 2. “Why did you build this instead of using an existing tool?”

**Answer:**  
“Tools like Docker Desktop, PM2, or Raycast solve pieces of the puzzle, but none of them know *my* project registry, *my* port map, and *my* Cursor workflow. I needed a single YAML-backed source of truth and a copy-paste contract between me and the agent. Building it took a weekend; using it saves time on every new project.”

---

### 3. “How does Launchpad interact with AI / Cursor specifically?”

**Answer:**  
“The side panel computes the next available frontend and backend ports from everything already in `projects.yaml`. One button copies a **Cursor Prompt** that says: these are the available ports, change the project to use them, and return YAML in this shape. After Cursor responds, I paste into **Paste & Update YAML**, which POSTs to the API and merges into the file. The agent never touches the filesystem directly — I stay in the loop, but friction drops sharply.”

---

### 4. “Walk me through the architecture.”

**Answer:**  
“React frontend on 4001, Express API on 4000, Vite proxies `/api`. The backend reads `~/projects.yaml`, exposes CRUD-ish project endpoints, and implements start/stop. For health, it opens a TCP socket to localhost on the configured port. For Docker, it checks `docker info`, opens Docker Desktop if needed, runs `docker compose` under an isolated project name, and polls until the port is alive. The frontend polls `/status` and shows live/dead badges and Docker progress messages.”

---

### 5. “How do you know if a project is ‘running’?”

**Answer:**  
“I use a TCP connection attempt to `localhost:port` with a 1s timeout. If something accepts the connection, the port is ‘alive’. It’s simpler than HTTP health checks and works for databases, APIs, and frontends alike. The limitation is it only tells you the port is open, not that the app logic is healthy.”

---

### 6. “What was the hardest technical problem?”

**Answer:**  
“Docker reliability after Docker Desktop quits unexpectedly. Compose kept referencing a ghost container ID and failed with ‘No such container’. I fixed it by running stacks under a dedicated Compose project name (`lp-local-n8n`), purging stale containers on failure, and avoiding `--force-recreate` on the broken ID. I also mapped low-level daemon errors to messages like ‘Starting Docker Desktop…’ so the UI stayed usable.”

---

### 7. “How do you handle errors from the AI agent?”

**Answer:**  
“Two layers: prevention and validation. Prevention — the Cursor Prompt includes explicit ports and a YAML template so the model has fewer degrees of freedom. Validation — the server parses YAML strictly, requires `name` on each project, and returns JSON errors the UI displays. If the API returns HTML (e.g. Express down), the client detects non-JSON and tells me to restart the server instead of showing a cryptic parse error.”

---

### 8. “Is this ‘agentic AI’?”

**Answer:**  
“Launchpad itself isn’t an autonomous agent — it’s **infrastructure for human–agent collaboration**. Cursor is the agent; Launchpad supplies grounded context, enforces constraints (ports, paths), and executes shell/Docker actions the agent shouldn’t run blindly. In AI product terms, it’s the **tooling layer** and **context layer** around the agent.”

---

### 9. “What would you do differently at scale / in production?”

**Answer:**  
“I’d add structured logging, idempotent start/stop, file locking on YAML writes, health endpoints beyond TCP, secrets management for start commands, and never expose this API without auth. I’d also move from polling to WebSockets for start progress. For a team, I’d replace `~/projects.yaml` with a small DB or shared config service.”

---

### 10. “How does this relate to AI product thinking?”

**Answer:**  
“Good AI products need: (1) **grounding** in real state, (2) **clear handoff formats** between user and model, (3) **action boundaries** — what the agent suggests vs what the system executes, and (4) **recoverable failures**. Launchpad is a case study in all four at personal scale.”

---

### 11. “What metrics would you track?”

**Answer:**  
“Time from ‘new project idea’ to ‘registered and running’, start success rate, Docker recovery rate, port collision incidents, Cursor prompt → successful YAML merge rate, and mean time to diagnose failures. Qualitatively, I stopped avoiding new experiments because setup friction dropped.”

---

### 12. “Security concerns?”

**Answer:**  
“The API runs on localhost and executes shell commands from YAML — that’s appropriate only for a personal machine. `start_command` is effectively arbitrary code execution. I’d never expose this without authentication. Path expansion uses `~` but doesn’t sandbox commands. For an interview: I understand this is a **trusted personal tool**, not a multi-tenant product.”

---

### 13. “Tell me about a failure and what you learned.”

**Answer:**  
“Users — me — kept seeing ‘Express server not reachable on :4000’ because Vite stayed up but Express died. I learned that dual-process dev setups need either one command (`npm run dev`) or a supervisor. It parallelled AI systems where the UI works but the backend tool server is down — you need health checks and clear error surfaces, which I added to the YAML paste flow.”

---

### 14. “If you had two more weeks?”

**Answer:**  
“Ship production mode: `vite build` + Express static serve on one port, add a macOS LaunchAgent so Launchpad starts on login, and add a ‘dry run’ that validates YAML and ports before merge. I’d also log every start/stop with timestamps for debugging.”

---

### 15. “Why should we care about this for an AI role?”

**Answer:**  
“AI roles aren’t only about training models — they’re about **shipping systems where models are useful**. Launchpad shows I think about context design, tool boundaries, failure modes, and the full loop from user intent → agent output → validated action. That’s the same muscle as building AI features in production.”

---

## Phrases that sound good in interviews

- “**Grounding** the agent in machine state (ports, processes)”
- “**Structured handoff** between human and model”
- “**Human-in-the-loop** execution for shell and Docker”
- “**Personal control plane** for AI-assisted development”
- “**Recoverable failures** with friendly error surfaces”
- “**Context engineering** over raw prompting”

---

## Demo flow (if they ask you to show it)

1. Open `http://localhost:4001`
2. Show pinned projects + live port badges (fe/be)
3. Side panel: occupied vs available ports
4. Click **Cursor Prompt** → show copied text structure
5. Scroll to **Paste & Update YAML** (or **Add New**)
6. Start a Docker project → mention “Waiting for Docker…” states
7. Stop → compose teardown

---

## One-line closers

- “It’s the missing layer between Cursor and my laptop.”
- “I optimized for the loop, not the model.”
- “Small tool, but it changed how often I start new experiments.”

---

*Good luck tomorrow — lead with the problem (chaos of AI + local dev), then the insight (grounded context + control plane), then the craft (Docker recovery, YAML merge, TCP health).*
