import type { SkillItem } from '../types';

export function splitSkillsBySource(skills: SkillItem[]) {
  return {
    outpost: skills.filter((s) => s.source === 'outpost'),
    openclaw: skills.filter((s) => s.source === 'openclaw')
  };
}

export function applySkillAction(skills: SkillItem[], name: string, action: 'enable' | 'disable' | 'update') {
  return skills.map((skill) => {
    if (skill.name !== name) return skill;
    if (action === 'disable') return { ...skill, status: 'disabled' as const };
    if (action === 'enable') return { ...skill, status: 'installed' as const };
    return { ...skill, status: 'installed' as const };
  });
}
