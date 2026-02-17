# Testing for Session Fixation

---
id: WSTG-SESS-03
tag: TA
---

## Brief Summary

Session fixation is enabled by the insecure practice of preserving the same value of the session cookies before and after authentication. This typically happens when session cookies are used to store state information even before login, e.g., to add items to a shopping cart before authenticating for payment.
