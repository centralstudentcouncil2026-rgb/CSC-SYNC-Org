export const CSC_FILTER = 'central-student-council';
export const CSC_NAME = 'Central Student Council';

export function isCouncilAccount(account) {
  return ['administrator', 'admin'].includes(account?.role) ||
    String(account?.organizationName || '').trim().toLowerCase() === CSC_NAME.toLowerCase();
}

export function calendarOrganizationOptions(accounts, currentId) {
  return [
    { id: CSC_FILTER, label: CSC_NAME },
    ...accounts.filter(account => account.id !== currentId && !isCouncilAccount(account))
      .map(account => ({ id: account.id, label: account.organizationName || account.officerName || 'Organization' })),
  ];
}

export function matchesCalendarOrganization(event, selectedId, accounts) {
  if (selectedId === CSC_FILTER) return isCouncilAccount(accounts.find(account => account.id === event.ownerAccountId));
  return event.ownerAccountId === selectedId;
}
