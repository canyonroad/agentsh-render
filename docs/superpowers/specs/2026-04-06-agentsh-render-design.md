# agentsh + Render: Design Spec

## Overview

An example/demo repository showing how to secure AI agent workloads on Render using agentsh. Follows the Cloudflare example pattern: a Docker-based web service with demo endpoints that execute commands through agentsh and return JSON results, deployed via Render Blueprint.

**Core value**: Render provides deployment. agentsh provides governance.

## Architecture

```
┌────────────────────────────────────────────┐
│  Render Docker Web Service                 │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │  Express.js (port 10000)             │  │
│  │  /health, /demo/*, /execute          │  │
│  └──────────┬───────────────────────────┘  │
│             │ child_process.execSync()      │
│             │ "agentsh exec -- /bin/bash…"  │
│  ┌──────────▼───────────────────────────┐  │
│  │  agentsh server (127.0.0.1:18080)    │  │
│  │  ┌─────────────────────────────────┐ │  │
│  │  │ Shell shim (/bin/bash)          │ │  │
│  │  │ seccomp (file monitoring)       │ │  │
│  │  │ BASH_ENV (builtin disabling)    │ │  │
│  │  │ Network filtering (HTTPS_PROXY) │ │  │
│  │  │ DLP (secret redaction)          │ │  │
│  │  │ Audit logging (SQLite)          │ │  │
│  │  └─────────────────────────────────┘ │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  startup.sh: agentsh server → Express app  │
└────────────────────────────────────────────┘
```

## Enforcement

Enforcement mechanisms will be determined empirically by deploying a basic container to Render and running `agentsh detect`. The config.yaml will be finalized based on actual capabilities. Expected availability:

| Mechanism | Expected | Notes |
|-----------|----------|-------|
| Shell shim | Yes | Replaces /bin/bash, no capabilities needed |
| seccomp | Likely | Standard Docker supports seccomp |
| BASH_ENV | Yes | Environment variable injection |
| Network proxy | Yes | HTTPS_PROXY, in-process filtering |
| DLP | Yes | In-process pattern matching |
| Audit | Yes | SQLite logging |
| FUSE | Unlikely | Needs --device /dev/fuse + SYS_ADMIN |
| Landlock | Unlikely | Needs kernel support + capabilities |
| ptrace | Unlikely | Needs SYS_PTRACE capability |

## File Structure

