import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileSpreadsheet,
  FileText,
  Inbox,
  Layers3,
  LayoutDashboard,
  Mail,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Upload,
  UsersRound
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BorderBeam } from 'border-beam';
import Grainient from './components/reactbits/Grainient';
import Orb from './components/reactbits/Orb';
import Particles from './components/reactbits/Particles';
import WorldMap from './components/aceternity/WorldMap';

type Health = {
  ok: boolean;
  database: { configured: boolean; ok: boolean; latencyMs?: number };
  integrations: {
    existingNetworkExclusion: boolean;
    agreementGenerator: boolean;
    networkMapIntake: boolean;
  };
};

type Dashboard = {
  activeCampaigns: number;
  providersInOutreach: number;
  ready: number;
  sent: number;
  followUpDue: number;
  replies: number;
  bounced: number;
  needsReview: number;
};

type ProviderTypeProfile = {
  id: string;
  label: string;
};

type Campaign = {
  id: string;
  name: string;
  description?: string | null;
  provider_type?: string | null;
  country?: string | null;
  city?: string | null;
  owner: string;
  status: string;
  provider_count_expected?: number | null;
  target_count: number;
  ready_count: number;
  follow_up_count: number;
  waiting_psa_count?: number;
  excluded_count: number;
  review_count: number;
  sent_count: number;
  bounced_count: number;
  replied_count: number;
  created_at: string;
};

type CampaignDetail = Campaign & {
  not_started_count: number;
  error_count: number;
};

type CampaignImport = {
  id: string;
  source_type: string;
  file_name?: string | null;
  total_rows: number;
  accepted_rows: number;
  excluded_rows: number;
  review_rows: number;
  error_rows: number;
  created_at: string;
};

type Target = {
  id: string;
  campaign_id: string;
  facility_id: string;
  facility_name: string;
  city?: string | null;
  country?: string | null;
  provider_type?: string | null;
  status: string;
  gate_decision?: string | null;
  priority: string;
  pricing_requested: boolean;
  psa_needed: boolean;
  primary_contact?: string | null;
  contact_title?: string | null;
  primary_email?: string | null;
  agreement_id?: string | null;
  agreement_url?: string | null;
  agreement_status?: string | null;
  message_status?: string | null;
  sent_at?: string | null;
  replied_at?: string | null;
  bounced_at?: string | null;
  next_follow_up_at?: string | null;
};

type IntakeRow = {
  id: string;
  provider_name: string;
  city?: string | null;
  country?: string | null;
  email?: string | null;
  contact_name?: string | null;
  gate_decision?: string | null;
  disposition: string;
  error_message?: string | null;
  created_at: string;
};

const NAV = [
  ['Dashboard', LayoutDashboard],
  ['Campaigns', Layers3],
  ['Providers', UsersRound],
  ['Outreach Queue', Send],
  ['Agreements', FileText],
  ['Follow-Ups', Clock3]
] as const;

const STATUSES = [
  'NOT_STARTED',
  'READY',
  'CONTACTED',
  'WAITING_ON_PRICING',
  'WAITING_ON_PSA',
  'NEED_FOLLOW_UP',
  'READY_TO_USE',
  'NO_FIT',
  'ON_HOLD',
  'COMPLETED',
  'DECLINED',
  'BOUNCED'
] as const;

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function StatusPill({ status }: { status?: string | null }) {
  const value = status || 'NOT STARTED';
  const normalized = value.toUpperCase();
  const tone =
    normalized.includes('READY') || normalized.includes('COMPLETED') || normalized.includes('GENERATED')
      ? 'good'
      : normalized.includes('WAIT') || normalized.includes('FOLLOW') || normalized.includes('HOLD') || normalized.includes('REVIEW')
        ? 'warn'
        : normalized.includes('ERROR') || normalized.includes('BOUNCE') || normalized.includes('DECLINED') || normalized.includes('EXCLUDED')
          ? 'bad'
          : 'neutral';

  return <span className={`status-pill ${tone}`}>{value.replaceAll('_', ' ')}</span>;
}

