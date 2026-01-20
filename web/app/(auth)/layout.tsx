export const dynamic = "force-dynamic";

/**
 * Auth Layout - Landing page wrapper
 * 
 * Provides a full-screen layout with modern gradient background
 * for the login/landing page. Features:
 * - Animated gradient background with fintech-appropriate colors
 * - Decorative floating orbs for visual depth
 * - Responsive centering with proper padding
 * - Smooth fade-in animation for content
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Gradient background - fintech blue/purple theme */}
      <div 
        className="absolute inset-0 bg-linear-to-br from-slate-900 via-slate-800 to-slate-900"
        aria-hidden="true"
      />
      
      {/* Animated gradient orbs for visual interest */}
      <div 
        className="absolute top-0 -left-40 h-[500px] w-[500px] rounded-full bg-linear-to-r from-blue-600/30 to-cyan-500/20 blur-3xl"
        aria-hidden="true"
      />
      <div 
        className="absolute bottom-0 -right-40 h-[600px] w-[600px] rounded-full bg-linear-to-l from-violet-600/25 to-purple-500/15 blur-3xl"
        aria-hidden="true"
      />
      <div 
        className="absolute top-1/2 left-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-linear-to-t from-emerald-500/10 to-teal-400/10 blur-3xl"
        aria-hidden="true"
      />
      
      {/* Grid pattern overlay for texture */}
      <div 
        className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-size-[64px_64px]"
        aria-hidden="true"
      />
      
      {/* Main content container with responsive padding */}
      <div className="relative z-10 flex min-h-screen w-full items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="w-full max-w-5xl animate-in fade-in duration-700">
          {children}
        </div>
      </div>
    </div>
  );
}
