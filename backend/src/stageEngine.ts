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
    throw new Error('Cannot update score for a completed stage');
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

  if (winnerInfo) winnerInfo.wins++;
  if (loserInfo) {
    loserInfo.losses++;
    // Check elimination threshold
    if (
      targetStage.eliminationThreshold &&
      loserInfo.losses >= targetStage.eliminationThreshold
    ) {
      loserInfo.status = 'eliminated';
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
 * done with their current-round match and can play each other.
 * Does NOT award byes — byes only happen via the full "Next Round" button.
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

  // Find teams that have completed their current-round match
  const currentRoundMatches = groupMatches.filter((m) => m.round === currentRound);
  const completedTeamIds = new Set<string>();

  for (const match of currentRoundMatches) {
    if (match.status === 'completed') {
      if (match.team1Id) completedTeamIds.add(match.team1Id);
      if (match.team2Id) completedTeamIds.add(match.team2Id);
    }
  }

  // Determine the next round number for progressive matches
  const nextRound = currentRound + 1;

  // Find teams already paired for next round
  const nextRoundMatches = groupMatches.filter((m) => m.round === nextRound);
  const alreadyPairedNextRound = new Set<string>();
  for (const match of nextRoundMatches) {
    if (match.team1Id) alreadyPairedNextRound.add(match.team1Id);
    if (match.team2Id) alreadyPairedNextRound.add(match.team2Id);
  }

  // Available teams: completed current round, not already paired for next, still active
  const activeTeamIds = new Set(
    stage.teamStageInfo
      .filter((t) => t.groupId === groupId && t.status === 'active')
      .map((t) => t.teamId)
  );

  const availableTeamIds = [...completedTeamIds].filter(
    (id) => !alreadyPairedNextRound.has(id) && activeTeamIds.has(id)
  );

  if (availableTeamIds.length < 2) return;

  // Sort by standings for pairing
  const allGroupInfo = stage.teamStageInfo.filter((t) => t.groupId === groupId);
  const availableInfo = allGroupInfo
    .filter((t) => availableTeamIds.includes(t.teamId))
    .sort((a, b) => swissTiebreaker(a, b, groupMatches, allGroupInfo, tournament.teams));

  // Pair ALL available adjacent teams, but ONLY if they have similar records.
  // Skip mismatched pairings — wait for more teams to finish.
  const paired = new Set<string>();
  for (let i = 0; i < availableInfo.length; i++) {
    if (paired.has(availableInfo[i].teamId)) continue;

    for (let j = i + 1; j < availableInfo.length; j++) {
      if (paired.has(availableInfo[j].teamId)) continue;

      const t1 = availableInfo[i].teamId;
      const t2 = availableInfo[j].teamId;

      // Only pair teams with the same win count (Swiss principle)
      if (availableInfo[i].wins !== availableInfo[j].wins) continue;

      // Check ALL matches in this group (including ones just added) to prevent rematches
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
          position: nextRoundMatches.length + Math.floor(paired.size / 2) - 1,
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
        break; // Move to next i — each team paired once
      }
    }
  }

  // Check if the ENTIRE current round is now complete
  const allCurrentRoundDone = currentRoundMatches.length > 0 &&
    currentRoundMatches.every((m) => m.status === 'completed');

  if (allCurrentRoundDone) {
    // Advance group's current round so the UI shows the new matches as active
    group.currentRound = nextRound;

    // Now generate any remaining pairings for teams that weren't progressively paired
    // (including byes for odd teams)
    const updatedNextRoundMatches = stage.matches.filter(
      (m) => m.groupId === groupId && m.round === nextRound
    );
    const pairedInNextRound = new Set<string>();
    for (const m of updatedNextRoundMatches) {
      if (m.team1Id) pairedInNextRound.add(m.team1Id);
      if (m.team2Id) pairedInNextRound.add(m.team2Id);
    }

    // Teams still needing pairing
    const remainingTeamIds = [...activeTeamIds].filter(
      (id) => !pairedInNextRound.has(id)
    );

    if (remainingTeamIds.length >= 2) {
      const remainingInfo = allGroupInfo
        .filter((t) => remainingTeamIds.includes(t.teamId))
        .sort((a, b) => swissTiebreaker(a, b, groupMatches, allGroupInfo, tournament.teams));

      const rPaired = new Set<string>();
      for (let i = 0; i < remainingInfo.length; i++) {
        if (rPaired.has(remainingInfo[i].teamId)) continue;

        for (let j = i + 1; j < remainingInfo.length; j++) {
          if (rPaired.has(remainingInfo[j].teamId)) continue;

          const t1 = remainingInfo[i].teamId;
          const t2 = remainingInfo[j].teamId;

          const alreadyPlayed = stage.matches.some(
            (m) =>
              m.groupId === groupId &&
              ((m.team1Id === t1 && m.team2Id === t2) ||
               (m.team1Id === t2 && m.team2Id === t1))
          );

          if (!alreadyPlayed) {
            rPaired.add(t1);
            rPaired.add(t2);

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
            break;
          }
        }
      }

      // Handle bye for any remaining unpaired team (odd number)
      const finalPairedInNextRound = new Set<string>();
      for (const m of stage.matches.filter((m) => m.groupId === groupId && m.round === nextRound)) {
        if (m.team1Id) finalPairedInNextRound.add(m.team1Id);
        if (m.team2Id) finalPairedInNextRound.add(m.team2Id);
      }
      const unpairedTeams = [...activeTeamIds].filter((id) => !finalPairedInNextRound.has(id));

      if (unpairedTeams.length === 1) {
        const byeTeamId = unpairedTeams[0];
        const byeInfo = stage.teamStageInfo.find((t) => t.teamId === byeTeamId);

        if (byeInfo && byeInfo.byesReceived === 0) {
          byeInfo.wins++;
          byeInfo.byesReceived++;

          stage.matches.push({
            id: uuidv4(),
            tournamentId: tournament.id,
            stageId: stage.id,
            groupId,
            round: nextRound,
            position: stage.matches.filter((m) => m.groupId === groupId && m.round === nextRound).length,
            team1Id: byeTeamId,
            team2Id: null,
            team1Score: null,
            team2Score: null,
            winnerId: byeTeamId,
            loserId: null,
            bracket: 'swiss',
            status: 'completed',
            nextMatchId: null,
            nextMatchSlot: null,
          });
        }
      }
    } else if (remainingTeamIds.length === 1) {
      // Single remaining team needs a bye
      const byeTeamId = remainingTeamIds[0];
      const byeInfo = stage.teamStageInfo.find((t) => t.teamId === byeTeamId);

      if (byeInfo && byeInfo.byesReceived === 0) {
        byeInfo.wins++;
        byeInfo.byesReceived++;

        stage.matches.push({
          id: uuidv4(),
          tournamentId: tournament.id,
          stageId: stage.id,
          groupId,
          round: nextRound,
          position: stage.matches.filter((m) => m.groupId === groupId && m.round === nextRound).length,
          team1Id: byeTeamId,
          team2Id: null,
          team1Score: null,
          team2Score: null,
          winnerId: byeTeamId,
          loserId: null,
          bracket: 'swiss',
          status: 'completed',
          nextMatchId: null,
          nextMatchSlot: null,
        });
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

  const activeTeams = stage.teamStageInfo.filter(
    (t) => t.groupId === groupId && t.status === 'active'
  );

  const advancementCount = stage.advancementCount || activeTeams.length;

  // Condition 1: active teams == advancement count (all others eliminated)
  if (activeTeams.length <= advancementCount) {
    group.status = 'completed';
    return;
  }

  // Condition 2: winsToAdvance — check if enough teams have hit the win threshold
  if (stage.winsToAdvance) {
    const qualifiedTeams = stage.teamStageInfo.filter(
      (t) => t.groupId === groupId && t.wins >= stage.winsToAdvance!
    );
    if (qualifiedTeams.length >= advancementCount) {
      group.status = 'completed';
      return;
    }
  }

  // Condition 3: check if current round is complete and no valid pairings remain
  const groupMatches = stage.matches.filter((m) => m.groupId === groupId);
  const pendingMatches = groupMatches.filter((m) => m.status === 'pending');

  if (pendingMatches.length === 0) {
    const canPair = canGenerateMorePairings(activeTeams, groupMatches, stage.teamStageInfo.filter(t => t.groupId === groupId));
    if (!canPair) {
      // No more pairings possible — group is done, advancement will pick top N via tiebreakers
      group.status = 'completed';
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
