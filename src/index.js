import express from 'express';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCb);
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

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

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/demo/status', async (_req, res) => {
  try {
    const results = await runCommands(['agentsh version', 'agentsh detect', 'uname -r']);
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
      'sudo whoami', 'su -c whoami', 'ssh -V', 'scp --help',
      'nc -h', 'netcat -h', 'socat -V', 'telnet --help',
      'shutdown -h now', 'reboot', 'mount /dev/sda1 /mnt',
      'kill -9 1', 'killall node', 'pkill -9 bash',
      'echo "this is allowed"', 'ls -la /',
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/demo/privilege-escalation', async (_req, res) => {
  try {
    const results = await runCommands([
      'sudo whoami', 'su - root -c whoami', 'pkexec /bin/bash',
      'cat /etc/shadow', 'echo test >> /etc/sudoers', 'chroot / /bin/bash -c whoami',
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
      'ls /etc', 'cat /etc/hostname',
      'echo test > /etc/test.txt', 'echo test > /usr/bin/test',
      'mkdir /etc/testdir', 'cp /etc/hostname /etc/hostname.bak',
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

app.listen(PORT, () => {
  console.log(`agentsh-render demo listening on port ${PORT}`);
});
