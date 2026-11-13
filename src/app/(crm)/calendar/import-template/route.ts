import { permissionKeys } from '@/lib/access/permissionKeys';
import { calendarSheetHeadings } from '@/lib/calendar/parseCalendarSheet';
import { csvCell, csvResponse } from '@/lib/csv/csvCell';
import { getActionAccess } from '@/server/services/accessService';
import { listCalendarCategories } from '@/server/services/meetingService';

// A sheet to fill in and import into the content calendar, with one example row for
// each category in use.
export async function GET() {
  if (!(await getActionAccess(permissionKeys.contentCalendarManage))) {
    return new Response('You do not have permission to do this.', { status: 403 });
  }
  const categories = (await listCalendarCategories()).filter((category) => category.is_active);
  const start = new Date(Date.now() + 5.5 * 3_600_000 + 86_400_000);
  const rows = categories.map((category, index) => {
    const day = new Date(start.getTime() + index * 86_400_000);
    const date = `${String(day.getUTCDate()).padStart(2, '0')}/${String(day.getUTCMonth() + 1).padStart(2, '0')}/${day.getUTCFullYear()}`;
    return [date, '10:00', '11:00', category.name, `Example: ${category.name}`, 'What to make, for which client, and any links'].map((value) => csvCell(value));
  });
  return csvResponse(calendarSheetHeadings, rows, 'content-calendar-import.csv');
}
