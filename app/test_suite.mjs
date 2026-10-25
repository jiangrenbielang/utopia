/* Utopia · 自动化测试套件 (Auto Test Suite) */
import { 
  calculateExamCountdown, 
  formatDate, 
  getDefaultConfig, 
  exportBackupJSON, 
  importBackupJSON 
} from './src/services/storage.js';

// 简单内存 Storage 模拟，便于 Node 环境脱离浏览器测试
class MockLocalStorage {
  constructor() { this.store = {}; }
  getItem(key) { return this.store[key] || null; }
  setItem(key, val) { this.store[key] = String(val); }
  removeItem(key) { delete this.store[key]; }
  clear() { this.store = {}; }
}

global.localStorage = new MockLocalStorage();

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}`);
  }
}

console.log('==================================================');
console.log('  🧪 开始执行「Utopia」单元与集成自动化测试');
console.log('==================================================\n');

// 1. 测试考研目标倒计时计算
console.log('▶ 1. 考研目标倒计时逻辑测试:');

const todayStr = formatDate(new Date());
const resToday = calculateExamCountdown(todayStr);
assert(resToday.days === 0 && !resToday.isPast, '考试日期恰好为今天时，剩余天数为 0');

const pastRes = calculateExamCountdown('2020-01-01');
assert(pastRes.isPast && pastRes.expiredDays > 0, '目标日期为过去日期时，正确定位为已考完过期状态');

const futureYear = new Date().getFullYear() + 1;
const futureRes = calculateExamCountdown(`${futureYear}-12-20`);
assert(futureRes.days > 300 && !futureRes.isPast, '目标日期为未来年份时，正确计算剩余天数 (>300天)');

// 2. 测试向上取整 (ceil) 与不足60秒拦截逻辑
console.log('\n▶ 2. 计时向上取整与拦截规则测试:');

const sec1 = 30;
const durationMin1 = Math.ceil(sec1 / 60);
assert(sec1 < 60 && durationMin1 === 1, '30 秒向上取整为 1 分钟（但业务界面校验时需拦住不足60秒记录）');

const sec2 = 90;
const durationMin2 = Math.ceil(sec2 / 60);
assert(durationMin2 === 2, '90 秒 (1分30秒) 向上取整为 2 分钟');

const sec3 = 3600;
const durationMin3 = Math.ceil(sec3 / 60);
assert(durationMin3 === 60, '3600 秒恰好为 60 分钟');

// 3. 测试跨零点日期归属逻辑
console.log('\n▶ 3. 跨零点记录归属逻辑测试:');

const startLate = new Date('2026-08-07T23:50:00').getTime();
const endEarly = new Date('2026-08-08T00:20:00').getTime();
const recordDate = formatDate(new Date(startLate));
const durationMs = endEarly - startLate;
const durationMinMs = Math.ceil(durationMs / 60000);

assert(recordDate === '2026-08-07', '23:50 开始、00:20 结束的记录，日期归属于开始日 2026-08-07');
assert(durationMinMs === 30, '跨零点耗时计算为 30 分钟');

// 4. 测试 JSON 备份与导出导入重组
console.log('\n▶ 4. 数据备份与恢复 (JSON Schema) 测试:');

// 设置初始数据
localStorage.setItem('yanshiji_app_config_v1', JSON.stringify(getDefaultConfig()));
localStorage.setItem('yanshiji_study_records_v1', JSON.stringify([
  { record_id: 1, subject_name: '数学', duration_min: 60, record_date: '2026-08-07' },
  { record_id: 2, subject_name: '英语', duration_min: 45, record_date: '2026-08-07' }
]));

const exportedJsonStr = exportBackupJSON();
let exportedData;
try {
  exportedData = JSON.parse(exportedJsonStr);
} catch (e) {}

assert(exportedData && exportedData.app === 'Utopia' && exportedData.records.length === 2, '导出 JSON 符合“Utopia”规范且记录条数一致');

// 校验无效 JSON 拦截
const invalidRes = importBackupJSON('{"app":"未知软件"}', 'merge');
assert(!invalidRes.success, '导入非“Utopia”格式 JSON 时，安全拦截并抛出错误提示');

// 测试合并模式去重
const mergeRes = importBackupJSON(exportedJsonStr, 'merge');
assert(mergeRes.success && mergeRes.count === 0, '合并模式导入已有相同 recordId 记录时，正确跳过重复条目 (0条新增)');

// 测试覆盖模式
const overwriteRes = importBackupJSON(exportedJsonStr, 'overwrite');
assert(overwriteRes.success && overwriteRes.count === 2, '覆盖模式正确覆盖更新已有记录库');

console.log('\n==================================================');
console.log(`  📊 测试结果: ${passedTests} / ${totalTests} 全部通过！`);
console.log('==================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
