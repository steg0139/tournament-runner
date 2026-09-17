import { v4 as uuidv4 } from 'uuid';
import { Team, Match, TournamentFormat } from './types';

/**
 * Return a copy of the teams with their `seed` values randomly reassigned
 * (Fisher–Yates shuffle). Seeds become 1..N in the shuffled order.
 */
export function randomizeSeeds(teams: Team[]): Team[] {
  const shuffled = [...teams];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.map((t, i) => ({ ...t, seed: i + 1 }));
}

export interface GenerateMatchesOptions {
  // Double elimination: require the losers-bracket champion to beat the
  // winners-bracket champion twice by adding a bracket-reset deciding final.
  grandFinalsBracketReset?: boolean;
}

/**
 * Generate matches for a tournament based on its format.
 */
export function generateMatches(
  tournamentId: string,
  teams: Team[],
  format: TournamentFormat,
  options: GenerateMatchesOptions = {}
): Match[] {
  // Sort teams by seed (lower seed = higher rank)
  const sortedTeams = [...teams].sort((a, b) => {
    if (a.seed && b.seed) return a.seed - b.seed;
    if (a.seed) return -1;
    if (b.seed) return 1;
    return 0;
  });

  switch (format) {
    case 'single_elimination':
      return generateSingleElimination(tournamentId, sortedTeams);
    case 'double_elimination':
      return generateDoubleElimination(tournamentId, sortedTeams, options);
    case 'round_robin':
      return generateRoundRobin(tournamentId, sortedTeams);
    case 'swiss':
      return generateSwissRound(tournamentId, sortedTeams, 1, []);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

/**
 * Single Elimination bracket generation with proper seeding.
 */
function generateSingleElimination(
  tournamentId: string,
  teams: Team[]
): Match[] {
  const matches: Match[] = [];
  const numTeams = teams.length;

  // Find the next power of 2 >= numTeams
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(numTeams)));
  const numRounds = Math.log2(bracketSize);
  const numFirstRoundMatches = bracketSize / 2;

  // Seed the bracket - pair 1v(n), 2v(n-1), etc.
  const seededPositions = generateSeededPositions(bracketSize);

  // Generate first round matches
  for (let i = 0; i < numFirstRoundMatches; i++) {
    const pos1 = seededPositions[i * 2];
    const pos2 = seededPositions[i * 2 + 1];
    const team1 = pos1 < numTeams ? teams[pos1] : null;
    const team2 = pos2 < numTeams ? teams[pos2] : null;

    const match: Match = {
      id: uuidv4(),
      tournamentId,
      round: 1,
      position: i,
      team1Id: team1?.id || null,
      team2Id: team2?.id || null,
      team1Score: null,
      team2Score: null,
      winnerId: null,
      loserId: null,
      bracket: 'winners',
      status: 'pending',
      nextMatchId: null,
      nextMatchSlot: null,
    };

    // If one team has a bye, auto-advance
    if (team1 && !team2) {
      match.winnerId = team1.id;
      match.status = 'completed';
    } else if (!team1 && team2) {
      match.winnerId = team2.id;
      match.status = 'completed';
    }

    matches.push(match);
  }

  // Generate subsequent rounds
  for (let round = 2; round <= numRounds; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round);
    for (let i = 0; i < matchesInRound; i++) {
      const match: Match = {
        id: uuidv4(),
        tournamentId,
        round,
        position: i,
        team1Id: null,
        team2Id: null,
        team1Score: null,
        team2Score: null,
        winnerId: null,
        loserId: null,
        bracket: 'winners',
        status: 'pending',
        nextMatchId: null,
        nextMatchSlot: null,
      };
      matches.push(match);
    }
  }

  // Link matches: winners feed into next round
  for (let round = 1; round < numRounds; round++) {
    const currentRoundMatches = matches.filter((m) => m.round === round);
    const nextRoundMatches = matches.filter((m) => m.round === round + 1);

    for (let i = 0; i < currentRoundMatches.length; i++) {
      const nextMatch = nextRoundMatches[Math.floor(i / 2)];
      currentRoundMatches[i].nextMatchId = nextMatch.id;
      currentRoundMatches[i].nextMatchSlot = i % 2 === 0 ? 'team1' : 'team2';
    }
  }

  // Advance byes into second round
  advanceByes(matches);

  return matches;
}

