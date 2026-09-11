import { useListProfessionalDocuments, useListProfessionalClients, useListProfessionalDossiers, useCreateProfessionalDocument } from '@workspace/api-client-react';
import { ProfessionalDocumentInputType, ProfessionalDocumentInput } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';

export default function Overview() {
  const { data: documents, isLoading: docsLoading } = useListProfessionalDocuments();
  const { data: clients } = useListProfessionalClients();
  const { data: dossiers } = useListProfessionalDossiers();
  const createMutation = useCreateProfessionalDocument();
  const [, setLocation] = useLocation();

  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<ProfessionalDocumentInput>>({
    type: 'quote',
    title: '',
    lineItems: []
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.type) return;
    createMutation.mutate({ data: {
      type: formData.type as ProfessionalDocumentInputType,
      title: formData.title,
      clientId: formData.clientId || undefined,
      dossierId: formData.dossierId || undefined,
      lineItems: []
    }}, {
      onSuccess: (res) => {
        toast.success('Document créé');
        setOpen(false);
        setLocation(`/professional/documents/${res.id}`);
      },
      onError: () => toast.error('Erreur lors de la création')
    });
  };

  const getClientName = (id?: string | null) => {
    if (!id) return 'Sans client';
    const c = clients?.find(c => c.id === id);
    if (!c) return 'Client inconnu';
    return c.kind === 'individual' ? `${c.firstName} ${c.lastName}` : c.companyName;
  };

  const getTypeLabel = (type: string) => {
    switch(type) {
      case 'quote': return 'Devis';
      case 'contract': return 'Contrat';
      case 'invoice': return 'Facture';
      default: return type;
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-10">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="font-serif text-3xl mb-2">Documents</h1>
          <p className="text-muted-foreground">Devis, contrats et factures.</p>
        </div>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Nouveau Document</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md bg-card border-border">
            <DialogHeader>
              <DialogTitle className="font-serif text-xl">Créer un document</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6 pt-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Type de document</label>
                  <Select value={formData.type} onValueChange={(val) => setFormData(p => ({ ...p, type: val as ProfessionalDocumentInputType }))}>
                    <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quote">Devis</SelectItem>
                      <SelectItem value="contract">Contrat</SelectItem>
                      <SelectItem value="invoice">Facture</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Titre *</label>
                  <Input required placeholder="Ex: Devis sonorisation" value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} className="bg-background" />
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

                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Dossier assigné</label>
                  <Select value={formData.dossierId || "none"} onValueChange={(val) => setFormData(p => ({ ...p, dossierId: val === "none" ? undefined : val }))}>
                    <SelectTrigger className="bg-background"><SelectValue placeholder="Aucun dossier" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Sans dossier --</SelectItem>
                      {dossiers?.filter(d => d.pathway !== 'salaried_employment').map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <DialogClose asChild><Button variant="ghost" type="button">Annuler</Button></DialogClose>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Créer le brouillon
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {docsLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : !documents?.length ? (
        <div className="text-center p-12 border border-dashed border-border rounded-xl bg-card/30">
          <p className="text-muted-foreground mb-4">Aucun document pour le moment.</p>
          <Button onClick={() => setOpen(true)} variant="outline">Créer mon premier document</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {documents.map(doc => (
            <div 
              key={doc.id} 
              className="p-4 border border-border rounded-lg bg-card hover:border-primary/50 transition-colors flex items-center justify-between group cursor-pointer"
              onClick={() => setLocation(`/professional/documents/${doc.id}`)}
            >
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-md ${doc.status === 'draft' ? 'bg-muted/50 text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground flex items-center gap-2">
                    {doc.title}
                    {doc.documentNumber && <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{doc.documentNumber}</span>}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {getTypeLabel(doc.type)} • {getClientName(doc.clientId)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-right">
                <div>
                  <p className="font-medium text-foreground">{(doc.totalCents / 100).toFixed(2)} €</p>
                  <p className="text-xs text-muted-foreground capitalize flex items-center justify-end gap-1">
                    {doc.status === 'draft' ? (
                      <><AlertCircle className="w-3 h-3" /> Brouillon</>
                    ) : (
                      <><CheckCircle2 className="w-3 h-3 text-primary" /> Émis</>
                    )}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
