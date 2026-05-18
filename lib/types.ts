export type EventType =
  | "PASS_COMPLETE"
  | "ASSIST"
  | "GOAL"
  | "DROP"
  | "THROWAWAY"
  | "STALL"
  | "D"
  | "SUBSTITUTION"
  | "NOTE";

export type Team = {
  id: string;
  name: string;
  createdAt: string;
};

export type Player = {
  id: string;
  teamId: string;
  name: string;
  number: string;
  gender?: string;
  position?: string;
  active: boolean;
};

export type Game = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  date: string;
  type: "training" | "game";
  homeScore: number;
  awayScore: number;
  status: "setup" | "live" | "finished";
  currentPointId: string;
  lineupIdsByTeam: Record<string, string[]>;
  possessionTeamId: string;
  startedOnOffense: boolean;
};

export type Point = {
  id: string;
  gameId: string;
  number: number;
  possessionTeamId: string;
  homeScoreBefore: number;
  awayScoreBefore: number;
  scoringTeamId?: string;
};

export type GameEvent = {
  id: string;
  gameId: string;
  pointId: string;
  teamId: string;
  type: EventType;
  actorPlayerId?: string;
  targetPlayerId?: string;
  note?: string;
  createdAt: string;
};

export type AppState = {
  teams: Team[];
  players: Player[];
  games: Game[];
  points: Point[];
  events: GameEvent[];
  activeTeamId?: string;
  currentGameId?: string;
  lastSyncedAt?: string;
};

export type PlayerStats = {
  playerId: string;
  name: string;
  number: string;
  goals: number;
  assists: number;
  ds: number;
  catches: number;
  drops: number;
  completedThrows: number;
  throwaways: number;
  stalls: number;
  throwAttempts: number;
  targets: number;
  throwPct: number;
  catchPct: number;
  plusMinus: number;
};

export type TeamStats = {
  goals: number;
  passes: number;
  turnovers: number;
  drops: number;
  ds: number;
  throwPct: number;
  catchPct: number;
  offensiveEfficiency: number;
};
