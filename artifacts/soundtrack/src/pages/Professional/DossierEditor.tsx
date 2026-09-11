import { useEffect, useRef, useState, useMemo } from 'react';
import { useLocation, useParams } from 'wouter';
import { 
  useGetProfessionalDossier, 
  useUpdateProfessionalDossier, 
  useDeleteProfessionalDossier,
  useListProfessionalClients,
  useGetProfessionalSources
} from '@workspace/api-client-react';
import { 
  ProfessionalDossier,
  ProfessionalContact,
  ProfessionalFee,
  ProfessionalChecklistItem
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Plus, Trash2, CheckCircle2, AlertCircle, Save } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

export default function DossierEditor() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const { data: dossier, isLoading } = useGetProfessionalDossier(id || '');
  const { data: clients } = useListProfessionalClients();
  const { data: sources } = useGetProfessionalSources();
  
  const updateMutation = useUpdateProfessionalDossier();
  const deleteMutation = useDeleteProfessionalDossier();

  const [formData, setFormData] = useState<ProfessionalDossier | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (dossier && (!initialized.current || formData?.id !== dossier.id)) {
      let initialChecklist = dossier.checklist || [];
      if (initialChecklist.length === 0 && sources?.sources) {
        // Pre-fill official checklist items
        initialChecklist = sources.sources.filter(s => s.official).map((s, idx) => ({
          key: `official-${idx}`,
          label: `Vérifier ${s.url}`,
          checked: false,
          sourceUrl: s.url
        }));
      }

      setFormData({
        ...dossier,
        preparatoryContacts: dossier.preparatoryContacts || [],
        fees: dossier.fees || [],
        checklist: initialChecklist
      });
      initialized.current = true;
    }
  }, [dossier, formData?.id, sources]);

  const handleSave = () => {
    if (!formData || !id) return;
    updateMutation.mutate({ dossierId: id, data: {
      name: formData.name,
      clientId: formData.clientId || undefined,
      startDate: formData.startDate,
      endDate: formData.endDate || undefined,
      pathway: formData.pathway,
      preparatoryContacts: formData.preparatoryContacts,
      fees: formData.fees,
      checklist: formData.checklist,
      revision: formData.revision
    }}, {
      onSuccess: () => {
        toast.success('Dossier enregistré');
        queryClient.invalidateQueries({ queryKey: [`/api/professional/dossiers/${id}`] });
      },
      onError: (err: any) => {
        if (err.status === 409) toast.error('Conflit de version');
        else toast.error('Erreur', { description: err?.response?.data?.error || 'Vérifiez les champs' });
      }
    });
  };

  // Contacts
  const addContact = () => {
    if (!formData) return;
    setFormData({ ...formData, preparatoryContacts: [...(formData.preparatoryContacts || []), { name: '', role: '', email: '', phone: '' }] });
  };
  const updateContact = (idx: number, updates: Partial<ProfessionalContact>) => {
    if (!formData) return;
    const newItems = [...(formData.preparatoryContacts || [])];
    newItems[idx] = { ...newItems[idx], ...updates };
    setFormData({ ...formData, preparatoryContacts: newItems });
  };
  const removeContact = (idx: number) => {
    if (!formData) return;
    setFormData({ ...formData, preparatoryContacts: (formData.preparatoryContacts || []).filter((_, i) => i !== idx) });
  };

  // Fees
  const addFee = () => {
    if (!formData) return;
    setFormData({ ...formData, fees: [...(formData.fees || []), { label: '', amountCents: 0 }] });
  };
  const updateFee = (idx: number, updates: Partial<ProfessionalFee>) => {
    if (!formData) return;
    const newItems = [...(formData.fees || [])];
    newItems[idx] = { ...newItems[idx], ...updates };
    setFormData({ ...formData, fees: newItems });
  };
  const removeFee = (idx: number) => {
    if (!formData) return;
    setFormData({ ...formData, fees: (formData.fees || []).filter((_, i) => i !== idx) });
  };

  // Checklist
  const addChecklistItem = () => {
    if (!formData) return;
    setFormData({ ...formData, checklist: [...(formData.checklist || []), { key: `custom-${Date.now()}`, label: '', checked: false }] });
  };
  const updateChecklist = (idx: number, updates: Partial<ProfessionalChecklistItem>) => {
    if (!formData) return;
    const newItems = [...(formData.checklist || [])];
    newItems[idx] = { ...newItems[idx], ...updates };
    setFormData({ ...formData, checklist: newItems });
  };
  const removeChecklist = (idx: number) => {
    if (!formData) return;
    setFormData({ ...formData, checklist: (formData.checklist || []).filter((_, i) => i !== idx) });
  };

  if (isLoading || !formData) {
    return <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const isSalaried = formData.pathway === 'salaried_employment';

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-10 pb-32">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/professional/dossiers')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="font-serif text-2xl">{formData.name}</h1>
          <p className="text-sm text-muted-foreground">
            {isSalaried ? 'Embauche salariée (GUSO)' : 'Prestation facturée'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" className="text-destructive" onClick={(e) => {
            e.preventDefault();
            if (id && confirm('Supprimer ce dossier ?')) {
              deleteMutation.mutate({ dossierId: id }, {
                onSuccess: () => {
                  toast.success('Dossier supprimé');
                  queryClient.invalidateQueries({ queryKey: ['/api/professional/dossiers'] });
                  setLocation('/professional/dossiers');
                },
                onError: () => toast.error('Erreur de suppression')
              });
            }
          }}>
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Enregistrer les modifications
          </Button>
        </div>
      </div>

      {sources && sources.notices.length > 0 && (
        <div className="mb-6 p-4 bg-muted/30 border border-border rounded-xl">
          <h3 className="text-sm font-medium flex items-center gap-2 mb-2 text-foreground">
            <AlertCircle className="w-4 h-4 text-primary" /> Notices officielles
            <span className="text-xs font-normal text-muted-foreground">(Révisé le {new Date(sources.sourceReviewDate || '').toLocaleDateString('fr-FR')})</span>
          </h3>
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            {sources.notices.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Main Info */}
        <section className="p-6 bg-card border border-border rounded-xl space-y-4">
          <h2 className="font-serif text-lg text-primary border-b border-border pb-2">Informations</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Nom du dossier *</label>
              <Input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="bg-background" />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Client assigné</label>
              <Select value={formData.clientId || "none"} onValueChange={(val) => setFormData({ ...formData, clientId: val === "none" ? undefined : val })}>
                <SelectTrigger className="bg-background"><SelectValue placeholder="Aucun" /></SelectTrigger>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Date de début *</label>
                <Input type="date" required value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} className="bg-background" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Date de fin</label>
                <Input type="date" value={formData.endDate || ''} onChange={e => setFormData({ ...formData, endDate: e.target.value })} className="bg-background" />
              </div>
            </div>
          </div>
        </section>

        {/* Fees / Cachets */}
        <section className="p-6 bg-card border border-border rounded-xl space-y-4">
          <div className="flex justify-between items-center border-b border-border pb-2">
            <h2 className="font-serif text-lg text-primary">{isSalaried ? 'Cachets & Heures' : 'Frais prévus'}</h2>
            <Button variant="ghost" size="sm" onClick={addFee}><Plus className="w-4 h-4 mr-2" /> Ajouter</Button>
          </div>
          <div className="space-y-3">
            {formData.fees?.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-start bg-background p-2 rounded border border-border">
                <div className="flex-1 space-y-2">
                  <Input 
                    placeholder="Libellé" 
                    value={item.label} 
                    onChange={e => updateFee(idx, { label: e.target.value })} 
                    className="h-8 text-sm bg-transparent"
                  />
                  <div className="flex gap-2">
                    {isSalaried ? (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Cachets</span>
                          <Input type="number" min="0" value={item.cachets || ''} onChange={e => updateFee(idx, { cachets: parseInt(e.target.value) || 0 })} className="h-7 w-20 text-sm bg-transparent" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Heures</span>
                          <Input type="number" min="0" value={item.hours || ''} onChange={e => updateFee(idx, { hours: parseInt(e.target.value) || 0 })} className="h-7 w-20 text-sm bg-transparent" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Brut (€)</span>
                          <Input type="number" min="0" step="0.01" value={item.grossFeeCents ? (item.grossFeeCents/100).toString() : ''} onChange={e => updateFee(idx, { grossFeeCents: Math.round(parseFloat(e.target.value) * 100) || 0 })} className="h-7 w-20 text-sm bg-transparent" />
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Montant HT (€)</span>
                        <Input type="number" min="0" step="0.01" value={item.amountCents ? (item.amountCents/100).toString() : ''} onChange={e => updateFee(idx, { amountCents: Math.round(parseFloat(e.target.value) * 100) || 0 })} className="h-7 w-24 text-sm bg-transparent" />
                      </div>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeFee(idx)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
            {(!formData.fees || formData.fees.length === 0) && (
              <p className="text-center text-sm text-muted-foreground py-2">Aucun élément.</p>
            )}
          </div>
        </section>

        {/* Contacts */}
        <section className="p-6 bg-card border border-border rounded-xl space-y-4">
          <div className="flex justify-between items-center border-b border-border pb-2">
            <h2 className="font-serif text-lg text-primary">Contacts Préparatoires</h2>
            <Button variant="ghost" size="sm" onClick={addContact}><Plus className="w-4 h-4 mr-2" /> Ajouter</Button>
          </div>
          <div className="space-y-3">
            {formData.preparatoryContacts?.map((c, idx) => (
              <div key={idx} className="space-y-2 bg-background p-3 rounded border border-border">
                <div className="flex justify-between gap-2">
                  <Input placeholder="Nom du contact" value={c.name} onChange={e => updateContact(idx, { name: e.target.value })} className="h-8 text-sm" />
                  <Input placeholder="Rôle (ex: Wedding Planner)" value={c.role} onChange={e => updateContact(idx, { role: e.target.value })} className="h-8 text-sm" />
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeContact(idx)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input placeholder="Email" type="email" value={c.email || ''} onChange={e => updateContact(idx, { email: e.target.value })} className="h-8 text-sm" />
                  <Input placeholder="Téléphone" value={c.phone || ''} onChange={e => updateContact(idx, { phone: e.target.value })} className="h-8 text-sm" />
                </div>
              </div>
            ))}
            {(!formData.preparatoryContacts || formData.preparatoryContacts.length === 0) && (
              <p className="text-center text-sm text-muted-foreground py-2">Aucun contact enregistré.</p>
            )}
          </div>
        </section>

        {/* Checklist */}
        <section className="p-6 bg-card border border-border rounded-xl space-y-4">
          <div className="flex justify-between items-center border-b border-border pb-2">
            <h2 className="font-serif text-lg text-primary">Checklist & Tâches</h2>
            <Button variant="ghost" size="sm" onClick={addChecklistItem}><Plus className="w-4 h-4 mr-2" /> Ajouter</Button>
          </div>
          <div className="space-y-2">
            {formData.checklist?.map((c, idx) => (
              <div key={idx} className="flex items-center gap-3 bg-background p-2 rounded border border-border">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`h-6 w-6 rounded-full border ${c.checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}
                  onClick={() => updateChecklist(idx, { checked: !c.checked })}
                >
                  {c.checked && <CheckCircle2 className="w-4 h-4" />}
                </Button>
                <div className="flex-1">
                  <Input value={c.label} onChange={e => updateChecklist(idx, { label: e.target.value })} className={`h-8 text-sm border-0 ${c.checked ? 'text-muted-foreground line-through' : ''}`} />
                  {c.sourceUrl && (
                    <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline ml-2">
                      Source officielle ↗
                    </a>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeChecklist(idx)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
            {(!formData.checklist || formData.checklist.length === 0) && (
              <p className="text-center text-sm text-muted-foreground py-2">Aucune tâche.</p>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
