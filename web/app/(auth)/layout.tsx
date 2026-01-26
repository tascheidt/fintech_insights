import { AuthHeader } from "@/components/auth/AuthHeader";

export const dynamic = "force-dynamic";

/**
 * Auth Layout - Landing page wrapper
 * 
 * Provides a clean, minimal layout with a top header and centered content.
 * Follows a "Notion-like" aesthetic with generous whitespace and clean typography.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen w-full bg-background text-foreground selection:bg-primary/10 selection:text-primary">
      <AuthHeader />
      
      {/* Main content container with responsive padding */}
      <div className="relative z-10 flex min-h-screen w-full flex-col items-center justify-center pt-16 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-5xl animate-in fade-in duration-700">
          {children}
        </div>
      </div>
    </div>
  );
}
