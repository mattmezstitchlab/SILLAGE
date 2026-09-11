import { useState } from 'react';
import { useListProfessionalClients, useCreateProfessionalClient, useUpdateProfessionalClient, useDeleteProfessionalClient } from '@workspace/api-client-react';
import { ProfessionalClientInput, ProfessionalClientInputKind } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Plus, Building2, User, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

export default function Clients() {
  const { data: clients, isLoading } = useListProfessionalClients();
  const createMutation = useCreateProfessionalClient();
  const updateMutation = useUpdateProfessionalClient();
  const deleteMutation = useDeleteProfessionalClient();
  const queryClient = useQueryClient();
  
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProfessionalClientInput>({
    kind: 'individual',
    firstName: '',
    lastName: '',
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    address: { line1: '', line2: '', postalCode: '', city: '', country: 'FR' },
    vatNumber: ''
  });

  const openEdit = (client: any) => {
    setEditingId(client.id);
    setFormData({
      kind: client.kind,
      firstName: client.firstName || '',
      lastName: client.lastName || '',
      companyName: client.companyName || '',
      contactName: client.contactName || '',
      email: client.email || '',
      phone: client.phone || '',
      address: client.address,
      vatNumber: client.vatNumber || ''
    });
    setOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    setFormData({
      kind: 'individual',
      firstName: '', lastName: '', companyName: '', contactName: '', email: '', phone: '',
      address: { line1: '', line2: '', postalCode: '', city: '', country: 'FR' }, vatNumber: ''
    });
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ clientId: editingId, data: formData }, {
        onSuccess: () => {
          toast.success('Client modifié');
          setOpen(false);
          queryClient.invalidateQueries({ queryKey: ['/api/professional/clients'] });
        },
        onError: (err: any) => toast.error('Erreur', { description: err?.response?.data?.error || 'Vérifiez les champs' })
      });
    } else {
      createMutation.mutate({ data: formData }, {
        onSuccess: () => {
          toast.success('Client ajouté');
          setOpen(false);
          queryClient.invalidateQueries({ queryKey: ['/api/professional/clients'] });
        },
        onError: (err: any) => toast.error('Erreur', { description: err?.response?.data?.error || 'Vérifiez les champs' })
      });
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Supprimer ce client ?')) {
      deleteMutation.mutate({ clientId: id }, {
        onSuccess: () => {
          toast.success('Client supprimé');
          queryClient.invalidateQueries({ queryKey: ['/api/professional/clients'] });
        },
        onError: () => toast.error('Erreur de suppression')
      });
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-10">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="font-serif text-3xl mb-2">Clients</h1>
          <p className="text-muted-foreground">Gérez vos clients particuliers et professionnels.</p>
        </div>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Nouveau Client</Button>
          <DialogContent className="max-w-2xl bg-card border-border overflow-y-auto max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="font-serif text-xl">{editingId ? 'Modifier le client' : 'Ajouter un client'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6 pt-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Type de client</label>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setFormData(p => ({ ...p, kind: 'individual' }))}
                      className={`flex-1 p-3 rounded-lg border text-left transition-colors flex items-center gap-3 ${formData.kind === 'individual' ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border text-muted-foreground'}`}
                    >
                      <User className="w-5 h-5" /> Particulier
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(p => ({ ...p, kind: 'business' }))}
                      className={`flex-1 p-3 rounded-lg border text-left transition-colors flex items-center gap-3 ${formData.kind === 'business' ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border text-muted-foreground'}`}
                    >
                      <Building2 className="w-5 h-5" /> Professionnel
                    </button>
                  </div>
                </div>

                {formData.kind === 'individual' ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">Prénom *</label>
                      <Input required value={formData.firstName || ''} onChange={e => setFormData(p => ({ ...p, firstName: e.target.value }))} className="bg-background" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">Nom *</label>
                      <Input required value={formData.lastName || ''} onChange={e => setFormData(p => ({ ...p, lastName: e.target.value }))} className="bg-background" />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2">
                      <label className="text-sm text-muted-foreground">Raison Sociale *</label>
                      <Input required value={formData.companyName || ''} onChange={e => setFormData(p => ({ ...p, companyName: e.target.value }))} className="bg-background" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">Nom du contact</label>
                      <Input value={formData.contactName || ''} onChange={e => setFormData(p => ({ ...p, contactName: e.target.value }))} className="bg-background" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">Numéro de TVA Intracommunautaire</label>
                      <Input value={formData.vatNumber || ''} onChange={e => setFormData(p => ({ ...p, vatNumber: e.target.value }))} className="bg-background" />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Email</label>
                    <Input type="email" value={formData.email || ''} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} className="bg-background" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Téléphone</label>
                    <Input value={formData.phone || ''} onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))} className="bg-background" />
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-primary mt-4 border-b border-border pb-1">Adresse de facturation</h3>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div className="space-y-2 col-span-2">
                      <label className="text-sm text-muted-foreground">Ligne 1 *</label>
                      <Input required value={formData.address.line1} onChange={e => setFormData(p => ({ ...p, address: { ...p.address, line1: e.target.value } }))} className="bg-background" />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <label className="text-sm text-muted-foreground">Ligne 2</label>
                      <Input value={formData.address.line2 || ''} onChange={e => setFormData(p => ({ ...p, address: { ...p.address, line2: e.target.value } }))} className="bg-background" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">Code Postal *</label>
                      <Input required value={formData.address.postalCode} onChange={e => setFormData(p => ({ ...p, address: { ...p.address, postalCode: e.target.value } }))} className="bg-background" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">Ville *</label>
                      <Input required value={formData.address.city} onChange={e => setFormData(p => ({ ...p, address: { ...p.address, city: e.target.value } }))} className="bg-background" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <DialogClose asChild><Button variant="ghost" type="button">Annuler</Button></DialogClose>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingId ? 'Enregistrer' : 'Ajouter'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : !clients?.length ? (
        <div className="text-center p-12 border border-dashed border-border rounded-xl bg-card/30">
          <p className="text-muted-foreground mb-4">Aucun client pour le moment.</p>
          <Button onClick={() => setOpen(true)} variant="outline">Ajouter mon premier client</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {clients.map(client => (
            <div 
              key={client.id} 
              className="p-5 border border-border rounded-xl bg-card hover:border-primary/50 transition-colors flex justify-between items-start group cursor-pointer"
              onClick={() => openEdit(client)}
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {client.kind === 'individual' ? <User className="w-4 h-4 text-primary" /> : <Building2 className="w-4 h-4 text-primary" />}
                  <h3 className="font-medium text-foreground">
                    {client.kind === 'individual' ? `${client.firstName} ${client.lastName}` : client.companyName}
                  </h3>
                </div>
                {client.kind === 'business' && client.contactName && <p className="text-sm text-muted-foreground mb-1">Contact: {client.contactName}</p>}
                <p className="text-sm text-muted-foreground">{client.address.city} ({client.address.postalCode})</p>
                <div className="mt-3 text-xs text-muted-foreground flex gap-3">
                  {client.email && <span>{client.email}</span>}
                  {client.phone && <span>{client.phone}</span>}
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="opacity-0 group-hover:opacity-100 text-destructive transition-opacity" 
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(client.id);
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