function App() {
  const [activeNav, setActiveNav] = useState('Dashboard');
  const [health, setHealth] = useState<Health | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [providerTypes, setProviderTypes] = useState<ProviderTypeProfile[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [campaignDetail, setCampaignDetail] = useState<CampaignDetail | null>(null);
  const [imports, setImports] = useState<CampaignImport[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [intakeRows, setIntakeRows] = useState<IntakeRow[]>([]);
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  const [campaignDraft, setCampaignDraft] = useState({
    name: '',
    description: '',
    providerType: '',
    country: '',
    city: '',
    expectedProviders: ''
  });

  const [providerDraft, setProviderDraft] = useState({
    name: '',
    country: '',
    city: '',
    address: '',
    website: '',
    phone: '',
    email: '',
    contactName: '',
    contactTitle: '',
    providerType: '',
    priority: 'MEDIUM',
    notes: ''
  });

  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) || null;

  async function refreshTopLevel() {
    const [healthBody, dashboardBody, typesBody, campaignsBody] = await Promise.all([
      fetch('/api/health').then((r) => r.json()).catch(() => null),
      fetch('/api/dashboard').then((r) => r.json()).catch(() => null),
      fetch('/api/provider-types').then((r) => r.json()).catch(() => ({ providerTypes: [] })),
      fetch('/api/campaigns').then((r) => r.json()).catch(() => ({ campaigns: [] }))
    ]);

    setHealth(healthBody);
    setDashboard(dashboardBody);
    setProviderTypes(typesBody.providerTypes ?? []);
    setCampaigns(campaignsBody.campaigns ?? []);
    setCampaignDraft((current) => ({
      ...current,
      providerType: current.providerType || typesBody.providerTypes?.[0]?.id || ''
    }));
    setSelectedCampaignId((current) => current || campaignsBody.campaigns?.[0]?.id || '');
  }

  async function loadCampaign(campaignId: string) {
    if (!campaignId) {
      setCampaignDetail(null);
      setImports([]);
      setTargets([]);
      setIntakeRows([]);
      return;
    }

    const [detailResponse, targetsResponse, intakeResponse] = await Promise.all([
      fetch(`/api/campaigns/${campaignId}`),
      fetch(`/api/campaigns/${campaignId}/targets`),
      fetch(`/api/campaigns/${campaignId}/intake`)
    ]);

    const [detailBody, targetsBody, intakeBody] = await Promise.all([
      detailResponse.json().catch(() => ({})),
      targetsResponse.json().catch(() => ({})),
      intakeResponse.json().catch(() => ({}))
    ]);

    if (!detailResponse.ok) {
      setNotice(detailBody.error || 'Could not load the campaign.');
      return;
    }

    setCampaignDetail(detailBody.campaign);
    setImports(detailBody.imports ?? []);
    setTargets(targetsBody.targets ?? []);
    setIntakeRows(intakeBody.rows ?? []);
    setSelectedTargetIds([]);
  }

  useEffect(() => {
    void refreshTopLevel();
  }, []);

  useEffect(() => {
    void loadCampaign(selectedCampaignId);
  }, [selectedCampaignId]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [activeNav]);

  async function refreshCampaign() {
    await Promise.all([refreshTopLevel(), loadCampaign(selectedCampaignId)]);
  }

  async function createCampaign(event: FormEvent) {
    event.preventDefault();
    if (!campaignDraft.name.trim()) return;

    setBusy('campaign');
    setNotice('');

    try {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: campaignDraft.name,
          description: campaignDraft.description || undefined,
          providerType: campaignDraft.providerType || undefined,
          country: campaignDraft.country || undefined,
          city: campaignDraft.city || undefined,
          expectedProviders: campaignDraft.expectedProviders
            ? Number(campaignDraft.expectedProviders)
            : undefined,
          intakeSource: 'OUTREACH'
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(body.error || 'Could not create the campaign.');
        return;
      }

      setCampaignDraft({
        name: '',
        description: '',
        providerType: providerTypes[0]?.id || '',
        country: '',
        city: '',
        expectedProviders: ''
      });
      setSelectedCampaignId(body.campaign.id);
      setNotice(`${body.campaign.name} created. Add the provider list when ready.`);
      await refreshTopLevel();
    } finally {
      setBusy('');
    }
  }

  async function importCsv(file: File) {
    if (!selectedCampaignId) return;
    setBusy('import');
    setNotice('');

    try {
      const text = await file.text();
      const response = await fetch(
        `/api/campaigns/${selectedCampaignId}/import.csv?fileName=${encodeURIComponent(file.name)}&sourceType=CSV`,
        {
          method: 'POST',
          headers: { 'content-type': 'text/csv' },
          body: text
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(body.error || 'CSV import failed.');
        return;
      }

      setNotice(
        `Imported ${body.total} rows: ${body.accepted} accepted, ${body.excluded} excluded, ${body.review} need review, ${body.errors} errors.`
      );
      await refreshCampaign();
    } finally {
      setBusy('');
    }
  }

  async function addProvider(event: FormEvent) {
    event.preventDefault();
    if (!selectedCampaignId || !providerDraft.name.trim()) return;

    setBusy('provider');
    setNotice('');

    try {
      const response = await fetch(`/api/campaigns/${selectedCampaignId}/providers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceType: 'MANUAL',
          providers: [{
            ...providerDraft,
            country: providerDraft.country || selectedCampaign?.country || '',
            city: providerDraft.city || selectedCampaign?.city || undefined,
            providerType: providerDraft.providerType || selectedCampaign?.provider_type || undefined,
            psaNeeded: true
          }]
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(body.error || 'Could not add the provider.');
        return;
      }

      setProviderDraft({
        name: '',
        country: '',
        city: '',
        address: '',
        website: '',
        phone: '',
        email: '',
        contactName: '',
        contactTitle: '',
        providerType: '',
        priority: 'MEDIUM',
        notes: ''
      });
      setNotice(
        body.accepted
          ? 'Provider added to the outreach campaign.'
          : `Provider intake completed: ${body.excluded} excluded, ${body.review} need review.`
      );
      await refreshCampaign();
    } finally {
      setBusy('');
    }
  }

  async function prepareTargets(targetIds?: string[]) {
    if (!selectedCampaignId) return;

    setBusy('prepare');
    setNotice('');

    try {
      const response = await fetch(`/api/campaigns/${selectedCampaignId}/prepare`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targetIds: targetIds && targetIds.length > 0 ? targetIds : undefined
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(body.error || 'Could not prepare the campaign.');
        return;
      }

      setNotice(
        `Prepared ${body.attempted} providers: ${body.ready} ready for Outlook, ${body.waitingOnPsa} waiting on agreement, ${body.errors} errors.`
      );
      await refreshCampaign();
    } finally {
      setBusy('');
    }
  }

  async function updateTargetStatus(targetId: string, status: string) {
    setBusy(`status:${targetId}`);
    try {
      const response = await fetch(`/api/campaign-targets/${targetId}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(body.error || 'Could not update provider status.');
        return;
      }
      await refreshCampaign();
    } finally {
      setBusy('');
    }
  }

  const filteredTargets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return targets.filter((target) => {
      if (statusFilter !== 'ALL' && target.status !== statusFilter) return false;
      if (!query) return true;
      return [
        target.facility_name,
        target.city,
        target.country,
        target.primary_contact,
        target.primary_email
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [targets, search, statusFilter]);

  const readyCount = targets.filter((target) => target.status === 'READY').length;
  const missingEmailCount = targets.filter((target) => !target.primary_email).length;
  const waitingAgreementCount = targets.filter(
    (target) => target.psa_needed && target.agreement_status !== 'GENERATED'
  ).length;
  const generatedAgreementCount = targets.filter(
    (target) => target.psa_needed && target.agreement_status === 'GENERATED'
  ).length;
  const followUpCount = targets.filter((target) => target.status === 'NEED_FOLLOW_UP').length;
  const replyCount = targets.filter((target) => Boolean(target.replied_at)).length;
  const bouncedCount = targets.filter((target) => target.status === 'BOUNCED' || Boolean(target.bounced_at)).length;
  const contactableCount = targets.filter((target) => Boolean(target.primary_email)).length;

  const visibleTargets = filteredTargets.filter((target) => {
    if (activeNav === 'Agreements') return target.psa_needed;
    if (activeNav === 'Follow-Ups') return target.status === 'NEED_FOLLOW_UP';
    if (activeNav === 'Outreach Queue') {
      return ['NOT_STARTED', 'READY', 'WAITING_ON_PSA', 'ON_HOLD'].includes(target.status);
    }
    return true;
  });

  const allFilteredSelected =
    visibleTargets.length > 0
    && visibleTargets.every((target) => selectedTargetIds.includes(target.id));

  function toggleAllFiltered() {
    if (allFilteredSelected) {
      const visible = new Set(visibleTargets.map((target) => target.id));
      setSelectedTargetIds((current) => current.filter((id) => !visible.has(id)));
    } else {
      setSelectedTargetIds((current) => [
        ...new Set([...current, ...visibleTargets.map((target) => target.id)])
      ]);
    }
  }

  const workspaceMeta =
    activeNav === 'Providers'
      ? {
          kicker: 'Provider roster',
          title: 'Provider readiness',
          description: 'See every provider already handed into outreach, whether they are contactable, and what blocks the next action.',
          icon: UsersRound,
          tone: 'cyan',
          emptyTitle: 'No providers loaded',
          emptyBody: 'Open a campaign and import the provider list you already identified.'
        }
      : activeNav === 'Outreach Queue'
        ? {
            kicker: 'Execution queue',
            title: 'Prepare the next send',
            description: 'Resolve missing email or agreement blockers, prepare eligible providers, then export the ready queue to Outlook.',
            icon: Send,
            tone: 'blue',
            emptyTitle: 'Nothing is staged for outreach',
            emptyBody: 'Load providers into a campaign first. Eligible providers will appear here for preparation and export.'
          }
        : activeNav === 'Agreements'
          ? {
              kicker: 'PSA pipeline',
              title: 'Agreement readiness',
              description: 'Track every provider that requires a pricing/service agreement and whether a downloadable artifact is actually ready.',
              icon: FileText,
              tone: 'violet',
              emptyTitle: 'No agreements in this view',
              emptyBody: 'Providers that require an agreement will appear here once they are added to a campaign.'
            }
          : {
              kicker: 'Response desk',
              title: 'Follow-up worklist',
              description: 'Focus only on providers that need another touch, with reply and bounce signals visible before the next outreach action.',
              icon: Clock3,
              tone: 'rose',
              emptyTitle: 'No follow-ups are due',
              emptyBody: 'When a contacted provider reaches follow-up status, it will appear here instead of getting lost in the full roster.'
            };

  const WorkspaceIcon = workspaceMeta.icon;
  const workspaceMetrics =
    activeNav === 'Providers'
      ? [
          ['Providers', targets.length, UsersRound],
          ['Contactable', contactableCount, Mail],
          ['Ready', readyCount, CheckCircle2],
          ['Waiting agreement', waitingAgreementCount, FileText]
        ]
      : activeNav === 'Outreach Queue'
        ? [
            ['In queue', visibleTargets.length, Send],
            ['Ready for Outlook', readyCount, CheckCircle2],
            ['Missing email', missingEmailCount, Mail],
            ['Waiting agreement', waitingAgreementCount, FileText]
          ]
        : activeNav === 'Agreements'
          ? [
              ['Agreement required', targets.filter((target) => target.psa_needed).length, FileText],
              ['Generated', generatedAgreementCount, CheckCircle2],
              ['Waiting', waitingAgreementCount, Clock3],
              ['Ready for Outlook', readyCount, Send]
            ]
          : [
              ['Follow-up due', followUpCount, Clock3],
              ['Contactable', contactableCount, Mail],
              ['Replies', replyCount, Inbox],
              ['Bounced', bouncedCount, CircleAlert]
            ];

  const databaseReady = Boolean(health?.database?.ok);
  const campaignCountries = [...new Set(
    campaigns.map((campaign) => campaign.country).filter((country): country is string => Boolean(country))
  )];

  return (
    <div className="app-frame">
      <div className="vfx-backdrop" aria-hidden="true">
        <Grainient
          timeSpeed={0.11}
          colorBalance={-0.08}
          warpStrength={1.25}
          warpFrequency={4.2}
          warpSpeed={0.65}
          warpAmplitude={74}
          blendAngle={-18}
          blendSoftness={0.11}
          rotationAmount={260}
          noiseScale={1.35}
          grainAmount={0.035}
          grainScale={2.1}
          contrast={1.08}
          gamma={1.04}
          saturation={1.12}
          zoom={0.84}
          color1="#eff7ff"
          color2="#b9d8ff"
          color3="#efe4ff"
          lightMode
        />
      </div>
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
          {NAV.map(([label, Icon]) => (
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
            <span className={databaseReady ? 'connection-dot live' : 'connection-dot'} />
            Outreach database
          </div>
          <div className="connection-row">
            <span className={health?.integrations?.existingNetworkExclusion ? 'connection-dot live' : 'connection-dot'} />
            Exclusion source configured
          </div>
          <div className="connection-row">
            <span className={health?.integrations?.agreementGenerator ? 'connection-dot live' : 'connection-dot'} />
            Agreement generator configured
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">High-volume provider outreach</p>
            <h1>{activeNav}</h1>
          </div>
          <div className="top-actions">
            <button className="ghost-button" onClick={() => void refreshCampaign()}>
              <RefreshCw size={16} />
              Refresh
            </button>
            <button className="primary-button" onClick={() => setActiveNav('Campaigns')}>
              <Plus size={16} />
              New campaign
            </button>
          </div>
        </header>

        {notice && <div className="notice global-notice">{notice}</div>}

        {activeNav === 'Dashboard' && (
          <>
            <section className="hero-panel">
              <div className="hero-particles" aria-hidden="true">
                <Particles
                  particleCount={92}
                  particleSpread={8}
                  speed={0.055}
                  particleColors={['#ffffff', '#75cfff', '#b99cff']}
                  moveParticlesOnHover
                  particleHoverFactor={0.7}
                  alphaParticles
                  particleBaseSize={72}
                  sizeRandomness={0.72}
                  cameraDistance={20}
                  pixelRatio={1}
                />
              </div>
              <div className="hero-copy">
                <p className="eyebrow">Outreach operations</p>
                <h2>Move hundreds of providers from list to completed outreach.</h2>
                <p>
                  Import identified providers, automatically exclude the existing network,
                  prepare individualized agreements and messages, then push the ready queue to Outlook.
                </p>
                <div className="hero-action">
                  <BorderBeam
                    size="sm"
                    colorVariant="ocean"
                    theme="light"
                    strength={0.82}
                    borderRadius={14}
                  >
                    <button className="primary-button large" onClick={() => setActiveNav('Campaigns')}>
                      <Layers3 size={17} />
                      Start an outreach campaign
                    </button>
                  </BorderBeam>
                </div>
              </div>
              <div className="hero-orb-shell" aria-hidden="true">
                <div className="hero-orb-halo" />
                <Orb
                  hue={18}
                  hoverIntensity={0.42}
                  rotateOnHover
                  backgroundColor="#000000"
                />
              </div>
            </section>

            <section className="metrics metrics-eight">
              {([
                ['Active campaigns', dashboard?.activeCampaigns ?? 0, Layers3],
                ['Providers in outreach', dashboard?.providersInOutreach ?? 0, UsersRound],
                ['Ready for Outlook', dashboard?.ready ?? 0, CheckCircle2],
                ['Sent', dashboard?.sent ?? 0, Send],
                ['Replies', dashboard?.replies ?? 0, Mail],
                ['Follow-up due', dashboard?.followUpDue ?? 0, Clock3],
                ['Needs review', dashboard?.needsReview ?? 0, CircleAlert],
                ['Bounced', dashboard?.bounced ?? 0, Inbox]
              ] as Array<[string, number, LucideIcon]>).map(([label, value, Icon]) => (
                <article key={String(label)}>
                  <span className="metric-icon"><Icon size={18} /></span>
                  <div>
                    <p>{label}</p>
                    <strong>{number(value)}</strong>
                  </div>
                </article>
              ))}
            </section>

            {campaigns.length > 0 ? (
              <section className="global-visual-panel">
                <div className="global-visual-copy">
                  <p className="eyebrow">Global outreach</p>
                  <h3>Campaign footprint</h3>
                  <p>
                    {`${campaignCountries.length} countr${campaignCountries.length === 1 ? 'y' : 'ies'} represented across campaign records.`}
                  </p>
                  <div className="country-chips">
                    {campaignCountries.slice(0, 8).map((country) => (
                      <span key={country}>{country}</span>
                    ))}
                  </div>
                </div>
                <div className="global-visual-map">
                  <WorldMap />
                </div>
              </section>
            ) : (
              <section className="launch-sequence-panel">
                <div className="launch-sequence-copy">
                  <p className="eyebrow">Start here</p>
                  <h3>Turn an identified provider list into outreach.</h3>
                  <p>The app begins after discovery. Create the campaign, load the provider list, then prepare the records that are actually ready to send.</p>
                </div>
                <div className="launch-steps">
                  <button onClick={() => setActiveNav('Campaigns')}>
                    <span>01</span>
                    <Layers3 size={18} />
                    <strong>Create campaign</strong>
                    <small>Define the outreach batch.</small>
                  </button>
                  <button onClick={() => setActiveNav('Campaigns')}>
                    <span>02</span>
                    <Upload size={18} />
                    <strong>Load providers</strong>
                    <small>CSV, Network Map handoff, or manual.</small>
                  </button>
                  <button onClick={() => setActiveNav('Outreach Queue')}>
                    <span>03</span>
                    <Send size={18} />
                    <strong>Prepare + export</strong>
                    <small>Resolve blockers and send through Outlook.</small>
                  </button>
                </div>
              </section>
            )}

            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Campaigns</p>
                  <h3>Current outreach</h3>
                </div>
                <button className="text-button" onClick={() => setActiveNav('Campaigns')}>
                  View all <ChevronRight size={14} />
                </button>
              </div>

              <div className="campaign-grid">
                {campaigns.slice(0, 6).map((campaign) => (
                  <button
                    className="campaign-card"
                    key={campaign.id}
                    onClick={() => {
                      setSelectedCampaignId(campaign.id);
                      setActiveNav('Campaigns');
                    }}
                  >
                    <div className="campaign-card-top">
                      <div>
                        <strong>{campaign.name}</strong>
                        <span>{[campaign.provider_type, campaign.country].filter(Boolean).join(' · ') || 'Mixed provider campaign'}</span>
                      </div>
                      <StatusPill status={campaign.status} />
                    </div>
                    <div className="campaign-stats">
                      <span><b>{number(campaign.target_count)}</b> providers</span>
                      <span><b>{number(campaign.ready_count)}</b> ready</span>
                      <span><b>{number(campaign.sent_count)}</b> sent</span>
                      <span><b>{number(campaign.replied_count)}</b> replies</span>
                    </div>
                  </button>
                ))}
                {campaigns.length === 0 && (
                  <div className="empty-state">
                    <Layers3 size={25} />
                    <strong>No outreach campaigns yet</strong>
                    <p>Create a campaign, then import the provider list you already identified.</p>
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {activeNav === 'Campaigns' && (
          <section className="campaign-layout">
            <aside className="panel campaign-sidebar">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Campaigns</p>
                  <h3>{campaigns.length} total</h3>
                </div>
              </div>

              <div className="campaign-list">
                {campaigns.map((campaign) => (
                  <button
                    key={campaign.id}
                    className={selectedCampaignId === campaign.id ? 'campaign-list-item active' : 'campaign-list-item'}
                    onClick={() => setSelectedCampaignId(campaign.id)}
                  >
                    <div>
                      <strong>{campaign.name}</strong>
                      <span>{number(campaign.target_count)} providers · {number(campaign.ready_count)} ready</span>
                    </div>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>

              <form className="new-campaign-form" onSubmit={createCampaign}>
                <p className="eyebrow">New campaign</p>
                <input
                  placeholder="Campaign name"
                  value={campaignDraft.name}
                  onChange={(e) => setCampaignDraft({ ...campaignDraft, name: e.target.value })}
                />
                <select
                  value={campaignDraft.providerType}
                  onChange={(e) => setCampaignDraft({ ...campaignDraft, providerType: e.target.value })}
                >
                  <option value="">Mixed / unspecified</option>
                  {providerTypes.map((type) => (
                    <option key={type.id} value={type.id}>{type.label}</option>
                  ))}
                </select>
                <div className="split-inputs">
                  <input
                    placeholder="Country (optional)"
                    value={campaignDraft.country}
                    onChange={(e) => setCampaignDraft({ ...campaignDraft, country: e.target.value })}
                  />
                  <input
                    placeholder="City (optional)"
                    value={campaignDraft.city}
                    onChange={(e) => setCampaignDraft({ ...campaignDraft, city: e.target.value })}
                  />
                </div>
                <input
                  type="number"
                  min="1"
                  placeholder="Expected provider count"
                  value={campaignDraft.expectedProviders}
                  onChange={(e) => setCampaignDraft({ ...campaignDraft, expectedProviders: e.target.value })}
                />
                <textarea
                  className="compact-textarea"
                  placeholder="Campaign notes"
                  value={campaignDraft.description}
                  onChange={(e) => setCampaignDraft({ ...campaignDraft, description: e.target.value })}
                />
                <button className="primary-button full" disabled={busy === 'campaign' || !campaignDraft.name.trim()}>
                  <Plus size={15} />
                  Create campaign
                </button>
              </form>
            </aside>

            <div className="campaign-content">
              {campaignDetail ? (
                <>
                  <section className="campaign-header-card">
                    <div>
                      <p className="eyebrow">Active outreach campaign</p>
                      <h2>{campaignDetail.name}</h2>
                      <p>{campaignDetail.description || 'Provider outreach campaign'}</p>
                    </div>
                    <div className="campaign-header-actions">
                      <label className="upload-button">
                        <Upload size={16} />
                        {busy === 'import' ? 'Importing…' : 'Import CSV'}
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          disabled={busy === 'import'}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void importCsv(file);
                            e.currentTarget.value = '';
                          }}
                        />
                      </label>
                      <a className="ghost-button link-button" href="/api/intake/template.csv">
                        <FileSpreadsheet size={16} />
                        CSV template
                      </a>
                    </div>
                  </section>

                  <section className="campaign-kpis">
                    {[
                      ['Imported/eligible', campaignDetail.target_count],
                      ['Excluded', campaignDetail.excluded_count],
                      ['Needs review', campaignDetail.review_count],
                      ['Waiting agreement', campaignDetail.waiting_psa_count],
                      ['Ready', campaignDetail.ready_count],
                      ['Sent', campaignDetail.sent_count],
                      ['Replies', campaignDetail.replied_count],
                      ['Follow-up', campaignDetail.follow_up_count]
                    ].map(([label, value]) => (
                      <div key={String(label)}>
                        <span>{label}</span>
                        <strong>{number(value)}</strong>
                      </div>
                    ))}
                  </section>

                  <section className="panel intake-panel">
                    <div className="panel-header">
                      <div>
                        <p className="eyebrow">Provider intake</p>
                        <h3>Add providers you already identified</h3>
                      </div>
                      <span className="small-muted">CSV · Network Map handoff · manual</span>
                    </div>

                    <form className="provider-form" onSubmit={addProvider}>
                      <input
                        placeholder="Provider / facility name"
                        value={providerDraft.name}
                        onChange={(e) => setProviderDraft({ ...providerDraft, name: e.target.value })}
                      />
                      <input
                        placeholder={campaignDetail.country ? `Country defaults to ${campaignDetail.country}` : 'Country'}
                        value={providerDraft.country}
                        onChange={(e) => setProviderDraft({ ...providerDraft, country: e.target.value })}
                      />
                      <input
                        placeholder="City"
                        value={providerDraft.city}
                        onChange={(e) => setProviderDraft({ ...providerDraft, city: e.target.value })}
                      />
                      <input
                        placeholder="Email"
                        type="email"
                        value={providerDraft.email}
                        onChange={(e) => setProviderDraft({ ...providerDraft, email: e.target.value })}
                      />
                      <input
                        placeholder="Contact name"
                        value={providerDraft.contactName}
                        onChange={(e) => setProviderDraft({ ...providerDraft, contactName: e.target.value })}
                      />
                      <input
                        placeholder="Contact title"
                        value={providerDraft.contactTitle}
                        onChange={(e) => setProviderDraft({ ...providerDraft, contactTitle: e.target.value })}
                      />
                      <input
                        placeholder="Website"
                        value={providerDraft.website}
                        onChange={(e) => setProviderDraft({ ...providerDraft, website: e.target.value })}
                      />
                      <select
                        value={providerDraft.priority}
                        onChange={(e) => setProviderDraft({ ...providerDraft, priority: e.target.value })}
                      >
                        <option>LOW</option>
                        <option>MEDIUM</option>
                        <option>HIGH</option>
                        <option>URGENT</option>
                      </select>
                      <button className="primary-button" disabled={busy === 'provider' || !providerDraft.name.trim()}>
                        <Plus size={15} />
                        Add provider
                      </button>
                    </form>
                  </section>

                  <section className="panel">
                    <div className="panel-header">
                      <div>
                        <p className="eyebrow">Latest intake</p>
                        <h3>Exclusion and intake results</h3>
                      </div>
                      <span className="small-muted">{intakeRows.length} recent rows</span>
                    </div>
                    <div className="intake-list">
                      {intakeRows.slice(0, 8).map((row) => (
                        <div className="intake-row" key={row.id}>
                          <div>
                            <strong>{row.provider_name}</strong>
                            <span>{[row.city, row.country, row.email].filter(Boolean).join(' · ')}</span>
                          </div>
                          <div className="intake-row-status">
                            <StatusPill status={row.gate_decision} />
                            <StatusPill status={row.disposition} />
                          </div>
                        </div>
                      ))}
                      {intakeRows.length === 0 && (
                        <div className="empty-state compact">
                          <Upload size={24} />
                          <strong>No providers imported yet</strong>
                          <p>Import the provider list from Network Map/Excel or add a provider manually.</p>
                        </div>
                      )}
                    </div>
                  </section>
                </>
              ) : (
                <section className="panel campaign-empty-state">
                  <div className="campaign-empty-orb" aria-hidden="true">
                    <Orb hue={22} hoverIntensity={0.2} backgroundColor="#000000" />
                  </div>
                  <div className="campaign-empty-copy">
                    <p className="eyebrow">Campaign workspace</p>
                    <h2>Create the first outreach batch.</h2>
                    <p>The campaign holds provider intake, exclusion results, agreement preparation, queue readiness, and follow-up status in one place.</p>
                    <div className="campaign-empty-steps">
                      <span><b>1</b> Name the campaign</span>
                      <span><b>2</b> Import the provider list</span>
                      <span><b>3</b> Prepare eligible outreach</span>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </section>
        )}

        {['Providers', 'Outreach Queue', 'Agreements', 'Follow-Ups'].includes(activeNav) && (
          <>
            <section className={`workspace-context workspace-context-${workspaceMeta.tone}`}>
              <div className="workspace-context-icon"><WorkspaceIcon size={22} /></div>
              <div className="workspace-context-copy">
                <p className="eyebrow">{workspaceMeta.kicker}</p>
                <h2>{workspaceMeta.title}</h2>
                <p>{workspaceMeta.description}</p>
              </div>
              <div className="workspace-context-campaign">
                <span>Working campaign</span>
                <strong>{selectedCampaign?.name || 'None selected'}</strong>
                <small>{selectedCampaign ? `${number(selectedCampaign.target_count)} providers in batch` : 'Choose or create a campaign to begin'}</small>
              </div>
            </section>

            <section className="workspace-toolbar">
              <div>
                <label>
                  <span>Campaign</span>
                  <select
                    value={selectedCampaignId}
                    onChange={(e) => setSelectedCampaignId(e.target.value)}
                  >
                    <option value="">Choose campaign</option>
                    {campaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Status</span>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="ALL">All statuses</option>
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>
                    ))}
                  </select>
                </label>
                <label className="search-field">
                  <span>Find provider</span>
                  <input
                    placeholder="Name, city, email…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>

              <div className="toolbar-actions">
                {activeNav === 'Outreach Queue' && (
                  <>
                    <button
                      className="ghost-button"
                      disabled={!selectedCampaignId || busy === 'prepare'}
                      onClick={() => void prepareTargets(selectedTargetIds.length ? selectedTargetIds : undefined)}
                    >
                      <FileText size={15} />
                      {selectedTargetIds.length ? `Prepare ${selectedTargetIds.length}` : 'Prepare eligible'}
                    </button>
                    <a
                      className={selectedCampaignId ? 'primary-button link-button' : 'primary-button link-button disabled-link'}
                      href={selectedCampaignId ? `/api/outreach/export.csv?campaignId=${selectedCampaignId}` : '#'}
                    >
                      <ArrowDownToLine size={15} />
                      Export Outlook queue
                    </a>
                  </>
                )}
              </div>
            </section>

            <section className="metrics compact-metrics workspace-metrics">
              {(workspaceMetrics as Array<[string, number, LucideIcon]>).map(([label, value, Icon]) => (
                <article key={String(label)}>
                  <span className="metric-icon"><Icon size={18} /></span>
                  <div>
                    <p>{label}</p>
                    <strong>{number(value)}</strong>
                  </div>
                </article>
              ))}
            </section>

            <section className="panel table-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">{activeNav}</p>
                  <h3>{selectedCampaign?.name || 'Select a campaign'}</h3>
                </div>
                <span className="small-muted">{filteredTargets.length} shown</span>
              </div>

              <div className="provider-table-wrap">
                <table className="provider-table">
                  <thead>
                    <tr>
                      <th className="check-cell">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={toggleAllFiltered}
                        />
                      </th>
                      <th>Provider</th>
                      <th>Contact</th>
                      <th>Status</th>
                      <th>Agreement</th>
                      <th>Message</th>
                      <th>Priority</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTargets.map((target) => (
                        <tr key={target.id}>
                          <td className="check-cell">
                            <input
                              type="checkbox"
                              checked={selectedTargetIds.includes(target.id)}
                              onChange={() => setSelectedTargetIds((current) =>
                                current.includes(target.id)
                                  ? current.filter((id) => id !== target.id)
                                  : [...current, target.id]
                              )}
                            />
                          </td>
                          <td>
                            <strong>{target.facility_name}</strong>
                            <span>{[target.city, target.country].filter(Boolean).join(', ')}</span>
                          </td>
                          <td>
                            <strong>{target.primary_contact || 'No named contact'}</strong>
                            <span className={target.primary_email ? '' : 'attention-text'}>
                              {target.primary_email || 'Email required'}
                            </span>
                          </td>
                          <td>
                            <select
                              className="status-select"
                              value={target.status}
                              disabled={busy === `status:${target.id}`}
                              onChange={(e) => void updateTargetStatus(target.id, e.target.value)}
                            >
                              {STATUSES.map((status) => (
                                <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>
                              ))}
                            </select>
                          </td>
                          <td><StatusPill status={target.psa_needed ? (target.agreement_status || 'NOT PREPARED') : 'NOT REQUIRED'} /></td>
                          <td><StatusPill status={target.message_status || 'NOT PREPARED'} /></td>
                          <td><span className="priority-badge">{target.priority}</span></td>
                          <td className="row-action">
                            {activeNav === 'Outreach Queue' && (
                              <button
                                className="text-button"
                                disabled={!target.primary_email || busy === 'prepare'}
                                onClick={() => void prepareTargets([target.id])}
                              >
                                Prepare
                              </button>
                            )}
                            {activeNav === 'Agreements' && target.agreement_url && (
                              <a className="text-link" href={target.agreement_url}>Download</a>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>

                {visibleTargets.length === 0 && (
                  <div className="empty-state workspace-empty-state">
                    <div className="empty-state-icon"><Building2 size={24} /></div>
                    <strong>{workspaceMeta.emptyTitle}</strong>
                    <p>{workspaceMeta.emptyBody}</p>
                    <button className="ghost-button" onClick={() => setActiveNav('Campaigns')}>
                      <Layers3 size={15} />
                      Open campaign workspace
                    </button>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>
      </div>
    </div>
  );
}

export default App;
