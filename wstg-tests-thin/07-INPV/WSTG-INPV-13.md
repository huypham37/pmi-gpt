# Testing for Client-side

---
id: WSTG-INPV-13
tag: TA
---

## Brief Summary

Client-side SQL injection occurs when an application implements the [Web SQL Database](https://www.w3.org/TR/webdatabase/) technology and doesn't properly validate the input nor parametrize its query variables. This database is manipulated by using JavaScript (JS) API calls, such as `openDatabase()`, which creates or opens an existing database.
