# Testing WebSockets

---
id: WSTG-CLNT-10
tag: TA
---

## Brief Summary

Traditionally, the HTTP protocol only allows one request/response per TCP connection. Asynchronous JavaScript and XML (AJAX) allows clients to send and receive data asynchronously (in the background without a page refresh) to the server, however, AJAX requires the client to initiate the requests and wait for the server responses (half-duplex). [WebSockets](https://html.spec.whatwg.
