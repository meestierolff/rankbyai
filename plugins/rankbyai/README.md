# RankbyAI plugin

Connects your AI assistant to [RankbyAI](https://rankbyai.live), which checks whether ChatGPT, Perplexity, Gemini and Google Maps recommend a local business, point by point on a map grid, audits why, and builds copy-ready fixes.

The plugin contains:

- `.mcp.json`: the RankbyAI MCP server, `https://rankbyai.live/api/mcp` (remote, Streamable HTTP). The first time you use it, your client opens a RankbyAI sign-in (OAuth 2.1 with PKCE) and you approve it for your workspace. The plugin itself stores no keys.
- `skills/rankbyai/SKILL.md`: how to use the tools well: estimate before every paid run, read the results honestly, turn an audit into a fix plan, and stay inside Google's guidelines.

## What is sent where

Your assistant sends tool calls (business names, cities, keywords, scan and audit ids) to `https://rankbyai.live/api/mcp` over HTTPS, signed with the access token from your sign-in. RankbyAI runs the scans through official APIs (DataForSEO for Google Maps; OpenAI, Perplexity and Gemini for AI answers), on your own vendor keys or included credits. Tools that cost money return an estimate first and run only after you confirm. Nothing is sent anywhere else. See the [privacy policy](https://rankbyai.live/privacy).

## Install

- Claude Code: `claude plugin marketplace add meestierolff/rankbyai`, then `claude plugin install rankbyai@rankbyai`.
- Codex: `codex plugin marketplace add meestierolff/rankbyai`.
- Any MCP client: add `https://rankbyai.live/api/mcp` as a remote MCP server.

Documentation: [rankbyai.live/docs/api#mcp](https://rankbyai.live/docs/api#mcp). Support: [rankbyai.live/support](https://rankbyai.live/support).
