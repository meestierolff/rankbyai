/**
 * Development-only provider simulation, so the whole scan pipeline and UI can be exercised without
 * API keys or spend. It can never be active on Vercel (preview or production), and every scan made
 * with it is flagged `summary.mock = true` and labelled "Mock data" in the UI.
 */
export const isMockMode = () => process.env.RANKBYAI_MOCK_PROVIDERS === "1" && !process.env.VERCEL;
