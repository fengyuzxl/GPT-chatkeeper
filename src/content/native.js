/* ChatKeeper - ChatGPT 原生侧边栏增强
 *
 * 在 ChatGPT 自带的对话列表上叠加：文件夹色条、悬浮复选框、
 * 底部批量操作栏、右键菜单。尽量不改动 React 管理的节点，
 * 只追加自己的元素和属性，并支持随时关闭与清理。
 */
(() => {
  'use strict';

  const GPTM = (window.GPTM = window.GPTM || {});
  const api = GPTM.api;
  const store = GPTM.store;
  const t = (source, params) => GPTM.i18n.t(source, params);

  let started = false;
  let observer = null;
  let rootEl = null;
  let reconcileTimer = null;
  let bulkPoll = null;
  let selection = new Set();
  const titles = new Map();

  function isEnabledSetting() {
    return store.getSettings().nativeSidebar !== false;
  }

  function detectRoot() {
    const selectors = ['#history', '[data-testid="history"]', 'nav', 'aside'];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node && node.querySelector('a[href*="/c/"]')) return node;
    }
    const anchors = Array.from(document.querySelectorAll('a[href*="/c/"]'))
      .filter((anchor) => !anchor.closest('main, [role="main"]'));
    if (!anchors.length) return null;
    let node = anchors[0].parentElement;
    let guard = 0;
    while (node && node !== document.body && guard < 8) {
      if (node.querySelectorAll('a[href*="/c/"]').length >= 2) return node;
      node = node.parentElement;
      guard += 1;
    }
    return anchors[0].parentElement;
  }

  function getLinks(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll('a[href*="/c/"]'));
  }

  function findItemContainer(anchor, root) {
    let node = anchor;
    let guard = 0;
    while (node && node.parentElement && node.parentElement !== root && guard < 8) {
      const parent = node.parentElement;
      if (parent.querySelectorAll('a[href*="/c/"]').length <= 1) return parent;
      node = parent;
      guard += 1;
    }
    const li = anchor.closest('li');
    if (li && li !== root) return li;
    return anchor.parentElement && anchor.parentElement !== root ? anchor.parentElement : null;
  }

  function titleForAnchor(anchor) {
    const text = (anchor.getAttribute('aria-label') || anchor.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 300) || t('无标题对话');
  }

  function stopEvent(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function ensureCheckbox(item, id) {
    let box = item.querySelector(':scope > .gptm-native-check');
    if (!box) {
      box = document.createElement('button');
      box.type = 'button';
      box.className = 'gptm-native-check';
      box.setAttribute('role', 'checkbox');
      box.setAttribute('aria-label', t('选择对话'));
      box.addEventListener('mousedown', stopEvent, true);
      box.addEventListener('pointerdown', stopEvent, true);
      box.addEventListener('click', (event) => {
        stopEvent(event);
        toggleSelection(id);
      });
      box.addEventListener('keydown', (event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          stopEvent(event);
          toggleSelection(id);
        }
      });
      item.appendChild(box);
    }
    box.dataset.gptmId = id;
    box.setAttribute('aria-label', t('选择对话'));
    return box;
  }

  function decorate(anchor, item, id) {
    if (!item) return;
    if (item.dataset.gptmItem && item.dataset.gptmItem !== id) return;
    item.setAttribute('data-gptm-item', id);
    const folder = store.getAssignedFolder(id);
    if (folder) {
      item.setAttribute('data-gptm-folder-color', folder.color);
      item.style.setProperty('--gptm-native-color', folder.color);
    } else {
      item.removeAttribute('data-gptm-folder-color');
      item.style.removeProperty('--gptm-native-color');
    }
    ensureCheckbox(item, id);
  }

  function cleanupItem(item) {
    item.querySelectorAll('.gptm-native-check').forEach((node) => node.remove());
    item.removeAttribute('data-gptm-item');
    item.removeAttribute('data-gptm-selected');
    item.removeAttribute('data-gptm-folder-color');
    item.style.removeProperty('--gptm-native-color');
    item.querySelectorAll('[data-gptm-folder-color]').forEach((node) => {
      node.removeAttribute('data-gptm-folder-color');
      node.style.removeProperty('--gptm-native-color');
    });
  }

  function syncSelectionUI() {
    if (!rootEl) return;
    rootEl.querySelectorAll('[data-gptm-item]').forEach((item) => {
      const id = item.dataset.gptmItem;
      const selected = selection.has(id);
      item.setAttribute('data-gptm-selected', selected ? 'true' : 'false');
      const box = item.querySelector('.gptm-native-check');
      if (box) {
        box.setAttribute('aria-checked', selected ? 'true' : 'false');
        box.setAttribute('aria-label', t('选择对话'));
      }
    });
    updateBar();
  }

  function updateBar(working, text) {
    if (!GPTM.panel || typeof GPTM.panel.updateNativeBar !== 'function') return;
    GPTM.panel.updateNativeBar({
      count: selection.size,
      working: Boolean(working || GPTM.panel.isBusy()),
      text: text || '',
    });
  }

  function refreshBarText() {
    if (bulkPoll) return;
    updateBar(false, '');
  }

  function toggleSelection(id) {
    if (selection.has(id)) selection.delete(id);
    else selection.add(id);
    syncSelectionUI();
  }

  function clearSelection() {
    selection = new Set();
    syncSelectionUI();
  }

  function reconcile() {
    if (!started) return;
    if (rootEl && !rootEl.isConnected) rootEl = null;
    const root = rootEl || detectRoot();
    rootEl = root;
    if (!root) {
      updateBar(false, '');
      return;
    }

    const anchors = getLinks(root);
    const seenItems = new Set();
    titles.clear();

    for (const anchor of anchors) {
      const id = api.conversationIdFromHref(anchor.getAttribute('href') || '');
      if (!id) continue;
      titles.set(id, titleForAnchor(anchor));
      const item = findItemContainer(anchor, root);
      if (!item) continue;
      seenItems.add(item);
      decorate(anchor, item, id);
    }

    root.querySelectorAll('[data-gptm-item]').forEach((item) => {
      if (!seenItems.has(item)) cleanupItem(item);
    });

    syncSelectionUI();
  }

  function scheduleReconcile(delay) {
    if (!started) return;
    if (reconcileTimer) clearTimeout(reconcileTimer);
    reconcileTimer = setTimeout(() => {
      reconcileTimer = null;
      reconcile();
    }, typeof delay === 'number' ? delay : 180);
  }

  function watchBulk() {
    if (bulkPoll) return;
    const startedAt = Date.now();
    let sawBusy = false;
    bulkPoll = setInterval(() => {
      if (!started) {
        clearInterval(bulkPoll);
        bulkPoll = null;
        return;
      }
      if (GPTM.panel.isBusy()) {
        sawBusy = true;
        const progress = GPTM.panel.getBulkProgress();
        if (progress) {
          updateBar(true, t(progress.kind === 'delete'
            ? '删除中 {done}/{total} · 成功 {ok} · 失败 {failed}'
            : '归档中 {done}/{total} · 成功 {ok} · 失败 {failed}', progress));
        }
        return;
      }
      if (sawBusy || Date.now() - startedAt > 60000) {
        clearInterval(bulkPoll);
        bulkPoll = null;
        if (sawBusy) {
          clearSelection();
          scheduleReconcile(120);
        }
      }
    }, 500);
  }

  function panelShadow() {
    const host = document.getElementById('gptm-root');
    return host && host.shadowRoot ? host.shadowRoot : null;
  }

  function barAnchor() {
    const shadow = panelShadow();
    return (shadow && shadow.getElementById('gptm-native-move')) || null;
  }

  function onCommand(event) {
    if (!started || !event || !event.detail) return;
    const command = event.detail.command;
    const ids = Array.from(selection);
    if (!ids.length) return;

    if (command === 'clear') {
      clearSelection();
      return;
    }

    if (command === 'move') {
      const moving = ids.slice();
      const anchor = barAnchor();
      GPTM.panel.openFolderPickerFor(moving, anchor || { x: window.innerWidth / 2 - 90, y: window.innerHeight - 150 }, () => {
        moving.forEach((id) => selection.delete(id));
        syncSelectionUI();
      });
      return;
    }

    if (command === 'archive' || command === 'delete') {
      GPTM.panel.confirmBulk(command, ids, titles);
      watchBulk();
    }
  }

  function onContextMenu(event) {
    if (!started) return;
    if (GPTM.panel && GPTM.panel.isOpen()) return;
    const root = rootEl && rootEl.isConnected ? rootEl : detectRoot();
    if (!root) return;
    const anchor = event.target && event.target.closest ? event.target.closest('a[href*="/c/"]') : null;
    if (!anchor || !root.contains(anchor)) return;
    const id = api.conversationIdFromHref(anchor.getAttribute('href') || '');
    if (!id) return;

    event.preventDefault();
    event.stopPropagation();

    const isSelected = selection.has(id);
    const ids = isSelected ? Array.from(selection) : [id];
    titles.set(id, titleForAnchor(anchor));
    const titleMap = new Map();
    ids.forEach((itemId) => titleMap.set(itemId, titles.get(itemId) || itemId));

    const folder = store.getAssignedFolder(id);
    const items = [
      { label: t('打开对话'), onClick: () => window.open(`/c/${encodeURIComponent(id)}`, '_blank', 'noopener') },
      {
        label: isSelected ? t('取消选择') : t('选择/取消选择'),
        onClick: () => toggleSelection(id),
      },
      { sep: true },
      {
        label: t('移动到文件夹…'),
        onClick: () => {
          const moving = ids.slice();
          GPTM.panel.openFolderPickerFor(moving, { x: event.clientX, y: event.clientY }, () => {
            moving.forEach((itemId) => selection.delete(itemId));
            syncSelectionUI();
          });
        },
      },
    ];

    if (folder) {
      items.push({
        label: t('移出文件夹'),
        onClick: () => {
          store.assign(ids, null);
          GPTM.panel.refreshView();
          scheduleReconcile(60);
        },
      });
    }

    items.push(
      { sep: true },
      {
        label: t('归档'),
        onClick: () => {
          GPTM.panel.confirmBulk('archive', ids, titleMap);
          watchBulk();
        },
      },
      {
        label: t('删除'),
        danger: true,
        onClick: () => {
          GPTM.panel.confirmBulk('delete', ids, titleMap);
          watchBulk();
        },
      }
    );

    GPTM.panel.showMenuAtPoint({ x: event.clientX, y: event.clientY }, items);
  }

  function onKeyDown(event) {
    if (!started || event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return;
    if (!selection.size) return;
    if (GPTM.panel && GPTM.panel.isOpen()) return;
    const shadow = panelShadow();
    if (shadow) {
      const modal = shadow.getElementById('gptm-modal');
      const menu = shadow.getElementById('gptm-menu');
      if ((modal && !modal.hidden) || (menu && !menu.hidden)) return;
    }
    event.preventDefault();
    event.stopPropagation();
    clearSelection();
  }

  function onStoreChanged(event) {
    if (!started) return;
    const reason = event && event.detail ? event.detail.reason : '';
    if (reason === 'settings') {
      if (!isEnabledSetting()) {
        stop();
        return;
      }
    }
    // 对话被删除/归档后，从原生选择中移除已不存在的 ID
    if (selection.size && (reason === 'cache' || reason === 'forget')) {
      const cacheItems = store.getCache().items;
      if (cacheItems.length) {
        const alive = new Set(cacheItems.map((item) => item.id));
        let changed = false;
        for (const id of Array.from(selection)) {
          if (!alive.has(id)) {
            selection.delete(id);
            changed = true;
          }
        }
        if (changed) syncSelectionUI();
      }
    }
    scheduleReconcile(80);
  }

  function onLanguageChanged() {
    if (started) {
      syncSelectionUI();
      scheduleReconcile(80);
    }
  }

  function isRelevantNode(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.matches && node.matches('.gptm-native-check')) return false;
    if (node.matches && node.matches('a[href*="/c/"]')) return true;
    if (node.querySelectorAll && node.querySelectorAll('a[href*="/c/"]').length) return true;
    return false;
  }

  function start() {
    if (started) return;
    started = true;
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (isRelevantNode(node)) {
            scheduleReconcile(220);
            return;
          }
        }
        for (const node of mutation.removedNodes) {
          if (isRelevantNode(node)) {
            scheduleReconcile(220);
            return;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('gptm:native-command', onCommand);
    window.addEventListener('gptm:store-changed', onStoreChanged);
    window.addEventListener('gptm:language', onLanguageChanged);
    scheduleReconcile(60);
  }

  function stop() {
    if (!started) return;
    started = false;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (reconcileTimer) {
      clearTimeout(reconcileTimer);
      reconcileTimer = null;
    }
    if (bulkPoll) {
      clearInterval(bulkPoll);
      bulkPoll = null;
    }
    document.removeEventListener('contextmenu', onContextMenu, true);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('gptm:native-command', onCommand);
    window.removeEventListener('gptm:store-changed', onStoreChanged);
    window.removeEventListener('gptm:language', onLanguageChanged);

    if (rootEl) {
      rootEl.querySelectorAll('[data-gptm-item]').forEach(cleanupItem);
    }
    selection = new Set();
    if (GPTM.panel && typeof GPTM.panel.updateNativeBar === 'function') {
      GPTM.panel.updateNativeBar({ count: 0, working: false });
    }
    rootEl = null;
  }

  function setEnabled(on) {
    if (on) start();
    else stop();
  }

  function refresh() {
    if (!isEnabledSetting()) return;
    if (!started) start();
    rootEl = null;
    scheduleReconcile(50);
  }

  function init() {
    if (isEnabledSetting()) start();
  }

  function getStatus() {
    const root = rootEl && rootEl.isConnected ? rootEl : detectRoot();
    const links = getLinks(root).length;
    let detail = '';
    if (!started) detail = '';
    else if (root) detail = t('原生侧边栏已检测到 {count} 个对话', { count: links });
    else detail = t('未检测到原生侧边栏，可在设置中重新检测');
    return { enabled: started, root: Boolean(root), links, detail };
  }

  GPTM.native = {
    init,
    start,
    stop,
    setEnabled,
    refresh,
    getStatus,
    isEnabled: () => started,
  };
})();
