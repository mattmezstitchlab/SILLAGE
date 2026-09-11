import { useSillage } from '@/lib/store';
import { TrackRow } from '@/components/TrackRow';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Library() {
  const { library, playlists, setPlaying } = useSillage();
  
  const featuredPlaylist = playlists[0];
  const recentTracks = library.slice(0, 10);
  const djPicks = library.filter(t => (t.energy ?? 0) > 7).slice(0, 6);

  return (
    <div className="p-8 pb-32">
      <h1 className="text-4xl font-serif mb-8 text-gradient">Découverte</h1>
      
      {featuredPlaylist && (
        <section className="mb-12 relative rounded-xl overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-10" />
          <img 
            src={featuredPlaylist.cover} 
            alt={featuredPlaylist.name} 
            className="w-full h-80 object-cover group-hover:scale-105 transition-transform duration-1000 ease-out" 
          />
          <div className="absolute bottom-0 left-0 p-8 z-20 w-full flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-primary mb-2">Sélection du jour</p>
              <h2 className="text-3xl font-serif text-foreground mb-2">{featuredPlaylist.name}</h2>
              <p className="text-foreground/70 max-w-lg">{featuredPlaylist.description}</p>
            </div>
            <Button 
              size="lg" 
              className="rounded-full w-14 h-14 p-0 shadow-lg shadow-black/50"
              onClick={() => {
                if (featuredPlaylist.tracks.length > 0) {
                  setPlaying(featuredPlaylist.tracks[0]);
                }
              }}
            >
              <Play className="w-6 h-6 fill-current ml-1" />
            </Button>
          </div>
        </section>
      )}
      {!featuredPlaylist && (
        <section className="mb-10 rounded-xl border border-dashed border-border p-8 text-center">
          <h2 className="font-serif text-2xl text-foreground mb-2">Votre espace commence ici</h2>
          <p className="text-muted-foreground">Aucun contenu n’est prérempli : ajoutez vos propres morceaux ou des aperçus autorisés.</p>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section className="lg:col-span-2">
          <h3 className="text-xl font-serif mb-4 flex items-center justify-between">
            Ajouts récents
            <span className="text-xs font-sans text-muted-foreground tracking-widest uppercase cursor-pointer hover:text-foreground">Tout voir</span>
          </h3>
          <div className="space-y-1">
            {recentTracks.map((track, i) => (
              <TrackRow key={track.id} track={track} index={i} />
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-xl font-serif mb-4">Pépites Dancefloor</h3>
          <div className="grid grid-cols-2 gap-4">
            {djPicks.map(track => (
              <div 
                key={track.id} 
                className="group relative rounded-lg overflow-hidden cursor-pointer"
                onClick={() => setPlaying(track)}
              >
                <img src={track.cover} className="w-full aspect-square object-cover transition-transform duration-500 group-hover:scale-110" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                  <Play className="w-8 h-8 text-foreground mb-2" />
                  <p className="text-sm font-medium text-foreground truncate">{track.title}</p>
                  <p className="text-xs text-foreground/70 truncate">{track.artist}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
