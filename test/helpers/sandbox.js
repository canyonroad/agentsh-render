const BASE_URL = process.env.TEST_URL || 'http://localhost:10000';

export async function fetchDemo(path) {
  const url = `${BASE_URL}/demo/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

export async function executeCommand(command) {
  const url = `${BASE_URL}/execute`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command }),
  });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  const data = await res.json();
  return data.result || data;
}

export function findResult(results, command) {
  const items = Array.isArray(results) ? results : results.results || [];
  return items.find(r => r.command === command || r.command.includes(command));
}

export { BASE_URL };
