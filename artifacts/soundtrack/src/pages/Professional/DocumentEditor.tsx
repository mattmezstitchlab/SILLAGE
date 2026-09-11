import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useLocation, useParams } from 'wouter';
import { 
  useGetProfessionalDocument, 
  useUpdateProfessionalDocument, 
  useIssueProfessionalDocument,
  useCreateProfessionalCreditNote,
  useListProfessionalDocumentRevisions,
  useDeleteProfessionalDocument,
  downloadProfessionalDocument,
  useListProfessionalClients,
  useListProfessionalDossiers
} from '@workspace/api-client-react';
import { 
  ProfessionalDocument,
  ProfessionalLineItem 
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Plus, Trash2, Download, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

export default function DocumentEditor() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const { data: apiDoc, isLoading } = useGetProfessionalDocument(id || '');
  const { data: clients } = useListProfessionalClients();
  const { data: dossiers } = useListProfessionalDossiers();
  const { data: revisions } = useListProfessionalDocumentRevisions(id || '');
  
  const updateMutation = useUpdateProfessionalDocument();
  const issueMutation = useIssueProfessionalDocument();
  const creditMutation = useCreateProfessionalCreditNote();
  const deleteMutation = useDeleteProfessionalDocument();

  const [formData, setFormData] = useState<ProfessionalDocument | null>(null);
  const [downloading, setDownloading] = useState(false);
  
  const initialized = useRef(false);
  const idempotencyRef = useRef(`credit-${id}-${Math.random().toString(36).substr(2)}`);

  const hasChanges = useMemo(() => {
    if (!formData || !apiDoc) return false;
    const current = { ...formData };
    const saved = { ...apiDoc };
    return JSON.stringify(current) !== JSON.stringify(saved);
  }, [formData, apiDoc]);

  useEffect(() => {
    if (apiDoc && (!initialized.current || formData?.id !== apiDoc.id)) {
      setFormData(apiDoc);
      initialized.current = true;
    }
  }, [apiDoc, formData?.id]);

  const handleSave = () => {
    if (!formData || !id) return;
    updateMutation.mutate({ documentId: id, data: {
      type: formData.type,
      title: formData.title,
      clientId: formData.clientId || undefined,
      dossierId: formData.dossierId || undefined,
      lineItems: formData.lineItems,
      serviceDate: formData.serviceDate || undefined,
      dueDate: formData.dueDate || undefined,
      validUntil: formData.validUntil || undefined,
      discountTerms: formData.discountTerms || undefined,
      latePaymentRate: formData.latePaymentRate || undefined,
      serviceType: formData.serviceType || undefined,
      purchaseOrderNumber: formData.purchaseOrderNumber || undefined,
      paymentTerms: formData.paymentTerms || undefined,
      contractText: formData.contractText || undefined,
      notes: formData.notes || undefined,
      revision: formData.revision
    }}, {
      onSuccess: () => {
        toast.success('Brouillon enregistré');
        queryClient.invalidateQueries({ queryKey: [`/api/professional/documents/${id}`] });
      },
      onError: (err: any) => {
        if (err.status === 409) toast.error('Conflit de version', { description: 'Le document a été modifié ailleurs.' });
        else toast.error('Erreur', { description: err?.response?.data?.error || 'Vérifiez les champs' });
      }
    });
  };

  const handleIssue = () => {
    if (!formData || !apiDoc || !id || hasChanges) return;
    if (!confirm('Attention : L\'émission est irréversible. Le document sera figé et numéroté définitivement.')) return;
    
    issueMutation.mutate({ documentId: id, data: {
      revision: apiDoc.revision,
      idempotencyKey: `issue-${id}-rev-${apiDoc.revision}`,
      sourcesReviewed: true
    }}, {
      onSuccess: () => {
        toast.success('Document émis avec succès');
        queryClient.invalidateQueries({ queryKey: [`/api/professional/documents/${id}`] });
        queryClient.invalidateQueries({ queryKey: ['/api/professional/documents'] });
      },
      onError: (err: any) => {
        toast.error('Erreur d\'émission', { description: err?.response?.data?.error || 'Le profil ou le client est peut-être incomplet.' });
      }
    });
  };

  const handleDelete = () => {
    if (!id) return;
    if (confirm('Supprimer ce brouillon ?')) {
      deleteMutation.mutate({ documentId: id }, {
        onSuccess: () => {
          toast.success('Document supprimé');
          queryClient.invalidateQueries({ queryKey: ['/api/professional/documents'] });
          setLocation('/professional');
        },
        onError: () => toast.error('Erreur de suppression')
      });
    }
  };

  const handleDownload = async (rev?: number) => {
    if (!id) return;
    try {
      setDownloading(true);
      const blob = await downloadProfessionalDocument(id, rev ? { revision: rev } : undefined);
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `${apiDoc?.title || 'document'}${rev ? `-v${rev}` : ''}.pdf`;
      window.document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      window.document.body.removeChild(a);
    } catch (err) {
      toast.error('Erreur lors du téléchargement');
    } finally {
      setDownloading(false);
    }
  };

  const addLineItem = () => {
    if (!formData) return;
    setFormData({
      ...formData,
      lineItems: [...formData.lineItems, { description: '', quantity: 1, unitAmountCents: 0, taxRateBps: 0 }]
    });
  };

  const updateLineItem = (index: number, updates: Partial<ProfessionalLineItem>) => {
    if (!formData) return;
    const newItems = [...formData.lineItems];
    newItems[index] = { ...newItems[index], ...updates };
    setFormData({ ...formData, lineItems: newItems });
  };

  const removeLineItem = (index: number) => {
    if (!formData) return;
    setFormData({ ...formData, lineItems: formData.lineItems.filter((_, i) => i !== index) });
  };

  // Local calculation
  const computedTotals = useMemo(() => {
    if (!formData) return { subtotal: 0, tax: 0, total: 0 };
    let subtotal = 0;
    let tax = 0;
    formData.lineItems.forEach(item => {
      const lineSub = item.quantity * item.unitAmountCents;
      subtotal += lineSub;
      if (item.taxRateBps) {
        tax += Math.round(lineSub * (item.taxRateBps / 10000));
      }
    });
    return { subtotal, tax, total: subtotal + tax };
  }, [formData?.lineItems]);

  if (isLoading || !formData) {
    return <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const isDraft = formData.status === 'draft';

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-10 pb-32">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/professional')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="font-serif text-2xl flex items-center gap-3">
            {formData.title}
            {formData.documentNumber && <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded text-muted-foreground">{formData.documentNumber}</span>}
          </h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            {isDraft ? <><AlertCircle className="w-3 h-3"/> Brouillon</> : <><CheckCircle2 className="w-3 h-3 text-primary"/> Émis le {new Date(formData.issuedAt || '').toLocaleDateString('fr-FR')}</>}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!isDraft && (
            <Button variant="outline" onClick={() => handleDownload()} disabled={downloading}>
              {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Télécharger le PDF
            </Button>
          )}
          {isDraft && (
            <>
              <Button variant="ghost" className="text-destructive" onClick={handleDelete}><Trash2 className="w-4 h-4 mr-2" /> Supprimer</Button>
              <Button variant="outline" onClick={handleSave}><FileText className="w-4 h-4 mr-2" /> Enregistrer le brouillon</Button>
              <Button onClick={handleIssue} className="bg-primary hover:bg-primary/90 text-primary-foreground">Émettre définitivement</Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Metadata */}
          <section className="p-6 bg-card border border-border rounded-xl space-y-4">
            <h2 className="font-serif text-lg text-primary border-b border-border pb-2">Informations Générales</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Titre</label>
                <Input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} disabled={!isDraft} className="bg-background" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Type</label>
                <Select value={formData.type} onValueChange={(val: any) => setFormData({ ...formData, type: val })} disabled={!isDraft}>
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quote">Devis</SelectItem>
                    <SelectItem value="contract">Contrat</SelectItem>
                    <SelectItem value="invoice">Facture</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Client</label>
                <Select value={formData.clientId || "none"} onValueChange={(val) => setFormData({ ...formData, clientId: val === "none" ? undefined : val })} disabled={!isDraft}>
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
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Dossier</label>
                <Select value={formData.dossierId || "none"} onValueChange={(val) => setFormData({ ...formData, dossierId: val === "none" ? undefined : val })} disabled={!isDraft}>
                  <SelectTrigger className="bg-background"><SelectValue placeholder="Aucun" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- Sans dossier --</SelectItem>
                    {dossiers?.filter(d => d.pathway !== 'salaried_employment').map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Line Items */}
          <section className="p-6 bg-card border border-border rounded-xl space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-2">
              <h2 className="font-serif text-lg text-primary">Lignes de facturation</h2>
              {isDraft && (
                <Button variant="ghost" size="sm" onClick={addLineItem}><Plus className="w-4 h-4 mr-2" /> Ajouter</Button>
              )}
            </div>
            
            <div className="space-y-3">
              {formData.lineItems.map((item, idx) => (
                <div key={idx} className="flex gap-3 items-start p-3 bg-background rounded-lg border border-border">
                  <div className="flex-1 space-y-2">
                    <Input 
                      placeholder="Description" 
                      value={item.description} 
                      onChange={e => updateLineItem(idx, { description: e.target.value })} 
                      disabled={!isDraft}
                      className="bg-transparent border-0 px-1 font-medium"
                    />
                    <div className="flex gap-4 px-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Qté</span>
                        <Input 
                          type="number" min="1" step="1"
                          value={item.quantity || ''} 
                          onChange={e => updateLineItem(idx, { quantity: parseInt(e.target.value) || 0 })} 
                          disabled={!isDraft}
                          className="w-20 h-7 text-sm bg-transparent"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Prix U. HT</span>
                        <Input 
                          type="number" min="0" step="0.01"
                          value={(item.unitAmountCents / 100).toString()} 
                          onChange={e => updateLineItem(idx, { unitAmountCents: Math.round(parseFloat(e.target.value) * 100) || 0 })} 
                          disabled={!isDraft}
                          className="w-24 h-7 text-sm bg-transparent"
                        />
                        <span className="text-xs text-muted-foreground">€</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">TVA</span>
                        <Select 
                          value={(item.taxRateBps || 0).toString()} 
                          onValueChange={(val) => updateLineItem(idx, { taxRateBps: parseInt(val) })} 
                          disabled={!isDraft}
                        >
                          <SelectTrigger className="w-24 h-7 text-sm bg-transparent"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">0%</SelectItem>
                            <SelectItem value="2000">20%</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 pt-1">
                    <span className="font-medium">
                      {((item.quantity * item.unitAmountCents) / 100).toFixed(2)} €
                    </span>
                    {isDraft && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeLineItem(idx)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {formData.lineItems.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-4">Aucune ligne.</p>
              )}
            </div>

            <div className="border-t border-border pt-4 flex flex-col items-end space-y-1">
              <div className="flex justify-between w-64 text-sm text-muted-foreground">
                <span>Sous-total HT</span>
                <span>{(computedTotals.subtotal / 100).toFixed(2)} €</span>
              </div>
              <div className="flex justify-between w-64 text-sm text-muted-foreground">
                <span>TVA</span>
                <span>{(computedTotals.tax / 100).toFixed(2)} €</span>
              </div>
              <div className="flex justify-between w-64 font-medium text-lg pt-1">
                <span>Total TTC</span>
                <span>{(computedTotals.total / 100).toFixed(2)} €</span>
              </div>
              {isDraft && (
                <p className="text-xs text-muted-foreground mt-2 italic">Estimation locale avant enregistrement</p>
              )}
            </div>
          </section>

          {/* Texts */}
          <section className="p-6 bg-card border border-border rounded-xl space-y-4">
            <h2 className="font-serif text-lg text-primary border-b border-border pb-2">Conditions & Textes</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Conditions de paiement</label>
                <Textarea 
                  value={formData.paymentTerms || ''} 
                  onChange={e => setFormData({ ...formData, paymentTerms: e.target.value })} 
                  disabled={!isDraft}
                  className="bg-background min-h-[80px]"
                  placeholder="Ex: Acompte de 30% à la signature..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Notes / Mentions spécifiques</label>
                <Textarea 
                  value={formData.notes || ''} 
                  onChange={e => setFormData({ ...formData, notes: e.target.value })} 
                  disabled={!isDraft}
                  className="bg-background min-h-[80px]"
                />
              </div>
              {formData.type === 'contract' && (
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Texte du contrat</label>
                  <Textarea 
                    value={formData.contractText || ''} 
                    onChange={e => setFormData({ ...formData, contractText: e.target.value })} 
                    disabled={!isDraft}
                    className="bg-background min-h-[300px] font-mono text-sm"
                    placeholder="Texte libre du contrat. À relire/valider par le client (signature non-électronique)."
                  />
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Sidebar for Revisions & Credit notes */}
        <div className="space-y-6">
          <section className="p-5 bg-sidebar border border-border rounded-xl">
            <h3 className="font-serif text-primary border-b border-border pb-2 mb-4">Historique</h3>
            <div className="space-y-3">
              {revisions?.map((rev, idx) => (
                <div key={idx} className="flex justify-between items-center text-sm">
                  <div>
                    <span className="font-medium text-foreground">Rev {rev.revision}</span>
                    <span className="text-xs text-muted-foreground ml-2">{new Date(rev.createdAt).toLocaleString('fr-FR')}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDownload(rev.revision)} title="Télécharger cette version">
                    <Download className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              {!revisions?.length && <p className="text-xs text-muted-foreground">Aucun historique</p>}
            </div>
          </section>

          {!isDraft && formData.type === 'invoice' && (
            <section className="p-5 bg-card border border-border rounded-xl space-y-4">
              <h3 className="font-serif text-primary border-b border-border pb-2">Avoirs</h3>
              <p className="text-xs text-muted-foreground mb-3">En cas d'erreur ou d'annulation, vous pouvez émettre un avoir lié à cette facture.</p>
              
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">Créer un avoir</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md bg-card border-border">
                  <DialogHeader>
                    <DialogTitle className="font-serif text-xl">Émettre un avoir</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const target = e.target as typeof e.target & {
                      amount: { value: string };
                      title: { value: string };
                      reason: { value: string };
                    };
                    creditMutation.mutate({
                      documentId: apiDoc!.id,
                      data: {
                        amountCents: Math.round(parseFloat(target.amount.value) * 100),
                        title: target.title.value,
                        reason: target.reason.value,
                        idempotencyKey: idempotencyRef.current,
                        sourcesReviewed: true
                      }
                    }, {
                      onSuccess: () => {
                        toast.success('Avoir émis');
                        idempotencyRef.current = `credit-${id}-${Math.random().toString(36).substr(2)}`;
                        queryClient.invalidateQueries({ queryKey: ['/api/professional/documents'] });
                      },
                      onError: (err: any) => toast.error('Erreur', { description: err?.response?.data?.error || 'Montant invalide.' })
                    });
                  }} className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">Montant TTC de l'avoir (€) *</label>
                      <Input name="amount" type="number" step="0.01" max={formData.totalCents / 100} required className="bg-background" />
                      <p className="text-xs text-muted-foreground">Maximum : {(formData.totalCents / 100).toFixed(2)} €</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">Titre de l'avoir *</label>
                      <Input name="title" required placeholder="Ex: Annulation partielle" className="bg-background" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">Motif</label>
                      <Textarea name="reason" className="bg-background" />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                      <DialogClose asChild><Button variant="ghost" type="button">Annuler</Button></DialogClose>
                      <Button type="submit" disabled={creditMutation.isPending}>
                        {creditMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Émettre l'avoir
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
