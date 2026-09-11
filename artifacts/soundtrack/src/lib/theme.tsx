import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useSillage } from './store';
import { toast } from 'sonner';
import { EventTheme } from '@workspace/api-client-react';

export const THEMES = {
  studio: {
    '--background': '0 0% 4%',
    '--foreground': '0 0% 90%',
    '--card': '0 0% 6%',
    '--card-foreground': '0 0% 90%',
    '--border': '0 0% 12%',
    '--input': '0 0% 12%',
    '--ring': '0 0% 30%',
    '--popover': '0 0% 6%',
    '--popover-foreground': '0 0% 90%',
    '--popover-border': '0 0% 12%',
    '--primary': '173 80% 40%',
    '--primary-foreground': '0 0% 100%',
    '--primary-gradient-from': '199 89% 48%',
    '--primary-gradient-to': '173 80% 40%',
    '--secondary': '0 0% 12%',
    '--secondary-foreground': '0 0% 90%',
    '--muted': '0 0% 12%',
    '--muted-foreground': '0 0% 60%',
    '--accent': '0 0% 15%',
    '--accent-foreground': '0 0% 90%',
    '--sidebar': '0 0% 4%',
    '--sidebar-foreground': '0 0% 90%',
    '--sidebar-border': '0 0% 10%',
    '--sidebar-accent': '0 0% 12%',
    '--sidebar-accent-foreground': '0 0% 90%',
    '--sidebar-primary': '173 80% 40%',
    '--sidebar-primary-foreground': '0 0% 100%',
  },
  editorial: {
    '--background': '40 33% 98%',
    '--foreground': '20 10% 10%',
    '--card': '40 33% 96%',
    '--card-foreground': '20 10% 10%',
    '--border': '40 20% 85%',
    '--input': '40 20% 85%',
    '--ring': '20 10% 10%',
    '--popover': '40 33% 98%',
    '--popover-foreground': '20 10% 10%',
    '--popover-border': '40 20% 85%',
    '--primary': '173 80% 30%',
    '--primary-foreground': '0 0% 100%',
    '--primary-gradient-from': '199 89% 40%',
    '--primary-gradient-to': '173 80% 30%',
    '--secondary': '40 20% 92%',
    '--secondary-foreground': '20 10% 10%',
    '--muted': '40 20% 92%',
    '--muted-foreground': '20 10% 40%',
    '--accent': '40 20% 90%',
    '--accent-foreground': '20 10% 10%',
    '--sidebar': '40 33% 96%',
    '--sidebar-foreground': '20 10% 10%',
    '--sidebar-border': '40 20% 85%',
    '--sidebar-accent': '40 20% 90%',
    '--sidebar-accent-foreground': '20 10% 10%',
    '--sidebar-primary': '173 80% 30%',
    '--sidebar-primary-foreground': '0 0% 100%',
  },
  signature: {
    '--background': '0 0% 0% / 0',
    '--foreground': '0 0% 95%',
    '--card': '0 0% 6% / 0.6',
    '--card-foreground': '0 0% 95%',
    '--border': '0 0% 100% / 0.15',
    '--input': '0 0% 100% / 0.15',
    '--ring': '0 0% 40%',
    '--popover': '0 0% 6% / 0.9',
    '--popover-foreground': '0 0% 95%',
    '--popover-border': '0 0% 100% / 0.15',
    '--primary': '173 80% 50%',
    '--primary-foreground': '0 0% 0%',
    '--primary-gradient-from': '199 89% 55%',
    '--primary-gradient-to': '173 80% 50%',
    '--secondary': '0 0% 15% / 0.6',
    '--secondary-foreground': '0 0% 95%',
    '--muted': '0 0% 100% / 0.1',
    '--muted-foreground': '0 0% 100% / 0.7',
    '--accent': '0 0% 100% / 0.15',
    '--accent-foreground': '0 0% 95%',
    '--sidebar': '0 0% 0% / 0.6',
    '--sidebar-foreground': '0 0% 95%',
    '--sidebar-border': '0 0% 100% / 0.15',
    '--sidebar-accent': '0 0% 100% / 0.1',
    '--sidebar-accent-foreground': '0 0% 95%',
    '--sidebar-primary': '173 80% 50%',
    '--sidebar-primary-foreground': '0 0% 0%',
  }
};

export const defaultTheme: EventTheme = {
  mode: 'studio',
  imageId: null,
  imageUrl: null,
  focalX: 50,
  focalY: 50,
  overlay: 0.5,
  guestImageConsent: false,
  revision: 1
};

export function useThemeEngine(theme: EventTheme | null) {
  useEffect(() => {
    if (!theme) {
      document.documentElement.removeAttribute('style');
      document.documentElement.className = '';
      return;
    }
    const vars = THEMES[theme.mode] || THEMES.studio;
    for (const [key, value] of Object.entries(vars)) {
      document.documentElement.style.setProperty(key, value);
    }
    
    document.documentElement.className = `theme-${theme.mode}`;
    
    return () => {
      document.documentElement.removeAttribute('style');
      document.documentElement.className = '';
    };
  }, [theme]);
}

