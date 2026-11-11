/**
 * OURANIC 原版对照回归
 *
 * 输入：农历己巳年十一月廿六、辰时（男），经度 120°。
 * 日期转换后应为公历 1989-12-23；整张盘应与 OURANIC 原版的基准结果一致。
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

// 以下五项是 OURANIC 原版对此出生资料显示的基准，不是只测日期转换。
assert.equal(chart.mingGongBranch, 8, '命宫应在申宫（地支索引 8）');
assert.equal(chart.shenGongBranch, 4, '身宫应在辰宫（地支索引 4）');
assert.equal(chart.wuxingJuName, '金四局', '五行局应为金四局');
assert.equal(chart.ziweiPos, 10, '紫微星应在戌宫（地支索引 10）');
assert.ok(
  chart.daXians.some(dx =>
    dx.startAge === 34 &&
    dx.endAge === 43 &&
    dx.palaceName === '子女宫'
  ),
  '34–43 岁大限应在子女宫',
);

console.log('✅ OURANIC 对照回归通过：日期、命身宫、五行局、紫微位置、大限均一致');
