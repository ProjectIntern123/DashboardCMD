'use client';

import React from 'react';

interface TasksTabProps {
  activeTab: string;
  hasTaskInbox: boolean;
  overdueTasksCount: number;
  isCMD: boolean;
  tkSearch: string;
  setTkSearch: (val: string) => void;
  hasPermission: (action: string, resource: string) => boolean;
  openAddModal: (type: string) => void;
  tkFilterStatus: string;
  setTkFilterStatus: (val: string) => void;
  tkFilterPriority: string;
  setTkFilterPriority: (val: string) => void;
  filteredTasks: any[];
  fd: (val: any) => string;
  TODAY: string;
  handleTaskStatusToggle: (task: any) => void;
  setEditTaskModalData: (val: any) => void;
  setEditTaskOpen: (val: boolean) => void;
  handleRecordDelete: (path: string, id: string) => void;
}

export const TasksTab: React.FC<TasksTabProps> = ({
  activeTab,
  hasTaskInbox,
  overdueTasksCount,
  isCMD,
  tkSearch,
  setTkSearch,
  hasPermission,
  openAddModal,
  tkFilterStatus,
  setTkFilterStatus,
  tkFilterPriority,
  setTkFilterPriority,
  filteredTasks,
  fd,
  TODAY,
  handleTaskStatusToggle,
  setEditTaskModalData,
  setEditTaskOpen,
  handleRecordDelete,
}) => {
  if (activeTab !== 'tasks') return null;

  return (
    <section className="pane active">
      {!hasTaskInbox ? (
        <div className="empty">
          🔒 This profile has no task inbox.<br />
          <span style={{ fontSize: '12px' }}>
            Tasks are private to the CMD and the two assignees (Executive & EA).
          </span>
        </div>
      ) : (
        <>
          {/* Overdue alert */}
          {overdueTasksCount > 0 && (
            <div className="alert alert-red" style={{ marginBottom: '12px' }}>
              <div className="alert-dot" />
              <span>
                <strong>{overdueTasksCount} overdue task{overdueTasksCount > 1 ? 's' : ''}</strong>
              </span>
            </div>
          )}

          {/* Role banner */}
          <div className="alert" style={{ background: isCMD ? 'var(--info-bg)' : 'var(--ok-bg)', color: isCMD ? 'var(--info)' : 'var(--ok)', border: `1px solid ${isCMD ? 'var(--info-border)' : 'var(--ok-border)'}`, marginBottom: '12px' }}>
            <div className="alert-dot" />
            <div>
              {isCMD ? (
                <span><strong>CMD Tracking View.</strong> You can see every task you assigned and monitor each assignee's progress. Assignees only see the tasks given to them.</span>
              ) : (
                <span><strong>Your private task list.</strong> Only tasks assigned to you by the CMD appear here. Update the status to report progress.</span>
              )}
            </div>
          </div>

          <div className="toolbar" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="toolbar-search-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '8px' }}>
              <div className="srch" style={{ flex: 1 }}>
                <span className="srch-ic">⌕</span>
                <input
                  type="text"
                  placeholder="Search tasks..."
                  value={tkSearch}
                  onChange={e => setTkSearch(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              {hasPermission('Create', 'Tasks') && (
                <button className="btn-add" onClick={() => openAddModal('task')} style={{ whiteSpace: 'nowrap' }}>
                  + Assign Task
                </button>
              )}
            </div>

            <div className="toolbar-filters-row" style={{ display: 'flex', gap: '8px', width: '100%' }}>
              <select className="fsel" style={{ flex: 1 }} value={tkFilterStatus} onChange={e => setTkFilterStatus(e.target.value)} title="Filter by status">
                <option value="">All Statuses</option>
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Done">Done</option>
                <option value="Closed">Closed</option>
              </select>

              <select className="fsel" style={{ flex: 1 }} value={tkFilterPriority} onChange={e => setTkFilterPriority(e.target.value)} title="Filter by priority">
                <option value="">All Priorities</option>
                <option value="High">🔴 High</option>
                <option value="Medium">🟡 Medium</option>
                <option value="Low">🟢 Low</option>
              </select>
            </div>
          </div>

          {filteredTasks.length === 0 ? (
            <div className="empty">No tasks found.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px' }}>
              {filteredTasks.map(t => {
                const isOverdue = t.due && t.st !== 'Done' && t.st !== 'Closed' && t.due < TODAY;
                const pColor = t.pri === 'High' ? 'var(--danger)' : t.pri === 'Medium' ? 'var(--warning)' : 'var(--ok)';
                const pLabel = t.pri === 'High' ? 'High' : t.pri === 'Medium' ? 'Medium' : 'Low';

                return (
                  <div key={t.id} className="task-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: `4px solid ${pColor}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={t.st === 'Done' || t.st === 'Closed'}
                          onChange={() => handleTaskStatusToggle(t)}
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <span style={{ fontWeight: 600, fontSize: '15px', textDecoration: (t.st === 'Done' || t.st === 'Closed') ? 'line-through' : 'none', color: (t.st === 'Done' || t.st === 'Closed') ? '#888' : '#111' }}>
                          {t.title}
                        </span>
                      </div>
                      <span className={`legal-risk risk-${t.pri.toLowerCase()}`} style={{ fontSize: '10px', padding: '2px 6px', display: 'inline-block' }}>
                        {pLabel}
                      </span>
                    </div>

                    {t.detail && (
                      <div style={{ fontSize: '13px', color: '#555', paddingLeft: '26px' }}>
                        {t.detail}
                      </div>
                    )}

                    <div className="task-card-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#666', paddingLeft: '26px', flexWrap: 'wrap', gap: '6px' }}>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <span>👤 Assignee: <strong>{t.assignee?.name || '—'}</strong></span>
                        {t.due && (
                          <span style={{ color: isOverdue ? 'var(--danger)' : 'inherit', fontWeight: isOverdue ? 700 : 'normal' }}>
                            📅 Due: {fd(t.due)} {isOverdue && '⚠️ OVERDUE'}
                          </span>
                        )}
                        {t.cd && <span style={{ color: 'var(--ok)', fontWeight: 600 }}>✓ Completed: {fd(t.cd)}</span>}
                      </div>

                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <span style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, textTransform: 'uppercase', fontSize: '9px' }}>
                          {t.st}
                        </span>
                        {isCMD && (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              className="text-btn"
                              style={{ color: 'var(--navy)' }}
                              onClick={() => {
                                setEditTaskModalData(t);
                                setEditTaskOpen(true);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="text-btn"
                              style={{ color: 'var(--danger)' }}
                              onClick={() => handleRecordDelete('/tasks', t.id)}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
};
