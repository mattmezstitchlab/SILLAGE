import { useState, useRef, useEffect } from 'react';
import { useGetDjTransfer, getGetDjTransferQueryKey, getListReceivedDjTransfersQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { downloadTrack } from '@/lib/dj-transfers';
import type { DJTransferTrack } from '@/lib/dj-transfers';
import { Button } from '@/components/ui/button';
import { Link, useParams } from 'wouter';
import { AlertCircle, ArrowLeft, Download, FileAudio, XCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

export default function RecipientDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();

  const { data: transfer, isLoading, error } = useGetDjTransfer(id!, {
    query: {
      queryKey: getGetDjTransferQueryKey(id!),
      enabled: !!id,
      retry: false,
      refetchInterval: (query) => query.state.error ? false : 20000
    }
  });

  useEffect(() => {
    if (transfer && transfer.status === 'active') {
      // Always invalidate the inbox when viewing an active transfer details
      // to ensure binding state is reflected if they navigate back.
      queryClient.invalidateQueries({ queryKey: getListReceivedDjTransfersQueryKey() });
    }
  }, [transfer?.status, queryClient]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p>Ouverture du transfert...</p>
        </div>
      </div>
    );
  }

  if (error || !transfer) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border border-destructive/20 p-8 rounded-2xl text-center space-y-4">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-2">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-serif text-foreground">Transfert inaccessible</h2>
          <p className="text-muted-foreground text-sm">
            {error instanceof Error ? error.message : 'Ce lien est invalide ou vous n\'êtes pas autorisé à y accéder avec ce compte.'}
          </p>
          <div className="pt-4">
            <Link href="/dj-transfers">
              <Button variant="outline" className="w-full">Retour à la boîte de réception</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isRevoked = transfer.status === 'revoked';
  const isExpired = transfer.status === 'expired';
  const isActive = transfer.status === 'active';

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/50 bg-background/95 backdrop-blur z-10 sticky top-0 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dj-transfers">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="font-serif text-lg text-foreground">{transfer.eventName}</h1>
            <p className="text-xs text-muted-foreground">Transfert DJ</p>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 md:p-12 max-w-4xl mx-auto w-full">
        {!isActive && (
          <div className="mb-8 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-destructive">
                Ce transfert est {isRevoked ? 'révoqué' : 'expiré'}
              </h4>
              <p className="text-sm mt-1 opacity-90">
                Vous ne pouvez plus télécharger les fichiers de ce transfert. Les téléchargements déjà effectués restent valides.
              </p>
            </div>
          </div>
        )}

        <div className="bg-card/30 border border-border rounded-2xl p-6 md:p-8 mb-8">
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4">Informations</h3>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <dt className="text-muted-foreground">Destinataire</dt>
                  <dd className="text-foreground font-medium">{transfer.recipientEmail}</dd>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <dt className="text-muted-foreground">Date d'envoi</dt>
                  <dd className="text-foreground">{format(new Date(transfer.createdAt), 'dd MMMM yyyy', { locale: fr })}</dd>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <dt className="text-muted-foreground">Date d'expiration</dt>
                  <dd className="text-foreground">{format(new Date(transfer.expiresAt), 'dd MMMM yyyy', { locale: fr })}</dd>
                </div>
                <div className="flex justify-between pb-2">
                  <dt className="text-muted-foreground">Volume</dt>
                  <dd className="text-foreground">{transfer.tracks.length} fichiers</dd>
                </div>
              </dl>
            </div>
            
            <div className="bg-background rounded-xl p-5 border border-border flex flex-col justify-center">
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Ces fichiers vous sont partagés de manière strictement confidentielle pour la réalisation de la prestation événementielle. Vous vous engagez à ne pas les diffuser publiquement.
              </p>
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-500">
                <CheckCircle2 className="w-4 h-4" /> Droits confirmés par l'expéditeur
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-serif text-foreground flex items-center gap-2">
            Fichiers audios <span className="bg-secondary text-secondary-foreground text-xs font-sans px-2 py-0.5 rounded-full">{transfer.tracks.length}</span>
          </h2>
          
          <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border/50">
            {transfer.tracks.map(track => (
              <TrackDownloadRow 
                key={track.id} 
                transferId={transfer.id} 
                track={track} 
                isActive={isActive} 
              />
            ))}
            {transfer.tracks.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                Ce transfert ne contient aucun fichier.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function TrackDownloadRow({ transferId, track, isActive }: { transferId: string, track: DJTransferTrack, isActive: boolean }) {
  const [status, setStatus] = useState<'idle' | 'downloading' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleDownload = async () => {
    if (status === 'downloading') {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setStatus('idle');
      setProgress(0);
      return;
    }

    try {
      setStatus('downloading');
      setProgress(0);
      setErrorMsg('');
      
      const controller = new AbortController();
      abortControllerRef.current = controller;

      await downloadTrack(
        transferId,
        track.id,
        (loaded, total) => {
          if (total > 0) {
            setProgress(Math.round((loaded / total) * 100));
          }
        },
        controller.signal
      );

      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setStatus('idle');
        setProgress(0);
      } else {
        setStatus('error');
        setErrorMsg(e.message || 'Erreur');
        toast.error(`Échec du téléchargement: ${e.message}`);
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return 'Inconnu';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} Mo`;
  };

  return (
    <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-accent/10 transition-colors">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="w-10 h-10 bg-secondary rounded flex items-center justify-center shrink-0">
          <FileAudio className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground truncate text-sm">{track.title}</p>
          <p className="text-xs text-muted-foreground truncate">{track.artist || 'Artiste inconnu'} • {formatSize(track.byteSize)}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {status === 'downloading' && (
          <div className="flex items-center gap-3 bg-background border border-border px-3 py-1.5 rounded-full text-xs">
            <span className="text-primary tabular-nums">{progress}%</span>
            <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[hsl(var(--primary-gradient-from))] to-[hsl(var(--primary-gradient-to))] transition-all duration-300" 
                style={{ width: `${progress}%` }} 
              />
            </div>
            <button onClick={handleDownload} className="text-muted-foreground hover:text-foreground" title="Annuler">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {status === 'success' && (
          <div className="flex items-center gap-1.5 text-emerald-500 text-sm font-medium px-3 py-1.5">
            <CheckCircle2 className="w-4 h-4" /> Terminé
          </div>
        )}

        {status === 'error' && (
          <div className="text-destructive text-xs font-medium px-2 max-w-[120px] truncate" title={errorMsg}>
            {errorMsg}
          </div>
        )}

        {status !== 'downloading' && status !== 'success' && (
          <Button 
            onClick={handleDownload} 
            disabled={!isActive} 
            size="sm"
            variant={isActive ? "secondary" : "ghost"}
            className="gap-2"
          >
            <Download className="w-4 h-4" /> 
            <span className="hidden sm:inline">Télécharger</span>
          </Button>
        )}
      </div>
    </div>
  );
}