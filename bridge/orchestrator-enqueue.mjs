#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const QUEUE_PATH = process.env.ORCH_QUEUE_PATH || path.join(__dirname, 'orchestrator-queue.json');

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
  const data = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
  return Array.isArray(data.jobs) ? data.jobs : [];
}

function writeQueue(jobs) {
  fs.writeFileSync(QUEUE_PATH, JSON.stringify({ version: 1, updatedAt: nowIso(), jobs }, null, 2));
}

function makeJobId() {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseJson(input, fallback) {
  if (!input) return fallback;
  try { return JSON.parse(input); } catch { return fallback; }
}

const runner = process.argv[2] || 'openclaw-plan';
const payload = parseJson(process.argv[3], {});

const jobs = readQueue();
const job = {
  jobId: makeJobId(),
  runner,
  payload,
  status: 'queued',
  retries: 0,
  createdAt: nowIso(),
  updatedAt: nowIso()
};

jobs.push(job);
writeQueue(jobs);
console.log(JSON.stringify({ ok: true, queue: QUEUE_PATH, job }, null, 2));
