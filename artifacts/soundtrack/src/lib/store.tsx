import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Folder, GlobalState, Moment, Playlist, Proposal, Track } from './types';
import { toast } from 'sonner';

type EventInfo = { id: string; name: string; date?: string | null; revision: number };
type SillageContextType = GlobalState & {
  events: EventInfo[]; activeEventId: string | null; loading: boolean; error: string | null;
  refresh: () => Promise<void>; createEvent: (name: string) => Promise<void>;
  importPrototype: () => Promise<void>;
  setPlaying: (track: Track | null, isPlaying?: boolean) => void; togglePlay: () => void;
  createPlaylist: (name: string, description: string, type: 'collection' | 'dj-set') => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>; updatePlaylist: (id: string, updates: Partial<Playlist>) => Promise<void>;
  addTrackToPlaylist: (playlistId: string, track: Track) => Promise<void>; removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  reorderPlaylist: (playlistId: string, startIndex: number, endIndex: number) => Promise<void>;
  createFolder: (name: string) => Promise<void>; deleteFolder: (id: string) => Promise<void>;
  createMoment: (moment: Pick<Moment, 'title' | 'time' | 'duration' | 'expectedEnergy' | 'notes'>) => Promise<void>; deleteMoment: (id: string) => Promise<void>; updateMoment: (id: string, updates: Partial<Moment>) => Promise<void>;
  updateTrackMetadata: (id: string, values: Pick<Track, 'title' | 'artist' | 'album'>) => Promise<void>;
  addTrackToMoment: (momentId: string, track: Track) => Promise<void>; removeTrackFromMoment: (momentId: string, trackId: string) => Promise<void>;
  moderateProposal: (id: string, status: 'approved' | 'rejected', playlistId?: string) => Promise<void>;
};
const empty: GlobalState = { library: [], playlists: [], folders: [], timeline: [], proposals: [], currentlyPlaying: null, isPlaying: false };
const context = createContext<SillageContextType>({ ...empty, events: [], activeEventId: null, loading: true, error: null, refresh: async () => {}, createEvent: async () => {}, importPrototype: async () => {}, setPlaying: () => {}, togglePlay: () => {}, createPlaylist: async () => {}, deletePlaylist: async () => {}, updatePlaylist: async () => {}, addTrackToPlaylist: async () => {}, removeTrackFromPlaylist: async () => {}, reorderPlaylist: async () => {}, createFolder: async () => {}, deleteFolder: async () => {}, createMoment: async () => {}, deleteMoment: async () => {}, updateMoment: async () => {}, updateTrackMetadata: async () => {}, addTrackToMoment: async () => {}, removeTrackFromMoment: async () => {}, moderateProposal: async () => {} });
const request = async (path: string, init?: RequestInit) => {
  const response = await fetch(`/api${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, ...init });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'La synchronisation a échoué.'); }
  return response.status === 204 ? null : response.json();
};

export function useSillage() { return useContext(context); }
export function SillageProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GlobalState>(empty);
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { const data = await request('/owner/state'); setState((old) => ({ ...data, currentlyPlaying: old.currentlyPlaying, isPlaying: old.isPlaying })); setEvents(data.events); setActiveEventId(data.activeEventId); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur de synchronisation.'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const mutate = (fn: () => Promise<unknown>) => async () => {
    try { await fn(); await refresh(); }
    catch (e) {
      const message = e instanceof Error ? e.message : 'Erreur de synchronisation.';
      setError(message);
      toast.error(message);
    }
  };
  const selected = () => { if (!activeEventId) throw new Error('Créez un événement avant de modifier votre bibliothèque.'); return activeEventId; };
  const createEvent = (name: string) => mutate(async () => { await request('/events', { method: 'POST', body: JSON.stringify({ name }) }); })();
  const importPrototype = mutate(async () => { const saved = localStorage.getItem('sillage_state'); if (!saved) throw new Error('Aucun prototype local à importer.'); await request('/owner/import', { method: 'POST', body: JSON.stringify({ state: JSON.parse(saved), eventName: 'Import du prototype' }) }); });
  const createPlaylist = (name:string,description:string,type:'collection'|'dj-set') => mutate(async()=>{ await request(`/events/${selected()}/playlists`,{method:'POST',body:JSON.stringify({name,description,type})}); })();
  const deletePlaylist = (playlistId:string) => mutate(async()=>{await request(`/playlists/${playlistId}`,{method:'DELETE'});})();
  const updatePlaylist = (playlistId:string,updates:Partial<Playlist>) => mutate(async()=>{ const p=state.playlists.find(x=>x.id===playlistId); if(!p)return; await request(`/playlists/${playlistId}`,{method:'PATCH',body:JSON.stringify({name:updates.name ?? p.name,description:updates.description ?? p.description,type:updates.type ?? p.type,folderId:updates.folderId ?? p.folderId ?? null,revision:p.revision})});})();
  const replaceTracks = async (p:Playlist, ids:string[]) => { await request(`/playlists/${p.id}/tracks`,{method:'PUT',body:JSON.stringify({trackIds:ids,revision:p.revision})}); };
  const addTrackToPlaylist=(playlistId:string,track:Track)=>mutate(async()=>{const p=state.playlists.find(x=>x.id===playlistId);if(!p)return;await replaceTracks(p,[...p.tracks.map(x=>x.id),track.id]);})();
  const removeTrackFromPlaylist=(playlistId:string,trackId:string)=>mutate(async()=>{await request(`/playlists/${playlistId}/tracks/${trackId}`,{method:'DELETE'});})();
  const reorderPlaylist=(playlistId:string,start:number,end:number)=>mutate(async()=>{const p=state.playlists.find(x=>x.id===playlistId);if(!p)return;const tracks=[...p.tracks];const [moved]=tracks.splice(start,1);tracks.splice(end,0,moved);await replaceTracks(p,tracks.map(x=>x.id));})();
  const createFolder=(name:string)=>mutate(async()=>{await request(`/events/${selected()}/folders`,{method:'POST',body:JSON.stringify({name})});})();
  const deleteFolder=(folderId:string)=>mutate(async()=>{await request(`/folders/${folderId}`,{method:'DELETE'});})();
  const createMoment=(moment:Pick<Moment,'title'|'time'|'duration'|'expectedEnergy'|'notes'>)=>mutate(async()=>{await request(`/events/${selected()}/moments`,{method:'POST',body:JSON.stringify(moment)});})();
  const deleteMoment=(momentId:string)=>mutate(async()=>{await request(`/events/${selected()}/moments/${momentId}`,{method:'DELETE'});})();
  const updateMoment=(momentId:string,updates:Partial<Moment>)=>mutate(async()=>{const m=state.timeline.find(x=>x.id===momentId);if(!m)return;await request(`/events/${selected()}/moments/${momentId}`,{method:'PATCH',body:JSON.stringify({title:updates.title??m.title,time:updates.time??m.time,duration:updates.duration??m.duration,expectedEnergy:updates.expectedEnergy??m.expectedEnergy,notes:updates.notes??m.notes,revision:m.revision})});})();
  const updateTrackMetadata=(trackId:string,values:Pick<Track,'title'|'artist'|'album'>)=>mutate(async()=>{await request(`/tracks/${trackId}`,{method:'PATCH',body:JSON.stringify(values)});})();
  const replaceMoment = async (m: Moment, trackIds: string[]) => { await request(`/events/${selected()}/moments/${m.id}/tracks`,{method:'PUT',body:JSON.stringify({trackIds,revision:m.revision})}); };
  const addTrackToMoment=(momentId:string,track:Track)=>mutate(async()=>{const m=state.timeline.find(x=>x.id===momentId);if(m)await replaceMoment(m,[...m.tracks.map(x=>x.id),track.id]);})();
  const removeTrackFromMoment=(momentId:string,trackId:string)=>mutate(async()=>{const m=state.timeline.find(x=>x.id===momentId);if(m)await replaceMoment(m,m.tracks.filter(x=>x.id!==trackId).map(x=>x.id));})();
  const moderateProposal=(proposalId:string,status:'approved'|'rejected',playlistId?:string)=>mutate(async()=>{const playlist=state.playlists.find((item)=>item.id===(playlistId||state.playlists[0]?.id));await request(`/proposals/${proposalId}`,{method:'PATCH',body:JSON.stringify({status,playlistId:status==='approved'?playlist?.id:undefined,revision:playlist?.revision})});})();
  return <context.Provider value={{...state,events,activeEventId,loading,error,refresh,createEvent,importPrototype,setPlaying:(track,isPlaying=true)=>setState(s=>({...s,currentlyPlaying:track,isPlaying:!!track&&isPlaying})),togglePlay:()=>setState(s=>({...s,isPlaying:!s.isPlaying})),createPlaylist,deletePlaylist,updatePlaylist,addTrackToPlaylist,removeTrackFromPlaylist,reorderPlaylist,createFolder,deleteFolder,createMoment,deleteMoment,updateMoment,updateTrackMetadata,addTrackToMoment,removeTrackFromMoment,moderateProposal}}>{children}</context.Provider>;
}