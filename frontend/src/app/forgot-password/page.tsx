'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const emailParam = params.get('email');
      const otpSentParam = params.get('otpSent');
      if (emailParam) {
        setEmail(emailParam);
      }
      if (otpSentParam === 'true') {
        setOtpSent(true);
        setMessage('A verification OTP reset key has been requested for your account.');
      }
    }
  }, []);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await api.post('/auth/forgot-password', { email });
      setOtpSent(true);
      if (res.devOtp) {
        setOtp(res.devOtp);
      }
      setMessage(res.message || 'Verification OTP code has been generated.');
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP code. Verify email.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await api.post('/auth/reset-password', { email, otp, newPassword });
      setMessage(res.message || 'Key reset successful. Redirecting to login...');
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset security key. Verify OTP.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="user-select-overlay" style={{ display: 'flex' }}>
      <div className="user-select-modal" style={{ maxWidth: '440px', padding: '32px 24px' }}>
        <div style={{ fontSize: '36px', marginBottom: '12px' }}>🔑</div>
        <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--navy)' }}>Security Key Recovery</div>
        <div style={{ fontSize: '14px', color: 'var(--muted)', marginTop: '4px' }}>
          HARTEK Command Center Verification
        </div>

        {error && (
          <div className="alert alert-red" style={{ marginTop: '16px', textAlign: 'left' }}>
            <div className="alert-dot" />
            <span style={{ flex: 1 }}>{error}</span>
          </div>
        )}

        {message && (
          <div className="alert alert-amber" style={{ marginTop: '16px', textAlign: 'left', background: 'var(--ok-bg)', color: 'var(--ok)', borderColor: 'var(--ok-border)' }}>
            <div className="alert-dot" />
            <span style={{ flex: 1 }}>{message}</span>
          </div>
        )}

        {!otpSent ? (
          <form onSubmit={handleSendOtp} style={{ marginTop: '24px', textAlign: 'left' }}>
            <div className="fg" style={{ marginBottom: '20px' }}>
              <label style={{ fontWeight: 600, fontSize: '12px', color: 'var(--muted)' }}>
                Registered Email Address
              </label>
              <input
                type="email"
                placeholder="Enter your corporate email (e.g. cmd@hartek.com)..."
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                style={{
                  marginTop: '6px',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn-cancel"
                onClick={() => router.push('/login')}
                style={{ flex: 1, padding: '10px 16px', fontSize: '13px' }}
              >
                Back to Login
              </button>
              <button
                type="submit"
                className="btn-save"
                disabled={submitting}
                style={{ flex: 2, padding: '10px 16px', fontSize: '13px' }}
              >
                {submitting ? 'Sending...' : 'Request OTP Code'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} style={{ marginTop: '24px', textAlign: 'left' }}>
            <div className="fg" style={{ marginBottom: '16px' }}>
              <label style={{ fontWeight: 600, fontSize: '12px', color: 'var(--muted)' }}>
                Verification OTP Code
              </label>
              <input
                type="text"
                placeholder="Enter 6-digit OTP code..."
                value={otp}
                onChange={e => setOtp(e.target.value)}
                required
                autoFocus
                style={{
                  marginTop: '6px',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  outline: 'none',
                  textAlign: 'center',
                  fontSize: '16px',
                  letterSpacing: '2px',
                }}
              />
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                Reset OTP code has been logged to the backend console.
              </div>
            </div>

            <div className="fg" style={{ marginBottom: '24px' }}>
              <label style={{ fontWeight: 600, fontSize: '12px', color: 'var(--muted)' }}>
                New Security Key
              </label>
              <input
                type="password"
                placeholder="Enter new password (min 6 chars)..."
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                style={{
                  marginTop: '6px',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setOtpSent(false)}
                style={{ flex: 1, padding: '10px 16px', fontSize: '13px' }}
              >
                Back
              </button>
              <button
                type="submit"
                className="btn-save"
                disabled={submitting}
                style={{ flex: 2, padding: '10px 16px', fontSize: '13px' }}
              >
                {submitting ? 'Resetting...' : 'Save New Key'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
