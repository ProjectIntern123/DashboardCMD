'use client';

import React from 'react';

interface ProjectsTabProps {
  activeTab: string;
  activeProjectsCount: number;
  projects: any[];
  completedProjectsCount: number;
  orderBookTotal: number;
  billedTotal: number;
  collectedTotal: number;
  outstandingTotal: number;
  projectsAtRiskCount: number;
  projSearch: string;
  setProjSearch: (val: string) => void;
  hasPermission: (action: string, resource: string) => boolean;
  openAddModal: (type: string) => void;
  projBu: string;
  setProjBu: (val: string) => void;
  projStage: string;
  setProjStage: (val: string) => void;
  projHealth: string;
  setProjHealth: (val: string) => void;
  BUS: string[];
  projView: string;
  setProjView: (val: string) => void;
  exportProjects: () => void;
  filteredProjects: any[];
  setSelectedProject: (val: any) => void;
  projNum: (val: any) => number;
  fd: (val: any) => string;
  fmtCr: (val: any) => string;
  TODAY: string;
}

export const ProjectsTab: React.FC<ProjectsTabProps> = ({
  activeTab,
  activeProjectsCount,
  projects,
  completedProjectsCount,
  orderBookTotal,
  billedTotal,
  collectedTotal,
  outstandingTotal,
  projectsAtRiskCount,
  projSearch,
  setProjSearch,
  hasPermission,
  openAddModal,
  projBu,
  setProjBu,
  projStage,
  setProjStage,
  projHealth,
  setProjHealth,
  BUS,
  projView,
  setProjView,
  exportProjects,
  filteredProjects,
  setSelectedProject,
  projNum,
  fd,
  fmtCr,
  TODAY,
}) => {
  if (activeTab !== 'projects') return null;

  return (
    <section className="pane active">
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '14px' }}>
        <div className="stat-card" style={{ '--accent-color': '#0F2A4A', cursor: 'pointer' } as React.CSSProperties} onClick={() => setProjHealth('')} title="Click to view all projects">
          <div className="stat-label">Total Projects</div>
          <div className="stat-value">{projects.length}</div>
          <div className="stat-sub">irrespective of health status</div>
        </div>
        <div className="stat-card" style={{ '--accent-color': '#3B6D11', cursor: 'pointer' } as React.CSSProperties} onClick={() => setProjHealth('Green')} title="Click to filter On Track projects">
          <div className="stat-label">Projects On Track</div>
          <div className="stat-value">{projects.filter((p: any) => p.health === 'Green').length}</div>
          <div className="stat-sub">green health status</div>
        </div>
        <div className="stat-card" style={{ '--accent-color': '#C8960C', cursor: 'pointer' } as React.CSSProperties} onClick={() => setProjHealth('Amber')} title="Click to filter Monitor projects">
          <div className="stat-label">Projects to Monitor</div>
          <div className="stat-value">{projects.filter((p: any) => p.health === 'Amber').length}</div>
          <div className="stat-sub">amber health status</div>
        </div>
        <div className="stat-card" style={{ '--accent-color': '#A32D2D', cursor: 'pointer' } as React.CSSProperties} onClick={() => setProjHealth('Red')} title="Click to filter At Risk projects">
          <div className="stat-label">Projects At Risk</div>
          <div className="stat-value">{projects.filter((p: any) => p.health === 'Red').length}</div>
          <div className="stat-sub">red health status</div>
        </div>
      </div>

      <div className="toolbar-projects-grid">
        {/* 1. Search */}
        <div className="srch proj-grid-item-search">
          <span className="srch-ic">⌕</span>
          <input
            type="text"
            placeholder="Search projects, client, location..."
            value={projSearch}
            onChange={e => setProjSearch(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        {/* 2. Add Project button */}
        {hasPermission('Create', 'Projects') && (
          <button className="btn-add proj-grid-item-add" onClick={() => openAddModal('project')} style={{ whiteSpace: 'nowrap' }}>
            + Add Project
          </button>
        )}

        {/* 3. BU Select */}
        <select className="fsel proj-grid-item-bu" value={projBu} onChange={e => setProjBu(e.target.value)} title="Filter by BU">
          <option value="">All BUs</option>
          {BUS.map(bu => (
            <option key={bu} value={bu}>{bu}</option>
          ))}
        </select>

        {/* 4. Stage Select */}
        <select className="fsel proj-grid-item-stage" value={projStage} onChange={e => setProjStage(e.target.value)} title="Filter by stage">
          <option value="">All Stages</option>
          <option value="Planning">Planning</option>
          <option value="Execution">Execution</option>
          <option value="Commissioning">Commissioning</option>
          <option value="Completed">Completed</option>
          <option value="On Hold">On Hold</option>
        </select>

        {/* 5. Health Select */}
        <select className="fsel proj-grid-item-health" value={projHealth} onChange={e => setProjHealth(e.target.value)} title="Filter by health">
          <option value="">All Health</option>
          <option value="Green">🟢 On Track</option>
          <option value="Amber">🟠 Watch</option>
          <option value="Red">🔴 At Risk</option>
        </select>

        {/* 6. View Options (Grid/List) & Export */}
        <div className="proj-grid-item-view-options" style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn-icon ${projView === 'grid' ? 'active' : ''}`}
            onClick={() => setProjView('grid')}
            title="Grid View"
          >
            ⚃
          </button>
          <button
            className={`btn-icon ${projView === 'table' ? 'active' : ''}`}
            onClick={() => setProjView('table')}
            title="Table View"
          >
            ☰
          </button>
          {hasPermission('Export', 'Projects') && (
            <button className="btn-export" onClick={exportProjects} title="Export projects to CSV">
              ⇩ Export CSV
            </button>
          )}
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <div className="empty">No projects found.</div>
      ) : projView === 'grid' ? (
        <div className="proj-grid">
          {filteredProjects.map(p => {
            const out = projNum(p.billed) - projNum(p.collected);
            const hCls = p.health === 'Green' ? 'green' : p.health === 'Amber' ? 'amber' : 'red';
            const hLabel = p.health === 'Green' ? '🟢 On Track' : p.health === 'Amber' ? '🟠 Watch' : '🔴 At Risk';

            let scheduleText = '';
            const cod = p.rcod || p.cod;
            if (cod) {
              const late = p.stage !== 'Completed' && cod < TODAY;
              scheduleText = `📅 COD ${fd(cod)}${p.rcod && p.rcod !== p.cod ? ' (revised)' : ''}${late ? ' · DELAYED' : ''}`;
            }
            const nextM = p.milestone ? `🎯 ${p.milestone}${p.mdate ? ' · ' + fd(p.mdate) : ''}` : '';

            return (
              <div
                key={p.id}
                className={`proj-card proj-h-${hCls}`}
                onClick={() => setSelectedProject(p)}
              >
                <div className="proj-card-top">
                  <div className="proj-id-block">
                    <div className="proj-name">{p.name || 'Untitled Project'}</div>
                    <div className="proj-meta-line">
                      {p.bu && <span className="bu-chip" style={{ fontSize: '10px', background: '#e0e7ff', color: '#3730a3', padding: '2px 6px', borderRadius: '4px', marginRight: '6px', fontWeight: 600 }}>{p.bu}</span>}
                      {p.client && `${p.client}`}
                      {p.loc && ` · ${p.loc}`}
                    </div>
                  </div>
                  <div className={`proj-health proj-health-${hCls}`}>
                    {hLabel}
                  </div>
                </div>

                <div className="proj-progress-label" style={{ marginTop: '12px', marginBottom: '8px' }}>
                  <span>Stage:</span>
                  <span className="proj-stage-tag">{p.stage || '—'}</span>
                </div>

                <div className="proj-fin">
                  <div className="proj-fin-item">
                    <span>Order</span>
                    <strong>{fmtCr(p.order)}</strong>
                  </div>
                  <div className="proj-fin-item">
                    <span>Billed</span>
                    <strong>{fmtCr(p.billed)}</strong>
                  </div>
                  <div className="proj-fin-item">
                    <span>Outstanding</span>
                    <strong style={{ color: out > 0 ? '#854F0B' : '#111' }}>{fmtCr(out)}</strong>
                  </div>
                </div>

                {(scheduleText || nextM) && (
                  <div className="proj-foot">
                    {scheduleText ? (
                      <span style={{ color: scheduleText.includes('DELAYED') ? 'var(--danger)' : 'inherit', fontWeight: scheduleText.includes('DELAYED') ? 700 : 'inherit' }}>
                        {scheduleText}
                      </span>
                    ) : (
                      <span>—</span>
                    )}
                    {nextM && <span className="proj-next">{nextM}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="tbl-wrap" style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
          <table className="legal-tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f5f7fa', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Project Name</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Project Manager</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>BU / Segment</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Stage</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Order Value</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Billed</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Collected</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>RAG Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map(p => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedProject(p)}
                  style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer', transition: 'background 0.15s' }}
                  className="proj-table-row"
                >
                  <td style={{ padding: '12px', fontWeight: 600 }}>{p.name}</td>
                  <td style={{ padding: '12px' }}>{p.pm || '—'}</td>
                  <td style={{ padding: '12px' }}>{p.bu || '—'}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{p.stage || '—'}</span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>{fmtCr(p.order)}</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>{fmtCr(p.billed)}</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>{fmtCr(p.collected)}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <span className={`legal-risk risk-${p.health?.toLowerCase()}`} style={{ display: 'inline-block', minWidth: '70px', textAlign: 'center' }}>
                      {p.health}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
