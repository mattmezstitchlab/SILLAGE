import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { getAuth } from "@clerk/express";
import { Router } from "express";
import { pool } from "@workspace/db";
import { z } from "zod";
import { requestPrivateAudioUpload, streamPrivateAudio, verifyPrivateAudio } from "../lib/audioStorage";

const router = Router();
const maxAudioBytes = 100 * 1024 * 1024;
const audioMimes = new Set(["audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm", "audio/flac"]);
const guestLimits = new Map<string, { count: number; reset: number }>();
function guestRate(key: string, max: number) { const now=Date.now(); const entry=guestLimits.get(key); if(!entry||entry.reset<now){guestLimits.set(key,{count:1,reset:now+60*60_000});return true;} if(entry.count>=max)return false;entry.count++;return true; }
const id = z.string().uuid();
const trackInput = z.object({
  title: z.string().trim().min(1).max(200),
  artist: z.string().trim().min(1).max(200),
  album: z.string().trim().max(200).optional().default(""),
  cover: z.string().url().nullable().optional(),
  duration: z.number().finite().positive().max(60 * 60 * 4).nullable().optional(),
  previewUrl: z.string().url().nullable().optional(),
  storeUrl: z.string().url().nullable().optional(),
  source: z.enum(["catalogue", "upload"]),
});

