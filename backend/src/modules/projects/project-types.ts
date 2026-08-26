/**
 * What kinds of project exist, and which MOBs each one can have.
 *
 * This is the rule "SIM Swap is survey-only, everything else also has
 * Installation and PAT" expressed once, in code, instead of being re-typed
 * every time someone adds a project. Creating a project picks a type; the
 * available MOBs — and the MOP template each produces — follow from it.
 */

export type ProjectTypeKey = 'RMS' | 'CCTV' | 'SIM_SWAP' | 'SMART_LOCKS';
export type MobTypeKey = 'SURVEY' | 'INSTALLATION' | 'PAT';

export interface MobTypeDefinition {
  key: MobTypeKey;
  name: string;
  /** File under backend/templates/mop/ this MOB renders from. */
  templateKey: string;
  defaultTcnSummary: string;
  sortOrder: number;
}

export interface ProjectTypeDefinition {
  key: ProjectTypeKey;
  label: string;
  description: string;
  colour: string;
  mobTypes: MobTypeDefinition[];
}

const MOB_LABELS: Record<MobTypeKey, string> = {
  SURVEY: 'Survey',
  INSTALLATION: 'Installation',
  PAT: 'PAT',
};

const mob = (
  key: MobTypeKey,
  templateKey: string,
  defaultTcnSummary: string,
  sortOrder: number,
): MobTypeDefinition => ({ key, name: MOB_LABELS[key], templateKey, defaultTcnSummary, sortOrder });

export const PROJECT_TYPES: ProjectTypeDefinition[] = [
  {
    key: 'RMS',
    label: 'RMS',
    description: 'Remote Monitoring System — controller, alarms, smart locks',
    colour: '#01C2F3',
    mobTypes: [
      mob('SURVEY', 'Site_Survey', 'Site Survey', 0),
      mob('INSTALLATION', 'INSTALLATION', 'Smart Tower Implementation', 1),
      mob('PAT', 'INSTALLATION', 'Smart Tower PAT', 2),
    ],
  },
  {
    key: 'CCTV',
    label: 'CCTV',
    description: 'Camera installation and acceptance',
    colour: '#C36BA9',
    mobTypes: [
      mob('SURVEY', 'Site_Survey', 'CCTV Site Survey', 0),
      mob('INSTALLATION', 'CCTV_Installation', 'CCTV Implementation', 1),
      mob('PAT', 'CCTV_Installation', 'CCTV PAT', 2),
    ],
  },
  {
    key: 'SIM_SWAP',
    label: 'SIM Swap',
    // The only survey-only type — there is no installation or acceptance stage.
    description: 'Replacing SIMs in deployed RMS units — survey only',
    colour: '#F59042',
    mobTypes: [mob('SURVEY', 'SIM_SWAP', 'Smart Tower SIM SWAP', 0)],
  },
  {
    key: 'SMART_LOCKS',
    label: 'Smart Locks',
    description: 'Smart lock installation and acceptance',
    colour: '#44489D',
    mobTypes: [
      mob('SURVEY', 'Site_Survey', 'Smart Lock Site Survey', 0),
      mob('INSTALLATION', 'INSTALLATION', 'Smart Lock Implementation', 1),
      mob('PAT', 'INSTALLATION', 'Smart Lock PAT', 2),
    ],
  },
];

export const projectType = (key: string): ProjectTypeDefinition | undefined =>
  PROJECT_TYPES.find((t) => t.key === key);

export const mobTypeOf = (
  typeKey: string,
  mobKey: string,
): MobTypeDefinition | undefined => projectType(typeKey)?.mobTypes.find((m) => m.key === mobKey);
