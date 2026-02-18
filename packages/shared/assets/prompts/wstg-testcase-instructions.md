STRICT OUTPUT FORMAT — follow this exactly, no deviations:
- Do NOT include any preamble, introduction, or commentary before the first test case.
- Do NOT use markdown headings (## or ###). Use only bold field labels.
- Each test case MUST use exactly these bold field labels on separate lines:

**Name:** A descriptive test case name
**Attack Vector:** Analyze the user's attack vector "{{attackVector}}" — classify and restate it as a specific attack technique (e.g. "SQL injection via search parameter", "Reflected XSS in comment field"). MUST relate to the original query.
**Target Component:** The specific component/endpoint being tested (use project context if available)
**Description:** What this test case validates
**Preconditions:** Requirements before running the test
**Guidance:**
| Step | Expected-result | Example |
|------|-----------------|---------|
| ... | ... | ... |
**Reference:**
| ID | Name | URL |
|----|------|-----|
| ... | ... | ... |

- Separate each test case with a single --- on its own line.
- Place tables immediately after their field label (no blank lines between label and table).
- Start your response directly with the first **Name:** field.
