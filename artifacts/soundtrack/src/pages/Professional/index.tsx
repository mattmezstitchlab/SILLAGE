import { Route, Switch, useLocation, Link } from 'wouter';
import { Briefcase, Users, FileText, User, ChevronLeft, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

import Overview from './Overview';
import Profile from './Profile';
import Clients from './Clients';
import Dossiers from './Dossiers';
import DossierEditor from './DossierEditor';
import DocumentEditor from './DocumentEditor';
import { useClerk } from '@clerk/react';
import { OwnerThemeProvider } from '@/lib/theme';

export function ProfessionalLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();

  const nav = [
    { href: '/professional', label: 'Vue d\'ensemble', icon: Briefcase, exact: true },
    { href: '/professional/dossiers', label: 'Dossiers', icon: FileText, exact: false },
    { href: '/professional/clients', label: 'Clients', icon: Users, exact: false },
    { href: '/professional/profile', label: 'Profil', icon: User, exact: false },
  ];

  return (
    <OwnerThemeProvider>
      <div className="min-h-[100dvh] bg-background text-foreground flex flex-col md:flex-row">
        {/* Sidebar */}
        <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-border flex flex-col">
          <div className="p-6">
            <Link href="/app" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm font-medium transition-colors mb-6">
              <ChevronLeft className="w-4 h-4" />
              Retour à la musique
            </Link>
            <h1 className="font-serif text-2xl tracking-widest text-primary font-semibold mb-1">PRO</h1>
            <p className="text-xs text-muted-foreground uppercase tracking-[0.2em]">Gestion</p>
          </div>
          <nav className="flex-1 px-4 space-y-1">
            {nav.map((item) => {
              const isActive = item.exact ? location === item.href : location.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    isActive 
                      ? 'bg-primary/10 text-primary' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="p-4 border-t border-border">
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={() => void signOut()}>
              Se déconnecter
            </Button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </main>
      </div>
    </OwnerThemeProvider>
  );
}

export default function ProfessionalRoutes() {
  return (
    <ProfessionalLayout>
      <Switch>
        <Route path="/professional" component={Overview} />
        <Route path="/professional/profile" component={Profile} />
        <Route path="/professional/clients" component={Clients} />
        <Route path="/professional/dossiers/:id" component={DossierEditor} />
        <Route path="/professional/dossiers" component={Dossiers} />
        <Route path="/professional/documents/:id" component={DocumentEditor} />
      </Switch>
    </ProfessionalLayout>
  );
}
