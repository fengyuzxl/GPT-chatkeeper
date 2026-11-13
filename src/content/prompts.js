/* ChatKeeper - 提示词库与一键优化
 *
 * 提示词模板保存在本地；优化优先调用智谱 GLM-4-Flash（用户自己的 API Key），
 * 未配置 Key、AI 关闭或请求失败时使用本地结构化增强。
 * 不会自动发送消息，只把结果填入 ChatGPT 输入框或剪贴板。
 */
(() => {
  'use strict';

  const GPTM = (window.GPTM = window.GPTM || {});
  const t = (source, params) => GPTM.i18n.t(source, params);
  const STORAGE_KEY = 'gptm_prompts_v1';
  const MAX_PROMPTS = 200;
  const MAX_NAME = 80;
  const MAX_CONTENT = 20000;

  let prompts = [];
  let loaded = false;

  function makeId() {
    return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function sanitizePrompt(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 80) : '';
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, MAX_NAME) : '';
    const content = typeof raw.content === 'string' ? raw.content.slice(0, MAX_CONTENT) : '';
    if (!id || !name || !content.trim()) return null;
    return {
      id,
      name,
      content,
      createdAt: Number(raw.createdAt) || Date.now(),
      updatedAt: Number(raw.updatedAt) || Date.now(),
    };
  }

  const ready = (async () => {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      const saved = data && data[STORAGE_KEY];
      if (saved && Array.isArray(saved.prompts)) {
        prompts = saved.prompts.map(sanitizePrompt).filter(Boolean).slice(0, MAX_PROMPTS);
      }
    } catch (err) {
      console.warn('[ChatKeeper] 读取提示词失败', err);
    }
    loaded = true;
    return prompts;
  })();

  async function persist() {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY]: { version: 1, prompts, updatedAt: Date.now() },
      });
      return true;
    } catch (err) {
      console.warn('[ChatKeeper] 保存提示词失败', err);
      return false;
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  function ui() {
    return GPTM.ui || null;
  }

  function toast(message, kind) {
    if (ui()) ui().toast(message, kind);
  }

  function closeUi() {
    if (ui()) ui().closeModal();
  }

  async function copyAndFinish(text) {
    closeUi();
    const copied = await GPTM.composer.copy(text);
    if (GPTM.panel) GPTM.panel.close();
    setTimeout(() => {
      if (copied) toast(t('未找到 ChatGPT 输入框，已复制到剪贴板'), 'warn');
      else toast(t('复制失败，请手动复制'), 'err');
    }, 60);
  }

  function insertPrompt(text) {
    const composer = GPTM.composer.find();
    closeUi();
    if (!composer) {
      copyAndFinish(text);
      return;
    }
    if (GPTM.panel) GPTM.panel.close();
    setTimeout(() => {
      const ok = GPTM.composer.write(text);
      const expected = String(text).replace(/\s+/g, ' ').slice(0, 40);
      const current = GPTM.composer.read().replace(/\s+/g, ' ');
      if (ok && (!expected || current.includes(expected))) {
        toast(t('已填入 ChatGPT 输入框'), 'ok');
      } else {
        copyAndFinish(text);
      }
    }, 80);
  }

  /* ---------------- 提示词库 ---------------- */

  function open() {
    ready.then(() => {
      if (!ui()) return;
      ui().openModal(`
        <div class="modal-head">${escapeHtml(t('提示词库'))}
          <div class="sub">${escapeHtml(t('本地保存 · 支持 {{变量}} · 一键填入输入框'))}</div>
        </div>
        <div class="modal-body">
          <div class="prompt-toolbar">
            <input class="text-input" id="gptm-prompt-search" data-i18n-placeholder="搜索提示词…" placeholder="${escapeHtml(t('搜索提示词…'))}" />
            <button class="btn btn-primary" id="gptm-prompt-new">${escapeHtml(t('新建提示词'))}</button>
            <button class="btn" id="gptm-prompt-opt-composer">${escapeHtml(t('优化当前输入框'))}</button>
            <button class="btn btn-quiet" id="gptm-prompt-export">${escapeHtml(t('导出'))}</button>
          </div>
          <div class="prompt-list" id="gptm-prompt-list"></div>
        </div>
        <div class="modal-foot">
          <button class="btn" data-close>${escapeHtml(t('关闭'))}</button>
        </div>
      `, {
        wide: true,
        onMount(card) {
          const search = card.querySelector('#gptm-prompt-search');
          const list = card.querySelector('#gptm-prompt-list');

          const render = () => {
            const query = search.value.trim().toLowerCase();
            const filtered = prompts.filter((prompt) => (
              !query
              || prompt.name.toLowerCase().includes(query)
              || prompt.content.toLowerCase().includes(query)
            ));
            if (!filtered.length) {
              list.innerHTML = `<div class="tip-box">${escapeHtml(query ? t('没有匹配的提示词') : t('还没有提示词。创建常用模板，使用时一键填入输入框。'))}</div>`;
              return;
            }
            list.innerHTML = filtered.map((prompt) => `
              <div class="prompt-item" data-id="${escapeHtml(prompt.id)}">
                <div class="pmeta">
                  <div class="pt">${escapeHtml(prompt.name)}</div>
                  <div class="pv">${escapeHtml(prompt.content.replace(/\s+/g, ' ').slice(0, 160))}</div>
                </div>
                <div class="pacts">
                  <button class="btn" data-use="${escapeHtml(prompt.id)}">${escapeHtml(t('使用'))}</button>
                  <button class="btn btn-quiet" data-opt="${escapeHtml(prompt.id)}">${escapeHtml(t('优化'))}</button>
                  <button class="btn btn-quiet" data-edit="${escapeHtml(prompt.id)}">${escapeHtml(t('编辑'))}</button>
                  <button class="btn btn-quiet" data-del="${escapeHtml(prompt.id)}">${escapeHtml(t('删除'))}</button>
                </div>
              </div>
            `).join('');

            list.querySelectorAll('[data-use]').forEach((button) => {
              button.addEventListener('click', () => usePrompt(button.dataset.use));
            });
            list.querySelectorAll('[data-opt]').forEach((button) => {
              button.addEventListener('click', () => {
                const prompt = prompts.find((item) => item.id === button.dataset.opt);
                if (prompt) openOptimize(prompt.content);
              });
            });
            list.querySelectorAll('[data-edit]').forEach((button) => {
              button.addEventListener('click', () => {
                const prompt = prompts.find((item) => item.id === button.dataset.edit);
                if (prompt) openEditor(prompt);
              });
            });
            list.querySelectorAll('[data-del]').forEach((button) => {
              button.addEventListener('click', () => confirmDelete(button.dataset.del));
            });
          };

          search.addEventListener('input', render);
          card.querySelector('#gptm-prompt-new').addEventListener('click', () => openEditor(null));
          card.querySelector('#gptm-prompt-opt-composer').addEventListener('click', () => {
            const text = GPTM.composer.read();
            openOptimize(text);
          });
          card.querySelector('#gptm-prompt-export').addEventListener('click', () => {
            const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            if (ui()) ui().downloadJson(`chatkeeper-prompts-${stamp}.json`, {
              app: 'ChatKeeper',
              type: 'prompts',
              exportedAt: new Date().toISOString(),
              prompts,
            });
            toast(t('提示词已导出'), 'ok');
          });

          render();
        },
      });
    });
  }

  function extractVariables(content) {
    const names = [];
    const seen = new Set();
    const pattern = /\{\{\s*([^{}]+?)\s*\}\}/g;
    let match;
    while ((match = pattern.exec(content))) {
      const name = match[1].trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    }
    return names;
  }

  function usePrompt(id) {
    const prompt = prompts.find((item) => item.id === id);
    if (!prompt) return;
    const variables = extractVariables(prompt.content);
    if (!variables.length) {
      insertPrompt(prompt.content);
      return;
    }

    ui().openModal(`
      <div class="modal-head">${escapeHtml(t('填写变量'))}
        <div class="sub">${escapeHtml(prompt.name)}</div>
      </div>
      <div class="modal-body">
        <div class="var-grid" id="gptm-var-grid">
          ${variables.map((name, index) => `<div class="field" style="margin-bottom:10px">
            <label for="gptm-var-${index}">${escapeHtml(name)}</label>
            <input class="text-input" id="gptm-var-${index}" data-var="${escapeHtml(name)}" />
          </div>`).join('')}
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" data-close>${escapeHtml(t('取消'))}</button>
        <button class="btn btn-primary" id="gptm-var-insert">${escapeHtml(t('填入输入框'))}</button>
      </div>
    `, {
      wide: false,
      onMount(card) {
        card.querySelector('#gptm-var-insert').addEventListener('click', () => {
          const values = {};
          card.querySelectorAll('[data-var]').forEach((input) => {
            values[input.dataset.var] = input.value;
          });
          const text = prompt.content.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name) => {
            const value = values[name.trim()];
            return value === undefined || value === '' ? match : value;
          });
          insertPrompt(text);
        });
      },
    });
  }

  function openEditor(prompt) {
    ui().openModal(`
      <div class="modal-head">${escapeHtml(prompt ? t('编辑提示词') : t('新建提示词'))}
        <div class="sub">${escapeHtml(t('可用 {{变量名}} 占位，使用时填写'))}</div>
      </div>
      <div class="modal-body">
        <div class="field">
          <label for="gptm-prompt-name">${escapeHtml(t('名称'))}</label>
          <input class="text-input" id="gptm-prompt-name" maxlength="80" />
        </div>
        <div class="field">
          <label for="gptm-prompt-content">${escapeHtml(t('提示词内容'))}</label>
          <textarea class="textarea-input" id="gptm-prompt-content"></textarea>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" data-close>${escapeHtml(t('取消'))}</button>
        <button class="btn btn-primary" id="gptm-prompt-save">${escapeHtml(t('保存'))}</button>
      </div>
    `, {
      wide: true,
      onMount(card) {
        const nameInput = card.querySelector('#gptm-prompt-name');
        const contentInput = card.querySelector('#gptm-prompt-content');
        nameInput.value = prompt ? prompt.name : '';
        contentInput.value = prompt ? prompt.content : '';
        nameInput.focus();

        card.querySelector('#gptm-prompt-save').addEventListener('click', async () => {
          const name = nameInput.value.trim().slice(0, MAX_NAME);
          const content = contentInput.value.slice(0, MAX_CONTENT);
          if (!name) {
            toast(t('请输入提示词名称'), 'warn');
            nameInput.focus();
            return;
          }
          if (!content.trim()) {
            toast(t('请输入提示词内容'), 'warn');
            contentInput.focus();
            return;
          }
          if (prompt) {
            prompt.name = name;
            prompt.content = content;
            prompt.updatedAt = Date.now();
          } else {
            if (prompts.length >= MAX_PROMPTS) {
              toast(t('提示词数量已达上限'), 'warn');
              return;
            }
            prompts.unshift({
              id: makeId(),
              name,
              content,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
          }
          await persist();
          toast(prompt ? t('提示词已更新') : t('提示词已创建'), 'ok');
          open();
        });
      },
    });
  }

  function confirmDelete(id) {
    const prompt = prompts.find((item) => item.id === id);
    if (!prompt) return;
    ui().openModal(`
      <div class="modal-head">${escapeHtml(t('删除提示词「{name}」？', { name: prompt.name }))}</div>
      <div class="modal-body">
        <div class="tip-box">${escapeHtml(t('只会删除本地保存的提示词。'))}</div>
      </div>
      <div class="modal-foot">
        <button class="btn" data-close>${escapeHtml(t('取消'))}</button>
        <button class="btn btn-danger" id="gptm-prompt-del">${escapeHtml(t('删除'))}</button>
      </div>
    `, {
      onMount(card) {
        card.querySelector('#gptm-prompt-del').addEventListener('click', async () => {
          prompts = prompts.filter((item) => item.id !== id);
          await persist();
          toast(t('提示词已删除'), 'ok');
          open();
        });
      },
    });
  }

  /* ---------------- 优化 ---------------- */

  function aiErrorMessage(err) {
    return t('优化失败：{message}', {
      message: GPTM.ai.errorText(err && err.detail && !err.error
        ? { code: err.code, error: err.detail }
        : err),
    });
  }

  function optimizeModal(sourceText) {
    const config = GPTM.ai.getConfig();
    return `
      <div class="modal-head">${escapeHtml(t('优化提示词'))}
        <div class="sub">${escapeHtml(t('只发送当前提示词，不发送对话历史'))}</div>
      </div>
      <div class="modal-body">
        <div class="field">
          <label for="gptm-opt-source">${escapeHtml(t('原始提示词'))}</label>
          <textarea class="textarea-input" id="gptm-opt-source"></textarea>
        </div>
        <div class="field">
          <label for="gptm-opt-style">${escapeHtml(t('优化风格'))}</label>
          <select class="text-input" id="gptm-opt-style">
            <option value="structured">${escapeHtml(t('结构化'))}</option>
            <option value="concise">${escapeHtml(t('简洁'))}</option>
            <option value="detailed">${escapeHtml(t('详细'))}</option>
          </select>
        </div>
        <div class="field" id="gptm-opt-result-field" hidden>
          <label>${escapeHtml(t('优化结果'))}<span class="opt-engine" id="gptm-opt-engine"></span></label>
          <textarea class="textarea-input" id="gptm-opt-result"></textarea>
        </div>
        <div class="tip-box" id="gptm-opt-notice">${escapeHtml(config.configured && config.enabled
          ? t('提示词会发送到智谱 GLM（{model}）。', { model: config.model })
          : t('未配置 API Key 或 AI 已关闭，将使用本地结构化优化。'))}</div>
      </div>
      <div class="modal-foot">
        <button class="btn" data-close>${escapeHtml(t('关闭'))}</button>
        <button class="btn btn-quiet" id="gptm-opt-local" hidden>${escapeHtml(t('使用本地规则优化'))}</button>
        <button class="btn" id="gptm-opt-copy" hidden>${escapeHtml(t('复制'))}</button>
        <button class="btn" id="gptm-opt-save" hidden>${escapeHtml(t('保存到提示词库'))}</button>
        <button class="btn btn-primary" id="gptm-opt-run">${escapeHtml(t('开始优化'))}</button>
        <button class="btn btn-primary" id="gptm-opt-insert" hidden>${escapeHtml(t('替换到输入框'))}</button>
      </div>
    `;
  }

  function openOptimize(sourceText) {
    ready.then(() => {
      if (!ui()) return;
      ui().openModal(optimizeModal(sourceText), {
        wide: true,
        onMount(card) {
          const source = card.querySelector('#gptm-opt-source');
          const style = card.querySelector('#gptm-opt-style');
          style.value = GPTM.ai.getConfig().style || 'structured';
          const resultField = card.querySelector('#gptm-opt-result-field');
          const result = card.querySelector('#gptm-opt-result');
          const engine = card.querySelector('#gptm-opt-engine');
          const notice = card.querySelector('#gptm-opt-notice');
          const run = card.querySelector('#gptm-opt-run');
          const local = card.querySelector('#gptm-opt-local');
          const copy = card.querySelector('#gptm-opt-copy');
          const save = card.querySelector('#gptm-opt-save');
          const insert = card.querySelector('#gptm-opt-insert');

          source.value = sourceText || '';
          if (!source.value) source.focus();

          const setResult = (text, localMode, reason) => {
            result.value = text;
            resultField.hidden = false;
            copy.hidden = false;
            save.hidden = false;
            insert.hidden = false;
            local.hidden = true;
            engine.textContent = localMode
              ? t('本地结构化增强')
              : `GLM · ${GPTM.ai.getConfig().model}`;
            if (localMode) {
              notice.textContent = reason === 'disabled'
                ? t('AI 优化已关闭，已使用本地结构化优化。')
                : t('未配置 API Key，已使用本地结构化优化。');
            } else {
              notice.textContent = t('已使用 {model} 优化。', { model: GPTM.ai.getConfig().model });
            }
          };

          const setBusy = (busy) => {
            run.disabled = busy;
            run.textContent = busy ? t('正在优化…') : (result.value ? t('重新优化') : t('开始优化'));
          };

          const start = async () => {
            const text = source.value.trim();
            if (!text) {
              toast(t('请输入提示词'), 'warn');
              source.focus();
              return;
            }
            setBusy(true);
            notice.textContent = t('正在优化…');
            resultField.hidden = true;
            copy.hidden = true;
            save.hidden = true;
            insert.hidden = true;
            local.hidden = true;
            try {
              const response = await GPTM.ai.optimize(text, { style: style.value });
              setResult(response.content, response.local, response.reason);
            } catch (err) {
              notice.textContent = aiErrorMessage(err);
              local.hidden = false;
            } finally {
              setBusy(false);
            }
          };

          run.addEventListener('click', start);
          local.addEventListener('click', () => {
            const text = source.value.trim();
            if (!text) return;
            setResult(GPTM.ai.localOptimize(text, style.value), true, 'no-key');
          });
          copy.addEventListener('click', async () => {
            const ok = await GPTM.composer.copy(result.value);
            toast(ok ? t('已复制') : t('复制失败，请手动复制'), ok ? 'ok' : 'err');
          });
          save.addEventListener('click', () => {
            ui().closeModal();
            openEditorWithContent(result.value);
          });
          insert.addEventListener('click', () => insertPrompt(result.value));
        },
      });
    });
  }

  function openEditorWithContent(content) {
    ui().openModal(`
      <div class="modal-head">${escapeHtml(t('新建提示词'))}
        <div class="sub">${escapeHtml(t('可用 {{变量名}} 占位，使用时填写'))}</div>
      </div>
      <div class="modal-body">
        <div class="field">
          <label for="gptm-prompt-name2">${escapeHtml(t('名称'))}</label>
          <input class="text-input" id="gptm-prompt-name2" maxlength="80" />
        </div>
        <div class="field">
          <label for="gptm-prompt-content2">${escapeHtml(t('提示词内容'))}</label>
          <textarea class="textarea-input" id="gptm-prompt-content2"></textarea>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" data-close>${escapeHtml(t('取消'))}</button>
        <button class="btn btn-primary" id="gptm-prompt-save2">${escapeHtml(t('保存'))}</button>
      </div>
    `, {
      wide: true,
      onMount(card) {
        const nameInput = card.querySelector('#gptm-prompt-name2');
        const contentInput = card.querySelector('#gptm-prompt-content2');
        contentInput.value = content || '';
        nameInput.focus();
        card.querySelector('#gptm-prompt-save2').addEventListener('click', async () => {
          const name = nameInput.value.trim().slice(0, MAX_NAME);
          const body = contentInput.value.slice(0, MAX_CONTENT);
          if (!name) {
            toast(t('请输入提示词名称'), 'warn');
            nameInput.focus();
            return;
          }
          if (!body.trim()) {
            toast(t('请输入提示词内容'), 'warn');
            return;
          }
          if (prompts.length >= MAX_PROMPTS) {
            toast(t('提示词数量已达上限'), 'warn');
            return;
          }
          prompts.unshift({ id: makeId(), name, content: body, createdAt: Date.now(), updatedAt: Date.now() });
          await persist();
          toast(t('提示词已创建'), 'ok');
          open();
        });
      },
    });
  }

  GPTM.prompts = {
    ready,
    open,
    getPrompts: () => prompts.map((prompt) => ({ id: prompt.id, name: prompt.name, content: prompt.content })),
    findComposer: () => GPTM.composer.find(),
    readComposerText: () => GPTM.composer.read(),
    insertText: insertPrompt,
    extractVariables,
  };
})();
