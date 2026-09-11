import { useState, useEffect, useRef } from 'react';
import { useGetProfessionalProfile, useSaveProfessionalProfile, useDeleteProfessionalProfile } from '@workspace/api-client-react';
import { ProfessionalProfileInput, ProfessionalProfileInputLegalForm, ProfessionalProfileInputVatRegime } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

export default function Profile() {
  const { data: profile, isLoading } = useGetProfessionalProfile();
  const saveMutation = useSaveProfessionalProfile();
  const deleteMutation = useDeleteProfessionalProfile();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<ProfessionalProfileInput>({
    legalForm: 'ei',
    legalName: '',
    firstName: '',
    lastName: '',
    tradeName: '',
    capitalSocialCents: null,
    registrationNumber: '',
    siren: '',
    siret: '',
    address: { line1: '', line2: '', postalCode: '', city: '', country: 'FR' },
    email: '',
    phone: '',
    vatRegime: 'franchise',
    vatNumber: '',
    vatRatesBps: []
  });

  const initializedForId = useRef<string | null>(null);

  useEffect(() => {
    if (profile && initializedForId.current !== profile.id) {
      setFormData({
        legalForm: profile.legalForm,
        legalName: profile.legalName,
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        tradeName: profile.tradeName || '',
        capitalSocialCents: profile.capitalSocialCents ?? null,
        registrationNumber: profile.registrationNumber || '',
        siren: profile.siren || '',
        siret: profile.siret || '',
        address: profile.address,
        email: profile.email,
        phone: profile.phone || '',
        vatRegime: profile.vatRegime,
        vatNumber: profile.vatNumber || '',
        vatRatesBps: profile.vatRatesBps || (profile.vatRegime === 'standard' ? [2000] : []),
        revision: profile.revision
      });
      initializedForId.current = profile.id;
    }
  }, [profile]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({ data: formData }, {
      onSuccess: () => {
        toast.success('Profil enregistré');
        queryClient.invalidateQueries({ queryKey: ['/api/professional/profile'] });
      },
      onError: (err: any) => {
        toast.error('Erreur lors de l\'enregistrement', { description: err?.response?.data?.error || 'Veuillez vérifier les champs' });
      }
    });
  };

  const handleDelete = () => {
    if (confirm('Voulez-vous vraiment supprimer votre profil professionnel ? Les documents déjà émis ne seront pas affectés.')) {
      deleteMutation.mutate(undefined, {
        onSuccess: () => {
          toast.success('Profil supprimé');
          setFormData({
            legalForm: 'ei',
            legalName: '',
            tradeName: '',
            registrationNumber: '',
            siren: '',
            siret: '',
            address: { line1: '', line2: '', postalCode: '', city: '', country: 'FR' },
            email: '',
            phone: '',
            vatRegime: 'franchise',
            vatNumber: ''
          });
          initializedForId.current = null;
          queryClient.invalidateQueries({ queryKey: ['/api/professional/profile'] });
        },
        onError: () => toast.error('Erreur lors de la suppression')
      });
    }
  };

  if (isLoading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-10">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="font-serif text-3xl mb-2">Identité Professionnelle</h1>
          <p className="text-muted-foreground">Définissez les informations légales qui apparaîtront sur vos contrats et factures.</p>
        </div>
        {profile && (
          <Button variant="destructive" size="icon" onClick={handleDelete} title="Supprimer le profil">
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Identité Légale */}
        <section className="space-y-4">
          <h2 className="text-xl font-serif text-primary border-b border-border pb-2">Informations Légales</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Forme Juridique</label>
              <Select value={formData.legalForm} onValueChange={(val: any) => setFormData(p => ({ ...p, legalForm: val }))}>
                <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ei">Entreprise Individuelle (EI / Auto-entrepreneur)</SelectItem>
                  <SelectItem value="company">Société (EURL, SARL, SASU, SAS...)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.legalForm === 'ei' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Prénom *</label>
                  <Input required value={formData.firstName || ''} onChange={e => setFormData(p => ({ ...p, firstName: e.target.value }))} className="bg-background" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Nom *</label>
                  <Input required value={formData.lastName || ''} onChange={e => setFormData(p => ({ ...p, lastName: e.target.value }))} className="bg-background" />
                </div>
              </>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                {formData.legalForm === 'company' ? 'Raison Sociale *' : 'Nom Légal (Auto-entreprise) *'}
              </label>
              <Input required value={formData.legalName} onChange={e => setFormData(p => ({ ...p, legalName: e.target.value }))} className="bg-background" />
            </div>
            {formData.legalForm === 'company' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Capital Social (€)</label>
                <Input type="number" min="0" step="1" value={formData.capitalSocialCents ? formData.capitalSocialCents / 100 : ''} onChange={e => setFormData(p => ({ ...p, capitalSocialCents: e.target.value ? parseInt(e.target.value) * 100 : null }))} className="bg-background" />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Nom Commercial (Optionnel)</label>
              <Input value={formData.tradeName || ''} onChange={e => setFormData(p => ({ ...p, tradeName: e.target.value }))} className="bg-background" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">SIREN (9 chiffres)</label>
              <Input pattern="^[0-9]{9}$" value={formData.siren || ''} onChange={e => setFormData(p => ({ ...p, siren: e.target.value }))} className="bg-background" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">SIRET (14 chiffres)</label>
              <Input pattern="^[0-9]{14}$" value={formData.siret || ''} onChange={e => setFormData(p => ({ ...p, siret: e.target.value }))} className="bg-background" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Immatriculation (ex: RCS Paris)</label>
              <Input value={formData.registrationNumber || ''} onChange={e => setFormData(p => ({ ...p, registrationNumber: e.target.value }))} className="bg-background" />
            </div>
          </div>
        </section>

        {/* TVA */}
        <section className="space-y-4">
          <h2 className="text-xl font-serif text-primary border-b border-border pb-2">Régime de TVA</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Régime</label>
              <Select value={formData.vatRegime} onValueChange={(val: any) => setFormData(p => ({ ...p, vatRegime: val, vatRatesBps: val === 'standard' ? [2000] : [] }))}>
                <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="franchise">Franchise en base de TVA (0%)</SelectItem>
                  <SelectItem value="standard">Soumis à la TVA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.vatRegime === 'standard' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Numéro de TVA Intracommunautaire *</label>
                  <Input required={formData.vatRegime === 'standard'} value={formData.vatNumber || ''} onChange={e => setFormData(p => ({ ...p, vatNumber: e.target.value }))} className="bg-background" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">Taux de TVA applicables</label>
                  <div className="flex gap-4">
                    {[2000, 1000, 550, 210].map(rate => (
                      <label key={rate} className="flex items-center gap-2 text-sm text-foreground">
                        <input 
                          type="checkbox" 
                          checked={formData.vatRatesBps?.includes(rate) || false}
                          onChange={e => {
                            if (e.target.checked) {
                              setFormData(p => ({ ...p, vatRatesBps: [...(p.vatRatesBps || []), rate] }));
                            } else {
                              setFormData(p => ({ ...p, vatRatesBps: (p.vatRatesBps || []).filter(r => r !== rate) }));
                            }
                          }}
                        />
                        {(rate / 100).toFixed(1).replace('.0', '')}%
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Coordonnées */}
        <section className="space-y-4">
          <h2 className="text-xl font-serif text-primary border-b border-border pb-2">Siège Social & Contact</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-muted-foreground">Adresse (Ligne 1) *</label>
              <Input required value={formData.address.line1} onChange={e => setFormData(p => ({ ...p, address: { ...p.address, line1: e.target.value } }))} className="bg-background" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-muted-foreground">Adresse (Ligne 2)</label>
              <Input value={formData.address.line2 || ''} onChange={e => setFormData(p => ({ ...p, address: { ...p.address, line2: e.target.value } }))} className="bg-background" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Code Postal *</label>
              <Input required value={formData.address.postalCode} onChange={e => setFormData(p => ({ ...p, address: { ...p.address, postalCode: e.target.value } }))} className="bg-background" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Ville *</label>
              <Input required value={formData.address.city} onChange={e => setFormData(p => ({ ...p, address: { ...p.address, city: e.target.value } }))} className="bg-background" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Email de contact *</label>
              <Input type="email" required value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} className="bg-background" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Téléphone</label>
              <Input value={formData.phone || ''} onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))} className="bg-background" />
            </div>
          </div>
        </section>

        <div className="pt-4 flex justify-end">
          <Button type="submit" size="lg" disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Enregistrer le profil
          </Button>
        </div>
      </form>
    </div>
  );
}
