import 'dotenv/config';

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export const config = {
  port: Number(process.env.PORT || 8787),
  webOrigin: process.env.WEB_ORIGIN?.trim() || 'http://localhost:5173',
  publicBaseUrl: optional('PUBLIC_BASE_URL'),
  databaseUrl: optional('DATABASE_URL'),

  // Existing systems used by the outreach workflow.
  internationalSearchApiUrl: optional('INTERNATIONAL_SEARCH_API_URL'),
  agreementGeneratorUrl: optional('AGREEMENT_GENERATOR_URL'),

  // Network Map may send identified providers into Outreach through the
  // intake API. Outreach does not call Network Map to research providers.
  networkMapApiUrl: optional('NETWORK_MAP_API_URL')
};
