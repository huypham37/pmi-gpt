# Testing for Cookies Attributes

---
id: WSTG-SESS-02
tag: TA
---

## Brief Summary

Web Cookies (herein referred to as cookies) are often a key attack vector for malicious users (typically targeting other users) and the application should always take due diligence to protect cookies. HTTP is a stateless protocol, meaning that it doesn't hold any reference to requests being sent by the same user. In order to fix this issue, sessions were created and appended to HTTP requests.
