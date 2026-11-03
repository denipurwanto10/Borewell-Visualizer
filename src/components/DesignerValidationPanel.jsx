import { AlertTriangle, Info, CheckCircle } from 'lucide-react';
import { countsByLevel, groupByLevel } from '../designer/validation';

const LEVEL_ICON = { error: AlertTriangle, warning: AlertTriangle, info: Info };
const LEVEL_LABEL = { error: 'Error', warning: 'Peringatan', info: 'Informasi' };

export default function DesignerValidationPanel({ issues }) {
  const grouped = groupByLevel(issues);
  const counts = countsByLevel(issues);

  if (!issues || issues.length === 0) {
    return (
      <section className="validation-panel empty">
        <CheckCircle size={20} style={{ color: 'var(--green)', marginRight: '8px' }} />
        <span className="validation-summary">Desain valid — tidak ada masalah.</span>
      </section>
    );
  }

  return (
    <section className="validation-panel has-issues">
      <div className="validation-summary">
        <span className={`badge badge-error`}>{counts.error} Error</span>
        <span className={`badge badge-warning`}>{counts.warning} Peringatan</span>
        <span className={`badge badge-info`}>{counts.info} Info</span>
      </div>
      <div className="validation-list">
        {[...grouped.error, ...grouped.warning, ...grouped.info].map((issue, i) => {
          const Icon = LEVEL_ICON[issue.level];
          return (
            <div key={i} className={`validation-item level-${issue.level}`}>
              <Icon size={14} />
              <span>{issue.message}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
