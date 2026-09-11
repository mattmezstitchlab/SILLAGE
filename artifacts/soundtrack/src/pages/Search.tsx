import { useState, useMemo } from 'react';
import { useSillage } from '@/lib/store';
import { TrackRow } from '@/components/TrackRow';
import { Input } from '@/components/ui/input';
import { Search as SearchIcon, SlidersHorizontal } from 'lucide-react';
import { MARIAGE_UNIVERSEL_CATEGORIES } from '@/lib/data';

export default function Search() {
  const { library } = useSillage();
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const results = useMemo(() => {
    let filtered = library;
    
    if (selectedTag) {
      filtered = filtered.filter(t => t.momentTags.includes(selectedTag) || t.moods.includes(selectedTag));
    }
    
    if (query.trim().length > 0) {
      const q = query.toLowerCase();
      filtered = filtered.filter(t => 
        t.title.toLowerCase().includes(q) || 
        t.artist.toLowerCase().includes(q) || 
        t.genre.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
      );
    }
    
    return filtered;
  }, [library, query, selectedTag]);

  return (
    <div className="p-8 pb-32 max-w-5xl mx-auto">
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl pt-4 pb-6 mb-4 -mx-8 px-8 border-b border-border">
        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un titre, un artiste, un genre..."
            className="w-full pl-12 h-14 bg-white/5 border-white/10 text-lg rounded-xl focus-visible:ring-1 focus-visible:ring-white/20"
          />
        </div>
        
        <div className="flex items-center gap-2 mt-4 overflow-x-auto no-scrollbar pb-2">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground shrink-0 mr-2" />
          {MARIAGE_UNIVERSEL_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedTag(prev => prev === cat ? null : cat)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs transition-colors border ${
                selectedTag === cat 
                  ? 'bg-primary text-primary-foreground border-primary' 
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        {results.length > 0 ? (
          results.map(track => (
            <TrackRow key={track.id} track={track} />
          ))
        ) : (
          <div className="text-center py-20">
            <p className="text-muted-foreground">Aucun résultat trouvé pour "{query}"</p>
          </div>
        )}
      </div>
    </div>
  );
}
