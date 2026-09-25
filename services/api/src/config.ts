import 'dotenv/config';

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export const config = {
  port: Number(process.env.PORT || 8787),
  webOrigin: process.env.WEB_ORIGIN?.trim() || 'http://localhost:5173',
  databaseUrl: optional('DATABASE_URL'),
  researchDatabaseUrl: optional('DATABASE_URL_2'),
  networkMapApiUrl: optional('NETWORK_MAP_API_URL'),
  internationalSearchApiUrl: optional('INTERNATIONAL_SEARCH_API_URL'),
  agreementGeneratorUrl: optional('AGREEMENT_GENERATOR_URL')
};
