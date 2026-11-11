/**
 * 农历生日转换回归
 *
 * 对照样例：农历己巳年十一月廿六、辰时（男）
 * 应转换为公历 1989-12-23，辰时支为 4。
 * 该测试只验证表单到排盘输入的日期转换，不预设或篡改排盘流派算法。
 */
import assert from 'node:assert/strict';
import { formToBirthInfo } from '../../lib/ziwei/share';
import { generateChart } from '../../lib/ziwei/algorithm';
import type { BirthFormState } from '../../components/BirthForm';

const form: BirthFormState = {
  name: '',
  year: '1989',
  month: '11',
  day: '26',
  clockHour: '8',
  clockMinute: '0',
  unknownTime: false,
  province: '',
  city: '',
  longitude: 120,
  gender: 'male',
  calendarType: 'lunar',
  isLeapMonth: false,
};

const birth = formToBirthInfo(form);

assert.deepEqual(
  { year: birth.year, month: birth.month, day: birth.day },
  { year: 1989, month: 12, day: 23 },
  '农历 1989 年十一月廿六必须转换为公历 1989-12-23',
);
assert.equal(birth.hour, 4, '北京时间 08:00、经度 120° 应为辰时支 4');
assert.equal(birth.gender, 'male', '性别应保持为男');

const chart = generateChart(birth);
assert.deepEqual(
  { year: chart.birthInfo.year, month: chart.birthInfo.month, day: chart.birthInfo.day },
  { year: 1989, month: 12, day: 23 },
  '最终命盘必须使用转换后的公历 1989-12-23',
);
assert.deepEqual(
  { year: chart.lunarInfo.lunarYear, month: chart.lunarInfo.lunarMonth, day: chart.lunarInfo.lunarDay },
  { year: 1989, month: 11, day: 26 },
  '排盘结果反算的农历日期必须仍为己巳年十一月廿六',
);

console.log('✅ 农历 1989-11-26 → 公历 1989-12-23 转换回归通过');
