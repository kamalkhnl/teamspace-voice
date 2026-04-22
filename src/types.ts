export interface Position {
  x: number;
  y: number;
}

export interface OfficeRoom {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  doorX: number;
  doorY: number;
  doorWidth: number;
  doorHeight: number;
  floorColor: string;
}

export interface WalkableZone {
  x: number;
  y: number;
  width: number;
  height: number;
  roomId?: string;
}

export interface BotDefinition {
  id: string;
  name: string;
  position: Position;
  color: string;
  frequency: number;
  homeRoomId: string | null;
  wanderBounds: { minX: number; maxX: number; minY: number; maxY: number } | null;
}

export interface RemotePlayer {
  id: string;
  name: string;
  pos: Position;
  roomId: string | null;
  peerId: string;
  color: string;
  isSpeaking: boolean;
}

export interface AudibleUser {
  id: string;
  name: string;
  distance: number;
  volume: number;
  color: string;
  isSpeaking: boolean;
  roomId: string | null;
  peerId?: string;
}

