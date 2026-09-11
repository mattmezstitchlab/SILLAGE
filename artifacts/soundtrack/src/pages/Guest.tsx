import { useEffect, useState } from 'react';
import { useRoute } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Heart, Search, ThumbsUp } from 'lucide-react';
import type { Proposal, Track } from '@/lib/types';
import { toast } from 'sonner';
import { useThemeEngine, ThemeSurface, defaultTheme } from '@/lib/theme';
import { EventTheme } from '@workspace/api-client-react';

const call = async (path:string, init?:RequestInit) => { const r=await fetch(`/api${path}`,{credentials:'include',headers:{'Content-Type':'application/json'},...init});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||'Erreur réseau.');return b; };
export default function GuestView() {
  const [,params]=useRoute('/guest/:token'); const token=params?.token; const [event,setEvent]=useState<{name:string;proposals:Proposal[]}|null>(null); const [query,setQuery]=useState(''); const [results,setResults]=useState<Track[]>([]); const [selected,setSelected]=useState<Track|null>(null); const [name,setName]=useState(''); const [message,setMessage]=useState(''); const [error,setError]=useState<string|null>(null); const [sent,setSent]=useState(false);
  const [theme, setTheme] = useState<EventTheme | null>(null);

  const load=async()=>{
    if(!token)return;
    try{
      const [eventData, themeData] = await Promise.all([
        call(`/guest/${token}`),
        call(`/guest/${token}/theme`).catch(() => defaultTheme)
      ]);
      setEvent(eventData);
      setTheme(themeData);
      setError(null);
    }catch(e){
      setError(e instanceof Error?e.message:'Lien invalide.');
      setTheme(null);
    }
  };
  
  const guestTheme = theme ? { ...theme, imageUrl: theme.guestImageConsent ? theme.imageUrl : null } : null;

  useThemeEngine(guestTheme);

  useEffect(()=>{void load();const poll=window.setInterval(()=>void load(),15_000);return()=>clearInterval(poll);},[token]);
  useEffect(()=>{const timer=window.setTimeout(async()=>{if(!token||query.trim().length<2){setResults([]);return;}try{const d=await call(`/guest/${token}/catalogue?q=${encodeURIComponent(query)}`);setResults(d.results);}catch(e){toast.error(e instanceof Error?e.message:'Recherche impossible');}},350);return()=>clearTimeout(timer);},[query,token]);
  const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!token||!selected)return;try{const catalogueId=Number(selected.id?.replace('itunes:',''));if(!Number.isInteger(catalogueId))throw new Error('Ce titre doit provenir du catalogue.');await call(`/guest/${token}/proposals`,{method:'POST',body:JSON.stringify({guestName:name,message,catalogueId})});setSent(true);setSelected(null);setQuery('');await load();}catch(e){toast.error(e instanceof Error?e.message:'Envoi impossible');}};
  const vote=async(id:string)=>{if(!token)return;try{await call(`/guest/${token}/proposals/${id}/vote`,{method:'POST'});await load();}catch(e){toast.error(e instanceof Error?e.message:'Vote impossible');}};
  
  if(error)return <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6 text-center"><div><h1 className="font-serif text-3xl text-foreground mb-3">Lien indisponible</h1><p className="text-muted-foreground">{error}</p></div></div>;
  
  return (
    <>
      <ThemeSurface theme={guestTheme} />
      <div className="min-h-screen bg-background/50 flex flex-col items-center p-6 sm:p-12">
        <div className="w-full max-w-md relative z-10">
          <div className="text-center mb-8 glass-panel p-6 rounded-2xl shadow-xl">
            <p className="text-primary tracking-[.25em] text-xs mb-3">SILLAGE</p>
            <h1 className="text-3xl font-serif text-foreground mb-2">{event?.name||'Chargement…'}</h1>
            <p className="text-muted-foreground">Quelle chanson vous ferait vibrer le jour J ?</p>
          </div>
          
          {sent&&<div className="p-3 bg-primary/10 border border-primary/30 rounded mb-5 text-sm text-primary flex gap-2"><Heart className="w-4 h-4"/>Suggestion envoyée — merci !</div>} 
          
          {!selected?<>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground"/>
              <Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Titre ou artiste…" className="pl-10 h-14 text-lg bg-card/90 backdrop-blur border-border"/>
            </div>
            <p className="text-xs text-muted-foreground my-3">Aperçus fournis par iTunes Store.</p>
            <div className="space-y-2">
              {results.map((track,i)=><button type="button" key={`${track.title}-${i}`} className="w-full flex text-left items-center gap-3 p-3 border border-border/50 rounded-xl bg-card/80 backdrop-blur hover:bg-card/100 transition-colors" onClick={()=>setSelected(track)}><img src={track.cover} className="w-10 h-10 rounded object-cover" alt=""/><span className="flex-1"><b className="block text-sm text-foreground">{track.title}</b><span className="text-xs text-muted-foreground">{track.artist}</span></span></button>)}
            </div>
          </>:
          <form onSubmit={submit} className="space-y-4">
            <div className="bg-card/90 backdrop-blur border border-border p-4 rounded-xl flex justify-between">
              <div>
                <p className="text-foreground text-sm font-medium">{selected.title}</p>
                <p className="text-muted-foreground text-xs">{selected.artist}</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={()=>setSelected(null)}>Changer</Button>
            </div>
            <Input required value={name} onChange={e=>setName(e.target.value)} placeholder="Votre nom" className="bg-card/90 backdrop-blur"/>
            <textarea value={message} onChange={e=>setMessage(e.target.value)} maxLength={500} placeholder="Un petit mot ? (facultatif)" className="w-full bg-card/90 backdrop-blur border border-border rounded-md p-3 text-sm min-h-[100px]"/>
            <Button type="submit" className="w-full shadow-lg">Envoyer la suggestion</Button>
          </form>
          }
          
          <section className="mt-10">
            <h2 className="font-serif text-xl text-foreground mb-3 px-1">Suggestions</h2>
            <div className="space-y-2">
              {event?.proposals.map(p=><div className="border border-border/50 bg-card/80 backdrop-blur rounded-lg p-4" key={p.id}><p className="text-sm font-medium text-foreground">{p.track.title} <span className="text-muted-foreground font-normal">— {p.track.artist}</span></p><p className="text-xs text-muted-foreground mt-1">par {p.guestName} · {p.status==='approved'?'acceptée':p.status==='rejected'?'non retenue':'en attente'}</p>{p.status==='proposed'&&<Button variant="outline" size="sm" className="mt-3 w-full bg-background/50" onClick={()=>void vote(p.id)}><ThumbsUp className="w-3 h-3 mr-2"/>Voter ({p.votes})</Button>}</div>)}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}