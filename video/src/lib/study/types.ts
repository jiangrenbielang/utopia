/**
 * 「Utopia」学习数据模型。
 *
 * 与开发文档（v1.1）保持一致：
 * - study_record 表字段一一对应（recordId / startTimestamp / ...），
 *   本地 Web 版以 localStorage 持久化，字段名与导出 JSON 完全兼容；
 * - 新增 courseId / lessonId 两个可选字段，用于把学习时长关联到具体网课章节，
 *   导出时一并带上（导入端忽略未知字段，不破坏文档格式兼容性）。
 */

export const SUBJECTS = [
  '数学',
  '英语',
  '408数据结构',
  '408计算机网络',
  '408操作系统',
  '408计算机组成原理',
  '其他',
] as const;

export type SubjectName = (typeof SUBJECTS)[number];

/** 科目固定配色（开发文档第九节；饼图、列表、课程卡片共用） */
export const SUBJECT_COLORS: Record<string, string> = {
  数学: '#4A90D9',
  英语: '#E0705A',
  '408数据结构': '#7B6CCF',
  '408计算机网络': '#4CB8A4',
  '408操作系统': '#D9A05B',
  '408计算机组成原理': '#6B9E7A',
  其他: '#9AA5B1',
};

export function subjectColor(subject: string): string {
  return SUBJECT_COLORS[subject] ?? '#9AA5B1';
}

export interface StudyRecord {
  recordId: number;
  startTimestamp: number;
  endTimestamp: number;
  durationMin: number;
  subjectName: string;
  studyContent: string;
  /** yyyy-MM-dd（取计时开始日，跨零点归开始日） */
  recordDate: string;
  createdAt: number;
  updatedAt: number;
  /** 关联课程（可选）：网课播放产生的记录 */
  courseId?: string;
  /** 关联章节（可选） */
  lessonId?: string;
}

export interface StudyConfig {
  examTargetDate: string;
  dailyTargetMin: number;
  schemaVersion: number;
}

export interface Lesson {
  id: string;
  title: string;
  /** 直链视频地址（m3u8 / mp4）；为空表示待补充 */
  url?: string;
  /** B 站站外播放器嵌入地址（已通过白名单校验） */
  embedUrl?: string;
}

export interface Course {
  id: string;
  title: string;
  subject: string;
  teacher?: string;
  description?: string;
  lessons: Lesson[];
  createdAt: number;
  updatedAt: number;
  /** 内置示例课程：章节视频为公开测试流，可编辑替换 */
  sample?: boolean;
}

export interface TimerSession {
  startedAt: number;
  /** 当前运行片段之前累计的有效毫秒数 */
  activeMs: number;
  /** 运行中：本段开始时间戳；暂停为 null */
  runningSince: number | null;
  /** 心跳时间戳：App 被杀后据此判断离线时长 */
  lastHeartbeat: number;
  subject: string;
  content: string;
}

export interface BackupPayload {
  app: string;
  formatVersion: number;
  exportedAt: string;
  config: { examTargetDate: string; dailyTargetMin?: number };
  records: StudyRecord[];
  /** 扩展字段：课程库（旧版备份可缺失） */
  courses?: Course[];
}

export const BACKUP_APP = 'Utopia';
/** 兼容改名前「研时记」导出的备份文件 */
export const BACKUP_APP_LEGACY = '研时记';
export const BACKUP_FORMAT_VERSION = 1;
