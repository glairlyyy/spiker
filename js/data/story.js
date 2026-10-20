// Story scenes (spec §10.10): data the Story runner (js/career/story.js) plays and the dialogue box (js/ui/dialogue.js)
// shows. Story mode only. Lines follow the lore.md §7 voices: `diary` = the MC's narration, `you` = the MC speaking.
// Triggers: {on: 'pick', when: STORY_PICK key, off?: flag} (the first time you click that kind of place on the map) ·
// {on: 'start'} (Run.create) · {on: 'result', when?: 'won' | 'lost' …} (the first hub after one of your matches, before
// any lesson) · {on: 'hub', when: STORY_WHEN key, off?: flag} (each hub render with no scene, lock or event
// open; `off` = a flag that cancels it). Lines may hold {role} / {key} (your role, its key stat). Steps may carry an `id` for goto.
// Step kinds: say {who, text} · title {text} (a big centred line: a score, a place, a date) · choice {opts: [{text, goto?, set?}]} · cut {dark?, bars?} (presentation mode until the
// next cut) · cam {to: 'you'} · walk {to: place id | 'home'} (you walk there; free, no days) · wait {ms} · set {flag, v} ·
// diary {text} · gazette {text} · goto {step} · end.

const SCENES = {
  /** First Story start: a dark cold open, then the map — you land at the airport and walk to your first home. */
  intro: {
    trigger: { on: 'start' },
    after: { spot: 'acaGym' },
    steps: [
      { k: 'cut', dark: true },
      { k: 'say', who: 'diary', text: 'Fifteen to four. My last high-school match.' },
      { k: 'say', who: 'diary', text: 'Most of those points came straight off my hands.' },
      { k: 'say', who: 'diary', text: 'Every academy on the mainland watched the tape. Every one said no.' },
      { k: 'say', who: 'diary', text: 'One academy, on an island nobody visits, said yes.' },
      { k: 'say', who: 'diary', text: 'Haewon Bae. The one who did it. She signed with an island club the same week.' },
      { k: 'say', who: 'diary', text: "She's already here. So am I." },
      { k: 'cut', bars: true },
      { k: 'cam', to: 'you' },
      { k: 'say', who: 'you', text: 'Finally arrived.' },
      { k: 'walk', to: 'home' },
      { k: 'say', who: 'you', text: "I followed the Academy's directions. So this is my new place, huh?" },
      // the flatmate (lore §6): a normal first meeting, then one offer of a tour
      { k: 'say', who: 'senior', text: "Oh — you're the new one? They said Monday." },
      { k: 'say', who: 'you', text: 'Sorry. Is this the student flat?' },
      { k: 'say', who: 'senior', text: "It is. I'm Fern. Fern Kittisak. The second room's yours — the one with the window that sticks." },
      { k: 'say', who: 'senior', text: 'Last year of U21 for me. You?' },
      {
        k: 'choice',
        opts: [{ text: 'First year. I landed an hour ago.' }, { text: "Long enough to know why I'm here.", goto: 'why' }]
      },
      { k: 'say', who: 'senior', text: 'Mainland, then. Most of us are.', goto: 'rules' },
      { id: 'why', k: 'say', who: 'senior', text: 'Everyone says that on day one. Give it a month.' },
      {
        id: 'rules',
        k: 'say',
        who: 'senior',
        text: 'Kitchen is shared, hot water runs out at nine, the walls are thin. Those are the house rules.'
      },
      {
        k: 'say',
        who: 'senior',
        text: 'The Academy hands you a timetable and explains nothing. Want me to show you how the island actually works?'
      },
      { k: 'choice', opts: [{ text: 'Please.' }, { text: "I'll figure it out myself.", set: 'noTour' }] },
      {
        k: 'say',
        who: 'senior',
        text: 'One thing either way: week 4 is your first evaluation. The Academy grades you, and the grades decide who gets offers.'
      },
      // she points at the campus gym; week 1 stays on campus (City.fence) — the gym's card opens when the scene ends (`after`)
      { k: 'set', flag: 'campus' }, // City.fence: week 1 keeps to the campus
      { k: 'cam', to: 'acaGym' },
      {
        k: 'say',
        who: 'senior',
        text: "That's the Academy Gym, right there. Lv 1, a little of everything, and nobody laughs at first-years."
      },
      {
        k: 'say',
        who: 'senior',
        text: 'Stay on campus this week. Gym, rest, the grounds. Learn the routine before the island starts eating your days.'
      },
      { k: 'say', who: 'senior', text: 'Get some sleep. The island looks smaller after the first week.' },
      { k: 'say', who: 'diary', text: 'She talks like someone who has been here too long. I liked her anyway.' },
      { k: 'end' }
    ]
  },
  // ---- week 2: the fence lifts; the camera pulls back over the whole island ----
  explore: {
    trigger: { on: 'hub', when: 'week2' },
    steps: [
      { k: 'cam', to: 'island' },
      { k: 'say', who: 'senior', text: "First week done. You're still standing — better than most." },
      {
        k: 'say',
        who: 'senior',
        text: "That's the rest of it. Wei's gyms up north, the beach courts on the coast, the highlands out west."
      },
      { k: 'say', who: 'senior', text: 'Click anywhere to go. Trips cost days, and the far side of the island costs two or three.' },
      { k: 'say', who: 'senior', text: 'Go and look around. Just be back in shape for week 4.' },
      { k: 'cam', to: 'you' },
      { k: 'end' }
    ]
  },
  // ---- Fern's lessons (spec §10.10a): each once; never after "I'll figure it out myself". The gym lesson comes after your first
  // session; every other one the first time you click that kind of place on the map (owner, 2026-10-05) ----
  tutGym: {
    trigger: { on: 'hub', when: 'trained', off: 'noTour' },
    steps: [
      { k: 'say', who: 'senior', text: 'First session done? Good. Now the part nobody tells you.' },
      { k: 'say', who: 'senior', text: 'A {role} lives on {key}. The Academy grades it first, and so does every club.' },
      {
        k: 'say',
        who: 'senior',
        text: 'Each gym trains one stat hard and one a little. Use a gym often and it gets better for you: Lv 1 up to Lv 5.'
      },
      {
        k: 'say',
        who: 'senior',
        text: 'The Academy Gym next door is a bit of everything. Which means a bit of nothing. Fine for a slow day.'
      },
      { k: 'say', who: 'senior', text: 'Below 50 stamina a session can fail. Below 25 you can get hurt. Sleeping is training too.' },
      { k: 'end' }
    ]
  },
  tutClash: {
    trigger: { on: 'pick', when: 'clash', off: 'noTour' },
    steps: [
      { k: 'say', who: 'senior', text: 'Hear that? Street battle this week. Wei, Wu and Shu fight over the island one tile at a time.' },
      { k: 'say', who: 'senior', text: 'Win enough on a tile and it changes hands — the gyms on it too, and their prices.' },
      { k: 'say', who: 'senior', text: 'Join a side and that side likes you more. The other side remembers your face.' },
      { k: 'say', who: 'senior', text: "Or watch. It's cheaper, and you see both clubs play. That's how I spent most of last year." },
      { k: 'end' }
    ]
  },
  tutFactions: {
    trigger: { on: 'pick', when: 'faction', off: 'noTour' },
    steps: [
      { k: 'say', who: 'senior', text: "Offers will come, or they won't. Either way, know who's asking." },
      { k: 'say', who: 'senior', text: 'Wei runs the league and the paper. They sign you now and send the bill later.' },
      { k: 'say', who: 'senior', text: "Wu says it's pure strength, no tricks. They're honest — right up until you lose for them." },
      { k: 'say', who: 'senior', text: 'Shu lives up in the hills. They break you to build you. Some people like that.' },
      { k: 'say', who: 'senior', text: "The Outlaws bet on players, not for them. And if St. Gloria ever calls, ask who's paying." },
      { k: 'say', who: 'senior', text: "The Academy belongs to nobody. That's why it can't protect you either." },
      {
        k: 'say',
        who: 'senior',
        text: "And the names you'll hear all season: Haewon Bae at Wei Gold — the only mainland import on the island — Praew Siriwong at St. Gloria,"
      },
      { k: 'say', who: 'senior', text: 'Pond Thammasak up at Peak, Fai Wongsakul at Harbor. Your age. Nothing like your age.' },
      {
        k: 'say',
        who: 'senior',
        text: "Above them, last year's aces — one per faction. This is their final year. They'll want the Cup badly."
      },
      { k: 'end' }
    ]
  },
  // ---- the rival (lore §6): she doesn't remember the MC ----
  rivalMeet: {
    trigger: { on: 'hub', when: 'week3' },
    steps: [
      { k: 'cut', bars: true },
      {
        k: 'say',
        who: 'diary',
        text: 'Wei Gold were drilling on the street court when I walked past. I knew the swing before I saw the face.'
      },
      { k: 'say', who: 'diary', text: '15 – 4.' }, // (just a line in the box, no cut-in — owner, 2026-10-05)
      { k: 'say', who: 'rival', text: 'Hey — you, with the Academy bag. Have we played before? You look familiar.' },
      { k: 'choice', opts: [{ text: 'No.' }, { text: 'Fifteen to four.', goto: 'score', set: 'rivalTold' }] },
      { k: 'say', who: 'rival', text: 'Huh. My mistake. See you at the Cup — if you get that far.', goto: 'after' },
      { id: 'score', k: 'say', who: 'rival', text: "…Sorry. I don't keep score of every warm-up. Good luck at the Academy." },
      { id: 'after', k: 'say', who: 'diary', text: "She doesn't remember. Fine. Then I'll make her." },
      { k: 'set', flag: 'rivalMet' },
      { k: 'end' }
    ]
  },
  // ---- year 2 (spec §4.28, §4.31): the year-1 Cup's verdict, Fern's goodbye, the rematch ----
  // ---- the war (spec §4.34): the rival walks out of a fallen Gold (War.walkout sets run.war.walk) ----
  walkout: {
    trigger: { on: 'hub', when: 'walkout' },
    steps: [
      { k: 'cut', bars: true },
      {
        k: 'say',
        who: 'rumor',
        text: 'Word is Haewon Bae walked out of the Gold gym the night it fell. Took one bag. Signed nothing for the winners.'
      },
      { k: 'say', who: 'diary', text: "Of course she didn't go with them. She doesn't lose. She just leaves." },
      { k: 'say', who: 'diary', text: 'Fine. Wherever she lands, I know the way there.' },
      { k: 'end' }
    ]
  },
  y1Won: {
    trigger: { on: 'hub', when: 'year2Won' },
    steps: [
      { k: 'cut', bars: true },
      { k: 'say', who: 'diary', text: 'The Gazette ran my face for a day. Then hers, every day after.' },
      { k: 'say', who: 'rumor', text: "Word is Haewon Bae hasn't left the Wei gym since the Cup. Two sessions a day. Three." },
      { k: 'say', who: 'diary', text: "Good. Now she's chasing something too." },
      { k: 'end' }
    ]
  },
  y1Lost: {
    trigger: { on: 'hub', when: 'year2', off: 'beatRival' },
    steps: [
      { k: 'cut', dark: true },
      { k: 'title', text: 'Year 2' },
      { k: 'say', who: 'diary', text: 'I watched the Cup final from wherever they put the losers.' },
      { k: 'say', who: 'diary', text: 'She signed autographs after. She walked right past me.' },
      { k: 'say', who: 'diary', text: "She doesn't remember. I do. One more year of U21 — that's all I get." },
      { k: 'cut', bars: true },
      { k: 'end' }
    ]
  },
  fernBye: {
    trigger: { on: 'hub', when: 'year2' },
    steps: [
      { k: 'cut', bars: true },
      { k: 'say', who: 'senior', text: "Ferry's at six. Twenty-one, no club, no call. That's the U21s for you." },
      { k: 'say', who: 'senior', text: "Things nobody told me in my first year. I'm telling you, then I'm done telling people things." },
      { k: 'say', who: 'senior', text: "The Academy basement. Old scouting tapes — yours is in there. So is hers. Here's my key." },
      { k: 'say', who: 'senior', text: 'The lighthouse past the Wu docks. Where I went when I wanted to quit. Go at night.' },
      {
        k: 'say',
        who: 'senior',
        text: "Past the Thousand Steps there's an old national player. Turned everyone away. Me too. Try anyway."
      },
      { k: 'say', who: 'senior', text: 'The hot spring in the hills. Two days. The one luxury worth it.' },
      { k: 'say', who: 'senior', text: "And the roof of this flat. I'll write. Don't expect much — I hate writing." },
      { k: 'choice', opts: [{ text: 'Thank you, Fern.' }, { text: 'You could stay. Try again.', goto: 'stay' }] },
      { k: 'say', who: 'senior', text: "Don't. Just win something.", goto: 'gone' },
      { id: 'stay', k: 'say', who: 'senior', text: 'I tried again for a year. You watched. Go win something.' },
      { id: 'gone', k: 'set', flag: 'guideGone' },
      { k: 'set', flag: 'secrets' }, // the secret places appear (spec §4.31)
      { k: 'say', who: 'diary', text: 'Her room is empty by noon. The window still sticks.' },
      { k: 'end' }
    ]
  },
  rematchPre: {
    trigger: { on: 'hub', when: 'rematchWeek' },
    steps: [
      { k: 'cut', bars: true },
      { k: 'say', who: 'wei', text: 'Exhibition, week 14: Wei Dynasty · Gold host a challenger. The office expects a routine afternoon.' },
      { k: 'say', who: 'diary', text: 'Routine. I can work with routine.' },
      { k: 'end' }
    ]
  },
  rematchWon: {
    trigger: { on: 'result', when: 'rematchWon' },
    steps: [
      { k: 'cut', bars: true },
      { k: 'say', who: 'rival', text: '…Okay. Who coached you? Nobody blocks me like that by accident.' },
      { k: 'say', who: 'diary', text: "Still doesn't know my name. She'll learn it at the Cup." },
      { k: 'end' }
    ]
  },
  rematchLost: {
    trigger: { on: 'result', when: 'rematchLost' },
    steps: [
      { k: 'cut', bars: true },
      { k: 'say', who: 'rival', text: 'Good game. You were closer than the last lot.' },
      { k: 'say', who: 'diary', text: '"The last lot." Fourteen weeks to the Cup.' },
      { k: 'end' }
    ]
  },
  tutHouse: {
    trigger: { on: 'pick', when: 'home', off: 'noTour' },
    steps: [
      { k: 'say', who: 'senior', text: 'Payday is every 4 weeks. Home sends 500, food takes 120, this flat takes 150.' },
      { k: 'say', who: 'senior', text: 'Signed players move nearer their club, or somewhere nicer if they can pay. Me, then Change home.' },
      { k: 'say', who: 'senior', text: "Don't feel bad about leaving. Everyone does." },
      { k: 'end' }
    ]
  },
  tutEval: {
    trigger: { on: 'pick', when: 'venue', off: 'noTour' },
    steps: [
      { k: 'say', who: 'senior', text: "That's where they grade us. Every 4 weeks, one match, and the clubs watch it." },
      { k: 'say', who: 'senior', text: 'My first one, I sat on the bench the whole match. Nobody called after, either.' },
      { k: 'say', who: 'senior', text: 'Benched or not, it counts. You still learn from the stands.' },
      { k: 'end' }
    ]
  }
};
/** Drive & Pain's indirect cues (spec §4.30): the diary as a bar passes FEEL.cue[i] (one line picked per band), and at the top. */
const FEEL_LINES = {
  drive: [
    ["Something won't sit still in me.", 'I keep replaying the good touches. That never used to happen.'],
    ["I can't sleep. Not the bad kind.", 'My legs want the court before my alarm does.'],
    'Fired up. Every ball looks slow today.'
  ],
  pain: [
    ['It hurts more than it should.', 'I keep smiling at people. It keeps not working.'],
    ['I stopped reading the Gazette.', 'Some nights I can still hear the score.'],
    'Something in me snapped and set wrong.'
  ],
  mate: ["You're different lately. Don't stop.", "Whatever you're on, keep it."], // a teammate notices you Fired up
  // Sparks (spec §4.30): the line when a Fired up leaves one for good; Scars: the line the first match it shows (named then)
  traits: {
    clutch: 'Clutch. The last points used to shrink me. Now they slow down and wait.',
    secondWind: 'Second Wind. I go down and something in me just… refills. Rude, honestly.',
    voice: "Captain's Voice. I scored and the whole bench stood up. Nobody told them to.",
    ironWill: "Iron Will. They can boo. There's a floor in me now, and it doesn't move.",
    airImpact: 'Air Impact. The air split when I hit it. I heard it. Everyone heard it.',
    flashStep: "Flash Step. I jumped and the blocker was still looking at where I'd been.",
    godOfWar: 'God of War. Two kills and the third one is already decided. It feels like ink and fire.',
    glassAnkle: "Glass Ankle. It rolled on nothing. That's what broke: the ankle doesn't trust the floor.",
    shakyHands: "Shaky Hands. Late in the set I tossed it and my hand wasn't mine.",
    haunted: "Haunted. Haewon's squad walked out and I was fifteen to four again before the first whistle.",
    insomnia: 'Insomnia. I lie down and the court lies down with me. Nobody sleeps.',
    tunnel: 'Tunnel Vision. I only see the ball now. The rest of the court went somewhere.',
    bitter: 'Bitter. Someone said good game. I heard the other thing they meant.',
    enlight: 'Enlightenment. It broke, and what came out was clear. Everything is slower. Everything is mine.',
    eyeStorm: 'Eye of the Storm. They went on a run and I felt nothing. Not calm. Nothing.',
    spite: "Spite. Haewon's squad. My body remembered before I did, and it played better for it.",
    deadCalm: 'Dead Calm. Everyone around me was coming apart. I wasn’t. I should be worried about that.'
  }
};
/** The secret places' lines (spec §4.31). Fern's letters by what you lack (Secret.letter); the hermit; the tapes; the night court. */
const SECRET_LINES = {
  letters: {
    habits: "You haven't been to the basement, have you. Watch her tape. Watch it till it stops hurting. — F.",
    pain: 'You sound like I did. The lighthouse. Go at night. Decide what you keep. — F.',
    drive: 'Stop training for one day. Eat with someone. Win something small. It counts. — F.',
    stat: "Your {stat} is the hole they'll hit. Everyone on the island can see it but you. — F.",
    fine: "Nothing to tell you. That's new. Don't get used to it. — F."
  },
  hermitNo: "He looked at my {stat} and went back to sweeping. 'Not yet.' He wants {bar}.",
  hermitYes: "He made me do it until I couldn't, then once more. Then he showed me: {move}.",
  hermitDone: 'He had nothing left to teach me. He said so, and he looked almost pleased.',
  moves: ['Ghost Feint', 'Iron Wall', 'Sky Stair', 'Silent Spike', 'Last Breath Dig'],
  tapeFirst: 'Fifteen to four, frame by frame. I made myself watch all of it.',
  tapeDone: "There's nothing left on her tape I haven't seen.",
  lightLet: 'I left it at the lighthouse. Most of it.',
  lightSharp: "I didn't leave anything. I sharpened it.",
  midnightTold: "Outlaw: “You fight like you've got a grudge. There's a court under the overpass after dark. The aces think nobody knows.”",
  scoutTold: 'Wei office: The retired scout at the Wei café has asked about you. He rarely asks about anyone.'
};
/** The two endings of a Story run (spec §4.28), shown on the end screen: diary lines. `remember`: you beat her squad in the year-2 Cup. */
const ENDINGS = {
  true: [
    'The national squad list went up on the Academy board. My name, then hers, then the aces.',
    'The International Cup. Everyone I chased, on my side of the net.'
  ],
  remember: '"Fifteen to four," she said at the airport. "You were the one at the net." She remembers now.',
  spite: ['The national squad list went up without me. Her name was second.', "They fly out Monday. I'm not done. Not even close."]
};
/**
 * A new squad introduces itself (owner, 2026-10-05; Story.meetSteps): the opening diary line, one line per teammate by their
 * first trait (the n-th teammate with the same trait gets the n-th line), and the closing diary line. Hints, never the trait's name.
 */
