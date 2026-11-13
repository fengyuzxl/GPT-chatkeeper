/* ChatKeeper - AI 提示词优化（智谱 GLM-4-Flash）
 *
 * API Key 由使用者在设置里填写，只保存在 chrome.storage.local；
 * 不写入导出文件、不上传别的服务、也不内置共享 Key。
 * 真正的网络请求在 background service worker 中发起，避免页面 CORS 与 Key 暴露。
 */
(() => {
  'use strict';

  const GPTM = (window.GPTM = window.GPTM || {});
  const t = (source, params) => GPTM.i18n.t(source, params);
  const CONFIG_KEY = 'gptm_ai_config';
  const DEFAULT_MODEL = 'glm-4-flash';
  const MODEL_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;

  const config = {
    apiKey: '',
    model: DEFAULT_MODEL,
    enabled: true,
    style: 'structured',
    quickButton: true,
  };

  function sanitizeStyle(value) {
    return ['structured', 'concise', 'detailed'].includes(value) ? value : 'structured';
  }

  function dispatchConfigChange() {
    try {
      window.dispatchEvent(new CustomEvent('gptm:ai-config'));
    } catch { /* ignore */ }
  }

  function sanitizeModel(value) {
    const model = typeof value === 'string' ? value.trim() : '';
    return MODEL_PATTERN.test(model) ? model : DEFAULT_MODEL;
  }

  const ready = (async () => {
    try {
      const data = await chrome.storage.local.get(CONFIG_KEY);
      const saved = data && data[CONFIG_KEY];
      if (saved && typeof saved === 'object') {
        if (typeof saved.apiKey === 'string') config.apiKey = saved.apiKey.trim().slice(0, 300);
        config.model = sanitizeModel(saved.model);
        config.enabled = saved.enabled !== false;
        config.style = sanitizeStyle(saved.style);
        config.quickButton = saved.quickButton !== false;
      }
    } catch (err) {
      console.warn('[ChatKeeper] 读取 AI 配置失败', err);
    }
    return config;
  })();

  function getConfig() {
    return {
      configured: Boolean(config.apiKey),
      model: config.model,
      enabled: config.enabled,
      style: config.style,
      quickButton: config.quickButton,
    };
  }

  async function persist() {
    try {
      await chrome.storage.local.set({
        [CONFIG_KEY]: {
          apiKey: config.apiKey,
          model: config.model,
          enabled: config.enabled,
          style: config.style,
          quickButton: config.quickButton,
          updatedAt: Date.now(),
        },
      });
      return true;
    } catch (err) {
      console.warn('[ChatKeeper] 保存 AI 配置失败', err);
      return false;
    }
  }

  /**
   * @param {{apiKey?:string, model?:string, enabled?:boolean, clearKey?:boolean}} patch
   */
  async function saveConfig(patch) {
    if (patch && patch.clearKey) {
      config.apiKey = '';
    } else if (patch && typeof patch.apiKey === 'string' && patch.apiKey.trim()) {
      config.apiKey = patch.apiKey.trim().slice(0, 300);
    }
    if (patch && typeof patch.model === 'string' && patch.model.trim()) {
      config.model = sanitizeModel(patch.model);
    }
    if (patch && typeof patch.enabled === 'boolean') {
      config.enabled = patch.enabled;
    }
    if (patch && typeof patch.style === 'string') {
      config.style = sanitizeStyle(patch.style);
    }
    if (patch && typeof patch.quickButton === 'boolean') {
      config.quickButton = patch.quickButton;
    }
    await persist();
    dispatchConfigChange();
    return getConfig();
  }

  async function clearKey() {
    config.apiKey = '';
    await persist();
    dispatchConfigChange();
    return getConfig();
  }

  function canUseAI() {
    return Boolean(config.enabled && config.apiKey);
  }

  function buildMessages(text, style) {
    const styleText = style === 'concise'
      ? 'Make the result compact: keep only the essentials, no fluff.'
      : style === 'detailed'
        ? 'Make the result thorough: add useful context, quality criteria, and a clear output format.'
        : 'Make the result well structured: role, context, task, constraints, and output format.';

    return [
      {
        role: 'system',
        content: [
          'You are an expert prompt engineer.',
          'Rewrite the user prompt so it is clearer and more effective, while preserving its original intent and language.',
          'Improve the role, context, task, constraints, and output format where useful.',
          'Do not answer or execute the prompt.',
          'Return only the optimized prompt. No quotes, preamble, or explanation.',
          styleText,
        ].join(' '),
      },
      { role: 'user', content: String(text || '').slice(0, 12000) },
    ];
  }

  async function chat({ messages, temperature, maxTokens }) {
    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: 'GPTM_AI_CHAT',
        payload: {
          messages,
          model: config.model,
          temperature: typeof temperature === 'number' ? temperature : 0.3,
          maxTokens: maxTokens || 2048,
        },
      });
    } catch (err) {
      const error = new Error(err && err.message ? err.message : 'AI request failed');
      error.code = 'network';
      throw error;
    }
    if (!response) {
      const error = new Error('No response from background');
      error.code = 'network';
      throw error;
    }
    if (!response.ok) {
      const error = new Error(response.error || 'AI request failed');
      error.code = response.code || 'unknown';
      error.status = response.status || 0;
      error.detail = response.error || '';
      throw error;
    }
    return response.content;
  }

  async function test() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GPTM_AI_TEST',
        payload: { model: config.model },
      });
      if (!response) return { ok: false, code: 'network', error: 'No response from background' };
      return response;
    } catch (err) {
      return { ok: false, code: 'network', error: err && err.message ? err.message : String(err) };
    }
  }

  function hasCjk(text) {
    return /[㐀-鿿]/.test(text);
  }

  /** 没有 API Key 或 AI 关闭时的本地结构化增强。 */
  function localOptimize(text, style) {
    const source = String(text || '').trim();
    if (hasCjk(source)) {
      if (style === 'concise') {
        return [
          '请完成下面的任务，要求简洁、直接、可执行。',
          '',
          `【任务】${source}`,
          '',
          '【输出】先用一句话给出结论，再分点列出关键步骤。',
        ].join('\n');
      }
      if (style === 'detailed') {
        return [
          '请以专业、严谨的方式完成下面的任务。',
          '',
          `【目标】${source}`,
          '',
          '【背景】请结合相关背景信息，明确目标受众、使用场景与前置条件。',
          '',
          '【要求】',
          '1. 先给出核心结论，再展开细节；',
          '2. 给出可执行的步骤、示例或检查清单，避免空泛表述；',
          '3. 指出可能的风险、边界条件与替代方案；',
          '4. 如果信息不足，请先列出需要补充的信息。',
          '',
          '【输出格式】使用清晰的小标题和分点列表，重要结论加粗。',
        ].join('\n');
      }
      return [
        '请以专业、严谨的方式完成下面的任务。',
        '',
        `【目标】${source}`,
        '',
        '【背景】如有必要，请结合相关背景信息，明确目标受众与使用场景。',
        '',
        '【要求】',
        '1. 先给出核心结论，再展开细节；',
        '2. 给出可执行的步骤或示例，避免空泛表述；',
        '3. 如果信息不足，请先列出需要补充的信息。',
        '',
        '【输出格式】使用清晰的小标题和分点列表。',
      ].join('\n');
    }

    if (style === 'concise') {
      return [
        'Complete the task below. Be concise, direct, and actionable.',
        '',
        `Task: ${source}`,
        '',
        'Output: one-sentence conclusion first, then key steps.',
      ].join('\n');
    }
    if (style === 'detailed') {
      return [
        'Complete the task below in a professional and rigorous way.',
        '',
        `Goal: ${source}`,
        '',
        'Context: state any relevant assumptions, the target audience, and the use case.',
        '',
        'Requirements:',
        '1. Give the core conclusion first, then the details.',
        '2. Provide executable steps, examples, or a checklist.',
        '3. Call out risks, edge cases, and alternatives.',
        '4. If information is missing, list what you need before answering.',
        '',
        'Output format: clear headings and bullet points.',
      ].join('\n');
    }
    return [
      'Complete the task below in a professional and rigorous way.',
      '',
      `Goal: ${source}`,
      '',
      'Context: include relevant background, the target audience, and the use case where helpful.',
      '',
      'Requirements:',
      '1. Give the core conclusion first, then the details.',
      '2. Provide executable steps or examples, avoiding vague statements.',
      '3. If information is missing, list what you need before answering.',
      '',
      'Output format: clear headings and bullet points.',
    ].join('\n');
  }

  async function optimize(text, options = {}) {
    const source = String(text || '').trim();
    const style = ['structured', 'concise', 'detailed'].includes(options.style) ? options.style : 'structured';
    if (!source) {
      const error = new Error('No prompt text');
      error.code = 'no-text';
      throw error;
    }
    if (!canUseAI()) {
      return {
        ok: true,
        local: true,
        content: localOptimize(source, style),
        reason: config.enabled ? 'no-key' : 'disabled',
      };
    }
    const content = await chat({
      messages: buildMessages(source, style),
      temperature: 0.3,
      maxTokens: 2048,
    });
    return { ok: true, local: false, content };
  }

  /** 把后台错误码映射成可展示的本地化文本。 */
  function errorText(input) {
    const code = input && input.code ? input.code : 'unknown';
    const map = {
      'no-key': '未配置 API Key',
      unauthorized: 'API Key 无效或已过期',
      'rate-limited': '请求过于频繁（429），请稍后再试',
      'empty-content': '模型返回空内容，请重试或改用 glm-4-flash',
      timeout: '请求超时，请重试',
      network: '网络请求失败',
      server: '智谱服务异常，请稍后重试',
      'bad-request': '请求参数有误',
      storage: '无法读取本地 API Key',
      'no-text': '请输入提示词',
      unknown: '未知错误',
    };
    const base = t(map[code] || '未知错误');
    const detail = input && input.error ? ` · ${String(input.error).slice(0, 160)}` : '';
    return base + detail;
  }

  GPTM.ai = {
    ready,
    getConfig,
    saveConfig,
    clearKey,
    canUseAI,
    test,
    optimize,
    localOptimize,
    errorText,
    DEFAULT_MODEL,
  };
})();
