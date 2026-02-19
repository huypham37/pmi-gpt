"""
Isolated test: send the augmented test-case prompt to OpenCode via ACP.

Builds the same prompt the app sends in Pass 2, then pipes it through
opencode acp with model=lmstudio/qwen3-4b-mlx and mode=testcase-generator.

Usage:
    python3 .opencode/skills/test-case-generation/test-gen-acp.py
    python3 .opencode/skills/test-case-generation/test-gen-acp.py --attack "SQL injection"
    python3 .opencode/skills/test-case-generation/test-gen-acp.py --model lmstudio/qwen3-4b-mlx
    python3 .opencode/skills/test-case-generation/test-gen-acp.py --debug
"""

import subprocess
import json
import sys
import os
import argparse
import threading
import queue
import time
import shutil
import platform

_response_queue = queue.Queue()
_reader_started = False
_debug = False

DEFAULT_MODEL = "lmstudio/qwen3-4b-mlx"
DEFAULT_MODE = "testcase-generator"
DEFAULT_ATTACK = "create test case for xss"

# Hardcoded WSTG selection for XSS (same as what LMStudio returns)
DEFAULT_PRIMARY_ID = "WSTG-INPV-01"
DEFAULT_SECONDARY_IDS = ["WSTG-CLNT-01", "WSTG-CLNT-03"]

INSTRUCTIONS_TEMPLATE = """STRICT OUTPUT FORMAT — follow this exactly, no deviations:
- Do NOT include any preamble, introduction, or commentary before the first test case.
- Do NOT use markdown headings (## or ###). Use only bold field labels.
- Each test case MUST use exactly these bold field labels on separate lines:

**Name:** A descriptive test case name
**Attack Vector:** Analyze the user's attack vector "{attack_vector}" — classify and restate it as a specific attack technique (e.g. "SQL injection via search parameter", "Reflected XSS in comment field"). MUST relate to the original query.
**Target Component:** The specific component/endpoint being tested (use project context if available)
**Description:** What this test case validates
**Preconditions:** Requirements before running the test
**Guidance:**
| Step | Expected-result | Example |
|------|-----------------|---------|
| ... | ... | ... |
**Reference:**
| ID | Name | URL |
|----|------|-----|
| ... | ... | ... |

- Separate each test case with a single --- on its own line.
- Place tables immediately after their field label (no blank lines between label and table).
- Start your response directly with the first **Name:** field."""


def build_prompt(attack_vector, wstg_content):
    """Build the same augmented prompt the app builds in Pass 2."""
    primary_id = DEFAULT_PRIMARY_ID
    primary_content = wstg_content.get(primary_id, f"(No content found for {primary_id})")

    secondary_summaries = "\n".join(
        f"- **{sid}**: (secondary reference)" for sid in DEFAULT_SECONDARY_IDS
    )

    instructions = INSTRUCTIONS_TEMPLATE.format(attack_vector=attack_vector)

    return f"""Create detailed security test cases for the following attack vector: {attack_vector}

Use the following OWASP WSTG entries as context:

### Primary WSTG Reference ({primary_id})
{primary_content}

### Secondary WSTG References (for additional context)
{secondary_summaries}

{instructions}"""


def debug(msg):
    if _debug:
        print(f"  [DEBUG] {msg}", flush=True)


def _get_opencode_cmd():
    found = shutil.which("opencode")
    if found:
        return [found, "acp"]
    home = os.path.expanduser("~")
    for path in [
        os.path.join(home, ".opencode", "bin", "opencode"),
        os.path.join(home, ".bun", "bin", "opencode"),
    ]:
        if os.path.isfile(path):
            return [path, "acp"]
    print("ERROR: opencode not found in PATH")
    sys.exit(1)


def _start_reader(proc):
    global _reader_started
    if _reader_started:
        return
    _reader_started = True

    def _stdout_reader():
        try:
            while True:
                line = proc.stdout.readline()
                if not line:
                    break
                _response_queue.put(line)
        except Exception:
            pass

    def _stderr_reader():
        try:
            while True:
                line = proc.stderr.readline()
                if not line:
                    break
                line = line.strip()
                if line:
                    print(f"  [STDERR] {line}", flush=True)
        except Exception:
            pass

    threading.Thread(target=_stdout_reader, daemon=True).start()
    threading.Thread(target=_stderr_reader, daemon=True).start()


