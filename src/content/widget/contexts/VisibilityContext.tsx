import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface VisibilityContextValue {
  /** Whether the tab is currently visible */
  isVisible: boolean;
}

const VisibilityContext = createContext<VisibilityContextValue>({ isVisible: true });

/**
 * Hook to access tab visibility state.
 * Use this to pause expensive operations (observers, RAF loops) when tab is hidden.
 */
export function useVisibility(): VisibilityContextValue {
  return useContext(VisibilityContext);
}

interface VisibilityProviderProps {
  children: ReactNode;
}

/**
 * Provider that tracks page visibility state.
 * Wrap your app with this to enable visibility-aware optimizations.
 */
export function VisibilityProvider({ children }: VisibilityProviderProps) {
  const [isVisible, setIsVisible] = useState(() => document.visibilityState === 'visible');

  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsVisible(visible);

      if (!visible) {
        console.log('[Visibility] Tab hidden - pausing observers');
      } else {
        console.log('[Visibility] Tab visible - resuming observers');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <VisibilityContext.Provider value={{ isVisible }}>
      {children}
    </VisibilityContext.Provider>
  );
}
