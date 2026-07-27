import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Input, message, Modal, Select, Space, Switch, Table, Tag } from 'antd';
import { PlusOutlined, SafetyCertificateOutlined, TeamOutlined } from '@ant-design/icons';
import { db } from '../api/db';
import { useAuth, type UserProfile, type UserRole } from '../auth/AuthContext';
import { PageError, PageLoading } from '../components/PageState';
import { PageHeader } from '../components/PageLayout';
import { ensureSuccess, getErrorMessage } from '../utils/errors';

const roleLabels: Record<UserRole, string> = {
  member: '普通成员',
  team_admin: '团队管理员',
  super_admin: '超级管理员',
};

export default function AccessAdminPage() {
  const { isSuperAdmin, refreshProfile, profile: currentProfile } = useAuth();
  const [teams, setTeams] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [teamOpen, setTeamOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<UserProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [teamForm] = Form.useForm();
  const [profileForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [teamResult, profileResult] = await Promise.all([db.listTeams(), db.listUserProfiles()]);
      setTeams(ensureSuccess(teamResult).data || []);
      setProfiles((ensureSuccess(profileResult).data || []) as UserProfile[]);
    } catch (error) {
      setLoadError(getErrorMessage(error, '团队和人员加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isSuperAdmin) load(); }, [isSuperAdmin]);

  const saveTeam = async () => {
    const values = await teamForm.validateFields();
    const isEditing = Boolean(editingTeam);
    setSaving(true);
    try {
      const payload = { name: values.name.trim(), active: values.active !== false };
      ensureSuccess(editingTeam ? await db.updateTeam(editingTeam.id, payload) : await db.createTeam(payload));
      setTeamOpen(false);
      setEditingTeam(null);
      teamForm.resetFields();
      await load();
      message.success(isEditing ? '团队已更新' : '团队已创建');
    } catch (error) {
      message.error(`创建失败：${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    if (!editingProfile) return;
    const values = await profileForm.validateFields();
    setSaving(true);
    try {
      ensureSuccess(await db.updateUserProfile(editingProfile.id, {
        display_name: values.display_name?.trim() || null,
        team_id: values.team_id,
        role: values.role,
        active: values.active,
      }));
      setProfileOpen(false);
      await load();
      await refreshProfile();
      message.success('人员权限已更新');
    } catch (error) {
      message.error(`保存失败：${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const teamOptions = useMemo(() => teams.map(team => ({ label: team.name, value: team.id })), [teams]);

  if (!isSuperAdmin) return <PageError message="只有超级管理员可以进入人员权限管理" />;
  if (loading && profiles.length === 0) return <PageLoading text="正在加载人员权限..." />;
  if (loadError && profiles.length === 0) return <PageError message={loadError} onRetry={load} retrying={loading} />;

  return (
    <div>
      <PageHeader
        title="团队与人员权限"
        icon={<SafetyCertificateOutlined />}
        actions={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingTeam(null); teamForm.setFieldsValue({ name: '', active: true }); setTeamOpen(true); }}>新建团队</Button>}
      />
      <Alert
        type="info"
        showIcon
        className="access-admin-alert"
        message="账号创建方式"
        description="先在 Supabase Authentication 的 Users 页面创建登录账号。账号会自动出现在下方人员列表中，再由超级管理员分配团队、角色并启用。"
      />
      <div className="access-summary">
        <div><TeamOutlined /><span>团队</span><strong>{teams.length}</strong></div>
        <div><SafetyCertificateOutlined /><span>人员</span><strong>{profiles.length}</strong></div>
      </div>
      <h2 className="access-section-title">团队列表</h2>
      <div className="management-table-shell access-table-section">
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={teams}
          columns={[
            { title: '团队名称', dataIndex: 'name' },
            { title: '人员数', width: 100, render: (_value, team) => profiles.filter(item => item.team_id === team.id).length },
            { title: '状态', width: 100, render: (_value, team) => <Tag color={team.active ? 'success' : 'default'}>{team.active ? '已启用' : '已停用'}</Tag> },
            { title: '操作', width: 90, render: (_value, team) => <Button type="link" onClick={() => { setEditingTeam(team); teamForm.setFieldsValue(team); setTeamOpen(true); }}>编辑</Button> },
          ]}
        />
      </div>
      <h2 className="access-section-title">人员列表</h2>
      <div className="management-table-shell">
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          loading={loading}
          dataSource={profiles}
          columns={[
            { title: '姓名', dataIndex: 'display_name', width: 140, render: value => value || '--' },
            { title: '登录邮箱', dataIndex: 'email', render: value => value || '--' },
            { title: '所属团队', width: 180, render: (_value, record) => record.team?.name || '--' },
            { title: '角色', width: 130, render: (_value, record) => <Tag color={record.role === 'super_admin' ? 'red' : record.role === 'team_admin' ? 'blue' : 'default'}>{roleLabels[record.role]}</Tag> },
            { title: '状态', width: 90, render: (_value, record) => <Tag color={record.active ? 'success' : 'default'}>{record.active ? '已启用' : '待启用'}</Tag> },
            { title: '操作', width: 90, render: (_value, record) => <Button type="link" onClick={() => { setEditingProfile(record); profileForm.setFieldsValue(record); setProfileOpen(true); }}>设置</Button> },
          ]}
        />
      </div>

      <Modal title={editingTeam ? '编辑团队' : '新建团队'} open={teamOpen} onOk={saveTeam} onCancel={() => !saving && setTeamOpen(false)} confirmLoading={saving}>
        <Form form={teamForm} layout="vertical">
          <Form.Item name="name" label="团队名称" rules={[{ required: true, message: '请输入团队名称' }]}><Input placeholder="请输入团队名称" /></Form.Item>
          <Form.Item name="active" label="团队状态" valuePropName="checked" initialValue={true}><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item>
        </Form>
      </Modal>
      <Modal title="设置人员权限" open={profileOpen} onOk={saveProfile} onCancel={() => !saving && setProfileOpen(false)} confirmLoading={saving}>
        <Form form={profileForm} layout="vertical">
          <Form.Item name="display_name" label="姓名"><Input placeholder="请输入人员姓名" /></Form.Item>
          <Form.Item name="team_id" label="所属团队" rules={[{ required: true, message: '请选择所属团队' }]}><Select options={teamOptions} placeholder="请选择团队" /></Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select disabled={editingProfile?.id === currentProfile?.id} options={Object.entries(roleLabels).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="active" label="允许登录" valuePropName="checked"><Switch disabled={editingProfile?.id === currentProfile?.id} /></Form.Item>
          <Space size="small"><Tag>{editingProfile?.email || '--'}</Tag></Space>
        </Form>
      </Modal>
    </div>
  );
}
