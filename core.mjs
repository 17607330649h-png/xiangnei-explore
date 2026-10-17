import { BANK } from './data.mjs';

export const APP_ID = 'xiangnei-local-record';
export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'xiangnei.paired-record.v1';
const questionIds = new Set(BANK.questions.map(q => q.id));
const promptIds = new Set(BANK.prompts.map(q => q.id));
const reasonIds = new Set(BANK.reasons.map(r => r.id));
const contextIds = new Set(BANK.contexts.map(r => r.id));
const issueIds = new Set(BANK.issues.map(r => r.id));
function contentId() {
  const text = JSON.stringify([BANK.questions, BANK.prompts]);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
export const QUESTION_SET_ID = contentId();

export function freshState() {
  return {
    app: APP_ID, schemaVersion: SCHEMA_VERSION, bankVersion: BANK.version,
    questionSetId: QUESTION_SET_ID,
    profile: { name: '', goal: '' }, answers: {}, notes: {}, focus: [], stories: {},
    cursor: { view: 'questions', index: 0, storyIndex: 0 },
    settings: { softTimer: true }, startedAt: null, updatedAt: null
  };
}
function record(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
}
function keys(value, allowed, message) {
  record(value, message);
  if (Object.keys(value).some(k => !allowed.includes(k))) throw new Error(message);
}
function text(value, max, message) {
  if (typeof value !== 'string' || value.length > max) throw new Error(message);
  return value;
}
function date(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 32 ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value) ||
      !Number.isFinite(Date.parse(value))) throw new Error('记录中的时间格式不正确。');
  return value;
}
function validResponse(answer) {
  keys(answer, ['choice', 'reason'], '答卷包含无效的选项记录。');
  if ((answer.choice === 'A' || answer.choice === 'B') && answer.reason === null) return true;
  if (answer.choice === null && reasonIds.has(answer.reason)) return true;
  throw new Error('选项或暂难比较的原因不正确。');
}
export function validateState(input) {
  keys(input, Object.keys(freshState()), '这不是向内导出的答卷，或文件包含不支持的字段。');
  if (input.app !== APP_ID || input.schemaVersion !== SCHEMA_VERSION) throw new Error('请导入向内导出的答卷 JSON。');
  if (input.bankVersion !== BANK.version || input.questionSetId !== QUESTION_SET_ID)
    throw new Error('答卷题库版本与当前网页不同，未替换任何记录。请保留原文件。');
  const out = freshState();
  keys(input.profile, ['name', 'goal'], '昵称或探索问题格式不正确。');
  out.profile.name = text(input.profile.name, 40, '昵称最多40个字符。');
  out.profile.goal = text(input.profile.goal, 200, '探索问题最多200个字符。');
  record(input.answers, '答卷选项格式不正确。');
  for (const [id, answer] of Object.entries(input.answers)) {
    if (!questionIds.has(id)) throw new Error('答卷中有不属于当前题库的题号。');
    validResponse(answer);
    out.answers[id] = { choice: answer.choice, reason: answer.reason };
  }
  record(input.notes, '情境备注格式不正确。');
  for (const [id, note] of Object.entries(input.notes)) {
    if (!questionIds.has(id)) throw new Error('备注题号不属于当前题库。');
    keys(note, ['context', 'issue', 'text'], '情境备注格式不正确。');
    if (note.context !== null && !contextIds.has(note.context)) throw new Error('情境选项不正确。');
    if (note.issue !== null && !issueIds.has(note.issue)) throw new Error('审题反馈选项不正确。');
    out.notes[id] = { context: note.context, issue: note.issue, text: text(note.text, 800, '每题备注最多800个字符。') };
  }
  if (!Array.isArray(input.focus) || input.focus.length > BANK.questions.length ||
      input.focus.some(id => !questionIds.has(id)) || new Set(input.focus).size !== input.focus.length)
    throw new Error('标记的题号格式不正确。');
  out.focus = [...input.focus];
  record(input.stories, '事例记录格式不正确。');
  for (const [id, value] of Object.entries(input.stories)) {
    if (!promptIds.has(id)) throw new Error('事例题号不属于当前题库。');
    out.stories[id] = text(value, 1800, '每道事例记录最多1800个字符。');
  }
  keys(input.cursor, ['view', 'index', 'storyIndex'], '进度位置格式不正确。');
  if (!['questions', 'stories', 'report'].includes(input.cursor.view) ||
      !Number.isInteger(input.cursor.index) || input.cursor.index < 0 || input.cursor.index >= BANK.questions.length ||
      !Number.isInteger(input.cursor.storyIndex) || input.cursor.storyIndex < 0 || input.cursor.storyIndex >= BANK.prompts.length)
    throw new Error('进度位置超出当前题库范围。');
  out.cursor = { ...input.cursor };
  keys(input.settings, ['softTimer'], '提示设置格式不正确。');
  if (typeof input.settings.softTimer !== 'boolean') throw new Error('提示设置格式不正确。');
  out.settings = { softTimer: input.settings.softTimer };
  out.startedAt = date(input.startedAt);
  out.updatedAt = date(input.updatedAt);
  return out;
}
export function parseRecord(raw) {
  if (typeof raw !== 'string' || raw.length > 1000000) throw new Error('文件过大或不是文本答卷。');
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('文件不是有效的 JSON，现有记录保持不变。'); }
  return validateState(parsed);
}
export function setAnswer(state, id, choice, reason = null) {
  if (!questionIds.has(id)) throw new Error('未知题号。');
  validResponse({ choice, reason });
  state.answers[id] = { choice, reason };
  state.updatedAt = new Date().toISOString();
}
export function setNote(state, id, field, value) {
  if (!questionIds.has(id) || !['context', 'issue', 'text'].includes(field)) throw new Error('备注字段无效。');
  const note = { context: null, issue: null, text: '', ...state.notes[id], [field]: value };
  if (note.context !== null && !contextIds.has(note.context)) throw new Error('情境无效。');
  if (note.issue !== null && !issueIds.has(note.issue)) throw new Error('审题反馈无效。');
  text(note.text, 800, '备注过长。');
  if (note.context === null && note.issue === null && !note.text) delete state.notes[id];
  else state.notes[id] = note;
}
export function stats(state) {
  let selected = 0, uncertain = 0;
  const reasons = {};
  for (const response of Object.values(state.answers)) {
    if (response.choice === null) { uncertain++; reasons[response.reason] = (reasons[response.reason] || 0) + 1; }
    else selected++;
  }
  return {
    selected, uncertain, responded: selected + uncertain,
    remaining: BANK.questions.length - selected - uncertain, total: BANK.questions.length,
    stories: Object.values(state.stories).filter(s => s.trim()).length,
    notes: Object.values(state.notes).filter(n => n.text.trim() || n.context || n.issue).length,
    focus: state.focus.length, reasons
  };
}
export function firstUnanswered(state) {
  const index = BANK.questions.findIndex(q => !Object.hasOwn(state.answers, q.id));
  return index < 0 ? 0 : index;
}
export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function answerLabel(state, question) {
  const a = state.answers[question.id];
  if (!a) return '未答';
  return a.choice === null ? '暂难比较' : a.choice + ' · ' + question[a.choice];
}
const label = (rows, id) => rows.find(x => x.id === id)?.label || '';
export function textRecord(state) {
  const s = stats(state);
  const lines = ['向内 · 行为探索记录', '题库：' + BANK.version, '记录时间：' + (state.updatedAt || '尚未填写'),
    '昵称：' + (state.profile.name || '未填写'), '探索问题：' + (state.profile.goal || '未填写'),
    '已作选择 ' + s.selected + ' · 暂难比较 ' + s.uncertain + ' · 未答 ' + s.remaining,
    '这份记录是自述做法和经历摘要，不提供优势排名。', ''];
  for (const q of BANK.questions) {
    const a = state.answers[q.id], n = state.notes[q.id];
    lines.push(q.number + '. ' + q.stem, '回答：' + answerLabel(state, q));
    if (a?.reason) lines.push('原因：' + label(BANK.reasons, a.reason));
    if (state.focus.includes(q.id)) lines.push('已标记：值得用事例再看');
    if (n?.context) lines.push('情境：' + label(BANK.contexts, n.context));
    if (n?.issue) lines.push('审题反馈：' + label(BANK.issues, n.issue));
    if (n?.text) lines.push('备注：' + n.text);
    lines.push('');
  }
  lines.push('真实事例');
  for (const [i, prompt] of BANK.prompts.entries()) lines.push((i + 1) + '. ' + prompt.text, state.stories[prompt.id] || '未填写', '');
  return lines.join('\n');
}
export function csvCell(value) {
  let str = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(str)) str = "'" + str;
  return '"' + str.replaceAll('"', '""') + '"';
}
export function csvRecord(state) {
  const rows = [['类型','序号','题目','选择','所选做法','暂难比较原因','情境','备注','审题反馈','值得再看']];
  for (const q of BANK.questions) {
    const a = state.answers[q.id], n = state.notes[q.id];
    rows.push([q.kind === 'main' ? '主问题' : '补充方式', q.number, q.stem,
      !a ? '未答' : a.choice === null ? '暂难比较' : a.choice,
      a?.choice ? q[a.choice] : '', a?.reason ? label(BANK.reasons, a.reason) : '',
      label(BANK.contexts, n?.context), n?.text || '', label(BANK.issues, n?.issue),
      state.focus.includes(q.id) ? '是' : '']);
  }
  BANK.prompts.forEach((p,i) => rows.push(['事例追问',i+1,p.text,'',state.stories[p.id] || '','','','','','']));
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

export class SoftTimer {
  constructor(limit = 20000) { this.limit = limit; this.reset(); }
  reset() { this.elapsed = 0; this.last = null; this.fired = false; }
  tick(now, running) {
    if (!Number.isFinite(now)) throw new Error('无效的计时来源。');
    if (running && this.last !== null) this.elapsed += Math.max(0, now - this.last);
    this.last = running ? now : null;
    const notify = this.elapsed >= this.limit && !this.fired;
    if (notify) this.fired = true;
    return { remaining: Math.max(0, Math.ceil((this.limit - this.elapsed) / 1000)), notify, elapsed: this.elapsed };
  }
}

