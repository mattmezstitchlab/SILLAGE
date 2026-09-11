import { type ReactNode, useEffect, useRef } from 'react';
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { dark } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster as SonnerToaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import NotFound from '@/pages/not-found';
import { Link, Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { SillageProvider, useSillage } from '@/lib/store';
import { Layout } from '@/components/Layout';
import Library from '@/pages/Library';
import Search from '@/pages/Search';
import PlaylistView from '@/pages/Playlist';
import TimelineView from '@/pages/Timeline';
import DJView from '@/pages/DJ';
import Collaborate from '@/pages/Collaborate';
import GuestView from '@/pages/Guest';
import OwnerDJTransfers from '@/pages/DJTransfers/OwnerView';
import RecipientInbox from '@/pages/DJTransfers/RecipientInbox';
import RecipientDetail from '@/pages/DJTransfers/RecipientDetail';
import Appearance from '@/pages/Appearance';
import { OwnerThemeProvider } from '@/lib/theme';

const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const queryClient = new QueryClient();
function stripBase(path: string): string { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
const clerkAppearance = {
  theme: dark,
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: { colorPrimary: '#d6aa68', colorForeground: '#f8f5ef', colorMutedForeground: '#b7afa3', colorBackground: '#151310', colorInput: '#211e19', colorInputForeground: '#f8f5ef', colorNeutral: '#4a443a', fontFamily: 'inherit', borderRadius: '0.75rem' },
  elements: { rootBox: 'w-full flex justify-center', cardBox: 'bg-[#151310] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#4a443a]', card: '!shadow-none !border-0 !bg-transparent !rounded-none', footer: '!shadow-none !border-0 !bg-transparent !rounded-none', headerTitle: 'text-foreground', headerSubtitle: 'text-[#b7afa3]', socialButtonsBlockButtonText: 'text-foreground', formFieldLabel: 'text-foreground', footerActionLink: 'text-[#d6aa68]', footerActionText: 'text-[#b7afa3]', dividerText: 'text-[#b7afa3]', formButtonPrimary: 'bg-[#d6aa68] text-black', formFieldInput: 'bg-[#211e19] text-foreground border-[#4a443a]', footerAction: 'bg-transparent', dividerLine: 'bg-[#4a443a]', alert: 'bg-[#211e19]', alertText: 'text-foreground', main: 'bg-transparent' },
};
function Landing() {
  return <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6"><div className="max-w-xl text-center"><p className="text-primary tracking-[.35em] text-xs mb-5">SILLAGE · OS MUSICAL</p><h1 className="font-serif text-5xl text-foreground mb-5">La bande-son de votre histoire.</h1><p className="text-muted-foreground text-lg mb-8">Préparez vos sélections, vos moments et les suggestions de vos invités dans un espace privé synchronisé.</p><div className="flex justify-center gap-3"><Link href="/sign-up"><Button>Créer mon espace</Button></Link><Link href="/sign-in"><Button variant="outline">Se connecter</Button></Link></div><p className="text-xs text-muted-foreground mt-6">Les aperçus du catalogue sont fournis par iTunes Store. Vos fichiers restent privés.</p><div className="mt-12 pt-8 border-t border-border flex flex-col items-center"><p className="text-sm text-muted-foreground mb-4">Vous êtes DJ et un couple a partagé ses fichiers avec vous ?</p><Link href="/dj-transfers"><Button variant="ghost">Accéder à mes transferts reçus</Button></Link></div></div></main>;
}
function getFullRedirectUrl(param: string | null) {
  if (!param) return undefined;
  if (param.startsWith('http')) return param;
  if (basePath && !param.startsWith(basePath)) return `${basePath}${param}`;
  return param;
}
function SignInPage() { 
  const redirectUrl = getFullRedirectUrl(new URLSearchParams(window.location.search).get('redirect_url'));
  return <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={redirectUrl} /></div>; 
}
function SignUpPage() { 
  const redirectUrl = getFullRedirectUrl(new URLSearchParams(window.location.search).get('redirect_url'));
  return <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={redirectUrl} /></div>; 
}
function RoutedErrorBoundary({children}:{children:ReactNode}) { const [location] = useLocation(); return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>; }

function RecipientProtected({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out"><Redirect to={`/sign-in?redirect_url=${encodeURIComponent(location)}`} /></Show>
    </>
  );
}

function RecipientApp() {
  return (
    <RecipientProtected>
      <div className="min-h-screen bg-background text-foreground">
        <Switch>
          <Route path="/dj-transfers" component={RecipientInbox} />
          <Route path="/dj-transfers/:id" component={RecipientDetail} />
        </Switch>
      </div>
    </RecipientProtected>
  );
}

function OwnerShell() {
  const { loading, events, createEvent, importPrototype, error } = useSillage();
  if (loading) return <div className="min-h-screen bg-background text-muted-foreground flex items-center justify-center">Chargement de votre espace…</div>;
  if (!events.length) return <main className="min-h-screen bg-background flex items-center justify-center p-6"><div className="max-w-md text-center"><h1 className="font-serif text-4xl text-foreground mb-3">Votre premier événement</h1><p className="text-muted-foreground mb-6">Commencez avec une bibliothèque vide, ou importez explicitement l’ancien prototype stocké dans ce navigateur.</p>{error && <p className="text-destructive text-sm mb-3">{error}</p>}<div className="flex justify-center gap-3"><Button onClick={() => void createEvent('Mon événement')}>Créer un événement vide</Button><Button variant="outline" onClick={() => void importPrototype()}>Importer le prototype local</Button></div><div className="mt-12 pt-8 border-t border-border"><h2 className="text-sm font-serif text-muted-foreground mb-4">VOUS ÊTES DJ ?</h2><Link href="/dj-transfers"><Button variant="secondary" className="w-full">Accéder aux transferts reçus</Button></Link></div></div></main>;
  return <OwnerThemeProvider><Layout><Switch><Route path="/app" component={Library}/><Route path="/app/search" component={Search}/><Route path="/app/playlist/:id" component={PlaylistView}/><Route path="/app/timeline" component={TimelineView}/><Route path="/app/dj" component={DJView}/><Route path="/app/dj-transfers" component={OwnerDJTransfers}/><Route path="/app/collaborate" component={Collaborate}/><Route path="/app/appearance" component={Appearance}/><Route component={NotFound}/></Switch></Layout></OwnerThemeProvider>;
}
function OwnerApp() { 
  const { user } = useUser();
  return <SillageProvider key={user?.id}><OwnerShell /></SillageProvider>; 
}
function HomeRedirect() { return <><Show when="signed-in"><Redirect to="/app" /></Show><Show when="signed-out"><Landing /></Show></>; }
function ProtectedApp() { return <><Show when="signed-in"><OwnerApp /></Show><Show when="signed-out"><Redirect to="/" /></Show></>; }
function ClerkQueryClientCacheInvalidator() { const { addListener } = useClerk(); const client=useQueryClient(); const prior=useRef<string|null|undefined>(undefined); useEffect(()=>addListener(({user})=>{const id=user?.id??null;if(prior.current!==undefined&&prior.current!==id)client.clear();prior.current=id;}),[addListener,client]); return null; }
function Routes() { return <RoutedErrorBoundary><Switch><Route path="/" component={HomeRedirect}/><Route path="/sign-in/*?" component={SignInPage}/><Route path="/sign-up/*?" component={SignUpPage}/><Route path="/dj-transfers/*?" component={RecipientApp}/><Route path="/app/*?" component={ProtectedApp}/><Route path="/guest/:token" component={GuestView}/><Route component={NotFound}/></Switch></RoutedErrorBoundary>; }
function ProviderRoutes() { const [,setLocation]=useLocation(); return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{signIn:{start:{title:'Bon retour',subtitle:'Connectez-vous à votre espace Sillage'}},signUp:{start:{title:'Créer votre espace',subtitle:'Composez la bande-son de votre histoire'}}}} routerPush={(to)=>setLocation(stripBase(to))} routerReplace={(to)=>setLocation(stripBase(to),{replace:true})}><QueryClientProvider client={queryClient}><ClerkQueryClientCacheInvalidator/><Routes/></QueryClientProvider></ClerkProvider>; }
export default function App() { return <TooltipProvider><WouterRouter base={basePath}><ProviderRoutes/></WouterRouter><SonnerToaster/></TooltipProvider>; }