/**
 * Double Elimination bracket generation.
 *
 * Structure for a bracket of size N = 2^k (k winners rounds):
 *  - Winners bracket (WB): round r has N / 2^r matches (round k is the WB final).
 *  - Losers bracket (LB): has 2*(k-1) rounds with match counts
 *      N/4, N/4, N/8, N/8, ... , 1, 1.
 *    Odd ("minor") LB rounds pair up incoming WB losers / LB survivors.
 *    Even ("major") LB rounds combine LB survivors with a fresh batch of WB losers.
 *  - Grand finals: WB champion vs LB champion.
 *
 * Routing:
 *  - Winners advance within their bracket via nextMatchId / nextMatchSlot.
 *  - The loser of each WB match drops into the LB via loserNextMatchId /
 *    loserNextMatchSlot.
 *  - The WB final winner and LB final winner both feed the grand finals.
 */
function generateDoubleElimination(
  tournamentId: string,
  teams: Team[],
  options: GenerateMatchesOptions = {}
): Match[] {
  // Winners bracket is generated the same way as single elimination.
  const winnersMatches = generateSingleElimination(tournamentId, teams);
  winnersMatches.forEach((m) => (m.bracket = 'winners'));

  const numTeams = teams.length;
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(numTeams)));
  const numWinnersRounds = Math.log2(bracketSize);

  // Trivial bracket (2 teams): single WB match + grand finals, no LB rounds.
  const numLosersRounds = Math.max(0, (numWinnersRounds - 1) * 2);

  // Build losers-bracket match counts per LB round.
  // Pattern: N/4, N/4, N/8, N/8, ... , 1, 1
  const losersRoundSizes: number[] = [];
  {
    let size = bracketSize / 4;
    for (let round = 1; round <= numLosersRounds; round++) {
      losersRoundSizes.push(Math.max(1, size));
      // Halve after every even (major) round.
      if (round % 2 === 0) size = Math.max(1, size / 2);
    }
  }

  // Create losers-bracket matches, grouped by LB round (1-indexed).
  // Stored round number is offset past winners rounds to avoid collisions.
  const losersByRound: Match[][] = [];
  const losersMatches: Match[] = [];
  for (let round = 1; round <= numLosersRounds; round++) {
    const count = losersRoundSizes[round - 1];
    const roundMatches: Match[] = [];
    for (let i = 0; i < count; i++) {
      const m: Match = {
        id: uuidv4(),
        tournamentId,
        round: round + numWinnersRounds,
        position: i,
        team1Id: null,
        team2Id: null,
        team1Score: null,
        team2Score: null,
        winnerId: null,
        loserId: null,
        bracket: 'losers',
        status: 'pending',
        nextMatchId: null,
        nextMatchSlot: null,
        loserNextMatchId: null,
        loserNextMatchSlot: null,
      };
      roundMatches.push(m);
      losersMatches.push(m);
    }
    losersByRound.push(roundMatches);
  }

  // Grand finals.
  const grandFinals: Match = {
    id: uuidv4(),
    tournamentId,
    round: numWinnersRounds + numLosersRounds + 1,
    position: 0,
    team1Id: null,
    team2Id: null,
    team1Score: null,
    team2Score: null,
    winnerId: null,
    loserId: null,
    bracket: 'finals',
    status: 'pending',
    nextMatchId: null,
    nextMatchSlot: null,
    loserNextMatchId: null,
    loserNextMatchSlot: null,
  };

  // Helpers to group winners matches by round (1-indexed).
  const winnersByRound: Match[][] = [];
  for (let r = 1; r <= numWinnersRounds; r++) {
    winnersByRound.push(
      winnersMatches
        .filter((m) => m.round === r)
        .sort((a, b) => a.position - b.position)
    );
  }

  // --- Link losers-bracket winners to their next LB match (or grand finals) ---
  for (let lbRound = 1; lbRound <= numLosersRounds; lbRound++) {
    const current = losersByRound[lbRound - 1];
    if (lbRound === numLosersRounds) {
      // LB final winner goes to grand finals (team2 slot).
      for (const m of current) {
        m.nextMatchId = grandFinals.id;
        m.nextMatchSlot = 'team2';
      }
      continue;
    }
    const next = losersByRound[lbRound];
    if (next.length === current.length) {
      // Minor -> major: winner stays in the same lane (team1 slot),
      // WB losers fill team2.
      for (let i = 0; i < current.length; i++) {
        current[i].nextMatchId = next[i].id;
        current[i].nextMatchSlot = 'team1';
      }
    } else {
      // Major -> minor: two LB winners pair up.
      for (let i = 0; i < current.length; i++) {
        current[i].nextMatchId = next[Math.floor(i / 2)].id;
        current[i].nextMatchSlot = i % 2 === 0 ? 'team1' : 'team2';
      }
    }
  }

  // --- Route winners-bracket losers into the losers bracket ---
  // WB round 1 losers -> LB round 1 (two WB-R1 losers pair into one LB match).
  if (numLosersRounds >= 1) {
    const wbR1 = winnersByRound[0];
    const lbR1 = losersByRound[0];
    for (let i = 0; i < wbR1.length; i++) {
      wbR1[i].loserNextMatchId = lbR1[Math.floor(i / 2)].id;
      wbR1[i].loserNextMatchSlot = i % 2 === 0 ? 'team1' : 'team2';
    }
  }

  // WB round r losers (r >= 2) -> LB "major" round 2*(r-1), filling team2.
  for (let wbRound = 2; wbRound <= numWinnersRounds; wbRound++) {
    const lbTargetRound = 2 * (wbRound - 1); // 1-indexed LB round
    const targetMatches = losersByRound[lbTargetRound - 1];
    if (!targetMatches) continue;
    const wbLosers = winnersByRound[wbRound - 1];
    for (let i = 0; i < wbLosers.length; i++) {
      const target = targetMatches[i] || targetMatches[targetMatches.length - 1];
      wbLosers[i].loserNextMatchId = target.id;
      wbLosers[i].loserNextMatchSlot = 'team2';
    }
  }

  // --- Winners-bracket final winner -> grand finals (team1 slot) ---
  const wbFinal = winnersByRound[numWinnersRounds - 1][0];
  wbFinal.nextMatchId = grandFinals.id;
  wbFinal.nextMatchSlot = 'team1';

  // 2-team bracket has no losers rounds: the grand finals is a rematch, so the
  // WB final's loser fills the LB-champion slot directly.
  if (numLosersRounds === 0) {
    wbFinal.loserNextMatchId = grandFinals.id;
    wbFinal.loserNextMatchSlot = 'team2';
  }

  const allMatches = [...winnersMatches, ...losersMatches, grandFinals];

  // Optional bracket reset: the losers-bracket champion must beat the
  // winners-bracket champion twice. A second, deciding final is created and
  // fed by the grand final. It is only actually played if the LB champion
  // (grand-finals team2) wins the first final; otherwise the score handler
  // marks it skipped. See routes/stageEngine for that logic.
  if (options.grandFinalsBracketReset) {
    const resetFinal: Match = {
      id: uuidv4(),
      tournamentId,
      round: grandFinals.round + 1,
      position: 1, // distinguishes the reset from the grand final (position 0)
      team1Id: null,
      team2Id: null,
      team1Score: null,
      team2Score: null,
      winnerId: null,
      loserId: null,
      bracket: 'finals',
      status: 'pending',
      nextMatchId: null,
      nextMatchSlot: null,
      loserNextMatchId: null,
      loserNextMatchSlot: null,
    };
    // Grand final winner and loser both carry into the reset final.
    grandFinals.nextMatchId = resetFinal.id;
    grandFinals.nextMatchSlot = 'team1';
    grandFinals.loserNextMatchId = resetFinal.id;
    grandFinals.loserNextMatchSlot = 'team2';
    allMatches.push(resetFinal);
  }

  // Resolve byes: WB byes are pre-completed with a winner but no loser, so the
  // losers-bracket slots that expected those losers would never fill. Cascade
  // those empty slots through the bracket, auto-advancing any match that ends
  // up with a single team and no possible opponent.
  resolveDoubleEliminationByes(allMatches);

  return allMatches;
}

