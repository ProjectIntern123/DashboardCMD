'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { api, getApiBaseUrl } from '../lib/api';
import { ProjectsTab } from './components/ProjectsTab';
import { TasksTab } from './components/TasksTab';

interface PersonalNoteInnerProps {
  tabName: string;
  itemName: string;
  itemId: string;
  api: any;
  notes: any[];
  setNotes: React.Dispatch<React.SetStateAction<any[]>>;
}

const PersonalNoteInner: React.FC<PersonalNoteInnerProps> = ({ tabName, itemName, itemId, api, notes, setNotes }) => {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingLabel, setSavingLabel] = useState('All changes saved');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentNoteIdRef = useRef<string | null>(null);
  const activeNoteRef = useRef<any>(null);

  // Helper to generate the unique note title
  const generatePersonalNoteTitle = (tab: string, item: string, existingNotes: any[]) => {
    let maxNum = 0;
    existingNotes.forEach(n => {
      const match = n.title?.match(/_(\d{3})$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) {
          maxNum = num;
        }
      }
    });
    const nextNumStr = String(maxNum + 1).padStart(3, '0');
    const cleanItemName = item.replace(/[_\n\r]/g, ' ').trim();
    return `${tab}_${cleanItemName}_${nextNumStr}`;
  };

  useEffect(() => {
    // 1. Search for existing note with this item ID comment
    let matchedNote = notes.find(n => {
      const match = n.text?.match(/<!-- item_id: ([a-f0-9-]+) -->/);
      return match && match[1] === itemId;
    });

    // 2. Legacy fallback titles mapping
    const legacyTitles = [
      `[Note] Calendar: ${itemId}`,
      `[Note] Project: ${itemId}`,
      `[Note] Task: ${itemId}`,
      `[Note] Action: ${itemId}`,
      `[Note] Escalation: ${itemId}`,
      `[Note] Followup: ${itemId}`,
      `[Note] Legal: ${itemId}`
    ];

    const doSetup = async () => {
      if (matchedNote) {
        // Strip the HTML comment for editing display
        const cleanText = (matchedNote.text || '').replace(/<!-- item_id: [a-f0-9-]+ -->/g, '').trim();
        setText(cleanText);
        currentNoteIdRef.current = matchedNote.id;
        activeNoteRef.current = matchedNote;
      } else {
        // Check if there is a legacy note to migrate
        const legacyNote = notes.find(n => legacyTitles.includes(n.title));
        if (legacyNote) {
          setLoading(true);
          try {
            const newTitle = generatePersonalNoteTitle(tabName, itemName, notes);
            const cleanLegacyText = (legacyNote.text || '').replace(/<!-- item_id: [a-f0-9-]+ -->/g, '').trim();
            const migratedText = cleanLegacyText + `\n<!-- item_id: ${itemId} -->`;
            
            await api.put(`/notepad/${legacyNote.id}`, {
              title: newTitle,
              text: migratedText
            });

            // Update local notes state immediately
            setNotes(prev => prev.map(n => n.id === legacyNote.id ? { ...n, title: newTitle, text: migratedText } : n));
            
            setText(cleanLegacyText);
            currentNoteIdRef.current = legacyNote.id;
            activeNoteRef.current = { ...legacyNote, title: newTitle, text: migratedText };
          } catch (err) {
            console.error('Failed to migrate legacy note', err);
          } finally {
            setLoading(false);
          }
        } else {
          // Create new note
          setLoading(true);
          try {
            const newTitle = generatePersonalNoteTitle(tabName, itemName, notes);
            const initialText = `\n<!-- item_id: ${itemId} -->`;
            const newNote = await api.post('/notepad', {
              title: newTitle,
              text: initialText,
            });
            currentNoteIdRef.current = newNote.id;
            activeNoteRef.current = newNote;
            setNotes(prev => [newNote, ...prev]);
            setText('');
          } catch (e) {
            console.error('Failed to create contextual personal note', e);
          } finally {
            setLoading(false);
          }
        }
      }
    };

    doSetup();
  }, [itemId, notes, tabName, itemName, api, setNotes]);

  const handleChange = (newText: string) => {
    setText(newText);
    setSavingLabel('Saving changes...');

    const apiText = newText.trim() + `\n<!-- item_id: ${itemId} -->`;

    if (currentNoteIdRef.current) {
      setNotes(prev => prev.map(n => n.id === currentNoteIdRef.current ? { ...n, text: apiText, ts: new Date().toISOString() } : n));
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (!currentNoteIdRef.current) return;
      try {
        const titleToUse = activeNoteRef.current?.title || generatePersonalNoteTitle(tabName, itemName, notes);
        await api.put(`/notepad/${currentNoteIdRef.current}`, {
          title: titleToUse,
          text: apiText,
        });
        setSavingLabel(`Saved at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`);
      } catch (e) {
        setSavingLabel('Error saving changes');
      }
    }, 1000);
  };

  if (loading) {
    return <div style={{ fontSize: '13px', color: 'var(--muted)', padding: '20px 0' }}>Creating personal note space...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%', marginTop: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500 }}>
          🔒 This note is strictly private and visible only to you.
        </span>
        <span style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>
          {savingLabel}
        </span>
      </div>
      <textarea
        value={text}
        onChange={e => handleChange(e.target.value)}
        placeholder="Type your personal observations, remarks, or reminders regarding this item here..."
        style={{
          width: '100%',
          minHeight: '200px',
          padding: '12px',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          fontSize: '14px',
          lineHeight: '1.5',
          outline: 'none',
          resize: 'vertical',
          fontFamily: 'inherit'
        }}
      />
    </div>
  );
};

interface Toast {
  id: string;
  text: string;
  type: 'ok' | 'warn' | 'err' | '';
}

