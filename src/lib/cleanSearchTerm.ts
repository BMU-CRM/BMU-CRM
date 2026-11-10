// These characters have meaning in PostgREST filters, so they cannot come from user
// input. Dots and apostrophes are safe here, and emails and names need them.
export function cleanSearchTerm(search: string) {
  return search.replace(/[,()%*\\"]/g, ' ').trim();
}
