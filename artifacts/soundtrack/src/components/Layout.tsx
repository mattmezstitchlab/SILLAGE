import { ReactNode, useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Sidebar } from './Sidebar';
import { Player } from './Player';
import { useSillage } from '@/lib/store';
import { generateAmbientColorStyle } from '@/lib/utils';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Layout({ children }: { children: ReactNode }) {
  const { currentlyPlaying } = useSillage();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMobileMenuOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);
  
  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar with responsive sliding */}
      <div className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar />
      </div>
      
      <main className="flex-1 flex flex-col relative overflow-hidden min-w-0">
        {/* Mobile Header for Menu Toggle */}
        <div className="md:hidden flex items-center p-4 border-b border-border bg-background/95 backdrop-blur z-20">
          <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(true)} className="-ml-2 mr-2">
            <Menu className="w-5 h-5" />
          </Button>
          <span className="font-serif font-semibold tracking-widest text-primary">SILLAGE</span>
        </div>

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
