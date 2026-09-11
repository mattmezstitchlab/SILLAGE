import { useState } from 'react';
import { useListProfessionalDossiers, useCreateProfessionalDossier, useDeleteProfessionalDossier, useListProfessionalClients } from '@workspace/api-client-react';
import { ProfessionalDossierInput, ProfessionalDossierInputPathway } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Plus, Briefcase, FileText, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';

export default function Dossiers() {
  const [, setLocation] = useLocation();
  const { data: dossiers, isLoading } = useListProfessionalDossiers();
  const { data: clients } = useListProfessionalClients();
  const createMutation = useCreateProfessionalDossier();
  const deleteMutation = useDeleteProfessionalDossier();
  const queryClient = useQueryClient();
  
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<ProfessionalDossierInput>({
    name: '',
    clientId: '',
    startDate: new Date().toISOString().split('T')[0],
    pathway: 'invoiced_service'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ data: {
      ...formData,
      clientId: formData.clientId || null
    }}, {
      onSuccess: () => {
        toast.success('Dossier créé');
        setOpen(false);
        queryClient.invalidateQueries({ queryKey: ['/api/professional/dossiers'] });
        setFormData({
          name: '',
          clientId: '',
          startDate: new Date().toISOString().split('T')[0],
          pathway: 'invoiced_service'
        });
      },
      onError: (err: any) => {
        toast.error('Erreur', { description: err?.response?.data?.error || 'Vérifiez les champs' });
      }
    });
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (confirm('Supprimer ce dossier ? Les documents liés ne seront pas supprimés mais perdront leur référence au dossier.')) {
      deleteMutation.mutate({ dossierId: id }, {
        onSuccess: () => {
          toast.success('Dossier supprimé');
          queryClient.invalidateQueries({ queryKey: ['/api/professional/dossiers'] });
        },
        onError: () => toast.error('Erreur de suppression')
      });
    }
  };

  const getClientName = (clientId?: string | null) => {
    if (!clientId) return 'Sans client assigné';
    const client = clients?.find(c => c.id === clientId);
    if (!client) return 'Client inconnu';
    return client.kind === 'individual' ? `${client.firstName} ${client.lastName}` : client.companyName;
  };

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-10">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="font-serif text-3xl mb-2">Dossiers</h1>
          <p className="text-muted-foreground">Regroupez vos contrats, factures et notes de préparation par événement.</p>
        </div>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Nouveau Dossier</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl bg-card border-border">
            <DialogHeader>
              <DialogTitle className="font-serif text-xl">Créer un dossier</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6 pt-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Nom du dossier *</label>
                  <Input required placeholder="Ex: Mariage Sophie & Thomas" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} className="bg-background" />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Type de relation (Pathway)</label>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setFormData(p => ({ ...p, pathway: 'invoiced_service' }))}
                      className={`flex-1 p-3 rounded-lg border text-left transition-colors flex items-center gap-3 ${formData.pathway === 'invoiced_service' ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border text-muted-foreground'}`}
                    >
                      <Briefcase className="w-5 h-5" /> Prestation facturée
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(p => ({ ...p, pathway: 'salaried_employment' }))}
                      className={`flex-1 p-3 rounded-lg border text-left transition-colors flex items-center gap-3 ${formData.pathway === 'salaried_employment' ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border text-muted-foreground'}`}
                    >
                      <FileText className="w-5 h-5" /> Embauche salariée (GUSO)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Date de début *</label>
                    <Input type="date" required value={formData.startDate} onChange={e => setFormData(p => ({ ...p, startDate: e.target.value }))} className="bg-background" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Date de fin</label>
                    <Input type="date" value={formData.endDate || ''} onChange={e => setFormData(p => ({ ...p, endDate: e.target.value }))} className="bg-background" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Client assigné</label>
                  <Select value={formData.clientId || "none"} onValueChange={(val) => setFormData(p => ({ ...p, clientId: val === "none" ? undefined : val }))}>
                    <SelectTrigger className="bg-background"><SelectValue placeholder="Aucun client" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Sans client --</SelectItem>
                      {clients?.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.kind === 'individual' ? `${c.firstName} ${c.lastName}` : c.companyName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <DialogClose asChild><Button variant="ghost" type="button">Annuler</Button></DialogClose>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Créer
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : !dossiers?.length ? (
        <div className="text-center p-12 border border-dashed border-border rounded-xl bg-card/30">
          <p className="text-muted-foreground mb-4">Aucun dossier pour le moment.</p>
          <Button onClick={() => setOpen(true)} variant="outline">Créer mon premier dossier</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dossiers.map(dossier => (
            <div 
              key={dossier.id} 
              className="p-5 border border-border rounded-xl bg-card hover:border-primary/50 transition-colors flex justify-between items-start group cursor-pointer h-full"
              onClick={() => setLocation(`/professional/dossiers/${dossier.id}`)}
            >
              <div>
                <div className="flex items-center gap-2 mb-2">
                  {dossier.pathway === 'invoiced_service' ? <Briefcase className="w-4 h-4 text-primary" /> : <FileText className="w-4 h-4 text-primary" />}
                  <h3 className="font-medium text-foreground">{dossier.name}</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{getClientName(dossier.clientId)}</p>
                <div className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold bg-background text-muted-foreground">
                  {new Date(dossier.startDate).toLocaleDateString('fr-FR')}
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="opacity-0 group-hover:opacity-100 text-destructive transition-opacity" 
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(e, dossier.id);
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
