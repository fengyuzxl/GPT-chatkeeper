/* ChatKeeper - 删除快照
 *
 * 删除对话前把标题、时间、所属文件夹记录在本地，便于事后核对。
 * 快照不能通过接口恢复 ChatGPT 对话，只是本地台账。
 * 数据与主状态分开存储，避免主状态膨胀；受配额和保留条数限制。
 */
(() => {
  'use strict';

  const GPTM = (window.GPTM = window.GPTM || {});
  const INDEX_KEY = 'gptm_snap_index_v1';
  const RUN_PREFIX = 'gptm_snap_run_v1_';
  const MAX_RUNS = 20;
  const MAX_ITEMS_PER_RUN = 5000;
  const MAX_TOTAL_BYTES = 2.5 * 1024 * 1024;

  let index = { version: 1, runs: [] };
  let loaded = false;

  function encoderBytes(text) {
    try {
      return new TextEncoder().encode(text).length;
    } catch {
      return text.length * 2;
    }
  }

  function makeRunId() {
    return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function sortRuns(runs) {
    return runs.slice().sort((a, b) => b.createdAt - a.createdAt);
  }

  async function ensureLoaded() {
    if (loaded) return index;
    try {
      const data = await chrome.storage.local.get(INDEX_KEY);
      const saved = data && data[INDEX_KEY];
      if (saved && Array.isArray(saved.runs)) {
        index = {
          version: 1,
          runs: saved.runs.filter((run) => run && typeof run.id === 'string').slice(0, MAX_RUNS),
        };
      }
    } catch (err) {
      console.warn('[ChatKeeper] 读取快照索引失败', err);
    }
    loaded = true;
    return index;
  }

  async function persistIndex() {
    try {
      await chrome.storage.local.set({ [INDEX_KEY]: index });
      return true;
    } catch (err) {
      console.warn('[ChatKeeper] 保存快照索引失败', err);
      return false;
    }
  }

  function totalBytes() {
    return index.runs.reduce((sum, run) => sum + (Number(run.bytes) || 0), 0);
  }

  async function removeRunInternal(runId, pruneIndex) {
    try {
      await chrome.storage.local.remove(RUN_PREFIX + runId);
    } catch { /* ignore */ }
    if (pruneIndex !== false) {
      index.runs = index.runs.filter((run) => run.id !== runId);
    }
  }

  /** 腾出空间：按时间从旧到新删除，直到满足条数和字节预算。 */
  async function pruneFor(bytesToAdd) {
    const runs = sortRuns(index.runs);
    while (runs.length) {
      const oldest = runs[runs.length - 1];
      const overCount = runs.length + 1 > MAX_RUNS;
      const overBytes = totalBytes() + bytesToAdd > MAX_TOTAL_BYTES;
      if (!overCount && !overBytes) break;
      runs.pop();
      await removeRunInternal(oldest.id, false);
      index.runs = index.runs.filter((run) => run.id !== oldest.id);
    }
    await persistIndex();
  }

  /**
   * 保存一次删除快照。
   * @param {'delete'|'archive'} kind
   * @param {Array<{id:string,title:string,updateTime?:number,createTime?:number,folderPath?:string}>} items
   */
  async function capture(kind, items) {
    await ensureLoaded();
    const list = (Array.isArray(items) ? items : []).filter((item) => item && typeof item.id === 'string');
    if (!list.length) return { ok: false, error: 'empty' };

    const normalized = list.slice(0, MAX_ITEMS_PER_RUN).map((item) => ({
      id: item.id,
      title: String(item.title || '').slice(0, 300),
      updateTime: Number(item.updateTime) || 0,
      createTime: Number(item.createTime) || 0,
      folderPath: String(item.folderPath || '').slice(0, 200),
    }));

    const id = makeRunId();
    const createdAt = Date.now();
    let stored = normalized.slice();
    let truncated = list.length > MAX_ITEMS_PER_RUN;
    let payload;
    let bytes = 0;

    // 单个快照超过总预算时逐步裁剪，保证能保存
    for (;;) {
      payload = {
        id,
        createdAt,
        kind: kind === 'archive' ? 'archive' : 'delete',
        total: list.length,
        stored: stored.length,
        truncated,
        items: stored,
      };
      bytes = encoderBytes(JSON.stringify(payload));
      if (bytes <= MAX_TOTAL_BYTES || stored.length <= 50) break;
      stored = stored.slice(0, Math.max(50, Math.floor(stored.length * 0.7)));
      truncated = true;
    }

    try {
      await pruneFor(bytes);
      await chrome.storage.local.set({ [RUN_PREFIX + id]: payload });
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }

    const entry = {
      id,
      createdAt,
      kind: payload.kind,
      total: list.length,
      stored: stored.length,
      bytes,
      truncated,
    };
    index.runs.push(entry);
    index.runs = sortRuns(index.runs);
    await persistIndex();
    return { ok: true, run: entry };
  }

  async function listRuns() {
    await ensureLoaded();
    return sortRuns(index.runs);
  }

  async function getRun(runId) {
    try {
      const data = await chrome.storage.local.get(RUN_PREFIX + runId);
      return (data && data[RUN_PREFIX + runId]) || null;
    } catch {
      return null;
    }
  }

  async function removeRun(runId) {
    await ensureLoaded();
    await removeRunInternal(runId);
    await persistIndex();
    return true;
  }

  async function clear() {
    await ensureLoaded();
    const keys = index.runs.map((run) => RUN_PREFIX + run.id);
    if (keys.length) {
      try {
        await chrome.storage.local.remove(keys);
      } catch { /* ignore */ }
    }
    index = { version: 1, runs: [] };
    await persistIndex();
    return true;
  }

  function usage() {
    return {
      runs: index.runs.length,
      bytes: totalBytes(),
      maxRuns: MAX_RUNS,
      maxBytes: MAX_TOTAL_BYTES,
    };
  }

  GPTM.snapshots = {
    ready: ensureLoaded,
    capture,
    listRuns,
    getRun,
    removeRun,
    clear,
    usage,
    MAX_ITEMS_PER_RUN,
  };
})();