/**
 * Identify the grand-finals bracket-reset match, if present. It is the second
 * match in the finals bracket (position 1); the grand final itself is position 0.
 */
export function findBracketResetMatch(matches: Match[]): Match | undefined {
  return matches.find((m) => m.bracket === 'finals' && m.position === 1);
}

export function findGrandFinalMatch(matches: Match[]): Match | undefined {
  return matches.find((m) => m.bracket === 'finals' && m.position === 0);
}

/**
 * Resolve byes in a double-elimination bracket. Winners-bracket byes are
 * pre-completed with a winner but no loser, so a losers-bracket slot that
 * expected that loser can never fill. This walks the bracket and auto-advances
 * any match whose empty slots can no longer be filled by a live feeder.
 *
 * The computation is derived entirely from the static feeder graph (the
 * nextMatch / loserNextMatch links, which never change) plus the current
 * completion state, so it is safe and idempotent to call after every score
 * update as well as once at generation time.
 */
export function resolveDoubleEliminationByes(matches: Match[]): void {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const key = (id: string, slot: 'team1' | 'team2') => `${id}:${slot}`;

  const deliver = (m: Match) => {
    if (m.nextMatchId && m.winnerId) {
      const nm = byId.get(m.nextMatchId);
      if (nm) {
        if (m.nextMatchSlot === 'team1') nm.team1Id = m.winnerId;
        else nm.team2Id = m.winnerId;
      }
    }
    if (m.loserNextMatchId && m.loserId) {
      const lm = byId.get(m.loserNextMatchId);
      if (lm) {
        if (m.loserNextMatchSlot === 'team1') lm.team1Id = m.loserId;
        else lm.team2Id = m.loserId;
      }
    }
  };

  let changed = true;
  let guard = 0;
  while (changed && guard++ < matches.length * 4) {
    changed = false;

    // Recompute, from scratch, how many not-yet-completed feeders target each
    // (matchId, slot). A slot with zero pending feeders and no team is dead.
    const pendingFeeders = new Map<string, number>();
    const addFeeder = (
      id: string | null | undefined,
      slot: 'team1' | 'team2' | null | undefined
    ) => {
      if (!id || !slot) return;
      pendingFeeders.set(key(id, slot), (pendingFeeders.get(key(id, slot)) || 0) + 1);
    };
    for (const m of matches) {
      if (m.status === 'completed') continue;
      addFeeder(m.nextMatchId, m.nextMatchSlot);
      addFeeder(m.loserNextMatchId, m.loserNextMatchSlot);
    }

    for (const m of matches) {
      if (m.status === 'completed') continue;
      const hasTeam1 = !!m.team1Id;
      const hasTeam2 = !!m.team2Id;
      const t1Waiting = !hasTeam1 && (pendingFeeders.get(key(m.id, 'team1')) || 0) > 0;
      const t2Waiting = !hasTeam2 && (pendingFeeders.get(key(m.id, 'team2')) || 0) > 0;

      if (hasTeam1 && !hasTeam2 && !t2Waiting) {
        // Opponent slot is dead: advance the present team.
        m.winnerId = m.team1Id;
        m.loserId = null;
        m.status = 'completed';
        deliver(m);
        changed = true;
      } else if (!hasTeam1 && hasTeam2 && !t1Waiting) {
        m.winnerId = m.team2Id;
        m.loserId = null;
        m.status = 'completed';
        deliver(m);
        changed = true;
      } else if (!hasTeam1 && !hasTeam2 && !t1Waiting && !t2Waiting) {
        // Both slots dead (every feeder was a bye): nothing will ever play here.
        m.winnerId = null;
        m.loserId = null;
        m.status = 'completed';
        deliver(m);
        changed = true;
      }
    }
  }
}

