import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  ReactNode,
} from "react";

/**
 * Cache global em memória para os dados que hoje vivem em localStorage.
 * Carrega 1x ao montar o AppLayout e compartilha entre todas as páginas,
 * eliminando o "flash" de recarregamento ao trocar de rota.
 *
 * As páginas continuam podendo escrever em localStorage normalmente — basta
 * disparar `notifyAppDataChanged(key)` (ou usar o helper `setAppData`) para
 * que o cache em memória seja invalidado/atualizado.
 */

export type AppDataKey =
  | "vilasales_data"
  | "vilasales_livro_metrics"
  | "vilasales_lastUpdate"
  | "vilasales_comparativo_result"
  | "st_data";

const TRACKED_KEYS: AppDataKey[] = [
  "vilasales_data",
  "vilasales_livro_metrics",
  "vilasales_lastUpdate",
  "vilasales_comparativo_result",
  "st_data",
];

const CHANGE_EVENT = "vilasales:appdata-change";

type Cache = Partial<Record<AppDataKey, unknown>>;

const safeParse = (raw: string | null): unknown => {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // Algumas chaves podem ter sido salvas como string crua
    return raw;
  }
};

const readKey = (key: AppDataKey): unknown => {
  try {
    return safeParse(localStorage.getItem(key));
  } catch {
    return null;
  }
};

const readAll = (): Cache => {
  const out: Cache = {};
  for (const k of TRACKED_KEYS) out[k] = readKey(k);
  return out;
};

interface AppDataContextValue {
  cache: Cache;
  /** Lê um valor parseado e tipado do cache em memória. */
  get: <T = unknown>(key: AppDataKey) => T | null;
  /** Força recarga de uma chave (ou todas) a partir do localStorage. */
  refresh: (key?: AppDataKey) => void;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

/**
 * Notifica o provider que uma chave do localStorage foi alterada na mesma aba.
 * Use sempre que escrever/remover diretamente em `localStorage` para manter
 * o cache global em sincronia.
 */
export const notifyAppDataChanged = (key?: AppDataKey) => {
  try {
    window.dispatchEvent(
      new CustomEvent(CHANGE_EVENT, { detail: { key } })
    );
  } catch {
    /* ignore */
  }
};

/** Helper opcional: grava no localStorage e notifica o provider. */
export const setAppData = (key: AppDataKey, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
  notifyAppDataChanged(key);
};

/** Helper opcional: remove do localStorage e notifica o provider. */
export const removeAppData = (key: AppDataKey) => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  notifyAppDataChanged(key);
};

export const AppDataProvider = ({ children }: { children: ReactNode }) => {
  const [cache, setCache] = useState<Cache>(() => {
    if (typeof window === "undefined") return {};
    return readAll();
  });

  const refresh = useCallback((key?: AppDataKey) => {
    setCache((prev) => {
      if (!key) return readAll();
      return { ...prev, [key]: readKey(key) };
    });
  }, []);

  // Hidrata `vilasales_data` a partir do Supabase no boot caso o cache local
  // esteja vazio (ex.: usuário acessando de outra máquina/navegador).
  useEffect(() => {
    let cancelled = false;
    const current = readKey("vilasales_data") as Record<string, unknown> | null;
    const isEmpty =
      !current || (typeof current === "object" && Object.keys(current).length === 0);
    const hasWeeklyData = Object.values(current ?? {}).some((produtos) =>
      Array.isArray(produtos) &&
      produtos.some((p: any) => p?.vAtu !== undefined || p?.v1 !== undefined || p?.v2 !== undefined || p?.v3 !== undefined)
    );
    if (!isEmpty && hasWeeklyData) return;

    (async () => {
      try {
        const { hasWeeklySalesData, loadLivrosFromSupabase } = await import("@/lib/livrosSync");
        const remote = await loadLivrosFromSupabase();
        if (cancelled || !remote || !hasWeeklySalesData(remote)) return;
        try {
          localStorage.setItem("vilasales_data", JSON.stringify(remote));
        } catch {
          /* ignore */
        }
        notifyAppDataChanged("vilasales_data");
      } catch (e) {
        console.warn("[AppData] hydrate falhou:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key) {
        setCache(readAll());
        return;
      }
      if ((TRACKED_KEYS as string[]).includes(e.key)) {
        refresh(e.key as AppDataKey);
      }
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key?: AppDataKey } | undefined;
      refresh(detail?.key);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onCustom as EventListener);
    };
  }, [refresh]);

  const value = useMemo<AppDataContextValue>(
    () => ({
      cache,
      get: <T,>(key: AppDataKey) => (cache[key] as T) ?? null,
      refresh,
    }),
    [cache, refresh]
  );

  return (
    <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
  );
};

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) {
    throw new Error("useAppData must be used within <AppDataProvider>");
  }
  return ctx;
}

/** Hook conveniente para uma única chave. */
export function useAppDataKey<T = unknown>(key: AppDataKey): T | null {
  const { get } = useAppData();
  return get<T>(key);
}
