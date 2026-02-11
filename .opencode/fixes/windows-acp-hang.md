# Fix: Windows ACP Prompt Hang

**Date:** 2026-02-11  
**Affected:** `opencode acp` on native Windows (all tested versions: 1.1.53, 1.1.56)  
**Status:** Workaround applied (upstream issue in opencode)

## Problem

When running `opencode acp` as a subprocess on native Windows via Python's `subprocess.Popen`, the `session/prompt` step hangs indefinitely. The process stays alive but produces zero output after the prompt is sent.

- `initialize` (step 1) — works fine
- `session/new` (step 2) — works fine
- `session/prompt` (step 3) — **hangs**, process alive, queue empty, no stdout/stderr

The same script and same model work correctly on Linux/WSL.

## Investigation

1. **Not a version issue** — Tested both v1.1.53 and v1.1.56 on Windows, both hang.
2. **Not a model issue** — Same models (`opencode/big-pickle`, `github-copilot/gpt-5-mini`) work on WSL.
3. **Not a pipe/protocol issue** — Sending an intentionally wrong payload (`"parts"` instead of `"prompt"`) returns an immediate JSON-RPC error, proving stdin/stdout communication works.
4. **Not a field name issue** — The correct field is `"prompt"` (confirmed by error when using `"parts"`).
5. **TUI works on Windows** — `opencode` interactive terminal works fine on the same machine.
6. **Terminal-dependent** — Behavior may vary between terminals (PowerShell vs Alacritty).

## Root Cause

The native Windows `opencode.exe` ACP mode has an issue handling the `session/prompt` step when invoked via subprocess stdio pipes. The exact cause is in the opencode binary — the prompt triggers LLM calls and workspace file reads that behave differently in Windows subprocess mode vs interactive TUI mode.

Related upstream issues:
- [anomalyco/opencode#6573](https://github.com/sst/opencode/issues/6573) — Sessions hang via ACP/API while TUI works
- [anomalyco/opencode#5627](https://github.com/sst/opencode/issues/5627) — ACP event subscription architecture issues
- OpenCode docs recommend WSL for Windows: https://opencode.ai/docs/windows-wsl/

## Fix Applied

Route `opencode acp` through WSL on Windows instead of using native `opencode.exe`.

### How it works

In `.opencode/skills/acp/test-acp.py`:

```python
def _get_opencode_cmd():
    if platform.system() == "Windows":
        wsl_bin = shutil.which("wsl")
        # Find opencode inside WSL via bash -ic (interactive, loads PATH)
        result = subprocess.run(
            [wsl_bin, "bash", "-ic", "which opencode 2>/dev/null"],
            capture_output=True, text=True, timeout=10,
        )
        wsl_opencode = result.stdout.strip()
        # Fallback: check known install path
        if not wsl_opencode or "/" not in wsl_opencode:
            wsl_user = subprocess.run(
                [wsl_bin, "whoami"], capture_output=True, text=True, timeout=5,
            ).stdout.strip()
            wsl_opencode = f"/home/{wsl_user}/.opencode/bin/opencode"
        return [wsl_bin, wsl_opencode, "acp"], True  # use_wsl=True
    else:
        return [shutil.which("opencode"), "acp"], False
```

### Key details

1. **Binary discovery:** WSL non-interactive shells don't load `.bashrc`/`.zshrc`, so `wsl opencode` fails with "command not found". Fix: use `bash -ic` (interactive flag) to resolve the path, then call the absolute path.

2. **Path conversion:** Windows paths must be converted for the `session/new` cwd parameter:
   ```python
   def _win_to_wsl_path(win_path):
       path = win_path.replace("\\", "/")
       if len(path) >= 2 and path[1] == ":":
           drive = path[0].lower()
           path = f"/mnt/{drive}{path[2:]}"
       return path
   ```
   Example: `C:\Users\huy.pham\project` → `/mnt/c/Users/huy.pham/project`

3. **Subprocess cwd:** The `Popen(cwd=...)` parameter stays as the Windows path (Python needs it), but the JSON-RPC `session/new` cwd uses the WSL path.

## Requirements for Windows Users

- WSL installed (`wsl --install`)
- opencode installed inside WSL (`curl -fsSL https://opencode.ai/install | bash`)
- opencode authenticated inside WSL (`opencode auth login`)

## Files Changed

- `.opencode/skills/acp/test-acp.py` — Added WSL bridge for Windows
- `scripts/test-acp.py` — Linux-native test script (no WSL needed)
