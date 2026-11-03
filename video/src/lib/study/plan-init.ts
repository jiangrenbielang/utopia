/**
 * 示例复习计划课程初始化：把 4 门示例课程合并进课程库。
 *
 * 这里是**通用示例**：仓库默认不带任何真实复习计划（院校 / 专业 / 日期 /
 * 个人进度属于隐私，不该写进代码）。要跑自己的计划有两种方式：
 * 1. 把本文件顶部的常量改成你自己的（本地改，不提交）；
 * 2. 用「设置 → 导入备份」恢复导出的 JSON（如《Utopia复习计划导入-xxx.json》）。
 *
 * 幂等：以 localStorage 标记 utopia:plan-sample:v1 保证只执行一次；
 * 用户已有的课程（含后续手动编辑/删除）一律不动。考试日期与每日目标
 * 在首次注入时一并写入配置（示例给的是次年 6 月，导入真实备份会覆盖）。
 *
 * 由 PageShell 挂载时调用（每个页面都会触发）。
 */

import { saveCourse, updateStudyConfig, getCourses } from './store';
import type { Course } from './types';

const PLAN_FLAG_KEY = 'utopia:plan-sample:v1';

/** 示例考试日期：写成「次年 6 月中旬」这个通用占位，不指向任何真实考试 */
export const PLAN_EXAM_DATE = '2027-06-19';
export const PLAN_DAILY_TARGET_MIN = 240;

type PlanLesson = { id: string; title: string };
type PlanCourse = Omit<Course, 'createdAt' | 'updatedAt' | 'lessons'> & { lessons: PlanLesson[] };

/** 示例计划：结构与真实计划一致（4 门课、按阶段排章节），内容为占位文案 */
export const PLAN_COURSES: PlanCourse[] = [
  {
    id: 'plan-math-sample',
    title: '数学 · 示例全程计划',
    subject: '数学',
    description: '示例：零基础→基础→强化→真题→模拟五段式，可在「课程库」编辑替换',
    lessons: [
      { id: 'plan-math-l1', title: '第 1 阶段 · 零基础收尾（当前进度占位）' },
      { id: 'plan-math-l2', title: '第 2 阶段 · 基础篇：高数 + 习题' },
      { id: 'plan-math-l3', title: '第 3 阶段 · 线代 / 概率基础' },
      { id: 'plan-math-l4', title: '第 4 阶段 · 强化 + 错题本' },
      { id: 'plan-math-l5', title: '第 5 阶段 · 真题与模拟卷' },
    ],
  },
  {
    id: 'plan-english-sample',
    title: '英语 · 示例全程计划',
    subject: '英语',
    description: '示例：单词贯穿全程 + 真题精读 + 作文',
    lessons: [
      { id: 'plan-eng-l1', title: '第 1 阶段 · 单词起步（每天 50 新词）' },
      { id: 'plan-eng-l2', title: '第 2 阶段 · 语法长难句' },
      { id: 'plan-eng-l3', title: '第 3 阶段 · 阅读方法论' },
      { id: 'plan-eng-l4', title: '第 4 阶段 · 真题精读 + 作文模板' },
    ],
  },
  {
    id: 'plan-major-sample',
    title: '专业课 · 示例全程计划',
    subject: '专业课',
    description: '示例：教材三轮 + 目标院校真题（按你的专业课科目改）',
    lessons: [
      { id: 'plan-major-l1', title: '第 1 阶段 · 教材一轮 + 课后题' },
      { id: 'plan-major-l2', title: '第 2 阶段 · 二轮强化 + 真题一刷' },
      { id: 'plan-major-l3', title: '第 3 阶段 · 真题二刷 + 框架图' },
    ],
  },
  {
    id: 'plan-milestones-sample',
    title: '里程碑 · 进度检查点',
    subject: '其他',
    description: '示例：每个节点到统计页核对时长与进度，偏差超 2 周就压缩后续计划',
    lessons: [
      { id: 'plan-ms-l1', title: '里程碑 1 · 零基础与单词一轮完成' },
      { id: 'plan-ms-l2', title: '里程碑 2 · 数学一轮完成（核心目标）' },
      { id: 'plan-ms-l3', title: '里程碑 4 · 真题摸底' },
      { id: 'plan-ms-l4', title: '里程碑 5 · 模拟达标' },
    ],
  },
];

