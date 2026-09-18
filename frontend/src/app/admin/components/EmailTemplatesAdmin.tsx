'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import {
  FaEnvelope,
  FaPlus,
  FaEdit,
  FaTrash,
  FaEye,
  FaCheck,
  FaTimes,
  FaSpinner,
  FaPaperPlane,
  FaSearch,
  FaCode,
  FaInfoCircle,
  FaToggleOn,
  FaToggleOff,
} from 'react-icons/fa';

interface EmailTemplate {
  id: string;
  name: string;
  eventKey: string;
  subject: string;
  body: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  availableVariables?: string[];
}

interface SystemEvent {
  eventKey: string;
  name: string;
  description: string;
  defaultSubject: string;
  defaultBody: string;
  availableVariables: string[];
}

interface EmailTemplatesAdminProps {
  isDark: boolean;
  showToast: (msg: string, type?: 'ok' | 'err') => void;
}

export default function EmailTemplatesAdmin({ isDark, showToast }: EmailTemplatesAdminProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal States
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState<{ subject: string; body: string; sampleVariablesUsed?: any } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    eventKey: 'PASSWORD_RESET',
    subject: '',
    body: '',
    description: '',
    isActive: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [templatesData, eventsData] = await Promise.all([
        api.get('/email-templates'),
        api.get('/email-templates/events').catch(() => []),
      ]);
      setTemplates(templatesData || []);
      setSystemEvents(eventsData || []);
    } catch (err: any) {
      showToast(err.message || 'Error loading email templates', 'err');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    const defaultEvt = systemEvents.find((e) => e.eventKey === 'PASSWORD_RESET') || systemEvents[0];
    setEditingTemplate(null);
    setFormData({
      name: defaultEvt ? defaultEvt.name : 'New Email Template',
      eventKey: defaultEvt ? defaultEvt.eventKey : 'PASSWORD_RESET',
      subject: defaultEvt ? defaultEvt.defaultSubject : '',
      body: defaultEvt ? defaultEvt.defaultBody : '',
      description: defaultEvt ? defaultEvt.description : '',
      isActive: true,
    });
    setShowModal(true);
  };

  const handleOpenEditModal = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      eventKey: template.eventKey,
      subject: template.subject,
      body: template.body,
      description: template.description || '',
      isActive: template.isActive,
    });
    setShowModal(true);
  };

  const handleEventKeyChange = (eventKey: string) => {
    const evt = systemEvents.find((e) => e.eventKey === eventKey);
    setFormData((prev) => ({
      ...prev,
      eventKey,
      name: !editingTemplate && evt ? evt.name : prev.name,
      subject: !editingTemplate && evt ? evt.defaultSubject : prev.subject,
      body: !editingTemplate && evt ? evt.defaultBody : prev.body,
      description: !editingTemplate && evt ? evt.description : prev.description,
    }));
  };

  const handleInsertVariable = (varName: string) => {
    const variableTag = `{{${varName}}}`;
    setFormData((prev) => ({
      ...prev,
      body: prev.body + (prev.body.endsWith(' ') || prev.body.length === 0 ? '' : ' ') + variableTag,
    }));
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.subject.trim() || !formData.body.trim()) {
      showToast('Please fill in all required template fields.', 'err');
      return;
    }

    setSaving(true);
    try {
      if (editingTemplate) {
        await api.put(`/email-templates/${editingTemplate.id}`, formData);
        showToast('Email template updated successfully.');
      } else {
        await api.post('/email-templates', formData);
        showToast('New email template created successfully.');
      }
      setShowModal(false);
      loadInitialData();
    } catch (err: any) {
      showToast(err.message || 'Failed to save email template', 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (id: string) => {
    try {
      await api.patch(`/email-templates/${id}/toggle`, {});
      showToast('Template active status updated.');
      loadInitialData();
    } catch (err: any) {
      showToast(err.message || 'Error updating template status', 'err');
    }
  };

  const handleDeleteTemplate = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the template "${name}"?`)) return;
    try {
      await api.delete(`/email-templates/${id}`);
      showToast('Email template deleted.');
      loadInitialData();
    } catch (err: any) {
      showToast(err.message || 'Error deleting email template', 'err');
    }
  };

  const handlePreview = async (templateId?: string) => {
    setPreviewLoading(true);
    setShowPreviewModal(true);
    try {
      const payload = templateId
        ? { id: templateId }
        : { subject: formData.subject, body: formData.body };
      const res = await api.post('/email-templates/preview', payload);
      setPreviewData(res);
    } catch (err: any) {
      showToast(err.message || 'Failed to generate template preview', 'err');
      setShowPreviewModal(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const currentEventMetadata = systemEvents.find((e) => e.eventKey === formData.eventKey);
  const availableVars = currentEventMetadata?.availableVariables || [
    'user_name',
    'user_email',
    'company_name',
    'login_url',
    'reset_link',
    'otp_code',
  ];

  const filteredTemplates = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.eventKey.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* HEADER SECTION */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          background: isDark ? '#1e293b' : '#ffffff',
          padding: '20px',
          borderRadius: '12px',
          border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: isDark ? '#f8fafc' : '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FaEnvelope style={{ color: isDark ? '#3b82f6' : '#0f2a4a' }} />
            Notification Email Templates
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: isDark ? '#94a3b8' : '#64748b' }}>
            Configure and manage reusable system email templates for automated user notifications and security alerts.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: isDark ? '#3b82f6' : '#0f2a4a',
            color: '#ffffff',
            border: 'none',
            padding: '10px 18px',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          <FaPlus /> Create Email Template
        </button>
      </div>

      {/* FILTER & ROSTER TABLE */}
      <div
        style={{
          background: isDark ? '#1e293b' : '#ffffff',
          borderRadius: '12px',
          border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
            <FaSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: isDark ? '#64748b' : '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search by template name, event key, subject..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                borderRadius: '8px',
                border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                background: isDark ? '#0f172a' : '#f8fafc',
                color: isDark ? '#f8fafc' : '#0f172a',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ fontSize: '13px', color: isDark ? '#94a3b8' : '#64748b' }}>
            Showing <strong>{filteredTemplates.length}</strong> of <strong>{templates.length}</strong> email templates
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: isDark ? '#94a3b8' : '#64748b' }}>
            <FaSpinner className="spin" style={{ fontSize: '24px', marginBottom: '8px' }} />
            <div>Loading notification templates...</div>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: isDark ? '#94a3b8' : '#64748b' }}>
            No email templates match your criteria.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: isDark ? '1px solid #334155' : '1px solid #e2e8f0', color: isDark ? '#94a3b8' : '#64748b' }}>
                  <th style={{ padding: '12px', fontWeight: 600 }}>Template Name</th>
                  <th style={{ padding: '12px', fontWeight: 600 }}>Event Key</th>
                  <th style={{ padding: '12px', fontWeight: 600 }}>Email Subject</th>
                  <th style={{ padding: '12px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '12px', fontWeight: 600 }}>Last Updated</th>
                  <th style={{ padding: '12px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTemplates.map((t) => (
                  <tr
                    key={t.id}
                    style={{
                      borderBottom: isDark ? '1px solid #334155' : '1px solid #f1f5f9',
                      color: isDark ? '#e2e8f0' : '#1e293b',
                    }}
                  >
                    <td style={{ padding: '14px 12px', fontWeight: 600 }}>{t.name}</td>
                    <td style={{ padding: '14px 12px' }}>
                      <span
                        style={{
                          background: isDark ? 'rgba(59, 130, 246, 0.15)' : '#e0f2fe',
                          color: isDark ? '#60a5fa' : '#0369a1',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          fontFamily: 'monospace',
                        }}
                      >
                        {t.eventKey}
                      </span>
                    </td>
                    <td style={{ padding: '14px 12px', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.subject}
                    </td>
                    <td style={{ padding: '14px 12px' }}>
                      <button
                        onClick={() => handleToggleActive(t.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontWeight: 600,
                          fontSize: '12px',
                          color: t.isActive ? (isDark ? '#4ade80' : '#16a34a') : isDark ? '#94a3b8' : '#94a3b8',
                        }}
                        title={t.isActive ? 'Click to Disable' : 'Click to Enable'}
                      >
                        {t.isActive ? <FaToggleOn style={{ fontSize: '20px', color: '#16a34a' }} /> : <FaToggleOff style={{ fontSize: '20px' }} />}
                        <span>{t.isActive ? 'Active' : 'Inactive'}</span>
                      </button>
                    </td>
                    <td style={{ padding: '14px 12px', fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>
                      {new Date(t.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '14px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                          onClick={() => handlePreview(t.id)}
                          style={{
                            background: isDark ? '#334155' : '#f1f5f9',
                            color: isDark ? '#cbd5e1' : '#475569',
                            border: 'none',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                          title="Preview Rendered Email"
                        >
                          <FaEye /> Preview
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(t)}
                          style={{
                            background: isDark ? 'rgba(59, 130, 246, 0.2)' : '#eff6ff',
                            color: isDark ? '#60a5fa' : '#2563eb',
                            border: 'none',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                          title="Edit Template"
                        >
                          <FaEdit /> Edit
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(t.id, t.name)}
                          style={{
                            background: isDark ? 'rgba(239, 68, 68, 0.2)' : '#fef2f2',
                            color: isDark ? '#f87171' : '#dc2626',
                            border: 'none',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                          title="Delete Template"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: isDark ? '#1e293b' : '#ffffff',
              borderRadius: '16px',
              width: '720px',
              maxWidth: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a' }}>
                {editingTemplate ? 'Edit Email Template' : 'Create Email Template'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', color: isDark ? '#94a3b8' : '#64748b', fontSize: '18px', cursor: 'pointer' }}
              >
                <FaTimes />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Event Key Select */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: isDark ? '#cbd5e1' : '#334155' }}>
                  Notification Type / System Event Key *
                </label>
                <select
                  value={formData.eventKey}
                  onChange={(e) => handleEventKeyChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                    background: isDark ? '#0f172a' : '#ffffff',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                >
                  {systemEvents.map((evt) => (
                    <option key={evt.eventKey} value={evt.eventKey}>
                      {evt.name} ({evt.eventKey})
                    </option>
                  ))}
                  {!systemEvents.some((e) => e.eventKey === formData.eventKey) && (
                    <option value={formData.eventKey}>{formData.eventKey}</option>
                  )}
                </select>
                {currentEventMetadata && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>
                    {currentEventMetadata.description}
                  </p>
                )}
              </div>

              {/* Template Name & Status */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: isDark ? '#cbd5e1' : '#334155' }}>
                    Template Display Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Password Reset Notification"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                      background: isDark ? '#0f172a' : '#ffffff',
                      color: isDark ? '#f8fafc' : '#0f172a',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: isDark ? '#cbd5e1' : '#334155' }}>
                    Status
                  </label>
                  <select
                    value={formData.isActive ? 'active' : 'inactive'}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'active' })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                      background: isDark ? '#0f172a' : '#ffffff',
                      color: isDark ? '#f8fafc' : '#0f172a',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Email Subject */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: isDark ? '#cbd5e1' : '#334155' }}>
                  Email Subject Line *
                </label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="e.g. Reset your HARTEK CMD password"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                    background: isDark ? '#0f172a' : '#ffffff',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Security & Variable Notice Banner */}
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff',
                  border: isDark ? '1px solid #1e40af' : '1px solid #bfdbfe',
                  color: isDark ? '#93c5fd' : '#1e40af',
                  fontSize: '12px',
                  lineHeight: '1.4',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <FaInfoCircle style={{ flexShrink: 0, fontSize: '15px' }} />
                <span>
                  <strong>Template Routing Guard:</strong> Template variables control email subject and body content. Recipient email routing (<code style={{ fontFamily: 'monospace' }}>TO</code>) is strictly enforced by application business logic and target user security profiles.
                </span>
              </div>

              {/* Available Dynamic Variables */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: isDark ? '#cbd5e1' : '#334155' }}>
                  Available Variables for {formData.eventKey} (Click to insert):
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {availableVars.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleInsertVariable(v)}
                      style={{
                        background: isDark ? 'rgba(59, 130, 246, 0.2)' : '#e0f2fe',
                        color: isDark ? '#60a5fa' : '#0284c7',
                        border: 'none',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      title={`Click to insert {{${v}}}`}
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Email Body Textarea */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: isDark ? '#cbd5e1' : '#334155' }}>
                  Email Content Body *
                </label>
                <textarea
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  rows={10}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                    background: isDark ? '#0f172a' : '#ffffff',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    outline: 'none',
                    lineHeight: '1.5',
                  }}
                />
              </div>

              {/* Footer Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => handlePreview()}
                  style={{
                    background: 'transparent',
                    color: isDark ? '#60a5fa' : '#2563eb',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <FaEye /> Live Preview Form Content
                </button>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    style={{
                      background: isDark ? '#334155' : '#f1f5f9',
                      color: isDark ? '#cbd5e1' : '#475569',
                      border: 'none',
                      padding: '10px 18px',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      background: isDark ? '#3b82f6' : '#0f2a4a',
                      color: '#ffffff',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    {saving && <FaSpinner className="spin" />}
                    {editingTemplate ? 'Save Changes' : 'Create Template'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PREVIEW MODAL */}
      {showPreviewModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: isDark ? '#1e293b' : '#ffffff',
              borderRadius: '16px',
              width: '640px',
              maxWidth: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: '24px',
              border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FaEye style={{ color: isDark ? '#3b82f6' : '#0f2a4a' }} />
                Email Rendered Preview
              </h3>
              <button
                onClick={() => setShowPreviewModal(false)}
                style={{ background: 'none', border: 'none', color: isDark ? '#94a3b8' : '#64748b', fontSize: '18px', cursor: 'pointer' }}
              >
                <FaTimes />
              </button>
            </div>

            <div
              style={{
                background: isDark ? 'rgba(59, 130, 246, 0.1)' : '#f0f9ff',
                border: isDark ? '1px solid rgba(59, 130, 246, 0.2)' : '1px solid #bae6fd',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '12px',
                color: isDark ? '#93c5fd' : '#0369a1',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <FaInfoCircle />
              <span>
                <strong>Simulation Mode:</strong> This preview uses sample data. No emails will be sent.
              </span>
            </div>

            {previewLoading ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: isDark ? '#94a3b8' : '#64748b' }}>
                <FaSpinner className="spin" style={{ fontSize: '24px', marginBottom: '8px' }} />
                <div>Rendering preview...</div>
              </div>
            ) : previewData ? (
              <div
                style={{
                  background: isDark ? '#0f172a' : '#f8fafc',
                  border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '20px',
                }}
              >
                <div style={{ borderBottom: isDark ? '1px solid #334155' : '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                    Subject Line
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a', marginTop: '4px' }}>
                    {previewData.subject}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600, marginBottom: '8px' }}>
                    Email Body
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      color: isDark ? '#e2e8f0' : '#334155',
                      whiteSpace: 'pre-wrap',
                      lineHeight: '1.6',
                      fontFamily: 'inherit',
                      background: isDark ? '#1e293b' : '#ffffff',
                      padding: '16px',
                      borderRadius: '8px',
                      border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                    }}
                  >
                    {previewData.body}
                  </div>
                </div>
              </div>
            ) : null}

            <div style={{ textAlign: 'right', marginTop: '20px' }}>
              <button
                onClick={() => setShowPreviewModal(false)}
                style={{
                  background: isDark ? '#3b82f6' : '#0f2a4a',
                  color: '#ffffff',
                  border: 'none',
                  padding: '9px 18px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
