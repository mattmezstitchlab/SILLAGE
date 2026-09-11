import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { GlobalState, Track, Playlist, Folder, Moment, Proposal } from './types';
import { MOCK_LIBRARY, MOCK_TIMELINE, MOCK_PLAYLISTS, MOCK_FOLDERS, MOCK_PROPOSALS } from './data';

type SillageContextType = GlobalState & {
  setPlaying: (track: Track | null, isPlaying?: boolean) => void;
  togglePlay: () => void;
  createPlaylist: (name: string, description: string, type: 'collection' | 'dj-set') => void;
  deletePlaylist: (id: string) => void;
  updatePlaylist: (id: string, updates: Partial<Playlist>) => void;
  addTrackToPlaylist: (playlistId: string, track: Track) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  reorderPlaylist: (playlistId: string, startIndex: number, endIndex: number) => void;
  createFolder: (name: string) => void;
  deleteFolder: (id: string) => void;
  updateMoment: (id: string, updates: Partial<Moment>) => void;
  addTrackToMoment: (momentId: string, track: Track) => void;
  removeTrackFromMoment: (momentId: string, trackId: string) => void;
  addProposal: (proposal: Omit<Proposal, 'id' | 'status' | 'votes'>) => void;
  updateProposalStatus: (id: string, status: Proposal['status']) => void;
};

const defaultContext: SillageContextType = {
  library: MOCK_LIBRARY,
  playlists: MOCK_PLAYLISTS,
  folders: MOCK_FOLDERS,
  timeline: MOCK_TIMELINE,
  proposals: MOCK_PROPOSALS,
  currentlyPlaying: null,
  isPlaying: false,
  setPlaying: () => {},
  togglePlay: () => {},
  createPlaylist: () => {},
  deletePlaylist: () => {},
  updatePlaylist: () => {},
  addTrackToPlaylist: () => {},
  removeTrackFromPlaylist: () => {},
  reorderPlaylist: () => {},
  createFolder: () => {},
  deleteFolder: () => {},
  updateMoment: () => {},
  addTrackToMoment: () => {},
  removeTrackFromMoment: () => {},
  addProposal: () => {},
  updateProposalStatus: () => {},
};

const SillageContext = createContext<SillageContextType>(defaultContext);

export function useSillage() {
  return useContext(SillageContext);
}

export function SillageProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GlobalState>(() => {
    const saved = localStorage.getItem('sillage_state');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse state", e);
      }
    }
    return {
      library: MOCK_LIBRARY,
      playlists: MOCK_PLAYLISTS,
      folders: MOCK_FOLDERS,
      timeline: MOCK_TIMELINE,
      proposals: MOCK_PROPOSALS,
      currentlyPlaying: null,
      isPlaying: false,
    };
  });

  useEffect(() => {
    localStorage.setItem('sillage_state', JSON.stringify(state));
  }, [state]);

  const updateState = (updates: Partial<GlobalState> | ((prev: GlobalState) => Partial<GlobalState>)) => {
    setState((prev) => {
      const next = typeof updates === 'function' ? updates(prev) : updates;
      return { ...prev, ...next };
    });
  };

  const setPlaying = (track: Track | null, isPlaying = true) => {
    updateState({ currentlyPlaying: track, isPlaying: !!track && isPlaying });
  };

  const togglePlay = () => {
    updateState(prev => ({ isPlaying: !prev.isPlaying }));
  };

  const createPlaylist = (name: string, description: string, type: 'collection' | 'dj-set') => {
    const newPlaylist: Playlist = {
      id: `p_${Date.now()}`,
      name,
      description,
      type,
      tracks: []
    };
    updateState(prev => ({ playlists: [...prev.playlists, newPlaylist] }));
  };

  const deletePlaylist = (id: string) => {
    updateState(prev => ({
      playlists: prev.playlists.filter(p => p.id !== id),
      folders: prev.folders.map(f => ({
        ...f,
        playlistIds: f.playlistIds.filter(pid => pid !== id)
      }))
    }));
  };

  const updatePlaylist = (id: string, updates: Partial<Playlist>) => {
    updateState(prev => ({
      playlists: prev.playlists.map(p => p.id === id ? { ...p, ...updates } : p)
    }));
  };

  const addTrackToPlaylist = (playlistId: string, track: Track) => {
    updateState(prev => ({
      playlists: prev.playlists.map(p => {
        if (p.id === playlistId && !p.tracks.find(t => t.id === track.id)) {
          return { ...p, tracks: [...p.tracks, track] };
        }
        return p;
      })
    }));
  };

  const removeTrackFromPlaylist = (playlistId: string, trackId: string) => {
    updateState(prev => ({
      playlists: prev.playlists.map(p => {
        if (p.id === playlistId) {
          return { ...p, tracks: p.tracks.filter(t => t.id !== trackId) };
        }
        return p;
      })
    }));
  };

  const reorderPlaylist = (playlistId: string, startIndex: number, endIndex: number) => {
    updateState(prev => ({
      playlists: prev.playlists.map(p => {
        if (p.id === playlistId) {
          const result = Array.from(p.tracks);
          const [removed] = result.splice(startIndex, 1);
          result.splice(endIndex, 0, removed);
          return { ...p, tracks: result };
        }
        return p;
      })
    }));
  };

  const createFolder = (name: string) => {
    const newFolder: Folder = { id: `f_${Date.now()}`, name, playlistIds: [] };
    updateState(prev => ({ folders: [...prev.folders, newFolder] }));
  };

  const deleteFolder = (id: string) => {
    updateState(prev => ({ folders: prev.folders.filter(f => f.id !== id) }));
  };

  const updateMoment = (id: string, updates: Partial<Moment>) => {
    updateState(prev => ({
      timeline: prev.timeline.map(m => m.id === id ? { ...m, ...updates } : m)
    }));
  };

  const addTrackToMoment = (momentId: string, track: Track) => {
    updateState(prev => ({
      timeline: prev.timeline.map(m => {
        if (m.id === momentId && !m.tracks.find(t => t.id === track.id)) {
          return { ...m, tracks: [...m.tracks, track] };
        }
        return m;
      })
    }));
  };

  const removeTrackFromMoment = (momentId: string, trackId: string) => {
    updateState(prev => ({
      timeline: prev.timeline.map(m => {
        if (m.id === momentId) {
          return { ...m, tracks: m.tracks.filter(t => t.id !== trackId) };
        }
        return m;
      })
    }));
  };

  const addProposal = (proposal: Omit<Proposal, 'id' | 'status' | 'votes'>) => {
    const newProposal: Proposal = {
      ...proposal,
      id: `prop_${Date.now()}`,
      status: 'proposed',
      votes: 1
    };
    updateState(prev => ({ proposals: [...prev.proposals, newProposal] }));
  };

  const updateProposalStatus = (id: string, status: Proposal['status']) => {
    updateState(prev => ({
      proposals: prev.proposals.map(p => p.id === id ? { ...p, status } : p)
    }));
  };

  return (
    <SillageContext.Provider value={{
      ...state,
      setPlaying,
      togglePlay,
      createPlaylist,
      deletePlaylist,
      updatePlaylist,
      addTrackToPlaylist,
      removeTrackFromPlaylist,
      reorderPlaylist,
      createFolder,
      deleteFolder,
      updateMoment,
      addTrackToMoment,
      removeTrackFromMoment,
      addProposal,
      updateProposalStatus,
    }}>
      {children}
    </SillageContext.Provider>
  );
}
