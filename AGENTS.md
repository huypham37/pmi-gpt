## Description:

You are working on an application names pmi-agent, the main goal of this application is to provide a UI for AI agent, it is backed by Opencode as backend agent framework. The app (client) communicates with opencode via Agent-Client Protocol (ACP).

## IMPORTANT: 
This describes the important decision that you should an should not do in the period of the session:
SHOULD NOT:
* Do not create unnessary file (report,etc) if user did not ask for.
## Memory
The application memory is structured into two different level. 
1. Issue-based memory: You can find the memory at .opencode/.memory/issue/*.md
2. Project memory: the project memory you can find it here.

### Memory Schema:
Current Step: Brief desc on the current step
(Optional) Plan
Next immediate: Brief desc on the next immediate step
(Optional) Current issues: Brief Description on current issues
Tried approach n | status | why it failed (Optional)
If current issues exists: 

Note:
* Update the memory as frequent as possible.

## References:
2. Find more about Opencode at: https://opencode.ai/docs
1. Find more about Agent Client Protocol at: https://agentclientprotocol.com/get-started/introduction
