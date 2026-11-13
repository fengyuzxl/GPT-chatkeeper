/* ChatKeeper - background service worker (MV3) */
'use strict';

const STATE_KEY = 'gptm_state_v1';
const AI_CONFIG_KEY = 'gptm_ai_config';
const AI_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const AI_TIMEOUT_MS = 60000;
const DEFAULT_AI_MODEL = 'glm-4-flash';

function sanitizeModel(value) {
  const model = typeof value === 'string' ? value.trim() : '';
  return /^[a-zA-Z0-9._-]{1,64}$/.test(model) ? model : DEFAULT_AI_MODEL;
}

function sanitizeMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 12) return null;
  const out = [];
  let chars = 0;
  for (const message of raw) {
    if (!message || typeof message.content !== 'string') return null;
    if (!['system', 'user', 'assistant'].includes(message.role)) return null;
    const content = message.content.slice(0, 16000);
    chars += content.length;
    if (chars > 30000) return null;
    out.push({ role: message.role, content });
  }
  return out;
}

function mapHttpError(status) {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'server';
  if (status === 400 || status === 404 || status === 422) return 'bad-request';
  return 'unknown';
}

async function handleAiChat(payload) {
  let stored;
  try {
    stored = await chrome.storage.local.get(AI_CONFIG_KEY);
  } catch {
    return { ok: false, code: 'storage', error: 'Could not read the local API key' };
  }
  const config = (stored && stored[AI_CONFIG_KEY]) || {};
  const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : '';
  if (!apiKey) return { ok: false, code: 'no-key', error: 'No API key configured' };

  const model = sanitizeModel(payload && payload.model ? payload.model : config.model);
  const messages = sanitizeMessages(payload && payload.messages);
  if (!messages) return { ok: false, code: 'bad-request', error: 'Invalid messages' };

  const temperature = Number.isFinite(Number(payload && payload.temperature))
    ? Math.min(1, Math.max(0, Number(payload.temperature)))
    : 0.3;
  const maxTokens = Number.isFinite(Number(payload && payload.maxTokens))
    ? Math.min(4096, Math.max(16, Math.round(Number(payload.maxTokens))))
    : 2048;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });

    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* ignore */ }

    if (!response.ok) {
      const detail = data && (data.error && data.error.message || data.message)
        ? String(data.error && data.error.message || data.message)
        : String(text || '').slice(0, 240);
      return {
        ok: false,
        status: response.status,
        code: mapHttpError(response.status),
        error: detail.slice(0, 240),
      };
    }

    const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
    const content = choice && choice.message && typeof choice.message.content === 'string'
      ? choice.message.content.trim()
      : '';
    if (!content) {
      return {
        ok: false,
        code: 'empty-content',
        error: 'The model returned an empty result',
        finish: choice && choice.finish_reason ? choice.finish_reason : '',
      };
    }
    return { ok: true, content, model };
  } catch (err) {
    const aborted = err && err.name === 'AbortError';
    return {
      ok: false,
      code: aborted ? 'timeout' : 'network',
      error: err && err.message ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function handleAiTest(payload) {
  return handleAiChat({
    model: payload && payload.model,
    messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    temperature: 0,
    maxTokens: 24,
  });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    const existing = await chrome.storage.local.get(STATE_KEY);
    if (!existing[STATE_KEY]) {
      await chrome.storage.local.set({
        [STATE_KEY]: {
          version: 2,
          folders: [],
          assignments: {},
          settings: {
            concurrency: 2,
            delayMs: 350,
            theme: 'auto',
            showFab: true,
            language: 'auto',
            nativeSidebar: true,
            snapshotOnDelete: true,
          },
          cache: { items: [], fetchedAt: 0, source: 'api' },
        },
        gptm_lang: 'auto',
      });
    }
  } catch (err) {
    console.warn('[ChatKeeper] init storage failed', err);
  }

  if (details.reason === 'install') {
    // 首次安装时打开一个说明页，避免用户不知道入口在哪
    chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/welcome.html') }).catch(() => {});
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-panel') return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    await chrome.tabs.sendMessage(tab.id, { type: 'GPTM_TOGGLE' });
  } catch {
    // 当前标签页不是 ChatGPT 或内容脚本未加载，忽略
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return false;
  if (msg.type === 'GPTM_PING') {
    sendResponse({ ok: true });
    return false;
  }
  if (msg.type === 'GPTM_OPEN_HELP') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/welcome.html') }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }
  if (msg.type === 'GPTM_AI_CHAT' || msg.type === 'GPTM_AI_TEST') {
    const task = msg.type === 'GPTM_AI_TEST' ? handleAiTest(msg.payload) : handleAiChat(msg.payload);
    task
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({
        ok: false,
        code: 'unknown',
        error: err && err.message ? err.message : String(err),
      }));
    return true;
  }
  return false;
});
