import { useState, useEffect, useCallback, useRef } from 'react';

const API = '/api';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  pageBg:      '#F4F1EA',
  cardBg:      '#F8F6F0',
  cardLift:    '#FDFCF8',
  cardEdge:    'rgba(0, 51, 160, 0.18)',
  title:       '#0033A0',
  subtitle:    '#6A6762',
  sectionLbl:  '#0033A0',
  desc:        '#6A6762',
  name:        '#1A1A1B',
  live:        '#2E6BFF',
  liveGlow:    'rgba(0, 51, 160, 0.35)',
  dead:        '#6A6762',
  danger:      '#E63946',
  pinText:     '#E0462E',
  pinBg:       '#F4F1EA',
  pinBorder:   '#0033A0',
  btnFe:       { bg:'#F4F1EA', border:'#0033A0', color:'#0033A0' },
  btnBe:       { bg:'#F4F1EA', border:'#0033A0', color:'#0033A0' },
  btnOpen:     { bg:'#F4F1EA', border:'#0033A0', color:'#0033A0' },
  btnStart:    { bg:'#F4F1EA', border:'#0033A0', color:'#0033A0' },
  btnStop:     { bg:'#F4F1EA', border:'#E63946', color:'#E63946' },
  toastOk:     { bg:'#F4F1EA', border:'#0033A0', color:'#0033A0' },
  toastErr:    { bg:'#F4F1EA', border:'#E63946', color:'#E63946' },
  errBanner:   { bg:'#F4F1EA', border:'#E63946', color:'#E63946' },
  divider:     'rgba(0, 51, 160, 0.35)',
};

// ─── StatusMeta ───────────────────────────────────────────────────────────────
function StatusMeta({ label, status, port }) {
  const isAlive = status === 'alive';
  const isUnknown = !status || status === 'unknown';

  const dotStyle = {
    width: 7,
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
    ...(isAlive
      ? { background: C.live, color: C.live,
          animation: 'blink 1.8s ease-in-out infinite',
          boxShadow: `0 0 6px 1px ${C.liveGlow}` }
      : isUnknown
        ? { background: C.dead }
        : { background: C.danger }
    ),
  };

  return (
    <span style={{ display:'flex', alignItems:'center', gap:6,
      padding:'2px 8px', borderRadius:999,
      background: 'rgba(255, 255, 255, 0.5)',
      border: `0.5px solid ${isAlive ? 'rgba(46, 107, 255, 0.35)' : 'rgba(106, 103, 98, 0.35)'}`,
      opacity: 0.65,
    }}>
      <span style={dotStyle} />
      <span style={{ fontSize:10, fontWeight:500, letterSpacing:'0.02em',
        color: C.dead, fontFamily:'var(--font-sans)', textTransform:'uppercase' }}>
        {label}
      </span>
      <span style={{ fontSize:10, fontWeight:500, letterSpacing:'0.01em',
        color: isAlive ? C.live : isUnknown ? C.dead : C.danger,
        fontFamily:'var(--font-mono)' }}>
        :{port}
      </span>
    </span>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, type, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, type === 'error' ? 10000 : 5000);
    return () => clearTimeout(t);
  }, [onDismiss, type]);
  const t = type === 'error' ? C.toastErr : C.toastOk;
  return (
    <div style={{ marginTop:10, padding:'7px 12px', borderRadius:0,
      background:t.bg, border:`1px solid ${t.border}`, color:t.color,
      fontSize:11, fontWeight:600, display:'flex', justifyContent:'space-between',
      alignItems:'flex-start', gap:8, letterSpacing:'0.02em', whiteSpace:'pre-wrap' }}>
      <span style={{ flex:1 }}>{message}</span>
      <button onClick={onDismiss} style={{ background:'none', border:'none',
        color:'inherit', cursor:'pointer', fontSize:12, opacity:0.6, padding:0 }}>✕</button>
    </div>
  );
}

