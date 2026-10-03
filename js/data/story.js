// Story scenes (spec §10.10): data the Story runner (js/career/story.js) plays and the dialogue box (js/ui/dialogue.js)
// shows. Story mode only. Lines follow the lore.md §7 voices: `diary` = the MC's narration, `you` = the MC speaking.
// Step kinds: say {who, text} · choice {opts: [{text, goto?, set?}]} · cut {dark?, bars?} (presentation mode until the
// next cut) · cam {to: 'you'} · walk {to: place id | 'home'} (you walk there; free, no days) · wait {ms} · set {flag, v} ·
// diary {text} · gazette {text} · goto {step} · end.

const SCENES = {
  /** First Story start: a dark cold open, then the map — you land at the airport and walk to your first home. */
  intro: {
    trigger: { on: 'start' },
    steps: [
      { k: 'cut', dark: true },
      { k: 'say', who: 'diary', text: 'Every academy on the mainland said no.' },
      { k: 'say', who: 'diary', text: 'One academy, on an island nobody visits, said yes.' },
      { k: 'say', who: 'diary', text: 'And the one I came for is already here.' },
      { k: 'cut', bars: true },
      { k: 'cam', to: 'you' },
      { k: 'say', who: 'you', text: 'Finally arrived.' },
      { k: 'walk', to: 'home' },
      { k: 'say', who: 'you', text: 'Home. For now.' },
      { k: 'end' }
    ]
  }
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