/**
 * Round Robin generation - every team plays every other team.
 */
function generateRoundRobin(tournamentId: string, teams: Team[]): Match[] {
  const matches: Match[] = [];
  const numTeams = teams.length;

  // Use circle method for scheduling
  const teamList = [...teams];
  // If odd number of teams, add a dummy (bye)
  if (numTeams % 2 !== 0) {
    teamList.push({ id: 'BYE', name: 'BYE' });
  }

  const n = teamList.length;
  const numRounds = n - 1;
  const halfSize = n / 2;

  const teamIndices = teamList.map((_, i) => i);
  // Fix position 0, rotate the rest
  const fixed = teamIndices[0];
  const rotating = teamIndices.slice(1);

  for (let round = 0; round < numRounds; round++) {
    const currentOrder = [fixed, ...rotating];
    for (let i = 0; i < halfSize; i++) {
      const team1Idx = currentOrder[i];
      const team2Idx = currentOrder[n - 1 - i];
      const team1 = teamList[team1Idx];
      const team2 = teamList[team2Idx];

      // Skip bye matches
      if (team1.id === 'BYE' || team2.id === 'BYE') continue;

      matches.push({
        id: uuidv4(),
        tournamentId,
        round: round + 1,
        position: i,
        team1Id: team1.id,
        team2Id: team2.id,
        team1Score: null,
        team2Score: null,
        winnerId: null,
        loserId: null,
        bracket: 'round_robin',
        status: 'pending',
        nextMatchId: null,
        nextMatchSlot: null,
      });
    }

    // Rotate: move last element to second position
    rotating.push(rotating.shift()!);
  }

  return matches;
}

