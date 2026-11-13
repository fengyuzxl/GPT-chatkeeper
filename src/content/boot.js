/* ChatKeeper - 内容脚本入口 */
(() => {
  'use strict';

  if (window.__gptmBooted) return;
  window.__gptmBooted = true;

  const GPTM = window.GPTM;
  if (!GPTM || !GPTM.panel) {
    console.error('[ChatKeeper] 模块未正确加载');
    return;
  }

  function start() {
    Promise.all([
      Promise.resolve(GPTM.store.ready),
      Promise.resolve(GPTM.ai ? GPTM.ai.ready : null),
    ])
      .then(() => {
        GPTM.i18n.setLanguage(GPTM.store.getSettings().language);
        GPTM.panel.mount();
        if (GPTM.native && typeof GPTM.native.init === 'function') {
          GPTM.native.init();
        }
        if (GPTM.quickOptimize && typeof GPTM.quickOptimize.init === 'function') {
          GPTM.quickOptimize.init();
        }
      })
      .catch((err) => {
        console.error('[ChatKeeper] 初始化失败', err);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  // 接收工具栏弹窗与快捷键转发过来的打开指令
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return false;
    if (msg.type === 'GPTM_TOGGLE') {
      GPTM.panel.toggle();
      sendResponse({ ok: true });
    } else if (msg.type === 'GPTM_OPEN') {
      GPTM.panel.open();
      sendResponse({ ok: true });
    }
    return false;
  });
})();
