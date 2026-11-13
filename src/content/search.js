/* ChatKeeper - 对话正文搜索
 *
 * ChatGPT 没有可用的服务端全文搜索接口，只能逐个读取会话内容。
 * 因此：只在用户主动点击时搜索、固定低并发、显示进度、可取消，
 * 文本索引只存在内存中，不写入磁盘。
 */
(() => {
  'use strict';

  const GPTM = (window.GPTM = window.GPTM || {});
  const CONCURRENCY = 2;
  const DELAY_MS = 280;
  const MAX_ENTRIES = 800;
  const MAX_TOTAL_CHARS = 12_000_000;
  const MAX_PER_CONVERSATION_CHARS = 60_000;
  const CACHE_TTL = 24 * 60 * 60 * 1000;

  /** @type {Map<string, {segments: Array<{role:string,text:string}>, lower:string, title:string, updateTime:number, fetchedAt:number, chars:number, lastUsed:number}>} */
  const cache = new Map();
  let totalChars = 0;
  let cacheHits = 0;
  let fetchCount = 0;

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) {
        const err = new Error('aborted');
        err.name = 'AbortError';
        return reject(err);
      }
      if (!ms) return resolve();
      const onAbort = () => {
        clearTimeout(timer);
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      };
      const timer = setTimeout(() => {
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  function collapse(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function extractText(data, fallbackTitle) {
    const mapping = data && data.mapping && typeof data.mapping === 'object' ? data.mapping : {};
    const nodes = Object.values(mapping)
      .filter((node) => node && node.message)
      .sort((a, b) => {
        const at = Number(a.message.create_time) || 0;
        const bt = Number(b.message.create_time) || 0;
        return at - bt;
      });

    const segments = [];
    let chars = 0;

    for (const node of nodes) {
      const message = node.message;
      const role = message.author && message.author.role;
      if (role !== 'user' && role !== 'assistant') continue;
      const content = message.content || {};
      const parts = Array.isArray(content.parts) ? content.parts : [];
      const texts = [];
      for (const part of parts) {
        if (typeof part === 'string') texts.push(part);
        else if (part && typeof part.text === 'string') texts.push(part.text);
      }
      if (!texts.length && typeof content.text === 'string') texts.push(content.text);
      const text = collapse(texts.join(' '));
      if (!text) continue;
      const room = MAX_PER_CONVERSATION_CHARS - chars;
      if (room <= 0) break;
      const slice = text.slice(0, room);
      segments.push({ role, text: slice });
      chars += slice.length;
    }

    const title = (data && typeof data.title === 'string' && data.title) || fallbackTitle || '';
    const lower = segments.map((segment) => segment.text.toLowerCase()).join('\n');
    return { segments, lower, title, chars };
  }

  function evictIfNeeded() {
    while (cache.size > MAX_ENTRIES || (totalChars > MAX_TOTAL_CHARS && cache.size > 1)) {
      let oldestId = null;
      let oldestAt = Infinity;
      for (const [id, entry] of cache.entries()) {
        if (entry.lastUsed < oldestAt) {
          oldestAt = entry.lastUsed;
          oldestId = id;
        }
      }
      if (!oldestId) break;
      const entry = cache.get(oldestId);
      totalChars -= entry.chars;
      cache.delete(oldestId);
    }
  }

  async function ensureIndexed(item, signal) {
    const cached = cache.get(item.id);
    const freshEnough = cached
      && (!item.updateTime || cached.updateTime >= item.updateTime)
      && Date.now() - cached.fetchedAt < CACHE_TTL;
    if (freshEnough) {
      cached.lastUsed = Date.now();
      cacheHits += 1;
      return cached;
    }

    const data = await GPTM.api.getConversation(item.id, { signal });
    const parsed = extractText(data, item.title);
    const entry = {
      segments: parsed.segments,
      lower: parsed.lower,
      title: parsed.title || item.title,
      updateTime: item.updateTime || 0,
      fetchedAt: Date.now(),
      chars: parsed.chars,
      lastUsed: Date.now(),
    };

    if (cached) totalChars -= cached.chars;
    cache.set(item.id, entry);
    totalChars += entry.chars;
    fetchCount += 1;
    evictIfNeeded();
    return entry;
  }

  function findMatches(entry, query) {
    const lowerQuery = query.toLowerCase();
    if (!lowerQuery) return null;
    let count = 0;
    let snippet = '';
    let role = '';

    for (const segment of entry.segments) {
      const lower = segment.text.toLowerCase();
      let from = 0;
      for (;;) {
        const index = lower.indexOf(lowerQuery, from);
        if (index < 0) break;
        count += 1;
        if (!snippet) {
          const start = Math.max(0, index - 70);
          const end = Math.min(segment.text.length, index + lowerQuery.length + 70);
          snippet = (start > 0 ? '…' : '')
            + segment.text.slice(start, end)
            + (end < segment.text.length ? '…' : '');
          role = segment.role;
        }
        from = index + lowerQuery.length;
        if (count >= 999) break;
      }
    }

    if (!count) return null;
    return { count, snippet: collapse(snippet), role };
  }

  /**
   * 逐条扫描对话正文。
   * @param {object} options
   * @param {Array<{id:string,title:string,updateTime?:number}>} options.items
   * @param {string} options.query
   * @param {AbortSignal} options.signal
   * @param {(id:string, info:{count:number,snippet:string,role:string}) => void} [options.onMatch]
   * @param {(progress:object) => void} [options.onProgress]
   */
  async function run({ items, query, signal, onMatch, onProgress }) {
    const list = Array.isArray(items) ? items : [];
    const total = list.length;
    let cursor = 0;
    let scanned = 0;
    let matched = 0;
    let failed = 0;
    let missing = 0;
    let consecutiveFailures = 0;
    let fatal = null;
    cacheHits = 0;
    fetchCount = 0;

    const emit = (extra) => {
      if (typeof onProgress !== 'function') return;
      onProgress(Object.assign({
        scanned,
        total,
        matches: matched,
        failed,
        missing,
        indexedChars: totalChars,
        cacheHits,
        fetches: fetchCount,
        fatal: fatal ? fatal.message : '',
      }, extra || {}));
    };

    emit({ phase: 'start' });

    async function worker() {
      for (;;) {
        if ((signal && signal.aborted) || fatal) return;
        const index = cursor;
        cursor += 1;
        if (index >= list.length) return;
        const item = list[index];

        try {
          const entry = await ensureIndexed(item, signal);
          const info = findMatches(entry, query);
          if (info) {
            matched += 1;
            if (typeof onMatch === 'function') onMatch(item.id, info);
          }
          consecutiveFailures = 0;
          scanned += 1;
          emit();
        } catch (err) {
          if (err && err.name === 'AbortError') return;
          const status = err && err.status ? err.status : 0;
          if (status === 401 || status === 403) {
            fatal = err;
            return;
          }
          if (status === 404 || status === 410) missing += 1;
          else failed += 1;
          consecutiveFailures += 1;
          scanned += 1;
          emit();
          if (consecutiveFailures >= 8) {
            fatal = new Error('连续多次请求失败，已停止正文搜索');
            return;
          }
        }

        if (signal && signal.aborted) return;
        try {
          await sleep(DELAY_MS + Math.random() * 120, signal);
        } catch {
          return;
        }
      }
    }

    const workers = Math.min(CONCURRENCY, list.length);
    await Promise.all(Array.from({ length: workers }, () => worker()));

    emit({ phase: 'done' });
    return {
      scanned,
      total,
      matched,
      failed,
      missing,
      aborted: Boolean((signal && signal.aborted) || fatal),
      fatal: fatal ? fatal.message : '',
      indexedChars: totalChars,
      cacheHits,
      fetches: fetchCount,
    };
  }

  function clearCache() {
    cache.clear();
    totalChars = 0;
  }

  function stats() {
    return { entries: cache.size, chars: totalChars };
  }

  GPTM.search = {
    run,
    clearCache,
    stats,
    findMatches,
    extractText,
  };
})();
