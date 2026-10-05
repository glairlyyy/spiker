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
      { k: 'title', text: '25 – 4' },
      { k: 'say', who: 'diary', text: 'Twenty-five to four. My last high-school match.' },
      { k: 'say', who: 'diary', text: 'Most of those points came straight off my hands.' },
      { k: 'say', who: 'diary', text: 'Every academy on the mainland watched the tape. Every one said no.' },
      { k: 'say', who: 'diary', text: 'One academy, on an island nobody visits, said yes.' },
      { k: 'say', who: 'diary', text: 'And the one who did it is already here.' },
      { k: 'cut', bars: true },
      { k: 'cam', to: 'you' },
      { k: 'say', who: 'you', text: 'Finally arrived.' },
      { k: 'walk', to: 'home' },
      { k: 'say', who: 'you', text: 'Home. For now.' },
      // the flatmate (lore §6): a normal first meeting, then one offer of a tour
      { k: 'say', who: 'senior', text: "Oh — you're the new one? They said Monday." },
      { k: 'say', who: 'you', text: 'Sorry. Is this the student flat?' },
      { k: 'say', who: 'senior', text: "It is. I'm Kaede. Sanada Kaede. The second room's yours — the one with the window that sticks." },
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
  // ---- Kaede's lessons (spec §10.10a): each once; never after "I'll figure it out myself". The gym lesson comes after your first
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
      { k: 'say', who: 'senior', text: "And the names you'll hear all season: Tachibana Sae at Wei Gold, Kisaragi Reina at St. Gloria," },
      { k: 'say', who: 'senior', text: 'Kamiya Ren up at Peak, Oboro Taiga at Harbor. Your age. Nothing like your age.' },
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
      { k: 'cut', dark: true },
      { k: 'title', text: '25 – 4' },
      { k: 'cut', bars: true },
      { k: 'say', who: 'rival', text: 'Hey — you, with the Academy bag. Have we played before? You look familiar.' },
      { k: 'choice', opts: [{ text: 'No.' }, { text: 'Twenty-five to four.', goto: 'score', set: 'rivalTold' }] },
      { k: 'say', who: 'rival', text: 'Huh. My mistake. See you at the Cup — if you get that far.', goto: 'after' },
      { id: 'score', k: 'say', who: 'rival', text: "…Sorry. I don't keep score of every warm-up. Good luck at the Academy." },
      { id: 'after', k: 'say', who: 'diary', text: "She doesn't remember. Fine. Then I'll make her." },
      { k: 'set', flag: 'rivalMet' },
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
/** Your flatmate in the Student flat (lore §6): the story's guide for the first weeks. A person for the box's portrait and the map. */
const GUIDE = {
  id: 'senior',
  name: 'Sanada Kaede',
  short: 'Kaede',
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
