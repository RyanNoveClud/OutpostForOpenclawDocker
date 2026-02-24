import { applySkillAction, splitSkillsBySource } from '../pages/skills-utils.js';
import type { SkillItem } from '../types/index.js';

function run() {
  const skills: SkillItem[] = [
    { name: 'a', version: '1', source: 'outpost', status: 'installed', updatedAt: 'x' },
    { name: 'b', version: '1', source: 'openclaw', status: 'update-available', updatedAt: 'x' }
  ];

  const groups = splitSkillsBySource(skills);
  if (groups.outpost.length !== 1 || groups.openclaw.length !== 1) {
    throw new Error('T19_FAIL: split source failed');
  }

  const next = applySkillAction(skills, 'b', 'update');
  if (next[1]?.status !== 'installed') throw new Error('T20_FAIL: action apply failed');

  console.log('T19_T20_SKILLS_SMOKE_PASS');
}

run();
