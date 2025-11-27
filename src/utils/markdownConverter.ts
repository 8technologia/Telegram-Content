import { marked, Tokens } from 'marked';
import logger from './logger';

/**
 * Custom renderer for WordPress-optimized HTML output
 */
class WordPressRenderer extends marked.Renderer {
  /**
   * Override table rendering to add WordPress block class
   */
  table(token: Tokens.Table): string {
    // Use parent renderer for header and rows
    const headerRow = token.header.map(cell => this.tablecell(cell)).join('');
    const bodyRows = token.rows.map(row => {
      const cells = row.map(cell => this.tablecell(cell)).join('');
      return `<tr>${cells}</tr>`;
    }).join('\n');

    return `<table class="wp-block-table">
<thead>
<tr>${headerRow}</tr>
</thead>
<tbody>
${bodyRows}
</tbody>
</table>`;
  }

  /**
   * Override code block rendering for better WordPress compatibility
   */
  code(token: Tokens.Code): string {
    const lang = token.lang || 'plaintext';
    const escapedCode = token.text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    return `<pre class="wp-block-code"><code class="language-${lang}">${escapedCode}</code></pre>`;
  }

  /**
   * Override blockquote for WordPress styling
   */
  blockquote(token: Tokens.Blockquote): string {
    const body = this.parser.parse(token.tokens);
    return `<blockquote class="wp-block-quote">${body}</blockquote>`;
  }

  /**
   * Override image rendering to add WordPress classes
   */
  image(token: Tokens.Image): string {
    const titleAttr = token.title ? ` title="${token.title}"` : '';
    return `<figure class="wp-block-image"><img src="${token.href}" alt="${token.text}"${titleAttr} /></figure>`;
  }

  /**
   * Override list rendering to add proper WordPress classes
   */
  list(token: Tokens.List): string {
    const type = token.ordered ? 'ol' : 'ul';
    const body = token.items.map(item => this.listitem(item)).join('');
    return `<${type} class="wp-block-list">${body}</${type}>`;
  }
}

/**
 * Configure marked with WordPress-optimized settings
 */
function configureMarked(): void {
  marked.setOptions({
    renderer: new WordPressRenderer(),
    gfm: true, // GitHub Flavored Markdown
    breaks: false, // Don't convert \n to <br>
    pedantic: false,
  });
}

/**
 * Convert Markdown to WordPress-ready HTML
 * @param markdown - The markdown content to convert
 * @returns Clean HTML ready for WordPress
 */
export function markdownToWordPressHTML(markdown: string): string {
  if (!markdown || typeof markdown !== 'string') {
    logger.warn('Invalid markdown input received');
    return '';
  }

  try {
    // Configure marked with WordPress renderer
    configureMarked();

    // Convert markdown to HTML
    let html = marked.parse(markdown) as string;

    // Post-processing: Clean up extra whitespace
    html = html
      .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
      .replace(/>\s+</g, '><') // Remove whitespace between tags
      .trim();

    logger.info(`Successfully converted markdown to HTML (${html.length} chars)`);
    return html;
  } catch (error: any) {
    logger.error(`Failed to convert markdown to HTML: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
    throw new Error(`Markdown conversion failed: ${error.message}`);
  }
}

/**
 * Sanitize and clean markdown content before conversion
 * @param markdown - Raw markdown content
 * @returns Cleaned markdown
 */
export function cleanMarkdownContent(markdown: string): string {
  if (!markdown || typeof markdown !== 'string') {
    return '';
  }

  let cleaned = markdown;

  // Remove any potential script injections (just in case)
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove excessive blank lines (more than 3 consecutive)
  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');

  // Trim leading/trailing whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Convert markdown to HTML with cleaning
 * @param markdown - Raw markdown content
 * @returns WordPress-ready HTML
 */
export function convertMarkdownForWordPress(markdown: string): string {
  const cleaned = cleanMarkdownContent(markdown);
  return markdownToWordPressHTML(cleaned);
}
