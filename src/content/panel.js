/* ChatKeeper - 页面内面板 v2
 *
 * 面板挂载在 Shadow DOM 中，样式与 ChatGPT 页面完全隔离。
 * 功能：列表 / 递归文件夹 / 批量删除归档 / 智能选择 / 删除快照 /
 *       正文搜索 / 导入导出 / 中英双语 / 原生侧边栏联动。
 */
(() => {
  'use strict';

  const GPTM = (window.GPTM = window.GPTM || {});
  const api = GPTM.api;
  const store = GPTM.store;
  const snapshots = GPTM.snapshots;
  const search = GPTM.search;
  const t = (source, params) => GPTM.i18n.t(source, params);

  const VERSION = '2.2.0';
  const CHUNK = 200;
  const REFRESH_TTL = 2 * 60 * 1000;
  const SEARCH_MAX_SCOPE = 2000;

  const SVG = {
    bubble: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.5 1.4 4.7 3.6 6.2-.1.9-.5 2.2-1.5 3.4 1.8-.2 3.4-.9 4.5-1.7 1.1.3 2.2.5 3.4.5 5.5 0 10-3.6 10-8.4S17.5 3 12 3z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 4v7h-7"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-4.2 3.4A1 1 0 0 1 3.2 18.6V6.5z"/></svg>',
  };

  const state = {
    open: false,
    mounted: false,
    loading: false,
    loadError: '',
    items: [],
    source: 'api',
    fetchedAt: 0,
    session: null,
    selected: new Set(),
    filter: { q: '', range: 'all', sort: 'updated-desc', folder: 'all' },
    rendered: CHUNK,
    collapsedFolders: new Set(),
    running: null,
    abort: null,
    bodySearch: {
      active: false,
      query: '',
      matches: new Map(),
      scanned: 0,
      total: 0,
      running: false,
      done: false,
      cancelled: false,
      error: '',
      cacheHits: 0,
    },
    searchAbort: null,
    snapshotCount: 0,
    nativeBarCount: 0,
    lastFocus: null,
  };

  let host = null;
  let shadow = null;
  const el = {};
  let dragIds = [];
  let folderDragId = null;
  let searchTimer = null;
  let searchRenderTimer = null;
  let themeObserver = null;
  let menuAnchor = null;
  let menuRaf = 0;

  /* ---------------- 工具 ---------------- */

  function esc(value) {
    return String(value).replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  function truncate(text, max) {
    const str = String(text || '');
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  }

  function fmtTime(ts) {
    if (!ts) return t('时间未知');
    const date = new Date(ts);
    const now = new Date();
    const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((dayStart(now) - dayStart(date)) / 86400000);
    const hhmm = String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
    if (days === 0) return t('今天 {time}', { time: hhmm });
    if (days === 1) return t('昨天');
    if (days > 1 && days < 7) return t('{count} 天前', { count: days });
    if (date.getFullYear() === now.getFullYear()) return t('{month}月{day}日', { month: date.getMonth() + 1, day: date.getDate() });
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function fmtAgo(ts) {
    if (!ts) return '';
    const seconds = Math.floor((Date.now() - ts) / 1000);
    if (seconds < 45) return t('刚刚');
    if (seconds < 3600) return t('{count} 分钟前', { count: Math.floor(seconds / 60) });
    if (seconds < 86400) return t('{count} 小时前', { count: Math.floor(seconds / 3600) });
    return t('{count} 天前', { count: Math.floor(seconds / 86400) });
  }

  function fmtDateTime(ts) {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString(GPTM.i18n.getLanguage() === 'zh' ? 'zh-CN' : 'en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return fmtTime(ts);
    }
  }

  function fmtBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return value + ' B';
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
    return (value / (1024 * 1024)).toFixed(2) + ' MB';
  }

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

  function selectedIds() {
    const existing = new Set(state.items.map((item) => item.id));
    const out = [];
    for (const id of state.selected) {
      if (existing.has(id)) out.push(id);
    }
    return out;
  }

  function getSearchScope() {
    const { range, folder } = state.filter;
    const cutoff = range === 'all' ? 0 : Date.now() - Number(range) * 86400000;
    const folders = store.getFolders();
    const validFolderIds = new Set(folders.map((item) => item.id));
    const assignments = store.getState().assignments;
    const allowed = folder !== 'all' && folder !== 'none' ? store.getDescendantIds(folder) : null;

    return state.items.filter((item) => {
      if (cutoff) {
        const ts = item.updateTime || item.createTime;
        if (!ts || ts < cutoff) return false;
      }
      const folderId = assignments[item.id] && validFolderIds.has(assignments[item.id])
        ? assignments[item.id]
        : null;
      if (folder === 'none') return !folderId;
      if (allowed) return Boolean(folderId && allowed.has(folderId));
      return true;
    });
  }

  function getView() {
    const { q, range, sort, folder } = state.filter;
    const cutoff = range === 'all' ? 0 : Date.now() - Number(range) * 86400000;
    const folders = store.getFolders();
    const validFolderIds = new Set(folders.map((item) => item.id));
    const assignments = store.getState().assignments;
    const allowed = folder !== 'all' && folder !== 'none' ? store.getDescendantIds(folder) : null;
    const bodySearch = state.bodySearch;
    const bodyActive = bodySearch.active && bodySearch.query && q === bodySearch.query;

    let list = state.items.filter((item) => {
      if (!bodyActive && q && !item.title.toLowerCase().includes(q)) return false;
      if (cutoff) {
        const ts = item.updateTime || item.createTime;
        if (!ts || ts < cutoff) return false;
      }
      const folderId = assignments[item.id] && validFolderIds.has(assignments[item.id])
        ? assignments[item.id]
        : null;
      if (folder === 'none') {
        if (folderId) return false;
      } else if (allowed) {
        if (!folderId || !allowed.has(folderId)) return false;
      }
      return true;
    });

    if (bodyActive) {
      list = list.filter((item) => item.title.toLowerCase().includes(q) || bodySearch.matches.has(item.id));
    }

    if (sort === 'updated-asc') {
      list.sort((a, b) => (a.updateTime || Number.MAX_SAFE_INTEGER) - (b.updateTime || Number.MAX_SAFE_INTEGER));
    } else if (sort === 'title') {
      list.sort((a, b) => a.title.localeCompare(b.title, GPTM.i18n.getLanguage() === 'zh' ? 'zh-CN' : 'en'));
    } else {
      list.sort((a, b) => (b.updateTime || 0) - (a.updateTime || 0));
    }
    return list;
  }

  function highlightSnippet(text, query) {
    const source = String(text || '');
    const needle = String(query || '');
    if (!needle) return esc(source);
    const lower = source.toLowerCase();
    const lowerNeedle = needle.toLowerCase();
    let out = '';
    let index = 0;
    for (;;) {
      const found = lower.indexOf(lowerNeedle, index);
      if (found < 0) {
        out += esc(source.slice(index));
        break;
      }
      out += esc(source.slice(index, found));
      out += '<mark>' + esc(source.slice(found, found + needle.length)) + '</mark>';
      index = found + needle.length;
    }
    return out;
  }

  /* ---------------- 挂载 ---------------- */

  function mount() {
    if (state.mounted) return;
    host = document.createElement('div');
    host.id = 'gptm-root';
    host.lang = GPTM.i18n.getLanguage() === 'zh' ? 'zh-CN' : 'en';
    shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = GPTM.CSS;
    shadow.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <button class="fab" id="gptm-fab" data-i18n-title="ChatKeeper（Alt+Shift+M）" data-i18n-aria="ChatKeeper" aria-label="ChatKeeper">
        ${SVG.bubble}
      </button>

      <div class="overlay" id="gptm-overlay" hidden>
        <div class="backdrop" id="gptm-backdrop"></div>
        <div class="panel" id="gptm-panel" role="dialog" aria-modal="true" aria-label="ChatKeeper">
          <header class="panel-head">
            <div class="brand">
              <span class="logo">${SVG.bubble}</span>
              ChatKeeper
              <span class="ver">v${VERSION}</span>
            </div>
            <div class="head-actions">
              <button class="icon-btn" id="gptm-refresh" data-i18n-title="刷新">${SVG.refresh}<span data-i18n="刷新">刷新</span></button>
              <button class="icon-btn" id="gptm-settings" data-i18n-title="设置">${SVG.gear}</button>
              <button class="icon-btn" id="gptm-close" data-i18n-title="关闭">${SVG.close}</button>
            </div>
          </header>

          <div class="panel-body">
            <aside class="sidebar">
              <div class="side-title" data-i18n="文件夹">文件夹</div>
              <ul class="folder-list" id="gptm-folder-list"></ul>
              <button class="side-new" id="gptm-new-folder">＋ <span data-i18n="新建文件夹">新建文件夹</span></button>
              <button class="side-btn" id="gptm-prompts-open">
                <span data-i18n="提示词库">提示词库</span>
              </button>
              <button class="side-btn" id="gptm-snap-open">
                <span data-i18n="删除快照">删除快照</span>
                <span class="badge" id="gptm-snap-count">0</span>
              </button>
              <div class="side-foot" id="gptm-account"></div>
            </aside>

            <section class="main">
              <div class="banner" id="gptm-banner" hidden></div>
              <div class="toolbar">
                <div class="search-wrap">
                  ${SVG.search}
                  <input class="search" id="gptm-search" type="search" data-i18n-placeholder="搜索对话标题…" autocomplete="off" spellcheck="false" />
                </div>
                <button class="btn search-btn" id="gptm-body-search" data-i18n="正文搜索" data-i18n-title="搜索对话正文">正文搜索</button>
                <select class="select-sm" id="gptm-range" data-i18n-title="按更新时间筛选">
                  <option value="all" data-i18n="全部时间">全部时间</option>
                  <option value="7" data-i18n="最近 7 天">最近 7 天</option>
                  <option value="30" data-i18n="最近 30 天">最近 30 天</option>
                  <option value="90" data-i18n="最近 90 天">最近 90 天</option>
                </select>
                <select class="select-sm" id="gptm-sort" data-i18n-title="排序方式">
                  <option value="updated-desc" data-i18n="最近更新">最近更新</option>
                  <option value="updated-asc" data-i18n="最早更新">最早更新</option>
                  <option value="title" data-i18n="标题 A→Z">标题 A→Z</option>
                </select>
              </div>

              <div class="bulkbar">
                <label class="checkline"><input type="checkbox" id="gptm-select-all" /> <span data-i18n="全选">全选</span></label>
                <span class="sel-count" id="gptm-sel-count" data-i18n="已选 0 项">已选 0 项</span>
                <button class="btn btn-quiet" id="gptm-smart" data-i18n="智能选择" data-i18n-title="按条件选择">智能选择</button>
                <div class="bulk-actions">
                  <button class="btn" id="gptm-assign" data-i18n="移动到文件夹" data-i18n-title="移动到文件夹" disabled>移动到文件夹</button>
                  <button class="btn" id="gptm-unassign" data-i18n="移出" data-i18n-title="移出" disabled>移出</button>
                  <button class="btn" id="gptm-archive" data-i18n="归档" data-i18n-title="归档" disabled>归档</button>
                  <button class="btn btn-danger" id="gptm-delete" data-i18n="删除" data-i18n-title="删除" disabled>删除</button>
                </div>
              </div>

              <div class="progress" id="gptm-progress" hidden>
                <div class="bar"><i id="gptm-progress-bar"></i></div>
                <span class="ptext" id="gptm-progress-text"></span>
                <button class="btn btn-quiet" id="gptm-cancel" data-i18n="取消">取消</button>
              </div>

              <div class="progress search" id="gptm-search-status" hidden>
                <div class="bar"><i id="gptm-search-bar"></i></div>
                <span class="ptext" id="gptm-search-text"></span>
                <button class="btn btn-quiet" id="gptm-search-action"></button>
              </div>

              <div class="list" id="gptm-list" tabindex="0"></div>
              <div class="empty" id="gptm-empty" hidden>
                ${SVG.empty}
                <div class="big" id="gptm-empty-title"></div>
                <div class="hint" id="gptm-empty-hint"></div>
                <button class="btn" id="gptm-empty-action" hidden></button>
              </div>
            </section>
          </div>

          <footer class="panel-foot">
            <span id="gptm-status" data-i18n="准备就绪">准备就绪</span>
            <span id="gptm-footer">v${VERSION}</span>
          </footer>
        </div>
      </div>

      <div class="native-bar" id="gptm-native-bar" hidden>
        <span class="ncount" id="gptm-native-count"></span>
        <span class="ntext" id="gptm-native-text"></span>
        <button class="btn" id="gptm-native-move" data-i18n="移动到文件夹">移动到文件夹</button>
        <button class="btn" id="gptm-native-archive" data-i18n="归档">归档</button>
        <button class="btn btn-danger" id="gptm-native-delete" data-i18n="删除">删除</button>
        <button class="btn btn-quiet" id="gptm-native-clear" data-i18n="清除">清除</button>
      </div>

      <div class="menu" id="gptm-menu" hidden></div>
      <div class="modal-layer" id="gptm-modal" hidden></div>
      <div class="toasts" id="gptm-toasts"></div>
    `;
    shadow.appendChild(wrapper);

    const ids = {
      fab: 'gptm-fab', overlay: 'gptm-overlay', backdrop: 'gptm-backdrop', panel: 'gptm-panel',
      refresh: 'gptm-refresh', settings: 'gptm-settings', close: 'gptm-close',
      folderList: 'gptm-folder-list', newFolder: 'gptm-new-folder',
      promptsOpen: 'gptm-prompts-open',
      snapOpen: 'gptm-snap-open', snapCount: 'gptm-snap-count', account: 'gptm-account',
      search: 'gptm-search', bodySearch: 'gptm-body-search', range: 'gptm-range', sort: 'gptm-sort',
      selectAll: 'gptm-select-all', selCount: 'gptm-sel-count', smart: 'gptm-smart',
      assign: 'gptm-assign', unassign: 'gptm-unassign', archive: 'gptm-archive', del: 'gptm-delete',
      progress: 'gptm-progress', progressBar: 'gptm-progress-bar', progressText: 'gptm-progress-text',
      cancel: 'gptm-cancel',
      searchStatus: 'gptm-search-status', searchBar: 'gptm-search-bar',
      searchText: 'gptm-search-text', searchAction: 'gptm-search-action',
      list: 'gptm-list', empty: 'gptm-empty', emptyTitle: 'gptm-empty-title',
      emptyHint: 'gptm-empty-hint', emptyAction: 'gptm-empty-action',
      status: 'gptm-status', footer: 'gptm-footer', banner: 'gptm-banner',
      nativeBar: 'gptm-native-bar', nativeCount: 'gptm-native-count', nativeText: 'gptm-native-text',
      nativeMove: 'gptm-native-move', nativeArchive: 'gptm-native-archive',
      nativeDelete: 'gptm-native-delete', nativeClear: 'gptm-native-clear',
      menu: 'gptm-menu', modalLayer: 'gptm-modal', toasts: 'gptm-toasts',
    };
    for (const [key, id] of Object.entries(ids)) el[key] = shadow.getElementById(id);

    GPTM.i18n.applyDom(shadow);
    host.lang = GPTM.i18n.getLanguage() === 'zh' ? 'zh-CN' : 'en';

    const cached = store.getCache();
    state.items = cached.items.slice();
    state.fetchedAt = cached.fetchedAt;
    state.source = cached.source;

    bindEvents();
    applyTheme();
    applySettingsUI();
    renderFolders();
    renderList();
    updateBulkUI();
    renderAccount();
    renderSearchStatus();
    refreshSnapshotBadge();

    if (store.isReadOnly()) {
      el.banner.hidden = false;
      el.banner.textContent = t('本地数据由更新版本创建，当前版本只读，修改不会被保存。');
    }

    if (state.items.length) {
      setStatus(t('已加载 {count} 个对话 · {when}', { count: state.items.length, when: fmtAgo(state.fetchedAt) || t('刚刚') }));
    } else {
      setStatus(t('准备就绪'));
    }

    document.documentElement.appendChild(host);
    state.mounted = true;
  }

  /* ---------------- 事件绑定 ---------------- */

  function bindEvents() {
    el.fab.addEventListener('click', open);
    el.backdrop.addEventListener('click', close);
    el.close.addEventListener('click', close);
    el.refresh.addEventListener('click', () => refresh());
    el.settings.addEventListener('click', openSettingsModal);
    el.newFolder.addEventListener('click', () => openFolderModal());
    el.promptsOpen.addEventListener('click', () => {
      if (GPTM.prompts && typeof GPTM.prompts.open === 'function') GPTM.prompts.open();
      else toast(t('提示词模块未加载'), 'err');
    });
    el.snapOpen.addEventListener('click', openSnapshotsModal);
    el.search.addEventListener('input', onSearchInput);
    el.bodySearch.addEventListener('click', startBodySearchFlow);
    el.range.addEventListener('change', () => {
      state.filter.range = el.range.value;
      state.rendered = CHUNK;
      renderList({ resetScroll: true });
      updateBulkUI();
    });
    el.sort.addEventListener('change', () => {
      state.filter.sort = el.sort.value;
      state.rendered = CHUNK;
      renderList({ resetScroll: true });
      updateBulkUI();
    });
    el.selectAll.addEventListener('change', onSelectAll);
    el.smart.addEventListener('click', openSmartSelectModal);
    el.list.addEventListener('click', onListClick);
    el.list.addEventListener('change', onListChange);
    el.list.addEventListener('dragstart', onDragStart);
    el.list.addEventListener('dragend', onDragEnd);
    el.folderList.addEventListener('click', onFolderClick);
    el.folderList.addEventListener('dragstart', onFolderDragStart);
    el.folderList.addEventListener('dragend', onFolderDragEnd);
    el.folderList.addEventListener('dragover', onFolderDragOver);
    el.folderList.addEventListener('dragleave', onFolderDragLeave);
    el.folderList.addEventListener('drop', onFolderDrop);
    el.assign.addEventListener('click', () => openFolderPickerFor(selectedIds(), el.assign));
    el.unassign.addEventListener('click', () => assignIds(selectedIds(), null));
    el.archive.addEventListener('click', () => confirmBulk('archive', selectedIds()));
    el.del.addEventListener('click', () => confirmBulk('delete', selectedIds()));
    el.cancel.addEventListener('click', () => {
      if (!state.abort) return;
      el.cancel.disabled = true;
      state.abort.abort();
      setStatus(t('正在取消…'));
    });
    el.searchAction.addEventListener('click', () => {
      if (state.bodySearch.running) cancelBodySearch();
      else clearBodySearch();
    });
    el.emptyAction.addEventListener('click', () => {
      const action = el.emptyAction._action;
      if (typeof action === 'function') action();
    });
    el.modalLayer.addEventListener('click', (event) => {
      if (event.target === el.modalLayer) closeModal();
    });

    el.nativeMove.addEventListener('click', () => dispatchNativeCommand('move'));
    el.nativeArchive.addEventListener('click', () => dispatchNativeCommand('archive'));
    el.nativeDelete.addEventListener('click', () => dispatchNativeCommand('delete'));
    el.nativeClear.addEventListener('click', () => dispatchNativeCommand('clear'));

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('gptm:language', onLanguageChanged);

    if (document.documentElement) {
      themeObserver = new MutationObserver(applyTheme);
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    }
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    } catch { /* ignore */ }
  }

  function dispatchNativeCommand(command) {
    try {
      window.dispatchEvent(new CustomEvent('gptm:native-command', { detail: { command } }));
    } catch { /* ignore */ }
  }

  function onSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const q = el.search.value.trim().toLowerCase();
      const searchChanged = state.bodySearch.active && q !== state.bodySearch.query;
      state.filter.q = q;
      state.rendered = CHUNK;
      if (searchChanged) clearBodySearch({ silent: true });
      renderList({ resetScroll: true });
      updateBulkUI();
    }, 160);
  }

  function onSelectAll() {
    const ids = getView().map((item) => item.id);
    if (el.selectAll.checked) ids.forEach((id) => state.selected.add(id));
    else ids.forEach((id) => state.selected.delete(id));
    updateBulkUI();
  }

  function onListClick(event) {
    const more = event.target.closest('[data-more]');
    if (more) {
      event.preventDefault();
      event.stopPropagation();
      openRowMenu(more.dataset.more, more);
      return;
    }
    if (event.target.closest('a.row-title')) return;
    if (event.target.matches('input[type="checkbox"]')) return;
    const row = event.target.closest('.row');
    if (!row) return;
    toggleSelected(row.dataset.id);
  }

  function onListChange(event) {
    const checkbox = event.target.closest('input[data-check]');
    if (!checkbox) return;
    setSelected(checkbox.dataset.check, checkbox.checked);
  }

  function onDragStart(event) {
    const row = event.target.closest('.row');
    if (!row) return;
    const id = row.dataset.id;
    const existing = new Set(state.items.map((item) => item.id));
    dragIds = state.selected.has(id)
      ? Array.from(state.selected).filter((itemId) => existing.has(itemId))
      : [id];
    if (!dragIds.length) dragIds = [id];
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData('text/plain', dragIds.join(','));
    row.classList.add('dragging');
  }

  function onDragEnd() {
    dragIds = [];
    folderDragId = null;
    shadow.querySelectorAll('.row.dragging').forEach((row) => row.classList.remove('dragging'));
    shadow.querySelectorAll('.folder.drop-hover, .folder.drop-invalid').forEach((node) => {
      node.classList.remove('drop-hover');
      node.classList.remove('drop-invalid');
    });
  }

  function onFolderDragStart(event) {
    const item = event.target.closest('[data-folder-drag]');
    if (!item) return;
    if (event.target.closest('button')) {
      event.preventDefault();
      return;
    }
    folderDragId = item.dataset.folderDrag;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', folderDragId);
    item.classList.add('dragging');
  }

  function onFolderDragEnd() {
    folderDragId = null;
    shadow.querySelectorAll('.folder.dragging').forEach((node) => node.classList.remove('dragging'));
    shadow.querySelectorAll('.folder.drop-hover, .folder.drop-invalid').forEach((node) => {
      node.classList.remove('drop-hover');
      node.classList.remove('drop-invalid');
    });
  }

  function folderDropTarget(event) {
    const target = event.target.closest ? event.target.closest('[data-drop]') : null;
    if (!target || !el.folderList.contains(target)) return null;
    if (!dragIds.length && !folderDragId) return null;
    return target;
  }

  function isInvalidFolderDrop(targetId) {
    if (!folderDragId || !targetId || targetId === 'none') return false;
    if (targetId === 'all') return false;
    if (targetId === folderDragId) return true;
    return store.getDescendantIds(folderDragId).has(targetId);
  }

  function onFolderDragOver(event) {
    const target = folderDropTarget(event);
    if (!target) return;
    if (folderDragId && target.dataset.drop === 'none') return;
    if (!folderDragId && target.dataset.drop === 'all') return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const invalid = isInvalidFolderDrop(target.dataset.drop);
    shadow.querySelectorAll('.folder.drop-hover, .folder.drop-invalid').forEach((node) => {
      if (node !== target) {
        node.classList.remove('drop-hover');
        node.classList.remove('drop-invalid');
      }
    });
    target.classList.add(invalid ? 'drop-invalid' : 'drop-hover');
  }

  function onFolderDragLeave(event) {
    const target = event.target.closest ? event.target.closest('[data-drop]') : null;
    if (!target) return;
    if (event.relatedTarget && target.contains(event.relatedTarget)) return;
    target.classList.remove('drop-hover');
    target.classList.remove('drop-invalid');
  }

  function onFolderDrop(event) {
    const target = folderDropTarget(event);
    if (!target) return;
    event.preventDefault();
    const drop = target.dataset.drop;
    shadow.querySelectorAll('.folder.drop-hover, .folder.drop-invalid').forEach((node) => {
      node.classList.remove('drop-hover');
      node.classList.remove('drop-invalid');
    });

    if (folderDragId) {
      const folderId = folderDragId;
      folderDragId = null;
      if (drop === 'none') return;
      if (drop === 'all') {
        if (store.moveFolder(folderId, null)) {
          expandTo(null);
          renderFolders();
          renderList();
          refreshNative();
        } else {
          toast(t('不能移动到自身或子文件夹'), 'warn');
        }
        return;
      }
      if (store.moveFolder(folderId, drop)) {
        state.collapsedFolders.delete(drop);
        renderFolders();
        renderList();
        updateBulkUI();
        refreshNative();
        toast(t('文件夹已移动'), 'ok');
      } else {
        toast(t('不能移动到自身或子文件夹'), 'warn');
      }
      return;
    }

    if (!folderDragId && drop === 'all') {
      onDragEnd();
      return;
    }
    const ids = dragIds.slice();
    onDragEnd();
    const folderId = drop === 'none' ? null : drop;
    assignIds(ids, folderId);
  }

  function onFolderClick(event) {
    const more = event.target.closest('[data-folder-more]');
    if (more) {
      event.stopPropagation();
      openFolderMenu(more.dataset.folderMore, more);
      return;
    }
    const chev = event.target.closest('[data-toggle]');
    if (chev) {
      event.stopPropagation();
      const id = chev.dataset.toggle;
      if (state.collapsedFolders.has(id)) state.collapsedFolders.delete(id);
      else state.collapsedFolders.add(id);
      renderFolders();
      return;
    }
    const item = event.target.closest('[data-filter]');
    if (!item) return;
    state.filter.folder = item.dataset.filter;
    state.rendered = CHUNK;
    renderFolders();
    renderList({ resetScroll: true });
    updateBulkUI();
  }

  function onKeyDown(event) {
    if (event.key !== 'Escape') return;
    if (event.isComposing || event.keyCode === 229) return;

    if (!el.menu.hidden) {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      return;
    }
    if (!el.modalLayer.hidden) {
      event.preventDefault();
      event.stopPropagation();
      closeModal();
      return;
    }
    if (state.bodySearch.running) {
      event.preventDefault();
      event.stopPropagation();
      cancelBodySearch();
      return;
    }
    if (state.open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }

  function onLanguageChanged() {
    if (!state.mounted) return;
    el.overlay.hidden = !state.open;
    GPTM.i18n.applyDom(shadow);
    host.lang = GPTM.i18n.getLanguage() === 'zh' ? 'zh-CN' : 'en';
    closeMenu();
    renderFolders();
    renderList();
    updateBulkUI();
    renderAccount();
    renderSearchStatus();
    renderProgress();
    updateNativeBar({ count: state.nativeBarCount, working: Boolean(state.running || state.bodySearch.running) });
    if (!state.running && !state.bodySearch.running) setStatus(t('准备就绪'));
  }

  /* ---------------- 打开 / 关闭 ---------------- */

  function open() {
    if (!state.mounted || state.open) return;
    state.open = true;
    state.lastFocus = document.activeElement;
    el.overlay.hidden = false;
    el.fab.hidden = true;
    el.nativeBar.hidden = true;
    applyTheme();
    renderFolders();
    renderList();
    updateBulkUI();
    renderAccount();
    renderSearchStatus();
    refreshSnapshotBadge();

    if (state.running) {
      renderProgress();
      setStatus(t('正在批量操作…'));
    } else if (!state.items.length || Date.now() - state.fetchedAt > REFRESH_TTL) {
      refresh({ silent: state.items.length > 0 });
    } else {
      setStatus(t('已加载 {count} 个对话 · {when}', { count: state.items.length, when: fmtAgo(state.fetchedAt) || t('刚刚') }));
    }
  }

  function close() {
    if (!state.open) return;
    if (state.bodySearch.running) cancelBodySearch();
    state.open = false;
    closeMenu();
    closeModal();
    el.overlay.hidden = true;
    applySettingsUI();
    updateNativeBar({ count: state.nativeBarCount, working: Boolean(state.running) });
    if (state.lastFocus && typeof state.lastFocus.focus === 'function') {
      try { state.lastFocus.focus(); } catch { /* ignore */ }
    }
  }

  function toggle() {
    if (state.open) close();
    else open();
  }

  /* ---------------- 文件夹渲染 ---------------- */

  function renderFolders() {
    const counts = store.countFolders();
    const active = state.filter.folder;
    const parts = [
      `<li class="folder${active === 'all' ? ' active' : ''}" data-filter="all" data-drop="all" style="padding-left:9px" title="${esc(t('全部对话'))}">
        <span class="chev" data-empty="1"></span>
        <span class="dot" style="background:transparent;border:1px solid var(--gptm-muted)"></span>
        <span class="fname">${esc(t('全部对话'))}</span>
        <span class="fcount">${counts.all}</span>
      </li>`,
      `<li class="folder${active === 'none' ? ' active' : ''}" data-filter="none" data-drop="none" style="padding-left:9px" title="${esc(t('未分类'))}">
        <span class="chev" data-empty="1"></span>
        <span class="dot" style="background:#9ca3af"></span>
        <span class="fname">${esc(t('未分类'))}</span>
        <span class="fcount">${counts.none}</span>
      </li>`,
    ];

    const visit = (parentId, depth) => {
      for (const folder of store.getChildren(parentId)) {
        const children = store.getChildren(folder.id);
        const collapsed = state.collapsedFolders.has(folder.id);
        const total = counts.total[folder.id] || 0;
        const direct = counts.direct[folder.id] || 0;
        parts.push(`<li class="folder${active === folder.id ? ' active' : ''}" data-filter="${esc(folder.id)}" data-drop="${esc(folder.id)}" data-folder-drag="${esc(folder.id)}" draggable="true" style="padding-left:${9 + depth * 14}px" title="${esc(store.getFolderPathText(folder.id))}">
          <button class="chev" data-toggle="${esc(folder.id)}" data-empty="${children.length ? '0' : '1'}" aria-label="${esc(collapsed ? t('展开') : t('收起'))}">${collapsed ? '▸' : '▾'}</button>
          <span class="dot" style="background:${esc(folder.color)}"></span>
          <span class="fname">${esc(folder.name)}</span>
          <span class="fcount" title="${esc(t('直接 {direct} / 含子文件夹 {total}', { direct, total }))}">${total}</span>
          <button class="more" data-folder-more="${esc(folder.id)}" data-i18n-title="文件夹操作">⋯</button>
        </li>`);
        if (!collapsed && children.length) visit(folder.id, depth + 1);
      }
    };
    visit(null, 0);
    el.folderList.innerHTML = parts.join('');
  }

  function expandTo(folderId) {
    let cur = folderId ? store.getFolder(folderId) : null;
    let guard = 0;
    while (cur && guard < 50) {
      if (cur.parentId) state.collapsedFolders.delete(cur.parentId);
      cur = cur.parentId ? store.getFolder(cur.parentId) : null;
      guard += 1;
    }
  }

  /* ---------------- 列表渲染 ---------------- */

  function rowHtml(item) {
    const folder = store.getAssignedFolder(item.id);
    const selected = state.selected.has(item.id);
    const time = item.updateTime ? fmtTime(item.updateTime) : t('时间未知');
    const match = state.bodySearch.active && state.filter.q === state.bodySearch.query
      ? state.bodySearch.matches.get(item.id)
      : null;
    const snippet = match
      ? `<div class="row-snippet"><span class="role">${match.role === 'assistant' ? esc(t('ChatGPT')) : esc(t('你'))}</span>${highlightSnippet(match.snippet, state.bodySearch.query)}</div>`
      : '';
    return `<div class="row${selected ? ' selected' : ''}" data-id="${esc(item.id)}" draggable="true">
      <div class="row-check"><input type="checkbox" data-check="${esc(item.id)}" ${selected ? 'checked' : ''} data-i18n-aria="选择对话" aria-label="${esc(t('选择对话'))}" /></div>
      <div class="row-main">
        <a class="row-title" href="/c/${encodeURIComponent(item.id)}" target="_blank" rel="noreferrer" draggable="false" title="${esc(item.title)}">${esc(item.title)}</a>
        <div class="row-meta">
          ${folder ? `<span class="chip"><span class="dot" style="background:${esc(folder.color)}"></span>${esc(store.getFolderPathText(folder.id))}</span>` : ''}
          <span>${esc(time)}</span>
          ${item.source === 'dom' ? `<span class="chip dom">${esc(t('仅页面'))}</span>` : ''}
        </div>
        ${snippet}
      </div>
      <button class="row-more" data-more="${esc(item.id)}" data-i18n-title="更多操作">⋯</button>
    </div>`;
  }

  function renderList(opts = {}) {
    const view = getView();
    el.list.classList.toggle('loading', state.loading);
    el.refresh.classList.toggle('spinning', state.loading);

    if (!view.length) {
      el.list.hidden = true;
      el.list.innerHTML = '';
      el.empty.hidden = false;
      renderEmptyState();
    } else {
      el.list.hidden = false;
      el.empty.hidden = true;
      const slice = view.slice(0, state.rendered);
      let html = slice.map(rowHtml).join('');
      if (view.length > state.rendered) {
        html += `<button class="load-more" id="gptm-load-more">${esc(t('显示更多（剩余 {count} 条）', { count: view.length - state.rendered }))}</button>`;
      }
      el.list.innerHTML = html;
      const loadMore = shadow.getElementById('gptm-load-more');
      if (loadMore) {
        loadMore.addEventListener('click', () => {
          const top = el.list.scrollTop;
          state.rendered += CHUNK;
          renderList();
          el.list.scrollTop = top;
        });
      }
      if (opts.resetScroll) el.list.scrollTop = 0;
    }
    updateBulkUI();
  }

  function renderEmptyState() {
    let title = '';
    let hint = '';
    let action = null;
    let actionLabel = '';

    if (state.bodySearch.running) {
      title = t('正在搜索正文…');
      hint = t('搜索中 {scanned}/{total} · 命中 {matches}', {
        scanned: state.bodySearch.scanned,
        total: state.bodySearch.total,
        matches: state.bodySearch.matches.size,
      });
      action = cancelBodySearch;
      actionLabel = t('停止');
    } else if (state.loading && !state.items.length) {
      title = t('正在加载对话…');
      hint = t('正在读取你账号下的对话列表，请稍候。');
    } else if (state.loadError && !state.items.length) {
      title = t('加载失败');
      hint = `${state.loadError} ${t('请确认当前页面已登录 ChatGPT；如果刚安装扩展，请刷新页面后重试。')}`;
      action = () => refresh();
      actionLabel = t('重试');
    } else if (!state.items.length) {
      title = t('还没有对话');
      hint = t('在 ChatGPT 中开始一段对话后回到这里，即可批量管理与分类。');
      action = () => refresh();
      actionLabel = t('刷新列表');
    } else {
      title = t('没有符合条件的对话');
      hint = t('试试调整搜索关键词、时间范围或文件夹筛选。');
      action = resetFilters;
      actionLabel = t('清除筛选');
    }

    el.emptyTitle.textContent = title;
    el.emptyHint.textContent = hint;
    if (action) {
      el.emptyAction.hidden = false;
      el.emptyAction.textContent = actionLabel;
      el.emptyAction._action = action;
    } else {
      el.emptyAction.hidden = true;
      el.emptyAction._action = null;
    }
  }

  function resetFilters() {
    state.filter = { q: '', range: 'all', sort: 'updated-desc', folder: 'all' };
    state.rendered = CHUNK;
    el.search.value = '';
    el.range.value = 'all';
    el.sort.value = 'updated-desc';
    clearBodySearch({ silent: true });
    renderFolders();
    renderList({ resetScroll: true });
    updateBulkUI();
  }

  function updateBulkUI() {
    const view = getView();
    const selected = selectedIds();
    const count = selected.length;
    const viewIds = new Set(view.map((item) => item.id));
    const hiddenSelected = selected.filter((id) => !viewIds.has(id)).length;

    el.selCount.textContent = count
      ? (hiddenSelected
        ? t('已选 {count} 项（{hidden} 个不在当前筛选）', { count, hidden: hiddenSelected })
        : t('已选 {count} 项', { count }))
      : t('已选 0 项');
    el.selCount.classList.toggle('has', count > 0);
    el.selCount.title = hiddenSelected ? t('批量操作会作用于所有已选对话，包括不在当前筛选中的对话') : '';

    const busy = Boolean(state.running || state.bodySearch.running);
    const disabled = count === 0 || busy;
    el.assign.disabled = disabled;
    el.archive.disabled = disabled;
    el.del.disabled = disabled;
    el.smart.disabled = state.running;
    el.bodySearch.disabled = busy || state.loading;
    el.unassign.disabled = disabled || !selected.some((id) => store.getAssignedFolderId(id));

    shadow.querySelectorAll('.row').forEach((row) => {
      const isSelected = state.selected.has(row.dataset.id);
      row.classList.toggle('selected', isSelected);
      const checkbox = row.querySelector('input[data-check]');
      if (checkbox && checkbox.checked !== isSelected) checkbox.checked = isSelected;
    });

    if (!view.length) {
      el.selectAll.checked = false;
      el.selectAll.indeterminate = false;
    } else {
      let viewSelected = 0;
      for (const item of view) if (state.selected.has(item.id)) viewSelected += 1;
      el.selectAll.checked = viewSelected === view.length;
      el.selectAll.indeterminate = viewSelected > 0 && viewSelected < view.length;
    }
  }

  function toggleSelected(id) {
    if (!id) return;
    setSelected(id, !state.selected.has(id));
  }

  function setSelected(id, selected) {
    if (selected) state.selected.add(id);
    else state.selected.delete(id);
    updateBulkUI();
  }

  /* ---------------- 刷新 ---------------- */

  async function refresh(opts = {}) {
    if (state.loading) return;
    if (state.running) {
      toast(t('批量任务进行中，请稍候再刷新'), 'warn');
      return;
    }
    state.loading = true;
    state.loadError = '';
    clearBodySearch({ silent: true });
    setStatus(t('正在拉取对话列表…'));
    renderList();

    try {
      let items = [];
      let source = 'api';
      try {
        items = await api.listConversations();
      } catch (err) {
        if (api.isAbortError(err)) throw err;
        const domItems = api.listFromDom();
        if (!domItems.length) throw err;
        items = domItems;
        source = 'dom';
        toast(t('接口暂不可用，已改用页面侧边栏列表（缺少时间信息）'), 'warn');
      }

      state.items = items;
      state.source = source;
      state.fetchedAt = Date.now();
      state.session = api.getSessionInfo();
      store.setCache(items, source);

      const existing = new Set(items.map((item) => item.id));
      for (const id of Array.from(state.selected)) {
        if (!existing.has(id)) state.selected.delete(id);
      }

      renderFolders();
      renderList();
      updateBulkUI();
      renderAccount();
      refreshSnapshotBadge();
      refreshNative();
      setStatus(source === 'dom'
        ? t('已从页面读取 {count} 个对话（无时间信息）', { count: items.length })
        : t('已加载 {count} 个对话 · {when}', { count: items.length, when: t('刚刚') }));
    } catch (err) {
      if (api.isAbortError(err)) return;
      state.loadError = err && err.message ? err.message : String(err);
      setStatus(t('加载失败：{message}', { message: state.loadError }), true);
      if (!opts.silent) toast(t('加载失败：{message}', { message: state.loadError }), 'err', 5000);
    } finally {
      state.loading = false;
      renderList();
      updateBulkUI();
      renderAccount();
    }
  }

  /* ---------------- 批量删除 / 归档 ---------------- */

  function actionLabel(kind) {
    return kind === 'delete' ? t('删除') : t('归档');
  }

  function buildEntries(ids, titleMap) {
    const map = titleMap && typeof titleMap.get === 'function' ? titleMap : null;
    const byId = new Map(state.items.map((item) => [item.id, item]));
    const seen = new Set();
    const entries = [];
    for (const id of ids) {
      if (typeof id !== 'string' || seen.has(id)) continue;
      seen.add(id);
      const item = byId.get(id);
      const title = item ? item.title : (map && map.get(id)) || String(id);
      entries.push({
        id,
        title,
        updateTime: item ? item.updateTime : 0,
        createTime: item ? item.createTime : 0,
      });
    }
    return entries;
  }

  function confirmBulk(kind, ids, titleMap) {
    const entries = buildEntries(Array.from(new Set(ids || [])), titleMap);
    if (!entries.length || state.running) return;
    if (state.loading) {
      toast(t('列表正在刷新，请等加载完成后再操作'), 'warn');
      return;
    }
    const isDelete = kind === 'delete';
    const preview = entries.slice(0, 5).map((entry) => esc(truncate(entry.title, 26))).join('、');
    const more = entries.length > 5 ? t(' 等 {count} 个', { count: entries.length }) : '';

    openModal(`
      <div class="modal-head">${esc(isDelete
        ? t('删除 {count} 个对话？', { count: entries.length })
        : t('归档 {count} 个对话？', { count: entries.length }))}
        <div class="sub">${esc(isDelete
          ? t('调用 ChatGPT 网页端同一删除接口，效果等同于在侧边栏逐个删除。')
          : t('归档后对话会从侧边栏隐藏，可在 ChatGPT 设置的「已归档」中找回。'))}</div>
      </div>
      <div class="modal-body">
        <div class="${isDelete ? 'warn-box' : 'tip-box'}">
          ${esc(isDelete
            ? t('此操作无法在 ChatKeeper 内撤销。建议先选中 1–2 条确认行为符合预期。')
            : t('归档不是删除，之后仍可恢复。'))}
        </div>
        ${isDelete && store.getSettings().snapshotOnDelete
          ? `<div class="tip-box" style="margin-bottom:10px">${esc(t('将保存删除快照（本地）'))}</div>`
          : ''}
        <div class="tip-box">${esc(t('包含：'))}${preview}${esc(more)}</div>
      </div>
      <div class="modal-foot">
        <button class="btn" data-close>${esc(t('取消'))}</button>
        <button class="btn ${isDelete ? 'btn-danger' : 'btn-primary'}" id="gptm-confirm">${esc(isDelete
          ? t('确认删除 {count} 个', { count: entries.length })
          : t('确认归档 {count} 个', { count: entries.length }))}</button>
      </div>
    `, {
      onMount(card) {
        card.querySelector('#gptm-confirm').addEventListener('click', () => {
          closeModal();
          beginBulk(kind, entries);
        });
      },
    });
  }

  async function beginBulk(kind, entries) {
    if (state.running) {
      toast(t('已有批量任务在进行中'), 'warn');
      return;
    }
    if (kind === 'delete' && store.getSettings().snapshotOnDelete) {
      setStatus(t('正在保存删除快照…'));
      const snapshotItems = entries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        updateTime: entry.updateTime,
        createTime: entry.createTime,
        folderPath: store.getFolderPathText(store.getAssignedFolderId(entry.id)) || '',
      }));
      const result = await snapshots.capture('delete', snapshotItems);
      if (!result.ok) {
        showSnapshotFailure(kind, entries, result.error);
        return;
      }
      refreshSnapshotBadge();
      toast(t('删除前的本地快照已保存'), 'ok');
    }
    runBulk(kind, entries);
  }

  function showSnapshotFailure(kind, entries, error) {
    openModal(`
      <div class="modal-head">${esc(t('快照保存失败：{message}', { message: error || '' }))}</div>
      <div class="modal-body">
        <div class="warn-box">${esc(t('快照仅用于本地核对，不影响 ChatGPT 的删除。你可以重试保存，或不保存快照继续。'))}</div>
      </div>
      <div class="modal-foot">
        <button class="btn" data-close>${esc(t('取消'))}</button>
        <button class="btn" id="gptm-snap-skip">${esc(t('不保存快照继续'))}</button>
        <button class="btn btn-primary" id="gptm-snap-retry">${esc(t('重试保存'))}</button>
      </div>
    `, {
      onMount(card) {
        card.querySelector('#gptm-snap-skip').addEventListener('click', () => {
          closeModal();
          runBulk(kind, entries);
        });
        card.querySelector('#gptm-snap-retry').addEventListener('click', () => {
          closeModal();
          beginBulk(kind, entries);
        });
      },
    });
  }

  async function runBulk(kind, entries) {
    const list = Array.isArray(entries) ? entries.filter((entry) => entry && entry.id) : [];
    if (state.running || !list.length) {
      if (!list.length) toast(t('没有可操作的对话'), 'warn');
      return;
    }

    if (state.bodySearch.running) cancelBodySearch();

    const settings = store.getSettings();
    const controller = new AbortController();
    const run = {
      kind,
      total: list.length,
      done: 0,
      ok: 0,
      failed: [],
      succeeded: [],
      cancelled: false,
    };
    state.running = run;
    state.abort = controller;

    const titleById = new Map(list.map((entry) => [entry.id, entry.title]));
    el.progress.hidden = false;
    el.cancel.disabled = false;
    el.progressBar.style.width = '0%';
    renderProgress();
    updateBulkUI();
    setStatus(kind === 'delete' ? t('正在批量删除…') : t('正在批量归档…'));

    const queue = list.slice();
    let cursor = 0;

    async function worker() {
      while (!controller.signal.aborted) {
        const index = cursor;
        cursor += 1;
        if (index >= queue.length) return;
        const entry = queue[index];
        try {
          if (kind === 'delete') await api.deleteConversation(entry.id, { signal: controller.signal });
          else await api.archiveConversation(entry.id, { signal: controller.signal });
          run.ok += 1;
          run.succeeded.push(entry.id);
        } catch (err) {
          if (api.isAbortError(err)) {
            run.cancelled = true;
            return;
          }
          run.failed.push({
            id: entry.id,
            title: entry.title || titleById.get(entry.id) || entry.id,
            error: err && err.message ? err.message : String(err),
          });
        } finally {
          run.done += 1;
          renderProgress();
        }

        if (controller.signal.aborted) return;
        if (settings.delayMs > 0) {
          try {
            await sleep(settings.delayMs + Math.random() * 120, controller.signal);
          } catch {
            run.cancelled = true;
            return;
          }
        }
      }
    }

    const workers = Math.min(settings.concurrency, queue.length);
    await Promise.all(Array.from({ length: workers }, () => worker()));

    const { ok, failed, succeeded, cancelled, total } = run;

    if (succeeded.length) {
      const gone = new Set(succeeded);
      state.items = state.items.filter((item) => !gone.has(item.id));
      if (kind === 'delete') store.forgetConversations(succeeded);
      for (const id of succeeded) state.selected.delete(id);
      if (state.items.length !== store.getCache().items.length) {
        store.setCache(state.items, state.source);
      }
    }

    state.running = null;
    state.abort = null;
    el.progress.hidden = true;
    el.cancel.disabled = false;
    el.progressBar.style.width = '0%';

    renderFolders();
    renderList();
    updateBulkUI();
    renderAccount();
    refreshNative();
    updateNativeBar({ count: state.nativeBarCount, working: false });

    const verb = actionLabel(kind);
    setStatus(t('{kind}完成：成功 {ok} / {total}', { kind: verb, ok, total }));
    if (failed.length) {
      showFailureModal(kind, { ok, failed, total, cancelled });
    } else if (cancelled) {
      toast(t('已取消，成功{kind} {count} 个对话', { kind: verb, count: ok }), 'warn');
    } else {
      toast(t('已成功{kind} {count} 个对话', { kind: verb, count: ok }), 'ok');
    }
    return { ok, failed, cancelled, total };
  }

  function renderProgress() {
    const run = state.running;
    if (!run) {
      el.progress.hidden = true;
      return;
    }
    el.progress.hidden = false;
    const percent = run.total ? Math.round((run.done / run.total) * 100) : 0;
    el.progressBar.style.width = Math.min(100, percent) + '%';
    const prefix = run.cancelled ? t('取消中 · ') : '';
    const verb = actionLabel(run.kind);
    el.progressText.innerHTML = `${esc(prefix)}${esc(verb)} <b>${run.done}/${run.total}</b> · ${esc(t('成功'))} ${run.ok} · ${esc(t('失败'))} ${run.failed.length}`;
  }

  function showFailureModal(kind, { ok, failed, total, cancelled }) {
    const verb = actionLabel(kind);
    const rows = failed.slice(0, 200).map((entry) => `<li>
      <span class="rt" title="${esc(entry.title)}">${esc(entry.title)}</span>
      <span class="re">${esc(entry.error)}</span>
    </li>`).join('');
    const strategy = api.getStrategyInfo();

    openModal(`
      <div class="modal-head">${esc(kind === 'delete' ? t('批量删除完成') : t('批量归档完成'))}
        <div class="sub">${esc(cancelled
          ? t('成功 {ok} · 失败 {failed} · 已取消', { ok, failed: failed.length })
          : t('成功 {ok} · 失败 {failed}', { ok, failed: failed.length }))}${esc(t('（共 {total} 个）', { total }))}</div>
      </div>
      <div class="modal-body">
        <div class="tip-box" style="margin-bottom:10px">
          ${esc(t('失败通常是频率限制、网络波动或接口变动导致。可到设置中调大「请求间隔」后重试失败项。'))}<br />
          ${esc(kind === 'delete' ? t('当前删除接口：') : t('当前归档接口：'))}${esc(kind === 'delete' ? strategy.delete : strategy.archive)}
        </div>
        <ul class="report-list">${rows}</ul>
        ${failed.length > 200 ? `<div class="desc" style="margin-top:8px">${esc(t('仅显示前 200 条失败记录。'))}</div>` : ''}
      </div>
      <div class="modal-foot">
        <button class="btn" data-close>${esc(t('关闭'))}</button>
        <button class="btn btn-primary" id="gptm-retry">${esc(t('重试失败项（{count}）', { count: failed.length }))}</button>
      </div>
    `, {
      wide: true,
      onMount(card) {
        card.querySelector('#gptm-retry').addEventListener('click', () => {
          const entries = failed.map((entry) => ({ id: entry.id, title: entry.title }));
          closeModal();
          runBulk(kind, entries);
        });
      },
    });
  }

  function getBulkProgress() {
    const run = state.running;
    if (!run) return null;
    return {
      kind: run.kind,
      done: run.done,
      total: run.total,
      ok: run.ok,
      failed: run.failed.length,
      cancelled: run.cancelled,
    };
  }

  /* ---------------- 文件夹操作 ---------------- */

  function assignIds(ids, folderId, onDone) {
    if (!ids.length) return;
    const changed = store.assign(ids, folderId);
    renderFolders();
    renderList();
    updateBulkUI();
    refreshNative();
    if (!changed) {
      toast(t('没有需要变更的对话'), '');
    } else {
      const folder = folderId ? store.getFolder(folderId) : null;
      toast(folder
        ? t('已移动 {count} 个对话到「{name}」', { count: changed, name: folder.name })
        : t('已将 {count} 个对话移出文件夹', { count: changed }), 'ok');
    }
    if (typeof onDone === 'function') onDone(changed);
  }

  function folderPickerItems(ids, onDone) {
    const folders = store.getFolders();
    const items = [{ header: t('移动 {count} 个对话到', { count: ids.length }) }];
    for (const folder of folders) {
      items.push({
        label: folder.name,
        dot: folder.color,
        indent: store.getFolderDepth(folder.id),
        onClick: () => assignIds(ids, folder.id, onDone),
      });
    }
    if (!folders.length) items.push({ label: t('还没有文件夹'), disabled: true });
    items.push({ sep: true });
    items.push({
      label: t('＋ 新建文件夹…'),
      onClick: () => openFolderModal({ afterCreate: (folder) => assignIds(ids, folder.id, onDone) }),
    });
    if (ids.some((id) => store.getAssignedFolderId(id))) {
      items.push({ label: t('移出文件夹'), onClick: () => assignIds(ids, null, onDone) });
    }
    return items;
  }

  function openFolderPickerFor(ids, target, onDone) {
    if (!ids.length) return;
    showMenu(target, folderPickerItems(ids, onDone));
  }

  function openFolderMenu(folderId, anchor) {
    const folder = store.getFolder(folderId);
    if (!folder) return;
    const siblings = store.getChildren(folder.parentId);
    const index = siblings.findIndex((item) => item.id === folderId);
    const counts = store.countFolders();
    const items = [
      { header: store.getFolderPathText(folderId) },
      { label: t('新建子文件夹'), onClick: () => openFolderModal({ parentId: folderId }) },
      { label: t('编辑名称与颜色'), onClick: () => openFolderModal({ folder }) },
      { label: t('移动到…'), onClick: () => openMoveFolderPicker(folder, anchor) },
      { label: t('上移'), disabled: index <= 0, onClick: () => reorderFolder(folderId, -1) },
      { label: t('下移'), disabled: index < 0 || index >= siblings.length - 1, onClick: () => reorderFolder(folderId, 1) },
      { sep: true },
      {
        label: t('删除文件夹'),
        danger: true,
        count: counts.direct[folderId] || 0,
        onClick: () => confirmDeleteFolder(folder),
      },
    ];
    showMenu(anchor, items);
  }

  function openMoveFolderPicker(folder, anchor) {
    const excluded = store.getDescendantIds(folder.id);
    const items = [{ header: t('移动到…') }, { label: t('顶层'), indent: 0, onClick: () => doMoveFolder(folder.id, null) }];
    for (const candidate of store.getFolders()) {
      if (excluded.has(candidate.id)) continue;
      items.push({
        label: candidate.name,
        dot: candidate.color,
        indent: store.getFolderDepth(candidate.id),
        disabled: candidate.id === folder.parentId,
        onClick: () => doMoveFolder(folder.id, candidate.id),
      });
    }
    showMenu(anchor, items);
  }

  function doMoveFolder(folderId, parentId) {
    if (store.moveFolder(folderId, parentId)) {
      state.collapsedFolders.delete(parentId || '');
      expandTo(parentId);
      renderFolders();
      renderList();
      updateBulkUI();
      refreshNative();
      toast(t('文件夹已移动'), 'ok');
    } else {
      toast(t('不能移动到自身或子文件夹'), 'warn');
    }
  }

  function reorderFolder(folderId, delta) {
    if (store.reorderFolder(folderId, delta)) {
      renderFolders();
      renderList();
      refreshNative();
    }
  }

  function confirmDeleteFolder(folder) {
    const counts = store.countFolders();
    const direct = counts.direct[folder.id] || 0;
    const children = store.getChildren(folder.id).length;
    openModal(`
      <div class="modal-head">${esc(t('删除文件夹「{name}」？', { name: folder.name }))}</div>
      <div class="modal-body">
        <div class="tip-box">
          ${esc(t('只会清除本地归类，不会删除任何 ChatGPT 对话。'))}
          ${direct ? esc(t('该文件夹中的 {count} 个对话会回到「未分类」。', { count: direct })) : esc(t('该文件夹目前为空。'))}
          ${children ? ' ' + esc(t('子文件夹会提升到上一级，不会被删除。')) : ''}
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" data-close>${esc(t('取消'))}</button>
        <button class="btn btn-danger" id="gptm-del-folder">${esc(t('删除文件夹'))}</button>
      </div>
    `, {
      onMount(card) {
        card.querySelector('#gptm-del-folder').addEventListener('click', () => {
          const result = store.deleteFolder(folder.id);
          if (state.filter.folder === folder.id) state.filter.folder = 'all';
          closeModal();
          renderFolders();
          renderList();
          updateBulkUI();
          refreshNative();
          toast(result && result.promoted
            ? t('文件夹已删除，子文件夹已提升')
            : t('文件夹已删除'), 'ok');
        });
      },
    });
  }

  function openFolderModal(opts = {}) {
    closeMenu();
    const folder = opts.folder || null;
    const parentId = opts.parentId || (folder ? folder.parentId : null);
    const parent = parentId ? store.getFolder(parentId) : null;
    const colors = store.getFolderColors();
    let color = folder ? folder.color : colors[store.getFolders().length % colors.length];
    const swatches = colors.map((item) => (
      `<button class="swatch${item === color ? ' active' : ''}" data-color="${item}" style="background:${item}" aria-label="${item}"></button>`
    )).join('');

    const title = folder
      ? t('编辑文件夹')
      : (parent ? t('在「{name}」中新建子文件夹', { name: parent.name }) : t('新建文件夹'));

    openModal(`
      <div class="modal-head">${esc(title)}
        <div class="sub">${esc(t('文件夹只影响本地归类，不会修改 ChatGPT 账号数据。'))}</div>
      </div>
      <div class="modal-body">
        <div class="field">
          <label for="gptm-folder-name">${esc(t('名称'))}</label>
          <input class="text-input" id="gptm-folder-name" maxlength="60" data-i18n-placeholder="例如：工作、学习、项目归档" placeholder="${esc(t('例如：工作、学习、项目归档'))}" value="${esc(folder ? folder.name : '')}" />
        </div>
        <div class="field">
          <label>${esc(t('颜色'))}</label>
          <div class="swatches" id="gptm-swatches">${swatches}</div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" data-close>${esc(t('取消'))}</button>
        <button class="btn btn-primary" id="gptm-folder-save">${esc(folder ? t('保存') : t('创建'))}</button>
      </div>
    `, {
      onMount(card) {
        const input = card.querySelector('#gptm-folder-name');
        input.focus();
        input.select();

        card.querySelectorAll('[data-color]').forEach((button) => {
          button.addEventListener('click', () => {
            color = button.dataset.color;
            card.querySelectorAll('[data-color]').forEach((node) => {
              node.classList.toggle('active', node === button);
            });
          });
        });

        function save() {
          const name = input.value.trim();
          if (!name) {
            toast(t('请输入文件夹名称'), 'warn');
            input.focus();
            return;
          }
          let saved;
          try {
            if (folder) saved = store.updateFolder(folder.id, { name, color });
            else saved = store.createFolder(name, color, parentId);
          } catch (err) {
            toast(err && err.message ? err.message : String(err), 'err');
            return;
          }
          closeModal();
          if (parentId) state.collapsedFolders.delete(parentId);
          expandTo(parentId);
          renderFolders();
          renderList();
          updateBulkUI();
          refreshNative();
          toast(folder ? t('文件夹已更新') : t('文件夹已创建'), 'ok');
          if (!folder && typeof opts.afterCreate === 'function' && saved) opts.afterCreate(saved);
        }

        card.querySelector('#gptm-folder-save').addEventListener('click', save);
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') save();
        });
      },
    });
  }

  /* ---------------- 智能选择 ---------------- */

  function openSmartSelectModal() {
    const currentScope = getView();
    const total = state.items.length;
    const modal = openModal(`
      <div class="modal-head">${esc(t('智能选择'))}
        <div class="sub">${esc(t('按条件选择'))}</div>
      </div>
      <div class="modal-body">
        <div class="field">
          <label>${esc(t('按更新时间'))}</label>
          <select class="text-input" id="gptm-smart-days">
            <option value="0">${esc(t('不限'))}</option>
            <option value="7">${esc(t('超过 7 天未更新'))}</option>
            <option value="30">${esc(t('超过 30 天未更新'))}</option>
            <option value="90">${esc(t('超过 90 天未更新'))}</option>
            <option value="180">${esc(t('超过 180 天未更新'))}</option>
            <option value="365">${esc(t('超过 365 天未更新'))}</option>
          </select>
        </div>
        <div class="field">
          <label>${esc(t('标题包含'))}</label>
          <input class="text-input" id="gptm-smart-include" data-i18n-placeholder="输入关键词（可选）" placeholder="${esc(t('输入关键词（可选）'))}" />
        </div>
        <div class="field">
          <label>${esc(t('标题不包含'))}</label>
          <input class="text-input" id="gptm-smart-exclude" data-i18n-placeholder="输入关键词（可选）" placeholder="${esc(t('输入关键词（可选）'))}" />
        </div>
        <div class="field">
          <label>${esc(t('选择范围'))}</label>
          <select class="text-input" id="gptm-smart-scope">
            <option value="filter">${esc(t('当前筛选结果'))}（${currentScope.length}）</option>
            <option value="all">${esc(t('全部对话'))}（${total}）</option>
          </select>
        </div>
        <div class="field">
          <label class="checkline"><input type="checkbox" id="gptm-smart-none" /> ${esc(t('仅未归类'))}</label>
        </div>
        <div class="tip-box" id="gptm-smart-preview"></div>
      </div>
      <div class="modal-foot">
        <button class="btn" data-close>${esc(t('取消'))}</button>
        <button class="btn" id="gptm-smart-append">${esc(t('追加到已选'))}</button>
        <button class="btn btn-primary" id="gptm-smart-replace">${esc(t('替换选择'))}</button>
      </div>
    `, {
      onMount(card) {
        const days = card.querySelector('#gptm-smart-days');
        const include = card.querySelector('#gptm-smart-include');
        const exclude = card.querySelector('#gptm-smart-exclude');
        const scope = card.querySelector('#gptm-smart-scope');
        const onlyNone = card.querySelector('#gptm-smart-none');
        const preview = card.querySelector('#gptm-smart-preview');

        function matches() {
          const base = scope.value === 'all' ? state.items : getView();
          const cutoff = Number(days.value) ? Date.now() - Number(days.value) * 86400000 : 0;
          const inc = include.value.trim().toLowerCase();
          const exc = exclude.value.trim().toLowerCase();
          return base.filter((item) => {
            if (cutoff) {
              const ts = item.updateTime || item.createTime;
              if (!ts || ts >= cutoff) return false;
            }
            const title = item.title.toLowerCase();
            if (inc && !title.includes(inc)) return false;
            if (exc && title.includes(exc)) return false;
            if (onlyNone.checked && store.getAssignedFolderId(item.id)) return false;
            return true;
          });
        }

        function updatePreview() {
          const list = matches();
          preview.textContent = list.length
            ? t('将选中 {count} 个对话', { count: list.length })
            : t('没有符合条件的对话');
          preview.dataset.count = String(list.length);
        }

        [days, scope, onlyNone].forEach((node) => node.addEventListener('change', updatePreview));
        [include, exclude].forEach((node) => node.addEventListener('input', updatePreview));
        updatePreview();

        function apply(replace) {
          const ids = matches().map((item) => item.id);
          if (replace) state.selected = new Set(ids);
          else ids.forEach((id) => state.selected.add(id));
          closeModal();
          updateBulkUI();
          renderList();
        }

        card.querySelector('#gptm-smart-append').addEventListener('click', () => apply(false));
        card.querySelector('#gptm-smart-replace').addEventListener('click', () => apply(true));
      },
    });
    return modal;
  }

  /* ---------------- 正文搜索 ---------------- */

  function startBodySearchFlow() {
    if (state.running) {
      toast(t('批量任务进行中，请稍候再刷新'), 'warn');
      return;
    }
    if (state.bodySearch.running) {
      cancelBodySearch();
      return;
    }
    const query = state.filter.q || el.search.value.trim().toLowerCase();
    if (!query) {
      toast(t('请先输入搜索关键词'), 'warn');
      el.search.focus();
      return;
    }
    const scope = getSearchScope();
    if (!scope.length) {
      toast(t('没有符合条件的对话'), 'warn');
      return;
    }
    const limited = scope.slice(0, SEARCH_MAX_SCOPE);
    const capped = scope.length > limited.length;

    openModal(`
      <div class="modal-head">${esc(t('正文搜索'))}
        <div class="sub">${esc(t('在 {total} 个对话中搜索“{query}”', { total: limited.length, query }))}</div>
      </div>
      <div class="modal-body">
        <div class="tip-box">${esc(t('搜索范围：当前筛选结果，共 {count} 个对话。', { count: limited.length }))}</div>
        <div class="warn-box" style="margin-top:10px">${esc(t('正文搜索需要逐条读取对话内容，共 {count} 条，可能触发频率限制。是否继续？', { count: limited.length }))}</div>
        ${capped ? `<div class="tip-box" style="margin-top:10px">${esc(t('单次最多扫描 {count} 个对话，本次将只扫描前 {count} 个。', { count: SEARCH_MAX_SCOPE }))}</div>` : ''}
      </div>
      <div class="modal-foot">
        <button class="btn" data-close>${esc(t('取消'))}</button>
        <button class="btn btn-primary" id="gptm-search-start">${esc(t('开始搜索'))}</button>
      </div>
    `, {
      onMount(card) {
        card.querySelector('#gptm-search-start').addEventListener('click', () => {
          closeModal();
          startBodySearch(limited, query);
        });
      },
    });
  }

  function startBodySearch(items, query) {
    if (state.bodySearch.running) return;
    const bs = state.bodySearch;
    bs.active = true;
    bs.query = query;
    bs.matches = new Map();
    bs.scanned = 0;
    bs.total = items.length;
    bs.running = true;
    bs.done = false;
    bs.cancelled = false;
    bs.error = '';
    bs.cacheHits = 0;
    state.rendered = CHUNK;
    state.searchAbort = new AbortController();
    renderSearchStatus();
    renderList();
    updateBulkUI();
    setStatus(t('正在搜索正文…'));

    let renderTimer = null;
    const scheduleRender = () => {
      if (renderTimer) return;
      renderTimer = setTimeout(() => {
        renderTimer = null;
        if (!state.mounted) return;
        renderList();
        renderSearchStatus();
      }, 180);
    };

    search.run({
      items,
      query,
      signal: state.searchAbort.signal,
      onMatch(id, info) {
        state.bodySearch.matches.set(id, info);
        scheduleRender();
      },
      onProgress(progress) {
        const current = state.bodySearch;
        current.scanned = progress.scanned;
        current.total = progress.total;
        current.cacheHits = progress.cacheHits || 0;
        renderSearchStatus();
        if (progress.phase === 'done') {
          current.running = false;
          current.done = true;
          const aborted = progress.aborted;
          current.cancelled = aborted;
          current.error = progress.fatal || '';
          if (renderTimer) {
            clearTimeout(renderTimer);
            renderTimer = null;
          }
          renderSearchStatus();
          renderList();
          updateBulkUI();
          if (progress.fatal) {
            toast(progress.fatal, 'err', 5000);
            setStatus(progress.fatal, true);
          } else if (aborted) {
            setStatus(t('正文搜索已取消：扫描 {scanned}/{total}，命中 {matches}', {
              scanned: progress.scanned, total: progress.total, matches: progress.matches,
            }));
          } else {
            setStatus(t('正文搜索完成：扫描 {scanned} 个，命中 {matches} 个', {
              scanned: progress.scanned, matches: progress.matches,
            }));
          }
        }
      },
    }).catch((err) => {
      const current = state.bodySearch;
      current.running = false;
      current.done = true;
      current.cancelled = true;
      current.error = err && err.message ? err.message : String(err);
      renderSearchStatus();
      renderList();
      updateBulkUI();
      if (!api.isAbortError(err)) toast(current.error, 'err');
    });
  }

  function cancelBodySearch() {
    if (state.searchAbort) state.searchAbort.abort();
    state.bodySearch.cancelled = true;
    state.bodySearch.running = false;
    state.bodySearch.done = true;
    renderSearchStatus();
    renderList();
    updateBulkUI();
    setStatus(t('正文搜索已取消：扫描 {scanned}/{total}，命中 {matches}', {
      scanned: state.bodySearch.scanned,
      total: state.bodySearch.total,
      matches: state.bodySearch.matches.size,
    }));
  }

  function clearBodySearch(opts = {}) {
    if (state.searchAbort) {
      state.searchAbort.abort();
      state.searchAbort = null;
    }
    state.bodySearch = {
      active: false,
      query: '',
      matches: new Map(),
      scanned: 0,
      total: 0,
      running: false,
      done: false,
      cancelled: false,
      error: '',
      cacheHits: 0,
    };
    el.searchStatus.hidden = true;
    if (!opts.silent) {
      renderList();
      updateBulkUI();
      setStatus(t('已清除正文搜索'));
    }
  }

  function renderSearchStatus() {
    const bs = state.bodySearch;
    const visible = bs.active && (bs.running || bs.done);
    el.searchStatus.hidden = !visible;
    if (!visible) return;
    const percent = bs.total ? Math.round((bs.scanned / bs.total) * 100) : 0;
    el.searchBar.style.width = (bs.running ? percent : 100) + '%';
    if (bs.running) {
      el.searchText.textContent = t('搜索中 {scanned}/{total} · 命中 {matches}', {
        scanned: bs.scanned, total: bs.total, matches: bs.matches.size,
      });
      el.searchAction.textContent = t('停止');
      el.searchAction.disabled = false;
    } else if (bs.cancelled) {
      el.searchText.textContent = t('正文搜索已取消：扫描 {scanned}/{total}，命中 {matches}', {
        scanned: bs.scanned, total: bs.total, matches: bs.matches.size,
      });
      el.searchAction.textContent = t('清除正文搜索');
      el.searchAction.disabled = false;
    } else {
      el.searchText.textContent = t('正文搜索完成：扫描 {scanned} 个，命中 {matches} 个', {
        scanned: bs.scanned, matches: bs.matches.size,
      });
      el.searchAction.textContent = t('清除正文搜索');
      el.searchAction.disabled = false;
    }
  }

  /* ---------------- 快照 ---------------- */

  async function refreshSnapshotBadge() {
    try {
      const runs = await snapshots.listRuns();
      state.snapshotCount = runs.length;
      if (el.snapCount) el.snapCount.textContent = String(runs.length);
    } catch { /* ignore */ }
  }

  async function openSnapshotsModal() {
    closeMenu();
    const runs = await snapshots.listRuns();
    state.snapshotCount = runs.length;
    if (el.snapCount) el.snapCount.textContent = String(runs.length);

    const listHtml = runs.length
      ? runs.map((run) => `<div class="snap-run" data-run="${esc(run.id)}">
          <div class="meta">
            <div class="t">${esc(fmtDateTime(run.createdAt))} · ${esc(run.kind === 'archive' ? t('归档') : t('删除'))}</div>
            <div class="s">${esc(t('共 {count} 个对话', { count: run.total }))}${run.truncated ? ' · ' + esc(t('已截断')) : ''} · ${esc(fmtBytes(run.bytes))}</div>
          </div>
          <div class="acts">
            <button class="btn" data-snap-view="${esc(run.id)}">${esc(t('查看'))}</button>
            <button class="btn btn-quiet" data-snap-export="${esc(run.id)}">${esc(t('导出'))}</button>
            <button class="btn btn-quiet" data-snap-delete="${esc(run.id)}">${esc(t('删除'))}</button>
          </div>
        </div>`).join('')
      : `<div class="tip-box">${esc(t('没有快照'))}<br />${esc(t('删除对话后，这里会保留标题和时间记录。'))}</div>`;

    openModal(`
      <div class="modal-head">${esc(t('最近删除快照'))}
        <div class="sub">${esc(t('本地快照仅用于事后核对，无法通过接口恢复 ChatGPT 对话。'))}</div>
      </div>
      <div class="modal-body">
        <div class="snap-list">${listHtml}</div>
      </div>
      <div class="modal-foot">
        ${runs.length ? `<button class="btn btn-quiet" id="gptm-snap-clear">${esc(t('清空全部'))}</button>` : ''}
        <button class="btn" data-close>${esc(t('关闭'))}</button>
      </div>
    `, {
      wide: true,
      onMount(card) {
        card.querySelectorAll('[data-snap-view]').forEach((button) => {
          button.addEventListener('click', () => openSnapshotView(button.dataset.snapView));
        });
        card.querySelectorAll('[data-snap-export]').forEach((button) => {
          button.addEventListener('click', () => exportSnapshot(button.dataset.snapExport));
        });
        card.querySelectorAll('[data-snap-delete]').forEach((button) => {
          button.addEventListener('click', () => confirmSnapshotDelete(button.dataset.snapDelete));
        });
        const clear = card.querySelector('#gptm-snap-clear');
        if (clear) clear.addEventListener('click', () => confirmClearSnapshots());
      },
    });
  }

  async function openSnapshotView(runId) {
    const run = await snapshots.getRun(runId);
    if (!run) {
      toast(t('没有快照'), 'warn');
      return;
    }
    const items = Array.isArray(run.items) ? run.items : [];
    const rows = items.map((item) => `<div class="snap-item">
      <span class="st" title="${esc(item.title)}">${esc(item.title)}</span>
      <span class="sm">${esc(item.folderPath || t('未分类'))} · ${esc(fmtTime(item.updateTime))}</span>
    </div>`).join('');
    openModal(`
      <div class="modal-head">${esc(fmtDateTime(run.createdAt))}
        <div class="sub">${esc(t('共 {count} 个对话', { count: run.total }))}${run.truncated ? ' · ' + esc(t('已截断')) : ''}</div>
      </div>
      <div class="modal-body">
        <div class="snap-view-list">${rows}</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-quiet" id="gptm-snap-back">${esc(t('返回'))}</button>
        <button class="btn" id="gptm-snap-export-one">${esc(t('导出'))}</button>
        <button class="btn" data-close>${esc(t('关闭'))}</button>
      </div>
    `, {
      wide: true,
      onMount(card) {
        card.querySelector('#gptm-snap-back').addEventListener('click', () => openSnapshotsModal());
        card.querySelector('#gptm-snap-export-one').addEventListener('click', () => exportSnapshot(runId));
      },
    });
  }

  async function exportSnapshot(runId) {
    const run = await snapshots.getRun(runId);
    if (!run) return;
    const stamp = new Date(run.createdAt).toISOString().slice(0, 10).replace(/-/g, '');
    downloadJson(`chatkeeper-snapshot-${stamp}.json`, run);
    toast(t('快照已导出'), 'ok');
  }

  function confirmSnapshotDelete(runId) {
    openModal(`
      <div class="modal-head">${esc(t('删除这个快照？'))}</div>
      <div class="modal-body">
        <div class="tip-box">${esc(t('只会删除本地记录，不影响 ChatGPT。'))}</div>
      </div>
      <div class="modal-foot">
        <button class="btn" data-close>${esc(t('取消'))}</button>
        <button class="btn btn-danger" id="gptm-snap-del-one">${esc(t('删除'))}</button>
      </div>
    `, {
      onMount(card) {
        card.querySelector('#gptm-snap-del-one').addEventListener('click', async () => {
          await snapshots.removeRun(runId);
          await refreshSnapshotBadge();
          toast(t('快照已删除'), 'ok');
          openSnapshotsModal();
        });
      },
    });
  }

  function confirmClearSnapshots() {
    openModal(`
      <div class="modal-head">${esc(t('清空全部'))}</div>
      <div class="modal-body">
        <div class="tip-box">${esc(t('只会删除本地记录，不影响 ChatGPT。'))}</div>
      </div>
      <div class="modal-foot">
        <button class="btn" data-close>${esc(t('取消'))}</button>
        <button class="btn btn-danger" id="gptm-snap-clear-all">${esc(t('清空全部'))}</button>
      </div>
    `, {
      onMount(card) {
        card.querySelector('#gptm-snap-clear-all').addEventListener('click', async () => {
          await snapshots.clear();
          await refreshSnapshotBadge();
          toast(t('快照已清空'), 'ok');
          closeModal();
        });
      },
    });
  }

  /* ---------------- 行菜单 ---------------- */

  function openRowMenu(id, anchor) {
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return;
    const ids = state.selected.has(id) ? selectedIds() : [id];
    const folder = store.getAssignedFolder(id);

    const items = [
      { label: t('打开对话'), onClick: () => window.open(`/c/${encodeURIComponent(id)}`, '_blank', 'noopener') },
      { sep: true },
      { label: t('移动到文件夹…'), onClick: () => openFolderPickerFor(ids, anchor) },
    ];
    if (folder) {
      items.push({ label: t('移出文件夹'), onClick: () => assignIds(ids, null) });
    }
    items.push(
      { sep: true },
      { label: t('归档') + (ids.length > 1 ? ` (${ids.length})` : ''), onClick: () => confirmBulk('archive', ids) },
      { label: t('删除') + (ids.length > 1 ? ` (${ids.length})` : ''), danger: true, onClick: () => confirmBulk('delete', ids) }
    );
    showMenu(anchor, items);
  }

  /* ---------------- 菜单 ---------------- */

  function showMenu(target, items) {
    closeMenu();
    if (!target) return;
    const isPoint = typeof target === 'object' && typeof target.x === 'number' && typeof target.y === 'number'
      && typeof target.getBoundingClientRect !== 'function';
    if (!isPoint && typeof target.getBoundingClientRect !== 'function') return;

    el.menu.innerHTML = items.map((item, index) => {
      if (item.header) return `<div class="menu-label">${esc(item.header)}</div>`;
      if (item.sep) return '<div class="menu-sep"></div>';
      const indent = item.indent ? ` style="padding-left:${9 + item.indent * 14}px"` : '';
      return `<button class="menu-item${item.danger ? ' danger' : ''}" data-i="${index}"${item.disabled ? ' disabled' : ''}${indent}>
        ${item.dot ? `<span class="dot" style="background:${esc(item.dot)}"></span>` : ''}
        <span>${esc(item.label)}</span>
        ${item.count != null ? `<span class="mi-count">${item.count}</span>` : ''}
      </button>`;
    }).join('');

    el.menu.style.visibility = 'hidden';
    el.menu.hidden = false;
    menuAnchor = target;
    positionMenu();
    el.menu.style.visibility = 'visible';

    el.menu.querySelectorAll('[data-i]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = items[Number(button.dataset.i)];
        closeMenu();
        if (item && typeof item.onClick === 'function') item.onClick();
      });
    });

    setTimeout(() => {
      if (el.menu.hidden) return;
      document.addEventListener('click', onDocumentClickCloseMenu, true);
      window.addEventListener('resize', scheduleMenuPosition);
      window.addEventListener('scroll', scheduleMenuPosition, true);
    }, 0);
  }

  function positionMenu() {
    if (!menuAnchor || !el.menu || el.menu.hidden) return;
    const menuRect = el.menu.getBoundingClientRect();
    let left = 12;
    let top = 12;
    const isPoint = typeof menuAnchor.x === 'number' && typeof menuAnchor.y === 'number'
      && typeof menuAnchor.getBoundingClientRect !== 'function';
    if (isPoint) {
      left = menuAnchor.x;
      top = menuAnchor.y + 2;
    } else {
      if (!menuAnchor.isConnected) {
        closeMenu();
        return;
      }
      const rect = menuAnchor.getBoundingClientRect();
      left = rect.left;
      top = rect.bottom + 6;
      if (top + menuRect.height > window.innerHeight - 12) {
        top = Math.max(12, rect.top - menuRect.height - 6);
      }
    }
    if (left + menuRect.width > window.innerWidth - 12) left = window.innerWidth - menuRect.width - 12;
    if (top + menuRect.height > window.innerHeight - 12) top = window.innerHeight - menuRect.height - 12;
    left = Math.max(12, left);
    top = Math.max(12, top);
    el.menu.style.left = `${left}px`;
    el.menu.style.top = `${top}px`;
  }

  function scheduleMenuPosition() {
    if (menuRaf) return;
    menuRaf = requestAnimationFrame(() => {
      menuRaf = 0;
      positionMenu();
    });
  }

  function closeMenu() {
    if (!el.menu) return;
    el.menu.hidden = true;
    el.menu.innerHTML = '';
    menuAnchor = null;
    if (menuRaf) {
      cancelAnimationFrame(menuRaf);
      menuRaf = 0;
    }
    document.removeEventListener('click', onDocumentClickCloseMenu, true);
    window.removeEventListener('resize', scheduleMenuPosition);
    window.removeEventListener('scroll', scheduleMenuPosition, true);
  }

  function onDocumentClickCloseMenu(event) {
    if (!event.composedPath().includes(el.menu)) closeMenu();
  }

  /* ---------------- 弹窗 ---------------- */

  function openModal(html, opts = {}) {
    closeMenu();
    el.modalLayer.innerHTML = `<div class="modal-card${opts.wide ? ' wide' : ''}">${html}</div>`;
    el.modalLayer.hidden = false;
    const card = el.modalLayer.firstElementChild;
    card.querySelectorAll('[data-close]').forEach((button) => {
      button.addEventListener('click', closeModal);
    });
    if (typeof opts.onMount === 'function') opts.onMount(card);
    return card;
  }

  function closeModal() {
    if (!el.modalLayer) return;
    el.modalLayer.hidden = true;
    el.modalLayer.innerHTML = '';
  }

  /* ---------------- 设置 ---------------- */

  function openSettingsModal() {
    closeMenu();
    const settings = store.getSettings();
    const strategy = api.getStrategyInfo();
    const aiConfig = GPTM.ai ? GPTM.ai.getConfig() : { configured: false, model: 'glm-4-flash', enabled: true };
    const folderCount = store.getFolders().length;
    const assignedCount = store.getAssignmentCount();
    const cachedCount = store.getCache().items.length;
    const nativeStatus = GPTM.native && GPTM.native.getStatus ? GPTM.native.getStatus() : null;

    openModal(`
      <div class="modal-head">${esc(t('设置'))}
        <div class="sub">${esc(t('所有数据只保存在本浏览器；批量操作速率可调。'))}</div>
      </div>
      <div class="modal-body">
        <div class="field">
          <label>${esc(t('并发请求数'))}</label>
          <div class="range-row">
            <input type="range" id="gptm-set-conc" min="1" max="5" step="1" value="${settings.concurrency}" />
            <span class="val" id="gptm-set-conc-val">${settings.concurrency}</span>
          </div>
          <div class="desc">${esc(t('同时执行的请求数，默认 2。遇到 429 限流时请先调低这里。'))}</div>
        </div>

        <div class="field">
          <label>${esc(t('请求间隔'))}</label>
          <div class="range-row">
            <input type="range" id="gptm-set-delay" min="0" max="2000" step="50" value="${Math.min(settings.delayMs, 2000)}" />
            <span class="val" id="gptm-set-delay-val">${settings.delayMs} ms</span>
          </div>
          <div class="desc">${esc(t('每个请求完成后的等待时间。默认设置下整体约每秒 5 个请求。'))}</div>
        </div>

        <div class="field">
          <label for="gptm-set-theme">${esc(t('主题'))}</label>
          <select class="text-input" id="gptm-set-theme">
            <option value="auto"${settings.theme === 'auto' ? ' selected' : ''}>${esc(t('跟随 ChatGPT'))}</option>
            <option value="light"${settings.theme === 'light' ? ' selected' : ''}>${esc(t('浅色'))}</option>
            <option value="dark"${settings.theme === 'dark' ? ' selected' : ''}>${esc(t('深色'))}</option>
          </select>
        </div>

        <div class="field">
          <label for="gptm-set-language">${esc(t('界面语言'))}</label>
          <select class="text-input" id="gptm-set-language">
            <option value="auto"${settings.language === 'auto' ? ' selected' : ''}>${esc(t('跟随浏览器'))}</option>
            <option value="zh"${settings.language === 'zh' ? ' selected' : ''}>中文</option>
            <option value="en"${settings.language === 'en' ? ' selected' : ''}>English</option>
          </select>
        </div>

        <div class="field">
          <label class="checkline"><input type="checkbox" id="gptm-set-fab" ${settings.showFab ? 'checked' : ''} /> ${esc(t('显示页面右下角悬浮按钮'))}</label>
          <div class="desc">${esc(t('关闭后仍可通过扩展图标或快捷键 Alt+Shift+M 打开面板。'))}</div>
        </div>

        <div class="field">
          <label class="checkline"><input type="checkbox" id="gptm-set-native" ${settings.nativeSidebar ? 'checked' : ''} /> ${esc(t('原生侧边栏增强'))}</label>
          <div class="desc">${esc(t('在 ChatGPT 自带的对话列表上显示文件夹色条、勾选框和右键菜单。'))}<br />${esc(t('如果页面显示异常，可以随时关闭。'))}</div>
          ${nativeStatus ? `<div class="desc" style="margin-top:6px">${esc(nativeStatus.detail || '')}</div>` : ''}
        </div>

        <div class="field">
          <label class="checkline"><input type="checkbox" id="gptm-set-snapshot" ${settings.snapshotOnDelete ? 'checked' : ''} /> ${esc(t('保存删除快照'))}</label>
          <div class="desc">${esc(t('删除前在本地记录被删对话的标题、时间和文件夹，便于事后核对。'))}</div>
        </div>

        <div class="field">
          <label>${esc(t('AI 提示词优化（GLM-4-Flash）'))}</label>
          <div class="desc">${esc(t('在 open.bigmodel.cn 创建免费 API Key；Key 只保存在本浏览器，不写入导出文件。'))}</div>
          <input class="text-input" id="gptm-set-api-key" type="password" autocomplete="new-password" style="margin-top:8px"
            placeholder="${esc(aiConfig.configured ? t('已保存，留空则不修改') : t('在此填入 API Key'))}" />
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center">
            <input class="text-input" id="gptm-set-model" value="${esc(aiConfig.model)}" style="flex:1;min-width:150px" />
            <button class="btn" id="gptm-test-ai">${esc(t('测试连接'))}</button>
            <button class="btn btn-quiet" id="gptm-clear-ai">${esc(t('清除 Key'))}</button>
          </div>
          <label class="checkline" style="margin-top:8px"><input type="checkbox" id="gptm-set-ai-enabled" ${aiConfig.enabled ? 'checked' : ''} /> ${esc(t('启用 AI 优化（未配置时使用本地规则）'))}</label>
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center">
            <label for="gptm-set-ai-style" style="font-size:12px;font-weight:600">${esc(t('优化风格'))}</label>
            <select class="text-input" id="gptm-set-ai-style" style="flex:1;min-width:120px">
              <option value="structured"${aiConfig.style === 'structured' ? ' selected' : ''}>${esc(t('结构化'))}</option>
              <option value="concise"${aiConfig.style === 'concise' ? ' selected' : ''}>${esc(t('简洁'))}</option>
              <option value="detailed"${aiConfig.style === 'detailed' ? ' selected' : ''}>${esc(t('详细'))}</option>
            </select>
          </div>
          <label class="checkline" style="margin-top:8px"><input type="checkbox" id="gptm-set-quick-button" ${aiConfig.quickButton ? 'checked' : ''} /> ${esc(t('在输入框旁显示优化按钮'))}</label>
          <div class="desc ai-status" id="gptm-ai-status">${esc(aiConfig.configured
            ? t('已配置 · 模型 {model}', { model: aiConfig.model })
            : t('未配置 · 将使用本地结构化优化'))}</div>
          <button class="btn btn-quiet" id="gptm-get-key" style="margin-top:6px">${esc(t('获取 API Key'))}</button>
        </div>

        <div class="field">
          <label>${esc(t('本地数据'))}</label>
          <div class="desc">${esc(t('文件夹 {folders} 个 · 已归类对话 {assigned} 个 · 缓存 {cached} 条', {
            folders: folderCount, assigned: assignedCount, cached: cachedCount,
          }))}</div>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
            <button class="btn" id="gptm-export">${esc(t('导出数据'))}</button>
            <button class="btn" id="gptm-import">${esc(t('导入数据'))}</button>
            <button class="btn btn-quiet" id="gptm-clear-folders">${esc(t('清空文件夹'))}</button>
            <button class="btn btn-quiet" id="gptm-clear-cache">${esc(t('清空列表缓存'))}</button>
            <button class="btn btn-quiet" id="gptm-clear-snapshots">${esc(t('清空快照'))}</button>
            <button class="btn btn-quiet" id="gptm-clear-search">${esc(t('清空正文索引'))}</button>
          </div>
        </div>

        <div class="field">
          <label>${esc(t('接口诊断'))}</label>
          <div class="desc">${esc(t('当前删除接口'))}：${esc(strategy.delete)}<br />${esc(t('当前归档接口'))}：${esc(strategy.archive)}</div>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
            <button class="btn btn-quiet" id="gptm-reset-api">${esc(t('重置接口适配'))}</button>
            <button class="btn btn-quiet" id="gptm-native-recheck">${esc(t('重新检测'))}</button>
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-quiet" id="gptm-help">${esc(t('使用说明'))}</button>
        <button class="btn" data-close>${esc(t('取消'))}</button>
        <button class="btn btn-primary" id="gptm-save-settings">${esc(t('保存'))}</button>
      </div>
    `, {
      wide: true,
      onMount(card) {
        const conc = card.querySelector('#gptm-set-conc');
        const concVal = card.querySelector('#gptm-set-conc-val');
        const delay = card.querySelector('#gptm-set-delay');
        const delayVal = card.querySelector('#gptm-set-delay-val');
        const theme = card.querySelector('#gptm-set-theme');
        const language = card.querySelector('#gptm-set-language');
        const fab = card.querySelector('#gptm-set-fab');
        const nativeToggle = card.querySelector('#gptm-set-native');
        const snapshotToggle = card.querySelector('#gptm-set-snapshot');
        const apiKeyInput = card.querySelector('#gptm-set-api-key');
        const modelInput = card.querySelector('#gptm-set-model');
        const aiEnabled = card.querySelector('#gptm-set-ai-enabled');
        const aiStyle = card.querySelector('#gptm-set-ai-style');
        const quickButton = card.querySelector('#gptm-set-quick-button');
        const aiStatus = card.querySelector('#gptm-ai-status');

        conc.addEventListener('input', () => { concVal.textContent = conc.value; });
        delay.addEventListener('input', () => { delayVal.textContent = `${delay.value} ms`; });

        card.querySelector('#gptm-get-key').addEventListener('click', () => {
          window.open('https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys', '_blank', 'noopener');
        });

        card.querySelector('#gptm-test-ai').addEventListener('click', async (event) => {
          const button = event.currentTarget;
          const key = apiKeyInput.value.trim();
          const current = GPTM.ai.getConfig();
          if (!key && !current.configured) {
            toast(t('请先填写 API Key'), 'warn');
            apiKeyInput.focus();
            return;
          }
          await GPTM.ai.saveConfig({
            apiKey: key || undefined,
            model: modelInput.value,
            enabled: aiEnabled.checked,
            style: aiStyle.value,
            quickButton: quickButton.checked,
          });
          const label = button.textContent;
          button.disabled = true;
          button.textContent = t('测试中…');
          const result = await GPTM.ai.test();
          button.disabled = false;
          button.textContent = label;
          if (result.ok) {
            aiStatus.textContent = t('连接成功（{model}）', { model: GPTM.ai.getConfig().model });
            aiStatus.className = 'desc ai-status ok';
            toast(t('连接成功'), 'ok');
          } else {
            const message = GPTM.ai.errorText(result);
            aiStatus.textContent = t('连接失败：{message}', { message });
            aiStatus.className = 'desc ai-status err';
            toast(t('连接失败：{message}', { message }), 'err', 5000);
          }
        });

        bindTwoStepButton(card.querySelector('#gptm-clear-ai'), t('清除 Key'), t('确认清除？'), async () => {
          await GPTM.ai.clearKey();
          apiKeyInput.value = '';
          aiStatus.textContent = t('未配置 · 将使用本地结构化优化');
          aiStatus.className = 'desc ai-status';
          toast(t('已清除 API Key'), 'ok');
        });

        card.querySelector('#gptm-save-settings').addEventListener('click', async () => {
          const key = apiKeyInput.value.trim();
          await GPTM.ai.saveConfig({
            apiKey: key || undefined,
            model: modelInput.value,
            enabled: aiEnabled.checked,
            style: aiStyle.value,
            quickButton: quickButton.checked,
          });
          const languageChanged = language.value !== store.getSettings().language;
          store.setSettings({
            concurrency: Number(conc.value),
            delayMs: Number(delay.value),
            theme: theme.value,
            language: language.value,
            showFab: fab.checked,
            nativeSidebar: nativeToggle.checked,
            snapshotOnDelete: snapshotToggle.checked,
          });
          GPTM.i18n.setLanguage(language.value);
          GPTM.i18n.applyDom(shadow);
          applySettingsUI();
          if (GPTM.native && GPTM.native.setEnabled) GPTM.native.setEnabled(nativeToggle.checked);
          closeModal();
          if (languageChanged) onLanguageChanged();
          else toast(t('设置已保存'), 'ok');
        });

        card.querySelector('#gptm-export').addEventListener('click', () => {
          const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          downloadJson(`chatkeeper-${stamp}.json`, store.exportData());
          toast(t('导出完成'), 'ok');
        });

        card.querySelector('#gptm-import').addEventListener('click', () => pickImportFile());

        bindTwoStepButton(card.querySelector('#gptm-clear-folders'), t('清空文件夹'), t('确认清空？'), () => {
          store.clearFolders();
          if (state.filter.folder !== 'all' && state.filter.folder !== 'none') state.filter.folder = 'all';
          state.collapsedFolders.clear();
          renderFolders();
          renderList();
          updateBulkUI();
          refreshNative();
          closeModal();
          toast(t('文件夹数据已清空'), 'ok');
        });

        bindTwoStepButton(card.querySelector('#gptm-clear-cache'), t('清空列表缓存'), t('确认清空？'), () => {
          store.clearCache();
          state.items = [];
          state.fetchedAt = 0;
          state.selected.clear();
          clearBodySearch({ silent: true });
          renderFolders();
          renderList();
          updateBulkUI();
          closeModal();
          toast(t('列表缓存已清空，下次打开会重新拉取'), 'ok');
        });

        bindTwoStepButton(card.querySelector('#gptm-clear-snapshots'), t('清空快照'), t('确认清空？'), async () => {
          await snapshots.clear();
          await refreshSnapshotBadge();
          closeModal();
          toast(t('快照已清空'), 'ok');
        });

        bindTwoStepButton(card.querySelector('#gptm-clear-search'), t('清空正文索引'), t('确认清空？'), () => {
          search.clearCache();
          clearBodySearch({ silent: true });
          closeModal();
          toast(t('正文搜索缓存已清空'), 'ok');
        });

        card.querySelector('#gptm-reset-api').addEventListener('click', () => {
          api.resetStrategies();
          toast(t('已重置接口适配，下次操作会重新探测'), 'ok');
        });

        card.querySelector('#gptm-native-recheck').addEventListener('click', () => {
          if (GPTM.native && GPTM.native.refresh) {
            GPTM.native.refresh();
            toast(t('已重新检测原生侧边栏'), 'ok');
          }
        });

        card.querySelector('#gptm-help').addEventListener('click', () => {
          try {
            chrome.runtime.sendMessage({ type: 'GPTM_OPEN_HELP' }).catch(() => {
              toast(t('无法打开说明页，请点击扩展图标查看'), 'warn');
            });
          } catch {
            toast(t('无法打开说明页，请点击扩展图标查看'), 'warn');
          }
        });
      },
    });
  }

  function bindTwoStepButton(button, idleText, confirmText, run) {
    let armed = false;
    let timer = null;
    button.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        button.textContent = confirmText;
        clearTimeout(timer);
        timer = setTimeout(() => {
          armed = false;
          button.textContent = idleText;
        }, 3000);
        return;
      }
      clearTimeout(timer);
      armed = false;
      button.textContent = idleText;
      run();
    });
  }

  /* ---------------- 导入 / 导出 ---------------- */

  function pickImportFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    shadow.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.remove();
      if (file) handleImportFile(file);
    });
    input.click();
  }

  async function handleImportFile(file) {
    if (file.size > 5 * 1024 * 1024) {
      toast(t('文件过大，最大支持 5 MB'), 'err');
      return;
    }
    let payload;
    try {
      const text = await file.text();
      payload = JSON.parse(text);
    } catch (err) {
      toast(t('导入失败：{message}', { message: err && err.message ? err.message : String(err) }), 'err');
      return;
    }
    if (!payload || typeof payload !== 'object' || (!Array.isArray(payload.folders) && !payload.assignments)) {
      toast(t('不是有效的 ChatKeeper 数据文件'), 'err');
      return;
    }

    const folderCount = Array.isArray(payload.folders) ? payload.folders.length : 0;
    const assignmentCount = payload.assignments && typeof payload.assignments === 'object'
      ? Object.keys(payload.assignments).length
      : 0;

    openModal(`
      <div class="modal-head">${esc(t('导入预览'))}
        <div class="sub">${esc(t('文件：{name}', { name: file.name }))}</div>
      </div>
      <div class="modal-body">
        <div class="import-stats">
          <span>${esc(t('文件夹'))} <b>${folderCount}</b></span>
          <span>${esc(t('归类'))} <b>${assignmentCount}</b></span>
        </div>
        <div class="radio-row">
          <label class="radio-opt active" id="gptm-import-merge-opt">
            <input type="radio" name="gptm-import-mode" value="merge" checked />
            <span>${esc(t('合并（保留现有数据）'))}<br /><span class="desc">${esc(t('不勾选时，只填充尚未归类的对话。'))}</span></span>
          </label>
          <label class="radio-opt" id="gptm-import-replace-opt">
            <input type="radio" name="gptm-import-mode" value="replace" />
            <span>${esc(t('替换（清空现有文件夹与归类）'))}<br /><span class="desc">${esc(t('替换时会自动下载当前数据作为备份。'))}</span></span>
          </label>
        </div>
        <label class="checkline" style="margin-top:12px"><input type="checkbox" id="gptm-import-overwrite" /> ${esc(t('覆盖已有归类'))}</label>
      </div>
      <div class="modal-foot">
        <button class="btn" data-close>${esc(t('取消'))}</button>
        <button class="btn btn-primary" id="gptm-import-run">${esc(t('导入'))}</button>
      </div>
    `, {
      onMount(card) {
        const overwrite = card.querySelector('#gptm-import-overwrite');
        const mergeOpt = card.querySelector('#gptm-import-merge-opt');
        const replaceOpt = card.querySelector('#gptm-import-replace-opt');
        card.querySelectorAll('input[name="gptm-import-mode"]').forEach((radio) => {
          radio.addEventListener('change', () => {
            const merge = card.querySelector('input[name="gptm-import-mode"]:checked').value === 'merge';
            mergeOpt.classList.toggle('active', merge);
            replaceOpt.classList.toggle('active', !merge);
            overwrite.disabled = !merge;
          });
        });

        card.querySelector('#gptm-import-run').addEventListener('click', () => {
          const mode = card.querySelector('input[name="gptm-import-mode"]:checked').value;
          try {
            if (mode === 'replace') {
              const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
              downloadJson(`chatkeeper-backup-${stamp}.json`, store.exportData());
            }
            const stats = store.importData(payload, { mode, overwrite: overwrite.checked });
            closeModal();
            state.collapsedFolders.clear();
            if (state.filter.folder !== 'all' && state.filter.folder !== 'none' && !store.getFolder(state.filter.folder)) {
              state.filter.folder = 'all';
            }
            renderFolders();
            renderList();
            updateBulkUI();
            refreshNative();
            refreshSnapshotBadge();
            toast(t('导入完成：新增 {folders} 个文件夹，应用 {assignments} 条归类', {
              folders: stats.foldersAdded,
              assignments: stats.assignmentsApplied,
            }), 'ok', 4500);
          } catch (err) {
            toast(t('导入失败：{message}', { message: err && err.message ? err.message : String(err) }), 'err', 5000);
          }
        });
      },
    });
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* ---------------- 原生侧边栏联动 ---------------- */

  function updateNativeBar(info) {
    if (!el.nativeBar) return;
    const count = Number(info && info.count) || 0;
    state.nativeBarCount = count;
    el.nativeBar.hidden = state.open || count <= 0;
    el.nativeCount.textContent = count ? t('已选 {count}', { count }) : '';
    el.nativeText.textContent = (info && info.text) || '';
    const working = Boolean(info && info.working);
    el.nativeMove.disabled = working;
    el.nativeArchive.disabled = working;
    el.nativeDelete.disabled = working;
    el.nativeClear.disabled = false;
  }

  function refreshNative() {
    if (GPTM.native && typeof GPTM.native.refresh === 'function') {
      try { GPTM.native.refresh(); } catch { /* ignore */ }
    }
  }

  /* ---------------- 状态与主题 ---------------- */

  function setStatus(text, isError) {
    el.status.textContent = text;
    el.status.classList.toggle('status-err', Boolean(isError));
  }

  function renderAccount() {
    const info = state.session || api.getSessionInfo();
    if (info && (info.email || info.name)) {
      const label = info.email || info.name;
      el.account.textContent = info.plan ? `${label} · ${info.plan}` : label;
      el.account.title = t('当前登录账号（仅用于确认操作对象，不会被保存）');
    } else {
      el.account.textContent = t('本地数据 · 仅保存在此浏览器');
      el.account.title = '';
    }
  }

  function applyTheme() {
    if (!host) return;
    const setting = store.getSettings().theme;
    let effective = setting;
    if (setting === 'auto') {
      const root = document.documentElement;
      const pageDark = root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark';
      let systemDark = false;
      try {
        systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      } catch { /* ignore */ }
      effective = pageDark || systemDark ? 'dark' : 'light';
    }
    host.setAttribute('data-theme', effective);
  }

  function applySettingsUI() {
    if (!el.fab) return;
    el.fab.hidden = state.open || !store.getSettings().showFab;
    applyTheme();
  }

  function toast(message, kind, duration, action) {
    if (!el.toasts) return;
    const node = document.createElement('div');
    node.className = 'toast' + (kind ? ' ' + kind : '');
    const text = document.createElement('span');
    text.className = 'toast-text';
    text.textContent = message;
    node.appendChild(text);

    let timer = null;
    const dismiss = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      node.remove();
    };

    if (action && action.label) {
      const actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.className = 'toast-action';
      actionButton.textContent = action.label;
      actionButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
          if (typeof action.onClick === 'function') action.onClick();
        } finally {
          dismiss();
        }
      });
      node.appendChild(actionButton);
    }

    el.toasts.appendChild(node);
    const life = duration || 3200;
    timer = setTimeout(() => {
      node.style.transition = 'opacity .2s ease';
      node.style.opacity = '0';
      setTimeout(() => node.remove(), 240);
    }, life);
  }

  /* ---------------- 对外接口 ---------------- */

  GPTM.ui = {
    openModal,
    closeModal,
    toast,
    downloadJson,
    showMenuAtPoint: (point, items) => showMenu({ x: point.x, y: point.y }, items),
    closeMenu,
  };

  GPTM.panel = {
    mount,
    open,
    close,
    toggle,
    refresh,
    isOpen: () => state.open,
    isBusy: () => Boolean(state.running || state.bodySearch.running),
    confirmBulk,
    openFolderPickerFor,
    showMenuAtPoint: (point, items) => showMenu({ x: point.x, y: point.y }, items),
    updateNativeBar,
    refreshView: () => {
      renderFolders();
      renderList();
      updateBulkUI();
      renderAccount();
      refreshSnapshotBadge();
    },
    getBulkProgress,
    toast,
    closeMenu,
  };
})();
