'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api, getApiBaseUrl } from '../../lib/api';

function getLighterOrDarker(hex: string, percent: number) {
  try {
    hex = hex.replace(/^\s*#|\s*$/g, '');
    if (hex.length === 3) {
      hex = hex.replace(/(.)/g, '$1$1');
    }
    let r = parseInt(hex.substr(0, 2), 16),
        g = parseInt(hex.substr(2, 2), 16),
        b = parseInt(hex.substr(4, 2), 16);
    
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const factor = luminance > 0.5 ? -percent : percent;

    r = Math.min(255, Math.max(0, Math.round(r + r * factor)));
    g = Math.min(255, Math.max(0, Math.round(g + g * factor)));
    b = Math.min(255, Math.max(0, Math.round(b + b * factor)));

    const rHex = r.toString(16).padStart(2, '0');
    const gHex = g.toString(16).padStart(2, '0');
    const bHex = b.toString(16).padStart(2, '0');
    return `#${rHex}${gHex}${bHex}`;
  } catch (e) {
    return '#1a3a60';
  }
}

export default function ResetPasswordPage() {
  const { user, refreshUser } = useAuth();
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [branding, setBranding] = useState<any>({
    login_logo: '🏢',
    login_heading: 'HARTEK Group',
    login_subtitle: 'CMD Office Command Center',
    login_bg: 'linear-gradient(135deg, #0F2A4A 0%, #1a3a60 100%)',
    primary_color: '#0F2A4A',
    accent_color: '#EF9F27',
  });

  useEffect(() => {
    fetch(`${getApiBaseUrl()}/settings/public`)
      .then(res => res.json())
      .then(res => {
        if (res) {
          setBranding(res);
          document.title = 'Reset Temporary Password - HARTEK CMD';
          if (res.primary_color) {
            document.documentElement.style.setProperty('--navy', res.primary_color);
            const alt = getLighterOrDarker(res.primary_color, 0.35);
            const grad = `linear-gradient(135deg, ${res.primary_color} 0%, ${alt} 100%)`;
            document.documentElement.style.setProperty('--login-mobile-bg', grad);
          }
          if (res.accent_color) {
            document.documentElement.style.setProperty('--accent', res.accent_color);
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      setError('Please fill in both password fields.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please verify both inputs.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await api.post('/auth/change-password-temp', { newPassword });
      setSuccess('Your password has been changed successfully! Redirecting you...');
      setTimeout(async () => {
        await refreshUser();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Operation failed. Please try again.');
      setSubmitting(false);
    }
  };

  let loginBgStyle: React.CSSProperties = {};
  const bgType = branding.login_bg_type || 'gradient';

  if (bgType === 'solid') {
    loginBgStyle = { background: branding.login_bg_color || '#0f2a4a' };
  } else if (bgType === 'gradient') {
    loginBgStyle = { background: branding.login_bg_gradient || 'linear-gradient(135deg, #0F2A4A 0%, #1a3a60 100%)' };
  } else if (bgType === 'image_url') {
    loginBgStyle = {
      backgroundImage: branding.login_bg_image_url ? `url(${branding.login_bg_image_url})` : 'none',
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    };
  } else if (bgType === 'image_upload') {
    loginBgStyle = {
      backgroundImage: branding.login_bg_image ? `url(${branding.login_bg_image})` : 'none',
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    };
  } else {
    loginBgStyle = { background: branding.login_bg || 'linear-gradient(135deg, #0F2A4A 0%, #1a3a60 100%)' };
  }

  const hasLoginHeading = branding.login_heading !== '' && branding.login_heading !== null && branding.login_heading !== undefined;
  const hasLoginSubtitle = branding.login_subtitle !== '' && branding.login_subtitle !== null && branding.login_subtitle !== undefined;

  const isFullWidth = branding.login_container_pos === 'full-left' || branding.login_container_pos === 'full-right';
  const justifyAlign = branding.login_container_pos?.includes('left') ? 'flex-start' : branding.login_container_pos?.includes('right') ? 'flex-end' : 'center';
  const sidePadding = branding.login_container_pos === 'left' ? '8%' : '0';
  const sidePaddingRight = branding.login_container_pos === 'right' ? '8%' : '0';

  return (
    <div 
      className="user-select-overlay login-overlay-responsive"
      style={{ 
        display: 'flex', 
        flexDirection: 'row',
        alignItems: 'center', 
        justifyContent: justifyAlign, 
        ...loginBgStyle,
        minHeight: '100vh',
        width: '100vw',
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        padding: isFullWidth ? '0' : '16px',
        paddingLeft: isFullWidth ? '0' : sidePadding,
        paddingRight: isFullWidth ? '0' : sidePaddingRight,
      }}
    >
      <div 
        className="user-select-modal login-modal-responsive"
        style={{ 
          maxWidth: '440px', 
          width: '100%',
          height: isFullWidth ? '100vh' : 'auto',
          minHeight: isFullWidth ? '100vh' : 'auto',
          padding: (!hasLoginHeading && !hasLoginSubtitle) ? '32px 36px' : '48px 36px', 
          background: `rgba(255, 255, 255, ${(parseInt(branding.login_container_opacity || '100') / 100)})`,
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderRadius: isFullWidth ? '0' : '16px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div style={{ 
          fontSize: (!hasLoginHeading && !hasLoginSubtitle) ? '72px' : '42px', 
          marginBottom: '8px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          minHeight: (!hasLoginHeading && !hasLoginSubtitle) ? '120px' : 'auto'
        }}>
          {branding.login_logo && (branding.login_logo.startsWith('data:') || branding.login_logo.startsWith('http')) ? (
            <img 
              src={branding.login_logo} 
              alt="Logo" 
              style={{ 
                maxHeight: (!hasLoginHeading && !hasLoginSubtitle) ? '120px' : '80px', 
                maxWidth: '100%', 
                objectFit: 'contain' 
              }} 
            />
          ) : (
            branding.login_logo || '🔒'
          )}
        </div>
        {hasLoginHeading && (
          <div style={{ fontSize: '26px', fontWeight: 700, color: branding.primary_color || '#0F2A4A', letterSpacing: '-0.5px' }}>
            {branding.login_heading}
          </div>
        )}
        {hasLoginSubtitle && (
          <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px', fontWeight: 500 }}>
            You must set a new password on your first login using a temporary key.
          </div>
        )}

        {error && (
          <div className="alert alert-red" style={{ marginTop: '20px', textAlign: 'left', borderRadius: '8px', padding: '10px 14px', background: '#fee2e2', border: '1px solid #fca5a5', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: '#ef4444', fontSize: '13px', fontWeight: 500 }}>⚠️ {error}</span>
          </div>
        )}

        {success && (
          <div style={{ marginTop: '20px', textAlign: 'left', borderRadius: '8px', padding: '10px 14px', background: '#dcfce7', border: '1px solid #86efac', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: '#15803d', fontSize: '13px', fontWeight: 500 }}>✔️ {success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: (!hasLoginHeading && !hasLoginSubtitle) ? '16px' : '28px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* New Password */}
          <div className="fg" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontWeight: 600, fontSize: '12px', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              New Password
            </label>
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter new secure password..."
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                autoFocus
                style={{
                  padding: '12px 48px 12px 14px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  width: '100%',
                  background: '#f9fafb',
                }}
              />
            </div>
          </div>

          {/* Confirm Password */}
          <div className="fg" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontWeight: 600, fontSize: '12px', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Confirm Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Confirm new secure password..."
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              style={{
                padding: '12px 14px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                width: '100%',
                background: '#f9fafb',
              }}
            />
          </div>

          {/* Toggle Password Visibility */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-4px' }}>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                border: 'none',
                background: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              {showPassword ? 'Hide Password' : 'Show Password'}
            </button>
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '14px',
              background: branding.primary_color || '#0F2A4A',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '14px',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
              marginTop: '12px',
            }}
          >
            {submitting ? 'Changing Password...' : 'Save & Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