/** 是否已注入 */
export function isPlanInjected(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PLAN_FLAG_KEY) === '1';
  } catch {
    return true; // localStorage 不可用时按已注入处理，避免反复尝试
  }
}

/**
 * 计划课程与库中现存课程的合并结果；无差异时返回 null。
 * 只同步计划侧的内容（课程名/科目/简介/章节标题），用户侧的修改全部保留：
 * 已挂的视频直链（url / embedUrl）与用户新增的章节（id 不在计划内的）。
 * 计划新增的章节追加到列表末尾（按 id 判断，不动既有顺序）。
 */
export function mergePlanCourse(current: Course, plan: PlanCourse): Course | null {
  const titles = new Map(plan.lessons.map((l) => [l.id, l.title]));
  const lessonChanged =
    current.lessons.some((l) => titles.has(l.id) && l.title !== titles.get(l.id)) ||
    plan.lessons.some((l) => !current.lessons.some((c) => c.id === l.id));
  const metaChanged =
    current.title !== plan.title ||
    current.subject !== plan.subject ||
    (current.description ?? '') !== (plan.description ?? '') ||
    (current.teacher ?? '') !== (plan.teacher ?? '');
  if (!lessonChanged && !metaChanged) return null;
  const merged = current.lessons.map((l) => (titles.has(l.id) ? { ...l, title: titles.get(l.id)! } : l));
  for (const l of plan.lessons) {
    if (!merged.some((m) => m.id === l.id)) merged.push({ id: l.id, title: l.title });
  }
  return {
    ...current,
    title: plan.title,
    subject: plan.subject,
    description: plan.description,
    teacher: plan.teacher,
    lessons: merged,
  };
}

let running = false;

/** 缺失的计划课程补齐；已存在的同步计划侧修订（见 mergePlanCourse） */
function syncPlanCourses(): void {
  for (const plan of PLAN_COURSES) {
    const current = getCourses().find((c) => c.id === plan.id);
    if (!current) {
      saveCourse({
        id: plan.id,
        title: plan.title,
        subject: plan.subject,
        teacher: plan.teacher,
        description: plan.description,
        lessons: plan.lessons.map((l) => ({ id: l.id, title: l.title })),
      });
      continue;
    }
    const merged = mergePlanCourse(current, plan);
    if (!merged) continue;
    saveCourse({
      id: merged.id,
      title: merged.title,
      subject: merged.subject,
      teacher: merged.teacher,
      description: merged.description,
      lessons: merged.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        ...(l.url ? { url: l.url } : {}),
        ...(l.embedUrl ? { embedUrl: l.embedUrl } : {}),
      })),
    });
  }
}

/**
 * 确保计划课程在课程库中并同步计划修订（幂等；并发调用只执行一次）。
 * 考试日期 / 每日目标只在首次注入时写入，之后尊重用户自己的修改。
 */
export function ensurePlanCourses(): void {
  if (typeof window === 'undefined' || running) return;
  running = true;
  try {
    syncPlanCourses();
    if (!isPlanInjected()) {
      updateStudyConfig({ examTargetDate: PLAN_EXAM_DATE, dailyTargetMin: PLAN_DAILY_TARGET_MIN });
      try {
        window.localStorage.setItem(PLAN_FLAG_KEY, '1');
      } catch {
        /* 标记写失败下次会重试合并，saveCourse 按 id 去重不会重复 */
      }
    }
  } finally {
    running = false;
  }
}