// ─── ProjectCard ──────────────────────────────────────────────────────────────
function ProjectCard({ project, index }) {
  const [status, setStatus]   = useState(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [phaseMsg, setPhaseMsg] = useState(null);
  const [toast, setToast]     = useState(null);
  const [hover, setHover]     = useState(false);
  const toastKey = useRef(0);

  const showToast = (message, type = 'ok') => {
    toastKey.current += 1;
    setToast({ message, type, key: toastKey.current });
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/status/${project.name}`);
      const data = await res.json();
      setStatus(data);
      if (data.progress?.message) setPhaseMsg(data.progress.message);
    } catch { setStatus(null); }
  }, [project.name]);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, starting ? 1000 : 5000);
    return () => clearInterval(id);
  }, [fetchStatus, starting]);

  const handleStart = async () => {
    setStarting(true);
    setPhaseMsg('Starting…');
    try {
      const res  = await fetch(`${API}/start/${project.name}`, { method:'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(data.note === 'already running' ? 'Already running' : 'Started', 'ok');
      } else {
        const msg = data.detail && data.error
          ? `${data.error}\n${data.detail.split('\n').slice(-3).join('\n')}`
          : (data.error || 'Start failed');
        showToast(msg, 'error');
      }
      fetchStatus();
    } catch (err) { showToast(`Network error: ${err.message}`, 'error'); }
    finally {
      setStarting(false);
      setPhaseMsg(null);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    try {
      const res  = await fetch(`${API}/stop/${project.name}`, { method:'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(data.method === 'compose' ? 'Compose stack stopped' : 'Stopped', 'ok');
      } else {
        showToast(data.error || 'Stop failed', 'error');
      }
      setTimeout(fetchStatus, 500);
    } catch (err) { showToast(`Network error: ${err.message}`, 'error'); }
    finally { setStopping(false); }
  };

  const bothPorts  = project.frontend_port && project.backend_port;
  const singlePort = !bothPorts && (project.frontend_port || project.backend_port);
  const isUrlOnly  = !project.frontend_port && !project.backend_port && project.url;
  const primaryUrl = project.url
    || (project.frontend_port ? `http://localhost:${project.frontend_port}` : null)
    || (singlePort ? `http://localhost:${singlePort}` : null);
  const isAlive    = status && (
    status.frontend?.status === 'alive' || status.backend?.status === 'alive'
  );
  const startLabel = starting
    ? (phaseMsg || status?.progress?.message || 'Starting…')
    : 'Start';

  return (
    <div
      className="card-enter"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: C.cardBg,
        border: `0.5px solid ${C.cardEdge}`,
        borderRadius: 14,
        padding: '22px 24px 20px',
        boxShadow: hover ? '0 10px 28px rgba(26, 26, 27, 0.05)' : '0 2px 10px rgba(26, 26, 27, 0.03)',
        transition: 'background-color 0.2s, box-shadow 0.2s',
        transform: 'none',
        backgroundColor: hover ? C.cardLift : C.cardBg,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        animationDelay: `${index * 0.05}s`,
        animationFillMode: 'both',
      }}
    >
      {/* Header row */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', flex:1, minWidth:0 }}>
          <button
            onClick={() => primaryUrl && window.open(primaryUrl, '_blank')}
            disabled={!primaryUrl}
            style={{
              fontSize:22,
              fontWeight:700,
              color:C.name,
              letterSpacing:'-0.2px',
              border:'none',
              background:'none',
              padding:0,
              textAlign:'left',
              cursor: primaryUrl ? 'pointer' : 'default',
              opacity: primaryUrl ? 1 : 0.8,
              lineHeight:1.15,
              fontFamily:'var(--font-serif)',
            }}
          >
            {project.name}
          </button>
          {project.pinned && (
            <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase',
              color:C.pinText, background:C.pinBg, border:`1px solid ${C.pinBorder}`,
              borderRadius:999, padding:'2px 7px', fontFamily:'var(--font-sans)' }}>
              ★ Pinned
            </span>
          )}
          {status?.docker && (
            <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase',
              color:C.desc, background:C.pinBg, border:`0.5px solid ${C.cardEdge}`,
              borderRadius:999, padding:'2px 7px', fontFamily:'var(--font-sans)' }}>
              Docker
            </span>
          )}
        </div>

        {project.start_command && isAlive && (
          <button
            onClick={handleStop}
            disabled={stopping}
            aria-label="Stop service"
            style={{
              border:'none',
              background:'none',
              color:C.danger,
              fontSize:13,
              lineHeight:1,
              cursor:'pointer',
              opacity:hover ? 0.9 : 0,
              transition:'opacity 0.2s',
              fontFamily:'var(--font-sans)',
            }}
          >
            {stopping ? '…' : 'x'}
          </button>
        )}
      </div>

      {/* Description */}
      {project.description && (
        <p style={{ fontSize:13, color:C.desc, lineHeight:1.65, marginBottom:16,
          fontWeight:400, maxWidth:460, fontFamily:'var(--font-sans)' }}>
          {project.description}
        </p>
      )}

      {/* Status / actions row */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginTop:'auto', paddingTop:8 }}>
        <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
          {project.frontend_port && status && (
            <StatusMeta label="fe" status={status.frontend?.status} port={project.frontend_port} />
          )}
          {project.backend_port && status && (
            <StatusMeta label="be" status={status.backend?.status} port={project.backend_port} />
          )}
          {isUrlOnly && (
            <span style={{ fontFamily:'var(--font-mono)', fontSize:10, opacity:0.6 }}>
              link
            </span>
          )}
        </div>

        {project.start_command && !isAlive && (
          <button
            onClick={handleStart}
            disabled={starting}
            style={{
              border:'none',
              background:'none',
              color:C.title,
              fontSize:12,
              fontFamily:'var(--font-sans)',
              letterSpacing:'0.04em',
              textTransform:'uppercase',
              cursor: starting ? 'wait' : 'pointer',
              padding:0,
              maxWidth: 160,
              textAlign: 'right',
            }}
          >
            {startLabel}
          </button>
        )}
      </div>

      {toast && (
        <Toast key={toast.key} message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}

// ─── SectionDivider ───────────────────────────────────────────────────────────
function SectionLabel({ label }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:18 }}>
      <span style={{ fontSize:10, fontWeight:800, letterSpacing:'0.25em', textTransform:'uppercase',
        color:C.sectionLbl, whiteSpace:'nowrap', fontFamily:'var(--font-sans)' }}>
        {label}
      </span>
      <div style={{ flex:1, height:1, background:C.divider }} />
    </div>
  );
}

