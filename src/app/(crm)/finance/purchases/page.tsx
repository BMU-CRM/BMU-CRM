import { Plus, ShoppingCart, Truck } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { PurchaseOrderStatusBadge, VendorBillStatusBadge } from '@/components/purchases/PurchaseBadges';
import { ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageTabs } from '@/components/ui/PageTabs';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { parseId, parsePage } from '@/lib/parseListParams';
import { purchaseOrderStatusLabels, type PurchaseOrderStatus } from '@/lib/validation/purchaseSchema';
import { requirePagePermission } from '@/server/services/accessService';
import {
  getPayablesSummary,
  getVendorOptions,
  listPurchaseOrders,
  listVendorBills,
  listVendors,
  purchasesPerPage,
  type BillFilters,
} from '@/server/services/purchaseService';

export const metadata: Metadata = { title: 'Purchases' };

type Params = Record<string, string | undefined>;

const billStatuses = [
  { value: 'open', label: 'Still to pay' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'part_paid', label: 'Part paid' },
  { value: 'paid', label: 'Paid' },
];

function cleanParams(params: Params) {
  return Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]) && entry[0] !== 'page'));
}

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requirePagePermission(permissionKeys.purchasesManage);
  const params = await searchParams;
  const view = params.view === 'orders' ? 'orders' : params.view === 'vendors' ? 'vendors' : 'bills';
  const newHref = { bills: '/finance/purchases/bills/new', orders: '/finance/purchases/orders/new', vendors: '/finance/purchases/vendors/new' }[view];
  const newLabel = { bills: 'Add bill', orders: 'New purchase order', vendors: 'Add vendor' }[view];

  return (
    <>
      <PageHeader
        title="Purchases"
        description="Vendors, purchase orders and the bills they send. Paying a bill files the expense automatically."
        actions={
          <ButtonLink href={newHref} variant="primary">
            <Plus size={16} aria-hidden="true" />
            {newLabel}
          </ButtonLink>
        }
      />
      <PageTabs
        label="Purchases"
        tabs={[
          { href: '/finance/purchases', label: 'Bills', current: view === 'bills' },
          { href: '/finance/purchases?view=orders', label: 'Purchase orders', current: view === 'orders' },
          { href: '/finance/purchases?view=vendors', label: 'Vendors', current: view === 'vendors' },
        ]}
      />
      {view === 'bills' && <BillsView params={params} />}
      {view === 'orders' && <OrdersView params={params} />}
      {view === 'vendors' && <VendorsView params={params} />}
    </>
  );
}

