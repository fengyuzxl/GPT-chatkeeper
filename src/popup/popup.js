'use strict';

const statusEl = document.getElementById('status');
const openBtn = document.getElementById('open');
const helpBtn = document.getElementById('help');
const shortcutEl = document.getElementById('shortcut');
const t = (source, params) => window.GPTM.i18n.t(source, params);

let activeTab = null;
let onChatGPT = false;

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (cls ? ' ' + cls : '');
}

async function init() {
  await window.GPTM.i18n.initPage();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab || null;
    const url = (tab && tab.url) || '';
    onChatGPT = /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(url);

    if (onChatGPT) {
      setStatus(t('已检测到 ChatGPT 标签页，可以打开面板。'), 'ok');
      openBtn.disabled = false;
      openBtn.textContent = t('在 ChatGPT 中打开面板');
    } else {
      setStatus(t('当前不在 ChatGPT 页面。点击下方按钮前往 chatgpt.com。'), 'warn');
      openBtn.disabled = false;
      openBtn.textContent = t('前往 ChatGPT');
    }
  } catch (err) {
    setStatus(t('无法读取当前标签页：{message}', { message: err.message }), 'warn');
    openBtn.disabled = false;
    openBtn.textContent = t('前往 ChatGPT');
  }

  try {
    const commands = await chrome.commands.getAll();
    const toggle = commands.find((c) => c.name === 'toggle-panel');
    if (toggle && toggle.shortcut) shortcutEl.textContent = toggle.shortcut;
  } catch {
    /* 忽略 */
  }
}

openBtn.addEventListener('click', async () => {
  if (!onChatGPT) {
    chrome.tabs.create({ url: 'https://chatgpt.com/' });
    window.close();
    return;
  }
  try {
    await chrome.tabs.sendMessage(activeTab.id, { type: 'GPTM_OPEN' });
    window.close();
  } catch {
    setStatus(t('内容脚本未响应。如果你刚安装扩展，请刷新 ChatGPT 页面后重试。'), 'warn');
  }
});

helpBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/welcome.html') });
  window.close();
});

init();
