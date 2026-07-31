import { v4 as uuidv4 } from 'uuid';
import {
  Team,
  Match,
  Group,
  Stage,
  TeamStageInfo,
  MultiStageTournament,
} from './types';
import { generateMatches } from './brackets';

/**
 * Calculate Strength of Schedule for a team within a stage/group.
 * SOS = sum of wins of all opponents that team has played.
 */
function calculateSOS(
  teamId: string,
  matches: Match[],
  teamStageInfo: TeamStageInfo[]
): number {
  const winsMap = new Map(teamStageInfo.map((t) => [t.teamId, t.wins]));

  let sos = 0;
  for (const match of matches) {
    if (match.status !== 'completed') continue;
    let opponentId: string | null = null;
    if (match.team1Id === teamId) opponentId = match.team2Id;
    else if (match.team2Id === teamId) opponentId = match.team1Id;

    if (opponentId && winsMap.has(opponentId)) {
      sos += winsMap.get(opponentId)!;
    }
  }
  return sos;
}

/**
 * Calculate point differential for a team within a stage/group.
 */
function calculatePointDiff(
  teamId: string,
  matches: Match[]
): number {
  let diff = 0;
  for (const match of matches) {
    if (match.status !== 'completed') continue;
    if (match.team1Id === teamId) {
      diff += (match.team1Score || 0) - (match.team2Score || 0);
    } else if (match.team2Id === teamId) {
      diff += (match.team2Score || 0) - (match.team1Score || 0);
    }
  }
  return diff;
}

/**
 * Swiss tiebreaker comparison: wins desc, then SOS desc, then point differential desc, then seed asc.
 */
function swissTiebreaker(
  a: TeamStageInfo,
  b: TeamStageInfo,
  groupMatches: Match[],
  allGroupInfo: TeamStageInfo[],
  teams: Team[]
): number {
  // Primary: wins desc
  if (b.wins !== a.wins) return b.wins - a.wins;
  // Secondary: strength of schedule desc
  const sosA = calculateSOS(a.teamId, groupMatches, allGroupInfo);
  const sosB = calculateSOS(b.teamId, groupMatches, allGroupInfo);
  if (sosB !== sosA) return sosB - sosA;
  // Tertiary: point differential desc
  const diffA = calculatePointDiff(a.teamId, groupMatches);
  const diffB = calculatePointDiff(b.teamId, groupMatches);
  if (diffB !== diffA) return diffB - diffA;
  // Quaternary: original seed asc
  const teamA = teams.find((t) => t.id === a.teamId);
  const teamB = teams.find((t) => t.id === b.teamId);
  return (teamA?.seed || 999) - (teamB?.seed || 999);
}

/**
 * Assign teams to groups using snake-order distribution by seed.
 * For 8 teams / 2 groups: Group A = [1,4,5,8], Group B = [2,3,6,7]
 */
export function assignTeamsToGroups(
  teams: Team[],
  groupCount: number,
  stageId: string
): Group[] {
  const sortedTeams = [...teams].sort((a, b) => (a.seed || 999) - (b.seed || 999));

  const groups: Group[] = [];
  const groupNames = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  for (let i = 0; i < groupCount; i++) {
    groups.push({
      id: uuidv4(),
      stageId,
      name: `Group ${groupNames[i] || i + 1}`,
      teamIds: [],
      status: 'in_progress',
      currentRound: 0,
    });
  }

  // Snake-order distribution
  let direction = 1; // 1 = left-to-right, -1 = right-to-left
  let groupIndex = 0;

  for (const team of sortedTeams) {
    groups[groupIndex].teamIds.push(team.id);

    // Move to next group in snake order
    const nextIndex = groupIndex + direction;
    if (nextIndex >= groupCount || nextIndex < 0) {
      // Reverse direction
      direction *= -1;
    } else {
      groupIndex = nextIndex;
    }
  }

  return groups;
}

/**
 * Generate Swiss round pairings for a specific group, respecting elimination.
 */