export default function DashboardPage() {
  const { user, loading, logout, hasPermission } = useAuth();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [legalKpiFilter, setLegalKpiFilter] = useState<'all' | 'active_pending' | 'high_risk' | 'this_week'>('all');
  const [fuSortAsc, setFuSortAsc] = useState<boolean | null>(null);
  const [actSortAsc, setActSortAsc] = useState<boolean | null>(null);
  const [escSortAsc, setEscSortAsc] = useState<boolean | null>(null);

  // Dashboard Active Tab state
  const [activeTab, setActiveTab] = useState('dashboard');

  // Datasets state
  const [projects, setProjects] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [escalations, setEscalations] = useState<any[]>([]);
  const [followups, setFollowups] = useState<any[]>([]);
  const [legalCases, setLegalCases] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);

  // Notification logs
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [completedTasksOpen, setCompletedTasksOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Search & Filter state
  const [projSearch, setProjSearch] = useState('');
  const [projBu, setProjBu] = useState('');
  const [projStage, setProjStage] = useState('');
  const [projHealth, setProjHealth] = useState('');

  const [mtgSearch, setMtgSearch] = useState('');
  const [mtgCat, setMtgCat] = useState('');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'list'>('month');

  const [tkSearch, setTkSearch] = useState('');
  const [tkAsg, setTkAsg] = useState('');
  const [tkPri, setTkPri] = useState('');
  const [tkSt, setTkSt] = useState('');

  const [actSearch, setActSearch] = useState('');
  const [actPri, setActPri] = useState('');
  const [actSt, setActSt] = useState('');
  const [actDept, setActDept] = useState('');
  const [actAsg, setActAsg] = useState('');

  const [escSearch, setEscSearch] = useState('');
  const [escSev, setEscSev] = useState('');
  const [escSt, setEscSt] = useState('');
  const [escAsg, setEscAsg] = useState('');

  const [fuSearch, setFuSearch] = useState('');
  const [fuPri, setFuSubPri] = useState('');
  const [fuSt, setFuSt] = useState('');
  const [fuBu, setFuBu] = useState('');

  const [legSearch, setLegSearch] = useState('');
  const [legCourt, setLegCourt] = useState('');
  const [legStatus, setLegStatus] = useState('');
  const [legRisk, setLegRisk] = useState('');
  const [legEntity, setLegEntity] = useState('');
  const [legSide, setLegSide] = useState(''); // filedBy side (by or against)

  // Private Notepad note state
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [noteTitleInput, setNoteTitleInput] = useState('');
  const [noteTextInput, setNoteTextInput] = useState('');
  const [notepadView, setNotepadView] = useState<'editor' | 'list'>('editor');
  const [noteSearchQuery, setNoteSearchQuery] = useState('');
  const [noteSortOrder, setNoteSortOrder] = useState<'edited-desc' | 'title'>('edited-desc');


  // Detail Modal states
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<any | null>(null);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [selectedAction, setSelectedAction] = useState<any | null>(null);
  const [selectedEscalation, setSelectedEscalation] = useState<any | null>(null);
  const [selectedFollowup, setSelectedFollowup] = useState<any | null>(null);
  const [selectedLegal, setSelectedLegal] = useState<any | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'details' | 'note'>('details');

  useEffect(() => {
    setActiveDetailTab('details');
  }, [selectedProject, selectedMeeting, selectedTask, selectedAction, selectedEscalation, selectedFollowup, selectedLegal]);

  // Form Modal Edit/Add states
  const [openModalId, setOpenModalId] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [fileAttachments, setFileAttachments] = useState<any[]>([]);
  const [editingAttendeesId, setEditingAttendeesId] = useState<string | null>(null);
  const [quickAttendeesVal, setQuickAttendeesVal] = useState('');
  const [stats, setStats] = useState<any>({
    employeesCount: 0,
    customersCount: 0,
    vendorsCount: 0,
    workflowsCount: 0,
    auditLogsCount: 0,
    totalBilled: 0.0
  });
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [branding, setBranding] = useState<any>({
    app_logo: '🏢',
    app_name: 'HARTEK CMD Office',
    app_subtitle: 'Operations Command Center v3',
    primary_color: '#0f2a4a',
    accent_color: '#ef9f27',
  });

  const getLocalDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const dStr = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${dStr}`;
  };

  const TODAY = getLocalDateString(new Date());

  const isOD = (d: string | null | undefined, s: string) => {
    if (!d || s === 'Done' || s === 'Closed') return false;
    return d < TODAY;
  };

  const isSoon = (d: string | null | undefined, s: string) => {
    if (!d || s === 'Done' || s === 'Closed') return false;
    const diff = (new Date(d).getTime() - new Date(TODAY).getTime()) / (864e5);
    return diff >= 0 && diff <= 7;
  };

  const fd = (d: string | null | undefined) => {
    if (!d) return '—';
    try {
      const dateStr = d.includes('T') ? d.split('T')[0] : d;
      const dt = new Date(dateStr + 'T00:00:00');
      return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
    } catch (e) {
      return d;
    }
  };

  const formatTimeIST12h = (timeStr?: string | null) => {
    if (!timeStr) return '—';
    if (timeStr.toLowerCase().includes('am') || timeStr.toLowerCase().includes('pm')) {
      return timeStr;
    }
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return timeStr;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hh = h % 12 === 0 ? 12 : h % 12;
    const mm = String(m).padStart(2, '0');
    return `${String(hh).padStart(2, '0')}:${mm} ${ampm}`;
  };

  const formatDateTimeIST = (dtStr: string | Date | null | undefined) => {
    if (!dtStr) return '—';
    try {
      const date = new Date(dtStr);
      if (isNaN(date.getTime())) return String(dtStr);
      return date.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch (e) {
      return String(dtStr);
    }
  };
  const projNum = (v: any) => {
    if (v === '' || v == null) return 0;
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };

  const fmtCr = (v: any) => {
    const n = projNum(v);
    return '₹' + (Math.abs(n % 1) < 0.005 ? n.toFixed(0) : n.toFixed(2)) + ' Cr';
  };

  const BUS = ['PS-IPP/Utility', 'PS-Ind', 'Renewables LB EPC', 'Renewables C&I', 'Amtek', 'PDP'];

  const getWeekDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const dow = firstOfMonth.getDay();
    const weekStart = new Date(firstOfMonth);
    weekStart.setDate(firstOfMonth.getDate() - dow);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      days.push(d);
    }
    return days;
  };



  const [projView, setProjView] = useState<'grid' | 'table'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('projView') as 'grid' | 'table') || 'grid';
    }
    return 'grid';
  });

  useEffect(() => {
    api.get('/settings/public')
      .then(res => {
        if (res) {
          setBranding(res);
          document.title = res.app_name || 'HARTEK CMD Office';
          if (res.primary_color) {
            document.documentElement.style.setProperty('--navy', res.primary_color);
          }
          if (res.accent_color) {
            document.documentElement.style.setProperty('--accent', res.accent_color);
          }
          if (res.app_header_height) {
            document.documentElement.style.setProperty('--header-height', res.app_header_height);
          }
          if (res.app_logo_width) {
            document.documentElement.style.setProperty('--logo-width', res.app_logo_width);
          }
          if (res.app_logo_spacing) {
            document.documentElement.style.setProperty('--logo-spacing', res.app_logo_spacing);
          }
        }
      })
      .catch(() => { });
  }, []);

  // Drag and drop states
  const [draggedMeetingId, setDraggedMeetingId] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // INITIALIZATION AND SYNC
  // -------------------------------------------------------------------------
  // Redirect Admin to /admin
  useEffect(() => {
    if (user && user.role === 'Admin') {
      router.push('/admin');
    }
  }, [user, router]);

  // Tab permission redirection check
  useEffect(() => {
    if (user) {
      const tabsMap = [
        { key: 'dashboard', resource: 'Dashboard' },
        { key: 'projects', resource: 'Projects' },
        { key: 'calendar', resource: 'Calendar' },
        { key: 'tasks', resource: 'Tasks' },
        { key: 'actions', resource: 'Actions' },
        { key: 'escalations', resource: 'Escalations' },
        { key: 'followups', resource: 'Followups' },
        { key: 'legal', resource: 'Legal' },
        { key: 'notepad', resource: 'Notepad' },
      ];

      const isAllowed = (tabKey: string) => {
        const found = tabsMap.find(t => t.key === tabKey);
        if (!found) return true;
        return hasPermission('View', found.resource);
      };

      if (!isAllowed(activeTab)) {
        const firstAllowed = tabsMap.find(t => hasPermission('View', t.resource));
        if (firstAllowed) {
          setActiveTab(firstAllowed.key);
        }
      }
    }
  }, [user, activeTab, hasPermission]);

  useEffect(() => {
    if (user) {
      fetchMasterData();
      refreshAllData();
      triggerClock();
    }
  }, [user]);

  const triggerClock = () => {
    const updateClock = () => {
      const clock = document.getElementById('clock-span');
      if (clock) {
        const timeOptions = { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true } as const;
        clock.textContent = new Date().toLocaleTimeString('en-IN', timeOptions);
      }
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  };

  const calculateTotalClaims = () => {
    let totalInCr = 0;
    legalCases.forEach(c => {
      if (!c.claim) return;
      const digits = c.claim.replace(/[^0-9]/g, '');
      const val = parseInt(digits, 10);
      if (isNaN(val)) return;

      if (c.claim.toLowerCase().includes('lakh')) {
        totalInCr += (val * 100000) / 10000000;
      } else if (c.claim.toLowerCase().includes('cr') || c.claim.toLowerCase().includes('crore')) {
        const decMatch = c.claim.match(/[0-9.]+/);
        if (decMatch) {
          totalInCr += parseFloat(decMatch[0]);
        }
      } else {
        if (val > 100000) {
          totalInCr += val / 10000000;
        } else {
          totalInCr += val;
        }
      }
    });
    return `₹${totalInCr.toFixed(2)} Cr`;
  };

  const showToast = (text: string, type: 'ok' | 'warn' | 'err' | '' = '') => {
    const id = Math.random().toString();
    setToasts(prev => [...prev, { id, text, type }]);

    // Add activity log to notifications list
    setNotifications(prev => [
      { id: Math.random().toString(), text, time: 'Just now', unread: true },
      ...prev.slice(0, 15),
    ]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const fetchMasterData = async () => {
    try {
      // Fetch master dropdown options from backend
      const depts = await api.get('/projects/departments').catch(() => []);
      const dbUsers = await api.get('/users').catch(() => []);

      if (depts && depts.length > 0) {
        setDepartments(depts);
      } else {
        // Fallback metadata for static lists with valid UUIDs
        setDepartments([
          { id: '45b85a38-c67d-4190-b962-a5d6f3b06e8b', name: 'PS-IPP/Utility' },
          { id: '398bc01d-5b32-475f-9721-a080c9e6bb07', name: 'PS-Ind' },
          { id: 'f9a1cb1c-4b53-4882-b7e6-8c7e48bde904', name: 'Renewables LB EPC' },
          { id: '72a91176-6638-4e89-982c-47bc9dfb7eb1', name: 'Renewables C&I' },
          { id: 'a04b12c7-ee93-4a1c-882d-de7c5417ab8c', name: 'Amtek' },
          { id: 'f59ab410-b961-468e-a221-a9fbc1025a1e', name: 'PDP' },
        ]);
      }

      setUsersList(dbUsers);
    } catch (e) { }
  };

  const refreshAllData = async () => {
    try {
      // Fetch data streams in parallel
      const [
        projectsList,
        meetingsList,
        tasksList,
        actionsList,
        escalationsList,
        followupsList,
        legalList,
        notepadList,
        dashboardStats,
      ] = await Promise.all([
        api.get('/projects'),
        api.get('/meetings'),
        api.get('/tasks'),
        api.get('/action-items'),
        api.get('/escalations'),
        api.get('/follow-ups'),
        api.get('/legal-cases'),
        api.get('/notepad'),
        api.get('/dashboard/stats').catch(() => ({
          employeesCount: 0,
          customersCount: 0,
          vendorsCount: 0,
          workflowsCount: 0,
          auditLogsCount: 0,
          totalBilled: 0.0
        })),
      ]);

      setProjects(projectsList);
      setMeetings(meetingsList);
      setTasks(tasksList);
      setActions(actionsList);
      setEscalations(escalationsList);
      setFollowups(followupsList);
      setLegalCases(legalList);
      setNotes(notepadList);
      setStats(dashboardStats);

      // Load notepad active note
      if (notepadList.length > 0) {
        const active = notepadList[0];
        setActiveNoteId(active.id);
        setNoteTitleInput(active.title);
        setNoteTextInput((active.text || '').replace(/<!-- item_id: [a-f0-9-]+ -->/g, ''));
      } else {
        // Create initial quick note if empty
        const initialNote = await api.post('/notepad', { title: 'Quick Notes', text: '' });
        setNotes([initialNote]);
        setActiveNoteId(initialNote.id);
        setNoteTitleInput(initialNote.title);
        setNoteTextInput((initialNote.text || '').replace(/<!-- item_id: [a-f0-9-]+ -->/g, ''));
      }

      if (user && user.role === 'Admin') {
        const auditData = await api.get('/audit-logs?limit=30').catch(() => ({ logs: [] }));
        setAuditLogs(auditData.logs || []);
      }
    } catch (error) {
      showToast('Error syncing dashboard data stream', 'err');
      logout();
    }
  };

  // -------------------------------------------------------------------------
  // CALENDAR RENDER ENGINE
  // -------------------------------------------------------------------------
  const renderCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const days = [];

    // Prepend previous month's trailing days
    for (let i = firstDay - 1; i >= 0; i--) {
      const dayDate = new Date(year, month - 1, prevMonthDays - i);
      days.push({ day: prevMonthDays - i, isCurrent: false, date: dayDate });
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      const dayDate = new Date(year, month, i);
      days.push({ day: i, isCurrent: true, date: dayDate });
    }

    // Append next month's leading days to fill grid (35 or 42 cells)
    const gridCount = days.length <= 35 ? 35 : 42;
    const appendDays = gridCount - days.length;
    for (let i = 1; i <= appendDays; i++) {
      const dayDate = new Date(year, month + 1, i);
      days.push({ day: i, isCurrent: false, date: dayDate });
    }

    return days;
  };

  const getCalendarMonthLabel = () => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[currentDate.getMonth()];
  };

  const handleMonthNav = (direction: 'prev' | 'next') => {
    const offset = direction === 'next' ? 1 : -1;
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1));
  };

  // Drag and drop reschedule handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedMeetingId(id);
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetDateStr: string) => {
    e.preventDefault();
    const id = draggedMeetingId || e.dataTransfer.getData('text/plain');
    if (!id) return;

    try {
      await api.put(`/meetings/${id}/reschedule`, { date: targetDateStr });
      showToast('Meeting rescheduled successfully', 'ok');
      setDraggedMeetingId(null);
      refreshAllData();
    } catch (err: any) {
      showToast(err.message || 'Reschedule failed', 'err');
    }
  };

  // -------------------------------------------------------------------------
  // AUDIT LOG DELTA DISPLAY HELPERS
  // -------------------------------------------------------------------------
  const renderDelta = (oldValues: any, newValues: any) => {
    if (!oldValues) return <span style={{ color: '#2563eb' }}>Initial state creation</span>;

    const changes: string[] = [];
    const keys = Object.keys(newValues || {});

    keys.forEach(k => {
      if (['updatedAt', 'createdAt', 'deletedAt', 'notepadTs'].includes(k)) return;

      const oldVal = oldValues[k];
      const newVal = newValues[k];

      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push(`${k}: "${oldVal ?? 'None'}" ➔ "${newVal ?? 'None'}"`);
      }
    });

    if (changes.length === 0) return <span style={{ color: '#6b7280' }}>No field changes</span>;

    return (
      <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11px', lineHeight: 1.4 }}>
        {changes.slice(0, 4).map((ch, idx) => (
          <li key={idx} style={{ color: '#d97706' }}>{ch}</li>
        ))}
        {changes.length > 4 && <li>+ {changes.length - 4} more edits</li>}
      </ul>
    );
  };

  // -------------------------------------------------------------------------
  // FORM & MODAL ACTIONS
  // -------------------------------------------------------------------------
  const openAddModal = (modalId: string, prefill: any = {}) => {
    setOpenModalId(modalId);
    setFormData({ ...prefill });
    setFileAttachments([]);
  };

  const openEditModal = (modalId: string, record: any) => {
    setOpenModalId(modalId);
    // Parse dates to YYYY-MM-DD
    const parsed = { ...record };
    if (parsed.odate) parsed.odate = getLocalDateString(new Date(parsed.odate));
    if (parsed.cod) parsed.cod = getLocalDateString(new Date(parsed.cod));
    if (parsed.rcod) parsed.rcod = getLocalDateString(new Date(parsed.rcod));
    if (parsed.mdate) parsed.mdate = getLocalDateString(new Date(parsed.mdate));

    // Parse delegation target JSON array if stringified
    if (parsed.assignedTo && typeof parsed.assignedTo === 'string') {
      try {
        parsed.assignedTo = JSON.parse(parsed.assignedTo);
      } catch (e) { }
    }

    setFormData(parsed);
    setFileAttachments(record.attachments || []);
  };

  const handleFormInputChange = (key: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleAttachmentFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = reader.result as string;
        const newAttachment = {
          name: file.name,
          type: file.type,
          size: file.size,
          data: base64Data
        };
        setFormData((prev: any) => ({
          ...prev,
          attachments: [...(prev.attachments || []), newAttachment]
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveAttachment = (index: number) => {
    setFormData((prev: any) => ({
      ...prev,
      attachments: (prev.attachments || []).filter((_: any, idx: number) => idx !== index)
    }));
  };

  const handleFormSubmit = async (e: React.FormEvent, endpoint: string) => {
    e.preventDefault();
    const id = formData.id;

    if (endpoint === '/tasks' && (!formData.assigneeIds || formData.assigneeIds.length === 0)) {
      showToast('Please select at least one assignee', 'err');
      return;
    }
    if ((endpoint === '/action-items' || endpoint === '/escalations') && (!formData.assignedTo || formData.assignedTo.length === 0)) {
      showToast('Please select at least one assignee', 'err');
      return;
    }

    try {
      if (id) {
        // Edit Mode
        await api.put(`${endpoint}/${id}`, formData);
        showToast('Record updated successfully', 'ok');
      } else {
        // Add Mode
        await api.post(endpoint, formData);
        showToast('Record created successfully', 'ok');
      }
      setOpenModalId(null);
      refreshAllData();
    } catch (err: any) {
      showToast(err.message || 'Operation failed', 'err');
    }
  };

  const handleRecordDelete = async (endpoint: string, id: string) => {
    if (!confirm('Are you sure you want to delete this record? This action will write to audit logs.')) return;

    try {
      await api.delete(`${endpoint}/${id}`);
      showToast('Record deleted successfully', 'ok');

      // Close detail modal if open
      setSelectedProject(null);
      setSelectedMeeting(null);
      setSelectedTask(null);
      setSelectedAction(null);
      setSelectedEscalation(null);
      setSelectedFollowup(null);
      setSelectedLegal(null);

      refreshAllData();
    } catch (err: any) {
      showToast(err.message || 'Delete failed', 'err');
    }
  };

  // -------------------------------------------------------------------------
  // DIRECT RECORD STATE CHANGERS (Toggles)
  // -------------------------------------------------------------------------
  const cycleTaskStatus = async (task: any) => {
    const statuses = ['Open', 'In Progress', 'Done', 'Closed'];
    const nextIdx = (statuses.indexOf(task.st) + 1) % statuses.length;
    const nextSt = statuses[nextIdx];

    try {
      await api.put(`/tasks/${task.id}/status`, { status: nextSt });
      showToast(`Task status changed to: ${nextSt}`, 'ok');
      refreshAllData();
    } catch (e) {
      showToast('Failed to toggle task status', 'err');
    }
  };

  const cycleTaskPriority = async (task: any) => {
    const priorities = ['High', 'Medium', 'Low'];
    const nextIdx = (priorities.indexOf(task.pri) + 1) % priorities.length;
    const nextPri = priorities[nextIdx];

    try {
      await api.put(`/tasks/${task.id}`, { pri: nextPri });
      showToast(`Task priority changed to: ${nextPri}`, 'ok');
      refreshAllData();
    } catch (e) {
      showToast('Failed to toggle task priority', 'err');
    }
  };

  const reopenTask = async (task: any, status: string) => {
    if (!status) return;
    try {
      await api.put(`/tasks/${task.id}`, { st: status, cd: '' });
      showToast(`Task reopened as: ${status}`, 'ok');
      refreshAllData();
    } catch (e) {
      showToast('Failed to reopen task', 'err');
    }
  };



  const cycleActionStatus = async (item: any) => {
    const statuses = ['Open', 'In Progress', 'Done', 'Closed'];
    const nextIdx = (statuses.indexOf(item.st) + 1) % statuses.length;
    const nextSt = statuses[nextIdx];

    try {
      await api.put(`/action-items/${item.id}/status`, { status: nextSt });
      showToast(`Action status changed to: ${nextSt}`, 'ok');
      refreshAllData();
    } catch (e) {
      showToast('Failed to toggle action status', 'err');
    }
  };

  const cycleActionPriority = async (item: any) => {
    const priorities = ['High', 'Medium', 'Low'];
    const nextIdx = (priorities.indexOf(item.pri) + 1) % priorities.length;
    const nextPri = priorities[nextIdx];

    try {
      await api.put(`/action-items/${item.id}/priority`, { priority: nextPri });
      showToast(`Action priority changed to: ${nextPri}`, 'ok');
      refreshAllData();
    } catch (e) {
      showToast('Failed to cycle priority', 'err');
    }
  };

  const cycleEscalationStatus = async (esc: any) => {
    const statuses = ['In Progress', 'Escalated', 'Resolved', 'Closed'];
    const nextIdx = (statuses.indexOf(esc.st) + 1) % statuses.length;
    const nextSt = statuses[nextIdx];

    try {
      await api.put(`/escalations/${esc.id}/status`, { status: nextSt });
      showToast(`Escalation status changed to: ${nextSt}`, 'ok');
      refreshAllData();
    } catch (e) {
      showToast('Failed to toggle status', 'err');
    }
  };

  const cycleFollowupStatus = async (fu: any) => {
    const statuses = ['Open', 'In Progress', 'Done', 'Closed'];
    const nextIdx = (statuses.indexOf(fu.st) + 1) % statuses.length;
    const nextSt = statuses[nextIdx];

    try {
      await api.put(`/follow-ups/${fu.id}/status`, { status: nextSt });
      showToast(`Follow-up status changed to: ${nextSt}`, 'ok');
      refreshAllData();
    } catch (e) {
      showToast('Failed to toggle status', 'err');
    }
  };

  const updateMeetingStatus = async (meetingId: string, status: string) => {
    try {
      await api.put(`/meetings/${meetingId}/status`, { status });
      showToast(`Meeting status marked: ${status}`, 'ok');
      refreshAllData();
      if (selectedMeeting) {
        setSelectedMeeting((prev: any) => ({ ...prev, status }));
      }
    } catch (e) {
      showToast('Failed to update meeting status', 'err');
    }
  };

  const saveQuickAttendees = async (mtgId: string) => {
    try {
      const updated = await api.put(`/meetings/${mtgId}`, {
        ...selectedMeeting,
        attendees: quickAttendeesVal
      });
      setSelectedMeeting(updated);
      setMeetings(prev => prev.map(m => m.id === mtgId ? updated : m));
      setEditingAttendeesId(null);
      showToast('Attendees updated successfully', 'ok');
    } catch (err: any) {
      showToast(err.message || 'Failed to update attendees', 'err');
    }
  };

  const handleAddAttachmentToRecord = async (
    e: React.ChangeEvent<HTMLInputElement>,
    endpoint: string,
    record: any,
    setSelectedRecord: (r: any) => void,
    recordsStateSetter?: (updater: (prev: any[]) => any[]) => void
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      const newAttachment = {
        name: file.name,
        type: file.type,
        size: file.size,
        data: base64Data
      };

      const updatedAttachments = [...(record.attachments || []), newAttachment];
      try {
        showToast('Uploading attachment...', '');
        const updated = await api.put(`${endpoint}/${record.id}`, {
          ...record,
          attachments: updatedAttachments
        });
        setSelectedRecord(updated);
        if (recordsStateSetter) {
          recordsStateSetter((prev: any[]) => prev.map((r: any) => r.id === record.id ? updated : r));
        }
        showToast('Attachment uploaded successfully', 'ok');
      } catch (err: any) {
        showToast(err.message || 'Upload failed', 'err');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleLegalCsvSync = async (e: React.ChangeEvent<HTMLInputElement>, mode: 'smartSync' | 'replace') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    showToast(`Uploading Legal MIS sheet (${mode === 'smartSync' ? 'Smart Sync' : 'Full Replace'})...`, '');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const apiBase = getApiBaseUrl();
      const response = await fetch(`${apiBase}/legal-cases/import?mode=${mode}`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Litigation sheet sync failed');
      }

      const res = await response.json();
      showToast(res.message || 'Legal Sync completed successfully', 'ok');
      refreshAllData();
    } catch (err: any) {
      showToast(err.message || 'MIS Import failed', 'err');
    }
  };

  // -------------------------------------------------------------------------
  // NOTEPAD AUTOSAVE LIFECYCLE
  // -------------------------------------------------------------------------
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const getFullNoteTextWithComment = (noteId: string, cleanText: string) => {
    const note = notes.find(n => n.id === noteId);
    const commentMatch = note?.text?.match(/<!-- item_id: [a-f0-9-]+ -->/);
    const comment = commentMatch ? `\n${commentMatch[0]}` : '';
    const strippedText = (cleanText || '').replace(/<!-- item_id: [a-f0-9-]+ -->/g, '');
    return strippedText + comment;
  };

  const latestTitleRef = useRef(noteTitleInput);
  const latestTextRef = useRef(noteTextInput);
  latestTitleRef.current = noteTitleInput;
  latestTextRef.current = noteTextInput;

  const triggerAutosave = () => {
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = setTimeout(async () => {
      if (!activeNoteId) return;
      try {
        const fullText = getFullNoteTextWithComment(activeNoteId, latestTextRef.current);
        await api.put(`/notepad/${activeNoteId}`, {
          title: latestTitleRef.current || 'Untitled Note',
          text: fullText,
        });
        const autosaveLabel = document.getElementById('np-autosave-label');
        if (autosaveLabel) {
          autosaveLabel.textContent = `Auto-saved at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
        }
      } catch (e) { }
    }, 1200);
  };

  const handleNotepadChange = (text: string) => {
    const cleanText = (text || '').replace(/<!-- item_id: [a-f0-9-]+ -->/g, '');
    setNoteTextInput(cleanText);
    setNotes(prev => prev.map(n => n.id === activeNoteId ? { ...n, text, ts: new Date().toISOString() } : n));
    triggerAutosave();
  };

  const handleNotepadClear = async () => {
    const confirmationText = "CONFIRM CLEAR";
    const userInput = prompt(`Type "${confirmationText}" to verify you want to clear all drafts from the notepad workspace. This action is permanent and cannot be undone:`);
    if (userInput !== confirmationText) {
      if (userInput !== null) {
        showToast('Confirmation failed. Workspace was not cleared.', 'warn');
      }
      return;
    }
    try {
      await api.delete('/notepad/clear');
      showToast('Notepad cleared', 'ok');
      refreshAllData();
      setActiveNoteId(null);
      setNoteTitleInput('');
      setNoteTextInput('');
    } catch (e) {
      showToast('Clear notepad failed', 'err');
    }
  };

  const handleCreateNote = async () => {
    try {
      const newNote = await api.post('/notepad', {
        title: 'Untitled Note',
        text: '',
      });
      setNotes(prev => [newNote, ...prev]);
      setActiveNoteId(newNote.id);
      setNoteTitleInput(newNote.title);
      setNoteTextInput('');
      showToast('New note created', 'ok');
    } catch (e) {
      showToast('Failed to create note', 'err');
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    const targetNote = notes.find(n => n.id === noteId);
    if (!targetNote) return;
    if (!confirm(`Delete note "${targetNote.title}"?`)) return;
    try {
      await api.delete(`/notepad/${noteId}`);
      const updatedNotes = notes.filter(n => n.id !== noteId);
      setNotes(updatedNotes);
      showToast('Note deleted', 'ok');

      if (activeNoteId === noteId) {
        if (updatedNotes.length > 0) {
          const nextNote = updatedNotes[0];
          setActiveNoteId(nextNote.id);
          setNoteTitleInput(nextNote.title);
          setNoteTextInput((nextNote.text || '').replace(/<!-- item_id: [a-f0-9-]+ -->/g, ''));
        } else {
          const blankNote = await api.post('/notepad', { title: 'Quick Notes', text: '' });
          setNotes([blankNote]);
          setActiveNoteId(blankNote.id);
          setNoteTitleInput(blankNote.title);
          setNoteTextInput((blankNote.text || '').replace(/<!-- item_id: [a-f0-9-]+ -->/g, ''));
        }
      }
    } catch (e) {
      showToast('Failed to delete note', 'err');
    }
  };

  const handleDuplicateNote = async (noteId: string) => {
    const noteToDup = notes.find(n => n.id === noteId);
    if (!noteToDup) return;
    try {
      const newNote = await api.post('/notepad', {
        title: `Copy of ${noteToDup.title}`,
        text: noteToDup.text || '',
      });
      setNotes(prev => [newNote, ...prev]);
      setActiveNoteId(newNote.id);
      setNoteTitleInput(newNote.title);
      setNoteTextInput((newNote.text || '').replace(/<!-- item_id: [a-f0-9-]+ -->/g, ''));
      showToast('Note duplicated', 'ok');
    } catch (e) {
      showToast('Failed to duplicate note', 'err');
    }
  };

  const handleFormat = (type: 'bold' | 'italic' | 'underline' | 'list') => {
    const ta = document.getElementById('np-editor-textarea') as HTMLTextAreaElement;
    if (!ta) return;

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    const selected = text.substring(start, end);

    let replacement = '';
    let offset = 0;
    if (type === 'bold') {
      replacement = `**${selected || 'bold text'}**`;
      offset = selected ? 0 : 2;
    } else if (type === 'italic') {
      replacement = `*${selected || 'italic text'}*`;
      offset = selected ? 0 : 1;
    } else if (type === 'underline') {
      replacement = `<u>${selected || 'underlined text'}</u>`;
      offset = selected ? 0 : 3;
    } else if (type === 'list') {
      replacement = selected
        ? selected.split('\n').map(line => line.startsWith('- ') ? line : `- ${line}`).join('\n')
        : '- List item';
    }

    const newText = text.substring(0, start) + replacement + text.substring(end);
    setNoteTextInput(newText);

    if (activeNoteId) {
      setNotes(prev => prev.map(n => n.id === activeNoteId ? { ...n, text: newText, ts: new Date().toISOString() } : n));
      api.put(`/notepad/${activeNoteId}`, { title: noteTitleInput, text: newText });
    }

    setTimeout(() => {
      ta.focus();
      if (selected) {
        ta.setSelectionRange(start, start + replacement.length);
      } else {
        const cursor = start + offset;
        ta.setSelectionRange(cursor, cursor + (type === 'list' ? 9 : 4));
      }
    }, 50);
  };



  const isHearingThisWeek = (dateStr: string) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return false;
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    return date >= startOfWeek && date <= endOfWeek;
  };

  const uniqueCourts = Array.from(new Set(legalCases.map((c: any) => c.court).filter(Boolean)));
  const uniqueEntities = Array.from(new Set(legalCases.map((c: any) => c.entity).filter(Boolean)));

  const exportLegalMIS = () => {
    if (!legalCases || !legalCases.length) {
      showToast('No cases to export', 'err');
      return;
    }
    const headers = ['S.No.', 'Nature', 'Title', 'Case No.', 'Court', 'Entity', 'Counsel', 'Internal', 'LDOH', 'NDOH', 'Status', 'Risk', 'Claim (₹)', 'Critical Update', 'Action Required'];
    const rows = [headers];
    legalCases.forEach((c, i) => {
      rows.push([
        String(i + 1),
        c.nature || '',
        c.title || '',
        c.caseNo || '',
        c.court || '',
        c.entity || '',
        c.counsel || '',
        c.handler || '',
        c.ldoh || '',
        c.ndoh || '',
        c.status || '',
        c.risk || '',
        String(c.claim || 'NIL'),
        c.update || '',
        c.actionRequired || '',
      ]);
    });
    const csvContent = rows
      .map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Legal-MIS-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Legal MIS exported successfully', 'ok');
  };

  const exportFollowups = () => {
    if (!followups.length) {
      showToast('No follow-ups to export', 'err');
      return;
    }
    const headers = ['S.No.', 'Priority', 'Business Unit', 'BU Head', 'Project / Subject', 'Follow up with', 'Deadline', 'Status'];
    const rows = [headers];
    followups.forEach((f, i) => {
      rows.push([
        String(i + 1),
        f.priority || '',
        f.bu || '',
        f.hd || '',
        f.proj || '',
        f.with || '',
        f.dl || '',
        f.st || '',
      ]);
    });
    const csvContent = rows
      .map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Followups-Export-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Follow-ups exported successfully', 'ok');
  };

  const exportActions = () => {
    if (!actions.length) {
      showToast('No actions to export', 'err');
      return;
    }
    const headers = ['S.No.', 'Action Directive', 'Source Meeting', 'Owner', 'Department', 'Priority', 'Due Date', 'Status'];
    const rows = [headers];
    actions.forEach((a, i) => {
      rows.push([
        String(i + 1),
        a.item || '',
        a.meetingName || '',
        a.own || '',
        a.dept || '',
        a.pri || '',
        a.due || '',
        a.st || '',
      ]);
    });
    const csvContent = rows
      .map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Actions-Export-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Actions list exported successfully', 'ok');
  };

  const exportProjects = () => {
    if (!projects.length) {
      showToast('No projects to export', 'err');
      return;
    }
    const headers = ['Project', 'BU', 'Client', 'Location', 'PM', 'Stage', 'Health', 'Order(Cr)', 'Billed(Cr)', 'Collected(Cr)', 'Outstanding(Cr)', 'Order Date', 'Scheduled COD', 'Revised COD', 'Next Milestone', 'Milestone Date', 'Risks', 'Remarks'];
    const body = projects.map(p => {
      const out = (projNum(p.billed) - projNum(p.collected)).toFixed(2);
      return [
        p.name,
        p.bu,
        p.client,
        p.loc,
        p.pm,
        p.stage,
        p.health,
        projNum(p.order),
        projNum(p.billed),
        projNum(p.collected),
        out,
        p.odate,
        p.cod,
        p.rcod,
        p.milestone,
        p.mdate,
        (p.risks || '').replace(/\n/g, ' '),
        (p.rem || '').replace(/\n/g, ' ')
      ];
    });
    const csvContent = '\ufeff' + [headers].concat(body)
      .map(r => r.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `HARTEK-Projects-${TODAY}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('📤 Projects exported (CSV)', 'ok');
  };

  const exportEscalations = () => {
    if (!escalations.length) {
      showToast('No escalations to export', 'err');
      return;
    }
    const headers = ['Code', 'Project', 'Type', 'Severity', 'Raised By', 'Date', 'Status', 'Details', 'Actions Plan'];
    const body = escalations.map(e => [
      e.code,
      e.proj,
      e.type,
      e.sev,
      e.by,
      e.date,
      e.st,
      (e.details || '').replace(/\n/g, ' '),
      (e.act || '').replace(/\n/g, ' ')
    ]);
    const csvContent = '\ufeff' + [headers].concat(body)
      .map(r => r.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `HARTEK-Escalations-${TODAY}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('📤 Escalations exported (CSV)', 'ok');
  };



  // -------------------------------------------------------------------------
  // RENDERING COMPONENTS FOR EACH MODULE TABS
  // -------------------------------------------------------------------------

  // Tab change wrapper
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    // Auto-scroll to top of container
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f2a4a', color: '#fff', fontFamily: 'sans-serif' }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Loading Command Center...</h3>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Computed dashboard stats & widgets to match original HTML exactly
  const oa = actions.filter(a => a.st !== 'Done' && a.st !== 'Closed');
  const od = oa.filter(a => isOD(a.due, a.st));
  const ce = escalations.filter(e => e.sev === 'Critical' && e.st !== 'Closed' && e.st !== 'Resolved');
  const he = escalations.filter(e => e.sev === 'High' && e.st !== 'Closed' && e.st !== 'Resolved');
  const of2 = followups.filter(f => f.st !== 'Done' && f.st !== 'Closed');
  const sf = of2.filter(f => isSoon(f.dl, f.st));
  const upMtgs = meetings.filter(m => {
    if (m.status !== 'scheduled') return false;
    const mDate = m.date.includes('T') ? m.date.split('T')[0] : m.date;
    const sevenDaysLater = new Date(Date.now() + 7 * 864e5).toISOString().split('T')[0];
    return mDate >= TODAY && mDate <= sevenDaysLater;
  });
  const resolvedEscCount = escalations.filter(e => e.st === 'Resolved' || e.st === 'Closed').length;

  let activeProjectsCount = 0;
  let completedProjectsCount = 0;
  let orderBookTotal = 0;
  let billedTotal = 0;
  let collectedTotal = 0;
  let projectsAtRiskCount = 0;

  projects.forEach(p => {
    orderBookTotal += projNum(p.order);
    billedTotal += projNum(p.billed);
    collectedTotal += projNum(p.collected);
    if (p.health === 'Red') projectsAtRiskCount++;
    if (p.stage === 'Completed') completedProjectsCount++;
    else if (p.stage !== 'On Hold') activeProjectsCount++;
  });
  const outstandingTotal = billedTotal - collectedTotal;

  const filteredProjects = projects
    .filter(p => {
      if (projSearch) {
        const q = projSearch.toLowerCase();
        const nameMatch = p.name?.toLowerCase().includes(q);
        const clientMatch = p.client?.toLowerCase().includes(q);
        const pmMatch = p.pm?.toLowerCase().includes(q);
        if (!nameMatch && !clientMatch && !pmMatch) return false;
      }
      if (projBu && p.buId !== projBu) return false;
      if (projStage && p.stage !== projStage) return false;
      if (projHealth && p.health !== projHealth) return false;
      return true;
    })
    .sort((a, b) => {
      const rank: Record<string, number> = { Red: 1, Amber: 2, Green: 3 };
      const rankA = rank[a.health] || 4;
      const rankB = rank[b.health] || 4;
      if (rankA !== rankB) return rankA - rankB;
      return (a.name || '').localeCompare(b.name || '');
    });

  const filteredNotes = notes
    .filter(n => {
      if (noteSearchQuery) {
        const q = noteSearchQuery.toLowerCase();
        return (n.title || '').toLowerCase().includes(q) || (n.text || '').toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      if (noteSortOrder === 'title') {
        return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
      } else {
        return new Date(b.ts).getTime() - new Date(a.ts).getTime();
      }
    });


  // Task filtering & security checks
  const isCMD = user?.role === 'CMD';
  const isAdmin = user?.role === 'Admin';
  const hasTaskInbox = true;

  const getEligibleAssignees = () => {
    if (!user) return [];
    const isExecutiveOrAdmin = user.role === 'Admin' || user.role === 'CMD';
    if (isExecutiveOrAdmin) {
      return usersList.filter((u: any) => u.id !== user.id && u.active !== false);
    } else {
      return usersList.filter((u: any) => u.managerId === user.id && u.active !== false);
    }
  };

  const isUserAssigned = (assignedToField: any, userEmail: string) => {
    if (!assignedToField) return false;
    let ids: string[] = [];
    if (Array.isArray(assignedToField)) {
      ids = assignedToField;
    } else if (typeof assignedToField === 'string') {
      try {
        ids = JSON.parse(assignedToField);
      } catch (e) {
        return false;
      }
    }
    const u = usersList.find(usr => usr.email === userEmail);
    return u ? ids.includes(u.id) : false;
  };

  const mineTasks = tasks.filter(t => {
    // Admins and CMD role see all tasks in tracking view.
    if (user?.role === 'Admin' || user?.role === 'CMD') return true;
    // Reporting managers see tasks assigned to them, created by them, or assigned to employees who report to them.
    const isDirectReportAssignee = usersList.some(u => u.managerId === user?.id && u.id === t.assigneeId);
    return t.assigneeId === user?.id || t.assignedById === user?.id || isDirectReportAssignee;
  });

  const matchedTasks = mineTasks.filter(t => {
    if (tkSearch) {
      const q = tkSearch.toLowerCase();
      const hay = [t.title, t.detail, t.note, t.assignee?.name].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (tkAsg && t.assignee?.email !== tkAsg) return false;
    if (tkPri && t.pri !== tkPri) return false;
    if (tkSt && t.st !== tkSt) return false;
    return true;
  });

  const activeTasks = matchedTasks.filter(t => t.st !== 'Done' && t.st !== 'Closed');
  const completedTasks = matchedTasks.filter(t => t.st === 'Done' || t.st === 'Closed');
  const overdueTasksCount = activeTasks.filter(t => isOD(t.due, t.st)).length;

  if (loading || !user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', background: '#f1f4f8', color: '#0f2a4a', fontSize: '16px', fontWeight: 600 }}>
        Loading HARTEK CMD Unified Dashboard...
      </div>
    );
  }

  const hasName = branding.app_name !== '' && branding.app_name !== null && branding.app_name !== undefined;
  const hasSub = branding.app_subtitle !== '' && branding.app_subtitle !== null && branding.app_subtitle !== undefined;

  return (
    <div className="app-layout">
      <div className="main-content">
        {/* TOPBAR */}
        <header className="topbar" style={{ height: 'var(--header-height, 56px)' }}>
          <div className="topbar-inner">
            <div className="tb-left" style={{ gap: 'var(--logo-spacing, 14px)', display: 'flex', alignItems: 'center' }}>
              <button className="hamburger-btn" onClick={() => setDrawerOpen(!drawerOpen)} title="Menu">
                ☰
              </button>
              {!hasName && hasSub ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }}>
                  <div className="logo" style={{ width: 'auto', maxWidth: '150px', height: '28px', background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {branding.app_logo && (branding.app_logo.startsWith('data:') || branding.app_logo.startsWith('http')) ? (
                      <img src={branding.app_logo} alt="Logo" style={{ width: 'auto', height: '100%', maxHeight: '28px', objectFit: 'contain' }} />
                    ) : (
                      branding.app_logo || 'HT'
                    )}
                  </div>
                  <div className="brand-sub" style={{ fontSize: '10px', marginTop: '2px', lineHeight: 1 }}>{branding.app_subtitle}</div>
                </div>
              ) : (
                <>
                  <div className="logo" style={{ width: 'auto', maxWidth: '150px', height: '36px', background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {branding.app_logo && (branding.app_logo.startsWith('data:') || branding.app_logo.startsWith('http')) ? (
                      <img src={branding.app_logo} alt="Logo" style={{ width: 'auto', height: '100%', maxHeight: '36px', objectFit: 'contain' }} />
                    ) : (
                      branding.app_logo || 'HT'
                    )}
                  </div>
                  {(hasName || hasSub) && (
                    <div>
                      {hasName && <div className="brand">{branding.app_name}</div>}
                      {hasSub && <div className="brand-sub">{branding.app_subtitle}</div>}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="tb-right" style={{ position: 'relative' }}>
              {/* LIVE CLOCK */}
              <div className="live-clock">
                🇮🇳 <span id="clock-span">00:00:00</span> IST
              </div>

              {/* NOTIFICATION BELL */}
              <div className="notif-btn" onClick={() => setShowNotifications(!showNotifications)}>
                🔔
                {notifications.length > 0 && (
                  <div className="notif-badge">{notifications.length}</div>
                )}
              </div>

              {/* ACTIVE USER PILL */}
              <div className="user-pill" onClick={() => setShowProfileDropdown(!showProfileDropdown)} title="Click to view profile">
                <div className="user-av">{user?.initials || 'US'}</div>
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
                      top: '50px',
                      right: '0',
                      width: '280px',
                      background: '#fff',
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                      zIndex: 200,
                      padding: '16px',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      color: 'var(--text)'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--navy)' }}>{user?.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', wordBreak: 'break-all' }}>{user?.email}</div>
                    </div>
                    <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: 0 }} />
                    <button 
                      className="btn-add" 
                      style={{ width: '100%', background: '#b91c1c', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, textAlign: 'center' }}
                      onClick={() => {
                        setShowProfileDropdown(false);
                        logout();
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

        {/* TABS MENU */}
        <nav className={`tabs ${drawerOpen ? 'open' : ''}`}>
          <div className="tabs-inner">
            <div className="sidebar-brand-header" style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '16px', borderBottom: '1px solid var(--border)', marginBottom: '16px' }}>
              <div className="logo" style={{ width: 'auto', maxWidth: '120px', height: '30px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>
                {branding.app_logo && (branding.app_logo.startsWith('data:') || branding.app_logo.startsWith('http')) ? (
                  <img src={branding.app_logo} alt="Logo" style={{ width: 'auto', height: '100%', maxHeight: '30px', objectFit: 'contain' }} />
                ) : (
                  branding.app_logo || 'HT'
                )}
              </div>
              {hasName && (
                <div className="sidebar-brand-text">
                  <div className="brand" style={{ color: 'var(--navy)', fontSize: '16px', fontWeight: 700, letterSpacing: '-0.2px' }}>
                    {branding.app_name}
                  </div>
                </div>
              )}
            </div>
            {hasPermission('View', 'Dashboard') && (
              <div className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => { handleTabChange('dashboard'); setDrawerOpen(false); }}>
                📊 Overview
              </div>
            )}
            {hasPermission('View', 'Projects') && (
              <div className={`tab ${activeTab === 'projects' ? 'active' : ''}`} onClick={() => { handleTabChange('projects'); setDrawerOpen(false); }}>
                🚧 Projects
                {projects.filter(p => p.health === 'Red').length > 0 && (
                  <span className="badge badge-red">{projects.filter(p => p.health === 'Red').length}</span>
                )}
              </div>
            )}
            {hasPermission('View', 'Calendar') && (
              <div className={`tab ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => { handleTabChange('calendar'); setDrawerOpen(false); }}>
                📅 Calendar
              </div>
            )}
            {hasPermission('View', 'Tasks') && (
              <div className={`tab ${activeTab === 'tasks' ? 'active' : ''}`} onClick={() => { handleTabChange('tasks'); setDrawerOpen(false); }}>
                📌 Assigned by CMD
              </div>
            )}
            {hasPermission('View', 'Actions') && (
              <div className={`tab ${activeTab === 'actions' ? 'active' : ''}`} onClick={() => { handleTabChange('actions'); setDrawerOpen(false); }}>
                ⚡ Actions
                {actions.filter(a => a.st === 'Open' || a.st === 'In Progress').length > 0 && (
                  <span className="badge badge-amber">{actions.filter(a => a.st === 'Open' || a.st === 'In Progress').length}</span>
                )}
              </div>
            )}
            {hasPermission('View', 'Escalations') && (
              <div className={`tab ${activeTab === 'escalations' ? 'active' : ''}`} onClick={() => { handleTabChange('escalations'); setDrawerOpen(false); }}>
                ⚠️ Escalations
                {escalations.filter(e => e.st === 'Escalated').length > 0 && (
                  <span className="badge badge-red">{escalations.filter(e => e.st === 'Escalated').length}</span>
                )}
              </div>
            )}
            {hasPermission('View', 'Followups') && (
              <div className={`tab ${activeTab === 'followups' ? 'active' : ''}`} onClick={() => { handleTabChange('followups'); setDrawerOpen(false); }}>
                📞 Followups
              </div>
            )}
            {hasPermission('View', 'Legal') && (
              <div className={`tab ${activeTab === 'legal' ? 'active' : ''}`} onClick={() => { handleTabChange('legal'); setDrawerOpen(false); }}>
                ⚖️ Legal MIS
              </div>
            )}
            
            {hasPermission('View', 'Notepad') && (
              <div className={`tab ${activeTab === 'notepad' ? 'active' : ''}`} onClick={() => { handleTabChange('notepad'); setDrawerOpen(false); }}>
                🗒️ Notepad
              </div>
            )}
            {user?.role === 'Admin' && hasPermission('View', 'AdminControl') && (
              <div className={`tab ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => { handleTabChange('audit'); setDrawerOpen(false); }}>
                🛡️ Audit Logs
              </div>
            )}

            {/* MOBILE ONLY ACTIONS: LOGOUT */}
            <div className="mobile-only-logout-wrapper" style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: '16px', paddingBottom: '20px' }}>
              <div 
                className="tab btn-cancel mobile-logout-btn" 
                onClick={() => {
                  setDrawerOpen(false);
                  logout();
                }}
                style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 500, fontSize: '15px' }}
              >
                🚪 Logout Session
              </div>
            </div>
          </div>
        </nav>
        <div className={`drawer-overlay ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)} />

        {/* NOTIFICATION DRAWER OVERLAY */}
        {showNotifications && (
          <>
            <div className="notif-panel-overlay open" onClick={() => setShowNotifications(false)} />
            <div className="notif-panel open">
              <div className="notif-panel-hdr">
                <div className="notif-panel-title">🔔 Recent Activities log</div>
                <button className="notif-clear" onClick={() => setNotifications([])}>Clear</button>
              </div>
              <div className="notif-list">
                {notifications.length === 0 ? (
                  <div className="notif-empty">
                    <div className="notif-empty-icon">📂</div>
                    <div>No new system notification events</div>
                  </div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} className="notif-item">
                      <div className="notif-icon">🛡️</div>
                      <div className="notif-content">
                        <div className="notif-action">{n.text}</div>
                        <div className="notif-meta">
                          <span>{n.time}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {/* TOASTS GRID CONTAINER */}
        <div className="toast-wrap">
          {toasts.map(t => (
            <div key={t.id} className={`toast show ${t.type ? `toast-${t.type}` : ''}`}>
              {t.text}
            </div>
          ))}
        </div>

        {/* ========================================================================= */}
        {/* PANES CONTAINER */}
        {/* ========================================================================= */}
        <main style={{ minHeight: '80vh' }}>

          {/* TAB 1: OVERVIEW DASHBOARD */}
          <section className={`pane ${activeTab === 'dashboard' ? 'active' : ''}`}>
            <div className="stat-grid">
              <div className="stat-card" style={{ '--accent-color': '#EF9F27', cursor: 'pointer' } as React.CSSProperties} onClick={() => handleTabChange('actions')} title="View all open actions">
                <div className="stat-label">Open Actions</div>
                <div className="stat-value" style={{ color: oa.length > 0 ? '#854F0B' : '#111' }}>{oa.length}</div>
                <div className="stat-sub">{od.length} overdue</div>
              </div>
              <div className="stat-card" style={{ '--accent-color': '#A32D2D', cursor: 'pointer' } as React.CSSProperties} onClick={() => handleTabChange('escalations')} title="View critical escalations">
                <div className="stat-label">Escalations</div>
                <div className="stat-value" style={{ color: ce.length > 0 ? '#A32D2D' : '#111' }}>{ce.length}</div>
                <div className="stat-sub">{he.length} high severity</div>
              </div>
              <div className="stat-card" style={{ '--accent-color': '#185FA5', cursor: 'pointer' } as React.CSSProperties} onClick={() => handleTabChange('followups')} title="View open follow-ups">
                <div className="stat-label">Open Followups</div>
                <div className="stat-value" style={{ color: of2.length > 0 ? '#185FA5' : '#111' }}>{of2.length}</div>
                <div className="stat-sub">{sf.length} due this week</div>
              </div>
              <div className="stat-card" style={{ '--accent-color': '#0F2A4A', cursor: 'pointer' } as React.CSSProperties} onClick={() => handleTabChange('calendar')} title="View meeting calendar">
                <div className="stat-label">Upcoming Mtgs</div>
                <div className="stat-value" style={{ color: upMtgs.length > 0 ? '#0F2A4A' : '#111' }}>{upMtgs.length}</div>
                <div className="stat-sub">next 7 days</div>
              </div>
              <div className="stat-card" style={{ '--accent-color': '#3B6D11', cursor: 'pointer' } as React.CSSProperties} onClick={() => handleTabChange('escalations')} title="View all escalations">
                <div className="stat-label">Total Esc.</div>
                <div className="stat-value">{escalations.length}</div>
                <div className="stat-sub">{resolvedEscCount} resolved</div>
              </div>
            </div>

            <div id="d-alerts"></div>

            <div className="pulse-grid">
              <div className="pulse-card">
                <div className="pulse-title">🔴 Overdue / Critical Actions</div>
                {od.length === 0 ? (
                  <div className="empty">No overdue items 🎉</div>
                ) : (
                  od.slice(0, 5).map(a => (
                    <div key={a.id} className="pulse-item" style={{ cursor: 'pointer' }} onClick={() => { handleTabChange('actions'); setSelectedAction(a); }}>
                      <div className="pdot dot-r" />
                      <div>
                        <strong>{a.own}</strong>: {a.item.slice(0, 65)}{a.item.length > 65 ? '...' : ''}
                        <div style={{ fontSize: '11px', color: '#888' }}>Due {fd(a.due)} · {a.dept}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="pulse-card">
                <div className="pulse-title">⚡ Open Escalations</div>
                {escalations.filter(e => e.st !== 'Closed' && e.st !== 'Resolved').length === 0 ? (
                  <div className="empty">No open escalations</div>
                ) : (
                  escalations
                    .filter(e => e.st !== 'Closed' && e.st !== 'Resolved')
                    .slice(0, 4)
                    .map(e => (
                      <div key={e.id} className="pulse-item" style={{ cursor: 'pointer' }} onClick={() => { handleTabChange('escalations'); setSelectedEscalation(e); }}>
                        <div className={`pdot ${e.sev === 'Critical' ? 'dot-r' : 'dot-a'}`} />
                        <div>
                          <strong>{e.proj.slice(0, 50)}</strong>
                          <div style={{ fontSize: '11px', color: '#888' }}>{e.sev} · {e.type} · {fd(e.date)}</div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>

            <div className="pulse-grid">
              <div className="pulse-card">
                <div className="pulse-title">📅 Upcoming Meetings (Next 7 Days)</div>
                {upMtgs.length === 0 ? (
                  <div className="empty">No upcoming meetings this week</div>
                ) : (
                  upMtgs.slice(0, 5).map(m => (
                    <div key={m.id} className="pulse-item" style={{ cursor: 'pointer' }} onClick={() => setSelectedMeeting(m)}>
                      <div className="pdot dot-b" />
                      <div>
                        <strong>{m.name.slice(0, 55)}</strong>
                        <div style={{ fontSize: '11px', color: '#888' }}>{fd(m.date)}{m.time ? ' · ' + formatTimeIST12h(m.time) : ''} {m.venue ? '· ' + m.venue : ''}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="pulse-card">
                <div className="pulse-title">🔁 Follow-ups Due This Week</div>
                {sf.length === 0 ? (
                  <div className="empty">No follow-ups due this week</div>
                ) : (
                  sf.slice(0, 5).map(f => (
                    <div key={f.id} className="pulse-item" style={{ cursor: 'pointer' }} onClick={() => { handleTabChange('followups'); setSelectedFollowup(f); }}>
                      <div className={`pdot ${f.dl === TODAY ? 'dot-r' : 'dot-a'}`} />
                      <div>
                        <strong>{f.proj.slice(0, 60)}</strong> → {f.with || '—'}
                        <div style={{ fontSize: '11px', color: '#888' }}>Due {fd(f.dl)} · {f.bu || '—'}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
          {/* TAB 2: PROJECTS */}
          <ProjectsTab
            activeTab={activeTab}
            activeProjectsCount={activeProjectsCount}
            projects={projects}
            completedProjectsCount={completedProjectsCount}
            orderBookTotal={orderBookTotal}
            billedTotal={billedTotal}
            collectedTotal={collectedTotal}
            outstandingTotal={outstandingTotal}
            projectsAtRiskCount={projectsAtRiskCount}
            projSearch={projSearch}
            setProjSearch={setProjSearch}
            hasPermission={hasPermission}
            openAddModal={openAddModal}
            projBu={projBu}
            setProjBu={setProjBu}
            projStage={projStage}
            setProjStage={setProjStage}
            projHealth={projHealth}
            setProjHealth={setProjHealth}
            BUS={BUS}
            projView={projView}
            setProjView={(val) => setProjView(val as 'grid' | 'table')}
            exportProjects={exportProjects}
            filteredProjects={filteredProjects}
            setSelectedProject={setSelectedProject}
            projNum={projNum}
            fd={fd}
            fmtCr={fmtCr}
            TODAY={TODAY}
          />

          {/* TAB 3: CALENDAR */}
          <section className={`pane ${activeTab === 'calendar' ? 'active' : ''}`}>
            <div className="toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--navy)' }}>
                <span className="cal-title-desktop">Communication Plan Calendar</span>
                <span className="cal-title-mobile">Calendar</span>
              </div>

              {hasPermission('Create', 'Calendar') && (
                <button className="btn-add" onClick={() => openAddModal('meeting', { date: TODAY })}>
                  + Add Meeting
                </button>
              )}
            </div>

            <div className="cal-wrap">
              {/* View toggles on left, date navigators on right */}
              <div className="cal-hdr-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
                <div className="cal-view-toggle" style={{ display: 'flex', gap: '4px', background: '#f0f0f0', borderRadius: '8px', padding: '3px' }}>
                  <button
                    className={`cvt-btn ${calendarView === 'month' ? 'active' : ''}`}
                    onClick={() => setCalendarView('month')}
                  >
                    Month
                  </button>
                  <button
                    className={`cvt-btn ${calendarView === 'week' ? 'active' : ''}`}
                    onClick={() => setCalendarView('week')}
                  >
                    Week
                  </button>
                  <button
                    className={`cvt-btn ${calendarView === 'list' ? 'active' : ''}`}
                    onClick={() => setCalendarView('list')}
                  >
                    List
                  </button>
                </div>

                <div className="cal-nav" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button className="cal-btn" onClick={() => handleMonthNav('prev')}>‹</button>
                  <div style={{ fontSize: '15px', fontWeight: 700, minWidth: '100px', textAlign: 'center' }}>
                    <span className="cal-month">{getCalendarMonthLabel()}</span>{' '}
                    <span className="cal-year">{currentDate.getFullYear()}</span>
                  </div>
                  <button className="cal-btn" onClick={() => handleMonthNav('next')}>›</button>
                  <button className="cal-btn" onClick={() => setCurrentDate(new Date())} style={{ fontSize: '11px', fontWeight: 600, width: 'auto', padding: '0 10px' }}>Today</button>
                </div>
              </div>

              {/* Legends row aligned under controls */}
              <div className="cal-legends" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11px', marginBottom: '16px', justifyContent: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#0F2A4A', display: 'inline-block' }} />
                  CMD Review
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#1e40af', display: 'inline-block' }} />
                  Board
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#065f46', display: 'inline-block' }} />
                  Monthly Review
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#6b21a8', display: 'inline-block' }} />
                  Vendor
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#c2410c', display: 'inline-block' }} />
                  Safety
                </span>
              </div>

              {calendarView === 'month' ? (
                <div className="cal-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(dow => (
                    <div key={dow} className="cal-dow">{dow}</div>
                  ))}
                  {renderCalendar().map((cell, idx) => {
                    const dateStr = getLocalDateString(cell.date);
                    const dayMeetings = meetings.filter(m => m.date === dateStr);
                    const hasMtg = dayMeetings.length > 0;
                    const isToday = cell.date.toDateString() === new Date().toDateString();

                    return (
                      <div
                        key={idx}
                        className={`cal-day ${cell.isCurrent ? '' : 'other-month'} ${isToday ? 'today' : ''} ${hasMtg ? 'has-meeting' : ''}`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, dateStr)}
                        onClick={() => {
                          if (hasPermission('Create', 'Calendar')) {
                            openAddModal('meeting', { date: dateStr });
                          }
                        }}
                      >
                        <div className="cal-day-num">{cell.day}</div>
                        {dayMeetings.slice(0, 2).map(m => {
                          const cc = m.cat === 'cmd' ? 'cm-cmd' : m.cat === 'board' ? 'cm-board' : m.cat === 'review' ? 'cm-review' : m.cat === 'vendor' ? 'cm-vendor' : m.cat === 'safety' ? 'cm-safety' : 'cm-other';
                          return (
                            <div
                              key={m.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, m.id)}
                              className={`cal-meeting ${cc} ${m.status === 'done' ? 'cm-done' : ''}`}
                              onClick={(e) => { e.stopPropagation(); setSelectedMeeting(m); }}
                              title={`${m.name}\nDrag to move to another date`}
                            >
                              {m.time ? `${formatTimeIST12h(m.time)} ` : ''}{m.name}
                            </div>
                          );
                        })}
                        {dayMeetings.length > 2 && (
                          <div className="cm-more" onClick={(e) => { e.stopPropagation(); setSelectedMeeting(dayMeetings[2]); }}>
                            +{dayMeetings.length - 2} more
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : calendarView === 'week' ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '60px', padding: '8px', background: '#fafafa', border: '1px solid var(--border)' }}>Time</th>
                        {getWeekDays().map((d, index) => {
                          const ds = getLocalDateString(d);
                          const isToday = ds === TODAY;
                          return (
                            <th
                              key={index}
                              style={{
                                padding: '8px',
                                textAlign: 'center',
                                background: isToday ? '#f0f4ff' : '#fafafa',
                                border: '1px solid var(--border)',
                                fontWeight: isToday ? 700 : 500,
                                color: isToday ? 'var(--navy)' : '#555'
                              }}
                            >
                              <div>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]}</div>
                              <div style={{ fontSize: '18px', fontWeight: 700 }}>{d.getDate()}</div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map(h => (
                        <tr key={h}>
                          <td style={{ padding: '8px 6px', textAlign: 'right', fontSize: '10px', color: 'var(--muted)', border: '1px solid #f3f4f6', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                            {h}:00
                          </td>
                          {getWeekDays().map((d, dayIdx) => {
                            const ds = getLocalDateString(d);
                            const dayMtgs = meetings.filter(m => m.date === ds && m.time && parseInt(m.time.split(':')[0]) === h);
                            return (
                              <td
                                key={dayIdx}
                                style={{ border: '1px solid #f3f4f6', padding: '3px', minHeight: '40px', verticalAlign: 'top' }}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, ds)}
                              >
                                {dayMtgs.map(m => {
                                  const cc = m.cat === 'cmd' ? 'cm-cmd' : m.cat === 'board' ? 'cm-board' : m.cat === 'review' ? 'cm-review' : m.cat === 'vendor' ? 'cm-vendor' : m.cat === 'safety' ? 'cm-safety' : 'cm-other';
                                  return (
                                    <div
                                      key={m.id}
                                      className={`cal-meeting ${cc} ${m.status === 'done' ? 'cm-done' : ''}`}
                                      draggable
                                      onDragStart={(e) => handleDragStart(e, m.id)}
                                      style={{ margin: '1px 0' }}
                                      onClick={(e) => { e.stopPropagation(); setSelectedMeeting(m); }}
                                    >
                                      {m.name}
                                    </div>
                                  );
                                })}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: '16px' }}>
                  {meetings.length === 0 ? (
                    <div className="empty">No meetings scheduled. Click + Add Meeting.</div>
                  ) : (
                    [...meetings].sort((a, b) => a.date.localeCompare(b.date)).map(m => {
                      const mtgDate = new Date(m.date + 'T00:00:00');
                      const day = mtgDate.getDate();
                      const mon = mtgDate.toLocaleDateString('en-IN', { month: 'short' });
                      const cc = m.cat === 'cmd' ? 'cm-cmd' : m.cat === 'board' ? 'cm-board' : m.cat === 'review' ? 'cm-review' : m.cat === 'vendor' ? 'cm-vendor' : m.cat === 'safety' ? 'cm-safety' : 'cm-other';
                      const stColor = m.status === 'done' ? 'var(--ok)' : m.status === 'cancelled' ? 'var(--danger)' : 'var(--info)';

                      return (
                        <div key={m.id} className="list-meeting-item" onClick={() => setSelectedMeeting(m)} style={{ cursor: 'pointer' }}>
                          <div className="list-date-col">
                            <div className="list-date-day">{day}</div>
                            <div className="list-date-mon">{mon}</div>
                          </div>
                          <div className={`list-sep ${cc}`} style={{ backgroundColor: 'currentColor' }} />
                          <div className="list-content">
                            <div className="list-title">{m.name}</div>
                            <div className="list-meta">
                              {formatTimeIST12h(m.time)} {m.venue ? '· ' + m.venue : ''} · <span style={{ color: stColor, fontWeight: 600 }}>{m.status || 'scheduled'}</span>
                              {m.attachments && m.attachments.length ? ` · 📎 ${m.attachments.length} file(s)` : ''}
                            </div>
                            {m.attendees && (
                              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px' }}>
                                👥 {m.attendees}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </section>

          {/* TAB 4: ASSIGNED BY CMD */}
          <section className={`pane ${activeTab === 'tasks' ? 'active' : ''}`}>
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

                  <div className="toolbar-filters-row" style={{ display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' }}>
                    {getEligibleAssignees().length > 0 && (
                      <select className="fsel" value={tkAsg} onChange={e => setTkAsg(e.target.value)} title="Filter by assignee">
                        <option value="">All Assignees</option>
                        {getEligibleAssignees().map((u: any) => (
                          <option key={u.id} value={u.email}>{u.name}</option>
                        ))}
                      </select>
                    )}

                    <select className="fsel" value={tkPri} onChange={e => setTkPri(e.target.value)} title="Filter by priority">
                      <option value="">All Priorities</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>

                    <select className="fsel" value={tkSt} onChange={e => setTkSt(e.target.value)} title="Filter by status">
                      <option value="">All Statuses</option>
                      <option value="Open">Open</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Done">Done</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>
                </div>

                <div className="tbl-wrap">
                  {activeTasks.length === 0 ? (
                    <div className="empty">
                      {isCMD ? 'No active tasks. Click "+ Assign Task" to assign one.' : 'No active tasks assigned to you. 🎉'}
                    </div>
                  ) : (
                    <table className="act-list-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Task</th>
                          {isCMD && <th>Assignee</th>}
                          <th>Priority</th>
                          <th>Due</th>
                          <th>Status</th>
                          <th style={{ whiteSpace: 'nowrap' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeTasks.map((t, i) => {
                          const od2 = isOD(t.due, t.st);
                          const pc = t.pri === 'High' ? 'pri-high' : t.pri === 'Low' ? 'pri-low' : 'pri-med';
                          const rowClass = `act-row-${t.pri === 'High' ? 'high' : t.pri === 'Low' ? 'low' : 'med'}`;

                          return (
                            <tr
                              key={t.id}
                              className={`${rowClass} ${od2 ? 'overdue-row' : ''}`}
                              onClick={() => setSelectedTask(t)}
                              style={{ cursor: 'pointer' }}
                            >
                              <td style={{ color: '#999', fontSize: '12px' }}>{i + 1}</td>
                              <td className="act-item-cell">
                                <div className="act-item-text">{t.title}</div>
                                {t.attachments && t.attachments.length > 0 && (
                                  <span style={{ fontSize: '11px', color: 'var(--info)', marginLeft: '6px' }}>
                                    📎 {t.attachments.length}
                                  </span>
                                )}
                                {t.note && (
                                  <div className="act-source-sub" style={{ fontStyle: 'italic', marginTop: '2px' }}>
                                    “{t.note.slice(0, 60)}{t.note.length > 60 ? '…' : ''}”
                                  </div>
                                )}
                              </td>
                              {isCMD && (
                                <td style={{ fontSize: '12px' }}>
                                  <span className="attendee-chip" style={{ fontSize: '11px' }}>
                                    {t.assignee?.name || t.assignee?.email}
                                  </span>
                                </td>
                              )}
                              <td>
                                <button
                                  className={pc}
                                  style={{ cursor: isCMD ? 'pointer' : 'default', border: 'none' }}
                                  onClick={(e) => { e.stopPropagation(); if (isCMD) cycleTaskPriority(t); }}
                                  title={isCMD ? 'Click to change priority' : 'Priority'}
                                >
                                  {t.pri}
                                </button>
                              </td>
                              <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                                {fd(t.due)}
                                {od2 && <span className="od-tag" style={{ marginLeft: '4px' }}>OD</span>}
                              </td>
                              <td>
                                <button
                                  className={`spill ${t.st === 'Open' ? 's-open' : t.st === 'In Progress' ? 's-inprog' : t.st === 'Done' ? 's-done' : 's-closed'
                                    }`}
                                  style={{ cursor: 'pointer', border: 'none' }}
                                  onClick={(e) => { e.stopPropagation(); cycleTaskStatus(t); }}
                                  title="Click to advance status"
                                >
                                  {t.st}
                                </button>
                              </td>
                              <td className="act-cell" onClick={(e) => e.stopPropagation()}>
                                {isCMD ? (
                                  <>
                                    <button className="btn-sm" onClick={() => openEditModal('task', t)}>Edit</button>
                                    <button className="btn-sm btn-del" onClick={() => handleRecordDelete('/tasks', t.id)}>Del</button>
                                  </>
                                ) : (
                                  <button className="btn-sm" onClick={() => setSelectedTask(t)}>Update</button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Completed Section accordion */}
                {completedTasks.length > 0 && (
                  <div className="completed-section" style={{ marginTop: '18px' }}>
                    <div
                      className="completed-toggle"
                      onClick={() => setCompletedTasksOpen(!completedTasksOpen)}
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', background: '#f8f9fa', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}
                    >
                      <div className="completed-toggle-icon" style={{ marginRight: '8px' }}>✅</div>
                      <div className="completed-toggle-label" style={{ fontWeight: 600, flex: 1 }}>Completed Tasks</div>
                      <div className="completed-toggle-count" style={{ background: '#e2e8f0', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, marginRight: '8px' }}>{completedTasks.length}</div>
                      <div className={`completed-toggle-arrow ${completedTasksOpen ? 'open' : ''}`}>{completedTasksOpen ? '▲' : '▼'}</div>
                    </div>

                    {completedTasksOpen && (
                      <div className="completed-body open" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {completedTasks.map(t => (
                          <div
                            key={t.id}
                            className="completed-item"
                            onClick={() => setSelectedTask(t)}
                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '6px', background: '#fff' }}
                          >
                            <div className="ci-check" style={{ color: 'var(--ok)', marginRight: '12px', fontWeight: 'bold' }}>✓</div>
                            <div className="ci-body" style={{ flex: 1 }}>
                              <div className="ci-title" style={{ fontWeight: 600, color: '#475569' }}>{t.title}</div>
                              <div className="ci-meta" style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#94a3b8', marginTop: '2px', alignItems: 'center' }}>
                                {isCMD && <span>👤 {t.assignee?.name}</span>}
                                <span className={t.pri === 'High' ? 'pri-high' : t.pri === 'Low' ? 'pri-low' : 'pri-med'} style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '9px' }}>{t.pri}</span>
                                {t.cd && <span className="ci-completed-date">✅ {fd(t.cd)}</span>}
                                <span>{t.st}</span>
                              </div>
                            </div>
                            <div className="ci-actions" onClick={(e) => e.stopPropagation()}>
                              <select
                                onChange={(e) => reopenTask(t, e.target.value)}
                                value=""
                                style={{ fontSize: '11px', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '6px', background: '#fff', cursor: 'pointer' }}
                              >
                                <option value="">↩ Reopen as...</option>
                                <option value="Open">Open</option>
                                <option value="In Progress">In Progress</option>
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </section>

          {/* TAB 5: ACTION ITEMS */}
          <section className={`pane ${activeTab === 'actions' ? 'active' : ''}`}>
            <div className="toolbar" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="toolbar-search-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '8px' }}>
                <div className="srch" style={{ flex: 1 }}>
                  <span className="srch-ic">🔍</span>
                  <input
                    type="text"
                    placeholder="Search Action directives..."
                    value={actSearch}
                    onChange={e => setActSearch(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                  {hasPermission('Create', 'Actions') && (
                    <button className="btn-add" onClick={() => openAddModal('action')} style={{ whiteSpace: 'nowrap' }}>
                      + Add Action
                    </button>
                  )}
                  {hasPermission('Export', 'Actions') && (
                    <button className="btn-add" style={{ padding: '6px 10px', fontSize: '13px', background: '#fff', color: 'var(--navy)', border: '1px solid var(--border)' }} onClick={exportActions} title="Export CSV">
                      📤
                    </button>
                  )}
                  <button className="btn-add" style={{ padding: '6px 10px', fontSize: '13px', background: '#fff', color: 'var(--navy)', border: '1px solid var(--border)' }} onClick={() => window.print()} title="Print Report">
                    🖨️
                  </button>
                </div>
              </div>

              <div className="toolbar-filters-row" style={{ display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' }}>
                <select
                  className="fsel"
                  value={actPri}
                  onChange={e => setActPri(e.target.value)}
                  title="Filter by priority"
                >
                  <option value="">All Priorities</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
                <select
                  className="fsel"
                  value={actSt}
                  onChange={e => setActSt(e.target.value)}
                  title="Filter by status"
                >
                  <option value="">All Statuses</option>
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Done">Done</option>
                  <option value="Closed">Closed</option>
                </select>
                <select
                  className="fsel"
                  value={actDept}
                  onChange={e => setActDept(e.target.value)}
                  title="Filter by department"
                >
                  <option value="">All Departments</option>
                  {Array.from(new Set(actions.map((a: any) => a.dept).filter(Boolean))).map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                {getEligibleAssignees().length > 0 && (
                  <select
                    className="fsel"
                    value={actAsg}
                    onChange={e => setActAsg(e.target.value)}
                    title="Filter by assignee"
                  >
                    <option value="">All Assignees</option>
                    {getEligibleAssignees().map((u: any) => (
                      <option key={u.id} value={u.email}>{u.name}</option>
                    ))}
                  </select>
                )}
                <button
                  className={`sort-btn ${actSortAsc === true ? 'sort-asc' : actSortAsc === false ? 'sort-desc' : ''}`}
                  onClick={() => setActSortAsc(prev => prev === null ? true : prev === true ? false : null)}
                >
                  🕐 Due Date
                </button>
              </div>
            </div>

            <div className="tbl-wrap">
              {actions.length === 0 ? (
                <div className="empty">No action items found</div>
              ) : (
                <table className="act-list-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Action Directive</th>
                      <th>Source Meeting</th>
                      <th>Owner</th>
                      <th>Department</th>
                      <th>Priority</th>
                      <th>Due Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actions
                      .filter(a => {
                        if (actSearch && !a.item.toLowerCase().includes(actSearch.toLowerCase()) && !a.own?.toLowerCase().includes(actSearch.toLowerCase())) return false;
                        if (actPri && a.pri !== actPri) return false;
                        if (actSt && a.st !== actSt) return false;
                        if (actDept && a.dept !== actDept) return false;
                        if (actAsg && !isUserAssigned(a.assignedTo, actAsg)) return false;
                        return true;
                      })
                      .sort((x, y) => {
                        if (actSortAsc === null) return 0;
                        const dateX = x.due ? new Date(x.due).getTime() : 0;
                        const dateY = y.due ? new Date(y.due).getTime() : 0;
                        return actSortAsc ? dateX - dateY : dateY - dateX;
                      })
                      .map((a, idx) => (
                        <tr key={a.id} onClick={() => setSelectedAction(a)}>
                          <td>{idx + 1}</td>
                          <td className="act-item-cell">
                            <div className="act-item-text">{a.item}</div>
                          </td>
                          <td>
                            <div className="act-source-cell">{a.meetingName || 'Directives'}</div>
                            <div className="act-source-sub">{a.meetingDate}</div>
                          </td>
                          <td style={{ fontWeight: 600 }}>{a.own}</td>
                          <td style={{ color: '#666' }}>{a.dept || '—'}</td>
                          <td>
                            <button
                              className={`spill ${a.pri === 'High' ? 'pri-high' : a.pri === 'Medium' ? 'pri-med' : 'pri-low'
                                }`}
                              style={{ border: 'none', cursor: 'pointer' }}
                              onClick={(e) => { e.stopPropagation(); cycleActionPriority(a); }}
                            >
                              {a.pri}
                            </button>
                          </td>
                          <td>{a.due || '—'}</td>
                          <td>
                            <button
                              className={`spill ${a.st === 'Open'
                                  ? 's-open'
                                  : a.st === 'In Progress'
                                    ? 's-inprog'
                                    : a.st === 'Done'
                                      ? 's-done'
                                      : 's-closed'
                                }`}
                              onClick={(e) => { e.stopPropagation(); cycleActionStatus(a); }}
                            >
                              {a.st}
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* TAB 6: ESCALATIONS */}
          <section className={`pane ${activeTab === 'escalations' ? 'active' : ''}`}>
            <div className="toolbar" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="toolbar-search-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '8px' }}>
                <div className="srch" style={{ flex: 1 }}>
                  <span className="srch-ic">⌕</span>
                  <input
                    type="text"
                    placeholder="Search escalations..."
                    value={escSearch}
                    onChange={e => setEscSearch(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                  {hasPermission('Create', 'Escalations') && (
                    <button className="btn-add" onClick={() => openAddModal('escalation')} style={{ whiteSpace: 'nowrap' }}>
                      + Log Escalation
                    </button>
                  )}
                  {hasPermission('Export', 'Escalations') && (
                    <button
                      className="btn-add"
                      style={{ background: '#fff', color: 'var(--navy)', border: '1px solid var(--border)' }}
                      onClick={exportEscalations}
                      title="Export CSV"
                    >
                      📤
                    </button>
                  )}
                </div>
              </div>

              <div className="toolbar-filters-row" style={{ display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' }}>
                <select
                  className="fsel"
                  value={escSev}
                  onChange={e => setEscSev(e.target.value)}
                  title="Filter escalations by severity"
                >
                  <option value="">All Priorities</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                </select>
                <select
                  className="fsel"
                  value={escSt}
                  onChange={e => setEscSt(e.target.value)}
                  title="Filter escalations by status"
                >
                  <option value="">All Statuses</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Escalated">Escalated</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Closed">Closed</option>
                </select>
                {getEligibleAssignees().length > 0 && (
                  <select
                    className="fsel"
                    value={escAsg}
                    onChange={e => setEscAsg(e.target.value)}
                    title="Filter by assignee"
                  >
                    <option value="">All Assignees</option>
                    {getEligibleAssignees().map((u: any) => (
                      <option key={u.id} value={u.email}>{u.name}</option>
                    ))}
                  </select>
                )}
                <button
                  className={`sort-btn ${escSortAsc === true ? 'sort-asc' : escSortAsc === false ? 'sort-desc' : ''}`}
                  onClick={() => setEscSortAsc(prev => prev === null ? true : prev === true ? false : null)}
                >
                  🕐 Date Added
                </button>
              </div>
            </div>

            <div className="tbl-wrap">
              <table className="esc-list-table">
                <thead>
                  <tr>
                    <th>Escalation Code</th>
                    <th>Project name</th>
                    <th>Type</th>
                    <th>Severity</th>
                    <th>Raised By</th>
                    <th>Date raised</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {escalations
                    .filter(e => {
                      if (escSearch && !e.proj.toLowerCase().includes(escSearch.toLowerCase()) && !e.code.toLowerCase().includes(escSearch.toLowerCase())) return false;
                      if (escSev && e.sev !== escSev) return false;
                      if (escSt && e.st !== escSt) return false;
                      if (escAsg && !isUserAssigned(e.assignedTo, escAsg)) return false;
                      return true;
                    })
                    .sort((a, b) => {
                      if (escSortAsc === null) return 0;
                      const dateA = a.date ? new Date(a.date).getTime() : 0;
                      const dateB = b.date ? new Date(b.date).getTime() : 0;
                      return escSortAsc ? dateA - dateB : dateB - dateA;
                    })
                    .map((e) => (
                      <tr key={e.id} onClick={() => setSelectedEscalation(e)} style={{ cursor: 'pointer' }}>
                        <td style={{ fontWeight: 600 }}>{e.code}</td>
                        <td>
                          <div className="esc-proj">{e.proj}</div>
                        </td>
                        <td>{e.type}</td>
                        <td>
                          <span className={e.sev === 'Critical' ? 'pri-high' : e.sev === 'High' ? 'pri-med' : 'pri-low'}>
                            {e.sev}
                          </span>
                        </td>
                        <td>{e.by || '—'}</td>
                        <td>{fd(e.date)}</td>
                        <td>
                          <button
                            className={`spill ${e.st === 'In Progress'
                                ? 's-inprog'
                                : e.st === 'Escalated'
                                  ? 's-esc'
                                  : e.st === 'Resolved'
                                    ? 's-done'
                                    : 's-closed'
                              }`}
                            onClick={(e) => { e.stopPropagation(); cycleEscalationStatus(e); }}
                            style={{ cursor: 'pointer', border: 'none' }}
                          >
                            {e.st}
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* TAB 7: FOLLOW-UPS */}
          <section className={`pane ${activeTab === 'followups' ? 'active' : ''}`}>
            <div className="toolbar" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="toolbar-search-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '8px' }}>
                <div className="srch" style={{ flex: 1 }}>
                  <span className="srch-ic">🔍</span>
                  <input
                    type="text"
                    placeholder="Search follow-ups..."
                    value={fuSearch}
                    onChange={e => setFuSearch(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                  {hasPermission('Create', 'Followups') && (
                    <button className="btn-add" onClick={() => openAddModal('followup')} style={{ height: '36px', padding: '0 12px', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      + Add Follow-up
                    </button>
                  )}
                  {hasPermission('Export', 'Followups') && (
                    <button className="btn-add" style={{ height: '36px', width: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', color: 'var(--navy)', border: '1px solid var(--border)', padding: 0 }} onClick={exportFollowups} title="Export CSV">
                      📤
                    </button>
                  )}
                  <button className="btn-add" style={{ height: '36px', width: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', color: 'var(--navy)', border: '1px solid var(--border)', padding: 0 }} onClick={() => window.print()} title="Print Report">
                    🖨️
                  </button>
                </div>
              </div>

              <div className="toolbar-filters-row" style={{ display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' }}>
                <select
                  className="fsel"
                  value={fuPri}
                  onChange={e => setFuSubPri(e.target.value)}
                  title="Filter by priority"
                >
                  <option value="">All Priorities</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
                <select
                  className="fsel"
                  value={fuBu}
                  onChange={e => setFuBu(e.target.value)}
                  title="Filter by BU"
                >
                  <option value="">All BUs</option>
                  {Array.from(new Set(followups.map((f: any) => f.bu).filter(Boolean))).map(bu => (
                    <option key={bu} value={bu}>{bu}</option>
                  ))}
                </select>
                <select
                  className="fsel"
                  value={fuSt}
                  onChange={e => setFuSt(e.target.value)}
                  title="Filter by status"
                >
                  <option value="">All Statuses</option>
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Done">Done</option>
                  <option value="Closed">Closed</option>
                </select>
                <button
                  className={`sort-btn ${fuSortAsc === true ? 'sort-asc' : fuSortAsc === false ? 'sort-desc' : ''}`}
                  onClick={() => setFuSortAsc(prev => prev === null ? true : prev === true ? false : null)}
                >
                  🕐 Deadline Date
                </button>
              </div>
            </div>

            <div className="tbl-wrap">
              <table className="fu-table">
                <thead>
                  <tr>
                    <th>Priority</th>
                    <th>Business Unit</th>
                    <th>BU Head</th>
                    <th>Project / Subject</th>
                    <th>Follow up with</th>
                    <th>Deadline</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {followups
                    .filter(f => {
                      if (fuSearch && !f.proj.toLowerCase().includes(fuSearch.toLowerCase()) && !f.with?.toLowerCase().includes(fuSearch.toLowerCase())) return false;
                      if (fuPri && f.priority !== fuPri) return false;
                      if (fuBu && f.bu !== fuBu) return false;
                      if (fuSt && f.st !== fuSt) return false;
                      return true;
                    })
                    .sort((a, b) => {
                      if (fuSortAsc === null) return 0;
                      const dateA = a.dl ? new Date(a.dl).getTime() : 0;
                      const dateB = b.dl ? new Date(b.dl).getTime() : 0;
                      return fuSortAsc ? dateA - dateB : dateB - dateA;
                    })
                    .map((f) => (
                      <tr key={f.id} onClick={() => setSelectedFollowup(f)}>
                        <td>
                          <span className={f.priority === 'Critical' ? 'pri-high' : f.priority === 'High' ? 'pri-med' : 'pri-low'}>
                            {f.priority}
                          </span>
                        </td>
                        <td className="fu-source-bold">{f.bu || '—'}</td>
                        <td>{f.hd || '—'}</td>
                        <td className="fu-proj-cell">{f.proj}</td>
                        <td>{f.with || '—'}</td>
                        <td>{f.dl || '—'}</td>
                        <td>
                          <button
                            className={`spill ${f.st === 'Open'
                                ? 's-open'
                                : f.st === 'In Progress'
                                  ? 's-inprog'
                                  : f.st === 'Done'
                                    ? 's-done'
                                    : 's-closed'
                              }`}
                            onClick={(e) => { e.stopPropagation(); cycleFollowupStatus(f); }}
                          >
                            {f.st}
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* TAB 8: LEGAL MIS */}
          <section className={`pane pane-legal ${activeTab === 'legal' ? 'active' : ''}`}>
            <div className="toolbar" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
              <div className="toolbar-search-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '8px' }}>
                <div className="srch" style={{ flex: 1, minWidth: '160px' }}>
                  <span className="srch-ic">⌕</span>
                  <input
                    type="text"
                    placeholder="Search case, title, counsel..."
                    value={legSearch}
                    onChange={e => setLegSearch(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexShrink: 0 }}>
                  {hasPermission('Create', 'Legal') && (
                    <button className="btn-add" style={{ padding: '6px 14px', fontSize: '12px', whiteSpace: 'nowrap' }} onClick={() => openAddModal('legal')}>
                      + Add
                    </button>
                  )}
                  {hasPermission('Export', 'Legal') && (
                    <button className="btn-add" style={{ padding: '6px 10px', fontSize: '13px', background: '#fff', color: 'var(--navy)', border: '1px solid var(--border)' }} onClick={exportLegalMIS} title="Export CSV">
                      ⬇
                    </button>
                  )}
                  {hasPermission('Export', 'Legal') && (
                    <button className="btn-add" style={{ padding: '6px 10px', fontSize: '13px', background: '#fff', color: 'var(--navy)', border: '1px solid var(--border)' }} onClick={() => window.print()} title="Print Report">
                      📤
                    </button>
                  )}
                  {hasPermission('Import', 'Legal') && (
                    <>
                      <button className="btn-add" style={{ padding: '6px 10px', fontSize: '13px', background: '#1e40af', border: 'none' }} onClick={() => document.getElementById('xlsx-import-input')?.click()} title="Upload monthly MIS (CSV) — smart-syncs all cases">
                        📂
                      </button>
                      <input
                        type="file"
                        id="xlsx-import-input"
                        accept=".csv"
                        style={{ display: 'none' }}
                        onChange={(e) => handleLegalCsvSync(e, 'smartSync')}
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="toolbar-filters-row" style={{ display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' }}>
                <select
                  className="fsel"
                  value={legCourt}
                  onChange={e => setLegCourt(e.target.value)}
                  style={{ fontSize: '12px', padding: '6px 8px' }}
                >
                  <option value="">All Courts</option>
                  {uniqueCourts.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select
                  className="fsel"
                  value={legStatus}
                  onChange={e => setLegStatus(e.target.value)}
                  style={{ fontSize: '12px', padding: '6px 8px' }}
                  title="Filter by case status"
                >
                  <option value="">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Favorable">Favorable</option>
                  <option value="Adverse">Adverse</option>
                  <option value="Pending">Pending</option>
                  <option value="Stayed">Stayed</option>
                  <option value="Settled">Settled</option>
                </select>
                <select
                  className="fsel"
                  value={legRisk}
                  onChange={e => setLegRisk(e.target.value)}
                  style={{ fontSize: '12px', padding: '6px 8px' }}
                  title="Filter by risk level"
                >
                  <option value="">All Risk</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
                <select
                  className="fsel"
                  value={legSide}
                  onChange={e => setLegSide(e.target.value)}
                  style={{ fontSize: '12px', padding: '6px 8px' }}
                  title="HPPL & HIPL are companies within the HARTEK group — both are treated as 'Hartek' here"
                >
                  <option value="">All Cases</option>
                  <option value="by">🏹 Cases filed BY Hartek</option>
                  <option value="against">⚔️ Cases AGAINST Hartek</option>
                </select>
                <select
                  className="fsel"
                  value={legEntity}
                  onChange={e => setLegEntity(e.target.value)}
                  style={{ fontSize: '12px', padding: '6px 8px' }}
                >
                  <option value="">All Entities</option>
                  {uniqueEntities.map(ent => (
                    <option key={ent} value={ent}>{ent}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="legal-summary-strip">
              <div
                onClick={() => setLegalKpiFilter('all')}
                className="legal-kpi"
                style={{
                  '--lkpi-color': 'var(--info)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                } as React.CSSProperties}
              >
                <div className="lkpi-text">
                  <div className="lkpi-val">{legalCases.length}</div>
                  <div className="lkpi-label">Total litigation Cases</div>
                  <div className="lkpi-sub">
                    <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: 'var(--info)' }} />
                    all registered entries
                  </div>
                </div>
              </div>
              <div
                onClick={() => setLegalKpiFilter('active_pending')}
                className="legal-kpi"
                style={{
                  '--lkpi-color': '#EF9F27',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                } as React.CSSProperties}
              >
                <div className="lkpi-text">
                  <div className="lkpi-val">{legalCases.filter(c => c.status === 'Active' || c.status === 'Pending').length}</div>
                  <div className="lkpi-label">Active / Pending Cases</div>
                  <div className="lkpi-sub">
                    <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: '#EF9F27' }} />
                    subjudice in various courts
                  </div>
                </div>
              </div>
              <div
                onClick={() => setLegalKpiFilter('high_risk')}
                className="legal-kpi"
                style={{
                  '--lkpi-color': 'var(--danger)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                } as React.CSSProperties}
              >
                <div className="lkpi-text">
                  <div className="lkpi-val">{legalCases.filter(c => c.risk === 'High').length}</div>
                  <div className="lkpi-label">High Risk / Critical Cases</div>
                  <div className="lkpi-sub">
                    <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: 'var(--danger)' }} />
                    financial exposure &gt; 1Cr
                  </div>
                </div>
              </div>
              <div
                onClick={() => setLegalKpiFilter('this_week')}
                className="legal-kpi"
                style={{
                  '--lkpi-color': 'var(--ok)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                } as React.CSSProperties}
              >
                <div className="lkpi-text">
                  <div className="lkpi-val">{legalCases.filter(c => isHearingThisWeek(c.ndoh)).length}</div>
                  <div className="lkpi-label">Hearings Scheduled This Week</div>
                  <div className="lkpi-sub">
                    <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: 'var(--ok)' }} />
                    requires Hartek representation
                  </div>
                </div>
              </div>
            </div>

            <div className="tbl-wrap">
              <table className="legal-tbl">
                <thead>
                  <tr>
                    <th>Sr No</th>
                    <th>Case title & Number</th>
                    <th>Forum / Court</th>
                    <th>nature</th>
                    <th>counsel</th>
                    <th>Hartek Entity</th>
                    <th>Last Date</th>
                    <th>Next Date</th>
                    <th>Risk</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {legalCases
                    .filter(c => {
                      // KPI Filter
                      if (legalKpiFilter === 'active_pending' && c.status !== 'Active' && c.status !== 'Pending') return false;
                      if (legalKpiFilter === 'high_risk' && c.risk !== 'High') return false;
                      if (legalKpiFilter === 'this_week' && !isHearingThisWeek(c.ndoh)) return false;

                      if (legSearch) {
                        const s = legSearch.toLowerCase();
                        const matchSearch =
                          (c.title && c.title.toLowerCase().includes(s)) ||
                          (c.caseNo && c.caseNo.toLowerCase().includes(s)) ||
                          (c.court && c.court.toLowerCase().includes(s)) ||
                          (c.counsel && c.counsel.toLowerCase().includes(s)) ||
                          (c.nature && c.nature.toLowerCase().includes(s));
                        if (!matchSearch) return false;
                      }
                      if (legCourt && c.court !== legCourt) return false;
                      if (legStatus && c.status !== legStatus) return false;
                      if (legRisk && c.risk !== legRisk) return false;
                      if (legEntity && c.entity !== legEntity) return false;
                      if (legSide) {
                        const isFiledBy = c.filedBy?.toLowerCase().includes('filed by');
                        if (legSide === 'by' && !isFiledBy) return false;
                        if (legSide === 'against' && isFiledBy) return false;
                      }
                      return true;
                    })
                    .map((c) => (
                      <tr key={c.id} onClick={() => setSelectedLegal(c)}>
                        <td>{c.srNo || '—'}</td>
                        <td>
                          <div className="legal-case-title">{c.title}</div>
                          <div className="legal-case-no">{c.caseNo}</div>
                        </td>
                        <td>{c.court}</td>
                        <td>{c.nature || '—'}</td>
                        <td>{c.counsel || '—'}</td>
                        <td style={{ fontWeight: 600 }}>{c.entity || '—'}</td>
                        <td>{c.ldoh || '—'}</td>
                        <td style={{ fontWeight: 600 }}>{c.ndoh || '—'}</td>
                        <td>
                          <span className={`legal-risk risk-${c.risk.toLowerCase()}`}>{c.risk}</span>
                        </td>
                        <td>
                          <span className={`ls-${c.status.toLowerCase()}`}>{c.status}</span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* TAB 9: PRIVATE NOTEPAD */}
          <section className={`pane ${activeTab === 'notepad' ? 'active' : ''}`}>
            <div className="notepad-workspace">
              {/* LEFT SIDEBAR: NOTES LIST */}
              <div className="notepad-sidebar">
                {/* Header and Add Note */}
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn-add"
                      onClick={handleCreateNote}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px 8px', fontSize: '12px', fontWeight: 600 }}
                    >
                      ➕ New Note
                    </button>
                    <button
                      className="btn-cancel"
                      onClick={handleNotepadClear}
                      style={{ padding: '10px 8px', fontSize: '12px', borderColor: '#ef4444', color: '#ef4444', background: '#fff', border: '1px solid', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                      title="Clear All Drafts"
                    >
                      🗑️ Clear All
                    </button>
                  </div>
                  {/* Search */}
                  <input
                    type="text"
                    placeholder="Search drafts..."
                    value={noteSearchQuery}
                    onChange={e => setNoteSearchQuery(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', outline: 'none' }}
                  />
                  {/* Sort */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)' }}>
                    <span>Sort by:</span>
                    <select
                      value={noteSortOrder}
                      onChange={e => setNoteSortOrder(e.target.value as any)}
                      style={{ background: 'none', border: 'none', color: 'var(--navy)', fontWeight: 600, outline: 'none', cursor: 'pointer', fontSize: '11px' }}
                    >
                      <option value="edited-desc">Last Edited</option>
                      <option value="title">Title (A-Z)</option>
                    </select>
                  </div>
                </div>

                {/* Notes List Scroller */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                  {filteredNotes.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>
                      No notes found
                    </div>
                  ) : (
                    filteredNotes.map(n => {
                      const isActive = n.id === activeNoteId;
                      return (
                        <div
                          key={n.id}
                          onClick={() => {
                            setActiveNoteId(n.id);
                            setNoteTitleInput(n.title);
                            setNoteTextInput(n.text || '');
                          }}
                          style={{
                            padding: '12px',
                            borderRadius: '8px',
                            marginBottom: '6px',
                            cursor: 'pointer',
                            background: isActive ? 'var(--info-bg)' : 'transparent',
                            border: isActive ? '1px solid var(--info-border)' : '1px solid transparent',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            transition: 'all 0.2s',
                            position: 'relative'
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: '13px', color: isActive ? 'var(--info)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '42px' }}>
                            {n.title || 'Untitled note'}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {(() => {
                              const cleanPreview = (n.text || '').replace(/<!-- item_id: [a-f0-9-]+ -->/g, '').trim();
                              return cleanPreview ? (cleanPreview.length > 40 ? cleanPreview.substring(0, 40) + '...' : cleanPreview) : '(empty note content)';
                            })()}
                          </div>
                          <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                            📅 {formatDateTimeIST(n.ts)}
                          </div>

                          {/* Quick Action Delete & Duplicate */}
                          <div style={{ position: 'absolute', right: '8px', top: '8px', display: 'flex', gap: '4px' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDuplicateNote(n.id);
                              }}
                              title="Duplicate Note"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', padding: '2px' }}
                            >
                              📋
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteNote(n.id);
                              }}
                              title="Delete Note"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', padding: '2px' }}
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* RIGHT SIDEBAR: CURRENT ACTIVE EDITOR */}
              <div className="notepad-editor">
                {activeNoteId ? (
                  <>
                    {/* Note header actions on top */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '12px', gap: '8px', flexShrink: 0 }}>
                      <span id="np-autosave-label" style={{ fontSize: '11px', color: 'var(--muted)', marginRight: 'auto' }}>
                        Auto-saved
                      </span>
                      <button
                        className="btn-add"
                        onClick={async () => {
                          try {
                            await api.put(`/notepad/${activeNoteId}`, { title: noteTitleInput, text: noteTextInput });
                            showToast('Note saved manually', 'ok');
                            const label = document.getElementById('np-autosave-label');
                            if (label) label.textContent = `Saved at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
                          } catch (e) {
                            showToast('Failed to save note', 'err');
                          }
                        }}
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                      >
                        💾 Save
                      </button>
                      <button
                        className="btn-cancel"
                        onClick={() => handleDeleteNote(activeNoteId)}
                        style={{ padding: '6px 12px', fontSize: '12px', borderColor: '#ef4444', color: '#ef4444' }}
                      >
                        🗑️ Delete
                      </button>
                    </div>

                    {/* Formatting Toolbar */}
                    <div className="formatting-toolbar" style={{ display: 'flex', gap: '6px', padding: '8px 12px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '12px', alignItems: 'center' }}>
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); handleFormat('bold'); }}
                        title="Bold"
                        style={{ padding: '4px 8px', fontSize: '12px', fontWeight: 'bold', background: '#fff', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        B
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); handleFormat('italic'); }}
                        title="Italic"
                        style={{ padding: '4px 8px', fontSize: '12px', fontStyle: 'italic', background: '#fff', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        I
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); handleFormat('underline'); }}
                        title="Underline"
                        style={{ padding: '4px 8px', fontSize: '12px', textDecoration: 'underline', background: '#fff', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        U
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); handleFormat('list'); }}
                        title="Bullet List"
                        style={{ padding: '4px 8px', fontSize: '12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        • List
                      </button>
                      <div style={{ height: '16px', width: '1px', background: '#cbd5e1', margin: '0 4px' }} />
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Helper formatting tools</span>
                    </div>

                    <input
                      type="text"
                      placeholder="Title of this note..."
                      value={noteTitleInput}
                      onChange={e => {
                        setNoteTitleInput(e.target.value);
                        setNotes(prev => prev.map(n => n.id === activeNoteId ? { ...n, title: e.target.value, ts: new Date().toISOString() } : n));
                        triggerAutosave();
                      }}
                      style={{
                        fontSize: '20px',
                        fontWeight: 700,
                        padding: '8px 0',
                        border: 'none',
                        borderBottom: '2px solid #f1f5f9',
                        outline: 'none',
                        color: 'var(--navy)',
                        width: '100%',
                        marginBottom: '12px'
                      }}
                    />

                    {/* Textarea Editor */}
                    <textarea
                      id="np-editor-textarea"
                      placeholder="Begin drafting private notepad transcripts. Selected helper formatting triggers will wrap text selection..."
                      value={noteTextInput.replace(/<!-- item_id: [a-f0-9-]+ -->/g, '')}
                      onChange={e => {
                        const userInput = e.target.value;
                        const commentMatch = noteTextInput.match(/<!-- item_id: [a-f0-9-]+ -->/);
                        const comment = commentMatch ? `\n${commentMatch[0]}` : '';
                        const fullText = userInput + comment;
                        handleNotepadChange(fullText);
                      }}
                      style={{
                        flex: 1,
                        minHeight: '380px',
                        padding: '12px',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontFamily: 'var(--font)',
                        lineHeight: '1.6',
                        resize: 'none',
                        outline: 'none'
                      }}
                    />

                    {/* Metadata display */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '11px', color: 'var(--muted)' }}>
                      <span>Characters count: {noteTextInput.length}</span>
                      <span>Created: {new Date(notes.find(n => n.id === activeNoteId)?.created).toLocaleString('en-IN')}</span>
                    </div>
                  </>
                ) : (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
                    <h3>No note selected</h3>
                    <p style={{ fontSize: '13px', marginTop: '6px' }}>Select a note from the left list navigator or click "+ New Note" to begin drafting.</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* TAB 10: AUDIT LOGS (ADMIN ONLY) */}
          {user?.role === 'Admin' &&
            <section className={`pane ${activeTab === 'audit' ? 'active' : ''}`}>
              <div className="toolbar">
                <div className="srch" style={{ maxWidth: '400px' }}>
                  <span className="srch-ic">🔍</span>
                  <input type="text" placeholder="Search audit trails by action, user..." />
                </div>
              </div>

              <div className="tbl-wrap">
                <table className="act-list-table" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>operator</th>
                      <th>Role</th>
                      <th>Action itemized</th>
                      <th>Changeset delta details</th>
                      <th>Platform details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>
                          {formatDateTimeIST(log.timestamp)}
                        </td>
                        <td>
                          <strong>{log.userName}</strong>
                          <div style={{ fontSize: '10px', color: '#888' }}>{log.userEmail}</div>
                        </td>
                        <td>{log.userId ? 'Authorized ID' : 'Guest'}</td>
                        <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{log.action}</td>
                        <td>{renderDelta(log.oldValues, log.newValues)}</td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '11px', color: '#666' }}>
                          <div>IP: {log.ipAddress}</div>
                          <div>{log.device} ({log.browser})</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          }
        </main>

        {/* ========================================================================= */}
        {/* CARD DETAIL MODALS (READ/EDIT ROUTERS) */}
        {/* ========================================================================= */}

        {/* Meeting Calendar Detail Modal */}
        {selectedMeeting && (
          <div className="card-detail-bg open" onClick={() => setSelectedMeeting(null)}>
            <div className="card-detail-modal mtg-modal" onClick={e => e.stopPropagation()}>
              <div className="mtg-header">
                <div className="mtg-cat-badge" style={{ background: 'var(--navy)', color: '#fff' }}>
                  {selectedMeeting.cat.toUpperCase()}
                </div>
                <div className="mtg-title">{selectedMeeting.name}</div>
                <div className="mtg-meta-row">
                  <div className="mtg-meta-item">📅 {selectedMeeting.date}</div>
                  <div className="mtg-meta-item">🕒 {formatTimeIST12h(selectedMeeting.time || '10:00')}</div>
                  {selectedMeeting.venue && (
                    <div className="mtg-meta-item">📍 {selectedMeeting.venue}</div>
                  )}
                </div>
              </div>

              <div className="mtg-body">
                {/* Tab switcher */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '16px', gap: '16px', padding: '0 24px' }}>
                  <button 
                    type="button"
                    onClick={() => setActiveDetailTab('details')}
                    style={{ 
                      padding: '8px 16px', 
                      border: 'none', 
                      background: 'none', 
                      fontWeight: 600, 
                      fontSize: '14px', 
                      cursor: 'pointer', 
                      borderBottom: activeDetailTab === 'details' ? '2px solid var(--accent)' : '2px solid transparent',
                      color: activeDetailTab === 'details' ? 'var(--navy)' : 'var(--muted)',
                      paddingBottom: '12px'
                    }}
                  >
                    📋 Details
                  </button>
                  <button 
                    type="button"
                    onClick={() => setActiveDetailTab('note')}
                    style={{ 
                      padding: '8px 16px', 
                      border: 'none', 
                      background: 'none', 
                      fontWeight: 600, 
                      fontSize: '14px', 
                      cursor: 'pointer', 
                      borderBottom: activeDetailTab === 'note' ? '2px solid var(--accent)' : '2px solid transparent',
                      color: activeDetailTab === 'note' ? 'var(--navy)' : 'var(--muted)',
                      paddingBottom: '12px'
                    }}
                  >
                    🔒 Personal Note
                  </button>
                </div>

                {activeDetailTab === 'details' ? (
                  <>
                    <div className="mtg-section">
                      <div className="mtg-section-label">Meeting Agenda / Directives</div>
                      <div className="mtg-section-content preformatted">{selectedMeeting.agenda || 'No agenda recorded.'}</div>
                    </div>

                    <div className="mtg-section">
                      <div className="mtg-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Attendees</span>
                        {hasPermission('Edit', 'Calendar') && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAttendeesId(selectedMeeting.id);
                              setQuickAttendeesVal(selectedMeeting.attendees || '');
                            }}
                            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            ✏️ Edit Attendees
                          </button>
                        )}
                      </div>
                      
                      {editingAttendeesId === selectedMeeting.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                          <input 
                            type="text" 
                            value={quickAttendeesVal} 
                            onChange={e => setQuickAttendeesVal(e.target.value)} 
                            placeholder="Enter names separated by comma (e.g. CMD, EA, Rajesh)" 
                            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', width: '100%', outline: 'none' }}
                            autoFocus
                          />
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              className="btn-sm" 
                              onClick={() => saveQuickAttendees(selectedMeeting.id)}
                              style={{ padding: '4px 12px', background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}
                            >
                              Save
                            </button>
                            <button 
                              className="btn-sm btn-cancel" 
                              onClick={() => setEditingAttendeesId(null)}
                              style={{ padding: '4px 12px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="attendee-chips">
                          {selectedMeeting.attendees ? (
                            selectedMeeting.attendees.split(',').map((att: string, idx: number) => (
                              <div key={idx} className="attendee-chip">{att.trim()}</div>
                            ))
                          ) : (
                            <span style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>No attendees recorded.</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Status Update Row */}
                    <div className="mtg-section">
                      <div className="mtg-section-label">Conducted Status</div>
                      <div className="status-toggle-row">
                        <button
                          className={`sts-btn ${selectedMeeting.status === 'scheduled' ? 'active-scheduled' : ''}`}
                          onClick={() => updateMeetingStatus(selectedMeeting.id, 'scheduled')}
                        >
                          Scheduled
                        </button>
                        <button
                          className={`sts-btn ${selectedMeeting.status === 'done' ? 'active-done' : ''}`}
                          onClick={() => updateMeetingStatus(selectedMeeting.id, 'done')}
                        >
                          Conducted Done
                        </button>
                        <button
                          className={`sts-btn ${selectedMeeting.status === 'cancelled' ? 'active-cancelled' : ''}`}
                          onClick={() => updateMeetingStatus(selectedMeeting.id, 'cancelled')}
                        >
                          Cancelled
                        </button>
                      </div>
                    </div>

                    {/* Private Notepad note specific to this meeting */}
                    <div className="mtg-section">
                      <div className="mtg-section-label">Meeting private notepad</div>
                      <div className="mtg-notepad-wrap">
                        <textarea
                          id={`mtg-note-ta-${selectedMeeting.id}`}
                          className="mtg-notepad-textarea"
                          placeholder="Auto-saved meeting drafts..."
                          defaultValue={selectedMeeting.notepad || ''}
                        />
                        <div className="mtg-notepad-toolbar">
                          <span className="mtg-notepad-hint">⚠️ Isolated to meeting dashboard context</span>
                          <button
                            className="mtg-notepad-save"
                            onClick={() => {
                              const val = (document.getElementById(`mtg-note-ta-${selectedMeeting.id}`) as HTMLTextAreaElement)?.value;
                              api.put(`/meetings/${selectedMeeting.id}/notes`, { notes: val });
                              showToast('Meeting notes updated', 'ok');
                            }}
                          >
                            💾 Save Notes
                          </button>
                        </div>
                      </div>
                    </div>


                    <div className="mtg-section" style={{ padding: '0 24px 20px 24px' }}>
                      <div className="mtg-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Meeting Attachments & MOM Files</span>
                        <label 
                          htmlFor={`review-upload-mtg-${selectedMeeting.id}`}
                          style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          📎 Add Attachment
                          <input 
                            type="file" 
                            id={`review-upload-mtg-${selectedMeeting.id}`}
                            style={{ display: 'none' }}
                            onChange={(e) => handleAddAttachmentToRecord(e, '/meetings', selectedMeeting, setSelectedMeeting, setMeetings)}
                          />
                        </label>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                        {selectedMeeting.attachments && selectedMeeting.attachments.length > 0 ? (
                          selectedMeeting.attachments.map((att: any) => (
                            <a
                              key={att.id}
                              href={att.data}
                              download={att.name}
                              className="mom-action-item"
                              style={{ margin: 0, padding: '6px 12px', fontSize: '13px', textDecoration: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                              📄 {att.name} ({Math.round(att.size / 1024)} KB)
                            </a>
                          ))
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>No files attached.</span>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ padding: '0 24px 20px 24px' }}>
                    <PersonalNoteInner
                      tabName="Calendar"
                      itemName={selectedMeeting.name || 'Event'}
                      itemId={selectedMeeting.id}
                      api={api}
                      notes={notes}
                      setNotes={setNotes}
                    />
                  </div>
                )}
              </div>

              <div className="cdm-ftr">
                <button className="btn-cancel" onClick={() => setSelectedMeeting(null)}>Close</button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {hasPermission('Delete', 'Calendar') && (
                    <button className="btn-sm btn-del" onClick={() => handleRecordDelete('/meetings', selectedMeeting.id)}>
                      Delete Meeting
                    </button>
                  )}
                  {hasPermission('Edit', 'Calendar') && (
                    <button className="btn-edit-detail" onClick={() => { setSelectedMeeting(null); openEditModal('meeting', selectedMeeting); }}>
                      ✏️ Edit Details
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Project updates detail modal */}
        {selectedProject && (
          <div className="card-detail-bg open" onClick={() => setSelectedProject(null)}>
            <div className="card-detail-modal" onClick={e => e.stopPropagation()}>
              <div className="cdm-hdr">
                <div className="cdm-hdr-left">
                  <div className="cdm-title">{selectedProject.name}</div>
                  <div className="cdm-subtitle">🚧 {selectedProject.businessUnit?.name || 'Renewables'}</div>
                </div>
                <button className="cdm-close" onClick={() => setSelectedProject(null)}>✕</button>
              </div>
              <div className="cdm-body">
                {/* Tab switcher */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '16px', gap: '16px' }}>
                  <button 
                    type="button"
                    onClick={() => setActiveDetailTab('details')}
                    style={{ 
                      padding: '8px 16px', 
                      border: 'none', 
                      background: 'none', 
                      fontWeight: 600, 
                      fontSize: '14px', 
                      cursor: 'pointer', 
                      borderBottom: activeDetailTab === 'details' ? '2px solid var(--accent)' : '2px solid transparent',
                      color: activeDetailTab === 'details' ? 'var(--navy)' : 'var(--muted)',
                      paddingBottom: '12px'
                    }}
                  >
                    📋 Details
                  </button>
                  <button 
                    type="button"
                    onClick={() => setActiveDetailTab('note')}
                    style={{ 
                      padding: '8px 16px', 
                      border: 'none', 
                      background: 'none', 
                      fontWeight: 600, 
                      fontSize: '14px', 
                      cursor: 'pointer', 
                      borderBottom: activeDetailTab === 'note' ? '2px solid var(--accent)' : '2px solid transparent',
                      color: activeDetailTab === 'note' ? 'var(--navy)' : 'var(--muted)',
                      paddingBottom: '12px'
                    }}
                  >
                    🔒 Personal Note
                  </button>
                </div>

                {activeDetailTab === 'details' ? (
                  <>
                    <div className="cdm-row">
                      <div className="cdm-field">
                        <div className="cdm-field-label">Project Manager (PM)</div>
                        <div className="cdm-field-value">{selectedProject.pm || '—'}</div>
                      </div>
                      <div className="cdm-field">
                        <div className="cdm-field-label">Client / Licensee</div>
                        <div className="cdm-field-value">{selectedProject.client || '—'}</div>
                      </div>
                    </div>
                    <div className="cdm-row">
                      <div className="cdm-field">
                        <div className="cdm-field-label">Scheduled COD</div>
                        <div className="cdm-field-value">{selectedProject.cod ? new Date(selectedProject.cod).toLocaleDateString('en-IN') : '—'}</div>
                      </div>
                      <div className="cdm-field">
                        <div className="cdm-field-label">Revised COD</div>
                        <div className="cdm-field-value">{selectedProject.rcod ? new Date(selectedProject.rcod).toLocaleDateString('en-IN') : '—'}</div>
                      </div>
                    </div>
                    <div className="cdm-field">
                      <div className="cdm-field-label">Key Project Risks & Delay Factors</div>
                      <div className="cdm-field-value preformatted">{selectedProject.risks || 'No delay factors flagged.'}</div>
                    </div>
                    <div className="cdm-field">
                      <div className="cdm-field-label">CMD Office Remarks / Decisions</div>
                      <div className="cdm-field-value preformatted">{selectedProject.rem || 'No remarks logged.'}</div>
                    </div>

                    <div className="cdm-field" style={{ marginTop: '12px' }}>
                      <div className="cdm-field-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Attachments & Documents</span>
                        <label 
                          htmlFor={`review-upload-proj-${selectedProject.id}`}
                          style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          📎 Add Attachment
                          <input 
                            type="file" 
                            id={`review-upload-proj-${selectedProject.id}`}
                            style={{ display: 'none' }}
                            onChange={(e) => handleAddAttachmentToRecord(e, '/projects', selectedProject, setSelectedProject, setProjects)}
                          />
                        </label>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                        {selectedProject.attachments && selectedProject.attachments.length > 0 ? (
                          selectedProject.attachments.map((att: any) => (
                            <a
                              key={att.id}
                              href={att.data}
                              download={att.name}
                              className="mom-action-item"
                              style={{ margin: 0, padding: '6px 12px', fontSize: '13px', textDecoration: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                              📄 {att.name} ({Math.round(att.size / 1024)} KB)
                            </a>
                          ))
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>No files attached.</span>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <PersonalNoteInner
                    tabName="Projects"
                    itemName={selectedProject.name || 'Project'}
                    itemId={selectedProject.id}
                    api={api}
                    notes={notes}
                    setNotes={setNotes}
                  />
                )}
              </div>
              <div className="cdm-ftr">
                <button className="btn-cancel" onClick={() => setSelectedProject(null)}>Close</button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {hasPermission('Delete', 'Projects') && (
                    <button className="btn-sm btn-del" onClick={() => handleRecordDelete('/projects', selectedProject.id)}>
                      Delete
                    </button>
                  )}
                  {hasPermission('Edit', 'Projects') && (
                    <button className="btn-edit-detail" onClick={() => { setSelectedProject(null); openEditModal('project', selectedProject); }}>
                      ✏️ Edit Project
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Task directive detail modal */}
        {selectedTask && (
          <div className="card-detail-bg open" onClick={() => setSelectedTask(null)}>
            <div className="card-detail-modal" onClick={e => e.stopPropagation()}>
              <div className="cdm-hdr">
                <div className="cdm-hdr-left">
                  <div className="cdm-title">{selectedTask.title}</div>
                  <div className="cdm-subtitle">📋 Task ID: {selectedTask.id.substring(0, 8)}</div>
                </div>
                <button className="cdm-close" onClick={() => setSelectedTask(null)}>✕</button>
              </div>
              <div className="cdm-body">
                {/* Tab switcher */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '16px', gap: '16px' }}>
                  <button 
                    type="button"
                    onClick={() => setActiveDetailTab('details')}
                    style={{ 
                      padding: '8px 16px', 
                      border: 'none', 
                      background: 'none', 
                      fontWeight: 600, 
                      fontSize: '14px', 
                      cursor: 'pointer', 
                      borderBottom: activeDetailTab === 'details' ? '2px solid var(--accent)' : '2px solid transparent',
                      color: activeDetailTab === 'details' ? 'var(--navy)' : 'var(--muted)',
                      paddingBottom: '12px'
                    }}
                  >
                    📋 Details
                  </button>
                  <button 
                    type="button"
                    onClick={() => setActiveDetailTab('note')}
                    style={{ 
                      padding: '8px 16px', 
                      border: 'none', 
                      background: 'none', 
                      fontWeight: 600, 
                      fontSize: '14px', 
                      cursor: 'pointer', 
                      borderBottom: activeDetailTab === 'note' ? '2px solid var(--accent)' : '2px solid transparent',
                      color: activeDetailTab === 'note' ? 'var(--navy)' : 'var(--muted)',
                      paddingBottom: '12px'
                    }}
                  >
                    🔒 Personal Note
                  </button>
                </div>

                {activeDetailTab === 'details' ? (
                  <>
                    <div className="cdm-field">
                      <div className="cdm-field-label">Directive details</div>
                      <div className="cdm-field-value preformatted">{selectedTask.detail || 'No instructions.'}</div>
                    </div>
                    <div className="cdm-row">
                      <div className="cdm-field">
                        <div className="cdm-field-label">Assignee</div>
                        <div className="cdm-field-value">{selectedTask.assignee?.name}</div>
                      </div>
                      <div className="cdm-field">
                        <div className="cdm-field-label">Assigned By</div>
                        <div className="cdm-field-value">{selectedTask.assignedBy?.name}</div>
                      </div>
                    </div>
                    <div className="cdm-field">
                      <div className="cdm-field-label">Status Remarks / Completion logs</div>
                      <div className="cdm-field-value preformatted">{selectedTask.note || 'No notes logged.'}</div>
                    </div>

                    <div className="cdm-field" style={{ marginTop: '12px' }}>
                      <div className="cdm-field-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Attachments & Documents</span>
                        <label 
                          htmlFor={`review-upload-task-${selectedTask.id}`}
                          style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          📎 Add Attachment
                          <input 
                            type="file" 
                            id={`review-upload-task-${selectedTask.id}`}
                            style={{ display: 'none' }}
                            onChange={(e) => handleAddAttachmentToRecord(e, '/tasks', selectedTask, setSelectedTask, setTasks)}
                          />
                        </label>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                        {selectedTask.attachments && selectedTask.attachments.length > 0 ? (
                          selectedTask.attachments.map((att: any) => (
                            <a
                              key={att.id}
                              href={att.data}
                              download={att.name}
                              className="mom-action-item"
                              style={{ margin: 0, padding: '6px 12px', fontSize: '13px', textDecoration: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                              📄 {att.name} ({Math.round(att.size / 1024)} KB)
                            </a>
                          ))
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>No files attached.</span>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <PersonalNoteInner
                    tabName="Tasks"
                    itemName={selectedTask.title || 'Task'}
                    itemId={selectedTask.id}
                    api={api}
                    notes={notes}
                    setNotes={setNotes}
                  />
                )}
              </div>
              <div className="cdm-ftr">
                <button className="btn-cancel" onClick={() => setSelectedTask(null)}>Close</button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {hasPermission('Delete', 'Tasks') && (
                    <button className="btn-sm btn-del" onClick={() => handleRecordDelete('/tasks', selectedTask.id)}>
                      Delete
                    </button>
                  )}
                  {hasPermission('Edit', 'Tasks') && (
                    <button className="btn-edit-detail" onClick={() => { setSelectedTask(null); openEditModal('task', selectedTask); }}>
                      ✏️ Edit Task
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action detail modal */}
        {selectedAction && (
          <div className="card-detail-bg open" onClick={() => setSelectedAction(null)}>
            <div className="card-detail-modal" onClick={e => e.stopPropagation()}>
              <div className="cdm-hdr">
                <div className="cdm-hdr-left">
                  <div className="cdm-title">{selectedAction.item}</div>
                  <div className="cdm-subtitle">⚡ Source: {selectedAction.meetingName || 'Directives'}</div>
                </div>
                <button className="cdm-close" onClick={() => setSelectedAction(null)}>✕</button>
              </div>
              <div className="cdm-body">
                {/* Tab switcher */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '16px', gap: '16px' }}>
                  <button 
                    type="button"
                    onClick={() => setActiveDetailTab('details')}
                    style={{ 
                      padding: '8px 16px', 
                      border: 'none', 
                      background: 'none', 
                      fontWeight: 600, 
                      fontSize: '14px', 
                      cursor: 'pointer', 
                      borderBottom: activeDetailTab === 'details' ? '2px solid var(--accent)' : '2px solid transparent',
                      color: activeDetailTab === 'details' ? 'var(--navy)' : 'var(--muted)',
                      paddingBottom: '12px'
                    }}
                  >
                    📋 Details
                  </button>
                  <button 
                    type="button"
                    onClick={() => setActiveDetailTab('note')}
                    style={{ 
                      padding: '8px 16px', 
                      border: 'none', 
                      background: 'none', 
                      fontWeight: 600, 
                      fontSize: '14px', 
                      cursor: 'pointer', 
                      borderBottom: activeDetailTab === 'note' ? '2px solid var(--accent)' : '2px solid transparent',
                      color: activeDetailTab === 'note' ? 'var(--navy)' : 'var(--muted)',
                      paddingBottom: '12px'
                    }}
                  >
                    🔒 Personal Note
                  </button>
                </div>

                {activeDetailTab === 'details' ? (
                  <>
                    <div className="cdm-row">
                      <div className="cdm-field">
                        <div className="cdm-field-label">Responsible Owner</div>
                        <div className="cdm-field-value">{selectedAction.own}</div>
                      </div>
                      <div className="cdm-field">
                        <div className="cdm-field-label">Department / Business Unit</div>
                        <div className="cdm-field-value">{selectedAction.dept || '—'}</div>
                      </div>
                    </div>
                    <div className="cdm-row">
                      <div className="cdm-field">
                        <div className="cdm-field-label">Priority</div>
                        <div className="cdm-field-value">{selectedAction.pri}</div>
                      </div>
                      <div className="cdm-field">
                        <div className="cdm-field-label">Due Date</div>
                        <div className="cdm-field-value">{selectedAction.due || '—'}</div>
                      </div>
                    </div>
                    <div className="cdm-row">
                      <div className="cdm-field">
                        <div className="cdm-field-label">Assigned To</div>
                        <div className="cdm-field-value">
                          {(() => {
                            let ids: string[] = [];
                            if (Array.isArray(selectedAction.assignedTo)) {
                              ids = selectedAction.assignedTo;
                            } else if (typeof selectedAction.assignedTo === 'string') {
                              try {
                                ids = JSON.parse(selectedAction.assignedTo);
                              } catch (e) {}
                            }
                            if (ids.length === 0) return '—';
                            return ids
                              .map(id => usersList.find(u => u.id === id)?.name)
                              .filter(Boolean)
                              .join(', ');
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="cdm-field">
                      <div className="cdm-field-label">Action Status Remarks</div>
                      <div className="cdm-field-value preformatted">{selectedAction.rem || 'No updates logged.'}</div>
                    </div>

                    <div className="cdm-field" style={{ marginTop: '12px' }}>
                      <div className="cdm-field-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Attachments & Documents</span>
                        <label 
                          htmlFor={`review-upload-action-${selectedAction.id}`}
                          style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          📎 Add Attachment
                          <input 
                            type="file" 
                            id={`review-upload-action-${selectedAction.id}`}
                            style={{ display: 'none' }}
                            onChange={(e) => handleAddAttachmentToRecord(e, '/action-items', selectedAction, setSelectedAction, setActions)}
                          />
                        </label>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                        {selectedAction.attachments && selectedAction.attachments.length > 0 ? (
                          selectedAction.attachments.map((att: any) => (
                            <a
                              key={att.id}
                              href={att.data}
                              download={att.name}
                              className="mom-action-item"
                              style={{ margin: 0, padding: '6px 12px', fontSize: '13px', textDecoration: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                              📄 {att.name} ({Math.round(att.size / 1024)} KB)
                            </a>
                          ))
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>No files attached.</span>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <PersonalNoteInner
                    tabName="Actions"
                    itemName={selectedAction.title || 'Action'}
                    itemId={selectedAction.id}
                    api={api}
                    notes={notes}
                    setNotes={setNotes}
                  />
                )}
              </div>
              <div className="cdm-ftr">
                <button className="btn-cancel" onClick={() => setSelectedAction(null)}>Close</button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {hasPermission('Delete', 'Actions') && (
                    <button className="btn-sm btn-del" onClick={() => handleRecordDelete('/action-items', selectedAction.id)}>
                      Delete
                    </button>
                  )}
                  {hasPermission('Edit', 'Actions') && (
                    <button className="btn-edit-detail" onClick={() => { setSelectedAction(null); openEditModal('action', selectedAction); }}>
                      ✏️ Edit Action
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Escalation detail modal */}
        {selectedEscalation && (
          <div className="card-detail-bg open" onClick={() => setSelectedEscalation(null)}>
            <div className="card-detail-modal" onClick={e => e.stopPropagation()}>
              <div className="cdm-hdr">
                <div className="cdm-hdr-left">
                  <div className="cdm-title">[{selectedEscalation.code}] {selectedEscalation.proj}</div>
                  <div className="cdm-subtitle">⚠️ Escalation Type: {selectedEscalation.type}</div>
                </div>
                <button className="cdm-close" onClick={() => setSelectedEscalation(null)}>✕</button>
              </div>
              <div className="cdm-body">
                {/* Tab switcher */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '16px', gap: '16px' }}>
                  <button 
                    type="button"
                    onClick={() => setActiveDetailTab('details')}
                    style={{ 
                      padding: '8px 16px', 
                      border: 'none', 
                      background: 'none', 
                      fontWeight: 600, 
                      fontSize: '14px', 
                      cursor: 'pointer', 
                      borderBottom: activeDetailTab === 'details' ? '2px solid var(--accent)' : '2px solid transparent',
                      color: activeDetailTab === 'details' ? 'var(--navy)' : 'var(--muted)',
                      paddingBottom: '12px'
                    }}
                  >
                    📋 Details
                  </button>
                  <button 
                    type="button"
                    onClick={() => setActiveDetailTab('note')}
                    style={{ 
                      padding: '8px 16px', 
                      border: 'none', 
                      background: 'none', 
                      fontWeight: 600, 
                      fontSize: '14px', 
                      cursor: 'pointer', 
                      borderBottom: activeDetailTab === 'note' ? '2px solid var(--accent)' : '2px solid transparent',
                      color: activeDetailTab === 'note' ? 'var(--navy)' : 'var(--muted)',
                      paddingBottom: '12px'
                    }}
                  >
                    🔒 Personal Note
                  </button>
                </div>

                {activeDetailTab === 'details' ? (
                  <>
                    <div className="cdm-field">
                      <div className="cdm-field-label">Escalation Issue Description</div>
                      <div className="cdm-field-value preformatted">{selectedEscalation.desc || 'No description logged.'}</div>
                    </div>
                    <div className="cdm-row">
                      <div className="cdm-field">
                        <div className="cdm-field-label">Escalated To</div>
                        <div className="cdm-field-value">{selectedEscalation.esc || 'CMD / Chairman'}</div>
                      </div>
                      <div className="cdm-field">
                        <div className="cdm-field-label">Target Resolution</div>
                        <div className="cdm-field-value">{selectedEscalation.tgt || '—'}</div>
                      </div>
                    </div>
                    <div className="cdm-row">
                      <div className="cdm-field">
                        <div className="cdm-field-label">Assigned To</div>
                        <div className="cdm-field-value">
                          {(() => {
                            let ids: string[] = [];
                            if (Array.isArray(selectedEscalation.assignedTo)) {
                              ids = selectedEscalation.assignedTo;
                            } else if (typeof selectedEscalation.assignedTo === 'string') {
                              try {
                                ids = JSON.parse(selectedEscalation.assignedTo);
                              } catch (e) {}
                            }
                            if (ids.length === 0) return '—';
                            return ids
                              .map(id => usersList.find(u => u.id === id)?.name)
                              .filter(Boolean)
                              .join(', ');
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="cdm-field">
                      <div className="cdm-field-label">Resolution / Action Taken</div>
                      <div className="cdm-field-value preformatted">{selectedEscalation.res || 'Resolution in progress.'}</div>
                    </div>

                    <div className="cdm-field" style={{ marginTop: '12px' }}>
                      <div className="cdm-field-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Attachments & Documents</span>
                        <label 
                          htmlFor={`review-upload-esc-${selectedEscalation.id}`}
                          style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          📎 Add Attachment
                          <input 
                            type="file" 
                            id={`review-upload-esc-${selectedEscalation.id}`}
                            style={{ display: 'none' }}
                            onChange={(e) => handleAddAttachmentToRecord(e, '/escalations', selectedEscalation, setSelectedEscalation, setEscalations)}
                          />
                        </label>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                        {selectedEscalation.attachments && selectedEscalation.attachments.length > 0 ? (
                          selectedEscalation.attachments.map((att: any) => (
                            <a
                              key={att.id}
                              href={att.data}
                              download={att.name}
                              className="mom-action-item"
                              style={{ margin: 0, padding: '6px 12px', fontSize: '13px', textDecoration: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                              📄 {att.name} ({Math.round(att.size / 1024)} KB)
                            </a>
                          ))
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>No files attached.</span>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <PersonalNoteInner
                    tabName="Escalations"
                    itemName={selectedEscalation.title || 'Escalation'}
                    itemId={selectedEscalation.id}
                    api={api}
                    notes={notes}
                    setNotes={setNotes}
                  />
                )}
              </div>
              <div className="cdm-ftr">
                <button className="btn-cancel" onClick={() => setSelectedEscalation(null)}>Close</button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {hasPermission('Delete', 'Escalations') && (
                    <button className="btn-sm btn-del" onClick={() => handleRecordDelete('/escalations', selectedEscalation.id)}>
                      Delete
                    </button>
                  )}
                  {hasPermission('Edit', 'Escalations') && (
                    <button className="btn-edit-detail" onClick={() => { setSelectedEscalation(null); openEditModal('escalation', selectedEscalation); }}>
                      ✏️ Edit Escalation
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Follow-up detail modal */}
        {selectedFollowup && (
          <div className="card-detail-bg open" onClick={() => setSelectedFollowup(null)}>
            <div className="card-detail-modal" onClick={e => e.stopPropagation()}>
              <div className="cdm-hdr">
                <div className="cdm-hdr-left">
                  <div className="cdm-title">{selectedFollowup.proj}</div>
                  <div className="cdm-subtitle">📞 Business Unit: {selectedFollowup.bu || '—'}</div>
                </div>
                <button className="cdm-close" onClick={() => setSelectedFollowup(null)}>✕</button>
              </div>
              <div className="cdm-body">
                {/* Tab switcher */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '16px', gap: '16px' }}>
                  <button 
                    type="button"
                    onClick={() => setActiveDetailTab('details')}
                    style={{ 
                      padding: '8px 16px', 
                      border: 'none', 
                      background: 'none', 
                      fontWeight: 600, 
                      fontSize: '14px', 
                      cursor: 'pointer', 
                      borderBottom: activeDetailTab === 'details' ? '2px solid var(--accent)' : '2px solid transparent',
                      color: activeDetailTab === 'details' ? 'var(--navy)' : 'var(--muted)',
                      paddingBottom: '12px'
                    }}
                  >
                    📋 Details
                  </button>
                  <button 
                    type="button"
                    onClick={() => setActiveDetailTab('note')}
                    style={{ 
                      padding: '8px 16px', 
                      border: 'none', 
                      background: 'none', 
                      fontWeight: 600, 
                      fontSize: '14px', 
                      cursor: 'pointer', 
                      borderBottom: activeDetailTab === 'note' ? '2px solid var(--accent)' : '2px solid transparent',
                      color: activeDetailTab === 'note' ? 'var(--navy)' : 'var(--muted)',
                      paddingBottom: '12px'
                    }}
                  >
                    🔒 Personal Note
                  </button>
                </div>

                {activeDetailTab === 'details' ? (
                  <>
                    <div className="cdm-row">
                      <div className="cdm-field">
                        <div className="cdm-field-label">Follow up with</div>
                        <div className="cdm-field-value">{selectedFollowup.with || '—'}</div>
                      </div>
                      <div className="cdm-field">
                        <div className="cdm-field-label">Deadline / Due</div>
                        <div className="cdm-field-value">{selectedFollowup.dl || '—'}</div>
                      </div>
                    </div>
                    <div className="cdm-field">
                      <div className="cdm-field-label">Follow-up directive details</div>
                      <div className="cdm-field-value preformatted">{selectedFollowup.desc || 'No details logged.'}</div>
                    </div>

                    <div className="cdm-field" style={{ marginTop: '12px' }}>
                      <div className="cdm-field-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Attachments & Documents</span>
                        <label 
                          htmlFor={`review-upload-fu-${selectedFollowup.id}`}
                          style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          📎 Add Attachment
                          <input 
                            type="file" 
                            id={`review-upload-fu-${selectedFollowup.id}`}
                            style={{ display: 'none' }}
                            onChange={(e) => handleAddAttachmentToRecord(e, '/follow-ups', selectedFollowup, setSelectedFollowup, setFollowups)}
                          />
                        </label>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                        {selectedFollowup.attachments && selectedFollowup.attachments.length > 0 ? (
                          selectedFollowup.attachments.map((att: any) => (
                            <a
                              key={att.id}
                              href={att.data}
                              download={att.name}
                              className="mom-action-item"
                              style={{ margin: 0, padding: '6px 12px', fontSize: '13px', textDecoration: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                              📄 {att.name} ({Math.round(att.size / 1024)} KB)
                            </a>
                          ))
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>No files attached.</span>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <PersonalNoteInner
                    tabName="Followups"
                    itemName={selectedFollowup.title || 'Followup'}
                    itemId={selectedFollowup.id}
                    api={api}
                    notes={notes}
                    setNotes={setNotes}
                  />
                )}
              </div>
              <div className="cdm-ftr">
                <button className="btn-cancel" onClick={() => setSelectedFollowup(null)}>Close</button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {hasPermission('Delete', 'Followups') && (
                    <button className="btn-sm btn-del" onClick={() => handleRecordDelete('/follow-ups', selectedFollowup.id)}>
                      Delete
                    </button>
                  )}
                  {hasPermission('Edit', 'Followups') && (
                    <button className="btn-edit-detail" onClick={() => { setSelectedFollowup(null); openEditModal('followup', selectedFollowup); }}>
                      ✏️ Edit Followup
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Legal dispute detail modal */}
        {selectedLegal && (
          <div className="card-detail-bg open" onClick={() => setSelectedLegal(null)}>
            <div className="card-detail-modal" onClick={e => e.stopPropagation()}>
              <div className="cdm-hdr">
                <div className="cdm-hdr-left">
                  <div className="cdm-title">{selectedLegal.title}</div>
                  <div className="cdm-subtitle">⚖️ Court Reference: {selectedLegal.court}</div>
                </div>
                <button className="cdm-close" onClick={() => setSelectedLegal(null)}>✕</button>
              </div>
              <div className="cdm-body">
                {/* Tab switcher */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '16px', gap: '16px' }}>
                  <button 
                    type="button"
                    onClick={() => setActiveDetailTab('details')}
                    style={{ 
                      padding: '8px 16px', 
                      border: 'none', 
                      background: 'none', 
                      fontWeight: 600, 
                      fontSize: '14px', 
                      cursor: 'pointer', 
                      borderBottom: activeDetailTab === 'details' ? '2px solid var(--accent)' : '2px solid transparent',
                      color: activeDetailTab === 'details' ? 'var(--navy)' : 'var(--muted)',
                      paddingBottom: '12px'
                    }}
                  >
                    📋 Details
                  </button>
                  <button 
                    type="button"
                    onClick={() => setActiveDetailTab('note')}
                    style={{ 
                      padding: '8px 16px', 
                      border: 'none', 
                      background: 'none', 
                      fontWeight: 600, 
                      fontSize: '14px', 
                      cursor: 'pointer', 
                      borderBottom: activeDetailTab === 'note' ? '2px solid var(--accent)' : '2px solid transparent',
                      color: activeDetailTab === 'note' ? 'var(--navy)' : 'var(--muted)',
                      paddingBottom: '12px'
                    }}
                  >
                    🔒 Personal Note
                  </button>
                </div>

                {activeDetailTab === 'details' ? (
                  <>
                    <div className="cdm-row">
                      <div className="cdm-field">
                        <div className="cdm-field-label">Case Number / Reference</div>
                        <div className="cdm-field-value">{selectedLegal.caseNo || '—'}</div>
                      </div>
                      <div className="cdm-field">
                        <div className="cdm-field-label">Hartek Counsel / Lawyer</div>
                        <div className="cdm-field-value">{selectedLegal.counsel || '—'}</div>
                      </div>
                    </div>
                    <div className="cdm-row">
                      <div className="cdm-field">
                        <div className="cdm-field-label">Hartek Entity Group</div>
                        <div className="cdm-field-value">{selectedLegal.entity || '—'}</div>
                      </div>
                      <div className="cdm-field">
                        <div className="cdm-field-label">Nature of proceedings</div>
                        <div className="cdm-field-value">{selectedLegal.nature || '—'}</div>
                      </div>
                    </div>
                    <div className="cdm-row">
                      <div className="cdm-field">
                        <div className="cdm-field-label">LDOH (Last Hearing)</div>
                        <div className="cdm-field-value">{selectedLegal.ldoh || '—'}</div>
                      </div>
                      <div className="cdm-field">
                        <div className="cdm-field-label">NDOH (Next Hearing)</div>
                        <div className="cdm-field-value">{selectedLegal.ndoh || '—'}</div>
                      </div>
                    </div>
                    <div className="cdm-field">
                      <div className="cdm-field-label">Claim value / Exposure amount</div>
                      <div className="cdm-field-value">{selectedLegal.claim || '—'}</div>
                    </div>
                    <div className="cdm-field">
                      <div className="cdm-field-label">Action To Be Taken</div>
                      <div className="cdm-field-value preformatted">{selectedLegal.actionRequired || 'No specific action required.'}</div>
                    </div>
                    <div className="cdm-field">
                      <div className="cdm-field-label">Brief Background Context</div>
                      <div className="cdm-field-value preformatted">{selectedLegal.bg || 'No background description recorded.'}</div>
                    </div>

                    {/* Litigation hearing history timeline entries */}
                    {selectedLegal.timeline && Array.isArray(selectedLegal.timeline) && selectedLegal.timeline.length > 0 && (
                      <div className="legal-cdm-section" style={{ marginTop: '14px' }}>
                        <div className="legal-cdm-section-title">Hearing History Timeline updates</div>
                        <div className="legal-timeline">
                          {selectedLegal.timeline.map((entry: any, index: number) => (
                            <div key={index} className="legal-tl-item">
                              <div className="legal-tl-dot" />
                              <div className="legal-tl-date">{entry.date}</div>
                              <div className="legal-tl-text">{entry.note}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="cdm-field" style={{ marginTop: '14px' }}>
                      <div className="cdm-field-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Case Files & Petitions Attachments</span>
                        <label 
                          htmlFor={`review-upload-legal-${selectedLegal.id}`}
                          style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          📎 Add Attachment
                          <input 
                            type="file" 
                            id={`review-upload-legal-${selectedLegal.id}`}
                            style={{ display: 'none' }}
                            onChange={(e) => handleAddAttachmentToRecord(e, '/legal-cases', selectedLegal, setSelectedLegal, setLegalCases)}
                          />
                        </label>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                        {selectedLegal.attachments && selectedLegal.attachments.length > 0 ? (
                          selectedLegal.attachments.map((att: any) => (
                            <a
                              key={att.id}
                              href={att.data}
                              download={att.name}
                              className="mom-action-item"
                              style={{ margin: 0, padding: '6px 12px', fontSize: '13px', textDecoration: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                              📄 {att.name} ({Math.round(att.size / 1024)} KB)
                            </a>
                          ))
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>No files attached.</span>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <PersonalNoteInner
                    tabName="LegalMIS"
                    itemName={selectedLegal.caseNo || selectedLegal.title || 'Case'}
                    itemId={selectedLegal.id}
                    api={api}
                    notes={notes}
                    setNotes={setNotes}
                  />
                )}
              </div>
              <div className="cdm-ftr">
                <button className="btn-cancel" onClick={() => setSelectedLegal(null)}>Close</button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {hasPermission('Delete', 'Legal') && (
                    <button className="btn-sm btn-del" onClick={() => handleRecordDelete('/legal-cases', selectedLegal.id)}>
                      Delete Case
                    </button>
                  )}
                  {hasPermission('Edit', 'Legal') && (
                    <button className="btn-edit-detail" onClick={() => { setSelectedLegal(null); openEditModal('legal', selectedLegal); }}>
                      ✏️ Edit Row
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ADD/EDIT FORM MODALS */}
        {/* ========================================================================= */}

        {/* 1. Project Add/Edit Modal */}
        {openModalId === 'project' && (
          <div className="modal-bg open">
            <div className="modal">
              <div className="modal-hdr">
                <div className="modal-ttl">{formData.id ? 'Edit Project' : 'Add Project'}</div>
                <button className="modal-x" onClick={() => setOpenModalId(null)}>✕</button>
              </div>
              <form onSubmit={(e) => handleFormSubmit(e, '/projects')}>
                <div className="modal-body">
                  <div className="fg">
                    <label>Project Name <span style={{ color: 'red' }}>*</span></label>
                    <input
                      type="text"
                      required
                      value={formData.name || ''}
                      onChange={e => handleFormInputChange('name', e.target.value)}
                      placeholder="Enter project name"
                    />
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label>Business Unit / Dept <span style={{ color: 'red' }}>*</span></label>
                      <select
                        required
                        value={formData.buId || ''}
                        onChange={e => handleFormInputChange('buId', e.target.value)}
                      >
                        <option value="">Select Business Unit...</option>
                        {departments.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="fg">
                      <label>Client / Customer</label>
                      <input
                        type="text"
                        value={formData.client || ''}
                        onChange={e => handleFormInputChange('client', e.target.value)}
                        placeholder="Enter client name"
                      />
                    </div>
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label>Location / Site</label>
                      <input
                        type="text"
                        value={formData.location || ''}
                        onChange={e => handleFormInputChange('location', e.target.value)}
                        placeholder="Enter site location"
                      />
                    </div>
                    <div className="fg">
                      <label>Project Manager / Lead</label>
                      <input
                        type="text"
                        value={formData.pm || ''}
                        onChange={e => handleFormInputChange('pm', e.target.value)}
                        placeholder="Enter manager name"
                      />
                    </div>
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label>Stage <span style={{ color: 'red' }}>*</span></label>
                      <select
                        required
                        value={formData.stage || ''}
                        onChange={e => handleFormInputChange('stage', e.target.value)}
                      >
                        <option value="">Select Stage...</option>
                        <option value="Planning">Planning</option>
                        <option value="Execution">Execution</option>
                        <option value="Commissioning">Commissioning</option>
                        <option value="Completed">Completed</option>
                        <option value="On Hold">On Hold</option>
                      </select>
                    </div>
                    <div className="fg">
                      <label>Health (RAG) <span style={{ color: 'red' }}>*</span></label>
                      <select
                        required
                        value={formData.health || ''}
                        onChange={e => handleFormInputChange('health', e.target.value)}
                      >
                        <option value="">Select Health Status...</option>
                        <option value="Green">🟢 On Track</option>
                        <option value="Amber">🟠 Watch</option>
                        <option value="Red">🔴 At Risk</option>
                      </select>
                    </div>
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label>Order Value (₹ Cr)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.order || ''}
                        onChange={e => handleFormInputChange('order', parseFloat(e.target.value))}
                        placeholder="0"
                      />
                    </div>
                    <div className="fg">
                      <label>Order / LOA Date</label>
                      <input
                        type="date"
                        value={formData.odate || ''}
                        onChange={e => handleFormInputChange('odate', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label>Scheduled COD</label>
                      <input
                        type="date"
                        value={formData.cod || ''}
                        onChange={e => handleFormInputChange('cod', e.target.value)}
                      />
                    </div>
                    <div className="fg">
                      <label>Revised COD (if any)</label>
                      <input
                        type="date"
                        value={formData.rcod || ''}
                        onChange={e => handleFormInputChange('rcod', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="frow">
                    <div className="fg">
                      <label>Billed to date (₹ Cr)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.billed || ''}
                        onChange={e => handleFormInputChange('billed', parseFloat(e.target.value))}
                        placeholder="0"
                      />
                    </div>
                    <div className="fg">
                      <label>Collected to date (₹ Cr)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.collected || ''}
                        onChange={e => handleFormInputChange('collected', parseFloat(e.target.value))}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label>Next Key Milestone</label>
                      <input
                        type="text"
                        value={formData.milestone || ''}
                        onChange={e => handleFormInputChange('milestone', e.target.value)}
                        placeholder="Enter next milestone description"
                      />
                    </div>
                    <div className="fg">
                      <label>Milestone Target Date</label>
                      <input
                        type="date"
                        value={formData.mdate || ''}
                        onChange={e => handleFormInputChange('mdate', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="fg">
                    <label>Key Risks / Issues</label>
                    <textarea
                      value={formData.risks || ''}
                      onChange={e => handleFormInputChange('risks', e.target.value)}
                      placeholder="Enter key risks, blockers, or dependencies"
                    />
                  </div>
                  <div className="fg">
                    <label>Latest Update / Remarks</label>
                    <textarea
                      value={formData.rem || ''}
                      onChange={e => handleFormInputChange('rem', e.target.value)}
                      placeholder="Enter latest remarks or status updates"
                    />
                  </div>

                  <div className="fg" style={{ marginTop: '16px' }}>
                    <label style={{ fontWeight: 600, fontSize: '12px', color: 'var(--muted)' }}>Attachments</label>
                    <div
                      className="mom-upload-zone"
                      style={{ padding: '20px', cursor: 'pointer', textAlign: 'center', background: '#f8f9fa', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--muted)', fontSize: '13px' }}
                      onClick={() => document.getElementById('project-att-input')?.click()}
                    >
                      📎 Click or drag files here
                    </div>
                    <input
                      type="file"
                      id="project-att-input"
                      multiple
                      style={{ display: 'none' }}
                      onChange={handleAttachmentFileChange}
                    />
                    {formData.attachments && formData.attachments.length > 0 && (
                      <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {formData.attachments.map((att: any, idx: number) => (
                          <div key={idx} className="mom-action-item" style={{ margin: 0, padding: '4px 8px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            📄 {att.name} ({Math.round(att.size / 1024)} KB)
                            <span
                              style={{ color: 'var(--danger)', cursor: 'pointer', fontWeight: 'bold', marginLeft: '6px' }}
                              onClick={() => handleRemoveAttachment(idx)}
                            >
                              ✖
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="modal-ftr">
                  <button type="button" className="btn-cancel" onClick={() => setOpenModalId(null)}>Cancel</button>
                  <button type="submit" className="btn-save">Save Project</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 2. Meeting Add/Edit Modal */}
        {openModalId === 'meeting' && (
          <div className="modal-bg open">
            <div className="modal">
              <div className="modal-hdr">
                <div className="modal-ttl">{formData.id ? 'Edit Meeting' : 'Schedule Meeting'}</div>
                <button className="modal-x" onClick={() => setOpenModalId(null)}>✕</button>
              </div>
              <form onSubmit={(e) => handleFormSubmit(e, '/meetings')}>
                <div className="modal-body">
                  <div className="fg">
                    <label>Meeting Subject <span style={{ color: 'red' }}>*</span></label>
                    <input
                      type="text"
                      required
                      value={formData.name || ''}
                      onChange={e => handleFormInputChange('name', e.target.value)}
                      placeholder="Enter meeting subject"
                    />
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label>Category <span style={{ color: 'red' }}>*</span></label>
                      <select
                        required
                        value={formData.cat || ''}
                        onChange={e => handleFormInputChange('cat', e.target.value)}
                      >
                        <option value="">Select Category...</option>
                        <option value="cmd">CMD Directive Review</option>
                        <option value="board">Board Meeting</option>
                        <option value="review">Business Head Portfolio Review</option>
                        <option value="vendor">Vendor Discussion</option>
                        <option value="safety">Safety Audit</option>
                        <option value="other">General Other</option>
                      </select>
                    </div>
                    <div className="fg">
                      <label>Status <span style={{ color: 'red' }}>*</span></label>
                      <select
                        required
                        value={formData.status || ''}
                        onChange={e => handleFormInputChange('status', e.target.value)}
                      >
                        <option value="">Select Status...</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="done">Conducted Done</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label>Date <span style={{ color: 'red' }}>*</span></label>
                      <input
                        type="date"
                        required
                        value={formData.date || ''}
                        onChange={e => handleFormInputChange('date', e.target.value)}
                      />
                    </div>
                    <div className="fg">
                      <label>Time</label>
                      <input
                        type="time"
                        value={formData.time || ''}
                        onChange={e => handleFormInputChange('time', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="fg">
                    <label>Venue / Location</label>
                    <input
                      type="text"
                      placeholder="Enter venue or meeting link"
                      value={formData.venue || ''}
                      onChange={e => handleFormInputChange('venue', e.target.value)}
                    />
                  </div>
                  <div className="fg">
                    <label>Attendees list</label>
                    <input
                      type="text"
                      placeholder="Enter attendees (comma separated)"
                      value={formData.attendees || ''}
                      onChange={e => handleFormInputChange('attendees', e.target.value)}
                    />
                  </div>
                  <div className="fg">
                    <label>Agenda directives</label>
                    <textarea
                      value={formData.agenda || ''}
                      onChange={e => handleFormInputChange('agenda', e.target.value)}
                    />
                  </div>
                  <div className="fg">
                    <label>Meeting Notes</label>
                    <textarea
                      value={formData.notes || ''}
                      onChange={e => handleFormInputChange('notes', e.target.value)}
                    />
                  </div>

                  <div className="fg" style={{ marginTop: '16px' }}>
                    <label style={{ fontWeight: 600, fontSize: '12px', color: 'var(--muted)' }}>Meeting MOM / Agenda Attachments</label>
                    <div
                      className="mom-upload-zone"
                      style={{ padding: '20px', cursor: 'pointer', textAlign: 'center', background: '#f8f9fa', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--muted)', fontSize: '13px' }}
                      onClick={() => document.getElementById('meeting-att-input')?.click()}
                    >
                      📎 Click to select documents
                    </div>
                    <input
                      type="file"
                      id="meeting-att-input"
                      multiple
                      style={{ display: 'none' }}
                      onChange={handleAttachmentFileChange}
                    />
                    {formData.attachments && formData.attachments.length > 0 && (
                      <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {formData.attachments.map((att: any, idx: number) => (
                          <div key={idx} className="mom-action-item" style={{ margin: 0, padding: '4px 8px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            📄 {att.name} ({Math.round(att.size / 1024)} KB)
                            <span
                              style={{ color: 'var(--danger)', cursor: 'pointer', fontWeight: 'bold', marginLeft: '6px' }}
                              onClick={() => handleRemoveAttachment(idx)}
                            >
                              ✖
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="modal-ftr">
                  <button type="button" className="btn-cancel" onClick={() => setOpenModalId(null)}>Cancel</button>
                  <button type="submit" className="btn-save">Schedule</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 3. Task Add/Edit Modal */}
        {openModalId === 'task' && (
          <div className="modal-bg open">
            <div className="modal">
              <div className="modal-hdr">
                <div className="modal-ttl">{formData.id ? 'Edit Task assignment' : 'Assign Task Directive'}</div>
                <button className="modal-x" onClick={() => setOpenModalId(null)}>✕</button>
              </div>
              <form onSubmit={(e) => handleFormSubmit(e, '/tasks')}>
                <div className="modal-body">
                  <div className="fg">
                    <label>Task title <span style={{ color: 'red' }}>*</span></label>
                    <textarea
                      required
                      placeholder="Enter task title or short description"
                      value={formData.title || ''}
                      onChange={e => handleFormInputChange('title', e.target.value)}
                    />
                  </div>
                  <div className="fg">
                    <label>Details / Instructions</label>
                    <textarea
                      placeholder="Enter details, instructions, or resource links"
                      value={formData.detail || ''}
                      onChange={e => handleFormInputChange('detail', e.target.value)}
                    />
                  </div>
                  <div className="fg">
                    <label>Assign To <span style={{ color: 'red' }}>*</span></label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px', maxHeight: '180px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px', background: '#f8fafc' }}>
                      {getEligibleAssignees().length === 0 ? (
                        <div style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>
                          No eligible employees report to you.
                        </div>
                      ) : (
                        getEligibleAssignees().map((u: any) => (
                          <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={formData.assigneeIds?.includes(u.id) || false}
                              onChange={e => {
                                const ids = formData.assigneeIds || [];
                                const nextIds = e.target.checked
                                  ? [...ids, u.id]
                                  : ids.filter((id: string) => id !== u.id);
                                handleFormInputChange('assigneeIds', nextIds);
                              }}
                            />
                            {u.name} ({u.email})
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label>Priority</label>
                      <select
                        value={formData.pri || ''}
                        onChange={e => handleFormInputChange('pri', e.target.value)}
                      >
                        <option value="">Select Priority...</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                    <div className="fg">
                      <label>Due Date</label>
                      <input
                        type="date"
                        value={formData.due || ''}
                        onChange={e => handleFormInputChange('due', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="fg">
                    <label>Status</label>
                    <select
                      value={formData.st || ''}
                      onChange={e => handleFormInputChange('st', e.target.value)}
                    >
                      <option value="">Select Status...</option>
                      <option value="Open">Open</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Done">Done</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>

                  <div className="fg" style={{ marginTop: '16px' }}>
                    <label style={{ fontWeight: 600, fontSize: '12px', color: 'var(--muted)' }}>Task Directive Attachments</label>
                    <div
                      className="mom-upload-zone"
                      style={{ padding: '20px', cursor: 'pointer', textAlign: 'center', background: '#f8f9fa', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--muted)', fontSize: '13px' }}
                      onClick={() => document.getElementById('task-att-input')?.click()}
                    >
                      📎 Click to select documents
                    </div>
                    <input
                      type="file"
                      id="task-att-input"
                      multiple
                      style={{ display: 'none' }}
                      onChange={handleAttachmentFileChange}
                    />
                    {formData.attachments && formData.attachments.length > 0 && (
                      <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {formData.attachments.map((att: any, idx: number) => (
                          <div key={idx} className="mom-action-item" style={{ margin: 0, padding: '4px 8px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            📄 {att.name} ({Math.round(att.size / 1024)} KB)
                            <span
                              style={{ color: 'var(--danger)', cursor: 'pointer', fontWeight: 'bold', marginLeft: '6px' }}
                              onClick={() => handleRemoveAttachment(idx)}
                            >
                              ✖
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="modal-ftr">
                  <button type="button" className="btn-cancel" onClick={() => setOpenModalId(null)}>Cancel</button>
                  <button type="submit" className="btn-save">Assign</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 4. Action Add/Edit Modal */}
        {openModalId === 'action' && (
          <div className="modal-bg open">
            <div className="modal">
              <div className="modal-hdr">
                <div className="modal-ttl">{formData.id ? 'Edit Action' : 'Add Action Directive'}</div>
                <button className="modal-x" onClick={() => setOpenModalId(null)}>✕</button>
              </div>
              <form onSubmit={(e) => handleFormSubmit(e, '/action-items')}>
                <div className="modal-body">
                  <div className="fg">
                    <label>Action Directive <span style={{ color: 'red' }}>*</span></label>
                    <textarea
                      required
                      placeholder="Enter action directive description"
                      value={formData.item || ''}
                      onChange={e => handleFormInputChange('item', e.target.value)}
                    />
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label>Responsible Owner <span style={{ color: 'red' }}>*</span></label>
                      <input
                        type="text"
                        required
                        placeholder="Enter owner name"
                        value={formData.own || ''}
                        onChange={e => handleFormInputChange('own', e.target.value)}
                      />
                    </div>
                    <div className="fg">
                      <label>Department / Business Unit</label>
                      <input
                        type="text"
                        placeholder="Enter department or business unit"
                        value={formData.dept || ''}
                        onChange={e => handleFormInputChange('dept', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label>Priority</label>
                      <select
                        value={formData.pri || ''}
                        onChange={e => handleFormInputChange('pri', e.target.value)}
                      >
                        <option value="">Select Priority...</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                    <div className="fg">
                      <label>Due Date</label>
                      <input
                        type="date"
                        value={formData.due || ''}
                        onChange={e => handleFormInputChange('due', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="fg">
                    <label>Status</label>
                    <select
                      value={formData.st || ''}
                      onChange={e => handleFormInputChange('st', e.target.value)}
                    >
                      <option value="">Select Status...</option>
                      <option value="Open">Open</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Done">Done</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>
                  <div className="fg">
                    <label>Assign To <span style={{ color: 'red' }}>*</span></label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px', maxHeight: '180px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px', background: '#f8fafc' }}>
                      {getEligibleAssignees().length === 0 ? (
                        <div style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>
                          No eligible employees report to you.
                        </div>
                      ) : (
                        getEligibleAssignees().map((u: any) => (
                          <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={formData.assignedTo?.includes(u.id) || false}
                              onChange={e => {
                                const ids = formData.assignedTo || [];
                                const nextIds = e.target.checked
                                  ? [...ids, u.id]
                                  : ids.filter((id: string) => id !== u.id);
                                handleFormInputChange('assignedTo', nextIds);
                              }}
                            />
                            {u.name} ({u.email})
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="fg">
                    <label>Update Remarks / Progress log</label>
                    <textarea
                      placeholder="Enter status update or remarks"
                      value={formData.rem || ''}
                      onChange={e => handleFormInputChange('rem', e.target.value)}
                    />
                  </div>

                  <div className="fg" style={{ marginTop: '16px' }}>
                    <label style={{ fontWeight: 600, fontSize: '12px', color: 'var(--muted)' }}>Action Directive Attachments</label>
                    <div
                      className="mom-upload-zone"
                      style={{ padding: '20px', cursor: 'pointer', textAlign: 'center', background: '#f8f9fa', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--muted)', fontSize: '13px' }}
                      onClick={() => document.getElementById('action-att-input')?.click()}
                    >
                      📎 Click to select documents
                    </div>
                    <input
                      type="file"
                      id="action-att-input"
                      multiple
                      style={{ display: 'none' }}
                      onChange={handleAttachmentFileChange}
                    />
                    {formData.attachments && formData.attachments.length > 0 && (
                      <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {formData.attachments.map((att: any, idx: number) => (
                          <div key={idx} className="mom-action-item" style={{ margin: 0, padding: '4px 8px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            📄 {att.name} ({Math.round(att.size / 1024)} KB)
                            <span
                              style={{ color: 'var(--danger)', cursor: 'pointer', fontWeight: 'bold', marginLeft: '6px' }}
                              onClick={() => handleRemoveAttachment(idx)}
                            >
                              ✖
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="modal-ftr">
                  <button type="button" className="btn-cancel" onClick={() => setOpenModalId(null)}>Cancel</button>
                  <button type="submit" className="btn-save">Save Directive</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 5. Escalation Add/Edit Modal */}
        {openModalId === 'escalation' && (
          <div className="modal-bg open">
            <div className="modal">
              <div className="modal-hdr">
                <div className="modal-ttl">{formData.id ? 'Edit Escalation' : 'Raise Escalation'}</div>
                <button className="modal-x" onClick={() => setOpenModalId(null)}>✕</button>
              </div>
              <form onSubmit={(e) => handleFormSubmit(e, '/escalations')}>
                <div className="modal-body">
                  <div className="fg">
                    <label>Project Name <span style={{ color: 'red' }}>*</span></label>
                    <input
                      type="text"
                      required
                      placeholder="Enter project name"
                      value={formData.proj || ''}
                      onChange={e => handleFormInputChange('proj', e.target.value)}
                    />
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label>Escalation Type <span style={{ color: 'red' }}>*</span></label>
                      <select
                        required
                        value={formData.type || ''}
                        onChange={e => handleFormInputChange('type', e.target.value)}
                      >
                        <option value="">Select Escalation Type...</option>
                        <option value="Technical">Technical</option>
                        <option value="Commercial">Commercial</option>
                        <option value="Regulatory">Regulatory</option>
                        <option value="Resources">Resources</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="fg">
                      <label>Severity <span style={{ color: 'red' }}>*</span></label>
                      <select
                        required
                        value={formData.sev || ''}
                        onChange={e => handleFormInputChange('sev', e.target.value)}
                      >
                        <option value="">Select Severity...</option>
                        <option value="Critical">Critical</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                      </select>
                    </div>
                  </div>
                  <div className="fg">
                    <label>Issue Description <span style={{ color: 'red' }}>*</span></label>
                    <textarea
                      required
                      placeholder="Enter issue description"
                      value={formData.desc || ''}
                      onChange={e => handleFormInputChange('desc', e.target.value)}
                    />
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label>Raised By</label>
                      <input
                        type="text"
                        placeholder="Enter reporter name"
                        value={formData.by || ''}
                        onChange={e => handleFormInputChange('by', e.target.value)}
                      />
                    </div>
                    <div className="fg">
                      <label>Target Resolution Date</label>
                      <input
                        type="text"
                        placeholder="Enter target resolution date"
                        value={formData.tgt || ''}
                        onChange={e => handleFormInputChange('tgt', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="fg">
                    <label>Escalated Status</label>
                    <select
                      value={formData.st || ''}
                      onChange={e => handleFormInputChange('st', e.target.value)}
                    >
                      <option value="">Select Status...</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Escalated">Escalated</option>
                      <option value="Resolved">Resolved</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>
                  <div className="fg">
                    <label>Assign To <span style={{ color: 'red' }}>*</span></label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px', maxHeight: '180px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px', background: '#f8fafc' }}>
                      {getEligibleAssignees().length === 0 ? (
                        <div style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>
                          No eligible employees report to you.
                        </div>
                      ) : (
                        getEligibleAssignees().map((u: any) => (
                          <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={formData.assignedTo?.includes(u.id) || false}
                              onChange={e => {
                                const ids = formData.assignedTo || [];
                                const nextIds = e.target.checked
                                  ? [...ids, u.id]
                                  : ids.filter((id: string) => id !== u.id);
                                handleFormInputChange('assignedTo', nextIds);
                              }}
                            />
                            {u.name} ({u.email})
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="fg">
                    <label>Resolution / Action Taken</label>
                    <textarea
                      placeholder="Enter resolution actions or status"
                      value={formData.res || ''}
                      onChange={e => handleFormInputChange('res', e.target.value)}
                    />
                  </div>

                  <div className="fg" style={{ marginTop: '16px' }}>
                    <label style={{ fontWeight: 600, fontSize: '12px', color: 'var(--muted)' }}>Escalation Briefing Attachments</label>
                    <div
                      className="mom-upload-zone"
                      style={{ padding: '20px', cursor: 'pointer', textAlign: 'center', background: '#f8f9fa', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--muted)', fontSize: '13px' }}
                      onClick={() => document.getElementById('escalation-att-input')?.click()}
                    >
                      📎 Click to select documents
                    </div>
                    <input
                      type="file"
                      id="escalation-att-input"
                      multiple
                      style={{ display: 'none' }}
                      onChange={handleAttachmentFileChange}
                    />
                    {formData.attachments && formData.attachments.length > 0 && (
                      <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {formData.attachments.map((att: any, idx: number) => (
                          <div key={idx} className="mom-action-item" style={{ margin: 0, padding: '4px 8px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            📄 {att.name} ({Math.round(att.size / 1024)} KB)
                            <span
                              style={{ color: 'var(--danger)', cursor: 'pointer', fontWeight: 'bold', marginLeft: '6px' }}
                              onClick={() => handleRemoveAttachment(idx)}
                            >
                              ✖
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="modal-ftr">
                  <button type="button" className="btn-cancel" onClick={() => setOpenModalId(null)}>Cancel</button>
                  <button type="submit" className="btn-save">Raise Escalation</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 6. Followup Add/Edit Modal */}
        {openModalId === 'followup' && (
          <div className="modal-bg open">
            <div className="modal">
              <div className="modal-hdr">
                <div className="modal-ttl">{formData.id ? 'Edit Followup' : 'Register Follow-up'}</div>
                <button className="modal-x" onClick={() => setOpenModalId(null)}>✕</button>
              </div>
              <form onSubmit={(e) => handleFormSubmit(e, '/follow-ups')}>
                <div className="modal-body">
                  <div className="fg">
                    <label>Project / Subject <span style={{ color: 'red' }}>*</span></label>
                    <input
                      type="text"
                      required
                      placeholder="Enter project or subject name"
                      value={formData.proj || ''}
                      onChange={e => handleFormInputChange('proj', e.target.value)}
                    />
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label>Business Unit</label>
                      <input
                        type="text"
                        placeholder="Enter business unit"
                        value={formData.bu || ''}
                        onChange={e => handleFormInputChange('bu', e.target.value)}
                      />
                    </div>
                    <div className="fg">
                      <label>BU Head / Owner</label>
                      <input
                        type="text"
                        placeholder="Enter BU head or owner name"
                        value={formData.hd || ''}
                        onChange={e => handleFormInputChange('hd', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label>Follow up with</label>
                      <input
                        type="text"
                        placeholder="Enter follow up recipient/entity"
                        value={formData.with || ''}
                        onChange={e => handleFormInputChange('with', e.target.value)}
                      />
                    </div>
                    <div className="fg">
                      <label>Deadline Date</label>
                      <input
                        type="date"
                        value={formData.dl || ''}
                        onChange={e => handleFormInputChange('dl', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label>Priority <span style={{ color: 'red' }}>*</span></label>
                      <select
                        required
                        value={formData.priority || ''}
                        onChange={e => handleFormInputChange('priority', e.target.value)}
                      >
                        <option value="">Select Priority...</option>
                        <option value="Critical">Critical</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                    <div className="fg">
                      <label>Status <span style={{ color: 'red' }}>*</span></label>
                      <select
                        required
                        value={formData.st || ''}
                        onChange={e => handleFormInputChange('st', e.target.value)}
                      >
                        <option value="">Select Status...</option>
                        <option value="Open">Open</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Done">Done</option>
                        <option value="Closed">Closed</option>
                      </select>
                    </div>
                  </div>
                  <div className="fg">
                    <label>Follow-up Description directives</label>
                    <textarea
                      placeholder="Enter follow-up directive description"
                      value={formData.desc || ''}
                      onChange={e => handleFormInputChange('desc', e.target.value)}
                    />
                  </div>

                  <div className="fg" style={{ marginTop: '16px' }}>
                    <label style={{ fontWeight: 600, fontSize: '12px', color: 'var(--muted)' }}>Follow-up Documents Attachments</label>
                    <div
                      className="mom-upload-zone"
                      style={{ padding: '20px', cursor: 'pointer', textAlign: 'center', background: '#f8f9fa', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--muted)', fontSize: '13px' }}
                      onClick={() => document.getElementById('followup-att-input')?.click()}
                    >
                      📎 Click to select documents
                    </div>
                    <input
                      type="file"
                      id="followup-att-input"
                      multiple
                      style={{ display: 'none' }}
                      onChange={handleAttachmentFileChange}
                    />
                    {formData.attachments && formData.attachments.length > 0 && (
                      <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {formData.attachments.map((att: any, idx: number) => (
                          <div key={idx} className="mom-action-item" style={{ margin: 0, padding: '4px 8px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            📄 {att.name} ({Math.round(att.size / 1024)} KB)
                            <span
                              style={{ color: 'var(--danger)', cursor: 'pointer', fontWeight: 'bold', marginLeft: '6px' }}
                              onClick={() => handleRemoveAttachment(idx)}
                            >
                              ✖
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="modal-ftr">
                  <button type="button" className="btn-cancel" onClick={() => setOpenModalId(null)}>Cancel</button>
                  <button type="submit" className="btn-save">Register</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 7. Legal Dispute Add/Edit Modal */}
        {openModalId === 'legal' && (
          <div className="modal-bg open">
            <div className="modal">
              <div className="modal-hdr">
                <div className="modal-ttl">{formData.id ? 'Edit Case entry' : 'Add Litigation Case'}</div>
                <button className="modal-x" onClick={() => setOpenModalId(null)}>✕</button>
              </div>
              <form onSubmit={(e) => handleFormSubmit(e, '/legal-cases')}>
                <div className="modal-body">
                  <div className="fg">
                    <label>Case Party Title <span style={{ color: 'red' }}>*</span></label>
                    <input
                      type="text"
                      required
                      placeholder="Enter case party title"
                      value={formData.title || ''}
                      onChange={e => handleFormInputChange('title', e.target.value)}
                    />
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label>Section Group / Court Category <span style={{ color: 'red' }}>*</span></label>
                      <input
                        type="text"
                        required
                        placeholder="Enter court category"
                        value={formData.group || ''}
                        onChange={e => handleFormInputChange('group', e.target.value)}
                      />
                    </div>
                    <div className="fg">
                      <label>Filed By / Against <span style={{ color: 'red' }}>*</span></label>
                      <input
                        type="text"
                        required
                        placeholder="Enter filed by/against information"
                        value={formData.filedBy || ''}
                        onChange={e => handleFormInputChange('filedBy', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label>Case Number</label>
                      <input
                        type="text"
                        placeholder="Enter case number"
                        value={formData.caseNo || ''}
                        onChange={e => handleFormInputChange('caseNo', e.target.value)}
                      />
                    </div>
                    <div className="fg">
                      <label>Court Forum <span style={{ color: 'red' }}>*</span></label>
                      <input
                        type="text"
                        required
                        placeholder="Enter court forum"
                        value={formData.court || ''}
                        onChange={e => handleFormInputChange('court', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label>nature of Proceedings</label>
                      <input
                        type="text"
                        placeholder="Enter nature of proceedings"
                        value={formData.nature || ''}
                        onChange={e => handleFormInputChange('nature', e.target.value)}
                      />
                    </div>
                    <div className="fg">
                      <label>Hartek Group Entity</label>
                      <input
                        type="text"
                        placeholder="Enter Hartek group entity"
                        value={formData.entity || ''}
                        onChange={e => handleFormInputChange('entity', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label>External Counsel / Lawyer</label>
                      <input
                        type="text"
                        placeholder="Enter external counsel/lawyer name"
                        value={formData.counsel || ''}
                        onChange={e => handleFormInputChange('counsel', e.target.value)}
                      />
                    </div>
                    <div className="fg">
                      <label>Internal Handler initials</label>
                      <input
                        type="text"
                        placeholder="Enter handler initials"
                        value={formData.handler || ''}
                        onChange={e => handleFormInputChange('handler', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label>Last Date of Hearing (LDOH)</label>
                      <input
                        type="date"
                        value={formData.ldoh || ''}
                        onChange={e => handleFormInputChange('ldoh', e.target.value)}
                      />
                    </div>
                    <div className="fg">
                      <label>Next Date of Hearing (NDOH)</label>
                      <input
                        type="text"
                        placeholder="Enter next hearing date or status"
                        value={formData.ndoh || ''}
                        onChange={e => handleFormInputChange('ndoh', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="frow">
                    <div className="fg">
                      <label>Case Risk <span style={{ color: 'red' }}>*</span></label>
                      <select
                        required
                        value={formData.risk || ''}
                        onChange={e => handleFormInputChange('risk', e.target.value)}
                      >
                        <option value="">Select Case Risk...</option>
                        <option value="High">High Risk</option>
                        <option value="Medium">Medium Risk</option>
                        <option value="Low">Low Risk</option>
                      </select>
                    </div>
                    <div className="fg">
                      <label>Litigation Status <span style={{ color: 'red' }}>*</span></label>
                      <select
                        required
                        value={formData.status || ''}
                        onChange={e => handleFormInputChange('status', e.target.value)}
                      >
                        <option value="">Select Status...</option>
                        <option value="Active">Active</option>
                        <option value="Favorable">Favorable</option>
                        <option value="Adverse">Adverse</option>
                        <option value="Pending">Pending</option>
                        <option value="Stayed">Stayed</option>
                        <option value="Settled">Settled</option>
                      </select>
                    </div>
                  </div>
                  <div className="fg">
                    <label>Claim Amount details (₹)</label>
                    <input
                      type="text"
                      placeholder="Enter claim amount details"
                      value={formData.claim || ''}
                      onChange={e => handleFormInputChange('claim', e.target.value)}
                    />
                  </div>
                  <div className="fg">
                    <label>Action Required Directive</label>
                    <textarea
                      placeholder="Enter required legal actions or directives"
                      value={formData.actionRequired || ''}
                      onChange={e => handleFormInputChange('actionRequired', e.target.value)}
                    />
                  </div>
                  <div className="fg">
                    <label>Background History</label>
                    <textarea
                      placeholder="Enter brief case history and background context"
                      value={formData.bg || ''}
                      onChange={e => handleFormInputChange('bg', e.target.value)}
                    />
                  </div>

                  <div className="fg" style={{ marginTop: '16px' }}>
                    <label style={{ fontWeight: 600, fontSize: '12px', color: 'var(--muted)' }}>Case Attachments (PDF, Petitions, Docs)</label>
                    <div
                      className="mom-upload-zone"
                      style={{ padding: '20px', cursor: 'pointer', textAlign: 'center', background: '#f8f9fa', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--muted)', fontSize: '13px' }}
                      onClick={() => document.getElementById('legal-att-input')?.click()}
                    >
                      📎 Click to select case files
                    </div>
                    <input
                      type="file"
                      id="legal-att-input"
                      multiple
                      style={{ display: 'none' }}
                      onChange={handleAttachmentFileChange}
                    />
                    {formData.attachments && formData.attachments.length > 0 && (
                      <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {formData.attachments.map((att: any, idx: number) => (
                          <div key={idx} className="mom-action-item" style={{ margin: 0, padding: '4px 8px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            📄 {att.name} ({Math.round(att.size / 1024)} KB)
                            <span
                              style={{ color: 'var(--danger)', cursor: 'pointer', fontWeight: 'bold', marginLeft: '6px' }}
                              onClick={() => handleRemoveAttachment(idx)}
                            >
                              ✖
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="modal-ftr">
                  <button type="button" className="btn-cancel" onClick={() => setOpenModalId(null)}>Cancel</button>
                  <button type="submit" className="btn-save">Save Case</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
