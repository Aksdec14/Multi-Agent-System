import Groq from "groq-sdk";
import fs from "fs";
import path from "path";
import { readMemory, writeMemory } from "../memory/sharedMemory.js";
import { RetryHandler } from "../tools/retryHandler.js";
import { TextChunker } from "../tools/textChunker.js";

const SYSTEM_PROMPT_SINGLE = `You are a reporting agent. Given recon findings, risk predictions, API test results, and architecture diagrams from a security scanning pipeline, write a clear, structured security report suitable for a developer to act on.

Your report should include:
1. Executive Summary — 2-4 sentences on overall security posture
2. Architecture Overview — summary of system components and their relationships
3. Findings Table — each finding as a row with: ID, Title, Severity, Confidence, Location, Description, Mitigation
4. API Endpoint Analysis — summary of discovered endpoints and their security status
5. API Vulnerabilities — table of vulnerabilities found in API endpoints
6. Security Architecture — analysis of security boundaries and trust zones
7. Severity Breakdown — count of critical/high/medium/low findings
8. Priority Recommendations — top 3-5 things to fix first
9. Next Steps — what a developer should do after reading this report

Format the report in plain text with clear section headers and consistent formatting.
The tone should be professional but accessible — write for a developer, not a compliance officer.
Do NOT include exploit code or attack payloads in the report.`;

const SYSTEM_PROMPT_CHUNK = `You are a reporting agent. You are receiving a PORTION of scanning results (not the full set). Write ONLY the findings section for this portion — a numbered list of findings with: ID, Title, Severity, Location, Description, Mitigation. Do NOT write an Executive Summary, Severity Breakdown, or Next Steps — those will be added later from the full data.`;

export async function run() {
  console.log("[Report Agent] Starting report generation...");
  const mem = readMemory();
  const retryHandler = new RetryHandler({
    maxRetries: 3,
    baseDelay: 1000,
    retryableStatusCodes: [429, 500, 502, 503],
  });
  const textChunker = new TextChunker({
    maxTokens: 1500,
    tokensPerChar: 0.25,
    overlap: 100,
    maxChunks: 5,
  });

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const architectureData = mem.architectureDiagrams ? `
ARCHITECTURE DIAGRAMS:
- Components: ${mem.architectureDiagrams.components?.join(', ') || 'N/A'}
- Security Boundaries: ${mem.architectureDiagrams.securityBoundaries?.join(', ') || 'N/A'}
- Architectural Risks: ${mem.architectureDiagrams.risks?.join(', ') || 'N/A'}
- Description: ${mem.architectureDiagrams.description || 'N/A'}
` : '';

  const truncate = (str, max) => {
    if (!str) return '';
    return str.length > max ? str.slice(0, max) + '\n[TRUNCATED]' : str;
  };

  const combinedData = `RECON FINDINGS:\n${truncate(JSON.stringify(mem.reconFindings, null, 2), 3000)}\n\nRISK PREDICTIONS:\n${truncate(JSON.stringify(mem.riskPredictions, null, 2), 3000)}\n\nAPI ENDPOINTS DISCOVERED:\n${truncate(JSON.stringify(mem.apiEndpoints, null, 2), 2000)}\n\nAPI VULNERABILITIES FOUND:\n${truncate(JSON.stringify(mem.apiTestResults, null, 2), 2000)}\n${architectureData}`;

  const processChunk = async (chunk, index, totalChunks) => {
    console.log(`[Report Agent] Processing chunk ${index + 1}/${totalChunks}`);
    
    const isSingleChunk = totalChunks === 1;
    const prompt = isSingleChunk ? SYSTEM_PROMPT_SINGLE : SYSTEM_PROMPT_CHUNK;
    
    const completion = await retryHandler.execute(
      () =>
        groq.chat.completions.create({
          model: "openai/gpt-oss-20b",
          messages: [
            { role: "system", content: prompt },
            {
              role: "user",
              content: isSingleChunk
                ? `Generate a security report from the following scanning results:\n\n${chunk}`
                : `Here is portion ${index + 1} of ${totalChunks} of scanning results. Write ONLY the findings for this portion:\n\n${chunk}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 2048,
        }),
      { context: `Report LLM call chunk ${index + 1}/${totalChunks}` }
    );

    return completion.choices[0]?.message?.content || "";
  };

  const chunks = textChunker.chunk(combinedData);
  let reportText = "";

  if (chunks.length === 1) {
    reportText = await processChunk(chunks[0], 0, 1);
  } else {
    const chunkReports = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkReport = await processChunk(chunks[i], i, chunks.length);
      chunkReports.push(chunkReport);
    }
    reportText = chunkReports.join("\n\n");
  }

  if (!reportText) {
    reportText = "No report generated.";
  }

  const reportPath = path.resolve("report.txt");
  fs.writeFileSync(reportPath, reportText, "utf-8");

  writeMemory("reportPath", reportPath);
  console.log(`[Report Agent] Done. Report written to ${reportPath}`);
}
