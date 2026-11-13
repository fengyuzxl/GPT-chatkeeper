/* ChatKeeper - ChatGPT 输入框读写（公共模块）
 *
 * 供提示词库与输入框旁的「一键优化」按钮共用。
 * 只写入文本，不触发发送。
 */
(() => {
  'use strict';

  const GPTM = (window.GPTM = window.GPTM || {});

  function find() {
    const selectors = [
      '#prompt-textarea',
      'textarea[data-id="root"]',
      'form textarea',
      'main textarea',
      '[contenteditable="true"][data-lexical-editor="true"]',
      'main [contenteditable="true"]',
      '[contenteditable="true"]',
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

  function read() {
    const node = find();
    if (!node) return '';
    if (node.tagName === 'TEXTAREA' || node.tagName === 'INPUT') return node.value || '';
    return (node.innerText || node.textContent || '').trim();
  }

  function write(text) {
    const node = find();
    if (!node) return false;
    try {
      node.focus();
      if (node.tagName === 'TEXTAREA' || node.tagName === 'INPUT') {
        const proto = node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(node, text);
        else node.value = text;
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      let inserted = false;
      try {
        inserted = document.execCommand('insertText', false, text);
      } catch { /* ignore */ }
      if (!inserted) {
        node.textContent = text;
        try {
          node.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        } catch {
          node.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      return true;
    } catch (err) {
      console.warn('[ChatKeeper] 写入输入框失败', err);
      return false;
    }
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* fall through */ }
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      document.body.appendChild(area);
      area.focus();
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }

  GPTM.composer = { find, read, write, copy };
})();
