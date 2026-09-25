import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleDot,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Mail,
  MapPinned,
  Search,
  ShieldCheck,
  Sparkles,
  Tags,
  UsersRound
} from 'lucide-react';

type Health = {
  ok: boolean;
  databases: {
    operational: { configured: boolean; ok: boolean };
    research: { configured: boolean; ok: boolean };
  };
  adapters: Record<string, boolean>;
};

type ResearchRun = {
  id: string;
  prompt: string;
  provider_type?: string | null;
  country?: string | null;
  city?: string | null;
  status: string;
  created_at: string;
};

type QueueTarget = {
  id: string;
  campaign_name: string;
  facility_name: string;
  city?: string | null;
  country?: string | null;
  provider_type?: string | null;
  status: string;
  priority: string;
  owner: string;
  primary_contact?: string;
  primary_email?: string;
  pricing_requested: boolean;
  psa_needed: boolean;
  next_follow_up_at?: string | null;
};

const nav = [
  ['Research', Search],
  ['Providers', Building2],
  ['Outreach', Mail],
  ['Pricing', Tags],
  ['Agreements', FileText],
  ['Evidence', ShieldCheck]
] as const;

const providerTypes = [
  ['dental', 'Dental'],
  ['occupational_health', 'Occupational Health'],
  ['hospital', 'Hospital / Multispecialty'],
  ['laboratory', 'Laboratory'],
  ['cardiology', 'Cardiology'],
  ['vaccination', 'Vaccination / Travel Medicine'],
  ['imaging', 'Imaging'],
  ['audiology', 'Audiology']
] as const;

