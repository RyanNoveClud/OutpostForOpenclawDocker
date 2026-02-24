import express from 'express';
import { WebSocketServer } from 'ws';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import os from 'os';
import { promisify } from 'util';
import { appendTaskLog, ensureBridgeStore, readRegistry, readTasks, upsertSkillRecord, upsertTask } from './bridge/bridge-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'demo.log');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const BRIDGE_STORE = ensureBridgeStore(__dirname);
const BRIDGE_TASKS = new Map(readTasks(BRIDGE_STORE.tasksPath).map((t) => [t.taskId, t]));
const COMPLETED_TASK_BROADCASTED = new Set();
const WEB_ACTION_LOG = path.join(BRIDGE_STORE.dir, 'web-actions.jsonl');
const SKILLS_STATE_PATH = path.join(BRIDGE_STORE.dir, 'skills-state.json');

const CHAT_CACHE_PATH = path.join(BRIDGE_STORE.dir, 'chat-sessions.json');
const CHAT_SESSIONS = new Map();

function loadChatSessions() {
  if (!fs.existsSync(CHAT_CACHE_PATH)) return;
  try {
    const rows = JSON.parse(fs.readFileSync(CHAT_CACHE_PATH, 'utf8'));
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (!row?.id) continue;
      CHAT_SESSIONS.set(String(row.id), {
        id: String(row.id),
        title: String(row.title || `Session ${row.id}`),
        updatedAt: row.updatedAt || new Date().toISOString(),
        messages: Array.isArray(row.messages) ? row.messages.slice(-300) : []
      });
    }
  } catch {}
}

function saveChatSessions() {
  const rows = [...CHAT_SESSIONS.values()].map((s) => ({ ...s, messages: Array.isArray(s.messages) ? s.messages.slice(-300) : [] }));
  fs.writeFileSync(CHAT_CACHE_PATH, JSON.stringify(rows, null, 2));
}

loadChatSessions();
if (!CHAT_SESSIONS.size) {
  CHAT_SESSIONS.set('chat-1', {
    id: 'chat-1',
    title: 'Outpost Console Chat',
    updatedAt: new Date().toISOString(),
    messages: [
      {
        id: 'm-1',
        role: 'assistant',
        source: 'openclaw',
        content: '你好，开始聊吧。',
        createdAt: new Date().toISOString()
      }
    ]
  });
  saveChatSessions();
}

const execFileAsync = promisify(execFile);

function loadDotEnvFromFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnvFromFile(path.join(__dirname, '.env'));

const OUTPOST_TOKEN = process.env.OUTPOST_TOKEN || '';
const OUTPOST_ALLOW_SHELL = process.env.OUTPOST_ALLOW_SHELL === 'true';
const OUTPOST_ALLOW_UPDATE = process.env.OUTPOST_ALLOW_UPDATE === 'true';
const OUTPOST_ALLOW_SKILLS = process.env.OUTPOST_ALLOW_SKILLS === 'true';
const DEFAULT_WORKSPACE = process.cwd();
const OUTPOST_WORKSPACE = process.env.OUTPOST_WORKSPACE || DEFAULT_WORKSPACE;
const OUTPOST_SKILLS_DIR = process.env.OUTPOST_SKILLS_DIR || path.join(OUTPOST_WORKSPACE, 'skills');
const OPENCLAW_SKILLS_DIR = process.env.OPENCLAW_SKILLS_DIR || '/home/node/.openclaw/workspace/skills';
const OPENCLAW_SKILLS_SOURCE = process.env.OPENCLAW_SKILLS_SOURCE || 'docker';
const OPENCLAW_DOCKER_CONTAINER = process.env.OPENCLAW_DOCKER_CONTAINER || 'openclaw-openclaw-gateway-1';
const OPENCLAW_DOCKER_SKILLS_DIR = process.env.OPENCLAW_DOCKER_SKILLS_DIR || '/home/node/.openclaw/workspace/skills';
const OPENCLAW_DOCKER_WORKSPACE_DIR = process.env.OPENCLAW_DOCKER_WORKSPACE_DIR || '/home/node/.openclaw/workspace';
const OUTPOST_CLAWHUB_BIN = process.env.OUTPOST_CLAWHUB_BIN || 'clawhub';
const OUTPOST_SHELL_BIN = process.env.OUTPOST_SHELL_BIN || '';
const OUTPOST_BRIDGE_SIGNATURE = process.env.OUTPOST_BRIDGE_SIGNATURE || '';
const OUTPOST_OPENCLAW_CHAT_URL = process.env.OUTPOST_OPENCLAW_CHAT_URL || '';
const OUTPOST_OPENCLAW_CHAT_TOKEN = process.env.OUTPOST_OPENCLAW_CHAT_TOKEN || '';
const OUTPOST_TASK_BROADCAST_ON_COMPLETE = process.env.OUTPOST_TASK_BROADCAST_ON_COMPLETE === 'true';
const OUTPOST_RESTART_CMD = process.env.OUTPOST_RESTART_CMD || '';
let UPDATE_IN_PROGRESS = false;
let UPDATE_STATUS = {
  state: 'idle',
  phase: 'idle',
  text: '等待更新',
  percent: 0,
  startedAt: null,
  updatedAt: new Date().toISOString(),
  finishedAt: null,
  error: null,
  oldCommit: null,
  newCommit: null,
  branch: 'main'
};

function setUpdateStatus(patch = {}) {
  UPDATE_STATUS = {
    ...UPDATE_STATUS,
    ...patch,
    updatedAt: new Date().toISOString()
  };
}

function detectShellBin() {
  if (OUTPOST_SHELL_BIN) return OUTPOST_SHELL_BIN;
  if (process.platform === 'win32') {
    return process.env.ComSpec || 'cmd.exe';
  }
  const candidates = ['/bin/zsh', '/bin/bash', '/bin/sh', 'sh'];
  for (const c of candidates) {
    if (!c.includes('/')) return c;
    if (fs.existsSync(c)) return c;
  }
  return 'sh';
}

const SHELL_BIN = detectShellBin();

function ts() {
  const d = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  const ms = pad(d.getMilliseconds(), 3);
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const offH = pad(Math.floor(Math.abs(offsetMin) / 60));
  const offM = pad(Math.abs(offsetMin) % 60);
  return `${y}-${m}-${day}T${hh}:${mm}:${ss}.${ms}${sign}${offH}:${offM}`;
}

function getOutpostVersionMeta() {
  const pkgPath = path.join(__dirname, 'package.json');
  const fallback = { version: '0.10.3', updatedAt: ts() };
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) || {};
    const stat = fs.statSync(pkgPath);
    return {
      version: String(pkg.version || fallback.version),
      updatedAt: stat?.mtime ? new Date(stat.mtime).toISOString() : fallback.updatedAt
    };
  } catch {
    return fallback;
  }
}

function writeLog(level, msg, meta = {}) {
  const line = JSON.stringify({ ts: ts(), level, msg, ...meta });
  fs.appendFileSync(LOG_FILE, line + '\n');
  if (level === 'error') console.error('[demo]', msg, meta);
  else console.log('[demo]', msg, meta);
}

function parsePercent(raw = '') {
  const n = Number(String(raw).replace('%', '').trim());
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n * 100) / 100)) : 0;
}

function parseMemToMb(raw = '') {
  const s = String(raw).trim();
  const m = s.match(/^([0-9]+(?:\.[0-9]+)?)\s*([KMGTP]i?B)$/i);
  if (!m) return 0;
  const val = Number(m[1]);
  const unit = m[2].toUpperCase();
  const toMb = {
    KB: 1 / 1000,
    MB: 1,
    GB: 1000,
    TB: 1000 * 1000,
    KIB: 1 / 1024,
    MIB: 1,
    GIB: 1024,
    TIB: 1024 * 1024
  };
  return Math.round(val * (toMb[unit] || 1));
}

function parseDockerMemUsage(raw = '') {
  const [used, limit] = String(raw).split('/').map((x) => x.trim());
  return {
    memoryUsageMb: parseMemToMb(used || ''),
    memoryLimitMb: parseMemToMb(limit || '')
  };
}

async function readOpenclawDockerMetrics() {
  const { stdout } = await execFileAsync('docker', [
    'stats',
    OPENCLAW_DOCKER_CONTAINER,
    '--no-stream',
    '--format',
    '{{json .}}'
  ], { timeout: 5000 });

  const row = JSON.parse(String(stdout || '{}').trim() || '{}');
  const mem = parseDockerMemUsage(row.MemUsage || '');

  return {
    cpuUsagePercent: parsePercent(row.CPUPerc || '0%'),
    memoryUsageMb: mem.memoryUsageMb,
    memoryLimitMb: mem.memoryLimitMb
  };
}

async function detectOpenclawStatus() {
  try {
    const { stdout } = await execFileAsync('docker', ['inspect', '-f', '{{.State.Running}}', OPENCLAW_DOCKER_CONTAINER], { timeout: 5000 });
    return String(stdout || '').trim() === 'true' ? 'online' : 'offline';
  } catch {
    return 'offline';
  }
}