/**
 * Swiss round generation - pair teams with similar records.
 */
export function generateSwissRound(
  tournamentId: string,
  teams: Team[],
  roundNumber: number,
  existingMatches: Match[]
): Match[] {
  const matches: Match[] = [];

  // Calculate standings based on existing matches
  const standings = new Map<string, { wins: number; losses: number }>();
  teams.forEach((t) => standings.set(t.id, { wins: 0, losses: 0 }));

  existingMatches
    .filter((m) => m.status === 'completed')
    .forEach((m) => {
      if (m.winnerId) {
        const winner = standings.get(m.winnerId);
        if (winner) winner.wins++;
      }
      if (m.loserId) {
        const loser = standings.get(m.loserId);
        if (loser) loser.losses++;
      }
    });

  // Sort teams by wins (desc), then by seed
  const sortedTeams = [...teams].sort((a, b) => {
    const aStanding = standings.get(a.id)!;
    const bStanding = standings.get(b.id)!;
    if (bStanding.wins !== aStanding.wins) return bStanding.wins - aStanding.wins;
    return (a.seed || 999) - (b.seed || 999);
  });

  // Pair adjacent teams
  const paired = new Set<string>();
  for (let i = 0; i < sortedTeams.length; i++) {
    if (paired.has(sortedTeams[i].id)) continue;

    for (let j = i + 1; j < sortedTeams.length; j++) {
      if (paired.has(sortedTeams[j].id)) continue;

      // Check if these teams have already played each other
      const alreadyPlayed = existingMatches.some(
        (m) =>
          (m.team1Id === sortedTeams[i].id && m.team2Id === sortedTeams[j].id) ||
          (m.team1Id === sortedTeams[j].id && m.team2Id === sortedTeams[i].id)
      );

      if (!alreadyPlayed) {
        paired.add(sortedTeams[i].id);
        paired.add(sortedTeams[j].id);

        matches.push({
          id: uuidv4(),
          tournamentId,
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
 * Generate seeded positions for a bracket.
 * Ensures 1 plays (n), 2 plays (n-1), etc., properly distributed.
 */
function generateSeededPositions(size: number): number[] {
  if (size === 2) return [0, 1];

  const half = generateSeededPositions(size / 2);
  const result: number[] = [];

  for (const pos of half) {
    result.push(pos);
    result.push(size - 1 - pos);
  }

  return result;
}

/**
 * Advance any byes in first round into subsequent rounds.
 */
function advanceByes(matches: Match[]): void {
  const firstRoundCompleted = matches.filter(
    (m) => m.round === 1 && m.status === 'completed' && m.winnerId
  );

  for (const match of firstRoundCompleted) {
    if (match.nextMatchId && match.winnerId) {
      const nextMatch = matches.find((m) => m.id === match.nextMatchId);
      if (nextMatch) {
        if (match.nextMatchSlot === 'team1') {
          nextMatch.team1Id = match.winnerId;
        } else {
          nextMatch.team2Id = match.winnerId;
        }
      }
    }
  }
}