export function generateGroupSwissRound(
  tournamentId: string,
  group: Group,
  stage: Stage,
  teams: Team[]
): Match[] {
  if (group.status === 'completed') {
    return [];
  }

  const eliminationThreshold = stage.eliminationThreshold || 999;
  const groupMatches = stage.matches.filter((m) => m.groupId === group.id);

  // Get active (non-eliminated) teams in this group
  const activeTeamIds = new Set(
    stage.teamStageInfo
      .filter((t) => t.groupId === group.id && t.status === 'active')
      .map((t) => t.teamId)
  );

  const activeTeams = teams.filter((t) => activeTeamIds.has(t.id));

  if (activeTeams.length < 2) {
    return [];
  }

  // Sort by wins desc, then seed asc
  const standings = new Map<string, { wins: number; losses: number }>();
  activeTeams.forEach((t) => standings.set(t.id, { wins: 0, losses: 0 }));

  groupMatches
    .filter((m) => m.status === 'completed')
    .forEach((m) => {
      if (m.winnerId && standings.has(m.winnerId)) {
        standings.get(m.winnerId)!.wins++;
      }
      if (m.loserId && standings.has(m.loserId)) {
        standings.get(m.loserId)!.losses++;
      }
    });

  const sortedTeams = [...activeTeams].sort((a, b) => {
    const aS = standings.get(a.id)!;
    const bS = standings.get(b.id)!;
    if (bS.wins !== aS.wins) return bS.wins - aS.wins;
    // SOS tiebreaker for pairing
    const sosA = calculateSOS(a.id, groupMatches, stage.teamStageInfo.filter(t => t.groupId === group.id));
    const sosB = calculateSOS(b.id, groupMatches, stage.teamStageInfo.filter(t => t.groupId === group.id));
    if (sosB !== sosA) return sosB - sosA;
    return (a.seed || 999) - (b.seed || 999);
  });

  const matches: Match[] = [];
  const paired = new Set<string>();
  const roundNumber = group.currentRound + 1;

  // Handle bye for odd number of teams
  if (sortedTeams.length % 2 !== 0) {
    const teamStageInfoMap = new Map(
      stage.teamStageInfo
        .filter((t) => t.groupId === group.id)
        .map((t) => [t.teamId, t])
    );

    // For round 1, randomize who gets the bye. Later rounds: lowest-ranked without a bye.
    const eligibleForBye = sortedTeams.filter((t) => {
      const info = teamStageInfoMap.get(t.id);
      return info && info.byesReceived === 0;
    });

    let byeTeam: Team | undefined;
    if (roundNumber === 1 && eligibleForBye.length > 0) {
      // Random bye for round 1
      const randomIndex = Math.floor(Math.random() * eligibleForBye.length);
      byeTeam = eligibleForBye[randomIndex];
    } else {
      // Lowest-ranked team without a bye
      for (let i = sortedTeams.length - 1; i >= 0; i--) {
        const info = teamStageInfoMap.get(sortedTeams[i].id);
        if (info && info.byesReceived === 0) {
          byeTeam = sortedTeams[i];
          break;
        }
      }
    }

    if (byeTeam) {
      const info = teamStageInfoMap.get(byeTeam.id);
      paired.add(byeTeam.id);

      // Update team stage info immediately for the bye
      if (info) {
        info.wins++;
        info.byesReceived++;
      }

      matches.push({
        id: uuidv4(),
        tournamentId,
        stageId: stage.id,
        groupId: group.id,
        round: roundNumber,
        position: matches.length,
        team1Id: byeTeam.id,
        team2Id: null,
        team1Score: null,
        team2Score: null,
        winnerId: byeTeam.id,
        loserId: null,
        bracket: 'swiss',
        status: 'completed',
        nextMatchId: null,
        nextMatchSlot: null,
      });
    }
  }

  // Pair adjacent teams, skip already-played pairs
  for (let i = 0; i < sortedTeams.length; i++) {
    if (paired.has(sortedTeams[i].id)) continue;

    for (let j = i + 1; j < sortedTeams.length; j++) {
      if (paired.has(sortedTeams[j].id)) continue;

      // Check ALL matches in this group to prevent rematches
      const alreadyPlayed = stage.matches.some(
        (m) =>
          m.groupId === group.id &&
          ((m.team1Id === sortedTeams[i].id && m.team2Id === sortedTeams[j].id) ||
           (m.team1Id === sortedTeams[j].id && m.team2Id === sortedTeams[i].id))
      );

      if (!alreadyPlayed) {
        paired.add(sortedTeams[i].id);
        paired.add(sortedTeams[j].id);

        matches.push({
          id: uuidv4(),
          tournamentId,
          stageId: stage.id,
          groupId: group.id,
          round: roundNumber,
          position: matches.length,
          team1Id: sortedTeams[i].id,
          team2Id: sortedTeams[j].id,
          team1Score: null,
          team2Score: null,
          winnerId: null,
          loserId: null,
          bracket: 'swiss',
          status: 'pending',
          nextMatchId: null,
          nextMatchSlot: null,
        });
        break;
      }
    }
  }

  return matches;
}