function readDashboardEvents(limit = 50) {
  const n = Math.max(1, Math.min(500, Number(limit || 50)));
  const text = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf8') : '';
  return text
    .split('\n')
    .filter(Boolean)
    .slice(-n)
    .map((line, idx) => {
      try {
        const row = JSON.parse(line);
        return {
          id: `evt-${Date.now()}-${idx}`,
          level: row.level === 'error' ? 'error' : row.level === 'warn' ? 'warn' : 'info',
          source: 'outpost',
          message: row.msg || row.message || 'event',
          createdAt: row.ts || new Date().toISOString()
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .reverse();
}

function readOpenclawCronSnapshot() {
  const jobsPath = '/home/node/.openclaw/cron/jobs.json';
  const runsDir = '/home/node/.openclaw/cron/runs';
  let jobs = [];
  try {
    const raw = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
    jobs = Array.isArray(raw?.jobs) ? raw.jobs : [];
  } catch {
    jobs = [];
  }

  const cronTasks = [];
  let totalRuns = 0;
  let success = 0;
  let failed = 0;

  for (const job of jobs) {
    const jobId = String(job?.id || '').trim();
    if (!jobId) continue;
    const runPath = path.join(runsDir, `${jobId}.jsonl`);
    let lastRun = null;
    let hasUnfinishedRun = false;

    if (fs.existsSync(runPath)) {
      const lines = fs.readFileSync(runPath, 'utf8').split('\n').filter(Boolean);
      const rows = lines
        .map((line) => {
          try { return JSON.parse(line); } catch { return null; }
        })
        .filter(Boolean);

      const runState = new Map();
      for (const row of rows) {
        const key = String(row?.sessionKey || row?.sessionId || row?.runAtMs || row?.ts || '');
        if (!key) continue;
        const action = String(row?.action || '').toLowerCase();
        const status = String(row?.status || '').toLowerCase();
        if (action === 'started') runState.set(key, 'running');
        if (action === 'finished') {
          runState.set(key, status === 'error' ? 'error' : 'done');
          totalRuns += 1;
          if (status === 'error') failed += 1;
          else success += 1;
        }
        lastRun = row;
      }
      hasUnfinishedRun = [...runState.values()].includes('running');
    }

    const enabled = Boolean(job?.enabled);
    const lastSummary = String(lastRun?.summary || '');
    const lastFailed = String(lastRun?.status || '').toLowerCase() === 'error' || /fail|error|exception/.test(lastSummary.toLowerCase());
    const status = !enabled ? 'done' : hasUnfinishedRun ? 'running' : lastRun ? (lastFailed ? 'error' : 'queued') : 'queued';

    cronTasks.push({
      taskId: `cron-${jobId}`,
      kind: 'cron',
      status,
      source: 'openclaw-cron',
      runner: 'cron',
      createdAt: job?.createdAtMs ? new Date(Number(job.createdAtMs)).toISOString() : new Date().toISOString(),
      updatedAt: job?.updatedAtMs ? new Date(Number(job.updatedAtMs)).toISOString() : new Date().toISOString(),
      stage: !enabled ? 'disabled' : hasUnfinishedRun ? 'running' : 'scheduled',
      progressPercent: status === 'error' || status === 'done' ? 100 : status === 'running' ? 55 : 10,
      result: {
        name: job?.name || jobId,
        schedule: job?.schedule || null,
        nextRunAtMs: lastRun?.nextRunAtMs || null,
        lastSummary: lastRun?.summary || null
      },
      error: status === 'error' ? (lastRun?.summary || job?.state?.lastError || 'cron run failed') : null
    });
  }

  return { cronTasks, cronStats: { totalRuns, success, failed } };
}

function readOpenclawChannelSnapshot() {
  const sessionIndexes = [
    '/home/node/.openclaw/agents/main/sessions/sessions.json',
    '/home/node/.openclaw/agents/qq_persona/sessions/sessions.json',
    '/home/node/.openclaw/agents/feishu_persona/sessions/sessions.json'
  ];

  const tasks = [];
  const now = Date.now();

  for (const p of sessionIndexes) {
    let rows = {};
    try {
      rows = JSON.parse(fs.readFileSync(p, 'utf8')) || {};
    } catch {
      rows = {};
    }

    for (const [sessionKey, session] of Object.entries(rows)) {
      const channel = String(session?.lastChannel || session?.deliveryContext?.channel || session?.origin?.provider || '').toLowerCase();
      if (!channel || !['telegram', 'feishu', 'napcat'].includes(channel)) continue;

      const updatedAtMs = Number(session?.updatedAt || 0);
      if (!Number.isFinite(updatedAtMs) || updatedAtMs <= 0) continue;

      const ageMs = Math.max(0, now - updatedAtMs);
      const isActive = ageMs <= 5 * 60 * 1000;
      const isRecent = ageMs <= 7 * 24 * 60 * 60 * 1000;
      if (!isRecent) continue;

      tasks.push({
        taskId: `channel-${channel}-${String(session?.sessionId || sessionKey)}`,
        kind: 'channel-session',
        status: isActive ? 'running' : 'done',
        source: `channel:${channel}`,
        runner: 'openclaw-session',
        createdAt: updatedAtMs ? new Date(updatedAtMs).toISOString() : new Date().toISOString(),
        updatedAt: updatedAtMs ? new Date(updatedAtMs).toISOString() : new Date().toISOString(),
        stage: isActive ? 'active' : 'idle',
        progressPercent: isActive ? 40 : 100,
        result: {
          sessionKey,
          chatType: session?.chatType || session?.origin?.chatType || null,
          to: session?.lastTo || session?.deliveryContext?.to || null,
          accountId: session?.lastAccountId || session?.deliveryContext?.accountId || null
        },
        error: null
      });
    }
  }

  return { channelTasks: tasks };
}

function appendWebAction(entry = {}) {
  const row = {
    id: `wa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...entry
  };
  fs.appendFileSync(WEB_ACTION_LOG, JSON.stringify(row) + '\n');
  return row;
}

function readWebActions(limit = 100) {
  const n = Math.max(1, Math.min(500, Number(limit || 100)));
  const text = fs.existsSync(WEB_ACTION_LOG) ? fs.readFileSync(WEB_ACTION_LOG, 'utf8') : '';
  return text
    .split('\n')
    .filter(Boolean)
    .slice(-n)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean)
    .reverse();
}

function listChatSessions() {
  return [...CHAT_SESSIONS.values()].sort(
    (a, b) => Date.parse(String(b.updatedAt || 0)) - Date.parse(String(a.updatedAt || 0))
  );
}

function ensureChatSession(sessionId = 'chat-1') {
  if (CHAT_SESSIONS.has(sessionId)) return CHAT_SESSIONS.get(sessionId);
  const next = { id: sessionId, title: `Session ${sessionId}`, updatedAt: new Date().toISOString(), messages: [] };
  CHAT_SESSIONS.set(sessionId, next);
  saveChatSessions();
  return next;
}

async function relayChatToOpenClaw(sessionId, text) {
  if (!OUTPOST_OPENCLAW_CHAT_URL) {
    throw new Error('OUTPOST_OPENCLAW_CHAT_URL not configured');
  }

  writeLog('info', 'chat relay start', { source: 'chat', sessionId, url: OUTPOST_OPENCLAW_CHAT_URL });

  const headers = { 'content-type': 'application/json' };
  if (OUTPOST_OPENCLAW_CHAT_TOKEN) headers.authorization = `Bearer ${OUTPOST_OPENCLAW_CHAT_TOKEN}`;

  const payload = {
    model: 'openai-codex/gpt-5.3-codex',
    messages: [
      { role: 'system', content: 'You are OpenClaw assistant. Reply helpfully and concisely.' },
      { role: 'user', content: text }
    ],
    stream: false
  };

  const res = await fetch(OUTPOST_OPENCLAW_CHAT_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  writeLog('info', 'chat relay response', { source: 'chat', sessionId, status: res.status, ok: res.ok });

  if (!res.ok) throw new Error(`openclaw relay failed: HTTP ${res.status}`);

  const ctype = String(res.headers.get('content-type') || '');
  if (ctype.includes('application/x-ndjson')) {
    const raw = await res.text();
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    let content = '';
    for (const line of lines) {
      try {
        const row = JSON.parse(line);
        if (row?.type === 'chunk' && typeof row.content === 'string') content += row.content;
        if (row?.type === 'done' && typeof row?.message?.content === 'string') content = row.message.content;
      } catch (err) {
        writeLog('warn', 'chat relay ndjson parse skipped', { source: 'chat', sessionId, error: err?.message || 'parse failed' });
      }
    }
    writeLog('info', 'chat relay parsed ndjson', { source: 'chat', sessionId, contentLength: content.length });
    return content.trim();
  }

  const raw = await res.text();
  let json = {};
  try { json = raw ? JSON.parse(raw) : {}; } catch { json = {}; }

  let content = '';
  if (typeof json?.reply === 'string') content = json.reply;
  else if (typeof json?.content === 'string') content = json.content;
  else if (typeof json?.message === 'string') content = json.message;
  else if (typeof json?.message?.content === 'string') content = json.message.content;
  else if (Array.isArray(json?.choices) && json.choices[0]?.message?.content) {
    const c = json.choices[0].message.content;
    content = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => x?.text || '').join('') : '';
  }

  content = String(content || '').trim();
  writeLog('info', 'chat relay parsed json', { source: 'chat', sessionId, contentLength: content.length });
  return content || null;
}

function appendChatMessage(sessionId, msg) {
  const session = ensureChatSession(sessionId);
  session.messages.push(msg);
  if (session.messages.length > 300) session.messages = session.messages.slice(-300);
  session.updatedAt = msg.createdAt || new Date().toISOString();
  CHAT_SESSIONS.set(sessionId, session);
  saveChatSessions();
  return session;
}

async function executeWithAudit(command, meta = {}) {
  const startedAt = Date.now();
  try {
    const data = await execute(command);
    appendWebAction({
      action: 'command',
      target: command,
      result: 'success',
      source: meta.source || 'unknown',
      channel: meta.channel || 'http',
      durationMs: Date.now() - startedAt,
      data
    });
    return data;
  } catch (err) {
    appendWebAction({
      action: 'command',
      target: command,
      result: 'failed',
      source: meta.source || 'unknown',
      channel: meta.channel || 'http',
      durationMs: Date.now() - startedAt,
      error: err?.message || '执行失败'
    });
    throw err;
  }
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    try {
      const isManualWebCommand = req.path === '/api/web-control/command';
      if (!isManualWebCommand && payload && payload.ok === false) {
        writeLog('error', payload.error || 'api failed', {
          source: 'api',
          method: req.method,
          path: req.path,
          status: res.statusCode || 500
        });
      }
    } catch {}
    return originalJson(payload);
  };
  next();
});

function requireApiToken(req, res, next) {
  if (!OUTPOST_TOKEN) return next();
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
  const token = req.headers['x-outpost-token'] || bearer;
  if (token !== OUTPOST_TOKEN) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  next();
}

function requireBridgeSignature(req, res, next) {
  if (!OUTPOST_BRIDGE_SIGNATURE) return next();
  const signature = String(req.body?.signature || req.headers['x-bridge-signature'] || '').trim();
  if (signature !== OUTPOST_BRIDGE_SIGNATURE) {
    return res.status(401).json({ ok: false, error: 'invalid bridge signature' });
  }
  next();
}

function ensureSafeSkillSlug(slug) {
  return typeof slug === 'string' && /^[a-z0-9][a-z0-9-_]*$/i.test(slug);
}

function resolveSkillRunCommand(skillDir) {
  const candidates = [
    { rel: 'scripts/run.sh', cmd: `./scripts/run.sh` },
    { rel: 'scripts/run.mjs', cmd: `node ./scripts/run.mjs` },
    { rel: 'scripts/run.js', cmd: `node ./scripts/run.js` },
    { rel: 'scripts/run.py', cmd: `python3 ./scripts/run.py` }
  ];

  for (const item of candidates) {
    const full = path.join(skillDir, item.rel);
    if (fs.existsSync(full)) return item.cmd;
  }

  return '';
}

function readSkillsState() {
  try {
    return JSON.parse(fs.readFileSync(SKILLS_STATE_PATH, 'utf8'));
  } catch {
    return { disabled: [] };
  }
}

function writeSkillsState(next) {
  fs.writeFileSync(SKILLS_STATE_PATH, JSON.stringify(next, null, 2));
}

function setSkillDisabled(source, name, disabled) {
  const state = readSkillsState();
  const rows = Array.isArray(state.disabled) ? state.disabled : [];
  const key = `${source}:${name}`;
  const set = new Set(rows);
  if (disabled) set.add(key);
  else set.delete(key);
  const next = { ...state, disabled: [...set].sort() };
  writeSkillsState(next);
  return next;
}

function isSkillDisabled(source, name) {
  const state = readSkillsState();
  const rows = Array.isArray(state.disabled) ? state.disabled : [];
  return rows.includes(`${source}:${name}`);
}

function makeTaskId(kind = 'task') {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTaskSource(raw, fallback = 'system') {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return fallback;
  if (s.includes('chat')) return 'openclaw-chat';
  if (s === 'outpost' || s.includes('web-ui') || s.includes('outpost-ui')) return 'outpost-ui';
  if (s.includes('telegram')) return 'channel:telegram';
  if (s.includes('feishu')) return 'channel:feishu';
  if (s.includes('napcat') || s.includes('qq')) return 'channel:napcat';
  if (s.includes('dingtalk')) return 'channel:dingtalk';
  if (s.includes('plugin')) return 'plugin';
  if (s.includes('openclaw')) return 'openclaw';
  return s;
}

function setBridgeTask(taskId, patch) {
  const prev = BRIDGE_TASKS.get(taskId) || { taskId, createdAt: new Date().toISOString() };
  const source = normalizeTaskSource(patch?.source ?? prev?.source, 'system');
  const next = { ...prev, ...patch, source, updatedAt: new Date().toISOString() };
  BRIDGE_TASKS.set(taskId, next);
  upsertTask(BRIDGE_STORE.tasksPath, next);

  const prevStatus = String(prev?.status || '').toLowerCase();
  const nextStatus = String(next?.status || '').toLowerCase();
  const reachedTerminal = (nextStatus === 'done' || nextStatus === 'error') && nextStatus !== prevStatus;

  if (OUTPOST_TASK_BROADCAST_ON_COMPLETE && reachedTerminal && !COMPLETED_TASK_BROADCASTED.has(taskId)) {
    COMPLETED_TASK_BROADCASTED.add(taskId);
    appendTaskLog(BRIDGE_STORE.taskLogPath, {
      taskId,
      kind: 'task-broadcast',
      phase: nextStatus,
      source: next.source || 'system',
      runner: next.runner || null,
      message: `[任务广播] ${taskId} -> ${nextStatus}`,
      error: nextStatus === 'error' ? (next.error || null) : undefined
    });
  }

  return next;
}

async function runClawhub(args) {
  const cwd = fs.existsSync(OUTPOST_WORKSPACE) ? OUTPOST_WORKSPACE : process.cwd();
  const cfg = path.join(cwd, '.config');
  try { fs.mkdirSync(cfg, { recursive: true }); } catch {}
  const homeDir = cwd;
  const npmCache = path.join(cwd, '.npm-cache');
  const npmPrefix = path.join(cwd, '.npm-global');
  try { fs.mkdirSync(npmCache, { recursive: true }); } catch {}
  try { fs.mkdirSync(npmPrefix, { recursive: true }); } catch {}
  const env = {
    ...process.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    XDG_CONFIG_HOME: cfg,
    npm_config_cache: npmCache,
    NPM_CONFIG_CACHE: npmCache,
    npm_config_prefix: npmPrefix,
    NPM_CONFIG_PREFIX: npmPrefix
  };
  try {
    return await execFileAsync(OUTPOST_CLAWHUB_BIN, args, { cwd, env, timeout: 120000 });
  } catch (err) {
    if (String(err?.message || '').includes('ENOENT')) {
      return await execFileAsync('npx', ['-y', 'clawhub@latest', ...args], { cwd, env, timeout: 180000 });
    }
    throw err;
  }
}

async function runClawhubOpenclaw(args) {
  const joined = args.map((a) => String(a).replace(/\"/g, '\\\"')).join(' ');
  const cmd = `docker exec ${OPENCLAW_DOCKER_CONTAINER} sh -lc "cd /home/node/.openclaw/workspace && mkdir -p .config .npm-cache .npm-global && HOME=/home/node/.openclaw/workspace XDG_CONFIG_HOME=/home/node/.openclaw/workspace/.config npm_config_cache=/home/node/.openclaw/workspace/.npm-cache npm_config_prefix=/home/node/.openclaw/workspace/.npm-global npx -y clawhub@latest ${joined}"`;
  return await runShellCommand(cmd, OUTPOST_WORKSPACE, 240000);
}

function shellArgs(cmd) {
  const lower = String(SHELL_BIN).toLowerCase();
  if (lower.includes('powershell') || lower.endsWith('pwsh')) return ['-NoProfile', '-Command', cmd];
  if (lower.includes('cmd.exe') || lower === 'cmd') return ['/d', '/s', '/c', cmd];
  return ['-lc', cmd];
}

async function runShellCommand(cmd, cwd, timeout) {
  return await execFileAsync(SHELL_BIN, shellArgs(cmd), { cwd, timeout });
}

async function runDockerExec(args = [], timeout = 30000) {
  return await execFileAsync('docker', ['exec', OPENCLAW_DOCKER_CONTAINER, ...args], { cwd: OUTPOST_WORKSPACE, timeout });
}

function normalizeWorkspacePath(relOrAbs = '') {
  const raw = String(relOrAbs || '').trim();
  const rel = raw.replace(/^\/+/, '');
  const full = path.posix.normalize(path.posix.join(OPENCLAW_DOCKER_WORKSPACE_DIR, rel));
  if (!full.startsWith(OPENCLAW_DOCKER_WORKSPACE_DIR)) {
    throw new Error('invalid path: outside workspace');
  }
  return full;
}

function listInstalledSkills(skillsDir) {
  const results = [];
  function walk(dir, depth = 0) {
    if (depth > 2) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (ent.isFile() && ent.name === 'SKILL.md') {
        const rel = path.relative(skillsDir, full).replace(/\\/g, '/');
        if (rel.endsWith('/SKILL.md')) results.push(rel.slice(0, -('/SKILL.md'.length)));
      }
    }
  }
  walk(skillsDir, 0);
  return [...new Set(results)].sort();
}

async function listOpenclawSkills() {
  if (OPENCLAW_SKILLS_SOURCE === 'filesystem') {
    return listInstalledSkills(OPENCLAW_SKILLS_DIR);
  }

  const cmd = `docker exec ${OPENCLAW_DOCKER_CONTAINER} sh -lc "find ${OPENCLAW_DOCKER_SKILLS_DIR} -mindepth 1 -maxdepth 1 -type d -exec basename {} \\; | sort"`;
  const { stdout } = await runShellCommand(cmd, OUTPOST_WORKSPACE, 15000);
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .sort();
}

async function runInstalledSkill({ slug, cmd, timeoutMs, source = 'outpost' }) {
  if (!ensureSafeSkillSlug(slug)) throw new Error('invalid slug');
  const timeout = Math.max(1000, Math.min(600000, Number(timeoutMs || 120000)));

  if (isSkillDisabled(source, slug)) {
    throw new Error(`skill is disabled: ${source}/${slug}`);
  }

  if (source === 'openclaw') {
    const base = `${OPENCLAW_DOCKER_SKILLS_DIR}/${slug}`;
    const defaultCmd = 'pwd';
    const command = String(cmd || '').trim() || defaultCmd;
    const dockerCmd = `docker exec ${OPENCLAW_DOCKER_CONTAINER} sh -lc "cd ${base} && ${command}"`;
    const { stdout, stderr } = await runShellCommand(dockerCmd, OUTPOST_WORKSPACE, timeout);
    appendTaskLog(BRIDGE_STORE.taskLogPath, { kind: 'run-skill', phase: 'done', slug, source, by: 'api:web.skills.run', command });
    return { slug, source, skillDir: base, command, timeoutMs: timeout, stdout, stderr };
  }

  const skillDir = path.join(OUTPOST_SKILLS_DIR, slug);
  if (!fs.existsSync(skillDir)) throw new Error(`skill not found: ${slug}`);

  const command = String(cmd || '').trim() || resolveSkillRunCommand(skillDir);
  if (!command) throw new Error('no runnable entry found. provide cmd/command or add scripts/run.sh|run.mjs|run.js|run.py');

  const { stdout, stderr } = await runShellCommand(command, skillDir, timeout);
  appendTaskLog(BRIDGE_STORE.taskLogPath, { kind: 'run-skill', phase: 'done', slug, source, by: 'api:web.skills.run', command });
  return { slug, source, skillDir, command, timeoutMs: timeout, stdout, stderr };
}

const server = app.listen(8787, () => {
  console.log('Demo started: http://localhost:8787');
  console.log('[outpost] version=0.10.3 commands=attach,split,split_here,target,targets,open,navigate,click,type,typen,typetext,select,list[limit],clickn,highlightn,clicktext,highlighttext,highlight,title,screenshot,help,ping api=/api/health,/api/capabilities,/api/plugins,/api/plugin/:name/invoke,/api/command,/api/batch,/api/shell,/api/update');
  writeLog('info', 'outpost started', {
    source: 'boot',
    chatRelayConfigured: Boolean(OUTPOST_OPENCLAW_CHAT_URL),
    skillsBridge: OUTPOST_ALLOW_SKILLS,
    shell: OUTPOST_ALLOW_SHELL,
    update: OUTPOST_ALLOW_UPDATE
  });
  if (!OUTPOST_OPENCLAW_CHAT_URL) {
    writeLog('error', 'chat relay unavailable: OUTPOST_OPENCLAW_CHAT_URL missing', { source: 'boot' });
  }
});

const wss = new WebSocketServer({ server });

app.get('/api/health', requireApiToken, (req, res) => {
  res.json({ ok: true, service: 'outpost', now: ts(), capabilities });
});

app.get('/api/capabilities', requireApiToken, (req, res) => {
  res.json({ ok: true, capabilities });
});

// Web Console endpoints (for built-in Outpost UI)
app.get('/api/web/topbar', (req, res) => {
  const meta = getOutpostVersionMeta();
  return res.json({
    outpostVersion: meta.version,
    openclawVersion: '2026.2.x',
    workspacePath: OUTPOST_WORKSPACE,
    connection: 'online',
    outpostUpdatedAt: meta.updatedAt,
    allowUpdate: OUTPOST_ALLOW_UPDATE,
    hasRefreshControl: false,
    hasConnectionToggle: false,
    hasUiSettingsShortcut: false
  });
});

app.get('/api/web/system/update-status', (req, res) => {
  return res.json({ ok: true, ...UPDATE_STATUS });
});

app.post('/api/web/system/update', async (req, res) => {
  if (!OUTPOST_ALLOW_UPDATE) return res.status(403).json({ ok: false, error: 'update disabled (set OUTPOST_ALLOW_UPDATE=true)' });
  if (UPDATE_IN_PROGRESS) return res.status(409).json({ ok: false, error: 'update already running', status: UPDATE_STATUS });

  UPDATE_IN_PROGRESS = true;
  const startedAt = Date.now();
  const branch = String(req.body?.branch || 'main').trim() || 'main';
  if (!/^[A-Za-z0-9._/-]+$/.test(branch)) {
    UPDATE_IN_PROGRESS = false;
    return res.status(400).json({ ok: false, error: 'invalid branch' });
  }
  const autoRestart = req.body?.autoRestart !== false;

  setUpdateStatus({
    state: 'running',
    phase: 'prepare',
    text: '准备更新...',
    percent: 5,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    oldCommit: null,
    newCommit: null,
    branch
  });

  let oldCommit = '';
  try {
    const rev = await runShellCommand(`git -C '${OUTPOST_WORKSPACE}' rev-parse --short HEAD`, OUTPOST_WORKSPACE, 15000);
    oldCommit = String(rev?.stdout || '').trim();
  } catch {
    oldCommit = 'unknown';
  }

  setUpdateStatus({ oldCommit });
  writeLog('info', 'update started', { source: 'updater', branch, oldCommit, autoRestart });

  try {
    setUpdateStatus({ phase: 'git', text: '拉取最新代码...', percent: 25 });
    const gitCmd = `git -C '${OUTPOST_WORKSPACE}' fetch --all --prune && git -C '${OUTPOST_WORKSPACE}' checkout ${branch} && git -C '${OUTPOST_WORKSPACE}' reset --hard origin/${branch}`;
    const gitResult = await runShellCommand(gitCmd, OUTPOST_WORKSPACE, 120000);

    const hasLock = fs.existsSync(path.join(OUTPOST_WORKSPACE, 'package-lock.json'));
    const installCmd = hasLock ? 'npm ci --no-audit --no-fund' : 'npm install --no-audit --no-fund';
    setUpdateStatus({ phase: 'install', text: '安装依赖...', percent: 60 });
    const installResult = await runShellCommand(installCmd, OUTPOST_WORKSPACE, 180000);
    setUpdateStatus({ phase: 'build', text: '构建中...', percent: 85 });
    const buildResult = await runShellCommand('npm run build', OUTPOST_WORKSPACE, 180000);

    let newCommit = '';
    try {
      const rev = await runShellCommand(`git -C '${OUTPOST_WORKSPACE}' rev-parse --short HEAD`, OUTPOST_WORKSPACE, 15000);
      newCommit = String(rev?.stdout || '').trim();
    } catch {
      newCommit = 'unknown';
    }

    writeLog('info', 'update success', {
      source: 'updater',
      branch,
      oldCommit,
      newCommit,
      durationMs: Date.now() - startedAt
    });

    setUpdateStatus({
      state: 'running',
      phase: 'restart',
      text: autoRestart ? '更新完成，准备重启...' : '更新完成',
      percent: autoRestart ? 95 : 100,
      newCommit,
      finishedAt: autoRestart ? null : new Date().toISOString()
    });

    if (autoRestart) {
      if (OUTPOST_RESTART_CMD) {
        try {
          await runShellCommand(OUTPOST_RESTART_CMD, OUTPOST_WORKSPACE, 30000);
        } catch (err) {
          UPDATE_IN_PROGRESS = false;
          setUpdateStatus({ state: 'error', phase: 'restart', text: '重启失败', percent: 100, error: err?.message || 'restart failed', finishedAt: new Date().toISOString() });
          return res.status(400).json({ ok: false, error: `restart failed: ${err?.message || 'unknown'}`, oldCommit, newCommit });
        }
      } else {
        setTimeout(() => process.exit(0), 300);
      }
    }

    UPDATE_IN_PROGRESS = false;
    setUpdateStatus({ state: 'done', phase: 'done', text: '更新完成', percent: 100, newCommit, finishedAt: new Date().toISOString() });
    return res.json({
      ok: true,
      branch,
      oldCommit,
      newCommit,
      restarted: autoRestart,
      restartMode: OUTPOST_RESTART_CMD ? 'command' : 'exit-for-supervisor',
      durationMs: Date.now() - startedAt,
      steps: {
        git: { ok: true, stdout: gitResult.stdout, stderr: gitResult.stderr },
        install: { ok: true, cmd: installCmd, stdout: installResult.stdout, stderr: installResult.stderr },
        build: { ok: true, stdout: buildResult.stdout, stderr: buildResult.stderr }
      }
    });
  } catch (err) {
    UPDATE_IN_PROGRESS = false;
    writeLog('error', 'update failed', {
      source: 'updater',
      branch,
      oldCommit,
      durationMs: Date.now() - startedAt,
      error: err?.message || 'update failed'
    });
    setUpdateStatus({
      state: 'error',
      phase: 'error',
      text: '更新失败',
      percent: 100,
      error: err?.message || 'update failed',
      finishedAt: new Date().toISOString()
    });
    return res.status(400).json({ ok: false, error: err?.message || 'update failed', branch, oldCommit, durationMs: Date.now() - startedAt, stdout: err?.stdout || '', stderr: err?.stderr || '' });
  }
});

app.get('/api/chat/sessions', (req, res) => {
  return res.json(listChatSessions());
});

app.post('/api/web/chat/stream', async (req, res) => {
  const sessionId = String(req.body?.sessionId || 'chat-1');
  const text = String(req.body?.message || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'message required' });

  writeLog('info', 'chat stream request', { source: 'chat', sessionId, textLength: text.length });

  const now = new Date().toISOString();
  appendChatMessage(sessionId, {
    id: `u-${Date.now()}`,
    role: 'user',
    source: 'user',
    content: text,
    createdAt: now
  });

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const chatTaskId = makeTaskId('chat-run');
  setBridgeTask(chatTaskId, {
    kind: 'task',
    status: 'running',
    source: 'openclaw-chat',
    runner: 'chat-relay',
    stage: 'relay',
    progressPercent: 30,
    result: { sessionId, promptLength: text.length }
  });
  appendTaskLog(BRIDGE_STORE.taskLogPath, { taskId: chatTaskId, kind: 'chat-run', phase: 'start', source: 'openclaw-chat', runner: 'chat-relay' });

  let reply = '';
  try {
    const relayed = await relayChatToOpenClaw(sessionId, text);
    if (!relayed) throw new Error('openclaw returned empty content');
    reply = relayed;
    setBridgeTask(chatTaskId, {
      status: 'done',
      stage: 'done',
      progressPercent: 100,
      result: { sessionId, replyLength: relayed.length }
    });
    appendTaskLog(BRIDGE_STORE.taskLogPath, { taskId: chatTaskId, kind: 'chat-run', phase: 'done', source: 'openclaw-chat', runner: 'chat-relay' });
  } catch (err) {
    const message = err?.message || 'relay failed';
    writeLog('error', 'chat relay failed', { source: 'chat', sessionId, error: message });
    setBridgeTask(chatTaskId, {
      status: 'error',
      stage: 'failed',
      progressPercent: 100,
      error: message,
      result: { sessionId }
    });
    appendTaskLog(BRIDGE_STORE.taskLogPath, { taskId: chatTaskId, kind: 'chat-run', phase: 'error', source: 'openclaw-chat', runner: 'chat-relay', error: message });
    reply = `消息转发失败：${message}`;
  }

  let acc = '';
  for (const chunk of reply.match(/.{1,18}/g) || []) {
    acc += chunk;
    res.write(`${JSON.stringify({ type: 'chunk', content: chunk })}\n`);
    await new Promise((r) => setTimeout(r, 25));
  }

  const assistantMsg = {
    id: `a-${Date.now()}`,
    role: 'assistant',
    source: 'openclaw',
    content: acc,
    createdAt: new Date().toISOString()
  };
  appendChatMessage(sessionId, assistantMsg);

  writeLog('info', 'chat stream done', { source: 'chat', sessionId, replyLength: acc.length });

  res.write(`${JSON.stringify({ type: 'done', message: assistantMsg })}\n`);
  res.end();
});

app.get('/api/web/dashboard/metrics', async (req, res) => {
  const activeSessions = wss.clients?.size || 0;

  try {
    const dockerMetrics = await readOpenclawDockerMetrics();
    const status = await detectOpenclawStatus();

    return res.json({
      ok: true,
      ...dockerMetrics,
      activeSessions,
      lastHeartbeatAt: new Date().toISOString(),
      openclawStatus: status
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || 'failed to read openclaw docker metrics'
    });
  }
});

app.get('/api/web/dashboard/events', (req, res) => {
  const limit = Number(req.query.limit || 100);
  const items = readDashboardEvents(limit);
  return res.json({ ok: true, items });
});

app.get('/api/web/settings', (req, res) => {
  return res.json({ ok: true, theme: 'nebula', density: 'comfortable', refreshSeconds: 15, language: 'zh' });
});

app.get('/api/web-control/actions', (req, res) => {
  const limit = Number(req.query.limit || 100);
  const items = readWebActions(limit);
  res.json({ ok: true, items });
});

app.post('/api/web-control/command', async (req, res) => {
  try {
    const command = String(req.body?.command || '').trim();
    if (!command) return res.status(400).json({ ok: false, error: 'command required' });
    const data = await executeWithAudit(command, { source: 'web-manual', channel: 'web-ui' });
    return res.json({ ok: true, command, data });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err?.message || '执行失败' });
  }
});

app.get('/api/web/bridge/tasks', (req, res) => {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));
  const items = [...BRIDGE_TASKS.values()]
    .map((task) => ({ ...task, source: normalizeTaskSource(task?.source, 'system') }))
    .sort((a, b) => Date.parse(String(b.updatedAt || b.createdAt || 0)) - Date.parse(String(a.updatedAt || a.createdAt || 0)))
    .slice(0, limit);
  return res.json({ ok: true, items });
});

app.get('/api/web/bridge/task-log', (req, res) => {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));
  const text = fs.existsSync(BRIDGE_STORE.taskLogPath) ? fs.readFileSync(BRIDGE_STORE.taskLogPath, 'utf8') : '';
  const items = text
    .split('\n')
    .filter(Boolean)
    .slice(-limit)
    .map((line) => {
      try {
        const row = JSON.parse(line);
        return { ...row, source: normalizeTaskSource(row?.source, 'system') };
      } catch {
        return { raw: line };
      }
    })
    .reverse();
  return res.json({ ok: true, items });
});

app.get('/api/web/tasks/overview', (req, res) => {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit || 200)));

  const logText = fs.existsSync(BRIDGE_STORE.taskLogPath) ? fs.readFileSync(BRIDGE_STORE.taskLogPath, 'utf8') : '';
  const logRows = logText
    .split('\n')
    .filter(Boolean)
    .slice(-2000)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);

  const latestLogByTask = new Map();
  const stepDoneByTask = new Map();
  const totalStepByTask = new Map();

  for (const row of logRows) {
    if (!row?.taskId) continue;
    const taskId = String(row.taskId);
    latestLogByTask.set(taskId, row);
    if (String(row?.phase || '') === 'step-done') {
      stepDoneByTask.set(taskId, (stepDoneByTask.get(taskId) || 0) + 1);
    }
    if (row?.result?.stepCount && Number.isFinite(Number(row.result.stepCount))) {
      totalStepByTask.set(taskId, Number(row.result.stepCount));
    }
  }

  const baseItems = [...BRIDGE_TASKS.values()]
    .map((task) => {
      const source = normalizeTaskSource(task?.source, 'system');
      const taskId = String(task.taskId);
      const row = latestLogByTask.get(taskId);
      const stage = String(row?.phase || task?.stage || '').trim() || undefined;

      let progressPercent = task?.status === 'done' ? 100 : task?.status === 'error' ? 100 : task?.status === 'running' ? 50 : task?.status === 'queued' ? 10 : task?.status === 'retry_wait' ? 20 : 0;

      const doneSteps = Number(stepDoneByTask.get(taskId) || 0);
      const totalSteps = Number(totalStepByTask.get(taskId) || task?.result?.stepCount || 0);
      if (totalSteps > 0) {
        progressPercent = Math.max(progressPercent, Math.min(99, Math.round((doneSteps / totalSteps) * 100)));
      }
      if (task?.status === 'done' || task?.status === 'error') progressPercent = 100;

      return { ...task, source, stage, progressPercent };
    });

  const { cronTasks, cronStats } = readOpenclawCronSnapshot();
  const { channelTasks } = readOpenclawChannelSnapshot();

  const items = [...baseItems, ...cronTasks, ...channelTasks]
    .sort((a, b) => Date.parse(String(b.updatedAt || b.createdAt || 0)) - Date.parse(String(a.updatedAt || a.createdAt || 0)))
    .slice(0, limit);

  const running = items.filter((x) => x.status === 'running' || x.status === 'queued' || x.status === 'retry_wait');
  const recentDone = items.filter((x) => x.status === 'done').slice(0, 20);
  const recentFailed = items.filter((x) => x.status === 'error').slice(0, 20);

  const bySource = {};
  for (const t of items) {
    const key = t.source || 'system';
    bySource[key] = (bySource[key] || 0) + 1;
  }

  const stats = {
    total: items.length,
    running: running.length,
    done: items.filter((x) => x.status === 'done').length,
    failed: items.filter((x) => x.status === 'error').length,
    bySource,
    cron: {
      totalRuns: cronStats.totalRuns,
      success: cronStats.success,
      failed: cronStats.failed
    }
  };

  return res.json({ ok: true, running, recentDone, recentFailed, stats });
});

app.get('/api/web/skills', async (req, res) => {
  try {
    const installedOutpost = listInstalledSkills(OUTPOST_SKILLS_DIR);
    let installedOpenclaw = [];
    try {
      installedOpenclaw = await listOpenclawSkills();
    } catch (err) {
      installedOpenclaw = [];
      appendTaskLog(BRIDGE_STORE.taskLogPath, { kind: 'skills-scan', phase: 'warn', source: 'openclaw', error: err?.message || 'scan failed' });
    }

    const registry = readRegistry(BRIDGE_STORE.registryPath);
    const regRows = Array.isArray(registry?.skills) ? registry.skills : [];

    const outpostSkills = installedOutpost.map((name) => ({
      name,
      version: 'local',
      source: 'outpost',
      status: isSkillDisabled('outpost', name) ? 'disabled' : 'installed',
      updatedAt: new Date().toISOString()
    }));

    const openclawFromScan = installedOpenclaw.map((name) => ({
      name,
      version: 'local',
      source: 'openclaw',
      status: isSkillDisabled('openclaw', name) ? 'disabled' : 'installed',
      updatedAt: new Date().toISOString()
    }));

    const openclawFromRegistry = regRows.map((s) => ({
      name: s.slug,
      version: s.version || 'latest',
      source: 'openclaw',
      status: s.status || 'installed',
      updatedAt: s.updatedAt || s.installedAt || new Date().toISOString()
    }));

    const dedup = new Map();
    for (const row of [...outpostSkills, ...openclawFromScan, ...openclawFromRegistry]) {
      const key = `${row.source}:${row.name}`;
      if (!dedup.has(key)) dedup.set(key, row);
    }
    return res.json({ ok: true, items: [...dedup.values()] });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err?.message || 'skills scan failed' });
  }
});

app.post('/api/web/skills/search', async (req, res) => {
  try {
    const source = String(req.body?.source || 'outpost').trim();
    const query = String(req.body?.query || '').trim();
    if (!query) return res.status(400).json({ ok: false, error: 'query required' });
    const run = source === 'openclaw' ? runClawhubOpenclaw : runClawhub;
    const { stdout, stderr } = await run(['search', query]);
    return res.json({ ok: true, source, query, stdout, stderr });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err?.message || 'search failed', stdout: err?.stdout || '', stderr: err?.stderr || '' });
  }
});

app.post('/api/web/skills/install', async (req, res) => {
  try {
    const source = String(req.body?.source || 'outpost').trim();
    const slug = String(req.body?.slug || '').trim();
    const version = String(req.body?.version || '').trim();
    if (!ensureSafeSkillSlug(slug)) return res.status(400).json({ ok: false, error: 'invalid slug' });
    const args = ['install', slug, '--force'];
    if (version) args.push('--version', version);
    const run = source === 'openclaw' ? runClawhubOpenclaw : runClawhub;
    const { stdout, stderr } = await run(args);
    return res.json({ ok: true, source, slug, version: version || null, stdout, stderr });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err?.message || 'install failed', stdout: err?.stdout || '', stderr: err?.stderr || '' });
  }
});

app.post('/api/web/skills/refresh', async (req, res) => {
  try {
    if (!OUTPOST_ALLOW_SKILLS) return res.status(403).json({ ok: false, error: 'skills bridge disabled' });
    const outpost = await runClawhub(['update', '--all', '--force']);
    let openclaw = { stdout: '', stderr: '' };
    try {
      openclaw = await runClawhubOpenclaw(['update', '--all', '--force', '--yes']);
    } catch {}
    appendTaskLog(BRIDGE_STORE.taskLogPath, { kind: 'skills-refresh', phase: 'done', by: 'api:web.skills.refresh' });
    return res.json({ ok: true, outpost, openclaw });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err?.message || 'refresh failed', stdout: err?.stdout || '', stderr: err?.stderr || '' });
  }
});

app.post('/api/web/skills/action', async (req, res) => {
  try {
    const action = String(req.body?.action || '').trim();
    const source = String(req.body?.source || 'outpost').trim();
    const slug = String(req.body?.slug || '').trim();
    if (!ensureSafeSkillSlug(slug)) return res.status(400).json({ ok: false, error: 'invalid slug' });

    if (action === 'enable') {
      setSkillDisabled(source, slug, false);
      return res.json({ ok: true, action, source, slug });
    }
    if (action === 'disable') {
      setSkillDisabled(source, slug, true);
      return res.json({ ok: true, action, source, slug });
    }
    if (action === 'update') {
      const args = ['update', slug, '--force'];
      const { stdout, stderr } = await runClawhub(args);
      appendTaskLog(BRIDGE_STORE.taskLogPath, { kind: 'skills-action', phase: 'done', action, source, slug });
      return res.json({ ok: true, action, source, slug, stdout, stderr });
    }
    if (action === 'uninstall') {
      const args = ['uninstall', slug, '--yes'];
      try {
        const run = source === 'openclaw' ? runClawhubOpenclaw : runClawhub;
        const { stdout, stderr } = await run(args);
        setSkillDisabled(source, slug, false);
        appendTaskLog(BRIDGE_STORE.taskLogPath, { kind: 'skills-action', phase: 'done', action, source, slug });
        return res.json({ ok: true, action, source, slug, stdout, stderr });
      } catch (err) {
        const stderr = String(err?.stderr || err?.message || '');
        const notInstalled = /Not installed:/i.test(stderr);
        if (!notInstalled) throw err;

        // fallback: remove skill folder directly when listed by scan but not managed by clawhub lockfile
        if (source === 'openclaw') {
          const cmd = `docker exec ${OPENCLAW_DOCKER_CONTAINER} sh -lc "rm -rf ${OPENCLAW_DOCKER_SKILLS_DIR}/${slug}"`;
          await runShellCommand(cmd, OUTPOST_WORKSPACE, 15000);
        } else {
          const skillDir = path.join(OUTPOST_SKILLS_DIR, slug);
          try { fs.rmSync(skillDir, { recursive: true, force: true }); } catch {}
        }

        setSkillDisabled(source, slug, false);
        appendTaskLog(BRIDGE_STORE.taskLogPath, {
          kind: 'skills-action',
          phase: 'done',
          action,
          source,
          slug,
          note: 'clawhub not-installed fallback remove folder'
        });
        return res.json({ ok: true, action, source, slug, stdout: '', stderr: '', note: 'removed by folder fallback' });
      }
    }

    return res.status(400).json({ ok: false, error: 'action must be enable|disable|update|uninstall' });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err?.message || 'skills action failed', stdout: err?.stdout || '', stderr: err?.stderr || '' });
  }
});

app.post('/api/web/skills/run', async (req, res) => {
  try {
    const slug = String(req.body?.slug || '').trim();
    const source = String(req.body?.source || 'outpost').trim();
    const cmd = String(req.body?.cmd || req.body?.command || '').trim();
    const timeoutMs = Number(req.body?.timeoutMs || 120000);
    const data = await runInstalledSkill({ slug, source, cmd, timeoutMs });
    return res.json({ ok: true, ...data });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err?.message || 'run skill failed' });
  }
});

app.get('/api/web/files/tree', async (req, res) => {
  try {
    const script = `
      const fs=require('fs');
      const path=require('path');
      const root=process.argv[1];
      const MAX_DEPTH=6;
      const IGNORE=new Set(['node_modules','.git','.DS_Store']);
      function walk(dir, depth){
        let entries=[];
        try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return[]}
        const out=[];
        for(const e of entries){
          if(IGNORE.has(e.name)) continue;
          const full=path.join(dir,e.name);
          const rel=path.relative(root,full).replace(/\\\\/g,'/');
          if(!rel) continue;
          if(e.isDirectory()){
            const node={id:rel,name:e.name,path:rel,type:'directory'};
            if(depth<MAX_DEPTH) node.children=walk(full, depth+1);
            out.push(node);
          } else if(e.isFile()){
            out.push({id:rel,name:e.name,path:rel,type:'file'});
          }
        }
        out.sort((a,b)=> (a.type===b.type? a.name.localeCompare(b.name): a.type==='directory'?-1:1));
        return out;
      }
      console.log(JSON.stringify({ok:true,items:walk(root,0)}));
    `;
    const { stdout } = await runDockerExec(['node', '-e', script, OPENCLAW_DOCKER_WORKSPACE_DIR], 45000);
    const parsed = JSON.parse(String(stdout || '{}'));
    return res.json({ ok: true, items: Array.isArray(parsed?.items) ? parsed.items : [] });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err?.message || 'files tree failed' });
  }
});

app.get('/api/web/files/preview', async (req, res) => {
  try {
    const target = normalizeWorkspacePath(String(req.query.path || ''));
    const script = `
      const fs=require('fs');
      const p=process.argv[1];
      const stat=fs.statSync(p);
      if(!stat.isFile()) throw new Error('not a file');
      const buf=fs.readFileSync(p);
      const max=1024*1024;
      const sliced=buf.length>max?buf.subarray(0,max):buf;
      console.log(JSON.stringify({ok:true,content:sliced.toString('utf8'),truncated:buf.length>max,size:buf.length}));
    `;
    const { stdout } = await runDockerExec(['node', '-e', script, target], 30000);
    const parsed = JSON.parse(String(stdout || '{}'));
    return res.json({ ok: true, path: String(req.query.path || ''), content: parsed?.content || '', truncated: !!parsed?.truncated, size: parsed?.size || 0 });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err?.message || 'preview failed' });
  }
});

app.get('/api/web/files/download-file', async (req, res) => {
  try {
    const rel = String(req.query.path || '').trim();
    const target = normalizeWorkspacePath(rel);
    const tmpPath = path.join('/tmp', `outpost-file-${Date.now()}-${path.basename(rel)}`);
    await execFileAsync('docker', ['cp', `${OPENCLAW_DOCKER_CONTAINER}:${target}`, tmpPath], { timeout: 30000 });
    return res.download(tmpPath, path.basename(rel), () => {
      try { fs.unlinkSync(tmpPath); } catch {}
    });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err?.message || 'download file failed' });
  }
});

app.get('/api/web/files/download-folder', async (req, res) => {
  try {
    const rel = String(req.query.path || '').trim();
    const target = normalizeWorkspacePath(rel);
    const archive = `/tmp/outpost-folder-${Date.now()}.tar.gz`;
    const folderName = path.posix.basename(target);
    await runDockerExec(['sh', '-lc', `tar -czf ${archive} -C ${path.posix.dirname(target)} ${folderName}`], 120000);
    const hostArchive = path.join('/tmp', `${folderName}-${Date.now()}.tar.gz`);
    await execFileAsync('docker', ['cp', `${OPENCLAW_DOCKER_CONTAINER}:${archive}`, hostArchive], { timeout: 30000 });
    await runDockerExec(['rm', '-f', archive], 15000).catch(() => {});
    return res.download(hostArchive, `${folderName}.tar.gz`, () => {
      try { fs.unlinkSync(hostArchive); } catch {}
    });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err?.message || 'download folder failed' });
  }
});

app.get('/api/web/files/raw', async (req, res) => {
  try {
    const rel = String(req.query.path || '').trim();
    const target = normalizeWorkspacePath(rel);
    const tmpPath = path.join('/tmp', `outpost-raw-${Date.now()}-${path.basename(rel)}`);
    await execFileAsync('docker', ['cp', `${OPENCLAW_DOCKER_CONTAINER}:${target}`, tmpPath], { timeout: 30000 });
    const ext = path.extname(rel).toLowerCase();
    const mime = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml'
    }[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    return res.sendFile(tmpPath, () => {
      try { fs.unlinkSync(tmpPath); } catch {}
    });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err?.message || 'raw file failed' });
  }
});

app.post('/api/web/files/translate', async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ ok: false, error: 'text required' });

    const chunks = [];
    const maxLen = 450;
    for (let i = 0; i < text.length; i += maxLen) chunks.push(text.slice(i, i + maxLen));

    const out = [];
    for (const chunk of chunks) {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|zh-CN`;
      const r = await fetch(url);
      const j = await r.json();
      const translated = j?.responseData?.translatedText || '';
      if (!translated) throw new Error('translation unavailable');
      out.push(translated);
    }

    return res.json({ ok: true, translatedText: out.join('') });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err?.message || 'translate failed' });
  }
});

