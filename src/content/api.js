/* ChatKeeper - ChatGPT 后端接口客户端
 *
 * 所有请求都在 chatgpt.com / chat.openai.com 页面内发起（同源 + 携带 Cookie），
 * 并复用页面已登录会话的 accessToken。扩展不读取、不保存任何账号凭据。
 */
(() => {
  'use strict';

  const GPTM = (window.GPTM = window.GPTM || {});
  const tr = (source, params) => (typeof GPTM.t === 'function' ? GPTM.t(source, params) : source);

  const SESSION_TTL = 25 * 60 * 1000; // accessToken 默认较长，这里保守缓存 25 分钟
  const LIST_PAGE_SIZE = 100;
  const LIST_PAGE_SIZE_FALLBACK = 28; // 网页端长期使用的分页大小，兼容不支持大 limit 的版本
  const MAX_PAGES = 200;

  let cachedToken = '';
  let tokenExpiresAt = 0;
  let cachedSession = null;
  // 记录每种操作当前可用的接口形态，命中后优先使用，避免每次失败重试
  const strategyIndex = { delete: 0, archive: 0 };

  class HttpError extends Error {
    constructor(message, status, retryAfterMs) {
      super(message);
      this.name = 'HttpError';
      this.status = status || 0;
      this.retryAfterMs = retryAfterMs || 0;
    }
  }

  function abortError() {
    const err = new Error(tr('操作已取消'));
    err.name = 'AbortError';
    return err;
  }

  function isAbortError(err) {
    return Boolean(err && err.name === 'AbortError');
  }

  function origin() {
    // 内容脚本运行在 ChatGPT 页面里，直接用当前源，兼容 chatgpt.com 与旧域名
    return location.origin;
  }

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) return reject(abortError());
      if (!ms) return resolve();
      const onAbort = () => {
        clearTimeout(timer);
        reject(abortError());
      };
      const timer = setTimeout(() => {
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  /** 对 429 / 5xx / 网络错误做指数退避重试；401 由 rawRequest 内部刷新 token 后重放。 */
  async function withRetry(fn, { retries = 2, signal } = {}) {
    let attempt = 0;
    for (;;) {
      try {
        return await fn();
      } catch (err) {
        if (isAbortError(err) || (signal && signal.aborted)) throw err;
        const status = err instanceof HttpError ? err.status : 0;
        const retriable = !(err instanceof HttpError) || status === 429 || status >= 500;
        if (!retriable || attempt >= retries) throw err;
        const wait = status === 429 && err.retryAfterMs
          ? Math.min(err.retryAfterMs, 20000)
          : Math.min(700 * 2 ** attempt + Math.random() * 250, 12000);
        attempt += 1;
        await sleep(wait, signal);
      }
    }
  }

  async function fetchSession() {
    const res = await fetch(`${origin()}/api/auth/session`, {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const hint = res.status === 401 || res.status === 403
        ? tr('无法读取登录会话，请确认当前页面已登录 ChatGPT。')
        : tr('读取登录会话失败（HTTP {status}）。', { status: res.status });
      throw new HttpError(hint, res.status);
    }
    const data = await res.json().catch(() => null);
    if (!data || typeof data.accessToken !== 'string' || !data.accessToken) {
      throw new HttpError(tr('未获取到 accessToken：可能未登录，或 ChatGPT 调整了会话接口。'), 401);
    }
    cachedToken = data.accessToken;
    tokenExpiresAt = Date.now() + SESSION_TTL;
    cachedSession = data;
    return data;
  }

  async function getToken(force = false) {
    if (!force && cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
    await fetchSession();
    return cachedToken;
  }

  async function rawRequest(path, { method = 'GET', body, signal, allowTokenRefresh = true } = {}) {
    if (signal && signal.aborted) throw abortError();
    const token = await getToken();
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(origin() + path, {
      method,
      credentials: 'include',
      cache: 'no-store',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });

    if (res.status === 401 && allowTokenRefresh) {
      await getToken(true);
      return rawRequest(path, { method, body, signal, allowTokenRefresh: false });
    }

    const text = await res.text().catch(() => '');
    if (!res.ok) {
      let detail = '';
      try {
        const parsed = JSON.parse(text);
        detail = parsed.detail || parsed.message || (parsed.error && parsed.error.message) || '';
      } catch {
        detail = text;
      }
      const retryAfter = Number(res.headers.get('retry-after'));
      const message = tr('HTTP {status}：{detail}', {
        status: res.status,
        detail: String(detail || '').slice(0, 180),
      });
      throw new HttpError(
        message,
        res.status,
        retryAfter > 0 ? retryAfter * 1000 : 0
      );
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  function request(path, opts = {}) {
    return withRetry(() => rawRequest(path, opts), { retries: opts.retries ?? 2, signal: opts.signal });
  }

  function toMs(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = raw.id || raw.conversation_id;
    if (!id) return null;
    const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : tr('无标题对话');
    const createTime = toMs(raw.create_time ?? raw.created_at);
    const updateTime = toMs(raw.update_time ?? raw.updated_at) || createTime;
    return {
      id: String(id),
      title,
      createTime,
      updateTime,
      isArchived: Boolean(raw.is_archived),
      isStarred: Boolean(raw.is_starred),
      source: 'api',
    };
  }

  function normalizePage(data) {
    if (Array.isArray(data)) return { items: data, total: null };
    if (data && Array.isArray(data.items)) {
      const total = Number.isFinite(Number(data.total)) && data.total !== null ? Number(data.total) : null;
      return { items: data.items, total };
    }
    return { items: [], total: null };
  }

  /**
   * 分页拉取全部对话。
   * @param {{ onPage?: (items: object[], total: number|null) => void, signal?: AbortSignal }} opts
   */
  async function listConversations({ onPage, signal } = {}) {
    const seen = new Set();
    const items = [];
    let offset = 0;
    let total = null;
    let pages = 0;
    let pageSize = LIST_PAGE_SIZE;

    while (pages < MAX_PAGES) {
      if (signal && signal.aborted) throw abortError();

      let data;
      try {
        data = await request(
          `/backend-api/conversations?offset=${offset}&limit=${pageSize}&order=updated`,
          { signal }
        );
      } catch (err) {
        // 某些版本会拒绝较大的 limit，退回网页端使用的 28 条分页
        const status = err instanceof HttpError ? err.status : 0;
        if (pageSize !== LIST_PAGE_SIZE_FALLBACK && (status === 400 || status === 404 || status === 422)) {
          pageSize = LIST_PAGE_SIZE_FALLBACK;
          continue;
        }
        throw err;
      }

      const page = normalizePage(data);
      if (!page.items.length) break;
      if (page.total !== null) total = page.total;

      let added = 0;
      for (const raw of page.items) {
        const item = normalizeItem(raw);
        if (!item || seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
        added += 1;
      }
      offset += page.items.length;
      pages += 1;
      if (typeof onPage === 'function') onPage(items.slice(), total);

      // 已经拿全了，或接口忽略了 offset 造成死循环
      if (total !== null && items.length >= total) break;
      if (added === 0) break;
      if (page.items.length < pageSize && total === null) break;
    }

    items.sort((a, b) => (b.updateTime || 0) - (a.updateTime || 0));
    return items;
  }

  /** 从 /c/<id> 链接中解析对话 ID，供原生侧边栏复用。 */
  function conversationIdFromHref(href) {
    if (typeof href !== 'string') return '';
    const match = href.match(/\/c\/([0-9a-zA-Z-]{8,120})/);
    return match ? match[1] : '';
  }

  /** 接口不可用时的兜底：优先从侧边栏 DOM 中抓取对话链接（无时间信息）。 */
  function listFromDom() {
    const map = new Map();
    let anchors = document.querySelectorAll('#history a[href*="/c/"], nav a[href*="/c/"], aside a[href*="/c/"]');
    if (!anchors.length) anchors = document.querySelectorAll('a[href*="/c/"]');
    for (const anchor of anchors) {
      const id = conversationIdFromHref(anchor.getAttribute('href') || '');
      if (!id || map.has(id)) continue;
      const rawTitle = (anchor.getAttribute('aria-label') || anchor.textContent || '').replace(/\s+/g, ' ').trim();
      map.set(id, {
        id,
        title: rawTitle || tr('无标题对话'),
        createTime: 0,
        updateTime: 0,
        isArchived: false,
        isStarred: false,
        source: 'dom',
      });
    }
    return Array.from(map.values());
  }

  /** 读取单个对话的完整内容，用于正文搜索。 */
  async function getConversation(id, { signal } = {}) {
    return request(`/backend-api/conversation/${encodeURIComponent(id)}`, { signal });
  }

  // 删除：优先用网页端「删除对话」实际调用的接口；其余为兼容不同版本的后备形态
  const DELETE_STRATEGIES = [
    {
      key: 'PATCH is_visible=false',
      run: (id, signal) => rawRequest(`/backend-api/conversation/${encodeURIComponent(id)}`, {
        method: 'PATCH', body: { is_visible: false }, signal,
      }),
    },
    {
      key: 'POST /hide',
      run: (id, signal) => rawRequest(`/backend-api/conversation/${encodeURIComponent(id)}/hide`, {
        method: 'POST', signal,
      }),
    },
    {
      key: 'PATCH is_hidden=true',
      run: (id, signal) => rawRequest(`/backend-api/conversation/${encodeURIComponent(id)}`, {
        method: 'PATCH', body: { is_hidden: true }, signal,
      }),
    },
    {
      key: 'DELETE /conversation',
      run: (id, signal) => rawRequest(`/backend-api/conversation/${encodeURIComponent(id)}`, {
        method: 'DELETE', signal,
      }),
    },
  ];

  const ARCHIVE_STRATEGIES = [
    {
      key: 'PATCH is_archived=true',
      run: (id, signal) => rawRequest(`/backend-api/conversation/${encodeURIComponent(id)}`, {
        method: 'PATCH', body: { is_archived: true }, signal,
      }),
    },
    {
      key: 'POST /archive',
      run: (id, signal) => rawRequest(`/backend-api/conversation/${encodeURIComponent(id)}/archive`, {
        method: 'POST', signal,
      }),
    },
    {
      key: 'PATCH archived=true',
      run: (id, signal) => rawRequest(`/backend-api/conversation/${encodeURIComponent(id)}`, {
        method: 'PATCH', body: { archived: true }, signal,
      }),
    },
  ];

  async function runStrategy(kind, id, signal) {
    const list = kind === 'delete' ? DELETE_STRATEGIES : ARCHIVE_STRATEGIES;
    const start = strategyIndex[kind] || 0;
    let lastError = null;

    for (let i = 0; i < list.length; i += 1) {
      const index = (start + i) % list.length;
      if (signal && signal.aborted) throw abortError();
      try {
        await withRetry(() => list[index].run(id, signal), { retries: 1, signal });
        strategyIndex[kind] = index;
        return list[index].key;
      } catch (err) {
        if (isAbortError(err) || (signal && signal.aborted)) throw err;
        lastError = err;
        // 权限/登录问题换接口形态也没用，直接上报
        if (err instanceof HttpError && (err.status === 401 || err.status === 403)) throw err;
      }
    }
    throw lastError || new Error(tr('操作失败，接口未返回可识别的结果'));
  }

  async function deleteConversation(id, { signal } = {}) {
    return runStrategy('delete', id, signal);
  }

  async function archiveConversation(id, { signal } = {}) {
    return runStrategy('archive', id, signal);
  }

  function getSessionInfo() {
    if (!cachedSession) return null;
    const user = cachedSession.user || {};
    return {
      email: user.email || '',
      name: user.name || '',
      plan: (user.plan || (cachedSession.account && cachedSession.account.plan_type) || '').toString(),
    };
  }

  function getStrategyInfo() {
    return {
      delete: DELETE_STRATEGIES[strategyIndex.delete].key,
      archive: ARCHIVE_STRATEGIES[strategyIndex.archive].key,
    };
  }

  function resetStrategies() {
    strategyIndex.delete = 0;
    strategyIndex.archive = 0;
    cachedToken = '';
    tokenExpiresAt = 0;
  }

  GPTM.api = {
    HttpError,
    isAbortError,
    fetchSession,
    getSessionInfo,
    listConversations,
    listFromDom,
    getConversation,
    conversationIdFromHref,
    deleteConversation,
    archiveConversation,
    getStrategyInfo,
    resetStrategies,
  };
})();
