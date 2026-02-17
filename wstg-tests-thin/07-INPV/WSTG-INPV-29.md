# Testing for Server-Side Request Forgery

---
id: WSTG-INPV-29
tag: TA
---

## Brief Summary

Web applications often interact with internal or external resources. While you may expect that only the intended resource will be handling the data you send, improperly handled data may create a situation where injection attacks are possible. One type of injection attack is called Server-side Request Forgery (SSRF).