def send_jsonrpc(proc, method, params, request_id):
    msg = json.dumps({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params})
    proc.stdin.write(f"{msg}\n")
    proc.stdin.flush()
    print(f"\n>>> SENT: {method} (id={request_id})")
    debug(f"Payload: {msg[:500]}")


def read_responses(proc, timeout=10):
    _start_reader(proc)
    responses = []
    while True:
        try:
            line = _response_queue.get(timeout=timeout)
        except queue.Empty:
            break
        line = line.strip()
        if not line:
            continue
        try:
            parsed = json.loads(line)
            debug(f"<< {json.dumps(parsed)[:500]}")
            responses.append(parsed)
        except json.JSONDecodeError:
            print(f"<<< RAW: {line}")
        timeout = 1
    return responses


def read_streaming(proc, timeout=120):
    """Read streaming responses until prompt completes."""
    _start_reader(proc)
    msg_count = 0
    full_text = []
    t_start = time.time()

    while True:
        try:
            line = _response_queue.get(timeout=timeout)
        except queue.Empty:
            elapsed = time.time() - t_start
            print(f"\n  [timeout after {timeout}s, {msg_count} messages, {elapsed:.1f}s elapsed]")
            break
        line = line.strip()
        if not line:
            continue
        try:
            parsed = json.loads(line)
            msg_count += 1
            debug(f"MSG#{msg_count}: {json.dumps(parsed)[:300]}")

            if parsed.get("method") == "session/update":
                update = parsed.get("params", {}).get("update", {})
                update_type = update.get("sessionUpdate")

                if update_type == "agent_message_chunk":
                    content = update.get("content", {})
                    if isinstance(content, dict) and content.get("type") == "text":
                        text = content.get("text", "")
                        print(text, end="", flush=True)
                        full_text.append(text)

                elif update_type == "tool_call":
                    title = update.get("title", "?")
                    status = update.get("status", "?")
                    print(f"\n  [tool_call] {title} - {status}")

                elif update_type == "available_commands_update":
                    debug(f"available_commands_update")

                else:
                    debug(f"update: {update_type}")

            elif "result" in parsed:
                result = parsed["result"]
                if isinstance(result, dict) and result.get("stopReason"):
                    print(f"\n\n  [stop: {result['stopReason']}]")
                    break

            elif "error" in parsed:
                print(f"\n<<< ERROR: {json.dumps(parsed['error'], indent=2)}")

        except json.JSONDecodeError:
            print(f"<<< RAW: {line}")

    return "".join(full_text)


