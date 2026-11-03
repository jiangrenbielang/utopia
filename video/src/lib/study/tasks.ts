/**
 * 每日任务清单（示例计划：结构与函数保留，内容为通用占位）。
 * 仓库不带真实计划；本地版见 backup-personal-plan/。
 *
 * 设计：
 * - 复习计划拆成 6 个阶段（p0 基础 → p5 复试），按日期自动切换，
 *   每天打开页面就是当天该做的事，不需要手动维护；
 * - 每阶段有「工作日任务」与「周日休整任务」两套模板；
 * - 勾选状态按日存 localStorage（utopia:tasks:v1），与学习记录同源隔离；
 * - 纯函数（阶段判定/任务生成/streak）与存储分离，可在 node 下单测。
 */

import { useSyncExternalStore } from 'react';
import { addDays, dateKey, diffDays, startOfDay } from './date';
import { subjectColor } from './types';

export interface DailyTask {
  id: string;
  subject: string;
  title: string;
  /** 建议投入分钟数 */
  minutes: number;
  detail?: string;
}

export interface TaskPhase {
  id: string;
  /** 阶段名（页头徽章） */
  name: string;
  /** 阶段目标一句话 */
  goal: string;
  /** [开始日, 结束日]（yyyy-MM-dd，含两端） */
  range: [string, string];
  weekdayTasks: DailyTask[];
  /** 周日休整任务；缺省沿用工作日任务 */
  sundayTasks?: DailyTask[];
}

const T = (id: string, subject: string, title: string, minutes: number, detail?: string): DailyTask => ({
  id,
  subject,
  title,
  minutes,
  ...(detail ? { detail } : {}),
});

