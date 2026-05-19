import type { GameEvent, PlayerStats } from "./types";

function escapeCsv(value: string | number | undefined) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function playerStatsToCsv(stats: PlayerStats[]) {
  const rows = [
    [
      "number",
      "name",
      "goals",
      "assists",
      "ds",
      "pulls_in",
      "pulls_out",
      "pull_receives",
      "catches",
      "drops",
      "completed_throws",
      "throwaways",
      "stalls",
      "throw_pct",
      "catch_pct",
      "plus_minus"
    ],
    ...stats.map((row) => [
      row.number,
      row.name,
      row.goals,
      row.assists,
      row.ds,
      row.pullsIn,
      row.pullsOut,
      row.pullReceives,
      row.catches,
      row.drops,
      row.completedThrows,
      row.throwaways,
      row.stalls,
      row.throwPct,
      row.catchPct,
      row.plusMinus
    ])
  ];

  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

export function eventsToCsv(events: GameEvent[]) {
  const rows = [
    ["created_at", "team_id", "type", "actor_player_id", "target_player_id", "point_id", "note"],
    ...events.map((event) => [
      event.createdAt,
      event.teamId,
      event.type,
      event.actorPlayerId,
      event.targetPlayerId,
      event.pointId,
      event.note
    ])
  ];

  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
