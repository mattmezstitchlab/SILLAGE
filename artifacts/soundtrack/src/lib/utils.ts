import { format } from 'date-fns';
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function generateAmbientColorStyle(hue: number = 0, opacity: number = 0.15) {
  return {
    background: `radial-gradient(circle at 50% 0%, hsla(${hue}, 60%, 50%, ${opacity}) 0%, transparent 70%)`
  };
}

export function computeDNA(tracks: import('./types').Track[]) {
  if (!tracks.length) return { energy: 0, bpmAvg: 0, topGenres: [] as string[] };
  
  const knownEnergy = tracks.map((t) => t.energy).filter((value): value is number => value != null);
  const knownBpm = tracks.map((t) => t.bpm).filter((value): value is number => value != null);
  
  const genres = tracks.reduce((acc, t) => {
    if (t.genre) acc[t.genre] = (acc[t.genre] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const topGenres = Object.entries(genres)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(g => g[0]);
    
  return {
    energy: knownEnergy.length ? Math.round(knownEnergy.reduce((a, n) => a + n, 0) / knownEnergy.length) : 0,
    bpmAvg: knownBpm.length ? Math.round(knownBpm.reduce((a, n) => a + n, 0) / knownBpm.length) : 0,
    topGenres
  };
}
