/**
 * Test script: creates a 24-team multi-stage tournament and simulates scoring.
 * Usage: npx ts-node test-tournament.ts [base-url]
 * Default base-url: http://localhost:3001/api
 */

const BASE_URL = process.argv[2] || 'http://localhost:3001/api';

const TEAM_NAMES = [
  'Thunder', 'Wildcats', 'Blazers', 'Vipers', 'Titans', 'Mustangs',
  'Raptors', 'Cobras', 'Hurricanes', 'Mavericks', 'Falcons', 'Scorpions',
  'Wolverines', 'Panthers', 'Knights', 'Spartans', 'Eagles', 'Crushers',
  'Aces', 'Bandits', 'Storm', 'Legends', 'Rockets', 'Grizzlies',
];

async function request(path: string, options?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${path}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function randomScore(): [number, number] {
  const s1 = Math.floor(Math.random() * 21) + 1;
  let s2 = Math.floor(Math.random() * 21) + 1;
  if (s2 === s1) s2 = s1 + 1; // no ties
  return [s1, s2];
}

async function main() {
  console.log(`Using API: ${BASE_URL}\n`);

  // 1. Create tournament
  console.log('Creating multi-stage tournament...');
  const tournament = await request('/tournaments/multi-stage', {
    method: 'POST',
    body: JSON.stringify({
      name: `Test Swiss ${new Date().toLocaleTimeString()}`,
      sport: 'cornhole',
      teams: TEAM_NAMES.map((name) => ({ name })),
      stages: [
        {
          name: 'Swiss Pool',
          format: 'swiss',
          groupCount: 1,
          eliminationThreshold: 2,
          advancementCount: 8,
          winsToAdvance: 3,
          courts: 6,
        },
        {
          name: 'Playoffs',
          format: 'single_elimination',
          groupCount: 1,
        },
      ],
    }),
  });

  console.log(`Created: ${tournament.name} (${tournament.id})`);
  console.log(`Status: ${tournament.status}`);
  console.log(`Teams: ${tournament.teams.length}`);

  // 2. Start tournament
  console.log('\nStarting tournament...');
  let current = await request(`/tournaments/${tournament.id}/multi-stage/start`, {
    method: 'POST',
  });
  console.log(`Status: ${current.status}`);
  console.log(`Stage: ${current.stages[0].name} (${current.stages[0].status})`);

  // 3. Simulate rounds
  let roundsPlayed = 0;
  const maxRounds = 10;

  while (roundsPlayed < maxRounds) {
    const stage = current.stages[0];
    if (stage.status === 'completed') {
      console.log('\n✓ Stage 1 complete!');
      break;
    }

    const pendingMatches = stage.matches.filter((m: any) => m.status === 'pending');
    if (pendingMatches.length === 0) {
      console.log('\nNo pending matches. Checking group status...');
      const group = stage.groups[0];
      console.log(`  Group status: ${group.status}, round: ${group.currentRound}`);
      
      const active = stage.teamStageInfo.filter((t: any) => t.status === 'active');
      const advanced = stage.teamStageInfo.filter((t: any) => t.status === 'advanced');
      const eliminated = stage.teamStageInfo.filter((t: any) => t.status === 'eliminated');
      console.log(`  Active: ${active.length}, Advanced: ${advanced.length}, Eliminated: ${eliminated.length}`);
      break;
    }

    roundsPlayed++;
    console.log(`\n--- Scoring batch ${roundsPlayed} (${pendingMatches.length} pending matches) ---`);

    for (const match of pendingMatches) {
      const [s1, s2] = randomScore();
      try {
        current = await request(`/tournaments/${tournament.id}/matches/${match.id}/score`, {
          method: 'PUT',
          body: JSON.stringify({ team1Score: s1, team2Score: s2 }),
        });
      } catch (e: any) {
        console.log(`  Error scoring match ${match.id}: ${e.message}`);
      }
    }

    // Print standings
    const stage2 = current.stages[0];
    const active = stage2.teamStageInfo.filter((t: any) => t.status === 'active');
    const advanced = stage2.teamStageInfo.filter((t: any) => t.status === 'advanced');
    const eliminated = stage2.teamStageInfo.filter((t: any) => t.status === 'eliminated');
    const pending = stage2.matches.filter((m: any) => m.status === 'pending');
    
    console.log(`  Active: ${active.length}, Advanced: ${advanced.length}, Eliminated: ${eliminated.length}`);
    console.log(`  Pending matches: ${pending.length}`);
    console.log(`  Group round: ${stage2.groups[0]?.currentRound}, Group status: ${stage2.groups[0]?.status}`);
  }

  // 4. Check final state
  console.log('\n=== Final State ===');
  current = await request(`/tournaments/${tournament.id}`);
  
  const stage1 = current.stages[0];
  const stage2 = current.stages[1];
  
  console.log(`Tournament status: ${current.status}`);
  console.log(`Stage 1: ${stage1.status}`);
  console.log(`Stage 2: ${stage2.status}`);
  
  if (stage1.status === 'completed') {
    const advanced = stage1.teamStageInfo.filter((t: any) => t.status === 'advanced');
    console.log(`\nAdvanced teams (${advanced.length}):`);
    for (const t of advanced) {
      const team = current.teams.find((tm: any) => tm.id === t.teamId);
      console.log(`  ${team?.name}: ${t.wins}W-${t.losses}L`);
    }
  }

  if (stage2.matches.length > 0) {
    console.log(`\nPlayoff bracket: ${stage2.matches.length} matches`);
    const firstRound = stage2.matches.filter((m: any) => m.round === 1);
    console.log('First round:');
    for (const m of firstRound) {
      const t1 = current.teams.find((t: any) => t.id === m.team1Id);
      const t2 = current.teams.find((t: any) => t.id === m.team2Id);
      console.log(`  ${t1?.name || 'TBD'} vs ${t2?.name || 'TBD'}`);
    }
  }

  console.log(`\nTournament URL: ${BASE_URL.replace('/api', '')}/tournament/${tournament.id}`);
}

main().catch(console.error);