const MEET = {
  academy: 'The Academy squad. Five strangers who got stuck with me, same as I got stuck with them.',
  club: '{club}. New shirt, new faces.',
  close: "Names first. The rest I'll learn on court.",
  plain: ['Hey. Welcome.', 'Good to meet you.'],
  trait: {
    proud: ["I don't come second. Remember that.", "Try to keep up. Most people here don't."],
    loyal: ["You're one of us now. That means something here.", 'Stick with the squad and the squad sticks with you.'],
    jealous: ["New faces always get the attention. We'll see if it lasts.", 'Funny. Nobody gave me a welcome like this.'],
    warm: ['Good to have you. Shout if you need anything.', 'Welcome! We eat together after practice — come.'],
    cynical: ["Don't unpack yet. People don't last long here.", "Another one. Let's see how long this lasts."],
    reckless: ["If it's in the air, it's mine. You'll get used to it.", "Fast and hard, that's how I play. Keep up."],
    calculating: ["I've read your numbers. We'll see if they mean anything.", "Show me what you're good for and I'll use it."],
    steady: ['Practice is at seven. Every day.', "Do the work and we'll get along fine."]
  },
  // the presence beat (spec §4.35): the first meeting with an S/A player — voice `diary`, never the letter; {n} = their first name
  presence: [
    "Something about her. I don't know what yet.",
    "{n}. Something about her. I don't know what yet.",
    'Something about {n}. Not the numbers. Something else.',
    '{n} walked in and the air changed. I hate that I noticed.'
  ]
};
/** Your flatmate in the Student flat (lore §6): the story's guide for the first weeks. A person for the box's portrait and the map. */
const GUIDE = {
  id: 'senior',
  name: 'Fern Kittisak',
  short: 'Fern',
  hair: '#1e7f86',
  look: { hs: 6, skin: '#eec39a', eyeC: '#5b3a1e', eye: 'sharp', acc: 'band', accC: '#10163a', hgt: 1 },
  team: { color: '#e8dfc8' } // the Academy hoodie
};
/** Name plates for the lore.md §7 voices (`diary` has none: narration). */
const STORY_VOICES = {
  registrar: 'Registrar',
  wei: 'Wei office',
  wu: 'Wu crew',
  shu: 'Shu elder',
  outlaw: 'Outlaw',
  gloria: 'St. Gloria agent',
  villager: 'Villager',
  rumor: 'Word on the street'
};
/**
 * The war's lines (spec §4.34). fall: the Gazette's news line when a unit is destroyed (voice: wei — the office reports every
 * fall, keyed by the winner's region); rallied: a unit that held its HQ (voice: rumor); freed: your club is gone (voice: diary).
 */
const WAR_LINES = {
  fall: {
    wei: 'The office confirms {loser} is dissolved. Its grounds return to proper administration under {winner}.',
    wu: 'The office records that {loser} has been overrun by Wu crews. {winner} holds its grounds until order is restored.',
    shu: 'The office records that {loser} has fallen to the highlanders. {winner} holds its grounds; the office was not consulted.'
  },
  rallied: 'Word is {unit} held its HQ. Its crews were back on the street by morning.',
  freed: 'My club doesn’t exist any more. Nobody’s player again — I’ve been that before.'
};