app.post('/api/command', requireApiToken, async (req, res) => {
  try {
    const command = String(req.body?.command || '').trim();
    if (!command) return res.status(400).json({ ok: false, error: 'command required' });
    const data = await executeWithAudit(command, { source: 'api-command', channel: 'http' });
    res.json({ ok: true, command, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err?.message || '执行失败' });
  }
});

app.post('/api/batch', requireApiToken, async (req, res) => {
  const commands = Array.isArray(req.body?.commands) ? req.body.commands.map((x) => String(x || '').trim()).filter(Boolean) : [];
  if (!commands.length) return res.status(400).json({ ok: false, error: 'commands[] required' });
  const out = [];
  for (const command of commands) {
    try {
      const data = await executeWithAudit(command, { source: 'api-batch', channel: 'http' });
      out.push({ ok: true, command, data });
    } catch (err) {
      out.push({ ok: false, command, error: err?.message || '执行失败' });
      break;
    }
  }
  res.json({ ok: out.every((x) => x.ok), results: out });
});

app.post('/api/shell', requireApiToken, async (req, res) => {
  if (!OUTPOST_ALLOW_SHELL) return res.status(403).json({ ok: false, error: 'shell disabled (set OUTPOST_ALLOW_SHELL=true)' });
  try {
    const cmd = String(req.body?.cmd || '').trim();
    if (!cmd) return res.status(400).json({ ok: false, error: 'cmd required' });
    const cwd = req.body?.cwd ? String(req.body.cwd) : __dirname;
    const timeout = Number(req.body?.timeoutMs || 15000);
    const { stdout, stderr } = await runShellCommand(cmd, cwd, timeout);
    res.json({ ok: true, cmd, stdout, stderr });
  } catch (err) {
    res.status(400).json({ ok: false, error: err?.message || 'shell 执行失败', stdout: err?.stdout || '', stderr: err?.stderr || '' });
  }
});