/**
 * Revert a completed match result and apply a new score.
 * Used for editing match results after the fact.
 */
export function revertAndReScore(
  tournament: MultiStageTournament,
  matchId: string,
  newTeam1Score: number,
  newTeam2Score: number
): MultiStageTournament {
  // Find the match
  let targetStage: Stage | undefined;
  let targetMatch: Match | undefined;

  for (const stage of tournament.stages) {
    const match = stage.matches.find((m) => m.id === matchId);
    if (match) {
      targetStage = stage;
      targetMatch = match;
      break;
    }
  }

  if (!targetStage || !targetMatch) {
    throw new Error('Match not found');
  }

  if (targetMatch.status !== 'completed') {
    throw new Error('Can only edit completed matches');
  }

  // Revert the old result
  const oldWinnerId = targetMatch.winnerId;
  const oldLoserId = targetMatch.loserId;

  if (oldWinnerId) {
    const winnerInfo = targetStage.teamStageInfo.find((t) => t.teamId === oldWinnerId);
    if (winnerInfo) {
      winnerInfo.wins = Math.max(0, winnerInfo.wins - 1);
      // If they were marked advanced due to this win, revert to active
      if (winnerInfo.status === 'advanced' && targetStage.winsToAdvance && winnerInfo.wins < targetStage.winsToAdvance) {
        winnerInfo.status = 'active';
      }
    }
  }
  if (oldLoserId) {
    const loserInfo = targetStage.teamStageInfo.find((t) => t.teamId === oldLoserId);
    if (loserInfo) {
      loserInfo.losses = Math.max(0, loserInfo.losses - 1);
      // If they were eliminated due to this loss, revert to active
      if (loserInfo.status === 'eliminated' && targetStage.eliminationThreshold && loserInfo.losses < targetStage.eliminationThreshold) {
        loserInfo.status = 'active';
      }
    }
  }

  // Apply new result
  const newWinnerId = newTeam1Score > newTeam2Score ? targetMatch.team1Id : targetMatch.team2Id;
  const newLoserId = newTeam1Score > newTeam2Score ? targetMatch.team2Id : targetMatch.team1Id;

  targetMatch.team1Score = newTeam1Score;
  targetMatch.team2Score = newTeam2Score;
  targetMatch.winnerId = newWinnerId;
  targetMatch.loserId = newLoserId;

  // Update new winner
  if (newWinnerId) {
    const winnerInfo = targetStage.teamStageInfo.find((t) => t.teamId === newWinnerId);
    if (winnerInfo) {
      winnerInfo.wins++;
      if (targetStage.winsToAdvance && winnerInfo.wins >= targetStage.winsToAdvance && winnerInfo.status === 'active') {
        winnerInfo.status = 'advanced';
        cancelPendingMatches(targetStage, winnerInfo.teamId);
      }
    }
  }

  // Update new loser
  if (newLoserId) {
    const loserInfo = targetStage.teamStageInfo.find((t) => t.teamId === newLoserId);
    if (loserInfo) {
      loserInfo.losses++;
      if (targetStage.eliminationThreshold && loserInfo.losses >= targetStage.eliminationThreshold) {
        loserInfo.status = 'eliminated';
        cancelPendingMatches(targetStage, loserInfo.teamId);
      }
    }
  }

  // After editing, cancel pending progressive matches in FUTURE rounds and regenerate them
  // Current round matchups are unaffected since they're already set
  if (targetMatch.groupId) {
    const group = targetStage.groups.find((g) => g.id === targetMatch!.groupId);
    if (group) {
      const currentRound = group.currentRound;
      // Remove only future-round pending matches (progressive ones)
      targetStage.matches = targetStage.matches.filter(
        (m) => !(m.groupId === targetMatch!.groupId && m.status === 'pending' && m.round > currentRound)
      );
      // Regenerate progressive pairings based on updated standings
      generateProgressivePairings(tournament, targetStage, targetMatch!.groupId);
    }
  }

  return tournament;
}

