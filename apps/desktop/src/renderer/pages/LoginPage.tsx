import { useState, type ReactNode } from 'react';
import { Button, Card, TextInput, useInterface } from '@nexora/ui';
import { useAuth } from '../state/auth.js';

/**
 * Entrada no launcher — a conta NEXORA.
 *
 * A conta é **opcional** para jogar: a biblioteca local funciona sem ela. O
 * que exige conta é o que é social (comentar, reviewar) — e o ecrã diz-o, em
 * vez de fingir que a conta é obrigatória para tudo.
 */
export function LoginPage({ onSkip }: { readonly onSkip: () => void }): ReactNode {
  const { t } = useInterface();
  const { login, register, verifyMfa } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        const result = await login(email, password);
        if (result.kind === 'mfa_required') {
          setMfaChallenge(result.challengeToken);
        }
        return;
      }
      await register({ email, password, displayName });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error.generic'));
    } finally {
      setBusy(false);
    }
  };

  const onMfa = async (): Promise<void> => {
    if (mfaChallenge === null) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await verifyMfa(mfaChallenge, mfaCode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nx-stack" style={{ maxWidth: '28rem' }}>
      <div className="nx-stack">
        <h1 className="nx-title">{t('auth.title')}</h1>
        <p className="nx-subtitle">{t('auth.subtitle')}</p>
      </div>

      {error === null ? null : <p className="nx-banner"><span>{error}</span></p>}

      {mfaChallenge === null ? (
        <Card>
          <div className="nx-stack">
            <TextInput
              label={t('auth.email')}
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
            <TextInput
              label={t('auth.password')}
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
            {mode === 'register' ? (
              <TextInput
                label={t('auth.displayName')}
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                }}
              />
            ) : null}

            <div className="hub-row">
              <Button variant="primary" disabled={busy} onClick={() => void onSubmit()}>
                {mode === 'login' ? t('auth.login') : t('auth.register')}
              </Button>
              <Button
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login');
                  setError(null);
                }}
              >
                {mode === 'login' ? t('auth.toRegister') : t('auth.toLogin')}
              </Button>
            </div>

            <p className="nx-subtitle">{t('auth.optional')}</p>
            <Button onClick={onSkip}>{t('auth.skip')}</Button>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="nx-stack">
            <strong>{t('auth.mfa.title')}</strong>
            <p className="nx-subtitle">{t('auth.mfa.hint')}</p>
            <TextInput
              label={t('auth.mfa.code')}
              value={mfaCode}
              onChange={(event) => {
                setMfaCode(event.target.value);
              }}
            />
            <Button variant="primary" disabled={busy} onClick={() => void onMfa()}>
              {t('auth.mfa.submit')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}