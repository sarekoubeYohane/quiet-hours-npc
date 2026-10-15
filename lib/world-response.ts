// Do not expose response bodies: proxy/login HTML can contain sensitive details.
export class WorldResponseError extends Error {
  constructor(public readonly status: number, contentType: string) {
    super(`世界服務未回傳有效的 JSON 資料（HTTP ${status}，${contentType || '未提供 Content-Type'}）。請稍後按「重新載入」或「重試未完成操作」；尚未確認的操作會保留。`);
  }
}

export async function readWorldResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() || '';
  const invalid = () => new WorldResponseError(response.status, /^[-\w.+/]+$/.test(contentType) ? contentType : '未知格式');
  if (contentType !== 'application/json' && !/^application\/[\w.+-]+\+json$/.test(contentType)) throw invalid();
  let data: unknown;
  try { data = await response.json(); } catch { throw invalid(); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw invalid();
  return data as T;
}
