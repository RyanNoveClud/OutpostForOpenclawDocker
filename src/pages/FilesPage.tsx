import { useEffect, useMemo, useState } from 'react';
import type { FileTreeNode } from '../types';
import { useI18n } from '../i18n';

interface TreeProps {
  nodes: FileTreeNode[];
  depth: number;
  expanded: Record<string, boolean>;
  selectedPath: string;
  onToggle: (id: string) => void;
  onSelect: (node: FileTreeNode) => void;
  onDownloadFile: (path: string) => void;
  onDownloadFolder: (path: string) => void;
  t: (k: any) => string;
}

function parseJsonSafe(text: string) {
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

function formatXml(xml: string) {
  const PADDING = '  ';
  const reg = /(>)(<)(\/*)/g;
  let formatted = '';
  let pad = 0;
  xml = xml.replace(reg, '$1\n$2$3');
  for (const line of xml.split('\n')) {
    if (line.match(/^<\/\w/)) pad = Math.max(pad - 1, 0);
    formatted += PADDING.repeat(pad) + line + '\n';
    if (line.match(/^<[^!?][^>]*[^/]>/) && !line.includes('</')) pad += 1;
  }
  return formatted.trim();
}

function prettyByExt(filePath: string, content: string) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.json')) {
    try { return JSON.stringify(JSON.parse(content), null, 2); } catch { return content; }
  }
  if (lower.endsWith('.xml') || lower.endsWith('.svg')) {
    try { return formatXml(content); } catch { return content; }
  }
  return content;
}

function TreeNodes({ nodes, depth, expanded, selectedPath, onToggle, onSelect, onDownloadFile, onDownloadFolder, t }: TreeProps) {
  return (
    <ul className="files-tree-list">
      {nodes.map((node) => {
        const isDir = node.type === 'directory';
        const isOpen = !!expanded[node.id];
        const hasChildren = isDir && !!node.children?.length;
        const selected = node.path === selectedPath;

        return (
          <li key={node.id}>
            <div className="files-tree-item" style={{ paddingLeft: `${depth * 16 + 8}px`, background: selected ? 'var(--bg-hover)' : 'transparent' }}>
              <button type="button" className="files-tree-main" onClick={() => (isDir ? onToggle(node.id) : onSelect(node))}>
                <span>{isDir ? (isOpen ? '📂' : '📁') : '📄'}</span>
                <span className="files-tree-name">{node.name}</span>
              </button>
              <div className="skills-actions">
                {isDir ? (
                  <button type="button" onClick={() => onDownloadFolder(node.path)}>{t('zipDownload')}</button>
                ) : (
                  <button type="button" onClick={() => onDownloadFile(node.path)}>{t('download')}</button>
                )}
              </div>
            </div>
            {hasChildren && isOpen ? (
              <TreeNodes
                nodes={node.children || []}
                depth={depth + 1}
                expanded={expanded}
                selectedPath={selectedPath}
                onToggle={onToggle}
                onSelect={onSelect}
                onDownloadFile={onDownloadFile}
                onDownloadFolder={onDownloadFolder}
                t={t}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

async function copyText(text: string) {
  if (!navigator.clipboard?.writeText) return false;
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function FilesPage() {
  const { t } = useI18n();
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedPath, setSelectedPath] = useState('');
  const [previewContent, setPreviewContent] = useState('');
  const [translated, setTranslated] = useState('');
  const [hint, setHint] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [isImagePreview, setIsImagePreview] = useState(false);

  async function loadTree() {
    const res = await fetch('/api/web/files/tree');
    const raw = await res.text();
    const json = parseJsonSafe(raw) as { ok?: boolean; items?: FileTreeNode[]; error?: string };
    if (!res.ok || !json?.ok) throw new Error(json?.error || `加载文件树失败 HTTP ${res.status}`);
    setTree(Array.isArray(json?.items) ? json.items : []);
  }

  async function loadPreview(path: string) {
    const lower = path.toLowerCase();
    const imageLike = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].some((ext) => lower.endsWith(ext));
    setSelectedPath(path);
    setTranslated('');
    setIsImagePreview(imageLike);
    if (imageLike) {
      setPreviewContent('');
      return;
    }
    const res = await fetch(`/api/web/files/preview?path=${encodeURIComponent(path)}`);
    const raw = await res.text();
    const json = parseJsonSafe(raw) as { ok?: boolean; content?: string; error?: string };
    if (!res.ok || !json?.ok) throw new Error(json?.error || `加载预览失败 HTTP ${res.status}`);
    setPreviewContent(prettyByExt(path, String(json?.content || '')));
  }

  useEffect(() => {
    loadTree().catch((err: unknown) => setError(err instanceof Error ? err.message : 'unknown error'));
  }, []);

  const visibleTree = useMemo(() => tree, [tree]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function downloadFile(path: string) {
    window.open(`/api/web/files/download-file?path=${encodeURIComponent(path)}`, '_blank');
  }

  function downloadFolder(path: string) {
    window.open(`/api/web/files/download-folder?path=${encodeURIComponent(path)}`, '_blank');
  }

  async function translateCurrent() {
    if (!previewContent.trim() || isImagePreview) return;
    setTranslating(true);
    try {
      const res = await fetch('/api/web/files/translate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: previewContent })
      });
      const raw = await res.text();
      const json = parseJsonSafe(raw) as { ok?: boolean; translatedText?: string; error?: string };
      if (!res.ok || !json?.ok) throw new Error(json?.error || `翻译失败 HTTP ${res.status}`);
      setTranslated(String(json.translatedText || ''));
      setHint(t('translateDone'));
    } catch (err) {
      setHint(err instanceof Error ? err.message : '翻译失败');
    } finally {
      setTranslating(false);
    }
  }

  return (
    <section className="files-layout" style={{ gridTemplateColumns: '360px 1fr' }}>
      <section className="files-tree-wrap">
        {error ? <p className="bridge-error">Files {t('loadFailed')}: {error}</p> : null}
        <h3>{t('filesTree')}</h3>
        {visibleTree.length ? (
          <TreeNodes
            nodes={visibleTree}
            depth={0}
            expanded={expanded}
            selectedPath={selectedPath}
            onToggle={toggleExpanded}
            onSelect={(node) => { if (node.type === 'file') loadPreview(node.path).catch((e) => setHint(String(e.message || e))); }}
            onDownloadFile={downloadFile}
            onDownloadFolder={downloadFolder}
            t={t}
          />
        ) : (
          <small>{t('loading')}</small>
        )}
      </section>

      <section className="files-preview-wrap">
        <header>
          <h3>{t('filePreview')}</h3>
          <small>{selectedPath || t('selectFile')}</small>
        </header>
        {isImagePreview && selectedPath ? (
          <div className="files-preview-image-wrap">
            <img className="files-preview-image" src={`/api/web/files/raw?path=${encodeURIComponent(selectedPath)}`} alt={selectedPath} />
          </div>
        ) : (
          <pre className="files-preview-pre">{previewContent || t('noContent')}</pre>
        )}
        <div className="files-actions">
          <button type="button" onClick={async () => setHint((await copyText(previewContent)) ? t('copied') : t('copyFailed'))} disabled={isImagePreview}>{t('copyFileContent')}</button>
          <button type="button" onClick={() => selectedPath && downloadFile(selectedPath)}>{t('download')}</button>
          <button type="button" onClick={translateCurrent} disabled={translating || isImagePreview}>{translating ? t('translating') : t('translateEnZh')}</button>
          <span>{hint}</span>
        </div>

        <article className="dashboard-card" style={{ marginTop: 12 }}>
          <h3>{t('translateResult')}</h3>
          <pre className="files-preview-pre files-translation-pre">{translated || t('translationWillShowHere')}</pre>
        </article>
      </section>
    </section>
  );
}