def main():
    global _debug

    parser = argparse.ArgumentParser(description="Test test-case generation via ACP")
    parser.add_argument("--attack", type=str, default=DEFAULT_ATTACK, help="Attack vector text")
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL, help="Model ID")
    parser.add_argument("--mode", type=str, default=DEFAULT_MODE, help="Mode ID")
    parser.add_argument("--debug", action="store_true", help="Verbose output")
    args = parser.parse_args()
    _debug = args.debug

    # Load wstg-full-content.json
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(script_dir, "..", "..", ".."))
    wstg_path = os.path.join(project_root, "apps", "electron", "src", "main", "wstg-full-content.json")

    if not os.path.exists(wstg_path):
        print(f"ERROR: {wstg_path} not found. Run: cd apps/electron && bun run build:wstg")
        sys.exit(1)

    with open(wstg_path, "r") as f:
        wstg_content = json.load(f)

    prompt = build_prompt(args.attack, wstg_content)
    char_count = len(prompt)
    est_tokens = char_count // 4

    cwd = project_root
    opencode_cmd = _get_opencode_cmd()

    print(f"=" * 60)
    print(f"Test Case Generation — ACP Isolated Test")
    print(f"=" * 60)
    print(f"  Attack vector:  {args.attack}")
    print(f"  Model:          {args.model}")
    print(f"  Mode:           {args.mode}")
    print(f"  Primary WSTG:   {DEFAULT_PRIMARY_ID}")
    print(f"  Secondary WSTG: {', '.join(DEFAULT_SECONDARY_IDS)}")
    print(f"  Prompt size:    {char_count} chars, ~{est_tokens} tokens")
    print(f"  Working dir:    {cwd}")
    print(f"  Command:        {' '.join(opencode_cmd)}")

    proc = subprocess.Popen(
        opencode_cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=cwd,
    )

    try:
        # 1. Initialize
        print(f"\n{'=' * 60}")
        print("STEP 1: Initialize")
        print(f"{'=' * 60}")
        send_jsonrpc(proc, "initialize", {
            "protocolVersion": 1,
            "clientInfo": {"name": "test-gen-acp", "title": "TestCase Gen Test", "version": "0.0.1"},
            "clientCapabilities": {
                "fs": {"readTextFile": False, "writeTextFile": False},
                "terminal": False,
            },
        }, request_id=1)
        responses = read_responses(proc, timeout=10)
        if not responses:
            print("ERROR: No response from initialize")
            return
        init_result = responses[0].get("result", {})
        agent = init_result.get("agentInfo", {})
        print(f"  Agent: {agent.get('name', '?')} v{agent.get('version', '?')}")

        # 2. Create session
        print(f"\n{'=' * 60}")
        print("STEP 2: session/new")
        print(f"{'=' * 60}")
        send_jsonrpc(proc, "session/new", {"cwd": cwd, "mcpServers": []}, request_id=2)
        responses = read_responses(proc, timeout=10)
        session_id = None
        for resp in responses:
            result = resp.get("result") or {}
            if isinstance(result, dict) and "sessionId" in result:
                session_id = result["sessionId"]
                models_info = result.get("models", {})
                modes_info = result.get("modes", {})
                print(f"  sessionId:    {session_id}")
                print(f"  currentModel: {models_info.get('currentModelId', '?') if isinstance(models_info, dict) else '?'}")
                print(f"  currentMode:  {modes_info.get('currentModeId', '?') if isinstance(modes_info, dict) else '?'}")
                break
        if not session_id:
            print("ERROR: No sessionId")
            return

        # 3. Set model
        req_id = 3
        print(f"\n{'=' * 60}")
        print(f"STEP 3: session/set_model -> {args.model}")
        print(f"{'=' * 60}")
        send_jsonrpc(proc, "session/set_model", {
            "sessionId": session_id, "modelId": args.model,
        }, request_id=req_id)
        responses = read_responses(proc, timeout=10)
        for resp in responses:
            if "error" in resp:
                print(f"  ERROR: {resp['error']}")
            else:
                print(f"  OK")
        req_id += 1

        # 4. Set mode
        print(f"\n{'=' * 60}")
        print(f"STEP 4: session/set_mode -> {args.mode}")
        print(f"{'=' * 60}")
        send_jsonrpc(proc, "session/set_mode", {
            "sessionId": session_id, "modeId": args.mode,
        }, request_id=req_id)
        responses = read_responses(proc, timeout=10)
        for resp in responses:
            if "error" in resp:
                print(f"  ERROR: {resp['error']}")
            else:
                print(f"  OK")
        req_id += 1

        # 5. Send augmented prompt
        t0 = time.time()
        print(f"\n{'=' * 60}")
        print(f"STEP 5: session/prompt ({char_count} chars, ~{est_tokens} tokens)")
        print(f"{'=' * 60}")
        send_jsonrpc(proc, "session/prompt", {
            "sessionId": session_id,
            "prompt": [{"type": "text", "text": prompt}],
        }, request_id=req_id)

        print("\n--- Response ---")
        response_text = read_streaming(proc, timeout=120)
        elapsed = time.time() - t0
        print(f"\n{'=' * 60}")
        print(f"RESULT")
        print(f"{'=' * 60}")
        print(f"  Response chars: {len(response_text)}")
        print(f"  Time:           {elapsed:.1f}s")
        if not response_text:
            print(f"  ⚠️  EMPTY RESPONSE — model returned no text")

    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        print("\nDone.")


if __name__ == "__main__":
    main()
