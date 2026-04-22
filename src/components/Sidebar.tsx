import { Users, MapPin, Headphones } from 'lucide-react';
import type { AudibleUser, RemotePlayer } from '../types';
import { getZoneById } from '../data/officeLayout';

interface Props
{
  userName: string;
  userPos: { x: number; y: number };
  userRoom: string | null;
  allPlayers: RemotePlayer[];
  audibleUsers: AudibleUser[];
  audioEnabled: boolean;
  audioMuted: boolean;
  hearingRange: number;
  onEnableAudio: () => void;
  onToggleMute: () => void;
  onHearingRangeChange: (val: number) => void;
  onLeave: () => void;
}

const Sidebar = ({
  userName,
  userRoom,
  allPlayers,
  audibleUsers,
  audioEnabled,
  onEnableAudio,
  onHearingRangeChange,
  hearingRange,
}: Props) =>
{
  const currentZone = userRoom ? getZoneById(userRoom) : null;

  // Categorize logic
  const adminZones = ['hr', 'account', 'it', 'facility', 'art-mgr', 'proj-mgr'];
  const artZones = ['art'];
  const techZones = ['game-web', 'ai'];

  const groups = [
    { name: 'Admin Team', players: allPlayers.filter(p => p.roomId && adminZones.includes(p.roomId)) },
    { name: 'Art Department', players: allPlayers.filter(p => p.roomId && artZones.includes(p.roomId)) },
    { name: 'Game, Marketing, Web, AI', players: allPlayers.filter(p => p.roomId && techZones.includes(p.roomId)) },
    { name: 'Open Floor & Meetings', players: allPlayers.filter(p => !p.roomId || (!adminZones.includes(p.roomId) && !artZones.includes(p.roomId) && !techZones.includes(p.roomId))) }
  ];

  return (
    <div className="w-full h-full flex flex-col bg-[var(--color-bg-card)] text-[var(--color-text-primary)]">

      {/* Compact Header */}
      <div className="p-3 border-b border-[var(--color-border)] flex items-center justify-between shrink-0 bg-[var(--color-bg-secondary)]/30">
        <h3 className="text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" /> Directory
        </h3>
        <span className="text-[9px] font-semibold text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)] px-2 py-0.5 rounded-full border border-[var(--color-border)]">
          {allPlayers.length + 1} Online
        </span>
      </div>

      {/* Pinned "You" Row - Always Visible & Compact */}
      <div className="p-2 border-b border-[var(--color-border)] shrink-0 bg-[var(--color-bg-card)] shadow-sm z-20">
        <div className="flex items-center gap-2 p-1.5 rounded-md bg-[var(--color-bg-secondary)] border border-[var(--color-border)]">
          <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold bg-gradient-to-tr from-[var(--color-accent)] to-[var(--color-accent-blue)] text-white shadow-sm shadow-[var(--color-accent-dim)]">
            {userName.substring(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0 overflow-hidden flex flex-col justify-center">
            <div className="flex items-center justify-between gap-1.5">
              <p className="text-xs font-semibold text-[var(--color-text-primary)] truncate leading-none">
                {userName} <span className="text-[9px] font-normal text-[var(--color-text-muted)] ml-1">(You)</span>
              </p>
            </div>
            <div className="flex items-center gap-1 mt-1 text-[9px] text-[var(--color-text-secondary)] truncate leading-none">
              <MapPin className="w-2.5 h-2.5 text-[var(--color-accent)] flex-shrink-0" />
              <span className="truncate">{currentZone?.name || 'Open Floor'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Directory List - min-h-0 makes flex scrolling robust on small screens */}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2.5 custom-scrollbar min-h-0">
        {allPlayers.length === 0 ? (
          <div className="text-[11px] text-[var(--color-text-muted)] text-center py-4 italic opacity-70">
            No one else is currently online.
          </div>
        ) : (
          groups.map(g => (
            <div key={g.name} className="flex flex-col gap-0.5 shrink-0">
              <div className="sticky top-0 bg-[var(--color-bg-card)]/95 backdrop-blur z-10 py-1 flex items-center justify-between border-b border-[var(--color-border)]/50 mb-0.5">
                <h4 className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{g.name}</h4>
                <span className="text-[8px] font-bold text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)] px-1.5 py-0.5 rounded-full">{g.players.length}</span>
              </div>

              {g.players.length === 0 ? (
                <div className="text-[9px] text-[var(--color-text-muted)]/50 px-1.5 py-1 italic">Empty</div>
              ) : (
                g.players.map(p => (
                  <PlayerRow
                    key={p.id}
                    player={p}
                    audible={audibleUsers.find(a => a.id === p.id)}
                  />
                ))
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer Controls - Compact layout */}
      {audioEnabled && (
        <div className="p-3 bg-[var(--color-bg-secondary)]/50 border-t border-[var(--color-border)] shrink-0 z-20">
          <div className="flex flex-col gap-2 bg-[var(--color-bg-card)] p-2.5 rounded-lg border border-[var(--color-border)] shadow-sm">
            <div className="flex justify-between items-center">
              <label className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Hearing Radius</label>
              <span className="text-[9px] font-bold text-[var(--color-accent)]">{hearingRange}px</span>
            </div>
            <input
              type="range" min="50" max="400" value={hearingRange}
              onChange={(e) => onHearingRangeChange(Number(e.target.value))}
              className="w-full accent-[var(--color-accent)] h-1"
            />
          </div>
        </div>
      )}
    </div>
  );
};

const PlayerRow = ({ player, audible }: { player: RemotePlayer, audible?: AudibleUser }) =>
{
  const pZone = player.roomId ? getZoneById(player.roomId) : null;

  return (
    <div className={`shrink-0 flex items-center gap-2 p-1.5 rounded-md transition-all w-full max-w-full overflow-hidden ${audible ? 'bg-[var(--color-bg-secondary)]/50 border border-[var(--color-border)]' : 'hover:bg-[var(--color-bg-secondary)]/30 border border-transparent opacity-80'
      }`}>
      <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ backgroundColor: player.color + '22', color: player.color, border: `1px solid ${player.color}44` }}>
        {player.name.substring(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col justify-center">
        <div className="flex items-center justify-between gap-1.5">
          <p className={`text-xs truncate leading-none ${audible ? 'font-medium text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'}`}>
            {player.name}
          </p>
          {player.isSpeaking && (
            <div className="flex-shrink-0 flex gap-[1px] items-center h-2.5 w-2.5">
              <div className="w-[1.5px] h-1.5 bg-[var(--color-success)] animate-[speakBar_0.8s_infinite]" />
              <div className="w-[1.5px] h-2.5 bg-[var(--color-success)] animate-[speakBar_1.1s_infinite]" />
              <div className="w-[1.5px] h-1 bg-[var(--color-success)] animate-[speakBar_0.9s_infinite]" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 mt-1 text-[9px] text-[var(--color-text-muted)] truncate leading-none">
          <MapPin className="w-2.5 h-2.5 flex-shrink-0 opacity-70" />
          <span className="truncate">{pZone?.name || 'Open Floor'}</span>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;