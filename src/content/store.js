/* ChatKeeper - 本地数据层 v2
 *
 * 文件夹（支持递归子文件夹）、对话归类、设置与列表缓存保存在 chrome.storage.local。
 * 所有用户可见数据仅在本地；v1 数据会在加载时自动迁移到 v2。
 */
(() => {
  'use strict';

  const GPTM = (window.GPTM = window.GPTM || {});
  const tr = (source, params) => (typeof GPTM.t === 'function' ? GPTM.t(source, params) : source);
  const KEY = 'gptm_state_v1';
  const LANG_KEY = 'gptm_lang';
  const MAX_CACHE_ITEMS = 10000;
  const MAX_FOLDERS = 200;
  const MAX_DEPTH = 5;
  const MAX_ASSIGNMENTS = 50000;

  const FOLDER_COLORS = [
    '#0e9f74', '#3b82f6', '#8b5cf6', '#ec4899',
    '#f59e0b', '#14b8a6', '#ef4444', '#6b7280',
  ];

  function defaultSettings() {
    return {
      concurrency: 2,
      delayMs: 350,
      theme: 'auto',
      showFab: true,
      language: 'auto',
      nativeSidebar: true,
      snapshotOnDelete: true,
    };
  }

  function defaultState() {
    return {
      version: 2,
      folders: [],
      assignments: {},
      settings: defaultSettings(),
      cache: { items: [], fetchedAt: 0, source: 'api' },
    };
  }

  let state = defaultState();
  let saveTimer = null;
  let notifyTimer = null;
  let readOnly = false;
  let lastSaveError = '';
  let migrationInfo = { migrated: false, fromVersion: 0 };

  /* ---------------- 清洗 ---------------- */

  function sanitizeFolder(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 80 ? raw.id : '';
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 60) : '';
    if (!id || !name) return null;
    const color = typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color)
      ? raw.color
      : FOLDER_COLORS[0];
    const parentId = typeof raw.parentId === 'string' && raw.parentId && raw.parentId !== id
      ? raw.parentId
      : null;
    const order = Number.isFinite(Number(raw.order)) ? Number(raw.order) : 0;
    const createdAt = Number(raw.createdAt) || Date.now();
    return {
      id,
      name,
      color,
      parentId,
      order,
      createdAt,
      updatedAt: Number(raw.updatedAt) || createdAt,
    };
  }

  function sanitizeAssignments(raw, folderIds) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    let count = 0;
    for (const [id, folderId] of Object.entries(raw)) {
      if (count >= MAX_ASSIGNMENTS) break;
      if (typeof id !== 'string' || !id || id.length > 120) continue;
      if (typeof folderId !== 'string' || !folderId) continue;
      if (folderIds && !folderIds.has(folderId)) continue;
      out[id] = folderId;
      count += 1;
    }
    return out;
  }

  function sanitizeItems(rawItems) {
    const out = [];
    if (!Array.isArray(rawItems)) return out;
    for (const raw of rawItems) {
      if (!raw || typeof raw !== 'object') continue;
      if (typeof raw.id !== 'string' || !raw.id) continue;
      out.push({
        id: raw.id,
        title: typeof raw.title === 'string' ? raw.title.slice(0, 300) : '无标题对话',
        createTime: Number(raw.createTime) || 0,
        updateTime: Number(raw.updateTime) || 0,
        isArchived: Boolean(raw.isArchived),
        isStarred: Boolean(raw.isStarred),
        source: raw.source === 'dom' ? 'dom' : 'api',
      });
      if (out.length >= MAX_CACHE_ITEMS) break;
    }
    return out;
  }

  function clampSettings(settings) {
    const merged = Object.assign(defaultSettings(), settings || {});
    let concurrency = Math.round(Number(merged.concurrency));
    if (!Number.isFinite(concurrency)) concurrency = 2;
    merged.concurrency = Math.min(5, Math.max(1, concurrency));

    let delayMs = Math.round(Number(merged.delayMs));
    if (!Number.isFinite(delayMs)) delayMs = 350;
    merged.delayMs = Math.min(2000, Math.max(0, delayMs));

    if (!['auto', 'light', 'dark'].includes(merged.theme)) merged.theme = 'auto';
    if (!['auto', 'zh', 'en'].includes(merged.language)) merged.language = 'auto';
    merged.showFab = merged.showFab !== false;
    merged.nativeSidebar = merged.nativeSidebar !== false;
    merged.snapshotOnDelete = merged.snapshotOnDelete !== false;
    return merged;
  }

  function folderDepth(folder, byId) {
    let depth = 0;
    let cur = folder;
    let guard = 0;
    while (cur && cur.parentId && guard < 100) {
      cur = byId.get(cur.parentId);
      if (!cur) break;
      depth += 1;
      guard += 1;
    }
    return depth;
  }

  /** 规范化文件夹树：去掉无效 parent、环、过深层级，并重排 order。 */
  function normalizeFolders(rawList) {
    const list = [];
    const seen = new Set();
    for (const raw of Array.isArray(rawList) ? rawList : []) {
      const folder = sanitizeFolder(raw);
      if (!folder || seen.has(folder.id)) continue;
      seen.add(folder.id);
      list.push(folder);
      if (list.length >= MAX_FOLDERS) break;
    }

    const byId = new Map(list.map((folder) => [folder.id, folder]));

    for (const folder of list) {
      if (folder.parentId === folder.id || (folder.parentId && !byId.has(folder.parentId))) {
        folder.parentId = null;
      }
    }

    // 断环
    for (const folder of list) {
      let cur = folder.parentId ? byId.get(folder.parentId) : null;
      let guard = 0;
      while (cur && guard <= list.length) {
        if (cur.id === folder.id) {
          folder.parentId = null;
          break;
        }
        cur = cur.parentId ? byId.get(cur.parentId) : null;
        guard += 1;
      }
    }

    // 深度上限
    for (let pass = 0; pass < 10; pass += 1) {
      let changed = false;
      for (const folder of list) {
        if (folderDepth(folder, byId) > MAX_DEPTH - 1) {
          folder.parentId = null;
          changed = true;
        }
      }
      if (!changed) break;
    }

    // 同层排序
    const groups = new Map();
    for (const folder of list) {
      const key = folder.parentId || '__root__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(folder);
    }
    for (const group of groups.values()) {
      group.sort((a, b) => (a.order - b.order) || (a.createdAt - b.createdAt));
      group.forEach((folder, index) => { folder.order = index; });
    }

    return list;
  }

  function sanitizeCache(rawCache) {
    const cache = rawCache && typeof rawCache === 'object' ? rawCache : {};
    return {
      items: sanitizeItems(cache.items),
      fetchedAt: Number(cache.fetchedAt) || 0,
      source: cache.source === 'dom' ? 'dom' : 'api',
    };
  }

  function migrate(raw) {
    const fromVersion = Number(raw.version) || 1;
    const folders = normalizeFolders(raw.folders);
    const folderIds = new Set(folders.map((folder) => folder.id));
    const assignments = sanitizeAssignments(raw.assignments, folderIds);
    const settings = clampSettings(raw.settings);
    const cache = sanitizeCache(raw.cache);
    return {
      changed: fromVersion !== 2,
      fromVersion,
      state: { version: 2, folders, assignments, settings, cache },
    };
  }

  /* ---------------- 持久化 ---------------- */

  const ready = (async () => {
    try {
      const data = await chrome.storage.local.get(KEY);
      const saved = data && data[KEY];
      if (saved && typeof saved === 'object') {
        let migrated;
        try {
          migrated = migrate(saved);
        } catch (error) {
          // 迁移失败时绝不覆盖原数据，以只读模式给出提示
          readOnly = true;
          throw error;
        }
        state = migrated.state;
        migrationInfo = { migrated: migrated.changed, fromVersion: migrated.fromVersion };
        readOnly = Number(saved.version) > 2;
        if (readOnly) {
          console.warn('[ChatKeeper] 本地数据由更新版本创建，当前版本只读');
        } else {
          try {
            await chrome.storage.local.set({ [LANG_KEY]: state.settings.language });
          } catch { /* ignore */ }
        }
        if (migrated.changed && !readOnly) {
          // 迁移前把 v1 的文件夹与归类备份到单独 key，便于意外时排查
          try {
            await chrome.storage.local.set({
              gptm_v1_backup: {
                savedAt: Date.now(),
                version: migrated.fromVersion,
                folders: saved.folders || [],
                assignments: saved.assignments || {},
                settings: saved.settings || {},
              },
            });
          } catch { /* ignore */ }
          scheduleSave();
        }
      }
    } catch (err) {
      console.warn('[ChatKeeper] 读取本地数据失败，使用默认值（只读，避免覆盖）', err);
      readOnly = true;
    }
    return state;
  })();

  function flush() {
    saveTimer = null;
    if (readOnly) return;
    try {
      chrome.storage.local.set({ [KEY]: state, [LANG_KEY]: state.settings.language }).catch((err) => {
        lastSaveError = err && err.message ? err.message : String(err);
        console.warn('[ChatKeeper] 保存本地数据失败', err);
      });
    } catch (err) {
      lastSaveError = err && err.message ? err.message : String(err);
      console.warn('[ChatKeeper] 保存本地数据失败', err);
    }
  }

  function scheduleSave() {
    if (readOnly) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 200);
  }

  function notify(reason) {
    scheduleSave();
    if (notifyTimer) clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => {
      notifyTimer = null;
      try {
        window.dispatchEvent(new CustomEvent('gptm:store-changed', { detail: { reason: reason || '' } }));
      } catch { /* ignore */ }
    }, 30);
  }

  window.addEventListener('pagehide', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      flush();
    }
  });

  function makeId(prefix) {
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${Date.now().toString(36)}_${rand}`;
  }

  /* ---------------- 读取 ---------------- */

  function getState() {
    return state;
  }

  function isReadOnly() {
    return readOnly;
  }

  function getLastError() {
    return lastSaveError;
  }

  function getMigrationInfo() {
    return Object.assign({}, migrationInfo);
  }

  function getFolderColors() {
    return FOLDER_COLORS.slice();
  }

  function getFolder(folderId) {
    return state.folders.find((folder) => folder.id === folderId) || null;
  }

  function getChildren(parentId) {
    return state.folders
      .filter((folder) => folder.parentId === (parentId || null))
      .sort((a, b) => (a.order - b.order) || (a.createdAt - b.createdAt));
  }

  /** 按树的前序顺序返回扁平列表，便于渲染和选择器。 */
  function getFolders() {
    const out = [];
    const visit = (parentId) => {
      for (const folder of getChildren(parentId)) {
        out.push(folder);
        visit(folder.id);
      }
    };
    visit(null);
    return out;
  }

  function getDescendantIds(folderId) {
    const out = new Set([folderId]);
    const walk = (parentId) => {
      for (const folder of state.folders) {
        if (folder.parentId === parentId && !out.has(folder.id)) {
          out.add(folder.id);
          walk(folder.id);
        }
      }
    };
    walk(folderId);
    return out;
  }

  function getFolderPath(folderId) {
    const path = [];
    let cur = getFolder(folderId);
    let guard = 0;
    while (cur && guard < 50) {
      path.unshift(cur);
      cur = cur.parentId ? getFolder(cur.parentId) : null;
      guard += 1;
    }
    return path;
  }

  function getFolderPathText(folderId, separator) {
    return getFolderPath(folderId).map((folder) => folder.name).join(separator || ' / ');
  }

  function getFolderDepth(folderId) {
    return Math.max(0, getFolderPath(folderId).length - 1);
  }

  function getSubtreeHeight(folderId) {
    let height = 0;
    const walk = (id, depth) => {
      height = Math.max(height, depth);
      for (const child of getChildren(id)) walk(child.id, depth + 1);
    };
    walk(folderId, 0);
    return height;
  }

  function getAssignedFolderId(conversationId) {
    const folderId = state.assignments[conversationId];
    return folderId && getFolder(folderId) ? folderId : null;
  }

  function getAssignedFolder(conversationId) {
    const folderId = getAssignedFolderId(conversationId);
    return folderId ? getFolder(folderId) : null;
  }

  function getAssignmentCount() {
    return Object.keys(state.assignments).length;
  }

  function getCache() {
    return state.cache;
  }

  function getSettings() {
    return state.settings;
  }

  /* ---------------- 文件夹写入 ---------------- */

  function createFolder(name, color, parentId) {
    const clean = String(name || '').trim().slice(0, 60);
    if (!clean) throw new Error(tr('文件夹名称不能为空'));
    if (state.folders.length >= MAX_FOLDERS) throw new Error(tr('文件夹数量已达上限'));
    let parent = parentId || null;
    if (parent && !getFolder(parent)) parent = null;
    if (parent && getFolderDepth(parent) >= MAX_DEPTH - 1) {
      throw new Error(tr('文件夹层级已达上限'));
    }
    const siblings = getChildren(parent);
    const folder = {
      id: makeId('f'),
      name: clean,
      color: FOLDER_COLORS.includes(color) ? color : FOLDER_COLORS[state.folders.length % FOLDER_COLORS.length],
      parentId: parent,
      order: siblings.length ? siblings[siblings.length - 1].order + 1 : 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    state.folders.push(folder);
    notify('folder-create');
    return folder;
  }

  function updateFolder(folderId, patch) {
    const folder = getFolder(folderId);
    if (!folder) return null;
    if (patch && typeof patch.name === 'string') {
      const clean = patch.name.trim().slice(0, 60);
      if (clean) folder.name = clean;
    }
    if (patch && typeof patch.color === 'string' && /^#[0-9a-f]{6}$/i.test(patch.color)) {
      folder.color = patch.color;
    }
    folder.updatedAt = Date.now();
    notify('folder-update');
    return folder;
  }

  function moveFolder(folderId, parentId) {
    const folder = getFolder(folderId);
    if (!folder) return false;
    const parent = parentId || null;
    if (parent === folderId) return false;
    if (parent) {
      if (!getFolder(parent)) return false;
      if (getDescendantIds(folderId).has(parent)) return false;
      if (getFolderDepth(parent) + 1 + getSubtreeHeight(folderId) > MAX_DEPTH - 1) return false;
    }
    folder.parentId = parent;
    folder.order = getChildren(parent).filter((item) => item.id !== folderId).length;
    folder.updatedAt = Date.now();
    state.folders = normalizeFolders(state.folders);
    notify('folder-move');
    return true;
  }

  function reorderFolder(folderId, delta) {
    const folder = getFolder(folderId);
    if (!folder) return false;
    const siblings = getChildren(folder.parentId);
    const index = siblings.findIndex((item) => item.id === folderId);
    const target = index + (delta > 0 ? 1 : -1);
    if (index < 0 || target < 0 || target >= siblings.length) return false;
    const other = siblings[target];
    const tmp = folder.order;
    folder.order = other.order;
    other.order = tmp;
    state.folders = normalizeFolders(state.folders);
    notify('folder-order');
    return true;
  }

  /**
   * 删除文件夹：子文件夹提升到上一级，仅清除该文件夹的直接归类，不删除任何 ChatGPT 对话。
   */
  function deleteFolder(folderId) {
    const folder = getFolder(folderId);
    if (!folder) return null;
    let promoted = 0;
    for (const child of state.folders) {
      if (child.parentId === folderId) {
        child.parentId = folder.parentId;
        promoted += 1;
      }
    }
    let uncategorized = 0;
    for (const [conversationId, assignedId] of Object.entries(state.assignments)) {
      if (assignedId === folderId) {
        delete state.assignments[conversationId];
        uncategorized += 1;
      }
    }
    state.folders = state.folders.filter((item) => item.id !== folderId);
    state.folders = normalizeFolders(state.folders);
    notify('folder-delete');
    return { promoted, uncategorized };
  }

  function assign(conversationIds, folderId) {
    const target = folderId === null ? null : (getFolder(folderId) ? folderId : undefined);
    if (target === undefined) return 0;
    let changed = 0;
    for (const id of conversationIds) {
      if (typeof id !== 'string' || !id || id.length > 120) continue;
      if (target === null) {
        if (state.assignments[id]) {
          delete state.assignments[id];
          changed += 1;
        }
      } else if (state.assignments[id] !== target) {
        state.assignments[id] = target;
        changed += 1;
      }
    }
    if (changed) notify('assign');
    return changed;
  }

  function forgetConversations(conversationIds) {
    let changed = 0;
    for (const id of conversationIds) {
      if (state.assignments[id]) {
        delete state.assignments[id];
        changed += 1;
      }
    }
    if (changed) notify('forget');
    return changed;
  }

  /* ---------------- 统计 ---------------- */

  function countFolders() {
    const direct = {};
    for (const folder of state.folders) direct[folder.id] = 0;
    let all = 0;
    let none = 0;
    for (const item of state.cache.items) {
      all += 1;
      const folderId = state.assignments[item.id];
      if (folderId && direct[folderId] !== undefined) direct[folderId] += 1;
      else none += 1;
    }
    const total = Object.assign({}, direct);
    const ordered = getFolders().slice().reverse();
    for (const folder of ordered) {
      if (folder.parentId && total[folder.parentId] !== undefined) {
        total[folder.parentId] += total[folder.id];
      }
    }
    return { all, none, direct, total };
  }

  /* ---------------- 设置与缓存 ---------------- */

  function setSettings(patch) {
    const next = clampSettings(Object.assign({}, state.settings, patch));
    const languageChanged = next.language !== state.settings.language;
    state.settings = next;
    if (languageChanged && !readOnly) {
      try {
        chrome.storage.local.set({ [LANG_KEY]: next.language }).catch(() => {});
      } catch { /* ignore */ }
    }
    notify('settings');
    return state.settings;
  }

  function setCache(items, source) {
    state.cache = {
      items: sanitizeItems(items),
      fetchedAt: Date.now(),
      source: source === 'dom' ? 'dom' : 'api',
    };
    notify('cache');
    return state.cache;
  }

  function clearCache() {
    state.cache = { items: [], fetchedAt: 0, source: 'api' };
    notify('cache-clear');
  }

  function clearFolders() {
    state.folders = [];
    state.assignments = {};
    notify('folders-clear');
  }

  /* ---------------- 导入 / 导出 ---------------- */

  function exportData() {
    return {
      app: 'ChatKeeper',
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      folders: state.folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        color: folder.color,
        parentId: folder.parentId,
        order: folder.order,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
      })),
      assignments: Object.assign({}, state.assignments),
      conversations: state.cache.items.map((item) => ({
        id: item.id,
        title: item.title,
        folderId: state.assignments[item.id] || null,
        updateTime: item.updateTime,
      })),
      settings: Object.assign({}, state.settings),
    };
  }

  function treeOrder(folders) {
    const byParent = new Map();
    for (const folder of folders) {
      const key = folder.parentId || '__root__';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(folder);
    }
    for (const list of byParent.values()) list.sort((a, b) => (a.order - b.order) || (a.createdAt - b.createdAt));
    const out = [];
    const visit = (parentId) => {
      for (const folder of byParent.get(parentId || '__root__') || []) {
        out.push(folder);
        visit(folder.id);
      }
    };
    visit(null);
    return out;
  }

  /**
   * 导入数据。
   * @param {object} payload 导出文件内容（兼容 v1）
   * @param {{mode:'merge'|'replace', overwrite?:boolean}} options
   */
  function importData(payload, options) {
    if (!payload || typeof payload !== 'object') throw new Error(tr('数据格式不正确'));
    const mode = options && options.mode === 'replace' ? 'replace' : 'merge';
    const overwrite = Boolean(options && options.overwrite);

    const imported = normalizeFolders(payload.folders);
    if (mode === 'replace') {
      state.folders = [];
      state.assignments = {};
    }

    const existing = state.folders;
    const existingByKey = new Map();
    for (const folder of existing) {
      existingByKey.set(`${folder.parentId || ''} ${folder.name.toLowerCase()}`, folder);
    }

    const idMap = new Map();
    let foldersAdded = 0;
    let foldersReused = 0;

    for (const folder of treeOrder(imported)) {
      const mappedParent = folder.parentId ? (idMap.get(folder.parentId) || null) : null;
      if (folder.parentId && !idMap.has(folder.parentId)) continue; // 父级未能导入，跳过
      const key = `${mappedParent || ''} ${folder.name.toLowerCase()}`;
      const match = existingByKey.get(key);
      if (match) {
        idMap.set(folder.id, match.id);
        foldersReused += 1;
        continue;
      }
      if (state.folders.length >= MAX_FOLDERS) continue;
      const created = {
        id: makeId('f'),
        name: folder.name,
        color: folder.color,
        parentId: mappedParent,
        order: getChildren(mappedParent).length,
        createdAt: folder.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      state.folders.push(created);
      existingByKey.set(key, created);
      idMap.set(folder.id, created.id);
      foldersAdded += 1;
    }

    let assignmentsApplied = 0;
    let assignmentsSkipped = 0;
    const sourceAssignments = payload.assignments && typeof payload.assignments === 'object'
      ? payload.assignments
      : {};
    let budget = MAX_ASSIGNMENTS;
    for (const [conversationId, oldFolderId] of Object.entries(sourceAssignments)) {
      if (budget <= 0) break;
      if (typeof conversationId !== 'string' || !conversationId || conversationId.length > 120) {
        assignmentsSkipped += 1;
        continue;
      }
      const newFolderId = idMap.get(oldFolderId);
      if (!newFolderId) {
        assignmentsSkipped += 1;
        continue;
      }
      const current = state.assignments[conversationId];
      if (mode === 'merge' && !overwrite && current && getFolder(current)) {
        assignmentsSkipped += 1;
        continue;
      }
      state.assignments[conversationId] = newFolderId;
      assignmentsApplied += 1;
      budget -= 1;
    }

    state.folders = normalizeFolders(state.folders);
    notify('import');

    return {
      mode,
      foldersAdded,
      foldersReused,
      assignmentsApplied,
      assignmentsSkipped,
      totalFoldersInFile: imported.length,
    };
  }

  const store = {
    ready,
    getState,
    getSettings,
    isReadOnly,
    getLastError,
    getMigrationInfo,
    getFolderColors,
    getFolder,
    getFolders,
    getChildren,
    getDescendantIds,
    getFolderPath,
    getFolderPathText,
    getFolderDepth,
    getSubtreeHeight,
    getAssignedFolder,
    getAssignedFolderId,
    getAssignmentCount,
    getCache,
    createFolder,
    updateFolder,
    moveFolder,
    reorderFolder,
    deleteFolder,
    assign,
    forgetConversations,
    countFolders,
    setSettings,
    setCache,
    clearCache,
    clearFolders,
    exportData,
    importData,
    notify,
  };

  GPTM.store = store;
})();
