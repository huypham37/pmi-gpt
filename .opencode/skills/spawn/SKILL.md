---
name: spawn
description: Using this skill when you need to either create or working on the issue user mentions.
---

# Goal
Set up the environment to work on an existing GitHub Issue by creating a persistent Memory Plan and a separate branch.

# Usage
```
/spawn <issue-number>
```

# Steps

0. You must call Oracle for this task.

1.  **Fetch Issue Details**:
    - Run `gh issue view $1 --json number,title,body,url`
    - Extract the **Issue Number**, **Title**, **Body**, and **URL**.

2.  **Create Memory Plan**:
    - Ensure the directory exists: `mkdir -p .opencode/.memory/issues`.
    - Create the file `.opencode/.memory/<ISSUE_NUMBER>.md`.
    - **Content Template**:
      ```markdown
      # ACTIVE MEMORY: Issue #<ISSUE_NUMBER>
      ## Link
      [Insert GitHub Issue URL]
      
      ## Context & Goal
      [Insert the Issue Body]

      ## Plan
      - [ ] Setup branch and environment
      - [ ] <Agent: Add specific steps based on the issue>

      ## Progress Log
      ### [YYYY-MM-DD] Initialization
      - Spawned from issue #<ISSUE_NUMBER>.
      - Branch created.
      ```

3.  **Create Git branch**:
    - Define a branch name: `feature/<ISSUE_NUMBER>-<short-slug-title>` (e.g., `feature/123-fix-login`).

4.  **Handover**:
    - Inform the user of the new Environment.
    - **IMPORTANT**: Provide the exact command to switch to the new agent:
      "✅ **Spawn Complete!**
      Issue: #<ISSUE_NUMBER>
      Memory: `.opencode/.memory/issues/<ISSUE_NUMBER>.md`

