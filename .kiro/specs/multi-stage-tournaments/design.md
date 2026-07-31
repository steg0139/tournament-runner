# Technical Design: Multi-Stage Tournaments

## Overview

This design extends the Tournament Runner to support multi-stage tournaments — a tournament composed of sequential stages where each stage can use a different format and teams advance between stages based on configurable criteria. The primary use case is Swiss-format group pools that feed into a single elimination playoff bracket.

The design maintains backward compatibility with existing single-format tournaments by introducing a type discriminator and a new `MultiStageTournament` interface that coexists with the existing `Tournament` interface.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
├─────────────────────────────────────────────────────────────┤
│  CreateTournamentPage (extended with multi-stage form)       │
│  TournamentPage (extended with stage navigation)            │
│  NEW: StageNavigator, GroupStandings, MultiStageCreateForm  │
└──────────────────────────┬──────────────────────────────────┘
                           │ /api
┌──────────────────────────▼──────────────────────────────────┐
│                  Backend (Express/Lambda)                     │
├─────────────────────────────────────────────────────────────┤
│  routes.ts (extended with multi-stage endpoints)             │
│  NEW: multiStageRoutes.ts                                    │
│  NEW: stageEngine.ts (group Swiss, elimination, advancement) │
│  brackets.ts (reused for match generation within stages)     │
│  db.ts (extended to handle both tournament types)            │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    DynamoDB                                   │
│  PK=TOURNAMENT#id, SK=META (both types, same table)          │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Backend Components

#### `stageEngine.ts` (New)
Core logic module for multi-stage tournament operations:

- `assignTeamsToGroups(teams: Team[], groupCount: number): Group[]` — Snake-order distribution by seed
- `generateGroupSwissRound(group: Group, stage: Stage, existingMatches: Match[]): Match[]` — Per-group Swiss pairing with elimination awareness
- `processScoreUpdate(tournament: MultiStageTournament, match: Match): MultiStageTournament` — Post-score logic: elimination checks, group/stage completion, advancement trigger
- `advanceTeams(tournament: MultiStageTournament, completedStageId: string): MultiStageTournament` — Stage transition: rank, seed, generate next stage matches
- `checkTournamentComplete(tournament: MultiStageTournament): MultiStageTournament` — Final stage completion and champion determination

#### `multiStageRoutes.ts` (New)
Express router with multi-stage-specific endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/tournaments/multi-stage` | Create a multi-stage tournament |
| `POST` | `/api/tournaments/:id/stages/:stageId/groups/:groupId/next-round` | Generate next Swiss round for a group |
| `GET` | `/api/tournaments/:id/stages/:stageId` | Get stage details with standings |
| `POST` | `/api/tournaments/:id/stages/:stageId/advance` | Manually trigger advancement (fallback) |

#### `routes.ts` (Modified)
The score update endpoint (`PUT /tournaments/:id/matches/:matchId/score`) gains type awareness:

```typescript
if (isMultiStage(tournament)) {
  // Find stage/group for this match via match.stageId/groupId
  // Delegate to stageEngine.processScoreUpdate()
} else {
  // Existing single-format logic (unchanged)
}
```

#### `db.ts` (Modified)
Add type guard helper and update type signatures to accept `AnyTournament`:

```typescript
export function isMultiStage(t: AnyTournament): t is MultiStageTournament {
  return t.type === 'multi_stage';
}
```

#### `brackets.ts` (No change)
Reused as-is by stageEngine. Called with per-stage team lists to generate matches.

### Frontend Components

#### `StageNavigator.tsx` (New)
- Horizontal tab bar showing all stages
- Each tab: stage name, format icon, status badge (pending/active/completed)
- Active stage highlighted, completed clickable, pending disabled

#### `GroupStandings.tsx` (New)
- Renders one table per group within a Swiss stage
- Columns: rank, team name, W, L, status (active/eliminated/advanced)
- "Generate Next Round" button per group (when current round complete and group not done)
- Color coding: green=qualified, yellow=contending, red=eliminated

#### `MultiStageCreateForm.tsx` (New)
- Stage builder with "Add Stage" button
- Per stage: name input, format picker, group count (first stage), elimination threshold (Swiss), advancement count (non-final)
- Reorder stages with up/down buttons
- Inline validation

#### `TournamentPage.tsx` (Modified)
```typescript
if (tournament.type === 'multi_stage') {
  render <StageNavigator>
  if selected stage is Swiss with groups:
    render <GroupStandings> per group
  else:
    render <BracketView> or <RoundRobinView>
} else {
  // Existing single-tournament view (unchanged)
}
```

#### `CreateTournamentPage.tsx` (Modified)
- "Tournament Structure" toggle: "Single Format" vs "Multi-Stage"
- Multi-Stage shows `<MultiStageCreateForm>`
- Team input section shared between both modes

#### `HomePage.tsx` (Modified)
- Cards for multi-stage tournaments show "Multi-Stage" badge + current stage name

### API Client (`frontend/src/api/client.ts`) (Modified)

New methods:
```typescript
createMultiStageTournament(data: CreateMultiStageTournamentRequest): Promise<MultiStageTournament>
generateGroupNextRound(tournamentId: string, stageId: string, groupId: string): Promise<MultiStageTournament>
getStageDetails(tournamentId: string, stageId: string): Promise<Stage>
```

## Data Models

### New Types

```typescript
export type TournamentType = 'single' | 'multi_stage';
export type StageStatus = 'pending' | 'in_progress' | 'completed';
export type GroupStatus = 'pending' | 'in_progress' | 'completed';
export type TeamStageStatus = 'active' | 'eliminated' | 'advanced';

