import { useSillage } from '@/lib/store';
import { ArrowRightLeft, RadioReceiver, Zap, Music } from 'lucide-react';
import { useState } from 'react';

export default function DJView() {
  const { playlists, currentlyPlaying, setPlaying } = useSillage();
  
  // Pick the DJ set playlist for the demo
  const djSet = playlists.find(p => p.type === 'dj-set') || playlists[0];
  const tracks = djSet?.tracks || [];
  
  const currentIdx = tracks.findIndex(t => t.id === currentlyPlaying?.id);
  const isPlayingFromSet = currentIdx !== -1;
  
  const currentTrack = isPlayingFromSet ? tracks[currentIdx] : tracks[0];
  const nextTrack = isPlayingFromSet && currentIdx < tracks.length - 1 ? tracks[currentIdx + 1] : tracks[1] || tracks[0];

  const [transitionIntent, setTransitionIntent] = useState('seamless');

  if (!djSet || tracks.length < 2) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Créez un Set DJ avec au moins 2 titres pour tester la vue.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-8 max-w-6xl mx-auto overflow-hidden">
      <div className="flex items-center justify-between mb-8 shrink-0">
        <div>
          <h1 className="text-4xl font-serif text-white flex items-center gap-3">
            <RadioReceiver className="w-8 h-8 text-primary" />
            Simulateur de Transition
          </h1>
          <p className="text-muted-foreground mt-2">Analysez la compatibilité harmonique et rythmique entre deux morceaux.</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-8 min-h-0">
        {/* Current Track */}
        <div className="flex-1 bg-card border border-border rounded-2xl p-8 flex flex-col justify-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full" />
          <p className="text-xs uppercase tracking-widest text-primary mb-6">En lecture</p>
          <img src={currentTrack.cover} className="w-48 h-48 rounded-xl object-cover shadow-2xl mb-6" />
          <h2 className="text-3xl font-serif text-white mb-2 truncate">{currentTrack.title}</h2>
          <p className="text-lg text-muted-foreground mb-8">{currentTrack.artist}</p>
          
          <div className="grid grid-cols-3 gap-4 border-t border-border pt-6 mt-auto">
            <div>
              <p className="text-xs text-muted-foreground uppercase">BPM</p>
              <p className="text-xl font-mono text-white">{currentTrack.bpm}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Key</p>
              <p className="text-xl font-mono text-white">{currentTrack.key}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Energy</p>
              <p className="text-xl font-mono text-white flex items-center gap-1">
                {currentTrack.energy} <Zap className="w-4 h-4 text-primary" />
              </p>
            </div>
          </div>
        </div>

        {/* Transition Simulator */}
        <div className="w-full md:w-64 shrink-0 flex flex-col justify-center items-center py-8">
          <div className="w-full space-y-4">
            <div className="bg-background border border-border rounded-xl p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase mb-2">Delta BPM</p>
              <p className={`text-xl font-mono ${Math.abs(currentTrack.bpm - nextTrack.bpm) > 5 ? 'text-destructive' : 'text-primary'}`}>
                {Math.abs(currentTrack.bpm - nextTrack.bpm)}
              </p>
            </div>
            
            <div className="bg-background border border-border rounded-xl p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase mb-2">Intentions</p>
              <div className="space-y-2">
                {['seamless', 'drop', 'cut'].map(intent => (
                  <button
                    key={intent}
                    onClick={() => setTransitionIntent(intent)}
                    className={`w-full text-xs py-2 rounded border ${
                      transitionIntent === intent 
                        ? 'bg-primary text-primary-foreground border-primary' 
                        : 'border-border text-muted-foreground hover:border-muted-foreground'
                    }`}
                  >
                    {intent === 'seamless' ? 'Fondu Enchaîné' : intent === 'drop' ? 'Sur le Drop' : 'Cut Brut'}
                  </button>
                ))}
              </div>
            </div>

            <button 
              className="w-full py-4 bg-white text-black rounded-xl font-medium hover:bg-white/90 transition-colors flex items-center justify-center gap-2"
              onClick={() => setPlaying(nextTrack)}
            >
              Simuler <ArrowRightLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Next Track */}
        <div className="flex-1 bg-card/50 border border-border rounded-2xl p-8 flex flex-col justify-center relative overflow-hidden">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-6">À suivre</p>
          <img src={nextTrack.cover} className="w-40 h-40 rounded-xl object-cover shadow-2xl mb-6 opacity-70 grayscale-[30%]" />
          <h2 className="text-2xl font-serif text-white mb-2 truncate">{nextTrack.title}</h2>
          <p className="text-base text-muted-foreground mb-8">{nextTrack.artist}</p>
          
          <div className="grid grid-cols-3 gap-4 border-t border-border pt-6 mt-auto">
            <div>
              <p className="text-xs text-muted-foreground uppercase">BPM</p>
              <p className="text-xl font-mono text-white">{nextTrack.bpm}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Key</p>
              <p className="text-xl font-mono text-white">{nextTrack.key}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Energy</p>
              <p className="text-xl font-mono text-white flex items-center gap-1">
                {nextTrack.energy} <Zap className="w-4 h-4 text-muted-foreground" />
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
