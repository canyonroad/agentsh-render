import express from 'express';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import rateLimit from 'express-rate-limit';

const execFile = promisify(execFileCb);
const app = express();
const PORT = process.env.PORT || 10000;
const API_KEY = process.env.API_KEY;

app.use(express.json());

// Rate limiting -- per IP
const demoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' },
});

const executeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' },
});

app.use('/demo', demoLimiter);

let sessionCounter = 0;
let commandQueue = Promise.resolve();

function nextSessionId() {
  sessionCounter = (sessionCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `demo-${Date.now()}-${sessionCounter}`;
}

function directCommand(command, args) {
  return { command, args };
}

function normalizeCommand(command) {
  if (typeof command === 'string') {
    return { command, args: ['/bin/bash', '-c', command] };
  }
  return command;
}

async function destroySession(sessionId) {
  try {
    await execFile('agentsh', ['session', 'destroy', sessionId], {
      timeout: 5000,
      encoding: 'utf-8',
    });
  } catch {
    // The session may not exist if policy rejected the command before creation.
  }
}

// API key auth for /execute (only when API_KEY env var is set)
function requireApiKey(req, res, next) {
  if (!API_KEY) return next();
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (key !== API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  next();
}

async function executeCommand(command, timeout = 30000) {
  const run = commandQueue.then(() => executeCommandNow(command, timeout));
  commandQueue = run.catch(() => {});
  return run;
}

async function executeCommandNow(command, timeout = 30000) {
  const spec = normalizeCommand(command);
  const sessionId = nextSessionId();
  try {
    const { stdout, stderr } = await execFile(
      'agentsh',
      ['exec', '--root=/workspace', sessionId, '--', ...spec.args],
      { timeout, encoding: 'utf-8' }
    );
    const trimmedOut = stdout.trim();
    const trimmedErr = stderr.trim();
    const output = trimmedOut + '\n' + trimmedErr;
    const blocked =
      output.includes('command denied by policy') ||
      output.includes('blocked by policy') ||
      output.includes('BLOCKED:');
    return {
      success: !blocked,
      stdout: trimmedOut,
      stderr: trimmedErr,
      exitCode: 0,
      blocked,
      ...(blocked ? { message: 'Blocked by agentsh policy' } : {}),
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
  } finally {
    await destroySession(sessionId);
  }
}

async function runCommands(commands) {
  const results = [];
  for (const cmd of commands) {
    const spec = normalizeCommand(cmd);
    results.push({
      command: spec.command,
      result: await executeCommand(spec),
    });
  }
  return results;
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/demo/status', async (_req, res) => {
  try {
    const results = await runCommands([
      directCommand('agentsh --version', ['agentsh', '--version']),
      directCommand('agentsh detect', ['agentsh', 'detect']),
      directCommand('uname -r', ['uname', '-r']),
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/demo/allowed', async (_req, res) => {
  try {
    const results = await runCommands([
      directCommand('whoami', ['whoami']),
      directCommand('pwd', ['pwd']),
      directCommand('ls /workspace', ['ls', '/workspace']),
      directCommand('echo "hello world"', ['echo', 'hello world']),
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/demo/blocked', async (_req, res) => {
  try {
    const results = await runCommands([
      directCommand('nc -h', ['nc', '-h']),
      directCommand('nmap --version', ['nmap', '--version']),
      directCommand('curl -s --max-time 3 http://169.254.169.254/latest/meta-data/', ['curl', '-s', '--max-time', '3', 'http://169.254.169.254/latest/meta-data/']),
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/demo/commands', async (_req, res) => {
  try {
    const results = await runCommands([
      directCommand('sudo whoami', ['sudo', 'whoami']),
      directCommand('su -c whoami', ['su', '-c', 'whoami']),
      directCommand('ssh -V', ['ssh', '-V']),
      directCommand('scp --help', ['scp', '--help']),
      directCommand('nc -h', ['nc', '-h']),
      directCommand('nmap --version', ['nmap', '--version']),
      directCommand('mount /dev/sda1 /mnt', ['mount', '/dev/sda1', '/mnt']),
      directCommand('pkill -9 bash', ['pkill', '-9', 'bash']),
      directCommand('echo "this is allowed"', ['echo', 'this is allowed']),
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/demo/privilege-escalation', async (_req, res) => {
  try {
    const results = await runCommands([
      directCommand('sudo whoami', ['sudo', 'whoami']),
      directCommand('su - root -c whoami', ['su', '-', 'root', '-c', 'whoami']),
      directCommand('cat /etc/shadow', ['cat', '/etc/shadow']),
      directCommand('python3 append /etc/sudoers', ['python3', '-c', 'from pathlib import Path; Path("/etc/sudoers").open("a").write("test\\n")']),
      directCommand('chroot / /bin/bash -c whoami', ['chroot', '/', '/bin/bash', '-c', 'whoami']),
      directCommand('nsenter -t 1 -m -u -i -n -p -- /bin/bash', ['nsenter', '-t', '1', '-m', '-u', '-i', '-n', '-p', '--', '/bin/bash']),
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/demo/filesystem', async (_req, res) => {
  try {
    const results = await runCommands([
      directCommand('python3 write /workspace/demo-test.txt', ['python3', '-c', 'from pathlib import Path; Path("/workspace/demo-test.txt").write_text("testdata\\n")']),
      directCommand('cat /workspace/demo-test.txt', ['cat', '/workspace/demo-test.txt']),
      directCommand('cat /etc/hostname', ['cat', '/etc/hostname']),
      directCommand('python3 write /etc/test.txt', ['python3', '-c', 'from pathlib import Path; Path("/etc/test.txt").write_text("test\\n")']),
      directCommand('python3 write /usr/bin/test', ['python3', '-c', 'from pathlib import Path; Path("/usr/bin/test").write_text("test\\n")']),
      directCommand('mkdir /etc/testdir', ['mkdir', '/etc/testdir']),
      directCommand('cp /etc/hostname /etc/hostname.bak', ['cp', '/etc/hostname', '/etc/hostname.bak']),
      directCommand('python3 symlink escape /workspace/shadow-link', ['python3', '-c', 'import os\np="/workspace/shadow-link"\ntry:\n    os.unlink(p)\nexcept FileNotFoundError:\n    pass\nos.symlink("/etc/shadow", p)\nprint(open(p).read())']),
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/demo/cloud-metadata', async (_req, res) => {
  try {
    const results = await runCommands([
      directCommand('curl -s --max-time 3 http://169.254.169.254/latest/meta-data/', ['curl', '-s', '--max-time', '3', 'http://169.254.169.254/latest/meta-data/']),
      directCommand('curl -s --max-time 3 -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/', ['curl', '-s', '--max-time', '3', '-H', 'Metadata-Flavor: Google', 'http://metadata.google.internal/computeMetadata/v1/']),
      directCommand('curl -s --max-time 3 -H "Metadata: true" "http://169.254.169.254/metadata/instance?api-version=2021-02-01"', ['curl', '-s', '--max-time', '3', '-H', 'Metadata: true', 'http://169.254.169.254/metadata/instance?api-version=2021-02-01']),
      directCommand('curl -s --max-time 3 http://169.254.169.254/metadata/v1/', ['curl', '-s', '--max-time', '3', 'http://169.254.169.254/metadata/v1/']),
      directCommand('curl -s --max-time 3 http://100.100.100.200/latest/meta-data/', ['curl', '-s', '--max-time', '3', 'http://100.100.100.200/latest/meta-data/']),
      directCommand('curl -s --max-time 3 http://169.254.169.254/opc/v2/instance/', ['curl', '-s', '--max-time', '3', 'http://169.254.169.254/opc/v2/instance/']),
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/demo/ssrf', async (_req, res) => {
  try {
    const results = await runCommands([
      directCommand('curl -s --max-time 3 http://10.0.0.1/', ['curl', '-s', '--max-time', '3', 'http://10.0.0.1/']),
      directCommand('curl -s --max-time 3 http://10.255.255.255/', ['curl', '-s', '--max-time', '3', 'http://10.255.255.255/']),
      directCommand('curl -s --max-time 3 http://172.16.0.1/', ['curl', '-s', '--max-time', '3', 'http://172.16.0.1/']),
      directCommand('curl -s --max-time 3 http://172.31.255.255/', ['curl', '-s', '--max-time', '3', 'http://172.31.255.255/']),
      directCommand('curl -s --max-time 3 http://192.168.0.1/', ['curl', '-s', '--max-time', '3', 'http://192.168.0.1/']),
      directCommand('curl -s --max-time 3 http://192.168.255.255/', ['curl', '-s', '--max-time', '3', 'http://192.168.255.255/']),
      directCommand('curl -s --max-time 3 http://169.254.0.1/', ['curl', '-s', '--max-time', '3', 'http://169.254.0.1/']),
      directCommand('curl -s --max-time 3 http://127.0.0.1:18080/health', ['curl', '-s', '--max-time', '3', 'http://127.0.0.1:18080/health']),
      directCommand('curl -s --max-time 3 -I https://registry.npmjs.org/express', ['curl', '-s', '--max-time', '3', '-I', 'https://registry.npmjs.org/express']),
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/demo/dlp', async (_req, res) => {
  try {
    const results = await runCommands([
      directCommand('echo "OpenAI key: sk-1234567890abcdef1234567890abcdef1234567890abcdefgh"', ['echo', 'OpenAI key: sk-1234567890abcdef1234567890abcdef1234567890abcdefgh']),
      directCommand('echo "AWS key: AKIAIOSFODNN7EXAMPLE"', ['echo', 'AWS key: AKIAIOSFODNN7EXAMPLE']),
      directCommand('echo "GitHub token: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"', ['echo', 'GitHub token: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx']),
      directCommand('echo "Email: user@example.com Phone: 555-123-4567"', ['echo', 'Email: user@example.com Phone: 555-123-4567']),
    ]);
    res.json({
      description: 'DLP redaction configuration',
      note: 'DLP redacts secrets in API proxy traffic (e.g., LLM API calls routed through agentsh proxy). Command stdout shown here is not proxied.',
      results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/demo/devtools', async (_req, res) => {
  try {
    const results = await runCommands([
      directCommand('python3 --version', ['python3', '--version']),
      directCommand('node --version', ['node', '--version']),
      directCommand('git --version', ['git', '--version']),
      directCommand('curl --version', ['curl', '--version']),
      directCommand('pip3 --version', ['pip3', '--version']),
      directCommand('grep root /etc/passwd', ['grep', 'root', '/etc/passwd']),
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/demo/network', async (_req, res) => {
  try {
    const results = await runCommands([
      directCommand('curl -s --max-time 3 http://evil.com', ['curl', '-s', '--max-time', '3', 'http://evil.com']),
      directCommand('curl -s --max-time 3 http://10.0.0.1', ['curl', '-s', '--max-time', '3', 'http://10.0.0.1']),
      directCommand('curl -s --max-time 3 http://169.254.169.254', ['curl', '-s', '--max-time', '3', 'http://169.254.169.254']),
      directCommand('curl -s --max-time 3 http://127.0.0.1:18080/health', ['curl', '-s', '--max-time', '3', 'http://127.0.0.1:18080/health']),
      directCommand('curl -s --max-time 3 -I https://registry.npmjs.org/express', ['curl', '-s', '--max-time', '3', '-I', 'https://registry.npmjs.org/express']),
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/execute', executeLimiter, requireApiKey, async (req, res) => {
  const { command } = req.body;
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'Missing "command" in request body' });
  }
  if (command.trim().length === 0) {
    return res.status(400).json({ error: 'Command cannot be empty' });
  }
  if (command.length > 1024) {
    return res.status(400).json({ error: 'Command too long (max 1024 characters)' });
  }
  try {
    const result = await executeCommand(command);
    res.json({ command, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`agentsh-render demo listening on port ${PORT}`);
});
