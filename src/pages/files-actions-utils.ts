import type { FilePreview } from '../types';

export function buildDownloadName(path: string): string {
  const seg = path.split('/').pop() || 'download.txt';
  return seg.includes('.') ? seg : `${seg}.txt`;
}

export function previewToDownloadPayload(preview: FilePreview): string {
  return preview.content;
}

export function copyResultLabel(ok: boolean, target: 'path' | 'content'): string {
  if (!ok) return `复制${target === 'path' ? '路径' : '内容'}失败`;
  return `已复制${target === 'path' ? '路径' : '内容'}`;
}
