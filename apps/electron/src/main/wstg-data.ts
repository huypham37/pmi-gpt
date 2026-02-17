/**
 * Static OWASP Web Security Testing Guide (WSTG) entry list.
 * Used by the RAG flow to let LMStudio select relevant entries for a given attack vector.
 *
 * @see https://owasp.org/www-project-web-security-testing-guide/v42/
 */

export interface WSTGEntry {
  id: string
  name: string
  description: string
  url: string
}

export const WSTG_ENTRIES: WSTGEntry[] = [
  {
    id: 'WSTG-INFO-01',
    name: 'Conduct Search Engine Discovery Reconnaissance for Information Leakage',
    description:
      'In order for search engines to work, computer programs (or robots) regularly fetch data (referred to as crawling from billions of pages on the web.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/01-Information_Gathering/',
  },
  {
    id: 'WSTG-INFO-02',
    name: 'Fingerprint Web Server',
    description:
      'Web server fingerprinting is the task of identifying the type and version of web server that a target is running on.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/01-Information_Gathering/',
  },
  {
    id: 'WSTG-INFO-03',
    name: 'Review Webserver Metafiles for Information Leakage',
    description:
      'This section describes how to test various metadata files for information leakage of the web application\'s path(s), or functionality.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/01-Information_Gathering/',
  },
  {
    id: 'WSTG-INFO-04',
    name: 'Enumerate Applications on Webserver',
    description:
      'A paramount step in testing for web application vulnerabilities is to find out which particular applications are hosted on a web server.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/01-Information_Gathering/',
  },
  {
    id: 'WSTG-INFO-05',
    name: 'Review Webpage Content for Information Leakage',
    description:
      'It is very common, and even recommended, for programmers to include detailed comments and metadata on their source code.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/01-Information_Gathering/',
  },
  {
    id: 'WSTG-INFO-06',
    name: 'Identify Application Entry Points',
    description:
      'Enumerating the application and its attack surface is a key precursor before any thorough testing can be undertaken, as it allows the tester to identify likely areas of weakness.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/01-Information_Gathering/',
  },
  {
    id: 'WSTG-INFO-07',
    name: 'Map Execution Paths Through Application',
    description:
      'Before commencing security testing, understanding the structure of the application is paramount.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/01-Information_Gathering/',
  },
  {
    id: 'WSTG-INFO-08',
    name: 'Fingerprint Web Application Framework',
    description:
      'There is nothing new under the sun, and nearly every web application that one may think of developing has already been developed.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/01-Information_Gathering/',
  },
  {
    id: 'WSTG-INFO-09',
    name: 'Fingerprint Web Application',
    description:
      'This test checks for security vulnerabilities in the application.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/01-Information_Gathering/',
  },
  {
    id: 'WSTG-INFO-10',
    name: 'Map Application Architecture',
    description:
      'The complexity of interconnected and heterogeneous web infrastructure can include hundreds of web applications and makes configuration management and review a fundamental step in testing and deploying...',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/01-Information_Gathering/',
  },
  {
    id: 'WSTG-CONF-01',
    name: 'Test Network Infrastructure Configuration',
    description:
      'The intrinsic complexity of interconnected and heterogeneous web server infrastructure, which can include hundreds of web applications, makes configuration management and review a fundamental step in...',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/',
  },
  {
    id: 'WSTG-CONF-02',
    name: 'Test Application Platform Configuration',
    description:
      'Proper configuration of the single elements that make up an application architecture is important in order to prevent mistakes that might compromise the security of the whole architecture.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/',
  },
  {
    id: 'WSTG-CONF-03',
    name: 'Test File Extensions Handling for Sensitive Information',
    description:
      'File extensions are commonly used in web servers to easily determine which technologies, languages and plugins must be used to fulfill the web request.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/',
  },
  {
    id: 'WSTG-CONF-04',
    name: 'Review Old Backup and Unreferenced Files for Sensitive Information',
    description:
      'While most of the files within a web server are directly handled by the server itself, it isn\'t uncommon to find unreferenced or forgotten files that can be used to obtain important information about...',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/',
  },
  {
    id: 'WSTG-CONF-05',
    name: 'Enumerate Infrastructure and Application Admin Interfaces',
    description:
      'Administrator interfaces may be present in the application or on the application server to allow certain users to undertake privileged activities on the site.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/',
  },
  {
    id: 'WSTG-CONF-06',
    name: 'Test HTTP Methods',
    description:
      'HTTP offers a number of methods that can be used to perform actions on the web server (the HTTP 1.1 standard refers to them as methods but they are also commonly described as verbs).',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/',
  },
  {
    id: 'WSTG-CONF-07',
    name: 'Test HTTP Strict Transport Security',
    description:
      'The HTTP Strict Transport Security (HSTS) feature lets a web application inform the browser through the use of a special response header that it should never establish a connection to the specified do...',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/',
  },
  {
    id: 'WSTG-CONF-08',
    name: 'Test RIA Cross Domain Policy',
    description:
      'Rich Internet Applications (RIA) have adopted Adobe\'s crossdomain.xml policy files to allow for controlled cross domain access to data and service consumption using technologies such as Oracle Java, S...',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/',
  },
  {
    id: 'WSTG-CONF-09',
    name: 'Test File Permission',
    description:
      'When a resource is given a permissions setting that provides access to a wider range of actors than required, it could lead to the exposure of sensitive information, or the modification of that resour...',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/',
  },
  {
    id: 'WSTG-CONF-10',
    name: 'Test for Subdomain Takeover',
    description:
      'A successful exploitation of this kind of vulnerability allows an adversary to claim and take control of the victim\'s subdomain. This attack relies on the following: 1.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/',
  },
  {
    id: 'WSTG-CONF-11',
    name: 'Test Cloud Storage',
    description:
      'Cloud storage services facilitate web application and services to store and access objects in the storage service.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/',
  },
  {
    id: 'WSTG-IDNT-01',
    name: 'Test Role Definitions',
    description:
      'Applications have several types of functionalities and services, and those require access permissions based on the needs of the user.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/03-Identity_Management_Testing/',
  },
  {
    id: 'WSTG-IDNT-02',
    name: 'Test User Registration Process',
    description:
      'Some websites offer a user registration process that automates (or semi-automates) the provisioning of system access to users.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/03-Identity_Management_Testing/',
  },
  {
    id: 'WSTG-IDNT-03',
    name: 'Test Account Provisioning Process',
    description:
      'The provisioning of accounts presents an opportunity for an attacker to create a valid account without application of the proper identification and authorization process.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/03-Identity_Management_Testing/',
  },
  {
    id: 'WSTG-IDNT-04',
    name: 'Testing for Account Enumeration and Guessable User Account',
    description:
      'The scope of this test is to verify if it is possible to collect a set of valid usernames by interacting with the authentication mechanism of the application.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/03-Identity_Management_Testing/',
  },
  {
    id: 'WSTG-IDNT-05',
    name: 'Testing for Weak or Unenforced Username Policy',
    description:
      'User account names are often highly structured (e.g. Joe Bloggs account name is jbloggs and Fred Nurks account name is fnurks) and valid account names can easily be guessed.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/03-Identity_Management_Testing/',
  },
  {
    id: 'WSTG-ATHN-01',
    name: 'Testing for Credentials Transported over an Encrypted Channel',
    description:
      'Testing for credentials transport verifies that web applications encrypt authentication data in transit. This encryption prevents attackers from taking over accounts by sniffing network traffic.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/04-Authentication_Testing/',
  },
  {
    id: 'WSTG-ATHN-02',
    name: 'Testing for Default Credentials',
    description:
      'Nowadays web applications often make use of popular Open Source or commercial software that can be installed on servers with minimal configuration or customization by the server administrator.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/04-Authentication_Testing/',
  },
  {
    id: 'WSTG-ATHN-03',
    name: 'Testing for Weak Lock Out Mechanism',
    description:
      'Account lockout mechanisms are used to mitigate brute force attacks. Some of the attacks that can be defeated by using lockout mechanism: - Login password or username guessing attack.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/04-Authentication_Testing/',
  },
  {
    id: 'WSTG-ATHN-04',
    name: 'Testing for Bypassing Authentication Schema',
    description:
      'In computer security, authentication is the process of attempting to verify the digital identity of the sender of a communication. A common example of such a process is the log on process.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/04-Authentication_Testing/',
  },
  {
    id: 'WSTG-ATHN-05',
    name: 'Testing for Vulnerable Remember Password',
    description:
      'Credentials are the most widely used authentication technology.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/04-Authentication_Testing/',
  },
  {
    id: 'WSTG-ATHN-06',
    name: 'Testing for Browser Cache Weaknesses',
    description:
      'In this phase the tester checks that the application correctly instructs the browser to not retain sensitive data. Browsers can store information for purposes of caching and history.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/04-Authentication_Testing/',
  },
  {
    id: 'WSTG-ATHN-07',
    name: 'Testing for Weak Password Policy',
    description:
      'The most prevalent and most easily administered authentication mechanism is a static password.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/04-Authentication_Testing/',
  },
  {
    id: 'WSTG-ATHN-08',
    name: 'Testing for Weak Security Question Answer',
    description:
      'Often called "secret" questions and answers, security questions and answers are often used to recover forgotten passwords (see Testing for weak password change or reset functionalities, or as extra se...',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/04-Authentication_Testing/',
  },
  {
    id: 'WSTG-ATHN-09',
    name: 'Testing for Weak Password Change or Reset Functionalities',
    description:
      'The password change and reset function of an application is a self-service password change or reset mechanism for users.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/04-Authentication_Testing/',
  },
  {
    id: 'WSTG-ATHN-10',
    name: 'Testing for Weaker Authentication in Alternative Channel',
    description:
      'Even if the primary authentication mechanisms do not include any vulnerabilities, it may be that vulnerabilities exist in alternative legitimate authentication user channels for the same user accounts...',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/04-Authentication_Testing/',
  },
  {
    id: 'WSTG-ATHZ-01',
    name: 'Testing Directory Traversal File Include',
    description:
      'Many web applications use and manage files as part of their daily operation.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/05-Authorization_Testing/',
  },
  {
    id: 'WSTG-ATHZ-02',
    name: 'Testing for Bypassing Authorization Schema',
    description:
      'This kind of test focuses on verifying how the authorization schema has been implemented for each role or privilege to get access to reserved functions and resources.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/05-Authorization_Testing/',
  },
  {
    id: 'WSTG-ATHZ-03',
    name: 'Testing for Privilege Escalation',
    description:
      'This section describes the issue of escalating privileges from one stage to another.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/05-Authorization_Testing/',
  },
  {
    id: 'WSTG-ATHZ-04',
    name: 'Testing for Insecure Direct Object References',
    description:
      'Insecure Direct Object References (IDOR) occur when an application provides direct access to objects based on user-supplied input.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/05-Authorization_Testing/',
  },
  {
    id: 'WSTG-SESS-01',
    name: 'Testing for Session Management Schema',
    description:
      'One of the core components of any web-based application is the mechanism by which it controls and maintains the state for a user interacting with it.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/06-Session_Management_Testing/',
  },
  {
    id: 'WSTG-SESS-02',
    name: 'Testing for Cookies Attributes',
    description:
      'Web Cookies (herein referred to as cookies) are often a key attack vector for malicious users (typically targeting other users) and the application should always take due diligence to protect cookies.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/06-Session_Management_Testing/',
  },
  {
    id: 'WSTG-SESS-03',
    name: 'Testing for Session Fixation',
    description:
      'Session fixation is enabled by the insecure practice of preserving the same value of the session cookies before and after authentication.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/06-Session_Management_Testing/',
  },
  {
    id: 'WSTG-SESS-04',
    name: 'Testing for Exposed Session Variables',
    description:
      'The Session Tokens (Cookie, SessionID, Hidden Field), if exposed, will usually enable an attacker to impersonate a victim and access the application illegitimately.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/06-Session_Management_Testing/',
  },
  {
    id: 'WSTG-SESS-05',
    name: 'Testing for Cross Site Request Forgery',
    description:
      'Cross-Site Request Forgery (CSRF) is an attack that forces an end user to execute unintended actions on a web application in which they are currently authenticated.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/06-Session_Management_Testing/',
  },
  {
    id: 'WSTG-SESS-06',
    name: 'Testing for Logout Functionality',
    description:
      'Session termination is an important part of the session lifecycle. Reducing to a minimum the lifetime of the session tokens decreases the likelihood of a successful session hijacking attack.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/06-Session_Management_Testing/',
  },
  {
    id: 'WSTG-SESS-07',
    name: 'Testing Session Timeout',
    description:
      'In this phase testers check that the application automatically logs out a user when that user has been idle for a certain amount of time, ensuring that it is not possible to "reuse" the same session a...',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/06-Session_Management_Testing/',
  },
  {
    id: 'WSTG-SESS-08',
    name: 'Testing for Session Puzzling',
    description:
      'Session Variable Overloading (also known as Session Puzzling) is an application level vulnerability which can enable an attacker to perform a variety of malicious actions, including but not limited to...',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/06-Session_Management_Testing/',
  },
  {
    id: 'WSTG-SESS-09',
    name: 'Testing for Session Hijacking',
    description:
      'An attacker who gets access to user session cookies can impersonate them by presenting such cookies. This attack is known as session hijacking.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/06-Session_Management_Testing/',
  },
  {
    id: 'WSTG-INPV-01',
    name: 'Testing for Reflected Cross Site Scripting',
    description:
      'Reflected Cross-site Scripting (XSS) occur when an attacker injects browser executable code within a single HTTP response.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-02',
    name: 'Testing for Stored Cross Site Scripting',
    description:
      'Stored Cross-site Scripting (XSS) is the most dangerous type of Cross Site Scripting. Web applications that allow users to store data are potentially exposed to this type of attack.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-03',
    name: 'Testing for HTTP Verb Tampering',
    description:
      'This test checks for security vulnerabilities in the application.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-04',
    name: 'Testing for HTTP Parameter Pollution',
    description:
      'HTTP Parameter Pollution tests the applications response to receiving multiple HTTP parameters with the same name; for example, if the parameter username is included in the GET or POST parameters twic...',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-05',
    name: 'Testing for SQL Injection',
    description:
      'SQL injection testing checks if it is possible to inject data into the application so that it executes a user-controlled SQL query in the database.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-06',
    name: 'Testing for Oracle',
    description:
      'Web based PL/SQL applications are enabled by the PL/SQL Gateway, which is is the component that translates web requests into database queries.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-07',
    name: 'Testing for MySQL',
    description:
      'SQL Injection vulnerabilities occur whenever input is used in the construction of a SQL query without being adequately constrained or sanitized.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-08',
    name: 'Testing for SQL Server',
    description:
      'In this section some SQL Injection techniques that utilize specific features of Microsoft SQL Server will be discussed.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-09',
    name: 'Testing PostgreSQL',
    description:
      'In this section, some SQL Injection techniques for PostgreSQL will be discussed.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-10',
    name: 'Testing for MS Access',
    description:
      'As explained in the generic SQL injection section, SQL injection vulnerabilities occur whenever user-supplied input is used during the construction of a SQL query without being adequately constrained...',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-11',
    name: 'Testing for NoSQL Injection',
    description:
      'NoSQL databases provide looser consistency restrictions than traditional SQL databases.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-12',
    name: 'Testing for ORM Injection',
    description:
      'Object Relational Mapping (ORM) Injection is an attack using SQL Injection against an ORM generated data access object model.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-13',
    name: 'Testing for Client-side',
    description:
      'Client-side SQL injection occurs when an application implements the Web SQL Database technology and doesn\'t properly validate the input nor parametrize its query variables.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-14',
    name: 'Testing for LDAP Injection',
    description:
      'The Lightweight Directory Access Protocol (LDAP) is used to store information about users, hosts, and many other objects.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-15',
    name: 'Testing for XML Injection',
    description:
      'XML Injection testing is when a tester tries to inject an XML doc to the application. If the XML parser fails to contextually validate data, then the test will yield a positive result.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-16',
    name: 'Testing for SSI Injection',
    description:
      'Web servers usually give developers the ability to add small pieces of dynamic code inside static HTML pages, without having to deal with full-fledged server-side or client-side languages.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-17',
    name: 'Testing for XPath Injection',
    description:
      'XPath is a language that has been designed and developed primarily to address parts of an XML document.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-18',
    name: 'Testing for IMAP SMTP Injection',
    description:
      'This threat affects all applications that communicate with mail servers (IMAP/SMTP), generally webmail applications.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-19',
    name: 'Testing for Code Injection',
    description:
      'This section describes how a tester can check if it is possible to enter code as input on a web page and have it executed by the web server.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-20',
    name: 'Testing for Local File Inclusion',
    description:
      'The File Inclusion vulnerability allows an attacker to include a file, usually exploiting a "dynamic file inclusion" mechanisms implemented in the target application.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-21',
    name: 'Testing for Remote File Inclusion',
    description:
      'The File Inclusion vulnerability allows an attacker to include a file, usually exploiting a "dynamic file inclusion" mechanisms implemented in the target application.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-22',
    name: 'Testing for Command Injection',
    description:
      'This article describes how to test an application for OS command injection. The tester will try to inject an OS command through an HTTP request to the application.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-23',
    name: 'Testing for Format String Injection',
    description:
      'A format string is a null-terminated character sequence that also contains conversion specifiers interpreted or converted at runtime.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-24',
    name: 'Testing for Incubated Vulnerability',
    description:
      'Also often referred to as persistent attacks, incubated testing is a complex testing method that needs more than one data validation vulnerability to work.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-25',
    name: 'Testing for HTTP Splitting Smuggling',
    description:
      'This section illustrates examples of attacks that leverage specific features of the HTTP protocol, either by exploiting weaknesses of the web application or peculiarities in the way different agents i...',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-26',
    name: 'Testing for HTTP Incoming Requests',
    description:
      'This section describes how to monitor all incoming/outgoing HTTP requests on both client-side or server-side.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-27',
    name: 'Testing for Host Header Injection',
    description:
      'A web server commonly hosts several web applications on the same IP address, referring to each application via the virtual host.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-28',
    name: 'Testing for Server-side Template Injection',
    description:
      'Web applications commonly use server-side templating technologies (Jinja2, Twig, FreeMaker, etc.) to generate dynamic HTML responses.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-INPV-29',
    name: 'Testing for Server-Side Request Forgery',
    description:
      'Web applications often interact with internal or external resources.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
  },
  {
    id: 'WSTG-ERRH-01',
    name: 'Testing for Improper Error Handling',
    description:
      'All types of applications (web apps, web servers, databases, etc.) will generate errors for various reasons.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/08-Testing_for_Error_Handling/',
  },
  {
    id: 'WSTG-ERRH-02',
    name: 'Testing for Stack Traces',
    description:
      'This test checks for security vulnerabilities in the application.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/08-Testing_for_Error_Handling/',
  },
  {
    id: 'WSTG-CRYP-01',
    name: 'Testing for Weak Transport Layer Security',
    description:
      'When information is sent between the client and the server, it must be encrypted and protected in order to prevent an attacker from being able to read or modify it.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/09-Testing_for_Weak_Cryptography/',
  },
  {
    id: 'WSTG-CRYP-02',
    name: 'Testing for Padding Oracle',
    description:
      'A padding oracle is a function of an application which decrypts encrypted data provided by the client, e.g.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/09-Testing_for_Weak_Cryptography/',
  },
  {
    id: 'WSTG-CRYP-03',
    name: 'Testing for Sensitive Information Sent via Unencrypted Channels',
    description:
      'Sensitive data must be protected when it is transmitted through the network.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/09-Testing_for_Weak_Cryptography/',
  },
  {
    id: 'WSTG-CRYP-04',
    name: 'Testing for Weak Encryption',
    description:
      'Incorrect uses of encryption algorithms may result in sensitive data exposure, key leakage, broken authentication, insecure session, and spoofing attacks.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/09-Testing_for_Weak_Cryptography/',
  },
  {
    id: 'WSTG-BUSL-00',
    name: 'Introduction to Business Logic',
    description:
      'This test checks for security vulnerabilities in the application.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/10-Business_Logic_Testing/',
  },
  {
    id: 'WSTG-BUSL-02',
    name: 'Test Business Logic Data Validation',
    description:
      'The application must ensure that only logically valid data can be entered at the front end as well as directly to the server-side of an application of system.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/10-Business_Logic_Testing/',
  },
  {
    id: 'WSTG-BUSL-03',
    name: 'Test Ability to Forge Requests',
    description:
      'Forging requests is a method that attackers use to circumvent the front end GUI application to directly submit information for back end processing.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/10-Business_Logic_Testing/',
  },
  {
    id: 'WSTG-BUSL-04',
    name: 'Test Integrity Checks',
    description:
      'Many applications are designed to display different fields depending on the user of situation by leaving some inputs hidden.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/10-Business_Logic_Testing/',
  },
  {
    id: 'WSTG-BUSL-05',
    name: 'Test for Process Timing',
    description:
      'It is possible that attackers can gather information on an application by monitoring the time it takes to complete a task or give a respond.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/10-Business_Logic_Testing/',
  },
  {
    id: 'WSTG-BUSL-06',
    name: 'Test Number of Times a Function Can Be Used Limits',
    description:
      'Many of the problems that applications are solving require limits to the number of times a function can be used or action can be executed.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/10-Business_Logic_Testing/',
  },
  {
    id: 'WSTG-BUSL-07',
    name: 'Testing for the Circumvention of Work Flows',
    description:
      'Workflow vulnerabilities involve any type of vulnerability that allows the attacker to misuse an application/system in a way that will allow them to circumvent (not follow) the designed/intended workf...',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/10-Business_Logic_Testing/',
  },
  {
    id: 'WSTG-BUSL-08',
    name: 'Test Defenses Against Application Misuse',
    description:
      'The misuse and invalid use of of valid functionality can identify attacks attempting to enumerate the web application, identify weaknesses, and exploit vulnerabilities.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/10-Business_Logic_Testing/',
  },
  {
    id: 'WSTG-BUSL-09',
    name: 'Test Upload of Unexpected File Types',
    description:
      'Many applications\' business processes allow for the upload and manipulation of data that is submitted via files.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/10-Business_Logic_Testing/',
  },
  {
    id: 'WSTG-BUSL-10',
    name: 'Test Upload of Malicious Files',
    description:
      'Many application’s business processes allow users to upload data to them.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/10-Business_Logic_Testing/',
  },
  {
    id: 'WSTG-CLNT-01',
    name: 'Testing for DOM-Based Cross Site Scripting',
    description:
      'DOM-based cross-site scripting is the de-facto name for XSS bugs that are the result of active browser-side content on a page, typically JavaScript, obtaining user input through a source and using it...',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/11-Client-side_Testing/',
  },
  {
    id: 'WSTG-CLNT-02',
    name: 'Testing for JavaScript Execution',
    description:
      'A JavaScript injection vulnerability is a subtype of cross site scripting (XSS) that involves the ability to inject arbitrary JavaScript code that is executed by the application inside the victim\'s br...',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/11-Client-side_Testing/',
  },
  {
    id: 'WSTG-CLNT-03',
    name: 'Testing for HTML Injection',
    description:
      'HTML injection is a type of injection vulnerability that occurs when a user is able to control an input point and is able to inject arbitrary HTML code into a vulnerable web page.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/11-Client-side_Testing/',
  },
  {
    id: 'WSTG-CLNT-04',
    name: 'Testing for Client-side URL Redirect',
    description:
      'This section describes how to check for client-side URL redirection, also known as open redirection.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/11-Client-side_Testing/',
  },
  {
    id: 'WSTG-CLNT-05',
    name: 'Testing for CSS Injection',
    description:
      'A CSS Injection vulnerability involves the ability to inject arbitrary CSS code in the context of a trusted web site which is rendered inside a victim\'s browser.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/11-Client-side_Testing/',
  },
  {
    id: 'WSTG-CLNT-06',
    name: 'Testing for Client-side Resource Manipulation',
    description:
      'A client-side resource manipulation vulnerability is an input validation flaw.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/11-Client-side_Testing/',
  },
  {
    id: 'WSTG-CLNT-07',
    name: 'Testing Cross Origin Resource Sharing',
    description:
      'Cross origin resource sharing (CORS) is a mechanism that enables a web browser to perform cross-domain requests using the XMLHttpRequest L2 API in a controlled manner.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/11-Client-side_Testing/',
  },
  {
    id: 'WSTG-CLNT-08',
    name: 'Testing for Cross Site Flashing',
    description:
      'ActionScript, based on ECMAScript, is the language used by Flash applications when dealing with interactive needs. There are three versions of the ActionScript language.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/11-Client-side_Testing/',
  },
  {
    id: 'WSTG-CLNT-09',
    name: 'Testing for Clickjacking',
    description:
      'Clickjacking, a subset of UI redressing, is a malicious technique whereby a web user is deceived into interacting (in most cases by clicking) with something other than what the user believes they are...',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/11-Client-side_Testing/',
  },
  {
    id: 'WSTG-CLNT-10',
    name: 'Testing WebSockets',
    description:
      'Traditionally, the HTTP protocol only allows one request/response per TCP connection.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/11-Client-side_Testing/',
  },
  {
    id: 'WSTG-CLNT-11',
    name: 'Testing Web Messaging',
    description:
      'Web Messaging (also known as Cross Document Messaging) allows applications running on different domains to communicate in a secure manner.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/11-Client-side_Testing/',
  },
  {
    id: 'WSTG-CLNT-12',
    name: 'Testing Browser Storage',
    description:
      'Browsers provide the following client-side storage mechanisms for developers to store and retrieve data: - Local Storage - Session Storage - IndexedDB - Web SQL (Deprecated) - Cookies These storage me...',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/11-Client-side_Testing/',
  },
  {
    id: 'WSTG-CLNT-13',
    name: 'Testing for Cross Site Script Inclusion',
    description:
      'Cross Site Script Inclusion (XSSI) vulnerability allows sensitive data leakage across-origin or cross-domain boundaries.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/11-Client-side_Testing/',
  },
  {
    id: 'WSTG-API-01',
    name: 'Testing GraphQL',
    description:
      'This test checks for security vulnerabilities in the application.',
    url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/12-API_Testing/',
  },
]

