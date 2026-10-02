// Ball-call lines players shout when they feel confident (high stats, good mood, or in the zone).

const CALLS = {
  back: ['Back row! Here!', 'Pipe! Pipe!', 'Leave it high — mine!', 'Back set, trust me!'],
  long: ['Long one — back line!', 'Send it deep, I got it!', 'From the back line — trust me!', 'High and deep — mine!'],
  set: ['Set me!', 'Up here!', 'Give me the ball!', 'Bring it!'],
  zone: ["I'm on fire!", 'Keep feeding me!', 'One more!'],
  decoy: ['Here!', 'Me!', 'Open!'],
  // ego set calls (T-068, street voice): a hitter who wants it all demands the set
  ego: [
    'Give it here — I got this!',
    'Set ME. Now!',
    'Quit spreading it — ball to me!',
    'Who finishes this? Me!',
    'Stop looking at them — set me!'
  ],
  // relationships (T-066, street voice): a setter feeds an ally in the clutch / freezes out someone they can't stand
  trust: ["Yours. Don't waste it.", "You're up — finish it!", 'Trust you. Put it away.'],
  freeze: ['Not you. Not now.', 'Somebody else — go!', 'Not feeding you this one.'],
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
/** {sig} = signature element spike, {mate} = teammate's first name, {opp} = opponent's first name. */
/** The coach's line at a substitution ({out} / {in} = shirt numbers), picked by hash — never by R(). */
const SUBLINES = [
  "Subbing #{out} for #{in}. Don't let us down.",
  "#{out}, sit. #{in}, you're up — earn it.",
  '#{in} in for #{out}. Same plan, fresher legs.',
  "#{out}, come off. #{in} — show me why you're here."
];
const LINES = {
  ask: {
    hot: [
      'Bring it to me!!',
      'Give it here — I’ll smash it!',
      'Mine! Leave it to me!',
      'I’m open — throw it!!',
      'Right here, right now!',
      'Don’t think, just set me!!'
    ],
    cool: [
      'Set me. I’ll finish it.',
      'Toss it up. That’s all.',
      'Leave the rest to me.',
      'I’ll handle it.',
      'Give me the ball. Nothing else.',
      'One touch is all I need.'
    ],
    cocky: [
      'Just set me, I’m not missing.',
      'Watch this.',
      'Too easy — give it here.',
      'Everyone’s watching — set me.',
      'Give the star the ball.',
      'You know who to pass to.'
    ],
    shy: [
      'I… I can hit this one!',
      'Please — set me!',
      'Just this once… me!',
      'Um… I’m ready!',
      'I’ll try my best — set me!',
      'Over here… please!'
    ],
    leader: [
      'Everyone — one more! Set me!',
      'I’ll carry this one!',
      'Follow me — ball here!',
      'Trust me — set it here!',
      'This one’s the turning point — me!',
      'Feed me, I’ll finish it!'
    ]
  },
  askEl: {
    hot: [
      '{sig}!! Burn it down!',
      'Here comes {sig}!!',
      'It’s full — {sig}!!',
      'The gauge is full — SET ME!!',
      'It’s about to explode — {sig}!!',
      'This is the moment for {sig}!!'
    ],
    cool: [
      '…{sig}.',
      'Time for {sig}.',
      'This ends with {sig}.',
      '…Set me. {sig} is ready.',
      'The gauge is full. {sig}.',
      'One shot. {sig}.'
    ],
    cocky: [
      'Ready for {sig}? No? Too bad.',
      'Say goodbye — {sig}!',
      'You can’t stop {sig}.',
      'You want to see {sig}? Set me.',
      'Front row seats to {sig}!',
      'I saved {sig} for this.'
    ],
    shy: [
      'Please work… {sig}!',
      'I can feel it — {sig}!',
      'Now… {sig}!',
      'I think {sig} is ready…!',
      'If it works, it’s {sig}…!',
      'Please, one more — {sig}!'
    ],
    leader: [
      'For all of us — {sig}!',
      'Watch my back — {sig}!',
      'Team, here we go — {sig}!',
      'Everything we’ve got — {sig}!',
      'Set me. {sig} for the team!',
      'Give me the ball — {sig}!'
    ]
  },
  setgo: {
    hot: ['Go, {mate}!!', 'Take it, {mate}!', 'Smash it!', 'Now! Smash it, {mate}!!', 'Blow it up, {mate}!!', 'Don’t hold back — GO!!'],
    cool: [
      '…Go.',
      'Perfect height. Hit it.',
      'It’s yours, {mate}.',
      'Take it. Finish it.',
      'Your ball, {mate}.',
      'Right on the money. Go.'
    ],
    cocky: [
      'Best set of your life. Don’t waste it.',
      'Just swing, {mate}.',
      'Easy mode, go.',
      'Perfect toss, {mate}. Don’t waste it.',
      'I did my part. Do yours.',
      'Tell them who set it.'
    ],
    shy: ['{mate}, go!', 'I believe in you!', 'Please, {mate}!', 'Please hit it, {mate}!', 'It’s up — you can do it!', 'Go, {mate}, go!'],
    leader: [
      'Finish it, {mate}!',
      'Trust it — go!',
      'All yours, {mate}!',
      'You’ve got this, {mate}!',
      'Everything’s on you — swing!',
      'Perfect set — take it!'
    ]
  },
  wall: {
    hot: [
      'Not getting past me!!',
      'Block it! Block it!',
      'Come on then!',
      'Get in front of it — NOW!!',
      'This wall doesn’t break!!',
      'Jump with me!!'
    ],
    cool: [
      'I’ve read it.',
      'Straight line. Close it.',
      'Two up — now.',
      'Hands over the net.',
      'Cross is shut. Line’s open.',
      'Wait for it… now.'
    ],
    cocky: [
      'That again? Please.',
      'I’ll swat that down.',
      'Go ahead, try me.',
      'You’re running out of angles.',
      'Nothing gets by us.',
      'Try the line. I dare you.'
    ],
    shy: [
      'I have to stop it…!',
      'Jump… jump!',
      'Please be here…!',
      'Stay together… jump!',
      'Please don’t get through…!',
      'I’ll try to stop it…!'
    ],
    leader: [
      'Read it! Two up!',
      'Close the line!',
      'Hold the wall — together!',
      'Tight hands! Together!',
      'Eyes on the hitter — up!',
      'Seal it — now!'
    ]
  },
  scored: {
    hot: [
      'YEAHHH!!',
      'That’s how it’s done!!',
      'Again! Again!',
      'THAT’S WHAT I’M TALKING ABOUT!!',
      'Another one!!',
      'Nobody can stop me!!'
    ],
    cool: ['Next.', 'As planned.', 'One more.', 'Expected.', 'Good. Keep going.', 'The plan is working.'],
    cocky: ['Told you.', 'Too slow!', 'Is that all you’ve got?', 'You’re welcome, everyone.', 'Easy points.', 'Was there ever any doubt?'],
    shy: ['I… did it?', 'It went in!', 'Yes…!', 'We did it…!', 'I can’t believe it went in…!', 'That felt… good!'],
    leader: [
      'Great set! Keep going!',
      'That’s our rhythm!',
      'Stay locked in!',
      'That’s the way — keep pushing!',
      'One point closer — stay sharp!',
      'Beautiful, everyone!'
    ]
  },
  mate: {
    hot: ['Nice one, {mate}!!', 'Monster!', 'That’s it!!', 'Yes!! That’s my {mate}!!', 'Unstoppable, {mate}!!'],
    cool: ['Clean.', 'Good hit.', 'Nice.', 'Solid.', 'As expected.'],
    cocky: [
      'Not bad, {mate}.',
      'Almost as good as me.',
      'Ha, nice.',
      'Okay, okay — I see you, {mate}.',
      'You’re getting better. Slightly.'
    ],
    shy: ['Amazing, {mate}!', 'So cool…', 'Nice!', 'Wow, {mate}, so strong…!', 'I want to be that cool someday!'],
    leader: ['That’s it, {mate}!', 'Keep it rolling!', 'Beautiful!', 'Great job, {mate} — keep it up!', 'That’s the spirit, team!']
  },
  stuffed: {
    hot: [
      'Again! I’ll break through next time!',
      'Damn it!',
      'One more time!',
      'I’ll get you next time!!',
      'That block — I’ll break it!!',
      'Not over yet!!'
    ],
    cool: ['…I see.', 'Adjusting.', 'Noted.', 'They’re good. I’ll adapt.', 'Timing was off. Fixing it.', 'A different angle next time.'],
    cocky: [
      'Lucky block.',
      'Won’t happen twice.',
      'Tch.',
      'They got lucky. It won’t last.',
      'Fine. Now I’m serious.',
      'That’s the only one you get.'
    ],
    shy: ['Sorry…!', 'I’ll do better…', 'Ah…', 'I’m sorry, everyone…!', 'They were so fast…', 'I’ll try harder…!'],
    leader: [
      'My bad — next one’s mine!',
      'Heads up, we’re fine!',
      'Reset, reset!',
      'No problem — we’ll get it back!',
      'That’s on me. Pick me up, team!',
      'Next ball, let’s go!'
    ]
  },
  denied: {
    hot: ['Not in my house!!', 'DENIED!!', 'Try that again!', 'Nothing gets through me!!', 'What a stop!!', 'Who’s next?!'],
    cool: ['Read you.', 'Too predictable.', 'Closed.', 'Predictable.', 'Nothing personal.', 'Not on my watch.'],
    cocky: ['Is that all?', 'Nope.', 'Go home.', 'You were never getting past.', 'Stopped. Easily.', 'Come back with something better.'],
    shy: ['I stopped it…!', 'I got it!', 'Did I…?', 'I… actually stopped it!', 'I can’t believe it worked…!', 'Yes… I blocked it!'],
    leader: [
      'Wall holds!',
      'That’s our block!',
      'Nothing gets through!',
      'That’s our wall — well done!',
      'Stopped! Now let’s counter!',
      'Great block — keep it up!'
    ]
  },
  oops: {
    hot: ['Argh — my fault!', 'Next one, I swear!', 'Damn!', 'Damn it — I’ll fix it!!', 'That was mine — sorry!!'],
    cool: ['Mistake. Moving on.', 'Won’t repeat it.', '…', 'Noted. Won’t happen again.', 'Lapse in focus. Corrected.'],
    cocky: ['Whatever, I’ll get it back.', 'Warm-up swing.', 'Ugh.', 'A minor slip. Don’t get used to it.', 'That never happened.'],
    shy: ['Sorry, sorry!', 'I messed up…', 'Ah… sorry!', 'I’m so sorry…!', 'I’ll be more careful…!'],
    leader: ['On me. Next one.', 'Shake it off!', 'Reset — we’re good!', 'My mistake — everyone reset!', 'Next one, we’ll get it back!']
  },
  cheer: {
    hot: ['Don’t look down!', 'Let’s go, let’s go!', 'Fight!', 'Get fired up — let’s GO!!', 'Shake it off and fight!!'],
    cool: ['Breathe.', 'We get the next one.', 'Stay calm.', 'Focus. Next ball.', 'We’re fine. Stay the course.'],
    cocky: ['Relax, I’ve got this.', 'We’re still better.', 'Chill.', 'It’s just a point. Relax.', 'We’ll make them pay for it.'],
    shy: ['We can do it…!', 'Don’t give up!', 'Next one…!', 'It’s okay — we’re together…!', 'One point… we can get it back!'],
    leader: [
      'Heads up! One point at a time!',
      'Together — next ball!',
      'We’re not done!',
      'Head up, everyone — we’ve got this!',
      'Stay tight — next point!'
    ]
  },
  read: {
    hot: [
      'I read you!!',
      'Saw that coming a mile away!!',
      'Not this time!!',
      'I KNEW IT!! Right here!!',
      'You can’t fool me!!',
      'Your swing’s an open book!!'
    ],
    cool: [
      'I read you.',
      '…Cross. Closed.',
      'Your shoulder told me.',
      'Your steps gave it away.',
      'Predictable. Line’s closed.',
      'The angle was obvious.'
    ],
    cocky: [
      'Read you like a book.',
      'Too obvious.',
      'I knew it. Always cross.',
      'Did you really think that worked?',
      'That was a gift.',
      'I saw it before you did.'
    ],
    shy: [
      'I… I read it!',
      'I saw it…!',
      'This time I know…!',
      'I think I know where it’s going…!',
      'The signs were there…!',
      'I hope I’m right…!'
    ],
    leader: [
      'Read it — shut it down!',
      'I read you — wall, now!',
      'Got you!',
      'Got the read — close it now!',
      'I know where it’s going — trust me!',
      'Follow my call — block!'
    ]
  },
  cover: {
    hot: [
      'I’ve got the line!!',
      'Anything past you is mine!',
      'Send it my way!',
      'Back row’s ready — go!!',
      'Anything through, I’ll dig it!!'
    ],
    cool: ['Line’s covered.', 'I’ll take what gets through.', 'Behind you.', 'Cover set.', 'I’ll pick up the rest.'],
    cocky: [
      'Let it through, I’ll dig it.',
      'Line’s mine, relax.',
      'I’m not moving.',
      'Relax, I’ll clean up.',
      'Send it through, I’m waiting.'
    ],
    shy: ['I’ll try the line…!', 'Behind you…!', 'I’m here!', 'I’ll be right behind you…!', 'I’ll do what I can…!'],
    leader: [
      'Line’s covered — trust me!',
      'Block cross, I’ve got the rest!',
      'Back row, set!',
      'Cover! Everyone in position!',
      'Block, then we counter!'
    ]
  },
  dare: {
    hot: [
      'Then I’ll smash right through you!!',
      'Bring the wall — I’ll break it!',
      'Try and stop me!!',
      'Nothing’s stopping me!!',
      'Come on — block THIS!!',
      'I’ll smash it anyway!!'
    ],
    cool: ['Read it? Then read this.', 'Doesn’t matter.', 'Knowing isn’t stopping.', 'Then stop it.', 'A read won’t save you.', 'Try me.'],
    cocky: [
      'Cute. Watch this.',
      'Knowing won’t save you.',
      'Go ahead, guess.',
      'Read all you want.',
      'You’ll still lose.',
      'Let’s see you handle it.'
    ],
    shy: [
      'I’ll… I’ll hit it anyway!',
      'Please get through…!',
      'Here goes…!',
      'I’ll… try anyway…!',
      'Even if you know — I’ll hit it!',
      'I won’t back down…!'
    ],
    leader: [
      'Straight through them!',
      'We break this wall!',
      'Behind me, team!',
      'Trust the set — hit through!',
      'No fear — swing!',
      'We’ve come too far to stop!'
    ]
  },
  loose: {
    hot: ['LOOSE BALL!!', 'GET IT!!', 'It’s alive — GO!!', 'Get it up — GO!!', 'Don’t you dare let it drop!!'],
    cool: ['Loose ball — cover!', 'Off the hands — chase!', 'Still alive!', 'Loose. Recover.', 'Under it — now.'],
    cocky: ['Got it, got it!', 'Mine — move!', 'Easy, I got it!', 'I’ve got it — back off!', 'Easy — this one’s mine.'],
    shy: ['B-ball!', 'It’s coming…!', 'Help…!', 'Somebody get it…!', 'It’s going down…!'],
    leader: ['Loose ball! Cover!', 'Chase it — everyone!', 'Don’t let it drop!', 'Chase it down — go!', 'Save it, save it!']
  },
  brk: {
    hot: ['BREAK!!', 'It broke through — GET IT!!', 'BREAK! BREAK!', 'It’s through — SAVE IT!!', 'It broke the block — go go go!!'],
    cool: ['Break — cover.', 'Through the block.', 'Break.', 'The block broke. Recover.', 'Ball’s through. Move.'],
    cocky: ['Tch — break!', 'Through?! Get it!', 'Break!', 'That got through? I’ll catch it.', 'Not a problem.'],
    shy: ['It went through…!', 'Break…!', 'Aaah!', 'It’s through… help…!', 'It’s coming down…!'],
    leader: ['BREAK! Cover!', 'It’s through — go!', 'Break — get under it!', 'The block’s broken — pick it up!', 'Get under it, together!']
  },
  touch: {
    hot: ['One touch!!', 'Got a finger on it!', 'Touch!!', 'I got a finger on it!!', 'Touch — GO!!'],
    cool: ['One touch.', 'Touched it.', 'Soft touch — go.', 'A touch. Now counter.', 'Slowed it down — enough.'],
    cocky: ['Touched it, obviously.', 'One touch — easy.', 'Got it.', 'A touch is all I need.', 'That’ll do.'],
    shy: ['I touched it…!', 'One touch…!', 'Just barely…!', 'I touched it…! Someone get it!', 'It slowed a little…!'],
    leader: ['One touch! Chance ball!', 'Touch — counter!', 'One touch — set up!', 'Touch! Everyone up!', 'That’s a chance ball — go!']
  },
  save: {
    hot: ['NOT DROPPING!!', 'Nothing hits this floor!!', 'MINE!!', 'I’M NOT LETTING IT DROP!!', 'Get UP!!'],
    cool: ['…Up.', 'Not today.', 'Got it.', 'Not down yet.', 'Still in play.'],
    cocky: ['Too easy.', 'You thought?', 'Nice try.', 'You’ll have to try harder.', 'That’s how it’s done.'],
    shy: ['I reached it…!', 'Up…!', 'Please go up…!', 'Somebody take it…!', 'Please… stay up…!'],
    leader: ['Keep it alive!', 'Up! Counter!', 'Still ours!', 'It’s alive — counter now!', 'Good save — keep going!']
  },
  stop: {
    hot: ['One more stop!!', 'Block this and we win!!', 'Shut it down!!', 'One stop and it’s OVER!!', 'LOCK IT DOWN!!'],
    cool: ['One stop. That’s all.', 'Close it out.', 'Last one.', 'One block. That’s it.', 'Steady. One more.'],
    cocky: [
      'Game’s over, you just don’t know it.',
      'Last swing, make it count.',
      'Bye.',
      'One more block and you’re done.',
      'Finish them.'
    ],
    shy: ['Just one more…!', 'We can win…!', 'Stop this one…!', 'One more… we can do it…!', 'Just one block…!'],
    leader: [
      'One more stop — together!',
      'Hold the wall — we win this!',
      'Finish it, team!',
      'This is it — one more!',
      'Everyone, lock in!'
    ]
  },
  kiai: {
    hot: ['HAAAAAAA!!', 'THROUGH YOU!!', 'BREAK!!!', 'NOTHING CAN STOP THIS!!', 'RAAAAAAH!!'],
    cool: ['…Through.', 'Now.', '…!', '…Break.', 'Here.'],
    cocky: ['Break it!', 'Too weak!', 'Move!', 'Get out of the way!', 'Shatter!'],
    shy: ['Nnngh—!!', 'Please—!!', 'Haa—!!', 'Haaah—!!', 'Nnnnh—!!'],
    leader: ['THROUGH!!', 'For the team!!', 'Break it down!!', 'Everything we’ve got!!', 'With all of us — THROUGH!!']
  },
  stunned: {
    hot: ['What?!', 'That was…!', 'Seriously?!', 'No way!!', 'That was insane!!'],
    cool: ['…Too fast.', 'I didn’t even see it.', '…Impressive.', '…Incredible.', 'I underestimated them.'],
    cocky: ['Okay… that was good.', 'Fine. You win that one.', 'Huh.', 'Hmph. Not bad.', 'Interesting.'],
    shy: ['Scary…', 'I couldn’t move…', 'Wow…', 'That was… incredible…', 'I can’t even follow that…'],
    leader: ['Shake it off — we adjust!', 'Next one we stop!', 'Heads up!', 'Regroup — we adapt!', 'Stay focused, next ball!']
  }
};
