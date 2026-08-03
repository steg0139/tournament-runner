import { useState, useEffect } from 'react';
import type { Stage, Group, TeamStageInfo, Team, Match } from '../api/types';

interface GroupStandingsProps {
  stage: Stage;
  teams: Team[];
  onGenerateNextRound: (groupId: string) => void;
  onMatchClick?: (match: Match) => void;
  onEditStandings?: (teamId: string, data: { wins?: number; losses?: number; status?: string }) => void;
  onEditMatch?: (match: Match) => void;
  onDeleteMatch?: (matchId: string) => void;
}

type Tab = 'matches' | 'standings';

export function GroupStandings({ stage, teams, onGenerateNextRound, onMatchClick, onEditStandings, onEditMatch, onDeleteMatch }: GroupStandingsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('matches');
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editWins, setEditWins] = useState('');
  const [editLosses, setEditLosses] = useState('');
  const [editStatus, setEditStatus] = useState('active');

  const getTeamName = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId);
    return team?.name || 'Unknown';
  };

  const getGroupStandings = (group: Group) => {
    const groupInfo = stage.teamStageInfo.filter((t) => t.groupId === group.id);
    const groupMatches = stage.matches.filter((m) => m.groupId === group.id && m.status === 'completed');

    const sosMap = new Map<string, number>();
    const diffMap = new Map<string, number>();
    for (const info of groupInfo) {
      let sos = 0;
      let diff = 0;
      for (const match of groupMatches) {
        let opponentId: string | null = null;
        if (match.team1Id === info.teamId) {
          opponentId = match.team2Id;
          diff += (match.team1Score || 0) - (match.team2Score || 0);
        } else if (match.team2Id === info.teamId) {
          opponentId = match.team1Id;
          diff += (match.team2Score || 0) - (match.team1Score || 0);
        }
        if (opponentId) {
          const oppInfo = groupInfo.find((t) => t.teamId === opponentId);
          if (oppInfo) sos += oppInfo.wins;
        }
      }
      sosMap.set(info.teamId, sos);
      diffMap.set(info.teamId, diff);
    }

    return groupInfo
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (a.losses !== b.losses) return a.losses - b.losses;
        // Head-to-head
        let aWinsH2H = 0;
        let bWinsH2H = 0;
        for (const m of groupMatches) {
          if ((m.team1Id === a.teamId && m.team2Id === b.teamId) ||
              (m.team1Id === b.teamId && m.team2Id === a.teamId)) {
            if (m.winnerId === a.teamId) aWinsH2H++;
            else if (m.winnerId === b.teamId) bWinsH2H++;
          }
        }
        if (aWinsH2H !== bWinsH2H) return bWinsH2H - aWinsH2H;
        // SOS
        const sosA = sosMap.get(a.teamId) || 0;
        const sosB = sosMap.get(b.teamId) || 0;
        if (sosB !== sosA) return sosB - sosA;
        // Point diff
        const diffA = diffMap.get(a.teamId) || 0;
        const diffB = diffMap.get(b.teamId) || 0;
        if (diffB !== diffA) return diffB - diffA;
        // Seed
        const teamA = teams.find((t) => t.id === a.teamId);
        const teamB = teams.find((t) => t.id === b.teamId);
        return (teamA?.seed || 999) - (teamB?.seed || 999);
      })
      .map((info) => ({
        ...info,
        sos: sosMap.get(info.teamId) || 0,
        pointDiff: diffMap.get(info.teamId) || 0,
      }));
  };

  const isRoundComplete = (group: Group) => {
    const groupMatches = stage.matches.filter(
      (m) => m.groupId === group.id && m.round === group.currentRound
    );
    return groupMatches.length > 0 && groupMatches.every((m) => m.status === 'completed');
  };

  const getStatusBadge = (info: TeamStageInfo) => {
    if (info.status === 'eliminated') {
      return <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400">Out</span>;
    }
    if (info.status === 'advanced') {
      return <span className="text-xs px-1.5 py-0.5 rounded bg-green-900/50 text-green-400">✓</span>;
    }
    return null;
  };

  return (
    <div>
      {/* Tab Navigation */}
      <div className="flex border-b border-gray-700 mb-4">
        <button
          onClick={() => setActiveTab('matches')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'matches'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Score Entry
        </button>
        <button
          onClick={() => setActiveTab('standings')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'standings'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Standings
        </button>
      </div>

      {/* Matches Tab */}
      {activeTab === 'matches' && (
        <div className="space-y-4">
          {stage.groups
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((group) => {
              const roundComplete = isRoundComplete(group);
              const canGenerateNext = roundComplete && group.status !== 'completed' && stage.status !== 'completed';

              // Show all matches for this group
              const visibleMatches = stage.matches.filter((m) => {
                if (m.groupId !== group.id) return false;
                return true;
              });

              return (
                <div key={group.id} className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
                  <div className="flex justify-between items-center px-3 py-2.5 border-b border-gray-700 sm:px-4">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm sm:text-base">{group.name}</h3>
                      <span className="text-xs text-gray-400">R{group.currentRound}</span>
                      {group.status === 'completed' && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-900/50 text-green-400">Done</span>
                      )}
                    </div>
                    {canGenerateNext && (
                      <button
                        onClick={() => onGenerateNextRound(group.id)}
                        className="text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded transition-colors"
                      >
                        Next Round
                      </button>
                    )}
                  </div>
                  <MatchList
                    matches={visibleMatches}
                    allMatches={stage.matches.filter((m) => m.groupId === group.id)}
                    currentRound={group.currentRound}
                    getTeamName={getTeamName}
                    onMatchClick={onMatchClick}
                  />
                </div>
              );
            })}
        </div>
      )}

      {/* Standings Tab */}
      {activeTab === 'standings' && (
        <div className="space-y-4">
          {stage.groups
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((group) => {
              const standings = getGroupStandings(group);

              return (
                <div key={group.id} className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
                  <div className="px-3 py-2.5 border-b border-gray-700 sm:px-4">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm sm:text-base">{group.name}</h3>
                      {group.status === 'completed' && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-900/50 text-green-400">Done</span>
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-700 text-gray-400 text-xs">
                          <th className="px-2 py-2 text-left sm:px-4">#</th>
                          <th className="px-2 py-2 text-left sm:px-4">Team</th>
                          <th className="px-2 py-2 text-center">W</th>
                          <th className="px-2 py-2 text-center">L</th>
                          <th className="px-2 py-2 text-center">SOS</th>
                          <th className="px-2 py-2 text-center">+/-</th>
                          <th className="px-2 py-2 text-center"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {standings.map((info, i) => (
                          <tr
                            key={info.teamId}
                            onClick={() => {
                              if (onEditStandings) {
                                setEditingTeamId(info.teamId);
                                setEditWins(info.wins.toString());
                                setEditLosses(info.losses.toString());
                                setEditStatus(info.status);
                              }
                            }}
                            className={`border-b border-gray-700/50 ${
                              info.status === 'eliminated' ? 'opacity-50' : ''
                            } ${onEditStandings ? 'cursor-pointer hover:bg-gray-700/30 active:bg-gray-700/50' : ''}`}
                          >
                            <td className="px-2 py-2 text-gray-500 sm:px-4">{i + 1}</td>
                            <td className={`px-2 py-2 font-medium sm:px-4 max-w-[120px] sm:max-w-none truncate ${
                              info.status === 'eliminated' ? 'line-through text-gray-500' : ''
                            }`}>
                              {getTeamName(info.teamId)}
                            </td>
                            <td className="px-2 py-2 text-center text-green-400">{info.wins}</td>
                            <td className="px-2 py-2 text-center text-red-400">{info.losses}</td>
                            <td className="px-2 py-2 text-center text-gray-300">{info.sos}</td>
                            <td className="px-2 py-2 text-center">
                              <span className={info.pointDiff > 0 ? 'text-green-400' : info.pointDiff < 0 ? 'text-red-400' : 'text-gray-400'}>
                                {info.pointDiff > 0 ? '+' : ''}{info.pointDiff}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-center">{getStatusBadge(info)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

          {/* Edit standings modal */}
          {editingTeamId && onEditStandings && (
            <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center pt-8 sm:items-center sm:pt-0 p-4">
              <div className="bg-gray-800 border border-gray-600 rounded-xl p-4 w-full max-w-sm max-h-[80vh] overflow-y-auto">
                <h3 className="text-sm font-bold mb-3">{getTeamName(editingTeamId)}</h3>

                {/* Record edit */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 w-14">Wins</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={editWins}
                      onChange={(e) => setEditWins(e.target.value)}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white text-center focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 w-14">Losses</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={editLosses}
                      onChange={(e) => setEditLosses(e.target.value)}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white text-center focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 w-14">Status</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value="active">Active</option>
                      <option value="eliminated">Eliminated</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                </div>

                {/* Match history */}
                <div className="border-t border-gray-700 pt-3 mb-4">
                  <p className="text-xs text-gray-400 mb-2 font-medium">Match History</p>
                  <div className="space-y-1.5">
                    {stage.matches
                      .filter((m) => m.status === 'completed' && (m.team1Id === editingTeamId || m.team2Id === editingTeamId))
                      .sort((a, b) => a.round - b.round)
                      .map((m) => {
                        const isTeam1 = m.team1Id === editingTeamId;
                        const opponentId = isTeam1 ? m.team2Id : m.team1Id;
                        const won = m.winnerId === editingTeamId;
                        const score = m.team2Id ? `${isTeam1 ? m.team1Score : m.team2Score}-${isTeam1 ? m.team2Score : m.team1Score}` : 'BYE';

                        return (
                          <div key={m.id} className="flex items-center gap-2 text-xs bg-gray-700/50 rounded px-2 py-1.5">
                            <span className="text-gray-500">R{m.round}</span>
                            <span className={`${won ? 'text-green-400' : 'text-red-400'} font-medium`}>
                              {won ? 'W' : 'L'}
                            </span>
                            <span className="flex-1 truncate">
                              vs {opponentId ? getTeamName(opponentId) : 'BYE'}
                            </span>
                            <span className="text-gray-300">{score}</span>
                            {onEditMatch && m.team2Id && (
                              <button
                                onClick={() => { setEditingTeamId(null); onEditMatch(m); }}
                                className="text-blue-400 hover:text-blue-300 px-1"
                              >
                                ✎
                              </button>
                            )}
                            {onDeleteMatch && m.team2Id && (
                              <button
                                onClick={() => { if (confirm('Delete this match result?')) onDeleteMatch(m.id); }}
                                className="text-red-400 hover:text-red-300 px-1"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingTeamId(null)}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      onEditStandings(editingTeamId, {
                        wins: parseInt(editWins) || 0,
                        losses: parseInt(editLosses) || 0,
                        status: editStatus,
                      });
                      setEditingTeamId(null);
                    }}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium"
                  >
                    Save Record
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MatchList({
  matches,
  allMatches,
  currentRound,
  getTeamName,
  onMatchClick,
}: {
  matches: Match[];
  allMatches: Match[];
  currentRound: number;
  getTeamName: (id: string) => string;
  onMatchClick?: (match: Match) => void;
}) {
  const [userSelectedRound, setUserSelectedRound] = useState<number | null>(null);

  // Auto-follow current round when it advances
  useEffect(() => {
    setUserSelectedRound(null); // Reset to follow currentRound
  }, [currentRound]);

  // Auto-follow current round unless user explicitly selected a different one
  const activeRound = userSelectedRound ?? currentRound;

  if (matches.length === 0) {
    return <p className="px-3 py-4 text-gray-500 text-sm text-center">No matches yet</p>;
  }

  // Group by round
  const rounds = new Map<number, Match[]>();
  for (const match of matches) {
    if (!rounds.has(match.round)) rounds.set(match.round, []);
    rounds.get(match.round)!.push(match);
  }

  const sortedRoundNumbers = Array.from(rounds.keys()).sort((a, b) => a - b);
  const activeMatches = rounds.get(activeRound) || [];

  // Calculate records as of the START of the active round
  // (only count matches from rounds before the active round)
  const getRecordBefore = (teamId: string): string => {
    let wins = 0;
    let losses = 0;
    for (const m of allMatches) {
      if (m.round >= activeRound) continue;
      if (m.status !== 'completed') continue;
      if (m.winnerId === teamId) wins++;
      else if (m.loserId === teamId) losses++;
    }
    return `${wins}-${losses}`;
  };

  return (
    <div>
      {/* Round pills */}
      <div className="flex gap-1.5 px-3 py-2.5 sm:px-4 overflow-x-auto border-b border-gray-700/50">
        {sortedRoundNumbers.map((round) => {
          const isActive = round === activeRound;
          const isCurrent = round === currentRound;
          const roundMatches = rounds.get(round) || [];
          const hasPending = roundMatches.some((m) => m.status === 'pending');

          return (
            <button
              key={round}
              onClick={() => setUserSelectedRound(round)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : hasPending
                  ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-700'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              R{round}{isCurrent && !isActive ? ' •' : ''}
            </button>
          );
        })}
      </div>

      {/* Matches for selected round */}
      <div className="px-3 py-2.5 sm:px-4">
        <div className="space-y-2">
          {activeMatches.map((match) => {
            const isNewScore = match.status !== 'completed' && match.team1Id && match.team2Id;
            const isEditable = match.status === 'completed' && match.team2Id;
            const isClickable = isNewScore || isEditable;
            const isBye = !match.team2Id;

            const t1Record = match.team1Id ? getRecordBefore(match.team1Id) : '';
            const t2Record = match.team2Id ? getRecordBefore(match.team2Id) : '';

            return (
              <div
                key={match.id}
                onClick={isClickable && onMatchClick ? () => onMatchClick(match) : undefined}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm ${
                  isNewScore
                    ? 'bg-blue-900/20 border border-blue-500/50 cursor-pointer hover:border-blue-400 active:bg-blue-900/40'
                    : isEditable
                    ? 'bg-gray-700/30 cursor-pointer hover:bg-gray-700/50 active:bg-gray-600/50'
                    : 'bg-gray-700/30'
                }`}
              >
                <div className="flex-1 truncate">
                  <span className={match.winnerId === match.team1Id ? 'text-green-400 font-medium' : ''}>
                    {match.team1Id ? getTeamName(match.team1Id) : '?'}
                  </span>
                  {t1Record && <span className="text-gray-500 text-xs ml-1">({t1Record})</span>}
                </div>
                <span className="text-gray-500 mx-2 text-xs flex-shrink-0">
                  {match.status === 'completed'
                    ? isBye
                      ? 'BYE'
                      : `${match.team1Score} - ${match.team2Score}`
                    : 'vs'}
                </span>
                <div className="flex-1 truncate text-right">
                  {t2Record && <span className="text-gray-500 text-xs mr-1">({t2Record})</span>}
                  <span className={match.winnerId === match.team2Id ? 'text-green-400 font-medium' : ''}>
                    {match.team2Id ? getTeamName(match.team2Id) : isBye ? 'BYE' : '?'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