export function ThemeSurface({ theme }: { theme: EventTheme | null }) {
  if (!theme || theme.mode !== 'signature') return null;
  return (
    <div 
      className="fixed inset-0 z-[-1] pointer-events-none bg-zinc-950"
      style={theme.imageUrl ? {
        backgroundImage: `url(${theme.imageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: `${theme.focalX}% ${theme.focalY}%`,
      } : {}}
    >
      {theme.imageUrl && (
        <div 
          className="absolute inset-0"
          style={{
            backgroundColor: `rgba(0,0,0,${theme.overlay})`
          }}
        />
      )}
    </div>
  );
}

export function isThemeDirty(saved: EventTheme | null, draft: EventTheme | null): boolean {
  if (!saved || !draft) return false;
  return (
    saved.mode !== draft.mode ||
    saved.imageId !== draft.imageId ||
    saved.focalX !== draft.focalX ||
    saved.focalY !== draft.focalY ||
    saved.overlay !== draft.overlay ||
    saved.guestImageConsent !== draft.guestImageConsent
  );
}

export function getThemeCleanupIds(saved: EventTheme | null, draft: EventTheme | null, newImageId?: string | null): string[] {
  const idsToClean = [];
  // If draft has an image that is not the saved image, and we are replacing/removing it
  if (draft?.imageId && draft.imageId !== saved?.imageId && draft.imageId !== newImageId) {
    idsToClean.push(draft.imageId);
  }
  return idsToClean;
}

type ThemeContextType = {
  theme: EventTheme | null;
  savedTheme: EventTheme | null;
  draftTheme: EventTheme | null;
  setDraftTheme: (theme: EventTheme | null) => void;
  saveTheme: () => Promise<void>;
  cancelEdit: () => void;
  uploadImage: (file: File) => Promise<{ imageId: string, imageUrl: string }>;
  deleteDraftImage: (imageId: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  retry: () => void;
};

export const ThemeContext = createContext<ThemeContextType | null>(null);

export function OwnerThemeProvider({ children }: { children: ReactNode }) {
  const { activeEventId } = useSillage();
  const [location] = useLocation();
  const [savedTheme, setSavedTheme] = useState<EventTheme | null>(null);
  const [draftTheme, setDraftTheme] = useState<EventTheme | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  const retry = () => setRetryCount(c => c + 1);

  useEffect(() => {
    if (!activeEventId) return;
    const controller = new AbortController();
    
    setLoading(true);
    setError(null);
    
    fetch(`/api/events/${activeEventId}/theme`, { 
      credentials: 'include',
      signal: controller.signal
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (!controller.signal.aborted) {
            setSavedTheme(data);
            setError(null);
          }
        } else {
          throw new Error('Erreur de chargement du thème');
        }
      })
      .catch((e) => {
        if (e.name !== 'AbortError' && !controller.signal.aborted) {
          console.error('Failed to fetch theme', e);
          setError('Impossible de charger l\'ambiance. Sauvegarde désactivée.');
          setSavedTheme(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeEventId, retryCount]);

  // Sync draft to saved unless editing
  useEffect(() => {
    if (savedTheme && !draftTheme) {
      setDraftTheme(savedTheme);
    }
  }, [savedTheme]);
  
  // Clear draft when navigating away from appearance
  useEffect(() => {
    if (location !== '/app/appearance' && draftTheme && savedTheme) {
      if (draftTheme.imageId && draftTheme.imageId !== savedTheme.imageId) {
        deleteDraftImage(draftTheme.imageId).catch(() => {});
      }
      setDraftTheme(null);
    }
  }, [location, draftTheme, savedTheme]);
  
  const saveTheme = async () => {
    if (!activeEventId || !draftTheme || !savedTheme) return;
    try {
      const oldImageId = savedTheme.imageId;
      const res = await fetch(`/api/events/${activeEventId}/theme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: draftTheme.mode,
          imageId: draftTheme.imageId,
          focalX: draftTheme.focalX,
          focalY: draftTheme.focalY,
          overlay: draftTheme.overlay,
          guestImageConsent: draftTheme.guestImageConsent,
          revision: savedTheme.revision
        }),
        credentials: 'include'
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save theme');
      }
      const newTheme = await res.json();
      setSavedTheme(newTheme);
      setDraftTheme(null);
      toast.success('Ambiance sauvegardée');
      
      // Clean up old image if it was replaced or removed
      if (oldImageId && oldImageId !== newTheme.imageId) {
        deleteDraftImage(oldImageId).catch(() => {});
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la sauvegarde');
      throw e;
    }
  };

  const cancelEdit = () => {
    if (draftTheme?.imageId && draftTheme.imageId !== savedTheme?.imageId) {
      deleteDraftImage(draftTheme.imageId).catch(() => {});
    }
    setDraftTheme(savedTheme);
  };

  const uploadImage = async (file: File) => {
    if (!activeEventId) throw new Error('No active event');
    const res = await fetch(`/api/events/${activeEventId}/theme/images`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type
      },
      body: file,
      credentials: 'include'
    });
    if (!res.ok) {
      const err = await res.json().catch(()=>({}));
      throw new Error(err.error || 'Upload failed');
    }
    return res.json();
  };

  const deleteDraftImage = async (imageId: string) => {
    if (!activeEventId) return;
    await fetch(`/api/events/${activeEventId}/theme/images/${imageId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
  };

  // Clear draft on unmount
  useEffect(() => {
    return () => {
      setDraftTheme(null);
    };
  }, []);

  const activeTheme = draftTheme || savedTheme;
  useThemeEngine(activeTheme);

  return (
    <ThemeContext.Provider value={{
      theme: activeTheme,
      savedTheme,
      draftTheme,
      setDraftTheme,
      saveTheme,
      cancelEdit,
      uploadImage,
      deleteDraftImage,
      loading,
      error,
      retry
    }}>
      {children}
      <ThemeSurface theme={activeTheme} />
    </ThemeContext.Provider>
  );
}

export function useOwnerTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('Missing OwnerThemeProvider');
  return ctx;
}
