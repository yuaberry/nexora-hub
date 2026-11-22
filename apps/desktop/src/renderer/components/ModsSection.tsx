import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, useInterface } from '@nexora/ui';
import type { ModsScanView } from '../../shared/preload-api.js';

/**
 * Modos do jogo — o que está instalado na pasta `mods`.
 *
 * A leitura é local: cada `.jar` declara o seu carregador por um ficheiro
 * dentro do arquivo, e o que não declara nada fica **desconhecido** — o total
 * contava os desconhecidos, e um modo desligado (`.jar.disabled`) não conta.
 */

/** Quantos modos mostrar na lista (o resto fica no total). */
const MAX_LISTED = 12;

export function ModsSection({
  installPath,
}: {
  readonly installPath: string;
}): ReactNode {
  const { t, locale } = useInterface();
  const api = globalThis.window?.nexora;

  const [scan, setScan] = useState<ModsScanView | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (api === undefined) {
      return;
    }
    const result = await api.mods.scan(installPath);
    setScan(result);
    setMessage(null);
  }, [api, installPath]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const total = scan?.total ?? 0;
  const listed = (scan?.mods ?? []).slice(0, MAX_LISTED);

  return (
    <Card>
      <div className="nx-stack">
        <div className="hub-row hub-row--between">
          <strong>{t('mods.title')}</strong>
          <Button onClick={() => void reload()}>{t('mods.rescan')}</Button>
        </div>

        {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}

        {scan !== null && scan.folder === null ? (
          <p className="nx-subtitle">
            {t('mods.noFolder')} — {t('mods.noFolder.hint')}
          </p>
        ) : total === 0 ? (
          <p className="nx-subtitle">
            {t('mods.noMods')} — {t('mods.noMods.hint')}
          </p>
        ) : (
          <>
            <div className="hub-suggestions">
              <Badge>{t('mods.count', { count: new Intl.NumberFormat(locale).format(total) })}</Badge>
              {(scan?.byLoader ?? []).map((entry) => (
                <Badge key={entry.loader}>
                  {t(loaderLabel(entry.loader))} · {new Intl.NumberFormat(locale).format(entry.count)}
                </Badge>
              ))}
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
              {listed.map((mod) => (
                <li key={mod.fileName} className="hub-row hub-row--between">
                  <div className="nx-stack">
                    <span className="hub-break">{mod.displayName ?? mod.fileName}</span>
                    <span className="nx-subtitle">
                      {mod.fileName} · {mod.version === null ? t('mods.noVersion') : mod.version}
                    </span>
                  </div>
                  <Badge>{t(loaderLabel(mod.loader))}</Badge>
                </li>
              ))}
            </ul>
            {total > MAX_LISTED ? (
              <span className="nx-subtitle">
                + {new Intl.NumberFormat(locale).format(total - MAX_LISTED)}
              </span>
            ) : null}
            <span className="nx-subtitle">{t('mods.disabled')}</span>
          </>
        )}
      </div>
    </Card>
  );
}

/** Rótulo do carregador (chave explícita, nunca dinâmica). */
function loaderLabel(loader: string): 'mods.loader.fabric' | 'mods.loader.quilt' | 'mods.loader.forge' | 'mods.loader.neoforge' | 'mods.loader.unknown' {
  switch (loader) {
    case 'fabric':
      return 'mods.loader.fabric';
    case 'quilt':
      return 'mods.loader.quilt';
    case 'forge':
      return 'mods.loader.forge';
    case 'neoforge':
      return 'mods.loader.neoforge';
    default:
      return 'mods.loader.unknown';
  }
}

