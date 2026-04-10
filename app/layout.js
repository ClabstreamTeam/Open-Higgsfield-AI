import './globals.css';

export const metadata = {
  title: 'Clabstream AI Studio',
  description: 'Internal Clabstream studio interface for team review while provider-backed generation is temporarily unavailable.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
