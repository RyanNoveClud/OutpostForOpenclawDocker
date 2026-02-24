#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OutpostBridgeClient } from './orchestrator-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const QUEUE_PATH = process.env.ORCH_QUEUE_PATH || path.join(__dirname, 'orchestrator-queue.json');
const AUDIT_PATH = process.env.ORCH_AUDIT_PATH || path.join(__dirname, 'orchestrator-audit.jsonl');
const POLL_MS = Math.max(500, Number(process.env.ORCH_POLL_MS || 3000));
const MAX_RETRIES = Math.max(0, Number(process.env.ORCH_MAX_RETRIES || 2));

const client = new OutpostBridgeClient();

function nowIso() {
  return new Date().toISOString();
}

function ensureQueueFile() {
  if (!fs.existsSync(QUEUE_PATH)) {
    fs.writeFileSync(QUEUE_PATH, JSON.stringify({ version: 1, updatedAt: nowIso(), jobs: [] }, null, 2));
  }
}

function readQueue() {
  ensureQueueFile();
  try {
    const data = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
    return Array.isArray(data.jobs) ? data.jobs : [];
  } catch {
    return [];
  }
}

function writeQueue(jobs) {
  const next = {
    version: 1,
    updatedAt: nowIso(),
    jobs: [...jobs].sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0))
  };
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(next, null, 2));
}

function appendAudit(event) {
  fs.appendFileSync(AUDIT_PATH, `${JSON.stringify({ ts: nowIso(), ...event })}\n`);
}

function pickRunnableJob(jobs) {
  const now = Date.now();
  return jobs.find((j) => {
    if (j.status === 'queued') return true;
    if (j.status !== 'retry_wait') return false;
    return Date.parse(j.nextRetryAt || 0) <= now;
  });
}

async function runJob(job) {
  const payload = { ...(job.payload || {}), runner: job.runner, source: 'openclaw-orchestrator-loop' };
  const runResp = await client.run(payload);
  const taskId = runResp.taskId;

  await client.result({
    taskId,
    status: 'done',
    result: {
      queueJobId: job.jobId,
      orchestrator: 'loop',
      runResult: runResp.result || null
    }
  });

  return { taskId };
}

async function tick() {
  const jobs = readQueue();
  const target = pickRunnableJob(jobs);
  if (!target) return false;

  const idx = jobs.findIndex((x) => x.jobId === target.jobId);
  jobs[idx] = { ...target, status: 'running', startedAt: nowIso(), updatedAt: nowIso() };
  writeQueue(jobs);

  try {
    const { taskId } = await runJob(jobs[idx]);
    jobs[idx] = { ...jobs[idx], status: 'done', taskId, doneAt: nowIso(), updatedAt: nowIso() };
    writeQueue(jobs);
    appendAudit({ phase: 'done', jobId: jobs[idx].jobId, taskId, runner: jobs[idx].runner });
    return true;
  } catch (err) {
    const retries = Number(jobs[idx].retries || 0) + 1;
    const shouldRetry = retries <= MAX_RETRIES;
    const delayMs = Math.min(60000, 1500 * 2 ** (retries - 1));
    jobs[idx] = {
      ...jobs[idx],
      retries,
      status: shouldRetry ? 'retry_wait' : 'error',
      nextRetryAt: shouldRetry ? new Date(Date.now() + delayMs).toISOString() : null,
      error: err?.message || 'run failed',
      updatedAt: nowIso()
    };
    writeQueue(jobs);
    appendAudit({ phase: shouldRetry ? 'retry_wait' : 'error', jobId: jobs[idx].jobId, retries, error: jobs[idx].error });
    return true;
  }
}

async function main() {
  ensureQueueFile();
  appendAudit({ phase: 'loop-start', queue: QUEUE_PATH, pollMs: POLL_MS, maxRetries: MAX_RETRIES });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await tick();
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((err) => {
  appendAudit({ phase: 'fatal', error: err?.message || String(err) });
  process.exit(1);
});