/**
 * Cancel ALL pending matches in a group (used after editing a result).
 */
function cancelAllPendingInGroup(stage: Stage, groupId: string): void {
  stage.matches = stage.matches.filter(
    (m) => !(m.groupId === groupId && m.status === 'pending')
  );
}

/**
 * Cancel any pending matches a team is involved in.
 * Frees up the opponent to be re-paired.
 */
function cancelPendingMatches(stage: Stage, teamId: string): void {
  const pendingMatches = stage.matches.filter(
    (m) => m.status === 'pending' && (m.team1Id === teamId || m.team2Id === teamId)
  );

  for (const match of pendingMatches) {
    // Remove the match entirely
    const index = stage.matches.indexOf(match);
    if (index !== -1) {
      stage.matches.splice(index, 1);
    }
  }
}

/**
 * Process a score update for a multi-stage tournament match.
 * Handles: score recording, elimination checks, group/stage completion, advancement.
 */
export function processScoreUpdate(
  tournament: MultiStageTournament,
  matchId: string,
  team1Score: number,
  team2Score: number
): MultiStageTournament {
  // Find the match across all stages
  let targetStage: Stage | undefined;
  let targetMatch: Match | undefined;

  for (const stage of tournament.stages) {
    const match = stage.matches.find((m) => m.id === matchId);
    if (match) {
      targetStage = stage;
      targetMatch = match;
      break;
    }
  }

  if (!targetStage || !targetMatch) {
    throw new Error('Match not found');
  }

  if (targetStage.status === 'completed') {
    throw new Error('Cannot enter new scores for a completed stage. Use edit instead.');
  }

  if (!targetMatch.team1Id || !targetMatch.team2Id) {
    throw new Error('Match does not have both teams assigned yet');
  }

  // Update scores
  targetMatch.team1Score = team1Score;
  targetMatch.team2Score = team2Score;
  targetMatch.winnerId = team1Score > team2Score ? targetMatch.team1Id : targetMatch.team2Id;
  targetMatch.loserId = team1Score > team2Score ? targetMatch.team2Id : targetMatch.team1Id;
  targetMatch.status = 'completed';

  // Advance winner to next match (for elimination formats)
  if (targetMatch.nextMatchId && targetMatch.winnerId) {
    const nextMatch = targetStage.matches.find((m) => m.id === targetMatch!.nextMatchId);
    if (nextMatch) {
      if (targetMatch.nextMatchSlot === 'team1') {
        nextMatch.team1Id = targetMatch.winnerId;
      } else {
        nextMatch.team2Id = targetMatch.winnerId;
      }
    }
  }

  // Update team stage info
  const winnerInfo = targetStage.teamStageInfo.find((t) => t.teamId === targetMatch!.winnerId);
  const loserInfo = targetStage.teamStageInfo.find((t) => t.teamId === targetMatch!.loserId);

  if (winnerInfo) {
    winnerInfo.wins++;
    // Check if team has reached winsToAdvance threshold
    if (
      targetStage.winsToAdvance &&
      winnerInfo.wins >= targetStage.winsToAdvance &&
      winnerInfo.status === 'active'
    ) {
      winnerInfo.status = 'advanced';
      // Cancel any pending matches this team is in
      cancelPendingMatches(targetStage, winnerInfo.teamId);
    }
  }
  if (loserInfo) {
    loserInfo.losses++;
    // Check elimination threshold
    if (
      targetStage.eliminationThreshold &&
      loserInfo.losses >= targetStage.eliminationThreshold
    ) {
      loserInfo.status = 'eliminated';
      // Cancel any pending matches this team is in
      cancelPendingMatches(targetStage, loserInfo.teamId);
    }
  }

  // Handle bye wins (update byesReceived)
  if (!targetMatch.team2Id && targetMatch.winnerId) {
    const byeTeamInfo = targetStage.teamStageInfo.find(
      (t) => t.teamId === targetMatch!.winnerId
    );
    if (byeTeamInfo) byeTeamInfo.byesReceived++;
  }

  // Check group completion (for group stages)
  if (targetMatch.groupId) {
    // Try progressive pairing: pair teams that are done with their current match
    generateProgressivePairings(tournament, targetStage, targetMatch.groupId);

    checkGroupCompletion(tournament, targetStage, targetMatch.groupId);
  }

  // Check stage completion
  checkStageCompletion(tournament, targetStage);

  return tournament;
}