/** 全程阶段表（示例）：日期对齐 plan-init 的示例时间轴 */
export const PHASES: TaskPhase[] = [
  {
    id: 'p0',
    name: '阶段 0 · 零基础收尾',
    goal: '零基础篇收尾（函数→极限→导数→积分初步），英语单词一轮',
    range: ['2026-11-02', '2026-12-31'],
    weekdayTasks: [
      T('p0-math-video', '数学', '零基础篇 · 视频 1~1.5 讲', 90, '从上次进度继续，按目录顺序推进'),
      T('p0-math-drill', '数学', '当讲例题重做 + 基础练习', 30, '只求听懂会做，不抠难题'),
      T('p0-eng-words', '英语', '新词 50 个 + 滚动复习', 30, '核心词一轮'),
      T('p0-recap', '其他', '复盘 · Utopia 打卡并勾掉今日任务', 10),
    ],
    sundayTasks: [
      T('p0-eng-review', '英语', '本周新词总复习', 30),
      T('p0-math-review', '数学', '本周卡壳例题重做', 60),
      T('p0-weekly', '其他', '统计页核对本周时长，规划下周', 20),
    ],
  },
  {
    id: 'p1',
    name: '阶段 1 · 数学一轮（核心目标期）',
    goal: '完成数学全科一轮：高数→线代→概率，基础篇正确率 ≥70%',
    range: ['2027-01-01', '2027-02-28'],
    weekdayTasks: [
      T('p1-math-video', '数学', '基础篇 · 视频', 90, '先高数、后线代 / 概率'),
      T('p1-math-drill', '数学', '基础篇习题 · 对应章节', 90, '错题当天归档进错题本'),
      T('p1-math-keep', '数学', '高数保温题 2~3 道', 20, '学线代/概率期间执行（防遗忘），高数阶段可跳过'),
      T('p1-eng-words', '英语', '单词复习', 30),
      T('p1-eng-skill', '英语', '长难句 2 句精析 / 阅读课 1 讲', 45, '前半程长难句，后半程阅读方法论'),
      T('p1-recap', '其他', '复盘 · 打卡 + 错题归档', 10),
    ],
    sundayTasks: [
      T('p1-eng-review', '英语', '本周单词 + 长难句回顾', 30),
      T('p1-math-review', '数学', '本周错题按章节归类', 60),
      T('p1-weekly', '其他', '核对周时长，校准与一轮目标的差距', 20),
    ],
  },
  {
    id: 'p2',
    name: '阶段 2 · 强化 + 专业课启动',
    goal: '数学强化完成；专业课教材一轮；政治启动；英语阅读精读',
    range: ['2027-03-01', '2027-04-30'],
    weekdayTasks: [
      T('p2-math-strong', '数学', '强化课 + 强化题集', 180, '先高数强化，后线代 / 概率强化'),
      T('p2-major-study', '专业课', '专业课教材精读 + 课后题', 130, '按教材章节推进'),
      T('p2-eng-read', '英语', '阅读真题精读 1 篇', 75, '目标卷种真题留到后期'),
      T('p2-pol-study', '政治', '强化课 + 1000 题一刷', 45, '本阶段中段起执行'),
      T('p2-recap', '其他', '复盘 · 打卡 + 错题归档', 10),
    ],
    sundayTasks: [
      T('p2-eng-review', '英语', '本周精读文章词汇回顾', 30),
      T('p2-major-review', '专业课', '本周课后错题重做', 60),
      T('p2-weekly', '其他', '核对周时长，阶段末验收教材一轮', 20),
    ],
  },
  {
    id: 'p3',
    name: '阶段 3 · 真题演练',
    goal: '数学真题与专业课真题一刷二刷；英语真题套题；政治 1000 题二刷',
    range: ['2027-05-01', '2027-05-31'],
    weekdayTasks: [
      T('p3-math-paper', '数学', '真题：限时做卷 / 逐题复盘', 180, '每周 2 套限时，其余日复盘；近年卷留到冲刺'),
      T('p3-major-paper', '专业课', '真题一刷/二刷 + 专项', 130, '重点：大题计算与设计题'),
      T('p3-eng-paper', '英语', '真题阅读 2 篇精析', 75, '套题限时'),
      T('p3-pol-drill', '政治', '1000 题二刷 + 技巧班', 45, '选择题提分'),
      T('p3-recap', '其他', '复盘 · 打卡 + 错题归档', 10),
    ],
    sundayTasks: [
      T('p3-eng-review', '英语', '本周真题词汇 + 长难句回顾', 30),
      T('p3-major-review', '专业课', '本周真题错题二刷', 60),
      T('p3-weekly', '其他', '核对周时长 + 模拟目标', 20),
    ],
  },
  {
    id: 'p4',
    name: '阶段 4 · 冲刺模拟',
    goal: '模拟卷、押题卷、作文成型；模拟分数稳定达标',
    range: ['2027-06-01', '2027-06-15'],
    weekdayTasks: [
      T('p4-math-mock', '数学', '模拟卷限时 3 小时', 180, '按考试时段做'),
      T('p4-major-mock', '专业课', '模拟题 + 错题三刷 + 框架默画', 150),
      T('p4-eng-write', '英语', '大小作文轮流 1 篇', 60, '模板成型，每周大小作文各 1 篇'),
      T('p4-pol-recite', '政治', '押题卷选择题 / 大题背诵', 75, '选择题 → 大题背诵 + 时政'),
      T('p4-formula', '数学', '公式默写', 15),
      T('p4-recap', '其他', '复盘 · 打卡', 10),
    ],
    sundayTasks: [
      T('p4-eng-review', '英语', '作文模板背诵 + 默写', 30),
      T('p4-major-review', '专业课', '错题回顾 + 框架图默画', 60),
      T('p4-weekly', '其他', '核对周时长，最后两周调整生物钟', 20),
    ],
  },
  {
    id: 'exam',
    name: '初试进行中',
    goal: '正常发挥就是胜利',
    range: ['2027-06-16', '2027-06-19'],
    weekdayTasks: [
      T('ex-adjust', '其他', '按初试时间表调整生物钟，轻量浏览错题', 60, '考前两天：按科目时段做轻量回顾'),
      T('ex-exam', '其他', '走上考场：公共课 + 业务课', 0, '带齐证件，提前踩点，正常发挥'),
    ],
  },
  {
    id: 'rest',
    name: '考后休整',
    goal: '休整 + 估分，随后启动复试准备',
    range: ['2027-06-20', '2027-06-20'],
    weekdayTasks: [
      T('rest-relax', '其他', '休整 · 睡到自然醒，对答案估分（可选）', 30),
    ],
  },
  {
    id: 'p5',
    name: '阶段 5 · 复试准备',
    goal: '复试科目与口语、面试材料准备（按目标院校要求）',
    range: ['2027-06-21', '2027-08-31'],
    weekdayTasks: [
      T('p5-signal', '专业课', '复试科目 A · 教材 + 习题', 120, '按目标院校复试大纲'),
      T('p5-semi', '专业课', '复试科目 B · 教材', 90, '初试后重点补短板科目'),
      T('p5-oral', '英语', '口语自我介绍 + 问答练习', 30),
      T('p5-interview', '其他', '综合面试 · 项目 / 毕设材料梳理', 30),
    ],
  },
];

