export function chileVisitDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function visitAvailableFrom(date: string, choice: 'inmediata' | 'en_5_dias'): string {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + (choice === 'en_5_dias' ? 5 : 0));
  return result.toISOString().slice(0, 10);
}