/**
 * Validation utility functions
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate topic input
 */
export function validateTopic(topic: string): ValidationResult {
  if (!topic || topic.trim().length === 0) {
    return { valid: false, error: 'Chủ đề không được để trống.' };
  }

  if (topic.length < 5) {
    return { valid: false, error: 'Chủ đề quá ngắn. Vui lòng nhập ít nhất 5 ký tự.' };
  }

  if (topic.length > 200) {
    return { valid: false, error: 'Chủ đề quá dài. Vui lòng nhập tối đa 200 ký tự.' };
  }

  return { valid: true };
}

/**
 * Validate title selection
 */
export function validateTitleSelection(selection: string): ValidationResult {
  const num = parseInt(selection, 10);

  if (isNaN(num)) {
    return { valid: false, error: 'Vui lòng gửi một số từ 1-10.' };
  }

  if (num < 1 || num > 10) {
    return { valid: false, error: 'Vui lòng chọn số từ 1-10.' };
  }

  return { valid: true };
}

/**
 * Sanitize text for logging (remove potential PII, special chars)
 */
export function sanitizeForLog(text: string, maxLength = 50): string {
  if (!text) return '';

  // Remove potential email addresses
  let sanitized = text.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL]');

  // Remove potential phone numbers
  sanitized = sanitized.replace(/\b\d{9,15}\b/g, '[PHONE]');

  // Remove URLs
  sanitized = sanitized.replace(/https?:\/\/[^\s]+/g, '[URL]');

  // Truncate
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '...';
  }

  return sanitized;
}

/**
 * Validate and sanitize user input
 */
export function sanitizeInput(input: string): string {
  if (!input) return '';

  // Trim whitespace
  let sanitized = input.trim();

  // Remove zero-width characters
  sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // Normalize unicode
  sanitized = sanitized.normalize('NFC');

  return sanitized;
}

/**
 * Validate article outline structure
 */
export function validateOutline(outline: any): ValidationResult {
  // Check if outline exists
  if (!outline) {
    return { valid: false, error: 'Outline không tồn tại.' };
  }

  // Check if inference exists
  if (!outline.inference) {
    return { valid: false, error: 'Thiếu thông tin inference trong outline.' };
  }

  // Validate inference fields
  const inference = outline.inference;
  if (!inference.targetKeyword || typeof inference.targetKeyword !== 'string') {
    return { valid: false, error: 'Thiếu targetKeyword trong inference.' };
  }
  if (!inference.targetAudience || typeof inference.targetAudience !== 'string') {
    return { valid: false, error: 'Thiếu targetAudience trong inference.' };
  }
  if (!inference.contentPurpose || typeof inference.contentPurpose !== 'string') {
    return { valid: false, error: 'Thiếu contentPurpose trong inference.' };
  }

  // Check if outline sections exist
  if (!outline.outline || !Array.isArray(outline.outline)) {
    return { valid: false, error: 'Outline sections phải là một array.' };
  }

  // Check minimum number of sections
  if (outline.outline.length < 3) {
    return { valid: false, error: 'Outline phải có ít nhất 3 sections.' };
  }

  // Validate each section
  for (let i = 0; i < outline.outline.length; i++) {
    const section = outline.outline[i];

    if (!section.heading || typeof section.heading !== 'string') {
      return { valid: false, error: `Section ${i + 1} thiếu heading.` };
    }

    if (section.heading.trim().length === 0) {
      return { valid: false, error: `Section ${i + 1} có heading rỗng.` };
    }

    // Subheadings are optional, but if present must be array
    if (section.subheadings && !Array.isArray(section.subheadings)) {
      return { valid: false, error: `Section ${i + 1} subheadings phải là array.` };
    }
  }

  return { valid: true };
}
