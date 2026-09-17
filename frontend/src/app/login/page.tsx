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

export default function LoginPage() {
  const { login } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
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
          document.title = res.app_name || 'HARTEK CMD Office';
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

  const [mfaRequired, setMfaRequired] = useState(false);
  const [otp, setOtp] = useState('');
  
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password credentials.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await login(email, password, false, mfaRequired ? otp : undefined);
      
      if (result && result.mfaRequired) {
        setMfaRequired(true);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    setMfaRequired(false);
    setOtp('');
    setError(null);
  };

  const handleForgotKeyClick = async () => {
    if (!email) {
      setError('Please fill in your email address in the Email field first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/auth/forgot-password', { email });
      setError(null);
      window.location.href = `/forgot-password?email=${encodeURIComponent(email)}&otpSent=true`;
    } catch (err: any) {
      setError(err.message || 'Failed to request password reset OTP.');
    } finally {
      setSubmitting(false);
    }
  };

  const isFullWidth = branding.login_container_pos === 'full-left' || branding.login_container_pos === 'full-right';
  const justifyAlign = branding.login_container_pos?.includes('left') ? 'flex-start' : branding.login_container_pos?.includes('right') ? 'flex-end' : 'center';
  const sidePadding = branding.login_container_pos === 'left' ? '8%' : '0';
  const sidePaddingRight = branding.login_container_pos === 'right' ? '8%' : '0';

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
            branding.login_logo || '🏢'
          )}
        </div>
        {hasLoginHeading && (
          <div style={{ fontSize: '26px', fontWeight: 700, color: branding.primary_color || '#0F2A4A', letterSpacing: '-0.5px' }}>
            {branding.login_heading}
          </div>
        )}
        {hasLoginSubtitle && (
          <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px', fontWeight: 500 }}>
            {branding.login_subtitle}
          </div>
        )}

        {error && (
          <div className="alert alert-red" style={{ marginTop: '20px', textAlign: 'left', borderRadius: '8px', padding: '10px 14px' }}>
            <div className="alert-dot" />
            <span style={{ flex: 1, fontSize: '12px', fontWeight: 500 }}>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: (!hasLoginHeading && !hasLoginSubtitle) ? '16px' : '28px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {!mfaRequired ? (
            <>
              {/* Credentials Username/Email */}
              <div className="fg" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontWeight: 600, fontSize: '12px', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="Enter email address"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                  style={{
                    padding: '12px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    fontFamily: 'var(--font)',
                    width: '100%',
                    background: '#f9fafb',
                    transition: 'border-color 0.2s'
                  }}
                />
              </div>

              {/* Credentials Password */}
              <div className="fg" style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}>
                <label style={{ fontWeight: 600, fontSize: '12px', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Password
                </label>
                <div style={{ position: 'relative', width: '100%' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter security key..."
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    style={{
                      padding: '12px 48px 12px 14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      fontFamily: 'var(--font)',
                      width: '100%',
                      background: '#f9fafb',
                      transition: 'border-color 0.2s'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: 'none',
                      background: 'none',
                      color: '#6b7280',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600
                    }}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {/* Checkboxes Row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  marginTop: '4px',
                  marginBottom: '8px'
                }}
              >
                <button
                  type="button"
                  onClick={handleForgotKeyClick}
                  style={{ background: 'none', border: 'none', padding: 0, fontSize: '12px', color: '#2563eb', cursor: 'pointer', fontWeight: 600, outline: 'none' }}
                >
                  Forgot Key?
                </button>
              </div>
            </>
          ) : (
            /* Multi-Factor Authentication Screen */
            <div className="fg" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 600, fontSize: '12px', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Verification Code (MFA)
              </label>
              <input
                type="text"
                maxLength={6}
                placeholder="Enter 6-digit code..."
                value={otp}
                onChange={e => setOtp(e.target.value)}
                required
                autoFocus
                style={{
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  outline: 'none',
                  textAlign: 'center',
                  fontSize: '20px',
                  letterSpacing: '6px',
                  width: '100%',
                  background: '#f9fafb'
                }}
              />
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px', textAlign: 'center' }}>
                A verification code has been logged to the backend console window.
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            {mfaRequired && (
              <button
                type="button"
                className="btn-cancel"
                onClick={handleBack}
                style={{ flex: 1, padding: '12px 16px', fontSize: '14px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
              >
                Back
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              style={{ 
                flex: 2, 
                padding: '12px 16px', 
                fontSize: '14px', 
                fontWeight: 600,
                borderRadius: '8px', 
                background: '#0F2A4A', 
                color: '#fff', 
                border: 'none', 
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.8 : 1,
                textAlign: 'center'
              }}
            >
              {submitting ? 'Authenticating...' : mfaRequired ? 'Verify Code' : 'Login'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
