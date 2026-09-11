import { Track } from '@/lib/types';
import { useSillage } from '@/lib/store';
import { Play, MoreHorizontal, GripVertical, ArrowUp, ArrowDown, Pencil } from 'lucide-react';
import { formatDuration } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface TrackRowProps {
  track: Track;
  index?: number;
  showCover?: boolean;
  isDragHandle?: boolean;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export function TrackRow({ track, index, showCover = true, isDragHandle = false, onRemove, onMoveUp, onMoveDown }: TrackRowProps) {
  const { setPlaying, currentlyPlaying, playlists, timeline, addTrackToPlaylist, addTrackToMoment, updateTrackMetadata } = useSillage();
  const isPlaying = currentlyPlaying?.id === track.id;
  const excluded = !!track.excluded;
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className={`group flex items-center gap-4 py-2 px-4 rounded-md transition-colors hover:bg-white/5 ${isPlaying ? 'bg-white/5' : ''} ${excluded ? 'opacity-40 grayscale' : ''}`}>
      <button type="button" aria-label={`Lire ${track.title}`} className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-white/10" onClick={() => setPlaying(track)}>
        <Play className="w-3.5 h-3.5 fill-current" />
      </button>
      {isDragHandle && (
        <div className="cursor-grab text-muted-foreground opacity-0 group-hover:opacity-100 flex flex-col gap-1 items-center">
          {onMoveUp && <button onClick={onMoveUp} className="hover:text-foreground"><ArrowUp className="w-3 h-3" /></button>}
          {onMoveDown && <button onClick={onMoveDown} className="hover:text-foreground"><ArrowDown className="w-3 h-3" /></button>}
        </div>
      )}
      
      {index !== undefined && !isDragHandle && (
        <div className="w-6 text-center text-sm text-muted-foreground font-mono">
          {isPlaying ? <Play className="w-3 h-3 text-primary mx-auto" /> : index + 1}
        </div>
      )}

      {showCover && (
        <div className="relative w-10 h-10 rounded overflow-hidden shrink-0">
          <img src={track.cover || '/favicon.svg'} alt={track.title} className="w-full h-full object-cover" />
          <button 
            className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => setPlaying(track)}
          >
            <Play className="w-4 h-4 text-white fill-current" />
          </button>
        </div>
      )}

      {!showCover && index === undefined && !isDragHandle && (
         <button 
          className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          onClick={() => setPlaying(track)}
        >
          <Play className="w-4 h-4 text-white fill-current ml-1" />
        </button>
      )}

      <div className="flex-1 min-w-0">
        <h4 className={`text-sm font-medium truncate ${isPlaying ? 'text-primary' : 'text-foreground'} ${excluded ? 'line-through' : ''}`}>
          {track.title}
        </h4>
        <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
      </div>

      <div className="hidden md:block w-1/4 min-w-0">
        <p className="text-xs text-muted-foreground truncate">{track.album}</p>
      </div>

      <div className="hidden lg:flex items-center gap-2 w-1/5">
        <span className="text-xs border border-border px-1.5 py-0.5 rounded text-muted-foreground">
          {track.bpm == null ? 'BPM —' : `${track.bpm} BPM`}
        </span>
        <span className="text-xs border border-border px-1.5 py-0.5 rounded text-muted-foreground">
          {track.key || 'Tonalité —'}
        </span>
      </div>

      <div className="text-xs text-muted-foreground font-mono w-12 text-right">
        {formatDuration(track.duration)}
      </div>

      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => setPlaying(track)}>
              Lire
            </DropdownMenuItem>
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild><DropdownMenuItem onSelect={(e) => e.preventDefault()}><Pencil className="w-3.5 h-3.5 mr-2"/>Modifier les métadonnées</DropdownMenuItem></DialogTrigger>
              <DialogContent className="bg-card border-border"><DialogHeader><DialogTitle className="text-white font-serif">Métadonnées du titre</DialogTitle></DialogHeader><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const data=new FormData(e.currentTarget); void updateTrackMetadata(track.id,{title:String(data.get('title')),artist:String(data.get('artist')),album:String(data.get('album'))}).then(()=>{setEditOpen(false);toast.success('Métadonnées enregistrées.');}).catch(err=>toast.error(err instanceof Error?err.message:'Enregistrement impossible')); }}><Input name="title" required defaultValue={track.title} className="bg-background"/><Input name="artist" required defaultValue={track.artist} className="bg-background"/><Input name="album" defaultValue={track.album} className="bg-background"/><Button type="submit" className="w-full">Enregistrer</Button></form></DialogContent>
            </Dialog>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Ajouter à la playlist</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {playlists.map(pl => (
                  <DropdownMenuItem key={pl.id} onClick={() => {
                    addTrackToPlaylist(pl.id, track);
                    toast.success("Ajouté à la playlist");
                  }}>
                    {pl.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Ajouter au moment</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {timeline.map(m => (
                  <DropdownMenuItem key={m.id} onClick={() => {
                    addTrackToMoment(m.id, track);
                    toast.success("Ajouté au moment");
                  }}>
                    {m.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {onRemove && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onRemove}>
                  Retirer
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
