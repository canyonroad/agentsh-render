# agentsh + Render

Runtime security governance for AI agents using [agentsh](https://github.com/canyonroad/agentsh) v0.18.1 with [Render](https://render.com) Docker Web Services.

## Why agentsh + Render?

**Render provides deployment. agentsh provides governance.**

Render gives AI agents a managed Docker environment with automatic deploys, TLS, and scaling. But a container alone doesn't prevent an agent from:

- **Exfiltrating data** to unauthorized endpoints
- **Accessing cloud metadata** (AWS/GCP/Azure credentials at 169.254.169.254)
- **Leaking secrets** in outputs (API keys, tokens, PII)
- **Running dangerous commands** (sudo, ssh, kill, nc)
- **Reaching internal networks** (10.x, 172.16.x, 192.168.x)
- **Modifying system files** (/etc/shadow, /etc/sudoers, /usr/bin)

agentsh adds the governance layer that controls what agents can do inside the container, providing defense-in-depth:

```
+---------------------------------------------------------+
|  Render Docker Web Service (Deployment)                 |
|  +---------------------------------------------------+  |
|  |  agentsh (Governance)                             |  |
|  |  +---------------------------------------------+  |  |
|  |  |  AI Agent                                   |  |  |
|  |  |  - Commands are policy-checked              |  |  |
|  |  |  - Network requests are filtered            |  |  |
|  |  |  - File access is kernel-enforced           |  |  |
|  |  |  - Secrets are redacted from output         |  |  |
|  |  |  - All actions are audited                  |  |  |
|  |  +---------------------------------------------+  |  |
|  +---------------------------------------------------+  |
+---------------------------------------------------------+
```

## What agentsh Adds

| Render Provides | agentsh Adds |
|-----------------|--------------|
| Docker container hosting | Command blocking (Landlock + seccomp) |
| TLS, scaling, deploys | File I/O policy (Landlock kernel enforcement) |
| Health checks, logs | Domain allowlist/blocklist (network proxy) |
| Blueprint deploys | Cloud metadata blocking |
| | Bash builtin interception (BASH_ENV) |
| | Landlock execution restrictions (ABI v5) |
| | TCP connect/bind filtering (Landlock network) |
| | Secret detection and redaction (DLP) |
| | Resource limits (cgroups v2) |
| | Capability dropping |
| | Complete audit logging |

## Architecture

Express.js app (port 10000) executes commands through `agentsh exec` and returns JSON. The agentsh server runs on 127.0.0.1:18080 with Landlock + seccomp enforcement.

```
┌────────────────────────────────────────────────┐
│  Render Docker Web Service                     │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │  Express.js (port 10000)                 │  │
│  │  /health, /demo/*, /execute              │  │
│  └──────────┬───────────────────────────────┘  │
│             │ agentsh exec                      │
│  ┌──────────▼───────────────────────────────┐  │
│  │  agentsh server (127.0.0.1:18080)        │  │
│  │  Landlock + seccomp + network proxy      │  │
│  │  + DLP + audit + cgroups                 │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  startup.sh: agentsh server → Express app      │
└────────────────────────────────────────────────┘
```

## Quick Start

### Deploy to Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/canyonroad/agentsh-render)

### Run Locally

```bash
git clone https://github.com/canyonroad/agentsh-render
cd agentsh-render

docker build -t agentsh-render .
docker run -p 10000:10000 agentsh-render

curl http://localhost:10000/demo/blocked | jq .
```

## How It Works

The Express server wraps every command with `agentsh exec` before executing it:

```
Express: agentsh exec --root=/workspace demo -- /bin/bash -c "sudo whoami"
                     |
                     v
            +-------------------+
            |  agentsh exec     |  CLI sends to agentsh server
            |  (intercepts)     |
            +--------+----------+
                     |
                     v
            +-------------------+
            |  agentsh server   |  Policy evaluation + Landlock
            |  (pre-warmed)     |  + seccomp file enforcement
            +--------+----------+
                     |
              +------+------+
              v             v
        +----------+  +----------+
        |  ALLOW   |  |  BLOCK   |
        | exit: 0  |  | exit: 126|
        +----------+  +----------+
```

## Capabilities on Render

Based on `agentsh detect` on Render (kernel 6.8.0-1051-aws):

**Protection Score: 100/100**

| Category | Score | Active Backend | Status |
|----------|-------|----------------|--------|
| File Protection | 25/25 | Landlock ABI v5 | Kernel path restrictions for all file operations |
| Command Control | 25/25 | seccomp-execve | execve interception via seccomp_user_notify |
| Network | 20/20 | landlock-network | TCP connect/bind filtering at kernel level |
| Resource Limits | 15/15 | cgroups-v2 | CPU, memory, and process limits |
| Isolation | 15/15 | capability-drop | Privilege reduction via capget+prctl |

| Capability | Status | Notes |
|------------|--------|-------|
| Landlock | Working | ABI v5 -- kernel-enforced path restrictions + execution control |
| seccomp | Working | `seccomp_user_notify` for execve interception + file enforcement |
| Landlock network | Working | TCP connect/bind filtering at kernel level |
| cgroups v2 | Working | Resource limits (memory, CPU, processes) |
| Capability drop | Working | Privilege reduction |
| Network proxy | Working | Domain/IP/port filtering via agentsh proxy |
| DLP | Working | Secret detection and redaction in LLM proxy traffic |
| Audit logging | Working | All operations logged to SQLite |
| BASH_ENV | Working | Dangerous builtins disabled (kill, enable, ulimit) |
| ptrace | Not available | Needs SYS_PTRACE capability (not exposed on Render) |
| FUSE | Not available | Needs /dev/fuse + SYS_ADMIN (not exposed on Render) |
| eBPF | Not available | Needs CAP_BPF (not exposed on Render) |
| PID namespace | Not available | Host namespace (not configurable on Render) |

## For Render Engineers: What to Enable

**Note**: All core security enforcement works today using Landlock + seccomp + cgroups + capability-drop. This achieves a **100/100 Protection Score** with no Render-side changes needed.

The features below are optional enhancements that would unlock additional capabilities.

### FUSE (`/dev/fuse`) -- Nice to Have

**Current state**: Render containers lack `/dev/fuse` and `CAP_SYS_ADMIN`. agentsh's FUSE overlay cannot mount.

**What it would add** (beyond what Landlock + seccomp already enforce):
- **Soft-delete quarantine** -- `rm` moves files to a quarantine directory instead of deleting. Files can be restored with `agentsh trash restore`. Without FUSE, deletes are either blocked or permanent -- there is no undo.
- **VFS-level overlay** -- Interception at the filesystem layer rather than the syscall layer. More resilient against edge cases like direct file descriptor manipulation.

**Not needed for**: File read/write blocking (Landlock handles this), credential file protection, symlink restrictions.

**How to enable**: Expose `/dev/fuse` (character device 10,229) to containers, or add `CAP_SYS_ADMIN` / allow `mount()` in the container security context.

### ptrace (`SYS_PTRACE`) -- Low Impact

**Current state**: Render containers do not have the `SYS_PTRACE` capability. agentsh is configured with `on_attach_failure: "fail_open"` so it degrades gracefully.

**What it would add**: A second enforcement layer via syscall tracing (execve, file, network, signal interception). This is redundant with Landlock + seccomp on Render -- both already cover command control and file enforcement.

**How to enable**: Add `SYS_PTRACE` capability to the container security context.

### PID Namespace -- Low Impact

**Current state**: Containers run in the host PID namespace.

**What it would add**: Process isolation -- agentsh can create sessions in isolated PID namespaces, preventing agents from seeing or signaling other processes.

**How to enable**: Allow `CLONE_NEWPID` in the container security policy.

### Summary

| Feature | Impact | Current | What's Needed |
|---------|--------|---------|---------------|
| FUSE | Nice to have -- soft-delete quarantine, VFS overlay | Not available | Expose `/dev/fuse` or `CAP_SYS_ADMIN` |
| ptrace | Low -- redundant with Landlock + seccomp | Not available | `SYS_PTRACE` capability |
| PID namespace | Low -- process isolation | Not available | Allow `CLONE_NEWPID` |

## Configuration

Security policy is defined in two files:

- **`config.yaml`** -- Server configuration: [Landlock](https://www.agentsh.org/docs/#landlock) enforcement, [seccomp](https://www.agentsh.org/docs/#seccomp) file monitor, network interception, [DLP patterns](https://www.agentsh.org/docs/#llm-proxy), cgroups limits, [env_inject](https://www.agentsh.org/docs/#shell-shim) (BASH_ENV for builtin blocking)
- **`default.yaml`** -- [Policy rules](https://www.agentsh.org/docs/#policy-reference): [command rules](https://www.agentsh.org/docs/#command-rules), [network rules](https://www.agentsh.org/docs/#network-rules), [file rules](https://www.agentsh.org/docs/#file-rules)

See the [agentsh documentation](https://www.agentsh.org/docs/) for the full policy reference.

## Security Policy

The `default.yaml` policy enforces:

- **Commands** -- Safe tools allowed (ls, cat, grep, git, python3, node, etc.), dangerous commands blocked (sudo, su, ssh, scp, nc, nmap, mount, kill, pkill, shutdown)
- **Files** -- /workspace full access, /tmp full access, system paths read-only, sensitive files (/etc/shadow, /etc/sudoers) denied, symlink escape prevented
- **Network** -- Package registries and code hosts allowed, cloud metadata blocked (all 6 providers), private networks blocked (RFC 1918 + link-local), malicious domains blocked, general HTTPS allowed
- **DLP** -- Redacts OpenAI/Anthropic/AWS/GitHub/Slack keys, JWTs, private keys, emails, phones, credit cards, SSNs in API proxy traffic
- **Resources** -- 2GB memory, 100% CPU, 100 PIDs, 5-minute command timeout

## Project Structure

```
agentsh-render/
├── Dockerfile              # Container image with agentsh v0.18.1
├── config.yaml             # Server config (Landlock, seccomp, DLP, network, cgroups)
├── default.yaml            # Security policy (commands, network, files)
├── startup.sh              # Starts agentsh server, then Express app
├── render.yaml             # Render Blueprint (Docker Web Service)
├── package.json            # Node.js dependencies
├── src/
│   └── index.js            # Express server (API routes, agentsh exec wrapping)
└── test/                   # Integration tests (68 tests, 12 categories)
    ├── global-setup.js     # Docker build + container startup + health check
    ├── helpers/
    │   └── sandbox.js      # Test utilities (fetchDemo, executeCommand, findResult)
    ├── agentsh-installation.test.js
    ├── agentsh-status.test.js
    ├── allowed-commands.test.js
    ├── blocked-commands.test.js
    ├── cloud-metadata.test.js
    ├── command-blocking.test.js
    ├── devtools.test.js
    ├── dlp-redaction.test.js
    ├── filesystem.test.js
    ├── network-filtering.test.js
    ├── privilege-escalation.test.js
    └── ssrf-prevention.test.js
```

## Demo Endpoints

| Method | Path | Tests | Description |
|--------|------|-------|-------------|
| GET | `/health` | -- | Health check |
| GET | `/demo/status` | 7 | agentsh version, detect output, kernel version |
| GET | `/demo/allowed` | 4 | Safe commands: whoami, pwd, ls, echo |
| GET | `/demo/blocked` | 3 | Policy-blocked: nc, nmap, metadata curl |
| GET | `/demo/commands` | 9 | Full command blocking: sudo, su, ssh, scp, nc, nmap, mount, pkill |
| GET | `/demo/privilege-escalation` | 6 | sudo, su, shadow read, sudoers write, chroot, nsenter |
| GET | `/demo/filesystem` | 8 | Workspace writes allowed; /etc, /usr writes blocked; symlink escape blocked |
| GET | `/demo/cloud-metadata` | 6 | AWS, GCP, Azure, DigitalOcean, Alibaba, Oracle |
| GET | `/demo/ssrf` | 9 | RFC 1918 ranges, link-local blocked; external HTTPS allowed |
| GET | `/demo/dlp` | 4 | DLP configuration and redaction info |
| GET | `/demo/devtools` | 6 | Python, Node.js, git, curl, pip3, grep |
| GET | `/demo/network` | 5 | Network filtering: evil.com, private IPs, metadata blocked |
| POST | `/execute` | -- | Execute user-provided command (rate limited, optional API key) |

## Abuse Protection

- **Rate limiting** -- per-IP limits via `express-rate-limit`:
  - `/demo/*` endpoints: 30 requests/minute per IP
  - `POST /execute`: 10 requests/minute per IP
  - `/health`: no limit
- **API key authentication** on `/execute` -- optional, enforced when the `API_KEY` environment variable is set. Pass via `X-API-Key` header or `?api_key=` query parameter. When `API_KEY` is not set, `/execute` remains open for demo use.
- **Request validation** -- commands are limited to 1024 characters, empty commands rejected
- **agentsh governance** -- even if abuse bypasses rate limits, the sandbox policy still blocks dangerous commands, network access, and file modifications

## Testing

```bash
# Against local Docker container (builds image, starts container, runs tests)
npm test

# Against live Render deployment
TEST_URL=https://agentsh-demo.onrender.com npm test
```

68 tests across 12 files covering installation, status, allowed/blocked commands, privilege escalation, filesystem protection, cloud metadata, SSRF prevention, network filtering, DLP configuration, and dev tools.

## Render Environment

| Property | Value |
|----------|-------|
| Service Type | Docker Web Service |
| Base Image | Ubuntu 22.04 |
| Kernel | 6.8.0-1051-aws |
| Node.js | 20 |
| Python | 3.10 |
| agentsh | v0.18.1 (`.deb` package) |
| Enforcement | Landlock ABI v5 + seccomp + cgroups v2 + capability-drop |
| Protection Score | 100/100 |
| Workspace | `/workspace` |

## Related Projects

- [agentsh](https://github.com/canyonroad/agentsh) -- Runtime security for AI agents ([docs](https://www.agentsh.org/docs/))
- [agentsh + Cloudflare](https://github.com/canyonroad/agentsh-cloudflare) -- agentsh integration with Cloudflare Containers
- [Render Documentation](https://docs.render.com)

## License

MIT
