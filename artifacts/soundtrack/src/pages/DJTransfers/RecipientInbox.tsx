import { useListReceivedDjTransfers, getListReceivedDjTransfersQueryKey } from '@workspace/api-client-react';
import type { DJTransfer } from '@/lib/dj-transfers';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { AlertCircle, Clock, Disc3, Download, Music } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function RecipientInbox() {
  const { data: transfers, isLoading, error } = useListReceivedDjTransfers({
    query: {
      queryKey: getListReceivedDjTransfersQueryKey(),
      retry: false,
      refetchInterval: (query) => query.state.error ? false : 20000
    }
  });

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/50 bg-background/95 backdrop-blur z-10 sticky top-0 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl tracking-widest text-primary font-semibold">SILLAGE</h1>
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em]">Espace Réception DJ</p>
        </div>
        <Link href="/">
          <Button variant="ghost" size="sm">Retour à l'accueil</Button>
        </Link>
      </header>

      <main className="flex-1 p-6 md:p-12 max-w-5xl mx-auto w-full">
        <div className="mb-10">
          <h2 className="text-3xl font-serif text-white mb-2">Vos transferts reçus</h2>
          <p className="text-muted-foreground">Téléchargez les sélections partagées par les organisateurs pour leurs événements.</p>
        </div>

        {isLoading ? (
          <div className="py-20 flex justify-center text-muted-foreground">
            Chargement de votre boîte de réception...
          </div>
        ) : error ? (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium">Impossible de charger les transferts</h4>
              <p className="text-sm mt-1">{error instanceof Error ? error.message : 'Erreur de connexion'}</p>
            </div>
          </div>
        ) : transfers?.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-12 flex flex-col items-center justify-center text-center bg-card/30">
            <Disc3 className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">Aucun transfert</h3>
            <p className="text-muted-foreground text-sm max-w-sm">
              Vous n'avez pas encore reçu de transferts de fichiers. Si un couple a partagé des fichiers avec vous, vérifiez que vous êtes connecté avec la bonne adresse e-mail.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {transfers?.map(transfer => (
              <TransferCard key={transfer.id} transfer={transfer} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function TransferCard({ transfer }: { transfer: DJTransfer }) {
  const isRevoked = transfer.status === 'revoked';
  const isExpired = transfer.status === 'expired';
  const isActive = transfer.status === 'active';
  const isPending = transfer.status === 'pending';

  return (
    <div className={`border rounded-xl flex flex-col bg-card/50 overflow-hidden transition-all ${isActive || isPending ? 'border-border hover:border-primary/50' : 'border-border/40 opacity-75'}`}>
      <div className="p-5 flex-1">
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500' : isPending ? 'bg-blue-400' : isRevoked ? 'bg-destructive' : 'bg-muted-foreground'}`} />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {isActive ? 'Actif' : isPending ? 'En attente' : isRevoked ? 'Révoqué' : 'Expiré'}
          </span>
        </div>
        
        <h3 className="text-xl font-serif text-white mb-1 line-clamp-2 break-words">{transfer.eventName}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Expire le {format(new Date(transfer.expiresAt), 'dd MMM yyyy', { locale: fr })}
        </p>

        <div className="flex items-center gap-3 text-sm text-foreground/80 bg-background/50 p-3 rounded-lg border border-border/50">
          <Music className="w-4 h-4 text-primary" />
          <span>{transfer.tracks.length} fichiers audios</span>
        </div>
      </div>
      
      <div className="p-4 border-t border-border/50 bg-background/20">
        <Link href={`/dj-transfers/${transfer.id}`}>
          <Button variant={isActive || isPending ? 'default' : 'secondary'} className="w-full gap-2" disabled={!isActive && !isPending && !isExpired}>
            {isActive || isPending ? <><Download className="w-4 h-4" /> Ouvrir le transfert</> : 'Détails du transfert'}
          </Button>
        </Link>
      </div>
    </div>
  );
}