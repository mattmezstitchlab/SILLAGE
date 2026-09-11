import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster as SonnerToaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

import { SillageProvider } from '@/lib/store';
import { Layout } from '@/components/Layout';

import Library from '@/pages/Library';
import Search from '@/pages/Search';
import PlaylistView from '@/pages/Playlist';
import TimelineView from '@/pages/Timeline';
import DJView from '@/pages/DJ';
import Collaborate from '@/pages/Collaborate';
import GuestView from '@/pages/Guest';

const queryClient = new QueryClient();

function Router() {
  const [location] = useLocation();
  
  // Guest view doesn't use the main Layout with sidebar
  if (location === '/guest') {
    return (
      <RoutedErrorBoundary>
        <GuestView />
      </RoutedErrorBoundary>
    );
  }

  return (
    <RoutedErrorBoundary>
      <Layout>
        <Switch>
          <Route path="/" component={Library} />
          <Route path="/search" component={Search} />
          <Route path="/playlist/:id" component={PlaylistView} />
          <Route path="/timeline" component={TimelineView} />
          <Route path="/dj" component={DJView} />
          <Route path="/collaborate" component={Collaborate} />
          <Route component={NotFound} />
        </Switch>
      </Layout>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SillageProvider>
          {/* Using hash routing if needed for static hosting, but requested base URL safe */}
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
        </SillageProvider>
        <SonnerToaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
