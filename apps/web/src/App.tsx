import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleDot,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Mail,
  MapPinned,
  Plus,
  RefreshCw,
  Search,
  Send,
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
  candidate_count?: number;
  new_count?: number;
  promoted_count?: number;
  created_at: string;
};

type ResearchCandidate = {
  id: string;
  provider_name: string;
  provider_type?: string | null;
  city?: string | null;
  country?: string | null;
  email?: string | null;
  website?: string | null;
  gate_decision?: string | null;
  gate_confidence?: number | null;
  lifecycle_status: string;
  evidence_count: number;
  contact_count: number;
  service_count: number;
  pricing_count: number;
};

type Campaign = {
  id: string;
  name: string;
  research_run_id?: string | null;
  status: string;
  target_count: number;
  ready_count: number;
  follow_up_count: number;
};

type QueueTarget = {
  id: string;
  campaign_id?: string;
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
  agreement_status?: string | null;
  agreement_url?: string | null;
  message_status?: string | null;
  next_follow_up_at?: string | null;
};

type CandidateDraft = {
  name: string;
  city: string;
  website: string;
  email: string;
  phone: string;
  sourceUrl: string;
  services: string[];
};

type ProviderTypeProfile = {
  id: string;
  label: string;
  requiredCapabilities: string[];
};

