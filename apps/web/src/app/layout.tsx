import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kortex AI | Neural Workspace',
  description: 'Next-generation neural AI workspace with document grounding, deep reasoning, and live citations',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-dvh antialiased font-poppins selection:bg-indigo-500/30 selection:text-indigo-200" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
