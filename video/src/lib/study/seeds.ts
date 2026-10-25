import type { Course } from './types';

/**
 * 内置示例课程库。
 *
 * 章节视频使用公开测试流（mux / Apple 官方示例），保证「开箱即可播放并记录时长」；
 * 正式内容可在「课程库 → 编辑课程」中替换为任意 m3u8 / mp4 直链，或从资源库检索网课资源。
 */

const SAMPLE_STREAMS = [
  'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  'https://test-streams.mux.dev/pts_shift/master.m3u8',
  'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8',
];

function lesson(courseId: string, index: number, title: string) {
  return { id: `${courseId}-l${index}`, title, url: SAMPLE_STREAMS[(index - 1) % SAMPLE_STREAMS.length] };
}

interface SeedCourse {
  id: string;
  title: string;
  subject: string;
  teacher: string;
  description: string;
  lessons: string[];
}

const SEEDS: SeedCourse[] = [
  {
    id: 'seed-math-calculus',
    title: '高等数学 · 基础精讲',
    subject: '数学',
    teacher: '张老师',
    description: '覆盖函数极限、一元微积分、定积分应用等考研数学高频考点，适合基础阶段系统过一遍。',
    lessons: ['函数、极限与连续', '一元函数微分学', '定积分及其应用'],
  },
  {
    id: 'seed-math-linear',
    title: '线性代数 · 强化突破',
    subject: '数学',
    teacher: '李老师',
    description: '行列式、矩阵、向量组与特征值专题，强化阶段配套习题讲解。',
    lessons: ['行列式与矩阵运算', '向量组与线性方程组', '特征值、特征向量与二次型'],
  },
  {
    id: 'seed-english-reading',
    title: '考研英语 · 阅读方法论',
    subject: '英语',
    teacher: '王老师',
    description: '从长难句拆解到题型定位，建立可复用的阅读解题流程。',
    lessons: ['长难句拆解训练', '细节题与推理题定位', '主旨题与态度题'],
  },
  {
    id: 'seed-ds-tree-graph',
    title: '408 数据结构 · 树与图专题',
    subject: '408数据结构',
    teacher: '陈老师',
    description: '二叉树遍历、图的存储与经典算法，408 数据结构大题必考板块。',
    lessons: ['二叉树遍历与线索化', '图的存储与遍历', '最短路径与最小生成树'],
  },
  {
    id: 'seed-network-stack',
    title: '408 计算机网络 · 协议栈精讲',
    subject: '408计算机网络',
    teacher: '刘老师',
    description: '按分层模型串联各层协议，重点讲清 TCP 可靠传输与 HTTP / DNS。',
    lessons: ['分层模型与各层功能', 'TCP 可靠传输与拥塞控制', 'HTTP、DNS 与应用层协议'],
  },
  {
    id: 'seed-os-process',
    title: '408 操作系统 · 进程与内存',
    subject: '408操作系统',
    teacher: '赵老师',
    description: '进程调度、同步互斥、虚拟内存三大核心模块，配套真题拆解。',
    lessons: ['进程与线程、调度算法', '同步互斥与死锁', '虚拟内存与页面置换'],
  },
  {
    id: 'seed-co-storage',
    title: '408 计算机组成原理 · 存储与指令',
    subject: '408计算机组成原理',
    teacher: '周老师',
    description: '存储层次、指令系统与流水线，建立从硬件到程序的整体认识。',
    lessons: ['存储层次与 Cache', '指令系统与寻址方式', 'CPU 流水线与冒险'],
  },
  {
    id: 'seed-politics-marx',
    title: '考研政治 · 马原精讲',
    subject: '其他',
    teacher: '孙老师',
    description: '唯物论、辩证法、认识论三大板块，配合选择题高频考点串讲。',
    lessons: ['唯物论与物质观', '唯物辩证法三大规律', '认识论与实践观'],
  },
];

/** 生成内置示例课程（首次使用时写入本地课程库） */
export function seedCourses(): Course[] {
  const now = Date.now();
  return SEEDS.map((seed) => ({
    id: seed.id,
    title: seed.title,
    subject: seed.subject,
    teacher: seed.teacher,
    description: seed.description,
    lessons: seed.lessons.map((title, i) => lesson(seed.id, i + 1, title)),
    createdAt: now,
    updatedAt: now,
    sample: true,
  }));
}
