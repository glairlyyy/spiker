// Ball-call lines players shout when they feel confident (high stats, good mood, or in the zone).

const CALLS = {
  back: ['Back row! Here!', 'Pipe! Pipe!', 'Leave it high — mine!', 'Back set, trust me!'],
  long: ['Long one — back line!', 'Send it deep, I got it!', 'From the back line — trust me!', 'High and deep — mine!'],
  set: ['Set me!', 'Up here!', 'Give me the ball!', 'Bring it!'],
  zone: ["I'm on fire!", 'Keep feeding me!', 'One more!'],
  decoy: ['Here!', 'Me!', 'Open!'],
  recv: ['Mine!', 'I got it!', 'Leave it!'],
  dig: ['Got it!', 'Up!', "Don't let it drop!"]
};
/** Pick a line without touching the random sequence (varies by player number and rally count). */
const callLine = (kind, p, m) => CALLS[kind][(p.num + ((m && m.pts[0] + m.pts[1]) || 0)) % CALLS[kind].length];
/** How confident a player feels right now: attacking stats, mood and the team being in the zone. */
const confidence = (p, m, side) =>
  (p.power + p.jump) / 2 + ((m && m.mood[p.id]) || 0) * 15 + (m && m.zone[side] ? 12 : 0) + (p.star ? 5 : 0) + (p.op ? 8 : 0);

