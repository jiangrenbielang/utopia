import { useSyncExternalStore } from 'react';
import { seedCourses } from './seeds';
import {
  BACKUP_APP,
  BACKUP_APP_LEGACY,
  BACKUP_FORMAT_VERSION,
  type BackupPayload,
  type Course,
  type Lesson,
  type StudyConfig,
  type StudyRecord,
  type TimerSession,
} from './types';

/**
 * 「Utopia」本地数据层（localStorage）。
 *
 * 为什么不用 IndexedDB：学习记录字段小、总量在千条量级，JSON 快照即可；
 * 同时可直接导出开发文档第七节的备份格式。所有读写都做容错，损坏数据不会让页面崩溃。
 */

const RECORDS_KEY = 'utopia:records:v1';
const CONFIG_KEY = 'utopia:config:v1';
const COURSES_KEY = 'utopia:courses:v1';
const SESSION_KEY = 'utopia:timer:v1';

/** 旧版「研时记」键名：首次读取时自动迁移，避免升级后学习数据丢失 */
const LEGACY_KEYS: Record<string, string> = {
  [RECORDS_KEY]: 'yst:records:v1',
  [CONFIG_KEY]: 'yst:config:v1',
  [COURSES_KEY]: 'yst:courses:v1',
  [SESSION_KEY]: 'yst:timer:v1',
};

const EMPTY_RECORDS: StudyRecord[] = [];
const EMPTY_COURSES: Course[] = [];
const DEFAULT_CONFIG: StudyConfig = {
  examTargetDate: `${new Date().getFullYear()}-12-20`,
  dailyTargetMin: 0,
  schemaVersion: 1,
};

const canUseStorage = (): boolean => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    let raw = window.localStorage.getItem(key);
    if (!raw) {
      const legacyKey = LEGACY_KEYS[key];
      if (legacyKey) {
        const legacy = window.localStorage.getItem(legacyKey);
        if (legacy) {
          window.localStorage.setItem(key, legacy);
          raw = legacy;
        }
      }
    }
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 配额满 / 隐私模式：内存态仍然可用，仅提示由调用方处理 */
  }
}

// —— 学习记录 ——

let recordsCache: StudyRecord[] | null = null;
const recordListeners = new Set<() => void>();

function normalizeRecord(input: Partial<StudyRecord>): StudyRecord | null {
  if (!input || typeof input !== 'object') return null;
  const durationMin = Math.round(Number(input.durationMin));
  const recordDate = String(input.recordDate ?? '');
  if (!Number.isFinite(durationMin) || durationMin <= 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) return null;
  const start = Number(input.startTimestamp) || 0;
  const end = Number(input.endTimestamp) || start + durationMin * 60_000;
  return {
    recordId: Number(input.recordId) || 0,
    startTimestamp: start,
    endTimestamp: end,
    durationMin,
    subjectName: String(input.subjectName || '其他'),
    studyContent: String(input.studyContent || ''),
    recordDate,
    createdAt: Number(input.createdAt) || start || Date.now(),
    updatedAt: Number(input.updatedAt) || Date.now(),
    ...(input.courseId ? { courseId: String(input.courseId) } : {}),
    ...(input.lessonId ? { lessonId: String(input.lessonId) } : {}),
  };
}

function loadRecords(): StudyRecord[] {
  if (recordsCache) return recordsCache;
  const stored = readJson<StudyRecord[] | null>(RECORDS_KEY, null);
  recordsCache = Array.isArray(stored)
    ? stored.map((r) => normalizeRecord(r)).filter((r): r is StudyRecord => r !== null)
    : [];
  return recordsCache;
}

function setRecords(next: StudyRecord[]): void {
  recordsCache = next;
  writeJson(RECORDS_KEY, next);
  recordListeners.forEach((l) => l());
}

export function useStudyRecords(): StudyRecord[] {
  return useSyncExternalStore(
    (cb) => {
      recordListeners.add(cb);
      return () => recordListeners.delete(cb);
    },
    loadRecords,
    () => EMPTY_RECORDS
  );
}

export function getRecords(): StudyRecord[] {
  return loadRecords();
}

function nextRecordId(): number {
  const max = loadRecords().reduce((m, r) => Math.max(m, r.recordId), 0);
  return max + 1;
}

export interface NewRecordInput {
  startTimestamp: number;
  endTimestamp: number;
  durationMin: number;
  subjectName: string;
  studyContent: string;
  recordDate: string;
  courseId?: string;
  lessonId?: string;
}

