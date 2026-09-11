import { useState } from 'react';
import { useSillage } from '@/lib/store';
import { computeDNA } from '@/lib/utils';
import { TrackRow } from '@/components/TrackRow';
import { Clock, Zap, Settings2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function TimelineView() {
  const { timeline, removeTrackFromMoment, updateMoment } = useSillage();
  const [editingMoment, setEditingMoment] = useState<string | null>(null);

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>, id: string) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    updateMoment(id, {
      title: formData.get('title') as string,
      time: formData.get('time') as string,
      duration: parseInt(formData.get('duration') as string) || 60,
      expectedEnergy: parseInt(formData.get('energy') as string) || 5,
      notes: formData.get('notes') as string,
    });
    setEditingMoment(null);
  };

  return (
    <div className="p-8 pb-32 max-w-4xl mx-auto">
      <div className="mb-12">
        <h1 className="text-4xl font-serif text-gradient mb-4">Chronologie du Jour J</h1>
        <p className="text-muted-foreground text-lg">
          Orchestrez le rythme de la journée. Chaque moment a son énergie et sa couleur musicale.
        </p>
      </div>

      <div className="relative border-l border-border ml-4 space-y-12">
        {timeline.map((moment, i) => {
          const totalDuration = moment.tracks.reduce((acc, t) => acc + t.duration, 0) / 60; // in minutes
          const coverage = Math.min(100, Math.round((totalDuration / moment.duration) * 100));
          const dna = computeDNA(moment.tracks);

          return (
            <div key={moment.id} className="relative pl-8">
              <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-background border-2 border-primary flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-primary" />
              </div>
              
              <div className="bg-card border border-border rounded-xl p-6 shadow-sm group">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-3 text-primary mb-1">
                      <Clock className="w-4 h-4" />
                      <span className="font-mono">{moment.time}</span>
                      <span className="text-muted-foreground text-sm uppercase tracking-wider">{moment.duration} min</span>
                    </div>
                    <h2 className="text-2xl font-serif text-white flex items-center gap-2">
                      {moment.title}
                      
                      <Dialog open={editingMoment === moment.id} onOpenChange={(open) => setEditingMoment(open ? moment.id : null)}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Settings2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px] bg-card border-border">
                          <DialogHeader>
                            <DialogTitle className="text-white font-serif text-xl">Modifier {moment.title}</DialogTitle>
                          </DialogHeader>
                          <form onSubmit={(e) => handleUpdate(e, moment.id)} className="space-y-4 pt-4">
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-white">Titre</label>
                              <Input name="title" defaultValue={moment.title} className="bg-background" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-white">Heure</label>
                                <Input name="time" defaultValue={moment.time} className="bg-background font-mono" />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-white">Durée (min)</label>
                                <Input name="duration" type="number" defaultValue={moment.duration} className="bg-background" />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-white">Énergie cible (1-10)</label>
                              <Input name="energy" type="number" min="1" max="10" defaultValue={moment.expectedEnergy} className="bg-background" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-white">Notes</label>
                              <textarea 
                                name="notes" 
                                defaultValue={moment.notes} 
                                className="w-full bg-background border border-border rounded-md p-3 text-sm focus:ring-2 focus:ring-ring"
                              />
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                              <DialogClose asChild>
                                <Button variant="ghost" type="button">Annuler</Button>
                              </DialogClose>
                              <Button type="submit">Enregistrer</Button>
                            </div>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </h2>
                    <p className="text-muted-foreground text-sm mt-2 max-w-lg">{moment.notes}</p>
                  </div>
                  
                  <div className="flex flex-col gap-2 min-w-[200px] bg-white/5 p-3 rounded-lg border border-white/5 shrink-0">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Couverture</span>
                      <span className={coverage < 100 ? 'text-destructive' : 'text-primary'}>{Math.round(totalDuration)} / {moment.duration} min</span>
                    </div>
                    <Progress value={coverage} className="h-1.5" />
                    
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <Zap className="w-3.5 h-3.5" />
                      <span>Énergie cible: <strong className="text-white">{moment.expectedEnergy}/10</strong></span>
                      {dna.energy > 0 && (
                        <span>(Actuelle: <strong className={Math.abs(dna.energy - moment.expectedEnergy) > 2 ? 'text-destructive' : 'text-white'}>{dna.energy}</strong>)</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  {moment.tracks.length > 0 ? (
                    moment.tracks.map((track, idx) => (
                      <TrackRow 
                        key={`${track.id}-${idx}`} 
                        track={track} 
                        showCover={false}
                        onRemove={() => removeTrackFromMoment(moment.id, track.id)}
                      />
                    ))
                  ) : (
                    <div className="text-sm text-muted-foreground p-4 text-center border border-dashed border-border rounded">
                      Aucun titre défini pour ce moment.
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
