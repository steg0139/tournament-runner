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
 * Calculate head-to-head record between two teams.
 * Returns positive if team A beat team B, negative if B beat A, 0 if they haven't played.
 */
function headToHead(
  teamAId: string,
  teamBId: string,
  matches: Match[]
): number {
  let aWins = 0;
  let bWins = 0;
  for (const m of matches) {
    if (m.status !== 'completed') continue;
    if ((m.team1Id === teamAId && m.team2Id === teamBId) ||
        (m.team1Id === teamBId && m.team2Id === teamAId)) {
      if (m.winnerId === teamAId) aWins++;
      else if (m.winnerId === teamBId) bWins++;
    }
  }
  return bWins - aWins; // negative = A wins h2h, positive = B wins h2h
}

/**
 * Swiss tiebreaker: wins desc, losses asc, head-to-head, SOS desc, point differential desc, seed asc.
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
  // Secondary: fewer losses first
  if (a.losses !== b.losses) return a.losses - b.losses;
  // Tertiary: head-to-head
  const h2h = headToHead(a.teamId, b.teamId, groupMatches);
  if (h2h !== 0) return h2h;
  // Quaternary: strength of schedule desc
  const sosA = calculateSOS(a.teamId, groupMatches, allGroupInfo);
  const sosB = calculateSOS(b.teamId, groupMatches, allGroupInfo);
  if (sosB !== sosA) return sosB - sosA;
  // Quinary: point differential desc
  const diffA = calculatePointDiff(a.teamId, groupMatches);
  const diffB = calculatePointDiff(b.teamId, groupMatches);
  if (diffB !== diffA) return diffB - diffA;
  // Last resort: original seed asc
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

    // Give bye to the highest-ranked team (best SOS) that hasn't had a bye
    const eligibleForBye = sortedTeams.filter((t) => {
      const info = teamStageInfoMap.get(t.id);
      return info && info.byesReceived === 0;
    });

    let byeTeam: Team | undefined;
    if (roundNumber === 1 && eligibleForBye.length > 0) {
      // Random bye for round 1
      const randomIndex = Math.floor(Math.random() * eligibleForBye.length);
      byeTeam = eligibleForBye[randomIndex];
      console.log(`[BYE R${roundNumber}] Random bye assigned to: ${byeTeam.name}`);
    } else if (eligibleForBye.length > 0) {
      // Highest-ranked gets the bye — log the ranking
      const allGroupInfo = stage.teamStageInfo.filter((t) => t.groupId === group.id);
      const groupMatches = stage.matches.filter((m) => m.groupId === group.id);
      const eligibleInfo = allGroupInfo
        .filter((t) => eligibleForBye.some((e) => e.id === t.teamId))
        .sort((a, b) => swissTiebreaker(a, b, groupMatches, allGroupInfo, eligibleForBye));

      console.log(`[BYE R${roundNumber}] Eligible teams for bye (ranked):`);
      for (const info of eligibleInfo) {
        const team = eligibleForBye.find((t) => t.id === info.teamId);
        const sos = calculateSOS(info.teamId, groupMatches, allGroupInfo);
        const diff = calculatePointDiff(info.teamId, groupMatches);
        console.log(`  ${team?.name}: ${info.wins}W-${info.losses}L SOS:${sos} +/-:${diff} seed:${team?.seed}`);
      }

      byeTeam = eligibleForBye.find((t) => t.id === eligibleInfo[0]?.teamId);
      console.log(`[BYE R${roundNumber}] → Bye assigned to: ${byeTeam?.name}`);
    }

    if (byeTeam) {
      const info = teamStageInfoMap.get(byeTeam.id);
      paired.add(byeTeam.id);

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
 * After a score is entered, check if the current round is fully complete.
 * If so, generate the next round using proper Swiss logic (bye to highest-ranked).
 * No progressive/mid-round pairing — wait for full round completion.
 */
