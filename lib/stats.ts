import type { Game, GameEvent, Player, TeamStats, PlayerStats } from "./types";

const pct = (value: number, total: number) => (total === 0 ? 0 : Math.round((value / total) * 1000) / 10);

export function calculatePlayerStats(players: Player[], events: GameEvent[]): PlayerStats[] {
  return players
    .filter((player) => player.active)
    .map((player) => {
      const byActor = events.filter((event) => event.actorPlayerId === player.id);
      const byTarget = events.filter((event) => event.targetPlayerId === player.id);

      const goals = byActor.filter((event) => event.type === "GOAL").length;
      const assists = byActor.filter((event) => event.type === "ASSIST").length;
      const ds = byActor.filter((event) => event.type === "D").length;
      const drops = byActor.filter((event) => event.type === "DROP").length;
      const throwaways = byActor.filter((event) => event.type === "THROWAWAY").length;
      const stalls = byActor.filter((event) => event.type === "STALL").length;
      const completedThrows =
        byActor.filter((event) => event.type === "PASS_COMPLETE").length + assists;
      const catches =
        byTarget.filter((event) => event.type === "PASS_COMPLETE").length + goals;
      const throwAttempts = completedThrows + throwaways + stalls + drops;
      const targets = catches + drops;

      return {
        playerId: player.id,
        name: player.name,
        number: player.number,
        goals,
        assists,
        ds,
        catches,
        drops,
        completedThrows,
        throwaways,
        stalls,
        throwAttempts,
        targets,
        throwPct: pct(completedThrows, throwAttempts),
        catchPct: pct(catches, targets),
        plusMinus: goals + assists + ds - drops - throwaways - stalls
      };
    })
    .sort((a, b) => b.plusMinus - a.plusMinus || b.goals - a.goals || a.name.localeCompare(b.name));
}

export function calculateTeamStats(game: Game | undefined, events: GameEvent[], teamId: string): TeamStats {
  const teamEvents = events.filter((event) => event.teamId === teamId);
  const goals = teamEvents.filter((event) => event.type === "GOAL").length;
  const passes = teamEvents.filter((event) => event.type === "PASS_COMPLETE" || event.type === "ASSIST").length;
  const drops = teamEvents.filter((event) => event.type === "DROP").length;
  const throwaways = teamEvents.filter((event) => event.type === "THROWAWAY").length;
  const stalls = teamEvents.filter((event) => event.type === "STALL").length;
  const ds = teamEvents.filter((event) => event.type === "D").length;
  const turnovers = drops + throwaways + stalls;
  const throwAttempts = passes + throwaways + stalls + drops;
  const catchTargets =
    teamEvents.filter((event) => event.type === "PASS_COMPLETE" || event.type === "GOAL").length + drops;
  const completedCatches = teamEvents.filter((event) => event.type === "PASS_COMPLETE" || event.type === "GOAL").length;
  const totalPoints = game ? game.homeScore + game.awayScore : 0;

  return {
    goals,
    passes,
    turnovers,
    drops,
    ds,
    throwPct: pct(passes, throwAttempts),
    catchPct: pct(completedCatches, catchTargets),
    offensiveEfficiency: pct(goals, totalPoints)
  };
}
