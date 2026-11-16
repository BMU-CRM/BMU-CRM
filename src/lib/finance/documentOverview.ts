// Writes a quotation's or invoice's project overview, and its title, from the services
// on it. For example: "BMU Marketing is pleased to submit this quotation for the monthly
// marketing of VAMIKA. We propose two Starter packages, built for essential execution to
// start or test the channel: Social Media Management and Google Business Profile. VAMIKA
// may take either package, or both together for a complete online presence."
// Written from rules, not by an AI; the person preparing it can change the text.

// An item's sub service (such as "Website Design & Development (Growth plan)"), its
// service, and its description. An item typed by hand, with no service picked, is named
// from the start of its description.
export type OverviewItem = { serviceName: string; billing: string; serviceGroup?: string; description?: string };

// A saved item line as the overview needs it.
export function lineToOverviewItem(line: {
  serviceName?: string | null;
  billing?: string | null;
  serviceGroup?: string | null;
  description?: string | null;
}): OverviewItem {
  return { serviceName: line.serviceName ?? '', billing: line.billing ?? '', serviceGroup: line.serviceGroup ?? '', description: line.description ?? '' };
}

// "Logo design: three concepts and two rounds of changes" gives "Logo design".
function nameFromDescription(description: string) {
  const first = description.trim().split('\n')[0]!.split(/[:.;–—]|\s-\s/)[0]!.trim();
  if (first.length <= 60) return first;
  const cut = first.slice(0, 60);
  return cut.slice(0, cut.lastIndexOf(' ') > 20 ? cut.lastIndexOf(' ') : 60).trim();
}

function itemName(item: OverviewItem) {
  return item.serviceName.trim() || item.serviceGroup?.trim() || nameFromDescription(item.description ?? '');
}

type OverviewInput = {
  kind: 'quotation' | 'invoice';
  companyName: string | null;
  clientName: string;
  items: OverviewItem[];
};

const maxLength = 400;
const planPattern = /\s*\((Starter|Growth|Premium) plan\)\s*$/i;

const planPurpose: Record<string, string> = {
  Starter: 'built for essential execution to start or test the channel',
  Growth: 'built for steady, consistent growth across the channel',
  Premium: 'built for full-scale, high-impact execution',
};

const numberWords = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const count = (value: number) => numberWords[value] ?? String(value);

function capitalised(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

// "A", "A and B", "A, B and C".
function joined(names: string[]) {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

// Each sub service once, without its "(Growth plan)" ending, with its plan.
function services(items: OverviewItem[]) {
  const seen = new Map<string, { name: string; plan: string | null; billing: string }>();
  for (const item of items) {
    const raw = itemName(item);
    if (!raw) continue;
    const plan = raw.match(planPattern)?.[1];
    const name = raw.replace(planPattern, '');
    if (!seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), { name, plan: plan ? capitalised(plan) : null, billing: item.billing });
  }
  return [...seen.values()];
}

function scopeOf(billings: string[]) {
  const kinds = new Set(billings.filter(Boolean));
  if (kinds.size === 1 && kinds.has('monthly')) return 'monthly marketing';
  if (kinds.size === 1 && kinds.has('one_time')) return 'project work';
  if (kinds.size === 1 && kinds.has('per_unit')) return 'campaign work';
  return 'marketing services';
}

export function writeOverview({ kind, companyName, clientName, items }: OverviewInput): string {
  const chosen = services(items);
  if (chosen.length === 0 || !clientName.trim()) return '';
  const client = clientName.trim();
  const company = companyName?.trim() || 'We';
  const opening =
    company === 'We'
      ? `We are pleased to ${kind === 'quotation' ? 'submit this quotation' : 'present this invoice'} for the ${scopeOf(chosen.map((item) => item.billing))} of ${client}.`
      : `${company} is pleased to ${kind === 'quotation' ? 'submit this quotation' : 'present this invoice'} for the ${scopeOf(chosen.map((item) => item.billing))} of ${client}.`;

  const plans = new Set(chosen.map((item) => item.plan));
  const samePlan = plans.size === 1 ? [...plans][0] : null;
  const verb = kind === 'quotation' ? 'We propose' : 'It covers';

  function middle(names: string[]) {
    const list = joined(names);
    if (samePlan) {
      const purpose = planPurpose[samePlan];
      return chosen.length === 1
        ? `${verb} a ${samePlan} package, ${purpose}: ${list}.`
        : `${verb} ${count(chosen.length)} ${samePlan} packages, ${purpose}: ${list}.`;
    }
    return `${verb} ${count(chosen.length)} ${chosen.length === 1 ? 'service' : 'services'}: ${list}.`;
  }

  const names = chosen.map((item) => (samePlan || !item.plan ? item.name : `${item.name} (${item.plan})`));
  const closing =
    kind === 'quotation' && chosen.length === 2
      ? `${client} may take either package, or both together for a complete online presence.`
      : kind === 'quotation' && chosen.length > 2
        ? `${client} may take any of these packages, or all of them together for a complete online presence.`
        : '';

  // Within the 400 characters a document allows: drop the closing line, then shorten
  // the list to its first few with "and N more".
  const attempts = [
    [opening, middle(names), closing],
    [opening, middle(names)],
    ...[3, 2, 1].filter((shown) => shown < names.length).map((shown) => [opening, middle([...names.slice(0, shown), `${count(names.length - shown)} more`])]),
  ];
  for (const parts of attempts) {
    const text = parts.filter(Boolean).join(' ');
    if (text.length <= maxLength) return text;
  }
  return opening.slice(0, maxLength);
}

// A short title from the services, such as "Social Media Management and Google Business
// Profile", for lists and page titles. Used when none is typed.
export function writeTitle(kind: 'quotation' | 'invoice', clientName: string | null, items: OverviewItem[]) {
  const names = services(items).map((item) => item.name);
  const fromServices = names.length > 3 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : joined(names);
  const title = fromServices || `${kind === 'quotation' ? 'Quotation' : 'Invoice'}${clientName?.trim() ? ` for ${clientName.trim()}` : ''}`;
  return title.length > 200 ? `${title.slice(0, 197)}...` : title.length >= 2 ? title : `${title} services`;
}
