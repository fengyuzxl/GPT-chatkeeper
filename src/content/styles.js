/* ChatKeeper - 面板样式（注入到 Shadow DOM，与页面样式完全隔离） */
(() => {
  'use strict';

  const GPTM = (window.GPTM = window.GPTM || {});

  GPTM.CSS = `
:host {
  all: initial;
  display: block;
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  pointer-events: none;
  font: 13px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
  color-scheme: light;
  --gptm-bg: #eceef1;
  --gptm-surface: #ffffff;
  --gptm-surface-2: #f6f7f8;
  --gptm-surface-3: #eceef1;
  --gptm-text: #1f2328;
  --gptm-muted: #6b7280;
  --gptm-border: #e3e5e8;
  --gptm-border-strong: #cfd2d7;
  --gptm-accent: #0e9f74;
  --gptm-accent-hover: #0b8a63;
  --gptm-accent-soft: rgba(14, 159, 116, 0.12);
  --gptm-danger: #dc3d43;
  --gptm-danger-soft: rgba(220, 61, 67, 0.10);
  --gptm-warn: #b45309;
  --gptm-shadow: 0 24px 80px rgba(15, 23, 42, 0.28), 0 4px 16px rgba(15, 23, 42, 0.12);
  --gptm-radius: 12px;
}

:host([data-theme="dark"]) {
  color-scheme: dark;
  --gptm-bg: #0f1011;
  --gptm-surface: #1b1c1e;
  --gptm-surface-2: #202124;
  --gptm-surface-3: #26282c;
  --gptm-text: #ececf1;
  --gptm-muted: #9aa0a6;
  --gptm-border: #303338;
  --gptm-border-strong: #3f4349;
  --gptm-accent: #17b890;
  --gptm-accent-hover: #1fcaa0;
  --gptm-accent-soft: rgba(23, 184, 144, 0.16);
  --gptm-danger: #f2555a;
  --gptm-danger-soft: rgba(242, 85, 90, 0.14);
  --gptm-warn: #f0b429;
  --gptm-shadow: 0 24px 80px rgba(0, 0, 0, 0.6), 0 4px 16px rgba(0, 0, 0, 0.4);
}

*, *::before, *::after { box-sizing: border-box; }

[hidden] { display: none !important; }

button, input, select { font: inherit; color: inherit; }

/* ---------- 悬浮入口 ---------- */
.fab {
  pointer-events: auto;
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, #17b890, #0b7a5d);
  color: #fff;
  box-shadow: 0 8px 24px rgba(10, 120, 92, 0.38), 0 2px 6px rgba(0, 0, 0, 0.18);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.fab:hover {
  transform: translateY(-2px) scale(1.03);
  box-shadow: 0 12px 28px rgba(10, 120, 92, 0.45), 0 3px 8px rgba(0, 0, 0, 0.2);
}
.fab:active { transform: scale(0.98); }
.fab svg { width: 24px; height: 24px; display: block; }
.fab[hidden] { display: none; }

/* ---------- 遮罩与面板 ---------- */
.overlay {
  pointer-events: auto;
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.overlay[hidden] { display: none; }

.backdrop {
  position: absolute;
  inset: 0;
  background: rgba(10, 12, 14, 0.42);
  backdrop-filter: blur(2px);
}

.panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(1120px, 96vw);
  height: min(860px, 90vh);
  background: var(--gptm-surface);
  color: var(--gptm-text);
  border: 1px solid var(--gptm-border);
  border-radius: 18px;
  box-shadow: var(--gptm-shadow);
  overflow: hidden;
  animation: gptm-pop 0.16s ease-out;
}

@keyframes gptm-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.985); }
  to { opacity: 1; transform: none; }
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--gptm-border);
  background: var(--gptm-surface);
  flex: none;
}

.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 14px;
  font-weight: 650;
  letter-spacing: 0.01em;
}
.brand .logo {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: linear-gradient(145deg, #17b890, #0b7a5d);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.brand .logo svg { width: 16px; height: 16px; }
.brand .ver {
  font-size: 10.5px;
  font-weight: 500;
  color: var(--gptm-muted);
  border: 1px solid var(--gptm-border);
  border-radius: 20px;
  padding: 1px 7px;
  margin-left: 2px;
}

.head-actions { display: flex; align-items: center; gap: 6px; }

.icon-btn {
  height: 30px;
  min-width: 30px;
  padding: 0 9px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--gptm-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  font-weight: 500;
}
.icon-btn:hover { background: var(--gptm-surface-2); color: var(--gptm-text); }
.icon-btn svg { width: 15px; height: 15px; }
.icon-btn.spinning svg { animation: gptm-spin 0.9s linear infinite; }

@keyframes gptm-spin { to { transform: rotate(360deg); } }

/* ---------- 主体 ---------- */
.panel-body { flex: 1; display: flex; min-height: 0; }

.sidebar {
  flex: none;
  width: 236px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 10px;
  border-right: 1px solid var(--gptm-border);
  background: var(--gptm-surface-2);
  overflow-y: auto;
}

.side-title {
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--gptm-muted);
  padding: 4px 10px 6px;
}

.folder-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }

.folder {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  color: var(--gptm-text);
  border: 1px dashed transparent;
}
.folder:hover { background: var(--gptm-surface-3); }
.folder.active { background: var(--gptm-accent-soft); color: var(--gptm-accent); font-weight: 600; }
.folder.drop-hover {
  border-color: var(--gptm-accent);
  background: var(--gptm-accent-soft);
  color: var(--gptm-accent);
}
.folder .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--gptm-muted); }
.folder .fname { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; }
.folder .fcount {
  font-size: 11px;
  color: var(--gptm-muted);
  background: var(--gptm-surface-3);
  border-radius: 20px;
  padding: 0 6px;
  min-width: 20px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.folder.active .fcount { background: transparent; color: inherit; }
.folder .more {
  border: none;
  background: transparent;
  color: var(--gptm-muted);
  cursor: pointer;
  padding: 0 3px;
  border-radius: 4px;
  opacity: 0;
  font-size: 14px;
  line-height: 1;
}
.folder:hover .more, .folder.active .more { opacity: 1; }
.folder .more:hover { color: var(--gptm-text); background: var(--gptm-surface-3); }

.side-new {
  margin: 6px 4px 0;
  padding: 7px 9px;
  border-radius: 8px;
  border: 1px dashed var(--gptm-border-strong);
  background: transparent;
  color: var(--gptm-muted);
  cursor: pointer;
  text-align: left;
  font-size: 12.5px;
}
.side-new:hover { color: var(--gptm-accent); border-color: var(--gptm-accent); background: var(--gptm-accent-soft); }

.side-foot {
  margin-top: auto;
  padding: 10px;
  font-size: 11px;
  color: var(--gptm-muted);
  border-top: 1px solid var(--gptm-border);
  overflow-wrap: anywhere;
}

.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 10px;
  flex: none;
}

.search-wrap { position: relative; flex: 1; min-width: 120px; }
.search-wrap svg {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 15px;
  height: 15px;
  color: var(--gptm-muted);
  pointer-events: none;
}
.search {
  width: 100%;
  height: 34px;
  padding: 0 12px 0 32px;
  border-radius: 9px;
  border: 1px solid var(--gptm-border);
  background: var(--gptm-surface-2);
  outline: none;
  font-size: 13px;
}
.search:focus { border-color: var(--gptm-accent); background: var(--gptm-surface); box-shadow: 0 0 0 3px var(--gptm-accent-soft); }
.search::placeholder { color: var(--gptm-muted); }

.select-sm {
  height: 34px;
  padding: 0 26px 0 10px;
  border-radius: 9px;
  border: 1px solid var(--gptm-border);
  background: var(--gptm-surface-2);
  font-size: 12.5px;
  outline: none;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23888' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}
.select-sm:focus { border-color: var(--gptm-accent); }

.bulkbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px 10px;
  flex: none;
  flex-wrap: wrap;
}

.checkline {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  color: var(--gptm-muted);
  cursor: pointer;
  user-select: none;
}
input[type="checkbox"] {
  width: 15px;
  height: 15px;
  accent-color: var(--gptm-accent);
  cursor: pointer;
  margin: 0;
}

.sel-count {
  font-size: 12.5px;
  color: var(--gptm-muted);
  font-variant-numeric: tabular-nums;
  min-width: 62px;
}
.sel-count.has { color: var(--gptm-accent); font-weight: 600; }

.bulk-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; flex-wrap: wrap; }

.btn {
  height: 31px;
  padding: 0 11px;
  border-radius: 8px;
  border: 1px solid var(--gptm-border);
  background: var(--gptm-surface);
  color: var(--gptm-text);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.btn:hover:not(:disabled) { background: var(--gptm-surface-2); }
.btn:disabled { opacity: 0.42; cursor: not-allowed; }
.btn-primary { background: var(--gptm-accent); border-color: transparent; color: #fff; font-weight: 600; }
.btn-primary:hover:not(:disabled) { background: var(--gptm-accent-hover); }
.btn-danger { background: var(--gptm-danger); border-color: transparent; color: #fff; font-weight: 600; }
.btn-danger:hover:not(:disabled) { filter: brightness(0.94); }
.btn-quiet { border-color: transparent; background: transparent; color: var(--gptm-muted); }
.btn-quiet:hover:not(:disabled) { background: var(--gptm-surface-2); color: var(--gptm-text); }
.btn svg { width: 14px; height: 14px; }

.progress {
  margin: 0 16px 10px;
  padding: 10px 12px;
  border: 1px solid var(--gptm-border);
  border-radius: 10px;
  background: var(--gptm-surface-2);
  display: flex;
  align-items: center;
  gap: 12px;
}
.progress[hidden] { display: none; }
.progress .bar {
  flex: 1;
  height: 6px;
  border-radius: 20px;
  background: var(--gptm-surface-3);
  overflow: hidden;
}
.progress .bar i {
  display: block;
  height: 100%;
  width: 0%;
  border-radius: 20px;
  background: var(--gptm-accent);
  transition: width 0.2s ease;
}
.progress .ptext { font-size: 12px; color: var(--gptm-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.progress .ptext b { color: var(--gptm-text); font-weight: 600; }

/* ---------- 列表 ---------- */
.list { flex: 1; overflow-y: auto; overflow-x: hidden; min-height: 0; }

.row {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 9px 16px;
  border-bottom: 1px solid var(--gptm-border);
  cursor: default;
  transition: background 0.1s ease;
}
.row:hover { background: var(--gptm-surface-2); }
.row.selected { background: var(--gptm-accent-soft); }
.row.selected:hover { background: var(--gptm-accent-soft); }
.row.dragging { opacity: 0.45; }
.row-check { flex: none; display: flex; align-items: center; }

.row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }

.row-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--gptm-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: none;
  line-height: 1.4;
}
.row-title:hover { color: var(--gptm-accent); text-decoration: underline; }

.row-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: var(--gptm-muted);
  min-height: 16px;
  flex-wrap: wrap;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 7px;
  height: 17px;
  border-radius: 20px;
  background: var(--gptm-surface-3);
  font-size: 10.5px;
  color: var(--gptm-text);
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip .dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.chip.dom { color: var(--gptm-warn); }

.row-more {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: var(--gptm-muted);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  opacity: 0.55;
}
.row:hover .row-more { opacity: 1; }
.row-more:hover { background: var(--gptm-surface-3); color: var(--gptm-text); }

.load-more {
  display: block;
  margin: 14px auto;
  padding: 7px 18px;
  border-radius: 20px;
  border: 1px solid var(--gptm-border);
  background: var(--gptm-surface);
  color: var(--gptm-muted);
  cursor: pointer;
  font-size: 12px;
}
.load-more:hover { border-color: var(--gptm-accent); color: var(--gptm-accent); }

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 24px;
  color: var(--gptm-muted);
  text-align: center;
}
.empty[hidden] { display: none; }
.empty .big { font-size: 15px; color: var(--gptm-text); font-weight: 600; }
.empty .hint { font-size: 12.5px; max-width: 380px; line-height: 1.6; }
.empty svg { width: 34px; height: 34px; opacity: 0.5; margin-bottom: 4px; }

.list.loading { opacity: 0.55; }

/* ---------- 底栏 ---------- */
.panel-foot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  border-top: 1px solid var(--gptm-border);
  background: var(--gptm-surface-2);
  font-size: 11.5px;
  color: var(--gptm-muted);
}
.panel-foot .dotsep { opacity: 0.5; margin: 0 5px; }
.panel-foot .status-err { color: var(--gptm-danger); }

/* ---------- 弹层 ---------- */
.modal-layer {
  pointer-events: auto;
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(8, 10, 12, 0.45);
}
.modal-layer[hidden] { display: none; }

.modal-card {
  width: min(460px, 92vw);
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  background: var(--gptm-surface);
  color: var(--gptm-text);
  border: 1px solid var(--gptm-border);
  border-radius: 14px;
  box-shadow: var(--gptm-shadow);
  animation: gptm-pop 0.14s ease-out;
  overflow: hidden;
}
.modal-card.wide { width: min(600px, 94vw); }

.modal-head {
  padding: 15px 18px 0;
  font-size: 14.5px;
  font-weight: 650;
}
.modal-head .sub { font-size: 12px; font-weight: 400; color: var(--gptm-muted); margin-top: 4px; }
.modal-body { padding: 14px 18px; overflow-y: auto; font-size: 13px; }
.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 18px 16px;
  flex-wrap: wrap;
}

.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.field:last-child { margin-bottom: 0; }
.field > label { font-size: 12px; font-weight: 600; color: var(--gptm-text); }
.field .desc { font-size: 11.5px; color: var(--gptm-muted); line-height: 1.5; }

.text-input {
  height: 34px;
  padding: 0 11px;
  border-radius: 8px;
  border: 1px solid var(--gptm-border);
  background: var(--gptm-surface-2);
  outline: none;
  font-size: 13px;
}
.text-input:focus { border-color: var(--gptm-accent); background: var(--gptm-surface); box-shadow: 0 0 0 3px var(--gptm-accent-soft); }

.swatches { display: flex; gap: 8px; flex-wrap: wrap; }
.swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
}
.swatch.active { border-color: var(--gptm-text); box-shadow: 0 0 0 2px var(--gptm-surface) inset; }

.warn-box {
  border: 1px solid rgba(220, 61, 67, 0.35);
  background: var(--gptm-danger-soft);
  border-radius: 9px;
  padding: 10px 12px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--gptm-text);
  margin-bottom: 12px;
}
.tip-box {
  border: 1px solid var(--gptm-border);
  background: var(--gptm-surface-2);
  border-radius: 9px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--gptm-muted);
}

.range-row { display: flex; align-items: center; gap: 12px; }
.range-row input[type="range"] { flex: 1; accent-color: var(--gptm-accent); }
.range-row .val { min-width: 66px; text-align: right; font-size: 12px; color: var(--gptm-muted); font-variant-numeric: tabular-nums; }

.report-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid var(--gptm-border);
  border-radius: 9px;
}
.report-list li {
  padding: 8px 11px;
  border-bottom: 1px solid var(--gptm-border);
  font-size: 12px;
  display: flex;
  gap: 8px;
}
.report-list li:last-child { border-bottom: none; }
.report-list .rt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.report-list .re { color: var(--gptm-danger); font-size: 11px; max-width: 55%; overflow-wrap: anywhere; }

/* ---------- 菜单 ---------- */
.menu {
  pointer-events: auto;
  position: fixed;
  z-index: 40;
  min-width: 176px;
  padding: 5px;
  border-radius: 10px;
  background: var(--gptm-surface);
  border: 1px solid var(--gptm-border);
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.3);
  font-size: 12.5px;
  max-height: 60vh;
  overflow-y: auto;
}
.menu[hidden] { display: none; }
.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 9px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--gptm-text);
  text-align: left;
  cursor: pointer;
  font-size: 12.5px;
}
.menu-item:hover { background: var(--gptm-surface-2); }
.menu-item.danger { color: var(--gptm-danger); }
.menu-item.danger:hover { background: var(--gptm-danger-soft); }
.menu-item:disabled { opacity: 0.45; cursor: default; }
.menu-item .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.menu-item .mi-count { margin-left: auto; font-size: 11px; color: var(--gptm-muted); }
.menu-label { padding: 6px 9px 4px; font-size: 10.5px; font-weight: 650; letter-spacing: 0.05em; text-transform: uppercase; color: var(--gptm-muted); }
.menu-sep { height: 1px; margin: 4px 3px; background: var(--gptm-border); }

/* ---------- Toast ---------- */
.toasts {
  pointer-events: none;
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 80;
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(520px, 88vw);
  padding: 9px 14px;
  border-radius: 10px;
  background: rgba(28, 30, 33, 0.96);
  color: #f2f3f5;
  font-size: 12.5px;
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.3);
  animation: gptm-toast 0.18s ease-out;
  overflow-wrap: anywhere;
}
.toast-text { flex: 1; min-width: 0; }
.toast-action {
  flex: none;
  border: none;
  border-radius: 6px;
  padding: 3px 9px;
  background: rgba(255, 255, 255, 0.2);
  color: inherit;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  white-space: nowrap;
}
.toast-action:hover { background: rgba(255, 255, 255, 0.3); }
.toast.ok { background: #0b7a5d; color: #fff; }
.toast.err { background: #b8272c; color: #fff; }
.toast.warn { background: #8a5a00; color: #fff; }

@keyframes gptm-toast {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}

/* ---------- 滚动条 ---------- */
.list::-webkit-scrollbar,
.sidebar::-webkit-scrollbar,
.modal-body::-webkit-scrollbar,
.report-list::-webkit-scrollbar,
.menu::-webkit-scrollbar { width: 10px; height: 10px; }
.list::-webkit-scrollbar-thumb,
.sidebar::-webkit-scrollbar-thumb,
.modal-body::-webkit-scrollbar-thumb,
.report-list::-webkit-scrollbar-thumb,
.menu::-webkit-scrollbar-thumb {
  background: var(--gptm-border-strong);
  border-radius: 20px;
  border: 3px solid transparent;
  background-clip: content-box;
}
.list::-webkit-scrollbar-track,
.sidebar::-webkit-scrollbar-track,
.modal-body::-webkit-scrollbar-track,
.report-list::-webkit-scrollbar-track,
.menu::-webkit-scrollbar-track { background: transparent; }

/* ---------- 文件夹树 ---------- */
.folder .chev {
  flex: none;
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--gptm-muted);
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.folder .chev:hover { background: var(--gptm-surface-3); color: var(--gptm-text); }
.folder .chev[data-empty="1"] { visibility: hidden; pointer-events: none; }
.folder.drop-invalid { border-color: var(--gptm-danger); background: var(--gptm-danger-soft); color: var(--gptm-danger); }

.side-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 2px 4px;
  padding: 7px 9px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--gptm-muted);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}
.side-btn:hover { background: var(--gptm-surface-3); color: var(--gptm-text); }
.side-btn .badge {
  margin-left: auto;
  font-size: 10.5px;
  background: var(--gptm-surface-3);
  border-radius: 20px;
  padding: 0 6px;
  min-width: 20px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.banner {
  margin: 0 16px 10px;
  padding: 8px 12px;
  border-radius: 9px;
  border: 1px solid rgba(220, 61, 67, 0.35);
  background: var(--gptm-danger-soft);
  font-size: 12px;
  line-height: 1.5;
}
.banner[hidden] { display: none; }

/* ---------- 正文搜索 ---------- */
.search-btn { flex: none; height: 34px; }
.progress.search .bar i { background: #3b82f6; }

.row-snippet {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  margin-top: 3px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--gptm-muted);
}
.row-snippet mark {
  background: var(--gptm-accent-soft);
  color: var(--gptm-accent);
  border-radius: 3px;
  padding: 0 1px;
  font-weight: 600;
}
.row-snippet .role {
  font-size: 10px;
  font-weight: 650;
  color: var(--gptm-accent);
  margin-right: 5px;
}

/* ---------- 快照 ---------- */
.snap-list { display: flex; flex-direction: column; gap: 8px; max-height: 46vh; overflow-y: auto; }
.snap-run {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--gptm-border);
  border-radius: 10px;
  background: var(--gptm-surface-2);
}
.snap-run .meta { flex: 1; min-width: 0; }
.snap-run .t { font-size: 12.5px; font-weight: 600; }
.snap-run .s { font-size: 11.5px; color: var(--gptm-muted); }
.snap-run .acts { display: flex; gap: 6px; flex-wrap: wrap; }

.snap-view-list {
  border: 1px solid var(--gptm-border);
  border-radius: 9px;
  max-height: 52vh;
  overflow-y: auto;
}
.snap-item {
  display: flex;
  gap: 10px;
  padding: 8px 11px;
  border-bottom: 1px solid var(--gptm-border);
  font-size: 12px;
}
.snap-item:last-child { border-bottom: none; }
.snap-item .st { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.snap-item .sm { color: var(--gptm-muted); font-size: 11px; white-space: nowrap; }

/* ---------- 导入 ---------- */
.radio-row { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
.radio-opt {
  display: flex;
  gap: 9px;
  align-items: flex-start;
  padding: 9px 11px;
  border: 1px solid var(--gptm-border);
  border-radius: 9px;
  background: var(--gptm-surface-2);
  cursor: pointer;
  font-size: 12.5px;
  line-height: 1.5;
}
.radio-opt.active { border-color: var(--gptm-accent); background: var(--gptm-accent-soft); }
.radio-opt input { margin-top: 2px; }
.import-stats { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--gptm-muted); margin: 8px 0; }
.import-stats b { color: var(--gptm-text); }

/* ---------- 原生侧边栏批量操作栏 ---------- */
.native-bar {
  pointer-events: auto;
  position: fixed;
  left: 50%;
  bottom: 88px;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  max-width: calc(100vw - 32px);
  padding: 8px 10px 8px 14px;
  border-radius: 14px;
  border: 1px solid var(--gptm-border);
  background: var(--gptm-surface);
  color: var(--gptm-text);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
  font-size: 12.5px;
}
.native-bar[hidden] { display: none; }
.native-bar .ncount { font-weight: 650; color: var(--gptm-accent); white-space: nowrap; }
.native-bar .ntext { color: var(--gptm-muted); font-size: 12px; }

@media (max-width: 760px) {
  .native-bar { bottom: 84px; }
}

/* ---------- 提示词库 / AI 优化 ---------- */
.prompt-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.prompt-toolbar .text-input { flex: 1; min-width: 160px; }

.prompt-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 50vh;
  overflow-y: auto;
  margin-top: 12px;
}
.prompt-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--gptm-border);
  border-radius: 10px;
  background: var(--gptm-surface-2);
}
.prompt-item .pmeta { flex: 1; min-width: 0; }
.prompt-item .pt { font-size: 12.5px; font-weight: 600; }
.prompt-item .pv {
  font-size: 11.5px;
  color: var(--gptm-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prompt-item .pacts { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

.textarea-input {
  width: 100%;
  min-height: 110px;
  padding: 9px 11px;
  border-radius: 9px;
  border: 1px solid var(--gptm-border);
  background: var(--gptm-surface-2);
  color: var(--gptm-text);
  font: inherit;
  font-size: 12.5px;
  line-height: 1.6;
  outline: none;
  resize: vertical;
}
.textarea-input:focus {
  border-color: var(--gptm-accent);
  background: var(--gptm-surface);
  box-shadow: 0 0 0 3px var(--gptm-accent-soft);
}

.opt-engine { font-size: 10.5px; font-weight: 600; color: var(--gptm-accent); margin-left: 6px; }
.ai-status.ok { color: var(--gptm-accent); }
.ai-status.err { color: var(--gptm-danger); }

@media (max-width: 760px) {
  .prompt-item { flex-direction: column; align-items: stretch; }
  .prompt-item .pacts { justify-content: flex-end; }
}

/* ---------- 响应式 ---------- */
@media (max-width: 760px) {
  .panel { height: 94vh; width: 98vw; }
  .panel-body { flex-direction: column; }
  .sidebar {
    width: 100%;
    max-height: 168px;
    border-right: none;
    border-bottom: 1px solid var(--gptm-border);
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    overflow-x: auto;
  }
  .side-title { display: none; }
  .folder-list { flex-direction: row; flex-wrap: nowrap; }
  .folder { white-space: nowrap; }
  .side-new { margin: 0 4px; }
  .side-foot { display: none; }
  .toolbar { flex-wrap: wrap; }
  .search-wrap { flex-basis: 100%; }
  .bulk-actions { margin-left: 0; width: 100%; }
  .fab { right: 16px; bottom: 16px; }
}
`;
})();
