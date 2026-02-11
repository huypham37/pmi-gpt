"""
Test script for ACP chat/prompt flow.
Spawns `opencode acp`, initializes, creates a session, and sends a prompt
to test the full chat round-trip.

Usage:
    python3 test-acp.py                                          # Default model/mode
    python3 test-acp.py --model github-copilot/GPT-5-mini        # Specific model
    python3 test-acp.py --mode build                             # Specific mode
    python3 test-acp.py --debug                                  # Verbose debug output
    python3 test-acp.py --model github-copilot/GPT-5-mini --mode build --prompt "Hello"
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


def _win_to_wsl_path(win_path):
    """Convert a Windows path (e.g. C:\\Users\\foo) to WSL path (/mnt/c/Users/foo)."""
    path = win_path.replace("\\", "/")
    if len(path) >= 2 and path[1] == ":":
        drive = path[0].lower()
        path = f"/mnt/{drive}{path[2:]}"
    return path


def _get_opencode_cmd():
    """Return the command list to launch opencode acp.

    On Windows, uses WSL to avoid native Windows ACP hang issues.
    On Linux/macOS, finds the opencode binary directly.
    Returns (cmd_list, cwd) tuple.
    """
    is_windows = platform.system() == "Windows"

    if is_windows:
        wsl_bin = shutil.which("wsl")
        if not wsl_bin:
            print("ERROR: WSL not found. opencode acp requires WSL on Windows.")
            print("  Install WSL: https://learn.microsoft.com/en-us/windows/wsl/install")
            sys.exit(1)
        result = subprocess.run(
            [wsl_bin, "bash", "-ic", "which opencode 2>/dev/null"],
            capture_output=True, text=True, timeout=10,
        )
        wsl_opencode = result.stdout.strip()
        if not wsl_opencode or "/" not in wsl_opencode:
            wsl_user = subprocess.run(
                [wsl_bin, "whoami"], capture_output=True, text=True, timeout=5,
            ).stdout.strip()
            wsl_opencode = f"/home/{wsl_user}/.opencode/bin/opencode"
            check = subprocess.run(
                [wsl_bin, "test", "-f", wsl_opencode],
                capture_output=True, timeout=5,
            )
            if check.returncode != 0:
                print("ERROR: opencode not found inside WSL")
                print("  Install in WSL: curl -fsSL https://opencode.ai/install | bash")
                sys.exit(1)
        return [wsl_bin, wsl_opencode, "acp"], True

    found = shutil.which("opencode")
    if found:
        return [found, "acp"], False

    home = os.path.expanduser("~")
    candidates = [
        os.path.join(home, ".opencode", "bin", "opencode"),
        os.path.join(home, ".bun", "bin", "opencode"),
        os.path.join(home, "node_modules", ".bin", "opencode"),
    ]
    for path in candidates:
        if os.path.isfile(path):
            return [path, "acp"], False

    print("ERROR: opencode not found in PATH")
    print("  Install: curl -fsSL https://opencode.ai/install | bash")
    sys.exit(1)


def debug(msg):
    if _debug:
        print(f"  [DEBUG] {msg}", flush=True)


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

    t1 = threading.Thread(target=_stdout_reader, daemon=True)
    t1.start()
    t2 = threading.Thread(target=_stderr_reader, daemon=True)
    t2.start()


def send_jsonrpc(proc, method, params, request_id):
    msg = json.dumps({
        "jsonrpc": "2.0",
        "id": request_id,
        "method": method,
        "params": params,
    })
    payload = f"{msg}\n"
    debug(f"stdin write: {len(payload)} chars, ends with: {repr(payload[-10:])}")
    debug(f"stdin raw bytes: {payload.encode()[-20:]}")
    proc.stdin.write(payload)
    proc.stdin.flush()
    debug(f"stdin flushed OK")
    poll = proc.poll()
    if poll is not None:
        print(f"  [WARN] process already exited with code {poll}")
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


def read_streaming(proc, timeout=30):
    """Read streaming responses until the prompt response (with stopReason) is received."""
    _start_reader(proc)
    msg_count = 0
    t_start = time.time()
    last_msg_time = t_start

    while True:
        try:
            line = _response_queue.get(timeout=timeout)
        except queue.Empty:
            elapsed = time.time() - t_start
            since_last = time.time() - last_msg_time
            poll = proc.poll()
            print(f"\n  [timeout after {timeout}s, received {msg_count} messages total]")
            print(f"  [elapsed: {elapsed:.1f}s, since last msg: {since_last:.1f}s]")
            print(f"  [process alive: {poll is None}, exit code: {poll}]")
            print(f"  [queue size: {_response_queue.qsize()}]")
            break
        line = line.strip()
        if not line:
            continue
        try:
            parsed = json.loads(line)
            msg_count += 1
            last_msg_time = time.time()
            debug(f"MSG#{msg_count} (+{last_msg_time - t_start:.1f}s): {json.dumps(parsed)[:500]}")

            # Handle session/update notifications (streaming)
            if parsed.get("method") == "session/update":
                update = parsed.get("params", {}).get("update", {})
                update_type = update.get("sessionUpdate")

                if update_type == "agent_message_chunk":
                    content = update.get("content", {})
                    if isinstance(content, dict) and content.get("type") == "text":
                        print(content.get("text", ""), end="", flush=True)
                    else:
                        print(f"\n  [agent_message_chunk] raw: {json.dumps(update)[:300]}", flush=True)

                elif update_type == "thought_chunk":
                    content = update.get("content", {})
                    if isinstance(content, dict) and content.get("type") == "text":
                        print(f"\n  [thinking] {content.get('text', '')}", end="", flush=True)

                elif update_type == "plan":
                    entries = update.get("entries", [])
                    print(f"\n  [plan] {len(entries)} entries")
                    for entry in entries:
                        if isinstance(entry, dict):
                            print(f"    - [{entry.get('status', '?')}] {entry.get('content', '?')}")

                elif update_type == "tool_call":
                    tc_id = update.get("toolCallId", "?")
                    title = update.get("title", "?")
                    status = update.get("status", "?")
                    kind = update.get("kind", "")
                    print(f"\n  [tool_call: {tc_id}] {title} ({kind}) - {status}")

                elif update_type == "tool_call_update":
                    tc_id = update.get("toolCallId", "?")
                    status = update.get("status", "")
                    content_list = update.get("content", [])
                    if status:
                        print(f"\n  [tool_update: {tc_id}] {status}")
                    for c in content_list:
                        if isinstance(c, dict) and c.get("type") == "content":
                            inner = c.get("content", {})
                            if isinstance(inner, dict) and inner.get("type") == "text":
                                text = inner.get("text", "")
                                preview = text[:200] if text else ""
                                print(f"    -> {preview}")
                        elif isinstance(c, dict) and c.get("type") == "diff":
                            print(f"    -> [diff] {c.get('path', '?')}")

                elif update_type == "available_commands_update":
                    cmds = update.get("availableCommands", [])
                    names = [c.get("name", "?") for c in cmds if isinstance(c, dict)]
                    print(f"\n  [commands] {', '.join(names)}")

                elif update_type == "config_options_update":
                    debug(f"config_options_update: {json.dumps(update)[:300]}")

                elif update_type == "current_mode_update":
                    print(f"\n  [mode_update] {update.get('currentModeId', '?')}")

                else:
                    print(f"\n  [update:{update_type}] {json.dumps(update)[:200]}")

            # Handle permission requests from the agent
            elif parsed.get("method") == "session/request_permission":
                perm_params = parsed.get("params", {})
                options = perm_params.get("options", [])
                print(f"\n  [permission request]")
                allow_option = None
                for opt in options:
                    if isinstance(opt, dict):
                        kind = opt.get("kind", "")
                        print(f"    - {opt.get('name', '?')} ({kind})")
                        if kind in ("allow_once", "allow_always"):
                            allow_option = opt
                # Auto-allow for testing
                if allow_option and "id" in parsed:
                    print(f"  -> auto-allowing: {allow_option.get('name')}")
                    response = json.dumps({
                        "jsonrpc": "2.0",
                        "id": parsed["id"],
                        "result": {
                            "outcome": {
                                "outcome": "selected",
                                "optionId": allow_option.get("optionId", ""),
                            }
                        },
                    })
                    proc.stdin.write(f"{response}\n")
                    proc.stdin.flush()

            # Handle other incoming requests from the agent (fs/*, terminal/*)
            elif "method" in parsed and "id" in parsed:
                method = parsed["method"]
                print(f"\n  [incoming request] {method} (id={parsed['id']})")
                debug(f"Params: {json.dumps(parsed.get('params', {}))[:300]}")
                # Respond with error - we don't handle these
                err_response = json.dumps({
                    "jsonrpc": "2.0",
                    "id": parsed["id"],
                    "error": {"code": -32601, "message": f"Method not supported: {method}"},
                })
                proc.stdin.write(f"{err_response}\n")
                proc.stdin.flush()
                print(f"  -> responded with method-not-supported")

            # JSON-RPC response (prompt completion with stopReason)
            elif "result" in parsed:
                result = parsed.get("result", {})
                if isinstance(result, dict) and "stopReason" in result:
                    reason = result.get("stopReason", "unknown")
                    print(f"\n\n--- DONE (reason={reason}, messages={msg_count}) ---")
                    return
                else:
                    print(f"\n<<< RESULT: {json.dumps(result)[:200]}")

            elif "error" in parsed:
                print(f"\n<<< ERROR: {json.dumps(parsed['error'], indent=2)}")

            else:
                print(f"\n  [UNKNOWN MSG] {json.dumps(parsed)[:300]}")

        except json.JSONDecodeError:
            print(f"<<< RAW: {line}")


def main():
    global _debug

    parser = argparse.ArgumentParser(description="Test ACP chat/prompt flow")
    parser.add_argument("--model", type=str, help="Model ID (e.g., github-copilot/GPT-5-mini)")
    parser.add_argument("--mode", type=str, help="Mode ID (e.g., build, plan)")
    parser.add_argument("--prompt", type=str, default="Say hello in one sentence.",
                        help="Prompt text to send")
    parser.add_argument("--debug", action="store_true", help="Enable verbose debug output")
    args = parser.parse_args()
    _debug = args.debug

    cwd = os.getcwd()
    opencode_cmd, use_wsl = _get_opencode_cmd()
    wsl_cwd = _win_to_wsl_path(cwd) if use_wsl else cwd

    print(f"Working directory: {cwd}")
    if use_wsl:
        print(f"WSL cwd:          {wsl_cwd}")
    print(f"Command:          {' '.join(opencode_cmd)}")
    print(f"Platform:         {platform.system()} ({platform.platform()})")
    print(f"Python:           {sys.version.split()[0]}")
    debug(f"PATH: {os.environ.get('PATH', 'NOT SET')}")
    debug(f"HOME: {os.environ.get('HOME', os.environ.get('USERPROFILE', 'NOT SET'))}")
    debug(f"Text mode newline: {repr(os.linesep)}")
    for key in sorted(os.environ):
        if any(k in key.upper() for k in ["OPENCODE", "OPENAI", "ANTHROPIC", "COPILOT", "GITHUB_TOKEN", "API_KEY"]):
            val = os.environ[key]
            safe = val[:4] + "..." + val[-4:] if len(val) > 12 else "***"
            debug(f"ENV {key}={safe}")
    print(f"Starting opencode acp...")

    proc = subprocess.Popen(
        opencode_cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=cwd,
    )

    try:
        # Step 1: Initialize
        t0 = time.time()
        print("\n" + "=" * 60)
        print("STEP 1: Initialize")
        print("=" * 60)
        send_jsonrpc(proc, "initialize", {
            "protocolVersion": 1,
            "clientInfo": {"name": "test-acp", "title": "ACP Test Script", "version": "0.0.1"},
            "clientCapabilities": {
                "fs": {"readTextFile": False, "writeTextFile": False},
                "terminal": False,
            },
        }, request_id=1)

        responses = read_responses(proc, timeout=10)
        print(f"  (took {time.time() - t0:.1f}s)")
        if not responses:
            print("ERROR: No response from initialize")
            return

        init_result = responses[0].get("result", {})
        agent = init_result.get("agentInfo", {})
        print(f"  Agent: {agent.get('name', '?')} v{agent.get('version', '?')}")
        print(f"  Protocol: {init_result.get('protocolVersion', '?')}")
        agent_caps = init_result.get("agentCapabilities", {})
        if agent_caps:
            print(f"  Agent capabilities: {json.dumps(agent_caps)}")
        debug(f"Full init result: {json.dumps(init_result)[:1000]}")

        # Step 2: Create Session
        t0 = time.time()
        print("\n" + "=" * 60)
        print("STEP 2: session/new")
        print("=" * 60)
        send_jsonrpc(proc, "session/new", {"cwd": wsl_cwd, "mcpServers": []}, request_id=2)

        responses = read_responses(proc, timeout=10)
        print(f"  (took {time.time() - t0:.1f}s)")
        if not responses:
            print("ERROR: No response from session/new")
            return

        session_id = None
        for resp in responses:
            if not isinstance(resp, dict):
                continue
            result = resp.get("result") or {}
            if not isinstance(result, dict):
                continue
            if "sessionId" in result:
                session_id = result["sessionId"]
                models_info = result.get("models", {})
                modes_info = result.get("modes", {})
                print(f"  sessionId: {session_id}")
                print(f"  currentModel: {models_info.get('currentModelId', '?') if isinstance(models_info, dict) else '?'}")
                print(f"  currentMode: {modes_info.get('currentModeId', '?') if isinstance(modes_info, dict) else '?'}")
                available_models = models_info.get("availableModels", []) if isinstance(models_info, dict) else models_info if isinstance(models_info, list) else []
                available_modes = modes_info.get("availableModes", []) if isinstance(modes_info, dict) else modes_info if isinstance(modes_info, list) else []
                print(f"  available models ({len(available_models)}):")
                for m in available_models:
                    if isinstance(m, dict):
                        mid = m.get("modelId", m.get("id", "?"))
                        print(f"    - {mid}")
                    else:
                        print(f"    - {m}")
                print(f"  available modes ({len(available_modes)}):")
                for mode in available_modes:
                    if isinstance(mode, dict):
                        mode_id = mode.get("modeId", mode.get("id", "?"))
                        mode_name = mode.get("name", mode_id)
                        print(f"    - {mode_id} ({mode_name})")
                    else:
                        print(f"    - {mode}")
                # Print config options if present
                config_opts = result.get("configOptions", [])
                if config_opts:
                    print(f"  config options ({len(config_opts)}):")
                    for co in config_opts:
                        if isinstance(co, dict):
                            print(f"    - [{co.get('category', '?')}] {co.get('id', '?')}: {co.get('currentValue', '?')} (options: {[o.get('value') for o in co.get('options', []) if isinstance(o, dict)]})")
                debug(f"Full session/new result: {json.dumps(result)[:2000]}")
                break

        if not session_id:
            print("ERROR: No sessionId in response")
            return

        # Step 3: Set model (if specified)
        req_id = 3
        if args.model:
            t0 = time.time()
            print("\n" + "=" * 60)
            print(f"STEP 3: session/set_model -> {args.model}")
            print("=" * 60)
            send_jsonrpc(proc, "session/set_model", {
                "sessionId": session_id, "modelId": args.model,
            }, request_id=req_id)
            responses = read_responses(proc, timeout=10)
            print(f"  (took {time.time() - t0:.1f}s)")
            for resp in responses:
                if not isinstance(resp, dict):
                    continue
                if "error" in resp:
                    print(f"  ERROR: {resp['error']}")
                else:
                    result = resp.get("result") or {}
                    if isinstance(result, dict):
                        model_id = result.get("currentModelId")
                        if not model_id:
                            models_info = result.get("models", {})
                            if isinstance(models_info, dict):
                                model_id = models_info.get("currentModelId")
                        if model_id:
                            print(f"  Model set to: {model_id}")
                        else:
                            print(f"  Response: {json.dumps(result)[:200]}")
            req_id += 1

        # Step 4: Set mode (if specified)
        if args.mode:
            t0 = time.time()
            print("\n" + "=" * 60)
            print(f"STEP 4: session/set_mode -> {args.mode}")
            print("=" * 60)
            send_jsonrpc(proc, "session/set_mode", {
                "sessionId": session_id, "modeId": args.mode,
            }, request_id=req_id)
            responses = read_responses(proc, timeout=10)
            print(f"  (took {time.time() - t0:.1f}s)")
            for resp in responses:
                if not isinstance(resp, dict):
                    continue
                if "error" in resp:
                    print(f"  ERROR: {resp['error']}")
                else:
                    result = resp.get("result") or {}
                    if isinstance(result, dict):
                        mode_id = result.get("currentModeId")
                        if not mode_id:
                            modes_info = result.get("modes", {})
                            if isinstance(modes_info, dict):
                                mode_id = modes_info.get("currentModeId")
                        if mode_id:
                            print(f"  Mode set to: {mode_id}")
                        else:
                            print(f"  Response: {json.dumps(result)[:200]}")
            req_id += 1

        # Step 5: Send Prompt
        t0 = time.time()
        print("\n" + "=" * 60)
        print(f"STEP 5: session/prompt")
        print(f"  Prompt: {args.prompt}")
        print("=" * 60)
        send_jsonrpc(proc, "session/prompt", {
            "sessionId": session_id,
            "prompt": [{"type": "text", "text": args.prompt}],
        }, request_id=req_id)

        # Start a heartbeat thread to show we're still alive during long waits
        _heartbeat_stop = threading.Event()
        def _heartbeat():
            interval = 10
            while not _heartbeat_stop.is_set():
                _heartbeat_stop.wait(interval)
                if _heartbeat_stop.is_set():
                    break
                elapsed = time.time() - t0
                poll = proc.poll()
                qsize = _response_queue.qsize()
                status = f"alive (pid={proc.pid})" if poll is None else f"EXITED ({poll})"
                print(f"\n  [heartbeat +{elapsed:.0f}s] process={status}, queue={qsize}", flush=True)
        hb = threading.Thread(target=_heartbeat, daemon=True)
        hb.start()

        # Stream the response
        print("\n--- Response ---")
        read_streaming(proc, timeout=60)
        _heartbeat_stop.set()
        print(f"  (prompt took {time.time() - t0:.1f}s)")

    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            print("  [WARN] terminate timed out, killing process")
            proc.kill()
            proc.wait()
        print("\nDone.")


if __name__ == "__main__":
    main()