app.post('/api/update', requireApiToken, async (req, res) => {
  if (!OUTPOST_ALLOW_UPDATE) return res.status(403).json({ ok: false, error: 'update disabled (set OUTPOST_ALLOW_UPDATE=true)' });
  try {
    const cmd = String(req.body?.cmd || `git -C '${OUTPOST_WORKSPACE}' pull --ff-only`).trim();
    const { stdout, stderr } = await runShellCommand(cmd, OUTPOST_WORKSPACE, 60000);
    res.json({ ok: true, cmd, stdout, stderr, note: '如有依赖变更，请重启 outpost 服务' });
  } catch (err) {
    res.status(400).json({ ok: false, error: err?.message || 'update 失败', stdout: err?.stdout || '', stderr: err?.stderr || '' });
  }
});

const pluginRegistry = {
  browser: {
    actions: ['command', 'batch'],
    description: 'Browser control bridge backed by Playwright commands.'
  },
  shell: {
    actions: ['exec'],
    description: 'Host zsh command execution (requires OUTPOST_ALLOW_SHELL=true).'
  },
  updater: {
    actions: ['pull'],
    description: 'Self-update/pull latest code (requires OUTPOST_ALLOW_UPDATE=true).'
  },
  skills: {
    actions: ['list-installed', 'search', 'install', 'update', 'run'],
    description: 'Bridge ClawHub skill operations for OpenClaw (requires OUTPOST_ALLOW_SKILLS=true).'
  }
};