// ---- personalities and scene / chatter lines (shonen moments, engine/hype.js) ----
/** Each player has a fixed personality (from a name hash) that picks their lines. */
const PERS = ['hot', 'cool', 'cocky', 'shy', 'leader'];
const PERS_NAME = { hot: 'Hot-blooded', cool: 'Cool-headed', cocky: 'Cocky', shy: 'Quiet', leader: 'Leader' };
/** {sig} = signature element spike, {mate} = teammate's first name, {opp} = opponent's first name. */
const LINES = {
  ask: {
    hot: ['Bring it to me!!', 'Give it here — I’ll smash it!', 'Mine! Leave it to me!'],
    cool: ['Set me. I’ll finish it.', 'Toss it up. That’s all.', 'Leave the rest to me.'],
    cocky: ['Just set me, I’m not missing.', 'Watch this.', 'Too easy — give it here.'],
    shy: ['I… I can hit this one!', 'Please — set me!', 'Just this once… me!'],
    leader: ['Everyone — one more! Set me!', 'I’ll carry this one!', 'Follow me — ball here!']
  },
  askEl: {
    hot: ['{sig}!! Burn it down!', 'Here comes {sig}!!', 'It’s full — {sig}!!'],
    cool: ['…{sig}.', 'Time for {sig}.', 'This ends with {sig}.'],
    cocky: ['Ready for {sig}? No? Too bad.', 'Say goodbye — {sig}!', 'You can’t stop {sig}.'],
    shy: ['Please work… {sig}!', 'I can feel it — {sig}!', 'Now… {sig}!'],
    leader: ['For all of us — {sig}!', 'Watch my back — {sig}!', 'Team, here we go — {sig}!']
  },
  setgo: {
    hot: ['Go, {mate}!!', 'Take it, {mate}!', 'Smash it!'],
    cool: ['…Go.', 'Perfect height. Hit it.', 'It’s yours, {mate}.'],
    cocky: ['Best set of your life. Don’t waste it.', 'Just swing, {mate}.', 'Easy mode, go.'],
    shy: ['{mate}, go!', 'I believe in you!', 'Please, {mate}!'],
    leader: ['Finish it, {mate}!', 'Trust it — go!', 'All yours, {mate}!']
  },
  wall: {
    hot: ['Not getting past me!!', 'Block it! Block it!', 'Come on then!'],
    cool: ['I’ve read it.', 'Straight line. Close it.', 'Two up — now.'],
    cocky: ['That again? Please.', 'I’ll swat that down.', 'Go ahead, try me.'],
    shy: ['I have to stop it…!', 'Jump… jump!', 'Please be here…!'],
    leader: ['Read it! Two up!', 'Close the line!', 'Hold the wall — together!']
  },
  scored: {
    hot: ['YEAHHH!!', 'That’s how it’s done!!', 'Again! Again!'],
    cool: ['Next.', 'As planned.', 'One more.'],
    cocky: ['Told you.', 'Too slow!', 'Is that all you’ve got?'],
    shy: ['I… did it?', 'It went in!', 'Yes…!'],
    leader: ['Great set! Keep going!', 'That’s our rhythm!', 'Stay locked in!']
  },
  mate: {
    hot: ['Nice one, {mate}!!', 'Monster!', 'That’s it!!'],
    cool: ['Clean.', 'Good hit.', 'Nice.'],
    cocky: ['Not bad, {mate}.', 'Almost as good as me.', 'Ha, nice.'],
    shy: ['Amazing, {mate}!', 'So cool…', 'Nice!'],
    leader: ['That’s it, {mate}!', 'Keep it rolling!', 'Beautiful!']
  },
  stuffed: {
    hot: ['Again! I’ll break through next time!', 'Damn it!', 'One more time!'],
    cool: ['…I see.', 'Adjusting.', 'Noted.'],
    cocky: ['Lucky block.', 'Won’t happen twice.', 'Tch.'],
    shy: ['Sorry…!', 'I’ll do better…', 'Ah…'],
    leader: ['My bad — next one’s mine!', 'Heads up, we’re fine!', 'Reset, reset!']
  },
  denied: {
    hot: ['Not in my house!!', 'DENIED!!', 'Try that again!'],
    cool: ['Read you.', 'Too predictable.', 'Closed.'],
    cocky: ['Is that all?', 'Nope.', 'Go home.'],
    shy: ['I stopped it…!', 'I got it!', 'Did I…?'],
    leader: ['Wall holds!', 'That’s our block!', 'Nothing gets through!']
  },
  oops: {
    hot: ['Argh — my fault!', 'Next one, I swear!', 'Damn!'],
    cool: ['Mistake. Moving on.', 'Won’t repeat it.', '…'],
    cocky: ['Whatever, I’ll get it back.', 'Warm-up swing.', 'Ugh.'],
    shy: ['Sorry, sorry!', 'I messed up…', 'Ah… sorry!'],
    leader: ['On me. Next one.', 'Shake it off!', 'Reset — we’re good!']
  },
  cheer: {
    hot: ['Don’t look down!', 'Let’s go, let’s go!', 'Fight!'],
    cool: ['Breathe.', 'We get the next one.', 'Stay calm.'],
    cocky: ['Relax, I’ve got this.', 'We’re still better.', 'Chill.'],
    shy: ['We can do it…!', 'Don’t give up!', 'Next one…!'],
    leader: ['Heads up! One point at a time!', 'Together — next ball!', 'We’re not done!']
  },
  read: {
    hot: ['I read you!!', 'Saw that coming a mile away!!', 'Not this time!!'],
    cool: ['I read you.', '…Cross. Closed.', 'Your shoulder told me.'],
    cocky: ['Read you like a book.', 'Too obvious.', 'I knew it. Always cross.'],
    shy: ['I… I read it!', 'I saw it…!', 'This time I know…!'],
    leader: ['Read it — shut it down!', 'I read you — wall, now!', 'Got you!']
  },
  cover: {
    hot: ['I’ve got the line!!', 'Anything past you is mine!', 'Send it my way!'],
    cool: ['Line’s covered.', 'I’ll take what gets through.', 'Behind you.'],
    cocky: ['Let it through, I’ll dig it.', 'Line’s mine, relax.', 'I’m not moving.'],
    shy: ['I’ll try the line…!', 'Behind you…!', 'I’m here!'],
    leader: ['Line’s covered — trust me!', 'Block cross, I’ve got the rest!', 'Back row, set!']
  },
  dare: {
    hot: ['Then I’ll smash right through you!!', 'Bring the wall — I’ll break it!', 'Try and stop me!!'],
    cool: ['Read it? Then read this.', 'Doesn’t matter.', 'Knowing isn’t stopping.'],
    cocky: ['Cute. Watch this.', 'Knowing won’t save you.', 'Go ahead, guess.'],
    shy: ['I’ll… I’ll hit it anyway!', 'Please get through…!', 'Here goes…!'],
    leader: ['Straight through them!', 'We break this wall!', 'Behind me, team!']
  },
  loose: {
    hot: ['LOOSE BALL!!', 'GET IT!!', 'It’s alive — GO!!'],
    cool: ['Loose ball — cover!', 'Off the hands — chase!', 'Still alive!'],
    cocky: ['Got it, got it!', 'Mine — move!', 'Easy, I got it!'],
    shy: ['B-ball!', 'It’s coming…!', 'Help…!'],
    leader: ['Loose ball! Cover!', 'Chase it — everyone!', 'Don’t let it drop!']
  },
  brk: {
    hot: ['BREAK!!', 'It broke through — GET IT!!', 'BREAK! BREAK!'],
    cool: ['Break — cover.', 'Through the block.', 'Break.'],
    cocky: ['Tch — break!', 'Through?! Get it!', 'Break!'],
    shy: ['It went through…!', 'Break…!', 'Aaah!'],
    leader: ['BREAK! Cover!', 'It’s through — go!', 'Break — get under it!']
  },
  touch: {
    hot: ['One touch!!', 'Got a finger on it!', 'Touch!!'],
    cool: ['One touch.', 'Touched it.', 'Soft touch — go.'],
    cocky: ['Touched it, obviously.', 'One touch — easy.', 'Got it.'],
    shy: ['I touched it…!', 'One touch…!', 'Just barely…!'],
    leader: ['One touch! Chance ball!', 'Touch — counter!', 'One touch — set up!']
  },
  save: {
    hot: ['NOT DROPPING!!', 'Nothing hits this floor!!', 'MINE!!'],
    cool: ['…Up.', 'Not today.', 'Got it.'],
    cocky: ['Too easy.', 'You thought?', 'Nice try.'],
    shy: ['I reached it…!', 'Up…!', 'Please go up…!'],
    leader: ['Keep it alive!', 'Up! Counter!', 'Still ours!']
  },
  stop: {
    hot: ['One more stop!!', 'Block this and we win!!', 'Shut it down!!'],
    cool: ['One stop. That’s all.', 'Close it out.', 'Last one.'],
    cocky: ['Game’s over, you just don’t know it.', 'Last swing, make it count.', 'Bye.'],
    shy: ['Just one more…!', 'We can win…!', 'Stop this one…!'],
    leader: ['One more stop — together!', 'Hold the wall — we win this!', 'Finish it, team!']
  },
  kiai: {
    hot: ['HAAAAAAA!!', 'THROUGH YOU!!', 'BREAK!!!'],
    cool: ['…Through.', 'Now.', '…!'],
    cocky: ['Break it!', 'Too weak!', 'Move!'],
    shy: ['Nnngh—!!', 'Please—!!', 'Haa—!!'],
    leader: ['THROUGH!!', 'For the team!!', 'Break it down!!']
  },
  stunned: {
    hot: ['What?!', 'That was…!', 'Seriously?!'],
    cool: ['…Too fast.', 'I didn’t even see it.', '…Impressive.'],
    cocky: ['Okay… that was good.', 'Fine. You win that one.', 'Huh.'],
    shy: ['Scary…', 'I couldn’t move…', 'Wow…'],
    leader: ['Shake it off — we adjust!', 'Next one we stop!', 'Heads up!']
  }
};