/**
 * Generate progressive pairings: after a match completes, pair teams that are
 * done with their current-round match and can play each other (same record only).
 * When the full round is complete, generates the complete next round with proper Swiss logic.
 */
function generateProgressivePairings(
  tournament: MultiStageTournament,
  stage: Stage,
  groupId: string
): void {
  const group = stage.groups.find((g) => g.id === groupId);
  if (!group || group.status === 'completed') return;

  const groupMatches = stage.matches.filter((m) => m.groupId === groupId);
  const currentRound = group.currentRound;
  const currentRoundMatches = groupMatches.filter((m) => m.round === currentRound);

  // Check if the entire current round is complete
  const allCurrentRoundDone = currentRoundMatches.length > 0 &&
    currentRoundMatches.every((m) => m.status === 'completed');

  if (allCurrentRoundDone) {
    // Full round complete — generate the next round using the standard Swiss logic
    group.currentRound = currentRound + 1;
    const groupTeams = tournament.teams.filter((t) => group.teamIds.includes(t.id));
    const newMatches = generateGroupSwissRound(
      tournament.id,
      group,
      stage,
      groupTeams
    );
    stage.matches.push(...newMatches);

    // If no matches generated, revert the round bump (group might be done)
    if (newMatches.length === 0) {
      group.currentRound = currentRound;
    }
    return;
  }

  // Mid-round: check courts threshold
  const pendingInCurrentRound = currentRoundMatches.filter((m) => m.status === 'pending').length;
  const courtsAvailable = stage.courts || 0;

  if (courtsAvailable > 0 && pendingInCurrentRound >= courtsAvailable) {
    return;
  }

  // Find teams that completed their current-round match
  const completedTeamIds = new Set<string>();
  for (const match of currentRoundMatches) {
    if (match.status === 'completed') {
      if (match.team1Id) completedTeamIds.add(match.team1Id);
      if (match.team2Id) completedTeamIds.add(match.team2Id);
    }
  }

  const nextRound = currentRound + 1;
  const nextRoundMatches = stage.matches.filter((m) => m.groupId === groupId && m.round === nextRound);
  const alreadyPairedNextRound = new Set<string>();
  for (const match of nextRoundMatches) {
    if (match.team1Id) alreadyPairedNextRound.add(match.team1Id);
    if (match.team2Id) alreadyPairedNextRound.add(match.team2Id);
  }

  // Available: completed current round, active, not already paired, not in any pending match
  const activeTeamIds = new Set(
    stage.teamStageInfo
      .filter((t) => t.groupId === groupId && t.status === 'active')
      .map((t) => t.teamId)
  );

  const teamsInPendingMatches = new Set<string>();
  for (const m of stage.matches) {
    if (m.status === 'pending' && m.groupId === groupId) {
      if (m.team1Id) teamsInPendingMatches.add(m.team1Id);
      if (m.team2Id) teamsInPendingMatches.add(m.team2Id);
    }
  }

  const availableTeamIds = [...completedTeamIds].filter(
    (id) => !alreadyPairedNextRound.has(id) && activeTeamIds.has(id) && !teamsInPendingMatches.has(id)
  );

  if (availableTeamIds.length < 2) return;

  // Sort by standings
  const allGroupInfo = stage.teamStageInfo.filter((t) => t.groupId === groupId);
  const availableInfo = allGroupInfo
    .filter((t) => availableTeamIds.includes(t.teamId))
    .sort((a, b) => swissTiebreaker(a, b, stage.matches.filter((m) => m.groupId === groupId), allGroupInfo, tournament.teams));

  // Pair ONLY same-record teams (mid-round progressive)
  const paired = new Set<string>();
  for (let i = 0; i < availableInfo.length; i++) {
    if (paired.has(availableInfo[i].teamId)) continue;

    for (let j = i + 1; j < availableInfo.length; j++) {
      if (paired.has(availableInfo[j].teamId)) continue;

      const t1 = availableInfo[i].teamId;
      const t2 = availableInfo[j].teamId;

      if (availableInfo[i].wins !== availableInfo[j].wins) continue;

      const alreadyPlayed = stage.matches.some(
        (m) =>
          m.groupId === groupId &&
          ((m.team1Id === t1 && m.team2Id === t2) ||
           (m.team1Id === t2 && m.team2Id === t1))
      );

      if (!alreadyPlayed) {
        paired.add(t1);
        paired.add(t2);

        stage.matches.push({
          id: uuidv4(),
          tournamentId: tournament.id,
          stageId: stage.id,
          groupId,
          round: nextRound,
          position: stage.matches.filter((m) => m.groupId === groupId && m.round === nextRound).length,
          team1Id: t1,
          team2Id: t2,
          team1Score: null,
          team2Score: null,
          winnerId: null,
          loserId: null,
          bracket: 'swiss',
          status: 'pending',
          nextMatchId: null,
          nextMatchSlot: null,
        });
        break; // Next i
      }
    }
  }
}

