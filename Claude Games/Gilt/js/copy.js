/* GILT — every word in the building.
   House style: it's 1974, everybody's worked here forever, nobody's excited.
   Signs get to shout. People don't. */
(function (root) {
  'use strict';

  const COPY = {

    // ---------- signage (signs shout; this is the one place caps live) ----------
    signs: {
      marquee: 'THE GILT',
      marqueeSub: 'CARDS · DICE · WHEELS',
      cocktails: 'COCKTAILS',
      est: 'THE GILT · EST. 1948 · NO CHECKS. DON\'T ASK.',
      cage: 'CAGE',
      blackjack: '21',
      roulette: 'WHEEL',
      craps: 'DICE',
      slots: 'SLOTS',
      vpoker: 'POKER MACHINES',
      baccarat: 'BACCARAT',
      threecard: 'THREE CARD',
      hilo: 'BAR',
      keno: 'KENO LOUNGE',
      bigsix: 'BIG SIX',
      horses: 'SIMULCAST',
      pete: 'PROSPECTOR PETE',
      peteSub: 'LOOSEST DOLLAR SLOT THIS SIDE OF THE HIGHWAY',
      kate: 'KLONDIKE KATE',
      motherlode: 'THE MOTHERLODE',
      motherlodeSub: 'JACKPOT PAYS METER',
      motherlodeFine: 'Meter feeds from every handle pull on the floor. Management thanks you for your contribution.',
      vpGood: 'FULL HOUSE 9 · FLUSH 6',
      vpBad: 'FULL HOUSE 8 · FLUSH 5',
      vpBadScratch: 'this one\'s a widow',   // scratched into the paint by somebody who learned
      goldstrike: 'GOLD STRIKE · $5',
      simulcastBoard: 'TODAY FROM HIALEAH — 6 FURLONGS',
      closed: 'TABLE CLOSED',
      highroller: 'THE MERIDIAN ROOM · MEMBERS'
    },

    // ---------- menu ----------
    menu: {
      night: 'The night',
      nightSub: 'You owe Sal twelve. Sun\'s up at six.',
      freeplay: 'Just play',
      freeplaySub: 'House money. The clock doesn\'t care.',
      notebook: 'The notebook',
      continueNight: 'Back inside',
      newNight: 'Start it over'
    },

    // ---------- Sal ----------
    sal: {
      intro: [
        'Look who found the place. You want coffee? They got coffee inside. It\'s terrible.',
        'Twelve thousand. By six. I\'m not being dramatic — that\'s just when the sun comes up.',
        'Marty\'s kid walked in here down eight hundred once, walked out clean. People do it. Go on — they\'re holding five hundred of mine at the cage for you.'
      ],
      introGo: 'Go in',
      introSkip: 'Heard it before',
      three: 'Three o\'clock. I\'m not checking in. I\'m just saying — three o\'clock.',
      five: 'Hour left. The egg place across the street opens at six. One way or the other.',
      endings: {
        bust: [
          'Hey. Look at me. It happens. It happened tonight, is all.',
          'Walk with Bruno. Not far. We\'ll talk about a payment plan — you\'ll keep your thumbs, I need people who can dial a phone.'
        ],
        scraps: [
          'That\'s what\'s left? Put it away. Buy breakfast with it.',
          'The eggs across the street are honest, which puts them one up on you. Come back Thursday. We\'ll restructure.'
        ],
        half: [
          'Half. Huh.',
          'You know what half buys? A month. Same number, thirty days. Don\'t spend the month sleeping.'
        ],
        paid: [
          'Twelve. All there. You want to hear something funny — I told Bruno you had it in you. Bruno owes me twenty.',
          'Go home. Sleep till Tuesday. And hey — don\'t come back. I mean that nicely.'
        ],
        gilt: [
          'Twelve for me. And look at that — plenty left over for you.',
          'Kid. If you ever want honest work — don\'t call me.'
        ]
      }
    },

    cole: {
      giltEnding: [
        'The suite\'s open. Breakfast\'s on the house — the real menu, not the floor menu.',
        'The Gilt likes a winner. The Gilt would also like its money back eventually. The room upstairs is yours whenever.'
      ],
      backoff: [
        'You\'ve got a good memory. It\'s a nice quality.',
        'Ruth\'s going on break. Try the wheel — the wheel doesn\'t mind a good memory.'
      ],
      backoffDone: 'Nothing personal. It\'s arithmetic.',
      watching: 'Mr. Cole is looking this way.'
    },

    // ---------- the cage ----------
    mabel: {
      first: [
        'You\'re Sal\'s, right, sweetheart? He called ahead.',
        'Five hundred. And I\'m supposed to say something encouraging.',
        'There. That was it.'
      ],
      return: ['Back again. Cage never closes, more\'s the pity.', 'What do you need, sweetheart?'],
      marker: 'Sal says okay. Sal always says okay. That\'s the problem.',
      markerSigned: 'Thousand out, thirteen hundred on the number. Sign here. Pen works, I checked.',
      markerNo: 'Sal wrote two already. Even Sal\'s got a floor, and you\'re standing on it.',
      scratcher: 'Gold Strike\'s five a card. Fella hit a grand off one in March — we still talk about it.',
      scratchWin: 'Would you look at that. Don\'t spend it here. — Ah, who am I kidding.',
      scratchLose: 'That\'s how they get you, sweetheart. Another?',
      dogPhoto: 'That\'s Duke. Fourteen years old and still meaner than half the floor.'
    },

    // ---------- dealers ----------
    ruth: {
      name: 'RUTH',
      greetFirst: ['Sit anywhere, hon. Shoe\'s fresh.', 'Minimum\'s ten. Cards do the rest of the talking.'],
      greet: ['Back for more. Shoe remembers you, hon.', 'Seat\'s still warm.'],
      deal: ['Cards.', 'Here they come.', 'Good luck, hon.'],
      playerBJ: ['Snapper. Three to two.', 'Well, hello. Paid three to two.'],
      dealerBJ: ['Dealer\'s got it. That\'s the cold part of the job.'],
      winSmall: ['That\'s a hand.', 'It holds.', 'There you go, hon.'],
      winBig: ['Well. Somebody\'s living right.', 'Now that\'s a picture.'],
      lose: ['Card\'s a card, hon.', 'Shoe giveth.', 'Next hand\'s cleaner.'],
      bust: ['Twenty-two\'s still a number. Just not one that pays.', 'Over. Happens to bishops and bricklayers.'],
      push: ['Standoff. Nobody\'s hurt.', 'Push. Keep your money, hon.'],
      // she notices when you play it wrong — the politest lesson in the building
      mistake: ['Hm.', 'You hit that against a six, hon. I saw it. God saw it.', 'Book says otherwise. But it\'s your money.'],
      cooled: 'Table\'s resting, hon. Come back in a bit. Don\'t ask.',
      split: 'Two hands, twice the weather.',
      double: 'Money behind it. Alright.'
    },

    eddie: {
      name: 'EDDIE',
      greetFirst: ['New shooter, new shooter — money on the pass line gets you in the conversation—', 'It\'s simple, don\'t let anybody tell you different — pass line, then the dice talk—'],
      greet: ['Back to the rail, alright, alright—'],
      comeout: ['Coming out, coming out—', 'New roll, clean slate, money down—'],
      point: ['Mark it. You want odds behind that? Only free money in the building, I keep saying it—', 'There\'s the point. Odds behind the line, people. It costs nothing. NOTHING, I said it again—'],
      seven: ['And that\'s — yeah. That\'s the thing about sevens. They don\'t care.', 'Out. Sevens got no memory and no manners.'],
      pointMade: ['THERE it is — pay the line, pay the odds, somebody hug somebody—', 'He made it, she made it, the DICE made it, everybody gets paid—'],
      eleven: ['Yo-leven, front line winner—'],
      crapout: ['Craps. Short conversation.'],
      fieldWin: ['Field pays.', 'Field money.'],
      hardway: ['The hard way. Everybody wants it the hard way—'],
      idle: ['Night school\'s got me reading accounting. You want to see a REAL dice table, look at a ledger—']
    },

    vern: {
      name: 'VERN',
      greetFirst: ['Place your bets.'],
      spin: ['No more bets.'],
      win: ['There it is.'],
      lose: ['Next spin\'s a spin.'],
      zero: ['House pocket.'],
      idle: ['Wheel\'s old. Like me.'],
      biasHint: 'Wheel leans. Watch twenty-six.',
      bigsix: ['Other wheel\'s louder.', 'Fifty-four pegs.'],
      bias26hit: ['Twenty-six. Again.']
    },

    dot: {
      name: 'DOT',
      greetFirst: ['Minimum\'s twenty-five.'],
      deal: ['Cards.'],
      player: ['Player.'],
      banker: ['Banker.'],
      tie: ['Tie. Nobody move.'],
      natural: ['Natural.'],
      idle: ['Four letters. "Fate."', 'Seven down. "Ruin," five letters.']
    },

    marla: {
      name: 'MARLA',
      greetFirst: ['Okay, so — ante gets you cards, and I need queen-high just to talk to you.', 'Pair plus is its own bet. It doesn\'t care what I have. Some people like that about it.'],
      greet: ['Hi again. Ante when you\'re ready.'],
      straightFlush: ['Oh — that\'s the good one. Hold on, let me count it out.'],
      noQualify: ['I\'ve got nothing. Ante pays, play pushes. House rules, not mine.'],
      win: ['That holds up. Nice.'],
      lose: ['Mine plays. Sorry.'],
      fold: ['Smart or scared, same motion.'],
      straightBeatsFlush: 'Straight beats a flush at this table. I know. It\'s real, it\'s on the card.'
    },

    len: {
      name: 'LEN',
      greetFirst: [
        'Clean game. High or low, fresh deck every card.',
        'Ties go to me — that\'s the rub. And the prices run three cents shy of fair. You can do the arithmetic on a napkin. I\'ll get you the napkin.'
      ],
      greet: ['The usual ladder?'],
      win: ['Still climbing.', 'It rides.'],
      lose: ['And down it goes. Drink?', 'The ladder\'s got a loose rung, I keep telling people.'],
      tie: ['Tie. House\'s tie. I did mention it.'],
      cashout: ['Smart. The ones who should walk never do.', 'Take it home. Buy something that doesn\'t spin.']
    },

    coral: {
      name: 'CORAL',
      greetFirst: ['Ticket, sugar? Draw runs every couple minutes.', 'Mark your numbers. One through eighty, dream big.'],
      greet: ['Same numbers, or new heartbreak?'],
      win: ['Well hey, it hit. Don\'t tell the lounge, they\'ll raise the drink prices.'],
      lose: ['That\'s keno, sugar. The chairs are comfortable for a reason.'],
      bigWin: ['Sugar, sit down. Sit DOWN. I\'ll get the book, this needs a signature.']
    },

    fingers: {
      name: 'FINGERS',
      greetFirst: [
        'First time down here? Board lies a little. Not much. Enough.',
        'Two hundred says I tell you where.'
      ],
      greet: ['Race coming up. You want the word or not?'],
      sold: ['The FORM\'s the thing, not the board. You didn\'t hear arithmetic from me.'],
      tip: (name) => 'The live one\'s ' + name + '. Board\'s wrong about it. That\'s all I\'m saying, and I said it quiet.',
      broke: ['Come back when you\'re holding. Information\'s the one thing here that ain\'t on credit.'],
      skimNote: 'Some nights I\'m wrong. Never twice running — ask anybody.',
      raceOff: ['They\'re off.'],
      photo: ['Photo. Hold your ticket. HOLD it.']
    },

    herb: {
      name: 'HERB',
      approach: [
        'You play a clean game. Mind if I sit? Coffee\'s the only thing I bet after midnight.',
        'You want to know what the shoe\'s doing? Or do you like surprises.'
      ],
      lesson: [
        'It\'s just a tally. Low cards leaving the shoe is good for you — that means the paint stays. Deuce through six, count one up. Tens, faces, aces — one down.',
        'Divide by the decks still sitting there. Past plus-three, the shoe owes you money. Under that, bet the minimum and drink slow.',
        'One more thing. Cole up there watches for exactly this. Jump your bet ten times over and he\'ll walk you out polite as a preacher. Stretch it easy — double, don\'t jump.'
      ],
      accept: 'Show me the tally',
      decline: 'I like surprises',
      declined: 'Suit yourself. The shoe doesn\'t mind either way.',
      done: 'That\'s the whole lesson. Everything else is nerve.',
      midnight: 'That\'s midnight. I get stupid after midnight, so I stop. You\'d be amazed how few people stop.'
    },

    // ---------- house rules cards (each one ends with the price, in plain words) ----------
    rules: {
      blackjack: {
        title: 'HOUSE RULES — 21',
        body: [
          'Dealer stands on all seventeens.',
          'Blackjack pays 3 to 2.',
          'Double on any first two cards.',
          'Split a pair once. Split aces take one card apiece.',
          'Table keeps about six dimes of every hundred — if you play it right. Most don\'t.'
        ]
      },
      roulette: {
        title: 'HOUSE RULES — WHEEL',
        body: [
          'Thirty-eight pockets. Straight-up pays 35 to 1.',
          'Splits 17, streets 11, corners 8, six-line 5.',
          'Dozens and columns 2 to 1. The even chances, even.',
          'The wheel has 38 pockets and pays like it has 36. That\'s the whole business, right there.'
        ]
      },
      craps: {
        title: 'HOUSE RULES — DICE',
        body: [
          'Pass line pays even. Point set, line stays till it\'s made or the seven shows.',
          'Odds behind the line: 3x on 4 and 10, 4x on 5 and 9, 5x on 6 and 8. Paid at true odds.',
          'Field pays even; 2 pays double, 12 triple. Place the 6 or 8 for 7 to 6. Hardways 7 to 1 and 9 to 1.',
          'The line gives the house a dollar forty of every hundred. The odds behind it give the house nothing at all. Eddie will let you hear that twice.'
        ]
      },
      slots: {
        title: 'THE GLASS — SLOTS',
        body: [
          'Three reels, one line. Pays what the glass says, top to bottom, first match.',
          'Cherries pay back a little for showing up. Bars mix at 10.',
          'The Motherlode\'s jackpot is the number on the meter, nothing less.',
          'A dollar machine keeps about eight cents of it. The meter machine keeps more — until the meter says otherwise. Read the glass.'
        ]
      },
      vpoker: {
        title: 'THE GLASS — DRAW POKER',
        body: [
          'Five cards, hold what you like, draw once. Jacks or better opens the paybook.',
          'Two machines, two glasses. One pays 9 on the full house and 6 on the flush. One doesn\'t.',
          'Played sharp, the good glass keeps barely a dime of your hundred. The other one\'s a widow. It says so, scratched right in the paint.'
        ]
      },
      baccarat: {
        title: 'HOUSE RULES — BACCARAT',
        body: [
          'Punto banco, six decks. The tableau draws the cards; nobody gets an opinion.',
          'Banker pays even less five percent. Player pays even. Tie pays 8.',
          'Banker keeps about a dollar of your hundred, player a dollar and a quarter. The tie keeps fourteen. Dot recommends the crossword.'
        ]
      },
      threecard: {
        title: 'HOUSE RULES — THREE CARD',
        body: [
          'Ante gets three cards. Play matches the ante or fold and it\'s gone.',
          'Dealer opens with queen-high or better. No open: ante pays, play pushes.',
          'A straight outranks a flush. Three cards, different arithmetic. It\'s real.',
          'Straights and better pay an ante bonus, win or lose. Pair plus is a side game with its own glass.',
          'Played by the card — queen-six-four — the table keeps about three and a half of every hundred.'
        ]
      },
      hilo: {
        title: 'THE NAPKIN — LEN\'S LADDER',
        body: [
          'Fresh deck, one card up. Call the next one high or low.',
          'Right: your money multiplies at three cents shy of fair. Wrong: it\'s gone.',
          'Ties go to the house. Walk whenever — nobody walks.',
          'Every rung costs about three of a hundred. The ladder doesn\'t get fairer higher up.'
        ]
      },
      keno: {
        title: 'HOUSE RULES — KENO',
        body: [
          'Pick one to ten numbers of eighty. The lounge draws twenty.',
          'Pays by the catch, per the board. Tickets run every couple minutes.',
          'The lounge keeps about a quarter of every dollar. Best chairs in the building, though.'
        ]
      },
      bigsix: {
        title: 'HOUSE RULES — BIG SIX',
        body: [
          'Fifty-four pegs. Bet a bill, the wheel picks a bill. Pays what the bill says.',
          'The joker and the house crest pay 40 to 1.',
          'The wheel keeps eleven to twenty-four of every hundred, depending where you put it. It is the prettiest thing in the building and it knows it.'
        ]
      },
      horses: {
        title: 'PARLOR CARD — SIMULCAST',
        body: [
          'Six-horse fields from tracks three time zones away. Win bets at the posted price.',
          'Post every twenty minutes or so. The board settles all arguments.',
          'The take runs about fifteen of every hundred. The morning line is somebody\'s opinion. Opinions vary.'
        ]
      },
      scratch: {
        title: 'GOLD STRIKE — $5',
        body: [
          'Six spots of foil. Match three amounts and it pays that amount.',
          'The state won\'t license these, so the Gilt prints its own.',
          'The cage keeps better than a third of every dollar. Mabel will tell you that herself, and sell you one anyway.'
        ]
      }
    },

    // ---------- the notebook (your own hand, bad pen) ----------
    notebook: {
      title: 'the notebook',
      empty: 'nothing yet. pay attention.',
      count: 'herb\'s tally — small cards +1, paint and aces −1. divide by decks left. past +3 the shoe owes you. double in, don\'t jump.',
      wheel: 'vern\'s wheel leans on 26. straight up pays 35. old wood remembers.',
      goodmachine: 'the poker machine BY THE DOOR pays 9/6. the other one\'s a widow — it says so in the paint.',
      progressive: 'motherlode flips honest when the meter clears about $3,900. watch the glass, not the reels.',
      odds: 'dice — the bet BEHIND the line is free. eddie wasn\'t lying.',
      fingers: 'fingers runs right 4 nights in 5. only worth the $200 betting six hundred or better.',
      cover: 'cole watches for the spread. stretch the bet easy — double, don\'t jump.',
      keno: 'keno keeps a quarter of every dollar. the chairs are the trap.'
    },
    notebookAdded: 'wrote it down.',

    // ---------- buttons & small ui ----------
    ui: {
      dealIn: 'Deal me in', hit: 'Hit', stand: 'Stand', double: 'Double', split: 'Split',
      spin: 'Spin', clear: 'Clear the felt', roll: 'Roll', pull: 'Pull',
      draw: 'Draw', deal: 'Deal', ante: 'Ante', play: 'Play', fold: 'Fold',
      higher: 'Higher', lower: 'Lower', takeIt: 'Take it',
      ticket: 'Play the ticket', postTime: 'Post time', another: 'Another',
      walk: 'Walk', back: 'Back to the floor', rules: 'House rules',
      marker: 'Ask about a marker', ok: 'Alright', bet: 'Bet', rebet: 'Same again',
      cashout: 'Color up', notebook: 'Notebook', skip: 'Skip',
      buyTip: 'Buy the word · $200', noTip: 'Play the board',
      toDoor: 'The door', stay: 'Not yet'
    },

    // ---------- dawn card ----------
    dawn: {
      title: 'the night, by the numbers',
      wagered: 'through the tables',
      rounds: 'hands, spins, and tickets',
      biggest: 'best moment',
      worst: 'worst moment',
      markers: 'paper signed',
      backoffs: 'talks with Cole'
    },

    horseNames: [
      'Butter Wouldn\'t Melt', 'Sal\'s Regret', 'Dime Store Duchess', 'Wrong Church',
      'Payphone Money', 'Sister Concrete', 'Borrowed Suit', 'Last Call Lily',
      'The Accountant', 'Roman Candle', 'Cheap Sunglasses', 'Motel Bible',
      'Fourth Marriage', 'Graveyard Shift', 'Torn Ticket', 'Bad Penny',
      'Milkman\'s Horse', 'Repossessed', 'Casket Handles', 'Free Advice',
      'Union Scale', 'The Big Quiet', 'Storm Drain', 'Half Sister'
    ],

    // patrons for the floor — nobody you know, everybody you've seen
    freeplayNote: 'House money. It spends like real and means nothing, same as advice.'
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = COPY;
  root.GiltCopy = COPY;
})(typeof window !== 'undefined' ? window : globalThis);
