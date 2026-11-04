/*
  Scenario script for the AI trust study.
  All companies and tokens are fictional.

  outcome : % price change in the period after the decision
  best    : the action with the highest payoff, given the payoff rule in app.js
            (BUY earns outcome - fee, SELL earns -outcome - fee, HOLD earns 0)
  ai      : the AI Advisor's advice when it is right (it always recommends "best")
  wrong   : the deliberately wrong advice, shown ONLY in the error group, ONLY in
            the error round. Every scenario used as an "error" scenario in
            ORDERS must have one.

  app.js checks on load that "best" matches the payoff rule and warns in the
  browser console if you edit a scenario and break this.
*/

const SCENARIOS = {
  S1: {
    id: 'S1',
    name: 'Kestrel Logistics',
    ticker: 'KSTL',
    type: 'Mid-cap stock, logistics',
    headline: 'Shares have slipped this month as investors worry about a slowdown in freight demand across the sector.',
    facts: [
      '1-month return: −6%',
      'Q2 shipment volumes: +11% year on year',
      'Management reaffirmed full-year guidance last week',
      'P/E of 18 vs sector average of 22'
    ],
    outcome: 7.8,
    best: 'BUY',
    ai: { conf: 74, why: 'The selloff tracks sector sentiment rather than company results. Volumes are growing, guidance is intact, and the valuation sits below peers. The setup favors a rebound.' },
    note: 'Kestrel’s monthly volume update beat expectations and the stock recovered its losses.'
  },

  S2: {
    id: 'S2',
    name: 'Orrin Foods',
    ticker: 'ORFD',
    type: 'Large-cap stock, packaged foods',
    headline: 'A celebrity’s social-media post featuring Orrin’s new snack went viral, and the stock jumped.',
    facts: [
      '2-week return: +14%',
      'Trading volume: 5× its 3-month average',
      'Analyst earnings estimates: unchanged',
      'P/E of 46 vs sector average of 38'
    ],
    outcome: -8.6,
    best: 'SELL',
    ai: { conf: 71, why: 'The rally is driven by attention, not earnings. Estimates haven’t moved and the stock now trades well above sector multiples. Attention-driven spikes like this tend to fade.' },
    note: 'As the post faded from feeds, trading volume normalized and the stock gave back most of its gains.'
  },

  S3: {
    id: 'S3',
    name: 'Helix Pharma',
    ticker: 'HLXP',
    type: 'Mid-cap stock, pharmaceuticals',
    headline: 'Helix is waiting for a regulatory decision on its lead drug, expected in about six weeks.',
    facts: [
      '1-month return: +1%',
      'Decision date: about 6 weeks away',
      'No new trial data expected before then',
      'Options market implies only small near-term moves'
    ],
    outcome: 0.3,
    best: 'HOLD',
    ai: { conf: 66, why: 'The key catalyst is still weeks away and nothing material is scheduled before it. The expected near-term move is smaller than the 1% trading fee, so staying out is the better choice for now.' },
    note: 'With no news before the decision, the stock drifted sideways.'
  },

  S4: {
    id: 'S4',
    name: 'Vantra Energy',
    ticker: 'VNTE',
    type: 'Small-cap stock, renewable energy',
    headline: 'Vantra announced a large solar-panel supply order, and the stock has rallied.',
    facts: [
      '1-month return: +9%',
      'New order: about 1.5× last year’s revenue',
      'Promoter shares pledged: up from 12% to 31% this quarter',
      'Net debt: up 40% year on year'
    ],
    outcome: -12.4,
    best: 'SELL',
    ai: { conf: 78, why: 'The order win is real, but the sharp rise in promoter pledging and debt points to financial stress. If pledged shares are sold, the price can fall quickly. The risk outweighs the upside.' },
    wrong: { rec: 'BUY', conf: 83, why: 'The order significantly expands revenue visibility, and momentum in renewable stocks remains strong. Order flow this strong typically supports further upside in the near term.' },
    note: 'Lenders sold some of the pledged shares after an early dip, triggering a sharp fall.'
  },

  S5: {
    id: 'S5',
    name: 'Tidewater Bank',
    ticker: 'TDBK',
    type: 'Mid-cap stock, banking',
    headline: 'Tidewater reported a cleaner loan book, but the stock barely reacted.',
    facts: [
      '1-month return: 0%',
      'Bad-loan (NPA) ratio: improved from 3.1% to 2.4%',
      'Announced its first dividend in three years',
      'Price-to-book of 0.9 vs peer average of 1.3'
    ],
    outcome: 6.1,
    best: 'BUY',
    ai: { conf: 69, why: 'Asset quality is improving and the dividend signals confidence, yet the stock still trades below book value and below peers. The market looks slow to price this in.' },
    note: 'Two brokerages upgraded the stock, and it moved closer to peer valuations.'
  },

  S6: {
    id: 'S6',
    name: 'Quanta Chain',
    ticker: 'QNTA',
    type: 'Crypto token',
    headline: 'Quanta’s token surged on rumors of a listing on a major exchange.',
    facts: [
      '7-day return: +40%',
      'Social-media mentions: 8× normal',
      'Listing rumor: not confirmed by the exchange or the project',
      'Large holders moved tokens onto exchanges this week'
    ],
    outcome: -15.2,
    best: 'SELL',
    ai: { conf: 80, why: 'The rally rests on an unconfirmed rumor and a surge in social chatter. Large holders moving tokens onto exchanges often signals plans to sell. The downside risk is high.' },
    note: 'The exchange denied the listing rumor, and the token fell sharply.'
  },

  S7: {
    id: 'S7',
    name: 'Meridian Textiles',
    ticker: 'MRDT',
    type: 'Small-cap stock, textile exports',
    headline: 'The rupee weakened slightly against the dollar, a mild positive for exporters like Meridian.',
    facts: [
      '1-month return: −1%',
      'Rupee vs dollar: weakened about 2% this month',
      'Order book: stable, no new contracts',
      'Next earnings report: next quarter'
    ],
    outcome: 0.6,
    best: 'HOLD',
    ai: { conf: 63, why: 'A weaker rupee helps margins slightly, but the effect is small and widely expected. With no catalyst before earnings, the likely move is too small to cover the trading fee.' },
    note: 'The stock edged up slightly in quiet trading.'
  },

  S8: {
    id: 'S8',
    name: 'Sable Software',
    ticker: 'SBLS',
    type: 'Large-cap stock, IT services',
    headline: 'Sable missed revenue estimates, and the stock dropped sharply on results day.',
    facts: [
      'Results-day move: −11%',
      'Revenue: 2% below analyst estimates',
      'New deal wins: highest in company history',
      'Operating margin: up 1.2 percentage points'
    ],
    outcome: 9.4,
    best: 'BUY',
    ai: { conf: 76, why: 'The miss was small, while record deal wins and wider margins point to stronger quarters ahead. An 11% drop looks like an overreaction to one headline number.' },
    note: 'After management highlighted the deal pipeline, the stock recovered most of the drop.'
  },

  S9: {
    id: 'S9',
    name: 'Northgate Realty',
    ticker: 'NGRT',
    type: 'Mid-cap stock, real estate',
    headline: 'Northgate’s pre-sales are booming, but a local news report flagged delayed approvals for one of its projects.',
    facts: [
      '1-month return: +18%',
      'Quarterly pre-sales: +25% year on year',
      'Report: approvals delayed for its largest project (the company denies any issue)',
      'Stock trades near its all-time high'
    ],
    outcome: -10.8,
    best: 'SELL',
    ai: { conf: 75, why: 'Strong pre-sales are already reflected in the 18% run-up. The approval issue is unresolved and concerns the largest project. At record highs, the risk of disappointment is underpriced.' },
    wrong: { rec: 'BUY', conf: 84, why: 'Pre-sales momentum is exceptional and the company has denied the report. With demand this strong, the regulatory concern looks like noise, and momentum should continue.' },
    note: 'The regulator confirmed a stay on the project, and the stock fell sharply.'
  },

  S10: {
    id: 'S10',
    name: 'Cobalt Motors',
    ticker: 'CBMT',
    type: 'Large-cap stock, automobiles',
    headline: 'Cobalt’s monthly sales came in line with expectations, ahead of a new model launch next quarter.',
    facts: [
      '1-month return: +0.5%',
      'Monthly sales: in line with estimates',
      'New model launch: next quarter',
      'Stock has traded in a narrow range for three months'
    ],
    outcome: -0.4,
    best: 'HOLD',
    ai: { conf: 65, why: 'Sales matched expectations and the launch is still a quarter away, so there is no near-term catalyst. The expected move is smaller than the trading fee.' },
    note: 'The stock moved sideways and closed slightly lower.'
  }
};

/*
  Two counterbalanced orders. Each order has one "error" scenario and nine others.

  For every participant, app.js picks an error round at random (see
  CONFIG.ERROR_ROUNDS, default rounds 3 to 6) and places the error scenario at
  that position. The other nine scenarios fill the remaining rounds in the order
  listed. The error group gets the wrong advice in that round; the control group
  sees the same scenario in the same position with correct advice, so both groups
  have identical "before" and "after" windows.

  The error scenarios (S4, S9) were chosen because they produce a large, visible
  loss when the wrong advice is followed. A Hold-best scenario would make the error
  almost invisible.
*/
const ORDERS = {
  A: { error: 'S4', others: ['S1', 'S2', 'S3', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10'] },
  B: { error: 'S9', others: ['S6', 'S7', 'S8', 'S10', 'S1', 'S2', 'S3', 'S4', 'S5'] }
};
