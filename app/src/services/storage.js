/* Utopia · 数据存储与核心服务 (Storage Service) */

// 存储键沿用旧前缀，保证改名前后的本地数据可直接延续
const STORAGE_KEYS = {
  RECORDS: 'yanshiji_study_records_v1',
  CONFIG: 'yanshiji_app_config_v1',
  REFLECTIONS: 'yanshiji_daily_reflections_v1',
  TIMER_HEARTBEAT: 'yanshiji_timer_heartbeat_v1',
  COURSES: 'yanshiji_courses_v1'
};

// 预设默认科目与固定的颜色规范
export const DEFAULT_SUBJECTS = [
  { name: '数学', color: '#4A90D9' },
  { name: '英语', color: '#E0705A' },
  { name: '政治', color: '#7B6CCF' },
  { name: '专业课一', color: '#4CB8A4' },
  { name: '专业课二', color: '#D9A05B' },
  { name: '其他', color: '#9AA5B1' }
];



// —— 课程库（与 Web 端课程库保持同一数据形态） ——
const SAMPLE_STREAMS = [
  'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  'https://test-streams.mux.dev/pts_shift/master.m3u8',
  'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8'
];

const COURSE_SEEDS = [
  ['seed-math-calculus', '高等数学 · 基础精讲', '数学', '张老师', '函数极限、一元微积分与定积分应用，基础阶段系统过一遍。', ['函数、极限与连续', '一元函数微分学', '定积分及其应用']],
  ['seed-math-linear', '线性代数 · 强化突破', '数学', '李老师', '行列式、矩阵、向量组与特征值专题，强化阶段配套习题讲解。', ['行列式与矩阵运算', '向量组与线性方程组', '特征值、特征向量与二次型']],
  ['seed-english-reading', '考研英语 · 阅读方法论', '英语', '王老师', '从长难句拆解到题型定位，建立可复用的阅读解题流程。', ['长难句拆解训练', '细节题与推理题定位', '主旨题与态度题']],
  ['seed-ds-tree', '数据结构 · 树与图专题', '专业课一', '陈老师', '二叉树遍历、图的存储与经典算法，专业课大题必考板块。', ['二叉树遍历与线索化', '图的存储与遍历', '最短路径与最小生成树']],
  ['seed-network', '计算机网络 · 协议栈精讲', '专业课一', '刘老师', '按分层模型串联各层协议，重点讲清 TCP 可靠传输与 HTTP / DNS。', ['分层模型与各层功能', 'TCP 可靠传输与拥塞控制', 'HTTP、DNS 与应用层协议']],
  ['seed-os', '操作系统 · 进程与内存', '专业课二', '赵老师', '进程调度、同步互斥、虚拟内存三大核心模块，配套真题拆解。', ['进程与线程、调度算法', '同步互斥与死锁', '虚拟内存与页面置换']],
  ['seed-co-storage', '计算机组成原理 · 存储与指令', '专业课二', '周老师', '存储层次、指令系统与流水线，建立从硬件到程序的整体认识。', ['存储层次与 Cache', '指令系统与寻址方式', 'CPU 流水线与冒险']],
  ['seed-politics', '考研政治 · 马原精讲', '政治', '孙老师', '唯物论、辩证法、认识论三大板块，配合选择题高频考点串讲。', ['唯物论与物质观', '唯物辩证法三大规律', '认识论与实践观']]
];

function defaultCourses() {
  const now = Date.now();
  return COURSE_SEEDS.map(([id, title, subject, teacher, description, lessonTitles]) => ({
    id,
    title,
    subject,
    teacher,
    description,
    lessons: lessonTitles.map((lessonTitle, index) => ({
      id: `${id}-l${index + 1}`,
      title: lessonTitle,
      url: SAMPLE_STREAMS[index % SAMPLE_STREAMS.length]
    })),
    createdAt: now,
    updatedAt: now,
    sample: true
  }));
}

function normalizeCourse(raw) {
  if (!raw || !raw.title) return null;
  const now = Date.now();
  return {
    id: String(raw.id || `c-${now}`),
    title: String(raw.title),
    subject: String(raw.subject || '其他'),
    teacher: raw.teacher ? String(raw.teacher) : undefined,
    description: raw.description ? String(raw.description) : undefined,
    lessons: Array.isArray(raw.lessons)
      ? raw.lessons.map((lesson, index) => ({
          id: String(lesson.id || `l-${now}-${index}`),
          title: String(lesson.title || `第 ${index + 1} 讲`),
          ...(lesson.url ? { url: String(lesson.url) } : {}),
          ...(lesson.embedUrl ? { embedUrl: String(lesson.embedUrl) } : {})
        }))
      : [],
    createdAt: Number(raw.createdAt) || now,
    updatedAt: Number(raw.updatedAt) || now,
    sample: Boolean(raw.sample)
  };
}

export function getCourses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.COURSES);
    if (!raw) {
      const seeded = defaultCourses();
      localStorage.setItem(STORAGE_KEYS.COURSES, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeCourse).filter(Boolean);
  } catch (e) {
    console.error('Failed to get courses:', e);
    return [];
  }
}

