# Requirements Document

## Introduction

Multi-stage tournament support extends the existing tournament runner to allow tournaments composed of sequential stages with different formats. The primary use case is a group-stage Swiss format (with configurable elimination threshold) that advances qualifying teams into a single elimination playoff bracket. Each stage has its own configuration, and the system automatically transitions teams between stages based on advancement criteria.

## Glossary

- **Multi_Stage_Tournament**: A tournament composed of two or more sequential stages, each with its own format, teams, and match schedule.
- **Stage**: A distinct phase within a Multi_Stage_Tournament that operates with a specific tournament format (e.g., Swiss, single elimination).
- **Group**: A subset of teams within a stage that compete against each other independently from other groups.
- **Elimination_Threshold**: The configurable number of losses at which a team is eliminated from a Swiss-format stage (e.g., 2 losses = eliminated).
- **Advancement_Criteria**: The rules that determine which teams progress from one stage to the next (e.g., top 2 teams per group by win count).
- **Playoff_Bracket**: A single elimination bracket populated by teams that advance from a prior stage.
- **Stage_Transition**: The automated process of moving qualifying teams from a completed stage into the next stage and generating the new stage's matches.
- **Group_Standings**: The win/loss record and ranking of teams within a group during a Swiss stage.
- **Tournament_Runner**: The existing application system composed of a React frontend and Node.js/Express backend with DynamoDB storage.
- **Bracket_Generator**: The existing backend module (brackets.ts) responsible for creating match structures for various tournament formats.

## Requirements

### Requirement 1: Create Multi-Stage Tournament

**User Story:** As a tournament organizer, I want to create a multi-stage tournament with configurable stages, so that I can run complex tournament structures that combine different formats.

#### Acceptance Criteria

1. WHEN a tournament organizer submits a multi-stage tournament creation request with a name (1 to 100 characters), a sport, a list of 4 to 128 teams, and 2 to 10 stage definitions, THE Tournament_Runner SHALL create a Multi_Stage_Tournament with a unique identifier, the provided metadata, and the defined stages.
2. THE Tournament_Runner SHALL require each stage definition to include a format (one of single_elimination, double_elimination, round_robin, or swiss), an ordering position (sequential integer starting at 1), and advancement criteria specifying the number of teams that advance to the next stage (except for the final stage, which has no advancement criteria).
3. WHEN the format of a stage is "swiss", THE Tournament_Runner SHALL require an Elimination_Threshold value for that stage, representing the number of losses at which a team is eliminated from the stage (integer, 1 to 5).
4. WHEN the multi-stage tournament is created and the first stage uses groups, THE Tournament_Runner SHALL assign all registered teams to their configured groups in the first stage using snake-order distribution by seed (highest seed in group 1, next in group 2, continuing to last group, then reversing direction).
5. WHEN the first stage uses groups, THE Tournament_Runner SHALL require at least 2 groups, each containing at least 2 teams and no more than 64 teams per group.
6. IF the number of teams is fewer than the sum of the minimum teams per group across all configured groups (groups × 2) or fewer than the total advancement slots across all groups in the first stage, THEN THE Tournament_Runner SHALL reject the creation request with an error message indicating the minimum number of teams required and the reason for the shortfall.
7. IF the advancement criteria for any non-final stage specifies more advancing teams than the number of teams that can participate in that stage, THEN THE Tournament_Runner SHALL reject the creation request with an error message indicating which stage has invalid advancement criteria.

### Requirement 2: Group-Stage Swiss Format with Elimination Threshold

**User Story:** As a tournament organizer, I want to run a Swiss-format group stage where teams are eliminated after reaching a configurable loss count, so that groups resolve efficiently and top performers advance.

#### Acceptance Criteria

1. WHILE a Swiss-format stage is in progress, THE Tournament_Runner SHALL generate pairings within each group independently by sorting active (non-eliminated) teams by descending win count (using original seed as a secondary sort for teams with equal wins), pairing adjacent teams in the sorted order, and skipping pairs that have already played each other in the current stage.
2. WHEN a team's loss count reaches the configured Elimination_Threshold, THE Tournament_Runner SHALL mark that team as eliminated from the stage and exclude the team from future round pairings.
3. WHILE a Swiss-format stage is in progress, THE Tournament_Runner SHALL track and expose Group_Standings showing each team's wins, losses, and elimination status, ordered by descending win count with original seed as tiebreaker.
4. WHEN all non-eliminated teams in a group have each played the configured maximum number of Swiss rounds for the stage, or the number of remaining active teams equals the advancement count, or no valid pairings can be generated for the remaining active teams, THE Tournament_Runner SHALL mark that group as complete.
5. WHEN all groups within a stage are marked as complete, THE Tournament_Runner SHALL mark the stage as complete.
6. THE Tournament_Runner SHALL prevent generation of a new Swiss round for a group that is already marked as complete.
7. IF a group contains an odd number of active (non-eliminated) teams when pairings are generated, THEN THE Tournament_Runner SHALL assign a bye to the lowest-ranked active team that has not yet received a bye in the current stage, awarding that team a win for the round.

### Requirement 3: Automatic Stage Advancement

**User Story:** As a tournament organizer, I want qualifying teams to automatically advance to the next stage when a stage completes, so that the tournament flows without manual intervention.

#### Acceptance Criteria

