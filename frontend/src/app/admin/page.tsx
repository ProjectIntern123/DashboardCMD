'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { 
  FaPaintBrush, 
  FaUsers, 
  FaShieldAlt, 
  FaEnvelope, 
  FaSun, 
  FaMoon, 
  FaBars, 
  FaSignOutAlt, 
  FaChevronLeft, 
  FaChevronRight,
  FaKey,
  FaCheck,
  FaTimes,
  FaSpinner,
  FaEye,
  FaLock,
  FaServer,
  FaUserShield,
  FaTools,
  FaRegPaperPlane,
  FaChartPie,
  FaHistory,
  FaSearch,
  FaFilter,
  FaClock,
  FaLaptop,
  FaUser,
  FaCircle,
  FaDatabase
} from 'react-icons/fa';

const getInitials = (name: string) => {
  if (!name) return 'AD';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].substring(0, 2).toUpperCase();
};

const format12Hour = (dateStr: string | null | undefined) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; 
  const minStr = minutes < 10 ? '0' + minutes : minutes;
  
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  
  return `${day} ${month} ${year}, ${hours}:${minStr} ${ampm}`;
};

export default function AdminConsolePage() {
  const router = useRouter();

  // Navigation state
  const [activeTab, setActiveTab] = useState<'dashboard' | 'branding' | 'users' | 'roles' | 'smtp' | 'sessions'>('dashboard');
  const [subBrandingTab, setSubBrandingTab] = useState<'dashboard' | 'login' | 'pwa'>('dashboard');
  const [loading, setLoading] = useState(true);
  const [adminUser, setAdminUser] = useState<any>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Stats and session logs state
  const [stats, setStats] = useState<any>({
    totalUsers: 0,
    activeUsers: 0,
    usersWithStatus: [],
    latestLogs: []
  });
  const [sessionLogs, setSessionLogs] = useState<any[]>([]);
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionFilter, setSessionFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [dashboardFilter, setDashboardFilter] = useState<'online' | 'offline'>('online');

  // Audit activities states
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditTabSubMode, setAuditTabSubMode] = useState<'sessions' | 'activities'>('sessions');

  // Dashboard Stats Modal states
  const [showDashboardModal, setShowDashboardModal] = useState(false);
  const [dashboardModalType, setDashboardModalType] = useState<'all' | 'online' | 'offline'>('all');
  const [selectedDashboardUser, setSelectedDashboardUser] = useState<any>(null);

  // Buffered permissions for Save button boundary
  const [tempPermissionIds, setTempPermissionIds] = useState<string[]>([]);

  // Detailed popups for Session and Audit log lists
  const [selectedSessionLog, setSelectedSessionLog] = useState<any>(null);
  const [selectedAuditLog, setSelectedAuditLog] = useState<any>(null);
  const [showRolePermissionsModal, setShowRolePermissionsModal] = useState(false);

  // Profile menu states
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  // Unified configurations state (branding + smtp)
  const [branding, setBranding] = useState<any>({
    app_logo: '🏢',
    app_name: 'HARTEK CMD Office',
    app_subtitle: 'Operations Command Center v3',
    primary_color: '#0f2a4a',
    accent_color: '#ef9f27',
    admin_logo: '🛡️',
    admin_name: 'HARTEK Admin Console',
    admin_subtitle: 'System Control Center',
    admin_primary_color: '#0f172a',
    admin_accent_color: '#3b82f6',
    login_heading: 'HARTEK Group',
    login_subtitle: 'CMD Office Command Center',
    login_bg: 'linear-gradient(135deg, #0F2A4A 0%, #1a3a60 100%)',
    login_logo: '🏢',
    login_bg_image: '',
    login_bg_type: 'gradient',
    login_bg_color: '#0f2a4a',
    login_bg_gradient: 'linear-gradient(135deg, #0F2A4A 0%, #1a3a60 100%)',
    login_bg_image_url: '',
    apply_branding_to_admin: 'false',
    login_container_pos: 'center',
    login_container_opacity: '100',
    app_header_height: '65px',
    app_logo_width: '40px',
    app_logo_spacing: '10px',
    admin_header_height: '65px',
    admin_logo_width: '40px',
    admin_logo_spacing: '10px',
    // SMTP default configurations
    smtp_sender_name: 'HARTEK CMD Office',
    smtp_sender_email: 'no-reply@hartek.com',
    smtp_username: '',
    smtp_password: '',
    smtp_host: 'smtp.office365.com',
    smtp_port: '587',
    smtp_encryption: 'STARTTLS',
  });

  // User Management state
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [userForm, setUserForm] = useState({
    id: '',
    email: '',
    name: '',
    password: '',
    roleId: '',
    managerId: '',
    active: true,
  });

  // Role Management state
  const [selectedRole, setSelectedRole] = useState<any>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [roleForm, setRoleForm] = useState({
    id: '',
    name: '',
  });

  // SMTP test state
  const [testingConnection, setTestingConnection] = useState(false);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');

  // Feedback notifications
  const [toast, setToast] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);
  const [showLogoutConfirmModal, setShowLogoutConfirmModal] = useState(false);

  const showToast = (text: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    checkAdminAuth();
  }, []);

  const checkAdminAuth = async () => {
    try {
      const me = await api.get('/auth/me');
      if (me.role !== 'Admin') {
        router.push('/');
        return;
      }
      setAdminUser(me);
      await loadAdminData();
    } catch (e) {
      router.push('/login');
    }
  };

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [brandData, userData, roleData, permData, statsData, logsData, auditData] = await Promise.all([
        api.get('/settings'),
        api.get('/users'),
        api.get('/roles'),
        api.get('/roles/permissions'),
        api.get('/users/stats').catch(() => null),
        api.get('/users/sessions').catch(() => null),
        api.get('/audit-logs').catch(() => null),
      ]);

      setBranding((prev: any) => ({ ...prev, ...brandData }));
      setUsers(userData);
      setRoles(roleData);
      setPermissions(permData);
      
      if (statsData) {
        setStats(statsData);
      }
      if (logsData) {
        setSessionLogs(logsData);
      }
      if (auditData && auditData.logs) {
        setAuditLogs(auditData.logs);
      }

      if (roleData.length > 0) {
        setSelectedRole(roleData[0]);
      }
    } catch (e) {
      showToast('Error loading application settings data', 'err');
      handleLogout();
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {}
    router.push('/login');
  };

  const handleBrandingSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put('/settings', branding);
      showToast('Branding and SMTP configurations saved successfully');
    } catch (err) {
      showToast('Failed to save settings modifications', 'err');
    }
  };

  const handleLoginBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setBranding((prev: any) => ({ ...prev, login_bg_image: reader.result }));
        showToast('Login background image loaded in preview');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleLoginLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setBranding((prev: any) => ({ ...prev, login_logo: reader.result }));
        showToast('Login logo loaded in preview');
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePwaIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setBranding((prev: any) => ({ ...prev, pwa_icon: reader.result, pwa_icon_type: 'upload' }));
        showToast('Custom PWA icon loaded into preview');
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (selectedRole && selectedRole.permissions) {
      setTempPermissionIds(selectedRole.permissions.map((rp: any) => rp.permissionId));
    } else {
      setTempPermissionIds([]);
    }
  }, [selectedRole]);

  useEffect(() => {
    if (branding) {
      if (branding.primary_color) {
        document.documentElement.style.setProperty('--navy', branding.primary_color);
      }
      if (branding.accent_color) {
        document.documentElement.style.setProperty('--accent', branding.accent_color);
      }
    }
  }, [branding]);

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...userForm };
      
      // Frontend validation safeguards
      if (payload.id && adminUser && payload.id === adminUser.id) {
        if (payload.active === false) {
          showToast('You cannot deactivate your own logged-in user account.', 'err');
          return;
        }
        
        // Check if role changed from admin to non-admin
        const selectedRoleObj = roles.find(r => r.id === payload.roleId);
        const willBeAdmin = selectedRoleObj?.name === 'Admin';
        const wasAdmin = adminUser.role === 'Admin';
        if (wasAdmin && !willBeAdmin) {
          showToast('You cannot change your own role to a non-administrator role.', 'err');
          return;
        }
      }

      if (!payload.managerId) {
        delete (payload as any).managerId;
      }
      if (payload.id) {
        await api.put(`/users/${payload.id}`, payload);
        showToast('User roster record updated');
      } else {
        await api.post('/users', payload);
        showToast('New user profile provisioned');
      }
      setShowUserModal(false);
      loadAdminData();
    } catch (err: any) {
      showToast(err.message || 'Error saving user record', 'err');
    }
  };

  const handleUserDelete = async (id: string) => {
    if (!confirm('Are you sure you want to disable/soft-delete this user?')) return;
    try {
      await api.delete(`/users/${id}`);
      showToast('User roster record disabled');
      loadAdminData();
    } catch (e) {
      showToast('Error deleting user profile', 'err');
    }
  };

  const handleDashboardStatClick = (type: 'all' | 'online' | 'offline') => {
    setDashboardModalType(type);
    setSelectedDashboardUser(null);
    setShowDashboardModal(true);
  };

  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (roleForm.id) {
        const updated = await api.put(`/roles/${roleForm.id}`, roleForm);
        showToast('Role saved');
      } else {
        const created = await api.post('/roles', { name: roleForm.name, permissionIds: [] });
        setSelectedRole(created);
        showToast('Custom role created successfully');
      }
      setShowRoleModal(false);
      loadAdminData();
    } catch (e) {
      showToast('Error saving role details', 'err');
    }
  };

  const handleRoleDelete = async (rId: string) => {
    if (!confirm('Are you sure you want to delete this role? All linked users will lose their role.')) return;
    try {
      await api.delete(`/roles/${rId}`);
      showToast('Role deleted successfully');
      setSelectedRole(null);
      loadAdminData();
    } catch (e) {
      showToast('Error deleting role', 'err');
    }
  };

  const handleAccessLevelChange = (res: string, level: 'Full Access' | 'Read Only' | 'Hidden') => {
    if (!selectedRole) return;

    // Get all permission objects matching this resource
    const resourcePermissions = permissions.filter(p => p.resource === res);
    const viewPerm = resourcePermissions.find(p => p.action === 'View');
    const resourcePermIds = resourcePermissions.map(p => p.id);

    let nextIds = tempPermissionIds.filter((pid: any) => !resourcePermIds.includes(pid));

    if (level === 'Full Access') {
      // Add all permissions for this resource
      nextIds.push(...resourcePermIds);
    } else if (level === 'Read Only') {
      // Add only View permission
      if (viewPerm) {
        nextIds.push(viewPerm.id);
      }
    }

    setTempPermissionIds(nextIds);
  };

  const handleSaveAccessControls = async () => {
    if (!selectedRole) return;
    try {
      const updated = await api.put(`/roles/${selectedRole.id}`, {
        name: selectedRole.name,
        permissionIds: tempPermissionIds,
      });
      setRoles(prev => prev.map(r => (r.id === selectedRole.id ? updated : r)));
      setSelectedRole(updated);
      showToast(`Access configuration boundaries saved for ${selectedRole.name}`);
    } catch (e) {
      showToast('Error saving role permissions configuration', 'err');
    }
  };

  const getTabAccessLevel = (resource: string) => {
    if (!selectedRole) return 'Hidden';
    const resourcePermissions = permissions.filter(p => p.resource === resource);
    const viewPerm = resourcePermissions.find(p => p.action === 'View');
    const createPerm = resourcePermissions.find(p => p.action === 'Create');

    const hasView = viewPerm && tempPermissionIds.includes(viewPerm.id);
    const hasCreate = createPerm && tempPermissionIds.includes(createPerm.id);

    if (!hasView) return 'Hidden';
    if (hasView && !hasCreate) return 'Read Only';
    return 'Full Access';
  };



  const handleTestSmtpConnection = async () => {
    setTestingConnection(true);
    try {
      const res = await api.post('/settings/smtp/test', branding);
      if (res.success) {
        showToast(res.message);
      } else {
        showToast(res.message, 'err');
      }
    } catch (err: any) {
      showToast(err.message || 'SMTP Handshake verification failed', 'err');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailRecipient) {
      showToast('Please enter a recipient email address', 'err');
      return;
    }
    setSendingTestEmail(true);
    try {
      const res = await api.post('/settings/smtp/test-email', { ...branding, to: testEmailRecipient });
      if (res.success) {
        showToast(res.message);
      } else {
        showToast(res.message, 'err');
      }
    } catch (err: any) {
      showToast(err.message || 'SMTP Send email test failed', 'err');
    } finally {
      setSendingTestEmail(false);
    }
  };

  const toggleTheme = async () => {
    const isCurrentlyDark = branding.admin_theme_mode === 'dark';
    const newTheme = isCurrentlyDark ? 'light' : 'dark';
    const updated = { ...branding, admin_theme_mode: newTheme };
    setBranding(updated);
    try {
      await api.put('/settings', updated);
      showToast(`Admin theme set to ${newTheme} mode`);
    } catch (e) {
      showToast('Failed to save theme setting', 'err');
    }
  };

  if (loading || !adminUser) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f3f4f6', color: '#1e293b', fontFamily: 'sans-serif' }}>
        <h3>Loading Admin Console Stream...</h3>
      </div>
    );
  }

  const dashboardTabsConfig = [
    { label: '📊 Overview Dashboard', resource: 'Dashboard' },
    { label: '🚧 Projects Tab', resource: 'Projects' },
    { label: '📅 Calendar Tab', resource: 'Calendar' },
    { label: '📌 Assigned by CMD Tab', resource: 'Tasks' },
    { label: '⚡ Actions Tab', resource: 'Actions' },
    { label: '⚠️ Escalations Tab', resource: 'Escalations' },
    { label: '📞 Followups Tab', resource: 'Followups' },
    { label: '⚖️ Legal MIS Tab', resource: 'Legal' },
    { label: '🗒️ Notepad Tab', resource: 'Notepad' },
    { label: '🛡️ Audit Logs Tab (Admin)', resource: 'AdminControl' },
  ];

  const isDark = branding.admin_theme_mode === 'dark';

  const applyBrandingToAdmin = branding.apply_branding_to_admin === 'true';

  const resolvedAdminLogo = branding.app_logo !== undefined && branding.app_logo !== null ? branding.app_logo : '🛡️';

  const resolvedAdminName = branding.app_name !== undefined && branding.app_name !== null ? branding.app_name : 'HARTEK CMD Office';

  const resolvedAdminSubtitle = branding.app_subtitle !== undefined && branding.app_subtitle !== null ? branding.app_subtitle : 'Operations Command Center v3';

  return (
    <div className={isDark ? 'dark' : ''} style={{ minHeight: '100vh', background: isDark ? '#0f172a' : '#f8fafc', color: isDark ? '#f1f5f9' : '#0f172a', fontFamily: 'sans-serif', transition: 'all 0.3s', display: 'flex', flexDirection: 'column' }}>
      {/* Toast popup */}
      {toast && (
        <div 
          style={{ 
            position: 'fixed', 
            top: '20px', 
            right: '20px', 
            background: toast.type === 'err' ? '#ef4444' : '#10b981', 
            color: '#fff', 
            padding: '12px 24px', 
            borderRadius: '8px', 
            boxShadow: '0 10px 25px rgba(0,0,0,0.1)', 
            zIndex: 99999,
            fontWeight: 600,
            fontSize: '13px'
          }}
        >
          {toast.text}
        </div>
      )}

      {/* TOP HEADER */}
      <header className="topbar" style={{ height: '56px', flexShrink: 0, position: 'sticky', top: 0, zIndex: 100 }}>
        <div className="topbar-inner" style={{ height: '100%' }}>
          <div className="tb-left" style={{ gap: 'var(--logo-spacing, 14px)', display: 'flex', alignItems: 'center' }}>
            <button className="hamburger-btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} title="Toggle Navigation Menu" style={{ background: 'none', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ☰
            </button>
            <div className="logo" style={{ width: 'auto', maxWidth: '150px', height: '36px', background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {resolvedAdminLogo && (resolvedAdminLogo.startsWith('data:') || resolvedAdminLogo.startsWith('http')) ? (
                <img src={resolvedAdminLogo} alt="Logo" style={{ width: 'auto', height: '100%', maxHeight: '36px', objectFit: 'contain' }} />
              ) : (
                resolvedAdminLogo || '🛡️'
              )}
            </div>
            {!sidebarCollapsed && (resolvedAdminName || resolvedAdminSubtitle) && (
              <div>
                {resolvedAdminName && <div className="brand">{resolvedAdminName}</div>}
                {resolvedAdminSubtitle && <div className="brand-sub">{resolvedAdminSubtitle}</div>}
              </div>
            )}
          </div>

          <div className="tb-right" style={{ position: 'relative' }}>
            {/* DARK / LIGHT THEME TOGGLE BUTTON */}
            <button 
              onClick={toggleTheme} 
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#fff',
                fontSize: '14px',
                transition: 'all 0.2s'
              }}
            >
              {isDark ? <FaSun style={{ color: '#fbbf24' }} /> : <FaMoon />}
            </button>

            {/* ACTIVE USER PILL */}
            <div 
              className="user-pill" 
              onClick={() => setShowProfileDropdown(!showProfileDropdown)} 
              title="Click to view profile"
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: branding.accent_color || 'var(--accent, #ef9f27)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '13px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}
            >
              <div className="user-av">
                {adminUser ? (adminUser.initials || getInitials(adminUser.name)) : 'AD'}
              </div>
            </div>

            {/* USER PROFILE DROPDOWN */}
            {showProfileDropdown && (
              <>
                <div 
                  style={{ position: 'fixed', inset: 0, zIndex: 199 }} 
                  onClick={() => setShowProfileDropdown(false)} 
                />
                <div 
                  style={{
                    position: 'absolute',
                    top: '48px',
                    right: '0',
                    width: '280px',
                    background: isDark ? '#1e293b' : '#fff',
                    border: isDark ? '1px solid #334155' : '1px solid var(--border)',
                    borderRadius: '12px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                    zIndex: 200,
                    padding: '16px',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    color: isDark ? '#f1f5f9' : '#1e293b'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: isDark ? '#3b82f6' : 'var(--navy)' }}>{adminUser?.name}</div>
                    <div style={{ fontSize: '11px', color: isDark ? '#94a3b8' : 'var(--muted)', marginTop: '2px', wordBreak: 'break-all' }}>{adminUser?.email}</div>
                  </div>
                  <hr style={{ border: 0, borderTop: isDark ? '1px solid #334155' : '1px solid #e2e8f0', margin: 0 }} />
                  <button 
                    className="btn-add" 
                    style={{ width: '100%', background: '#b91c1c', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, textAlign: 'center' }}
                    onClick={() => {
                      setShowProfileDropdown(false);
                      handleLogout();
                    }}
                  >
                    🚪 Logout Session
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER (Sticky sidebar layout) */}
      <div style={{ display: 'flex', flex: 1, width: '100%', height: 'calc(100vh - 56px)', overflow: 'hidden', alignItems: 'stretch' }}>
        {/* SIDEBAR TABS (Collapsible, scrollable, sticky) */}
        <aside 
          style={{ 
            width: sidebarCollapsed ? '75px' : '260px', 
            flexShrink: 0, 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'space-between',
            background: isDark ? '#111827' : '#fff',
            borderRight: isDark ? '1px solid #1f2937' : '1px solid #e5e7eb',
            padding: sidebarCollapsed ? '16px 8px' : '20px 16px',
            height: '100%',
            overflow: 'hidden',
            transition: 'all 0.3s ease',
            zIndex: 10
          }}
        >
          {/* Sidebar Collapse Toggle Button (Fixed at top) */}
          <div style={{ flexShrink: 0, marginBottom: '12px' }}>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: sidebarCollapsed ? 'center' : 'space-between',
                padding: '10px 16px',
                borderRadius: '8px',
                border: 'none',
                background: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
                color: isDark ? '#cbd5e1' : '#475569',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                width: '100%',
                transition: 'all 0.2s'
              }}
            >
              {sidebarCollapsed ? (
                <FaChevronRight style={{ fontSize: '14px' }} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FaBars />
                    <span>Navigation Menu</span>
                  </span>
                  <FaChevronLeft style={{ fontSize: '12px' }} />
                </div>
              )}
            </button>
          </div>

          {/* Scrollable Tab Items list */}
          <div className="sidebar-scroll" style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto', paddingBottom: '16px' }}>
            <button 
              className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`} 
              onClick={() => setActiveTab('dashboard')}
              title="Overview Dashboard"
              style={{ 
                display: 'flex',
                alignItems: 'center',
                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                gap: sidebarCollapsed ? '0' : '12px',
                padding: '12px 16px', 
                borderRadius: '8px', 
                border: 'none', 
                cursor: 'pointer', 
                fontSize: '14px', 
                fontWeight: 600, 
                background: activeTab === 'dashboard' ? (isDark ? '#3b82f6' : (branding.primary_color || 'var(--navy)')) : 'transparent', 
                color: activeTab === 'dashboard' ? '#fff' : (isDark ? '#9ca3af' : '#4b5563'), 
                transition: 'all 0.2s',
                width: '100%'
              }}
            >
              <FaChartPie style={{ fontSize: '16px', flexShrink: 0 }} />
              {!sidebarCollapsed && <span>Dashboard Overview</span>}
            </button>

            <button 
              className={`tab ${activeTab === 'branding' ? 'active' : ''}`} 
              onClick={() => setActiveTab('branding')}
              title="Branding Configuration"
              style={{ 
                display: 'flex',
                alignItems: 'center',
                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                gap: sidebarCollapsed ? '0' : '12px',
                padding: '12px 16px', 
                borderRadius: '8px', 
                border: 'none', 
                cursor: 'pointer', 
                fontSize: '14px', 
                fontWeight: 600, 
                background: activeTab === 'branding' ? (isDark ? '#3b82f6' : (branding.primary_color || 'var(--navy)')) : 'transparent', 
                color: activeTab === 'branding' ? '#fff' : (isDark ? '#9ca3af' : '#4b5563'), 
                transition: 'all 0.2s',
                width: '100%'
              }}
            >
              <FaPaintBrush style={{ fontSize: '16px', flexShrink: 0 }} />
              {!sidebarCollapsed && <span>Branding & Customization</span>}
            </button>

            <button 
              className={`tab ${activeTab === 'users' ? 'active' : ''}`} 
              onClick={() => setActiveTab('users')}
              title="User Management"
              style={{ 
                display: 'flex',
                alignItems: 'center',
                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                gap: sidebarCollapsed ? '0' : '12px',
                padding: '12px 16px', 
                borderRadius: '8px', 
                border: 'none', 
                cursor: 'pointer', 
                fontSize: '14px', 
                fontWeight: 600, 
                background: activeTab === 'users' ? (isDark ? '#3b82f6' : (branding.primary_color || 'var(--navy)')) : 'transparent', 
                color: activeTab === 'users' ? '#fff' : (isDark ? '#9ca3af' : '#4b5563'), 
                transition: 'all 0.2s',
                width: '100%'
              }}
            >
              <FaUsers style={{ fontSize: '16px', flexShrink: 0 }} />
              {!sidebarCollapsed && <span>User Account Directory</span>}
            </button>

            <button 
              className={`tab ${activeTab === 'roles' ? 'active' : ''}`} 
              onClick={() => setActiveTab('roles')}
              title="Access Control Rules"
              style={{ 
                display: 'flex',
                alignItems: 'center',
                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                gap: sidebarCollapsed ? '0' : '12px',
                padding: '12px 16px', 
                borderRadius: '8px', 
                border: 'none', 
                cursor: 'pointer', 
                fontSize: '14px', 
                fontWeight: 600, 
                background: activeTab === 'roles' ? (isDark ? '#3b82f6' : (branding.primary_color || 'var(--navy)')) : 'transparent', 
                color: activeTab === 'roles' ? '#fff' : (isDark ? '#9ca3af' : '#4b5563'), 
                transition: 'all 0.2s',
                width: '100%'
              }}
            >
              <FaShieldAlt style={{ fontSize: '16px', flexShrink: 0 }} />
              {!sidebarCollapsed && <span>Role & Access Controls</span>}
            </button>

            <button 
              className={`tab ${activeTab === 'smtp' ? 'active' : ''}`} 
              onClick={() => setActiveTab('smtp')}
              title="SMTP Config Setup"
              style={{ 
                display: 'flex',
                alignItems: 'center',
                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                gap: sidebarCollapsed ? '0' : '12px',
                padding: '12px 16px', 
                borderRadius: '8px', 
                border: 'none', 
                cursor: 'pointer', 
                fontSize: '14px', 
                fontWeight: 600, 
                background: activeTab === 'smtp' ? (isDark ? '#3b82f6' : (branding.primary_color || 'var(--navy)')) : 'transparent', 
                color: activeTab === 'smtp' ? '#fff' : (isDark ? '#9ca3af' : '#4b5563'), 
                transition: 'all 0.2s',
                width: '100%'
              }}
            >
              <FaEnvelope style={{ fontSize: '16px', flexShrink: 0 }} />
              {!sidebarCollapsed && <span>SMTP Mail Gateway</span>}
            </button>

            <button 
              className={`tab ${activeTab === 'sessions' ? 'active' : ''}`} 
              onClick={() => setActiveTab('sessions')}
              title="User Sessions & Activities Audit Logs"
              style={{ 
                display: 'flex',
                alignItems: 'center',
                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                gap: sidebarCollapsed ? '0' : '12px',
                padding: '12px 16px', 
                borderRadius: '8px', 
                border: 'none', 
                cursor: 'pointer', 
                fontSize: '14px', 
                fontWeight: 600, 
                background: activeTab === 'sessions' ? (isDark ? '#3b82f6' : (branding.primary_color || 'var(--navy)')) : 'transparent', 
                color: activeTab === 'sessions' ? '#fff' : (isDark ? '#9ca3af' : '#4b5563'), 
                transition: 'all 0.2s',
                width: '100%'
              }}
            >
              <FaHistory style={{ fontSize: '16px', flexShrink: 0 }} />
              {!sidebarCollapsed && <span>Security Audit Logs</span>}
            </button>
          </div>

          {/* BOTTOM LOGOUT BUTTON (Pinned strictly at sidebar bottom) */}
          <div style={{ 
            borderTop: isDark ? '1px solid #1f2937' : '1px solid #e5e7eb', 
            paddingTop: '16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch'
          }}>
            <button 
              onClick={() => setShowLogoutConfirmModal(true)}
              title="Logout Session"
              className="tab admin-logout-tab-btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                gap: sidebarCollapsed ? '0' : '12px',
                padding: '12px 16px', 
                borderRadius: '8px', 
                border: 'none', 
                cursor: 'pointer', 
                fontSize: '14px', 
                fontWeight: 600, 
                background: 'transparent',
                color: '#ef4444',
                transition: 'all 0.2s',
                width: '100%'
              }}
            >
              <FaSignOutAlt style={{ fontSize: '16px', flexShrink: 0 }} />
              {!sidebarCollapsed && <span>Logout</span>}
            </button>
          </div>
        </aside>

        {/* WORKSPACE CONTENT PANELS (Natural window scrolling wrapper) */}
        <main 
          style={{ 
            flex: 1, 
            background: isDark ? '#0f172a' : '#f8fafc', 
            padding: '24px 32px',
            minWidth: 0,
            height: '100%',
            overflowY: 'auto'
          }}
        >
          <div
            className="admin-card admin-animate-fade-in"
            style={{
              minWidth: 0,
              transition: 'all 0.3s'
            }}
          >
          
          {/* TAB 0: DASHBOARD OVERVIEW */}
          {activeTab === 'dashboard' && (
            <div>
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: isDark ? '#3b82f6' : 'var(--navy)' }}>System Administration Dashboard</h2>
                <p style={{ fontSize: '13px', color: isDark ? '#94a3b8' : '#64748b', margin: '4px 0 0 0' }}>Real-time telemetry, session connections, and user login activity.</p>
              </div>

              {/* Statistics Metric Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div 
                  onClick={() => handleDashboardStatClick('all')}
                  className="admin-card admin-card-interactive"
                  style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '20px' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Accounts</div>
                    <div className="admin-stat-icon-wrapper" style={{ color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)' }}><FaUsers /></div>
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px', color: isDark ? '#3b82f6' : 'var(--navy)' }}>{stats.totalUsers}</div>
                  <div style={{ fontSize: '11px', color: '#10b981', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <FaCircle style={{ fontSize: '8px' }} /> Active staff roster profiles
                  </div>
                </div>

                <div 
                  onClick={() => handleDashboardStatClick('online')}
                  className="admin-card admin-card-interactive"
                  style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '20px' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active/Online Sessions</div>
                    <div className="admin-stat-icon-wrapper" style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.1)' }}><FaLaptop /></div>
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px', color: '#10b981' }}>{stats.activeUsers}</div>
                  <div style={{ fontSize: '11px', color: '#10b981', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }} />
                    Users currently connected
                  </div>
                </div>

                <div 
                  onClick={() => handleDashboardStatClick('offline')}
                  className="admin-card admin-card-interactive"
                  style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '20px' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Offline Users</div>
                    <div className="admin-stat-icon-wrapper" style={{ color: '#94a3b8', background: 'rgba(148, 163, 184, 0.1)' }}><FaUserShield /></div>
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px', color: '#94a3b8' }}>{Math.max(0, stats.totalUsers - stats.activeUsers)}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <FaCircle style={{ fontSize: '8px' }} /> Accounts currently signed out
                  </div>
                </div>
              </div>

              {/* Main dashboard columns layout (based on 2nd image UI concept) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                
                {/* Left Column: Team Status Directory */}
                <div style={{ background: isDark ? '#1e293b' : '#fff', border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: isDark ? '1px solid #334155' : '1px solid #f1f5f9', paddingBottom: '12px', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: isDark ? '#3b82f6' : 'var(--navy)' }}>Real-Time Staff Directory</h3>
                    
                    {/* Status filter pills */}
                    <div style={{ display: 'flex', gap: '4px', background: isDark ? '#0f172a' : '#f1f5f9', padding: '2px', borderRadius: '6px' }}>
                      <button type="button" onClick={() => setDashboardFilter('online')} style={{ padding: '4px 8px', border: 'none', background: dashboardFilter === 'online' ? '#10b981' : 'transparent', color: dashboardFilter === 'online' ? '#fff' : '#64748b', fontSize: '11px', fontWeight: 600, borderRadius: '4px', cursor: 'pointer' }}>Online</button>
                      <button type="button" onClick={() => setDashboardFilter('offline')} style={{ padding: '4px 8px', border: 'none', background: dashboardFilter === 'offline' ? '#64748b' : 'transparent', color: dashboardFilter === 'offline' ? '#fff' : '#64748b', fontSize: '11px', fontWeight: 600, borderRadius: '4px', cursor: 'pointer' }}>Offline</button>
                    </div>
                  </div>

                  {/* Search Bar for Staff Directory */}
                  <div style={{ position: 'relative', marginBottom: '16px' }}>
                    <FaSearch style={{ position: 'absolute', left: '12px', top: '12px', color: isDark ? '#475569' : '#94a3b8' }} />
                    <input 
                      type="text" 
                      placeholder="Search active staff profile..." 
                      value={dashboardSearch}
                      onChange={e => setDashboardSearch(e.target.value)}
                      style={{ width: '100%', padding: '10px 10px 10px 36px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }}
                    />
                  </div>

                  {/* Users status list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '260px', overflowY: 'auto', paddingRight: '4px' }}>
                    {stats.usersWithStatus
                      ?.filter((u: any) => {
                        const matchesSearch = u.name.toLowerCase().includes(dashboardSearch.toLowerCase()) || u.email.toLowerCase().includes(dashboardSearch.toLowerCase());
                        if (dashboardFilter === 'online') return matchesSearch && u.isLoggedIn;
                        if (dashboardFilter === 'offline') return matchesSearch && !u.isLoggedIn;
                        return matchesSearch;
                      })
                      .map((u: any) => (
                        <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '8px', background: isDark ? '#0f172a' : '#f8fafc', border: isDark ? '1px solid #334155' : '1px solid #f1f5f9' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: isDark ? '#334155' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: isDark ? '#fff' : '#475569' }}>
                              {u.initials || getInitials(u.name)}
                            </div>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: isDark ? '#f1f5f9' : '#1e293b' }}>{u.name}</div>
                              <span style={{ fontSize: '10px', color: isDark ? '#cbd5e1' : '#64748b', background: isDark ? '#1e293b' : '#e2e8f0', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '2px' }}>{u.roleName}</span>
                            </div>
                          </div>

                          {/* Green / grey dot + tag */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FaCircle style={{ color: u.isLoggedIn ? '#10b981' : '#94a3b8', fontSize: '9px' }} />
                            <span style={{ fontSize: '11px', fontWeight: 600, color: u.isLoggedIn ? '#10b981' : '#64748b', background: u.isLoggedIn ? 'rgba(16,185,129,0.1)' : 'rgba(148,163,184,0.1)', padding: '4px 8px', borderRadius: '12px' }}>
                              {u.isLoggedIn ? 'Active' : 'Offline'}
                            </span>
                          </div>
                        </div>
                      ))}
                    {(!stats.usersWithStatus || stats.usersWithStatus.length === 0) && (
                      <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '13px' }}>No staff profiles found.</div>
                    )}
                  </div>
                </div>

                {/* Right Column: Recent Session Timings (top 3 or 4 sessions) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ background: isDark ? '#1e293b' : '#fff', border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                    <div style={{ borderBottom: isDark ? '1px solid #334155' : '1px solid #f1f5f9', paddingBottom: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: isDark ? '#3b82f6' : 'var(--navy)' }}>Recent Sessions</h3>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>Latest active timings</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '260px', overflowY: 'auto', paddingRight: '4px' }}>
                      {stats.latestLogs?.slice(0, 4).map((log: any) => (
                        <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', background: isDark ? '#0f172a' : '#f8fafc', border: isDark ? '1px solid #334155' : '1px solid #f1f5f9' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: log.logoutTime ? '#fef3c7' : '#dcfce7', color: log.logoutTime ? '#d97706' : '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', flexShrink: 0 }}>
                            <FaLaptop />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '12px', fontWeight: 700, color: isDark ? '#f1f5f9' : '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.userName}</span>
                              <span style={{ fontSize: '9px', color: isDark ? '#94a3b8' : '#64748b' }}>{format12Hour(log.loginTime).split(', ')[1]}</span>
                            </div>
                            <div style={{ fontSize: '10px', color: isDark ? '#94a3b8' : '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>{log.userEmail}</div>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '10px' }}>
                              <span style={{ color: isDark ? '#cbd5e1' : '#475569' }}>
                                🟢 IN: {format12Hour(log.loginTime).split(', ')[1]}
                              </span>
                              <span style={{ color: log.logoutTime ? '#f59e0b' : '#10b981', fontWeight: 600 }}>
                                {log.logoutTime ? `🔴 OUT: ${format12Hour(log.logoutTime).split(', ')[1]}` : '🔓 Connected'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                      {(!stats.latestLogs || stats.latestLogs.length === 0) && (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '13px' }}>No session logs registered yet.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: BRANDING & SANDBOX LIVE PREVIEW */}
          {activeTab === 'branding' && (
            <div>
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: isDark ? '#3b82f6' : 'var(--navy)' }}>System Branding Configuration</h2>
                <p style={{ fontSize: '13px', color: isDark ? '#94a3b8' : '#64748b', margin: '4px 0 0 0' }}>Customize the application brand, layout logos, and authentication page settings.</p>
              </div>

              {/* Branding segments selector buttons */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', background: isDark ? '#0f172a' : '#f1f5f9', padding: '4px', borderRadius: '8px', width: 'fit-content' }}>
                <button
                  type="button"
                  onClick={() => setSubBrandingTab('dashboard')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: subBrandingTab === 'dashboard' ? (branding.primary_color || 'var(--navy)') : 'transparent',
                    color: subBrandingTab === 'dashboard' ? '#fff' : (isDark ? '#cbd5e1' : '#475569'),
                    transition: 'all 0.15s ease'
                  }}
                >
                  🏢 Dashboard Portal Branding
                </button>
                <button
                  type="button"
                  onClick={() => setSubBrandingTab('login')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: subBrandingTab === 'login' ? (branding.primary_color || 'var(--navy)') : 'transparent',
                    color: subBrandingTab === 'login' ? '#fff' : (isDark ? '#cbd5e1' : '#475569'),
                    transition: 'all 0.15s ease'
                  }}
                >
                  🔒 Login Screen Branding
                </button>
                <button
                  type="button"
                  onClick={() => setSubBrandingTab('pwa')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: subBrandingTab === 'pwa' ? (branding.primary_color || 'var(--navy)') : 'transparent',
                    color: subBrandingTab === 'pwa' ? '#fff' : (isDark ? '#cbd5e1' : '#475569'),
                    transition: 'all 0.15s ease'
                  }}
                >
                  📱 PWA Branding & Installation
                </button>
              </div>

              <div style={{ background: isDark ? '#1e293b' : '#fff', border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', maxWidth: '680px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <form onSubmit={handleBrandingSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  
                  {subBrandingTab === 'dashboard' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: isDark ? '#3b82f6' : 'var(--navy)', borderBottom: isDark ? '1px solid #334155' : '1px solid #f1f5f9', paddingBottom: '8px' }}>Application Branding</h3>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontWeight: 600, fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }}>Dashboard App Name</label>
                        <input type="text" value={branding.app_name} onChange={e => setBranding({...branding, app_name: e.target.value})} style={{ padding: '10px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }} />
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontWeight: 600, fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }}>Dashboard Subtitle</label>
                        <input type="text" value={branding.app_subtitle} onChange={e => setBranding({...branding, app_subtitle: e.target.value})} style={{ padding: '10px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }} />
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontWeight: 600, fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }}>Dashboard Logo (Emoji/Text or Upload image below)</label>
                        <input type="text" value={branding.app_logo} onChange={e => setBranding({...branding, app_logo: e.target.value})} style={{ padding: '10px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }} />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontWeight: 600, fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }}>Primary Brand Color</label>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input type="color" value={branding.primary_color || '#0f2a4a'} onChange={e => setBranding({...branding, primary_color: e.target.value})} style={{ padding: '2px', width: '36px', height: '36px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', background: 'transparent' }} />
                            <input type="text" value={branding.primary_color || '#0f2a4a'} onChange={e => setBranding({...branding, primary_color: e.target.value})} style={{ padding: '10px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', flex: 1, background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }} />
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontWeight: 600, fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }}>Accent Highlight Color</label>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input type="color" value={branding.accent_color || '#ef9f27'} onChange={e => setBranding({...branding, accent_color: e.target.value})} style={{ padding: '2px', width: '36px', height: '36px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', background: 'transparent' }} />
                            <input type="text" value={branding.accent_color || '#ef9f27'} onChange={e => setBranding({...branding, accent_color: e.target.value})} style={{ padding: '10px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', flex: 1, background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }} />
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                        <input 
                          type="checkbox" 
                          id="apply-to-admin" 
                          checked={branding.apply_branding_to_admin === 'true'} 
                          onChange={e => setBranding({...branding, apply_branding_to_admin: e.target.checked ? 'true' : 'false'})}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <label htmlFor="apply-to-admin" style={{ fontWeight: 600, fontSize: '13px', color: isDark ? '#cbd5e1' : '#334155', cursor: 'pointer' }}>
                          Apply Branding and custom Theme Colors to Admin Control Panel
                        </label>
                      </div>
                    </div>
                  ) : subBrandingTab === 'login' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: isDark ? '#3b82f6' : 'var(--navy)', borderBottom: isDark ? '1px solid #334155' : '1px solid #f1f5f9', paddingBottom: '8px' }}>Login Screen Customization</h3>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontWeight: 600, fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }}>Login Screen Heading</label>
                        <input type="text" value={branding.login_heading} onChange={e => setBranding({...branding, login_heading: e.target.value})} style={{ padding: '10px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }} />
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontWeight: 600, fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }}>Login Screen Subtitle</label>
                        <input type="text" value={branding.login_subtitle} onChange={e => setBranding({...branding, login_subtitle: e.target.value})} style={{ padding: '10px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }} />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontWeight: 600, fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }}>Login Logo (Emoji/Text or Upload image below)</label>
                        <input type="text" value={branding.login_logo} onChange={e => setBranding({...branding, login_logo: e.target.value})} style={{ padding: '10px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }} />
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontWeight: 600, fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }}>Or: Upload custom Login Logo file</label>
                        <input type="file" accept="image/*" onChange={handleLoginLogoUpload} style={{ fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }} />
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '8px', padding: '12px', background: isDark ? '#0f172a' : '#f8fafc' }}>
                        <label style={{ fontWeight: 700, fontSize: '12px', color: isDark ? '#3b82f6' : '#1e293b' }}>Login Background Mode</label>
                        <select 
                          value={branding.login_bg_type || 'gradient'} 
                          onChange={e => setBranding({...branding, login_bg_type: e.target.value})} 
                          style={{ padding: '8px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#1e293b' : '#fff', color: isDark ? '#fff' : '#0f172a' }}
                        >
                          <option value="solid">Solid Background Color</option>
                          <option value="gradient">Linear Gradient Code</option>
                          <option value="image_url">Background Image URL/URI</option>
                          <option value="image_upload">Uploaded Background Image file</option>
                        </select>

                        {branding.login_bg_type === 'solid' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                            <label style={{ fontWeight: 600, fontSize: '11px', color: isDark ? '#cbd5e1' : '#475569' }}>Solid Color Hex/RGB</label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <input type="color" value={branding.login_bg_color || '#0f2a4a'} onChange={e => setBranding({...branding, login_bg_color: e.target.value})} style={{ padding: '2px', width: '32px', height: '32px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }} />
                              <input type="text" value={branding.login_bg_color || '#0f2a4a'} onChange={e => setBranding({...branding, login_bg_color: e.target.value})} style={{ padding: '8px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', flex: 1, background: isDark ? '#1e293b' : '#fff', color: isDark ? '#fff' : '#0f172a' }} />
                            </div>
                          </div>
                        )}

                        {branding.login_bg_type === 'gradient' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                            <label style={{ fontWeight: 600, fontSize: '11px', color: isDark ? '#cbd5e1' : '#475569' }}>CSS Gradient Value (e.g. linear-gradient(...))</label>
                            <input type="text" value={branding.login_bg_gradient || ''} onChange={e => setBranding({...branding, login_bg_gradient: e.target.value})} style={{ padding: '8px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#1e293b' : '#fff', color: isDark ? '#fff' : '#0f172a' }} />
                          </div>
                        )}

                        {branding.login_bg_type === 'image_url' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                            <label style={{ fontWeight: 600, fontSize: '11px', color: isDark ? '#cbd5e1' : '#475569' }}>Background Image Web Link / URL</label>
                            <input type="text" value={branding.login_bg_image_url || ''} onChange={e => setBranding({...branding, login_bg_image_url: e.target.value})} placeholder="https://example.com/bg.jpg" style={{ padding: '8px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#1e293b' : '#fff', color: isDark ? '#fff' : '#0f172a' }} />
                          </div>
                        )}

                        {branding.login_bg_type === 'image_upload' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                            <label style={{ fontWeight: 600, fontSize: '11px', color: isDark ? '#cbd5e1' : '#475569' }}>Upload background image file</label>
                            <input type="file" accept="image/*" onChange={handleLoginBgUpload} style={{ fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }} />
                            {branding.login_bg_image && (
                              <button type="button" onClick={() => setBranding({...branding, login_bg_image: ''})} style={{ alignSelf: 'flex-start', padding: '4px 8px', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', marginTop: '4px' }}>
                                Clear Uploaded Image
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '16px', marginTop: '4px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 200px' }}>
                          <label style={{ fontWeight: 600, fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }}>Login Box Position</label>
                          <select 
                            value={branding.login_container_pos || 'center'} 
                            onChange={e => setBranding({...branding, login_container_pos: e.target.value})} 
                            style={{ padding: '10px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }}
                          >
                            <option value="center">Center Boxed</option>
                            <option value="left">Left Boxed</option>
                            <option value="right">Right Boxed</option>
                            <option value="full-left">Left Sidebar (Full Height)</option>
                            <option value="full-right">Right Sidebar (Full Height)</option>
                          </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 200px' }}>
                          <label style={{ fontWeight: 600, fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }}>Login Box Opacity (%)</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input 
                              type="range" 
                              min="0" 
                              max="100" 
                              value={branding.login_container_opacity || '100'} 
                              onChange={e => setBranding({...branding, login_container_opacity: e.target.value})} 
                              style={{ flex: 1, cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '13px', fontWeight: 600, minWidth: '40px', textAlign: 'right', color: isDark ? '#cbd5e1' : '#334155' }}>
                              {branding.login_container_opacity || '100'}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: isDark ? '#3b82f6' : 'var(--navy)', borderBottom: isDark ? '1px solid #334155' : '1px solid #f1f5f9', paddingBottom: '8px' }}>
                        Progressive Web App (PWA) Configuration
                      </h3>

                      {/* PWA App Name */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontWeight: 600, fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }}>PWA Application Name</label>
                        <input 
                          type="text" 
                          value={branding.pwa_name || ''} 
                          onChange={e => setBranding({...branding, pwa_name: e.target.value})} 
                          placeholder={`Fallback: ${branding.app_name || 'HARTEK CMD Office'}`}
                          style={{ padding: '10px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }} 
                        />
                        <span style={{ fontSize: '11px', color: '#64748b' }}>Full name displayed on PWA installation prompt and launcher. (If empty, uses Dashboard App Name).</span>
                      </div>

                      {/* PWA Short Name */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontWeight: 600, fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }}>PWA Short Name</label>
                        <input 
                          type="text" 
                          value={branding.pwa_short_name || ''} 
                          onChange={e => setBranding({...branding, pwa_short_name: e.target.value})} 
                          placeholder="e.g. HARTEK CMD"
                          style={{ padding: '10px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }} 
                        />
                        <span style={{ fontSize: '11px', color: '#64748b' }}>Short label used under home screen app icon. (If empty, derived automatically).</span>
                      </div>

                      {/* PWA Description */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontWeight: 600, fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }}>PWA Description</label>
                        <textarea 
                          rows={2}
                          value={branding.pwa_description || ''} 
                          onChange={e => setBranding({...branding, pwa_description: e.target.value})} 
                          placeholder={`Fallback: ${branding.app_subtitle || 'HARTEK Group CMD Office Command Center'}`}
                          style={{ padding: '10px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }} 
                        />
                      </div>

                      {/* PWA Icon Selection Options */}
                      <div style={{ border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '8px', padding: '14px', background: isDark ? '#0f172a' : '#f8fafc', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <label style={{ fontWeight: 700, fontSize: '13px', color: isDark ? '#3b82f6' : '#1e293b' }}>PWA Icon Selection Source</label>
                        
                        <select 
                          value={branding.pwa_icon_type || 'branding'} 
                          onChange={e => setBranding({...branding, pwa_icon_type: e.target.value})}
                          style={{ padding: '8px 12px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#1e293b' : '#fff', color: isDark ? '#fff' : '#0f172a' }}
                        >
                          <option value="branding">Option C — Reuse Existing Branding Logo (app_logo)</option>
                          <option value="upload">Option A — Upload Custom PWA Image File</option>
                          <option value="url">Option B — External Image Web Link / URL</option>
                        </select>

                        {/* Option A: Upload File */}
                        {branding.pwa_icon_type === 'upload' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                            <label style={{ fontWeight: 600, fontSize: '11px', color: isDark ? '#cbd5e1' : '#475569' }}>Upload PWA Icon (PNG / JPEG / WebP / SVG)</label>
                            <input type="file" accept="image/*" onChange={handlePwaIconUpload} style={{ fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }} />
                          </div>
                        )}

                        {/* Option B: External URL */}
                        {branding.pwa_icon_type === 'url' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                            <label style={{ fontWeight: 600, fontSize: '11px', color: isDark ? '#cbd5e1' : '#475569' }}>PWA Icon Web Link / URL</label>
                            <input 
                              type="url" 
                              placeholder="https://example.com/assets/app-icon.png" 
                              value={branding.pwa_icon || ''} 
                              onChange={e => setBranding({...branding, pwa_icon: e.target.value})}
                              style={{ padding: '8px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#1e293b' : '#fff', color: isDark ? '#fff' : '#0f172a' }} 
                            />
                          </div>
                        )}

                        {/* Icon Preview Box */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '6px', padding: '10px', background: isDark ? '#1e293b' : '#fff', borderRadius: '8px', border: isDark ? '1px solid #334155' : '1px solid #e2e8f0' }}>
                          <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: branding.pwa_background_color || branding.login_bg_color || '#0f2a4a', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', flexShrink: 0 }}>
                            {branding.pwa_icon ? (
                              <img src={branding.pwa_icon} alt="PWA Icon Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            ) : branding.app_logo && (branding.app_logo.startsWith('data:') || branding.app_logo.startsWith('http')) ? (
                              <img src={branding.app_logo} alt="Brand Icon Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            ) : (
                              <span style={{ fontSize: '28px' }}>{branding.app_logo || '🏢'}</span>
                            )}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: isDark ? '#f1f5f9' : '#1e293b' }}>
                              {branding.pwa_name || branding.app_name || 'HARTEK CMD Office'}
                            </div>
                            <div style={{ fontSize: '11px', color: isDark ? '#94a3b8' : '#64748b' }}>
                              Active PWA Launcher Icon Preview
                            </div>
                          </div>
                          {branding.pwa_icon && (
                            <button 
                              type="button" 
                              onClick={() => setBranding({...branding, pwa_icon: '', pwa_icon_type: 'branding'})}
                              style={{ padding: '6px 10px', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}
                            >
                              Reset Icon
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Theme and Background Colors */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontWeight: 600, fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }}>PWA Theme Color</label>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input 
                              type="color" 
                              value={branding.pwa_theme_color || branding.primary_color || '#0f2a4a'} 
                              onChange={e => setBranding({...branding, pwa_theme_color: e.target.value})} 
                              style={{ padding: '2px', width: '36px', height: '36px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', background: 'transparent' }} 
                            />
                            <input 
                              type="text" 
                              value={branding.pwa_theme_color || branding.primary_color || '#0f2a4a'} 
                              onChange={e => setBranding({...branding, pwa_theme_color: e.target.value})} 
                              style={{ padding: '10px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', flex: 1, background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }} 
                            />
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontWeight: 600, fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }}>PWA Background Color</label>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input 
                              type="color" 
                              value={branding.pwa_background_color || branding.login_bg_color || '#0f2a4a'} 
                              onChange={e => setBranding({...branding, pwa_background_color: e.target.value})} 
                              style={{ padding: '2px', width: '36px', height: '36px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', background: 'transparent' }} 
                            />
                            <input 
                              type="text" 
                              value={branding.pwa_background_color || branding.login_bg_color || '#0f2a4a'} 
                              onChange={e => setBranding({...branding, pwa_background_color: e.target.value})} 
                              style={{ padding: '10px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', flex: 1, background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }} 
                            />
                          </div>
                        </div>
                      </div>

                      {/* Display Mode & Orientation */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontWeight: 600, fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }}>Display Mode</label>
                          <select 
                            value={branding.pwa_display || 'standalone'} 
                            onChange={e => setBranding({...branding, pwa_display: e.target.value})}
                            style={{ padding: '10px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }}
                          >
                            <option value="standalone">Standalone App (Recommended)</option>
                            <option value="fullscreen">Fullscreen</option>
                            <option value="minimal-ui">Minimal UI</option>
                            <option value="browser">Browser Tab</option>
                          </select>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontWeight: 600, fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }}>Screen Orientation</label>
                          <select 
                            value={branding.pwa_orientation || 'portrait-primary'} 
                            onChange={e => setBranding({...branding, pwa_orientation: e.target.value})}
                            style={{ padding: '10px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }}
                          >
                            <option value="portrait-primary">Portrait Primary</option>
                            <option value="any">Any / Auto Rotate</option>
                            <option value="landscape-primary">Landscape Primary</option>
                          </select>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '6px' }}>
                        <button 
                          type="button" 
                          onClick={() => {
                            setBranding((prev: any) => ({
                              ...prev,
                              pwa_name: '',
                              pwa_short_name: '',
                              pwa_description: '',
                              pwa_icon_type: 'branding',
                              pwa_icon: '',
                              pwa_theme_color: '',
                              pwa_background_color: '',
                              pwa_display: 'standalone',
                              pwa_orientation: 'portrait-primary'
                            }));
                            showToast('PWA overrides reset to default brand settings');
                          }}
                          style={{ padding: '6px 12px', background: isDark ? '#334155' : '#f1f5f9', color: isDark ? '#cbd5e1' : '#475569', border: isDark ? '1px solid #4b5563' : '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                        >
                          🔄 Restore PWA Defaults
                        </button>
                      </div>
                    </div>
                  )}

                  <button type="submit" style={{ padding: '12px 24px', background: branding.primary_color || 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start', marginTop: '12px', boxShadow: '0 4px 10px rgba(15,42,74,0.15)', transition: 'all 0.2s' }}>
                    💾 Save Brand Settings
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 2: USER MANAGEMENT ROSTER */}
          {activeTab === 'users' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: isDark ? '#3b82f6' : 'var(--navy)' }}>Registered Staff Accounts</h2>
                  <p style={{ fontSize: '13px', color: isDark ? '#94a3b8' : '#64748b', margin: '4px 0 0 0' }}>Configure credentials, roles, and supervisor reporting lines.</p>
                </div>
                <button 
                  onClick={() => {
                    setUserForm({ id: '', email: '', name: '', password: '', roleId: '', managerId: '', active: true });
                    setShowUserModal(true);
                  }}
                  style={{ padding: '10px 16px', background: branding.primary_color || 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', boxShadow: '0 4px 10px rgba(15,42,74,0.15)' }}
                >
                  ➕ Add Staff Profile
                </button>
              </div>

              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}><input type="checkbox" style={{ cursor: 'pointer' }} /></th>
                      <th>Name ▾</th>
                      <th>Role ▾</th>
                      <th>Report To</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => {
                      const roleName = u.role ? u.role.name : 'No Role Assigned';
                      
                      // Safeguards check
                      const activeAdmins = users.filter(usr => usr.active && usr.role?.name === 'Admin');
                      const isLastAdmin = roleName === 'Admin' && activeAdmins.length <= 1;
                      const isSelf = u.id === adminUser?.id || u.email === adminUser?.email;
                      const disableDelete = isSelf || isLastAdmin;

                      let pillBg = '#f1f5f9';
                      let pillColor = '#475569';
                      if (roleName === 'Admin') {
                        pillBg = isDark ? '#1e3a8a' : '#eff6ff';
                        pillColor = isDark ? '#60a5fa' : '#1d4ed8';
                      } else {
                        pillBg = isDark ? '#064e3b' : '#ecfdf5';
                        pillColor = isDark ? '#34d399' : '#059669';
                      }

                      return (
                        <tr key={u.id} style={{ borderBottom: isDark ? '1px solid #334155' : '1px solid #f1f5f9', background: isDark ? '#1e293b' : '#fff' }}>
                          <td style={{ padding: '16px 12px', verticalAlign: 'middle' }}>
                            <input type="checkbox" style={{ cursor: 'pointer' }} />
                          </td>
                          <td style={{ padding: '16px 12px', verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ width: '38px', height: '38px', borderRadius: '50%', overflow: 'hidden', background: isDark ? '#0f172a' : '#e2e8f0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <img 
                                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=random&color=fff&bold=true`} 
                                  alt={u.name}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                />
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, color: isDark ? '#f1f5f9' : '#0f172a', fontSize: '14px' }}>{u.name}</div>
                                <div style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: '12px', marginTop: '2px' }}>{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '16px 12px', verticalAlign: 'middle' }}>
                            <span style={{ padding: '4px 12px', borderRadius: '20px', background: pillBg, color: pillColor, fontSize: '11px', fontWeight: 600, display: 'inline-block' }}>
                              {roleName}
                            </span>
                          </td>
                          <td style={{ padding: '16px 12px', verticalAlign: 'middle', color: isDark ? '#cbd5e1' : '#475569', fontWeight: 500 }}>
                            {u.manager ? u.manager.name : '—'}
                          </td>
                          <td style={{ padding: '16px 12px', verticalAlign: 'middle', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end', alignItems: 'center' }}>
                              <button 
                                onClick={() => {
                                  setUserForm({
                                    id: u.id,
                                    email: u.email,
                                    name: u.name,
                                    password: '',
                                    roleId: u.roleId || '',
                                    managerId: u.managerId || '',
                                    active: u.active
                                  });
                                  setShowUserModal(true);
                                }}
                                style={{ 
                                  background: 'none', 
                                  border: 'none', 
                                  color: isDark ? '#3b82f6' : 'var(--navy)', 
                                  cursor: 'pointer', 
                                  fontSize: '13px', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '6px',
                                  fontWeight: 600
                                }}
                              >
                                <span style={{ fontSize: '14px' }}>✏️</span> Edit User
                              </button>
                              <button 
                                onClick={disableDelete ? undefined : () => handleUserDelete(u.id)}
                                disabled={disableDelete}
                                title={
                                  isSelf 
                                    ? "You cannot disable your own logged-in account." 
                                    : isLastAdmin 
                                      ? "Cannot disable the only remaining active administrator account." 
                                      : "Disable user profile"
                                }
                                style={{ 
                                  background: 'none', 
                                  border: 'none', 
                                  color: disableDelete ? (isDark ? '#4b5563' : '#cbd5e1') : '#ef4444', 
                                  cursor: disableDelete ? 'not-allowed' : 'pointer', 
                                  fontSize: '13px', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '6px',
                                  fontWeight: 600
                                }}
                              >
                                <span style={{ fontSize: '14px' }}>🗑️</span> Disable
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: ROLES AND TAB CONFIG ACCESS DIRECT CONTROL */}
          {activeTab === 'roles' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: isDark ? '#3b82f6' : 'var(--navy)' }}>Access Roles & Authorization Matrix</h2>
                  <p style={{ fontSize: '13px', color: isDark ? '#94a3b8' : '#64748b', margin: '4px 0 0 0' }}>Manage access control levels. Tabs set to hidden will be restricted from users assigned to the respective role.</p>
                </div>
                <button 
                  onClick={() => {
                    setRoleForm({ id: '', name: '' });
                    setShowRoleModal(true);
                  }}
                  style={{ padding: '10px 16px', background: branding.primary_color || 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', boxShadow: '0 4px 10px rgba(15,42,74,0.15)' }}
                >
                  ➕ Create Custom Role
                </button>
              </div>

              {/* Roles grid of cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
                {roles.map(r => {
                  const isSelected = selectedRole?.id === r.id;
                  const isSystemRole = ['Admin', 'Manager', 'Supervisor', 'Employee', 'Viewer', 'Guest'].includes(r.name);
                  const userCount = users.filter((u: any) => u.roleId === r.id).length;

                  return (
                    <div 
                      key={r.id}
                      onClick={() => {
                        setSelectedRole(r);
                        setShowRolePermissionsModal(true);
                      }}
                      style={{
                        padding: '18px',
                        background: isDark ? '#1e293b' : '#fff',
                        border: isSelected 
                          ? `2px solid ${branding.primary_color || 'var(--navy)'}` 
                          : (isDark ? '1px solid #334155' : '1px solid #cbd5e1'),
                        borderRadius: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '12px',
                        boxShadow: isSelected ? '0 10px 20px rgba(0,0,0,0.1)' : '0 2px 4px rgba(0,0,0,0.02)',
                        transition: 'all 0.2s ease',
                        position: 'relative'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: '14px', color: isSelected ? (isDark ? '#3b82f6' : 'var(--navy)') : (isDark ? '#f1f5f9' : '#1e293b') }}>
                            {r.name}
                          </span>
                          {isSelected && (
                            <span style={{ background: branding.primary_color || 'var(--navy)', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 'bold' }}>✓</span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: isDark ? '#94a3b8' : '#64748b', marginTop: '4px' }}>
                          👤 {userCount} mapped user{userCount !== 1 ? 's' : ''}
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: isDark ? '1px solid #334155' : '1px solid #f1f5f9', paddingTop: '8px' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (r.name === 'Admin') {
                              showToast("System security role ('Admin') cannot be renamed to prevent lockout.", 'err');
                              return;
                            }
                            setRoleForm({ id: r.id, name: r.name });
                            setShowRoleModal(true);
                          }}
                          style={{ 
                            background: 'none', 
                            border: 'none', 
                            color: (r.name === 'Admin') 
                              ? (isDark ? '#475569' : '#94a3b8') 
                              : (isDark ? '#cbd5e1' : '#4b5563'), 
                            cursor: (r.name === 'Admin') ? 'not-allowed' : 'pointer', 
                            fontSize: '12px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '4px', 
                            fontWeight: 600,
                            opacity: (r.name === 'Admin') ? 0.5 : 1
                          }}
                          title={(r.name === 'Admin') ? "Protected System Role" : "Edit Role Name"}
                        >
                          ✏️ Edit Role
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (r.name === 'Admin') {
                              showToast("System security role ('Admin') cannot be deleted to prevent lockout.", 'err');
                              return;
                            }
                            handleRoleDelete(r.id);
                          }}
                          style={{ 
                            background: 'none', 
                            border: 'none', 
                            color: (r.name === 'Admin') 
                              ? (isDark ? '#475569' : '#94a3b8') 
                              : '#ef4444', 
                            cursor: (r.name === 'Admin') ? 'not-allowed' : 'pointer', 
                            fontSize: '12px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '4px', 
                            fontWeight: 600,
                            opacity: (r.name === 'Admin') ? 0.5 : 1
                          }}
                          title={(r.name === 'Admin') ? "Protected System Role" : "Delete Role"}
                        >
                          🗑️ Delete Role
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}



          {/* TAB 5: SMTP CONFIGURATION */}
          {activeTab === 'smtp' && (
            <div>
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: isDark ? '#3b82f6' : 'var(--navy)' }}>System SMTP Mail Dispatch Setup</h2>
                <p style={{ fontSize: '13px', color: isDark ? '#94a3b8' : '#64748b', margin: '4px 0 0 0' }}>Manage SMTP mail relay properties to dispatch OTP security keys and profile password links.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                {/* Left Card: Mail Server Connection Parameters */}
                <div style={{ background: isDark ? '#1e293b' : '#fff', border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: isDark ? '#3b82f6' : 'var(--navy)', borderBottom: isDark ? '1px solid #334155' : '1px solid #f1f5f9', paddingBottom: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FaServer /> SMTP Connection Parameters
                  </h3>

                  <form onSubmit={handleBrandingSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 2 }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#475569' }}>SMTP Host Name</label>
                        <input type="text" value={branding.smtp_host} onChange={e => setBranding({...branding, smtp_host: e.target.value})} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#1e293b' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#475569' }}>SMTP Port</label>
                        <input type="text" value={branding.smtp_port} onChange={e => setBranding({...branding, smtp_port: e.target.value})} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#1e293b' }} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 2 }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#475569' }}>SMTP Username</label>
                        <input type="email" value={branding.smtp_username} onChange={e => setBranding({...branding, smtp_username: e.target.value})} placeholder="yourname@outlook.com" style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#1e293b' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1.5 }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#475569' }}>Encryption</label>
                        <select value={branding.smtp_encryption} onChange={e => setBranding({...branding, smtp_encryption: e.target.value})} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#1e293b' }}>
                          <option value="STARTTLS">STARTTLS (587)</option>
                          <option value="SSL/TLS">SSL/TLS (465)</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#475569' }}>SMTP App Password</label>
                      <input type="password" value={branding.smtp_password} onChange={e => setBranding({...branding, smtp_password: e.target.value})} placeholder="••••••••••••••••" style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#1e293b' }} />
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                      <button type="submit" style={{ padding: '10px 18px', background: branding.primary_color || 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
                        💾 Save SMTP Config
                      </button>
                      <button type="button" onClick={handleTestSmtpConnection} disabled={testingConnection} style={{ padding: '10px 18px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#cbd5e1' : '#0f172a', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {testingConnection ? <FaSpinner className="spin" /> : <FaTools />}
                        {testingConnection ? 'Testing...' : 'Test Connection'}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Right Card: Sender Profile & Test Dispatch */}
                <div style={{ background: isDark ? '#1e293b' : '#fff', border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '20px', alignSelf: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: isDark ? '#3b82f6' : 'var(--navy)', borderBottom: isDark ? '1px solid #334155' : '1px solid #f1f5f9', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FaEnvelope /> Sender Profile & Verification
                    </h3>
                    <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>Configure details visible to email recipients and trigger tests.</p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#475569' }}>Sender Display Name</label>
                      <input type="text" value={branding.smtp_sender_name} onChange={e => setBranding({...branding, smtp_sender_name: e.target.value})} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#1e293b' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#475569' }}>Sender Email Address</label>
                      <input type="email" value={branding.smtp_sender_email} onChange={e => setBranding({...branding, smtp_sender_email: e.target.value})} style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#1e293b' }} />
                    </div>
                  </div>

                  <div style={{ border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: isDark ? '#0f172a' : '#f8fafc', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: isDark ? '#cbd5e1' : '#1e293b' }}>Recipient Email Address</label>
                    <input 
                      type="email" 
                      placeholder="test@example.com" 
                      value={testEmailRecipient}
                      onChange={e => setTestEmailRecipient(e.target.value)}
                      style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isDark ? '#1e293b' : '#fff', color: isDark ? '#fff' : '#1e293b' }} 
                    />
                    <button 
                      type="button" 
                      onClick={handleSendTestEmail} 
                      disabled={sendingTestEmail}
                      style={{ padding: '10px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'all 0.15s ease' }}
                    >
                      {sendingTestEmail ? <FaSpinner className="spin" /> : <FaRegPaperPlane />}
                      {sendingTestEmail ? 'Sending Test...' : 'Send Verification Email'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: SYSTEM AUDIT LOG HISTORY */}
          {activeTab === 'sessions' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: isDark ? '#3b82f6' : 'var(--navy)' }}>System Audit Logs & Activities</h2>
                  <p style={{ fontSize: '13px', color: isDark ? '#94a3b8' : '#64748b', margin: '4px 0 0 0' }}>Real-time database records of all user authentication login/logout timestamps and administrative activity logs.</p>
                </div>
              </div>

              {/* Sub Mode Selection Buttons */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: isDark ? '1px solid #334155' : '1px solid #e2e8f0', paddingBottom: '10px' }}>
                <button
                  type="button"
                  onClick={() => setAuditTabSubMode('sessions')}
                  style={{
                    padding: '8px 16px',
                    background: auditTabSubMode === 'sessions' ? (branding.primary_color || 'var(--navy)') : 'transparent',
                    color: auditTabSubMode === 'sessions' ? '#fff' : (isDark ? '#cbd5e1' : '#475569'),
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  🔐 Session Logins & Timings
                </button>
                <button
                  type="button"
                  onClick={() => setAuditTabSubMode('activities')}
                  style={{
                    padding: '8px 16px',
                    background: auditTabSubMode === 'activities' ? (branding.primary_color || 'var(--navy)') : 'transparent',
                    color: auditTabSubMode === 'activities' ? '#fff' : (isDark ? '#cbd5e1' : '#475569'),
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  ⚙️ User Activities Trail
                </button>
              </div>

              {/* Search and Filters */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                  <FaSearch style={{ position: 'absolute', left: '12px', top: '12px', color: isDark ? '#475569' : '#94a3b8' }} />
                  <input 
                    type="text" 
                    placeholder={auditTabSubMode === 'sessions' ? "Search by name, email, or Session unique ID..." : "Search activities by action, name, or detail..."}
                    value={sessionSearch}
                    onChange={e => setSessionSearch(e.target.value)}
                    style={{ width: '100%', padding: '10px 10px 10px 36px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', background: isDark ? '#1e293b' : '#fff', color: isDark ? '#fff' : '#0f172a' }}
                  />
                </div>
                
                {auditTabSubMode === 'sessions' && (
                  <div style={{ display: 'flex', gap: '4px', background: isDark ? '#1e293b' : '#f1f5f9', padding: '4px', borderRadius: '8px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1' }}>
                    <button type="button" onClick={() => setSessionFilter('all')} style={{ padding: '6px 12px', border: 'none', background: sessionFilter === 'all' ? (branding.primary_color || 'var(--navy)') : 'transparent', color: sessionFilter === 'all' ? '#fff' : (isDark ? '#cbd5e1' : '#475569'), fontSize: '12px', fontWeight: 700, borderRadius: '6px', cursor: 'pointer' }}>All Logs</button>
                    <button type="button" onClick={() => setSessionFilter('active')} style={{ padding: '6px 12px', border: 'none', background: sessionFilter === 'active' ? '#10b981' : 'transparent', color: sessionFilter === 'active' ? '#fff' : (isDark ? '#cbd5e1' : '#475569'), fontSize: '12px', fontWeight: 700, borderRadius: '6px', cursor: 'pointer' }}>Active Now</button>
                    <button type="button" onClick={() => setSessionFilter('completed')} style={{ padding: '6px 12px', border: 'none', background: sessionFilter === 'completed' ? '#d97706' : 'transparent', color: sessionFilter === 'completed' ? '#fff' : (isDark ? '#cbd5e1' : '#475569'), fontSize: '12px', fontWeight: 700, borderRadius: '6px', cursor: 'pointer' }}>Logged Out</button>
                  </div>
                )}
              </div>

              {/* Logs Tables */}
              {auditTabSubMode === 'sessions' ? (
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>User Profile</th>
                        <th>Login Timing (12 Hr)</th>
                        <th>Logout Timing (12 Hr)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionLogs
                        ?.filter(log => {
                          const searchLower = sessionSearch.toLowerCase();
                          const matchesSearch = log.id.toLowerCase().includes(searchLower) || log.userName.toLowerCase().includes(searchLower) || log.userEmail.toLowerCase().includes(searchLower);
                          if (sessionFilter === 'active') return matchesSearch && !log.logoutTime;
                          if (sessionFilter === 'completed') return matchesSearch && log.logoutTime;
                          return matchesSearch;
                        })
                        .map(log => (
                          <tr 
                            key={log.id} 
                            onClick={() => setSelectedSessionLog(log)}
                            style={{ borderBottom: isDark ? '1px solid #334155' : '1px solid #f1f5f9', background: isDark ? '#1e293b' : '#fff', cursor: 'pointer', transition: 'all 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.background = isDark ? '#0f172a' : '#f8fafc'}
                            onMouseLeave={e => e.currentTarget.style.background = isDark ? '#1e293b' : '#fff'}
                          >
                            <td style={{ padding: '16px 12px', verticalAlign: 'middle' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: isDark ? '#0f172a' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: isDark ? '#fff' : '#475569' }}>
                                  {log.user?.initials || getInitials(log.userName)}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 600, color: isDark ? '#f1f5f9' : '#0f172a' }}>{log.userName}</div>
                                  <div style={{ fontSize: '11px', color: isDark ? '#94a3b8' : '#64748b' }}>{log.userEmail}</div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '16px 12px', verticalAlign: 'middle', color: isDark ? '#cbd5e1' : '#1e293b' }}>
                              {format12Hour(log.loginTime)}
                            </td>
                            <td style={{ padding: '16px 12px', verticalAlign: 'middle' }}>
                              {log.logoutTime ? (
                                <span style={{ color: isDark ? '#94a3b8' : '#64748b' }}>{format12Hour(log.logoutTime)}</span>
                              ) : (
                                <span style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                                  Active Session
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      {(!sessionLogs || sessionLogs.length === 0) && (
                        <tr>
                          <td colSpan={3} style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>No authentication timings registered yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Time</th>
                        <th>User Profile</th>
                        <th>Activity Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs
                        ?.filter(log => {
                          const searchLower = sessionSearch.toLowerCase();
                          return (
                            log.action.toLowerCase().includes(searchLower) ||
                            (log.detail && log.detail.toLowerCase().includes(searchLower)) ||
                            (log.userName && log.userName.toLowerCase().includes(searchLower)) ||
                            (log.userEmail && log.userEmail.toLowerCase().includes(searchLower))
                          );
                        })
                        .map(log => {
                          const formatted = format12Hour(log.timestamp);
                          const datePart = formatted.split(', ')[0];
                          const timePart = formatted.split(', ')[1];

                          return (
                            <tr 
                              key={log.id} 
                              onClick={() => setSelectedAuditLog(log)}
                              style={{ borderBottom: isDark ? '1px solid #334155' : '1px solid #f1f5f9', background: isDark ? '#1e293b' : '#fff', cursor: 'pointer', transition: 'all 0.15s' }}
                              onMouseEnter={e => e.currentTarget.style.background = isDark ? '#0f172a' : '#f8fafc'}
                              onMouseLeave={e => e.currentTarget.style.background = isDark ? '#1e293b' : '#fff'}
                            >
                              <td style={{ padding: '16px 12px', verticalAlign: 'middle', color: isDark ? '#cbd5e1' : '#1e293b' }}>
                                {datePart}
                              </td>
                              <td style={{ padding: '16px 12px', verticalAlign: 'middle', color: isDark ? '#cbd5e1' : '#1e293b' }}>
                                {timePart}
                              </td>
                              <td style={{ padding: '16px 12px', verticalAlign: 'middle' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: isDark ? '#0f172a' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: isDark ? '#fff' : '#475569' }}>
                                    {log.userName ? getInitials(log.userName) : 'U'}
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: 600, color: isDark ? '#f1f5f9' : '#0f172a' }}>{log.userName || 'System Action'}</div>
                                    <div style={{ fontSize: '11px', color: isDark ? '#94a3b8' : '#64748b' }}>{log.userEmail || 'system@hartek.com'}</div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '16px 12px', verticalAlign: 'middle' }}>
                                <span style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                                  {log.action}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      {(!auditLogs || auditLogs.length === 0) && (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>No administrative activities registered yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          </div>
        </main>
      </div>



      {/* USER PROVISIONING MODAL */}
      {showUserModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: isDark ? '#1e293b' : '#fff', border: isDark ? '1px solid #334155' : 'none', padding: '32px', borderRadius: '12px', maxWidth: '520px', width: '100%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', color: isDark ? '#f1f5f9' : '#0f172a' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px', color: isDark ? '#3b82f6' : 'var(--navy)' }}>{userForm.id ? 'Modify User Profile' : 'Register New User'}</h3>
            <form onSubmit={handleUserSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155' }}>Full Name <span style={{ color: 'red' }}>*</span></label>
                <input 
                  type="text" 
                  value={userForm.name} 
                  onChange={e => setUserForm({...userForm, name: e.target.value})} 
                  placeholder="Enter full name"
                  required
                  style={{ padding: '10px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155' }}>Email Address <span style={{ color: 'red' }}>*</span></label>
                <input 
                  type="email" 
                  value={userForm.email} 
                  onChange={e => setUserForm({...userForm, email: e.target.value})} 
                  placeholder="Enter email address"
                  required
                  readOnly={!!userForm.id}
                  style={{ padding: '10px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', background: userForm.id ? (isDark ? '#0f172a' : '#f1f5f9') : (isDark ? '#0f172a' : '#fff'), color: userForm.id ? '#64748b' : (isDark ? '#fff' : '#0f172a'), cursor: userForm.id ? 'not-allowed' : 'text' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155' }}>Password {userForm.id && '(Leave blank to keep unchanged)'}</label>
                <input 
                  type="password" 
                  value={userForm.password} 
                  onChange={e => setUserForm({...userForm, password: e.target.value})} 
                  placeholder={userForm.id ? 'Leave blank to keep unchanged' : 'Leave blank to auto-generate temporary password'}
                  required={false}
                  style={{ padding: '10px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155' }}>Role Assignment</label>
                <select 
                  value={userForm.roleId} 
                  onChange={e => setUserForm({...userForm, roleId: e.target.value})}
                  style={{ padding: '10px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }}
                >
                  <option value="">Choose Role...</option>
                  {roles.map(r => (
                    <option key={r.id} value={r.id} style={{ background: isDark ? '#1e293b' : '#fff', color: isDark ? '#fff' : '#0f172a' }}>{r.name}</option>
                  ))}
                </select>
              </div>

              {/* Reports To manager assigner */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155' }}>Reports To (Manager)</label>
                <select 
                  value={userForm.managerId} 
                  onChange={e => setUserForm({...userForm, managerId: e.target.value})}
                  style={{ padding: '10px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }}
                >
                  <option value="">No Manager / Direct Report</option>
                  {users
                    .filter(u => u.id !== userForm.id) // Prevent self-reporting
                    .map(u => (
                      <option key={u.id} value={u.id} style={{ background: isDark ? '#1e293b' : '#fff', color: isDark ? '#fff' : '#0f172a' }}>{u.name} ({u.email})</option>
                    ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <input 
                  type="checkbox" 
                  checked={userForm.active} 
                  onChange={e => setUserForm({...userForm, active: e.target.checked})}
                  id="user-active-cb"
                  style={{ cursor: 'pointer' }}
                />
                <label htmlFor="user-active-cb" style={{ fontSize: '13px', cursor: 'pointer', color: isDark ? '#cbd5e1' : '#334155' }}>Active Login Privilege</label>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
                {userForm.id && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      type="button" 
                      onClick={async () => {
                        if (confirm('Are you sure you want to reset this user\'s password to a temporary key and send it via email?')) {
                          try {
                            const res = await api.post(`/users/${userForm.id}/reset-password-temp`);
                            showToast(res?.message || `Temporary password key generated: ${res?.tempPassword}`);
                          } catch (err: any) {
                            showToast(err.message || 'Error resetting password', 'err');
                          }
                        }
                      }} 
                      style={{ padding: '10px 14px', background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                    >
                      ✉️ Reset Password
                    </button>
                    <button 
                      type="button" 
                      onClick={() => {
                        handleUserDelete(userForm.id);
                        setShowUserModal(false);
                      }} 
                      style={{ padding: '10px 14px', background: '#fee2e2', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                    >
                      🗑️ Delete Account
                    </button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                  <button type="button" onClick={() => setShowUserModal(false)} style={{ padding: '10px 18px', background: isDark ? '#334155' : '#f1f5f9', color: isDark ? '#cbd5e1' : '#475569', border: isDark ? '1px solid #4b5563' : '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>Cancel</button>
                  <button type="submit" style={{ padding: '10px 18px', background: branding.primary_color || 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', boxShadow: '0 4px 10px rgba(15,42,74,0.15)' }}>Save</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ROLE PROVISIONING MODAL */}
      {showRoleModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: isDark ? '#1e293b' : '#fff', border: isDark ? '1px solid #334155' : 'none', padding: '32px', borderRadius: '12px', maxWidth: '400px', width: '100%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', color: isDark ? '#f1f5f9' : '#0f172a' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px', color: isDark ? '#3b82f6' : 'var(--navy)' }}>
              {roleForm.id ? 'Modify Access Role' : 'Create Custom Access Role'}
            </h3>
            <form onSubmit={handleRoleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155' }}>Role Name <span style={{ color: 'red' }}>*</span></label>
                <input 
                  type="text" 
                  placeholder="Enter role name"
                  value={roleForm.name} 
                  onChange={e => setRoleForm({...roleForm, name: e.target.value})} 
                  required
                  style={{ padding: '10px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '6px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button type="button" onClick={() => setShowRoleModal(false)} style={{ padding: '10px 18px', background: isDark ? '#334155' : '#f1f5f9', color: isDark ? '#cbd5e1' : '#475569', border: isDark ? '1px solid #4b5563' : '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>Cancel</button>
                <button type="submit" style={{ padding: '10px 18px', background: branding.primary_color || 'var(--navy)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', boxShadow: '0 4px 10px rgba(15,42,74,0.15)' }}>
                  {roleForm.id ? 'Save Changes' : 'Create Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DASHBOARD STATS MODAL POPUP */}
      {showDashboardModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: isDark ? '#1e293b' : '#fff', border: isDark ? '1px solid #334155' : 'none', padding: '28px', borderRadius: '12px', maxWidth: '520px', width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', color: isDark ? '#f1f5f9' : '#0f172a', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: isDark ? '1px solid #334155' : '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: isDark ? '#3b82f6' : 'var(--navy)' }}>
                {selectedDashboardUser 
                  ? `Session History: ${selectedDashboardUser.name}` 
                  : `${dashboardModalType === 'all' ? 'All Registered Accounts' : dashboardModalType === 'online' ? 'Active/Online Users' : 'Offline Users'}`
                }
              </h3>
              <button 
                onClick={() => setShowDashboardModal(false)}
                style={{ background: 'transparent', border: 'none', color: isDark ? '#cbd5e1' : '#475569', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            {selectedDashboardUser ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <button 
                  type="button" 
                  onClick={() => setSelectedDashboardUser(null)}
                  style={{ alignSelf: 'flex-start', padding: '6px 12px', background: isDark ? '#334155' : '#f1f5f9', color: isDark ? '#cbd5e1' : '#475569', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  ⬅ Back to user list
                </button>
                
                <div style={{ background: isDark ? '#0f172a' : '#f8fafc', padding: '12px', borderRadius: '8px', border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', fontSize: '12px' }}>
                  <div style={{ fontWeight: 700 }}>{selectedDashboardUser.name}</div>
                  <div style={{ color: isDark ? '#94a3b8' : '#64748b', marginTop: '2px' }}>{selectedDashboardUser.email}</div>
                </div>

                <div style={{ fontWeight: 600, fontSize: '13px', borderBottom: isDark ? '1px solid #334155' : '1px solid #f1f5f9', paddingBottom: '6px' }}>Session History Trail</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '250px', overflowY: 'auto' }}>
                  {sessionLogs
                    .filter(log => log.userId === selectedDashboardUser.id)
                    .map(log => (
                      <div key={log.id} style={{ padding: '10px', borderRadius: '6px', border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', background: isDark ? '#1e293b' : '#fff', fontSize: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                          <span>🟢 Logged In:</span>
                          <span>{format12Hour(log.loginTime)}</span>
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, marginTop: '6px', borderTop: isDark ? '1px solid #334155' : '1px solid #f1f5f9', paddingTop: '6px' }}>
                          <span>🔴 Logged Out:</span>
                          <span style={{ color: log.logoutTime ? 'inherit' : '#10b981' }}>
                            {log.logoutTime ? format12Hour(log.logoutTime) : 'Active Now'}
                          </span>
                        </div>
                        
                        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px' }}>IP: {log.ipAddress || '—'} | ID: {log.id}</div>
                      </div>
                    ))
                  }
                  {sessionLogs.filter(log => log.userId === selectedDashboardUser.id).length === 0 && (
                    <div style={{ textAlign: 'center', padding: '16px', color: '#64748b', fontSize: '12px' }}>No session logs tracked for this profile.</div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '350px', overflowY: 'auto' }}>
                {stats.usersWithStatus
                  ?.filter((u: any) => {
                    if (dashboardModalType === 'online') return u.isLoggedIn;
                    if (dashboardModalType === 'offline') return !u.isLoggedIn;
                    return true;
                  })
                  .map((u: any) => (
                    <div 
                      key={u.id} 
                      onClick={() => setSelectedDashboardUser(u)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '8px', background: isDark ? '#0f172a' : '#f8fafc', border: isDark ? '1px solid #334155' : '1px solid #f1f5f9', cursor: 'pointer', transition: 'all 0.15s' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: isDark ? '#334155' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: isDark ? '#fff' : '#475569' }}>
                          {u.initials || getInitials(u.name)}
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: isDark ? '#f1f5f9' : '#1e293b' }}>{u.name}</div>
                          <div style={{ fontSize: '10px', color: isDark ? '#cbd5e1' : '#64748b' }}>{u.email}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', color: isDark ? '#cbd5e1' : '#475569' }}>View sessions</span>
                        <FaChevronRight style={{ fontSize: '10px', color: '#94a3b8' }} />
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
            
            {/* Modal Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px', borderTop: isDark ? '1px solid #334155' : '1px solid #f1f5f9', paddingTop: '12px' }}>
              <button 
                type="button" 
                onClick={() => setShowDashboardModal(false)}
                style={{ padding: '8px 16px', background: branding.primary_color || 'var(--navy)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* SESSION LOG DETAILED CARD POPUP */}
      {selectedSessionLog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div style={{ background: isDark ? '#1e293b' : '#fff', border: isDark ? '1px solid #334155' : 'none', padding: '24px', borderRadius: '12px', maxWidth: '460px', width: '100%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', color: isDark ? '#f1f5f9' : '#0f172a', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: isDark ? '1px solid #334155' : '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: isDark ? '#3b82f6' : 'var(--navy)' }}>
                Session Telemetry Registry Card
              </h3>
              <button 
                onClick={() => setSelectedSessionLog(null)}
                style={{ background: 'transparent', border: 'none', color: isDark ? '#cbd5e1' : '#475569', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600 }}>Unique Session ID</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedSessionLog.id}</span>
              </div>
              <hr style={{ border: 0, borderTop: isDark ? '1px solid #334155' : '1px solid #f1f5f9', margin: 0 }} />
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600 }}>User Profile</span>
                <span style={{ fontWeight: 700 }}>{selectedSessionLog.userName}</span>
                <span style={{ color: isDark ? '#cbd5e1' : '#475569' }}>{selectedSessionLog.userEmail}</span>
              </div>
              <hr style={{ border: 0, borderTop: isDark ? '1px solid #334155' : '1px solid #f1f5f9', margin: 0 }} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600 }}>🟢 Login Time</span>
                  <span>{format12Hour(selectedSessionLog.loginTime)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600 }}>🔴 Logout Time</span>
                  <span>{selectedSessionLog.logoutTime ? format12Hour(selectedSessionLog.logoutTime) : 'Active Now'}</span>
                </div>
              </div>
              <hr style={{ border: 0, borderTop: isDark ? '1px solid #334155' : '1px solid #f1f5f9', margin: 0 }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600 }}>Connection details</span>
                <div>IP Address: {selectedSessionLog.ipAddress || '—'}</div>
                <div style={{ color: '#94a3b8', marginTop: '2px', wordBreak: 'break-all' }}>UA: {selectedSessionLog.userAgent || '—'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: isDark ? '1px solid #334155' : '1px solid #f1f5f9', paddingTop: '12px' }}>
              <button 
                type="button" 
                onClick={() => setSelectedSessionLog(null)}
                style={{ padding: '8px 16px', background: branding.primary_color || 'var(--navy)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AUDIT LOG ACTIVITY DETAILED CARD POPUP */}
      {selectedAuditLog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div style={{ background: isDark ? '#1e293b' : '#fff', border: isDark ? '1px solid #334155' : 'none', padding: '24px', borderRadius: '12px', maxWidth: '460px', width: '100%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', color: isDark ? '#f1f5f9' : '#0f172a', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: isDark ? '1px solid #334155' : '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: isDark ? '#3b82f6' : 'var(--navy)' }}>
                Activity Audit Trail Card
              </h3>
              <button 
                onClick={() => setSelectedAuditLog(null)}
                style={{ background: 'transparent', border: 'none', color: isDark ? '#cbd5e1' : '#475569', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600 }}>📅 Date</span>
                  <span>{format12Hour(selectedAuditLog.timestamp).split(', ')[0]}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600 }}>🕒 Time</span>
                  <span>{format12Hour(selectedAuditLog.timestamp).split(', ')[1]}</span>
                </div>
              </div>
              <hr style={{ border: 0, borderTop: isDark ? '1px solid #334155' : '1px solid #f1f5f9', margin: 0 }} />
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600 }}>User Profile</span>
                <span style={{ fontWeight: 700 }}>{selectedAuditLog.userName || 'System Auto-job'}</span>
                <span style={{ color: isDark ? '#cbd5e1' : '#475569' }}>{selectedAuditLog.userEmail || 'system@hartek.com'}</span>
              </div>
              <hr style={{ border: 0, borderTop: isDark ? '1px solid #334155' : '1px solid #f1f5f9', margin: 0 }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600 }}>Activity Action</span>
                <span style={{ display: 'inline-block', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, width: 'fit-content' }}>
                  {selectedAuditLog.action}
                </span>
              </div>
              <hr style={{ border: 0, borderTop: isDark ? '1px solid #334155' : '1px solid #f1f5f9', margin: 0 }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600 }}>Detail Summary</span>
                <span style={{ lineHeight: '1.5' }}>{selectedAuditLog.detail || 'No detailed specifications logged.'}</span>
              </div>
              <hr style={{ border: 0, borderTop: isDark ? '1px solid #334155' : '1px solid #f1f5f9', margin: 0 }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600 }}>Connection details</span>
                <div>IP Address: {selectedAuditLog.ipAddress || '—'}</div>
                <div style={{ color: '#94a3b8', marginTop: '2px', wordBreak: 'break-all' }}>Browser/Device: {selectedAuditLog.browser || '—'} / {selectedAuditLog.device || '—'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: isDark ? '1px solid #334155' : '1px solid #f1f5f9', paddingTop: '12px' }}>
              <button 
                type="button" 
                onClick={() => setSelectedAuditLog(null)}
                style={{ padding: '8px 16px', background: branding.primary_color || 'var(--navy)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ROLE CONFIGURATION MATRIX POPUP MODAL */}
      {showRolePermissionsModal && selectedRole && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: isDark ? '#1e293b' : '#fff', border: isDark ? '1px solid #334155' : 'none', padding: '28px', borderRadius: '12px', maxWidth: '640px', width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', color: isDark ? '#f1f5f9' : '#0f172a', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: isDark ? '1px solid #334155' : '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: isDark ? '#3b82f6' : 'var(--navy)' }}>
                Configure Permissions Matrix: {selectedRole.name}
              </h3>
              <button 
                onClick={() => setShowRolePermissionsModal(false)}
                style={{ background: 'transparent', border: 'none', color: isDark ? '#cbd5e1' : '#475569', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            {selectedRole.name === 'Admin' ? (
              <div style={{ padding: '24px', textAlign: 'center', color: isDark ? '#94a3b8' : '#64748b', fontSize: '13px' }}>
                🌟 <strong>Admin</strong> holds unrestricted access. All system modules/tabs are visible and writeable.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {dashboardTabsConfig.map(tab => {
                  const level = getTabAccessLevel(tab.resource);
                  return (
                    <div key={tab.resource} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', borderRadius: '8px', background: isDark ? '#0f172a' : '#fff', gap: '10px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>{tab.label}</div>
                        <div style={{ fontSize: '10px', color: isDark ? '#94a3b8' : '#64748b' }}>Resource scope: {tab.resource}</div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '4px', background: isDark ? '#1e293b' : '#f1f5f9', padding: '3px', borderRadius: '6px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1' }}>
                        <button 
                          type="button"
                          onClick={() => handleAccessLevelChange(tab.resource, 'Full Access')}
                          style={{ 
                            padding: '4px 8px', 
                            borderRadius: '4px', 
                            border: 'none', 
                            fontSize: '11px', 
                            fontWeight: 600, 
                            cursor: 'pointer', 
                            background: level === 'Full Access' ? '#22c55e' : 'transparent',
                            color: level === 'Full Access' ? '#fff' : (isDark ? '#9ca3af' : '#64748b'),
                          }}
                        >
                          🔓 Full
                        </button>
                        <button 
                          type="button"
                          onClick={() => handleAccessLevelChange(tab.resource, 'Read Only')}
                          style={{ 
                            padding: '4px 8px', 
                            borderRadius: '4px', 
                            border: 'none', 
                            fontSize: '11px', 
                            fontWeight: 600, 
                            cursor: 'pointer', 
                            background: level === 'Read Only' ? '#3b82f6' : 'transparent',
                            color: level === 'Read Only' ? '#fff' : (isDark ? '#9ca3af' : '#64748b'),
                          }}
                        >
                          👁️ Read
                        </button>
                        <button 
                          type="button"
                          onClick={() => handleAccessLevelChange(tab.resource, 'Hidden')}
                          style={{ 
                            padding: '4px 8px', 
                            borderRadius: '4px', 
                            border: 'none', 
                            fontSize: '11px', 
                            fontWeight: 600, 
                            cursor: 'pointer', 
                            background: level === 'Hidden' ? '#ef4444' : 'transparent',
                            color: level === 'Hidden' ? '#fff' : (isDark ? '#9ca3af' : '#64748b'),
                          }}
                        >
                          🚫 Hide
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Modal Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: isDark ? '1px solid #334155' : '1px solid #f1f5f9', paddingTop: '12px', marginTop: '8px' }}>
              <button 
                type="button"
                onClick={() => setShowRolePermissionsModal(false)}
                style={{ padding: '8px 16px', background: isDark ? '#334155' : '#f1f5f9', color: isDark ? '#cbd5e1' : '#475569', border: isDark ? '1px solid #4b5563' : '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
              >
                Cancel
              </button>
              {selectedRole.name !== 'Admin' && (
                <button 
                  type="button"
                  onClick={async () => {
                    await handleSaveAccessControls();
                    setShowRolePermissionsModal(false);
                  }}
                  style={{ padding: '8px 16px', background: branding.primary_color || 'var(--navy)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}
                >
                  💾 Save Changes
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* CUSTOM LOGOUT CONFIRMATION MODAL */}
      {showLogoutConfirmModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: isDark ? '#1e293b' : '#fff', border: isDark ? '1px solid #334155' : 'none', padding: '32px', borderRadius: '12px', maxWidth: '400px', width: '100%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', color: isDark ? '#f1f5f9' : '#0f172a', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: isDark ? '1px solid #334155' : '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: isDark ? '#3b82f6' : 'var(--navy)' }}>Confirm Logout</h3>
              <button 
                onClick={() => setShowLogoutConfirmModal(false)}
                style={{ background: 'transparent', border: 'none', color: isDark ? '#cbd5e1' : '#475569', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            
            <div style={{ fontSize: '14px', lineHeight: '1.6', color: isDark ? '#cbd5e1' : '#475569' }}>
              Are you sure you want to terminate your administrative session and log out of the Hartek Admin Console?
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
              <button 
                type="button" 
                onClick={() => setShowLogoutConfirmModal(false)} 
                style={{ padding: '10px 18px', background: isDark ? '#334155' : '#f1f5f9', color: isDark ? '#cbd5e1' : '#475569', border: isDark ? '1px solid #4b5563' : '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={async () => {
                  setShowLogoutConfirmModal(false);
                  await handleLogout();
                }} 
                style={{ padding: '10px 18px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)' }}
              >
                Yes, Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
