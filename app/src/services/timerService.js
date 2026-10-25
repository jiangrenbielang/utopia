/* Utopia · 计时器状态管理服务 (Timer Service) */
import { saveTimerHeartbeat, getTimerHeartbeat, formatDate } from './storage';

export const TIMER_STATUS = {
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED'
};

export const TIMER_MODE = {
  COUNT_UP: 'COUNT_UP',   // 正计时
  POMODORO: 'POMODORO'   // 番茄钟
};

class TimerService {
  constructor() {
    this.status = TIMER_STATUS.IDLE;
    this.mode = TIMER_MODE.COUNT_UP;
    this.startTimestamp = null;
    this.pausedMs = 0;
    this.lastPauseTime = null;
    this.subjectName = '数学';
    this.targetMinutes = 25; // 番茄钟目标分钟数
    
    this.listeners = new Set();
    this.ticker = null;
    this.heartbeatTicker = null;
  }

  // 订阅变更
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    const state = this.getState();
    this.listeners.forEach(cb => cb(state));
  }

  // 获取状态
  getState() {
    const now = Date.now();
    let elapsedMs = 0;

    if (this.status === TIMER_STATUS.RUNNING) {
      elapsedMs = now - this.startTimestamp - this.pausedMs;
    } else if (this.status === TIMER_STATUS.PAUSED) {
      elapsedMs = this.lastPauseTime - this.startTimestamp - this.pausedMs;
    }

    const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
    const durationMin = Math.ceil(elapsedMs / 60000);
    const startDateStr = this.startTimestamp ? formatDate(new Date(this.startTimestamp)) : formatDate(now);

    return {
      status: this.status,
      mode: this.mode,
      subjectName: this.subjectName,
      targetMinutes: this.targetMinutes,
      startTimestamp: this.startTimestamp,
      elapsedSeconds,
      durationMin,
      startDateStr
    };
  }

  // 设置科目
  setSubject(subjectName) {
    this.subjectName = subjectName;
    this.notify();
    this.triggerHeartbeat();
  }

  // 设置模式
  setMode(mode, targetMinutes = 25) {
    if (this.status !== TIMER_STATUS.IDLE) return;
    this.mode = mode;
    this.targetMinutes = targetMinutes;
    this.notify();
  }

  // 开始计时
  start(subjectName = '数学') {
    if (this.status === TIMER_STATUS.RUNNING) return;

    if (this.status === TIMER_STATUS.IDLE) {
      this.startTimestamp = Date.now();
      this.pausedMs = 0;
      this.subjectName = subjectName;
    } else if (this.status === TIMER_STATUS.PAUSED) {
      // 恢复计时
      this.pausedMs += (Date.now() - this.lastPauseTime);
      this.lastPauseTime = null;
    }

    this.status = TIMER_STATUS.RUNNING;
    this.startTickers();
    this.notify();
    this.triggerHeartbeat();
  }

  // 暂停计时
  pause() {
    if (this.status !== TIMER_STATUS.RUNNING) return;

    this.status = TIMER_STATUS.PAUSED;
    this.lastPauseTime = Date.now();
    this.notify();
    this.triggerHeartbeat();
  }

  // 恢复计时
  resume() {
    this.start(this.subjectName);
  }

  // 结束计时 (返回可用于保存的记录数据模型)
  stop() {
    const state = this.getState();
    this.stopTickers();
    this.status = TIMER_STATUS.IDLE;
    const endTimestamp = Date.now();

    saveTimerHeartbeat(null); // 清理心跳
    this.notify();

    return {
      start_timestamp: this.startTimestamp,
      end_timestamp: endTimestamp,
      duration_min: state.durationMin,
      elapsed_seconds: state.elapsedSeconds,
      subject_name: this.subjectName,
      record_date: state.startDateStr
    };
  }

  // 丢弃计时
  reset() {
    this.stopTickers();
    this.status = TIMER_STATUS.IDLE;
    this.startTimestamp = null;
    this.pausedMs = 0;
    this.lastPauseTime = null;
    saveTimerHeartbeat(null);
    this.notify();
  }

  // 定时刷新与 10s 心跳落盘
  startTickers() {
    this.stopTickers();

    this.ticker = setInterval(() => {
      this.notify();
    }, 1000);

    // 每 10 秒写盘心跳
    this.heartbeatTicker = setInterval(() => {
      this.triggerHeartbeat();
    }, 10000);
  }

  stopTickers() {
    if (this.ticker) clearInterval(this.ticker);
    if (this.heartbeatTicker) clearInterval(this.heartbeatTicker);
    this.ticker = null;
    this.heartbeatTicker = null;
  }

  triggerHeartbeat() {
    if (this.status === TIMER_STATUS.IDLE) {
      saveTimerHeartbeat(null);
    } else {
      saveTimerHeartbeat({
        status: this.status,
        mode: this.mode,
        startTimestamp: this.startTimestamp,
        pausedMs: this.pausedMs,
        lastPauseTime: this.lastPauseTime,
        subjectName: this.subjectName,
        targetMinutes: this.targetMinutes,
        savedAt: Date.now()
      });
    }
  }

  // 检测是否存在遗留心跳
  checkHeartbeatRecovery() {
    const hb = getTimerHeartbeat();
    if (hb && hb.startTimestamp && (hb.status === TIMER_STATUS.RUNNING || hb.status === TIMER_STATUS.PAUSED)) {
      return hb;
    }
    return null;
  }

  // 从心跳恢复状态
  recoverFromHeartbeat(hb) {
    this.startTimestamp = hb.startTimestamp;
    this.pausedMs = hb.pausedMs || 0;
    this.lastPauseTime = hb.lastPauseTime || null;
    this.subjectName = hb.subjectName || '数学';
    this.mode = hb.mode || TIMER_MODE.COUNT_UP;
    this.targetMinutes = hb.targetMinutes || 25;

    if (hb.status === TIMER_STATUS.PAUSED) {
      this.status = TIMER_STATUS.PAUSED;
    } else {
      // 若之前是 RUNNING，累积异常中断的时间为 pause 还是继续跑？
      // 依规则，绝对时间计算：now - start - pausedMs 自动补齐断线期间时间
      this.status = TIMER_STATUS.RUNNING;
      this.startTickers();
    }
    this.notify();
  }
}

export const timerService = new TimerService();