export function addStudyRecord(input: NewRecordInput): StudyRecord {
  const now = Date.now();
  const record: StudyRecord = {
    ...input,
    recordId: nextRecordId(),
    createdAt: now,
    updatedAt: now,
  };
  setRecords([...loadRecords(), record]);
  return record;
}

export function updateStudyRecord(recordId: number, patch: Partial<NewRecordInput>): void {
  setRecords(
    loadRecords().map((r) =>
      r.recordId === recordId
        ? {
            ...r,
            ...patch,
            recordId,
            durationMin: patch.durationMin ?? r.durationMin,
            updatedAt: Date.now(),
          }
        : r
    )
  );
}

export function deleteStudyRecord(recordId: number): StudyRecord | null {
  const removed = loadRecords().find((r) => r.recordId === recordId) ?? null;
  if (!removed) return null;
  setRecords(loadRecords().filter((r) => r.recordId !== recordId));
  return removed;
}

export function restoreStudyRecord(record: StudyRecord): void {
  if (loadRecords().some((r) => r.recordId === record.recordId)) return;
  setRecords([...loadRecords(), record]);
}

export function clearStudyRecords(): void {
  setRecords([]);
}

// —— 配置 ——

let configCache: StudyConfig | null = null;
const configListeners = new Set<() => void>();

function loadConfig(): StudyConfig {
  if (configCache) return configCache;
  const stored = readJson<Partial<StudyConfig> | null>(CONFIG_KEY, null);
  configCache = {
    ...DEFAULT_CONFIG,
    ...(stored ?? {}),
    examTargetDate: /^\d{4}-\d{2}-\d{2}$/.test(String(stored?.examTargetDate))
      ? String(stored?.examTargetDate)
      : DEFAULT_CONFIG.examTargetDate,
    dailyTargetMin: Math.max(0, Math.round(Number(stored?.dailyTargetMin) || 0)),
  };
  return configCache;
}

export function useStudyConfig(): StudyConfig {
  return useSyncExternalStore(
    (cb) => {
      configListeners.add(cb);
      return () => configListeners.delete(cb);
    },
    loadConfig,
    () => DEFAULT_CONFIG
  );
}

export function getStudyConfig(): StudyConfig {
  return loadConfig();
}

export function updateStudyConfig(patch: Partial<StudyConfig>): void {
  configCache = { ...loadConfig(), ...patch };
  writeJson(CONFIG_KEY, configCache);
  configListeners.forEach((l) => l());
}

// —— 课程库 ——

let coursesCache: Course[] | null = null;
const courseListeners = new Set<() => void>();

function normalizeLesson(input: Partial<Lesson>, index: number): Lesson {
  return {
    id: String(input.id || `l-${Date.now()}-${index}`),
    title: String(input.title || `第 ${index + 1} 讲`),
    ...(input.url ? { url: String(input.url) } : {}),
    ...(input.embedUrl ? { embedUrl: String(input.embedUrl) } : {}),
  };
}

function normalizeCourse(input: Partial<Course>): Course | null {
  if (!input || typeof input !== 'object' || !input.title) return null;
  const now = Date.now();
  return {
    id: String(input.id || `c-${now}`),
    title: String(input.title),
    subject: String(input.subject || '其他'),
    teacher: input.teacher ? String(input.teacher) : undefined,
    description: input.description ? String(input.description) : undefined,
    lessons: Array.isArray(input.lessons)
      ? input.lessons.map((l, i) => normalizeLesson(l, i))
      : [],
    createdAt: Number(input.createdAt) || now,
    updatedAt: Number(input.updatedAt) || now,
    sample: Boolean(input.sample),
  };
}

function loadCourses(): Course[] {
  if (coursesCache) return coursesCache;
  const stored = readJson<Course[] | null>(COURSES_KEY, null);
  if (Array.isArray(stored)) {
    coursesCache = stored.map((c) => normalizeCourse(c)).filter((c): c is Course => c !== null);
  } else {
    coursesCache = seedCourses();
    writeJson(COURSES_KEY, coursesCache);
  }
  return coursesCache;
}

function setCourses(next: Course[]): void {
  coursesCache = next;
  writeJson(COURSES_KEY, next);
  courseListeners.forEach((l) => l());
}

export function useCourses(): Course[] {
  return useSyncExternalStore(
    (cb) => {
      courseListeners.add(cb);
      return () => courseListeners.delete(cb);
    },
    loadCourses,
    () => EMPTY_COURSES
  );
}

export function getCourses(): Course[] {
  return loadCourses();
}

export function getCourse(id: string): Course | undefined {
  return loadCourses().find((c) => c.id === id);
}

export interface CourseDraft {
  id?: string;
  title: string;
  subject: string;
  teacher?: string;
  description?: string;
  lessons: { id?: string; title: string; url?: string; embedUrl?: string }[];
}