function StatusPill({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const tone =
    normalized.includes('READY') || normalized.includes('COMPLETE')
      ? 'good'
      : normalized.includes('HOLD') || normalized.includes('WAIT')
        ? 'warn'
        : normalized.includes('ERROR') || normalized.includes('BOUNCE')
          ? 'bad'
          : 'neutral';

  return <span className={`status-pill ${tone}`}>{status.replaceAll('_', ' ')}</span>;
}

function App() {
  const [activeNav, setActiveNav] = useState('Research');
  const [health, setHealth] = useState<Health | null>(null);
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [queue, setQueue] = useState<QueueTarget[]>([]);
  const [prompt, setPrompt] = useState('Find dental providers in South Africa capable of comprehensive dental evaluations, bitewings, and panoramic radiographs. Exclude providers we already know or have already researched. Find usable contact information and prepare qualified targets for outreach.');
  const [providerType, setProviderType] = useState('dental');
  const [country, setCountry] = useState('South Africa');
  const [city, setCity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');

  async function refresh() {
    const [healthResponse, runsResponse, queueResponse] = await Promise.all([
      fetch('/api/health').then((r) => r.json()).catch(() => null),
      fetch('/api/research-runs').then((r) => r.json()).catch(() => ({ runs: [] })),
      fetch('/api/outreach/queue').then((r) => r.json()).catch(() => ({ targets: [] }))
    ]);

    setHealth(healthResponse);
    setRuns(runsResponse.runs ?? []);
    setQueue(queueResponse.targets ?? []);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function startResearch(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setNotice('');

    try {
      const response = await fetch('/api/research-runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt,
          providerType,
          country,
          city: city || undefined,
          requestedBy: 'Alex'
        })
      });

      const body = await response.json();
      if (!response.ok) {
        setNotice(body.error || 'Could not create the research run.');
        return;
      }

      setNotice('Research run queued. The research worker is the next build slice.');
      await refresh();
    } catch {
      setNotice('The API is not reachable yet.');
    } finally {
      setSubmitting(false);
    }
  }

  const readyCount = useMemo(
    () => queue.filter((item) => item.status === 'READY').length,
    [queue]
  );
  const followUpCount = useMemo(
    () => queue.filter((item) => item.status === 'NEED_FOLLOW_UP').length,
    [queue]
  );

  const operationalReady = Boolean(health?.databases.operational.ok);
  const researchReady = Boolean(health?.databases.research.ok);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">OM</div>
          <div>
            <strong>Occu-Med</strong>
            <span>Network Outreach</span>
          </div>
        </div>

        <nav>
          {nav.map(([label, Icon]) => (
            <button
              key={label}
              className={activeNav === label ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveNav(label)}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="connection-row">
            <span className={operationalReady ? 'connection-dot live' : 'connection-dot'} />
            Operational data
          </div>
          <div className="connection-row">
            <span className={researchReady ? 'connection-dot live' : 'connection-dot'} />
            Research workspace
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Provider network development</p>
            <h1>{activeNav}</h1>
          </div>
          <div className="top-actions">
            <button className="ghost-button">
              <MapPinned size={17} />
              Existing Network
            </button>
            <button className="primary-button">
              <Mail size={17} />
              Outreach Queue
              {readyCount > 0 && <span className="button-count">{readyCount}</span>}
            </button>
          </div>
        </header>

        <section className="command-card">
          <div className="command-heading">
            <div className="spark-icon"><Sparkles size={20} /></div>
            <div>
              <p className="eyebrow">Start with the outcome</p>
              <h2>What providers do you need?</h2>
            </div>
          </div>

          <form onSubmit={startResearch}>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              aria-label="Provider research request"
            />

            <div className="form-grid">
              <label>
                <span>Provider type</span>
                <select value={providerType} onChange={(e) => setProviderType(e.target.value)}>
                  {providerTypes.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Country</span>
                <input value={country} onChange={(e) => setCountry(e.target.value)} />
              </label>
              <label>
                <span>City / market <small>optional</small></span>
                <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="All markets" />
              </label>
              <button className="research-button" disabled={submitting || !prompt.trim()}>
                {submitting ? 'Queuing…' : 'Start research'}
                <ArrowRight size={18} />
              </button>
            </div>
          </form>

          {notice && <div className="notice">{notice}</div>}

          <div className="guardrails">
            <span><ShieldCheck size={16} /> Existing-network exclusion</span>
            <span><CircleDot size={16} /> Seen-before research check</span>
            <span><FileText size={16} /> Agreement routing</span>
            <span><Mail size={16} /> Outlook-ready queue</span>
          </div>
        </section>

        <section className="metrics">
          <article>
            <span className="metric-icon"><FlaskConical size={19} /></span>
            <div>
              <p>Research runs</p>
              <strong>{runs.length}</strong>
            </div>
          </article>
          <article>
            <span className="metric-icon"><UsersRound size={19} /></span>
            <div>
              <p>Queue targets</p>
              <strong>{queue.length}</strong>
            </div>
          </article>
          <article>
            <span className="metric-icon"><CheckCircle2 size={19} /></span>
            <div>
              <p>Ready for outreach</p>
              <strong>{readyCount}</strong>
            </div>
          </article>
          <article>
            <span className="metric-icon"><LayoutDashboard size={19} /></span>
            <div>
              <p>Follow-up due</p>
              <strong>{followUpCount}</strong>
            </div>
          </article>
        </section>

        <section className="workspace-grid">
          <article className="panel research-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Research</p>
                <h3>Recent runs</h3>
              </div>
              <button className="text-button" onClick={() => void refresh()}>Refresh</button>
            </div>

            {runs.length === 0 ? (
              <div className="empty-state">
                <Search size={24} />
                <strong>No research runs yet</strong>
                <p>Your first provider-development request will appear here.</p>
              </div>
            ) : (
              <div className="run-list">
                {runs.slice(0, 6).map((run) => (
                  <div className="run-row" key={run.id}>
                    <div className="run-leading">
                      <span className="run-icon"><Search size={17} /></span>
                      <div>
                        <strong>{run.prompt}</strong>
                        <span>{[run.provider_type, run.city, run.country].filter(Boolean).join(' · ')}</span>
                      </div>
                    </div>
                    <StatusPill status={run.status} />
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Pipeline</p>
                <h3>Outreach queue</h3>
              </div>
              <span className="small-muted">Top priority</span>
            </div>

            {queue.length === 0 ? (
              <div className="empty-state compact">
                <Mail size={24} />
                <strong>No outreach targets yet</strong>
                <p>Qualified research candidates will flow here after the provider gate.</p>
              </div>
            ) : (
              <div className="queue-list">
                {queue.slice(0, 7).map((item) => (
                  <div className="queue-row" key={item.id}>
                    <div>
                      <strong>{item.facility_name}</strong>
                      <span>{[item.city, item.country].filter(Boolean).join(', ')}</span>
                    </div>
                    <div className="queue-meta">
                      <span>{item.priority}</span>
                      <StatusPill status={item.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>

        <section className="panel foundation-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">System foundation</p>
              <h3>The workflow is locked to the full outreach lifecycle</h3>
            </div>
          </div>
          <div className="foundation-steps">
            {[
              ['1', 'Discover', 'Direct provider entities, not pages or directories.'],
              ['2', 'Verify', 'Services, contacts, pricing, ownership and source evidence.'],
              ['3', 'Gate', 'Existing network, seen-before research and outreach history.'],
              ['4', 'Prepare', 'Correct template, agreement and provider-specific message.'],
              ['5', 'Outreach', 'Review, Outlook batch, follow-up and provider onboarding.']
            ].map(([number, title, body]) => (
              <div className="foundation-step" key={number}>
                <span>{number}</span>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
