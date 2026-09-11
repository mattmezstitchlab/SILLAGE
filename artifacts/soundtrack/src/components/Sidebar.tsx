import { Link, useLocation } from 'wouter';
import { 
  Library, Search, Clock, ListMusic, Users, Radio,
  Plus, MoreHorizontal, FolderPlus, Disc3, Mic2, Home
} from 'lucide-react';
import { useSillage } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

export function Sidebar() {
  const [location] = useLocation();
  const { playlists, folders, createPlaylist, createFolder } = useSillage();
  
  const [playlistName, setPlaylistName] = useState('');
  const [playlistType, setPlaylistType] = useState<'collection' | 'dj-set'>('collection');
  const [playlistOpen, setPlaylistOpen] = useState(false);

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (playlistName.trim()) {
      createPlaylist(playlistName, '', playlistType);
      setPlaylistName('');
      setPlaylistOpen(false);
    }
  };

  const handleCreateFolder = () => {
    const name = window.prompt("Nom du dossier :");
    if (name) {
      createFolder(name);
    }
  };

  const navItems = [
    { href: '/', icon: Home, label: 'Découverte' },
    { href: '/search', icon: Search, label: 'Recherche' },
    { href: '/timeline', icon: Clock, label: 'Chronologie' },
    { href: '/dj', icon: Disc3, label: 'Vue DJ' },
    { href: '/collaborate', icon: Users, label: 'Collaboratif' },
    { href: '/guest', icon: Mic2, label: 'Vue Invité' },
  ];

  return (
    <div className="w-64 bg-sidebar border-r border-sidebar-border h-full flex flex-col font-sans">
      <div className="p-6">
        <h1 className="font-serif text-2xl tracking-widest text-primary font-semibold mb-1">SILLAGE</h1>
        <p className="text-xs text-muted-foreground uppercase tracking-[0.2em]">OS Musical</p>
      </div>

      <ScrollArea className="flex-1 px-4">
        <div className="space-y-1 mb-8">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${location === item.href ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'}`}>
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}
        </div>

        <div className="mb-4 flex items-center justify-between px-3">
          <h2 className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">Bibliothèque</h2>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-sidebar-foreground/50 hover:text-sidebar-foreground" onClick={handleCreateFolder}>
              <FolderPlus className="w-3.5 h-3.5" />
            </Button>
            
            <Dialog open={playlistOpen} onOpenChange={setPlaylistOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-sidebar-foreground/50 hover:text-sidebar-foreground">
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px] bg-card border-border">
                <DialogHeader>
                  <DialogTitle className="text-white font-serif text-xl">Nouvelle Playlist</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreatePlaylist} className="space-y-6 pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Nom</label>
                    <Input 
                      value={playlistName} 
                      onChange={(e) => setPlaylistName(e.target.value)} 
                      placeholder="Ex: Cérémonie Laïque" 
                      className="bg-background border-border text-white" 
                      autoFocus
                    />
                  </div>
                  
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-white">Type</label>
                    <div className="flex gap-3">
                      <button 
                        type="button"
                        onClick={() => setPlaylistType('collection')}
                        className={`flex-1 p-3 rounded-lg border text-left transition-colors flex flex-col gap-1 ${playlistType === 'collection' ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border text-muted-foreground hover:border-muted-foreground'}`}
                      >
                        <ListMusic className="w-5 h-5 mb-1" />
                        <span className="font-medium text-sm text-foreground">Collection</span>
                        <span className="text-xs opacity-70">Sélection de titres, dossiers</span>
                      </button>
                      <button 
                        type="button"
                        onClick={() => setPlaylistType('dj-set')}
                        className={`flex-1 p-3 rounded-lg border text-left transition-colors flex flex-col gap-1 ${playlistType === 'dj-set' ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border text-muted-foreground hover:border-muted-foreground'}`}
                      >
                        <Radio className="w-5 h-5 mb-1" />
                        <span className="font-medium text-sm text-foreground">Set DJ</span>
                        <span className="text-xs opacity-70">Ordre strict, transitions, énergies</span>
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex justify-end gap-3">
                    <DialogClose asChild>
                      <Button variant="ghost" type="button">Annuler</Button>
                    </DialogClose>
                    <Button type="submit" disabled={!playlistName.trim()}>Créer</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            
          </div>
        </div>

        <div className="space-y-4">
          {folders.map(folder => (
            <div key={folder.id} className="space-y-1">
              <div className="px-3 text-sm font-medium text-sidebar-foreground/80 flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-sidebar-foreground/50" />
                {folder.name}
              </div>
              <div className="pl-5 space-y-1">
                {folder.playlistIds.map(pid => {
                  const pl = playlists.find(p => p.id === pid);
                  if (!pl) return null;
                  return (
                    <Link key={pl.id} href={`/playlist/${pl.id}`} className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${location === `/playlist/${pl.id}` ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/30'}`}>
                      {pl.type === 'dj-set' ? <Radio className="w-3.5 h-3.5" /> : <ListMusic className="w-3.5 h-3.5" />}
                      <span className="truncate">{pl.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          
          <div className="space-y-1">
            {playlists.filter(p => !folders.some(f => f.playlistIds.includes(p.id))).map(pl => (
              <Link key={pl.id} href={`/playlist/${pl.id}`} className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${location === `/playlist/${pl.id}` ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/30'}`}>
                {pl.type === 'dj-set' ? <Radio className="w-3.5 h-3.5" /> : <ListMusic className="w-3.5 h-3.5" />}
                <span className="truncate">{pl.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
