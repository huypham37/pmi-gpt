# Testing for HTTP Parameter Pollution

---
id: WSTG-INPV-04
tag: TA
---

## Brief Summary

HTTP Parameter Pollution tests the applications response to receiving multiple HTTP parameters with the same name; for example, if the parameter `username` is included in the GET or POST parameters twice. Supplying multiple HTTP parameters with the same name may cause an application to interpret values in unanticipated ways.