function saveAllCourses(courses) {
  localStorage.setItem(STORAGE_KEYS.COURSES, JSON.stringify(courses));
}

export function saveCourse(course) {
  const list = getCourses();
  const now = Date.now();
  const existing = list.find((c) => c.id === course.id);
  const normalized = normalizeCourse({
    ...course,
    id: course.id || `c-${now}`,
    lessons: (course.lessons || []).map((lesson, index) => ({
      ...lesson,
      id: lesson.id || `l-${now}-${index}`
    })),
    createdAt: existing?.createdAt || course.createdAt || now,
    updatedAt: now,
    sample: course.sample ?? existing?.sample
  });
  const next = existing ? list.map((c) => (c.id === normalized.id ? normalized : c)) : [...list, normalized];
  saveAllCourses(next);
  return normalized;
}

export function deleteCourse(courseId) {
  saveAllCourses(getCourses().filter((c) => c.id !== courseId));
}

export function clearCourses() {
  saveAllCourses([]);
}

// 导出系统默认设置
export function getDefaultConfig() {
  const now = new Date();
  const currentYear = now.getFullYear();
  // 默认设置为当年 12 月 20 日（考研初试日期）
  const defaultExamDate = `${currentYear}-12-20`;
  return {
    exam_target_date: defaultExamDate,
    daily_target_min: 300, // 5小时
    theme_mode: 'light',
    subjects: DEFAULT_SUBJECTS,
    schema_version: 1
  };
}

// 获取配置
export function getAppConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CONFIG);
    if (!raw) {
      // 修复：原来这里调用 saveAppConfig() 会与下方 getAppConfig() 形成无限递归，
      // 首次启动（localStorage 为空）时触发 "Maximum call stack size exceeded"。
      // 直接返回默认配置，由调用方按需保存。
      return getDefaultConfig();
    }
    const parsed = JSON.parse(raw);
    return { ...getDefaultConfig(), ...parsed };
  } catch (e) {
    console.error('Failed to get app config:', e);
    return getDefaultConfig();
  }
}

// 保存配置
export function saveAppConfig(config) {
  try {
    const current = getAppConfig();
    const updated = { ...current, ...config };
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Failed to save app config:', e);
    return null;
  }
}

// 获取全部学习记录
export function getAllRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RECORDS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to get study records:', e);
    return [];
  }
}

// 保存全部记录
function saveAllRecords(records) {
  localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));
}

// 新增一条记录
export function addRecord({ start_timestamp, end_timestamp, duration_min, subject_name, study_content, record_date, course_id, lesson_id }) {
  const records = getAllRecords();
  const now = Date.now();
  
  // 生成自增 record_id
  const maxId = records.reduce((max, r) => Math.max(max, r.record_id || 0), 0);
  const newRecord = {
    record_id: maxId + 1,
    start_timestamp: start_timestamp || now - (duration_min * 60000),
    end_timestamp: end_timestamp || now,
    duration_min: Math.max(1, duration_min),
    subject_name: subject_name || '其他',
    study_content: study_content || '',
    record_date: record_date || formatDate(new Date()),
    created_at: now,
    updated_at: now,
    ...(course_id ? { course_id } : {}),
    ...(lesson_id ? { lesson_id } : {})
  };

  records.unshift(newRecord);
  saveAllRecords(records);
  return newRecord;
}

// 修改记录
export function updateRecord(record_id, fields) {
  const records = getAllRecords();
  const index = records.findIndex(r => r.record_id === record_id);
  if (index === -1) return null;

  records[index] = {
    ...records[index],
    ...fields,
    updated_at: Date.now()
  };
  saveAllRecords(records);
  return records[index];
}

// 删除记录
export function deleteRecord(record_id) {
  const records = getAllRecords();
  const filtered = records.filter(r => r.record_id !== record_id);
  saveAllRecords(filtered);
  return true;
}

// 清空全量记录 (保留考试日期配置)
export function wipeAllRecords() {
  localStorage.removeItem(STORAGE_KEYS.RECORDS);
  localStorage.removeItem(STORAGE_KEYS.REFLECTIONS);
  localStorage.removeItem(STORAGE_KEYS.TIMER_HEARTBEAT);
}

// 每日心得/复盘管理
export function getReflections() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.REFLECTIONS);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

export function saveReflection(date, content) {
  const reflections = getReflections();
  if (!content || !content.trim()) {
    delete reflections[date];
  } else {
    reflections[date] = { content: content.trim(), updated_at: Date.now() };
  }
  localStorage.setItem(STORAGE_KEYS.REFLECTIONS, JSON.stringify(reflections));
  return reflections;
}

// 工具方法：格式化日期为 yyyy-MM-dd
export function formatDate(dateObj) {
  const d = new Date(dateObj);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 计算倒计时天数 (0点边界)
export function calculateExamCountdown(targetDateStr) {
  if (!targetDateStr) return { days: 0, isPast: false, expiredDays: 0 };
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [y, m, d] = targetDateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d, 0, 0, 0, 0);

  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { days: 0, isPast: true, expiredDays: Math.abs(diffDays) };
  }
  return { days: diffDays, isPast: false, expiredDays: 0 };
}