const nav = [
  ['Research', Search],
  ['Providers', Building2],
  ['Outreach', Mail],
  ['Pricing', Tags],
  ['Agreements', FileText],
  ['Evidence', ShieldCheck]
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
  const [providerProfiles, setProviderProfiles] = useState<ProviderTypeProfile[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [queue, setQueue] = useState<QueueTarget[]>([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const selectedRunRef = useRef('');
  const [candidates, setCandidates] = useState<ResearchCandidate[]>([]);
  const [prompt, setPrompt] = useState('Find dental providers in South Africa capable of comprehensive dental evaluations, bitewings, and panoramic radiographs. Exclude providers we already know or have already researched. Find usable contact information and prepare qualified targets for outreach.');
  const [providerType, setProviderType] = useState('dental');
  const [country, setCountry] = useState('South Africa');
  const [city, setCity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [candidateDraft, setCandidateDraft] = useState<CandidateDraft>({
    name: '', city: '', website: '', email: '', phone: '', sourceUrl: '', services: []
  });

  const selectedRun = runs.find((run) => run.id === selectedRunId) || null;
  const selectedCampaign = campaigns.find((campaign) => campaign.research_run_id === selectedRunId) || null;
  const selectedProfile = providerProfiles.find(
    (profile) => profile.id === (selectedRun?.provider_type || providerType)
  ) || null;

  async function refresh() {
    const [healthResponse, providerTypesResponse, runsResponse, campaignsResponse, queueResponse] = await Promise.all([
      fetch('/api/health').then((r) => r.json()).catch(() => null),
      fetch('/api/provider-types').then((r) => r.json()).catch(() => ({ providerTypes: [] })),
      fetch('/api/research-runs').then((r) => r.json()).catch(() => ({ runs: [] })),
      fetch('/api/campaigns').then((r) => r.json()).catch(() => ({ campaigns: [] })),
      fetch('/api/outreach/queue').then((r) => r.json()).catch(() => ({ targets: [] }))
    ]);

    setHealth(healthResponse);
    setProviderProfiles(providerTypesResponse.providerTypes ?? []);
    setRuns(runsResponse.runs ?? []);
    setCampaigns(campaignsResponse.campaigns ?? []);
    setQueue(queueResponse.targets ?? []);
    setSelectedRunId((current) => current || runsResponse.runs?.[0]?.id || '');
  }

  async function loadCandidates(runId: string) {
    if (!runId) {
      setCandidates([]);
      return;
    }
    const response = await fetch(`/api/research-runs/${runId}/candidates`);
    const body = await response.json().catch(() => ({}));
    if (selectedRunRef.current !== runId) return;
    if (!response.ok) {
      setNotice(body.error || 'Could not load provider candidates.');
      return;
    }
    setCandidates(body.candidates ?? []);
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    selectedRunRef.current = selectedRunId;
    void loadCandidates(selectedRunId);
  }, [selectedRunId]);

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

      setSelectedRunId(body.run?.id || '');
      setNotice('Research run created. Candidate ingestion and provider-gate review are ready.');
      await refresh();
    } catch {
      setNotice('The API is not reachable yet.');
    } finally {
      setSubmitting(false);
    }
  }


  async function ensureCampaignForSelectedRun(): Promise<Campaign | null> {
    if (!selectedRunId) return null;
    const existing = campaigns.find((campaign) => campaign.research_run_id === selectedRunId);
    if (existing) return existing;

    const response = await fetch(`/api/research-runs/${selectedRunId}/campaign`, { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.campaign) {
      setNotice(body.error || 'Could not create the campaign.');
      return null;
    }
    await refresh();
    return body.campaign as Campaign;
  }

  async function addCandidate(event: FormEvent) {
    event.preventDefault();
    if (!selectedRun || !candidateDraft.name.trim()) return;
    setBusyKey('candidate-add');
    setNotice('');

    const response = await fetch(`/api/research-runs/${selectedRun.id}/candidates`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: candidateDraft.name,
        city: candidateDraft.city || undefined,
        country: selectedRun.country || country,
        website: candidateDraft.website || undefined,
        email: candidateDraft.email || undefined,
        phone: candidateDraft.phone || undefined,
        sourceUrl: candidateDraft.sourceUrl || undefined,
        providerType: selectedRun.provider_type || providerType,
        services: candidateDraft.services
      })
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(body.error || 'Could not add the provider candidate.');
      setBusyKey('');
      return;
    }

    setCandidateDraft({ name: '', city: '', website: '', email: '', phone: '', sourceUrl: '', services: [] });
    setNotice(`Candidate added and gated as ${body.gate?.decision || 'reviewed'}.`);
    await Promise.all([loadCandidates(selectedRun.id), refresh()]);
    setBusyKey('');
  }

  async function promoteCandidate(candidate: ResearchCandidate) {
    const campaign = await ensureCampaignForSelectedRun();
    if (!campaign) return;

    setBusyKey(candidate.id);
    setNotice('');
    const response = await fetch(`/api/research-candidates/${candidate.id}/promote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ campaignId: campaign.id, override: false })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(body.error || 'Could not promote the provider.');
      setBusyKey('');
      return;
    }

    setNotice(`${candidate.provider_name} moved into the outreach campaign.`);
    await Promise.all([loadCandidates(selectedRunId), refresh()]);
    setBusyKey('');
  }

  async function prepareTarget(target: QueueTarget) {
    setBusyKey(target.id);
    setNotice('');
    const response = await fetch(`/api/campaign-targets/${target.id}/prepare`, { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(body.error || 'Could not prepare the outreach target.');
      setBusyKey('');
      return;
    }

    setNotice(body.readyForExport
      ? `${target.facility_name} is ready for the Outlook export.`
      : `${target.facility_name} is prepared but waiting on the provider agreement.`
    );
    await refresh();
    setBusyKey('');
  }

  const readyCount = useMemo(
    () => queue.filter((item) => item.status === 'READY').length,
    [queue]
  );
  const followUpCount = useMemo(
    () => queue.filter((item) => item.status === 'NEED_FOLLOW_UP').length,
    [queue]
  );

  const newCandidateCount = useMemo(
    () => candidates.filter((item) => item.gate_decision === 'NEW').length,
    [candidates]
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

        {notice && <div className="notice global-notice">{notice}</div>}

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
                  {providerProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>{profile.label}</option>
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
              <p>Selected candidates</p>
              <strong>{candidates.length}</strong>
            </div>
          </article>
          <article>
            <span className="metric-icon"><CheckCircle2 size={19} /></span>
            <div>
              <p>New after gate</p>
              <strong>{newCandidateCount}</strong>
            </div>
          </article>
          <article>
            <span className="metric-icon"><LayoutDashboard size={19} /></span>
            <div>
              <p>Campaign targets</p>
              <strong>{selectedCampaign?.target_count ?? 0}</strong>
            </div>
          </article>
        </section>

        <section className="research-layout">
          <article className="panel run-browser">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Research</p>
                <h3>Runs</h3>
              </div>
              <button className="icon-button" onClick={() => void refresh()} title="Refresh">
                <RefreshCw size={15} />
              </button>
            </div>

            {runs.length === 0 ? (
              <div className="empty-state compact">
                <Search size={24} />
                <strong>No research runs yet</strong>
                <p>Create the first provider-development request above.</p>
              </div>
            ) : (
              <div className="run-list">
                {runs.map((run) => (
                  <button
                    className={selectedRunId === run.id ? 'run-row selected' : 'run-row'}
                    key={run.id}
                    onClick={() => setSelectedRunId(run.id)}
                  >
                    <div className="run-leading">
                      <span className="run-icon"><Search size={17} /></span>
                      <div>
                        <strong>{run.prompt}</strong>
                        <span>{[run.provider_type, run.city, run.country].filter(Boolean).join(' · ')}</span>
                        <small>{run.candidate_count ?? 0} candidates · {run.promoted_count ?? 0} promoted</small>
                      </div>
                    </div>
                    <StatusPill status={run.status} />
                  </button>
                ))}
              </div>
            )}
          </article>

          <article className="panel candidate-workspace">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Provider Gate</p>
                <h3>{selectedRun ? `${selectedRun.country || 'Research'} · candidate review` : 'Select a research run'}</h3>
              </div>
              {selectedRun && (
                <button className="ghost-button compact-button" onClick={() => void ensureCampaignForSelectedRun()}>
                  <Plus size={15} />
                  {selectedCampaign ? 'Campaign linked' : 'Create campaign'}
                </button>
              )}
            </div>

            {selectedRun ? (
              <>
                <form className="candidate-capture" onSubmit={addCandidate}>
                  <div className="candidate-capture-title">
                    <div>
                      <strong>Candidate intake</strong>
                      <span>Manual intake and automated research workers use the same provider gate.</span>
                    </div>
                    <button className="research-button mini" disabled={busyKey === 'candidate-add' || !candidateDraft.name.trim()}>
                      <Plus size={15} /> Add & gate
                    </button>
                  </div>
                  <div className="candidate-fields">
                    <input placeholder="Provider name" value={candidateDraft.name} onChange={(e) => setCandidateDraft({ ...candidateDraft, name: e.target.value })} />
                    <input placeholder="City" value={candidateDraft.city} onChange={(e) => setCandidateDraft({ ...candidateDraft, city: e.target.value })} />
                    <input placeholder="Website" value={candidateDraft.website} onChange={(e) => setCandidateDraft({ ...candidateDraft, website: e.target.value })} />
                    <input placeholder="Email" type="email" value={candidateDraft.email} onChange={(e) => setCandidateDraft({ ...candidateDraft, email: e.target.value })} />
                    <input placeholder="Phone" value={candidateDraft.phone} onChange={(e) => setCandidateDraft({ ...candidateDraft, phone: e.target.value })} />
                    <input placeholder="Source URL" value={candidateDraft.sourceUrl} onChange={(e) => setCandidateDraft({ ...candidateDraft, sourceUrl: e.target.value })} />
                  </div>
                  {selectedProfile && selectedProfile.requiredCapabilities.length > 0 && (
                    <div className="capability-checklist">
                      <span className="capability-label">Documented at this provider</span>
                      <div>
                        {selectedProfile.requiredCapabilities.map((capability) => {
                          const checked = candidateDraft.services.includes(capability);
                          return (
                            <label className="capability-option" key={capability}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => setCandidateDraft({
                                  ...candidateDraft,
                                  services: checked
                                    ? candidateDraft.services.filter((service) => service !== capability)
                                    : [...candidateDraft.services, capability]
                                })}
                              />
                              <span>{capability}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </form>

                <div className="candidate-list">
                  {candidates.length === 0 ? (
                    <div className="empty-state compact">
                      <Building2 size={24} />
                      <strong>No candidates in this run yet</strong>
                      <p>Research workers and manual intake both enter through this exact gate.</p>
                    </div>
                  ) : candidates.map((candidate) => {
                    const promotable = ['NEW', 'NEEDS_REVIEW'].includes(candidate.gate_decision || '')
                      && (!selectedProfile || candidate.service_count >= selectedProfile.requiredCapabilities.length);
                    return (
                      <div className="candidate-row" key={candidate.id}>
                        <div className="candidate-main">
                          <div className="candidate-title-line">
                            <strong>{candidate.provider_name}</strong>
                            <StatusPill status={candidate.gate_decision || 'PENDING'} />
                          </div>
                          <span>{[candidate.city, candidate.country].filter(Boolean).join(', ') || 'Location not captured'}</span>
                          <div className="candidate-contact-line">
                            {candidate.email && <span>{candidate.email}</span>}
                            {candidate.website && <a href={candidate.website} target="_blank" rel="noreferrer">website</a>}
                          </div>
                          <div className="evidence-chips">
                            <span>{candidate.evidence_count} evidence</span>
                            <span>{candidate.contact_count} contacts</span>
                            <span>{candidate.service_count} services</span>
                            <span>{candidate.pricing_count} prices</span>
                          </div>
                        </div>
                        <div className="candidate-actions">
                          <small>{Math.round((candidate.gate_confidence || 0) * 100)}% gate confidence</small>
                          {candidate.lifecycle_status === 'PROMOTED' ? (
                            <StatusPill status="PROMOTED" />
                          ) : (
                            <button
                              className="primary-button compact-button"
                              disabled={!promotable || busyKey === candidate.id}
                              onClick={() => void promoteCandidate(candidate)}
                            >
                              <ArrowRight size={14} /> Promote
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="empty-state"><Search size={24} /><strong>Select a research run</strong></div>
            )}
          </article>
        </section>

        <section className="panel outreach-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Execution queue</p>
              <h3>Outreach preparation</h3>
            </div>
            <div className="top-actions">
              <a className="primary-button link-button" href="/api/outreach/export.csv">
                <ArrowDownToLine size={15} /> Export Outlook CSV
              </a>
            </div>
          </div>

          <div className="queue-list">
            {queue.length === 0 ? (
              <div className="empty-state compact">
                <Mail size={24} />
                <strong>No outreach targets yet</strong>
                <p>Promote a qualified provider into the linked campaign first.</p>
              </div>
            ) : queue.slice(0, 10).map((item) => (
              <div className="queue-row" key={item.id}>
                <div>
                  <strong>{item.facility_name}</strong>
                  <span>{[item.city, item.country, item.primary_email].filter(Boolean).join(' · ')}</span>
                </div>
                <div className="queue-meta expanded">
                  <StatusPill status={item.psa_needed ? (item.agreement_status || 'NOT REQUESTED') : 'NOT REQUIRED'} />
                  <StatusPill status={item.message_status || 'NOT PREPARED'} />
                  <StatusPill status={item.status} />
                  <button
                    className="ghost-button compact-button"
                    disabled={busyKey === item.id || !item.primary_email}
                    onClick={() => void prepareTarget(item)}
                  >
                    <Send size={14} /> Prepare
                  </button>
                </div>
              </div>
            ))}
          </div>
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