app.get('/api/plugins', requireApiToken, (req, res) => {
  res.json({ ok: true, plugins: pluginRegistry });
});

// Bridge protocol v1: install/run/result/log (current: install + log + registry)
app.get('/api/bridge/registry', requireApiToken, (req, res) => {
  const registry = readRegistry(BRIDGE_STORE.registryPath);
  res.json({ ok: true, registry });
});

app.get('/api/bridge/task-log', requireApiToken, (req, res) => {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));
  const text = fs.existsSync(BRIDGE_STORE.taskLogPath) ? fs.readFileSync(BRIDGE_STORE.taskLogPath, 'utf8') : '';
  const rows = text
    .split('\n')
    .filter(Boolean)
    .slice(-limit)
    .map((line) => {
      try { return JSON.parse(line); } catch { return { raw: line }; }
    });
  res.json({ ok: true, items: rows });
});

app.post('/api/bridge/install', requireApiToken, async (req, res) => {
  if (!OUTPOST_ALLOW_SKILLS) return res.status(403).json({ ok: false, error: 'skills bridge disabled (set OUTPOST_ALLOW_SKILLS=true)' });
  const slug = String(req.body?.slug || '').trim();
  const version = String(req.body?.version || '').trim();
  const force = req.body?.force !== false;
  const source = String(req.body?.source || 'outpost');

  if (!ensureSafeSkillSlug(slug)) return res.status(400).json({ ok: false, error: 'invalid slug' });

  const taskId = makeTaskId('install');
  setBridgeTask(taskId, { kind: 'install', status: 'running', source, slug, version: version || null });
  appendTaskLog(BRIDGE_STORE.taskLogPath, { taskId, kind: 'install', phase: 'start', slug, version: version || null, source });

  try {
    const args = ['install', slug];
    if (version) args.push('--version', version);
    if (force) args.push('--force');
    const { stdout, stderr } = await runClawhub(args);

    const record = {
      slug,
      version: version || 'latest',
      installedAt: new Date().toISOString(),
      installedBy: source,
      managedBy: 'openclaw',
      status: 'installed'
    };
    const registry = upsertSkillRecord(BRIDGE_STORE.registryPath, record);
    setBridgeTask(taskId, { kind: 'install', status: 'done', result: { slug, version: record.version } });
    appendTaskLog(BRIDGE_STORE.taskLogPath, { taskId, kind: 'install', phase: 'done', slug, version: record.version });

    return res.json({ ok: true, taskId, slug, version: record.version, registry, stdout, stderr });
  } catch (err) {
    setBridgeTask(taskId, { kind: 'install', status: 'error', error: err?.message || 'install failed' });
    appendTaskLog(BRIDGE_STORE.taskLogPath, { taskId, kind: 'install', phase: 'error', slug, error: err?.message || 'install failed' });
    return res.status(400).json({ ok: false, taskId, error: err?.message || 'install failed', stdout: err?.stdout || '', stderr: err?.stderr || '' });
  }
});

