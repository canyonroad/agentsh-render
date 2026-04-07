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
  try {
    const { stdout, stderr } = await execFile(
      'agentsh',
      ['exec', '--root=/workspace', 'demo', '--', '/bin/bash', '-c', command],
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
  }
}

async function runCommands(commands) {
  const results = [];
  for (const cmd of commands) {
    results.push({
      command: cmd,
      result: await executeCommand(cmd),
    });
  }
  return results;
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/demo/status', async (_req, res) => {
  try {
    const results = await runCommands(['agentsh --version', 'agentsh detect', 'uname -r']);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/demo/allowed', async (_req, res) => {
  try {
    const results = await runCommands(['whoami', 'pwd', 'ls /workspace', 'echo "hello world"']);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/demo/blocked', async (_req, res) => {
  try {
    const results = await runCommands(['nc -h', 'nmap --version', 'curl -s --max-time 3 http://169.254.169.254/latest/meta-data/']);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/demo/commands', async (_req, res) => {
  try {
    const results = await runCommands([
      'sudo whoami', 'su -c whoami',
      'ssh -V', 'scp --help',
      'nc -h', 'nmap --version',
      'mount /dev/sda1 /mnt',
      'pkill -9 bash',
      'echo "this is allowed"',
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/demo/privilege-escalation', async (_req, res) => {
  try {
    const results = await runCommands([
      'sudo whoami', 'su - root -c whoami',
      'cat /etc/shadow', 'echo test >> /etc/sudoers',
      'chroot / /bin/bash -c whoami', 'nsenter -t 1 -m -u -i -n -p -- /bin/bash',
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/demo/filesystem', async (_req, res) => {
  try {
    const results = await runCommands([
      'echo testdata > /workspace/demo-test.txt', 'cat /workspace/demo-test.txt',
      'cat /etc/hostname',
      'echo test > /etc/test.txt', 'echo test > /usr/bin/test',
      'mkdir /etc/testdir', 'cp /etc/hostname /etc/hostname.bak',
      'rm -f /workspace/shadow-link && ln -s /etc/shadow /workspace/shadow-link && cat /workspace/shadow-link',
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/demo/cloud-metadata', async (_req, res) => {
  try {
    const results = await runCommands([
      'curl -s --max-time 3 http://169.254.169.254/latest/meta-data/',
      'curl -s --max-time 3 -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/',
      'curl -s --max-time 3 -H "Metadata: true" "http://169.254.169.254/metadata/instance?api-version=2021-02-01"',
      'curl -s --max-time 3 http://169.254.169.254/metadata/v1/',
      'curl -s --max-time 3 http://100.100.100.200/latest/meta-data/',
      'curl -s --max-time 3 http://169.254.169.254/opc/v2/instance/',
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/demo/ssrf', async (_req, res) => {
  try {
    const results = await runCommands([
      'curl -s --max-time 3 http://10.0.0.1/',
      'curl -s --max-time 3 http://10.255.255.255/',
      'curl -s --max-time 3 http://172.16.0.1/',
      'curl -s --max-time 3 http://172.31.255.255/',
      'curl -s --max-time 3 http://192.168.0.1/',
      'curl -s --max-time 3 http://192.168.255.255/',
      'curl -s --max-time 3 http://169.254.0.1/',
      'curl -s --max-time 3 http://127.0.0.1:18080/health',
      'curl -s --max-time 3 https://registry.npmjs.org/express | head -c 100',
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/demo/dlp', async (_req, res) => {
  try {
    const results = await runCommands([
      'echo "OpenAI key: sk-1234567890abcdef1234567890abcdef1234567890abcdefgh"',
      'echo "AWS key: AKIAIOSFODNN7EXAMPLE"',
      'echo "GitHub token: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"',
      'echo "Email: user@example.com Phone: 555-123-4567"',
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
      'python3 --version', 'node --version', 'git --version',
      'curl --version | head -1', 'pip3 --version',
      'echo "hello world" | grep hello',
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/demo/network', async (_req, res) => {
  try {
    const results = await runCommands([
      'curl -s --max-time 3 http://evil.com',
      'curl -s --max-time 3 http://10.0.0.1',
      'curl -s --max-time 3 http://169.254.169.254',
      'curl -s --max-time 3 http://127.0.0.1:18080/health',
      'curl -s --max-time 3 https://registry.npmjs.org/express | head -c 100',
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
