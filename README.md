# Launchpad

**A local control panel for vibe-coded projects.**

If you build lots of small apps with Cursor (or any AI assistant), you probably have the same mess: ten repos, overlapping ports, three terminals, Docker Desktop you forgot to open, and a `projects.yaml` somewhere in your head. Launchpad is a single dashboard that reads one config file, shows what’s running, starts and stops projects from the UI, and hands your agent **ready-made prompts** with free ports and YAML templates.

Runs on your machine only. No cloud account required.

![Launchpad UI concept](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white)
![Node](https://img.shields.io/badge/Express-4000-000000?style=flat-square&logo=node.js&logoColor=white)
![Config](https://img.shields.io/badge/config-~/projects.yaml-0033A0?style=flat-square)

---

## Why Launchpad?

| Without Launchpad | With Launchpad |
|-------------------|----------------|
| “Which port was that app on?” | Occupied vs **available** ports in the sidebar |
| Edit YAML by hand after every new project | **Paste & Update YAML** from the browser |
| Vague Cursor prompts | **Cursor Prompt** button: ports + schema in one copy |
| `docker.sock` errors in the terminal | Docker preflight + readable status messages |
| Hunt for `lsof` / `kill` | **Start** / **Stop** on each project card |

Built for **macOS** (Docker Desktop integration uses `open -a Docker`). Linux may work for non-Docker projects with minor tweaks.

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/launchpad.git
cd launchpad
npm install
```

### 2. Create your project registry

Launchpad reads **`~/projects.yaml`** (in your home directory, not inside this repo):

```bash
cp projects.yaml.example ~/projects.yaml
```

Edit `~/projects.yaml` with your real paths, ports, and `start_command` values.

### 3. Run

```bash
npm run dev
```

Open **http://localhost:4001**

| Service | Port |
|---------|------|
| UI (Vite) | `4001` |
| API (Express) | `4000` |

Stop with `Ctrl+C`.

---

## Project card fields

```yaml
projects:
  - name: my-app              # unique id / API key
    path: ~/my-app              # folder (~ expanded)
    frontend_port: 5173
    backend_port: 8000
    description: "What this is"
    pinned: true                # show in Pinned section
    start_command: "npm run dev"
    url: null                   # optional: external link only (no ports)
    runtime: native             # optional: native | docker
```

| Field | Purpose |
|-------|---------|
| `name` | Display name; used when merging YAML updates |
| `path` | Project root on disk |
| `frontend_port` / `backend_port` | TCP health checks + stop targets |
| `start_command` | Shell command Launchpad runs on **Start** |
| `pinned` | Pin to top of dashboard |
| `url` | Open in browser when there are no local ports |
| `runtime` | `docker` = full compose workflow; `native` = never treat as compose-only |

If `start_command` is omitted, the server tries to detect from `package.json`, `docker-compose.yml`, or `main.py`.

**Paths with spaces:** set `path: ~/my folder` in YAML; Launchpad `cd`s using a quoted absolute path. Prefer simple folder names when you can.

---

## Cursor workflow (the vibe-coded loop)

1. Open Launchpad → sidebar shows **available** frontend (from `5173`) and backend (from `8000`) ports.
2. Click **Cursor Prompt** → paste into Cursor.
3. Cursor returns a `projects.yaml` snippet → paste at the bottom → **Paste & Update YAML**.
4. New card appears → **Start** when ready.

No more “use port 3000” when something else already lives there.

---

## Features

- **Pinned** and **Projects** sections from YAML
- Live **alive / dead** badges (TCP checks every few seconds)
- **Start** / **Stop** (process spawn or `docker compose down`)
- **Add New** scrolls to YAML paste area
- Side panel: occupied ports, available ports, copy helpers
- **Docker-aware starts**: daemon check, open Docker Desktop, wait, compose under `lp-<project>` name, recovery from stale containers
- Friendly errors instead of raw daemon socket dumps

---

## Docker projects

Treated as Docker when:

- `runtime: docker`, or
- `start_command` is **only** Docker/compose (no `uvicorn` / `npm run` / etc.), or
- No `start_command` and a `docker-compose.yml` exists in `path`

**MySQL-only compose + local API?** Use `runtime: native` and put `docker compose up -d` inside `start_command` alongside your app commands (see `make_it_count`-style setups).

---

## API (for contributors)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/projects` | List projects |
| `POST` | `/projects` | Merge YAML (`{ "yaml": "..." }`) |
| `GET` | `/status/:name` | Port status + progress |
| `GET` | `/progress/:name` | Start phase message |
| `POST` | `/start/:name` | Start project |
| `POST` | `/stop/:name` | Stop project |

Vite proxies `/api/*` → `http://localhost:4000`.

---

## Repo layout

```
launchpad/
├── server.js              # Express API
├── src/App.jsx            # Dashboard UI
├── projects.yaml.example  # Template → copy to ~/projects.yaml
├── vite.config.js
└── package.json
```

---

## Security

Launchpad is a **personal dev tool**:

- Binds to localhost in dev.
- **`start_command` runs arbitrary shell** on your machine — only add projects you trust.
- **`~/projects.yaml`** may contain paths to repos with secrets; don’t commit it to git (it lives outside this repo).

Do not expose the API on a network without authentication.

---

## Scripts

```bash
npm run dev      # API + UI together
npm run server   # Express only (:4000)
npm run client   # Vite only (:4001)
npm run build    # Production frontend build
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Express server not reachable on :4000` | Run `npm run dev` or `npm run server` |
| Empty dashboard | Create `~/projects.yaml` from `projects.yaml.example` |
| Docker name conflict | **Stop** the project in Launchpad, or `docker rm` the conflicting container |
| Start says port not ready | Wait and refresh; Docker apps can take up to ~60s |

---

## License

MIT — use it, fork it, adapt it for your own vibe-coded fleet.

---

## Credits

Built to tame local chaos while pair-programming with AI. If this saves you one port collision, it was worth it.
