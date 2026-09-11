export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  duration: number | null;
  year?: number;
  genre?: string;
  bpm: number | null;
  key: string | null;
  energy: number | null;
  moods?: string[];
  momentTags?: string[];
  source?: 'catalogue' | 'upload' | 'import';
  previewUrl?: string | null;
  storeUrl?: string | null;
  streamUrl?: string;
  excluded?: boolean;
  locked?: boolean;
  colorHue?: number; // for subtle UI tinting
};

export type Playlist = {
  id: string;
  name: string;
  description: string;
  tracks: Track[];
  cover?: string;
  type: 'collection' | 'dj-set';
  revision?: number;
  folderId?: string | null;
};

export type Folder = {
  id: string;
  name: string;
  playlistIds: string[];
};

export type Moment = {
  id: string;
  title: string; // 'Accueil', 'Cérémonie', 'Cocktail', 'Dîner', 'Bal', 'Dancefloor', 'Dernière chanson'
  time: string; // "14:00"
  duration: number; // minutes
  expectedEnergy: number; // 1-10
  tracks: Track[];
  notes?: string;
  revision?: number;
};

export type Proposal = {
  id: string;
  guestName: string;
  message: string;
  track: Track;
  status: 'proposed' | 'approved' | 'rejected';
  votes: number;
};

export type GlobalState = {
  library: Track[];
  playlists: Playlist[];
  folders: Folder[];
  timeline: Moment[];
  proposals: Proposal[];
  currentlyPlaying: Track | null;
  isPlaying: boolean;
};
