import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSillage } from '@/lib/store';
import type { DJTransfer, DJTransferCreate } from '@/lib/dj-transfers';
import { useListDjTransfers, useCreateDjTransfer, useRevokeDjTransfer, getListDjTransfersQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { AlertCircle, Clock, Copy, Plus, Send, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function OwnerDJTransfers() {
  const { activeEventId, playlists, library } = useSillage();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);

  const { data: transfers = [], isLoading, error } = useListDjTransfers(activeEventId!, {
    query: {
      queryKey: getListDjTransfersQueryKey(activeEventId!),
      enabled: !!activeEventId,
      retry: false,
      refetchInterval: (query) => query.state.error ? false : 20000,
    }
  });

  const revokeMutation = useRevokeDjTransfer({
    mutation: {
      onSuccess: () => {
        toast.success('Transfert révoqué.');
        if (activeEventId) {
          queryClient.invalidateQueries({ queryKey: getListDjTransfersQueryKey(activeEventId) });
        }
      },
      onError: (e: any) => toast.error(e.message)
    }
  });

  if (!activeEventId) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-full">
        <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-serif text-white mb-2">Aucun événement actif</h2>
        <p className="text-muted-foreground text-center">Veuillez d'abord sélectionner ou créer un événement.</p>
      </div>
    );
  }

  if (isCreating) {
    return <CreateTransferForm onCancel={() => setIsCreating(false)} onSuccess={() => { setIsCreating(false); if (activeEventId) void queryClient.invalidateQueries({ queryKey: getListDjTransfersQueryKey(activeEventId) }); }} />;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-serif text-white mb-2">Transferts DJ</h1>
          <p className="text-muted-foreground text-sm">Partagez vos fichiers audios sous licence de manière sécurisée et éphémère.</p>
        </div>
        <Button onClick={() => setIsCreating(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Nouveau transfert
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      ) : error ? (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p>{error instanceof Error ? error.message : 'Erreur de chargement'}</p>
        </div>
      ) : transfers.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-12 flex flex-col items-center justify-center text-center bg-card/30">
          <Send className="w-12 h-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">Aucun transfert en cours</h3>
          <p className="text-muted-foreground text-sm max-w-sm mb-6">
            Sélectionnez des fichiers ou une playlist complète, et générez un lien privé pour votre DJ.
          </p>
          <Button onClick={() => setIsCreating(true)} variant="outline">Créer mon premier transfert</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {transfers.map(transfer => (
            <TransferCard 
              key={transfer.id} 
              transfer={transfer} 
              onRevoke={() => {
                if (window.confirm('Voulez-vous vraiment révoquer ce transfert ? Les téléchargements en cours se termineront, mais les futurs seront bloqués.')) {
                  revokeMutation.mutate({ transferId: transfer.id });
                }
              }} 
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TransferCard({ transfer, onRevoke }: { transfer: DJTransfer, onRevoke: () => void }) {
  const isRevoked = transfer.status === 'revoked';
  const isExpired = transfer.status === 'expired';
  const isActive = transfer.status === 'active';
  const isPending = transfer.status === 'pending';

  const copyLink = () => {
    const url = `${window.location.origin}/dj-transfers/${transfer.id}`;
    navigator.clipboard.writeText(url);
    toast.success('Lien copié dans le presse-papiers');
  };

  const getStatusDisplay = () => {
    if (isRevoked) return <span className="flex items-center gap-1.5 text-destructive text-sm font-medium"><AlertTriangle className="w-4 h-4" /> Révoqué</span>;
    if (isExpired) return <span className="flex items-center gap-1.5 text-muted-foreground text-sm font-medium"><Clock className="w-4 h-4" /> Expiré</span>;
    if (isPending) return <span className="flex items-center gap-1.5 text-blue-400 text-sm font-medium"><Clock className="w-4 h-4" /> En attente d'ouverture</span>;
    return <span className="flex items-center gap-1.5 text-emerald-500 text-sm font-medium"><CheckCircle2 className="w-4 h-4" /> Actif</span>;
  };

  return (
    <div className={`border rounded-xl p-5 bg-card/50 transition-colors ${isActive || isPending ? 'border-border' : 'border-border/50 opacity-75'}`}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3 mb-1">
            <h3 className="font-medium text-white break-all">{transfer.recipientEmail}</h3>
            {getStatusDisplay()}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Créé le {format(new Date(transfer.createdAt), 'dd MMM yyyy', { locale: fr })} • 
            Expire le {format(new Date(transfer.expiresAt), 'dd MMM yyyy', { locale: fr })} • 
            {transfer.tracks.length} fichiers
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {(isActive || isPending) && (
            <>
              <Button variant="outline" size="sm" onClick={copyLink} className="gap-2">
                <Copy className="w-4 h-4" /> Copier le lien
              </Button>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={onRevoke}>
                Révoquer
              </Button>
            </>
          )}
        </div>
      </div>
      
      {transfer.history && transfer.history.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border/50">
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Historique récent</h4>
          <div className="space-y-2">
            {transfer.history.slice(0, 5).map(event => (
              <div key={event.id} className="text-sm flex items-center justify-between">
                <span className="text-foreground/80 truncate mr-4">
                  {event.status === 'initiated' && 'Début de téléchargement'}
                  {event.status === 'served' && 'Envoyé par le serveur'}
                  {event.status === 'failed' && 'Échec du téléchargement'}
                  {event.status === 'aborted' && 'Téléchargement annulé'}
                  {event.titleSnapshot && ` - ${event.titleSnapshot}`}
                </span>
                <span className="text-muted-foreground text-xs whitespace-nowrap">{format(new Date(event.startedAt), 'HH:mm - dd/MM')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CreateTransferForm({ onCancel, onSuccess }: { onCancel: () => void, onSuccess: () => void }) {
  const { activeEventId, playlists, library } = useSillage();
  const [email, setEmail] = useState('');
  const [expiryDays, setExpiryDays] = useState('30');
  const [confirmed, setConfirmed] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'playlist' | 'individual'>('playlist');
  const [selectedPlaylist, setSelectedPlaylist] = useState<string>('');
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());

  const mutation = useCreateDjTransfer({
    mutation: {
      onSuccess: (data) => {
        const url = `${window.location.origin}/dj-transfers/${data.id}`;
        navigator.clipboard.writeText(url);
        toast.success('Transfert créé et lien copié !');
        onSuccess();
      },
      onError: (e: any) => toast.error(e.message)
    }
  });

  const handleToggleTrack = (id: string) => {
    const next = new Set(selectedTracks);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedTracks(next);
  };

  const getFinalTracks = () => {
    if (selectionMode === 'playlist') {
      const pl = playlists.find(p => p.id === selectedPlaylist);
      return pl ? pl.tracks.filter(t => t.source === 'upload').map(t => t.id) : [];
    }
    return Array.from(selectedTracks);
  };

  const finalTracks = getFinalTracks();
  const isValid = email.includes('@') && finalTracks.length > 0 && confirmed && parseInt(expiryDays) > 0 && parseInt(expiryDays) <= 90;

  const selectedPlObj = playlists.find(p => p.id === selectedPlaylist);
  const selectedPlTotal = selectedPlObj?.tracks.length || 0;
  const selectedPlCatalogue = selectedPlObj ? selectedPlObj.tracks.filter(t => t.source !== 'upload').length : 0;
  const shareableLibrary = useMemo(() => library.filter(t => t.source === 'upload'), [library]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    
    mutation.mutate({
      eventId: activeEventId!,
      data: {
        recipientEmail: email,
        trackIds: finalTracks,
        expiresAt: addDays(new Date(), parseInt(expiryDays)).toISOString(),
        rightsConfirmed: true
      }
    });
  };

  return (
    <div className="p-8 max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={onCancel} className="text-muted-foreground"><X className="w-5 h-5" /></Button>
        <h1 className="text-2xl font-serif text-white">Nouveau transfert</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="space-y-4 bg-card/30 p-6 rounded-xl border border-border">
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">Email du destinataire (DJ)</label>
            <Input 
              type="email" 
              placeholder="dj@example.com" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className="bg-background"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">Expiration (jours)</label>
            <Input 
              type="number" 
              min="1" 
              max="90" 
              value={expiryDays} 
              onChange={e => setExpiryDays(e.target.value)} 
              className="bg-background max-w-[200px]"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">Maximum 90 jours.</p>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-medium text-white">Sélection des fichiers</h2>
          <div className="flex gap-2 p-1 bg-card rounded-lg w-max border border-border">
            <Button type="button" variant={selectionMode === 'playlist' ? 'secondary' : 'ghost'} size="sm" onClick={() => setSelectionMode('playlist')}>Depuis une playlist</Button>
            <Button type="button" variant={selectionMode === 'individual' ? 'secondary' : 'ghost'} size="sm" onClick={() => setSelectionMode('individual')}>Sélection individuelle</Button>
          </div>

          {selectionMode === 'playlist' ? (
            <div className="bg-background p-4 rounded-lg border border-border space-y-4">
              <select 
                className="w-full bg-input text-foreground border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={selectedPlaylist}
                onChange={e => setSelectedPlaylist(e.target.value)}
              >
                <option value="" disabled>Choisir une playlist...</option>
                {playlists.map(pl => (
                  <option key={pl.id} value={pl.id}>{pl.name} ({pl.tracks.length} titres)</option>
                ))}
              </select>
              
              {selectedPlCatalogue > 0 && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive p-3 rounded text-sm">
                  <strong>Attention :</strong> {selectedPlCatalogue} titre(s) provenant du catalogue (iTunes/Apple Music) ont été ignorés. Seuls les fichiers que vous avez vous-même importés peuvent être transmis au DJ.
                </div>
              )}
              {selectedPlaylist && selectedPlTotal > 0 && selectedPlTotal === selectedPlCatalogue && (
                <p className="text-sm text-destructive font-medium">
                  Cette playlist ne contient aucun fichier partageable.
                </p>
              )}
              
              <p className="text-sm text-muted-foreground bg-accent/30 p-3 rounded">
                Note : Le transfert est un instantané. Si vous modifiez cette playlist par la suite, le lien de téléchargement ne sera pas mis à jour automatiquement.
              </p>
            </div>
          ) : (
            <div className="bg-background border border-border rounded-lg max-h-[400px] overflow-y-auto p-2 space-y-1">
              {shareableLibrary.map(track => (
                <label key={track.id} className="flex items-center gap-3 p-2 hover:bg-accent/50 rounded cursor-pointer transition-colors">
                  <Checkbox 
                    checked={selectedTracks.has(track.id)}
                    onCheckedChange={() => handleToggleTrack(track.id)}
                  />
                  <div>
                    <p className="text-sm font-medium text-white">{track.title}</p>
                    <p className="text-xs text-muted-foreground">{track.artist || 'Artiste inconnu'}</p>
                  </div>
                </label>
              ))}
              {shareableLibrary.length === 0 && (
                <p className="text-sm text-muted-foreground p-4 text-center">Aucun fichier importé disponible. Les titres du catalogue ne peuvent pas être partagés.</p>
              )}
            </div>
          )}
        </div>

        <div className="bg-card/50 p-5 rounded-xl border border-border flex items-start gap-3">
          <Checkbox 
            id="rightsConfirmed" 
            checked={confirmed} 
            onCheckedChange={(c) => setConfirmed(c as boolean)} 
            className="mt-1"
          />
          <label htmlFor="rightsConfirmed" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
            <strong className="text-white block mb-1">Confirmation des droits</strong>
            Je confirme que les fichiers sélectionnés ont été acquis légalement et que ce partage s'effectue uniquement dans le cadre privé de mon événement pour l'usage exclusif du professionnel mandaté.
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button type="button" variant="ghost" onClick={onCancel}>Annuler</Button>
          <Button type="submit" disabled={!isValid || mutation.isPending}>
            {mutation.isPending ? 'Génération...' : `Générer le lien (${finalTracks.length} fichiers)`}
          </Button>
        </div>
      </form>
    </div>
  );
}