import { useEffect, useRef, useState } from 'react';
import { useSillage } from '@/lib/store';
import { TrackRow } from '@/components/TrackRow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search as SearchIcon, Upload } from 'lucide-react';
import type { Track } from '@/lib/types';
import { toast } from 'sonner';

const api = async (path: string, init?: RequestInit) => {
  const r = await fetch(`/api${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init });
  const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error || 'Erreur réseau.'); return b;
};
export default function Search() {
  const { library, activeEventId, refresh } = useSillage();
  const [query, setQuery] = useState(''); const [results, setResults] = useState<Track[]>([]); const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => { const timer=window.setTimeout(async()=>{ if(query.trim().length<2 || !activeEventId){setResults([]);return;} setBusy(true);try{const data=await api(`/events/${activeEventId}/catalogue?q=${encodeURIComponent(query)}`);setResults(data.results);}catch(e){toast.error(e instanceof Error?e.message:'Catalogue indisponible');}finally{setBusy(false);}},350);return()=>clearTimeout(timer);},[query,activeEventId]);
  const add = async (track: Track) => { if(!activeEventId)return; try{await api(`/events/${activeEventId}/tracks`,{method:'POST',body:JSON.stringify(track)});await refresh();toast.success('Titre ajouté à votre bibliothèque.');}catch(e){toast.error(e instanceof Error?e.message:'Ajout impossible');} };
  const upload = async (file: File) => {
    if(!activeEventId || !confirm('Je confirme détenir les droits nécessaires pour utiliser ce fichier audio.')) return;
    try {
      setBusy(true); const request=await api(`/events/${activeEventId}/uploads/request`,{method:'POST',body:JSON.stringify({name:file.name,size:file.size,contentType:file.type,rightsConfirmed:true})});
      const put=await fetch(request.uploadUrl,{method:'PUT',headers:{'Content-Type':file.type},body:file}); if(!put.ok) throw new Error('Envoi vers le stockage impossible.');
      const audio=document.createElement('audio'); const duration=await new Promise<number|null>((resolve)=>{audio.onloadedmetadata=()=>resolve(Number.isFinite(audio.duration)?audio.duration:null);audio.onerror=()=>resolve(null);audio.src=URL.createObjectURL(file);});
      URL.revokeObjectURL(audio.src);
      await api(`/events/${activeEventId}/uploads/finalize`,{method:'POST',body:JSON.stringify({title:file.name.replace(/\.[^.]+$/,''),artist:'Artiste à préciser',album:'',duration,source:'upload',intentId:request.intentId,objectPath:request.objectPath,size:file.size,contentType:file.type,rightsConfirmed:true})});
      await refresh();toast.success('Audio privé ajouté. Vous pouvez modifier son titre dans votre bibliothèque.');
    } catch(e) { toast.error(e instanceof Error?e.message:'Import impossible'); } finally {setBusy(false);if(fileInput.current)fileInput.current.value='';}
  };
  return <div className="p-8 pb-32 max-w-5xl mx-auto"><div className="mb-6 flex gap-3"><div className="relative flex-1"><SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground"/><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher dans le catalogue iTunes…" className="w-full pl-12 h-14 bg-foreground/5 border-border/50 text-lg rounded-xl"/></div><Button variant="outline" className="h-14" onClick={()=>fileInput.current?.click()} disabled={busy}><Upload className="w-4 h-4 mr-2"/>Importer un audio</Button><input ref={fileInput} className="hidden" type="file" accept="audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/x-wav,audio/ogg,audio/webm,audio/flac" onChange={e=>e.target.files?.[0]&&void upload(e.target.files[0])}/></div><p className="text-xs text-muted-foreground mb-6">Aperçus et liens d’achat fournis par iTunes Store. Les BPM, tonalités et énergies inconnus restent inconnus.</p>{query.length>=2&&<section className="mb-10"><h2 className="font-serif text-xl text-foreground mb-3">Catalogue {busy?'…':''}</h2>{results.map(t=><div key={t.id} className="flex items-center gap-3 border-b border-border py-2"><img className="w-10 h-10 rounded object-cover" src={t.cover || '/favicon.svg'} alt=""/><div className="flex-1 min-w-0"><p className="text-sm text-foreground truncate">{t.title}</p><p className="text-xs text-muted-foreground">{t.artist}</p></div>{t.storeUrl&&<a className="text-xs text-primary" href={t.storeUrl} target="_blank" rel="noreferrer">iTunes</a>}<Button size="sm" onClick={()=>void add(t)}>Ajouter</Button></div>)}</section>}<section><h2 className="font-serif text-xl text-foreground mb-3">Votre bibliothèque</h2>{library.length?library.map(t=><TrackRow key={t.id} track={t}/>):<p className="text-muted-foreground py-12 text-center border border-dashed border-border rounded-xl">Votre bibliothèque est vide. Cherchez un aperçu autorisé ou importez un audio dont vous détenez les droits.</p>}</section></div>;
}