import { Play, Pause, SkipBack, SkipForward, Volume2, Maximize2 } from 'lucide-react';
import { useSillage } from '@/lib/store';
import { Slider } from '@/components/ui/slider';
import { useState, useEffect } from 'react';

export function Player() {
  const { currentlyPlaying, isPlaying, togglePlay } = useSillage();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let interval: number;
    if (isPlaying && currentlyPlaying) {
      interval = window.setInterval(() => {
        setProgress(p => {
          if (p >= 100) return 0;
          return p + (100 / currentlyPlaying.duration);
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentlyPlaying]);

  if (!currentlyPlaying) {
    return (
      <div className="h-24 bg-card border-t border-border flex items-center justify-center px-6">
        <p className="text-muted-foreground text-sm">Sélectionnez un morceau pour l'écouter</p>
      </div>
    );
  }

  return (
    <div className="h-24 bg-card border-t border-border flex items-center justify-between px-6 z-50">
      <div className="flex items-center gap-4 w-1/3 min-w-0">
        <div className="w-14 h-14 rounded overflow-hidden shrink-0 bg-muted relative group">
          <img src={currentlyPlaying.cover} alt={currentlyPlaying.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer">
            <Maximize2 className="w-5 h-5 text-white" />
          </div>
        </div>
        <div className="min-w-0">
          <h4 className="font-medium text-foreground truncate">{currentlyPlaying.title}</h4>
          <p className="text-xs text-muted-foreground truncate">{currentlyPlaying.artist}</p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 w-1/3 max-w-[500px]">
        <div className="flex items-center gap-6">
          <button className="text-muted-foreground hover:text-foreground transition"><SkipBack className="w-5 h-5 fill-current" /></button>
          <button 
            className="w-10 h-10 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:scale-105 transition"
            onClick={togglePlay}
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
          </button>
          <button className="text-muted-foreground hover:text-foreground transition"><SkipForward className="w-5 h-5 fill-current" /></button>
        </div>
        <div className="w-full flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground w-8 text-right font-mono">0:00</span>
          <Slider 
            value={[progress]} 
            max={100} 
            step={0.1} 
            className="w-full" 
            onValueChange={(val) => setProgress(val[0])}
          />
          <span className="text-[10px] text-muted-foreground w-8 font-mono">-0:00</span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-4 w-1/3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 border border-border px-2 py-1 rounded">
          Lecture simulée — sans audio
        </div>
        <Volume2 className="w-5 h-5 text-muted-foreground" />
        <Slider defaultValue={[75]} max={100} step={1} className="w-24" />
      </div>
    </div>
  );
}
