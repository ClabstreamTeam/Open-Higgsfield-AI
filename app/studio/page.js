import StandaloneShell from '@/components/StandaloneShell';

export const metadata = {
  title: 'Clabstream AI Studio',
};

export default function StudioPage() {
  const publicAppUrl = process.env.NEXT_PUBLIC_PUBLIC_APP_URL;

  if (process.env.GITHUB_ACTIONS === 'true' && publicAppUrl) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="max-w-xl text-center space-y-4">
          <meta httpEquiv="refresh" content={`0;url=${publicAppUrl}`} />
          <h1 className="text-3xl font-bold">Redirecting to Clabstream AI Studio</h1>
          <p className="text-white/70">
            The live app now runs on a server-backed deployment so public image generation works.
          </p>
          <a className="text-lime-300 underline" href={publicAppUrl}>
            Open the live app
          </a>
        </div>
      </main>
    );
  }

  return <StandaloneShell />;
}
