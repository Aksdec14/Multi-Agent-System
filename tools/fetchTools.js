import fetch from "node-fetch";
import * as cheerio from "cheerio";

export async function fetchAndParseHTML(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "SecurityScanner/1.0 (passive recon)" },
    timeout: 15000,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const title = $("title").text().trim() || "No title";

  const scripts = [];
  $("script").each((_, el) => {
    const src = $(el).attr("src");
    const inline = $(el).html()?.trim();
    if (src) {
      scripts.push({ type: "external", src });
    }
    if (inline && inline.length > 0) {
      scripts.push({ type: "inline", preview: inline.slice(0, 500) });
    }
  });

  const forms = [];
  $("form").each((_, el) => {
    const action = $(el).attr("action") || "none";
    const method = $(el).attr("method") || "GET";
    const inputs = [];
    $(el).find("input, textarea, select").each((_, input) => {
      inputs.push({
        tag: $(input).prop("tagName")?.toLowerCase(),
        name: $(input).attr("name") || "unnamed",
        type: $(input).attr("type") || "text",
      });
    });
    forms.push({ action, method, inputs });
  });

  const comments = [];
  const commentRegex = /<!--[\s\S]*?-->/g;
  let match;
  while ((match = commentRegex.exec(html)) !== null) {
    comments.push(match[0].slice(0, 300));
  }

  const meta = [];
  $("meta").each((_, el) => {
    const name = $(el).attr("name") || $(el).attr("property") || "";
    const content = $(el).attr("content") || "";
    if (name || content) {
      meta.push({ name, content });
    }
  });

  return { title, scripts, forms, comments, meta, htmlLength: html.length };
}