1. WHEN a stage is marked as complete, THE Tournament_Runner SHALL identify the qualifying teams from each group based on the stage's Advancement_Criteria (e.g., top N teams by win count).
2. WHEN multiple teams in a group have identical win counts at the advancement boundary, THE Tournament_Runner SHALL use original seed as a tiebreaker (lower seed advances).
3. WHEN qualifying teams are identified from multiple groups, THE Tournament_Runner SHALL assign seeds for the next stage by ranking teams first by win count descending, then by original seed ascending, with group winners interleaved (Group A #1, Group B #1, Group A #2, Group B #2, etc.) so that teams from the same group are spaced apart in the seeding order.
4. WHEN advancing teams into an elimination-format stage, THE Tournament_Runner SHALL seed teams so that teams from the same group cannot meet until the latest possible round, by placing same-group teams into different halves of the bracket (and different quarters when more than 2 same-group teams advance).
5. WHEN qualifying teams are identified, THE Tournament_Runner SHALL create the next stage's match structure by invoking the Bracket_Generator with the next stage's configured format and the ordered list of advancing teams.
6. IF a stage completes but the number of qualifying teams is fewer than 2, THEN THE Tournament_Runner SHALL mark the tournament as completed with the current stage results as final.
7. IF the next stage's match structure cannot be created due to an incompatible number of qualifying teams for the configured format, THEN THE Tournament_Runner SHALL report a stage transition error and preserve the completed stage's results without advancing.

### Requirement 4: Subsequent Stage Execution

**User Story:** As a tournament organizer, I want the subsequent stage to run using its configured format (single elimination, double elimination, round robin, or swiss), so that I have flexibility in how the tournament concludes.

#### Acceptance Criteria

1. WHEN a subsequent stage begins with advanced teams, THE Bracket_Generator SHALL generate the appropriate match structure based on the stage's configured format (single_elimination, double_elimination, round_robin, or swiss), seeding teams according to the ordering established during Stage_Transition.
2. THE Tournament_Runner SHALL support all existing format-specific features (score entry, automatic winner advancement, bye handling, Swiss round generation) within any stage regardless of its position in the tournament.
3. WHEN all matches in the final stage are completed (final match in single elimination, grand finals in double elimination, all round-robin pairings played, or no further Swiss pairings possible), THE Tournament_Runner SHALL mark both the stage and the Multi_Stage_Tournament as completed.
4. WHEN the final stage is an elimination format and the Multi_Stage_Tournament is marked as completed, THE Tournament_Runner SHALL record the winner of the final match as the tournament champion.
5. WHEN the final stage is a round_robin or swiss format and the Multi_Stage_Tournament is marked as completed, THE Tournament_Runner SHALL record the team with the most wins as the tournament champion, using original seed as a tiebreaker (lower seed wins).
6. WHEN the final stage uses the swiss format, THE Tournament_Runner SHALL use the same Elimination_Threshold and round generation rules as defined in Requirement 2 for that stage.

### Requirement 5: Multi-Stage Tournament UI - Stage Navigation and Group Standings

**User Story:** As a tournament viewer, I want to see the current stage, group standings, and playoff bracket in the UI, so that I can follow the tournament's progress across stages.

#### Acceptance Criteria

1. WHEN a user views a Multi_Stage_Tournament, THE Tournament_Runner SHALL display a stage indicator showing each stage's name, format, and status (pending, in_progress, or completed), with the currently active stage visually distinguished from other stages.
2. WHEN the active stage is a Swiss group stage, THE Tournament_Runner SHALL display Group_Standings for each group showing team name, wins, losses, elimination status (active or eliminated), and advancement qualification status (qualified, contending, or eliminated), sorted by win count descending with ties broken by original seed ascending.
3. WHEN the active stage is an elimination-format or round-robin stage, THE Tournament_Runner SHALL display the match view using the existing BracketView component for single_elimination and double_elimination formats, or the RoundRobinView component for round_robin format.
4. THE Tournament_Runner SHALL allow a user to navigate to any completed stage or the active stage to review results, and SHALL NOT allow navigation to stages that have not yet started.
5. WHEN a user views the tournament creation form, THE Tournament_Runner SHALL provide an option to select "Multi-Stage" as a tournament structure with UI controls to configure at least 2 stages, including each stage's format, group count (minimum 1), Elimination_Threshold for Swiss-format stages, and Advancement_Criteria for all non-final stages.
6. WHEN a user navigates to a completed stage, THE Tournament_Runner SHALL display that stage's final Group_Standings or match results in the same format used when the stage was active, including which teams advanced to the next stage.

### Requirement 6: Multi-Stage Tournament Data Model

**User Story:** As a developer, I want the data model to support multi-stage tournaments while remaining backward compatible with existing single-format tournaments, so that the system can be extended without breaking current functionality.

#### Acceptance Criteria

1. THE Tournament_Runner SHALL store Multi_Stage_Tournament data using a stages array where each stage contains its own format, status, teams, matches, groups, and configuration (including advancement criteria, and elimination threshold when the stage format is Swiss).
2. THE Tournament_Runner SHALL maintain backward compatibility by continuing to store and retrieve single-format tournaments using the existing Tournament data model, DynamoDB key structure (PK=TOURNAMENT#id, SK=META), and API response shape without modification to existing fields.
3. THE Tournament_Runner SHALL store advancement results as part of the stage data, including the list of advanced team identifiers and each team's source group identifier, for audit and display purposes.
4. WHEN a Multi_Stage_Tournament is retrieved via the API, THE Tournament_Runner SHALL return the complete tournament including all stages with their teams, matches, groups, statuses, and the current stage identifier.
5. THE Tournament_Runner SHALL distinguish a Multi_Stage_Tournament from a single-format Tournament using a type discriminator field so that the system can determine the applicable data model when reading or writing tournament records.
6. THE Tournament_Runner SHALL support a maximum of 10 stages per Multi_Stage_Tournament.
