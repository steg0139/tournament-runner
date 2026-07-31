import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  createTournament,
  getTournament,
  updateTournament,
  deleteTournament,
  listTournaments,
  isMultiStage,
} from './db';
import { generateMatches, generateSwissRound } from './brackets';
import { processScoreUpdate } from './stageEngine';
import {
  Tournament,
  Team,
  CreateTournamentRequest,
  UpdateScoreRequest,
} from './types';

const router = Router();

// List all tournaments
router.get('/tournaments', async (_req: Request, res: Response) => {
  try {
    const tournaments = await listTournaments();
    res.json(tournaments);
  } catch (error) {
    console.error('Error listing tournaments:', error);
    res.status(500).json({ error: 'Failed to list tournaments' });
  }
});

// Get a single tournament
router.get('/tournaments/:id', async (req: Request, res: Response) => {
  try {
    const tournament = await getTournament(req.params.id);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    res.json(tournament);
  } catch (error) {
    console.error('Error getting tournament:', error);
    res.status(500).json({ error: 'Failed to get tournament' });
  }
});

// Create a new tournament
router.post('/tournaments', async (req: Request, res: Response) => {
  try {
    const body: CreateTournamentRequest = req.body;

    if (!body.name || !body.sport || !body.format) {
      return res.status(400).json({
        error: 'Missing required fields: name, sport, format',
      });
    }

    // Allow creating with no teams (setup state) — always start in setup
    const teams: Team[] = (body.teams || []).map((t, index) => ({
      id: uuidv4(),
      name: t.name,
      seed: t.seed || index + 1,
    }));

    const tournamentId = uuidv4();

    const tournament: Tournament = {
      id: tournamentId,
      name: body.name,
      sport: body.sport,
      format: body.format,
      status: 'setup',
      teams,
      matches: [],
      currentRound: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await createTournament(tournament);
    res.status(201).json(tournament);
  } catch (error) {
    console.error('Error creating tournament:', error);
    res.status(500).json({ error: 'Failed to create tournament' });
  }
});

// Update match score and advance winner
router.put(
  '/tournaments/:id/matches/:matchId/score',
  async (req: Request, res: Response) => {
    try {
      const { id, matchId } = req.params;
      const { team1Score, team2Score }: UpdateScoreRequest = req.body;

      if (team1Score == null || team2Score == null) {
        return res.status(400).json({ error: 'Both scores are required' });
      }

      if (team1Score === team2Score) {
        return res.status(400).json({ error: 'Ties are not allowed in elimination formats' });
      }

      const tournament = await getTournament(id);
      if (!tournament) {
        return res.status(404).json({ error: 'Tournament not found' });
      }

      // Handle multi-stage tournaments
      if (isMultiStage(tournament)) {
        try {
          const updated = processScoreUpdate(tournament, matchId, team1Score, team2Score);
          updated.updatedAt = new Date().toISOString();
          await updateTournament(updated);
          return res.json(updated);
        } catch (e: any) {
          return res.status(400).json({ error: e.message });
        }
      }

      // Single-format tournament (existing logic)
      const matchIndex = tournament.matches.findIndex((m) => m.id === matchId);
      if (matchIndex === -1) {
        return res.status(404).json({ error: 'Match not found' });
      }

      const match = tournament.matches[matchIndex];

      if (!match.team1Id || !match.team2Id) {
        return res.status(400).json({ error: 'Match does not have both teams assigned yet' });
      }

      // Update scores
      match.team1Score = team1Score;
      match.team2Score = team2Score;
      match.winnerId = team1Score > team2Score ? match.team1Id : match.team2Id;
      match.loserId = team1Score > team2Score ? match.team2Id : match.team1Id;
      match.status = 'completed';

      // Advance winner to next match
      if (match.nextMatchId && match.winnerId) {
        const nextMatch = tournament.matches.find(
          (m) => m.id === match.nextMatchId
        );
        if (nextMatch) {
          if (match.nextMatchSlot === 'team1') {
            nextMatch.team1Id = match.winnerId;
          } else {
            nextMatch.team2Id = match.winnerId;
          }
        }
      }

      // Check if tournament is complete
      const allMatchesComplete = tournament.matches.every(
        (m) =>
          m.status === 'completed' ||
          (m.team1Id === null && m.team2Id === null)
      );

      if (allMatchesComplete) {
        tournament.status = 'completed';
      }

      // Update current round
      const pendingMatches = tournament.matches.filter(
        (m) => m.status === 'pending' && m.team1Id && m.team2Id
      );
      if (pendingMatches.length > 0) {
        tournament.currentRound = Math.min(
          ...pendingMatches.map((m) => m.round)
        );
      }

      tournament.updatedAt = new Date().toISOString();
      await updateTournament(tournament);

      res.json(tournament);
    } catch (error) {
      console.error('Error updating score:', error);
      res.status(500).json({ error: 'Failed to update score' });
    }
  }
);

// Generate next Swiss round
router.post(
  '/tournaments/:id/swiss/next-round',
  async (req: Request, res: Response) => {
    try {
      const tournament = await getTournament(req.params.id);
      if (!tournament) {
        return res.status(404).json({ error: 'Tournament not found' });
      }

      if (isMultiStage(tournament)) {
        return res.status(400).json({ error: 'Use the multi-stage endpoint for multi-stage tournaments' });
      }

      if (tournament.format !== 'swiss') {
        return res.status(400).json({ error: 'Tournament is not Swiss format' });
      }

      // Check if current round is complete
      const currentRoundMatches = tournament.matches.filter(
        (m) => m.round === tournament.currentRound
      );
      const allComplete = currentRoundMatches.every(
        (m) => m.status === 'completed'
      );

      if (!allComplete) {
        return res.status(400).json({
          error: 'Current round is not complete yet',
        });
      }

      const nextRound = tournament.currentRound + 1;
      const newMatches = generateSwissRound(
        tournament.id,
        tournament.teams,
        nextRound,
        tournament.matches
      );

      if (newMatches.length === 0) {
        tournament.status = 'completed';
      } else {
        tournament.matches.push(...newMatches);
        tournament.currentRound = nextRound;
      }

      tournament.updatedAt = new Date().toISOString();
      await updateTournament(tournament);

      res.json(tournament);
    } catch (error) {
      console.error('Error generating next round:', error);
      res.status(500).json({ error: 'Failed to generate next round' });
    }
  }
);

// Add teams to a tournament in setup state
router.post('/tournaments/:id/teams', async (req: Request, res: Response) => {
  try {
    const tournament = await getTournament(req.params.id);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (isMultiStage(tournament)) {
      return res.status(400).json({ error: 'Use multi-stage endpoints for multi-stage tournaments' });
    }

    if (tournament.status !== 'setup') {
      return res.status(400).json({ error: 'Can only add teams while tournament is in setup state' });
    }

    const { teams: newTeams } = req.body;
    if (!newTeams || !Array.isArray(newTeams) || newTeams.length === 0) {
      return res.status(400).json({ error: 'Provide an array of teams' });
    }

    const startingSeed = tournament.teams.length + 1;
    const teamsToAdd: Team[] = newTeams.map((t: { name: string; seed?: number }, i: number) => ({
      id: uuidv4(),
      name: t.name,
      seed: t.seed || startingSeed + i,
    }));

    tournament.teams.push(...teamsToAdd);
    tournament.updatedAt = new Date().toISOString();
    await updateTournament(tournament);

    res.json(tournament);
  } catch (error) {
    console.error('Error adding teams:', error);
    res.status(500).json({ error: 'Failed to add teams' });
  }
});

// Remove a team from a tournament in setup state
router.delete('/tournaments/:id/teams/:teamId', async (req: Request, res: Response) => {
  try {
    const tournament = await getTournament(req.params.id);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (isMultiStage(tournament)) {
      return res.status(400).json({ error: 'Use multi-stage endpoints for multi-stage tournaments' });
    }

    if (tournament.status !== 'setup') {
      return res.status(400).json({ error: 'Can only remove teams while tournament is in setup state' });
    }

    tournament.teams = tournament.teams.filter((t) => t.id !== req.params.teamId);
    // Re-seed
    tournament.teams = tournament.teams.map((t, i) => ({ ...t, seed: i + 1 }));
    tournament.updatedAt = new Date().toISOString();
    await updateTournament(tournament);

    res.json(tournament);
  } catch (error) {
    console.error('Error removing team:', error);
    res.status(500).json({ error: 'Failed to remove team' });
  }
});

// Start a tournament (move from setup to in_progress, generate matches)
router.post('/tournaments/:id/start', async (req: Request, res: Response) => {
  try {
    const tournament = await getTournament(req.params.id);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (isMultiStage(tournament)) {
      return res.status(400).json({ error: 'Use multi-stage endpoints for multi-stage tournaments' });
    }

    if (tournament.status !== 'setup') {
      return res.status(400).json({ error: 'Tournament is already started' });
    }

    if (tournament.teams.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 teams to start' });
    }

    // Generate matches
    tournament.matches = generateMatches(tournament.id, tournament.teams, tournament.format);
    tournament.status = 'in_progress';
    tournament.currentRound = 1;
    tournament.updatedAt = new Date().toISOString();

    await updateTournament(tournament);
    res.json(tournament);
  } catch (error) {
    console.error('Error starting tournament:', error);
    res.status(500).json({ error: 'Failed to start tournament' });
  }
});

// Delete a tournament
router.delete('/tournaments/:id', async (req: Request, res: Response) => {
  try {
    await deleteTournament(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting tournament:', error);
    res.status(500).json({ error: 'Failed to delete tournament' });
  }
});

export default router;
