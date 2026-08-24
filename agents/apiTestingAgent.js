import Groq from "groq-sdk";
import { readMemory, writeMemory } from "../memory/sharedMemory.js";
import { RetryHandler } from "../tools/retryHandler.js";
import { TextChunker, mergeResults } from "../tools/textChunker.js";

const SYSTEM_PROMPT = `You are an API security testing specialist. Your job is to analyze discovered API endpoints and identify potential security vulnerabilities.

ANALYSIS APPROACH:
Analyze each endpoint for common API security issues based on the code patterns and endpoint characteristics provided.

VULNERABILITY CATEGORIES TO CHECK:
1. Injection Attacks
   - SQL Injection in query parameters or body
   - NoSQL Injection
   - Command Injection
   - LDAP Injection

2. Authentication & Authorization
   - Missing authentication on sensitive endpoints
   - Weak authentication mechanisms
   - Authorization bypass potential
   - JWT vulnerabilities (weak secrets, no expiration)
   - Session management issues

3. Input Validation
   - Missing input validation
   - Type coercion issues
   - Buffer overflow potential
   - Path traversal via user input

4. Rate Limiting & DoS
   - Missing rate limiting on resource-intensive endpoints
   - No request size limits
   - Infinite loop potential

5. Data Exposure
   - Sensitive data in responses
   - Verbose error messages
   - Debug information leakage
   - Mass assignment vulnerabilities

6. CORS & Headers
   - Misconfigured CORS policies
   - Missing security headers
   - Content-Type validation missing

7. Business Logic
   - Race conditions
   - Price manipulation
   - Quantity/validation bypass

FOR EACH VULNERABILITY FOUND:
- Identify the endpoint and specific parameter
- Classify the vulnerability type
- Rate severity (critical/high/medium/low)
- Provide evidence from the code
- Recommend specific mitigation

OUTPUT FORMAT:
Return a JSON array of vulnerability objects:
[
  {
    "endpoint": "POST /api/users",
    "vulnerability": "SQL Injection",
    "category": "injection",
    "severity": "critical",
    "confidence": "high",
    "location": "routes/user.js:45",
    "parameter": "body.username",
    "evidence": "String concatenation used in SQL query without parameterization",
    "description": "User input is directly concatenated into SQL query, allowing SQL injection attacks",
    "mitigation": "Use parameterized queries or ORM with proper escaping",
    "cweId": "CWE-89"
  }
]

SEVERITY DEFINITIONS:
- critical: Remote code execution, SQL injection, authentication bypass
- high: Significant data exposure, privilege escalation
- medium: Limited data exposure, missing validation
- low: Information disclosure, minor misconfigurations

IMPORTANT:
- Focus on vulnerabilities that can be confirmed from code analysis
- Include CWE IDs where applicable
- Provide actionable mitigation recommendations
- Return ONLY the JSON array, no other text`;

export async function run() {
  console.log("[API Testing Agent] Starting API security analysis...");

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

  try {
    if (!mem.apiEndpoints || mem.apiEndpoints.length === 0) {
      console.log("[API Testing Agent] No API endpoints to test");
      writeMemory("apiTestResults", []);
      return;
    }

    console.log(
      `[API Testing Agent] Analyzing ${mem.apiEndpoints.length} endpoints for vulnerabilities`
    );

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const analysisInput = {
      endpoints: mem.apiEndpoints,
      reconFindings: mem.reconFindings || [],
    };

    const inputJson = JSON.stringify(analysisInput, null, 2);

    const processChunk = async (chunk, index, totalChunks) => {
      console.log(`[API Testing Agent] Processing chunk ${index + 1}/${totalChunks}`);
      
      const completion = await retryHandler.execute(
        () =>
          groq.chat.completions.create({
            model: "openai/gpt-oss-20b",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: `Analyze the following API endpoints and their context for security vulnerabilities:\n\n${chunk}`,
              },
            ],
            temperature: 0.1,
            max_tokens: 2048,
          }),
        { context: `API Testing LLM call chunk ${index + 1}/${totalChunks}` }
      );

      const responseText = completion.choices[0]?.message?.content || "[]";
      
      try {
        let jsonStr = responseText;
        
        const codeBlockMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (codeBlockMatch) {
          jsonStr = codeBlockMatch[1];
        }

        const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        return [];
      } catch (parseError) {
        console.warn(`[API Testing Agent] JSON parse failed for chunk ${index + 1}`);
        return [];
      }
    };

    const chunkResults = await textChunker.processChunks(inputJson, processChunk);
    const apiTestResults = mergeResults(chunkResults);

    const severityCounts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const result of apiTestResults) {
      const severity = result.severity?.toLowerCase();
      if (severityCounts.hasOwnProperty(severity)) {
        severityCounts[severity]++;
      }
    }

    console.log("[API Testing Agent] Analysis complete:");
    console.log(`  Critical: ${severityCounts.critical}`);
    console.log(`  High: ${severityCounts.high}`);
    console.log(`  Medium: ${severityCounts.medium}`);
    console.log(`  Low: ${severityCounts.low}`);
    console.log(
      `[API Testing Agent] Total: ${apiTestResults.length} vulnerabilities found`
    );

    writeMemory("apiTestResults", apiTestResults);
    console.log("[API Testing Agent] Complete");
  } catch (error) {
    console.error(`[API Testing Agent] Error: ${error.message}`);
    writeMemory("apiTestResults", []);
  }
}

export default { run };
