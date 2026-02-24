import {
  buildDownloadName,
  copyResultLabel,
  previewToDownloadPayload
} from '../pages/files-actions-utils.js';

function run() {
  if (buildDownloadName('outpost/README') !== 'README.txt') {
    throw new Error('T18_FAIL: download name fallback failed');
  }
  if (copyResultLabel(true, 'path') !== '已复制路径') {
    throw new Error('T17_FAIL: copy label failed');
  }
  if (previewToDownloadPayload({ path: 'a', content: 'x', language: 'text', updatedAt: 't' }) !== 'x') {
    throw new Error('T18_FAIL: payload generation failed');
  }
  console.log('T17_T18_FILES_ACTIONS_SMOKE_PASS');
}

run();
