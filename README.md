# agentsh on Render

**Render provides deployment. agentsh provides governance.**

Runtime security for AI agents inside Docker containers on Render. This demo shows how agentsh enforces security policies -- command blocking, network filtering, file protection, DLP, audit logging, and SSRF prevention -- without requiring kernel privileges or custom infrastructure.

## What agentsh Enforces

- **Command blocking** -- sudo, su, ssh, nc, nmap, mount, and other dangerous commands are denied at the shell level
- **Network filtering** -- private networks, cloud metadata endpoints, and malicious domains are blocked
- **File protection** -- system paths are read-only, the workspace is writable, symlink escape is prevented
- **DLP** -- secrets are redacted in API proxy traffic before they leave the container
- **Audit logging** -- all commands are logged to SQLite for post-hoc review
- **SSRF prevention** -- RFC 1918 ranges are blocked, preventing server-side request forgery

## Architecture

Express.js app (port 10000) executes commands through `agentsh exec` and returns JSON. The agentsh server runs on 127.0.0.1:18080 with ptrace fail-open and seccomp file_monitor enforcement.

```
┌────────────────────────────────────────────┐
│  Render Docker Web Service                 │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │  Express.js (port 10000)             │  │
│  │  /health, /demo/*, /execute          │  │
│  └──────────┬───────────────────────────┘  │
│             │ agentsh exec                  │
│  ┌──────────▼───────────────────────────┐  │
│  │  agentsh server (127.0.0.1:18080)    │  │
│  │  seccomp + shell shim + DLP + audit  │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  startup.sh: agentsh server → Express app  │
└────────────────────────────────────────────┘
```

## Demo Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/demo/status` | agentsh version, capabilities, detect output |
| GET | `/demo/allowed` | Safe commands: whoami, pwd, ls, echo |
| GET | `/demo/blocked` | Policy-blocked: nc, nmap, metadata curl |
| GET | `/demo/commands` | Command blocking across categories |
| GET | `/demo/privilege-escalation` | sudo, su, shadow read, chroot, nsenter |
| GET | `/demo/filesystem` | Workspace writes ok, /etc and /usr blocked |
| GET | `/demo/cloud-metadata` | AWS/GCP/Azure/DO/Alibaba/Oracle metadata blocked |
| GET | `/demo/ssrf` | RFC 1918 ranges blocked; external allowed |
| GET | `/demo/dlp` | DLP configuration and redaction info |
| GET | `/demo/devtools` | Python, Node, git, curl, pip |
| GET | `/demo/network` | Network filtering overview |
| POST | `/execute` | Execute user-provided command |

## Quick Start

### Deploy to Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/canyonroad/agentsh-render)

### Run Locally

```bash
docker build -t agentsh-render .
docker run -p 10000:10000 agentsh-render
curl http://localhost:10000/demo/blocked | jq .
```

## Enforcement on Render

Based on `agentsh detect` inside the Docker container:

| Mechanism | Status | Notes |
|-----------|--------|-------|
| Shell shim | Active | Replaces /bin/bash |
| seccomp file_monitor | Active | File access enforcement |
| Network proxy | Active | HTTPS_PROXY-based filtering |
| DLP | Active | Pattern matching on API proxy traffic |
| Audit | Active | SQLite event logging |
| Landlock | Available | Kernel ABI v5 (not used -- blocks shell shim) |
| ptrace | Unavailable | Needs SYS_PTRACE capability |
| FUSE | Unavailable | Needs /dev/fuse + SYS_ADMIN |
| cgroups v2 | Available | Not enabled in this demo |

## Security Policy

The `default.yaml` policy enforces:

- **Commands** -- Safe tools allowed, network tools/SSH/privilege escalation/system admin commands blocked
- **Files** -- /workspace full access, /tmp full access, system paths read-only, sensitive files (shadow, sudoers) denied
- **Network** -- Package registries and code hosts allowed, cloud metadata blocked, private networks blocked, malicious domains blocked, general HTTPS allowed
- **DLP** -- Redacts OpenAI/Anthropic/AWS/GitHub keys, JWTs, private keys, emails, phones, credit cards, SSN
- **Resources** -- 2GB memory, 100 PIDs, 5min command timeout

## Running Tests

```bash
# Against local Docker container (builds image, starts container, runs tests)
npm test

# Against live Render deployment
TEST_URL=https://agentsh-demo.onrender.com npm test
```

68 tests across 12 files covering installation, status, allowed/blocked commands, privilege escalation, filesystem protection, cloud metadata, SSRF prevention, network filtering, DLP configuration, and dev tools.

## Configuration

- `config.yaml` -- agentsh server config (enforcement mechanisms, DLP patterns, audit)
- `default.yaml` -- Security policy (file/network/command rules, resource limits)

## Links

- [agentsh Documentation](https://docs.agentsh.dev)
- [agentsh GitHub](https://github.com/canyonroad/agentsh)
- [Render Documentation](https://docs.render.com)
