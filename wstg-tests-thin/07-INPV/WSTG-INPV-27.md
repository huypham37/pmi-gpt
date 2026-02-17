# Testing for Host Header Injection

---
id: WSTG-INPV-27
tag: TA
---

## Brief Summary

A web server commonly hosts several web applications on the same IP address, referring to each application via the virtual host. In an incoming HTTP request, web servers often dispatch the request to the target virtual host based on the value supplied in the Host header.
