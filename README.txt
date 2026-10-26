Launchpad Instructions

Overview:
- Local dashboard for starting, stopping, and opening projects.
- Express backend (`server.js`) on port 4000 + React/Vite frontend on port 4001.
- Frontend proxies `/api` to the backend.
- Projects are defined in `~/projects.yaml`.
- UI shows project cards with live port status, start/stop, and open.
- Side panel: occupied ports, available ports, copy helpers, and Cursor Prompt.
- Bottom of page: paste YAML to merge into `~/projects.yaml` (“Paste & Update YAML”).
- Top “Add New” button scrolls to that YAML paste area.
- Docker/compose projects start and stop from the UI without using Terminal or opening Docker Desktop yourself.

How to start the app:
1. Open a terminal and go to the project folder:
   cd ~/launchpad
2. Install dependencies if needed:
   npm install
3. Start both servers:
   npm run dev
4. Open the frontend in your browser:
   http://localhost:4001

Optional (separate processes):
- npm run server   → Express on :4000
- npm run client   → Vite on :4001

How to stop the app:
- If running in a terminal, press Ctrl+C to stop the dev process.
- If the backend or frontend were started separately, stop them individually.
- If the UI says “Express server not reachable on :4000”, restart with npm run dev (or npm run server).

How the system works:
- Frontend: src/App.jsx (project cards, side panel, YAML paste).
- Backend: server.js — /projects, /start/:name, /stop/:name, /status/:name, /progress/:name.
- Vite proxies /api to :4000 (long timeout so Docker cold starts can finish).
- Start commands auto-detect from package.json, docker-compose/compose.yml, or main.py when missing.
- Non-Docker start: spawn start_command, wait ~2s, check port.
- Non-Docker stop: lsof + kill -9 on configured ports.

Docker projects:
- Detected if start_command mentions docker, the project path has a compose file, or runtime: docker.
- Start preflight: docker info → if needed, open -a Docker and wait up to ~90s.
- Compose runs under an isolated project name (lp-<project>) so ghost container IDs from a crashed Docker Desktop don’t block Start.
- If Compose still hits “No such container”, Launchpad purges the stack and recreates it.
- Then polls the port up to ~60s.
- UI shows phases like “Starting Docker Desktop…”, “Waiting for Docker…”, “Repairing Docker stack…”.
- Failures use short human-readable messages (not raw docker.sock errors as the primary text).
- Stop: docker compose down --remove-orphans (lp- name + default dir name); fall back to port kill if needed.

projects.yaml fields:
- name, path, frontend_port, backend_port, description, pinned, start_command, url (optional), runtime (optional: docker)

Updating projects from the UI:
- Use side panel “Copy YAML Sample” / “Cursor Prompt” to get a template with free ports.
- Paste the entry into “Update YAML” at the bottom and click “Paste & Update YAML”.
- Matching names are updated; new names are appended to ~/projects.yaml.

Note:
- A valid ~/projects.yaml file is required for the app to show projects.
- Without that file, the dashboard will not display project entries (you can still paste YAML to create one via the API once the server can write the file).
