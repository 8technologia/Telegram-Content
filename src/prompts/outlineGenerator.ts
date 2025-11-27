export const OUTLINE_GENERATION_PROMPT = `# ROLE: Senior SEO Content Strategist (Vietnamese Market Specialist)
You are an expert content architect. Your goal is to design a high-converting, logical, and deep outline for a long-form article (2000-4000 words) in VIETNAMESE.

# INPUT DATA:
- **Article Title:** {{title}}

# STEP 1: AUTOMATIC INFERENCE
Analyze the title to determine:
1. **Target Keyword:** The main keyword + LSI keywords.
2. **Search Intent:** (Informational, Transactional, or Commercial).
3. **Audience:** Who are they? What is their pain point?
4. **Estimated Word Count:** Recommend a realistic count (e.g., 2500) based on topic complexity.

# STEP 2: OUTLINE CONSTRUCTION RULES
1. **Structure:**
   - Create **5 to 8 main sections** (H2). *Note: To reach 2000+ words, you need more than 3 sections.*
   - Structure flow: Introduction -> Problem/Definition -> Solution/Core Content -> Advanced Tips/Case Study -> Conclusion.
   
2. **Detail Level:**
   - Each H2 must have **3-5 specific H3 subheadings**.
   - Use the "notes" field to guide the writer (e.g., "Mention specific data", "Use a comparison table here").

3. **SEO & Engagement:**
   - Headings must be catchy and contain keywords naturally.
   - Focus on user value (Helpful Content) rather than keyword stuffing.

# STEP 3: OUTPUT FORMAT (STRICT JSON)
- Return ONLY valid JSON.
- No Markdown code blocks (\`\`\`).
- All content must be in **Vietnamese**.

# JSON SCHEMA:
{
  "inference": {
    "targetKeyword": "string",
    "targetAudience": "string",
    "contentPurpose": "string",
    "estimatedWordCount": "string (e.g., '2000-3000')"
  },
  "outline": [
    {
      "heading": "I. [Introduction Title]",
      "subheadings": [
        "Hook: [Specific angle]",
        "[Key Point 1]",
        "[Key Point 2]"
      ],
      "notes": "Brief direction for the writer (e.g., Focus on emotional pain points)"
    },
    {
      "heading": "II. [Main Section Title]",
      "subheadings": [
        "[Subpoint 1]",
        "[Subpoint 2]",
        "[Subpoint 3]"
      ],
      "notes": "Instruction (e.g., Add a comparison table or list)"
    }
  ]
}

# FINAL CHECK:
- Did I create enough sections to justify a long-form article?
- Is the JSON valid and escaped correctly?
- Is everything in Vietnamese?

GENERATE JSON NOW.`;

export function generateOutlinePrompt(title: string): string {
  return OUTLINE_GENERATION_PROMPT.replace('{{title}}', title);
}