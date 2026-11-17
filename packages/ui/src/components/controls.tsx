import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useId } from 'react';

/**
 * Controlos de formulário.
 *
 * Nenhum destes componentes tem cor própria: todas as cores vêm dos tokens
 * de papel (`theme.css`). O `nx-` no nome de cada classe é o que o teste de
 * tema verifica — uma cor escrita aqui seria um componente que não troca de
 * tema.
 */

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: 'primary' | 'neutral' | 'danger';
  readonly block?: boolean;
}

export function Button({
  variant = 'neutral',
  block = false,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps): ReactNode {
  const classes = ['nx-button', `nx-button--${variant}`, block ? 'nx-button--block' : '', className ?? '']
    .filter((value) => value !== '')
    .join(' ');
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
  readonly hint?: string;
}

/** Campo de texto com rótulo sempre visível (acessibilidade). */
export function TextInput({ label, hint, id, ...rest }: TextInputProps): ReactNode {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="nx-stack">
      <label className="nx-label" htmlFor={inputId}>
        {label}
      </label>
      <input id={inputId} className="nx-input" {...rest} />
      {hint === undefined ? null : <span className="nx-subtitle">{hint}</span>}
    </div>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly label: string;
  readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
}

/** Select com `min-width: 0` — a causa mais comum de scroll horizontal. */
export function Select({ label, options, id, ...rest }: SelectProps): ReactNode {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <div className="nx-stack">
      <label className="nx-label" htmlFor={selectId}>
        {label}
      </label>
      <select id={selectId} className="nx-select" {...rest}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export interface ToggleProps {
  readonly label: string;
  readonly hint?: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  /** Identificador do teste (acessibilidade): o que o interruptor faz. */
  readonly describedBy?: string;
}

/** Interruptor com `role="switch"` — legível por leitores de ecrã. */
export function Toggle({ label, hint, checked, onChange, describedBy }: ToggleProps): ReactNode {
  return (
    <button
      type="button"
      className="nx-toggle"
      role="switch"
      aria-checked={checked}
      aria-describedby={describedBy}
      onClick={() => {
        onChange(!checked);
      }}
    >
      <span className="nx-toggle__track" data-checked={checked}>
        <span className="nx-toggle__thumb" />
      </span>
      <span className="nx-stack">
        <span>{label}</span>
        {hint === undefined ? null : <span className="nx-subtitle">{hint}</span>}
      </span>
    </button>
  );
}