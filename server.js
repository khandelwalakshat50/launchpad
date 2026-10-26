import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync, openSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import { parse, stringify } from 'yaml';
import { spawn, execSync } from 'child_process';
import net from 'net';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const YAML_PATH = resolve(homedir(), 'projects.yaml');
const runningProcesses = {}; // name -> pid

function loadProjects() {
  const raw = readFileSync(YAML_PATH, 'utf8');
  return parse(raw).projects || [];
}

function saveProjects(projects) {
  writeFileSync(YAML_PATH, stringify({ projects }, { lineWidth: 0 }), 'utf8');
}

/** Accept full file, projects list, or a single project entry. */
function parseIncomingProjects(yamlText) {
  const trimmed = (yamlText || '').trim();
  if (!trimmed) throw new Error('YAML is empty');

  let parsed;
  try {
    parsed = parse(trimmed);
  } catch (err) {
    // Snippet may be a list item without a document root — wrap it
    try {
      parsed = parse(`projects:\n${trimmed}`);
    } catch {
      throw new Error(`Invalid YAML: ${err.message}`);
    }
  }

  if (Array.isArray(parsed)) return parsed;
  if (parsed?.projects) {
    if (Array.isArray(parsed.projects)) return parsed.projects;
    if (parsed.projects && typeof parsed.projects === 'object') return [parsed.projects];
  }
  if (parsed && typeof parsed === 'object' && parsed.name) return [parsed];

  throw new Error('YAML must be a project entry, a list of projects, or a full projects.yaml');
}

function expandPath(p) {
  if (!p) return null;
  return p.replace(/^~/, homedir());
}

/** Drop a leading `cd ... &&` so we can re-prefix with a safely quoted absolute path. */
function stripLeadingCd(cmd) {
  const trimmed = (cmd || '').trim();
  if (!/^cd\s+/i.test(trimmed)) return trimmed;
  const idx = trimmed.indexOf('&&');
  if (idx !== -1) return trimmed.slice(idx + 2).trim();
  return trimmed;
}

/** Build the shell command, always cd'ing via quoted absolute path when project.path is set. */
function buildStartCommand(project, port) {
  const absPath = expandPath(project.path);
  const custom = project.start_command?.trim();
  const detected = detectStartCommand(project.path, port);

  if (custom && absPath) {
    const rest = stripLeadingCd(custom);
    return rest ? `cd ${bashQuote(absPath)} && ${rest}` : `cd ${bashQuote(absPath)}`;
  }
  return custom || detected;
}

const SHELL_ENV = {
  ...process.env,
  PATH: `/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${process.env.PATH || ''}`,
};

const startProgress = {}; // name -> { phase, message, at }

function setProgress(name, phase, message) {
  startProgress[name] = { phase, message, at: Date.now() };
}

function clearProgress(name) {
  delete startProgress[name];
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function bashQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function runBashSync(cmd, timeoutMs = 15000) {
  try {
    const out = execSync(cmd, {
      encoding: 'utf8',
      env: SHELL_ENV,
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: '/bin/bash',
    });
    return { ok: true, out: (out || '').trim() };
  } catch (err) {
    const out = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n').trim();
    return { ok: false, out };
  }
}

function runBash(cmd, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-c', cmd], {
      env: SHELL_ENV,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      resolve({ ok: false, out: `${out.trim()}\nTimed out after ${Math.round(timeoutMs / 1000)}s` });
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, out: err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, out: out.trim(), code });
    });
  });
}

function composeFiles(abs) {
  return ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']
    .filter(f => existsSync(resolve(abs, f)));
}

function isDockerProject(project) {
  if (project.runtime === 'native') return false;
  if (project.runtime === 'docker') return true;
  const custom = (project.start_command || '').trim();
  if (custom) {
    const rest = stripLeadingCd(custom);
    // e.g. MySQL via compose + uvicorn/vite — not a compose-only stack
    if (/\b(uvicorn|npm run|node |python |\.venv\/|\.bin\/)/i.test(rest)) return false;
    if (/\bdocker\b/.test(rest) || rest.includes('docker-compose')) return true;
    return false;
  }
  const abs = expandPath(project.path);
  if (abs && composeFiles(abs).length > 0) return true;
  return false;
}

function isDockerReady() {
  return runBashSync('docker info', 10000).ok;
}

async function ensureDockerReady(name) {
  if (isDockerReady()) return { ok: true };

  setProgress(name, 'starting_docker', 'Starting Docker Desktop…');
  runBashSync('open -a Docker', 10000);

  setProgress(name, 'waiting_for_docker', 'Waiting for Docker…');
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    await sleep(2000);
    if (isDockerReady()) return { ok: true };
  }
  return {
    ok: false,
    error: 'Docker Desktop didn’t become ready in time. Open Docker Desktop and try again.',
  };
}