function generateProgressivePairings(
  tournament: MultiStageTournament,
  stage: Stage,
  groupId: string
): void {
  const group = stage.groups.find((g) => g.id === groupId);
  if (!group || group.status === 'completed') return;

  const currentRound = group.currentRound;
  const currentRoundMatches = stage.matches.filter(
    (m) => m.groupId === groupId && m.round === currentRound
  );
  const nextRound = currentRound + 1;

  // Only generate next round when ALL current-round matches are complete
  const allCurrentRoundDone = currentRoundMatches.length > 0 &&
    currentRoundMatches.every((m) => m.status === 'completed');

  if (!allCurrentRoundDone) return;

  // Full round complete — generate next round
  group.currentRound = nextRound;

  // Determine bye first (highest-ranked active team without a bye)
  const activeTeamIds = stage.teamStageInfo
    .filter((t) => t.groupId === groupId && t.status === 'active')
    .map((t) => t.teamId);

  let byeTeamId: string | null = null;

  if (activeTeamIds.length % 2 !== 0) {
    const allGroupInfo = stage.teamStageInfo.filter((t) => t.groupId === groupId);
    const groupMatches = stage.matches.filter((m) => m.groupId === groupId);
    const eligibleForBye = allGroupInfo
      .filter((t) => activeTeamIds.includes(t.teamId) && t.byesReceived === 0)
      .sort((a, b) => swissTiebreaker(a, b, groupMatches, allGroupInfo, tournament.teams));

    if (eligibleForBye.length > 0) {
      byeTeamId = eligibleForBye[0].teamId;
      const byeTeam = tournament.teams.find((t) => t.id === byeTeamId);
      console.log(`[BYE R${nextRound}] Eligible teams for bye (ranked):`);
      for (const info of eligibleForBye) {
        const team = tournament.teams.find((t) => t.id === info.teamId);
        const sos = calculateSOS(info.teamId, groupMatches, allGroupInfo);
        const diff = calculatePointDiff(info.teamId, groupMatches);
        console.log(`  ${team?.name}: ${info.wins}W-${info.losses}L SOS:${sos} +/-:${diff} seed:${team?.seed}`);
      }
      console.log(`[BYE R${nextRound}] → Bye assigned to: ${byeTeam?.name}`);

      const byeInfo = stage.teamStageInfo.find((t) => t.teamId === byeTeamId);
      if (byeInfo) {
        byeInfo.wins++;
        byeInfo.byesReceived++;
      }
      stage.matches.push({
        id: uuidv4(), tournamentId: tournament.id, stageId: stage.id, groupId,
        round: nextRound, position: 0,
        team1Id: byeTeamId, team2Id: null, team1Score: null, team2Score: null,
        winnerId: byeTeamId, loserId: null, bracket: 'swiss', status: 'completed',
        nextMatchId: null, nextMatchSlot: null,
      });
    }
  }

  // Pair remaining active teams (excluding bye recipient)
  const toPairIds = activeTeamIds.filter((id) => id !== byeTeamId);

  if (toPairIds.length >= 2) {
    const allGroupInfo = stage.teamStageInfo.filter((t) => t.groupId === groupId);
    const groupMatches = stage.matches.filter((m) => m.groupId === groupId);
    const toPairInfo = allGroupInfo
      .filter((t) => toPairIds.includes(t.teamId))
      .sort((a, b) => swissTiebreaker(a, b, groupMatches, allGroupInfo, tournament.teams));

    const paired = new Set<string>();
    for (let i = 0; i < toPairInfo.length; i++) {
      if (paired.has(toPairInfo[i].teamId)) continue;
      for (let j = i + 1; j < toPairInfo.length; j++) {
        if (paired.has(toPairInfo[j].teamId)) continue;
        const t1 = toPairInfo[i].teamId;
        const t2 = toPairInfo[j].teamId;
        const played = stage.matches.some(
          (m) => m.groupId === groupId &&
            ((m.team1Id === t1 && m.team2Id === t2) || (m.team1Id === t2 && m.team2Id === t1))
        );
        if (!played) {
          paired.add(t1);
          paired.add(t2);
          stage.matches.push({
            id: uuidv4(), tournamentId: tournament.id, stageId: stage.id, groupId,
            round: nextRound, position: stage.matches.filter((m) => m.groupId === groupId && m.round === nextRound).length,
            team1Id: t1, team2Id: t2, team1Score: null, team2Score: null,
            winnerId: null, loserId: null, bracket: 'swiss', status: 'pending',
            nextMatchId: null, nextMatchSlot: null,
          });
          break;
        }
      }
    }
  }

  // If nothing was generated, revert round
  if (stage.matches.filter((m) => m.groupId === groupId && m.round === nextRound).length === 0) {
    group.currentRound = currentRound;
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

  // Condition 4: remaining active teams + advanced >= advancementCount
  // and no more valid pairings exist — complete the group and let advancement pick the best
  if (advancementCount > 0 && (activeTeams.length + advancedTeams.length) >= advancementCount) {
    const groupMatches = stage.matches.filter((m) => m.groupId === groupId);
    const canPair = canGenerateMorePairings(activeTeams, groupMatches, stage.teamStageInfo.filter(t => t.groupId === groupId));
    if (!canPair) {
      group.status = 'completed';
      return;
    }
  }
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
  const advancementCount = stage.advancementCount; // undefined = advance all non-eliminated

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

    if (advancementCount && stage.winsToAdvance) {
      const qualified = groupTeamInfo.filter((t) => t.wins >= stage.winsToAdvance!);
      const remaining = groupTeamInfo.filter((t) => t.wins < stage.winsToAdvance!);

      // Fill up to advancementCount: qualified first, then remaining by rank (tiebreaker)
      const slotsToFill = advancementCount - qualified.length;
      advancing = [...qualified, ...remaining.slice(0, Math.max(0, slotsToFill))];
    } else if (advancementCount) {
      // Fixed count, no winsToAdvance — just take top N
      advancing = groupTeamInfo.slice(0, advancementCount);
    } else if (stage.winsToAdvance) {
      // No fixed count — advance everyone who hit winsToAdvance
      advancing = groupTeamInfo.filter((t) => t.wins >= stage.winsToAdvance! || t.status === 'advanced');
    } else {
      // No criteria at all — advance all non-eliminated
      advancing = groupTeamInfo;
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
