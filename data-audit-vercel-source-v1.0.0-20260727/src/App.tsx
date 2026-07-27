import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { db } from './api/db';
import { Button, message, Spin } from 'antd';
import {
  AppstoreOutlined,
  AuditOutlined,
  DatabaseOutlined,
  DownOutlined,
  FileDoneOutlined,
  FolderOpenOutlined,
  ProfileOutlined,
  ProjectOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import './App.css';
import { ensureSuccess, getErrorMessage } from './utils/errors';
import { useAuth } from './auth/AuthContext';
import LoginPage from './pages/LoginPage';

const CatalogPage = React.lazy(() => import('./pages/CatalogPage'));
const ProjectListPage = React.lazy(() => import('./pages/ProjectListPage'));
const ProjectDetailPage = React.lazy(() => import('./pages/ProjectDetailPage'));
const ServiceDetailPage = React.lazy(() => import('./pages/ServiceDetailPage'));
const DeclareDetailPage = React.lazy(() => import('./pages/DeclareDetailPage'));
const AcceptDetailPage = React.lazy(() => import('./pages/AcceptDetailPage'));
const SvcMgmtPage = React.lazy(() => import('./pages/SvcMgmtPage'));
const DecMgmtPage = React.lazy(() => import('./pages/DecMgmtPage'));
const AccMgmtPage = React.lazy(() => import('./pages/AccMgmtPage'));
const AccessAdminPage = React.lazy(() => import('./pages/AccessAdminPage'));

interface Project {
  id: number; name: string;
}

function AuthenticatedApp() {
  const { profile, signOut, isSuperAdmin } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Record<number, boolean>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [svcItems, setSvcItems] = useState<any[]>([]);
  const [decItems, setDecItems] = useState<any[]>([]);
  const [accItems, setAccItems] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [currentServiceId, setCurrentServiceId] = useState<number | null>(null);
  const [currentDeclareId, setCurrentDeclareId] = useState<number | null>(null);
  const [currentAcceptId, setCurrentAcceptId] = useState<number | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState('');
  const [subItemsLoading, setSubItemsLoading] = useState(false);
  const [subItemsError, setSubItemsError] = useState('');

  const navigate = useNavigate();
  const location = useLocation();

  const refreshProjects = useCallback(async () => {
    setProjectsLoading(true);
    setProjectsError('');
    try {
      const r = ensureSuccess(await db.listProjects());
      setProjects(r.data || []);
    } catch (error) {
      console.error('Projects error:', error);
      setProjectsError(getErrorMessage(error, '项目导航加载失败'));
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => { refreshProjects(); }, [refreshProjects]);

  const loadSubItems = useCallback(async (projectId: number) => {
    const [services, declares, accepts] = await Promise.all([
      db.listServices(projectId),
      db.listDeclares(projectId),
      db.listAccepts(projectId),
    ]);

    if (services.error) throw services.error;
    if (declares.error) throw declares.error;
    if (accepts.error) throw accepts.error;

    return {
      services: services.data || [],
      declares: declares.data || [],
      accepts: accepts.data || [],
    };
  }, []);

  const refreshSubItems = useCallback(async (projectId = currentProjectId) => {
    if (projectId === null) {
      setSvcItems([]);
      setDecItems([]);
      setAccItems([]);
      return;
    }

    setSubItemsLoading(true);
    setSubItemsError('');
    try {
      const subItems = await loadSubItems(projectId);
      setSvcItems(subItems.services);
      setDecItems(subItems.declares);
      setAccItems(subItems.accepts);
    } catch (e) {
      console.error('Sub items error:', e);
      setSubItemsError(getErrorMessage(e, '左侧导航列表刷新失败'));
      message.error('左侧导航列表刷新失败');
    } finally {
      setSubItemsLoading(false);
    }
  }, [currentProjectId, loadSubItems]);

  const expandProjectAndGroup = useCallback((projectId: number, tab?: string | null) => {
    setExpandedProjects(prev => ({ ...prev, [projectId]: true }));
    if (tab) {
      setExpandedGroups(prev => ({ ...prev, [`${projectId}-${tab}`]: true }));
    }
  }, []);

  const applyNavState = useCallback((state: {
    projectId: number | null;
    tab?: string | null;
    serviceId?: number | null;
    declareId?: number | null;
    acceptId?: number | null;
  }) => {
    setCurrentProjectId(state.projectId);
    setActiveTab(state.tab ?? null);
    setCurrentServiceId(state.serviceId ?? null);
    setCurrentDeclareId(state.declareId ?? null);
    setCurrentAcceptId(state.acceptId ?? null);
    if (state.projectId !== null) {
      expandProjectAndGroup(state.projectId, state.tab);
    }
  }, [expandProjectAndGroup]);

  useEffect(() => {
    let cancelled = false;

    if (currentProjectId === null) {
      setSvcItems([]);
      setDecItems([]);
      setAccItems([]);
      setSubItemsLoading(false);
      setSubItemsError('');
      return;
    }

    setSvcItems([]);
    setDecItems([]);
    setAccItems([]);
    setSubItemsLoading(true);
    setSubItemsError('');

    const load = async () => {
      try {
        const subItems = await loadSubItems(currentProjectId);

        if (cancelled) return;
        setSvcItems(subItems.services);
        setDecItems(subItems.declares);
        setAccItems(subItems.accepts);
      } catch (e) {
        if (!cancelled) {
          console.error('Sub items error:', e);
          setSubItemsError(getErrorMessage(e, '左侧导航列表加载失败'));
          message.error('左侧导航列表加载失败');
        }
      } finally {
        if (!cancelled) setSubItemsLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [currentProjectId, loadSubItems]);

  useEffect(() => {
    let cancelled = false;
    const pathname = location.pathname;
    const toNumber = (value: string) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const syncDetailRoute = async (
      id: number,
      tab: 'svc' | 'dec' | 'acc',
      loader: (id: number) => PromiseLike<{ data: any; error: any }>
    ) => {
      applyNavState({
        projectId: currentProjectId,
        tab,
        serviceId: tab === 'svc' ? id : null,
        declareId: tab === 'dec' ? id : null,
        acceptId: tab === 'acc' ? id : null,
      });

      try {
        const { data, error } = await loader(id);
        if (cancelled || error) return;
        const projectId = Number(data?.project_id);
        if (Number.isFinite(projectId)) {
          applyNavState({
            projectId,
            tab,
            serviceId: tab === 'svc' ? id : null,
            declareId: tab === 'dec' ? id : null,
            acceptId: tab === 'acc' ? id : null,
          });
        }
      } catch (e) {
        if (!cancelled) {
          console.error('Route sync error:', e);
        }
      }
    };

    if (pathname === '/' || pathname === '/catalog') {
      applyNavState({ projectId: null });
      return;
    }

    const projectMgmtMatch = pathname.match(/^\/project\/(\d+)\/(svc-mgmt|dec-mgmt|acc-mgmt)$/);
    if (projectMgmtMatch) {
      const projectId = toNumber(projectMgmtMatch[1]);
      const tabMap: Record<string, 'svc' | 'dec' | 'acc'> = {
        'svc-mgmt': 'svc',
        'dec-mgmt': 'dec',
        'acc-mgmt': 'acc',
      };
      if (projectId !== null) {
        applyNavState({ projectId, tab: tabMap[projectMgmtMatch[2]] });
      }
      return;
    }

    const projectMatch = pathname.match(/^\/project\/(\d+)$/);
    if (projectMatch) {
      const projectId = toNumber(projectMatch[1]);
      if (projectId !== null) {
        applyNavState({ projectId });
      }
      return;
    }

    const serviceMatch = pathname.match(/^\/service\/(\d+)$/);
    if (serviceMatch) {
      const id = toNumber(serviceMatch[1]);
      if (id !== null) {
        syncDetailRoute(id, 'svc', db.getService);
      }
      return () => {
        cancelled = true;
      };
    }

    const declareMatch = pathname.match(/^\/declare\/(\d+)$/);
    if (declareMatch) {
      const id = toNumber(declareMatch[1]);
      if (id !== null) {
        syncDetailRoute(id, 'dec', db.getDeclare);
      }
      return () => {
        cancelled = true;
      };
    }

    const acceptMatch = pathname.match(/^\/accept\/(\d+)$/);
    if (acceptMatch) {
      const id = toNumber(acceptMatch[1]);
      if (id !== null) {
        syncDetailRoute(id, 'acc', db.getAccept);
      }
      return () => {
        cancelled = true;
      };
    }
  }, [applyNavState, currentProjectId, location.pathname]);

  const toggleProject = (pid: number) => {
    setExpandedProjects(prev => ({ ...prev, [pid]: prev[pid] === false }));
    setCurrentProjectId(pid);
    setActiveTab(null);
    setCurrentServiceId(null);
    setCurrentDeclareId(null);
    setCurrentAcceptId(null);
    navigate(`/project/${pid}`);
  };

  const toggleGroup = (pid: number, tab: string) => {
    const key = `${pid}-${tab}`;
    setExpandedGroups(prev => ({ ...prev, [key]: prev[key] === false }));
    setCurrentProjectId(pid);
    setActiveTab(tab);
    setCurrentServiceId(null);
    setCurrentDeclareId(null);
    setCurrentAcceptId(null);
    const pageMap: Record<string, string> = { svc: 'svc-mgmt', dec: 'dec-mgmt', acc: 'acc-mgmt' };
    navigate(`/project/${pid}/${pageMap[tab]}`);
  };

  const navToService = (svcId: number) => {
    setCurrentServiceId(svcId);
    setCurrentDeclareId(null);
    setCurrentAcceptId(null);
    setActiveTab('svc');
    navigate(`/service/${svcId}`);
  };

  const navToDeclare = (decId: number) => {
    setCurrentDeclareId(decId);
    setCurrentServiceId(null);
    setCurrentAcceptId(null);
    setActiveTab('dec');
    navigate(`/declare/${decId}`);
  };

  const navToAccept = (accId: number) => {
    setCurrentAcceptId(accId);
    setCurrentServiceId(null);
    setCurrentDeclareId(null);
    setActiveTab('acc');
    navigate(`/accept/${accId}`);
  };

  return (
    <div id="app">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      {/* ========== SIDEBAR ========== */}
      <nav className="sidebar">
        <div className="sidebar-header"><DatabaseOutlined className="sidebar-brand-icon" />数据运营服务审量系统</div>
        <div className="sidebar-nav">
          <div className="nav-group">全局模块</div>
          <div className={`nav-item ${location.pathname === '/catalog' ? 'active' : ''}`}
            onClick={() => { setCurrentProjectId(null); navigate('/catalog'); }}>
            <AppstoreOutlined className="nav-icon" />服务目录识别管理
          </div>
          <div className="nav-group">业务模块</div>
          <div className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}
            onClick={() => { setCurrentProjectId(null); navigate('/'); }}>
            <FolderOpenOutlined className="nav-icon" />数据运营项目列表
          </div>
          {isSuperAdmin && (
            <>
              <div className="nav-group">系统管理</div>
              <div className={`nav-item ${location.pathname === '/admin/access' ? 'active' : ''}`}
                onClick={() => { setCurrentProjectId(null); navigate('/admin/access'); }}>
                <SafetyCertificateOutlined className="nav-icon" />团队与人员权限
              </div>
            </>
          )}
          {projectsLoading && projects.length === 0 && <div className="sidebar-status"><Spin size="small" /> 正在加载项目...</div>}
          {projectsError && <div className="sidebar-status sidebar-status-error"><div className="sidebar-status-message">{projectsError}</div><Button size="small" onClick={refreshProjects}>重试</Button></div>}
          {projects.map(p => {
            const expanded = expandedProjects[p.id] !== false;
            const isCurrentProject = currentProjectId === p.id;
            return (
              <React.Fragment key={p.id}>
                <div className={`nav-item sub ${isCurrentProject && !activeTab ? 'active' : ''}`}
                  onClick={() => toggleProject(p.id)}>
                  <span className="expand-icon">{expanded ? <DownOutlined /> : <RightOutlined />}</span><ProjectOutlined className="nav-icon" />{p.name}
                </div>
                {expanded && (
                  <div className="sidebar-sub-wrap">
                    {isCurrentProject && subItemsLoading && <div className="sidebar-status"><Spin size="small" /> 正在加载目录...</div>}
                    {isCurrentProject && subItemsError && <div className="sidebar-status sidebar-status-error"><div className="sidebar-status-message">{subItemsError}</div><Button size="small" onClick={() => refreshSubItems(p.id)}>重试</Button></div>}
                    {/* 服务单管理 */}
                    {(() => {
                      const key = `${p.id}-svc`;
                      const gExpanded = expandedGroups[key] !== false;
                      return (
                        <>
                          <div className={`nav-item group ${activeTab === 'svc' && isCurrentProject && currentServiceId === null ? 'active' : ''}`}
                            onClick={() => toggleGroup(p.id, 'svc')}>
                            <span className="expand-icon">{gExpanded ? <DownOutlined /> : <RightOutlined />}</span><ProfileOutlined className="nav-icon" />服务单管理
                          </div>
                          {gExpanded && isCurrentProject && svcItems.map((s: any) => (
                            <div key={s.id} className={`nav-item item ${currentServiceId === s.id ? 'active' : ''}`}
                              onClick={() => navToService(s.id)}>
                              {s.name}
                            </div>
                          ))}
                        </>
                      );
                    })()}
                    {/* 申报单管理 */}
                    {(() => {
                      const key = `${p.id}-dec`;
                      const gExpanded = expandedGroups[key] !== false;
                      return (
                        <>
                          <div className={`nav-item group ${activeTab === 'dec' && isCurrentProject && currentDeclareId === null ? 'active' : ''}`}
                            onClick={() => toggleGroup(p.id, 'dec')}>
                            <span className="expand-icon">{gExpanded ? <DownOutlined /> : <RightOutlined />}</span><FileDoneOutlined className="nav-icon" />申报单管理
                          </div>
                          {gExpanded && isCurrentProject && decItems.map((d: any) => (
                            <div key={d.id} className={`nav-item item ${currentDeclareId === d.id ? 'active' : ''}`}
                              onClick={() => navToDeclare(d.id)}>
                              {d.name}
                            </div>
                          ))}
                        </>
                      );
                    })()}
                    {/* 验收单管理 */}
                    {(() => {
                      const key = `${p.id}-acc`;
                      const gExpanded = expandedGroups[key] !== false;
                      return (
                        <>
                          <div className={`nav-item group ${activeTab === 'acc' && isCurrentProject && currentAcceptId === null ? 'active' : ''}`}
                            onClick={() => toggleGroup(p.id, 'acc')}>
                            <span className="expand-icon">{gExpanded ? <DownOutlined /> : <RightOutlined />}</span><AuditOutlined className="nav-icon" />验收单管理
                          </div>
                          {gExpanded && isCurrentProject && accItems.map((a: any) => (
                            <div key={a.id} className={`nav-item item ${currentAcceptId === a.id ? 'active' : ''}`}
                              onClick={() => navToAccept(a.id)}>
                              {a.name}
                            </div>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
        <div className="sidebar-account">
          <div className="sidebar-account-name">{profile?.display_name || profile?.email || '当前用户'}</div>
          <div className="sidebar-account-meta">{profile?.team?.name || '全局管理'} · {profile?.role === 'super_admin' ? '超级管理员' : profile?.role === 'team_admin' ? '团队管理员' : '普通成员'}</div>
          <Button type="text" size="small" icon={<LogoutOutlined />} onClick={() => signOut()}>退出登录</Button>
        </div>
      </nav>

      {/* ========== MAIN CONTENT ========== */}
      <main id="main-content" className="main-content" tabIndex={-1}>
        <Suspense fallback={<div className="route-loading" role="status">页面加载中...</div>}>
          <Routes>
            <Route path="/catalog" element={<CatalogPage />} />
            <Route path="/" element={<ProjectListPage onRefresh={refreshProjects} />} />
            <Route path="/project/:id" element={<ProjectDetailPage onRefreshSubItems={refreshSubItems} />} />
            <Route path="/project/:projectId/svc-mgmt" element={<SvcMgmtPage onRefreshSubItems={refreshSubItems} />} />
            <Route path="/project/:projectId/dec-mgmt" element={<DecMgmtPage onRefreshSubItems={refreshSubItems} />} />
            <Route path="/project/:projectId/acc-mgmt" element={<AccMgmtPage onRefreshSubItems={refreshSubItems} />} />
            <Route path="/service/:id" element={<ServiceDetailPage />} />
            <Route path="/declare/:id" element={<DeclareDetailPage />} />
            <Route path="/accept/:id" element={<AcceptDetailPage />} />
            <Route path="/admin/access" element={<AccessAdminPage />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

export default function App() {
  const { session, profile, loading, profileError, signOut, refreshProfile } = useAuth();

  if (loading) {
    return <div className="auth-state-page"><Spin size="large" /><span>正在验证登录状态...</span></div>;
  }
  if (!session) return <LoginPage />;
  const teamDisabled = profile?.role !== 'super_admin' && profile?.team?.active === false;
  if (!profile || !profile.active || teamDisabled) {
    return (
      <div className="auth-state-page">
        <section className="auth-state-panel">
          <SafetyCertificateOutlined className="auth-state-icon" />
          <h1>{teamDisabled ? '所属团队已停用' : profile ? '账号尚未启用' : '账号尚未配置权限'}</h1>
          <p>{profileError || (teamDisabled ? '请联系超级管理员重新启用团队。' : '请联系超级管理员分配所属团队、角色并启用账号。')}</p>
          <div className="auth-state-actions">
            <Button type="primary" onClick={refreshProfile}>重新检查</Button>
            <Button onClick={() => signOut()}>退出登录</Button>
          </div>
        </section>
      </div>
    );
  }
  return <AuthenticatedApp />;
}
