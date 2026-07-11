// Golden fixtures. No test framework — just data, checked by test/run.js with assert.

export const xirrFixtures = [
  {
    name: 'two-flow 10% annual',
    flows: [
      { date: new Date('2020-01-01'), amount: -1000 },
      { date: new Date('2021-01-01'), amount: 1100 },
    ],
    expected: 0.10,
    tolerance: 0.001,
  },
  {
    name: 'Microsoft XIRR docs example',
    // https://support.microsoft.com/en-us/office/xirr-function — canonical XIRR worked example.
    flows: [
      { date: new Date('2008-01-01'), amount: -10000 },
      { date: new Date('2008-03-01'), amount: 2750 },
      { date: new Date('2008-10-30'), amount: 4250 },
      { date: new Date('2009-02-15'), amount: 3250 },
      { date: new Date('2009-04-01'), amount: 2750 },
    ],
    expected: 0.373,
    tolerance: 0.005,
  },
  {
    name: 'monthly DCA, flat 8% CAGR',
    flows: Array.from({ length: 13 }, (_, i) => ({
      date: new Date(Date.UTC(2020, i, 1)),
      amount: i === 0 ? -1200 : (i === 12 ? 1200 * Math.pow(1.08, 1) : 0),
    })).filter(f => f.amount !== 0),
    expected: 0.08,
    tolerance: 0.005,
  },
];

export const transferDutyFixtures = [
  { value: 1000000, expected: 0 },
  { value: 1210000, expected: 0 },
  { value: 1500000, expected: 8700 },       // (1,500,000-1,210,000)*3%
  { value: 2000000, expected: 33786 },      // 13,614 + (2,000,000-1,663,800)*6%
  { value: 15000000, expected: 1461156 },   // 1,241,456 + (15,000,000-13,310,000)*13%
];
