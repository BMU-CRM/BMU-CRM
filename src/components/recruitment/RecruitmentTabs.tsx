import { PageTabs } from '@/components/ui/PageTabs';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { candidateStageLabels, type CandidateStage } from '@/lib/validation/recruitmentSchema';

const tabs = [
  { key: 'board', href: '/hr/recruitment', label: 'Board' },
  { key: 'candidates', href: '/hr/recruitment/candidates', label: 'Candidates' },
  { key: 'openings', href: '/hr/recruitment/openings', label: 'Job openings' },
  { key: 'interviews', href: '/hr/recruitment/interviews', label: 'Interviews' },
  { key: 'onboarding', href: '/hr/recruitment/onboarding', label: 'Onboarding' },
] as const;

export function RecruitmentTabs({ current }: { current: (typeof tabs)[number]['key'] }) {
  return <PageTabs label="Recruitment" tabs={tabs.map((tab) => ({ href: tab.href, label: tab.label, current: tab.key === current }))} />;
}

const tones: Partial<Record<CandidateStage, 'good' | 'warning' | 'critical'>> = {
  selected: 'good',
  offer_released: 'warning',
  offer_accepted: 'good',
  joined: 'good',
  rejected: 'critical',
};

export function CandidateStageBadge({ stage }: { stage: CandidateStage }) {
  return <StatusBadge tone={tones[stage]}>{candidateStageLabels[stage]}</StatusBadge>;
}
