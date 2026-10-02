// Random training-week events: a short scene with two choices. Voice (lore.md §7): `diary` — the MC, first person.
// Effects (fx) are data: [key, value] pairs applied by career/events.js.
//   keys: power/def/speed/jump/wit/lead/sta/mood/sp/fans, 'main' (the stat you trained last),
//         'bondMate' / 'bondCap' / 'bondAll' (bond changes), and ['chance', p, [fx…]] for a gamble.
// Text placeholders: {mate} = a random teammate, {cap} = the captain. `need` names a condition.

const EVENTS = [
  {
    id: 'late',
    title: 'Lights still on',
    text: "Everyone went home. The gym lights didn't. Neither did I.",
    a: [
      'Keep going',
      [
        ['main', 6],
        ['sta', -15]
      ]
    ],
    b: ['Go home and sleep', [['mood', 1]]]
  },
  {
    id: 'capadvice',
    need: 'notCap',
    title: 'The captain wants my opinion',
    text: '{cap} asked what I think of the lineup. First time anyone here asked me anything.',
    a: ['Speak up in the huddle', [['lead', 8]]],
    b: ['Back their call', [['bondCap', 10]]]
  },
  {
    id: 'rival',
    title: "Someone's filming",
    text: 'Somebody from another faction is filming my spikes from the stands. Flattering. Annoying.',
    a: [
      'Show off',
      [
        ['power', 5],
        ['chance', 0.2, [['mood', -1]]]
      ]
    ],
    b: ['Study their team instead', [['wit', 0.05]]]
  },
  {
    id: 'shoulder',
    title: 'Sore shoulder',
    text: 'My hitting shoulder is complaining again. It can get in line.',
    a: ['Ice it', [['sta', -10]]],
    b: ['Play through it', [['chance', 0.3, [['power', -5]]]]]
  },
  {
    id: 'dinner',
    title: 'Team dinner',
    text: "The squad is going out for hot pot. I wasn't sure I was invited until I was.",
    a: ['Go with everyone', [['bondAll', 5]]],
    b: ['Early night', [['sta', 20]]]
  },
  {
    id: 'fanletter',
    title: 'A letter',
    text: 'A kid from the youth courts wrote me a letter. Spelled my name wrong. Still counts.',
    a: [
      'Write back',
      [
        ['fans', 200],
        ['mood', 1]
      ]
    ],
    b: ['Pin it on your locker', [['sp', 15]]]
  },
  {
    id: 'film',
    title: 'Film before training',
    text: 'Coach offers an hour of tape before practice. Mostly of other people doing it right.',
    a: ['Study the opponents', [['wit', 0.06]]],
    b: ['Study your own form', [['main', 4]]]
  },
  {
    id: 'reps',
    title: 'Extra reps',
    text: '{mate} wants to stay late and run drills. Fine. Someone has to keep up with me.',
    a: [
      'Stay and help',
      [
        ['bondMate', 12],
        ['sta', -10]
      ]
    ],
    b: ['Rest instead', [['sta', 10]]]
  },
  {
    id: 'sand',
    title: 'The gym flooded',
    text: "The gym is under water, so it's the sand courts today. The locals act like they own them. They do.",
    a: [
      'Sand sprints',
      [
        ['speed', 4],
        ['jump', 3],
        ['sta', -15]
      ]
    ],
    b: ['Take the day', [['sta', 15]]]
  },
  {
    id: 'tv',
    title: 'Gazette interview',
    text: "A Gazette stringer wants a quote about the Cup. Whatever I say, they'll print what they like.",
    a: [
      '"We will win it."',
      [
        ['fans', 400],
        ['chance', 0.3, [['mood', -1]]]
      ]
    ],
    b: ['Stay humble', [['lead', 4]]]
  },
  {
    id: 'stuck',
    title: 'Nothing clicks',
    text: 'Nothing is working this week. Not my hands, not my legs, not my temper.',
    a: [
      'Change your routine',
      [
        [
          'chance',
          0.5,
          [
            ['mood', 1],
            ['sp', 20]
          ]
        ]
      ]
    ],
    b: [
      'Talk to the captain',
      [
        ['mood', 1],
        ['bondCap', 5]
      ]
    ]
  },
  {
    id: 'pro',
    title: 'An old national-team player',
    text: "A retired national-team player dropped by practice. Everyone went quiet. I didn't.",
    a: ['Ask about jumping', [['jump', 5]]],
    b: ['Ask about reading plays', [['wit', 0.05]]]
  },
  {
    id: 'cramp',
    title: 'Calves',
    text: 'My calves locked up in warm-up. Great timing, body.',
    a: [
      'Stretch it out properly',
      [
        ['sta', -5],
        ['def', 2]
      ]
    ],
    b: ['Ignore it', [['chance', 0.4, [['speed', -4]]]]]
  },
  {
    id: 'arcade',
    title: 'Arcade night',
    text: "{mate} wants to drag me to the arcade. Apparently that's what friends do here.",
    a: [
      'Go',
      [
        ['mood', 1],
        ['bondMate', 8],
        ['sta', 5]
      ]
    ],
    b: [
      'Train alone',
      [
        ['main', 3],
        ['sta', -10]
      ]
    ]
  },
  {
    id: 'streak',
    title: "Can't miss",
    text: 'Every ball I touched went in today. I should be suspicious.',
    a: [
      'Keep swinging',
      [
        ['power', 3],
        ['sp', 15]
      ]
    ],
    b: [
      'Share the ball',
      [
        ['bondAll', 3],
        ['lead', 3]
      ]
    ]
  },
  {
    id: 'notebook',
    title: "Someone's notebook",
    text: '{mate} left a notebook full of opponent tendencies on the bench. Very careless. Very useful.',
    a: ['Borrow it', [['wit', 0.08]]],
    b: ['Give it back', [['bondMate', 8]]]
  },
  {
    id: 'weights',
    title: "The weight room's fixed",
    text: 'Somebody finally fixed the weight room. Only took the whole season.',
    a: [
      'Heavy lifts',
      [
        ['power', 4],
        ['def', 2],
        ['sta', -15]
      ]
    ],
    b: [
      'Mobility work',
      [
        ['speed', 3],
        ['sta', -5]
      ]
    ]
  },
  {
    id: 'argue',
    title: 'Shouting',
    text: 'Two of my teammates are yelling about a missed block. Neither of them was the one who missed it.',
    a: [
      'Step in',
      [
        ['lead', 6],
        ['chance', 0.3, [['mood', -1]]]
      ]
    ],
    b: ['Stay out of it', [['sta', 5]]]
  },
  {
    id: 'breakfast',
    title: 'Big breakfast',
    text: "Somebody's mum cooked for the whole squad. I ate like a refugee. Fitting.",
    a: ['Eat it all', [['sta', 15]]],
    b: ['Light meal and a run', [['speed', 2]]]
  },
  {
    id: 'rain2',
    need: 'tired',
    title: 'Concrete legs',
    text: "My legs feel like concrete this morning. Training doesn't care.",
    a: [
      'Push through the session',
      [
        ['main', 3],
        ['sta', -10],
        ['chance', 0.35, [['mood', -1]]]
      ]
    ],
    b: ['Ice bath and stretching', [['sta', 25]]]
  },
  {
    id: 'scout',
    need: 'late',
    title: 'A scout in the stands',
    text: "Word is a mainland scout is watching practice. Everyone's suddenly a hero.",
    a: [
      'Go all out',
      [
        ['main', 4],
        ['sta', -15],
        ['fans', 300]
      ]
    ],
    b: [
      'Play it cool',
      [
        ['wit', 0.04],
        ['mood', 1]
      ]
    ]
  },
  {
    id: 'rivalmsg',
    title: 'A message',
    text: '"See you at the Cup. Don\'t disappoint me." I know who sent it. I came all this way for it.',
    a: [
      'Fire back',
      [
        ['power', 3],
        ['mood', 1]
      ]
    ],
    b: ['Ignore it', [['wit', 0.04]]]
  },
  {
    id: 'kohai',
    title: 'A newcomer asks',
    text: 'A newcomer asked me to teach them my serve. A month ago that was me.',
    a: [
      'Teach them',
      [
        ['lead', 6],
        ['sta', -8]
      ]
    ],
    b: ['Too busy', [['main', 2]]]
  },
  {
    id: 'exam',
    title: 'Academy coursework',
    text: "The Academy wants coursework, and my grades are slipping. Apparently volleyball isn't enough for them.",
    a: [
      'Study hard',
      [
        ['wit', 0.07],
        ['sta', -10],
        ['sp', -10]
      ]
    ],
    b: [
      'Cram the night before',
      [
        ['chance', 0.5, [['mood', -1]]],
        ['main', 2]
      ]
    ]
  },
  {
    id: 'injurymate',
    title: 'An ankle',
    text: '{mate} rolled an ankle at practice. The court got very quiet.',
    a: ['Get them to the physio', [['bondMate', 10]]],
    b: [
      'Keep training',
      [
        ['main', 3],
        ['bondMate', -5]
      ]
    ]
  },
  {
    id: 'captalk',
    need: 'isCap',
    title: 'Flat',
    text: "The squad is flat today, and somehow they're all looking at me.",
    a: [
      'Give a speech',
      [
        ['lead', 5],
        ['bondAll', 4]
      ]
    ],
    b: [
      'Lead by example',
      [
        ['main', 3],
        ['sta', -10]
      ]
    ]
  },
  {
    id: 'starpress',
    need: 'star',
    title: 'A feature',
    text: 'A magazine wants a feature on "the new star". Funny. Last month nobody knew my name.',
    a: [
      'Do the photo shoot',
      [
        ['fans', 600],
        ['sta', -5]
      ]
    ],
    b: ['Decline — train instead', [['main', 3]]]
  },
  {
    id: 'slumpd',
    need: 'low',
    title: 'Still thinking about it',
    text: "I can't stop replaying last week. It doesn't get better on replay.",
    a: ['Call home', [['mood', 1]]],
    b: [
      'Train it out',
      [
        ['chance', 0.5, [['mood', 1]]],
        ['main', 2],
        ['sta', -10]
      ]
    ]
  },
  {
    id: 'oldball',
    title: 'My first ball',
    text: "Found my first volleyball at the bottom of my bag. It's been everywhere I've been rejected.",
    a: [
      'Take it home',
      [
        ['mood', 1],
        ['lead', 2]
      ]
    ],
    b: ['Give it to a kid', [['fans', 250]]]
  },
  {
    id: 'summer',
    need: 'early',
    title: 'A beach 2v2',
    text: 'A beach 2v2 down the coast needs one more player. Sand, sun, strangers.',
    a: [
      'Enter',
      [
        ['speed', 3],
        ['jump', 2],
        ['sta', -15],
        ['chance', 0.4, [['fans', 300]]]
      ]
    ],
    b: ['Skip it', [['sta', 10]]]
  },
  {
    id: 'coachx',
    title: 'Weak link',
    text: "Coach says I'm the weak link on defense. Out loud. In front of everyone.",
    a: [
      'Extra defense reps',
      [
        ['def', 4],
        ['sta', -12]
      ]
    ],
    b: [
      'Argue back',
      [
        ['lead', 3],
        ['chance', 0.5, [['mood', -1]]]
      ]
    ]
  },
  {
    id: 'setterduo',
    title: 'Tempo',
    text: "{mate} wants to drill tempo after hours. We're either going to click or kill each other.",
    a: [
      'Drill until it clicks',
      [
        ['bondMate', 10],
        ['wit', 0.03],
        ['sta', -10]
      ]
    ],
    b: ['Next time', [['sta', 5]]]
  },
  {
    id: 'festival',
    title: 'Food stall',
    text: "The club is running a food stall at the market. They've put me on the grill.",
    a: [
      'Work the stall',
      [
        ['bondAll', 4],
        ['fans', 150]
      ]
    ],
    b: [
      'Sneak off to train',
      [
        ['main', 3],
        ['bondAll', -2]
      ]
    ]
  },
  {
    id: 'video',
    title: 'Gone around',
    text: 'Someone posted my best spike. Half the island has seen it. The other half will.',
    a: [
      'Share it',
      [
        ['fans', 500],
        ['chance', 0.3, [['mood', -1]]]
      ]
    ],
    b: ['Stay focused', [['mood', 1]]]
  },
  {
    id: 'insomnia',
    title: "Can't sleep",
    text: 'Match nerves. 3 a.m. Ceiling.',
    a: [
      'Night run',
      [
        ['speed', 2],
        ['sta', -8]
      ]
    ],
    b: [
      'Meditate',
      [
        ['wit', 0.04],
        ['sta', 5]
      ]
    ]
  },
  {
    id: 'noise',
    title: 'Crowd noise',
    text: "Coach is blasting stadium noise through the speakers. I can't hear myself think. That's the point.",
    a: [
      'Embrace it',
      [
        ['mood', 1],
        ['wit', 0.03]
      ]
    ],
    b: ['Earplugs and focus', [['def', 3]]]
  }
];
