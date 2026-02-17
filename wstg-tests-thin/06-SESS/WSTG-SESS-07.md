# Testing Session Timeout

---
id: WSTG-SESS-07
tag: TA
---

## Brief Summary

In this phase testers check that the application automatically logs out a user when that user has been idle for a certain amount of time, ensuring that it is not possible to "reuse" the same session and that no sensitive data remains stored in the browser cache. All applications should implement an idle or inactivity timeout for sessions.
