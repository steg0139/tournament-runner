import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  createTournament,
  getTournament,
  updateTournament,
  deleteTournament,
  listTournaments,
} from './db';
import { generateMatches, generateSwissRound } from './brackets';
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

    if (!body.name || !body.sport || !body.format || !body.teams?.length) {
      return res.status(400).json({
        error: 'Missing required fields: name, sport, format, teams',
      });
    }

    if (body.teams.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 teams' });
    }

    // Create team objects with IDs
    const teams: Team[] = body.teams.map((t, index) => ({
      id: uuidv4(),
      name: t.name,
      seed: t.seed || index + 1,
    }));

    const tournamentId = uuidv4();

    // Generate matches based on format
    const matches = generateMatches(tournamentId, teams, body.format);

    const tournament: Tournament = {
      id: tournamentId,
      name: body.name,
      sport: body.sport,
      format: body.format,
      status: 'in_progress',
      teams,
      matches,
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
