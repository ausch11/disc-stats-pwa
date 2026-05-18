"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCsv, eventsToCsv, playerStatsToCsv } from "@/lib/csv";
import { createId, createInitialState } from "@/lib/sample";
import { calculatePlayerStats, calculateTeamStats } from "@/lib/stats";
import { loadState, saveState } from "@/lib/storage";
import { hasSupabaseConfig, syncSnapshot } from "@/lib/supabase";
import type { AppState, EventType, Game, GameEvent, Player, Point, Team } from "@/lib/types";

const eventLabels: Record<EventType, string> = {
  PASS_COMPLETE: "成功传盘",
  ASSIST: "助攻",
  GOAL: "得分",
  DROP: "接盘失误",
  THROWAWAY: "传盘失误",
  STALL: "超时失误",
  D: "D盘",
  SUBSTITUTION: "换人",
  NOTE: "备注"
};

type LegacyGame = Partial<Game> & {
  id: string;
  date: string;
  type: Game["type"];
  status: Game["status"];
  currentPointId: string;
  startedOnOffense: boolean;
  teamId?: string;
  opponent?: string;
  ourScore?: number;
  opponentScore?: number;
  lineupIds?: string[];
};

type LegacyPoint = Point & {
  ourScoreBefore?: number;
  opponentScoreBefore?: number;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getPlayerName(players: Player[], playerId?: string) {
  if (!playerId) return "-";
  return players.find((player) => player.id === playerId)?.name ?? "-";
}

function getTeamName(teams: Team[], teamId?: string) {
  if (!teamId) return "队伍";
  return teams.find((team) => team.id === teamId)?.name ?? "队伍";
}

function getOtherTeamId(game: Game, teamId: string) {
  return teamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
}

function makePoint(game: Game, points: Point[], possessionTeamId: string): Point {
  const gamePoints = points.filter((point) => point.gameId === game.id);
  return {
    id: createId("point"),
    gameId: game.id,
    number: gamePoints.length + 1,
    possessionTeamId,
    homeScoreBefore: game.homeScore,
    awayScoreBefore: game.awayScore
  };
}

function getDefaultPair(lineup: Player[]) {
  return {
    holderId: lineup[0]?.id,
    targetId: lineup.find((player) => player.id !== lineup[0]?.id)?.id
  };
}

function migrateState(saved: AppState | null): AppState {
  if (!saved) return createInitialState();
  const firstGame = saved.games[0] as LegacyGame | undefined;
  if (!firstGame || firstGame.homeTeamId) return saved;

  const homeTeamId = firstGame.teamId ?? saved.teams[0]?.id ?? createId("team");
  const awayTeam: Team = {
    id: createId("team"),
    name: firstGame.opponent || "客队",
    createdAt: new Date().toISOString()
  };

  const games = saved.games.map((gameItem) => {
    const legacy = gameItem as LegacyGame;
    return {
      id: legacy.id,
      homeTeamId: legacy.teamId ?? homeTeamId,
      awayTeamId: awayTeam.id,
      date: legacy.date,
      type: legacy.type,
      homeScore: legacy.ourScore ?? 0,
      awayScore: legacy.opponentScore ?? 0,
      status: legacy.status,
      currentPointId: legacy.currentPointId,
      lineupIdsByTeam: {
        [legacy.teamId ?? homeTeamId]: legacy.lineupIds ?? [],
        [awayTeam.id]: []
      },
      possessionTeamId: legacy.teamId ?? homeTeamId,
      startedOnOffense: legacy.startedOnOffense
    };
  });

  const points = saved.points.map((pointItem) => {
    const legacy = pointItem as LegacyPoint;
    return {
      id: legacy.id,
      gameId: legacy.gameId,
      number: legacy.number,
      possessionTeamId: homeTeamId,
      homeScoreBefore: legacy.ourScoreBefore ?? 0,
      awayScoreBefore: legacy.opponentScoreBefore ?? 0
    };
  });

  return {
    ...saved,
    teams: [...saved.teams, awayTeam],
    games,
    points,
    events: saved.events.map((event) => ({ ...event, teamId: homeTeamId })),
    activeTeamId: homeTeamId
  };
}

export default function Home() {
  const [state, setState] = useState<AppState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [holderId, setHolderId] = useState<string | undefined>();
  const [targetId, setTargetId] = useState<string | undefined>();
  const [newPlayer, setNewPlayer] = useState({ name: "", number: "", position: "" });
  const [newGame, setNewGame] = useState({
    homeName: "主队",
    awayName: "客队",
    date: today(),
    type: "training" as Game["type"]
  });
  const [syncMessage, setSyncMessage] = useState("本地离线可用");

  useEffect(() => {
    loadState().then((saved) => {
      const next = migrateState(saved);
      const game = next.games.find((item) => item.id === next.currentGameId) ?? next.games[0];
      const activeTeamId = next.activeTeamId ?? game?.possessionTeamId ?? game?.homeTeamId;
      const lineup = next.players.filter((player) =>
        activeTeamId ? game?.lineupIdsByTeam[activeTeamId]?.includes(player.id) : false
      );
      const pair = getDefaultPair(lineup);

      setState({ ...next, currentGameId: game?.id, activeTeamId });
      setHolderId(pair.holderId);
      setTargetId(pair.targetId);
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated || !state) return;
    saveState(state);
  }, [hydrated, state]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  const currentGame = state?.games.find((game) => game.id === state.currentGameId);
  const homeTeam = state?.teams.find((team) => team.id === currentGame?.homeTeamId);
  const awayTeam = state?.teams.find((team) => team.id === currentGame?.awayTeamId);
  const activeTeamId = state?.activeTeamId ?? currentGame?.possessionTeamId ?? currentGame?.homeTeamId;
  const activeTeam = state?.teams.find((team) => team.id === activeTeamId);
  const homePlayers = useMemo(
    () => state?.players.filter((player) => player.teamId === currentGame?.homeTeamId) ?? [],
    [currentGame?.homeTeamId, state?.players]
  );
  const awayPlayers = useMemo(
    () => state?.players.filter((player) => player.teamId === currentGame?.awayTeamId) ?? [],
    [currentGame?.awayTeamId, state?.players]
  );
  const activePlayers = activeTeamId === currentGame?.homeTeamId ? homePlayers : awayPlayers;
  const activeLineupPlayers = useMemo(
    () =>
      activePlayers.filter((player) =>
        activeTeamId ? currentGame?.lineupIdsByTeam[activeTeamId]?.includes(player.id) : false
      ),
    [activePlayers, activeTeamId, currentGame?.lineupIdsByTeam]
  );
  const gameEvents = useMemo(
    () => state?.events.filter((event) => event.gameId === currentGame?.id) ?? [],
    [currentGame?.id, state?.events]
  );
  const homeEvents = gameEvents.filter((event) => event.teamId === currentGame?.homeTeamId);
  const awayEvents = gameEvents.filter((event) => event.teamId === currentGame?.awayTeamId);
  const homePlayerStats = useMemo(() => calculatePlayerStats(homePlayers, homeEvents), [homePlayers, homeEvents]);
  const awayPlayerStats = useMemo(() => calculatePlayerStats(awayPlayers, awayEvents), [awayPlayers, awayEvents]);
  const homeTeamStats = useMemo(
    () => (currentGame?.homeTeamId ? calculateTeamStats(currentGame, gameEvents, currentGame.homeTeamId) : undefined),
    [currentGame, gameEvents]
  );
  const awayTeamStats = useMemo(
    () => (currentGame?.awayTeamId ? calculateTeamStats(currentGame, gameEvents, currentGame.awayTeamId) : undefined),
    [currentGame, gameEvents]
  );

  function updateState(updater: (draft: AppState) => AppState) {
    setState((previous) => (previous ? updater(previous) : previous));
  }

  function chooseActiveTeam(teamId: string, gameOverride = currentGame) {
    if (!gameOverride || !state) return;
    const lineup = state.players.filter((player) => gameOverride.lineupIdsByTeam[teamId]?.includes(player.id));
    const pair = getDefaultPair(lineup);

    updateState((draft) => ({
      ...draft,
      activeTeamId: teamId,
      games: draft.games.map((game) => (game.id === gameOverride.id ? { ...game, possessionTeamId: teamId } : game))
    }));
    setHolderId(pair.holderId);
    setTargetId(pair.targetId);
  }

  function switchToTeamAfterTurnover(teamId: string) {
    if (!currentGame || !state) return;
    const lineup = state.players.filter((player) => currentGame.lineupIdsByTeam[teamId]?.includes(player.id));
    const pair = getDefaultPair(lineup);
    updateState((draft) => ({
      ...draft,
      activeTeamId: teamId,
      games: draft.games.map((game) => (game.id === currentGame.id ? { ...game, possessionTeamId: teamId } : game))
    }));
    setHolderId(pair.holderId);
    setTargetId(pair.targetId);
  }

  function appendEvent(type: EventType, actorPlayerId?: string, targetPlayerId?: string, note?: string) {
    if (!currentGame || !activeTeamId) return;

    const event: GameEvent = {
      id: createId("event"),
      gameId: currentGame.id,
      pointId: currentGame.currentPointId,
      teamId: activeTeamId,
      type,
      actorPlayerId,
      targetPlayerId,
      note,
      createdAt: new Date().toISOString()
    };

    updateState((draft) => ({
      ...draft,
      events: [...draft.events, event]
    }));
  }

  function addPlayer() {
    if (!activeTeamId || !newPlayer.name.trim()) return;

    const player: Player = {
      id: createId("player"),
      teamId: activeTeamId,
      name: newPlayer.name.trim(),
      number: newPlayer.number.trim(),
      position: newPlayer.position.trim(),
      active: true
    };

    updateState((draft) => ({
      ...draft,
      players: [...draft.players, player],
      games: draft.games.map((game) =>
        game.id === currentGame?.id
          ? {
              ...game,
              lineupIdsByTeam: {
                ...game.lineupIdsByTeam,
                [activeTeamId]: [...(game.lineupIdsByTeam[activeTeamId] ?? []), player.id]
              }
            }
          : game
      )
    }));
    setNewPlayer({ name: "", number: "", position: "" });
    if (!holderId) setHolderId(player.id);
  }

  function updateTeamName(teamId: string, name: string) {
    updateState((draft) => ({
      ...draft,
      teams: draft.teams.map((team) => (team.id === teamId ? { ...team, name } : team))
    }));
  }

  function toggleLineup(playerId: string, teamId: string) {
    if (!currentGame) return;

    updateState((draft) => ({
      ...draft,
      games: draft.games.map((game) => {
        if (game.id !== currentGame.id) return game;
        const currentLineup = game.lineupIdsByTeam[teamId] ?? [];
        const exists = currentLineup.includes(playerId);
        const lineupIds = exists
          ? currentLineup.filter((id) => id !== playerId)
          : [...currentLineup, playerId].slice(0, 14);
        return { ...game, lineupIdsByTeam: { ...game.lineupIdsByTeam, [teamId]: lineupIds } };
      })
    }));

    if (holderId === playerId) setHolderId(undefined);
    if (targetId === playerId) setTargetId(undefined);
  }

  function createGame() {
    if (!state) return;

    const homeTeam: Team = {
      id: createId("team"),
      name: newGame.homeName.trim() || "主队",
      createdAt: new Date().toISOString()
    };
    const awayTeam: Team = {
      id: createId("team"),
      name: newGame.awayName.trim() || "客队",
      createdAt: new Date().toISOString()
    };
    const pointId = createId("point");
    const game: Game = {
      id: createId("game"),
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      date: newGame.date,
      type: newGame.type,
      homeScore: 0,
      awayScore: 0,
      status: "live",
      currentPointId: pointId,
      lineupIdsByTeam: {
        [homeTeam.id]: [],
        [awayTeam.id]: []
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

    updateState((draft) => ({
      ...draft,
      teams: [...draft.teams, homeTeam, awayTeam],
      games: [game, ...draft.games],
      points: [...draft.points, point],
      activeTeamId: homeTeam.id,
      currentGameId: game.id
    }));
    setHolderId(undefined);
    setTargetId(undefined);
    setNewGame({ homeName: "主队", awayName: "客队", date: today(), type: "training" });
  }

  function chooseGame(gameId: string) {
    if (!state) return;
    const game = state.games.find((item) => item.id === gameId);
    const teamId = game?.possessionTeamId ?? game?.homeTeamId;
    const lineup = state.players.filter((player) => teamId ? game?.lineupIdsByTeam[teamId]?.includes(player.id) : false);
    const pair = getDefaultPair(lineup);

    updateState((draft) => ({ ...draft, currentGameId: gameId, activeTeamId: teamId }));
    setHolderId(pair.holderId);
    setTargetId(pair.targetId);
  }

  function completePass() {
    if (!holderId || !targetId || holderId === targetId) return;
    appendEvent("PASS_COMPLETE", holderId, targetId);
    setHolderId(targetId);
    const nextTarget = activeLineupPlayers.find((player) => player.id !== targetId)?.id;
    setTargetId(nextTarget);
  }

  function scoreGoal() {
    if (!currentGame || !activeTeamId || !holderId || !targetId || holderId === targetId) return;

    const sequence = createId("score");
    const now = new Date().toISOString();
    const assist: GameEvent = {
      id: createId("event"),
      gameId: currentGame.id,
      pointId: currentGame.currentPointId,
      teamId: activeTeamId,
      type: "ASSIST",
      actorPlayerId: holderId,
      targetPlayerId: targetId,
      note: sequence,
      createdAt: now
    };
    const goal: GameEvent = {
      id: createId("event"),
      gameId: currentGame.id,
      pointId: currentGame.currentPointId,
      teamId: activeTeamId,
      type: "GOAL",
      actorPlayerId: targetId,
      targetPlayerId: holderId,
      note: sequence,
      createdAt: now
    };
    const nextPossessionTeamId = getOtherTeamId(currentGame, activeTeamId);

    updateState((draft) => {
      const updatedGame = {
        ...currentGame,
        homeScore: currentGame.homeScore + (activeTeamId === currentGame.homeTeamId ? 1 : 0),
        awayScore: currentGame.awayScore + (activeTeamId === currentGame.awayTeamId ? 1 : 0),
        possessionTeamId: nextPossessionTeamId
      };
      const nextPoint = makePoint(updatedGame, draft.points, nextPossessionTeamId);

      return {
        ...draft,
        activeTeamId: nextPossessionTeamId,
        events: [...draft.events, assist, goal],
        points: [
          ...draft.points.map((point) =>
            point.id === currentGame.currentPointId ? { ...point, scoringTeamId: activeTeamId } : point
          ),
          nextPoint
        ],
        games: draft.games.map((game) =>
          game.id === currentGame.id ? { ...updatedGame, currentPointId: nextPoint.id } : game
        )
      };
    });

    const nextLineup = state?.players.filter((player) => currentGame.lineupIdsByTeam[nextPossessionTeamId]?.includes(player.id)) ?? [];
    const pair = getDefaultPair(nextLineup);
    setHolderId(pair.holderId);
    setTargetId(pair.targetId);
  }

  function recordDrop() {
    if (!currentGame || !activeTeamId || !holderId || !targetId || holderId === targetId) return;
    appendEvent("DROP", targetId, holderId);
    switchToTeamAfterTurnover(getOtherTeamId(currentGame, activeTeamId));
  }

  function recordThrowaway() {
    if (!currentGame || !activeTeamId || !holderId) return;
    appendEvent("THROWAWAY", holderId);
    switchToTeamAfterTurnover(getOtherTeamId(currentGame, activeTeamId));
  }

  function recordStall() {
    if (!currentGame || !activeTeamId || !holderId) return;
    appendEvent("STALL", holderId);
    switchToTeamAfterTurnover(getOtherTeamId(currentGame, activeTeamId));
  }

  function recordD(playerId?: string) {
    const defenderId = playerId ?? holderId;
    if (!defenderId) return;
    appendEvent("D", defenderId);
    setHolderId(defenderId);
  }

  function undoLast() {
    if (!currentGame || gameEvents.length === 0) return;
    const last = gameEvents[gameEvents.length - 1];
    const sequenceEvents = last.note ? gameEvents.filter((event) => event.note === last.note) : [last];
    const removeIds = new Set(sequenceEvents.map((event) => event.id));
    const goalEvent = sequenceEvents.find((event) => event.type === "GOAL");
    const scoredPointId = last.pointId;

    updateState((draft) => {
      const currentPoint = draft.points.find((point) => point.id === currentGame.currentPointId);
      const points =
        currentPoint && currentPoint.number > 1 && goalEvent
          ? draft.points
              .filter((point) => point.id !== currentPoint.id)
              .map((point) => (point.id === scoredPointId ? { ...point, scoringTeamId: undefined } : point))
          : draft.points;

      return {
        ...draft,
        activeTeamId: goalEvent?.teamId ?? draft.activeTeamId,
        events: draft.events.filter((event) => !removeIds.has(event.id)),
        points,
        games: draft.games.map((game) => {
          if (game.id !== currentGame.id) return game;
          return {
            ...game,
            homeScore: Math.max(0, game.homeScore - (goalEvent?.teamId === game.homeTeamId ? 1 : 0)),
            awayScore: Math.max(0, game.awayScore - (goalEvent?.teamId === game.awayTeamId ? 1 : 0)),
            currentPointId: goalEvent ? scoredPointId : game.currentPointId,
            possessionTeamId: goalEvent?.teamId ?? game.possessionTeamId
          };
        })
      };
    });
  }

  async function syncNow() {
    if (!state) return;
    if (!hasSupabaseConfig()) {
      setSyncMessage("未配置 Supabase，当前仅本地保存");
      return;
    }

    try {
      setSyncMessage("同步中...");
      await syncSnapshot(state);
      const timestamp = new Date().toISOString();
      updateState((draft) => ({ ...draft, lastSyncedAt: timestamp }));
      setSyncMessage("已同步到 Supabase");
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "同步失败");
    }
  }

  function renderTeamPanel(team: Team | undefined, players: Player[]) {
    if (!team || !currentGame) return null;
    const active = team.id === activeTeamId;
    const lineup = currentGame.lineupIdsByTeam[team.id] ?? [];

    return (
      <section className={`team-panel ${active ? "active" : ""}`}>
        <div className="team-panel-head">
          <button className="btn secondary small" onClick={() => chooseActiveTeam(team.id)}>
            {active ? "记录中" : "切换记录"}
          </button>
          <input
            aria-label={`${team.name} 队名`}
            value={team.name}
            onChange={(event) => updateTeamName(team.id, event.target.value)}
          />
        </div>
        <div className="player-list compact">
          {players.map((player) => (
            <div className="player-item" key={player.id}>
              <div className="number">{player.number || "--"}</div>
              <div>
                <strong>{player.name}</strong>
                <div className="muted">{player.position || "未设置位置"}</div>
              </div>
              <button className={`chip ${lineup.includes(player.id) ? "active" : ""}`} onClick={() => toggleLineup(player.id, team.id)}>
                {lineup.includes(player.id) ? "场上" : "替补"}
              </button>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function renderStatsTable(title: string, rows: ReturnType<typeof calculatePlayerStats>, stats?: ReturnType<typeof calculateTeamStats>) {
    return (
      <section className="stats-section">
        <div className="section stats-title-row">
          <div>
            <h2>{title}</h2>
            <span className="muted">传盘 {stats?.throwPct ?? 0}% · 接盘 {stats?.catchPct ?? 0}% · 失误 {stats?.turnovers ?? 0}</span>
          </div>
          <button className="btn secondary small" onClick={() => downloadCsv(`${title}-player-stats.csv`, playerStatsToCsv(rows))}>
            导出统计
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>球员</th>
                <th>得分</th>
                <th>助攻</th>
                <th>D</th>
                <th>接盘</th>
                <th>Drop</th>
                <th>成功传盘</th>
                <th>失误</th>
                <th>传盘%</th>
                <th>接盘%</th>
                <th>+/-</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.playerId}>
                  <td>{row.number || "--"}</td>
                  <td>{row.name}</td>
                  <td>{row.goals}</td>
                  <td>{row.assists}</td>
                  <td>{row.ds}</td>
                  <td>{row.catches}</td>
                  <td>{row.drops}</td>
                  <td>{row.completedThrows}</td>
                  <td>{row.throwaways + row.stalls}</td>
                  <td>{row.throwPct}%</td>
                  <td>{row.catchPct}%</td>
                  <td>{row.plusMinus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  if (!state || !currentGame) {
    return (
      <main className="app-shell">
        <div className="empty">正在准备记录台...</div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">DS</div>
          <div>
            <h1>Disc Stats</h1>
            <span>
              {homeTeam?.name ?? "主队"} vs {awayTeam?.name ?? "客队"} · 双队数据记录
            </span>
          </div>
        </div>
        <button className="sync-pill" onClick={syncNow} title="同步到 Supabase">
          <span className={`sync-dot ${hasSupabaseConfig() ? "online" : ""}`} />
          {syncMessage}
        </button>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <section className="section">
            <div className="section-title">
              <h2>新比赛</h2>
            </div>
            <div className="form-grid">
              <div className="row">
                <div className="field">
                  <label htmlFor="home-name">主队</label>
                  <input id="home-name" value={newGame.homeName} onChange={(event) => setNewGame({ ...newGame, homeName: event.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="away-name">客队</label>
                  <input id="away-name" value={newGame.awayName} onChange={(event) => setNewGame({ ...newGame, awayName: event.target.value })} />
                </div>
              </div>
              <div className="row">
                <div className="field">
                  <label htmlFor="game-date">日期</label>
                  <input id="game-date" type="date" value={newGame.date} onChange={(event) => setNewGame({ ...newGame, date: event.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="game-type">类型</label>
                  <select id="game-type" value={newGame.type} onChange={(event) => setNewGame({ ...newGame, type: event.target.value as Game["type"] })}>
                    <option value="training">训练</option>
                    <option value="game">比赛</option>
                  </select>
                </div>
              </div>
              <button className="btn" onClick={createGame}>
                创建双队比赛
              </button>
            </div>
          </section>

          <section className="section">
            <div className="section-title">
              <h2>添加球员</h2>
              <span className="count">加入 {activeTeam?.name ?? "当前队伍"}</span>
            </div>
            <div className="form-grid">
              <div className="row">
                <div className="field">
                  <label htmlFor="player-number">号码</label>
                  <input id="player-number" value={newPlayer.number} onChange={(event) => setNewPlayer({ ...newPlayer, number: event.target.value })} placeholder="7" />
                </div>
                <div className="field">
                  <label htmlFor="player-name">姓名</label>
                  <input id="player-name" value={newPlayer.name} onChange={(event) => setNewPlayer({ ...newPlayer, name: event.target.value })} placeholder="球员名" />
                </div>
              </div>
              <div className="row">
                <div className="field">
                  <label htmlFor="player-position">位置</label>
                  <input
                    id="player-position"
                    value={newPlayer.position}
                    onChange={(event) => setNewPlayer({ ...newPlayer, position: event.target.value })}
                    placeholder="Handler / Cutter"
                  />
                </div>
                <button className="btn secondary" onClick={addPlayer}>
                  添加
                </button>
              </div>
            </div>
          </section>

          <section className="section">
            <div className="section-title">
              <h2>两队阵容</h2>
            </div>
            <div className="dual-team-list">
              {renderTeamPanel(homeTeam, homePlayers)}
              {renderTeamPanel(awayTeam, awayPlayers)}
            </div>
          </section>

          <section className="section">
            <div className="section-title">
              <h2>历史</h2>
            </div>
            <div className="game-list">
              {state.games.map((game) => (
                <button className="game-item" key={game.id} onClick={() => chooseGame(game.id)}>
                  <strong>
                    {getTeamName(state.teams, game.homeTeamId)} vs {getTeamName(state.teams, game.awayTeamId)}
                  </strong>
                  <span className="muted">
                    {game.date} · {game.homeScore}:{game.awayScore}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section>
          <div className="main-panel">
            <div className="scoreboard">
              <button className={`score-team score-button ${activeTeamId === currentGame.homeTeamId ? "active" : ""}`} onClick={() => chooseActiveTeam(currentGame.homeTeamId)}>
                <span className="score-label">{homeTeam?.name}</span>
                <span className="score-number">{currentGame.homeScore}</span>
              </button>
              <div className="score-divider" />
              <button className={`score-team score-button ${activeTeamId === currentGame.awayTeamId ? "active" : ""}`} onClick={() => chooseActiveTeam(currentGame.awayTeamId)}>
                <span className="score-label">{awayTeam?.name}</span>
                <span className="score-number">{currentGame.awayScore}</span>
              </button>
            </div>

            <div className="recorder">
              <div className="possession">
                <div className="field-map">
                  <div className="field-content">
                    <div>
                      <div className="muted">当前记录队伍</div>
                      <div className="holder-name">{activeTeam?.name ?? "队伍"}</div>
                      <div className="muted">持盘：{getPlayerName(state.players, holderId)}</div>
                      <div className="muted">第 {state.points.find((point) => point.id === currentGame.currentPointId)?.number ?? 1} 分</div>
                    </div>
                  </div>
                </div>

                <div className="section-title">
                  <h3>当前队伍场上阵容</h3>
                  <span className="count">{activeLineupPlayers.length} 人</span>
                </div>
                <div className="lineup-grid">
                  {activeLineupPlayers.map((player) => (
                    <button className={`chip ${holderId === player.id ? "active" : ""}`} key={player.id} onClick={() => setHolderId(player.id)}>
                      #{player.number || "--"} {player.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="event-console">
                <div className="console-header">
                  <div>
                    <strong>事件记录</strong>
                    <div className="muted">先切换队伍，再选择持盘人和接盘人</div>
                  </div>
                  <div className="row">
                    <button className="btn secondary small" onClick={() => chooseActiveTeam(currentGame.homeTeamId)}>
                      主队
                    </button>
                    <button className="btn secondary small" onClick={() => chooseActiveTeam(currentGame.awayTeamId)}>
                      客队
                    </button>
                    <button className="btn secondary small" onClick={undoLast} disabled={gameEvents.length === 0}>
                      撤销
                    </button>
                  </div>
                </div>

                <div className="console-body">
                  <div>
                    <div className="section-title">
                      <h3>接盘人 / D盘人</h3>
                    </div>
                    <div className="player-picker">
                      {activeLineupPlayers
                        .filter((player) => player.id !== holderId)
                        .map((player) => (
                          <button className={`chip ${targetId === player.id ? "active" : ""}`} key={player.id} onClick={() => setTargetId(player.id)}>
                            #{player.number || "--"} {player.name}
                          </button>
                        ))}
                    </div>
                  </div>

                  <div className="action-grid">
                    <button className="action positive" onClick={completePass} disabled={!holderId || !targetId}>
                      <strong>成功传盘</strong>
                      <span>{activeTeam?.name} 持盘人传给接盘人</span>
                    </button>
                    <button className="action positive" onClick={scoreGoal} disabled={!holderId || !targetId}>
                      <strong>助攻 + 得分</strong>
                      <span>{activeTeam?.name} 得一分并换边</span>
                    </button>
                    <button className="action defense" onClick={() => recordD(targetId)} disabled={!targetId}>
                      <strong>D盘</strong>
                      <span>选中球员完成防守</span>
                    </button>
                    <button className="action negative" onClick={recordDrop} disabled={!holderId || !targetId}>
                      <strong>接盘失误</strong>
                      <span>Drop 后自动切换控盘队</span>
                    </button>
                    <button className="action negative" onClick={recordThrowaway} disabled={!holderId}>
                      <strong>传盘失误</strong>
                      <span>Throwaway 后自动切换</span>
                    </button>
                    <button className="action negative" onClick={recordStall} disabled={!holderId}>
                      <strong>超时失误</strong>
                      <span>Stall 后自动切换</span>
                    </button>
                    <button className="action" onClick={() => downloadCsv("events.csv", eventsToCsv(gameEvents))}>
                      <strong>导出流水</strong>
                      <span>两队原始事件 CSV</span>
                    </button>
                  </div>

                  <div>
                    <div className="section-title">
                      <h3>最近事件</h3>
                      <span className="count">{gameEvents.length} 条</span>
                    </div>
                    <div className="event-list">
                      {gameEvents.length === 0 ? (
                        <div className="empty">还没有记录，选择队伍和球员后开始点击事件。</div>
                      ) : (
                        gameEvents
                          .slice(-8)
                          .reverse()
                          .map((event) => (
                            <div className="event-item" key={event.id}>
                              <strong>
                                {getTeamName(state.teams, event.teamId)} · {eventLabels[event.type]}
                              </strong>
                              <span className="muted">
                                {getPlayerName(state.players, event.actorPlayerId)}
                                {event.targetPlayerId ? ` -> ${getPlayerName(state.players, event.targetPlayerId)}` : ""}
                              </span>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <section className="stats-section">
            <div className="stats-grid">
              <div className="metric">
                <div className="metric-value">{homeTeamStats?.throwPct ?? 0}%</div>
                <div className="metric-label">{homeTeam?.name} 传盘成功率</div>
              </div>
              <div className="metric">
                <div className="metric-value">{awayTeamStats?.throwPct ?? 0}%</div>
                <div className="metric-label">{awayTeam?.name} 传盘成功率</div>
              </div>
              <div className="metric">
                <div className="metric-value">{homeTeamStats?.turnovers ?? 0}</div>
                <div className="metric-label">{homeTeam?.name} 失误</div>
              </div>
              <div className="metric">
                <div className="metric-value">{awayTeamStats?.turnovers ?? 0}</div>
                <div className="metric-label">{awayTeam?.name} 失误</div>
              </div>
            </div>
          </section>

          {renderStatsTable(homeTeam?.name ?? "主队", homePlayerStats, homeTeamStats)}
          {renderStatsTable(awayTeam?.name ?? "客队", awayPlayerStats, awayTeamStats)}
        </section>
      </div>
    </main>
  );
}
