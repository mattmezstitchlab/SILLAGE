import { useEffect, useRef } from 'react';
import { useOwnerTheme, THEMES, defaultTheme, isThemeDirty, getThemeCleanupIds } from '@/lib/theme';
import { EventTheme } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { ImagePlus, Loader2, Save, Undo, X } from 'lucide-react';
import { toast } from 'sonner';

export default function Appearance() {
  const { theme, savedTheme, draftTheme, setDraftTheme, saveTheme, cancelEdit, uploadImage, deleteDraftImage, loading, error, retry } = useOwnerTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize draft if missing
  useEffect(() => {
    if (savedTheme && !draftTheme) {
      setDraftTheme({ ...savedTheme });
    }
  }, [savedTheme, draftTheme, setDraftTheme]);

  if (loading && !savedTheme && !error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-destructive mb-4">{error}</p>
        <Button onClick={retry}>Réessayer</Button>
      </div>
    );
  }

  if (!draftTheme) return null;

  const isDirty = isThemeDirty(savedTheme, draftTheme);

  const handleModeChange = (mode: EventTheme['mode']) => {
    setDraftTheme({ ...draftTheme, mode });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error('L\'image doit faire moins de 8Mo');
      return;
    }
    
    try {
      const { imageId, imageUrl } = await uploadImage(file);
      // Clean up previous draft image if it wasn't the saved one
      if (draftTheme.imageId && draftTheme.imageId !== savedTheme?.imageId) {
        await deleteDraftImage(draftTheme.imageId).catch(() => {});
      }
      setDraftTheme({
        ...draftTheme,
        imageId,
        imageUrl,
        guestImageConsent: false, // Consent explicit unchecked on every replacement
        mode: 'signature' // Auto-switch to signature if they upload an image
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de l\'upload');
    }
  };

  const handleRemoveImage = async () => {
    if (draftTheme.imageId && draftTheme.imageId !== savedTheme?.imageId) {
      await deleteDraftImage(draftTheme.imageId).catch(() => {});
    }
    setDraftTheme({
      ...draftTheme,
      imageId: null,
      imageUrl: null,
      guestImageConsent: false
    });
  };

  const handleSave = async () => {
    try {
      await saveTheme();
    } catch (e) {
      // Error is handled in context
    }
  };

  return (
    <div className="flex-1 p-6 sm:p-12 overflow-y-auto no-scrollbar">
      <div className="max-w-3xl mx-auto space-y-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-serif text-foreground mb-2">Ambiance</h1>
            <p className="text-muted-foreground">Personnalisez l'apparence de votre espace et celui de vos invités.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {isDirty && (
              <>
                <Button variant="ghost" onClick={cancelEdit}>
                  <Undo className="w-4 h-4 mr-2" />
                  Annuler
                </Button>
                <Button onClick={handleSave}>
                  <Save className="w-4 h-4 mr-2" />
                  Enregistrer
                </Button>
              </>
            )}
          </div>
        </div>

        <section className="space-y-6">
          <h2 className="text-xl font-serif text-foreground">Thème</h2>
          <Button variant="outline" onClick={() => {
            for (const id of getThemeCleanupIds(savedTheme, draftTheme)) {
              void deleteDraftImage(id).catch(() => {});
            }
            setDraftTheme({ ...defaultTheme, revision: savedTheme?.revision ?? 1 });
          }}>Revenir au thème par défaut</Button>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <button 
              className={`relative flex flex-col text-left border rounded-xl overflow-hidden transition-all duration-200 ${draftTheme.mode === 'studio' ? 'ring-2 ring-primary border-primary' : 'border-border hover:border-foreground/30'}`}
              onClick={() => handleModeChange('studio')}
            >
              <div className="h-32 w-full bg-[#0a0a0a] border-b border-border/50 p-4 flex flex-col justify-between">
                <div className="flex gap-2">
                  <div className="w-8 h-8 rounded-full bg-foreground/10" />
                  <div className="space-y-1">
                    <div className="h-2 w-16 bg-white/20 rounded" />
                    <div className="h-2 w-10 bg-foreground/10 rounded" />
                  </div>
                </div>
                <div className="h-8 w-full bg-gradient-to-r from-[hsl(var(--primary-gradient-from))] to-[hsl(var(--primary-gradient-to))] rounded opacity-90" />
              </div>
              <div className="p-4 bg-card">
                <h3 className="font-medium text-foreground">Studio</h3>
                <p className="text-sm text-muted-foreground mt-1">L'expérience originale sombre, axée sur la musique.</p>
              </div>
            </button>

            <button 
              className={`relative flex flex-col text-left border rounded-xl overflow-hidden transition-all duration-200 ${draftTheme.mode === 'editorial' ? 'ring-2 ring-primary border-primary' : 'border-border hover:border-foreground/30'}`}
              onClick={() => handleModeChange('editorial')}
            >
              <div className="h-32 w-full bg-[#faf8f5] border-b border-black/10 p-4 flex flex-col justify-between">
                <div className="flex gap-2">
                  <div className="w-8 h-8 rounded-full bg-black/10" />
                  <div className="space-y-1">
                    <div className="h-2 w-16 bg-black/20 rounded" />
                    <div className="h-2 w-10 bg-black/10 rounded" />
                  </div>
                </div>
                <div className="h-8 w-full bg-gradient-to-r from-[hsl(var(--primary-gradient-from))] to-[hsl(var(--primary-gradient-to))] shadow-sm rounded opacity-90" />
              </div>
              <div className="p-4 bg-card">
                <h3 className="font-medium text-foreground">Éditorial</h3>
                <p className="text-sm text-muted-foreground mt-1">Luminosité ivoire, contraste prononcé et élégance.</p>
              </div>
            </button>

            <button 
              className={`relative flex flex-col text-left border rounded-xl overflow-hidden transition-all duration-200 ${draftTheme.mode === 'signature' ? 'ring-2 ring-primary border-primary' : 'border-border hover:border-foreground/30'}`}
              onClick={() => handleModeChange('signature')}
            >
              <div className="h-32 w-full bg-zinc-900 border-b border-border/50 relative overflow-hidden p-4 flex flex-col justify-between">
                <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-900 opacity-50" />
                <div className="relative flex gap-2">
                  <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm" />
                  <div className="space-y-1">
                    <div className="h-2 w-16 bg-white/40 rounded backdrop-blur-sm" />
                    <div className="h-2 w-10 bg-white/20 rounded backdrop-blur-sm" />
                  </div>
                </div>
                <div className="relative h-8 w-full bg-gradient-to-r from-[hsl(var(--primary-gradient-from))] to-[hsl(var(--primary-gradient-to))] shadow-sm rounded opacity-90" />
              </div>
              <div className="p-4 bg-card">
                <h3 className="font-medium text-foreground">Signature</h3>
                <p className="text-sm text-muted-foreground mt-1">Votre image en arrière-plan, interfaces translucides.</p>
              </div>
            </button>

          </div>
        </section>

        {draftTheme.mode === 'signature' && (
          <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <h2 className="text-xl font-serif text-foreground">Arrière-plan</h2>
            
            <div className="bg-card border border-border p-6 rounded-xl space-y-6">
              
              {!draftTheme.imageUrl ? (
                <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-border rounded-lg text-center space-y-4">
                  <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center">
                    <ImagePlus className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Ajouter une image</p>
                    <p className="text-xs text-muted-foreground mt-1">JPEG, PNG ou WEBP. Maximum 8 Mo.</p>
                  </div>
                  <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                    Parcourir
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="relative aspect-video rounded-lg overflow-hidden border border-border bg-black group">
                    <img 
                      src={draftTheme.imageUrl} 
                      className="absolute inset-0 w-full h-full object-cover transition-all"
                      style={{ 
                        objectPosition: `${draftTheme.focalX}% ${draftTheme.focalY}%`,
                        opacity: 1 - draftTheme.overlay
                      }}
                      alt="Aperçu du thème"
                    />
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="destructive" size="icon" onClick={handleRemoveImage}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <label className="font-medium text-foreground">Opacité de l'assombrissement</label>
                        <span className="text-muted-foreground">{Math.round(draftTheme.overlay * 100)}%</span>
                      </div>
                      <Slider 
                        min={0} max={1} step={0.05} 
                        value={[draftTheme.overlay]}
                        onValueChange={([val]) => setDraftTheme({ ...draftTheme, overlay: val })}
                      />
                      <p className="text-xs text-muted-foreground">Augmentez l'assombrissement pour garantir la lisibilité du texte.</p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <label className="font-medium text-foreground">Point focal horizontal</label>
                        <span className="text-muted-foreground">{draftTheme.focalX}%</span>
                      </div>
                      <Slider 
                        min={0} max={100} step={1} 
                        value={[draftTheme.focalX]}
                        onValueChange={([val]) => setDraftTheme({ ...draftTheme, focalX: val })}
                      />
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <label className="font-medium text-foreground">Point focal vertical</label>
                        <span className="text-muted-foreground">{draftTheme.focalY}%</span>
                      </div>
                      <Slider 
                        min={0} max={100} step={1} 
                        value={[draftTheme.focalY]}
                        onValueChange={([val]) => setDraftTheme({ ...draftTheme, focalY: val })}
                      />
                    </div>
                  </div>
                </div>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/jpeg,image/png,image/webp" 
                onChange={handleImageUpload} 
              />
            </div>
          </section>
        )}

        {draftTheme.mode === 'signature' && draftTheme.imageUrl && (
          <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <h2 className="text-xl font-serif text-foreground">Confidentialité</h2>
            
            <div className="bg-card border border-border p-6 rounded-xl">
              <div className="flex items-start gap-4">
                <Switch 
                  id="guest-consent"
                  checked={draftTheme.guestImageConsent}
                  onCheckedChange={(checked) => setDraftTheme({ ...draftTheme, guestImageConsent: checked })}
                />
                <div className="space-y-1">
                  <label htmlFor="guest-consent" className="font-medium text-foreground cursor-pointer">
                    Afficher l'image aux invités
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Seuls les invités disposant du lien pourront voir cette image. Les photos téléchargées ou capturées par les invités ne pourront pas être rappelées.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="h-12" />
      </div>
    </div>
  );
}