app.post('/api/bridge/run', requireApiToken, requireBridgeSignature, async (req, res) => {
  const runner = String(req.body?.runner || '').trim();
  const source = String(req.body?.source || 'openclaw');
  const taskId = makeTaskId('run');
  setBridgeTask(taskId, { kind: 'run', status: 'running', runner, source });
  appendTaskLog(BRIDGE_STORE.taskLogPath, { taskId, kind: 'run', phase: 'start', runner, source });

  try {
    if (runner === 'outpost-shell') {
      if (!OUTPOST_ALLOW_SHELL) throw new Error('shell disabled');
      const cmd = String(req.body?.cmd || '').trim();
      if (!cmd) throw new Error('cmd required for outpost-shell');
      const cwd = req.body?.cwd ? String(req.body.cwd) : __dirname;
      const timeout = Number(req.body?.timeoutMs || 15000);
      const { stdout, stderr } = await runShellCommand(cmd, cwd, timeout);
      const result = { stdout, stderr };
      setBridgeTask(taskId, { status: 'done', result });
      appendTaskLog(BRIDGE_STORE.taskLogPath, { taskId, kind: 'run', phase: 'done', runner, result: { stdoutLen: stdout.length, stderrLen: stderr.length } });
      return res.json({ ok: true, taskId, runner, result });
    }

    if (runner === 'outpost-browser') {
      const command = String(req.body?.command || '').trim();
      if (!command) throw new Error('command required for outpost-browser');
      const data = await executeWithAudit(command, { source: 'bridge-runner-outpost-browser', channel: 'bridge' });
      setBridgeTask(taskId, { status: 'done', result: data });
      appendTaskLog(BRIDGE_STORE.taskLogPath, { taskId, kind: 'run', phase: 'done', runner, result: { command } });
      return res.json({ ok: true, taskId, runner, result: data });
    }

    if (runner === 'openclaw-plan') {
      const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];
      if (!steps.length) throw new Error('steps required for openclaw-plan');

      const stepResults = [];
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i] || {};
        const type = String(step.type || '').trim();

        if (type === 'shell') {
          if (!OUTPOST_ALLOW_SHELL) throw new Error('shell disabled');
          const cmd = String(step.cmd || '').trim();
          if (!cmd) throw new Error(`step[${i}] shell cmd required`);
          const cwd = step.cwd ? String(step.cwd) : __dirname;
          const timeout = Number(step.timeoutMs || 15000);
          const { stdout, stderr } = await runShellCommand(cmd, cwd, timeout);
          stepResults.push({ i, type, ok: true, stdout, stderr });
          appendTaskLog(BRIDGE_STORE.taskLogPath, { taskId, kind: 'run', phase: 'step-done', runner, step: i, type });
          continue;
        }

        if (type === 'browser') {
          const command = String(step.command || '').trim();
          if (!command) throw new Error(`step[${i}] browser command required`);
          const data = await executeWithAudit(command, { source: 'bridge-openclaw-plan-browser-step', channel: 'bridge' });
          stepResults.push({ i, type, ok: true, data });
          appendTaskLog(BRIDGE_STORE.taskLogPath, { taskId, kind: 'run', phase: 'step-done', runner, step: i, type });
          continue;
        }

        throw new Error(`step[${i}] type must be shell|browser`);
      }

      const result = { steps: stepResults };
      setBridgeTask(taskId, { status: 'done', result });
      appendTaskLog(BRIDGE_STORE.taskLogPath, { taskId, kind: 'run', phase: 'done', runner, result: { stepCount: stepResults.length } });
      return res.json({ ok: true, taskId, runner, result });
    }

    throw new Error('runner must be outpost-shell|outpost-browser|openclaw-plan');
  } catch (err) {
    setBridgeTask(taskId, { status: 'error', error: err?.message || 'run failed' });
    appendTaskLog(BRIDGE_STORE.taskLogPath, { taskId, kind: 'run', phase: 'error', runner, error: err?.message || 'run failed' });
    return res.status(400).json({ ok: false, taskId, error: err?.message || 'run failed', stdout: err?.stdout || '', stderr: err?.stderr || '' });
  }
});

app.post('/api/bridge/result', requireApiToken, requireBridgeSignature, (req, res) => {
  const taskId = String(req.body?.taskId || '').trim();
  if (!taskId) return res.status(400).json({ ok: false, error: 'taskId required' });
  const status = String(req.body?.status || '').trim() || 'done';
  const result = req.body?.result ?? null;
  const error = req.body?.error ?? null;
  const task = setBridgeTask(taskId, { status, result, error, source: 'openclaw-callback' });
  appendTaskLog(BRIDGE_STORE.taskLogPath, { taskId, kind: 'result', phase: status, error: error || undefined });
  return res.json({ ok: true, task });
});

app.get('/api/bridge/tasks', requireApiToken, (req, res) => {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));
  const items = [...BRIDGE_TASKS.values()]
    .sort((a, b) => Date.parse(String(b.updatedAt || b.createdAt || 0)) - Date.parse(String(a.updatedAt || a.createdAt || 0)))
    .slice(0, limit);
  return res.json({ ok: true, items });
});

app.get('/api/bridge/task/:taskId', requireApiToken, (req, res) => {
  const taskId = String(req.params.taskId || '').trim();
  const task = BRIDGE_TASKS.get(taskId);
  if (!task) return res.status(404).json({ ok: false, error: 'task not found' });
  return res.json({ ok: true, task });
});