function friendlyDockerError(raw) {
  const t = (raw || '').toLowerCase();
  if (
    t.includes('docker.sock') ||
    t.includes('cannot connect to the docker daemon') ||
    t.includes('is the docker daemon running') ||
    t.includes('docker daemon')
  ) {
    return 'Docker isn’t available. Launchpad couldn’t connect to Docker Desktop.';
  }
  if (t.includes('permission denied')) {
    return 'Docker permission denied. Make sure Docker Desktop is running.';
  }
  if (t.includes('no such container') || t.includes('no such object')) {
    return 'Docker stack was in a bad state and couldn’t be repaired. Try Stop, then Start again.';
  }
  if (t.includes('port is already allocated') || t.includes('address already in use')) {
    return 'A port needed by this project is already in use.';
  }
  return null;
}

function isStaleComposeError(raw) {
  const t = (raw || '').toLowerCase();
  return (
    t.includes('no such container') ||
    t.includes('no such object') ||
    t.includes('conflict. the container name') ||
    t.includes('is already in use by container') ||
    t.includes('container name') && t.includes('already in use') ||
    t.includes('error while stopping') ||
    (t.includes('error response from daemon') && t.includes('container'))
  );
}

function composeProjectName(absPath, launchpadName) {
  const base = String(launchpadName || absPath.split('/').filter(Boolean).pop() || 'project')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';
  // Launchpad-owned project name avoids Docker Desktop ghost IDs from the default dir-based name
  return `lp-${base}`;
}

function defaultComposeProjectName(absPath) {
  return String(absPath).split('/').filter(Boolean).pop()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function composeBash(absPath, args, launchpadName) {
  const p = composeProjectName(absPath, launchpadName);
  return `cd ${bashQuote(absPath)} && docker compose -p ${bashQuote(p)} ${args}`;
}

/**
 * Tear down compose containers for this project.
 * Cleans Launchpad's -p name and the default directory-based name (ghost IDs).
 */
async function purgeComposeProject(absPath, launchpadName) {
  const logs = [];
  const names = new Set([
    composeProjectName(absPath, launchpadName),
    defaultComposeProjectName(absPath),
  ].filter(Boolean));

  for (const project of names) {
    const down = await runBash(
      `cd ${bashQuote(absPath)} && docker compose -p ${bashQuote(project)} down --remove-orphans`,
      90000,
    );
    if (down.out) logs.push(down.out);

    const purge = await runBash(
      `ids=$(docker ps -aq --filter "label=com.docker.compose.project=${project}" 2>/dev/null || true); ` +
      `if [ -n "$ids" ]; then docker rm -f $ids || true; fi`,
      60000,
    );
    if (purge.out) logs.push(purge.out);
  }

  await sleep(1000);
  return { out: logs.join('\n').trim() };
}

/** Start a compose stack under an isolated project name; recover if that stack goes stale. */
async function startDockerStack(name, absPath, preferredCmd) {
  const hasCompose = absPath && composeFiles(absPath).length > 0;
  const upCmd = hasCompose
    ? composeBash(absPath, 'up -d --remove-orphans', name)
    : preferredCmd;

  setProgress(name, 'starting', 'Starting containers…');
  console.log(`[start] ${name}: ${upCmd}`);
  let result = await runBash(upCmd, 120000);
  let logs = result.out || '';

  if (!result.ok && hasCompose && isStaleComposeError(result.out)) {
    setProgress(name, 'starting', 'Repairing Docker stack…');
    console.log(`[start] ${name}: stale compose state — purging and recreating`);
    const purged = await purgeComposeProject(absPath, name);
    if (purged.out) logs += (logs ? '\n' : '') + purged.out;

    setProgress(name, 'starting', 'Recreating containers…');
    result = await runBash(composeBash(absPath, 'up -d --remove-orphans', name), 180000);
    logs += (logs ? '\n' : '') + (result.out || '');
  }

  return { ...result, out: (result.out || logs).trim() };
}

function logTail(logPath, n = 8) {
  try {
    return readFileSync(logPath, 'utf8').split('\n').filter(Boolean).slice(-n).join('\n');
  } catch {
    return '';
  }
}

// TCP connection check — port is live if anything accepts the connection
function checkPort(port) {
  return new Promise((resolve) => {
    if (!port) return resolve('unknown');
    const socket = net.createConnection({ port, host: 'localhost' });
    socket.setTimeout(1000);
    socket.on('connect', () => { socket.destroy(); resolve('alive'); });
    socket.on('timeout', () => { socket.destroy(); resolve('dead'); });
    socket.on('error', () => resolve('dead'));
  });
}

async function waitForPort(port, timeoutMs, intervalMs = 2000) {
  if (!port) return 'unknown';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await checkPort(port)) === 'alive') return 'alive';
    await sleep(intervalMs);
  }
  return 'dead';
}

