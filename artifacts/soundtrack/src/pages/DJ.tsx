import { ArrowRightLeft, RadioReceiver } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSillage } from '@/lib/store';
import { Button } from '@/components/ui/button';

export default function DJView() {
  const { playlists, setPlaying } = useSillage();
  const set = playlists.find((playlist) => playlist.type === 'dj-set');
  const tracks = set?.tracks.filter((track) => track.source === 'upload' && track.streamUrl) || [];
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState('');
  const [mixing, setMixing] = useState(false);
  const deckA = useRef<HTMLAudioElement>(null);
  const deckB = useRef<HTMLAudioElement>(null);
  const frame = useRef<number | null>(null);
  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    [deckA.current, deckB.current].forEach((deck) => { if (deck) { deck.pause(); deck.removeAttribute('src'); deck.load(); } });
    setMixing(false);
  };
  useEffect(() => () => stop(), []);
  if (!set || tracks.length < 2) return <div className="p-8 max-w-xl text-muted-foreground">Le fondu réel est disponible uniquement avec deux fichiers audio privés dans un Set DJ. Les aperçus catalogue ne sont jamais mixés.</div>;
  const current = tracks[index % tracks.length];
  const next = tracks[(index + 1) % tracks.length];
  const crossfade = async () => {
    if (mixing || !deckA.current || !deckB.current) return;
    const one = deckA.current; const two = deckB.current;
    try {
      setPlaying(null, false); // global player cannot overlap the two decks
      setMixing(true); one.src = current.streamUrl!; two.src = next.streamUrl!; one.volume = 1; two.volume = 0;
      await Promise.all([one.play(), two.play()]);
      setStatus('Fondu en cours…');
      const started = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - started) / 5000);
        one.volume = 1 - progress; two.volume = progress;
        if (progress < 1) frame.current = requestAnimationFrame(tick);
        else { one.pause(); two.pause(); frame.current = null; setMixing(false); setIndex((value) => (value + 1) % tracks.length); setStatus('Fondu terminé : les deux decks sont arrêtés.'); }
      };
      frame.current = requestAnimationFrame(tick);
    } catch { stop(); setStatus('Impossible de démarrer les deux sources audio privées.'); }
  };
  return <div className="p-8 max-w-4xl mx-auto"><audio ref={deckA}/><audio ref={deckB}/><h1 className="text-4xl font-serif text-foreground flex items-center gap-3 mb-2"><RadioReceiver className="text-primary"/>Vue DJ</h1><p className="text-muted-foreground mb-8">Fondu de volume réel de 5 secondes, sans beatmatching ni analyse prétendue.</p><div className="grid md:grid-cols-2 gap-5">{[current,next].map((track, position)=><article key={track.id} className="bg-card border border-border p-6 rounded-xl"><p className="text-primary text-xs uppercase mb-4">Deck {position ? 'B' : 'A'}</p><h2 className="font-serif text-2xl text-foreground">{track.title}</h2><p className="text-muted-foreground">{track.artist}</p><p className="text-sm mt-6 text-muted-foreground">BPM : {track.bpm ?? 'inconnu'} · Tonalité : {track.key ?? 'inconnue'}</p></article>)}</div><Button className="mt-7" onClick={() => void crossfade()} disabled={mixing}><ArrowRightLeft className="w-4 h-4 mr-2"/>{mixing ? 'Fondu en cours…' : 'Lancer le fondu réel'}</Button>{status && <p className="text-sm text-primary mt-3">{status}</p>}</div>;
}