app.post('/api/plugin/:name/invoke', requireApiToken, async (req, res) => {
  const name = String(req.params.name || '').trim();
  const action = String(req.body?.action || '').trim();
  try {
    if (name === 'browser') {
      if (action === 'command') {
        const command = String(req.body?.command || '').trim();
        if (!command) return res.status(400).json({ ok: false, error: 'command required' });
        const data = await executeWithAudit(command, { source: 'plugin-browser-command', channel: 'plugin' });
        return res.json({ ok: true, plugin: name, action, data });
      }
      if (action === 'batch') {
        const commands = Array.isArray(req.body?.commands) ? req.body.commands.map((x) => String(x || '').trim()).filter(Boolean) : [];
        if (!commands.length) return res.status(400).json({ ok: false, error: 'commands[] required' });
        const out = [];
        for (const command of commands) {
          try {
            const data = await executeWithAudit(command, { source: 'plugin-browser-batch', channel: 'plugin' });
            out.push({ ok: true, command, data });
          } catch (err) {
            out.push({ ok: false, command, error: err?.message || '执行失败' });
            break;
          }
        }
        return res.json({ ok: out.every((x) => x.ok), plugin: name, action, results: out });
      }
      return res.status(400).json({ ok: false, error: 'browser action must be command|batch' });
    }

    if (name === 'shell') {
      if (!OUTPOST_ALLOW_SHELL) return res.status(403).json({ ok: false, error: 'shell disabled' });
      if (action !== 'exec') return res.status(400).json({ ok: false, error: 'shell action must be exec' });
      const cmd = String(req.body?.cmd || '').trim();
      if (!cmd) return res.status(400).json({ ok: false, error: 'cmd required' });
      const cwd = req.body?.cwd ? String(req.body.cwd) : __dirname;
      const timeout = Number(req.body?.timeoutMs || 15000);
      const { stdout, stderr } = await runShellCommand(cmd, cwd, timeout);
      return res.json({ ok: true, plugin: name, action, stdout, stderr });
    }

    if (name === 'updater') {
      if (!OUTPOST_ALLOW_UPDATE) return res.status(403).json({ ok: false, error: 'update disabled' });
      if (action !== 'pull') return res.status(400).json({ ok: false, error: 'updater action must be pull' });
      const cmd = String(req.body?.cmd || `git -C '${OUTPOST_WORKSPACE}' pull --ff-only`).trim();
      const { stdout, stderr } = await runShellCommand(cmd, OUTPOST_WORKSPACE, 60000);
      return res.json({ ok: true, plugin: name, action, stdout, stderr });
    }

    if (name === 'skills') {
      if (!OUTPOST_ALLOW_SKILLS) return res.status(403).json({ ok: false, error: 'skills bridge disabled (set OUTPOST_ALLOW_SKILLS=true)' });

      if (action === 'list-installed') {
        const skills = listInstalledSkills(OUTPOST_SKILLS_DIR);
        return res.json({ ok: true, plugin: name, action, skills });
      }

      if (action === 'search') {
        const query = String(req.body?.query || '').trim();
        if (!query) return res.status(400).json({ ok: false, error: 'query required' });
        const { stdout, stderr } = await runClawhub(['search', query]);
        return res.json({ ok: true, plugin: name, action, query, stdout, stderr });
      }

      if (action === 'install') {
        const slug = String(req.body?.slug || '').trim();
        const version = String(req.body?.version || '').trim();
        const force = req.body?.force !== false;
        if (!ensureSafeSkillSlug(slug)) return res.status(400).json({ ok: false, error: 'invalid slug' });
        const args = ['install', slug];
        if (version) args.push('--version', version);
        if (force) args.push('--force');
        const { stdout, stderr } = await runClawhub(args);

        const record = {
          slug,
          version: version || 'latest',
          installedAt: new Date().toISOString(),
          installedBy: 'outpost-plugin',
          managedBy: 'openclaw',
          status: 'installed'
        };
        const registry = upsertSkillRecord(BRIDGE_STORE.registryPath, record);
        appendTaskLog(BRIDGE_STORE.taskLogPath, { kind: 'install', phase: 'done', slug, version: record.version, by: 'plugin:skills.install' });

        return res.json({ ok: true, plugin: name, action, slug, version: version || null, force, registry, stdout, stderr });
      }

      if (action === 'run') {
        const slug = String(req.body?.slug || '').trim();
        if (!ensureSafeSkillSlug(slug)) return res.status(400).json({ ok: false, error: 'invalid slug' });

        const skillDir = path.join(OUTPOST_SKILLS_DIR, slug);
        if (!fs.existsSync(skillDir)) {
          return res.status(404).json({ ok: false, error: `skill not found: ${slug}` });
        }

        const timeout = Math.max(1000, Math.min(600000, Number(req.body?.timeoutMs || 120000)));
        const cmdFromReq = String(req.body?.cmd || req.body?.command || '').trim();
        const command = cmdFromReq || resolveSkillRunCommand(skillDir);

        if (!command) {
          return res.status(400).json({
            ok: false,
            error: 'no runnable entry found. provide cmd/command or add scripts/run.sh|run.mjs|run.js|run.py'
          });
        }

        const { stdout, stderr } = await runShellCommand(command, skillDir, timeout);
        appendTaskLog(BRIDGE_STORE.taskLogPath, {
          kind: 'run-skill',
          phase: 'done',
          slug,
          by: 'plugin:skills.run',
          command
        });
        return res.json({ ok: true, plugin: name, action, slug, skillDir, command, timeoutMs: timeout, stdout, stderr });
      }

      if (action === 'update') {
        const slug = String(req.body?.slug || '').trim();
        const version = String(req.body?.version || '').trim();
        const force = req.body?.force !== false;
        const args = slug ? ['update', slug] : ['update', '--all'];
        if (version) args.push('--version', version);
        if (force) args.push('--force');
        const { stdout, stderr } = await runClawhub(args);
        if (slug) {
          const registry = upsertSkillRecord(BRIDGE_STORE.registryPath, {
            slug,
            version: version || 'latest',
            updatedAt: new Date().toISOString(),
            managedBy: 'openclaw',
            status: 'installed'
          });
          appendTaskLog(BRIDGE_STORE.taskLogPath, { kind: 'update', phase: 'done', slug, version: version || 'latest', by: 'plugin:skills.update' });
          return res.json({ ok: true, plugin: name, action, slug, version: version || null, force, registry, stdout, stderr });
        }
        appendTaskLog(BRIDGE_STORE.taskLogPath, { kind: 'update', phase: 'done', slug: null, by: 'plugin:skills.update-all' });
        return res.json({ ok: true, plugin: name, action, slug: slug || null, version: version || null, force, stdout, stderr });
      }

      return res.status(400).json({ ok: false, error: 'skills action must be list-installed|search|install|update|run' });
    }

    return res.status(404).json({ ok: false, error: `unknown plugin: ${name}` });
  } catch (err) {
    return res.status(400).json({ ok: false, plugin: name, action, error: err?.message || 'invoke failed', stdout: err?.stdout || '', stderr: err?.stderr || '' });
  }
});

let browser;
let context;
let controlPage;
let botPage;
let activeTarget = 'bot';

const capabilities = {
  browserControl: true,
  shell: OUTPOST_ALLOW_SHELL,
  selfUpdate: OUTPOST_ALLOW_UPDATE,
  skillsBridge: OUTPOST_ALLOW_SKILLS,
  shellBin: SHELL_BIN,
  transport: ['ws', 'http'],
  version: '0.10.3'
};

function ok(message, data) {
  return JSON.stringify({ ok: true, message, data });
}
function fail(message, data) {
  return JSON.stringify({ ok: false, message, data });
}

async function ensureBrowser() {
  if (!browser) {
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: false });
    } catch (err) {
      throw new Error(`启动 Chrome 失败：${err?.message || err}。请先在宿主机安装 Google Chrome（非 Chromium），并在有桌面环境下运行 demo。`);
    }
    context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  }
}

async function ensureControlPage() {
  await ensureBrowser();
  if (!controlPage || controlPage.isClosed()) controlPage = await context.newPage();
  return controlPage;
}

async function ensureBotPage() {
  await ensureBrowser();
  if (!botPage || botPage.isClosed()) botPage = await context.newPage();
  return botPage;
}

async function ensureTargetPage() {
  if (activeTarget === 'control') return await ensureControlPage();
  return await ensureBotPage();
}

function parseCmd(input) {
  const trimmed = input.trim();
  const first = trimmed.split(' ')[0];
  const rest = trimmed.slice(first.length).trim();

  if (['open', 'navigate'].includes(first)) {
    return { action: first, url: rest };
  }
  if (first === 'click') return { action: 'click', selector: rest };
  if (first === 'type') {
    const m = rest.match(/^(\S+)\s+([\s\S]+)$/);
    if (!m) throw new Error('type 命令格式：type <selector> <text>');
    return { action: 'type', selector: m[1], text: m[2] };
  }
  if (first === 'select') {
    const m = rest.match(/^(\S+)\s+([\s\S]+)$/);
    if (!m) throw new Error('select 命令格式：select <selector> <value>');
    return { action: 'select', selector: m[1], value: m[2] };
  }
  if (first === 'typen') {
    const m = rest.match(/^(\d+)\s+([\s\S]+)$/);
    if (!m) throw new Error('typen 命令格式：typen <序号> <text>');
    return { action: 'typen', index: Number(m[1]), text: m[2] };
  }
  if (first === 'typetext') {
    const m = rest.match(/^(.+?)\s+([\s\S]+)$/);
    if (!m) throw new Error('typetext 命令格式：typetext <文本片段> <text>');
    return { action: 'typetext', query: m[1].trim(), text: m[2] };
  }
  if (first === 'list') {
    if (!rest) return { action: 'list', limit: 50 };
    const n = Number(rest);
    if (!Number.isInteger(n) || n < 1) throw new Error('list 命令格式：list [前N条]，例如 list 20');
    return { action: 'list', limit: n };
  }
  if (first === 'attach') return { action: 'attach', cdpUrl: rest || 'http://127.0.0.1:9222' };
  if (first === 'split') return { action: 'split', url: rest };
  if (first === 'split_here') return { action: 'split_here' };
  if (first === 'target') return { action: 'target', target: rest.toLowerCase() };
  if (first === 'targets') return { action: 'targets' };
  if (first === 'clickn') return { action: 'clickn', index: Number(rest) };
  if (first === 'highlightn') return { action: 'highlightn', index: Number(rest) };
  if (first === 'clicktext') return { action: 'clicktext', text: rest };
  if (first === 'highlighttext') return { action: 'highlighttext', text: rest };
  if (first === 'highlight') return { action: 'highlight', selector: rest };
  if (first === 'title') return { action: 'title' };
  if (first === 'screenshot') return { action: 'screenshot' };
  if (first === 'help') return { action: 'help' };
  if (first === 'ping') return { action: 'ping' };
  throw new Error(`不支持的命令: ${first || '(empty)'}，输入 help 查看可用命令`);
}

function isSafeUrl(url) {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol);
  } catch {
    return false;
  }
}

