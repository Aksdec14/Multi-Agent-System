/**
 * Text Chunker Utility
 * Splits large text into smaller chunks that fit within LLM token limits
 */

export class TextChunker {
  constructor(options = {}) {
    this.maxTokens = options.maxTokens || 6000;
    this.tokensPerChar = options.tokensPerChar || 0.25;
    this.overlap = options.overlap || 200;
  }

  /**
   * Estimate token count from text
   * @param {string} text
   * @returns {number}
   */
  estimateTokens(text) {
    return Math.ceil(text.length * this.tokensPerChar);
  }

  /**
   * Split text into chunks by newline boundaries
   * @param {string} text
   * @returns {string[]}
   */
  splitByLines(text) {
    const lines = text.split('\n');
    const chunks = [];
    let currentChunk = [];
    let currentTokens = 0;

    for (const line of lines) {
      const lineTokens = this.estimateTokens(line);
      
      if (currentTokens + lineTokens > this.maxTokens && currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n'));
        currentChunk = [];
        currentTokens = 0;
      }
      
      currentChunk.push(line);
      currentTokens += lineTokens;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n'));
    }

    return chunks;
  }

  /**
   * Split text into fixed-size chunks with overlap
   * @param {string} text
   * @returns {string[]}
   */
  splitFixedSize(text) {
    const maxChars = Math.floor(this.maxTokens / this.tokensPerChar);
    const chunks = [];
    let start = 0;

    while (start < text.length) {
      let end = start + maxChars;
      
      if (end < text.length) {
        const lastNewline = text.lastIndexOf('\n', end);
        if (lastNewline > start + maxChars * 0.5) {
          end = lastNewline;
        }
      }

      chunks.push(text.slice(start, end));
      start = end - this.overlap;
      
      if (start >= text.length) break;
    }

    return chunks;
  }

  /**
   * Split content into processable chunks
   * @param {string} content - Text to split
   * @param {object} options
   * @returns {string[]}
   */
  chunk(content, options = {}) {
    const { method = 'lines' } = options;
    
    if (this.estimateTokens(content) <= this.maxTokens) {
      return [content];
    }

    console.log(`[TextChunker] Content too large (${this.estimateTokens(content)} tokens), splitting...`);

    let chunks;
    if (method === 'fixed') {
      chunks = this.splitFixedSize(content);
    } else {
      chunks = this.splitByLines(content);
    }

    console.log(`[TextChunker] Split into ${chunks.length} chunks`);
    return chunks;
  }

  /**
   * Process chunks with an async function and combine results
   * @param {string} content
   * @param {Function} processFn - Async function to process each chunk
   * @param {object} options
   * @returns {Promise<any[]>}
   */
  async processChunks(content, processFn, options = {}) {
    const chunks = this.chunk(content, options);
    const results = [];

    for (let i = 0; i < chunks.length; i++) {
      console.log(`[TextChunker] Processing chunk ${i + 1}/${chunks.length}`);
      const result = await processFn(chunks[i], i, chunks.length);
      results.push(result);
    }

    return results;
  }
}

/**
 * Merge results from multiple chunks
 * @param {any[][]} chunkResults - Array of arrays from each chunk
 * @returns {any[]}
 */
export function mergeResults(chunkResults) {
  const merged = [];
  for (const results of chunkResults) {
    if (Array.isArray(results)) {
      merged.push(...results);
    } else if (results) {
      merged.push(results);
    }
  }
  return merged;
}

export default TextChunker;
