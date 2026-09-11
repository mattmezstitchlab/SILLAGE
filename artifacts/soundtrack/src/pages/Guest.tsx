import { useState } from 'react';
import { useSillage } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Music, Heart } from 'lucide-react';
import { toast } from 'sonner';

export default function GuestView() {
  const { library, addProposal } = useSillage();
  const [query, setQuery] = useState('');
  const [selectedTrack, setSelectedTrack] = useState<any>(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const results = query.length > 1 
    ? library.filter(t => t.title.toLowerCase().includes(query.toLowerCase()) || t.artist.toLowerCase().includes(query.toLowerCase())).slice(0, 5)
    : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTrack || !name) return;
    
    addProposal({
      guestName: name,
      message,
      track: selectedTrack
    });
    
    setSubmitted(true);
    toast.success("Suggestion envoyée !");
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <Heart className="w-12 h-12 text-primary mb-4" />
        <h1 className="text-2xl font-serif mb-2">Merci pour votre suggestion !</h1>
        <p className="text-muted-foreground mb-8">Les futurs mariés l'écouteront avec attention.</p>
        <Button variant="outline" onClick={() => { setSubmitted(false); setSelectedTrack(null); setQuery(''); }}>
          Proposer un autre titre
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center p-6 sm:p-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-serif text-white mb-2">Alice & Thomas</h1>
          <p className="text-muted-foreground">Quelle chanson vous ferait vibrer le jour J ?</p>
        </div>

        {!selectedTrack ? (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un titre ou un artiste..."
                className="pl-10 h-14 text-lg bg-card border-border"
              />
            </div>
            
            {results.length > 0 && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                {results.map((track, i) => (
                  <div 
                    key={track.id} 
                    className={`flex items-center gap-4 p-3 hover:bg-white/5 cursor-pointer ${i !== results.length - 1 ? 'border-b border-border' : ''}`}
                    onClick={() => setSelectedTrack(track)}
                  >
                    <img src={track.cover} className="w-10 h-10 rounded object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{track.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-card border border-border p-4 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-4">
                <img src={selectedTrack.cover} className="w-12 h-12 rounded object-cover" />
                <div>
                  <p className="text-sm font-medium text-white">{selectedTrack.title}</p>
                  <p className="text-xs text-muted-foreground">{selectedTrack.artist}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" type="button" onClick={() => setSelectedTrack(null)}>
                Changer
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Votre nom</label>
                <Input required value={name} onChange={e => setName(e.target.value)} className="bg-card" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Un petit mot ? (optionnel)</label>
                <textarea 
                  className="w-full bg-card border border-border rounded-md p-3 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-ring"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Pour l'ouverture du bal, pour le cocktail..."
                />
              </div>
            </div>

            <Button type="submit" className="w-full h-12 text-lg">
              Envoyer la suggestion
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
