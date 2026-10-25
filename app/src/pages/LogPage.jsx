import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Calendar, FileText, Filter, Save } from 'lucide-react';
import EditLogModal from '../components/EditLogModal';
import ManualLogModal from '../components/ManualLogModal';
import { getReflections, saveReflection } from '../services/storage';

export default function LogPage({ 
  config, 
  records, 
  onUpdateRecord, 
  onDeleteRecord, 
  onAddManualRecord 
}) {
  const [filterDate, setFilterDate] = useState('ALL');
  const [filterSubject, setFilterSubject] = useState('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [editingRecord, setEditingRecord] = useState(null);
  const [showManualModal, setShowManualModal] = useState(false);

  // 备考每日心得状态
  const [reflections, setReflections] = useState(getReflections());
  const [reflectionInput, setReflectionInput] = useState('');
  const [editingRefDate, setEditingRefDate] = useState(null);

  // 科目颜色映射
  const subjectColors = {};
  (config.subjects || []).forEach(s => {
    subjectColors[s.name] = s.color;
  });

  // 日期筛选
  const filteredRecords = records.filter(r => {
    if (filterDate !== 'ALL' && r.record_date !== filterDate) return false;
    if (filterSubject !== 'ALL' && r.subject_name !== filterSubject) return false;
    return true;
  });

  // 倒序排列
  const sortedRecords = [...filteredRecords].sort((a, b) => {
    return (b.start_timestamp || 0) - (a.start_timestamp || 0);
  });

  // 分页截取
  const paginatedRecords = sortedRecords.slice(0, page * pageSize);
  const hasMore = paginatedRecords.length < sortedRecords.length;

  const handleDelete = (id) => {
    if (window.confirm('确定要删除这条学习记录吗？删除后不可恢复。')) {
      onDeleteRecord(id);
    }
  };

  // 保存心得
  const handleSaveReflection = (dateStr) => {
    const updated = saveReflection(dateStr, reflectionInput);
    setReflections(updated);
    setEditingRefDate(null);
    setReflectionInput('');
  };

  return (
    <div className="animate-fade-in" style={{ padding: '16px', paddingBottom: '32px' }}>
      
      {/* 顶部筛选栏与补录入口 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
          <Filter size={16} color="var(--text-sub)" />
          <select 
            value={filterDate} 
            onChange={(e) => { setFilterDate(e.target.value); setPage(1); }}
            style={{ fontSize: '0.85rem', padding: '6px 10px', width: 'auto', flex: 1, minWidth: 140 }}
          >
            <option value="ALL">全部日期 ({records.length}条)</option>
            {[...new Set(records.map(r => r.record_date))].sort().reverse().map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            value={filterSubject}
            onChange={(e) => { setFilterSubject(e.target.value); setPage(1); }}
            style={{ fontSize: '0.85rem', padding: '6px 10px', width: 'auto', minWidth: 96 }}
          >
            <option value="ALL">全部科目</option>
            {(config.subjects || []).map(s => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
        </div>

        <button 
          onClick={() => setShowManualModal(true)}
          className="btn-primary"
          style={{ padding: '8px 12px', fontSize: '0.85rem', marginLeft: '10px', flexShrink: 0 }}
        >
          <Plus size={16} />
          手动补录
        </button>
      </div>

      {/* 当选具体日期时的复盘感语编辑框 */}
      {filterDate !== 'ALL' && (
        <div className="card card-wood" style={{ marginBottom: '16px', padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent-gold)' }}>
              📝 {filterDate} 考研备考复盘/总结
            </span>
            {editingRefDate !== filterDate && (
              <button 
                onClick={() => {
                  setEditingRefDate(filterDate);
                  setReflectionInput(reflections[filterDate]?.content || '');
                }}
                className="btn-outline"
                style={{ padding: '2px 8px', fontSize: '0.75rem' }}
              >
                {reflections[filterDate] ? '编辑' : '写复盘'}
              </button>
            )}
          </div>

          {editingRefDate === filterDate ? (
            <div>
              <textarea
                rows="3"
                placeholder="记录今日备考心境、解题思路或复习感悟..."
                value={reflectionInput}
                onChange={(e) => setReflectionInput(e.target.value)}
                style={{ marginBottom: '8px', fontSize: '0.85rem' }}
              />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button 
                  onClick={() => setEditingRefDate(null)} 
                  className="btn-secondary" 
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                >
                  取消
                </button>
                <button 
                  onClick={() => handleSaveReflection(filterDate)} 
                  className="btn-primary" 
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                >
                  <Save size={12} />
                  保存
                </button>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontStyle: reflections[filterDate] ? 'normal' : 'italic' }}>
              {reflections[filterDate]?.content || '暂无复盘感悟，点右上角记录你今天的复习心得吧！'}
            </p>
          )}
        </div>
      )}

      {/* 历史记录列表 */}
      {paginatedRecords.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {paginatedRecords.map((r) => {
            const subColor = subjectColors[r.subject_name] || '#9AA5B1';
            return (
              <div key={r.record_id} className="card" style={{ padding: '14px', marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      backgroundColor: `${subColor}20`,
                      color: subColor,
                      border: `1px solid ${subColor}`,
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)'
                    }}>
                      {r.subject_name}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-sub)' }}>
                      {r.record_date}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--primary-blue)', fontSize: '1.05rem' }}>
                      {r.duration_min} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>分钟</span>
                    </span>
                    <button 
                      onClick={() => setEditingRecord(r)}
                      style={{ background: 'none', padding: '4px', color: 'var(--text-sub)' }}
                      title="编辑"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => handleDelete(r.record_id)}
                      style={{ background: 'none', padding: '4px', color: '#EF4444' }}
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* 具体的学习内容 */}
                {r.study_content ? (
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.5, backgroundColor: 'var(--bg-main)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                    {r.study_content}
                  </p>
                ) : (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    未填写具体学习内容
                  </p>
                )}
              </div>
            );
          })}

          {/* 分页加载更多 */}
          {hasMore && (
            <button 
              onClick={() => setPage(p => p + 1)}
              className="btn-secondary"
              style={{ width: '100%', padding: '12px', marginTop: '8px', fontSize: '0.85rem' }}
            >
              加载更多历史日志 (已展示 {paginatedRecords.length} / {sortedRecords.length} 条)
            </button>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-sub)' }}>
          <FileText size={48} strokeWidth={1.5} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
          <p style={{ fontWeight: 600 }}>暂无匹配的学习日志</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            尝试切换筛选日期，或点右上角【手动补录】新增一条记录。
          </p>
        </div>
      )}

      {/* 弹窗：编辑记录 */}
      {editingRecord && (
        <EditLogModal
          record={editingRecord}
          subjects={config.subjects || []}
          onSave={onUpdateRecord}
          onClose={() => setEditingRecord(null)}
        />
      )}

      {/* 弹窗：手动补录 */}
      {showManualModal && (
        <ManualLogModal
          subjects={config.subjects || []}
          onSave={onAddManualRecord}
          onClose={() => setShowManualModal(false)}
        />
      )}

    </div>
  );
}
