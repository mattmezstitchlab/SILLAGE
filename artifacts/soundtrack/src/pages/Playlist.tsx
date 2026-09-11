import { useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useSillage } from '@/lib/store';
import { TrackRow } from '@/components/TrackRow';
import { Button } from '@/components/ui/button';
import { Play, Trash2, Edit2, Share2, Shuffle, Download, Link as LinkIcon, Info } from 'lucide-react';
import { computeDNA, formatDuration } from '@/lib/utils';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export default function PlaylistView() {
  const [match, params] = useRoute('/playlist/:id');
  const [, setLocation] = useLocation();
  const { playlists, setPlaying, removeTrackFromPlaylist, deletePlaylist, reorderPlaylist, updatePlaylist } = useSillage();
  
  const [editOpen, setEditOpen] = useState(false);
  
  if (!match) return null;
  
  const playlist = playlists.find(p => p.id === params?.id);
  
  if (!playlist) {
    return <div className="p-8 text-center text-muted-foreground">Playlist introuvable</div>;
  }

  const dna = computeDNA(playlist.tracks);
  const totalDuration = playlist.tracks.reduce((acc, t) => acc + t.duration, 0);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.origin + window.location.pathname + '#/guest');
    toast.success("Lien copié", { description: "Lien vers la vue invité copié dans le presse-papier." });
  };

  const handleDownloadJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(playlist, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${playlist.name.replace(/\s+/g, '_')}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleDelete = () => {
    if (confirm("Supprimer cette playlist ?")) {
      deletePlaylist(playlist.id);
      setLocation('/');
      toast.success("Playlist supprimée");
    }
  };

  const handleMoveUp = (index: number) => {
    if (index > 0) reorderPlaylist(playlist.id, index, index - 1);
  };

  const handleMoveDown = (index: number) => {
    if (index < playlist.tracks.length - 1) reorderPlaylist(playlist.id, index, index + 1);
  };
  
  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    
    if (name.trim()) {
      updatePlaylist(playlist.id, { name, description });
      setEditOpen(false);
      toast.success("Playlist mise à jour");
    }
  };

  return (
    <div className="pb-32">
      <div className="h-80 bg-gradient-to-b from-white/10 to-background flex items-end p-8 border-b border-border">
        <div className="flex items-end gap-6 w-full">
          <div className="w-48 h-48 rounded-md overflow-hidden bg-card shadow-2xl shrink-0 relative group">
            {playlist.cover ? (
              <img src={playlist.cover} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-white/5">
                <span className="text-muted-foreground text-4xl font-serif">{playlist.name.charAt(0)}</span>
              </div>
            )}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer">
                   <Edit2 className="w-6 h-6 text-white" />
                </div>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px] bg-card border-border">
                <DialogHeader>
                  <DialogTitle className="text-white font-serif text-xl">Modifier la playlist</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleUpdate} className="space-y-6 pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Nom</label>
                    <Input 
                      name="name"
                      defaultValue={playlist.name} 
                      className="bg-background border-border text-white" 
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Description</label>
                    <textarea 
                      name="description"
                      defaultValue={playlist.description}
                      className="w-full bg-background border border-border rounded-md p-3 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <DialogClose asChild>
                      <Button variant="ghost" type="button">Annuler</Button>
                    </DialogClose>
                    <Button type="submit">Enregistrer</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-widest text-primary mb-2">
              {playlist.type === 'dj-set' ? 'Set DJ' : 'Collection'}
            </p>
            <h1 className="text-5xl font-serif font-bold mb-4 truncate text-white hover:text-primary transition-colors cursor-text" title="Modifier" onClick={() => setEditOpen(true)}>
              {playlist.name}
            </h1>
            <p className="text-muted-foreground mb-4 max-w-2xl">{playlist.description || "Ajouter une description..."}</p>
            
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{playlist.tracks.length} titres</span>
              <span>•</span>
              <span>{formatDuration(totalDuration)}</span>
              {playlist.tracks.length > 0 && (
                <>
                  <span>•</span>
                  <span>Énergie moy: {dna.energy}/10</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-8">
        <div className="flex items-center gap-4 mb-8">
          <Button 
            size="lg" 
            className="rounded-full w-14 h-14 p-0 shadow-lg shadow-black/50"
            disabled={playlist.tracks.length === 0}
            onClick={() => setPlaying(playlist.tracks[0])}
          >
            <Play className="w-6 h-6 fill-current ml-1" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full" title="Lecture aléatoire">
            <Shuffle className="w-5 h-5" />
          </Button>
          <div className="flex-1" />
          
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Share2 className="w-4 h-4 mr-2" />
                Partager
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-2xl mb-2 text-white">Partager "{playlist.name}"</DialogTitle>
                <DialogDescription>
                  Choisissez comment partager votre sélection.
                </DialogDescription>
              </DialogHeader>
              
              <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground mb-6">
                <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <p>
                  Sillage est un prototype fonctionnel qui tourne entièrement dans votre navigateur. 
                  Il n'y a pas de base de données ni de synchronisation. Les envois des invités sont simulés.
                </p>
              </div>

              <div className="space-y-4">
                <Button className="w-full flex justify-between h-14 bg-white text-black hover:bg-white/90" onClick={handleCopyLink}>
                  <span className="flex items-center">
                    <LinkIcon className="w-5 h-5 mr-3" />
                    Copier le lien pour les invités
                  </span>
                </Button>
                
                <Button variant="outline" className="w-full flex justify-between h-14" onClick={handleDownloadJSON}>
                  <span className="flex items-center">
                    <Download className="w-5 h-5 mr-3" />
                    Exporter la playlist (JSON)
                  </span>
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={handleDelete}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-1">
          {playlist.tracks.length > 0 ? (
            playlist.tracks.map((track, i) => (
              <TrackRow 
                key={`${track.id}-${i}`} 
                track={track} 
                index={i} 
                isDragHandle={playlist.type === 'dj-set'}
                onRemove={() => removeTrackFromPlaylist(playlist.id, track.id)}
                onMoveUp={playlist.type === 'dj-set' ? () => handleMoveUp(i) : undefined}
                onMoveDown={playlist.type === 'dj-set' ? () => handleMoveDown(i) : undefined}
              />
            ))
          ) : (
            <div className="text-center py-20 border border-dashed border-border rounded-xl">
              <p className="text-muted-foreground mb-2">Cette playlist est vide.</p>
              <Button variant="link" onClick={() => setLocation('/search')}>
                Rechercher des titres
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
