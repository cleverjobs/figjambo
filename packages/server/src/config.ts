import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_PORT, DEFAULT_HOST } from '@figjambo/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Figma Topology ────────────────────────────────────────

interface TopologyFile { key: string; name: string }
interface TopologyProject { id: string; name: string; files: TopologyFile[] }
interface TopologyTeam { id: string; name: string; projects: TopologyProject[] }
interface Topology { updatedAt: string; teams: TopologyTeam[] }

export interface FileLookup { teamName: string; projectName: string }

function loadTopology(): { topology: Topology; fileKeyLookup: Map<string, FileLookup> } {
  const topoPath = path.resolve(__dirname, '../../../figma-topology.json');
  if (!fs.existsSync(topoPath)) {
    console.error(
      '\n  figma-topology.json not found.\n' +
      '  Run: npx tsx scripts/update-teams.ts --add "TEAM_ID:Team Name"\n',
    );
    process.exit(1);
  }

  const topology = JSON.parse(fs.readFileSync(topoPath, 'utf-8')) as Topology;
  const fileKeyLookup = new Map<string, FileLookup>();

  for (const team of topology.teams) {
    for (const project of team.projects) {
      for (const file of project.files) {
        fileKeyLookup.set(file.key, {
          teamName: team.name,
          projectName: project.name,
        });
      }
    }
  }

  return { topology, fileKeyLookup };
}

const { topology, fileKeyLookup } = loadTopology();

export const config = {
  port: Number(process.env.FIGJAMBO_PORT ?? DEFAULT_PORT),
  host: process.env.FIGJAMBO_HOST ?? DEFAULT_HOST,
  outputDir: process.env.FIGJAMBO_OUTPUT_DIR ?? path.resolve(__dirname, '../../../.output'),
  topology,
  fileKeyLookup,
};
