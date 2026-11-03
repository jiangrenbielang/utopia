import { describe, expect, it, vi } from 'vitest';

// store.ts 运行时引用 db.ts（IndexedDB），node 测试环境下 mock 掉
vi.mock('./db', () => ({ db: {} }));

import { mergePlanCourse, PLAN_COURSES } from './plan-init';
import type { Course, Lesson } from './types';

function course(lessons: Lesson[], over: Partial<Course> = {}): Course {
  return {
    id: 'plan-math-sample',
    title: '数学 · 示例全程计划',
    subject: '数学',
    lessons,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

describe('计划数据完整性', () => {
  it('课程 id 与章节 id 均唯一', () => {
    const courseIds = PLAN_COURSES.map((c) => c.id);
    expect(new Set(courseIds).size).toBe(courseIds.length);
    for (const c of PLAN_COURSES) {
      const ids = c.lessons.map((l) => l.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('章节标题非空且不超过展示上限（80 字符）', () => {
    for (const c of PLAN_COURSES) {
      for (const l of c.lessons) {
        expect(l.title.trim().length).toBeGreaterThan(0);
        expect(l.title.length).toBeLessThanOrEqual(80);
      }
    }
  });

  it('示例计划的第一讲是阶段占位文案（不含个人进度）', () => {
    const l1 = PLAN_COURSES[0].lessons[0];
    expect(l1.id).toBe('plan-math-l1');
    expect(l1.title).toContain('第 1 阶段');
  });
});

describe('计划修订同步（mergePlanCourse）', () => {
  const plan = PLAN_COURSES[0];

  it('与计划完全一致时返回 null（不触发写盘）', () => {
    const cur = course(plan.lessons.map((l) => ({ id: l.id, title: l.title })), {
      description: plan.description,
      teacher: plan.teacher,
    });
    expect(mergePlanCourse(cur, plan)).toBeNull();
  });

  it('章节标题过期：更新标题，保留用户挂的视频直链', () => {
    const cur = course([
      { id: 'plan-math-l1', title: '11.02-12.31 零基础篇收尾：函数(四)第10节起→极限→导数→积分初步', url: 'https://cdn.example.com/zhangyu.mp4' },
      ...plan.lessons.slice(1).map((l) => ({ id: l.id, title: l.title })),
    ], { description: plan.description, teacher: plan.teacher });
    const merged = mergePlanCourse(cur, plan);
    expect(merged).not.toBeNull();
    expect(merged?.lessons[0].title).toBe(plan.lessons[0].title);
    // 用户挂的视频直链不丢
    expect(merged?.lessons[0].url).toBe('https://cdn.example.com/zhangyu.mp4');
    // 其余章节标题未动
    expect(merged?.lessons[1].title).toBe(plan.lessons[1].title);
  });

  it('用户新增的章节保留，计划新增的章节追加到末尾', () => {
    const cur = course(
      [
        ...plan.lessons.slice(0, 2).map((l) => ({ id: l.id, title: l.title })),
        { id: 'l-user-custom', title: '我自己加的直播课' },
      ],
      { description: plan.description, teacher: plan.teacher }
    );
    // 计划侧裁掉一讲再在尾部加一讲新内容，模拟修订
    const revised = {
      ...plan,
      lessons: [...plan.lessons.slice(0, 2), { id: 'plan-math-lNEW', title: '新增冲刺讲' }],
    };
    const merged = mergePlanCourse(cur, revised);
    expect(merged).not.toBeNull();
    const ids = merged?.lessons.map((l) => l.id);
    expect(ids).toContain('l-user-custom');
    expect(ids).toContain('plan-math-lNEW');
    expect(ids?.[ids.length - 1]).toBe('plan-math-lNEW');
  });

  it('课程元信息（标题/简介）变化也触发合并', () => {
    const cur = course(plan.lessons.map((l) => ({ id: l.id, title: l.title })), {
      description: '旧简介',
      teacher: plan.teacher,
    });
    const merged = mergePlanCourse(cur, plan);
    expect(merged?.description).toBe(plan.description);
  });
});