async function BillsView({ params }: { params: Params }) {
  const today = todayInIndia();
  const filters: BillFilters = {
    search: params.search,
    vendorId: parseId(params.vendorId),
    status: billStatuses.find((status) => status.value === params.status)?.value as BillFilters['status'],
    removed: params.show === 'removed',
    page: parsePage(params.page),
  };
  const [{ bills, total }, summary, vendors] = await Promise.all([listVendorBills(filters, today), getPayablesSummary(today), getVendorOptions()]);

  return (
    <div className={layout.stack}>
      <StatTiles
        tiles={[
          { label: `Still to pay (${summary.openBills} bills)`, value: formatRupees(summary.owed), href: '/finance/purchases?status=open' },
          { label: 'Overdue', value: formatRupees(summary.overdue), href: '/finance/purchases?status=overdue' },
          { label: 'Due in the next 7 days', value: formatRupees(summary.dueThisWeek) },
        ]}
      />
      <form method="get" className={filterStyles.filters}>
        <TextField label="Search" name="search" type="search" placeholder="Bill number or description" defaultValue={params.search} />
        <SelectField label="Vendor" name="vendorId" options={vendors} placeholder="All vendors" defaultValue={filters.vendorId} />
        <SelectField label="Status" name="status" options={billStatuses} placeholder="Any status" defaultValue={filters.status} />
        <SelectField label="Show" name="show" options={[{ value: 'removed', label: 'Removed bills' }]} placeholder="Current bills" defaultValue={params.show} />
        <div className={filterStyles.actions}>
          <ButtonLink href="/finance/purchases" variant="ghost">
            Clear
          </ButtonLink>
        </div>
      </form>
      <Panel flush>
        {bills.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="No bills here" description="Bills from vendors appear here once you add them." />
        ) : (
          <>
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th scope="col">Bill</th>
                    <th scope="col">Due</th>
                    <th scope="col">Status</th>
                    <th scope="col" className={tableStyles.numeric}>Total</th>
                    <th scope="col" className={tableStyles.numeric}>Still due</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill) => (
                    <tr key={bill.id}>
                      <td>
                        <Link href={`/finance/purchases/bills/${bill.id}`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                          {bill.vendor?.name}
                        </Link>
                        <p className={tableStyles.secondaryText}>
                          {[`Bill ${bill.bill_number}`, formatDate(bill.bill_date), bill.category?.name, bill.order?.po_number].filter(Boolean).join(' · ')}
                        </p>
                        {bill.deleted_at && <p className={tableStyles.secondaryText}>Removed: {bill.delete_reason}</p>}
                      </td>
                      <td>{formatDate(bill.due_date)}</td>
                      <td>
                        <VendorBillStatusBadge amount={bill.amount} paid={bill.amount_paid} dueDate={bill.due_date} today={today} />
                      </td>
                      <td className={tableStyles.numeric}>{formatRupees(bill.amount)}</td>
                      <td className={`${tableStyles.numeric} ${tableStyles.primaryText}`}>{formatRupees(bill.amount - bill.amount_paid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={filters.page}
              perPage={purchasesPerPage}
              total={total}
              hrefForPage={(target) => `/finance/purchases?${new URLSearchParams({ ...cleanParams(params), page: String(target) })}`}
            />
          </>
        )}
      </Panel>
    </div>
  );
}

const orderStatuses = Object.keys(purchaseOrderStatusLabels) as PurchaseOrderStatus[];

async function OrdersView({ params }: { params: Params }) {
  const status = orderStatuses.find((value) => value === params.status);
  const vendorId = parseId(params.vendorId);
  const page = parsePage(params.page);
  const [{ orders, total }, vendors] = await Promise.all([listPurchaseOrders({ search: params.search, status, vendorId, page }), getVendorOptions()]);

  return (
    <div className={layout.stack}>
      <form method="get" className={filterStyles.filters}>
        <input type="hidden" name="view" value="orders" />
        <TextField label="Search" name="search" type="search" placeholder="PO number or what it is for" defaultValue={params.search} />
        <SelectField label="Vendor" name="vendorId" options={vendors} placeholder="All vendors" defaultValue={vendorId} />
        <SelectField label="Status" name="status" options={orderStatuses.map((value) => ({ value, label: purchaseOrderStatusLabels[value] }))} placeholder="Any status" defaultValue={status} />
        <div className={filterStyles.actions}>
          <ButtonLink href="/finance/purchases?view=orders" variant="ghost">
            Clear
          </ButtonLink>
        </div>
      </form>
      <Panel flush>
        {orders.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="No purchase orders here" description="Raise an order to send to a vendor." />
        ) : (
          <>
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th scope="col">Order</th>
                    <th scope="col">Vendor</th>
                    <th scope="col">Status</th>
                    <th scope="col" className={tableStyles.numeric}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <Link href={`/finance/purchases/orders/${order.id}`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                          {order.title}
                        </Link>
                        <p className={tableStyles.secondaryText}>
                          {order.po_number ?? 'Draft'} · {formatDate(order.order_date)}
                        </p>
                      </td>
                      <td>{order.vendor?.name}</td>
                      <td>
                        <PurchaseOrderStatusBadge status={order.status} />
                      </td>
                      <td className={`${tableStyles.numeric} ${tableStyles.primaryText}`}>{formatRupees(order.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={page}
              perPage={purchasesPerPage}
              total={total}
              hrefForPage={(target) => `/finance/purchases?${new URLSearchParams({ ...cleanParams(params), view: 'orders', page: String(target) })}`}
            />
          </>
        )}
      </Panel>
    </div>
  );
}

async function VendorsView({ params }: { params: Params }) {
  const page = parsePage(params.page);
  const showInactive = params.show === 'all';
  const { vendors, total } = await listVendors({ search: params.search, showInactive, page });

  return (
    <div className={layout.stack}>
      <form method="get" className={filterStyles.filters}>
        <input type="hidden" name="view" value="vendors" />
        <TextField label="Search" name="search" type="search" placeholder="Name, contact or GSTIN" defaultValue={params.search} />
        <SelectField label="Show" name="show" options={[{ value: 'all', label: 'Including not in use' }]} placeholder="In use" defaultValue={params.show} />
        <div className={filterStyles.actions}>
          <ButtonLink href="/finance/purchases?view=vendors" variant="ghost">
            Clear
          </ButtonLink>
        </div>
      </form>
      <Panel flush>
        {vendors.length === 0 ? (
          <EmptyState icon={Truck} title="No vendors yet" description="Add the companies you buy from." />
        ) : (
          <>
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th scope="col">Vendor</th>
                    <th scope="col">Contact</th>
                    <th scope="col">GSTIN</th>
                    <th scope="col">Pays within</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((vendor) => (
                    <tr key={vendor.id}>
                      <td>
                        <Link href={`/finance/purchases/vendors/${vendor.id}`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                          {vendor.name}
                        </Link>
                        <p className={tableStyles.secondaryText}>{vendor.state ?? 'State not set'}</p>
                        {!vendor.is_active && <StatusBadge>Not in use</StatusBadge>}
                      </td>
                      <td>
                        <p>{vendor.contact_person ?? '—'}</p>
                        <p className={tableStyles.secondaryText}>{[vendor.phone, vendor.email].filter(Boolean).join(' · ')}</p>
                      </td>
                      <td>{vendor.gstin ?? 'Unregistered'}</td>
                      <td>{vendor.payment_terms_days} days</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={page}
              perPage={purchasesPerPage}
              total={total}
              hrefForPage={(target) => `/finance/purchases?${new URLSearchParams({ ...cleanParams(params), view: 'vendors', page: String(target) })}`}
            />
          </>
        )}
      </Panel>
    </div>
  );
}