type OwnerRequest = Parameters<typeof router.get>[1] extends (req: infer Request, ...args: never[]) => unknown ? Request & { ownerId: string } : never;
function owner(req: any, res: any, next: any) {
  const auth = getAuth(req);
  const ownerId = auth?.sessionClaims?.userId || auth?.userId;
  if (!ownerId) return res.status(401).json({ error: "Authentification requise." });
  req.ownerId = ownerId;
  next();
}
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function shareKey() {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("Service de partage indisponible.");
  return createHash("sha256").update(secret).digest();
}
function encryptToken(token: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", shareKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]); const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}
function decryptToken(value: string) {
  const data = Buffer.from(value, "base64url"); const decipher = createDecipheriv("aes-256-gcm", shareKey(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28)); return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}
function sendError(res: any, error: unknown) {
  const message = error instanceof Error ? error.message : "Erreur serveur.";
  const status = /introuvable|invalide/i.test(message) ? 404 : /correspond|droits|limite/i.test(message) ? 400 : 500;
  return res.status(status).json({ error: message });
}
async function ownsEvent(ownerId: string, eventId: string) {
  const result = await pool.query("SELECT id FROM sillage_events WHERE id = $1 AND owner_id = $2", [eventId, ownerId]);
  if (!result.rowCount) throw new Error("Événement introuvable.");
}
async function eventForResource(ownerId: string, table: "sillage_playlists" | "sillage_tracks" | "sillage_proposals", resourceId: string) {
  const result = await pool.query(`SELECT event_id FROM ${table} WHERE id = $1`, [resourceId]);
  const eventId = result.rows[0]?.event_id;
  if (!eventId) throw new Error("Ressource introuvable.");
  await ownsEvent(ownerId, eventId);
  return eventId as string;
}
function mapTrack(row: any) {
  return { id: row.id, title: row.title, artist: row.artist, album: row.album, cover: row.cover_url || "", duration: row.duration_seconds, previewUrl: row.preview_url, storeUrl: row.store_url, source: row.source, bpm: row.bpm, key: row.musical_key, energy: row.energy, excluded: row.is_excluded, streamUrl: row.source === "upload" ? `/api/tracks/${row.id}/stream` : undefined };
}
async function buildState(ownerId: string) {
  const eventRows = (await pool.query("SELECT id, name, event_date, revision FROM sillage_events WHERE owner_id=$1 ORDER BY created_at", [ownerId])).rows;
  const event = eventRows[0];
  if (!event) return { events: [], activeEventId: null, library: [], playlists: [], folders: [], timeline: [], proposals: [] };
  const [tracks, playlistRows, folders, moments, proposals] = await Promise.all([
    pool.query("SELECT * FROM sillage_tracks WHERE event_id=$1 ORDER BY created_at DESC", [event.id]),
    pool.query("SELECT * FROM sillage_playlists WHERE event_id=$1 ORDER BY created_at", [event.id]),
    pool.query("SELECT id,name,position FROM sillage_folders WHERE event_id=$1 ORDER BY position", [event.id]),
    pool.query("SELECT * FROM sillage_moments WHERE event_id=$1 ORDER BY time", [event.id]),
    pool.query("SELECT p.*, count(v.proposal_id)::int votes FROM sillage_proposals p LEFT JOIN sillage_proposal_votes v ON v.proposal_id=p.id WHERE p.event_id=$1 GROUP BY p.id ORDER BY p.created_at DESC", [event.id]),
  ]);
  const playlists = await Promise.all(playlistRows.rows.map(async (playlist) => {
    const rows = await pool.query("SELECT t.*, pt.locked FROM sillage_playlist_tracks pt JOIN sillage_tracks t ON t.id=pt.track_id WHERE pt.playlist_id=$1 ORDER BY pt.position", [playlist.id]);
    return { id: playlist.id, name: playlist.name, description: playlist.description, type: playlist.type, folderId: playlist.folder_id, revision: playlist.revision, tracks: rows.rows.map((r) => ({ ...mapTrack(r), locked: r.locked })) };
  }));
  const timeline = await Promise.all(moments.rows.map(async (moment) => {
    const rows = await pool.query("SELECT t.* FROM sillage_moment_tracks mt JOIN sillage_tracks t ON t.id=mt.track_id WHERE mt.moment_id=$1 ORDER BY mt.position", [moment.id]);
    return { id: moment.id, title: moment.title, time: moment.time, duration: moment.duration_minutes, expectedEnergy: moment.expected_energy, notes: moment.notes || "", revision: moment.revision, tracks: rows.rows.map(mapTrack) };
  }));
  return {
    events: eventRows.map((r) => ({ id: r.id, name: r.name, date: r.event_date, revision: r.revision })),
    activeEventId: event.id, library: tracks.rows.map(mapTrack), playlists,
    folders: folders.rows.map((f) => ({ id: f.id, name: f.name, playlistIds: playlistRows.rows.filter((p) => p.folder_id === f.id).map((p) => p.id) })),
    timeline, proposals: proposals.rows.map((p) => ({ id: p.id, guestName: p.guest_name, message: p.message, track: p.track_data, status: p.status, votes: p.votes })),
  };
}

router.get("/owner/state", owner, async (req: any, res) => {
  try { res.json(await buildState(req.ownerId)); } catch (error) { req.log.error(error); sendError(res, error); }
});
router.post("/events", owner, async (req: any, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(120), date: z.string().nullable().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Événement invalide." });
  try {
    const result = await pool.query("INSERT INTO sillage_events (owner_id,name,event_date) VALUES ($1,$2,$3) RETURNING id,name,event_date,revision", [req.ownerId, parsed.data.name, parsed.data.date ?? null]);
    res.status(201).json({ id: result.rows[0].id, name: result.rows[0].name, date: result.rows[0].event_date, revision: result.rows[0].revision });
  } catch (error) { req.log.error(error); sendError(res, error); }
});
router.patch("/events/:eventId", owner, async (req: any, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(120), date: z.string().nullable().optional() }).safeParse(req.body);
  if (!id.safeParse(req.params.eventId).success || !parsed.success) return res.status(400).json({ error: "Données invalides." });
  try { await ownsEvent(req.ownerId, req.params.eventId); const r = await pool.query("UPDATE sillage_events SET name=$1,event_date=$2,revision=revision+1,updated_at=now() WHERE id=$3 RETURNING id,name,event_date,revision", [parsed.data.name, parsed.data.date ?? null, req.params.eventId]); res.json({ id:r.rows[0].id,name:r.rows[0].name,date:r.rows[0].event_date,revision:r.rows[0].revision }); } catch (error) { sendError(res, error); }
});
router.post("/events/:eventId/tracks", owner, async (req: any, res) => {
  const parsed = trackInput.safeParse(req.body);
  if (!id.safeParse(req.params.eventId).success || !parsed.success) return res.status(400).json({ error: "Titre invalide." });
  if (parsed.data.source !== "catalogue" || !parsed.data.previewUrl?.startsWith("https://audio-ssl.itunes.apple.com/")) return res.status(400).json({ error: "Seuls les aperçus iTunes autorisés peuvent être ajoutés." });
  try { await ownsEvent(req.ownerId, req.params.eventId); const d=parsed.data; const r=await pool.query("INSERT INTO sillage_tracks(event_id,title,artist,album,cover_url,duration_seconds,preview_url,store_url,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'catalogue') RETURNING *",[req.params.eventId,d.title,d.artist,d.album,d.cover ?? null,d.duration ? Math.round(d.duration) : null,d.previewUrl,d.storeUrl ?? null]); res.status(201).json(mapTrack(r.rows[0])); } catch(error) { sendError(res,error); }
});
router.get("/events/:eventId/catalogue", owner, async (req: any, res) => {
  const query=z.string().trim().min(2).max(120).safeParse(req.query.q);
  if (!id.safeParse(req.params.eventId).success || !query.success) return res.status(400).json({ error: "Recherche invalide." });
  try {
    await ownsEvent(req.ownerId, req.params.eventId);
    const response=await fetch(`https://itunes.apple.com/search?media=music&entity=song&limit=20&country=FR&term=${encodeURIComponent(query.data)}`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("Le catalogue iTunes est indisponible. Réessayez plus tard.");
    const body=await response.json() as { results?: any[] };
    res.json({ attribution:"Aperçus fournis par iTunes Store", results:(body.results ?? []).filter((r)=>r.previewUrl).map((r)=>({ id:`itunes:${r.trackId}`,title:r.trackName,artist:r.artistName,album:r.collectionName || "",cover:r.artworkUrl100?.replace("100x100","600x600") || "",duration:r.trackTimeMillis ? r.trackTimeMillis/1000 : null,previewUrl:r.previewUrl,storeUrl:r.trackViewUrl,source:"catalogue",bpm:null,key:null,energy:null })) });
  } catch(error) { req.log.warn(error); sendError(res,error); }
});
router.post("/events/:eventId/uploads/request", owner, async (req:any,res) => {
  const parsed=z.object({name:z.string().min(1).max(255),size:z.number().int().positive().max(maxAudioBytes),contentType:z.string(),rightsConfirmed:z.literal(true)}).safeParse(req.body);
  if (!id.safeParse(req.params.eventId).success || !parsed.success || !audioMimes.has(parsed.data?.contentType ?? "")) return res.status(400).json({error:"Fichier audio ou confirmation de droits invalide."});
  try { await ownsEvent(req.ownerId,req.params.eventId); const upload=await requestPrivateAudioUpload(); const intent=await pool.query("INSERT INTO sillage_upload_intents(event_id,owner_id,object_path,byte_size,mime_type,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes') RETURNING id",[req.params.eventId,req.ownerId,upload.objectPath,parsed.data.size,parsed.data.contentType]); res.json({...upload,intentId:intent.rows[0].id}); } catch(error) { sendError(res,error); }
});
router.post("/events/:eventId/uploads/finalize", owner, async (req:any,res) => {
  const parsed=trackInput.extend({intentId:z.string().uuid(),objectPath:z.string(),size:z.number().int().positive().max(maxAudioBytes),contentType:z.string(),rightsConfirmed:z.literal(true)}).safeParse(req.body);
  if (!id.safeParse(req.params.eventId).success || !parsed.success || !audioMimes.has(parsed.data?.contentType ?? "")) return res.status(400).json({error:"Finalisation invalide."});
  const client=await pool.connect(); try { await ownsEvent(req.ownerId,req.params.eventId); const d=parsed.data; if(d.source!=="upload") throw new Error("Source de fichier invalide."); await client.query("BEGIN"); const intent=await client.query("SELECT * FROM sillage_upload_intents WHERE id=$1 FOR UPDATE",[d.intentId]); const row=intent.rows[0]; if(!row||row.event_id!==req.params.eventId||row.owner_id!==req.ownerId||row.object_path!==d.objectPath||row.byte_size!==d.size||row.mime_type!==d.contentType||row.consumed_at||new Date(row.expires_at)<new Date())throw new Error("Autorisation d’envoi invalide, expirée ou déjà utilisée."); await verifyPrivateAudio(d.objectPath,d.size,d.contentType); const r=await client.query("INSERT INTO sillage_tracks(event_id,title,artist,album,cover_url,duration_seconds,source,object_path,mime_type,byte_size) VALUES($1,$2,$3,$4,$5,$6,'upload',$7,$8,$9) RETURNING *",[req.params.eventId,d.title,d.artist,d.album,d.cover ?? null,d.duration ? Math.round(d.duration) : null,d.objectPath,d.contentType,d.size]); await client.query("UPDATE sillage_upload_intents SET consumed_at=now() WHERE id=$1",[d.intentId]); await client.query("COMMIT"); res.status(201).json(mapTrack(r.rows[0])); } catch(error) { await client.query("ROLLBACK"); sendError(res,error); } finally {client.release();}
});
router.get("/tracks/:trackId/stream", owner, async (req:any,res) => { try { await eventForResource(req.ownerId,"sillage_tracks",req.params.trackId); const r=await pool.query("SELECT object_path,source FROM sillage_tracks WHERE id=$1",[req.params.trackId]); if(!r.rows[0] || r.rows[0].source!=="upload") throw new Error("Audio introuvable."); await streamPrivateAudio(r.rows[0].object_path,req.headers.range,res); } catch(error) { sendError(res,error); } });
router.patch("/tracks/:trackId", owner, async (req:any,res) => {
  const d=z.object({title:z.string().trim().min(1).max(200),artist:z.string().trim().min(1).max(200),album:z.string().trim().max(200).optional().default("")}).safeParse(req.body);
  if(!d.success)return res.status(400).json({error:"Métadonnées invalides."});
  try {await eventForResource(req.ownerId,"sillage_tracks",req.params.trackId);const r=await pool.query("UPDATE sillage_tracks SET title=$1,artist=$2,album=$3,updated_at=now() WHERE id=$4 RETURNING *",[d.data.title,d.data.artist,d.data.album,req.params.trackId]);res.json(mapTrack(r.rows[0]));}catch(error){sendError(res,error);}
});
router.post("/events/:eventId/playlists", owner, async (req:any,res) => {
  const parsed=z.object({name:z.string().trim().min(1).max(160),description:z.string().max(1000).optional().default(""),type:z.enum(["collection","dj-set"]),folderId:z.string().uuid().nullable().optional()}).safeParse(req.body);
  if(!id.safeParse(req.params.eventId).success||!parsed.success) return res.status(400).json({error:"Playlist invalide."});
  try {await ownsEvent(req.ownerId,req.params.eventId); const d=parsed.data; if(d.folderId){const folder=await pool.query("SELECT id FROM sillage_folders WHERE id=$1 AND event_id=$2",[d.folderId,req.params.eventId]);if(!folder.rowCount)throw new Error("Dossier introuvable.");} const r=await pool.query("INSERT INTO sillage_playlists(event_id,folder_id,name,description,type) VALUES($1,$2,$3,$4,$5) RETURNING *",[req.params.eventId,d.folderId??null,d.name,d.description,d.type]); res.status(201).json({...r.rows[0],tracks:[]});} catch(error){sendError(res,error);}
});
router.patch("/playlists/:playlistId", owner, async(req:any,res)=>{
  const parsed=z.object({name:z.string().trim().min(1).max(160),description:z.string().max(1000).optional().default(""),type:z.enum(["collection","dj-set"]),folderId:z.string().uuid().nullable().optional(),revision:z.number().int().optional()}).safeParse(req.body);
  if(!parsed.success) return res.status(400).json({error:"Playlist invalide."});
  try {const eventId=await eventForResource(req.ownerId,"sillage_playlists",req.params.playlistId); const d=parsed.data; if(d.folderId){const folder=await pool.query("SELECT id FROM sillage_folders WHERE id=$1 AND event_id=$2",[d.folderId,eventId]);if(!folder.rowCount)throw new Error("Dossier introuvable.");} const r=await pool.query("UPDATE sillage_playlists SET name=$1,description=$2,type=$3,folder_id=$4,revision=revision+1,updated_at=now() WHERE id=$5 AND ($6::int IS NULL OR revision=$6) RETURNING *",[d.name,d.description,d.type,d.folderId??null,req.params.playlistId,d.revision??null]);if(!r.rowCount)return res.status(409).json({error:"La playlist a été modifiée ailleurs. Actualisez-la."});res.json(r.rows[0]);}catch(error){sendError(res,error);}
});
router.delete("/playlists/:playlistId",owner,async(req:any,res)=>{try{await eventForResource(req.ownerId,"sillage_playlists",req.params.playlistId);await pool.query("DELETE FROM sillage_playlists WHERE id=$1",[req.params.playlistId]);res.status(204).end();}catch(error){sendError(res,error);}});
router.put("/playlists/:playlistId/tracks",owner,async(req:any,res)=>{
  const parsed=z.object({trackIds:z.array(z.string().uuid()).max(500),revision:z.number().int()}).safeParse(req.body); if(!parsed.success)return res.status(400).json({error:"Ordre invalide."});
  const client=await pool.connect();try{const eventId=await eventForResource(req.ownerId,"sillage_playlists",req.params.playlistId);await client.query("BEGIN");const locked=await client.query("SELECT track_id,position FROM sillage_playlist_tracks WHERE playlist_id=$1 AND locked=true",[req.params.playlistId]);for(const row of locked.rows){if(parsed.data.trackIds[row.position]!==row.track_id)throw new Error("Un titre verrouillé ne peut pas être déplacé.");}const valid=await client.query("SELECT id FROM sillage_tracks WHERE event_id=$1 AND id=ANY($2::uuid[])",[eventId,parsed.data.trackIds]);if(valid.rowCount!==parsed.data.trackIds.length)throw new Error("Titre invalide.");const changed=await client.query("UPDATE sillage_playlists SET revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$2 RETURNING revision",[req.params.playlistId,parsed.data.revision]);if(!changed.rowCount){await client.query("ROLLBACK");return res.status(409).json({error:"La playlist a été modifiée ailleurs. Actualisez-la."});}const lockedIds=new Set(locked.rows.map((row)=>row.track_id));await client.query("DELETE FROM sillage_playlist_tracks WHERE playlist_id=$1",[req.params.playlistId]);for(const [position,trackId] of parsed.data.trackIds.entries())await client.query("INSERT INTO sillage_playlist_tracks(playlist_id,track_id,position,locked) VALUES($1,$2,$3,$4)",[req.params.playlistId,trackId,position,lockedIds.has(trackId)]);await client.query("COMMIT");res.json({revision:changed.rows[0].revision});}catch(error){await client.query("ROLLBACK");sendError(res,error);}finally{client.release();}
});
router.delete("/playlists/:playlistId/tracks/:trackId",owner,async(req:any,res)=>{const client=await pool.connect();try{await eventForResource(req.ownerId,"sillage_playlists",req.params.playlistId);await client.query("BEGIN");const row=await client.query("SELECT locked FROM sillage_playlist_tracks WHERE playlist_id=$1 AND track_id=$2 FOR UPDATE",[req.params.playlistId,req.params.trackId]);if(!row.rowCount)throw new Error("Titre introuvable.");if(row.rows[0].locked)throw new Error("Ce titre est verrouillé.");await client.query("DELETE FROM sillage_playlist_tracks WHERE playlist_id=$1 AND track_id=$2",[req.params.playlistId,req.params.trackId]);await client.query("UPDATE sillage_playlists SET revision=revision+1,updated_at=now() WHERE id=$1",[req.params.playlistId]);await client.query("COMMIT");res.status(204).end();}catch(error){await client.query("ROLLBACK");sendError(res,error);}finally{client.release();}});
router.patch("/events/:eventId/moments/:momentId",owner,async(req:any,res)=>{const d=z.object({title:z.string().trim().min(1),time:z.string().regex(/^\d{2}:\d{2}$/),duration:z.number().int().positive().max(1440),expectedEnergy:z.number().int().min(1).max(10).nullable().optional(),notes:z.string().max(2000).nullable().optional(),revision:z.number().int().optional()}).safeParse(req.body);if(!d.success)return res.status(400).json({error:"Moment invalide."});try{await ownsEvent(req.ownerId,req.params.eventId);const x=d.data;const r=await pool.query("UPDATE sillage_moments SET title=$1,time=$2,duration_minutes=$3,expected_energy=$4,notes=$5,revision=revision+1 WHERE id=$6 AND event_id=$7 AND ($8::int IS NULL OR revision=$8) RETURNING *",[x.title,x.time,x.duration,x.expectedEnergy??null,x.notes??null,req.params.momentId,req.params.eventId,x.revision??null]);if(!r.rowCount)return res.status(409).json({error:"Le moment a été modifié ailleurs."});res.json(r.rows[0]);}catch(error){sendError(res,error);}});
router.post("/events/:eventId/moments",owner,async(req:any,res)=>{const d=z.object({title:z.string().trim().min(1).max(100),time:z.string().regex(/^\d{2}:\d{2}$/),duration:z.number().int().positive().max(1440),expectedEnergy:z.number().int().min(1).max(10).nullable().optional(),notes:z.string().max(2000).nullable().optional()}).safeParse(req.body);if(!d.success)return res.status(400).json({error:"Moment invalide."});try{await ownsEvent(req.ownerId,req.params.eventId);const x=d.data;const r=await pool.query("INSERT INTO sillage_moments(event_id,title,time,duration_minutes,expected_energy,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[req.params.eventId,x.title,x.time,x.duration,x.expectedEnergy??null,x.notes??null]);res.status(201).json(r.rows[0]);}catch(error){sendError(res,error);}});
router.delete("/events/:eventId/moments/:momentId",owner,async(req:any,res)=>{try{await ownsEvent(req.ownerId,req.params.eventId);const r=await pool.query("DELETE FROM sillage_moments WHERE id=$1 AND event_id=$2",[req.params.momentId,req.params.eventId]);if(!r.rowCount)throw new Error("Moment introuvable.");res.status(204).end();}catch(error){sendError(res,error);}});
router.get("/events/:eventId/share",owner,async(req:any,res)=>{try{await ownsEvent(req.ownerId,req.params.eventId);const links=await pool.query("SELECT id,token_ciphertext,created_at FROM sillage_shares WHERE event_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC",[req.params.eventId]);res.json(links.rows.map(x=>{const token=decryptToken(x.token_ciphertext);return{id:x.id,token,url:`/guest/${token}`,createdAt:x.created_at};}));}catch(error){sendError(res,error);}});
router.post("/events/:eventId/share",owner,async(req:any,res)=>{try{await ownsEvent(req.ownerId,req.params.eventId);const token=randomBytes(32).toString("base64url");const r=await pool.query("INSERT INTO sillage_shares(event_id,token_hash,token_ciphertext) VALUES($1,$2,$3) RETURNING id",[req.params.eventId,hash(token),encryptToken(token)]);res.status(201).json({id:r.rows[0].id,token,url:`/guest/${token}`});}catch(error){sendError(res,error);}});
router.delete("/share/:shareId",owner,async(req:any,res)=>{try{const q=await pool.query("SELECT event_id FROM sillage_shares WHERE id=$1",[req.params.shareId]);if(!q.rowCount)throw new Error("Lien introuvable.");await ownsEvent(req.ownerId,q.rows[0].event_id);await pool.query("UPDATE sillage_shares SET revoked_at=now() WHERE id=$1",[req.params.shareId]);res.status(204).end();}catch(error){sendError(res,error);}});
async function guestEvent(token:string){const q=await pool.query("SELECT e.* FROM sillage_shares s JOIN sillage_events e ON e.id=s.event_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL",[hash(token)]);if(!q.rowCount)throw new Error("Ce lien invité est invalide ou a été révoqué.");return q.rows[0];}
router.get("/guest/:token",async(req:any,res)=>{try{const event=await guestEvent(req.params.token);const p=await pool.query("SELECT p.*,count(v.proposal_id)::int votes FROM sillage_proposals p LEFT JOIN sillage_proposal_votes v ON v.proposal_id=p.id WHERE p.event_id=$1 GROUP BY p.id ORDER BY p.created_at DESC",[event.id]);res.json({name:event.name,proposals:p.rows.map(x=>({id:x.id,guestName:x.guest_name,message:x.message,track:x.track_data,status:x.status,votes:x.votes}))});}catch(error){sendError(res,error);}});
router.get("/guest/:token/catalogue",async(req:any,res)=>{const q=z.string().trim().min(2).max(120).safeParse(req.query.q);if(!q.success)return res.status(400).json({error:"Recherche invalide."});try{await guestEvent(req.params.token);const ip=(req.headers["x-forwarded-for"]?.toString().split(",")[0]||req.ip||"").slice(0,100);if(!guestRate(`search:${hash(req.params.token)}:${ip}`,20))return res.status(429).json({error:"Limite de recherche atteinte. Réessayez dans une heure."});const response=await fetch(`https://itunes.apple.com/search?media=music&entity=song&limit=8&country=FR&term=${encodeURIComponent(q.data)}`,{signal:AbortSignal.timeout(10_000)});if(!response.ok)throw new Error("Le catalogue iTunes est indisponible.");const body=await response.json()as{results?:any[]};res.json({attribution:"Aperçus fournis par iTunes Store",results:(body.results??[]).filter(x=>x.previewUrl&&x.trackId).map(x=>({id:`itunes:${x.trackId}`,title:x.trackName,artist:x.artistName,album:x.collectionName||"",cover:x.artworkUrl100?.replace("100x100","600x600")||"",duration:x.trackTimeMillis?x.trackTimeMillis/1000:null,previewUrl:x.previewUrl,storeUrl:x.trackViewUrl,source:"catalogue"}))});}catch(error){sendError(res,error);}});
router.post("/guest/:token/proposals",async(req:any,res)=>{const d=z.object({guestName:z.string().trim().min(1).max(80),message:z.string().trim().max(500).optional().default(""),catalogueId:z.coerce.number().int().positive()}).safeParse(req.body);if(!d.success)return res.status(400).json({error:"Suggestion invalide."});try{const event=await guestEvent(req.params.token);const ip=(req.headers["x-forwarded-for"]?.toString().split(",")[0]||req.ip||"").slice(0,100);if(!guestRate(`proposal:${hash(req.params.token)}:${ip}`,5))return res.status(429).json({error:"Limite de cinq suggestions par heure atteinte."});const eventRate=await pool.query("SELECT count(*)::int n FROM sillage_proposals WHERE event_id=$1 AND created_at>now()-interval '1 hour'",[event.id]);if(eventRate.rows[0].n>=100)return res.status(429).json({error:"Les suggestions sont temporairement limitées."});const lookup=await fetch(`https://itunes.apple.com/lookup?id=${d.data.catalogueId}&entity=song&country=FR`,{signal:AbortSignal.timeout(10_000)});if(!lookup.ok)throw new Error("Titre du catalogue indisponible.");const body=await lookup.json()as{results?:any[]};const song=body.results?.find(x=>x.wrapperType==="track"&&x.previewUrl);if(!song)throw new Error("Titre du catalogue introuvable.");const track={id:`itunes:${song.trackId}`,title:song.trackName,artist:song.artistName,album:song.collectionName||"",cover:song.artworkUrl100?.replace("100x100","600x600")||"",duration:song.trackTimeMillis?song.trackTimeMillis/1000:null,previewUrl:song.previewUrl,storeUrl:song.trackViewUrl,source:"catalogue"};const r=await pool.query("INSERT INTO sillage_proposals(event_id,guest_name,message,track_data) VALUES($1,$2,$3,$4) RETURNING *",[event.id,d.data.guestName,d.data.message,JSON.stringify(track)]);res.status(201).json({id:r.rows[0].id,guestName:r.rows[0].guest_name,message:r.rows[0].message,track:r.rows[0].track_data,status:r.rows[0].status,votes:0});}catch(error){sendError(res,error);}});
router.post("/guest/:token/proposals/:proposalId/vote",async(req:any,res)=>{try{const event=await guestEvent(req.params.token);let session=req.cookies?.sillage_guest_session;if(!session){session=randomBytes(24).toString("base64url");res.cookie("sillage_guest_session",session,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:365*24*3600_000});}const p=await pool.query("SELECT id FROM sillage_proposals WHERE id=$1 AND event_id=$2",[req.params.proposalId,event.id]);if(!p.rowCount)throw new Error("Suggestion introuvable.");await pool.query("INSERT INTO sillage_proposal_votes(proposal_id,guest_session_hash) VALUES($1,$2) ON CONFLICT DO NOTHING",[req.params.proposalId,hash(session)]);const count=await pool.query("SELECT count(*)::int votes FROM sillage_proposal_votes WHERE proposal_id=$1",[req.params.proposalId]);res.json({votes:count.rows[0].votes});}catch(error){sendError(res,error);}});
router.patch("/proposals/:proposalId",owner,async(req:any,res)=>{const d=z.object({status:z.enum(["approved","rejected"]),playlistId:z.string().uuid().optional(),revision:z.number().int().optional()}).safeParse(req.body);if(!d.success)return res.status(400).json({error:"Modération invalide."});const client=await pool.connect();try{const eventId=await eventForResource(req.ownerId,"sillage_proposals",req.params.proposalId);await client.query("BEGIN");const p=await client.query("SELECT * FROM sillage_proposals WHERE id=$1 FOR UPDATE",[req.params.proposalId]);if(!p.rowCount)throw new Error("Suggestion introuvable.");if(p.rows[0].status!=="proposed"){await client.query("ROLLBACK");return res.status(409).json({error:"Cette suggestion a déjà été modérée."});}if(d.data.status==="approved"){if(!d.data.playlistId)throw new Error("Choisissez une playlist.");const pl=await client.query("SELECT * FROM sillage_playlists WHERE id=$1 AND event_id=$2 FOR UPDATE",[d.data.playlistId,eventId]);if(!pl.rowCount)throw new Error("Playlist introuvable.");if(d.data.revision!==undefined&&pl.rows[0].revision!==d.data.revision){await client.query("ROLLBACK");return res.status(409).json({error:"La playlist a été modifiée ailleurs."});}const t=dummyTrackData(p.rows[0].track_data);const existing=await client.query("SELECT id FROM sillage_tracks WHERE event_id=$1 AND preview_url=$2",[eventId,t.previewUrl]);let trackId=existing.rows[0]?.id;if(!trackId){const inserted=await client.query("INSERT INTO sillage_tracks(event_id,title,artist,album,cover_url,duration_seconds,preview_url,store_url,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'catalogue') RETURNING id",[eventId,t.title,t.artist,t.album,t.cover||null,t.duration?Math.round(t.duration):null,t.previewUrl,t.storeUrl||null]);trackId=inserted.rows[0].id;}const pos=await client.query("SELECT coalesce(max(position),-1)+1 AS p FROM sillage_playlist_tracks WHERE playlist_id=$1",[d.data.playlistId]);await client.query("INSERT INTO sillage_playlist_tracks(playlist_id,track_id,position) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[d.data.playlistId,trackId,pos.rows[0].p]);await client.query("UPDATE sillage_playlists SET revision=revision+1 WHERE id=$1",[d.data.playlistId]);await client.query("UPDATE sillage_proposals SET status='approved',accepted_playlist_id=$1 WHERE id=$2",[d.data.playlistId,req.params.proposalId]);}else await client.query("UPDATE sillage_proposals SET status='rejected' WHERE id=$1",[req.params.proposalId]);await client.query("COMMIT");res.json({ok:true});}catch(error){await client.query("ROLLBACK");sendError(res,error);}finally{client.release();}});
function dummyTrackData(data:any){return trackInput.extend({source:z.literal("catalogue")}).parse(data);}
router.post("/events/:eventId/folders",owner,async(req:any,res)=>{const d=z.object({name:z.string().trim().min(1).max(100)}).safeParse(req.body);if(!d.success)return res.status(400).json({error:"Dossier invalide."});try{await ownsEvent(req.ownerId,req.params.eventId);const r=await pool.query("INSERT INTO sillage_folders(event_id,name,position) VALUES($1,$2,(SELECT count(*) FROM sillage_folders WHERE event_id=$1)) RETURNING id,name",[req.params.eventId,d.data.name]);res.status(201).json(r.rows[0]);}catch(error){sendError(res,error);}});
router.delete("/folders/:folderId",owner,async(req:any,res)=>{try{const r=await pool.query("SELECT event_id FROM sillage_folders WHERE id=$1",[req.params.folderId]);if(!r.rowCount)throw new Error("Dossier introuvable.");await ownsEvent(req.ownerId,r.rows[0].event_id);await pool.query("DELETE FROM sillage_folders WHERE id=$1",[req.params.folderId]);res.status(204).end();}catch(error){sendError(res,error);}});
router.put("/events/:eventId/moments/:momentId/tracks",owner,async(req:any,res)=>{const d=z.object({trackIds:z.array(z.string().uuid()).max(500),revision:z.number().int()}).safeParse(req.body);if(!d.success)return res.status(400).json({error:"Ordre invalide."});const client=await pool.connect();try{await ownsEvent(req.ownerId,req.params.eventId);await client.query("BEGIN");const m=await client.query("UPDATE sillage_moments SET revision=revision+1 WHERE id=$1 AND event_id=$2 AND revision=$3 RETURNING revision",[req.params.momentId,req.params.eventId,d.data.revision]);if(!m.rowCount){await client.query("ROLLBACK");return res.status(409).json({error:"Le moment a été modifié ailleurs."});}const valid=await client.query("SELECT id FROM sillage_tracks WHERE event_id=$1 AND id=ANY($2::uuid[])",[req.params.eventId,d.data.trackIds]);if(valid.rowCount!==d.data.trackIds.length)throw new Error("Titre invalide.");await client.query("DELETE FROM sillage_moment_tracks WHERE moment_id=$1",[req.params.momentId]);for(const [pos,trackId]of d.data.trackIds.entries())await client.query("INSERT INTO sillage_moment_tracks(moment_id,track_id,position) VALUES($1,$2,$3)",[req.params.momentId,trackId,pos]);await client.query("COMMIT");res.json({revision:m.rows[0].revision});}catch(error){await client.query("ROLLBACK");sendError(res,error);}finally{client.release();}});
router.post("/owner/import",owner,async(req:any,res)=>{const parsed=z.object({eventName:z.string().trim().min(1).max(120).optional(),state:z.object({library:z.array(z.any()).optional(),playlists:z.array(z.any()).optional(),timeline:z.array(z.any()).optional()})}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Import invalide."});const client=await pool.connect();try{await client.query("BEGIN");const e=await client.query("INSERT INTO sillage_events(owner_id,name) VALUES($1,$2) RETURNING id",[req.ownerId,parsed.data.eventName||"Import du prototype"]);const eventId=e.rows[0].id;const map=new Map<string,string>();for(const t of parsed.data.state.library||[]){if(!t?.title||!t?.artist)continue;const r=await client.query("INSERT INTO sillage_tracks(event_id,title,artist,album,cover_url,duration_seconds,source) VALUES($1,$2,$3,$4,$5,$6,'import') RETURNING id",[eventId,String(t.title).slice(0,200),String(t.artist).slice(0,200),String(t.album||""),t.cover?String(t.cover):null,Number.isFinite(t.duration)?Math.round(t.duration):null]);map.set(String(t.id),r.rows[0].id);}for(const p of parsed.data.state.playlists||[]){if(!p?.name)continue;const r=await client.query("INSERT INTO sillage_playlists(event_id,name,description,type) VALUES($1,$2,$3,$4) RETURNING id",[eventId,String(p.name).slice(0,160),String(p.description||"").slice(0,1000),p.type==="dj-set"?"dj-set":"collection"]);for(const [pos,t] of (p.tracks||[]).entries()){const tid=map.get(String(t.id));if(tid)await client.query("INSERT INTO sillage_playlist_tracks(playlist_id,track_id,position) VALUES($1,$2,$3)",[r.rows[0].id,tid,pos]);}}await client.query("COMMIT");res.json(await buildState(req.ownerId));}catch(error){await client.query("ROLLBACK");sendError(res,error);}finally{client.release();}});
export default router;