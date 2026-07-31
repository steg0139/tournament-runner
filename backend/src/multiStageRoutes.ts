import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  createTournament,
  getTournament,
  updateTournament,
  isMultiStage,
} from './db';
import {
  assignTeamsToGroups,
  generateGroupSwissRound,
} from './stageEngine';
import { generateMatches } from './brackets';
import {
  Team,
  Stage,
  MultiStageTournament,
  CreateMultiStageTournamentRequest,
} from './types';

const router = Router();

/**
 * Helper: set up the first stage with groups, matches, and team info.
 * Called both at creation (if teams provided) and at start.
 */
function initializeFirstStage(
  tournament: MultiStageTournament,
  firstStage: Stage
): void {
  const teams = tournament.teams;

  // Ensure arrays are initialized (DynamoDB might return undefined for empty arrays)
  if (!firstStage.matches) firstStage.matches = [];
  if (!firstStage.groups) firstStage.groups = [];
  if (!firstStage.teamStageInfo) firstStage.teamStageInfo = [];
  if (!firstStage.advancedTeamIds) firstStage.advancedTeamIds = [];

  // Always use groups (even groupCount=1) for consistent Swiss round handling
  if (firstStage.format === 'swiss' || firstStage.groupCount > 1) {
    const effectiveGroupCount = Math.max(firstStage.groupCount, 1);
    firstStage.groups = assignTeamsToGroups(teams, effectiveGroupCount, firstStage.id);
    firstStage.teamStageInfo = teams.map((t) => {
      const group = firstStage.groups.find((g) => g.teamIds.includes(t.id))!;
      return {
        teamId: t.id,
        groupId: group.id,
        status: 'active' as const,
        wins: 0,
        losses: 0,
        byesReceived: 0,
      };
    });

    for (const group of firstStage.groups) {
      const groupTeams = teams.filter((t) => group.teamIds.includes(t.id));
      const roundMatches = generateGroupSwissRound(
        tournament.id,
        group,
        firstStage,
        groupTeams
      );
      firstStage.matches.push(...roundMatches);
      group.currentRound = 1;
    }
  } else {
    // Non-Swiss, single pool — generate matches directly (elimination/round robin)
    const matches = generateMatches(tournament.id, teams, firstStage.format);
    matches.forEach((m) => {
      m.stageId = firstStage.id;
    });
    firstStage.matches = matches;
    firstStage.teamStageInfo = teams.map((t) => ({
      teamId: t.id,
      groupId: '',
      status: 'active' as const,
      wins: 0,
      losses: 0,
      byesReceived: 0,
    }));
  }

  firstStage.status = 'in_progress';
}

