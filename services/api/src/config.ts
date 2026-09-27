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
  internationalSearchApiUrl: optional('INTERNATIONAL_SEARCH_API_URL'),
  agreementGeneratorUrl: optional('AGREEMENT_GENERATOR_URL')
};
