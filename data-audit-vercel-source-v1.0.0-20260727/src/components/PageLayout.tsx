import type { ReactNode } from 'react';
import { Button, Empty, Input, Popconfirm } from 'antd';
import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';

type PageHeaderProps = {
  title: string;
  icon?: ReactNode;
  backLabel?: string;
  onBack?: () => void;
  actions?: ReactNode;
};

export function PageHeader({ title, icon, backLabel, onBack, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      {backLabel && onBack && (
        <nav className="page-breadcrumb" aria-label="面包屑导航">
          <button type="button" onClick={onBack}>{backLabel}</button>
          <span aria-hidden="true">/</span>
          <span>{title}</span>
        </nav>
      )}
      <div className="page-header-row">
        <h1 className="page-title">
          {icon && <span className="page-title-icon" aria-hidden="true">{icon}</span>}
          <span>{title}</span>
        </h1>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
    </header>
  );
}

type ManagementToolbarProps = {
  filter: string;
  filterPlaceholder: string;
  onFilterChange: (value: string) => void;
  onExport: () => void;
  onCreate: () => void;
  createLabel: string;
};

export function ManagementToolbar({
  filter,
  filterPlaceholder,
  onFilterChange,
  onExport,
  onCreate,
  createLabel,
}: ManagementToolbarProps) {
  return (
    <div className="management-toolbar" role="search">
      <Input
        className="management-search"
        allowClear
        prefix={<SearchOutlined />}
        placeholder={filterPlaceholder}
        value={filter}
        onChange={event => onFilterChange(event.target.value)}
        aria-label={filterPlaceholder}
      />
      <div className="management-toolbar-actions">
        <Button icon={<DownloadOutlined />} onClick={onExport}>导出明细表</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>{createLabel}</Button>
      </div>
    </div>
  );
}

type SummaryMetricProps = {
  label: string;
  value: string | number;
  icon?: ReactNode;
  tone?: 'primary' | 'success' | 'warning';
};

export function SummaryMetric({ label, value, icon, tone = 'primary' }: SummaryMetricProps) {
  return (
    <div className={`summary-card summary-card-${tone}`}>
      <div className="card-label">
        {icon && <span className="summary-card-icon" aria-hidden="true">{icon}</span>}
        <span>{label}</span>
      </div>
      <div className="card-value">{value}</div>
    </div>
  );
}

export function PageEmpty({ description }: { description: string }) {
  return (
    <div className="page-empty">
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description} />
    </div>
  );
}

type RowActionsProps = {
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void | Promise<void>;
  deleting?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
};

export function RowActions({ onView, onEdit, onDelete, deleting = false, canEdit = true, canDelete = true }: RowActionsProps) {
  return (
    <div className="table-actions">
      <Button type="link" size="small" icon={<EyeOutlined />} onClick={onView}>查看</Button>
      {canEdit ? <Button type="link" size="small" icon={<EditOutlined />} onClick={onEdit}>编辑</Button> : <span className="table-action-placeholder">只读</span>}
      {canDelete ? (
        <Popconfirm title="确定删除？" okText="删除" cancelText="取消" onConfirm={onDelete}>
          <Button type="link" danger size="small" icon={<DeleteOutlined />} loading={deleting}>删除</Button>
        </Popconfirm>
      ) : <span className="table-action-placeholder" aria-hidden="true" />}
    </div>
  );
}
