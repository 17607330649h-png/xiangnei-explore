import { BANK } from './data.mjs';
import { freshState, parseRecord, validateState, setAnswer, setNote, stats, firstUnanswered,
  escapeHTML as e, answerLabel, textRecord, csvRecord, SoftTimer } from './core.mjs';
import { loadLocal, saveLocal } from './storage.mjs';

const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const fileInput = document.querySelector('#import-file');
let storage;
try { storage = window.localStorage; } catch { storage = null; }
const loaded = loadLocal(storage);
let state = loaded.state;
let storageMode = loaded.mode;
let saved = storageMode === 'ready';
let view = 'home';
let pendingNA = false;
let pendingImport = null;
let filter = 'all';
let timerQuestion = null;
let timerReady = false;
let timerPaused = false;
let toastTimeout;
const timer = new SoftTimer();
const icons = {
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  back: '<path d="M19 12H5m5-5-5 5 5 5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4Z"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  leaf: '<path d="M5 19C2 9 9 3 20 4c1 11-6 17-15 15Zm0 0L15 9"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`;
const button = (action, text, cls = 'button secondary', extra = '') => `<button type="button" class="${cls}" data-action="${action}" ${extra}>${text}</button>`;
const label = (rows, id) => rows.find(x => x.id === id)?.label || '';
const hasRecord = () => Boolean(state.updatedAt || state.startedAt);

function announce(message) { document.querySelector('#announcer').textContent = message; }
function toast(message) {
  const node = document.querySelector('#toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { node.hidden = true; }, 3200);
}
function saveText() {
  if (storageMode === 'corrupt') return '原记录未覆盖';
  return saved ? '已保存到当前浏览器' : '本次修改暂未保存，请导出';
}
function updateSaveIndicator() {
  document.querySelectorAll('[data-save-status]').forEach(n => {
    n.textContent = saveText();
    n.classList.toggle('unsaved', !saved);
  });
  document.querySelectorAll('.status-dot').forEach(n => n.classList.toggle('warn', !saved));
}
function persist() {
  state.updatedAt = new Date().toISOString();
  if (storageMode === 'corrupt') { saved = false; updateSaveIndicator(); return; }
  saved = saveLocal(storage, state);
  storageMode = saved ? 'ready' : 'memory';
  updateSaveIndicator();
}
function header() {
  return `<header class="site-header"><div class="header-inner">
    <button class="brand" data-action="home" aria-label="向内，回到首页"><span class="brand-mark">${icon('leaf')}</span><span>向内<span class="brand-subtitle">行为探索</span></span></button>
    <nav aria-label="主要导航">${button('report', '我的记录', 'nav-button')}${button('settings', icon('settings') + '<span class="mobile-hide">设置</span>', 'nav-button', 'aria-label="设置"')}</nav>
  </div></header>`;
}
function footer() {
  return `<footer class="site-footer"><span><span class="status-dot ${saved ? '' : 'warn'}"></span><span data-save-status>${saveText()}</span></span><span>原创题库 · 试用版 0.5</span></footer>`;
}
function home() {
  const s = stats(state);
  const sample = BANK.questions[2];
  return `<main id="main" class="home-main">
    ${storageMode === 'corrupt' ? `<aside class="notice recovery"><strong>发现一份暂时无法读取的本机记录。</strong><p>原内容仍保留着。你可以先下载原始记录，再选择重新开始或导入备份。</p>${button('raw-export', '下载原始记录')}${button('new-record', '重新开始', 'button text-button')}</aside>` : ''}
    ${storageMode === 'memory' ? '<aside class="notice"><strong>当前浏览器暂时无法保存。</strong><p>仍可答题，请在离开页面前导出 JSON 备份。</p></aside>' : ''}
    <section class="hero"><div class="hero-copy"><p class="eyebrow"><span class="tiny-line"></span> 把注意力，放回真实的自己</p>
      <h1 tabindex="-1">从做过的事，<br>发现自己的<span class="ink-accent">倾向。</span></h1>
      <p class="hero-description">两种做法，都有它的道理。回想真实经历，选更接近自己的那一种；再用几个事例，慢慢看清。</p>
      <div class="hero-actions">${button('start', (hasRecord() ? '继续我的探索' : '开始探索') + icon('arrow'), 'button primary large')}${button('import', '导入已有记录', 'button text-button')}</div>
      ${hasRecord() ? `<p class="resume-note">已回应 ${s.responded} / 64 组 · 已记下 ${s.stories} 个事例 ${button('report', '查看当前摘要', 'inline-button')}</p>` : '<p class="quiet hero-privacy">无需注册 · 答案保存在当前浏览器 · 随时可以停下</p>'}
    </div><div class="hero-visual" aria-label="题目示例"><div class="visual-caption"><span>一组问题，两种自然的做法</span><span>03 / 64</span></div><div class="sample-sheet">
      <span class="sample-kicker">比如这一个时刻</span><h2>${e(sample.stem)}</h2>
      <div class="sample-option"><span>A</span><p>${e(sample.A)}</p></div><div class="sample-option"><span>B</span><p>${e(sample.B)}</p></div>
      <p class="sample-foot">示例，无需在这里作答</p></div><span class="visual-decoration" aria-hidden="true">每一种做法<br>都有来处</span></div></section>
    <section class="home-details" aria-label="开始前了解"><div class="detail-item"><span class="detail-number">64</span><div><h2>组成对问题</h2><p>59 组主问题，5 组补充方式。<br>可以跳过，也可以回来修改。</p></div></div><div class="detail-item"><span class="detail-number">20<span>秒</span></span><div><h2>轻轻提醒一下</h2><p>到时只提示一次，继续想也可以。<br>随时暂停或关闭，不影响记录。</p></div></div><div class="detail-item"><span class="detail-number">08</span><div><h2>个事例追问</h2><p>把选择放回具体经历。<br>自愿填写，不计时。</p></div></div></section>
    <section class="home-bottom"><div><p class="eyebrow">开始之前</p><h2>带着经历来，<br>不用带着标准答案。</h2></div><div class="before-list"><p><span>01</span>想近六个月里，你确实经历过、也有选择空间的事情。</p><p><span>02</span>两边都能做时，再选更常主动采用的一边。职责或条件已经决定做法时，选“暂难比较”。</p><p><span>03</span>这是原创题库试用版，尚未完成测量验证。摘要只整理你的回答与事例，不给出优势排名或职业匹配结论。</p>
      <details class="profile-details"><summary>给这次探索留个起点 <span>选填</span></summary><div class="field"><label for="nickname">昵称</label><input id="nickname" data-profile="name" maxlength="40" autocomplete="off" value="${e(state.profile.name)}" placeholder="怎么称呼自己都可以"></div><div class="field"><label for="goal">这次想弄清什么？</label><textarea id="goal" data-profile="goal" maxlength="200" rows="2" placeholder="比如：什么样的做事方式让我更有投入感？">${e(state.profile.goal)}</textarea></div></details>
    </div></section>
    <div class="privacy-strip">${icon('leaf')}<p>答案只保存在当前浏览器，本网页不接收或上传答卷。换设备、清理浏览器或使用隐私模式前，请导出 JSON 备份。</p></div>
  </main>`;
}
function optionsHTML(rows, current, emptyLabel) {
  return `<option value="">${emptyLabel}</option>` + rows.map(r => `<option value="${r.id}" ${r.id === current ? 'selected' : ''}>${e(r.label)}</option>`).join('');
}
function question() {
  const q = BANK.questions[state.cursor.index];
  const a = state.answers[q.id];
  const note = state.notes[q.id];
  const focused = state.focus.includes(q.id);
  const s = stats(state);
  const isLast = state.cursor.index === BANK.questions.length - 1;
  return `<main id="main" class="question-main"><div class="progress-meta"><span>行为探索 <span class="quiet">/ ${q.kind === 'main' ? '主问题' : '补充方式'}</span></span>${button('browse', icon('grid') + '题目目录', 'inline-button')}</div>
    <div class="progress-track" role="progressbar" aria-label="已回应题目" aria-valuenow="${s.responded}" aria-valuemin="0" aria-valuemax="64"><div style="width:${s.responded / 64 * 100}%"></div></div>
    <div class="question-topline"><p class="question-count"><strong>${String(q.number).padStart(2, '0')}</strong><span> / 64</span></p><div class="timer-area">${state.settings.softTimer ? `<span class="timer-pill">${icon('clock')}<span id="timer-label">20 秒轻提醒</span></span>${button('pause', timerPaused ? '继续计时' : '暂停计时', 'inline-button', `id="pause-timer" aria-pressed="${timerPaused}"`)}` : '<span class="quiet small">轻提醒已关闭</span>'}</div></div>
    <h1 class="question-heading" tabindex="-1">${e(q.stem)}</h1><p class="question-guide">想一想近六个月，哪一种是你更常主动采用的做法。</p>
    <div class="choice-grid" aria-label="选择更接近自己的做法">${['A','B'].map(choice => `<button type="button" class="choice-card ${a?.choice === choice ? 'selected' : ''}" data-action="answer" data-choice="${choice}" aria-pressed="${a?.choice === choice}"><span class="choice-letter">${choice}</span><span class="choice-text">${e(q[choice])}</span><span class="choice-check">${icon('check')}</span></button>`).join('')}</div>
    <div class="uncertain-line">${button('uncertain', '暂难比较', 'uncertain-button ' + (a?.choice === null ? 'selected' : ''), `aria-expanded="${pendingNA || a?.choice === null}"`)}<span>${a?.choice === null ? e(label(BANK.reasons, a.reason)) : '经历不足、条件限定或两边难以取舍，都可以如实记录。'}</span></div>
    ${pendingNA || a?.choice === null ? `<fieldset class="reason-box"><legend>是什么让你暂时难以比较？</legend><div class="reason-grid">${BANK.reasons.map(r => button('reason', e(r.label), 'reason-button ' + (a?.reason === r.id ? 'selected' : ''), `data-reason="${r.id}" aria-pressed="${a?.reason === r.id}"`)).join('')}</div>${pendingNA ? '<p class="small quiet">选一个原因后再继续。之前的回答暂时保留。</p>' : ''}</fieldset>` : ''}
    <div id="timer-reminder" class="timer-reminder" ${timer.fired && state.settings.softTimer ? '' : 'hidden'}>已经过了约 20 秒。可以继续想，也可以选“暂难比较”；时间不影响记录。</div>
    <div class="question-tools">${button('focus', icon('bookmark') + (focused ? '已标记，之后用事例再看' : '值得用事例再看'), 'inline-button focus-button ' + (focused ? 'active' : ''), `aria-pressed="${focused}"`)}<span class="small quiet">已回应 ${s.responded} / 64 组</span></div>
    <details class="note-details" ${note ? 'open' : ''}><summary>记一点情境，或反馈这道题 <span>选填</span></summary><div class="note-fields"><div class="field"><label for="context">想到的情境</label><select id="context" data-note="context">${optionsHTML(BANK.contexts, note?.context, '还没有指定')}</select></div><div class="field"><label for="issue">这道题有什么问题？</label><select id="issue" data-note="issue">${optionsHTML(BANK.issues, note?.issue, '没有要反馈的')}</select></div><div class="field full"><label for="question-note">具体经历或想法</label><textarea id="question-note" data-note="text" rows="3" maxlength="800" placeholder="发生了什么？当时有哪些限制？不必写真实姓名或敏感信息。">${e(note?.text || '')}</textarea><span class="field-hint">反馈也只保存在本机，可随答卷一起导出。</span></div></div></details>
    <div class="question-navigation">${button('previous', icon('back') + '上一题', 'button text-button', state.cursor.index === 0 ? 'disabled' : '')}<div>${!a ? button('skip', '稍后再答', 'button text-button') : ''}${button('next', (isLast ? '写下真实事例' : '下一题') + icon('arrow'), 'button primary', !a || pendingNA ? 'disabled' : '')}</div></div>
    <p class="question-bottom">没有标准答案。两种做法先后都做时，只在确实能区分自己的倾向时选择。</p>
  </main>`;
}
function stories() {
  const p = BANK.prompts[state.cursor.storyIndex];
  const last = state.cursor.storyIndex === BANK.prompts.length - 1;
  return `<main id="main" class="story-main"><div class="section-top"><span class="eyebrow">把选择，放回经历</span><span class="quiet small">事例 ${state.cursor.storyIndex + 1} / 8 · 不计时</span></div>
    <h1 tabindex="-1">${e(p.text)}</h1><p class="story-intro">有相关经历就记下来；没有合适的例子，可以留空。</p>
    <div class="story-hints"><span>当时的情境</span><span>你实际做了什么</span><span>结果与感受</span><span>有没有相反的例子</span></div>
    <label for="story" class="sr-only">写下这次经历</label><textarea id="story" class="story-textarea" data-story="${p.id}" maxlength="1800" rows="10" placeholder="写具体的一次经历。只记你愿意留在本机的内容。">${e(state.stories[p.id] || '')}</textarea>
    <div class="textarea-bottom"><span data-save-status>${saveText()}</span><span id="story-count">${(state.stories[p.id] || '').length} / 1800</span></div>
    <div class="story-navigation">${button('story-previous', icon('back') + (state.cursor.storyIndex === 0 ? '回到成对问题' : '上一个事例'), 'button text-button')}${button('story-next', (last ? '查看我的摘要' : '下一个事例') + icon('arrow'), 'button primary')}</div>
    <div class="story-skip">${button('report', '先看当前摘要', 'inline-button')}</div>
  </main>`;
}
function recordCard(q) {
  const a = state.answers[q.id], n = state.notes[q.id];
  return `<article class="record-card"><div class="record-title"><span class="record-number">${String(q.number).padStart(2,'0')}</span><h3>${e(q.stem)}</h3>${button('jump', '修改', 'inline-button', `data-index="${q.number - 1}" aria-label="修改第 ${q.number} 题"`)}</div><p class="record-answer ${!a || a.choice === null ? 'muted' : ''}">${e(answerLabel(state,q))}</p>
    ${a?.reason ? `<p class="record-meta">${e(label(BANK.reasons,a.reason))}</p>` : ''}${n?.context ? `<p class="record-meta">情境：${e(label(BANK.contexts,n.context))}</p>` : ''}${n?.text ? `<p class="record-note">${e(n.text)}</p>` : ''}${n?.issue ? `<p class="record-meta">审题反馈：${e(label(BANK.issues,n.issue))}</p>` : ''}${state.focus.includes(q.id) ? '<span class="record-flag">已标记 · 值得用事例再看</span>' : ''}</article>`;
}
function report() {
  const s = stats(state);
  const list = BANK.questions.filter(q => filter === 'all' || filter === 'focus' && state.focus.includes(q.id) || filter === 'uncertain' && state.answers[q.id]?.choice === null || filter === 'unanswered' && !state.answers[q.id]);
  return `<main id="main" class="report-main"><div class="report-header"><div><p class="eyebrow">留一份可以回看的记录</p><h1 tabindex="-1">${state.profile.name ? e(state.profile.name) + '的' : '我的'}探索摘要<span class="dot">。</span></h1><p>此刻的自述，是继续观察自己的起点。</p></div>${button('resume-questions', (s.remaining ? '继续答题' : '回看题目') + icon('arrow'), 'button primary')}</div>
    ${state.profile.goal ? `<div class="explore-goal"><span>这次想弄清</span><p>${e(state.profile.goal)}</p></div>` : ''}
    <section class="summary-stats" aria-label="回答概况"><div><strong>${s.selected}<span> / 64</span></strong><span>已作选择</span></div><div><strong>${s.uncertain}</strong><span>暂难比较</span></div><div><strong>${s.remaining}</strong><span>尚未回答</span></div><div><strong>${s.stories}<span> / 8</span></strong><span>已记下的事例</span></div></section>
    <div class="report-explanation"><p>这里整理了你选过的做法、保留的疑问和具体经历。选择次数没有被换算成能力、优势排名或职业建议；“暂难比较”与“未答”也分别保留。</p>${s.uncertain ? `<p class="reason-summary">暂难比较的原因：${BANK.reasons.filter(r => s.reasons[r.id]).map(r => `${e(r.label)} ${s.reasons[r.id]} 题`).join(' · ')}</p>` : ''}</div>
    <section class="export-panel"><div><h2>把这份记录带走</h2><p>JSON 用于恢复答题；文字与表格适合阅读、整理或分享。</p></div><div class="export-actions">${button('export-json', icon('download') + 'JSON 备份', 'button secondary')}${button('export-txt', '文字 TXT', 'button secondary')}${button('export-csv', '表格 CSV', 'button secondary')}</div><p class="small quiet export-foot">导出的文件包含你的回答与备注。分享前，看看是否有不愿公开的内容。清理浏览器前，先备份。</p></section>
    <section class="report-section"><div class="section-heading"><div><p class="eyebrow">做法与情境</p><h2>重新看一眼，你的选择</h2></div><span class="quiet small">已标记 ${s.focus} 题</span></div><p class="section-description">哪些做法在不同场合反复出现？哪些更受职责或条件影响？可以回到题目，标记值得核对的地方。</p>
      <div class="filter-tabs" role="group" aria-label="筛选题目">${[['all','全部',64],['focus','已标记',s.focus],['uncertain','暂难比较',s.uncertain],['unanswered','未答',s.remaining]].map(([id,name,count]) => button('filter', `${name}<span>${count}</span>`, 'filter-button ' + (filter === id ? 'active' : ''), `data-filter="${id}" aria-pressed="${filter === id}"`)).join('')}</div>
      <div class="record-list">${list.length ? list.map(recordCard).join('') : '<div class="empty-state">这里还没有记录。可以先回看题目，留下你想进一步观察的地方。</div>'}</div>
    </section><section class="report-section"><div class="section-heading"><div><p class="eyebrow">真实事例</p><h2>让经历，补上选择的来处</h2></div>${button('stories', '补充事例' + icon('arrow'), 'inline-button')}</div><div class="story-records">${BANK.prompts.map((p,i) => `<article class="story-record"><div><span>${String(i+1).padStart(2,'0')}</span><h3>${e(p.text)}</h3>${button('jump-story','编辑','inline-button',`data-index="${i}" aria-label="编辑第 ${i+1} 个事例"`)}</div><p class="${state.stories[p.id]?.trim() ? '' : 'quiet'}">${e(state.stories[p.id]?.trim() || '还没有填写，留空也可以。')}</p></article>`).join('')}</div></section>
    <div class="report-closing"><h2>不急着给自己下定义。</h2><p>也看看相反的经历，问问熟悉你的人。过一段时间，带着新的事例再回来。</p></div>
  </main>`;
}
function render(focusHeading = false) {
  timerReady = false;
  if (view === 'questions') {
    const id = BANK.questions[state.cursor.index].id;
    if (timerQuestion !== id) { timerQuestion = id; timer.reset(); timerPaused = false; }
  }
  app.innerHTML = header() + (view === 'home' ? home() : view === 'questions' ? question() : view === 'stories' ? stories() : report()) + footer();
  document.title = (view === 'home' ? '' : view === 'questions' ? `第 ${state.cursor.index + 1} 题 · ` : view === 'stories' ? '真实事例 · ' : '探索摘要 · ') + '向内 · 行为探索';
  if (view === 'questions') {
    requestAnimationFrame(() => { timerReady = view === 'questions'; tick(); });
  } else { timer.tick(performance.now(), false); }
  updateSaveIndicator();
  if (focusHeading) {
    window.scrollTo({ top:0, behavior:'instant' });
    app.querySelector('h1')?.focus({ preventScroll:true });
  }
}
function navigate(next, index) {
  pendingNA = false;
  if (next === 'questions' && index !== undefined) state.cursor.index = index;
  if (next === 'stories' && index !== undefined) state.cursor.storyIndex = index;
  if (next !== 'home') { state.cursor.view = next; persist(); }
  view = next;
  render(true);
}
function tick() {
  const running = view === 'questions' && timerReady && !timerPaused && state.settings.softTimer && !document.hidden && !modal.open;
  const result = timer.tick(performance.now(), running);
  const node = document.querySelector('#timer-label');
  if (node) node.textContent = timerPaused ? '已暂停' : result.remaining ? result.remaining + ' 秒轻提醒' : '按自己的节奏来';
  if (result.notify && view === 'questions' && state.settings.softTimer) {
    const reminder = document.querySelector('#timer-reminder');
    if (reminder) reminder.hidden = false;
    announce('已经过了约二十秒，可以继续思考，也可以选暂难比较。时间不影响记录。');
  }
}
function showDialog(title, content) {
  modal.innerHTML = `<div class="dialog-head"><h2 id="modal-title">${title}</h2>${button('close-dialog',icon('close'),'icon-button','aria-label="关闭对话框"')}</div>${content}`;
  if (!modal.open) modal.showModal();
  timer.tick(performance.now(), false);
}
function settingsDialog() {
  showDialog('按自己的节奏来', `<div class="settings-row"><div><h3>20 秒轻提醒</h3><p>只提醒一次，不会自动选择、跳题或提交。</p></div><label class="switch"><input id="timer-setting" type="checkbox" ${state.settings.softTimer ? 'checked' : ''} aria-label="开启20秒轻提醒"><span></span></label></div>
    <div class="dialog-section"><h3>本机保存与备份</h3><p>这份答卷保存在当前浏览器。换设备时，先导出 JSON，再到另一台设备导入。网页不会接收你的答案，也没有账户同步。</p><p class="small" data-save-status>${saveText()}</p><div class="dialog-actions">${button('export-json','导出 JSON 备份')}${button('import','导入 JSON')}</div></div>
    <div class="dialog-section"><h3>关于这份题库</h3><p>64 组成对问题与 8 个事例追问，均来自本次原创题库。它还没有经过正式测量验证，用于自我观察与题目试用；不生成优势排名、人格诊断或职业匹配结论。</p></div>
    <div class="dialog-section danger-section"><h3>重新开始</h3><p>只替换向内在这个浏览器里的当前记录。重新开始前，可以先导出备份。</p>${button('new-record','清空当前记录并重新开始','button danger-button')}</div>`);
}
function browseDialog() {
  showDialog('回到你想看的地方', `<p class="dialog-description">实心：已作选择 · 浅色：暂难比较 · 空白：未答</p><div class="question-index">${BANK.questions.map(q => button('jump',String(q.number).padStart(2,'0'),'index-button ' + (!state.answers[q.id] ? '' : state.answers[q.id].choice === null ? 'uncertain' : 'answered') + (q.number - 1 === state.cursor.index ? ' current' : ''), `data-index="${q.number-1}" aria-label="第 ${q.number} 题，${!state.answers[q.id] ? '未答' : state.answers[q.id].choice === null ? '暂难比较' : '已作选择'}"`)).join('')}</div><div class="dialog-actions">${button('resume-questions','跳到首个未答题' + icon('arrow'),'button primary')}</div>`);
}
function confirmNew() {
  showDialog('重新开始这次探索？', `<p>这会替换当前浏览器里的向内记录，已有的选择与事例将被清空。需要保留的话，先下载备份。</p><div class="dialog-actions">${button(storageMode === 'corrupt' ? 'raw-export' : 'export-json','先导出备份')}${button('confirm-new','确认重新开始','button danger-button')}${button('close-dialog','取消','button text-button')}</div>`);
}
function download(content, type, suffix) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `向内-探索记录-${new Date().toISOString().slice(0,10)}.${suffix}`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('已发起下载，请查看浏览器的下载记录。');
}
function goNext() {
  if (state.cursor.index < BANK.questions.length - 1) navigate('questions', state.cursor.index + 1);
  else navigate('stories', 0);
}
document.addEventListener('click', event => {
  const target = event.target.closest('button[data-action]');
  if (!target || target.disabled) return;
  const action = target.dataset.action;
  const q = BANK.questions[state.cursor.index];
  if (action === 'close-dialog') { modal.close(); pendingImport = null; }
  else if (action === 'home') navigate('home');
  else if (action === 'start') {
    if (storageMode === 'corrupt') { confirmNew(); return; }
    if (!state.startedAt) { state.startedAt = new Date().toISOString(); navigate('questions',firstUnanswered(state)); }
    else navigate(state.cursor.view);
  }
  else if (action === 'settings') settingsDialog();
  else if (action === 'browse') browseDialog();
  else if (action === 'report') { if (modal.open) modal.close(); navigate('report'); }
  else if (action === 'resume-questions') { if (modal.open) modal.close(); navigate('questions',firstUnanswered(state)); }
  else if (action === 'jump') { if (modal.open) modal.close(); navigate('questions',Number(target.dataset.index)); }
  else if (action === 'jump-story') navigate('stories',Number(target.dataset.index));
  else if (action === 'stories') navigate('stories',0);
  else if (action === 'answer') {
    setAnswer(state,q.id,target.dataset.choice); pendingNA = false; persist(); render();
    app.querySelector(`[data-action="answer"][data-choice="${target.dataset.choice}"]`)?.focus({preventScroll:true});
  }
  else if (action === 'uncertain') { pendingNA = !pendingNA; render(); app.querySelector('[data-action="reason"]')?.focus({preventScroll:true}); }
  else if (action === 'reason') {
    setAnswer(state,q.id,null,target.dataset.reason); pendingNA = false; persist(); render();
    app.querySelector(`[data-action="reason"][data-reason="${target.dataset.reason}"]`)?.focus({preventScroll:true});
  }
  else if (action === 'focus') {
    state.focus = state.focus.includes(q.id) ? state.focus.filter(id=>id!==q.id) : [...state.focus,q.id];
    persist(); render(); app.querySelector('[data-action="focus"]')?.focus({preventScroll:true});
  }
  else if (action === 'pause') {
    timerPaused = !timerPaused; tick(); target.textContent = timerPaused ? '继续计时' : '暂停计时'; target.setAttribute('aria-pressed',String(timerPaused));
  }
  else if (action === 'previous' && state.cursor.index > 0) navigate('questions',state.cursor.index-1);
  else if (action === 'next' && state.answers[q.id] && !pendingNA) goNext();
  else if (action === 'skip') goNext();
  else if (action === 'story-previous') state.cursor.storyIndex === 0 ? navigate('questions',63) : navigate('stories',state.cursor.storyIndex-1);
  else if (action === 'story-next') state.cursor.storyIndex === 7 ? navigate('report') : navigate('stories',state.cursor.storyIndex+1);
  else if (action === 'filter') { filter = target.dataset.filter; render(); app.querySelector(`[data-filter="${filter}"]`)?.focus({preventScroll:true}); }
  else if (action === 'export-json') download(JSON.stringify(validateState(state),null,2),'application/json;charset=utf-8','json');
  else if (action === 'export-txt') download(textRecord(state),'text/plain;charset=utf-8','txt');
  else if (action === 'export-csv') download(csvRecord(state),'text/csv;charset=utf-8','csv');
  else if (action === 'raw-export' && loaded.raw !== null) download(loaded.raw,'text/plain;charset=utf-8','unread-record.txt');
  else if (action === 'import') { fileInput.value = ''; fileInput.click(); }
  else if (action === 'new-record') confirmNew();
  else if (action === 'confirm-new') {
    state = freshState(); storageMode = 'ready'; saved = false; timerQuestion = null; pendingNA = false; persist(); modal.close(); navigate('home'); toast('已开始一份新的本机记录。');
  }
  else if (action === 'confirm-import' && pendingImport) {
    state = pendingImport; pendingImport = null; storageMode = 'ready'; timerQuestion = null; pendingNA = false; persist(); modal.close(); navigate('report'); toast(saved ? '已导入并保存到当前浏览器。' : '已导入到本次页面，暂未保存，请保留原文件。');
  }
});
document.addEventListener('input', event => {
  const target = event.target;
  if (target.dataset.profile) { state.profile[target.dataset.profile] = target.value; persist(); }
  else if (target.dataset.note === 'text') { setNote(state,BANK.questions[state.cursor.index].id,'text',target.value); persist(); }
  else if (target.dataset.story) {
    state.stories[target.dataset.story] = target.value; persist();
    const count = document.querySelector('#story-count'); if (count) count.textContent = target.value.length + ' / 1800';
  }
});
document.addEventListener('change', event => {
  const target = event.target;
  if (target.dataset.note && target.dataset.note !== 'text') { setNote(state,BANK.questions[state.cursor.index].id,target.dataset.note,target.value || null); persist(); }
  else if (target.id === 'timer-setting') {
    state.settings.softTimer = target.checked; timer.tick(performance.now(),false); persist(); render();
  }
});
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    if (file.size > 1000000) throw new Error('文件超过 1 MB。请选择向内导出的 JSON 答卷。');
    const imported = parseRecord(await file.text());
    pendingImport = imported;
    const s = stats(imported);
    showDialog('用这份备份替换当前记录？', `<p>已检查文件：已作选择 ${s.selected} 题，暂难比较 ${s.uncertain} 题，事例 ${s.stories} 个。</p><p>确认后会替换本机当前记录。可以先导出当前记录作为备份。</p><div class="dialog-actions">${button('export-json','导出当前记录')}${button('confirm-import','确认导入','button primary')}${button('close-dialog','取消','button text-button')}</div>`);
  } catch (error) {
    pendingImport = null;
    showDialog('没有导入这份文件', `<p>${e(error.message || '文件暂时无法读取。')}</p><p>当前记录没有被替换。</p><div class="dialog-actions">${button('close-dialog','知道了','button primary')}</div>`);
  } finally { fileInput.value = ''; }
});
modal.addEventListener('cancel', () => { pendingImport = null; });
modal.addEventListener('click', event => { if (event.target === modal) { const r = modal.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) { pendingImport = null; modal.close(); } } });
document.addEventListener('visibilitychange', tick);
window.addEventListener('pagehide', () => { timerReady = false; tick(); });
window.addEventListener('pageshow', () => { timerReady = view === 'questions'; tick(); });
setInterval(tick,250);
render();