function killPorts(ports) {
  const killed = [];
  for (const port of ports) {
    try {
      const pids = execSync(`lsof -ti:${port}`, { encoding: 'utf8' })
        .split('\n').map(s => s.trim()).filter(Boolean);
      for (const p of pids) {
        try { execSync(`kill -9 ${p}`); killed.push(p); } catch {}
      }
    } catch {}
  }
  return killed;
}

// Auto-detect start command by inspecting project directory
function detectStartCommand(projectPath, port) {
  const abs = expandPath(projectPath);
  if (!abs) return null;

  if (composeFiles(abs).length > 0) {
    return `cd ${bashQuote(abs)} && docker compose up -d`;
  }
  if (existsSync(resolve(abs, 'package.json'))) {
    try {
      const pkg = JSON.parse(readFileSync(resolve(abs, 'package.json'), 'utf8'));
      if (pkg.scripts?.dev) {
        const portFlag = port ? ` -- --port ${port}` : '';
        return `cd ${bashQuote(abs)} && npm run dev${portFlag}`;
      }
      if (pkg.scripts?.start) return `cd ${bashQuote(abs)} && npm start`;
    } catch {}
  }
  if (existsSync(resolve(abs, 'main.py'))) {
    return `cd ${bashQuote(abs)} && uvicorn main:app --reload --port ${port || 8000}`;
  }
  return null;
}

