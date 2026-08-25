# Multi-Agent Code Security Scanner

A multi-agent AI pipeline that scans source code and web pages for security vulnerabilities — using three specialized LLM agents instead of a single monolithic prompt.

## How it works

Instead of asking one LLM to "find security issues," this project splits the work across three agents that share a common memory object:

1. **Recon Agent** — parses local files or live web pages (via Cheerio) to extract entry points and risky code patterns
2. **Analysis Agent** — takes the recon agent's findings and evaluates them against known vulnerability patterns
3. **Reporting Agent** — synthesizes the analysis into a structured, human-readable report

Each agent uses a task-specific system prompt (via the Groq API), which produced more consistent output than a single general-purpose call.

## Why multi-agent?

A single LLM call trying to do recon + analysis + reporting in one prompt tends to produce shallow, inconsistent results. Splitting responsibilities let each agent stay narrowly scoped, and passing structured findings between agents (rather than raw text) kept context focused at each stage.

## Handling unreliable LLM output

LLM responses don't always come back as clean, well-formed JSON — even with explicit formatting instructions. This pipeline includes fallback parsing to handle malformed or unexpected output between agent handoffs, so one agent's bad response doesn't silently break the next stage.

## Tech Stack

- **Node.js** — pipeline orchestration
- **Groq API** — LLM inference for all three agents
- **Cheerio** — parsing local files and live web pages

## Setup

\`\`\`bash
git clone https://github.com/Aksdec14/Multi-Agent-System.git
cd Multi-Agent-System
npm install
\`\`\`

Add your Groq API key to a `.env` file:
\`\`\`
GROQ_API_KEY=your_key_here
\`\`\`

Run the scanner:
\`\`\`bash
npm start
\`\`\`

## Example Output

*(Add a sample of the JSON report or a screenshot/GIF of the CLI output here — this is the single best thing you can add to make this repo credible)*

## Status

Personal project — actively exploring improvements to inter-agent schema validation and reporting format.
