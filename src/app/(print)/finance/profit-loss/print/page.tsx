import type { Metadata } from 'next';
import Link from 'next/link';
import { PrintButton } from '@/components/finance/PrintButton';
import { ProfitLossStatement } from '@/components/finance/ProfitLossStatement';
import styles from '@/components/payroll/PayslipPrint.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { chooseRange, periodLabels } from '@/lib/finance/financialPeriods';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { requirePagePermission } from '@/server/services/accessService';
import { getFinanceSettings } from '@/server/services/financeService';
import { getProfitLossComparison } from '@/server/services/profitLossService';

export const metadata: Metadata = { title: 'Profit and loss statement' };

export default async function ProfitLossPrintPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  await requirePagePermission(permissionKeys.ledgerManage);
  const params = await searchParams;
  const today = todayInIndia();
  const { range, period } = chooseRange(params, today);
  const [data, settings] = await Promise.all([getProfitLossComparison(range), getFinanceSettings()]);
  const query = new URLSearchParams(period ? { period } : range).toString();
  const net = data.current.totals.net;

  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <Link href={`/finance/profit-loss?${query}`}>← Back</Link>
        <PrintButton />
      </div>
      <article className={styles.sheet}>
        <header className={styles.top}>
          <div>
            <p className={styles.company}>{settings?.legal_name ?? 'Company name not set'}</p>
            {settings?.address && <p className={styles.preserve}>{settings.address}</p>}
          </div>
          <div className={styles.title}>
            <h1>Profit and loss</h1>
            <p>
              {period ? `${periodLabels[period]}, ` : ''}
              {formatDate(range.from)} to {formatDate(range.to)}
            </p>
          </div>
        </header>
        <ProfitLossStatement data={data} />
        <p className={styles.net}>
          {net >= 0 ? 'Net profit' : 'Net loss'} <strong>{formatRupees(Math.abs(net))}</strong>
        </p>
        <p className={styles.footer}>Cash basis: money received and paid in the period. Prepared {formatDate(today)}.</p>
      </article>
    </div>
  );
}
