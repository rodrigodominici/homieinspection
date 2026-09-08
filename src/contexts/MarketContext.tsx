/**
 * Selector de país global de la app.
 *
 * El país no es un filtro por sección: se elige una vez en la barra superior y
 * todas las pantallas operativas filtran por él. Cada usuario solo puede elegir
 * entre los países asignados a su perfil (`profiles.markets`); el rol admin
 * puede elegir cualquier país. Siempre se trabaja dentro de un país concreto.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { MARKET_OPTIONS, normalizeMarket } from '@/lib/markets';

export type MarketScope = 'all' | string;

const STORAGE_KEY = 'homie.market-scope';

interface MarketContextValue {
  /** Código de país canónico ('CL', 'MX', 'PE'). */
  market: MarketScope;
  setMarket: (m: MarketScope) => void;
  /** Países que este usuario puede elegir. */
  availableMarkets: string[];
  /** True si el usuario puede alternar de país. */
  canSwitch: boolean;
  /** True si la inspección/inmueble entra en el ámbito elegido. */
  matchesMarket: (raw: string | null | undefined) => boolean;
}

const ALL_MARKETS = MARKET_OPTIONS.map((m) => m.value as string);

const MarketContext = createContext<MarketContextValue>({
  market: 'CL',
  setMarket: () => {},
  availableMarkets: ALL_MARKETS,
  canSwitch: true,
  matchesMarket: () => true,
});

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const availableMarkets = useMemo<string[]>(() => {
    if (isAdmin) return ALL_MARKETS;
    const assigned = (profile?.markets ?? [])
      .map((m) => normalizeMarket(m))
      .filter((m): m is string => !!m);
    if (assigned.length > 0) return Array.from(new Set(assigned));
    const single = normalizeMarket(profile?.market);
    return single ? [single] : ['CL'];
  }, [isAdmin, profile?.markets, profile?.market]);

  const [market, setMarketState] = useState<MarketScope>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'CL';
    } catch {
      return 'CL';
    }
  });

  // Fuerza el valor a un país permitido. Siempre se trabaja dentro de un país.
  useEffect(() => {
    const allowed = new Set<string>(availableMarkets);
    const valid = allowed.has(market);
    if (!valid) {
      const fallback =
        (normalizeMarket(profile?.market) && allowed.has(normalizeMarket(profile?.market)!)
          ? normalizeMarket(profile?.market)!
          : availableMarkets[0]) ?? 'CL';
      setMarketState(fallback);
    }
  }, [market, availableMarkets, isAdmin, profile?.market]);

  const setMarket = (m: MarketScope) => {
    setMarketState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
  };

  const value = useMemo<MarketContextValue>(
    () => ({
      market,
      setMarket,
      availableMarkets,
      canSwitch: availableMarkets.length > 1,
      matchesMarket: (raw) => {
        const norm = normalizeMarket(raw);
        if (!market) return true; // aún resolviendo el país del perfil
        return norm === market;
      },
    }),
    [market, availableMarkets, isAdmin],
  );

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export const useMarket = () => useContext(MarketContext);
