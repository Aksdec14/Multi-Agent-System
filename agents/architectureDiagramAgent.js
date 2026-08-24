import Groq from "groq-sdk";
import fs from "fs";
import path from "path";
import { readMemory, writeMemory } from "../memory/sharedMemory.js";
import { RetryHandler } from "../tools/retryHandler.js";
import { TextChunker, mergeResults } from "../tools/textChunker.js";

const SYSTEM_PROMPT = `You are an architecture diagram specialist. Your job is to analyze source code and generate Mermaid.js syntax for architecture diagrams.

ANALYSIS APPROACH:
Analyze the code to identify:
1. System components (services, controllers, models, utils)
2. External dependencies (databases, APIs, file systems)
3. Data flow between components
4. Entry points and routing
5. Authentication/authorization boundaries
6. Security-sensitive areas

DIAGRAM TYPES TO GENERATE:
1. **Component Diagram** - Shows high-level system components and their relationships
2. **Data Flow Diagram** - Shows how data moves through the application
3. **Security Architecture** - Highlights security boundaries and trust zones

OUTPUT FORMAT:
Return a JSON object with:
{
  "componentDiagram": "Mermaid syntax for component diagram",
  "dataFlowDiagram": "Mermaid syntax for data flow diagram",
  "securityDiagram": "Mermaid syntax for security diagram",
  "description": "Brief explanation of the architecture",
  "components": ["list of identified components"],
  "securityBoundaries": ["list of security boundaries"],
  "risks": ["architectural security risks"]
}

MERMAID SYNTAX RULES:
- Use proper Mermaid syntax for each diagram type
- Use meaningful node names
- Group related components
- Use different shapes for different component types:
  - Rectangles for services/components
  - Cylinders for databases
  - Circles for external systems
  - Diamonds for decision points
- Add labels to relationships

IMPORTANT:
- Focus on security-relevant architecture aspects
- Identify attack surfaces and trust boundaries
- Use valid Mermaid.js syntax
- Return ONLY the JSON object, no other text`;

export async function run() {
  console.log("[Architecture Diagram Agent] Starting diagram generation...");

  const mem = readMemory();
  const retryHandler = new RetryHandler({
    maxRetries: 3,
    baseDelay: 1000,
    retryableStatusCodes: [429, 500, 502, 503],
  });
  const textChunker = new TextChunker({
    maxTokens: 3500,
    tokensPerChar: 0.25,
    overlap: 100,
  });

  let content = "";

  try {
    if (mem.target.type === "file") {
      try {
        const files = listFiles(mem.target.path);
        const codeExtensions = [
          ".js", ".ts", ".jsx", ".tsx", ".py", ".rb", ".go", ".java", ".php"
        ];
        const codeFiles = files.filter((f) =>
          codeExtensions.some((ext) => f.endsWith(ext))
        );

        console.log(
          `[Architecture Diagram Agent] Found ${codeFiles.length} code files to analyze`
        );

        const fileContents = [];
        for (const file of codeFiles.slice(0, 20)) {
          try {
            const fileContent = readSourceFile(file);
            fileContents.push(`--- FILE: ${file} ---\n${fileContent.slice(0, 5000)}`);
          } catch (err) {
            console.warn(
              `[Architecture Diagram Agent] Could not read ${file}: ${err.message}`
            );
          }
        }

        content = fileContents.join("\n\n");
      } catch (err) {
        console.log(
          `[Architecture Diagram Agent] Target is a single file, reading directly`
        );
        content = readSourceFile(mem.target.path);
      }
    } else if (mem.target.type === "url") {
      console.log(
        `[Architecture Diagram Agent] Fetching and parsing URL: ${mem.target.path}`
      );
      const { fetchAndParseHTML } = await import("../tools/fetchTools.js");
      const parsed = await fetchAndParseHTML(mem.target.path);
      content = JSON.stringify(parsed, null, 2);
    }

    if (!content) {
      console.log("[Architecture Diagram Agent] No content to analyze");
      writeMemory("architectureDiagrams", null);
      return;
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const processChunk = async (chunk, index, totalChunks) => {
      console.log(`[Architecture Diagram Agent] Processing chunk ${index + 1}/${totalChunks}`);
      
      const completion = await retryHandler.execute(
        () =>
          groq.chat.completions.create({
            model: "openai/gpt-oss-20b",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: `Analyze the following source code and generate architecture diagrams in Mermaid.js syntax:\n\n${chunk}`,
              },
            ],
            temperature: 0.2,
            max_tokens: 4096,
          }),
        { context: `Architecture Diagram LLM call chunk ${index + 1}/${totalChunks}` }
      );

      const responseText = completion.choices[0]?.message?.content || "{}";
      
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch (parseError) {
        console.warn(`[Architecture Diagram Agent] JSON parse failed for chunk ${index + 1}`);
        return null;
      }
    };

    const chunkResults = await textChunker.processChunks(content, processChunk);
    const validResults = chunkResults.filter(r => r !== null);

    let diagrams;
    if (validResults.length === 0) {
      diagrams = {
        componentDiagram: `graph TD
    A[Application] --> B[Controllers]
    A --> C[Services]
    A --> D[Models]
    B --> E[Routes]
    C --> F[Business Logic]
    D --> G[Database]`,
        dataFlowDiagram: `graph LR
    A[User] --> B[Frontend]
    B --> C[API Gateway]
    C --> D[Backend]
    D --> E[Database]
    D --> F[External APIs]`,
        securityDiagram: `graph TD
    A[Internet] -->|HTTPS| B[Load Balancer]
    B --> C[Web Server]
    C --> D[Application]
    D --> E[Database]
    style A fill:#ff6b6b
    style E fill:#4ecdc4`,
        description: "Default architecture diagram - analyze source code for custom diagrams",
        components: ["Web Server", "Application", "Database"],
        securityBoundaries: ["Internet/DMZ", "Internal Network"],
        risks: ["Default diagram - needs code analysis"]
      };
    } else {
      diagrams = validResults[0];
    }

    const diagramContent = `# Architecture Diagrams

## System Architecture
\`\`\`mermaid
${diagrams.componentDiagram}
\`\`\`

## Data Flow
\`\`\`mermaid
${diagrams.dataFlowDiagram}
\`\`\`

## Security Architecture
\`\`\`mermaid
${diagrams.securityDiagram}
\`\`\`

## Description
${diagrams.description}

## Identified Components
${diagrams.components.map(c => `- ${c}`).join('\n')}

## Security Boundaries
${diagrams.securityBoundaries.map(b => `- ${b}`).join('\n')}

## Architectural Risks
${diagrams.risks.map(r => `- ${r}`).join('\n')}
`;

    const diagramPath = path.resolve("architecture.md");
    fs.writeFileSync(diagramPath, diagramContent, "utf-8");

    writeMemory("architectureDiagrams", {
      ...diagrams,
      path: diagramPath
    });

    console.log(`[Architecture Diagram Agent] Done. Diagrams written to ${diagramPath}`);
  } catch (error) {
    console.error(`[Architecture Diagram Agent] Error: ${error.message}`);
    writeMemory("architectureDiagrams", null);
  }
}

import { readSourceFile, listFiles } from "../tools/fileTools.js";

export default { run };
