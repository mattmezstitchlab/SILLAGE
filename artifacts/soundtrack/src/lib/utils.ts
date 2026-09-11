import { format } from 'date-fns';
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function generateAmbientColorStyle(hue: number = 0, opacity: number = 0.15) {
  return {
    background: `radial-gradient(circle at 50% 0%, hsla(${hue}, 60%, 50%, ${opacity}) 0%, transparent 70%)`
  };
}

export function computeDNA(tracks: import('./types').Track[]) {
  if (!tracks.length) return { energy: 0, bpmAvg: 0, topGenres: [] as string[] };
  
  const totalEnergy = tracks.reduce((acc, t) => acc + t.energy, 0);
  const totalBPM = tracks.reduce((acc, t) => acc + t.bpm, 0);
  
  const genres = tracks.reduce((acc, t) => {
    acc[t.genre] = (acc[t.genre] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const topGenres = Object.entries(genres)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(g => g[0]);
    
  return {
    energy: Math.round(totalEnergy / tracks.length),
    bpmAvg: Math.round(totalBPM / tracks.length),
    topGenres
  };
}
