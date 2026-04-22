import React, { useState, useEffect } from 'react';
import { ArrowRight, Monitor, Volume2, Building2 } from 'lucide-react';

interface Props
{
  onJoin: (name: string) => void;
}

const TIPS = [
  { icon: <Monitor className="w-4 h-4" />, text: 'Move with WASD or double-click to walk' },
  { icon: <Building2 className="w-4 h-4" />, text: 'Walk into specific rooms for meetings' },
  { icon: <Volume2 className="w-4 h-4" />, text: 'Spatial audio — voices fade with distance' },
];

export default function JoinScreen({ onJoin }: Props)
{
  const [name, setName] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() =>
  {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = (e: React.FormEvent) =>
  {
    e.preventDefault();
    if (name.trim()) onJoin(name.trim());
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-[var(--color-bg-primary)] relative overflow-hidden font-sans text-[var(--color-text-primary)]">

      {/* Premium Background Grid (Matches OfficeCanvas) */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, var(--color-border-light) 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Subtle glowing orbs in the background */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--color-accent)] rounded-full mix-blend-multiply filter blur-[128px] opacity-10 animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[var(--color-accent-blue)] rounded-full mix-blend-multiply filter blur-[128px] opacity-10 animate-pulse" style={{ animationDelay: '2s' }} />

      <div
        className="w-full max-w-md mx-4 relative z-10 flex flex-col"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(20px)',
          transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Main Card */}
        <div className="bg-[var(--color-bg-card)]/80 backdrop-blur-xl border border-[var(--color-border)] p-8 rounded-3xl shadow-[0_8px_40px_rgb(0,0,0,0.08)]">

          {/* Logo & title */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-blue)] flex items-center justify-center shadow-lg shadow-[var(--color-accent-dim)] mb-6 transform transition-transform hover:scale-105 duration-300">
              <span className="text-white font-extrabold text-3xl tracking-tighter">P</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)] mb-2">
              Paracosma
            </h1>
            <p className="text-[var(--color-text-secondary)] text-sm font-medium">
              Virtual Office & Collaboration Space
            </p>
          </div>

          {/* Name form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="join-name" className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider ml-1">
                Display Name
              </label>
              <div className="relative group">
                <input
                  id="join-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="E.g. Jane Doe"
                  className="w-full px-5 py-4 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-2xl text-[var(--color-text-primary)] text-base placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-4 focus:ring-[var(--color-accent-dim)] transition-all duration-300"
                  autoFocus
                  maxLength={20}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!name.trim()}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-bold text-base transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none hover:-translate-y-0.5 active:translate-y-0 shadow-lg shadow-[var(--color-accent-dim)]"
              style={{
                background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-blue))',
              }}
            >
              Enter Workspace
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>
        </div>

        {/* How it works section (Below the card) */}
        <div
          className="mt-8 px-4"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(15px)',
            transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.15s',
          }}
        >
          <div className="grid grid-cols-1 gap-4 text-sm text-[var(--color-text-secondary)]">
            {TIPS.map((tip, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-muted)] shadow-sm">
                  {tip.icon}
                </div>
                <span className="font-medium leading-tight">{tip.text}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}