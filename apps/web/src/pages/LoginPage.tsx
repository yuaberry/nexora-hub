import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, PlannedBadge, TextInput, useInterface } from '@nexora/ui';
import { useAuth } from '../auth/AuthContext.js';

/**
 * Entrar / criar conta.
 *
 * O segundo factor acontece **na mesma página**: com MFA activo, a senha
 * devolve um desafio e o código pede-se aqui — não numa página à parte. O
 * desafio vive no estado do componente (é temporário e expira em 5 minutos),
 * nunca no `sessionStorage`.
 */
export function LoginPage(): ReactNode {
  const { t } = useInterface();
  const { login, register, verifyMfa, error, loading } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (mode === 'register') {
      await register({ email, password, displayName });
      navigate('/biblioteca');
      return;
    }
    const outcome = await login(email, password);
    if (outcome.kind === 'authenticated') {
      navigate('/biblioteca');
      return;
    }
    // Com MFA activo, a senha não abre sessão: fica o desafio e o código
    // pede-se nesta mesma página.
    setChallenge(outcome.challengeToken);
  }

  async function onVerify(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (challenge === null) {
      return;
    }
    await verifyMfa(challenge, code);
    navigate('/biblioteca');
  }

  if (challenge !== null) {
    return (
      <Card>
        <h1 className="nx-title">{t('login.mfa.prompt')}</h1>
        <p className="nx-subtitle">{t('login.mfa.hint')}</p>
        <form className="nx-stack" onSubmit={(event) => void onVerify(event)}>
          <TextInput
            label={t('login.mfa.code')}
            id="mfa-code"
            value={code}
            inputMode="numeric"
            autoComplete="one-time-code"
            onChange={(event) => {
              setCode(event.target.value);
            }}
          />
          <Button type="submit" variant="primary" disabled={loading}>
            {t('login.mfa.submit')}
          </Button>
        </form>
        <p className="nx-subtitle">{t('login.error.mfa')}</p>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="nx-title">{mode === 'login' ? t('login.title') : t('login.register.title')}</h1>
      <p className="nx-subtitle">{t('login.subtitle')}</p>

      <form className="nx-stack" onSubmit={(event) => void onSubmit(event)}>
        <TextInput
          label={t('login.email')}
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
        {mode === 'register' ? (
          <TextInput
            label={t('login.displayName')}
            id="display-name"
            autoComplete="name"
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
            }}
          />
        ) : null}
        <TextInput
          label={t('login.password')}
          id="password"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
        <Button type="submit" variant="primary" disabled={loading}>
          {mode === 'login' ? t('login.submit') : t('login.register.submit')}
        </Button>
      </form>

      <div className="nx-row nx-row--between">
        <Button
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
          }}
        >
          {mode === 'login' ? t('login.toRegister') : t('login.toLogin')}
        </Button>
        <PlannedBadge label={t('planned.badge')} />
      </div>

      {error === null ? null : (
        <p className="nx-banner">
          <span>{t('login.error.generic')}</span>
        </p>
      )}
    </Card>
  );
}