async function getInteractiveItems(p, limit = 50) {
  return await p.evaluate((max) => {
    const nodes = Array.from(document.querySelectorAll('button, a, input, select, textarea, [role="button"]'));

    const visible = nodes.filter((el) => {
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0;
    });

    const cssEscape = (v) => {
      if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(v);
      return String(v).replace(/([ #;?%&,.+*~\':"!^$\[\]()=>|/@])/g, '\\$1');
    };

    const cssPath = (el) => {
      if (el.id) return `#${cssEscape(el.id)}`;
      const parts = [];
      let cur = el;
      while (cur && cur.nodeType === 1 && parts.length < 4) {
        let part = cur.tagName.toLowerCase();
        if (cur.getAttribute('data-testid')) {
          part += `[data-testid="${cssEscape(cur.getAttribute('data-testid'))}"]`;
          parts.unshift(part);
          break;
        }
        if (cur.getAttribute('name')) {
          part += `[name="${cssEscape(cur.getAttribute('name'))}"]`;
          parts.unshift(part);
          break;
        }
        const siblings = cur.parentElement ? Array.from(cur.parentElement.children).filter((x) => x.tagName === cur.tagName) : [];
        if (siblings.length > 1) {
          const idx = siblings.indexOf(cur) + 1;
          part += `:nth-of-type(${idx})`;
        }
        parts.unshift(part);
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    };

    return visible.slice(0, max).map((el, i) => ({
      i: i + 1,
      tag: el.tagName.toLowerCase(),
      text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 80),
      id: el.id || null,
      name: el.getAttribute('name') || null,
      testid: el.getAttribute('data-testid') || null,
      selector: cssPath(el)
    }));
  }, limit);
}

async function getPageText(p) {
  return await p.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').trim());
}

async function actVisibleItemByIndex(p, index, mode = 'click') {
  return await p.evaluate(({ idx, mode }) => {
    const nodes = Array.from(document.querySelectorAll('button, a, input, select, textarea, [role="button"]'));
    const visible = nodes.filter((el) => {
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0;
    });

    const target = visible[idx - 1];
    if (!target) return { ok: false, error: `未找到序号 ${idx}` };

    const tag = target.tagName.toLowerCase();
    const text = (target.innerText || target.getAttribute('aria-label') || target.getAttribute('placeholder') || '').trim().slice(0, 120);

    if (mode === 'highlight') {
      const prev = target.style.outline;
      target.style.outline = '3px solid #ff4d4f';
      target.style.outlineOffset = '2px';
      setTimeout(() => { target.style.outline = prev; }, 2000);
      return { ok: true, target: { i: idx, tag, text } };
    }

    if (mode === 'click') {
      target.scrollIntoView({ block: 'center', inline: 'center' });
      target.click();
      return { ok: true, target: { i: idx, tag, text } };
    }

    return { ok: false, error: `未知mode: ${mode}` };
  }, { idx: index, mode });
}

async function execute(command) {
  const cmd = parseCmd(command);
  const p = ['attach', 'split', 'split_here', 'targets', 'target'].includes(cmd.action) ? null : await ensureTargetPage();

  if (cmd.action === 'attach') {
    if (!cmd.cdpUrl) throw new Error('attach 命令格式：attach [cdpUrl]');
    try {
      browser = await chromium.connectOverCDP(cmd.cdpUrl);
    } catch (err) {
      throw new Error(`attach 失败：无法连接 ${cmd.cdpUrl}。请先用 remote-debugging-port 启动本机 Chrome。原始错误: ${err?.message || err}`);
    }
    const contexts = browser.contexts();
    context = contexts[0];
    if (!context) throw new Error('attach 失败：未发现可用浏览器上下文');
    const pages = context.pages();
    botPage = pages[pages.length - 1] || null;
    // attach 模式下不主动创建 control 空白页，避免打扰用户现有窗口。
    // 仅在用户后续显式使用 split/target control 时再创建。
    controlPage = (controlPage && !controlPage.isClosed()) ? controlPage : null;
    activeTarget = 'bot';
    return {
      attached: true,
      cdpUrl: cmd.cdpUrl,
      activeTarget,
      pages: pages.length,
      bot: botPage ? { url: botPage.url() || 'about:blank', title: await botPage.title().catch(() => '') } : { url: 'about:blank', title: '' }
    };
  }

  if (cmd.action === 'split') {
    if (!isSafeUrl(cmd.url)) throw new Error('split 命令格式：split <http/https url>');
    const cp = await ensureControlPage();
    const bp = await ensureBotPage();
    await bp.goto(cmd.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    activeTarget = 'bot';
    return {
      splitReady: true,
      activeTarget,
      control: { url: cp.url() || 'about:blank', title: await cp.title().catch(() => '') },
      bot: { url: bp.url(), title: await bp.title() }
    };
  }

  if (cmd.action === 'split_here') {
    const cp = await ensureControlPage();
    const bp = await ensureBotPage();
    const src = (bp && !bp.isClosed() && bp.url() && bp.url() !== 'about:blank')
      ? bp.url()
      : (cp && !cp.isClosed() && cp.url() && cp.url() !== 'about:blank' ? cp.url() : '');
    if (!src || !isSafeUrl(src)) throw new Error('split_here 失败：当前没有可复用的 http/https 页面，请先 open 或 split 一个 URL');
    await bp.goto(src, { waitUntil: 'domcontentloaded', timeout: 30000 });
    activeTarget = 'bot';
    return {
      splitReady: true,
      from: src,
      activeTarget,
      control: { url: cp.url() || 'about:blank', title: await cp.title().catch(() => '') },
      bot: { url: bp.url(), title: await bp.title() }
    };
  }

  if (cmd.action === 'target') {
    if (!['control', 'bot'].includes(cmd.target)) throw new Error('target 命令格式：target <control|bot>');
    activeTarget = cmd.target;
    const tp = await ensureTargetPage();
    return { activeTarget, url: tp.url() || 'about:blank', title: await tp.title().catch(() => '') };
  }

  if (cmd.action === 'targets') {
    await ensureBrowser();
    const controlAlive = !!(controlPage && !controlPage.isClosed());
    const botAlive = !!(botPage && !botPage.isClosed());
    return {
      activeTarget,
      control: controlAlive ? { alive: true, url: controlPage.url() || 'about:blank', title: await controlPage.title().catch(() => '') } : { alive: false },
      bot: botAlive ? { alive: true, url: botPage.url() || 'about:blank', title: await botPage.title().catch(() => '') } : { alive: false }
    };
  }

  if (cmd.action === 'open' || cmd.action === 'navigate') {
    if (!isSafeUrl(cmd.url)) throw new Error('URL 不合法，仅支持 http/https');
    await p.goto(cmd.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    return { target: activeTarget, url: p.url(), title: await p.title() };
  }

  if (cmd.action === 'click') {
    await p.locator(cmd.selector).first().click({ timeout: 10000 });
    return { clicked: cmd.selector };
  }

  if (cmd.action === 'type') {
    const el = p.locator(cmd.selector).first();
    await el.click({ timeout: 10000 });
    await el.fill(cmd.text, { timeout: 10000 });
    return { typed: cmd.selector, text: cmd.text };
  }

  if (cmd.action === 'select') {
    await p.locator(cmd.selector).first().selectOption({ value: cmd.value }, { timeout: 10000 });
    return { selected: cmd.selector, value: cmd.value };
  }

  if (cmd.action === 'typen') {
    if (!Number.isInteger(cmd.index) || cmd.index < 1) throw new Error('typen 命令格式：typen <序号> <text>');
    const items = await getInteractiveItems(p, 200);
    const target = items.find((x) => x.i === cmd.index);
    if (!target) throw new Error(`typen 未找到序号 ${cmd.index}，请先执行 list`);
    if (!['input', 'textarea'].includes(target.tag)) throw new Error(`typen 目标不是可输入框：#${cmd.index} (${target.tag})`);
    const el = p.locator(target.selector).first();
    await el.click({ timeout: 10000 });
    await el.fill(cmd.text, { timeout: 10000 });
    return { typed: target, text: cmd.text };
  }

  if (cmd.action === 'typetext') {
    if (!cmd.query) throw new Error('typetext 命令格式：typetext <文本片段> <text>');
    const q = cmd.query.toLowerCase();
    const items = await getInteractiveItems(p, 200);
    const target = items.find((x) => ['input', 'textarea'].includes(x.tag) && (x.text || '').toLowerCase().includes(q));
    if (!target) throw new Error(`typetext 未匹配到输入框文本: ${cmd.query}`);
    const el = p.locator(target.selector).first();
    await el.click({ timeout: 10000 });
    await el.fill(cmd.text, { timeout: 10000 });
    return { typed: target, query: cmd.query, text: cmd.text };
  }

  if (cmd.action === 'list') {
    const limit = Math.min(cmd.limit || 50, 500);
    const items = await getInteractiveItems(p, limit);
    const pageText = await getPageText(p);
    return { count: items.length, limit, items, pageText };
  }

  if (cmd.action === 'clickn') {
    if (!Number.isInteger(cmd.index) || cmd.index < 1) throw new Error('clickn 命令格式：clickn <序号>');
    const result = await actVisibleItemByIndex(p, cmd.index, 'click');
    if (!result?.ok) throw new Error(`clickn 失败：${result?.error || '未知错误'}，请先执行 list 刷新序号`);
    return { clicked: result.target };
  }

  if (cmd.action === 'highlightn') {
    if (!Number.isInteger(cmd.index) || cmd.index < 1) throw new Error('highlightn 命令格式：highlightn <序号>');
    const result = await actVisibleItemByIndex(p, cmd.index, 'highlight');
    if (!result?.ok) throw new Error(`highlightn 失败：${result?.error || '未知错误'}，请先执行 list 刷新序号`);
    return { highlighted: result.target };
  }

  if (cmd.action === 'clicktext') {
    if (!cmd.text) throw new Error('clicktext 命令格式：clicktext <文本片段>');
    const q = cmd.text.toLowerCase();
    const items = await getInteractiveItems(p, 200);
    const target = items.find((x) => (x.text || '').toLowerCase().includes(q));
    if (!target) throw new Error(`clicktext 未匹配到文本: ${cmd.text}`);
    await p.locator(target.selector).first().click({ timeout: 10000 });
    return { clicked: target, query: cmd.text };
  }

  if (cmd.action === 'highlighttext') {
    if (!cmd.text) throw new Error('highlighttext 命令格式：highlighttext <文本片段>');
    const q = cmd.text.toLowerCase();
    const items = await getInteractiveItems(p, 200);
    const target = items.find((x) => (x.text || '').toLowerCase().includes(q));
    if (!target) throw new Error(`highlighttext 未匹配到文本: ${cmd.text}`);
    const found = await p.locator(target.selector).first();
    await found.evaluate((el) => {
      const prev = el.style.outline;
      el.style.outline = '3px solid #ff4d4f';
      el.style.outlineOffset = '2px';
      setTimeout(() => { el.style.outline = prev; }, 2000);
    });
    return { highlighted: target, query: cmd.text };
  }

  if (cmd.action === 'highlight') {
    if (!cmd.selector) throw new Error('highlight 命令格式：highlight <selector>');
    const found = await p.locator(cmd.selector).first();
    await found.evaluate((el) => {
      const prev = el.style.outline;
      el.style.outline = '3px solid #ff4d4f';
      el.style.outlineOffset = '2px';
      setTimeout(() => { el.style.outline = prev; }, 2000);
    });
    return { highlighted: cmd.selector };
  }

  if (cmd.action === 'title') {
    return { title: await p.title(), url: p.url() };
  }

  if (cmd.action === 'screenshot') {
    const out = path.join(__dirname, `shot-${Date.now()}.png`);
    await p.screenshot({ path: out, fullPage: true });
    return { saved: out };
  }

  if (cmd.action === 'help') {
    return {
      version: '0.10.3',
      commands: [
        'attach [cdpUrl]',
        'split <url>',
        'split_here',
        'target <control|bot>',
        'targets',
        'open <url>',
        'navigate <url>',
        'click <selector>',
        'type <selector> <text>',
        'typen <序号> <text>',
        'typetext <文本片段> <text>',
        'select <selector> <value>',
        'list [前N条]',
        'clickn <序号>',
        'highlightn <序号>',
        'clicktext <文本片段>',
        'highlighttext <文本片段>',
        'highlight <selector>',
        'title',
        'screenshot',
        'ping'
      ]
    };
  }

  if (cmd.action === 'ping') {
    return { pong: true, version: '0.10.3', now: ts() };
  }

  throw new Error('未知动作');
}

wss.on('connection', (ws) => {
  const cid = Math.random().toString(36).slice(2, 8);
  writeLog('info', 'ws connected', { cid });
  ws.send(ok('Outpost 已连接：可用 WS/HTTP 双通道（help 查看命令，ping 验证版本）', { version: '0.10.3' }));

  ws.on('message', async (buf) => {
    const raw = buf.toString();
    try {
      const msg = JSON.parse(raw);
      if (msg.type !== 'command') {
        writeLog('warn', 'ignored non-command message', { cid, raw });
        return;
      }
      writeLog('info', 'command received', { cid, command: msg.command });
      const data = await executeWithAudit(msg.command, { source: 'ws-command', channel: 'ws' });
      ws.send(ok(`执行完成：${msg.command}`, data));
      writeLog('info', 'command success', { cid, command: msg.command });
    } catch (err) {
      const emsg = err?.message || '执行失败';
      ws.send(fail(emsg, { raw }));
      writeLog('error', 'command failed', { cid, raw, error: emsg });
    }
  });

  ws.on('close', () => writeLog('info', 'ws closed', { cid }));
});

process.on('SIGINT', async () => {
  if (browser) await browser.close();
  process.exit(0);
});
