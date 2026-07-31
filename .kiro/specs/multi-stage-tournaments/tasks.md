# Implementation Plan: Multi-Stage Tournaments

## Overview

Implement multi-stage tournament support for the Tournament Runner app. This allows tournaments with sequential stages (e.g., Swiss group pools → single elimination playoffs) with configurable elimination thresholds and advancement criteria. Implementation follows a bottom-up approach: data model → engine logic → API routes → frontend types → UI components → integration.

## Tasks

- [x] 1. Extend backend data model with multi-stage types. Add `TournamentType`, `StageStatus`, `GroupStatus`, `TeamStageStatus`, `Group`, `TeamStageInfo`, `Stage`, `MultiStageTournament`, `AnyTournament`, and `CreateMultiStageTournamentRequest` to `backend/src/types.ts`. Extend existing `Tournament` with optional `type?: 'single'` and `Match` with optional `stageId?` and `groupId?`. Add `isMultiStage` type guard to `backend/src/db.ts` and update function signatures to accept `AnyTournament`. **Requirements: 6.1, 6.2, 6.5**
- [x] 2. Implement stage engine - group assignment and Swiss pairing. Create `backend/src/stageEngine.ts` with `assignTeamsToGroups` (snake-order distribution) and `generateGroupSwissRound` (per-group pairing with elimination awareness and bye handling). Snake-order assigns seeds 1,4,5,8 to Group A and 2,3,6,7 to Group B for 8 teams/2 groups. Eliminated teams excluded from pairing. Bye awarded to lowest-ranked team without a prior bye. **Requirements: 1.4, 2.1, 2.7**
- [x] 3. Implement stage engine - score processing, elimination, and completion detection. Add `processScoreUpdate` to stageEngine that updates match scores, team stage info (wins/losses), checks elimination threshold, and evaluates group/stage completion. Group marked complete when active teams == advancementCount or no valid pairings remain. Stage marked complete when all groups complete. **Requirements: 2.2, 2.4, 2.5, 2.6**
- [x] 4. Implement stage engine - advancement and bracket seeding. Add `advanceTeams` that ranks teams per group, selects top N, interleaves seeds across groups (G1#1, G2#1, G1#2, G2#2), and generates next stage matches. Same-group teams placed in opposite bracket halves. Tiebreaker: lower seed advances when win counts equal. Add `checkTournamentComplete` for final stage completion and champion recording. Handle edge case of <2 qualifying teams. **Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.3, 4.4, 4.5**
- [x] 5. Create multi-stage API routes. Create `backend/src/multiStageRoutes.ts` with: POST create multi-stage tournament (validation), POST generate group next round, GET stage details, POST manual advance. Mount in index.ts. Modify existing score update endpoint in routes.ts to detect multi-stage and delegate to stageEngine. **Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 2.6, 4.1, 4.2**
- [x] 6. Extend frontend types and API client. Add multi-stage types to `frontend/src/api/types.ts` mirroring backend. Add API client methods: `createMultiStageTournament`, `generateGroupNextRound`, `getStageDetails`, `advanceStage`. Update `listTournaments` return type to `AnyTournament[]`. **Requirements: 6.4, 6.5**
- [x] 7. Build StageNavigator and GroupStandings components. Create `StageNavigator.tsx` (horizontal tabs showing stage name, format, status; active highlighted; completed clickable; pending disabled). Create `GroupStandings.tsx` (per-group table with rank, team name, W, L, status; Generate Next Round button; color coding for qualified/contending/eliminated). **Requirements: 5.1, 5.2, 5.4, 5.6**
- [x] 8. Build MultiStageCreateForm component. Create `MultiStageCreateForm.tsx` with stage builder (Add Stage button, per-stage config, reorder, validation). Modify `CreateTournamentPage.tsx` with "Single Format" vs "Multi-Stage" toggle. Wire submission to API. **Requirements: 5.5**
- [x] 9. Integrate multi-stage views into TournamentPage. Detect multi-stage type and render StageNavigator + appropriate stage content (GroupStandings for Swiss groups, BracketView/RoundRobinView for other formats). Wire Generate Next Round and stage navigation. Update HomePage with multi-stage badge. **Requirements: 5.1, 5.2, 5.3, 5.4, 5.6**
- [x] 10. End-to-end verification and build. Run backend TypeScript build and frontend Vite build with no errors. Test full flow: create multi-stage tournament → score group stage → verify elimination → generate rounds → verify advancement → score playoffs → verify champion. Verify backward compatibility with existing single-format tournaments. **Requirements: 6.2, 4.2**

## Task Dependency Graph

```json
{
  "waves": [
    [1],
    [2, 6],
    [3, 7, 8],
    [4],
    [5, 9],
    [10]
  ]
}
```

## Notes

- Task 1 is the foundation — all other tasks depend on the type definitions
- Tasks 2-5 (backend) and 6-9 (frontend) can be worked in parallel after Task 1
- Task 5 depends on Tasks 2-4 since the routes call stageEngine functions
- Task 10 is the final integration check that requires all other tasks complete
- Existing `brackets.ts` is reused as-is — no modifications needed to that file
