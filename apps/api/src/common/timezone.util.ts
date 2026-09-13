/**
 * Computes the next midnight (00:00:00) in the user's IANA timezone as a UTC Date.
 */
export function getNextMidnight(
  timezone: string = 'UTC',
  referenceDate: Date = new Date(),
): Date {
  try {
    // Get parts for the user's local date
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });

    const parts = dtf.formatToParts(referenceDate);
    const year = parseInt(parts.find((p) => p.type === 'year')!.value, 10);
    const month = parseInt(parts.find((p) => p.type === 'month')!.value, 10);
    const day = parseInt(parts.find((p) => p.type === 'day')!.value, 10);

    // Tomorrow at 00:00:00 in user's timezone
    // Step forward 1 day
    const tomorrowLocal = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));

    // Get offset of that timezone around that time
    const tzOffsetMs = getTimezoneOffsetMs(timezone, tomorrowLocal);
    return new Date(tomorrowLocal.getTime() - tzOffsetMs);
  } catch {
    // Fallback: UTC tomorrow midnight
    const d = new Date(referenceDate);
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
}

/**
 * Computes the next occurrence of a given HH:MM time in the user's IANA timezone.
 */
export function getNextScheduledTime(
  timeHHMM: string = '07:00',
  timezone: string = 'UTC',
  referenceDate: Date = new Date(),
): Date {
  const [hoursStr, minutesStr] = timeHHMM.split(':');
  const targetHour = parseInt(hoursStr || '7', 10);
  const targetMinute = parseInt(minutesStr || '0', 10);

  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });

    const parts = dtf.formatToParts(referenceDate);
    const year = parseInt(parts.find((p) => p.type === 'year')!.value, 10);
    const month = parseInt(parts.find((p) => p.type === 'month')!.value, 10);
    const day = parseInt(parts.find((p) => p.type === 'day')!.value, 10);
    const currentHour = parseInt(parts.find((p) => p.type === 'hour')!.value, 10);
    const currentMinute = parseInt(parts.find((p) => p.type === 'minute')!.value, 10);

    const isPastToday =
      currentHour > targetHour ||
      (currentHour === targetHour && currentMinute >= targetMinute);

    const targetDay = isPastToday ? day + 1 : day;
    const targetUtc = new Date(
      Date.UTC(year, month - 1, targetDay, targetHour, targetMinute, 0),
    );

    const tzOffsetMs = getTimezoneOffsetMs(timezone, targetUtc);
    return new Date(targetUtc.getTime() - tzOffsetMs);
  } catch {
    // Fallback: calculate in UTC
    const d = new Date(referenceDate);
    d.setUTCHours(targetHour, targetMinute, 0, 0);
    if (d <= referenceDate) {
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return d;
  }
}

function getTimezoneOffsetMs(timezone: string, date: Date): number {
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  return tzDate.getTime() - utcDate.getTime();
}
