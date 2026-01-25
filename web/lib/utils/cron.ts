/**
 * Parse cron expressions into human-readable format
 */

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Converts a cron expression to human-readable format
 * @param cron - Cron expression in format "minute hour day-of-month month day-of-week"
 * @returns Human-readable description of the schedule
 */
export function parseCronExpression(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  
  if (parts.length !== 5) {
    // Invalid format, return as-is
    return cron;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Daily schedules: 0 H * * *
  if (minute === "0" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    const h = parseInt(hour, 10);
    if (!isNaN(h) && h >= 0 && h <= 23) {
      const period = h >= 12 ? "PM" : "AM";
      const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `Daily at ${displayHour}:00 ${period} UTC`;
    }
  }

  // Weekly schedules: 0 H * * D
  if (minute === "0" && dayOfMonth === "*" && month === "*" && dayOfWeek !== "*") {
    const h = parseInt(hour, 10);
    const dayNum = parseInt(dayOfWeek, 10);
    
    if (!isNaN(h) && h >= 0 && h <= 23 && !isNaN(dayNum) && dayNum >= 0 && dayNum <= 6) {
      const period = h >= 12 ? "PM" : "AM";
      const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const dayName = DAY_NAMES[dayNum];
      return `${dayName} at ${displayHour}:00 ${period} UTC`;
    }
  }

  // Hourly schedules: 0 */N * * *
  if (minute === "0" && hour.startsWith("*/") && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    const interval = parseInt(hour.substring(2), 10);
    if (!isNaN(interval) && interval > 0) {
      return `Every ${interval} hour${interval > 1 ? "s" : ""}`;
    }
  }

  // Weekday schedules: 0 H * * 1-5
  if (minute === "0" && dayOfMonth === "*" && month === "*" && dayOfWeek === "1-5") {
    const h = parseInt(hour, 10);
    if (!isNaN(h) && h >= 0 && h <= 23) {
      const period = h >= 12 ? "PM" : "AM";
      const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `Weekdays at ${displayHour}:00 ${period} UTC`;
    }
  }

  // Fallback: return the cron expression itself
  return cron;
}
