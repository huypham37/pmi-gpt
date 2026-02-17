import type { TestCase } from '../../../shared/types';

const MOCK_SESSION_ID = 'mock-testcase-session-001';
const MOCK_WORKSPACE_ID = 'default';

const now = Date.now();

export const MOCK_SESSION_ID_VALUE = MOCK_SESSION_ID;

export const mockTestCases: TestCase[] = [
  {
    id: 'tc-001',
    workspaceId: MOCK_WORKSPACE_ID,
    generationSessionId: MOCK_SESSION_ID,
    name: 'Basic <script> Tag Injection',
    targetComponent: 'Comment body field in POST /api/comments',
    description:
      'Tests whether the application properly sanitizes basic `<script>` tag injections in user-supplied input fields.',
    preconditions:
      '- User must have an account and be authenticated\n- Application allows user-generated comments\n- Comment form is accessible at /comments/new',
    guidance:
      '1. Navigate to /comments/new\n2. Enter the payload in the comment body field\n3. Submit the form\n4. Observe whether the script executes in the browser',
    expectedBehavior:
      'The application should strip or encode `<script>` tags. The response should not contain executable JavaScript.',
    actualResult:
      'The `<script>` tag was rendered without encoding. JavaScript executed successfully in the browser context, confirming a reflected XSS vulnerability.',
    reference: [
      {
        id: 'CAPEC-86',
        name: 'XSS via HTTP Headers',
        url: 'https://capec.mitre.org/data/definitions/86.html',
      },
      {
        id: 'WSTG-INPV-01',
        name: 'Testing for Reflected Cross Site Scripting',
        url: 'https://owasp.org/www-project-web-security-testing-guide/stable/4-Web_Application_Security_Testing/07-Input_Validation_Testing/01-Testing_for_Reflected_Cross_Site_Scripting',
      },
    ],
    createdAt: now - 300000,
    updatedAt: now - 300000,
  },
  {
    id: 'tc-002',
    workspaceId: MOCK_WORKSPACE_ID,
    generationSessionId: MOCK_SESSION_ID,
    name: 'Event Handler Attribute XSS',
    targetComponent: 'Display name field in profile update',
    description:
      'Tests whether event handler attributes like `onerror`, `onload`, `onmouseover` are sanitized when rendering user-supplied content.',
    preconditions:
      '- User must be authenticated\n- Profile editing functionality is available\n- User display names are rendered on public profile pages',
    guidance:
      '1. Navigate to /settings/profile\n2. Set display name to the payload\n3. Save the profile\n4. Visit any page that renders the display name\n5. Observe whether the redirect occurs',
    expectedBehavior:
      'Event handler attributes should be stripped from user-supplied HTML. The `<img>` tag should render without executing the `onerror` handler.',
    actualResult:
      'The `onerror` handler executed, redirecting the browser to the attacker-controlled URL with the session cookie. This is a stored XSS vulnerability with cookie exfiltration.',
    reference: [
      {
        id: 'CAPEC-86',
        name: 'XSS via HTTP Headers',
        url: 'https://capec.mitre.org/data/definitions/86.html',
      },
      {
        id: 'CAPEC-198',
        name: 'XSS Targeting Error Pages',
        url: 'https://capec.mitre.org/data/definitions/198.html',
      },
      {
        id: 'WSTG-INPV-02',
        name: 'Testing for Stored Cross Site Scripting',
        url: 'https://owasp.org/www-project-web-security-testing-guide/stable/4-Web_Application_Security_Testing/07-Input_Validation_Testing/02-Testing_for_Stored_Cross_Site_Scripting',
      },
    ],
    createdAt: now - 250000,
    updatedAt: now - 250000,
  },
  {
    id: 'tc-003',
    workspaceId: MOCK_WORKSPACE_ID,
    generationSessionId: MOCK_SESSION_ID,
    name: 'DOM-based XSS via URL Fragment',
    targetComponent: 'Client-side JavaScript reading window.location.hash',
    description:
      'Tests whether the application safely handles URL fragment data that is read and inserted into the DOM via `document.location.hash` or `window.location.hash`.',
    preconditions:
      '- Target page uses client-side JavaScript to read URL fragments\n- Fragment data is inserted into the DOM without proper sanitization',
    guidance:
      '1. Craft a URL with the payload in the fragment\n2. Visit the URL in a browser\n3. Observe whether the JavaScript executes\n4. Check the DOM insertion method used (innerHTML vs textContent)',
    expectedBehavior:
      'Client-side code should use safe DOM APIs (textContent) or sanitize hash data before insertion.',
    reference: [
      {
        id: 'CAPEC-588',
        name: 'DOM-Based XSS',
        url: 'https://capec.mitre.org/data/definitions/588.html',
      },
      {
        id: 'WSTG-CLNT-01',
        name: 'Testing for DOM-Based Cross Site Scripting',
        url: 'https://owasp.org/www-project-web-security-testing-guide/stable/4-Web_Application_Security_Testing/11-Client-side_Testing/01-Testing_for_DOM-based_Cross_Site_Scripting',
      },
    ],
    createdAt: now - 200000,
    updatedAt: now - 200000,
  },
  {
    id: 'tc-004',
    workspaceId: MOCK_WORKSPACE_ID,
    generationSessionId: MOCK_SESSION_ID,
    name: 'Stored XSS via Markdown Rendering',
    targetComponent: 'Post content field supporting markdown',
    description:
      'Tests whether the markdown renderer properly sanitizes embedded HTML and JavaScript within markdown content.',
    preconditions:
      '- Application supports markdown in user-generated content\n- Posts are rendered and displayed to other users\n- Markdown parser processes links and images',
    guidance:
      '1. Create a new post\n2. Enter markdown with javascript: protocol links\n3. Submit the post\n4. Inspect rendered HTML for javascript: URLs\n5. Test clicking the links to verify sanitization',
    expectedBehavior:
      'Markdown renderer should strip `javascript:` protocol URLs from links and images. Only `http:` and `https:` protocols should be allowed.',
    actualResult:
      'The markdown renderer correctly blocked `javascript:` protocol URLs. Links were sanitized and images with invalid sources failed gracefully.',
    reference: [
      {
        id: 'CAPEC-86',
        name: 'XSS via HTTP Headers',
        url: 'https://capec.mitre.org/data/definitions/86.html',
      },
      {
        id: 'WSTG-INPV-02',
        name: 'Testing for Stored Cross Site Scripting',
        url: 'https://owasp.org/www-project-web-security-testing-guide/stable/4-Web_Application_Security_Testing/07-Input_Validation_Testing/02-Testing_for_Stored_Cross_Site_Scripting',
      },
    ],
    createdAt: now - 150000,
    updatedAt: now - 150000,
  },
  {
    id: 'tc-005',
    workspaceId: MOCK_WORKSPACE_ID,
    generationSessionId: MOCK_SESSION_ID,
    name: 'SVG-based XSS Injection',
    targetComponent: 'Avatar image upload endpoint',
    description:
      'Tests whether SVG file uploads are sanitized for embedded JavaScript before being served to users.',
    preconditions:
      '- Application allows SVG file uploads\n- Uploaded SVGs are served inline with image/svg+xml content type\n- User avatars are rendered on profile pages',
    guidance:
      '1. Create an SVG file with embedded onload handler\n2. Upload as avatar via /settings/avatar\n3. Visit another user profile that renders the avatar\n4. Observe the network tab for fetch request to evil.com',
    expectedBehavior:
      'SVG uploads should be sanitized to remove `<script>` tags and event handler attributes. Alternatively, SVGs should be served with `Content-Disposition: attachment` or converted to raster format.',
    actualResult:
      'The SVG was served inline with `image/svg+xml` content type. The `onload` handler executed when the avatar was rendered, exfiltrating cookies.',
    reference: [
      {
        id: 'CAPEC-86',
        name: 'XSS via HTTP Headers',
        url: 'https://capec.mitre.org/data/definitions/86.html',
      },
      {
        id: 'CAPEC-243',
        name: 'XSS Targeting HTML Attributes',
        url: 'https://capec.mitre.org/data/definitions/243.html',
      },
      {
        id: 'WSTG-BUSL-09',
        name: 'Test Upload of Malicious Files',
        url: 'https://owasp.org/www-project-web-security-testing-guide/stable/4-Web_Application_Security_Testing/10-Business_Logic_Testing/09-Test_Upload_of_Malicious_Files',
      },
    ],
    createdAt: now - 100000,
    updatedAt: now - 100000,
  },
  {
    id: 'tc-006',
    workspaceId: MOCK_WORKSPACE_ID,
    generationSessionId: MOCK_SESSION_ID,
    name: 'XSS Filter Bypass with Unicode',
    targetComponent: 'Search query parameter reflected in results page',
    description:
      'Tests whether the XSS filter can be bypassed using Unicode encoding, HTML entities, or mixed-case tag names.',
    preconditions:
      '- Application reflects user input in search results\n- Input validation/filtering is in place but may be bypassable\n- HTML entities and case-insensitive tags are not normalized',
    guidance:
      '1. Submit search queries with various encoding bypasses\n2. Test mixed-case tag names (ScRiPt)\n3. Test HTML entity encoding (&#x3C;)\n4. Test Unicode encoding variations\n5. Observe which payloads execute',
    expectedBehavior:
      'XSS filter should normalize input before checking (case-insensitive matching, decode entities) and block all variations.',
    reference: [
      {
        id: 'CAPEC-71',
        name: 'Using Unicode Encoding to Bypass Validation Logic',
        url: 'https://capec.mitre.org/data/definitions/71.html',
      },
      {
        id: 'WSTG-INPV-01',
        name: 'Testing for Reflected Cross Site Scripting',
        url: 'https://owasp.org/www-project-web-security-testing-guide/stable/4-Web_Application_Security_Testing/07-Input_Validation_Testing/01-Testing_for_Reflected_Cross_Site_Scripting',
      },
    ],
    createdAt: now - 50000,
    updatedAt: now - 50000,
  },
];