/** 初试日期（首页倒计时与阶段判定共用） */
export const EXAM_DATE = '2027-06-19';

export interface DayPlan {
  phase: TaskPhase;
  tasks: DailyTask[];
  /** 距初试天数（已考完为负） */
  daysToExam: number;
  isSunday: boolean;
}

function inRange(key: string, range: [string, string]): boolean {
  return key >= range[0] && key <= range[1];
}

/** 判定某天所属阶段；计划开始前与全部结束后返回 null */
export function phaseForDate(date: Date): TaskPhase | null {
  const key = dateKey(date);
  return PHASES.find((p) => inRange(key, p.range)) ?? null;
}

/** 生成某天的任务清单（周日自动切休整模板） */
export function buildDayPlan(date: Date): DayPlan | null {
  const phase = phaseForDate(date);
  if (!phase) return null;
  const isSunday = date.getDay() === 0;
  return {
    phase,
    tasks: (isSunday ? (phase.sundayTasks ?? phase.weekdayTasks) : phase.weekdayTasks).slice(),
    daysToExam: diffDays(startOfDay(date), startOfDay(new Date(`${EXAM_DATE}T00:00:00`))),
    isSunday,
  };
}

/** 有效打卡：当天勾选数 ≥ 任务数一半（至少 1 项） */
export function isEffectiveDay(checked: number, total: number): boolean {
  if (total <= 0) return false;
  return checked >= Math.max(1, Math.ceil(total / 2));
}

export interface TaskChecks {
  /** dateKey → (taskId → true) */
  [date: string]: { [taskId: string]: boolean };
}

export function countChecked(day: TaskChecks, date: string): number {
  const d = day[date];
  if (!d) return 0;
  return Object.values(d).filter(Boolean).length;
}

/**
 * 连续有效打卡天数：今天已达标从今天数，否则从昨天数（口径与学习 streak 一致）。
 * checks 是全量勾选表；planAt 提供每天的任务数（按日历逐日生成）。
 */
export function taskStreak(checks: TaskChecks): number {
  const keys = Object.keys(checks);
  if (keys.length === 0) return 0;
  const today = startOfDay();
  const effective = (d: Date): boolean => {
    const plan = buildDayPlan(d);
    if (!plan) return false;
    return isEffectiveDay(countChecked(checks, dateKey(d)), plan.tasks.length);
  };
  let cursor = effective(today) ? today : addDays(today, -1);
  if (!effective(cursor)) return 0;
  let streak = 0;
  while (effective(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

// —— 勾选状态存储（localStorage，模式与 study store 一致） ——

const CHECKS_KEY = 'utopia:tasks:v1';

const canUseStorage = (): boolean => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

let checksCache: TaskChecks | null = null;
const listeners = new Set<() => void>();

function loadChecks(): TaskChecks {
  if (checksCache) return checksCache;
  if (!canUseStorage()) return {};
  try {
    const raw = window.localStorage.getItem(CHECKS_KEY);
    const parsed = raw ? (JSON.parse(raw) as TaskChecks) : {};
    checksCache = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    checksCache = {};
  }
  return checksCache;
}

function saveChecks(next: TaskChecks): void {
  checksCache = next;
  if (canUseStorage()) {
    try {
      window.localStorage.setItem(CHECKS_KEY, JSON.stringify(next));
    } catch {
      /* 配额满：内存态仍可用 */
    }
  }
  listeners.forEach((l) => l());
}

const EMPTY: TaskChecks = {};

export function useTaskChecks(): TaskChecks {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    loadChecks,
    () => EMPTY
  );
}

export function getTaskChecks(): TaskChecks {
  return loadChecks();
}

export function toggleTaskCheck(date: string, taskId: string): void {
  const current = loadChecks();
  const day = { ...(current[date] ?? {}) };
  if (day[taskId]) delete day[taskId];
  else day[taskId] = true;
  saveChecks({ ...current, [date]: day });
}

/** 清空某日全部勾选 */
export function clearDayChecks(date: string): void {
  const current = loadChecks();
  if (!(date in current)) return;
  saveChecks({ ...current, [date]: {} });
}

export function taskColor(task: DailyTask): string {
  return subjectColor(task.subject);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === CHECKS_KEY) {
      checksCache = null;
      listeners.forEach((l) => l());
    }
  });
}
