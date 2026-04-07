import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOPOLOGY_PATH = path.resolve(__dirname, '../figma-topology.json');
const FIGMA_API = 'https://api.figma.com';

interface TopologyFile {
  key: string;
  name: string;
}

interface TopologyProject {
  id: string;
  name: string;
  files: TopologyFile[];
}

interface TopologyTeam {
  id: string;
  name: string;
  user?: string;
  projects: TopologyProject[];
}

interface Topology {
  updatedAt: string;
  teams: TopologyTeam[];
}

function getTokens(): Map<string, string> {
  const raw = process.env.FIGMA_ACCESS_TOKENS ?? '';
  const map = new Map<string, string>();
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const name = trimmed.slice(0, colonIdx).trim();
    const token = trimmed.slice(colonIdx + 1).trim();
    if (name && token) map.set(name, token);
  }
  if (map.size === 0) {
    console.error('Error: FIGMA_ACCESS_TOKENS not set. Format: name:token');
    process.exit(1);
  }
  return map;
}

function getFirstToken(tokens: Map<string, string>): string {
  return tokens.values().next().value!;
}

function getTokenForUser(tokens: Map<string, string>, user: string): string {
  const token = tokens.get(user);
  if (!token) {
    console.error(`No token for user "${user}". Available: ${[...tokens.keys()].join(', ')}`);
    process.exit(1);
  }
  return token;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function figmaGet<T>(endpoint: string, token: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${FIGMA_API}${endpoint}`, {
      headers: { 'X-Figma-Token': token },
    });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After') || '5');
      console.log(`    Rate limited — waiting ${retryAfter}s...`);
      await sleep(retryAfter * 1000);
      continue;
    }
    if (!res.ok) {
      throw new Error(`Figma API ${endpoint} failed: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }
  throw new Error(`Figma API ${endpoint} failed after 3 retries`);
}

interface TeamEntry { id: string; user: string | null }

function parseArgs(args: string[]): { teams: TeamEntry[]; filterUser: string | null; filterTeams: string[] } {
  const teams: TeamEntry[] = [];
  const filterTeams: string[] = [];
  let currentUser: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--user' && args[i + 1]) {
      currentUser = args[i + 1].trim();
      i++;
    } else if (args[i] === '--add' && args[i + 1]) {
      teams.push({ id: args[i + 1].trim(), user: currentUser });
      i++;
    } else if (args[i] === '--team' && args[i + 1]) {
      filterTeams.push(args[i + 1].trim());
      i++;
    }
  }
  // When no --add flags, --user acts as a refresh filter
  const filterUser = teams.length === 0 ? currentUser : null;
  return { teams, filterUser, filterTeams };
}

function loadExisting(): Topology | null {
  if (!fs.existsSync(TOPOLOGY_PATH)) return null;
  return JSON.parse(fs.readFileSync(TOPOLOGY_PATH, 'utf-8')) as Topology;
}

async function main() {
  const args = process.argv.slice(2);
  const { teams: addTeams, filterUser, filterTeams } = parseArgs(args);
  const existing = loadExisting();
  const tokens = getTokens();

  // Build list: new --add entries + existing (with stored user)
  const teamEntries = new Map<string, string | null>(); // id → user
  if (existing) {
    for (const t of existing.teams) {
      teamEntries.set(t.id, t.user ?? null);
    }
  }
  for (const t of addTeams) {
    teamEntries.set(t.id, t.user);
  }

  if (teamEntries.size === 0) {
    console.error('No existing figma-topology.json and no --add flags. Usage:');
    console.error('  npx tsx scripts/update-teams.ts --user userName --add TEAM_ID [--add TEAM_ID2]');
    process.exit(1);
  }

  // Determine which teams to refresh vs preserve
  const hasFilters = addTeams.length === 0 && (filterUser !== null || filterTeams.length > 0);
  const toRefresh = new Map<string, string | null>();

  if (hasFilters && existing) {
    for (const [id, user] of teamEntries) {
      const existingTeam = existing.teams.find(t => t.id === id);
      const matchesUser = !filterUser || user === filterUser;
      const matchesTeam = filterTeams.length === 0
        || filterTeams.includes(id)
        || (existingTeam && filterTeams.some(f => existingTeam.name.toLowerCase() === f.toLowerCase()));

      if (matchesUser && matchesTeam) {
        toRefresh.set(id, user);
      }
    }

    if (toRefresh.size === 0) {
      console.error('No teams match the provided filters.');
      console.error(`  --user: ${filterUser ?? '(none)'}`);
      console.error(`  --team: ${filterTeams.join(', ') || '(none)'}`);
      process.exit(1);
    }

    console.log(`Refreshing ${toRefresh.size} of ${teamEntries.size} teams (${teamEntries.size - toRefresh.size} preserved)\n`);
  } else {
    for (const [id, user] of teamEntries) {
      toRefresh.set(id, user);
    }
  }

  // Fetch refreshed teams from API
  const refreshedMap = new Map<string, TopologyTeam>();

  for (const [teamId, teamUser] of toRefresh) {
    const token = teamUser ? getTokenForUser(tokens, teamUser) : getFirstToken(tokens);
    console.log(`Fetching team ${teamId} (using ${teamUser ?? 'default'} token)...`);
    const projRes = await figmaGet<{ name: string; projects: Array<{ id: number; name: string }> }>(
      `/v1/teams/${teamId}/projects`,
      token,
    );

    const teamName = projRes.name;
    console.log(`  Team: "${teamName}" — ${projRes.projects.length} projects`);

    const projects: TopologyProject[] = [];
    for (const proj of projRes.projects) {
      console.log(`    Fetching files for "${proj.name}" (${proj.id})...`);
      const fileRes = await figmaGet<{ files: Array<{ key: string; name: string }> }>(
        `/v1/projects/${proj.id}/files`,
        token,
      );

      projects.push({
        id: String(proj.id),
        name: proj.name,
        files: fileRes.files.map(f => ({ key: f.key, name: f.name })),
      });
      await sleep(500);
    }

    refreshedMap.set(teamId, {
      id: teamId,
      name: teamName,
      user: teamUser ?? undefined,
      projects,
    });
  }

  // Merge: maintain original order, swap in refreshed teams
  const finalTeams: TopologyTeam[] = [];
  for (const [id] of teamEntries) {
    const refreshed = refreshedMap.get(id);
    if (refreshed) {
      finalTeams.push(refreshed);
    } else {
      const preserved = existing?.teams.find(t => t.id === id);
      if (preserved) finalTeams.push(preserved);
    }
  }

  const topology: Topology = {
    updatedAt: new Date().toISOString(),
    teams: finalTeams,
  };

  fs.writeFileSync(TOPOLOGY_PATH, JSON.stringify(topology, null, 2) + '\n', 'utf-8');

  // Summary
  let totalProjects = 0;
  let totalFiles = 0;
  for (const t of topology.teams) {
    totalProjects += t.projects.length;
    for (const p of t.projects) {
      totalFiles += p.files.length;
    }
  }
  const refreshedCount = refreshedMap.size;
  const preservedCount = finalTeams.length - refreshedCount;
  console.log(`\nWritten figma-topology.json: ${topology.teams.length} teams (${refreshedCount} refreshed, ${preservedCount} preserved), ${totalProjects} projects, ${totalFiles} files`);
}

main();
