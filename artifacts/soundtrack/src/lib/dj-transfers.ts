export type {
  DjTransfer as DJTransfer,
  DjTransferTrack as DJTransferTrack,
  DjTransferStatus as DJTransferStatus,
  DjTransferCreate as DJTransferCreate,
} from '@workspace/api-client-react';

import { getDownloadDjTransferTrackUrl } from '@workspace/api-client-react';

export async function downloadTrack(
  transferId: string, 
  trackId: string, 
  onProgress: (loaded: number, total: number) => void, 
  signal?: AbortSignal
): Promise<void> {
  const url = getDownloadDjTransferTrackUrl(transferId, trackId);
  const res = await fetch(url, {
    credentials: 'include',
    signal
  });
  
  if (!res.ok) {
    throw new Error('Erreur lors du téléchargement. Le fichier est peut-être expiré ou révoqué.');
  }
  
  const contentLength = res.headers.get('Content-Length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  
  let filename = 'download';
  const disposition = res.headers.get('Content-Disposition');
  if (disposition && disposition.includes('attachment')) {
    const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
    if (matches != null && matches[1]) {
      filename = matches[1].replace(/['"]/g, '');
    }
  }
  
  const reader = res.body?.getReader();
  if (!reader) throw new Error('Impossible de lire le flux de téléchargement');
  
  let loaded = 0;
  const chunks: Uint8Array[] = [];
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.length;
      if (total > 0) {
        onProgress(loaded, total);
      }
    }
  }
  
  // Note: we're using Blob directly instead of Uint8Array array since it expects BlobPart
  // which includes Uint8Array instances in DOM, but TypeScript is stricter in some configurations.
  const blob = new Blob(chunks as unknown as BlobPart[]);
  const blobUrl = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}
