import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, EmptyState, useInterface, type Translator } from '@nexora/ui';
import type { PluginCapabilityView, PluginManifestView, PluginView } from '../../shared/preload-api.js';

/**
 * Plugins — o que está instalado e o que está activo.
 *
 * Um plugin aqui é um **manifesto**: uma declaração de capacidades que o
 * launcher já sabe aplicar. A página mostra essa lista com o estado real
 * (activo ou desactivado), deixa instalar um manifesto que o utilizador
 * escolha e reinstalar o que a NEXORA envia — e nada mais.
 *
 * A frase que a página tem de transmitir está no que ela **não** tem: não há
 * botão de "corrigir" nada. Um plugin não corre código, não descarrega jogos
 * e não toca nas licenças das lojas — comuta integrações que o próprio
 * launcher implementa (ver `docs/LEGAL.md`).
 */

/** O que a página sabe dos plugins. */
interface PluginsState {
  readonly items: readonly PluginView[];
  readonly capabilities: readonly PluginCapabilityView[];
  readonly available: PluginManifestView | null;
}

export function PluginsPage(): ReactNode {
  const { t, locale } = useInterface();
  const api = globalThis.window?.nexora;

  const [state, setState] = useState<PluginsState | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (api === undefined) {
      return;
    }
    const result = await api.plugins.list();
    if (result.ok) {
      setState({ items: result.items, capabilities: result.capabilities, available: result.available });
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Executa uma escrita e mostra o motivo quando falha (em português). */
  const run = useCallback(
    async (
      action: () => Promise<{ readonly ok: boolean; readonly reasonKey?: string }>,
      success: string,
    ) => {
      const result = await action();
      setMessage(result.ok ? success : reasonMessage(result.reasonKey ?? 'plugins.reason.invalid', t));
      await reload();
    },
    [reload, t],
  );

  const onToggle = useCallback(
    (plugin: PluginView) =>
      run(
        () => api?.plugins.setEnabled(plugin.id, !plugin.enabled) ?? Promise.resolve({ ok: false }),
        t('plugins.toggled'),
      ),
    [api, run, t],
  );

  const onRemove = useCallback(
    (pluginId: string) =>
      run(() => api?.plugins.remove(pluginId) ?? Promise.resolve({ ok: false }), t('plugins.removed')),
    [api, run, t],
  );

  const onInstall = useCallback(
    () =>
      run(() => api?.plugins.install() ?? Promise.resolve({ ok: false }), t('plugins.installed')),
    [api, run, t],
  );

  const onInstallBuiltin = useCallback(
    () => run(() => api?.plugins.installBuiltin() ?? Promise.resolve({ ok: false }), t('plugins.installed')),
    [api, run, t],
  );

  const items = state?.items ?? [];
  const capabilities = state?.capabilities ?? [];
  const available = state?.available ?? null;

  return (
    <div className="nx-stack">
      <div className="hub-row hub-row--between">
        <div className="nx-stack">
          <h1 className="nx-title">{t('plugins.title')}</h1>
          <p className="nx-subtitle">{t('plugins.subtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => void onInstall()}>
          {t('plugins.action.install')}
        </Button>
      </div>

      {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}

      {available === null ? null : (
        <Card>
          <div className="nx-stack">
            <div className="hub-row hub-row--between">
              <strong>{t('plugins.available.title')}</strong>
              <Button onClick={() => void onInstallBuiltin()}>{t('plugins.action.install')}</Button>
            </div>
            <span className="hub-break">
              {available.name} · <span className="nx-subtitle">v{available.version}</span>
            </span>
            <span className="nx-subtitle">{available.author}</span>
            <span className="nx-subtitle">{t(descriptionKey(available.descriptionKey))}</span>
            <span className="nx-subtitle">{t('plugins.available.hint')}</span>
            <div className="hub-row">
              {available.capabilities.map((capability) => (
                <Badge key={capability}>{t(capabilityKey(capability))}</Badge>
              ))}
            </div>
          </div>
        </Card>
      )}

      {items.length === 0 ? (
        <EmptyState title={t('plugins.empty')} hint={t('plugins.subtitle')} />
      ) : (
        items.map((plugin) => (
          <Card key={plugin.id}>
            <div className="nx-stack">
              <div className="hub-row hub-row--between">
                <div className="nx-stack">
                  <span className="hub-break">
                    {plugin.name} · <span className="nx-subtitle">v{plugin.version}</span>
                  </span>
                  <span className="nx-subtitle">
                    {plugin.author} · {t('plugins.installedAt', {
                      date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(plugin.installedAt)),
                    })}
                  </span>
                </div>
                <div className="hub-row">
                  <Badge>{plugin.enabled ? t('plugins.state.active') : t('plugins.state.disabled')}</Badge>
                  <Button onClick={() => void onToggle(plugin)}>
                    {plugin.enabled ? t('plugins.action.disable') : t('plugins.action.enable')}
                  </Button>
                  <Button onClick={() => void onRemove(plugin.id)} aria-label={t('plugins.action.remove')}>
                    {t('plugins.action.remove')}
                  </Button>
                </div>
              </div>
              <span className="nx-subtitle">{t(descriptionKey(plugin.descriptionKey))}</span>
              <div className="nx-stack">
                <span className="nx-subtitle">{t('plugins.capabilities')}</span>
                <div className="hub-row">
                  {plugin.capabilities.map((capability) => (
                    <Badge key={capability}>{t(capabilityKey(capability))}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        ))
      )}

      <Card>
        <div className="nx-stack">
          <strong>{t('plugins.capabilities')}</strong>
          <span className="nx-subtitle">{t('plugins.capabilities.hint')}</span>
          <div className="hub-row">
            {capabilities.map((capability) => (
              <Badge key={capability.id}>{t(capabilityKey(capability.id))}</Badge>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

/** A chave de uma descrição (explícita — o manifesto guarda só a chave). */
function descriptionKey(key: string): 'plugin.steam.description' | 'plugin.description.unknown' {
  switch (key) {
    case 'plugin.steam.description':
      return 'plugin.steam.description';
    default:
      // Um manifesto do utilizador pode trazer uma chave que este dicionário
      // não tem: a página diz que não há descrição em vez de mostrar a chave.
      return 'plugin.description.unknown';
  }
}

/** A chave do nome de uma capacidade (explícita, nunca dinâmica). */
function capabilityKey(id: string): 'plugin.capability.steamSync' | 'plugin.capability.steamCover' | 'plugin.capability.steamDlc' {
  switch (id) {
    case 'steam:sync':
      return 'plugin.capability.steamSync';
    case 'steam:cover':
      return 'plugin.capability.steamCover';
    default:
      return 'plugin.capability.steamDlc';
  }
}

/** A mensagem de um motivo de recusa (explícita, nunca dinâmica). */
function reasonMessage(reason: string, t: Translator): string {
  switch (reason) {
    case 'plugins.reason.not-found':
      return t('plugins.reason.not-found');
    case 'plugins.reason.not-json':
      return t('plugins.reason.not-json');
    case 'plugins.reason.missing-field':
      return t('plugins.reason.missing-field');
    case 'plugins.reason.bad-id':
      return t('plugins.reason.bad-id');
    case 'plugins.reason.bad-version':
      return t('plugins.reason.bad-version');
    case 'plugins.reason.unknown-capability':
      return t('plugins.reason.unknown-capability');
    case 'plugins.reason.cancelled':
      return t('plugins.reason.cancelled');
    case 'plugins.reason.already-installed':
      return t('plugins.reason.already-installed');
    default:
      return t('plugins.reason.invalid');
  }
}