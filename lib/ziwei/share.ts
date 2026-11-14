import type { BirthFormState } from '@/components/BirthForm';
import type { BirthInfo } from './types';
import { calculateTrueSolarTime, branchFromSolarMinutes, resolveZiweiDayOffset, shiftGregorianDate } from './true-solar-time';
// @ts-ignore lunar-javascript runtime API has no complete upstream TS declarations
import { Lunar } from 'lunar-javascript';

function isValidLongitude(longitude: number): boolean {
  return longitude >= -180 && longitude <= 180;
}

/** 根据出生日期、北京时间和出生地经度计算真太阳时时辰支 (0-11)，包含均时差。 */
export function calcTrueSolarBranch(
  clockHour: number,
  clockMinute: number,
  longitude?: number,
  year?: number,
  month?: number,
  day?: number,
): number {
  if (longitude !== undefined && year !== undefined && month !== undefined && day !== undefined) {
    return calculateTrueSolarTime({
      year, month, day, clockHour, clockMinute, longitude,
    }).branch;
  }
  const clockMins = clockHour * 60 + clockMinute;
  const offset = longitude === undefined ? 0 : (longitude - 120) * 4;
  return branchFromSolarMinutes(((clockMins + offset) % 1440 + 1440) % 1440);
}

/** BirthFormState → BirthInfo
 *
 * 子时规则（倪海厦体系/三合派标准）：
 * · 23:00-23:59 = 晚子时，**按次日**排盘（日期 +1）
 * · 00:00-00:59 = 早子时，按本日排盘
 * 这与「时辰支同为子(0)」并不冲突——子时分早晚两段，需要在日期上区分。
 */
export function formToBirthInfo(form: BirthFormState): BirthInfo {
  let y = parseInt(form.year) || 0;
  let m = parseInt(form.month) || 0;
  let d = parseInt(form.day) || 0;
  if (form.calendarType === 'lunar' && y > 0 && m > 0 && d > 0) {
    const lunarMonth = form.isLeapMonth ? -m : m;
    const solar = Lunar.fromYmd(y, lunarMonth, d).getSolar();
    y = solar.getYear();
    m = solar.getMonth();
    d = solar.getDay();
  }
  // 保存「用户实际填写的公历日期 + 钟表时间」，供命盘中间区域显示钟表时间、真太阳时（换日前的原始值）
  const origY = y;
  const origM = m;
  const origD = d;
  let hour = 0;

  // 时辰、晚子时换日统一使用真太阳时：经度修正 + 均时差。
  if (!form.unknownTime && y > 0 && m > 0 && d > 0) {
    const hasBirthplace = !!form.province && Number.isFinite(form.longitude);
    const solar = calculateTrueSolarTime({
      year: y,
      month: m,
      day: d,
      clockHour: parseInt(form.clockHour) || 0,
      clockMinute: parseInt(form.clockMinute) || 0,
      longitude: hasBirthplace ? form.longitude : undefined,
    });
    hour = solar.branch;
    const dayOffset = resolveZiweiDayOffset(solar);
    if (dayOffset !== 0) {
      ({ year: y, month: m, day: d } = shiftGregorianDate({ year: y, month: m, day: d }, dayOffset));
    }
  }

  return {
    year: y, month: m, day: d,
    hour,
    gender: form.gender,
    name: form.name || undefined,
    province: form.province || undefined,
    city: form.city || undefined,
    longitude: form.province ? form.longitude : undefined,
    origInput: !form.unknownTime && origY > 0 && origM > 0 && origD > 0
      ? {
          year: origY,
          month: origM,
          day: origD,
          clockHour: parseInt(form.clockHour) || 0,
          clockMinute: parseInt(form.clockMinute) || 0,
        }
      : undefined,
  };
}

/** BirthFormState → URLSearchParams（用于分享链接） */
export function formToSearchParams(form: BirthFormState): URLSearchParams {
  const p = new URLSearchParams();
  if (form.name) p.set('n', form.name);
  p.set('y', form.year);
  p.set('m', form.month);
  p.set('d', form.day);
  if (form.calendarType === 'lunar') p.set('cal', 'lunar');
  if (form.calendarType === 'lunar' && form.isLeapMonth) p.set('leap', '1');
  if (form.unknownTime) {
    p.set('u', '1');
  } else {
    p.set('h', form.clockHour);
    p.set('mi', form.clockMinute);
  }
  if (form.province) p.set('p', form.province);
  if (form.city) p.set('c', form.city);
  if (form.longitude !== 120 && isValidLongitude(form.longitude)) p.set('lo', String(form.longitude));
  p.set('g', form.gender === 'male' ? 'm' : 'f');
  return p;
}

/** URLSearchParams → Partial<BirthFormState>，不完整时返回 null */
export function searchParamsToForm(params: URLSearchParams): Partial<BirthFormState> | null {
  const year = params.get('y');
  const month = params.get('m');
  const day = params.get('d');
  if (!year || !month || !day) return null;
  const rawLongitude = params.get('lo')?.trim();
  const longitude = rawLongitude ? Number(rawLongitude) : 120;
  return {
    name: params.get('n') || '',
    year,
    month,
    day,
    calendarType: params.get('cal') === 'lunar' ? 'lunar' : 'solar',
    isLeapMonth: params.get('cal') === 'lunar' && params.get('leap') === '1',
    unknownTime: params.get('u') === '1',
    clockHour: params.get('h') || '8',
    clockMinute: params.get('mi') || '0',
    province: params.get('p') || '',
    city: params.get('c') || '',
    longitude: isValidLongitude(longitude) ? longitude : 120,
    gender: params.get('g') === 'f' ? 'female' : 'male',
  };
}
