import Groq from "groq-sdk";
import { readMemory, writeMemory } from "../memory/sharedMemory.js";
import { readSourceFile, listFiles } from "../tools/fileTools.js";
import { fetchAndParseHTML } from "../tools/fetchTools.js";
import { RetryHandler } from "../tools/retryHandler.js";
import { TextChunker, mergeResults } from "../tools/textChunker.js";

const SYSTEM_PROMPT = `You are an API endpoint discovery specialist. Your job is to analyze source code or web page structure to identify all API endpoints and their characteristics.

ANALYSIS SCOPE:
1. REST API Routes (Express.js, Fastify, Koa, etc.)
2. GraphQL endpoints and mutations/queries
3. WebSocket endpoints
4. API gateway routes
5. Form submission endpoints
6. External API calls made by the application

FOR EACH ENDPOINT, IDENTIFY:
- HTTP method (GET, POST, PUT, DELETE, PATCH, etc.)
- Route path (e.g., /api/users/:id)
- Authentication required (none, apikey, jwt, session, basic)
- Request parameters (query, body, path params)
- Request/response format (JSON, form-data, etc.)
- Handler function location (file:line)
- Any middleware applied
- Rate limiting configuration
- Input validation patterns

OUTPUT FORMAT:
Return a JSON array of endpoint objects:
[
  {
    "method": "POST",
    "path": "/api/users",
    "auth": "jwt",
    "params": {
      "body": ["username", "email", "password"],
      "query": [],
      "path": []
    },
    "format": "json",
    "location": "routes/user.js:42",
    "middleware": ["auth", "validate"],
    "rateLimit": null,
    "validation": "joi",
    "description": "Create a new user account"
  }
]

IMPORTANT:
- Extract endpoints from code patterns like app.get(), router.post(), etc.
- Look for route definition files (routes/, api/, controllers/)
- Identify GraphQL schema definitions
- Find API documentation (swagger, openapi)
- Detect webhook endpoints
- Return ONLY the JSON array, no other text`;

export async function run() {
  console.log("[API Discovery Agent] Starting API endpoint discovery...");

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

  let content = "";

  try {
    if (mem.target.type === "file") {
      try {
        const files = listFiles(mem.target.path);
        const codeExtensions = [
          ".js",
          ".ts",
          ".jsx",
          ".tsx",
          ".py",
          ".rb",
          ".go",
          ".java",
          ".php",
          ".json",
          ".yaml",
          ".yml",
        ];
        const codeFiles = files.filter((f) =>
          codeExtensions.some((ext) => f.endsWith(ext))
        );

        console.log(
          `[API Discovery Agent] Found ${codeFiles.length} code files to analyze`
        );

        const fileContents = [];
        for (const file of codeFiles.slice(0, 30)) {
          try {
            const fileContent = readSourceFile(file);
            fileContents.push(`--- FILE: ${file} ---\n${fileContent.slice(0, 8000)}`);
          } catch (err) {
            console.warn(
              `[API Discovery Agent] Could not read ${file}: ${err.message}`
            );
          }
        }

        content = fileContents.join("\n\n");
      } catch (err) {
        console.log(
          `[API Discovery Agent] Target is a single file, reading directly`
        );
        content = readSourceFile(mem.target.path);
      }
    } else if (mem.target.type === "url") {
      console.log(
        `[API Discovery Agent] Fetching and parsing URL: ${mem.target.path}`
      );
      const parsed = await fetchAndParseHTML(mem.target.path);
      content = JSON.stringify(parsed, null, 2);
    }

    if (!content) {
      console.log("[API Discovery Agent] No content to analyze");
      writeMemory("apiEndpoints", []);
      return;
    }

    console.log(
      `[API Discovery Agent] Sending ${content.length} characters to LLM for analysis`
    );

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const processChunk = async (chunk, index, totalChunks) => {
      console.log(`[API Discovery Agent] Processing chunk ${index + 1}/${totalChunks}`);
      
      const completion = await retryHandler.execute(
        () =>
          groq.chat.completions.create({
            model: "openai/gpt-oss-20b",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: `Analyze the following source code or web page structure to discover all API endpoints:\n\n${chunk}`,
              },
            ],
            temperature: 0.1,
            max_tokens: 2048,
          }),
        { context: `API Discovery LLM call chunk ${index + 1}/${totalChunks}` }
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
        console.warn(`[API Discovery Agent] JSON parse failed for chunk ${index + 1}`);
        return [];
      }
    };

    const chunkResults = await textChunker.processChunks(content, processChunk);
    const apiEndpoints = mergeResults(chunkResults);

    console.log(
      `[API Discovery Agent] Discovered ${apiEndpoints.length} API endpoints`
    );

    writeMemory("apiEndpoints", apiEndpoints);
    console.log("[API Discovery Agent] Complete");
  } catch (error) {
    console.error(
      `[API Discovery Agent] Error: ${error.message}`
    );
    writeMemory("apiEndpoints", []);
  }
}

export default { run };
