import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Player } from './Player';
import { useSillage } from '@/lib/store';
import { generateAmbientColorStyle } from '@/lib/utils';

export function Layout({ children }: { children: ReactNode }) {
  const { currentlyPlaying } = useSillage();
  
  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {currentlyPlaying?.colorHue && (
          <div 
            className="absolute inset-0 pointer-events-none opacity-30 transition-all duration-1000 ease-out z-0"
            style={generateAmbientColorStyle(currentlyPlaying.colorHue, 0.15)}
          />
        )}
        
        <div className="flex-1 overflow-y-auto no-scrollbar z-10 relative">
          {children}
        </div>
        <Player />
      </main>
    </div>
  );
}