// Create a multi-stage tournament
router.post('/tournaments/multi-stage', async (req: Request, res: Response) => {
  try {
    const body: CreateMultiStageTournamentRequest = req.body;

    if (!body.name || !body.sport || !body.stages?.length) {
      return res.status(400).json({
        error: 'Missing required fields: name, sport, stages',
      });
    }

    if (body.name.length > 100) {
      return res.status(400).json({ error: 'Name must be 100 characters or fewer' });
    }

    if (body.stages.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 stages' });
    }

    if (body.stages.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 stages allowed' });
    }

    // Validate each stage
    for (let i = 0; i < body.stages.length; i++) {
      const stage = body.stages[i];
      const isFinal = i === body.stages.length - 1;

      if (!stage.name || !stage.format) {
        return res.status(400).json({
          error: `Stage ${i + 1}: name and format are required`,
        });
      }

      if (stage.format === 'swiss' && !stage.eliminationThreshold) {
        return res.status(400).json({
          error: `Stage ${i + 1}: Swiss format requires an elimination threshold`,
        });
      }

      if (stage.eliminationThreshold && (stage.eliminationThreshold < 1 || stage.eliminationThreshold > 5)) {
        return res.status(400).json({
          error: `Stage ${i + 1}: Elimination threshold must be between 1 and 5`,
        });
      }

      if (!isFinal && !stage.advancementCount && !stage.eliminationThreshold) {
        return res.status(400).json({
          error: `Stage ${i + 1}: Non-final stages need either advancement count or elimination threshold`,
        });
      }
    }

    // Validate team count if teams are provided
    const teamInputs = body.teams || [];

    // Create team objects
    const teams: Team[] = teamInputs.map((t, index) => ({
      id: uuidv4(),
      name: t.name,
      seed: t.seed || index + 1,
    }));

    const tournamentId = uuidv4();

    // Build stages — all start pending, initialized on "start"
    const stages: Stage[] = body.stages.map((stageDef, index) => {
      console.log(`[Create] Stage ${index + 1} config:`, JSON.stringify(stageDef));
      return {
        id: uuidv4(),
        position: index + 1,
        name: stageDef.name,
        format: stageDef.format,
        status: 'pending' as const,
        groupCount: stageDef.groupCount || 1,
        eliminationThreshold: stageDef.eliminationThreshold,
        advancementCount: stageDef.advancementCount,
        winsToAdvance: stageDef.winsToAdvance,
        courts: stageDef.courts,
        groups: [],
        matches: [],
        teamStageInfo: [],
        advancedTeamIds: [],
      };
    });

    const tournament: MultiStageTournament = {
      id: tournamentId,
      type: 'multi_stage',
      name: body.name,
      sport: body.sport,
      status: 'setup',
      teams,
      stages,
      currentStageId: stages[0].id,
      championId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await createTournament(tournament);
    res.status(201).json(tournament);
  } catch (error) {
    console.error('Error creating multi-stage tournament:', error);
    res.status(500).json({ error: 'Failed to create multi-stage tournament' });
  }
});

// Add teams to a multi-stage tournament in setup state
router.post('/tournaments/:id/multi-stage/teams', async (req: Request, res: Response) => {
  try {
    const tournament = await getTournament(req.params.id);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    if (!isMultiStage(tournament)) {
      return res.status(400).json({ error: 'Not a multi-stage tournament' });
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

// Remove a team from a multi-stage tournament in setup state
router.delete('/tournaments/:id/multi-stage/teams/:teamId', async (req: Request, res: Response) => {
  try {
    const tournament = await getTournament(req.params.id);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    if (!isMultiStage(tournament)) {
      return res.status(400).json({ error: 'Not a multi-stage tournament' });
    }
    if (tournament.status !== 'setup') {
      return res.status(400).json({ error: 'Can only remove teams while tournament is in setup state' });
    }

    tournament.teams = tournament.teams.filter((t) => t.id !== req.params.teamId);
    tournament.teams = tournament.teams.map((t, i) => ({ ...t, seed: i + 1 }));
    tournament.updatedAt = new Date().toISOString();
    await updateTournament(tournament);

    res.json(tournament);
  } catch (error) {
    console.error('Error removing team:', error);
    res.status(500).json({ error: 'Failed to remove team' });
  }
});

// Start a multi-stage tournament (move from setup to in_progress)
router.post('/tournaments/:id/multi-stage/start', async (req: Request, res: Response) => {
  try {
    const tournament = await getTournament(req.params.id);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    if (!isMultiStage(tournament)) {
      return res.status(400).json({ error: 'Not a multi-stage tournament' });
    }
    if (tournament.status !== 'setup') {
      return res.status(400).json({ error: 'Tournament is already started' });
    }
    if (tournament.teams.length < 4) {
      return res.status(400).json({ error: 'Need at least 4 teams to start' });
    }

    const firstStage = tournament.stages[0];

    // Validate team count against group config
    if (firstStage.groupCount > 1) {
      const minTeamsNeeded = firstStage.groupCount * 2;
      if (tournament.teams.length < minTeamsNeeded) {
        return res.status(400).json({
          error: `Need at least ${minTeamsNeeded} teams for ${firstStage.groupCount} groups`,
        });
      }
    }

    initializeFirstStage(tournament, firstStage);
    tournament.status = 'in_progress';
    tournament.updatedAt = new Date().toISOString();

    await updateTournament(tournament);
    res.json(tournament);
  } catch (error: any) {
    console.error('Error starting tournament:', error?.message || error);
    res.status(500).json({ error: error?.message || 'Failed to start tournament' });
  }
});

// Generate next Swiss round for a group
router.post(
  '/tournaments/:id/stages/:stageId/groups/:groupId/next-round',
  async (req: Request, res: Response) => {
    try {
      const { id, stageId, groupId } = req.params;

      const tournament = await getTournament(id);
      if (!tournament) {
        return res.status(404).json({ error: 'Tournament not found' });
      }

      if (!isMultiStage(tournament)) {
        return res.status(400).json({ error: 'Not a multi-stage tournament' });
      }

      const stage = tournament.stages.find((s) => s.id === stageId);
      if (!stage) {
        return res.status(404).json({ error: 'Stage not found' });
      }

      if (stage.status === 'completed') {
        return res.status(400).json({ error: 'Stage is already complete' });
      }

      const group = stage.groups.find((g) => g.id === groupId);
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }

      if (group.status === 'completed') {
        return res.status(400).json({ error: 'Group is already complete' });
      }

      // Check if current round is complete
      const currentRoundMatches = stage.matches.filter(
        (m) => m.groupId === groupId && m.round === group.currentRound
      );
      const allComplete = currentRoundMatches.every((m) => m.status === 'completed');
      if (!allComplete) {
        return res.status(400).json({ error: 'Current round is not complete yet' });
      }

      // Generate next round
      const groupTeams = tournament.teams.filter((t) => group.teamIds.includes(t.id));
      const newMatches = generateGroupSwissRound(
        tournament.id,
        group,
        stage,
        groupTeams
      );

      if (newMatches.length === 0) {
        group.status = 'completed';
      } else {
        stage.matches.push(...newMatches);
        group.currentRound++;
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

// Get stage details
router.get(
  '/tournaments/:id/stages/:stageId',
  async (req: Request, res: Response) => {
    try {
      const { id, stageId } = req.params;

      const tournament = await getTournament(id);
      if (!tournament) {
        return res.status(404).json({ error: 'Tournament not found' });
      }

      if (!isMultiStage(tournament)) {
        return res.status(400).json({ error: 'Not a multi-stage tournament' });
      }

      const stage = tournament.stages.find((s) => s.id === stageId);
      if (!stage) {
        return res.status(404).json({ error: 'Stage not found' });
      }

      res.json(stage);
    } catch (error) {
      console.error('Error getting stage:', error);
      res.status(500).json({ error: 'Failed to get stage details' });
    }
  }
);

// Manually trigger advancement
router.post(
  '/tournaments/:id/stages/:stageId/advance',
  async (req: Request, res: Response) => {
    try {
      const { id, stageId } = req.params;

      const tournament = await getTournament(id);
      if (!tournament) {
        return res.status(404).json({ error: 'Tournament not found' });
      }

      if (!isMultiStage(tournament)) {
        return res.status(400).json({ error: 'Not a multi-stage tournament' });
      }

      const stage = tournament.stages.find((s) => s.id === stageId);
      if (!stage) {
        return res.status(404).json({ error: 'Stage not found' });
      }

      if (stage.status !== 'completed') {
        return res.status(400).json({ error: 'Stage is not complete yet' });
      }

      const nextStage = tournament.stages.find((s) => s.position === stage.position + 1);
      if (nextStage && nextStage.matches.length > 0) {
        return res.status(400).json({ error: 'Already advanced to next stage' });
      }

      tournament.updatedAt = new Date().toISOString();
      await updateTournament(tournament);

      res.json(tournament);
    } catch (error) {
      console.error('Error advancing stage:', error);
      res.status(500).json({ error: 'Failed to advance stage' });
    }
  }
);

export default router;