/**
 * Check if a group is complete.
 */
function checkGroupCompletion(
  tournament: MultiStageTournament,
  stage: Stage,
  groupId: string
): void {
  const group = stage.groups.find((g) => g.id === groupId);
  if (!group || group.status === 'completed') return;

  // Never complete a group while it still has pending matches
  const groupMatches = stage.matches.filter((m) => m.groupId === groupId);
  const pendingMatches = groupMatches.filter((m) => m.status === 'pending');
  if (pendingMatches.length > 0) return;

  const activeTeams = stage.teamStageInfo.filter(
    (t) => t.groupId === groupId && t.status === 'active'
  );
  const advancedTeams = stage.teamStageInfo.filter(
    (t) => t.groupId === groupId && t.status === 'advanced'
  );

  const advancementCount = stage.advancementCount || 0;

  // Condition 1: enough teams have advanced (hit winsToAdvance)
  if (advancementCount > 0 && advancedTeams.length >= advancementCount) {
    group.status = 'completed';
    return;
  }

  // Condition 2: active teams + advanced = advancementCount (everyone else eliminated)
  if (advancementCount > 0 && (activeTeams.length + advancedTeams.length) <= advancementCount) {
    group.status = 'completed';
    return;
  }

  // Condition 3: no active teams left at all (everyone advanced or eliminated)
  if (activeTeams.length === 0) {
    group.status = 'completed';
    return;
  }

  // Do NOT auto-complete just because pairings are hard — let the user click "Next Round"
  // which uses the full pairing algorithm that allows cross-record matches
}

