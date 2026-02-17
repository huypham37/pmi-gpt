# Testing for IMAP SMTP Injection

---
id: WSTG-INPV-18
tag: TA
---

## Brief Summary

This threat affects all applications that communicate with mail servers (IMAP/SMTP), generally webmail applications. The aim of this test is to verify the capacity to inject arbitrary IMAP/SMTP commands into the mail servers, due to input data not being properly sanitized. The IMAP/SMTP Injection technique is more effective if the mail server is not directly accessible from Internet.
