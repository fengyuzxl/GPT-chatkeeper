/* ChatKeeper - 轻量级中英双语
 *
 * 设计：以中文字符串本身作为 key，英文界面查表替换，缺失时回退中文。
 * 这样新增文案无需维护一套 key，也不会出现空白标签。
 */
(() => {
  'use strict';

  const GPTM = (window.GPTM = window.GPTM || {});
  const LANG_KEY = 'gptm_lang';

  // 英文词典。键必须与代码中 t('…') 的中文字符串完全一致。
  const EN = {
    'ChatKeeper': 'ChatKeeper',
    '准备就绪': 'Ready',
    '刷新': 'Refresh',
    '设置': 'Settings',
    '关闭': 'Close',
    '取消': 'Cancel',
    '保存': 'Save',
    '创建': 'Create',
    '删除': 'Delete',
    '归档': 'Archive',
    '重试': 'Retry',
    '刷新列表': 'Refresh list',
    '清除筛选': 'Clear filters',
    '全选': 'Select all',
    '已选 0 项': 'Selected: 0',
    '已选 {count} 项': 'Selected: {count}',
    '已选 {count} 项（{hidden} 个不在当前筛选）': 'Selected: {count} ({hidden} outside current filter)',
    '移动到文件夹': 'Move to folder',
    '移出': 'Remove',
    '未分类': 'Uncategorized',
    '全部对话': 'All conversations',
    '文件夹': 'Folders',
    '新建文件夹': 'New folder',
    '搜索对话标题…': 'Search titles…',
    '全部时间': 'Any time',
    '最近 7 天': 'Last 7 days',
    '最近 30 天': 'Last 30 days',
    '最近 90 天': 'Last 90 days',
    '最近更新': 'Recently updated',
    '最早更新': 'Oldest updated',
    '标题 A→Z': 'Title A→Z',
    '时间未知': 'Unknown time',
    '今天 {time}': 'Today {time}',
    '昨天': 'Yesterday',
    '{count} 天前': '{count} days ago',
    '{month}月{day}日': '{month}/{day}',
    '刚刚': 'just now',
    '{count} 分钟前': '{count} min ago',
    '{count} 小时前': '{count} h ago',
    '仅页面': 'Page only',
    '更多操作': 'More actions',
    '文件夹操作': 'Folder actions',
    '显示更多（剩余 {count} 条）': 'Show more ({count} remaining)',
    '正在加载对话…': 'Loading conversations…',
    '正在读取你账号下的对话列表，请稍候。': 'Reading the conversation list from your account.',
    '加载失败': 'Failed to load',
    '重试': 'Retry',
    '还没有对话': 'No conversations yet',
    '在 ChatGPT 中开始一段对话后回到这里，即可批量管理与分类。': 'Start a conversation in ChatGPT, then come back to manage and organize it.',
    '没有符合条件的对话': 'No matching conversations',
    '试试调整搜索关键词、时间范围或文件夹筛选。': 'Try changing the search, time range, or folder filter.',
    '正在拉取对话列表…': 'Fetching conversations…',
    '已加载 {count} 个对话': 'Conversations loaded: {count}',
    '已加载 {count} 个对话 · {when}': 'Conversations loaded: {count} · {when}',
    '已从页面读取 {count} 个对话（无时间信息）': 'Loaded {count} from the page (no timestamps)',
    '加载失败：{message}': 'Load failed: {message}',
    '接口暂不可用，已改用页面侧边栏列表（缺少时间信息）': 'API unavailable; using the page sidebar (no timestamps)',
    '批量任务进行中，请稍候再刷新': 'A batch task is running. Try again later.',
    '列表正在刷新，请等加载完成后再操作': 'The list is refreshing. Wait for it to finish.',
    '正在取消…': 'Cancelling…',
    '取消中 · ': 'Cancelling · ',
    '正在批量删除…': 'Deleting…',
    '正在批量归档…': 'Archiving…',
    '删除完成：成功 {ok} / {total}': 'Delete finished: {ok} / {total} succeeded',
    '归档完成：成功 {ok} / {total}': 'Archive finished: {ok} / {total} succeeded',
    '已成功删除 {count} 个对话': 'Deleted: {count}',
    '已成功归档 {count} 个对话': 'Archived: {count}',
    '已取消，成功删除 {count} 个对话': 'Cancelled. Deleted: {count}',
    '已取消，成功归档 {count} 个对话': 'Cancelled. Archived: {count}',
    '删除 {count} 个对话？': 'Delete conversations? ({count})',
    '归档 {count} 个对话？': 'Archive conversations? ({count})',
    '调用 ChatGPT 网页端同一删除接口，效果等同于在侧边栏逐个删除。': 'Uses the same endpoint as deleting a conversation in ChatGPT.',
    '归档后对话会从侧边栏隐藏，可在 ChatGPT 设置的「已归档」中找回。': 'Archived conversations are hidden from the sidebar and can be restored from ChatGPT settings.',
    '此操作无法在 ChatKeeper 内撤销。建议先选中 1–2 条确认行为符合预期。': 'This cannot be undone from ChatKeeper. Try 1–2 conversations first.',
    '归档不是删除，之后仍可恢复。': 'Archiving is not deleting; conversations can be restored later.',
    '包含：': 'Includes: ',
    ' 等 {count} 个': ' and {count} total',
    '确认删除 {count} 个': 'Delete {count}',
    '确认归档 {count} 个': 'Archive {count}',
    '批量删除完成': 'Delete finished',
    '批量归档完成': 'Archive finished',
    '成功 {ok} · 失败 {failed}': 'Succeeded {ok} · Failed {failed}',
    '成功 {ok} · 失败 {failed} · 已取消': 'Succeeded {ok} · Failed {failed} · Cancelled',
    '（共 {total} 个）': ' (of {total})',
    '失败通常是频率限制、网络波动或接口变动导致。可到设置中调大「请求间隔」后重试失败项。': 'Failures are usually caused by rate limits, network issues, or API changes. Increase the request interval and retry.',
    '当前删除接口：': 'Delete endpoint: ',
    '当前归档接口：': 'Archive endpoint: ',
    '仅显示前 200 条失败记录。': 'Showing the first 200 failures.',
    '重试失败项（{count}）': 'Retry failures ({count})',
    '删除中 {done}/{total} · 成功 {ok} · 失败 {failed}': 'Deleting {done}/{total} · {ok} ok · {failed} failed',
    '归档中 {done}/{total} · 成功 {ok} · 失败 {failed}': 'Archiving {done}/{total} · {ok} ok · {failed} failed',
    '已有批量任务在进行中': 'A batch task is already running',
    '没有可操作的对话': 'Nothing to operate on',
    '已移动 {count} 个对话到「{name}」': 'Moved {count} to “{name}”',
    '已将 {count} 个对话移出文件夹': 'Removed {count} from folders',
    '没有需要变更的对话': 'No changes needed',
    '还没有文件夹': 'No folders yet',
    '＋ 新建文件夹…': '+ New folder…',
    '移出文件夹': 'Remove from folder',
    '编辑名称与颜色': 'Edit name & color',
    '删除文件夹': 'Delete folder',
    '新建子文件夹': 'New subfolder',
    '移动到…': 'Move to…',
    '顶层': 'Top level',
    '上移': 'Move up',
    '下移': 'Move down',
    '删除文件夹「{name}」？': 'Delete folder “{name}”?',
    '只会清除本地归类，不会删除任何 ChatGPT 对话。': 'This only clears local organization. No ChatGPT conversations are deleted.',
    '该文件夹中的 {count} 个对话会回到「未分类」。': '{count} conversations in this folder will become uncategorized.',
    '该文件夹目前为空。': 'This folder is empty.',
    '子文件夹会提升到上一级，不会被删除。': 'Subfolders will be moved up one level and kept.',
    '文件夹名称不能为空': 'Folder name cannot be empty',
    '文件夹数量已达上限': 'Folder limit reached',
    '文件夹层级已达上限': 'Maximum folder depth reached',
    '数据格式不正确': 'Invalid data format',
    '请输入文件夹名称': 'Enter a folder name',
    '文件夹已创建': 'Folder created',
    '文件夹已更新': 'Folder updated',
    '文件夹已删除': 'Folder deleted',
    '文件夹名称': 'Folder name',
    '名称': 'Name',
    '颜色': 'Color',
    '编辑文件夹': 'Edit folder',
    '文件夹只影响本地归类，不会修改 ChatGPT 账号数据。': 'Folders only affect local organization, not your ChatGPT account.',
    '例如：工作、学习、项目归档': 'e.g. Work, Study, Archive',
    '子文件夹': 'Subfolder',
    '在「{name}」中新建子文件夹': 'New subfolder in “{name}”',
    '文件夹 {name}': 'Folder {name}',
    '直接 {direct} / 含子文件夹 {total}': 'Direct {direct} / Including subfolders {total}',
    '打开对话': 'Open conversation',
    '更多': 'More',
    '检测到未保存的更改': 'Unsaved changes detected',
    '批量操作': 'Batch actions',
    '智能选择': 'Smart select',
    '按条件选择': 'Select by rules',
    '设置': 'Settings',
    '并发请求数': 'Concurrent requests',
    '同时执行的请求数，默认 2。遇到 429 限流时请先调低这里。': 'Requests executed in parallel. Default 2. Lower this if you hit 429 errors.',
    '请求间隔': 'Request interval',
    '每个请求完成后的等待时间。默认设置下整体约每秒 5 个请求。': 'Wait time after each request. The defaults work out to about 5 requests per second.',
    '主题': 'Theme',
    '跟随 ChatGPT': 'Follow ChatGPT',
    '浅色': 'Light',
    '深色': 'Dark',
    '界面语言': 'Language',
    '跟随浏览器': 'Follow browser',
    '中文': '中文',
    'English': 'English',
    '显示页面右下角悬浮按钮': 'Show floating button',
    '关闭后仍可通过扩展图标或快捷键 Alt+Shift+M 打开面板。': 'You can still open the panel from the toolbar icon or Alt+Shift+M.',
    '原生侧边栏增强': 'Enhance native sidebar',
    '在 ChatGPT 自带的对话列表上显示文件夹色条、勾选框和右键菜单。': 'Show folder color bars, checkboxes and a context menu on ChatGPT’s own conversation list.',
    '如果页面显示异常，可以随时关闭。': 'Turn this off if ChatGPT’s UI behaves oddly.',
    '本地数据': 'Local data',
    '文件夹 {folders} 个 · 已归类对话 {assigned} 个 · 缓存 {cached} 条': 'Folders: {folders} · Organized: {assigned} · Cached: {cached}',
    '导出数据': 'Export data',
    '导入数据': 'Import data',
    '清空文件夹': 'Clear folders',
    '清空列表缓存': 'Clear list cache',
    '清空快照': 'Clear snapshots',
    '清空正文索引': 'Clear search index',
    '删除快照': 'Delete snapshots',
    '保存删除快照': 'Save delete snapshots',
    '删除前在本地记录被删对话的标题、时间和文件夹，便于事后核对。': 'Before deleting, save titles, times and folders locally for later reference.',
    '接口诊断': 'API diagnostics',
    '当前删除接口': 'Delete endpoint',
    '当前归档接口': 'Archive endpoint',
    '重置接口适配': 'Reset API adapters',
    '使用说明': 'Help',
    '设置已保存': 'Settings saved',
    '确认清空？': 'Confirm clear?',
    '文件夹数据已清空': 'Folder data cleared',
    '列表缓存已清空，下次打开会重新拉取': 'List cache cleared; it will reload next time',
    '快照已清空': 'Snapshots cleared',
    '正文搜索缓存已清空': 'Search cache cleared',
    '已重置接口适配，下次操作会重新探测': 'API adapters reset',
    '无法打开说明页，请点击扩展图标查看': 'Could not open help; use the toolbar icon instead',
    '当前登录账号（仅用于确认操作对象，不会被保存）': 'Current account (used only for confirmation, never stored)',
    '本地数据 · 仅保存在此浏览器': 'Local only · stored in this browser',
    '所有数据只保存在本浏览器；批量操作速率可调。': 'All data stays in this browser. Batch speed is configurable.',
    '实验功能': 'Experimental',
    '快照': 'Snapshots',
    '最近删除快照': 'Recent delete snapshots',
    '本地快照仅用于事后核对，无法通过接口恢复 ChatGPT 对话。': 'Snapshots are for reference only. ChatGPT conversations cannot be restored through the API.',
    '没有快照': 'No snapshots',
    '删除对话后，这里会保留标题和时间记录。': 'Deleting conversations will keep a record of titles and times here.',
    '导出': 'Export',
    '查看': 'View',
    '清空全部': 'Clear all',
    '返回': 'Back',
    '共 {count} 个对话': 'Conversations: {count}',
    '快照已导出': 'Snapshot exported',
    '快照已删除': 'Snapshot deleted',
    '删除这个快照？': 'Delete this snapshot?',
    '只会删除本地记录，不影响 ChatGPT。': 'This only deletes the local record; ChatGPT is unaffected.',
    '删除前的本地快照已保存': 'A local snapshot was saved before deleting',
    '快照保存失败：{message}': 'Snapshot failed: {message}',
    '不保存快照继续': 'Continue without snapshot',
    '重试保存': 'Retry saving',
    '将保存删除快照（本地）': 'A local delete snapshot will be saved',
    '智能选择': 'Smart select',
    '按更新时间': 'By update time',
    '不限': 'Any',
    '超过 7 天未更新': 'Not updated in 7 days',
    '超过 30 天未更新': 'Not updated in 30 days',
    '超过 90 天未更新': 'Not updated in 90 days',
    '超过 180 天未更新': 'Not updated in 180 days',
    '超过 365 天未更新': 'Not updated in 365 days',
    '标题包含': 'Title contains',
    '标题不包含': 'Title does not contain',
    '选择范围': 'Scope',
    '当前筛选结果': 'Current filter',
    '全部对话': 'All conversations',
    '仅未归类': 'Only uncategorized',
    '将选中 {count} 个对话': 'Matches: {count}',
    '追加到已选': 'Add to selection',
    '替换选择': 'Replace selection',
    '没有符合条件的对话': 'No matching conversations',
    '输入关键词（可选）': 'Keyword (optional)',
    '正文搜索': 'Search chat text',
    '搜索正文': 'Search chat text',
    '在 {total} 个对话中搜索“{query}”': 'Searching “{query}” in {total} conversations',
    '正文搜索需要逐条读取对话内容，共 {count} 条，可能触发频率限制。是否继续？': 'Text search reads each conversation one by one ({count} total) and may hit rate limits. Continue?',
    '搜索范围：当前筛选结果，共 {count} 个对话。': 'Scope: current filter, {count} conversations.',
    '开始搜索': 'Start search',
    '停止': 'Stop',
    '搜索中 {scanned}/{total} · 命中 {matches}': 'Searching {scanned}/{total} · Matches {matches}',
    '正文搜索完成：扫描 {scanned} 个，命中 {matches} 个': 'Search finished: scanned {scanned}, matches {matches}',
    '正文搜索已取消：扫描 {scanned}/{total}，命中 {matches}': 'Search cancelled: {scanned}/{total} scanned, {matches} matches',
    '清除正文搜索': 'Clear text search',
    '继续扫描': 'Continue scanning',
    '你': 'You',
    'ChatGPT': 'ChatGPT',
    '请先输入搜索关键词': 'Enter a search term first',
    '正文搜索缓存已清空': 'Search cache cleared',
    '已清除正文搜索': 'Text search cleared',
    '导入数据': 'Import data',
    '选择 JSON 文件': 'Choose a JSON file',
    '导入预览': 'Import preview',
    '文件：{name}': 'File: {name}',
    '文件夹 {folders} 个 · 归类 {assignments} 条': 'Folders: {folders} · Assignments: {assignments}',
    '合并（保留现有数据）': 'Merge (keep existing)',
    '替换（清空现有文件夹与归类）': 'Replace (clear existing folders and assignments)',
    '合并时会自动下载当前数据作为备份。': 'A backup of current data will be downloaded before replacing.',
    '替换时会自动下载当前数据作为备份。': 'A backup of current data will be downloaded before replacing.',
    '覆盖已有归类': 'Overwrite existing assignments',
    '不勾选时，只填充尚未归类的对话。': 'When unchecked, only uncategorized conversations are filled.',
    '导入': 'Import',
    '正在读取文件…': 'Reading file…',
    '导入完成：新增 {folders} 个文件夹，应用 {assignments} 条归类': 'Import finished: {folders} folders added, {assignments} assignments applied',
    '导入失败：{message}': 'Import failed: {message}',
    '文件过大，最大支持 5 MB': 'File too large (max 5 MB)',
    '不是有效的 ChatKeeper 数据文件': 'Not a valid ChatKeeper data file',
    '导出完成': 'Export complete',
    '备份已下载': 'Backup downloaded',
    '删除快照': 'Delete snapshots',
    '原生侧边栏': 'Native sidebar',
    '原生增强已关闭': 'Native enhancement disabled',
    '原生增强已开启': 'Native enhancement enabled',
    '原生侧边栏已检测到 {count} 个对话': 'Native sidebar detected: {count} conversations',
    '未检测到原生侧边栏，可在设置中重新检测': 'Native sidebar not detected; re-check in settings',
    '重新检测': 'Re-check',
    '已重新检测原生侧边栏': 'Native sidebar re-checked',
    '移动到文件夹…': 'Move to folder…',
    '选择/取消选择': 'Select / deselect',
    '取消选择': 'Deselect',
    '选择对话': 'Select conversation',
    '已选 {count}': 'Selected: {count}',
    '清除': 'Clear',
    '没有检测到已登录的 ChatGPT 会话。': 'No logged-in ChatGPT session found.',
    '操作已取消': 'Operation cancelled',
    '无标题对话': 'Untitled conversation',
    '无法读取登录会话，请确认当前页面已登录 ChatGPT。': 'Could not read your session. Make sure you are logged in to ChatGPT.',
    '读取登录会话失败（HTTP {status}）。': 'Failed to read session (HTTP {status}).',
    '未获取到 accessToken：可能未登录，或 ChatGPT 调整了会话接口。': 'No accessToken: you may be logged out, or the session API changed.',
    '操作失败，接口未返回可识别的结果': 'The operation failed with an unrecognized response',
    'HTTP {status}：{detail}': 'HTTP {status}: {detail}',
    '删除': 'Delete',
    '归档': 'Archive',

    /* 补充文案 */
    'ChatKeeper（Alt+Shift+M）': 'ChatKeeper (Alt+Shift+M)',
    '{kind}完成：成功 {ok} / {total}': '{kind} finished: {ok} / {total} succeeded',
    '…': '…',
    '不能移动到自身或子文件夹': 'A folder cannot be moved into itself or its subfolders',
    '内容脚本未响应。如果你刚安装扩展，请刷新 ChatGPT 页面后重试。': 'The content script did not respond. If you just installed the extension, refresh the ChatGPT page and try again.',
    '前往 ChatGPT': 'Open ChatGPT',
    '单次最多扫描 {count} 个对话，本次将只扫描前 {count} 个。': 'A single search scans at most {count} conversations; this run will scan the first {count}.',
    '在 ChatGPT 中打开面板': 'Open panel in ChatGPT',
    '失败': 'Failed',
    '展开': 'Expand',
    '已取消，成功{kind} {count} 个对话': 'Cancelled · {kind} · {count}',
    '已成功{kind} {count} 个对话': 'Done · {kind} · {count}',
    '已截断': 'Truncated',
    '已检测到 ChatGPT 标签页，可以打开面板。': 'ChatGPT tab detected. You can open the panel.',
    '归类': 'Assignments',
    '当前不在 ChatGPT 页面。点击下方按钮前往 chatgpt.com。': 'Not on a ChatGPT page. Use the button below to open chatgpt.com.',
    '快照仅用于本地核对，不影响 ChatGPT 的删除。你可以重试保存，或不保存快照继续。': 'Snapshots are for local reference only and do not affect deletion. Retry saving or continue without a snapshot.',
    '成功': 'OK',
    '批量操作会作用于所有已选对话，包括不在当前筛选中的对话': 'Batch actions apply to all selected conversations, including ones outside the current filter',
    '按更新时间筛选': 'Filter by update time',
    '排序方式': 'Sort order',
    '搜索对话正文': 'Search chat text',
    '收起': 'Collapse',
    '文件夹已删除，子文件夹已提升': 'Folder deleted; subfolders moved up one level',
    '文件夹已移动': 'Folder moved',
    '无法读取当前标签页：{message}': 'Could not read the current tab: {message}',
    '本地数据由更新版本创建，当前版本只读，修改不会被保存。': 'Local data was created by a newer version. This build is read-only and changes will not be saved.',
    '正在保存删除快照…': 'Saving delete snapshot…',
    '正在批量操作…': 'Batch operation in progress…',
    '正在搜索正文…': 'Searching chat text…',
    '移动 {count} 个对话到': 'Move {count} conversations to',
    '请确认当前页面已登录 ChatGPT；如果刚安装扩展，请刷新页面后重试。': 'Make sure you are logged in to ChatGPT. If you just installed the extension, refresh the page and try again.',

    /* 说明页与弹窗 */
    'ChatGPT 接口可能随时调整；如果失败，请查看设置中的接口诊断与失败提示。': 'ChatGPT’s API may change at any time. If something fails, check the API diagnostics and error messages in Settings.',
    'ChatGPT 没有可用的服务端全文搜索，因此这是个慢功能，且会消耗网络请求。建议先用文件夹或时间缩小范围。': 'ChatGPT provides no server-side full-text search, so this is slow and uses network requests. Narrow the scope with folders or time first.',
    '。': '.',
    '也可以在浏览器工具栏点击 ChatKeeper 图标，再点「打开面板」。': 'You can also click the ChatKeeper icon in the browser toolbar and choose “Open panel”.',
    '使用前请注意': 'Before you start',
    '先登录': 'Sign in to',
    '删除前会在本地保存快照，记录标题、时间与所属文件夹。': 'Before deleting, a local snapshot records titles, times and folders.',
    '删除调用 ChatGPT 网页端同一接口，效果等同于在侧边栏逐个删除。': 'Deletion uses the same endpoint as ChatGPT’s sidebar delete — just much faster.',
    '勾选对话后点「移动到文件夹」，或直接把对话行拖到文件夹上。': 'Select conversations and click “Move to folder”, or drag rows onto a folder.',
    '勾选对话，或用表头「全选」。': 'Select conversations, or use “Select all” in the header.',
    '在 ChatGPT 自带的对话列表左侧显示文件夹色条；鼠标悬停会出现复选框。': 'Folder color bars appear on ChatGPT’s own conversation list; checkboxes appear on hover.',
    '在搜索框输入关键词，点「正文搜索」，扩展会逐条读取对话内容。': 'Enter a keyword, click “Search chat text”, and the extension reads each conversation.',
    '如何打开面板': 'Open the panel',
    '如果 ChatGPT 改版导致显示异常，可在设置中关闭原生增强，面板功能不受影响。': 'If a ChatGPT update breaks the native sidebar, turn the enhancement off in Settings. The panel keeps working.',
    '安装或更新扩展后，需要刷新 ChatGPT 页面。': 'After installing or updating the extension, refresh the ChatGPT page.',
    '底部的批量操作栏可移动、归档、删除；右键对话可打开快捷菜单。': 'A bottom action bar can move, archive or delete; right-click a conversation for a quick menu.',
    '快捷键': 'Shortcut',
    '快照可在「删除快照」中查看或导出 JSON；它只用于事后核对，无法恢复 ChatGPT 对话。': 'View or export snapshots as JSON under “Delete snapshots”. They are for reference only and cannot restore conversations.',
    '打开面板，扩展会用当前登录会话拉取全部对话。': 'Open the panel; it loads all conversations using your current session.',
    '扩展仅申请 storage 权限和 ChatGPT 站点访问权限，不加载远程代码。': 'The extension requests only storage access and ChatGPT site access, and loads no remote code.',
    '批量删除': 'Bulk delete',
    '批量删除 · 文件夹 · 搜索': 'Bulk delete · Folders · Search',
    '批量删除 · 文件夹 · 提示词': 'Bulk delete · Folders · Prompts',
    '批量删除 · 文件夹 · 搜索 · 提示词': 'Bulk delete · Folders · Search · Prompts',
    '批量删除不可撤销，请先小批量验证。': 'Bulk deletion cannot be undone. Test with a few conversations first.',
    '按「超过 N 天未更新」「标题包含或不包含」等条件一次选中对话，支持追加或替换当前选择。': 'Select conversations by “not updated in N days” or title contains/does not contain, then add to or replace the current selection.',
    '搜索有进度、可随时停止；结果会显示命中片段并高亮。': 'Search shows progress and can be stopped; results include highlighted snippets.',
    '文件夹、归类、设置保存在浏览器本地；可导出 JSON 备份，也可导入合并或替换。': 'Folders, assignments and settings stay in this browser. Export JSON backups, or import with merge/replace.',
    '文件夹与子文件夹': 'Folders and subfolders',
    '文件夹与归类只保存在浏览器本地，不会上传到任何服务器。': 'Folders and assignments stay in this browser and are never uploaded.',
    '文件夹可上移或下移排序；删除父文件夹时，子文件夹会提升到上一级，对话回到「未分类」。': 'Folders can be moved up or down. Deleting a parent promotes subfolders and returns its conversations to Uncategorized.',
    '新建文件夹后，可在文件夹菜单里继续新建子文件夹，或用拖拽把文件夹放进另一个文件夹。': 'Create subfolders from the folder menu, or drag a folder into another folder.',
    '智能选择与删除快照': 'Smart selection and delete snapshots',
    '正在检测当前页面…': 'Checking the current tab…',
    '正文索引只存在内存中，刷新页面后需要重新读取。': 'The text index lives in memory only and is rebuilt after a page reload.',
    '清理列表缓存不会影响文件夹与归类数据。': 'Clearing the list cache does not affect folders or assignments.',
    '点「删除」→ 确认 → 等待进度完成。': 'Click “Delete” → confirm → wait for the progress bar.',
    '点击页面右下角的绿色悬浮按钮，或按 Alt + Shift + M。': 'Click the green floating button at the bottom-right, or press Alt + Shift + M.',
    '父文件夹的计数包含所有子文件夹，点击父文件夹会显示其下全部对话。': 'A parent folder’s count includes all subfolders; clicking it shows every conversation underneath.',
    '用搜索、时间筛选或左侧文件夹定位。': 'Use search, the time filter, or the folder list to narrow it down.',
    '界面支持中文与英文，默认跟随浏览器语言，可在设置中切换。': 'The UI supports Chinese and English. It follows the browser language by default and can be changed in Settings.',
    '界面语言与数据': 'Language and data',
    '请只操作自己的账号。': 'Only manage your own account.',
    '这是第三方扩展，与 OpenAI 官方无关。': 'This is a third-party extension and is not affiliated with OpenAI.',

    /* 提示词库与 AI 优化 */
    'AI 优化已关闭，已使用本地结构化优化。': 'AI optimization is off; used local structured enhancement instead.',
    'AI 提示词优化（GLM-4-Flash）': 'AI prompt optimization (GLM-4-Flash)',
    '优化': 'Optimize',
    '优化失败：{message}': 'Optimization failed: {message}',
    '优化当前输入框': 'Optimize composer text',
    '优化提示词': 'Optimize prompt',
    '优化结果': 'Optimized prompt',
    '优化风格': 'Style',
    '使用': 'Use',
    '使用本地规则优化': 'Use local rules',
    '保存到提示词库': 'Save to prompt library',
    '删除提示词「{name}」？': 'Delete prompt “{name}”?',
    '原始提示词': 'Original prompt',
    '只会删除本地保存的提示词。': 'This only deletes the local prompt.',
    '只发送当前提示词，不发送对话历史': 'Only the current prompt is sent; no chat history',
    '可用 {{变量名}} 占位，使用时填写': 'Use {{variable}} placeholders and fill them when inserting',
    '启用 AI 优化（未配置时使用本地规则）': 'Enable AI optimization (local rules when no key)',
    '在 open.bigmodel.cn 创建免费 API Key；Key 只保存在本浏览器，不写入导出文件。': 'Create a free API key at open.bigmodel.cn. The key stays in this browser and is not included in exports.',
    '在此填入 API Key': 'Enter your API key',
    '填入输入框': 'Insert',
    '填写变量': 'Fill variables',
    '复制': 'Copy',
    '复制失败，请手动复制': 'Copy failed; copy manually',
    '已使用 {model} 优化。': 'Optimized with {model}.',
    '已保存，留空则不修改': 'Saved; leave blank to keep it',
    '已填入 ChatGPT 输入框': 'Inserted into the ChatGPT composer',
    '已复制': 'Copied',
    '已清除 API Key': 'API key cleared',
    '已配置 · 模型 {model}': 'Configured · {model}',
    '开始优化': 'Optimize',
    '提示词会发送到智谱 GLM（{model}）。': 'The prompt is sent to Zhipu GLM ({model}).',
    '提示词内容': 'Prompt content',
    '提示词已创建': 'Prompt created',
    '提示词已删除': 'Prompt deleted',
    '提示词已导出': 'Prompts exported',
    '提示词已更新': 'Prompt updated',
    '提示词库': 'Prompt library',
    '提示词数量已达上限': 'Prompt limit reached',
    '提示词模块未加载': 'Prompt module is not loaded',
    '搜索提示词…': 'Search prompts…',
    '新建提示词': 'New prompt',
    '替换到输入框': 'Replace composer text',
    '未找到 ChatGPT 输入框，已复制到剪贴板': 'ChatGPT composer not found; copied to clipboard',
    '未配置 API Key 或 AI 已关闭，将使用本地结构化优化。': 'No API key or AI is off; local structured enhancement will be used.',
    '未配置 API Key，已使用本地结构化优化。': 'No API key; used local structured enhancement.',
    '未配置 · 将使用本地结构化优化': 'Not configured · local structured enhancement will be used',
    '本地保存 · 支持 {{变量}} · 一键填入输入框': 'Stored locally · {{variables}} · insert in one click',
    '本地结构化增强': 'Local structured enhancement',
    '正在优化…': 'Optimizing…',
    '没有匹配的提示词': 'No matching prompts',
    '测试中…': 'Testing…',
    '测试连接': 'Test connection',
    '清除 Key': 'Clear key',
    '确认清除？': 'Confirm clear?',
    '简洁': 'Concise',
    '结构化': 'Structured',
    '编辑': 'Edit',
    '编辑提示词': 'Edit prompt',
    '获取 API Key': 'Get API key',
    '详细': 'Detailed',
    '请先填写 API Key': 'Enter an API key first',
    '请输入提示词': 'Enter a prompt',
    '请输入提示词内容': 'Enter prompt content',
    '请输入提示词名称': 'Enter a prompt name',
    '还没有提示词。创建常用模板，使用时一键填入输入框。': 'No prompts yet. Create templates and insert them in one click.',
    '连接失败：{message}': 'Connection failed: {message}',
    '连接成功': 'Connected',
    '连接成功（{model}）': 'Connected ({model})',
    '重新优化': 'Optimize again',
    '未配置 API Key': 'No API key configured',
    'API Key 无效或已过期': 'The API key is invalid or expired',
    '请求过于频繁（429），请稍后再试': 'Too many requests (429); try again later',
    '模型返回空内容，请重试或改用 glm-4-flash': 'The model returned empty content; retry or use glm-4-flash',
    '请求超时，请重试': 'Request timed out; try again',
    '网络请求失败': 'Network request failed',
    '智谱服务异常，请稍后重试': 'Zhipu service error; try again later',
    '请求参数有误': 'Invalid request parameters',
    '无法读取本地 API Key': 'Could not read the local API key',
    '未知错误': 'Unknown error',

    /* 说明页：提示词与权限 */
    '提示词库与优化': 'Prompt library and optimization',
    '在左侧打开「提示词库」，可以创建、编辑、搜索提示词模板；用 {{变量}} 占位，使用时一键填入输入框。': 'Open “Prompt library” on the left to create, edit and search templates. Use {{variables}} as placeholders and insert them in one click.',
    '对模板或当前输入框点「优化」，可用 GLM-4-Flash 改写提示词；结果不会自动发送。': 'Click “Optimize” on a template or the composer text to rewrite it with GLM-4-Flash. Results are never sent automatically.',
    '在设置 →「AI 提示词优化」中填入 open.bigmodel.cn 的免费 API Key；未配置时使用本地结构化优化。': 'Add a free API key from open.bigmodel.cn under Settings → AI prompt optimization. Without a key, local structured enhancement is used.',
    'API Key 只保存在本浏览器，不写入导出；优化时只会把当前提示词发送到智谱，不发送对话历史。': 'The API key stays in this browser and is not included in exports. Only the current prompt is sent to Zhipu, never the chat history.',
    '扩展仅申请 storage、ChatGPT 站点访问权限，以及可选的 open.bigmodel.cn 权限，不加载远程代码。': 'The extension requests only storage access, ChatGPT site access, and optional open.bigmodel.cn access. It loads no remote code.',
    'AI 优化需要你自己的 API Key，并会把当前提示词发送到智谱；不点击优化则不会联网。': 'AI optimization needs your own API key and sends the current prompt to Zhipu. If you never click Optimize, no request is made.',

    /* 输入框旁一键优化 */
    '一键优化提示词': 'Optimize prompt',
    '请先输入提示词': 'Enter a prompt first',
    '提示词已优化': 'Prompt optimized',
    '已使用本地规则优化': 'Optimized with local rules',
    '撤销': 'Undo',
    '已撤销': 'Undone',
    '输入框已修改，无法撤销': 'The composer has changed; cannot undo',
    '使用本地规则': 'Use local rules',
    '在输入框旁显示优化按钮': 'Show an optimize button next to the composer',
    '输入框旁还有一个一键优化按钮：点击后直接替换提示词，并可在提示条中撤销。': 'A one-click optimize button also sits next to the composer: it replaces the prompt immediately and offers Undo in the toast.',
    '可在设置里选择优化风格，或关闭输入框旁的优化按钮。': 'Choose the optimization style in Settings, or hide the button next to the composer.',
    '输入框已修改，已放弃本次优化': 'The composer changed; the optimization result was discarded',
    '复制结果': 'Copy result',
  };

  let currentLang = 'zh';
  let languageSetting = 'auto';
  const missing = new Set();

  function detectLanguage(setting) {
    if (setting === 'zh' || setting === 'en') return setting;
    let ui = '';
    try {
      ui = (chrome.i18n && chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || navigator.language || '';
    } catch {
      ui = (typeof navigator !== 'undefined' && navigator.language) || '';
    }
    return /^zh\b|^zh[-_]/i.test(ui) ? 'zh' : 'en';
  }

  function format(str, params) {
    if (!params) return str;
    return String(str).replace(/\{(\w+)\}/g, (match, key) => (
      Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
    ));
  }

  function t(source, params) {
    let str = source;
    if (currentLang === 'en') {
      if (Object.prototype.hasOwnProperty.call(EN, source)) str = EN[source];
      else {
        missing.add(source);
        str = source;
      }
    }
    return format(str, params);
  }

  function setLanguage(setting) {
    languageSetting = setting || 'auto';
    currentLang = detectLanguage(languageSetting);
    try {
      window.dispatchEvent(new CustomEvent('gptm:language', { detail: { lang: currentLang, setting: languageSetting } }));
    } catch { /* ignore */ }
    return currentLang;
  }

  function applyDom(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((node) => {
      node.textContent = t(node.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach((node) => {
      node.setAttribute('title', t(node.getAttribute('data-i18n-title')));
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
      node.setAttribute('placeholder', t(node.getAttribute('data-i18n-placeholder')));
    });
    scope.querySelectorAll('[data-i18n-aria]').forEach((node) => {
      node.setAttribute('aria-label', t(node.getAttribute('data-i18n-aria')));
    });
  }

  async function loadSetting() {
    try {
      const data = await chrome.storage.local.get(LANG_KEY);
      return (data && data[LANG_KEY]) || 'auto';
    } catch {
      return 'auto';
    }
  }

  async function initPage() {
    let forced = '';
    try {
      forced = new URLSearchParams(location.search).get('lang') || '';
    } catch { /* ignore */ }
    const setting = (forced === 'zh' || forced === 'en') ? forced : await loadSetting();
    setLanguage(setting);
    if (document.documentElement) {
      document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
    }
    applyDom(document);
  }

  async function saveSetting(setting) {
    languageSetting = setting || 'auto';
    currentLang = detectLanguage(languageSetting);
    try {
      await chrome.storage.local.set({ [LANG_KEY]: languageSetting });
    } catch { /* ignore */ }
  }

  GPTM.i18n = {
    t,
    setLanguage,
    getLanguage: () => currentLang,
    getSetting: () => languageSetting,
    detectLanguage,
    applyDom,
    initPage,
    saveSetting,
    missingKeys: () => Array.from(missing),
    dictionary: EN,
  };
  GPTM.t = t;

  // 内容脚本由 boot.js 在 store 就绪后设置语言；扩展页面自行初始化
  if (typeof document !== 'undefined' && document.currentScript) {
    const src = document.currentScript.getAttribute('src') || '';
    if (/src\/popup\//.test(src) || /welcome\.html$/.test(location.pathname)) {
      initPage();
    }
  }
})();
