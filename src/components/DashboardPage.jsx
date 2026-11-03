import { Plus, FolderOpen, ExternalLink, FilePlus, TrendingUp, Archive, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { Button, PageHead, Stat } from '../components/Primitives';
import { useProject } from '../context/ProjectContext';

const STATUS_COLORS = {
  planning: 'var(--blue)',
  in_progress: 'var(--teal)',
  completed: 'var(--green)',
  on_hold: 'var(--ochre)',
  archived: 'var(--mute)',
};

function StatusPill({ label, color }) {
  return <span className="status-pill" style={{ background: color }}>{label}</span>;
}

function QuickAction({ icon: Icon, label, onClick, variant = 'ghost', disabled }) {
  return (
    <Button variant={variant} icon={Icon} onClick={onClick} disabled={disabled} className="quick-action">
      {label}
    </Button>
  );
}

function RecentItem({ item, type, onClick }) {
  const isProject = type === 'project';
  const updatedAt = item.updatedAt ? new Date(item.updatedAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
  const status = item.status;
  const color = STATUS_COLORS[status] || STATUS_COLORS.planning;

  return (
    <button type="button" className="recent-item" onClick={onClick} disabled={isProject ? !item.id : !item.well?.id}>
      <div className="recent-main">
        <strong>{isProject ? item.projectName : item.well?.wellName || 'Unknown'}</strong>
        <span className="mono recent-code">{isProject ? item.projectCode : item.well?.wellCode}</span>
      </div>
      <div className="recent-meta">
        <StatusPill label={status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())} color={color} />
        <span className="mono recent-time">{updatedAt}</span>
      </div>
    </button>
  );
}

export default function DashboardPage({ onNavigate }) {
  const { stats, activeProject, activeWell, selectProject, selectWell, notify, projects } = useProject();

  const handleCreateProject = () => {
    onNavigate('projects');
    // The projects page will handle the form opening
  };

  const handleAddWell = () => {
    if (!activeProject) {
      notify('Pilih proyek terlebih dahulu', 'warning');
      return;
    }
    // Navigate to project detail to add well
    window.location.hash = `#project/${activeProject.id}`;
  };

  const handleOpenActiveWell = () => {
    if (!activeWell?.well?.id) {
      notify('Tidak ada sumur aktif', 'warning');
      return;
    }
    onNavigate('visualisasi');
  };

  const handleOpenProject = (projectId) => {
    selectProject(projectId);
    window.location.hash = `#project/${projectId}`;
  };

  const handleOpenWell = (wellId) => {
    selectWell(wellId);
    onNavigate('visualisasi');
  };

  const recentProjects = stats.recentProjects || [];
  const recentWells = stats.recentWells || [];

  return (
    <div className="dashboard-page">
      <PageHead
        kicker="00 · Dashboard"
        title="Ringkasan Proyek"
        description="Gambaran keseluruhan proyek dan sumur bor Anda."
      >
        <div className="header-actions">
          <QuickAction icon={Plus} label="Buat Proyek" onClick={handleCreateProject} variant="primary" />
        </div>
      </PageHead>

      <div className="stats-grid">
        <Stat label="Total Proyek" value={stats.totalProjects} icon={<FolderOpen size={24} />} />
        <Stat label="Proyek Aktif" value={stats.activeProjects} icon={<TrendingUp size={24} />} color="var(--teal)" />
        <Stat label="Total Sumur" value={stats.totalWells} icon={<FilePlus size={24} />} color="var(--ochre)" />
        <Stat label="Sumur Selesai" value={stats.completedWells} icon={<CheckCircle size={24} />} color="var(--green)" />
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-head">
            <h3>Proyek Terbaru</h3>
            {recentProjects.length > 0 && (
              <Button variant="ghost" size="sm" icon={ExternalLink} onClick={() => onNavigate('projects')}>Lihat semua</Button>
            )}
          </div>
          <div className="recent-list">
            {recentProjects.length > 0 ? (
              recentProjects.slice(0, 5).map(p => (
                <RecentItem key={p.id} item={p} type="project" onClick={() => handleOpenProject(p.id)} />
              ))
            ) : (
              <div className="empty-inline">Belum ada proyek. <Button variant="ghost" size="sm" icon={Plus} onClick={handleCreateProject}>Buat proyek pertama</Button></div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>Sumur Terbaru Diperbarui</h3>
            {recentWells.length > 0 && (
              <Button variant="ghost" size="sm" icon={ExternalLink} onClick={() => { if (activeProject) window.location.hash = `#project/${activeProject.id}`; }}>Lihat semua</Button>
            )}
          </div>
          <div className="recent-list">
            {recentWells.length > 0 ? (
              recentWells.slice(0, 5).map(w => (
                <RecentItem key={w.well.id} item={w} type="well" onClick={() => handleOpenWell(w.well.id)} />
              ))
            ) : (
              <div className="empty-inline">Belum ada sumur. {activeProject && <Button variant="ghost" size="sm" icon={FilePlus} onClick={handleAddWell}>Tambah sumur</Button>}</div>
            )}
          </div>
        </section>

        <section className="panel quick-actions-panel">
          <div className="panel-head"><h3>Tindakan Cepat</h3></div>
          <div className="quick-actions-grid">
            <QuickAction icon={FolderOpen} label="Kelola Proyek" onClick={() => onNavigate('projects')} />
            <QuickAction icon={Plus} label="Buat Proyek Baru" onClick={handleCreateProject} variant="primary" />
            {activeProject && (
              <>
                <QuickAction icon={FilePlus} label={`Tambah Sumur ke ${activeProject.projectName}`} onClick={handleAddWell} />
                <QuickAction icon={ExternalLink} label={`Buka Detail Proyek`} onClick={() => window.location.hash = `#project/${activeProject.id}`} />
              </>
            )}
            {activeWell?.well?.id && (
              <QuickAction icon={ExternalLink} label={`Buka Sumur Aktif (${activeWell.well.wellName})`} onClick={handleOpenActiveWell} variant="primary" />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}