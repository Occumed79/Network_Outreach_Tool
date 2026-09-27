import 'dotenv/config';

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function csv(name: string): string[] {
  return (process.env[name] || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT || 8787),
  webOrigin: process.env.WEB_ORIGIN?.trim() || 'http://localhost:5173',
  databaseUrl: optional('DATABASE_URL'),
  researchDatabaseUrl: optional('DATABASE_URL_2'),
  networkMapApiUrl: optional('NETWORK_MAP_API_URL'),
  internationalSearchApiUrl: optional('INTERNATIONAL_SEARCH_API_URL'),
  agreementGeneratorUrl: optional('AGREEMENT_GENERATOR_URL'),

  researchSearchProviders: csv('RESEARCH_SEARCH_PROVIDERS'),
  tavilyApiKey: optional('TAVILY_API_KEY'),
  exaApiKey: optional('EXA_API_KEY'),

  neonAiGatewayBaseUrl: optional('NEON_AI_GATEWAY_BASE_URL'),
  neonAiGatewayToken: optional('NEON_AI_GATEWAY_TOKEN'),
  openAiCompatBaseUrl: optional('OPENAI_COMPAT_BASE_URL'),
  openAiCompatApiKey: optional('OPENAI_COMPAT_API_KEY'),
  aiResearchModel: optional('AI_RESEARCH_MODEL')
};