```
agentsh-render/
├── src/index.js                # Express app (demo endpoints + execute)
├── config.yaml                 # agentsh server config (finalized after detect)
├── default.yaml                # Security policy rules
├── Dockerfile                  # Ubuntu 22.04 + Node.js + agentsh v0.16.9
├── startup.sh                  # Starts agentsh server, waits, starts Express
├── render.yaml                 # Render Blueprint (one-click deploy)
├── test/
│   ├── global-setup.js         # Build image, start container, health check
│   ├── helpers/
│   │   ├── sandbox.js          # fetchDemo(), findResult(), BASE_URL
│   │   └── assertions.js       # blocked/allowed assertion helpers
│   ├── installation.test.js    # agentsh binary, version, config present
│   ├── status.test.js          # agentsh detect, capabilities
│   ├── allowed.test.js         # Safe commands (whoami, ls, echo, pwd)
│   ├── blocked.test.js         # Policy-blocked (nc, nmap, metadata)
│   ├── commands.test.js        # Command blocking across categories
│   ├── privilege.test.js       # Priv escalation (sudo, su, pkexec)
│   ├── filesystem.test.js      # File protection (/etc, /usr, workspace)
│   ├── network.test.js         # Network filtering (private nets, evil.com)
│   ├── cloud-metadata.test.js  # Cloud metadata blocking (AWS/GCP/Azure)
│   ├── ssrf.test.js            # SSRF prevention (RFC 1918 ranges)
│   ├── dlp.test.js             # Secret redaction (API keys, tokens)
│   └── devtools.test.js        # Dev tools (python, node, git, curl)
├── vitest.config.js
├── package.json
├── LICENSE
└── README.md
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (Render uses this) |
| GET | `/demo/status` | agentsh version, capabilities, detect output |
| GET | `/demo/allowed` | Safe commands: whoami, pwd, ls, echo |
| GET | `/demo/blocked` | Policy-blocked: nc, nmap, metadata curl |
| GET | `/demo/commands` | Command blocking across 10 categories |
| GET | `/demo/privilege-escalation` | sudo, su, pkexec, shadow read |
| GET | `/demo/filesystem` | Workspace writes ok, /etc and /usr blocked |
| GET | `/demo/cloud-metadata` | AWS/GCP/Azure/DO/Alibaba/Oracle metadata blocked |
| GET | `/demo/ssrf` | RFC 1918 ranges, link-local, external allowed |
| GET | `/demo/dlp` | Secret redaction (OpenAI, AWS, GitHub keys) |
| GET | `/demo/devtools` | Python, Node, git, curl, pip |
| GET | `/demo/network` | Network filtering overview |
| POST | `/execute` | Execute user-provided command |

## Dockerfile

- Base: Ubuntu 22.04
- Installs: curl, bash, git, sudo, libseccomp2, fuse3, python3, ca-certificates, nodejs, npm
- Downloads agentsh v0.16.9 from GitHub releases (.deb)
- Copies config.yaml to /etc/agentsh/config.yaml
- Copies default.yaml to /etc/agentsh/policies/default.yaml
- Copies Express app to /app, runs npm install --production
- Installs shell shim LAST (so npm install isn't intercepted during build)
- WORKDIR /workspace, EXPOSE 10000
- CMD: startup.sh

## Startup Script

1. Start agentsh server in background
2. Wait for health check on 127.0.0.1:18080 (up to 30 retries, 1s each)
3. Start Express app in foreground (Render needs a foreground process)

## render.yaml Blueprint

```yaml
services:
  - type: web
    runtime: docker
    name: agentsh-demo
    repo: https://github.com/canyonroad/agentsh-render
    dockerfilePath: ./Dockerfile
    healthCheckPath: /health
    plan: starter
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: "10000"
```

## Security Policy (default.yaml)

### File Rules
- `/workspace` — read/write allowed, delete = soft-delete
- `/tmp` — full access
- `/etc`, `/usr`, `/lib`, `/bin`, `/sbin` — read-only
- Dangerous binaries (sudo, su, pkexec, doas) — deny
- Credential files (~/.ssh, ~/.aws, .env, ~/.git-credentials) — require approval
- Default deny

### Network Rules
- Localhost — allow
- Package registries (npm, PyPI, crates.io, Go proxy) — allow
- GitHub, GitLab, Bitbucket — allow
- Cloud metadata (169.254.169.254, 100.100.100.200) — block
- Private networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) — block
- Evil test domains — block
- Unknown HTTPS — require approval
- Default deny

### Command Rules
- Safe commands (ls, cat, grep, find, echo, pwd, date, which) — allow
- Dev tools (git, node, npm, python, pip, curl) — allow
- Shells (bash, sh) — allow
- Git destructive (force push, push to main, reset --hard) — block
- Network tools (nc, netcat, nmap, socat, telnet, ssh, scp) — block
- Privilege escalation (sudo, su, chroot, nsenter) — block
- System commands (shutdown, reboot, mount, dd, kill, killall) — block
- Package install (npm install, pip install) — require approval
- Default allow

### Resource Limits
- Max memory: 2048 MB
- CPU quota: 50%
- Max processes: 100 PIDs
- Command timeout: 5 minutes
- Session timeout: 1 hour

### DLP Patterns
- OpenAI keys, Anthropic keys, AWS keys, GitHub PATs, JWTs, private keys, Slack tokens, emails, phones, credit cards, SSN

## Test Suite

**Framework**: Vitest

**Global setup**: Build Docker image, start container, poll /health until ready, warm up by hitting /demo/status.

**Teardown**: Stop and remove container.

**Test helpers**:
- `fetchDemo(path)` — GET demo endpoint, parse JSON
- `findResult(results, command)` — find specific command result
- `BASE_URL` — env var, defaults to http://localhost:10000 (can point to live Render deployment)

**Coverage** (~70 tests across 12 files):

| File | Tests | Coverage |
|------|-------|----------|
| installation.test.js | ~4 | agentsh binary, version, config, policies |
| status.test.js | ~7 | agentsh detect, kernel version, enforcement |
| allowed.test.js | ~4 | whoami, pwd, ls, echo |
| blocked.test.js | ~3 | nc, nmap, metadata curl |
| commands.test.js | ~10 | SSH, admin, network tools, process control, priv escalation |
| privilege.test.js | ~6 | sudo, su, pkexec, shadow read, sudoers write, chroot |
| filesystem.test.js | ~8 | Workspace write, /etc blocked, /usr blocked, symlink escape |
| network.test.js | ~6 | evil.com blocked, private ranges, localhost ok, npm ok |
| cloud-metadata.test.js | ~6 | AWS, GCP, Azure, DigitalOcean, Alibaba, Oracle |
| ssrf.test.js | ~9 | 10.x, 172.16.x, 192.168.x, 169.254.x blocked; external ok |
| dlp.test.js | ~4 | OpenAI, AWS, GitHub PAT, email/phone redacted |
| devtools.test.js | ~6 | python3, node, git, curl, pip3, pipes |

**Running**:
- Local: `npm test` (builds image, starts container, runs vitest, cleans up)
- Against Render: `BASE_URL=https://agentsh-demo.onrender.com npm test`

## README

1. Title: "agentsh + Render"
2. Tagline: "Render provides deployment. agentsh provides governance."
3. Architecture diagram (ASCII)
4. Capabilities table (Render vs agentsh)
5. Quick start: Deploy to Render button OR local docker build/run
6. Demo endpoints table
7. Security policy overview
8. Running tests
9. Configuration customization
10. Capabilities on Render (filled in after agentsh detect)
11. Links to agentsh docs, Render docs, agentsh GitHub

Deploy to Render button:
```
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/canyonroad/agentsh-render)
```

## Execution Model

```
HTTP Request (curl/browser)
    │
    ▼
Express.js (port 10000)
    │
    │ child_process.execSync("agentsh exec --root=/workspace demo -- /bin/bash -c '...'")
    │
    ▼
agentsh server (127.0.0.1:18080)
    │
    ├──→ Policy evaluation (command/file/network rules)
    ├──→ seccomp enforcement (if available)
    ├──→ DLP scanning (secret redaction)
    │
    ▼
ALLOW (exit 0) or BLOCK (exit 126)
    │
    ▼
Express parses stdout/stderr for block indicators
    │
    ▼
JSON response: { success, stdout, stderr, exitCode, blocked, message }
```

## Block Detection

Same pattern as Cloudflare:
```js
const blocked = output.includes('command denied by policy') ||
               output.includes('blocked by policy') ||
               output.includes('BLOCKED:') ||
               output.includes('Permission denied') ||
               output.includes('Operation not permitted');
```

## Open Items

- **config.yaml enforcement section**: Finalized after running `agentsh detect` on a Render container
- **README capabilities section**: Filled in after detect results
- **Test adjustments**: Some tests may need to be skipped/adjusted based on which enforcement mechanisms are available on Render
