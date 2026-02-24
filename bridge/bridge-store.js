import fs from 'fs';
import path from 'path';

function localTs() {
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

export function ensureBridgeStore(baseDir) {
  const dir = path.join(baseDir, 'bridge');
  const registryPath = path.join(dir, 'registry.json');
  const taskLogPath = path.join(dir, 'task-log.jsonl');
  const tasksPath = path.join(dir, 'tasks.json');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(registryPath)) {
    fs.writeFileSync(
      registryPath,
      JSON.stringify({ version: 1, updatedAt: localTs(), skills: [] }, null, 2)
    );
  }
  if (!fs.existsSync(taskLogPath)) fs.writeFileSync(taskLogPath, '');
  if (!fs.existsSync(tasksPath)) {
    fs.writeFileSync(tasksPath, JSON.stringify({ version: 1, updatedAt: localTs(), tasks: [] }, null, 2));
  }
  return { dir, registryPath, taskLogPath, tasksPath };
}

export function readRegistry(registryPath) {
  try {
    return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  } catch {
    return { version: 1, updatedAt: localTs(), skills: [] };
  }
}

export function upsertSkillRecord(registryPath, skill) {
  const registry = readRegistry(registryPath);
  const nextSkills = Array.isArray(registry.skills) ? [...registry.skills] : [];
  const idx = nextSkills.findIndex((x) => x.slug === skill.slug);
  if (idx >= 0) nextSkills[idx] = { ...nextSkills[idx], ...skill };
  else nextSkills.push(skill);
  const next = {
    version: 1,
    updatedAt: localTs(),
    skills: nextSkills.sort((a, b) => String(a.slug).localeCompare(String(b.slug)))
  };
  fs.writeFileSync(registryPath, JSON.stringify(next, null, 2));
  return next;
}

export function appendTaskLog(taskLogPath, event) {
  const line = JSON.stringify({ ts: localTs(), ...event });
  fs.appendFileSync(taskLogPath, line + '\n');
}

export function readTasks(tasksPath) {
  try {
    const data = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
    return Array.isArray(data.tasks) ? data.tasks : [];
  } catch {
    return [];
  }
}

export function upsertTask(tasksPath, task) {
  const current = readTasks(tasksPath);
  const next = [...current];
  const idx = next.findIndex((x) => x.taskId === task.taskId);
  if (idx >= 0) next[idx] = { ...next[idx], ...task };
  else next.push(task);
  const payload = {
    version: 1,
    updatedAt: localTs(),
    tasks: next.sort((a, b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0)).slice(0, 2000)
  };
  fs.writeFileSync(tasksPath, JSON.stringify(payload, null, 2));
  return payload.tasks;
}
