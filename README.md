# PMI Agent

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)

**PMI Agent** is an AI-powered desktop application for security test case generation, built on top of the [OWASP Web Security Testing Guide (WSTG)](https://owasp.org/www-project-web-security-testing-guide/). It uses a local LLM via [LM Studio](https://lmstudio.ai) for intelligent WSTG entry selection (RAG) and [OpenCode](https://opencode.ai) via the [Agent Client Protocol (ACP)](https://agentclientprotocol.com) to generate detailed, context-aware test cases.

## How It Works

```
User describes attack vector
        ↓
LM Studio (local RAG) selects relevant WSTG entries
        ↓
OpenCode (via ACP) generates structured test cases
        ↓
Results displayed in desktop UI
```

1. **Describe an attack vector** — e.g., "SQL injection in login form"
2. **RAG selection** — A local LLM (via LM Studio) picks the most relevant WSTG entries (1 primary + 2 secondary)
3. **Test case generation** — OpenCode receives the augmented prompt with full WSTG context + your project documents and generates structured test cases
4. **Review & export** — View the generated test cases in the UI

## Features

- **WSTG-Based Test Generation**: 91 OWASP WSTG entries across 12 categories (INFO, CONF, IDNT, ATHN, ATHZ, SESS, INPV, ERRH, CRYP, BUSL, CLNT, API)
- **Local RAG Pipeline**: LM Studio selects relevant test categories — no data leaves your machine
- **ACP Integration**: Communicates with OpenCode agent runtime over the Agent Client Protocol
- **Project Context**: Attach documents (PDF, DOCX, PPTX, XLSX) to provide project-specific context via Docling extraction
- **Multi-Profile Sessions**: Chat, Agent, and Testcase profiles — all through a single UI
- **Session Management**: Persistent chat history, session flagging, status workflow
- **File Attachments**: Drag-and-drop images, PDFs, and Office documents
- **Cross-Platform**: macOS, Linux, and Windows (Electron)

---

## Installation

### Prerequisites

The following tools must be installed on your system. You can install them manually or use the automated script.

| Dependency | Purpose | Required |
|---|---|---|
| [Bun](https://bun.sh) | JavaScript runtime & package manager | ✅ |
| [OpenCode](https://opencode.ai) | AI agent backend (ACP server) | ✅ |
| [LM Studio](https://lmstudio.ai) | Local LLM for RAG selection | ✅ |
| [Docling](https://github.com/DS4SD/docling) | PDF/Office document extraction | Optional |
| [Python 3](https://python.org) | Required for Docling | Optional |

### Automated Setup (Recommended)

Run the dependency installer script:

```bash
bash scripts/install-deps.sh
```

This checks for and installs: OpenCode, Python 3, Docling, and verifies build tools. LM Studio must be installed manually from [lmstudio.ai](https://lmstudio.ai).

### Manual Setup

<details>
<summary><strong>1. Install Bun</strong></summary>

```bash
curl -fsSL https://bun.sh/install | bash
```
</details>

<details>
<summary><strong>2. Install OpenCode</strong></summary>

```bash
curl -fsSL https://opencode.ai/install | bash
```

Or via npm:

```bash
npm install -g opencode-ai
```

After installing, configure a provider:

```bash
opencode
# Then run /connect inside the TUI
```
</details>

<details>
<summary><strong>3. Install LM Studio</strong></summary>

Download from [lmstudio.ai](https://lmstudio.ai) and install.

On Linux, you can also use Flatpak:

```bash
flatpak install flathub ai.lmstudio.LMStudio
```

After installing, load a model (e.g., `qwen3-4b-mlx` or any model that fits your hardware).
</details>

<details>
<summary><strong>4. Install Docling (optional — for PDF/Office attachments)</strong></summary>

```bash
pip install docling
```

**Windows note:** You may need to add the Python Scripts directory to your PATH:

```powershell
python -c "import sysconfig; print(sysconfig.get_path('scripts'))"
# Add the output path to your system PATH
```
</details>

---

### Build from Source

```bash
# Clone the repository
git clone https://github.com/huypham37/pmi-gpt.git
cd pmi-gpt

# Install dependencies
bun install

# Build the acp-client package
cd packages/acp-client && bun run build && cd ../..

# Start in development mode (hot reload)
bun run electron:dev

# Or build and run
bun run electron:start
```

### Pre-Built Binaries

**macOS:**
```bash
curl -fsSL https://agents.craft.do/install-app.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://agents.craft.do/install-app.ps1 | iex
```

**Linux:**
```bash
curl -fsSL https://agents.craft.do/install-app.sh | bash
```

> Linux requires FUSE: `sudo apt install fuse libfuse2` (Debian/Ubuntu) or `sudo dnf install fuse fuse-libs` (Fedora)

---

## Quick Start

1. **Start LM Studio** and load a model
2. **Launch PMI Agent** (`bun run electron:dev` or open the installed app)
3. **Select the Testcase profile** from the profile picker
4. **Describe an attack vector** — e.g., "Cross-site scripting in user profile fields"
5. **Attach project documents** (optional) for context-aware test cases
6. **Review** the generated WSTG-based test cases

---

## Architecture

```
pmi-gpt/
├── apps/
│   └── electron/                # Desktop app (Electron + React)
│       └── src/
│           ├── main/            # Main process
│           │   ├── sessions.ts  # ACP session management
│           │   ├── lmstudio.ts  # LM Studio RAG client
│           │   ├── wstg-data.ts # OWASP WSTG entry database
│           │   ├── wstg-prompt.ts
│           │   └── lib/
│           │       └── docling-extract.ts
│           ├── preload/         # Context bridge
│           └── renderer/        # React UI (Vite + shadcn)
├── packages/
│   ├── acp-client/              # ACP protocol client (JSON-RPC over stdio)
│   ├── shared/                  # Business logic, config, models
│   └── core/                    # Shared types
├── wstg-tests/                  # OWASP WSTG test reference data
│   ├── 01-INFO/  ...  12-API/
├── scripts/
│   ├── install-deps.sh          # Dependency installer
│   ├── install-app.sh           # App installer (macOS/Linux)
│   └── install-app.ps1          # App installer (Windows)
└── opencode-client/             # OpenCode integration
```

### Data Flow

```
┌─────────────────────────────────┐
│   Electron Renderer (React UI)  │
│  Profile picker · Chat · Files  │
└──────────────┬──────────────────┘
               │ IPC
               ▼
┌─────────────────────────────────┐
│   Electron Main (Session Bridge)│
│  Session persistence · ACP Client│
│  Attachment storage · Docling    │
└──────┬───────────────┬──────────┘
       │               │
       ▼               ▼
┌──────────────┐ ┌────────────────┐
│  LM Studio   │ │ OpenCode (ACP) │
│  Local RAG   │ │ Agent Runtime  │
│  WSTG select │ │ Test case gen  │
└──────────────┘ └────────────────┘
```

---

## Development

```bash
# Hot reload development
bun run electron:dev

# Build and run
bun run electron:start

# Type checking
bun run typecheck:all

# Run tests
bun test

# Lint
bun run lint
```

### Model Configuration

Models are configured in `packages/shared/src/config/models.ts`. The default models:

| Purpose | Model | Provider |
|---|---|---|
| Chat (default) | Qwen3 4B | LM Studio |
| Extraction | GPT-5 Mini | GitHub Copilot |
| Summarization | GPT-5 Mini | GitHub Copilot |

### Environment Variables

Create a `.env` file from the example:

```bash
cp .env.example .env
```

---

## WSTG Coverage

PMI Agent includes the full OWASP WSTG v4.2 test catalog:

| Category | Code | Tests |
|---|---|---|
| Information Gathering | WSTG-INFO | 01–10 |
| Configuration & Deployment | WSTG-CONF | 01–11 |
| Identity Management | WSTG-IDNT | 01–05 |
| Authentication | WSTG-ATHN | 01–10 |
| Authorization | WSTG-ATHZ | 01–04 |
| Session Management | WSTG-SESS | 01–09 |
| Input Validation | WSTG-INPV | 01–19 |
| Error Handling | WSTG-ERRH | 01–02 |
| Cryptography | WSTG-CRYP | 01–04 |
| Business Logic | WSTG-BUSL | 01–09 |
| Client-Side | WSTG-CLNT | 01–13 |
| API Testing | WSTG-API | 01–12 |

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the Apache License 2.0 — see the [LICENSE](LICENSE) file for details.

## Security

To report security vulnerabilities, please see [SECURITY.md](SECURITY.md).