/**
 * Check if more Swiss pairings are possible for active teams in a group.
 */
function canGenerateMorePairings(
  activeTeams: TeamStageInfo[],
  groupMatches: Match[],
  _allTeamInfo: TeamStageInfo[]
): boolean {
  // Check if any pair of active teams hasn't played each other
  for (let i = 0; i < activeTeams.length; i++) {
    for (let j = i + 1; j < activeTeams.length; j++) {
      const t1 = activeTeams[i].teamId;
      const t2 = activeTeams[j].teamId;
      const played = groupMatches.some(
        (m) =>
          (m.team1Id === t1 && m.team2Id === t2) ||
          (m.team1Id === t2 && m.team2Id === t1)
      );
      if (!played) return true;
    }
  }
  return false;
}

/**
 * Check if a stage is complete (all groups complete for group stages,
 * or all matches complete for non-group stages).
 */
function checkStageCompletion(
  tournament: MultiStageTournament,
  stage: Stage
): void {
  if (stage.status === 'completed') return;

  if (stage.groups.length > 0) {
    // Group stage: all groups must be complete
    const allGroupsComplete = stage.groups.every((g) => g.status === 'completed');
    if (allGroupsComplete) {
      stage.status = 'completed';
      triggerAdvancement(tournament, stage);
    }
  } else {
    // Non-group stage (e.g., single elim playoff): check if all meaningful matches are done
    const allMatchesDone = stage.matches.every(
      (m) => m.status === 'completed' || (!m.team1Id && !m.team2Id)
    );
    if (allMatchesDone) {
      stage.status = 'completed';
      // Check if this is the final stage
      const isLastStage = stage.position === Math.max(...tournament.stages.map((s) => s.position));
      if (isLastStage) {
        checkTournamentComplete(tournament, stage);
      } else {
        triggerAdvancement(tournament, stage);
      }
    }
  }
}

/**
 * Trigger advancement from a completed stage to the next stage.
 */
function triggerAdvancement(
  tournament: MultiStageTournament,
  completedStage: Stage
): void {
  const nextStage = tournament.stages.find(
    (s) => s.position === completedStage.position + 1
  );
  if (!nextStage) {
    // This was the last stage
    checkTournamentComplete(tournament, completedStage);
    return;
  }

  const advancingTeams = getAdvancingTeams(tournament, completedStage);

  if (advancingTeams.length < 2) {
    // Not enough teams to continue
    tournament.status = 'completed';
    if (advancingTeams.length === 1) {
      tournament.championId = advancingTeams[0].id;
    }
    return;
  }

  // Mark advancing teams
  completedStage.advancedTeamIds = advancingTeams.map((t) => t.id);

  // Set up next stage
  nextStage.status = 'in_progress';

  if (nextStage.groupCount > 1) {
    // Next stage has groups too
    nextStage.groups = assignTeamsToGroups(advancingTeams, nextStage.groupCount, nextStage.id);
    nextStage.teamStageInfo = advancingTeams.map((t) => {
      const group = nextStage.groups.find((g) => g.teamIds.includes(t.id))!;
      return {
        teamId: t.id,
        groupId: group.id,
        status: 'active' as const,
        wins: 0,
        losses: 0,
        byesReceived: 0,
      };
    });

    // Generate first round for each group
    for (const group of nextStage.groups) {
      const groupTeams = advancingTeams.filter((t) => group.teamIds.includes(t.id));
      const roundMatches = generateGroupSwissRound(
        tournament.id,
        group,
        nextStage,
        groupTeams
      );
      nextStage.matches.push(...roundMatches);
      group.currentRound = 1;
    }
  } else {
    // Next stage has no groups - generate matches directly
    const matches = generateMatches(tournament.id, advancingTeams, nextStage.format);
    // Tag matches with stageId
    matches.forEach((m) => {
      m.stageId = nextStage.id;
    });
    nextStage.matches = matches;
    nextStage.teamStageInfo = advancingTeams.map((t) => ({
      teamId: t.id,
      groupId: '',
      status: 'active' as const,
      wins: 0,
      losses: 0,
      byesReceived: 0,
    }));
  }

  tournament.currentStageId = nextStage.id;
}

