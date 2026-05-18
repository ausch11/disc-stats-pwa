import type { AppState, Game, Point, Player, Team } from "./types";

export function createId(prefix: string) {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export function createInitialState(): AppState {
  const now = new Date().toISOString();
  const homeTeam: Team = {
    id: createId("team"),
    name: "主队",
    createdAt: now
  };
  const awayTeam: Team = {
    id: createId("team"),
    name: "客队",
    createdAt: now
  };

  const homePlayers: Player[] = [
    ["7", "Alex", "Handler"],
    ["12", "Bo", "Cutter"],
    ["18", "Chen", "Hybrid"],
    ["21", "Drew", "Cutter"],
    ["24", "Eli", "Handler"],
    ["33", "Fan", "Defender"],
    ["88", "Gao", "Hybrid"]
  ].map(([number, name, position]) => ({
    id: createId("player"),
    teamId: homeTeam.id,
    name,
    number,
    position,
    active: true
  }));

  const awayPlayers: Player[] = [
    ["3", "Ivy", "Handler"],
    ["9", "Jay", "Cutter"],
    ["16", "Kai", "Hybrid"],
    ["22", "Lin", "Cutter"],
    ["25", "Mia", "Handler"],
    ["36", "Noah", "Defender"],
    ["66", "Owen", "Hybrid"]
  ].map(([number, name, position]) => ({
    id: createId("player"),
    teamId: awayTeam.id,
    name,
    number,
    position,
    active: true
  }));
  const players = [...homePlayers, ...awayPlayers];

  const pointId = createId("point");
  const game: Game = {
    id: createId("game"),
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    date: new Date().toISOString().slice(0, 10),
    type: "training",
    homeScore: 0,
    awayScore: 0,
    status: "live",
    currentPointId: pointId,
    lineupIdsByTeam: {
      [homeTeam.id]: homePlayers.map((player) => player.id),
      [awayTeam.id]: awayPlayers.map((player) => player.id)
    },
    possessionTeamId: homeTeam.id,
    startedOnOffense: true
  };

  const point: Point = {
    id: pointId,
    gameId: game.id,
    number: 1,
    possessionTeamId: homeTeam.id,
    homeScoreBefore: 0,
    awayScoreBefore: 0
  };

  return {
    teams: [homeTeam, awayTeam],
    players,
    games: [game],
    points: [point],
    events: [],
    activeTeamId: homeTeam.id,
    currentGameId: game.id
  };
}