export function saveCourse(draft: CourseDraft): Course {
  const existing = draft.id ? loadCourses().find((c) => c.id === draft.id) : undefined;
  const now = Date.now();
  const course: Course = {
    id: existing?.id ?? draft.id ?? `c-${now}`,
    title: draft.title.trim(),
    subject: draft.subject,
    teacher: draft.teacher?.trim() || undefined,
    description: draft.description?.trim() || undefined,
    lessons: draft.lessons.map((l, i) => ({
      id: l.id || `l-${now}-${i}`,
      title: l.title.trim() || `第 ${i + 1} 讲`,
      ...(l.url?.trim() ? { url: l.url.trim() } : {}),
      ...(l.embedUrl?.trim() ? { embedUrl: l.embedUrl.trim() } : {}),
    })),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const next = existing
    ? loadCourses().map((c) => (c.id === course.id ? course : c))
    : [...loadCourses(), course];
  setCourses(next);
  return course;
}

export function deleteCourse(id: string): void {
  setCourses(loadCourses().filter((c) => c.id !== id));
}

// —— 计时会话（全局，跨 Tab 保持） ——

function emptySession(subject: string): TimerSession {
  const now = Date.now();
  return { startedAt: now, activeMs: 0, runningSince: now, lastHeartbeat: now, subject, content: '' };
}

let sessionCache: TimerSession | null | undefined;
const sessionListeners = new Set<() => void>();

/** 启动时恢复：运行中的会话若心跳已过期，按最后心跳时间暂停，避免把离线时间算进学习时长 */
function recoverSession(session: TimerSession): TimerSession {
  if (session.runningSince == null) return session;
  const now = Date.now();
  const gap = now - session.lastHeartbeat;
  if (gap > 90_000) {
    return {
      ...session,
      activeMs: session.activeMs + Math.max(0, session.lastHeartbeat - session.runningSince),
      runningSince: null,
      lastHeartbeat: now,
    };
  }
  return { ...session, lastHeartbeat: now };
}

function loadSession(): TimerSession | null {
  if (sessionCache !== undefined) return sessionCache;
  const stored = readJson<TimerSession | null>(SESSION_KEY, null);
  sessionCache = stored && typeof stored === 'object' ? recoverSession(stored) : null;
  if (sessionCache) writeJson(SESSION_KEY, sessionCache);
  return sessionCache;
}

function setSession(session: TimerSession | null): void {
  sessionCache = session;
  if (session) writeJson(SESSION_KEY, session);
  else if (canUseStorage()) {
    try {
      window.localStorage.removeItem(SESSION_KEY);
      // 一并清理旧键，避免下次启动时把已丢弃的旧会话迁移回来
      const legacyKey = LEGACY_KEYS[SESSION_KEY];
      if (legacyKey) window.localStorage.removeItem(legacyKey);
    } catch {
      /* 忽略 */
    }
  }
  sessionListeners.forEach((l) => l());
}

export function useTimerSession(): TimerSession | null {
  return useSyncExternalStore(
    (cb) => {
      sessionListeners.add(cb);
      return () => sessionListeners.delete(cb);
    },
    loadSession,
    () => null
  );
}

export function getTimerSession(): TimerSession | null {
  return loadSession();
}

/** 会话当前有效学习毫秒数（暂停时不计） */
export function sessionElapsedMs(session: TimerSession, now = Date.now()): number {
  return session.activeMs + (session.runningSince != null ? Math.max(0, now - session.runningSince) : 0);
}

export function startTimerSession(subject: string): TimerSession {
  const session = emptySession(subject);
  setSession(session);
  return session;
}

export function pauseTimerSession(): void {
  const session = loadSession();
  if (!session || session.runningSince == null) return;
  const now = Date.now();
  setSession({
    ...session,
    activeMs: session.activeMs + Math.max(0, now - session.runningSince),
    runningSince: null,
    lastHeartbeat: now,
  });
}

export function resumeTimerSession(): void {
  const session = loadSession();
  if (!session || session.runningSince != null) return;
  const now = Date.now();
  setSession({ ...session, runningSince: now, lastHeartbeat: now });
}

/** 心跳：页面存活期间每 10s 调一次，用于重启后判断离线时长 */
export function heartbeatTimerSession(): void {
  const session = loadSession();
  if (!session || session.runningSince == null) return;
  const now = Date.now();
  const next = { ...session, lastHeartbeat: now };
  sessionCache = next;
  writeJson(SESSION_KEY, next);
}

export function setTimerSessionContent(content: string): void {
  const session = loadSession();
  if (!session) return;
  setSession({ ...session, content });
}

export function discardTimerSession(): void {
  setSession(null);
}

export interface EndedSession {
  startedAt: number;
  seconds: number;
  subject: string;
  content: string;
}

/** 结束会话并清空；返回本次有效学习秒数（不足 1 分钟由调用方决定是否保存） */
export function endTimerSession(): EndedSession | null {
  const session = loadSession();
  if (!session) return null;
  const seconds = Math.floor(sessionElapsedMs(session) / 1000);
  const ended: EndedSession = {
    startedAt: session.startedAt,
    seconds,
    subject: session.subject,
    content: session.content,
  };
  setSession(null);
  return ended;
}

// —— 备份 / 恢复（开发文档第七节格式） ——

export function buildBackup(): BackupPayload {
  const config = loadConfig();
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    app: BACKUP_APP,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(
      now.getMinutes()
    )}:${pad(now.getSeconds())}`,
    config: { examTargetDate: config.examTargetDate, dailyTargetMin: config.dailyTargetMin },
    records: loadRecords(),
    courses: loadCourses(),
  };
}

function assertBackup(input: unknown): BackupPayload {
  if (!input || typeof input !== 'object') throw new Error('文件内容不是有效的 JSON 对象');
  const payload = input as Partial<BackupPayload>;
  if (payload.app !== BACKUP_APP && payload.app !== BACKUP_APP_LEGACY) {
    throw new Error('不是「Utopia」的备份文件');
  }
  if (payload.formatVersion !== BACKUP_FORMAT_VERSION) throw new Error('备份格式版本不匹配');
  if (!Array.isArray(payload.records)) throw new Error('备份中缺少学习记录');
  if (payload.records.some((r) => !normalizeRecord(r))) throw new Error('存在格式不合法的学习记录');
  if (!payload.config || !/^\d{4}-\d{2}-\d{2}$/.test(String(payload.config.examTargetDate))) {
    throw new Error('备份中的考试日期格式不正确');
  }
  return payload as BackupPayload;
}

/** 导入：merge 按 recordId 去重追加；overwrite 清空后导入 */
export function importBackup(raw: string, mode: 'merge' | 'overwrite'): { records: number; courses: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('文件不是合法的 JSON');
  }
  const payload = assertBackup(parsed);
  let addedRecords = 0;

  if (mode === 'overwrite') {
    const imported = payload.records
      .map((r) => normalizeRecord(r))
      .filter((r): r is StudyRecord => r !== null);
    setRecords(imported);
    addedRecords = imported.length;
  } else {
    const existing = loadRecords();
    const ids = new Set(existing.map((r) => r.recordId));
    const imported = payload.records
      .map((r) => normalizeRecord(r))
      .filter((r): r is StudyRecord => r !== null && !ids.has(r.recordId));
    // 去重后仍可能内部重复：以首次出现的为准
    const seen = new Set<number>();
    const unique = imported.filter((r) => (seen.has(r.recordId) ? false : (seen.add(r.recordId), true)));
    setRecords([...existing, ...unique]);
    addedRecords = unique.length;
  }

  let addedCourses = 0;
  if (Array.isArray(payload.courses)) {
    const incoming = payload.courses.map((c) => normalizeCourse(c)).filter((c): c is Course => c !== null);
    if (mode === 'overwrite') {
      if (incoming.length > 0) {
        setCourses(incoming);
        addedCourses = incoming.length;
      }
    } else {
      const existing = loadCourses();
      const ids = new Set(existing.map((c) => c.id));
      const appended = incoming.filter((c) => !ids.has(c.id));
      if (appended.length > 0) {
        setCourses([...existing, ...appended]);
        addedCourses = appended.length;
      }
    }
  }

  updateStudyConfig({
    examTargetDate: payload.config.examTargetDate,
    ...(typeof payload.config.dailyTargetMin === 'number'
      ? { dailyTargetMin: Math.max(0, Math.round(payload.config.dailyTargetMin)) }
      : {}),
  });

  return { records: addedRecords, courses: addedCourses };
}

// —— 跨标签页同步 ——

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!e.key) return;
    if (e.key === RECORDS_KEY) {
      recordsCache = null;
      recordListeners.forEach((l) => l());
    } else if (e.key === CONFIG_KEY) {
      configCache = null;
      configListeners.forEach((l) => l());
    } else if (e.key === COURSES_KEY) {
      coursesCache = null;
      courseListeners.forEach((l) => l());
    } else if (e.key === SESSION_KEY) {
      sessionCache = undefined;
      sessionListeners.forEach((l) => l());
    }
  });
}

