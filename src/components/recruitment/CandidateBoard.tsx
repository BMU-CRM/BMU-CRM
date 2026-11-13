import { AppLink as Link } from '@/components/ui/AppLink';
import { candidateStageLabels, candidateStages, type CandidateStage } from '@/lib/validation/recruitmentSchema';
import styles from './CandidateBoard.module.css';

type BoardCandidate = {
  id: string;
  full_name: string;
  position: string | null;
  stage: CandidateStage;
  experience_years: number | null;
  opening: { title: string } | null;
};

// One column per stage, scrolling sideways on small screens. Open a card to move it.
export function CandidateBoard({ candidates }: { candidates: BoardCandidate[] }) {
  return (
    <div className={styles.board} role="list" aria-label="Candidates by stage">
      {candidateStages.map((stage) => {
        const inStage = candidates.filter((candidate) => candidate.stage === stage);
        return (
          <section key={stage} className={styles.column} role="listitem" aria-label={`${candidateStageLabels[stage]}: ${inStage.length}`}>
            <h2 className={styles.heading} data-stage={stage}>
              {candidateStageLabels[stage]} <span className={styles.count}>{inStage.length}</span>
            </h2>
            <ul className={styles.cards}>
              {inStage.map((candidate) => (
                <li key={candidate.id}>
                  <Link href={`/hr/recruitment/candidates/${candidate.id}`} className={styles.card}>
                    <span className={styles.name}>{candidate.full_name}</span>
                    <span className={styles.meta}>
                      {[candidate.position ?? candidate.opening?.title, candidate.experience_years !== null ? `${candidate.experience_years} yrs` : null]
                        .filter(Boolean)
                        .join(' · ') || 'No position'}
                    </span>
                  </Link>
                </li>
              ))}
              {inStage.length === 0 && <li className={styles.empty}>None</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
