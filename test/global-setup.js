import { execSync } from 'child_process';

const CONTAINER_NAME = 'agentsh-render-test';
const IMAGE_NAME = 'agentsh-render';
const PORT = 10000;
let started = false;

export async function setup() {
  if (process.env.TEST_URL) {
    console.log(`Using existing deployment: ${process.env.TEST_URL}`);
    return;
  }

  console.log('Building Docker image...');
  execSync(`docker build -t ${IMAGE_NAME} .`, { stdio: 'inherit' });

  // Remove any existing container
  try { execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore' }); } catch {}

  console.log('Starting container...');
  execSync(`docker run -d --name ${CONTAINER_NAME} -p ${PORT}:${PORT} ${IMAGE_NAME}`);
  started = true;

  // Poll health
  const baseUrl = `http://localhost:${PORT}`;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) {
        console.log(`Container healthy after ${i + 1}s`);
        break;
      }
    } catch {}
    if (i === 59) throw new Error('Container failed to become healthy');
    await new Promise(r => setTimeout(r, 1000));
  }

  // Warm up
  try { await fetch(`${baseUrl}/demo/status`); } catch {}
}

export async function teardown() {
  if (!started) return;
  try {
    execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore' });
    console.log('Container removed');
  } catch {}
}
