export type OutreachStatus =
  | 'NOT_STARTED'
  | 'RESEARCHING'
  | 'READY'
  | 'CONTACTED'
  | 'WAITING_ON_PRICING'
  | 'WAITING_ON_PSA'
  | 'NEED_FOLLOW_UP'
  | 'READY_TO_USE'
  | 'NO_FIT'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'DECLINED'
  | 'BOUNCED';

export type GateDecision =
  | 'NEW'
  | 'EXISTING_NETWORK'
  | 'SEEN_BEFORE'
  | 'PREVIOUSLY_CONTACTED'
  | 'FOLLOW_UP_DUE'
  | 'ACTIVE_PROVIDER'
  | 'DECLINED'
  | 'DO_NOT_CONTACT'
  | 'DUPLICATE'
  | 'INTERMEDIARY'
  | 'CLOSED'
  | 'NEEDS_REVIEW';

export interface ProviderCandidate {
  name: string;
  country: string;
  city?: string | null;
  address?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  providerType?: string | null;
  sourceUrl?: string | null;
}

export interface GateResult {
  decision: GateDecision;
  confidence: number;
  reasons: string[];
  matchedFacilityId?: string;
  matchedExternalSource?: 'network-map' | 'international-search' | 'outreach';
}

export interface ProviderTypeProfile {
  id: string;
  label: string;
  agreementTemplateKey: string;
  emailTemplateKey: string;
  requiredCapabilities: string[];
  preferredContactRoles: string[];
  excludedEntityKinds: string[];
}

export const PROVIDER_TYPE_PROFILES: ProviderTypeProfile[] = [
  {
    id: 'dental',
    label: 'Dental',
    agreementTemplateKey: 'dental',
    emailTemplateKey: 'dental-initial',
    requiredCapabilities: ['Comprehensive dental examination', 'Bitewing radiographs', 'Panoramic radiograph'],
    preferredContactRoles: ['Practice Manager', 'Owner', 'Operations Manager', 'Corporate Accounts'],
    excludedEntityKinds: ['referral network', 'insurance network', 'third-party administrator']
  },
  {
    id: 'occupational_health',
    label: 'Occupational Health',
    agreementTemplateKey: 'overseas-medical',
    emailTemplateKey: 'medical-initial',
    requiredCapabilities: ['Physical examination'],
    preferredContactRoles: ['Occupational Health Manager', 'Operations Manager', 'Corporate Accounts', 'Provider Relations'],
    excludedEntityKinds: ['workers compensation network', 'third-party administrator', 'referral network']
  },
  {
    id: 'hospital',
    label: 'Hospital / Multispecialty',
    agreementTemplateKey: 'overseas-medical',
    emailTemplateKey: 'medical-initial',
    requiredCapabilities: [],
    preferredContactRoles: ['Business Development', 'Corporate Relations', 'Operations', 'International Business'],
    excludedEntityKinds: ['referral network']
  },
  {
    id: 'laboratory',
    label: 'Laboratory',
    agreementTemplateKey: 'overseas-medical',
    emailTemplateKey: 'lab-initial',
    requiredCapabilities: ['Specimen collection'],
    preferredContactRoles: ['Corporate Accounts', 'Lab Manager', 'Business Development'],
    excludedEntityKinds: ['lab ordering marketplace']
  },
  {
    id: 'cardiology',
    label: 'Cardiology',
    agreementTemplateKey: 'cardiovascular',
    emailTemplateKey: 'cardiology-initial',
    requiredCapabilities: [],
    preferredContactRoles: ['Practice Manager', 'Operations Manager', 'Business Development'],
    excludedEntityKinds: ['referral network']
  },
  {
    id: 'vaccination',
    label: 'Vaccination / Travel Medicine',
    agreementTemplateKey: 'overseas-medical',
    emailTemplateKey: 'vaccination-initial',
    requiredCapabilities: ['Vaccination'],
    preferredContactRoles: ['Clinic Manager', 'Travel Medicine Manager', 'Operations'],
    excludedEntityKinds: ['coupon site', 'directory']
  },
  {
    id: 'imaging',
    label: 'Imaging',
    agreementTemplateKey: 'overseas-medical',
    emailTemplateKey: 'imaging-initial',
    requiredCapabilities: [],
    preferredContactRoles: ['Center Manager', 'Operations Manager', 'Corporate Accounts'],
    excludedEntityKinds: ['referral network']
  },
  {
    id: 'audiology',
    label: 'Audiology',
    agreementTemplateKey: 'overseas-medical',
    emailTemplateKey: 'audiology-initial',
    requiredCapabilities: ['Pure-tone audiometry'],
    preferredContactRoles: ['Clinic Manager', 'Audiology Lead', 'Operations Manager'],
    excludedEntityKinds: ['hearing-aid directory']
  }
];

export function normalizeProviderName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(ltd|limited|llc|inc|incorporated|corp|corporation|pllc|pty|gmbh|sa|sarl)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePhone(value?: string | null): string {
  return (value ?? '').replace(/[^0-9+]/g, '');
}

export function extractDomain(value?: string | null): string {
  if (!value) return '';
  try {
    const prepared = value.includes('://') ? value : `https://${value}`;
    return new URL(prepared).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return value.toLowerCase().replace(/^www\./, '').split('/')[0] ?? '';
  }
}
