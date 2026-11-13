/* ChatKeeper - 输入框旁的一键优化按钮
 *
 * 优先把按钮插入 ChatGPT 发送按钮所在的工具栏；找不到时退化为右下角悬浮按钮。
 * 点击后读取输入框内容，用 GLM-4-Flash（或本地规则）优化并直接替换，
 * 同时给一个 9 秒内可点的「撤销」。全程不会自动发送消息。
 */
(() => {
  'use strict';

  const GPTM = (window.GPTM = window.GPTM || {});
  const t = (source, params) => GPTM.i18n.t(source, params);
  const BUTTON_ID = 'gptm-quick-optimize';
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"/></svg>';

  let inited = false;
  let started = false;
  let busy = false;
  let observer = null;
  let timer = null;
  let poll = null;
  let button = null;
  let mode = '';
  let generation = 0;

  function getConfig() {
    return GPTM.ai ? GPTM.ai.getConfig() : { quickButton: true, style: 'structured' };
  }

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function findSendButton() {
    const selectors = [
      'button[data-testid="send-button"]',
      'button[data-testid="composer-submit-button"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="发送"]',
      'form button[type="submit"]',
    ];
    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        if (!node.getClientRects().length) continue;
        if (node.closest && node.closest('#gptm-root')) continue;
        return node;
      }
    }
    return null;
  }

  function updateLabel() {
    if (!button) return;
    const label = t('一键优化提示词');
    button.title = label;
    button.setAttribute('aria-label', label);
  }

  function createButton() {
    if (button) return;
    button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = 'gptm-quick-optimize';
    button.innerHTML = ICON;
    const stop = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    button.addEventListener('mousedown', stop, true);
    button.addEventListener('pointerdown', stop, true);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      runOptimize();
    });
    updateLabel();
  }

  function removeButton() {
    if (button) {
      button.remove();
      button = null;
    }
    mode = '';
  }

  function reconcile() {
    if (!started) return;
    if (!getConfig().quickButton) {
      removeButton();
      return;
    }
    const composer = GPTM.composer.find();
    if (!composer) {
      removeButton();
      return;
    }
    if (!button || !button.isConnected) createButton();
    updateLabel();

    const send = findSendButton();
    if (send && send.parentElement) {
      if (button.parentElement !== send.parentElement || button.nextElementSibling !== send) {
        send.parentElement.insertBefore(button, send);
      }
      if (mode !== 'toolbar') {
        button.classList.remove('gptm-quick-fixed');
        mode = 'toolbar';
      }
    } else if (mode !== 'fixed' || !button.isConnected) {
      document.body.appendChild(button);
      button.classList.add('gptm-quick-fixed');
      mode = 'fixed';
    }
  }

  function setBusy(value) {
    busy = value;
    if (!button) return;
    button.dataset.busy = value ? 'true' : 'false';
    button.disabled = value;
  }

  function notify(message, kind, label, onClick) {
    if (!GPTM.ui || typeof GPTM.ui.toast !== 'function') return;
    if (label) GPTM.ui.toast(message, kind, 9000, { label, onClick });
    else GPTM.ui.toast(message, kind);
  }

  function applyResult(source, content, isLocal) {
    const text = String(content || '').trim();
    if (!text) {
      notify(t('模型返回空内容，请重试或改用 glm-4-flash'), 'err');
      return;
    }
    const ok = GPTM.composer.write(text);
    const expected = text.replace(/\s+/g, ' ').slice(0, 40);
    const current = GPTM.composer.read().replace(/\s+/g, ' ');
    if (!ok || (expected && !current.includes(expected))) {
      GPTM.composer.copy(text).then((copied) => {
        notify(copied
          ? t('未找到 ChatGPT 输入框，已复制到剪贴板')
          : t('复制失败，请手动复制'), 'warn');
      });
      return;
    }

    const gen = ++generation;
    notify(
      isLocal ? t('已使用本地规则优化') : t('提示词已优化'),
      'ok',
      t('撤销'),
      () => {
        if (gen !== generation) return;
        const now = GPTM.composer.read();
        if (normalize(now) === normalize(text)) {
          GPTM.composer.write(source);
          notify(t('已撤销'), 'ok');
        } else {
          notify(t('输入框已修改，无法撤销'), 'warn');
        }
      }
    );
  }

  async function runOptimize() {
    if (busy) return;
    if (!GPTM.ai) {
      notify(t('提示词模块未加载'), 'err');
      return;
    }
    const source = GPTM.composer.read();
    if (!source.trim()) {
      notify(t('请先输入提示词'), 'warn');
      const composer = GPTM.composer.find();
      if (composer) composer.focus();
      return;
    }

    const gen = ++generation;
    setBusy(true);
    try {
      const result = await GPTM.ai.optimize(source, { style: getConfig().style || 'structured' });
      if (gen !== generation) return;
      // 请求期间用户如果改了输入框，不覆盖用户的新内容
      if (normalize(GPTM.composer.read()) !== normalize(source)) {
        notify(t('输入框已修改，已放弃本次优化'), 'warn', t('复制结果'), () => {
          GPTM.composer.copy(result.content).then((copied) => {
            notify(copied ? t('已复制') : t('复制失败，请手动复制'), copied ? 'ok' : 'err');
          });
        });
        return;
      }
      applyResult(source, result.content, result.local);
    } catch (err) {
      if (gen !== generation) return;
      notify(
        t('优化失败：{message}', { message: GPTM.ai.errorText(err) }),
        'err',
        t('使用本地规则'),
        () => {
          const current = GPTM.composer.read();
          const basis = current.trim() ? current : source;
          const local = GPTM.ai.localOptimize(basis, getConfig().style || 'structured');
          applyResult(basis, local, true);
        }
      );
    } finally {
      setBusy(false);
    }
  }

  function schedule(delay) {
    if (!started) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      reconcile();
    }, typeof delay === 'number' ? delay : 180);
  }

  function start() {
    if (started) return;
    started = true;
    observer = new MutationObserver(() => schedule(200));
    observer.observe(document.body, { childList: true, subtree: true });
    poll = setInterval(() => schedule(0), 2500);
    schedule(0);
  }

  function stop() {
    if (!started) return;
    started = false;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (poll) {
      clearInterval(poll);
      poll = null;
    }
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    removeButton();
    busy = false;
  }

  function onConfigChanged() {
    if (getConfig().quickButton) {
      if (!started) start();
      else schedule(60);
    } else {
      stop();
    }
  }

  function onLanguageChanged() {
    updateLabel();
  }

  function init() {
    if (inited) return;
    inited = true;
    window.addEventListener('gptm:ai-config', onConfigChanged);
    window.addEventListener('gptm:language', onLanguageChanged);
    if (getConfig().quickButton) start();
  }

  GPTM.quickOptimize = {
    init,
    start,
    stop,
    refresh: () => schedule(0),
  };
})();
