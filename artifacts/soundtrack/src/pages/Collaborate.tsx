import { useSillage } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Users, Check, X, MessageSquare, ThumbsUp } from 'lucide-react';
import { TrackRow } from '@/components/TrackRow';

export default function Collaborate() {
  const { proposals, updateProposalStatus, playlists, addTrackToPlaylist } = useSillage();
  
  const pendingProposals = proposals.filter(p => p.status === 'proposed');
  const approvedProposals = proposals.filter(p => p.status === 'approved');

  const handleApprove = (proposal: typeof proposals[0]) => {
    updateProposalStatus(proposal.id, 'approved');
    // Just add to first playlist for demo
    if (playlists.length > 0) {
      addTrackToPlaylist(playlists[0].id, proposal.track);
    }
  };

  const handleReject = (id: string) => {
    updateProposalStatus(id, 'rejected');
  };

  return (
    <div className="p-8 pb-32 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-serif text-gradient mb-2">Collaboratif</h1>
          <p className="text-muted-foreground">Modérez les suggestions de vos invités (mode simulé).</p>
        </div>
        <Button variant="outline" onClick={() => window.open('#/guest', '_blank')}>
          <Users className="w-4 h-4 mr-2" />
          Ouvrir la vue Invité
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section>
          <h2 className="text-xl font-serif mb-4 text-white flex items-center gap-2">
            En attente
            <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full font-sans">
              {pendingProposals.length}
            </span>
          </h2>
          
          <div className="space-y-4">
            {pendingProposals.map(proposal => (
              <div key={proposal.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-medium text-white">{proposal.guestName}</h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <MessageSquare className="w-3.5 h-3.5" />
                      "{proposal.message}"
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 py-1 rounded">
                    <ThumbsUp className="w-3.5 h-3.5" />
                    {proposal.votes}
                  </div>
                </div>
                
                <div className="bg-background rounded-lg border border-border p-2 mb-4">
                  <TrackRow track={proposal.track} showCover={true} />
                </div>
                
                <div className="flex gap-2">
                  <Button className="flex-1 bg-white text-black hover:bg-white/90" onClick={() => handleApprove(proposal)}>
                    <Check className="w-4 h-4 mr-2" /> Approuver
                  </Button>
                  <Button variant="outline" className="flex-1 text-destructive hover:bg-destructive/10" onClick={() => handleReject(proposal.id)}>
                    <X className="w-4 h-4 mr-2" /> Refuser
                  </Button>
                </div>
              </div>
            ))}
            {pendingProposals.length === 0 && (
              <p className="text-muted-foreground text-sm">Aucune suggestion en attente.</p>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-serif mb-4 text-muted-foreground">Approuvées</h2>
          <div className="space-y-4 opacity-70">
            {approvedProposals.map(proposal => (
              <div key={proposal.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-white">{proposal.guestName}</h3>
                  <span className="text-xs text-primary flex items-center gap-1">
                    <Check className="w-3 h-3" /> Approuvé
                  </span>
                </div>
                <div className="bg-background rounded-lg border border-border p-2">
                  <TrackRow track={proposal.track} showCover={true} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