/**
 * Get teams that should advance from a completed stage.
 * Priority: teams that hit winsToAdvance first, then fill remaining slots by wins desc + seed tiebreaker.
 */
function getAdvancingTeams(
  tournament: MultiStageTournament,
  stage: Stage
): Team[] {
  const advancementCount = stage.advancementCount || 0;
  if (advancementCount === 0) return [];

  const advancingTeamIds: { teamId: string; groupIndex: number; rank: number; wins: number }[] = [];

  for (let gi = 0; gi < stage.groups.length; gi++) {
    const group = stage.groups[gi];

    // Rank teams in this group by wins desc, then SOS desc, then seed asc
    const groupMatches = stage.matches.filter((m) => m.groupId === group.id);
    const allGroupInfo = stage.teamStageInfo.filter((t) => t.groupId === group.id);

    const groupTeamInfo = stage.teamStageInfo
      .filter((t) => t.groupId === group.id && t.status !== 'eliminated')
      .sort((a, b) => swissTiebreaker(a, b, groupMatches, allGroupInfo, tournament.teams));

    // If winsToAdvance is set, prioritize teams that hit it
    let advancing: typeof groupTeamInfo;

    if (stage.winsToAdvance) {
      const qualified = groupTeamInfo.filter((t) => t.wins >= stage.winsToAdvance!);
      const remaining = groupTeamInfo.filter((t) => t.wins < stage.winsToAdvance!);

      // Fill up to advancementCount: qualified first, then remaining by rank (tiebreaker)
      const slotsToFill = advancementCount - qualified.length;
      advancing = [...qualified, ...remaining.slice(0, Math.max(0, slotsToFill))];
    } else {
      // No winsToAdvance — just take top N
      advancing = groupTeamInfo.slice(0, advancementCount);
    }

    advancing.forEach((t, rank) => {
      advancingTeamIds.push({
        teamId: t.teamId,
        groupIndex: gi,
        rank,
        wins: t.wins,
      });

      // Mark as advanced in stage info
      const info = stage.teamStageInfo.find((i) => i.teamId === t.teamId);
      if (info) info.status = 'advanced';
    });
  }

  // Interleave: all rank-0 (group winners) first across groups, then rank-1, etc.
  advancingTeamIds.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    // Within same rank, alternate groups
    return a.groupIndex - b.groupIndex;
  });

  // Map back to Team objects with new seeds for next stage
  return advancingTeamIds.map((info, index) => {
    const team = tournament.teams.find((t) => t.id === info.teamId)!;
    return { ...team, seed: index + 1 };
  });
}

/**
 * Check if the tournament is complete (final stage done).
 */
function checkTournamentComplete(
  tournament: MultiStageTournament,
  finalStage: Stage
): void {
  tournament.status = 'completed';

  // Determine champion based on format
  if (
    finalStage.format === 'single_elimination' ||
    finalStage.format === 'double_elimination'
  ) {
    // Champion is winner of the last match
    const lastRound = Math.max(...finalStage.matches.map((m) => m.round));
    const finalMatch = finalStage.matches.find(
      (m) => m.round === lastRound && m.status === 'completed'
    );
    if (finalMatch?.winnerId) {
      tournament.championId = finalMatch.winnerId;
    }
  } else {
    // Round robin or Swiss: most wins, SOS tiebreaker
    const allMatches = finalStage.matches;
    const allInfo = finalStage.teamStageInfo;
    const standings = finalStage.teamStageInfo
      .slice()
      .sort((a, b) => swissTiebreaker(a, b, allMatches, allInfo, tournament.teams));
    if (standings.length > 0) {
      tournament.championId = standings[0].teamId;
    }
  }
}
