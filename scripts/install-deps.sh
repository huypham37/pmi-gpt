#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info() { printf "%b\n" "${BLUE}>${NC} $1"; }
success() { printf "%b\n" "${GREEN}✓${NC} $1"; }
warn() { printf "%b\n" "${YELLOW}!${NC} $1"; }
error() { printf "%b\n" "${RED}✗${NC} $1"; }
header() { printf "\n%b\n" "${BOLD}── $1 ──${NC}"; }

# Track what was installed
INSTALLED=()
SKIPPED=()
FAILED=()

# Detect OS
OS="$(uname -s)"
case "$OS" in
    Darwin) OS_TYPE="darwin" ;;
    Linux)  OS_TYPE="linux" ;;
    *)      error "Unsupported operating system: $OS"; exit 1 ;;
esac

# Detect package manager (Linux)
detect_pkg_manager() {
    if command -v apt-get >/dev/null 2>&1; then
        echo "apt"
    elif command -v dnf >/dev/null 2>&1; then
        echo "dnf"
    elif command -v pacman >/dev/null 2>&1; then
        echo "pacman"
    else
        echo "unknown"
    fi
}

# ─── 1. OpenCode ───────────────────────────────────────────────────────────────

install_opencode() {
    header "OpenCode"

    if command -v opencode >/dev/null 2>&1; then
        local ver
        ver=$(opencode --version 2>/dev/null || echo "unknown")
        success "OpenCode already installed ($ver)"
        SKIPPED+=("opencode")
        return 0
    fi

    info "Installing OpenCode..."

    if command -v curl >/dev/null 2>&1; then
        if curl -fsSL https://opencode.ai/install | bash; then
            success "OpenCode installed"
            INSTALLED+=("opencode")
        else
            error "OpenCode installation failed"
            FAILED+=("opencode")
        fi
    elif command -v npm >/dev/null 2>&1; then
        if npm install -g opencode-ai; then
            success "OpenCode installed via npm"
            INSTALLED+=("opencode")
        else
            error "OpenCode installation failed"
            FAILED+=("opencode")
        fi
    else
        error "curl or npm required to install OpenCode"
        FAILED+=("opencode")
    fi
}

# ─── 2. Python + pip ──────────────────────────────────────────────────────────

ensure_python() {
    header "Python"

    if command -v python3 >/dev/null 2>&1; then
        local ver
        ver=$(python3 --version 2>/dev/null)
        success "Python already installed ($ver)"
        return 0
    fi

    info "Installing Python 3..."
    if [ "$OS_TYPE" = "darwin" ]; then
        if command -v brew >/dev/null 2>&1; then
            brew install python3
        else
            error "Install Homebrew first: https://brew.sh"
            FAILED+=("python3")
            return 1
        fi
    else
        local pkg_mgr
        pkg_mgr=$(detect_pkg_manager)
        case "$pkg_mgr" in
            apt)    sudo apt-get update && sudo apt-get install -y python3 python3-pip python3-venv ;;
            dnf)    sudo dnf install -y python3 python3-pip ;;
            pacman) sudo pacman -S --noconfirm python python-pip ;;
            *)      error "Unknown package manager. Install python3 manually."; FAILED+=("python3"); return 1 ;;
        esac
    fi

    if command -v python3 >/dev/null 2>&1; then
        success "Python installed ($(python3 --version))"
        INSTALLED+=("python3")
    else
        error "Python installation failed"
        FAILED+=("python3")
        return 1
    fi
}

# ─── 3. Docling ───────────────────────────────────────────────────────────────

install_docling() {
    header "Docling"

    if command -v docling >/dev/null 2>&1; then
        success "Docling already installed"
        SKIPPED+=("docling")
        return 0
    fi

    if ! command -v python3 >/dev/null 2>&1; then
        error "Python 3 is required for Docling. Skipping."
        FAILED+=("docling")
        return 1
    fi

    info "Installing Docling via pip..."
    if python3 -m pip install --user docling 2>/dev/null || pip3 install --user docling; then
        success "Docling installed"
        INSTALLED+=("docling")
    else
        error "Docling installation failed"
        warn "Try manually: pip install docling"
        FAILED+=("docling")
    fi
}

# ─── 4. LMStudio ─────────────────────────────────────────────────────────────

install_lmstudio() {
    header "LM Studio"

    # LMStudio is a desktop app — check if it's already installed
    if [ "$OS_TYPE" = "darwin" ]; then
        if [ -d "/Applications/LM Studio.app" ]; then
            success "LM Studio already installed"
            SKIPPED+=("lmstudio")
            return 0
        fi
    else
        if command -v lms >/dev/null 2>&1 || [ -d "$HOME/.lmstudio" ] || [ -d "/opt/lmstudio" ]; then
            success "LM Studio already installed"
            SKIPPED+=("lmstudio")
            return 0
        fi
    fi

    info "LM Studio is a desktop application."
    info "Download from: ${BOLD}https://lmstudio.ai${NC}"

    if [ "$OS_TYPE" = "linux" ]; then
        info "For Linux, download the .AppImage from the website."
        info "Or install via:"
        printf "%b\n" "    ${BOLD}# Flatpak${NC}"
        printf "%b\n" "    ${BOLD}flatpak install flathub ai.lmstudio.LMStudio${NC}"
    fi

    warn "LM Studio must be installed manually"
    SKIPPED+=("lmstudio (manual)")
}

# ─── 5. Node.js / Bun (for building the project) ─────────────────────────────

check_build_tools() {
    header "Build Tools"

    local all_ok=true

    if command -v bun >/dev/null 2>&1; then
        success "Bun $(bun --version)"
    else
        warn "Bun not found. Install: curl -fsSL https://bun.sh/install | bash"
        all_ok=false
    fi

    if command -v node >/dev/null 2>&1; then
        success "Node.js $(node --version)"
    else
        warn "Node.js not found"
        all_ok=false
    fi

    if [ "$all_ok" = false ]; then
        FAILED+=("build-tools")
    fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────

echo ""
printf "%b\n" "${BOLD}PMI Agent — Dependency Installer${NC}"
printf "%b\n" "Platform: $OS_TYPE ($(uname -m))"
echo ""

install_opencode
ensure_python
install_docling
install_lmstudio
check_build_tools

# ─── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "─────────────────────────────────────────────────────────────────────────"
echo ""

if [ ${#INSTALLED[@]} -gt 0 ]; then
    success "Installed: ${INSTALLED[*]}"
fi
if [ ${#SKIPPED[@]} -gt 0 ]; then
    info "Already present: ${SKIPPED[*]}"
fi
if [ ${#FAILED[@]} -gt 0 ]; then
    error "Failed: ${FAILED[*]}"
    echo ""
    exit 1
fi

echo ""
success "All dependencies are ready!"
echo ""
