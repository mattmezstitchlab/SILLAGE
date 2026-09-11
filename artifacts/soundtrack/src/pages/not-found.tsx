import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h1 className="text-4xl font-serif">404 - Page non trouvée</h1>
        <p className="text-muted-foreground mt-2 mb-4 text-center">
          La page que vous cherchez n'existe pas.
        </p>
        <Link 
          href="/"
          className="text-sm font-medium text-primary hover:underline underline-offset-4"
        >
          Retourner à l'accueil
        </Link>
      </div>
    </div>
  );
}
