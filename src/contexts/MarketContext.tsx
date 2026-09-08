/**
 * Selector de país global de la app (Admin y Ejecutivo).
 *
 * El país no es un filtro por sección: se elige una vez en la barra superior y
 * todas las pantallas operativas (Inmuebles, Inspecciones, Agenda, Dashboard,
 * cola del Ejecutivo) filtran por él. Se persiste en localStorage.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeMarket } from '@/lib/markets';

export type MarketScope = 'all' | string;

const STORAGE_KEY = 'homie.market-scope';

interface MarketContextValue {
  /** 'all' o código de país canónico ('CL', 'MX'). */
  market: MarketScope;
  setMarket: (m: MarketScope) => void;
  /** True si la inspección/inmueble entra en el ámbito elegido. */
  matchesMarket: (raw: string | null | undefined) => boolean;
}

const MarketContext = createContext<MarketContextValue>({
  market: 'all',
  setMarket: () => {},
  matchesMarket: () => true,
});

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [market, setMarketState] = useState<MarketScope>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'all';
    } catch {
      return 'all';
    }
  });
  const [touched, setTouched] = useState(() => {
    try {
      return !!localStorage.getItem(STORAGE_KEY);
    } catch {
      return false;
    }
  });

  // Primera carga sin elección previa: arranca en el país del perfil.
  useEffect(() => {
    if (touched) return;
    const fromProfile = normalizeMarket(profile?.market);
    if (fromProfile) setMarketState(fromProfile);
  }, [profile?.market, touched]);

  const setMarket = (m: MarketScope) => {
    setMarketState(m);
    setTouched(true);
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
      matchesMarket: (raw) => market === 'all' || normalizeMarket(raw) === market,
    }),
    [market],
  );

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export const useMarket = () => useContext(MarketContext);