// ─── Port helpers ─────────────────────────────────────────────────────────────
function nextFreePort(taken, start) {
  let port = start;
  while (taken.has(port)) port += 1;
  return port;
}

function buildSampleYaml(fe, be) {
  return `  - name: my-project
    path: ~/my-project
    frontend_port: ${fe}
    backend_port: ${be}
    description: "Short description"
    pinned: false
    start_command: "cd ~/my-project && npm run dev"`;
}

// ─── SidePanel ────────────────────────────────────────────────────────────────
function SidePanel({ projects }) {
  const [copied, setCopied] = useState(null); // 'yaml' | 'ports' | null

  const occupied = [];
  const taken = new Set();
  for (const p of projects) {
    if (p.frontend_port) {
      occupied.push({ port: p.frontend_port, name: p.name, kind: 'fe' });
      taken.add(p.frontend_port);
    }
    if (p.backend_port) {
      occupied.push({ port: p.backend_port, name: p.name, kind: 'be' });
      taken.add(p.backend_port);
    }
  }
  occupied.sort((a, b) => a.port - b.port);

  const freeFe = nextFreePort(taken, 5173);
  const freeBe = nextFreePort(new Set([...taken, freeFe]), 8000);
  const sampleYaml = buildSampleYaml(freeFe, freeBe);
  const portsPrompt = `These are the available ports:\nFrontend: ${freeFe}\nBackend: ${freeBe}`;
  const cursorPrompt = `${portsPrompt}

Change the ports to these and give me a YAML with following details populated about this project

YAML sample:
${sampleYaml}`;

  const copyText = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const labelStyle = {
    fontSize: 10, fontWeight: 800, letterSpacing: '0.25em', textTransform: 'uppercase',
    color: C.sectionLbl, fontFamily: 'var(--font-sans)', marginBottom: 14,
  };

  const copyBtnStyle = {
    border: 'none',
    background: 'none',
    color: C.title,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
  };

  return (
    <aside style={{
      width: 220,
      flex: '0 0 220px',
      position: 'sticky',
      top: 36,
      alignSelf: 'flex-start',
      display: 'flex',
      flexDirection: 'column',
      gap: 28,
    }}>
      <div>
        <div style={labelStyle}>Occupied Ports</div>
        {occupied.length === 0 ? (
          <p style={{ fontSize:12, color:C.desc, fontFamily:'var(--font-sans)' }}>None yet</p>
        ) : (
          <ul style={{ listStyle:'disc', paddingLeft:18, margin:0,
            display:'flex', flexDirection:'column', gap:6 }}>
            {occupied.map(({ port, name, kind }) => (
              <li key={`${name}-${kind}-${port}`} style={{
                fontSize:12, color:C.name, fontFamily:'var(--font-mono)', lineHeight:1.4,
              }}>
                <span style={{ fontWeight:600 }}>{port}</span>
                <span style={{ color:C.desc, fontFamily:'var(--font-sans)', fontSize:11 }}>
                  {' '}· {name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between',
          gap:8, marginBottom:14 }}>
          <div style={{ ...labelStyle, marginBottom:0 }}>Available Ports</div>
          <button
            onClick={() => copyText(portsPrompt, 'ports')}
            style={copyBtnStyle}
          >
            {copied === 'ports' ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <ul style={{ listStyle:'disc', paddingLeft:18, margin:0,
          display:'flex', flexDirection:'column', gap:8 }}>
          <li style={{ fontSize:12, color:C.name, fontFamily:'var(--font-mono)', lineHeight:1.4 }}>
            <span style={{ fontWeight:600 }}>{freeFe}</span>
            <span style={{ color:C.desc, fontFamily:'var(--font-sans)', fontSize:11 }}>
              {' '}· frontend
            </span>
          </li>
          <li style={{ fontSize:12, color:C.name, fontFamily:'var(--font-mono)', lineHeight:1.4 }}>
            <span style={{ fontWeight:600 }}>{freeBe}</span>
            <span style={{ color:C.desc, fontFamily:'var(--font-sans)', fontSize:11 }}>
              {' '}· backend
            </span>
          </li>
        </ul>
      </div>

      <div>
        <div style={{ ...labelStyle, marginBottom:12 }}>YAML Sample</div>
        <button
          onClick={() => copyText(sampleYaml, 'yaml')}
          style={{
            width: '100%',
            padding: '9px 12px',
            background: C.cardBg,
            border: `0.5px solid ${C.cardEdge}`,
            borderRadius: 8,
            color: C.title,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer',
          }}
        >
          {copied === 'yaml' ? 'Copied!' : 'Copy YAML Sample'}
        </button>
      </div>

      <div>
        <button
          onClick={() => copyText(cursorPrompt, 'cursor')}
          style={{
            width: '100%',
            padding: '9px 12px',
            background: C.title,
            border: `0.5px solid ${C.title}`,
            borderRadius: 8,
            color: '#FDFCF8',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer',
          }}
        >
          {copied === 'cursor' ? 'Copied!' : 'Cursor Prompt'}
        </button>
      </div>
    </aside>
  );
}

// ─── YamlPaste ────────────────────────────────────────────────────────────────
function YamlPaste({ onUpdated }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const handleSubmit = async () => {
    if (!text.trim()) {
      setResult({ type: 'error', message: 'Paste a YAML project entry first' });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`${API}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml: text }),
      });
      const raw = await res.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        setResult({
          type: 'error',
          message: res.status === 404
            ? 'API not found — restart Launchpad (npm run dev) so the new endpoint loads'
            : `Server returned non-JSON (${res.status}). Is Express running on :4000?`,
        });
        return;
      }
      if (!res.ok || !data.success) {
        setResult({ type: 'error', message: data.error || 'Update failed' });
        return;
      }
      setResult({ type: 'ok', message: data.message || 'Updated projects.yaml' });
      setText('');
      onUpdated?.(data.projects);
    } catch (err) {
      setResult({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="add-yaml" style={{ marginTop:48, paddingTop:28, borderTop:`1px solid ${C.divider}` }}>
      <SectionLabel label="Update YAML" />
      <p style={{ fontSize:13, color:C.desc, fontFamily:'var(--font-sans)', marginBottom:14, maxWidth:560 }}>
        Paste a project entry (or full <code style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>projects.yaml</code>).
        Matching names are updated; new names are appended to <code style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>~/projects.yaml</code>.
      </p>
      <textarea
        id="yaml-paste"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={`  - name: my-project\n    path: ~/my-project\n    frontend_port: 5170\n    backend_port: 8000\n    description: "Short description"\n    pinned: false\n    start_command: "cd ~/my-project && npm run dev"`}
        spellCheck={false}
        rows={10}
        style={{
          width: '100%',
          resize: 'vertical',
          padding: '14px 16px',
          background: C.cardBg,
          border: `0.5px solid ${C.cardEdge}`,
          borderRadius: 10,
          color: C.name,
          fontSize: 12,
          lineHeight: 1.55,
          fontFamily: 'var(--font-mono)',
          outline: 'none',
          marginBottom: 12,
        }}
      />
      <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
        <button
          onClick={handleSubmit}
          disabled={busy}
          style={{
            padding: '10px 18px',
            background: C.title,
            border: `0.5px solid ${C.title}`,
            borderRadius: 8,
            color: '#FDFCF8',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-sans)',
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Updating…' : 'Paste & Update YAML'}
        </button>
        {result && (
          <span style={{
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'var(--font-sans)',
            color: result.type === 'error' ? C.danger : C.title,
          }}>
            {result.message}
          </span>
        )}
      </div>
    </section>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [projects, setProjects] = useState([]);
  const [error, setError]       = useState(null);

  const fetchProjects = useCallback(() => {
    fetch(`${API}/projects`)
      .then(r => { if (!r.ok) throw new Error(`Server returned ${r.status}`); return r.json(); })
      .then(setProjects)
      .catch(e => setError(
        e.message.includes('fetch') || e.message.includes('JSON')
          ? 'Express server not running — cd ~/launchpad && npm run dev'
          : e.message
      ));
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const pinned = projects.filter(p => p.pinned);
  const rest   = projects.filter(p => !p.pinned);

  return (
    <div style={{ color: '#1A1A1B' }}>
      <div style={{ display:'flex', gap:36, alignItems:'flex-start', flexWrap:'wrap' }}>
        <div style={{ flex:'1 1 560px', minWidth:0 }}>
          {/* ── Header ── */}
          <div style={{ marginBottom:40 }}>
            <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between',
              gap:14, marginBottom:4, flexWrap:'wrap' }}>
              <h1 style={{ fontSize:32, fontWeight:900, color:C.title, letterSpacing:'-1px',
                textTransform:'uppercase', lineHeight:1, fontFamily:'var(--font-serif)' }}>
                Launchpad
              </h1>
              <button
                onClick={() => {
                  const el = document.getElementById('add-yaml');
                  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  setTimeout(() => document.getElementById('yaml-paste')?.focus(), 400);
                }}
                style={{
                  padding: '8px 14px',
                  background: C.title,
                  border: `0.5px solid ${C.title}`,
                  borderRadius: 8,
                  color: '#FDFCF8',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-sans)',
                  cursor: 'pointer',
                }}
              >
                Add New
              </button>
            </div>
            <div style={{ height:2, width:56, borderRadius:999, background:'#E0462E' }} />
          </div>

          {error && (
            <div style={{ padding:'10px 16px', borderRadius:0, marginBottom:24,
              background:C.errBanner.bg, border:`2px solid ${C.errBanner.border}`,
              color:C.errBanner.color, fontSize:12, fontWeight:600 }}>
              ⚠ {error}
            </div>
          )}

          {pinned.length > 0 && (
            <section style={{ marginBottom:36 }}>
              <SectionLabel label="Pinned" />
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:22 }}>
                {pinned.map((p, i) => <ProjectCard key={p.name} project={p} index={i} />)}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section>
              <SectionLabel label="Projects" />
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:22 }}>
                {rest.map((p, i) => <ProjectCard key={p.name} project={p} index={i} />)}
              </div>
            </section>
          )}
        </div>

        <SidePanel projects={projects} />
      </div>

      <YamlPaste onUpdated={(next) => { setError(null); setProjects(next); }} />
    </div>
  );
}
