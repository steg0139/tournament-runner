import { v4 as uuidv4 } from 'uuid';
import { Team, Match, TournamentFormat } from './types';

/**
 * Generate matches for a tournament based on its format.
 */
export function generateMatches(
  tournamentId: string,
  teams: Team[],
  format: TournamentFormat
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
      return generateDoubleElimination(tournamentId, sortedTeams);
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
 */
function generateDoubleElimination(
  tournamentId: string,
  teams: Team[]
): Match[] {
  // Start with winners bracket (same as single elimination)
  const winnersMatches = generateSingleElimination(tournamentId, teams);
  winnersMatches.forEach((m) => (m.bracket = 'winners'));

  const numTeams = teams.length;
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(numTeams)));
  const numWinnersRounds = Math.log2(bracketSize);

  // Generate losers bracket
  // Losers bracket has (numWinnersRounds - 1) * 2 rounds
  const losersMatches: Match[] = [];
  const numLosersRounds = (numWinnersRounds - 1) * 2;

  let prevRoundMatchCount = bracketSize / 4; // First losers round has half of first winners round

  for (let round = 1; round <= numLosersRounds; round++) {
    // Odd rounds in losers have same count as previous, even rounds halve
    const matchesInRound =
      round % 2 === 1 ? prevRoundMatchCount : prevRoundMatchCount;

    if (round % 2 === 0) {
      prevRoundMatchCount = Math.max(1, prevRoundMatchCount / 2);
    }

    for (let i = 0; i < matchesInRound; i++) {
      losersMatches.push({
        id: uuidv4(),
        tournamentId,
        round: round + numWinnersRounds, // Offset to avoid collision with winners rounds
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
      });
    }
  }

  // Grand finals
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
  };

  return [...winnersMatches, ...losersMatches, grandFinals];
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