app.get('/projects', (req, res) => {
  try {
    res.json(loadProjects());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/projects', (req, res) => {
  try {
    const incoming = parseIncomingProjects(req.body?.yaml);
    if (incoming.length === 0) {
      return res.status(400).json({ success: false, error: 'No projects found in YAML' });
    }
    for (const p of incoming) {
      if (!p?.name) {
        return res.status(400).json({ success: false, error: 'Each project needs a name' });
      }
    }

    let existing = [];
    try { existing = loadProjects(); } catch {
      existing = [];
    }

    const byName = new Map(existing.map(p => [p.name, p]));
    const added = [];
    const updated = [];
    for (const p of incoming) {
      if (byName.has(p.name)) updated.push(p.name);
      else added.push(p.name);
      byName.set(p.name, p);
    }

    const projects = [...byName.values()];
    saveProjects(projects);

    res.json({
      success: true,
      projects,
      added,
      updated,
      message: [
        added.length ? `Added: ${added.join(', ')}` : null,
        updated.length ? `Updated: ${updated.join(', ')}` : null,
      ].filter(Boolean).join(' · ') || 'No changes',
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/start/:name', async (req, res) => {
  let projects;
  try { projects = loadProjects(); }
  catch (err) { return res.status(500).json({ success: false, error: `Failed to read projects.yaml: ${err.message}` }); }

  const project = projects.find(p => p.name === req.params.name);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

  const port = project.frontend_port || project.backend_port;
  const docker = isDockerProject(project);

  // If already listening, don't re-spawn
  const already = await checkPort(port);
  if (already === 'alive') {
    return res.json({ success: true, status: 'alive', phase: 'alive', note: 'already running', docker });
  }

  const cmd = buildStartCommand(project, port);
  if (!cmd) {
    return res.status(400).json({ success: false, error: 'No start_command and could not auto-detect one' });
  }

  const absPath = expandPath(project.path);
  if (absPath && !existsSync(absPath)) {
    return res.status(400).json({ success: false, error: `Project path does not exist: ${absPath}` });
  }

  const logPath = `/tmp/launchpad-${project.name}.log`;
  const bothPorts = project.frontend_port && project.backend_port;

  try {
    if (docker) {
      const ready = await ensureDockerReady(project.name);
      if (!ready.ok) {
        clearProgress(project.name);
        return res.json({
          success: false,
          status: 'failed',
          phase: 'failed',
          error: ready.error,
          docker: true,
        });
      }
    }

    setProgress(project.name, 'starting', docker ? 'Starting containers…' : 'Starting…');
    console.log(`[start] ${project.name}: ${cmd}`);

    let cmdOut = '';
    let pid = null;

    if (docker) {
      const result = await startDockerStack(project.name, absPath, cmd);
      cmdOut = result.out;
      try { writeFileSync(logPath, cmdOut || ''); } catch {}
      if (!result.ok) {
        clearProgress(project.name);
        const friendly = friendlyDockerError(cmdOut);
        return res.json({
          success: false,
          status: 'failed',
          phase: 'failed',
          error: friendly || 'Docker start failed',
          detail: cmdOut || undefined,
          logPath,
          docker: true,
        });
      }
    } else {
      let logFd = null;
      try { logFd = openSync(logPath, 'w'); } catch {}
      const child = spawn('bash', ['-c', cmd], {
        detached: true,
        stdio: ['ignore', logFd ?? 'ignore', logFd ?? 'ignore'],
        env: SHELL_ENV,
      });
      child.on('error', (err) => console.error(`[spawn error] ${project.name}:`, err.message));
      child.unref();
      pid = child.pid;
      runningProcesses[project.name] = child.pid;
      console.log(`[start] ${project.name} PID ${child.pid} — log: ${logPath}`);
    }

    setProgress(project.name, 'starting', docker ? 'Waiting for service…' : 'Starting…');
    const waitMs = docker ? 60000 : (bothPorts ? 10000 : 2000);
    const status = docker
      ? await waitForPort(port, waitMs)
      : await waitForPort(port, waitMs);

    clearProgress(project.name);

    if (status === 'alive') {
      return res.json({
        success: true,
        status: 'alive',
        phase: 'alive',
        pid,
        docker,
      });
    }

    const tail = logTail(logPath) || cmdOut;
    const friendly = friendlyDockerError(tail);
    return res.json({
      success: false,
      status: 'dead',
      phase: 'failed',
      pid,
      error: friendly
        || (docker
          ? `Started but port :${port} not responding after ${Math.round(waitMs / 1000)}s`
          : 'Process started but port not responding after 2s'),
      detail: tail || undefined,
      logPath,
      docker,
    });
  } catch (err) {
    clearProgress(project.name);
    return res.status(500).json({
      success: false,
      status: 'failed',
      phase: 'failed',
      error: err.message,
      docker,
    });
  }
});

app.get('/progress/:name', (req, res) => {
  const p = startProgress[req.params.name];
  if (!p) return res.json({ phase: null, message: null });
  res.json(p);
});

app.post('/stop/:name', async (req, res) => {
  let projects;
  try { projects = loadProjects(); }
  catch (err) { return res.status(500).json({ success: false, error: err.message }); }

  const project = projects.find(p => p.name === req.params.name);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

  const ports = [project.frontend_port, project.backend_port].filter(Boolean);
  const absPath = expandPath(project.path);
  const docker = isDockerProject(project);

  if (docker && absPath && composeFiles(absPath).length > 0) {
    if (!isDockerReady()) {
      // Daemon down — fall back to port kill so UI can still clear local listeners
      const killed = killPorts(ports);
      delete runningProcesses[req.params.name];
      if (killed.length === 0) {
        return res.json({
          success: false,
          error: 'Docker isn’t running, and nothing was listening on the configured ports',
          docker: true,
        });
      }
      return res.json({ success: true, status: 'stopped', method: 'ports', killed, docker: true });
    }

    await purgeComposeProject(absPath, project.name);
    delete runningProcesses[req.params.name];
    killPorts(ports);
    return res.json({
      success: true,
      status: 'stopped',
      method: 'compose',
      docker: true,
    });
  }

  if (ports.length === 0) {
    return res.status(400).json({ success: false, error: 'No ports configured' });
  }

  const killed = killPorts(ports);
  delete runningProcesses[req.params.name];

  if (killed.length === 0) {
    return res.json({ success: false, error: 'Nothing was listening on the configured ports' });
  }
  res.json({ success: true, status: 'stopped', method: 'ports', killed });
});

app.get('/status/:name', async (req, res) => {
  let projects;
  try { projects = loadProjects(); }
  catch (err) { return res.status(500).json({ error: err.message }); }

  const project = projects.find(p => p.name === req.params.name);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const [frontendStatus, backendStatus] = await Promise.all([
    checkPort(project.frontend_port),
    checkPort(project.backend_port),
  ]);

  const progress = startProgress[project.name] || null;

  res.json({
    name: project.name,
    docker: isDockerProject(project),
    frontend: { port: project.frontend_port, status: frontendStatus },
    backend: { port: project.backend_port, status: backendStatus },
    progress,
  });
});

app.listen(4000, () => {
  console.log('Launchpad server running on http://localhost:4000');
});