// 心跳包保存 (防崩溃/防闪退)
export function saveTimerHeartbeat(heartbeatData) {
  if (!heartbeatData) {
    localStorage.removeItem(STORAGE_KEYS.TIMER_HEARTBEAT);
  } else {
    localStorage.setItem(STORAGE_KEYS.TIMER_HEARTBEAT, JSON.stringify(heartbeatData));
  }
}

export function getTimerHeartbeat() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TIMER_HEARTBEAT);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// 数据导入与导出 (格式对应开发文档第七节)
export function exportBackupJSON() {
  const config = getAppConfig();
  const records = getAllRecords();
  const reflections = getReflections();
  const courses = getCourses();

  const backupData = {
    app: "Utopia",
    formatVersion: 1,
    exportedAt: new Date().toLocaleString(),
    config: {
      examTargetDate: config.exam_target_date,
      dailyTargetMin: config.daily_target_min,
      subjects: config.subjects
    },
    records: records.map(r => ({
      recordId: r.record_id,
      startTimestamp: r.start_timestamp,
      endTimestamp: r.end_timestamp,
      durationMin: r.duration_min,
      subjectName: r.subject_name,
      studyContent: r.study_content,
      recordDate: r.record_date,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      ...(r.course_id ? { courseId: r.course_id } : {}),
      ...(r.lesson_id ? { lessonId: r.lesson_id } : {})
    })),
    reflections,
    courses
  };

  return JSON.stringify(backupData, null, 2);
}

export function importBackupJSON(jsonString, mode = 'merge') {
  try {
    const data = JSON.parse(jsonString);
    if (!data || (data.app !== "Utopia" && data.app !== "研时记") || !Array.isArray(data.records)) {
      return { success: false, message: 'JSON 格式不符或缺少必要的 Utopia 标识（旧版「研时记」备份也兼容）！' };
    }

    // 校验记录有效性
    const validRecords = [];
    for (const item of data.records) {
      if (!item.recordDate || !item.durationMin || item.durationMin <= 0) {
        continue; // 过滤不合法记录
      }
      validRecords.push({
        record_id: item.recordId || Date.now() + Math.floor(Math.random() * 1000),
        start_timestamp: item.startTimestamp || Date.now(),
        end_timestamp: item.endTimestamp || Date.now(),
        duration_min: item.durationMin,
        subject_name: item.subjectName || '其他',
        study_content: item.studyContent || '',
        record_date: item.recordDate,
        created_at: item.createdAt || Date.now(),
        updated_at: item.updatedAt || Date.now(),
        ...(item.courseId ? { course_id: item.courseId } : {}),
        ...(item.lessonId ? { lesson_id: item.lessonId } : {})
      });
    }

    if (mode === 'overwrite') {
      saveAllRecords(validRecords);
      if (data.config && data.config.examTargetDate) {
        saveAppConfig({
          exam_target_date: data.config.examTargetDate,
          daily_target_min: data.config.dailyTargetMin || 300,
          subjects: data.config.subjects || DEFAULT_SUBJECTS
        });
      }
      if (data.reflections) {
        localStorage.setItem(STORAGE_KEYS.REFLECTIONS, JSON.stringify(data.reflections));
      }
      if (Array.isArray(data.courses) && data.courses.length > 0) {
        const incoming = data.courses.map(normalizeCourse).filter(Boolean);
        if (mode === 'overwrite') {
          saveAllCourses(incoming);
        } else {
          const existingCourses = getCourses();
          const existingIds = new Set(existingCourses.map((c) => c.id));
          const appended = incoming.filter((c) => !existingIds.has(c.id));
          if (appended.length > 0) saveAllCourses([...existingCourses, ...appended]);
        }
      }
      return { success: true, count: validRecords.length, mode: '覆盖导入' };
    } else {
      // 合并模式：按 record_id 去重，没有匹配的直接追加
      const existing = getAllRecords();
      const existingIds = new Set(existing.map(r => r.record_id));
      let addedCount = 0;

      for (const rec of validRecords) {
        if (!existingIds.has(rec.record_id)) {
          existing.push(rec);
          addedCount++;
        }
      }

      existing.sort((a, b) => b.record_id - a.record_id);
      saveAllRecords(existing);

      if (data.reflections) {
        const curRef = getReflections();
        const mergedRef = { ...curRef, ...data.reflections };
        localStorage.setItem(STORAGE_KEYS.REFLECTIONS, JSON.stringify(mergedRef));
      }

      if (Array.isArray(data.courses) && data.courses.length > 0) {
        const incoming = data.courses.map(normalizeCourse).filter(Boolean);
        if (mode === 'overwrite') {
          saveAllCourses(incoming);
        } else {
          const existingCourses = getCourses();
          const existingIds = new Set(existingCourses.map((c) => c.id));
          const appended = incoming.filter((c) => !existingIds.has(c.id));
          if (appended.length > 0) saveAllCourses([...existingCourses, ...appended]);
        }
      }

      return { success: true, count: addedCount, mode: '合并增量导入' };
    }
  } catch (e) {
    return { success: false, message: '解析 JSON 错误: ' + e.message };
  }
}