export interface Group {
  id: string;
  stageId: string;
  name: string;                   // "Group A", "Group B", etc.
  teamIds: string[];
  status: GroupStatus;
  currentRound: number;
}

export interface TeamStageInfo {
  teamId: string;
  groupId: string;
  status: TeamStageStatus;
  wins: number;
  losses: number;
  byesReceived: number;
}

export interface Stage {
  id: string;
  position: number;               // 1-based ordering
  name: string;
  format: TournamentFormat;
  status: StageStatus;
  groupCount: number;
  eliminationThreshold?: number;  // Required for Swiss (1-5)
  advancementCount?: number;      // Teams advancing per group (null for final stage)
  groups: Group[];
  matches: Match[];
  teamStageInfo: TeamStageInfo[];
  advancedTeamIds: string[];      // Teams that advanced FROM this stage
}

export interface MultiStageTournament {
  id: string;
  type: 'multi_stage';
  name: string;
  sport: Sport;
  status: TournamentStatus;
  teams: Team[];
  stages: Stage[];
  currentStageId: string;
  championId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AnyTournament = Tournament | MultiStageTournament;
```

### Extended Existing Types

```typescript
// Tournament gains optional type field (backward compat — undefined = 'single')
export interface Tournament {
  // ... existing fields ...
  type?: 'single';
}

// Match gains optional stage/group context
export interface Match {
  // ... existing fields ...
  stageId?: string;
  groupId?: string;
}
```

### Create Request

```typescript
export interface CreateMultiStageTournamentRequest {
  name: string;                    // 1-100 chars
  sport: Sport;
  teams: { name: string; seed?: number }[];  // 4-128 teams
  stages: {
    name: string;
    format: TournamentFormat;
    groupCount: number;            // >= 1
    eliminationThreshold?: number; // 1-5, required for Swiss
    advancementCount?: number;     // Per group, required for non-final stages
  }[];                             // 2-10 stages
}
```

### DynamoDB Storage

Both tournament types stored with the same key pattern — no table changes needed:
- `PK`: `TOURNAMENT#<id>`, `SK`: `META`
- The `type` field discriminates between single and multi-stage
- Existing items without `type` are treated as `'single'`

## Key Algorithms

### Snake-Order Group Assignment
```
Input: 8 teams (seeded 1-8), 2 groups
Distribution:
  Round 1 (left→right): Group A gets seed 1, Group B gets seed 2
  Round 2 (right→left): Group B gets seed 3, Group A gets seed 4
  Round 3 (left→right): Group A gets seed 5, Group B gets seed 6
  Round 4 (right→left): Group B gets seed 7, Group A gets seed 8
Result: Group A = [1,4,5,8], Group B = [2,3,6,7]
```

### Advancement Seeding (Cross-Group)
```
Input: 2 groups, top 2 advance from each
  Group A: Team1 (3W), Team4 (2W)
  Group B: Team2 (3W), Team3 (2W)
Interleaved order: G_A#1, G_B#1, G_A#2, G_B#2 → [Team1, Team2, Team4, Team3]
Bracket placement: Team1 vs Team3 (same half), Team2 vs Team4 (same half)
This ensures same-group teams (Team1+Team4, Team2+Team3) are in opposite halves.
```

### Group Completion Detection
A group is marked complete when ANY of:
1. Number of active (non-eliminated) teams == advancementCount
2. No valid Swiss pairings can be generated (all active teams have played each other)
3. Active teams have played the maximum rounds possible for the group size

## Error Handling

### Creation Validation Errors
- `400` with descriptive message for: too few teams, invalid stage config, Swiss without elimination threshold, advancement count exceeding team count, fewer than 2 stages

### Stage Transition Errors
- If advancement produces < 2 teams → tournament marked completed (not an error, just ends early)
- If bracket generation fails for next stage → `500` with `stage_transition_error`, completed stage results preserved

### Score Update Errors
- Same as existing: 400 for ties, missing teams, already-completed matches
- Additional: 400 if match belongs to a completed stage

### Concurrency
- DynamoDB conditional writes (add `version` field) to prevent race conditions on score updates

## Testing Strategy

### Unit Tests (stageEngine.ts)
- Group assignment: verify snake-order, all teams assigned, correct group sizes
- Swiss pairing: verify no repeat matches, eliminated teams excluded, bye handling
- Elimination: verify threshold respected, team marked at exact threshold
- Advancement: verify correct teams selected, tiebreaker applied, seeding order
- Bracket separation: verify same-group teams in opposite halves

### Integration Tests (API)
- Create multi-stage tournament → verify response shape and DB storage
- Full flow: create → score group stage → verify elimination → generate rounds → advance → score playoffs → champion
- Backward compat: existing single-format endpoints unchanged

### Property-Based Tests
- For any valid set of teams and group config, all teams are assigned to exactly one group
- For any completed group, advancing teams have >= wins of non-advancing teams
- For any bracket produced by advancement, same-group teams don't meet before semifinals (2 groups) or quarterfinals (4 groups)

## Correctness Properties

### Property 1: Group Assignment Completeness
For any valid team list and group count, every team is assigned to exactly one group, no team is unassigned, and no team appears in multiple groups. Group sizes differ by at most 1.
**Validates: Requirements 1.4, 1.5**

### Property 2: Elimination Threshold Consistency
A team is marked as eliminated if and only if their loss count in the stage's matches equals the configured elimination threshold. No team with fewer losses than the threshold is eliminated.
**Validates: Requirements 2.2**

### Property 3: Advancement Correctness
For each group, every advancing team has a win count strictly greater than or equal to every non-advancing non-eliminated team. When win counts are equal at the boundary, the advancing team has a lower (better) original seed.
**Validates: Requirements 3.1, 3.2**

### Property 4: Bracket Separation Invariant
In the playoff bracket seeded from N groups with K teams per group, teams from the same group cannot meet until round ceil(log2(N×K)) - ceil(log2(K)) + 1 at the earliest. For the common case (2 groups, 2 per group = 4 teams): same-group teams cannot meet before the final.
**Validates: Requirements 3.4**

### Property 5: Stage Sequencing Invariant
At all times, for any stage at position P: if status is `in_progress`, then all stages at positions < P have status `completed`; if status is `pending`, then at least one stage at position < P is not `completed`.
**Validates: Requirements 4.3**

### Property 6: Backward Compatibility
For any tournament with `type === undefined` or `type === 'single'`, the API response shape is identical to the pre-multi-stage system. No new required fields are added to the existing Tournament interface.
**Validates: Requirements 6.2**

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `backend/src/types.ts` | Modify | Add multi-stage types, extend Match with stageId/groupId |
| `backend/src/stageEngine.ts` | Create | Core multi-stage logic (groups, Swiss-with-elimination, advancement) |
| `backend/src/multiStageRoutes.ts` | Create | API routes for multi-stage operations |
| `backend/src/routes.ts` | Modify | Type-aware score processing, mount multi-stage routes |
| `backend/src/db.ts` | Modify | Add `isMultiStage` helper, update type signatures |
| `backend/src/brackets.ts` | No change | Reused as-is via stageEngine |
| `backend/src/index.ts` | Modify | Mount multiStageRoutes |
| `frontend/src/api/types.ts` | Modify | Mirror backend multi-stage types |
| `frontend/src/api/client.ts` | Modify | Add multi-stage API methods |
| `frontend/src/pages/TournamentPage.tsx` | Modify | Stage-aware rendering |
| `frontend/src/pages/CreateTournamentPage.tsx` | Modify | Multi-stage form toggle |
| `frontend/src/pages/HomePage.tsx` | Modify | Show multi-stage badge |
| `frontend/src/components/StageNavigator.tsx` | Create | Stage tabs |
| `frontend/src/components/GroupStandings.tsx` | Create | Group standings table |
| `frontend/src/components/MultiStageCreateForm.tsx` | Create | Stage builder UI |
