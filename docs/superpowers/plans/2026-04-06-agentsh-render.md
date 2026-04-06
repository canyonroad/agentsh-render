# agentsh + Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an example/demo repo showing agentsh runtime security on Render, with demo endpoints, comprehensive tests, and one-click Blueprint deployment.

**Architecture:** Express.js web service inside a Docker container with agentsh v0.16.9. Demo endpoints execute commands via `agentsh exec` (child process), which routes through the agentsh policy engine. Tests hit the HTTP API from outside the container.

**Tech Stack:** Node.js, Express, agentsh v0.16.9, Docker (Ubuntu 22.04), Vitest, Render Blueprint (render.yaml)

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | Dependencies and scripts |
| `.gitignore` | Git ignore patterns |
| `config.yaml` | agentsh server configuration (ports, DLP, audit, enforcement) |
| `default.yaml` | Security policy rules (commands, network, files, env, resources) |
| `src/index.js` | Express app: demo endpoints, execute endpoint, health check |
| `Dockerfile` | Ubuntu 22.04 + Node.js + agentsh v0.16.9 container image |
| `startup.sh` | Container entrypoint: start agentsh server, install shim, start Express |
| `render.yaml` | Render Blueprint for one-click deployment |
| `vitest.config.js` | Vitest configuration with global setup |
| `test/global-setup.js` | Build image, start container, health check, teardown |
| `test/helpers/sandbox.js` | `fetchDemo()`, `findResult()`, `BASE_URL` |
| `test/helpers/assertions.js` | `expectBlocked()`, `expectAllowed()` |
| `test/installation.test.js` | agentsh binary, version, config files present |
| `test/status.test.js` | agentsh detect, capabilities, kernel info |
| `test/allowed.test.js` | Safe commands succeed |
| `test/blocked.test.js` | Policy-blocked commands fail |
| `test/commands.test.js` | Command blocking across categories |
| `test/privilege.test.js` | Privilege escalation prevention |
| `test/filesystem.test.js` | File protection (/etc, /usr, workspace) |
| `test/network.test.js` | Network filtering (private nets, evil domains) |
| `test/cloud-metadata.test.js` | Cloud metadata endpoint blocking |
| `test/ssrf.test.js` | SSRF prevention (RFC 1918 ranges) |
| `test/dlp.test.js` | Secret redaction in output |
| `test/devtools.test.js` | Development tools work |
| `README.md` | Documentation, quick start, deploy button |
| `LICENSE` | MIT license |

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "agentsh-render",
  "version": "1.0.0",
  "description": "Runtime security for AI agents on Render using agentsh",
  "type": "module",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "express": "^4.21.0"
  },
  "devDependencies": {
    "vitest": "^3.1.0"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
dist/
.env
*.log
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` generated.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "scaffold: init project with express and vitest"
```

---

### Task 2: agentsh Server Configuration

**Files:**
- Create: `config.yaml`

- [ ] **Step 1: Create config.yaml**

This configures the agentsh server. FUSE/Landlock/ptrace are disabled — they will be enabled after running `agentsh detect` on Render to confirm availability.

```yaml
server:
  http:
    addr: "127.0.0.1:18080"
  grpc:
    addr: "127.0.0.1:9090"

logging:
  format: json
  output: stderr
  rotation:
    max_size_mb: 100
    max_backups: 3
    max_age_days: 7

sessions:
  base_dir: /var/lib/agentsh/sessions
  max_sessions: 50
  defaults:
    timeout: 1h
    idle_timeout: 15m

audit:
  storage:
    type: sqlite
    path: /var/lib/agentsh/events.db
  format: jsonl
  retention_days: 90

security:
  fuse:
    enabled: false
  landlock:
    enabled: false
  bash_env:
    enabled: true
    inject_path: /usr/lib/agentsh/bash_startup.sh
  network:
    interception_mode: all
  env_inject:
    AGENTSH_SERVER: "http://127.0.0.1:18080"
    BASH_ENV: "/usr/lib/agentsh/bash_startup.sh"

dlp:
  mode: redact
  patterns:
    - name: openai_key
      pattern: 'sk-[a-zA-Z0-9]{20,}'
      type: custom
    - name: anthropic_key
      pattern: 'sk-ant-[a-zA-Z0-9-]{20,}'
      type: custom
    - name: aws_key
      pattern: 'AKIA[0-9A-Z]{16}'
      type: custom
    - name: github_pat
      pattern: 'ghp_[a-zA-Z0-9]{36}'
      type: custom
    - name: jwt
      pattern: 'eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}'
      type: custom
    - name: private_key
      pattern: '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'
      type: custom
    - name: slack_token
      pattern: 'xox[bpors]-[a-zA-Z0-9-]{10,}'
      type: custom
  builtin_patterns:
    - email
    - phone
    - credit_card
    - ssn
```

- [ ] **Step 2: Commit**

```bash
git add config.yaml
git commit -m "config: add agentsh server configuration"
```

---

### Task 3: Security Policy

**Files:**
- Create: `default.yaml`

- [ ] **Step 1: Create default.yaml**

```yaml
# agentsh security policy for Render
# Defines what commands, network, and file operations are allowed/blocked.

file_rules:
  # Workspace: full read/write, soft-delete on rm
  - name: workspace-access
    paths:
      - /workspace/**
    operations: [read, write, create, mkdir, chmod, rename]
    action: allow
  - name: workspace-delete
    paths:
      - /workspace/**
    operations: [delete]
    action: soft_delete

  # Home directory
  - name: home-access
    paths:
      - /home/**
    operations: [read, write, create, mkdir, chmod, rename]
    action: allow
  - name: home-delete
    paths:
      - /home/**
    operations: [delete]
    action: soft_delete

  # Temp directories
  - name: tmp-access
    paths:
      - /tmp/**
      - /var/tmp/**
    operations: [read, write, create, delete, mkdir, chmod, rename]
    action: allow

  # System paths: read-only
  - name: system-read
    paths:
      - /usr/**
      - /lib/**
      - /lib64/**
      - /bin/**
      - /sbin/**
    operations: [read]
    action: allow
  - name: etc-read
    paths:
      - /etc/**
    operations: [read]
    action: allow

  # Dangerous binaries: deny execution
  - name: block-dangerous-binaries
    paths:
      - /usr/bin/sudo
      - /usr/bin/su
      - /usr/bin/pkexec
      - /usr/bin/doas
      - /bin/su
      - /usr/sbin/chroot
      - /usr/bin/nsenter
      - /usr/bin/unshare
    operations: [execute]
    action: deny

  # Credential files: require approval
  - name: credential-files
    paths:
      - ~/.ssh/**
      - ~/.aws/**
      - ~/.gcloud/**
      - ~/.azure/**
      - ~/.config/gcloud/**
      - ~/.kube/**
      - "**/.env"
      - "**/.env.*"
      - ~/.git-credentials
      - ~/.netrc
    operations: [read, write]
    action: approve
    timeout: 2m

  # Sensitive system files: deny
  - name: block-shadow
    paths:
      - /etc/shadow
      - /etc/shadow-
      - /etc/gshadow
      - /etc/gshadow-
      - /etc/sudoers
      - /etc/sudoers.d/**
    operations: [read, write]
    action: deny

  # Proc/sys: deny
  - name: block-proc-sys
    paths:
      - /proc/*/environ
      - /proc/*/mem
      - /sys/**
    operations: [read, write]
    action: deny

  # Default deny
  - name: default-deny-files
    paths:
      - "**"
    operations: [write, create, delete, mkdir, chmod, rename]
    action: deny

network_rules:
  # Localhost: allow
  - name: localhost
    hosts:
      - "127.0.0.1"
      - "::1"
      - "localhost"
    action: allow

  # Package registries: allow
  - name: npm-registry
    hosts:
      - "registry.npmjs.org"
    ports: [443]
    action: allow
  - name: pypi
    hosts:
      - "pypi.org"
      - "files.pythonhosted.org"
    ports: [443]
    action: allow
  - name: cargo
    hosts:
      - "crates.io"
      - "static.crates.io"
    ports: [443]
    action: allow
  - name: go-proxy
    hosts:
      - "proxy.golang.org"
      - "sum.golang.org"
    ports: [443]
    action: allow

  # Code hosting: allow
  - name: github
    hosts:
      - "github.com"
      - "*.github.com"
      - "raw.githubusercontent.com"
    ports: [443, 22]
    action: allow
  - name: gitlab
    hosts:
      - "gitlab.com"
      - "*.gitlab.com"
    ports: [443, 22]
    action: allow
  - name: bitbucket
    hosts:
      - "bitbucket.org"
      - "*.bitbucket.org"
    ports: [443, 22]
    action: allow

  # Cloud metadata: block
  - name: block-cloud-metadata
    hosts:
      - "169.254.169.254"
      - "metadata.google.internal"
      - "100.100.100.200"
    action: deny

  # Private networks: block
  - name: block-private-networks
    cidrs:
      - "10.0.0.0/8"
      - "172.16.0.0/12"
      - "192.168.0.0/16"
      - "169.254.0.0/16"
    action: deny

  # Evil/test domains: block
  - name: block-evil
    hosts:
      - "evil.com"
      - "*.evil.com"
      - "malicious.example.com"
    action: deny

  # Default deny
  - name: default-deny-network
    hosts:
      - "*"
    action: deny

command_rules:
  # Safe commands: allow
  - name: safe-commands
    commands:
      - ls
      - cat
      - head
      - tail
      - grep
      - find
      - wc
      - sort
      - uniq
      - diff
      - pwd
      - echo
      - date
      - which
      - whoami
      - id
      - uname
      - env
      - printenv
      - true
      - false
      - test
      - "["
      - printf
      - basename
      - dirname
      - realpath
      - readlink
      - stat
      - file
      - du
      - df
      - free
      - uptime
      - hostname
      - tee
      - xargs
      - tr
      - cut
      - awk
      - sed
      - yes
      - seq
      - sleep
      - timeout
      - mktemp
      - touch
      - mkdir
      - cp
      - mv
      - rm
      - ln
      - chmod
      - chown
    action: allow

  # Shells: allow
  - name: shells
    commands:
      - bash
      - sh
      - /bin/bash
      - /bin/sh
    action: allow

  # Development tools: allow
  - name: dev-tools
    commands:
      - git
      - node
      - npm
      - npx
      - python
      - python3
      - pip
      - pip3
      - cargo
      - go
      - make
      - cc
      - gcc
      - g++
      - rustc
      - java
      - javac
      - ruby
      - perl
    action: allow

  # curl/wget: allow direct, approve in scripts
  - name: network-fetch
    commands:
      - curl
      - wget
    action: allow

  # Git safety: block destructive operations
  - name: block-git-force-push
    patterns:
      - "git push --force"
      - "git push -f"
    action: deny
  - name: block-git-push-main
    patterns:
      - "git push origin main"
      - "git push origin master"
    action: deny
  - name: block-git-reset-hard
    patterns:
      - "git reset --hard"
    action: deny
  - name: block-git-clean-force
    patterns:
      - "git clean -f"
    action: deny

  # Network tools: block
  - name: block-network-tools
    commands:
      - nc
      - netcat
      - ncat
      - socat
      - telnet
      - nmap
    action: deny

  # SSH tools: block
  - name: block-ssh
    commands:
      - ssh
      - scp
      - sftp
      - rsync
    action: deny

  # Privilege escalation: block
  - name: block-shell-escape
    commands:
      - sudo
      - su
      - doas
      - pkexec
      - chroot
      - nsenter
      - unshare
    action: deny

  # System commands: block
  - name: block-system
    commands:
      - shutdown
      - reboot
      - halt
      - poweroff
      - systemctl
      - service
      - mount
      - umount
      - dd
      - fdisk
      - mkfs
      - parted
    action: deny

  # Process control: block
  - name: block-process-control
    commands:
      - kill
      - killall
      - pkill
    action: deny

  # Bash builtins to disable
  - name: block-bash-builtins
    commands:
      - enable
      - ulimit
      - umask
      - builtin
      - command
    action: deny

  # Package installation: require approval
  - name: approve-package-install
    patterns:
      - "npm install*"
      - "npm add*"
      - "pip install*"
      - "pip3 install*"
      - "cargo install*"
    action: approve
    timeout: 2m

  # Default allow (for compatibility)
  - name: default-allow-commands
    commands:
      - "*"
    action: allow

resource_limits:
  max_memory_mb: 2048
  cpu_quota_percent: 50
  max_pids: 100
  disk_read_mbps: 50
  disk_write_mbps: 25
  command_timeout: 5m
  session_timeout: 1h
  idle_timeout: 15m

audit:
  log_allowed: true
  log_denied: true
  log_approved: true
  include_stdout: true
  include_stderr: true
  exclude_file_content: true
  retention_days: 90

environment:
  allowlist:
    - HOME
    - PATH
    - USER
    - SHELL
    - TERM
    - LANG
    - "LC_*"
    - HOSTNAME
    - HTTPS_PROXY
    - HTTP_PROXY
    - "AGENTSH_*"
    - NODE_ENV
    - NODE_PATH
    - GOPATH
    - CARGO_HOME
    - PORT
  denylist:
    - "*_SECRET*"
    - "*_TOKEN"
    - "*_KEY"
    - "*_PASSWORD"
    - DATABASE_URL
    - OPENAI_API_KEY
    - ANTHROPIC_API_KEY
    - "AWS_*"
  block_enumeration: true
```

- [ ] **Step 2: Commit**

```bash
git add default.yaml
git commit -m "policy: add security rules for commands, network, files, env"
```

---

### Task 4: Express Application

**Files:**
- Create: `src/index.js`

- [ ] **Step 1: Create src directory**

Run: `mkdir -p src`

- [ ] **Step 2: Create src/index.js**

```js
import express from 'express';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCb);
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// --- Helpers ---

async function executeCommand(command, timeout = 30000) {
  try {
    const { stdout, stderr } = await execFile(
      'agentsh',
      ['exec', '--root=/workspace', 'demo', '--', '/bin/bash', '-c', command],
      { timeout, encoding: 'utf-8' }
    );
    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
      blocked: false,
    };
  } catch (err) {
    const stdout = (err.stdout || '').trim();
    const stderr = (err.stderr || '').trim();
    const output = stdout + '\n' + stderr;
    const blocked =
      output.includes('command denied by policy') ||
      output.includes('blocked by policy') ||
      output.includes('BLOCKED:') ||
      output.includes('Permission denied') ||
      output.includes('Operation not permitted');
    return {
      success: false,
      stdout,
      stderr,
      exitCode: typeof err.code === 'number' ? err.code : 1,
      blocked,
      message: blocked ? 'Blocked by agentsh policy' : stderr,
    };
  }
}

async function runCommands(commands) {
  return Promise.all(
    commands.map(async (cmd) => ({
      command: cmd,
      result: await executeCommand(cmd),
    }))
  );
}

// --- Health ---

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// --- Demo: Status ---

app.get('/demo/status', async (_req, res) => {
  try {
    const results = await runCommands([
      'agentsh version',
      'agentsh detect',
      'uname -r',
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Demo: Allowed Commands ---

app.get('/demo/allowed', async (_req, res) => {
  try {
    const results = await runCommands([
      'whoami',
      'pwd',
      'ls /workspace',
      'echo "hello world"',
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Demo: Blocked Commands ---

app.get('/demo/blocked', async (_req, res) => {
  try {
    const results = await runCommands([
      'nc -h',
      'nmap --version',
      'curl -s --max-time 3 http://169.254.169.254/latest/meta-data/',
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Demo: Command Blocking (categories) ---

app.get('/demo/commands', async (_req, res) => {
  try {
    const results = await runCommands([
      // Privilege escalation
      'sudo whoami',
      'su -c whoami',
      // SSH tools
      'ssh -V',
      'scp --help',
      // Network tools
      'nc -h',
      'netcat -h',
      'socat -V',
      'telnet --help',
      // System admin
      'shutdown -h now',
      'reboot',
      'mount /dev/sda1 /mnt',
      // Process control
      'kill -9 1',
      'killall node',
      'pkill -9 bash',
      // Safe (should still work)
      'echo "this is allowed"',
      'ls -la /',
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Demo: Privilege Escalation ---

app.get('/demo/privilege-escalation', async (_req, res) => {
  try {
    const results = await runCommands([
      'sudo whoami',
      'su - root -c whoami',
      'pkexec /bin/bash',
      'cat /etc/shadow',
      'echo test >> /etc/sudoers',
      'chroot / /bin/bash -c whoami',
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Demo: Filesystem Protection ---

app.get('/demo/filesystem', async (_req, res) => {
  try {
    const results = await runCommands([
      // Allowed: workspace
      'echo testdata > /workspace/demo-test.txt',
      'cat /workspace/demo-test.txt',
      // Allowed: read system files
      'ls /etc',
      'cat /etc/hostname',
      // Blocked: write to system paths
      'echo test > /etc/test.txt',
      'echo test > /usr/bin/test',
      'mkdir /etc/testdir',
      'cp /etc/hostname /etc/hostname.bak',
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Demo: Cloud Metadata Blocking ---

app.get('/demo/cloud-metadata', async (_req, res) => {
  try {
    const results = await runCommands([
      // AWS
      'curl -s --max-time 3 http://169.254.169.254/latest/meta-data/',
      // GCP
      'curl -s --max-time 3 -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/',
      // Azure
      'curl -s --max-time 3 -H "Metadata: true" "http://169.254.169.254/metadata/instance?api-version=2021-02-01"',
      // DigitalOcean
      'curl -s --max-time 3 http://169.254.169.254/metadata/v1/',
      // Alibaba Cloud
      'curl -s --max-time 3 http://100.100.100.200/latest/meta-data/',
      // Oracle Cloud
      'curl -s --max-time 3 http://169.254.169.254/opc/v2/instance/',
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Demo: SSRF Prevention ---

app.get('/demo/ssrf', async (_req, res) => {
  try {
    const results = await runCommands([
      // RFC 1918 private ranges: blocked
      'curl -s --max-time 3 http://10.0.0.1/',
      'curl -s --max-time 3 http://10.255.255.255/',
      'curl -s --max-time 3 http://172.16.0.1/',
      'curl -s --max-time 3 http://172.31.255.255/',
      'curl -s --max-time 3 http://192.168.0.1/',
      'curl -s --max-time 3 http://192.168.255.255/',
      // Link-local: blocked
      'curl -s --max-time 3 http://169.254.0.1/',
      // Localhost: allowed
      'curl -s --max-time 3 http://127.0.0.1:18080/health',
      // Allowlisted external: allowed
      'curl -s --max-time 3 https://registry.npmjs.org/express | head -c 100',
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Demo: DLP (Secret Redaction) ---

app.get('/demo/dlp', async (_req, res) => {
  try {
    const results = await runCommands([
      'echo "my openai key is sk-abc123def456ghi789jklmnopqrst"',
      'echo "aws access key AKIAIOSFODNN7EXAMPLE"',
      'echo "github token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12"',
      'echo "email user@example.com phone 555-123-4567"',
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Demo: Development Tools ---

app.get('/demo/devtools', async (_req, res) => {
  try {
    const results = await runCommands([
      'python3 --version',
      'node --version',
      'git --version',
      'curl --version | head -1',
      'pip3 --version',
      'echo "hello world" | grep hello',
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Demo: Network Filtering ---

app.get('/demo/network', async (_req, res) => {
  try {
    const results = await runCommands([
      // Blocked: evil domain
      'curl -s --max-time 3 http://evil.com',
      // Blocked: private network
      'curl -s --max-time 3 http://10.0.0.1',
      // Blocked: cloud metadata
      'curl -s --max-time 3 http://169.254.169.254',
      // Allowed: localhost
      'curl -s --max-time 3 http://127.0.0.1:18080/health',
      // Allowed: npm registry
      'curl -s --max-time 3 https://registry.npmjs.org/express | head -c 100',
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Execute User Command ---

app.post('/execute', async (req, res) => {
  const { command } = req.body;
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'Missing "command" in request body' });
  }
  try {
    const result = await executeCommand(command);
    res.json({ command, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Start ---

app.listen(PORT, () => {
  console.log(`agentsh-render demo listening on port ${PORT}`);
});
```

- [ ] **Step 3: Verify syntax**

Run: `node --check src/index.js`
Expected: No output (no syntax errors).

- [ ] **Step 4: Commit**

```bash
git add src/index.js
git commit -m "feat: add express app with demo endpoints and agentsh exec"
```

---

### Task 5: Docker Setup

**Files:**
- Create: `Dockerfile`
- Create: `startup.sh`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# System dependencies
RUN apt-get update && apt-get install -y \
    curl \
    bash \
    git \
    sudo \
    ca-certificates \
    libseccomp2 \
    fuse3 \
    python3 \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# agentsh v0.16.9
RUN curl -fsSL https://github.com/canyonroad/agentsh/releases/download/v0.16.9/agentsh_0.16.9_linux_amd64.deb \
    -o /tmp/agentsh.deb && dpkg -i /tmp/agentsh.deb && rm /tmp/agentsh.deb

# Create directories
RUN mkdir -p /etc/agentsh/policies /var/lib/agentsh/sessions /workspace

# Copy agentsh config and policy
COPY config.yaml /etc/agentsh/config.yaml
COPY default.yaml /etc/agentsh/policies/default.yaml

# Copy and install app
COPY package.json package-lock.json /app/
RUN cd /app && npm ci --production
COPY src/ /app/src/

# Copy startup script
COPY startup.sh /usr/local/bin/startup.sh
RUN chmod +x /usr/local/bin/startup.sh

# Environment
ENV AGENTSH_SERVER=http://127.0.0.1:18080
ENV PORT=10000

WORKDIR /workspace
EXPOSE 10000

CMD ["/usr/local/bin/startup.sh"]
```

Note: The shell shim is NOT installed during build (would intercept npm ci). It is installed at runtime in startup.sh.

- [ ] **Step 2: Create startup.sh**

```bash
#!/bin/bash
set -e

# 1. Start agentsh server in background
agentsh server start &
AGENTSH_PID=$!

# 2. Wait for agentsh health check
echo "Waiting for agentsh server..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:18080/health > /dev/null 2>&1; then
    echo "agentsh server is ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: agentsh server failed to start"
    exit 1
  fi
  sleep 1
done

# 3. Install shell shim (replaces /bin/bash with agentsh interceptor)
agentsh shim install
echo "Shell shim installed"

# 4. Warm up the shim
agentsh exec --root=/workspace warmup -- echo "shim ready"
echo "Shim warmed up"

# 5. Start Express app (foreground — Render needs a foreground process)
echo "Starting Express app on port ${PORT:-10000}..."
exec node /app/src/index.js
```

- [ ] **Step 3: Verify Dockerfile syntax**

Run: `docker build --check .` or just verify it parses: `docker build -t agentsh-render-check --target=0 . 2>&1 | head -5`

If `--check` is not supported, just verify the Dockerfile is valid by running:
Run: `head -5 Dockerfile`
Expected: Shows the FROM line.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile startup.sh
git commit -m "docker: add Dockerfile and startup script with agentsh"
```

---

### Task 6: Render Blueprint

**Files:**
- Create: `render.yaml`

- [ ] **Step 1: Create render.yaml**

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

- [ ] **Step 2: Commit**

```bash
git add render.yaml
git commit -m "deploy: add Render Blueprint for one-click deployment"
```

---

### Task 7: Build and Smoke Test

- [ ] **Step 1: Build the Docker image**

Run: `docker build -t agentsh-render .`
Expected: Build completes successfully. Final output shows image ID.

- [ ] **Step 2: Start the container**

Run: `docker run -d --name agentsh-render-test -p 10000:10000 agentsh-render`
Expected: Container ID printed.

- [ ] **Step 3: Wait for health and smoke test**

Run: `for i in $(seq 1 60); do curl -sf http://localhost:10000/health && break; sleep 1; done`
Expected: `{"status":"ok"}`

Then run: `curl -s http://localhost:10000/demo/allowed | jq .`
Expected: JSON array with results for whoami, pwd, ls, echo. All should show `"blocked": false`.

Then run: `curl -s http://localhost:10000/demo/blocked | jq .`
Expected: JSON array with results for nc, nmap, metadata curl. All should show `"blocked": true`.

- [ ] **Step 4: Run agentsh detect**

Run: `docker exec agentsh-render-test agentsh detect`
Expected: Output shows which enforcement mechanisms are available. Note which of FUSE, Landlock, ptrace, seccomp are supported. Use this to update config.yaml if needed.

- [ ] **Step 5: Stop the container**

Run: `docker rm -f agentsh-render-test`

- [ ] **Step 6: If detect shows additional capabilities, update config.yaml**

If `agentsh detect` shows ptrace or seccomp are available, update `config.yaml` to enable them:

```yaml
security:
  enforcement:
    mode: ptrace    # or seccomp, depending on detect output
    ptrace:
      enabled: true
      trace:
        - execve
        - file
        - network
        - signal
    seccomp:
      enabled: true
      file_monitoring:
        enabled: true
        enforce_without_fuse: true
```

If no additional capabilities are available, leave config.yaml as-is.

- [ ] **Step 7: Commit any config changes**

```bash
git add config.yaml
git commit -m "config: update enforcement based on agentsh detect results"
```

---

### Task 8: Test Infrastructure

**Files:**
- Create: `vitest.config.js`
- Create: `test/global-setup.js`
- Create: `test/helpers/sandbox.js`
- Create: `test/helpers/assertions.js`

- [ ] **Step 1: Create vitest.config.js**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './test/global-setup.js',
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
```

- [ ] **Step 2: Create test/global-setup.js**

```js
import { execSync } from 'child_process';

const CONTAINER_NAME = 'agentsh-render-test';
const IMAGE_NAME = 'agentsh-render';
const PORT = 10000;

export async function setup() {
  if (process.env.BASE_URL) {
    console.log(`Using remote service at ${process.env.BASE_URL}`);
    await waitForHealth(process.env.BASE_URL);
    return;
  }

  console.log('Building Docker image...');
  execSync(`docker build -t ${IMAGE_NAME} .`, { stdio: 'inherit' });

  // Remove any existing container
  try {
    execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore' });
  } catch {}

  console.log('Starting container...');
  execSync(
    `docker run -d --name ${CONTAINER_NAME} -p ${PORT}:10000 ${IMAGE_NAME}`,
    { stdio: 'inherit' }
  );

  await waitForHealth(`http://localhost:${PORT}`);
}

async function waitForHealth(baseUrl) {
  console.log(`Waiting for ${baseUrl}/health...`);
  for (let i = 0; i < 90; i++) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) {
        console.log('Service is ready');
        // Warm up: hit /demo/status to ensure agentsh exec path works
        await fetch(`${baseUrl}/demo/status`);
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Service failed to become ready within 90 seconds');
}

export async function teardown() {
  if (process.env.BASE_URL) return;
  console.log('Stopping container...');
  try {
    execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore' });
  } catch {}
}
```

- [ ] **Step 3: Create test/helpers/sandbox.js**

```js
const BASE_URL = process.env.BASE_URL || 'http://localhost:10000';

export async function fetchDemo(path) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) {
    throw new Error(`${url} returned ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export async function executeCommand(command) {
  const url = `${BASE_URL}/execute`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    throw new Error(`${url} returned ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export function findResult(results, commandSubstring) {
  const match = results.find((r) => r.command.includes(commandSubstring));
  if (!match) {
    throw new Error(
      `No result found for command containing "${commandSubstring}". Available: ${results.map((r) => r.command).join(', ')}`
    );
  }
  return match;
}
```

- [ ] **Step 4: Create test/helpers/assertions.js**

```js
import { expect } from 'vitest';

export function expectBlocked(result) {
  expect(result.result.blocked).toBe(true);
  expect(result.result.success).toBe(false);
}

export function expectAllowed(result) {
  expect(result.result.blocked).toBe(false);
  expect(result.result.success).toBe(true);
}
```

- [ ] **Step 5: Commit**

```bash
git add vitest.config.js test/
git commit -m "test: add vitest config, global setup, and test helpers"
```

---

### Task 9: Tests — Installation & Status

**Files:**
- Create: `test/installation.test.js`
- Create: `test/status.test.js`

- [ ] **Step 1: Create test/installation.test.js**

```js
import { describe, test, expect } from 'vitest';
import { executeCommand } from './helpers/sandbox.js';

describe('Installation', () => {
  test('agentsh binary is installed', async () => {
    const { result } = await executeCommand('which agentsh');
    expect(result.success).toBe(true);
    expect(result.stdout).toContain('agentsh');
  });

  test('agentsh version is v0.16.9', async () => {
    const { result } = await executeCommand('agentsh version');
    expect(result.stdout).toContain('0.16.9');
  });

  test('config file exists', async () => {
    const { result } = await executeCommand('test -f /etc/agentsh/config.yaml && echo exists');
    expect(result.stdout).toContain('exists');
  });

  test('policy file exists', async () => {
    const { result } = await executeCommand('test -f /etc/agentsh/policies/default.yaml && echo exists');
    expect(result.stdout).toContain('exists');
  });
});
```

- [ ] **Step 2: Create test/status.test.js**

```js
import { describe, test, expect } from 'vitest';
import { fetchDemo, findResult } from './helpers/sandbox.js';

describe('Status', () => {
  let results;

  test('fetch status endpoint', async () => {
    results = await fetchDemo('/demo/status');
    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBeGreaterThanOrEqual(3);
  });

  test('agentsh version reported', () => {
    const r = findResult(results, 'agentsh version');
    expect(r.result.success).toBe(true);
    expect(r.result.stdout).toContain('0.16.9');
  });

  test('agentsh detect runs', () => {
    const r = findResult(results, 'agentsh detect');
    expect(r.result.success).toBe(true);
    expect(r.result.stdout.length).toBeGreaterThan(0);
  });

  test('kernel version reported', () => {
    const r = findResult(results, 'uname');
    expect(r.result.success).toBe(true);
    expect(r.result.stdout).toMatch(/\d+\.\d+/);
  });
});
```

- [ ] **Step 3: Run tests to verify**

Run: `npm test -- --reporter=verbose test/installation.test.js test/status.test.js`
Expected: All tests pass. If some fail, fix the issue (may need to rebuild Docker image).

- [ ] **Step 4: Commit**

```bash
git add test/installation.test.js test/status.test.js
git commit -m "test: add installation and status tests"
```

---

### Task 10: Tests — Allowed & Blocked

**Files:**
- Create: `test/allowed.test.js`
- Create: `test/blocked.test.js`

- [ ] **Step 1: Create test/allowed.test.js**

```js
import { describe, test, expect } from 'vitest';
import { fetchDemo, findResult } from './helpers/sandbox.js';
import { expectAllowed } from './helpers/assertions.js';

describe('Allowed Commands', () => {
  let results;

  test('fetch allowed endpoint', async () => {
    results = await fetchDemo('/demo/allowed');
    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBe(4);
  });

  test('whoami succeeds', () => {
    const r = findResult(results, 'whoami');
    expectAllowed(r);
    expect(r.result.stdout.length).toBeGreaterThan(0);
  });

  test('pwd succeeds', () => {
    const r = findResult(results, 'pwd');
    expectAllowed(r);
    expect(r.result.stdout).toContain('/workspace');
  });

  test('ls succeeds', () => {
    const r = findResult(results, 'ls');
    expectAllowed(r);
  });

  test('echo succeeds', () => {
    const r = findResult(results, 'echo');
    expectAllowed(r);
    expect(r.result.stdout).toContain('hello world');
  });
});
```

- [ ] **Step 2: Create test/blocked.test.js**

```js
import { describe, test, expect } from 'vitest';
import { fetchDemo, findResult } from './helpers/sandbox.js';
import { expectBlocked } from './helpers/assertions.js';

describe('Blocked Commands', () => {
  let results;

  test('fetch blocked endpoint', async () => {
    results = await fetchDemo('/demo/blocked');
    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBe(3);
  });

  test('nc is blocked', () => {
    const r = findResult(results, 'nc');
    expectBlocked(r);
  });

  test('nmap is blocked', () => {
    const r = findResult(results, 'nmap');
    expectBlocked(r);
  });

  test('cloud metadata curl is blocked', () => {
    const r = findResult(results, '169.254.169.254');
    expectBlocked(r);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- --reporter=verbose test/allowed.test.js test/blocked.test.js`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add test/allowed.test.js test/blocked.test.js
git commit -m "test: add allowed and blocked command tests"
```

---

### Task 11: Tests — Commands & Privilege Escalation

**Files:**
- Create: `test/commands.test.js`
- Create: `test/privilege.test.js`

- [ ] **Step 1: Create test/commands.test.js**

```js
import { describe, test, expect } from 'vitest';
import { fetchDemo, findResult } from './helpers/sandbox.js';
import { expectBlocked, expectAllowed } from './helpers/assertions.js';

describe('Command Blocking', () => {
  let results;

  test('fetch commands endpoint', async () => {
    results = await fetchDemo('/demo/commands');
    expect(results).toBeInstanceOf(Array);
  });

  test('sudo is blocked', () => {
    expectBlocked(findResult(results, 'sudo whoami'));
  });

  test('su is blocked', () => {
    expectBlocked(findResult(results, 'su -c'));
  });

  test('ssh is blocked', () => {
    expectBlocked(findResult(results, 'ssh'));
  });

  test('scp is blocked', () => {
    expectBlocked(findResult(results, 'scp'));
  });

  test('nc is blocked', () => {
    expectBlocked(findResult(results, 'nc -h'));
  });

  test('socat is blocked', () => {
    expectBlocked(findResult(results, 'socat'));
  });

  test('shutdown is blocked', () => {
    expectBlocked(findResult(results, 'shutdown'));
  });

  test('kill is blocked', () => {
    expectBlocked(findResult(results, 'kill -9'));
  });

  test('echo is still allowed', () => {
    expectAllowed(findResult(results, 'echo'));
  });

  test('ls is still allowed', () => {
    expectAllowed(findResult(results, 'ls -la'));
  });
});
```

- [ ] **Step 2: Create test/privilege.test.js**

```js
import { describe, test, expect } from 'vitest';
import { fetchDemo, findResult } from './helpers/sandbox.js';
import { expectBlocked } from './helpers/assertions.js';

describe('Privilege Escalation', () => {
  let results;

  test('fetch privilege-escalation endpoint', async () => {
    results = await fetchDemo('/demo/privilege-escalation');
    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBe(6);
  });

  test('sudo is blocked', () => {
    expectBlocked(findResult(results, 'sudo'));
  });

  test('su is blocked', () => {
    expectBlocked(findResult(results, 'su -'));
  });

  test('pkexec is blocked', () => {
    expectBlocked(findResult(results, 'pkexec'));
  });

  test('/etc/shadow read is blocked', () => {
    expectBlocked(findResult(results, '/etc/shadow'));
  });

  test('/etc/sudoers write is blocked', () => {
    expectBlocked(findResult(results, '/etc/sudoers'));
  });

  test('chroot is blocked', () => {
    expectBlocked(findResult(results, 'chroot'));
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- --reporter=verbose test/commands.test.js test/privilege.test.js`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add test/commands.test.js test/privilege.test.js
git commit -m "test: add command blocking and privilege escalation tests"
```

---

### Task 12: Tests — Filesystem & Network

**Files:**
- Create: `test/filesystem.test.js`
- Create: `test/network.test.js`

- [ ] **Step 1: Create test/filesystem.test.js**

```js
import { describe, test, expect } from 'vitest';
import { fetchDemo, findResult } from './helpers/sandbox.js';
import { expectBlocked, expectAllowed } from './helpers/assertions.js';

describe('Filesystem Protection', () => {
  let results;

  test('fetch filesystem endpoint', async () => {
    results = await fetchDemo('/demo/filesystem');
    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBe(8);
  });

  test('write to /workspace is allowed', () => {
    expectAllowed(findResult(results, 'echo testdata'));
  });

  test('read from /workspace is allowed', () => {
    const r = findResult(results, 'cat /workspace/demo-test.txt');
    expectAllowed(r);
    expect(r.result.stdout).toContain('testdata');
  });

  test('ls /etc is allowed (read-only)', () => {
    expectAllowed(findResult(results, 'ls /etc'));
  });

  test('cat /etc/hostname is allowed (read-only)', () => {
    expectAllowed(findResult(results, 'cat /etc/hostname'));
  });

  test('write to /etc is blocked', () => {
    expectBlocked(findResult(results, 'echo test > /etc/test.txt'));
  });

  test('write to /usr/bin is blocked', () => {
    expectBlocked(findResult(results, 'echo test > /usr/bin/test'));
  });

  test('mkdir in /etc is blocked', () => {
    expectBlocked(findResult(results, 'mkdir /etc/testdir'));
  });

  test('cp to /etc is blocked', () => {
    expectBlocked(findResult(results, 'cp /etc/hostname'));
  });
});
```

- [ ] **Step 2: Create test/network.test.js**

```js
import { describe, test, expect } from 'vitest';
import { fetchDemo, findResult } from './helpers/sandbox.js';
import { expectBlocked, expectAllowed } from './helpers/assertions.js';

describe('Network Filtering', () => {
  let results;

  test('fetch network endpoint', async () => {
    results = await fetchDemo('/demo/network');
    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBe(5);
  });

  test('evil.com is blocked', () => {
    expectBlocked(findResult(results, 'evil.com'));
  });

  test('private network is blocked', () => {
    expectBlocked(findResult(results, '10.0.0.1'));
  });

  test('cloud metadata is blocked', () => {
    expectBlocked(findResult(results, '169.254.169.254'));
  });

  test('localhost is allowed', () => {
    const r = findResult(results, '127.0.0.1:18080');
    expectAllowed(r);
    expect(r.result.stdout).toContain('ok');
  });

  test('npm registry is allowed', () => {
    expectAllowed(findResult(results, 'registry.npmjs.org'));
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- --reporter=verbose test/filesystem.test.js test/network.test.js`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add test/filesystem.test.js test/network.test.js
git commit -m "test: add filesystem and network filtering tests"
```

---

### Task 13: Tests — Cloud Metadata, SSRF, DLP, DevTools

**Files:**
- Create: `test/cloud-metadata.test.js`
- Create: `test/ssrf.test.js`
- Create: `test/dlp.test.js`
- Create: `test/devtools.test.js`

- [ ] **Step 1: Create test/cloud-metadata.test.js**

```js
import { describe, test, expect } from 'vitest';
import { fetchDemo, findResult } from './helpers/sandbox.js';
import { expectBlocked } from './helpers/assertions.js';

describe('Cloud Metadata Blocking', () => {
  let results;

  test('fetch cloud-metadata endpoint', async () => {
    results = await fetchDemo('/demo/cloud-metadata');
    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBe(6);
  });

  test('AWS metadata is blocked', () => {
    expectBlocked(findResult(results, 'latest/meta-data'));
  });

  test('GCP metadata is blocked', () => {
    expectBlocked(findResult(results, 'metadata.google.internal'));
  });

  test('Azure metadata is blocked', () => {
    expectBlocked(findResult(results, 'metadata/instance'));
  });

  test('DigitalOcean metadata is blocked', () => {
    expectBlocked(findResult(results, 'metadata/v1'));
  });

  test('Alibaba Cloud metadata is blocked', () => {
    expectBlocked(findResult(results, '100.100.100.200'));
  });

  test('Oracle Cloud metadata is blocked', () => {
    expectBlocked(findResult(results, 'opc/v2'));
  });
});
```

- [ ] **Step 2: Create test/ssrf.test.js**

```js
import { describe, test, expect } from 'vitest';
import { fetchDemo, findResult } from './helpers/sandbox.js';
import { expectBlocked, expectAllowed } from './helpers/assertions.js';

describe('SSRF Prevention', () => {
  let results;

  test('fetch ssrf endpoint', async () => {
    results = await fetchDemo('/demo/ssrf');
    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBe(9);
  });

  test('10.0.0.1 is blocked', () => {
    expectBlocked(findResult(results, '10.0.0.1'));
  });

  test('10.255.255.255 is blocked', () => {
    expectBlocked(findResult(results, '10.255.255.255'));
  });

  test('172.16.0.1 is blocked', () => {
    expectBlocked(findResult(results, '172.16.0.1'));
  });

  test('172.31.255.255 is blocked', () => {
    expectBlocked(findResult(results, '172.31.255.255'));
  });

  test('192.168.0.1 is blocked', () => {
    expectBlocked(findResult(results, '192.168.0.1'));
  });

  test('192.168.255.255 is blocked', () => {
    expectBlocked(findResult(results, '192.168.255.255'));
  });

  test('link-local 169.254.0.1 is blocked', () => {
    expectBlocked(findResult(results, '169.254.0.1'));
  });

  test('localhost is allowed', () => {
    const r = findResult(results, '127.0.0.1:18080');
    expectAllowed(r);
  });

  test('allowlisted external is allowed', () => {
    expectAllowed(findResult(results, 'registry.npmjs.org'));
  });
});
```

- [ ] **Step 3: Create test/dlp.test.js**

```js
import { describe, test, expect } from 'vitest';
import { fetchDemo, findResult } from './helpers/sandbox.js';

describe('DLP (Secret Redaction)', () => {
  let results;

  test('fetch dlp endpoint', async () => {
    results = await fetchDemo('/demo/dlp');
    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBe(4);
  });

  test('OpenAI key is redacted', () => {
    const r = findResult(results, 'openai');
    expect(r.result.stdout).not.toContain('sk-abc123def456ghi789jklmnopqrst');
  });

  test('AWS key is redacted', () => {
    const r = findResult(results, 'aws');
    expect(r.result.stdout).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  test('GitHub PAT is redacted', () => {
    const r = findResult(results, 'github');
    expect(r.result.stdout).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12');
  });

  test('email and phone are redacted', () => {
    const r = findResult(results, 'email');
    expect(r.result.stdout).not.toContain('user@example.com');
    expect(r.result.stdout).not.toContain('555-123-4567');
  });
});
```

- [ ] **Step 4: Create test/devtools.test.js**

```js
import { describe, test, expect } from 'vitest';
import { fetchDemo, findResult } from './helpers/sandbox.js';
import { expectAllowed } from './helpers/assertions.js';

describe('Development Tools', () => {
  let results;

  test('fetch devtools endpoint', async () => {
    results = await fetchDemo('/demo/devtools');
    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBe(6);
  });

  test('python3 works', () => {
    const r = findResult(results, 'python3');
    expectAllowed(r);
    expect(r.result.stdout).toMatch(/Python \d+\.\d+/);
  });

  test('node works', () => {
    const r = findResult(results, 'node --version');
    expectAllowed(r);
    expect(r.result.stdout).toMatch(/v\d+\.\d+/);
  });

  test('git works', () => {
    const r = findResult(results, 'git --version');
    expectAllowed(r);
    expect(r.result.stdout).toContain('git version');
  });

  test('curl works', () => {
    const r = findResult(results, 'curl --version');
    expectAllowed(r);
    expect(r.result.stdout).toContain('curl');
  });

  test('pip3 works', () => {
    const r = findResult(results, 'pip3');
    expectAllowed(r);
    expect(r.result.stdout).toMatch(/pip \d+/);
  });

  test('pipes work', () => {
    const r = findResult(results, 'grep hello');
    expectAllowed(r);
    expect(r.result.stdout).toContain('hello');
  });
});
```

- [ ] **Step 5: Run all tests**

Run: `npm test -- --reporter=verbose`
Expected: All ~70 tests pass.

- [ ] **Step 6: Commit**

```bash
git add test/cloud-metadata.test.js test/ssrf.test.js test/dlp.test.js test/devtools.test.js
git commit -m "test: add cloud-metadata, ssrf, dlp, and devtools tests"
```

---

### Task 14: README & LICENSE

**Files:**
- Create: `README.md`
- Create: `LICENSE`

- [ ] **Step 1: Create README.md**

```markdown
# agentsh + Render

**Render provides deployment. agentsh provides governance.**

Runtime security for AI agents running on [Render](https://render.com), powered by [agentsh](https://www.agentsh.org). This example deploys a Docker web service that demonstrates agentsh's security enforcement: command blocking, network filtering, file protection, secret redaction, and complete audit logging.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/canyonroad/agentsh-render)

## Architecture

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
│  │  • Shell shim (/bin/bash)            │  │
│  │  • Network filtering                 │  │
│  │  • BASH_ENV (builtin disabling)      │  │
│  │  • DLP (secret redaction)            │  │
│  │  • Audit logging (SQLite)            │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

Every command runs through agentsh's policy engine before execution. Blocked commands never reach the shell.

## What agentsh Adds

| Feature | Render | agentsh |
|---------|--------|---------|
| Compute deployment | ✓ | — |
| Docker support | ✓ | — |
| Health checks | ✓ | — |
| Command blocking | — | ✓ |
| Network filtering (domain allow/blocklist) | — | ✓ |
| Cloud metadata blocking | — | ✓ |
| File I/O policy | — | ✓ |
| Secret detection & redaction (DLP) | — | ✓ |
| Bash builtin interception | — | ✓ |
| SSRF prevention | — | ✓ |
| Soft-delete file quarantine | — | ✓ |
| Complete audit logging | — | ✓ |

## Quick Start

### Deploy to Render (one click)

Click the button above or use the [Render Blueprint](render.yaml) to deploy.

### Run Locally

```bash
# Build the Docker image
docker build -t agentsh-render .

# Start the container
docker run -d --name agentsh-demo -p 10000:10000 agentsh-render

# Wait for startup (~15-30 seconds)
curl http://localhost:10000/health

# Try the demos
curl http://localhost:10000/demo/allowed | jq .
curl http://localhost:10000/demo/blocked | jq .
curl http://localhost:10000/demo/privilege-escalation | jq .

# Execute a custom command
curl -X POST http://localhost:10000/execute \
  -H "Content-Type: application/json" \
  -d '{"command": "whoami"}'

# Clean up
docker rm -f agentsh-demo
```

## Demo Endpoints

| Endpoint | What it demonstrates |
|----------|---------------------|
| `GET /health` | Health check |
| `GET /demo/status` | agentsh version, capabilities, kernel info |
| `GET /demo/allowed` | Safe commands succeed (whoami, pwd, ls, echo) |
| `GET /demo/blocked` | Policy-blocked commands fail (nc, nmap, metadata) |
| `GET /demo/commands` | Command blocking across 10+ categories |
| `GET /demo/privilege-escalation` | sudo, su, pkexec, shadow file access blocked |
| `GET /demo/filesystem` | Workspace writes ok; /etc, /usr writes blocked |
| `GET /demo/cloud-metadata` | AWS, GCP, Azure, DO, Alibaba, Oracle metadata blocked |
| `GET /demo/ssrf` | RFC 1918 private ranges blocked; localhost and allowlisted ok |
| `GET /demo/dlp` | API keys, tokens, emails redacted from output |
| `GET /demo/devtools` | Python, Node, git, curl, pip all work |
| `GET /demo/network` | Network filtering overview |
| `POST /execute` | Execute any command (body: `{"command": "..."}`) |

## Security Policy

The security policy is defined in [`default.yaml`](default.yaml):

- **Commands**: Safe tools and dev tools allowed. sudo, ssh, kill, nc, system commands blocked.
- **Network**: Localhost and package registries allowed. Cloud metadata, private networks, and malicious domains blocked.
- **Files**: Workspace read/write. System paths read-only. Credential files require approval.
- **DLP**: API keys (OpenAI, Anthropic, AWS, GitHub), JWTs, emails, phones, credit cards redacted.
- **Resources**: 2GB memory, 50% CPU, 100 PIDs, 5 minute command timeout.

## Running Tests

```bash
# Run tests locally (builds Docker image automatically)
npm test

# Run tests against a deployed Render service
BASE_URL=https://agentsh-demo.onrender.com npm test
```

## Configuration

- **[`config.yaml`](config.yaml)** — agentsh server settings (ports, enforcement, DLP patterns, audit)
- **[`default.yaml`](default.yaml)** — Security policy rules (commands, network, files, env, resources)

## Links

- [agentsh documentation](https://www.agentsh.org/docs/)
- [agentsh GitHub](https://github.com/canyonroad/agentsh)
- [Render documentation](https://render.com/docs)

## License

MIT — see [LICENSE](LICENSE)
```

- [ ] **Step 2: Create LICENSE**

```
MIT License

Copyright (c) 2026 Canyon Road

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 3: Commit**

```bash
git add README.md LICENSE
git commit -m "docs: add README with quick start, demo endpoints, and deploy button"
```

---

### Task 15: Final Verification

- [ ] **Step 1: Clean build**

Run: `docker rmi agentsh-render 2>/dev/null; docker build -t agentsh-render .`
Expected: Build succeeds from scratch.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All ~70 tests pass. Output shows 12 test files, all green.

- [ ] **Step 3: Verify all endpoints manually**

Run:
```bash
docker run -d --name agentsh-final -p 10000:10000 agentsh-render
sleep 20
curl -s http://localhost:10000/health | jq .
curl -s http://localhost:10000/demo/status | jq .
curl -s http://localhost:10000/demo/blocked | jq .
curl -s -X POST http://localhost:10000/execute -H 'Content-Type: application/json' -d '{"command":"whoami"}' | jq .
docker rm -f agentsh-final
```

Expected: All responses return valid JSON with expected blocked/allowed results.

- [ ] **Step 4: Final commit if any adjustments were made**

```bash
git add -A
git status
# Only commit if there are changes
git diff --cached --quiet || git commit -m "fix: adjustments from final verification"
```
