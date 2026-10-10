// zbyszek_hub: Zbyszek behind the bar of The Drowned Bell. One dialogue for every visit; the
// entry node picks the greeting from the flags and the day.
//
// Entry: interact with Zbyszek (any time). cast: zbyszek.
// Sets:  heard_of_maiden (first visit, he lets the girl slip), met_zbyszek, knows_fair_hand
//        (both set in the first visit's spine, so the journal line is true), zbyszek_echo_greeted
//        (first visit after echo_seen, free soup).
// Gives: soup 2 grosze (warms Vesna), Thaw draught 12 grosze (S.give('thaw')).
// Rest:  the dialogue cannot call G.story.rest itself (it refuses while a dialogue is running).
//        Choosing the bed ends at the node 'rest_dusk' (check result.end === 'rest_dusk'); the story
//        controller then calls G.story.rest(hour): 21:00 on day 1 with hanka_hired, 19:30 on day 2,
//        otherwise dusk.
// Topics (all `once`): the three, the winters, who else knew them, the cart on the pass (needs the
//        note), the girl (needs hanka_hired), the men under the ice (needs lair_seen), the rite three
//        years ago (needs echo_seen), tonight (needs echo_seen), the lights over the lake (needs
//        planetnicy_seen: he reads them like weather and sends her to the page by the door, note_almanac).
// Dice:  the last choice before "That's all" (an exit, so a script that takes the first exit still takes the bed). The first
//        time he explains Kosci (sets dice_known, dice_zbyszek_met; the side quest "Dice at the Drowned Bell" starts); after
//        that it is a short ask. The chain ends at the node 'dice_go' and the controller starts the match across the bar
//        (result.end === 'dice_go'). Refused with a line when it is late on the rite day, he is out of money or she is.
//        Once she has beaten Zbyszek, Wojtek and Halina (dice_all_beaten) the next visit opens with the bone dice (bz1).
const pick = (...lines) => () => lines[Math.floor(Math.random() * lines.length)];
const day = (D) => D.G.time?.day ?? 1;
const night = (D) => { const h = D.G.time?.hours ?? 12; return h > 18.5 || h < 6; };
const warm = (D) => { if (D.G.player) D.G.player.warmth = 1; };

export default {
  id: 'zbyszek_hub',
  cast: ['zbyszek'],
  start: 'entry',
  nodes: {
    entry: {
      next: (S, D) => {
        if (!S.flag('met_zbyszek')) return 'f1';
        if (S.flag('dice_all_beaten') && !S.flag('dice_bone_set')) return 'bz1';
        if (S.flag('ending')) return 'r1';
        if (S.flag('echo_seen') && !S.flag('zbyszek_echo_greeted')) return 'e1';
        if (day(D) >= 2) return 'd1';
        return night(D) ? 'a1n' : 'a1';
      },
    },

    // ---- first visit ---------------------------------------------------------------------
    f1: { s: 'narrator', t: 'He puts a mug in front of her before she has asked.', italic: true, dur: 2.6, next: 'f2' },
    f2: { s: 'zbyszek', t: "It's thin. I know it's thin. You try brewing with what we've got.", a: 'hands_hips', next: 'f3' },
    f3: { s: 'vesna', t: "I didn't say anything.", next: 'f4' },
    f4: { s: 'zbyszek', t: 'You were going to.', next: 'f5' },
    f5: { s: 'vesna', t: 'How much?', a: 'drink', next: 'f6' },
    f6: { s: 'zbyszek', t: "That one's mine. The next is a grosze.", next: 'f7' },
    f7: { s: 'vesna', t: 'Is there anything hot?', next: 'f8' },
    f8: { s: 'zbyszek', t: 'Fish soup. Two grosze.', next: 'f9' },
    f9: { s: 'vesna', t: 'Fish.', next: 'f10' },
    f10: { s: 'zbyszek', t: 'What did you want, a goose?', next: 'f11' },
    f11: { if: (S) => !!S.flag('contract_taken'), else: 'f11b', s: 'vesna', t: "There's a paper on the board in the square. Three men, it says.", next: 'f12' },
    f11b: { s: 'vesna', t: 'Is there any work here for a hunter?', next: 'f11c' },
    f11c: { s: 'zbyszek', t: "Work. There's a paper on the board since the morning. Go and read it.", next: 'f11d' },
    f11d: { s: 'vesna', t: "I'm asking you.", next: 'f12' },
    f12: { s: 'zbyszek', t: 'Three gone this month. Stach, Bolek, and the younger Wrona.', next: 'f13' },
    f13: { s: 'zbyszek', t: 'Went to their holes at dusk and the holes were empty in the morning. Not even the stools.', next: 'f14' },
    f14: { s: 'vesna', t: 'Did anyone go and look?', next: 'f15' },
    f15: { s: 'zbyszek', t: 'Old Wrona goes out to the holes every morning. Sits there till dark.', next: 'f16' },
    f16: { s: 'zbyszek', t: 'Nobody goes with him.', wait: 0.9, next: 'f17' },
    f17: { s: 'vesna', t: 'The paper says something walks the ice.', next: 'f18' },
    f18: { s: 'zbyszek', t: "Something's out there at night. I've seen it from the shore. Like people walking, but wrong. Slow.", a: 'point', next: 'f19' },
    f19: { s: 'vesna', t: 'How many?', next: 'f20' },
    f20: { s: 'zbyszek', t: "I didn't count. Four. Five. I had a line out, I'm allowed to have a line out.", next: 'f20b' },
    f20b: { s: 'zbyszek', t: "Out past the poles. I wasn't going to go and measure.", next: 'f23' },
    f23: { s: 'vesna', t: 'And before the equinox, it says.', next: 'f24' },
    f24: { s: 'zbyszek', t: "The rite's tomorrow night. Equinox. We drown Marzanna and the winter goes.", next: 'f25' },
    f25: { s: 'zbyszek', t: "We've done it three years running. Look outside.", wait: 1.1, a: 'point', next: 'f26' },
    f26: { s: 'zbyszek', t: "The girl's picked, anyway. Last week.", wait: 1.2, do: (S) => S.set('heard_of_maiden'), next: 'f27' },
    f27: { s: 'vesna', t: 'Who?', next: 'f28' },
    f28: { s: 'zbyszek', t: "Ask the reeve. It's not my business and I'm not saying it.", a: 'cross_arms', next: 'f29' },
    f29: { s: 'vesna', t: "The paper's signed H.", wait: 1.0, next: 'f30' },
    f30: { s: 'zbyszek', t: "H.? Only Hanka writes that fair. Her man was the scribe before the fever took him.", next: 'f31' },
    f31: { s: 'zbyszek', t: "She keeps to herself. House on the shore, east, past the huts. There's a bowl of milk by the door, you can't miss it. Don't ask her about the milk.", next: 'f32' },
    f32: { s: 'vesna', t: "You're sure it's her.", next: 'f33' },
    f33: {
      s: 'zbyszek', t: "I'm not sure of anything. I said only Hanka writes that fair. I didn't say it was her.",
      do: (S) => { S.set('met_zbyszek'); S.set('knows_fair_hand'); }, next: 'hub',
    },

    // ---- later visits ----------------------------------------------------------------------
    a1: {
      s: 'zbyszek', a: 'hands_hips',
      t: pick("Soup's still two grosze.", 'Wipe your boots.', 'Back, then.', "You're letting the heat out."),
      next: 'hub',
    },
    // after dark on day 1: the window is full of people counting
    a1n: {
      s: 'zbyszek', a: 'hands_hips',
      t: pick("That's the third man to stand at my window and count them. If you're not drinking, count outside.", 'Clear tonight. Everything in the yard will freeze and I will be told it was my fault.'),
      next: 'hub',
    },
    // first time in after the echo (day 2): she looks as bad as she is
    e1: { s: 'zbyszek', t: "You look like you've been dragged behind something.", do: (S) => S.set('zbyszek_echo_greeted'), next: 'e2' },
    e2: { s: 'vesna', t: 'Is there any soup?', next: 'e3' },
    e3: { s: 'zbyszek', t: "There's yesterday's.", next: 'e4' },
    e4: { s: 'zbyszek', t: "I'm not charging for yesterday's. Sit by the stove.", wait: 0.8, do: (S, D) => warm(D), next: 'e5' },
    e5: { s: 'vesna', t: 'Thanks.', a: 'eat', next: 'hub' },
    d1: {
      s: 'zbyszek',
      t: pick("I'm shutting at seven tonight. Everyone goes.", 'Soup, if you want it. Two grosze.', "Wipe your boots, I've done the floor twice.", "Not a herder up all day. That's snow by dark, you watch."),
      next: 'hub',
    },
    r1: {
      s: 'zbyszek', a: 'hands_hips',
      t: (S) => {
        const e = S.flag('ending');
        if (e === 'thaw') return "Hear that? The roof. It hasn't stopped dripping since morning. I've buckets on every floor.";
        if (e === 'looking_back') return "I've been up since four, emptying buckets. Mind the one by the door.";
        return "Soup's two grosze.";
      },
      next: 'hub',
    },

    // ---- the hub ---------------------------------------------------------------------------
    hub: {
      choices: [
        { t: 'The girl is Hanka\'s youngest. Ola.', next: 'ola1', once: true, if: (S) => !!S.flag('hanka_hired') && !S.flag('ending') },
        { t: 'Tell me about the three.', next: 'three1', once: true, if: (S) => !S.flag('ending') },
        { t: 'How long has it been like this?', next: 'winter1', once: true, if: (S) => !S.flag('ending') },
        { t: 'Who else knew them? Anyone who would talk?', next: 'friends1', once: true, if: (S) => !S.flag('ending') },
        { t: 'I came over the pass. There was a cart on the road.', next: 'cart1', once: true, if: (S) => !!S.data.notes?.includes('note_cart_family') },
        { t: "I found your three. They're under the ice, out by the old tower.", next: 'men1', once: true, if: (S) => !!S.flag('lair_seen') && !S.flag('ending') },
        { t: 'Three years ago. At the rite. Where were you?', next: 'rite1', once: true, if: (S) => !!S.flag('echo_seen') && !S.flag('ending') },
        { t: 'Are you going tonight?', next: 'tonight1', once: true, if: (S) => !!S.flag('echo_seen') && !S.flag('ending') },
        { t: 'There were lights over the lake when I came in.', next: 'sky1', once: true, if: (S) => !!S.flag('planetnicy_seen') && !S.flag('ending') },
        { t: 'A bowl of the soup. (2 grosze)', next: 'soup0' },
        { t: 'A Thaw draught. (12 grosze)', next: 'thaw0' },
        { t: 'Is there a bed?', next: 'bed1', exit: true },
        {
          t: (S) => (S.flag('dice_zbyszek_met') ? 'Play a round of dice?' : 'I heard dice when I came in.'),
          next: (S) => (S.flag('dice_zbyszek_met') ? 'da1' : 'dice1'),
          exit: true,
          if: (S) => !S.flag('rite_started') || !!S.flag('ending'),
        },
        { t: "That's all.", next: 'bye', exit: true },
      ],
    },

    // ---- topics --------------------------------------------------------------------------------
    ola1: { s: 'vesna', t: "The girl. It's Hanka's youngest.", next: 'ola2' },
    ola2: { s: 'zbyszek', t: "I didn't say that.", a: 'shake_head', next: 'ola3' },
    ola3: { s: 'vesna', t: "You didn't have to.", next: 'ola4' },
    ola4: { s: 'zbyszek', t: "She's eleven. She comes round for the scraps for the goat and I give her a bit extra. Don't tell anyone.", wait: 1.4, next: 'ola5' },
    ola5: { s: 'vesna', t: "Why didn't you say?", next: 'ola6' },
    ola6: { s: 'zbyszek', t: 'Say what? To who?', next: 'ola7' },
    ola7: { s: 'zbyszek', t: 'Bogdan counts my barley.', wait: 0.9, next: 'hub' },

    three1: { s: 'vesna', t: 'Tell me about the three.', next: 'three2' },
    three2: { s: 'zbyszek', t: 'Stach was fifty-odd, with a bad knee and a good net. Bolek was younger. Bolek owes me eleven grosze. Owed. I only say it because I wrote it down.', next: 'three3' },
    three3: { s: 'zbyszek', t: "And the Wrona boy, seventeen. That's his father you'll see at the holes.", next: 'three4' },
    three4: { s: 'zbyszek', t: "Stach's coat is still on the hook there. His wife hasn't come for it. I can't hang anything else on it.", wait: 1.0, next: 'hub' },

    winter1: { s: 'vesna', t: 'How long has it been like this?', next: 'winter2' },
    winter2: { s: 'zbyszek', t: "Three winters. I had onions behind the house. I've still got the box.", next: 'winter3' },
    winter3: { s: 'vesna', t: 'Is there grain?', next: 'winter4' },
    winter4: { s: 'zbyszek', t: "That's for Bogdan. He's the one with the sums.", next: 'hub' },

    friends1: { s: 'vesna', t: 'Who else knew them? Anyone who would talk?', next: 'friends2' },
    friends2: { s: 'zbyszek', t: "Everybody knew them. Old Wrona's by the door most mornings, if you've the stomach.", next: 'friends3' },
    friends3: { s: 'zbyszek', t: "And Jarek went out with Stach. He's in from dark, the corner there. He pays for one and I don't ask about the rest.", next: 'friends4' },
    friends4: { s: 'vesna', t: "Why's he drinking?", next: 'friends5' },
    friends5: { s: 'zbyszek', t: "Why's anyone. He's had a bad few years.", a: 'shrug', next: 'friends6' },
    friends6: { s: 'zbyszek', t: "Buy him one if you want him to talk. Don't buy him three.", next: 'hub' },

    cart1: { s: 'vesna', t: 'I came over the pass. There was a cart on the road. A man, a woman, a small girl.', next: 'cart2' },
    cart2: { s: 'zbyszek', t: 'A cart.', wait: 0.8, next: 'cart3' },
    cart3: { s: 'vesna', t: 'He had a letter on him. Tomasz.', next: 'cart4' },
    cart4: { s: 'zbyszek', t: 'Tomasz.', next: 'cart5' },
    cart5: { s: 'zbyszek', t: "He came in here and asked about the road. I told him don't. He said Mira wouldn't have another winter. Zosia had a cough.", wait: 1.0, next: 'cart6' },
    cart6: { s: 'zbyszek', t: "I didn't have anything to say to that.", next: 'cart7' },
    cart7: { s: 'vesna', t: 'No.', next: 'hub' },

    men1: { s: 'vesna', t: "I found your three. They're under the ice, out by the old tower.", next: 'men2' },
    men2: { s: 'zbyszek', t: 'Under it.', wait: 0.8, next: 'men3' },
    men3: { s: 'vesna', t: "They've been there a while.", next: 'men4' },
    men4: { s: 'zbyszek', t: 'Right.', wait: 1.2, next: 'men5' },
    men5: { s: 'zbyszek', t: 'Does Wrona know?', next: 'men6' },
    men6: { s: 'vesna', t: 'Not from me.', next: 'men7' },
    men7: { s: 'zbyszek', t: "Don't. Not today. If he knows he'll want to go out there.", next: 'men8' },
    men8: { s: 'zbyszek', t: "He goes out there every day anyway. I'll tell his wife. After the rite.", wait: 0.8, next: 'hub' },

    rite1: { s: 'vesna', t: 'Three years ago. At the rite. Where were you?', cam: 'close', next: 'rite2' },
    rite2: { s: 'zbyszek', t: 'In the line. Near the back, with the torches.', next: 'rite3' },
    rite3: { s: 'zbyszek', t: "It was snowing, you couldn't see the one beside you.", next: 'rite4' },
    rite4: { s: 'vesna', t: 'Did you hear anything?', next: 'rite5' },
    rite5: { s: 'zbyszek', t: 'We were singing.', wait: 1.5, next: 'rite6' },
    rite6: { s: 'zbyszek', t: "It's a long way out and a long way back and it's cold. You sing loud.", next: 'rite7' },
    rite7: { s: 'narrator', t: 'Vesna waits.', italic: true, dur: 2.2, next: 'rite8' },
    rite8: { s: 'zbyszek', t: "I've a pot on.", a: 'stir', wait: 0.6, next: 'hub' },

    tonight1: { s: 'vesna', t: 'Are you going tonight?', next: 'tonight2' },
    tonight2: { s: 'zbyszek', t: "Everybody goes. I carry a torch. It's my turn. It's been my turn every year, I don't know how that works.", next: 'tonight3' },
    tonight4: { s: 'vesna', t: "You'll shut the place?", next: 'tonight5' },
    tonight3: { s: 'zbyszek', t: "I'm shutting at seven.", next: 'tonight4' },
    tonight5: { s: 'zbyszek', t: "There's a barrel in the cellar I put by the first winter. For when it ended. It'll have turned by now.", next: 'tonight6' },
    tonight6: { s: 'vesna', t: "You won't know till you open it.", next: 'tonight7' },
    tonight7: { s: 'zbyszek', t: "I know that. It's for after.", next: 'hub' },

    // the lights: he reads them like weather, and only wants to know low or high
    sky1: { s: 'vesna', t: 'There were lights over the lake when I came in.', next: 'sky2' },
    sky2: { s: 'zbyszek', t: 'Low or high?', next: 'skyq' },
    skyq: {
      choices: [
        { t: 'Low.', next: 'sky_lo' },
        { t: 'High.', next: 'sky_hi' },
        { t: "I didn't look.", next: 'sky_no' },
      ],
    },
    sky_lo: { s: 'vesna', t: 'Low.', next: 'sky_lo2' },
    sky_lo2: { s: 'zbyszek', t: "Then it's clear. No snow, hard frost by morning. Bring your water in or it'll split the barrel. It's on the page by the door, if you want it in writing.", next: 'sky_end' },
    sky_hi: { s: 'vesna', t: 'High.', next: 'sky_hi2' },
    sky_hi2: { s: 'zbyszek', t: "Then it's snow before noon. Don't hang anything out. It's on the page by the door, if you want it in writing.", next: 'sky_end' },
    sky_no: { s: 'vesna', t: "I didn't look.", next: 'sky_no2' },
    sky_no2: { s: 'zbyszek', t: "Look on your way out. Low or high, that's all I need.", next: 'sky_end' },
    sky_end: { s: 'zbyszek', t: "And don't point at them in here. I've had a man walk out over it.", next: 'hub' },

    // ---- dice ----------------------------------------------------------------------------------
    // The first time: what the game is, who plays it, and what he will put out himself.
    dice1: { s: 'vesna', t: 'I heard dice when I came in.', do: (S) => { S.set('dice_zbyszek_met'); S.set('dice_known'); }, next: 'dice2' },
    dice2: { s: 'zbyszek', t: "Wojtek and Halina. Middle table, every day from noon. They'd play till the candles went if I let them.", next: 'dice3' },
    dice3: { s: 'zbyszek', t: "Kosci. Five dice, best of three. It's chalked up on the beam over the bar, if you can read it.", next: 'dice4' },
    dice4: { s: 'vesna', t: 'Do you play?', next: 'dice5' },
    dice5: { s: 'zbyszek', t: "Across the bar. A grosze, two, three. That's all I put out, it's the till's money, not mine.", next: 'dice6' },
    dice6: { s: 'zbyszek', t: "Wojtek bets like it's somebody else's wages. Halina goes up on nothing now and then, so don't fold the first time she does.", next: 'dice7' },
    dice7: {
      choices: [
        { t: 'A round, then.', next: 'dice8' },
        { t: 'Not now.', next: 'hub' },
      ],
    },
    dice8: { s: 'vesna', t: 'A round, then.', next: 'dice_start' },
    // Later: she asks, he answers in a breath.
    da1: { s: 'vesna', t: 'Play a round of dice?', next: 'da2' },
    da2: { s: 'zbyszek', t: pick("If you've got it on you.", 'Go on. I have a pot on, so be quick.', 'Put it on the bar.'), next: 'dice_start' },
    // The checks, in order: is it too late in the day, is he out of money, is she.
    dice_start: { if: (S, D) => !(day(D) >= 2 && !S.flag('ending') && (D.G.time?.hours ?? 12) >= 18.5), else: 'dice_late', next: 'dice_broke_check' },
    dice_broke_check: { if: (S, D) => !D.G.dice || D.G.dice.canPlay('zbyszek').reason !== 'opp_short', else: 'dice_broke', next: 'dice_cash' },
    dice_cash: { if: (S) => S.has('coins', 2), else: 'dice_poor', next: 'dice_go' },
    dice_go: { s: 'zbyszek', t: 'Right. Put it on the bar.', end: true },
    dice_late: { s: 'zbyszek', t: "Not tonight. I'm shutting at seven, and everyone goes down to the shore.", next: 'hub' },
    dice_broke: { s: 'zbyszek', t: "I've put out what I'm putting out for today. Come back tomorrow.", next: 'hub' },
    dice_poor: { s: 'zbyszek', t: "You haven't two grosze to put on the bar.", next: 'hub' },
    // After she has beaten all three of them.
    bz1: { s: 'zbyszek', t: "Wojtek's been in. Halina twice.", next: 'bz2' },
    bz2: { s: 'vesna', t: 'Told you what?', next: 'bz3' },
    bz3: { s: 'zbyszek', t: "That you've beaten the three of us.", next: 'bz4' },
    bz4: { s: 'zbyszek', t: 'Wait there.', wait: 0.7, do: (S) => { S.give('bone_dice'); S.set('dice_bone_set'); }, next: 'bz5' },
    bz5: { s: 'zbyszek', t: "These were my father's. Bone, the pips cut deep. They roll true.", next: 'bz6' },
    bz6: { s: 'vesna', t: 'Why give them to me?', next: 'bz7' },
    bz7: { s: 'zbyszek', t: "I never won with them. Take them before Wojtek hears about them.", next: 'hub' },

    // ---- the shop ------------------------------------------------------------------------------
    soup0: { if: (S) => S.has('coins', 2), else: 'soup_no', s: 'vesna', t: 'A bowl of the soup.', next: 'soup1' },
    soup1: { s: 'zbyszek', t: "Mind it, it's hot.", do: (S, D) => { S.take('coins', 2); warm(D); }, next: 'soup2' },
    soup2: { s: 'vesna', t: 'Thanks.', a: 'eat', next: 'hub' },
    soup_no: { s: 'zbyszek', t: 'Two grosze.', next: 'soup_no2' },
    soup_no2: { s: 'vesna', t: "I haven't got it yet.", next: 'soup_no3' },
    soup_no3: { s: 'zbyszek', t: "Then come back when you have. I'd give it to you. I can't, they'd all want it.", next: 'soup_no4' },
    soup_no4: { s: 'vesna', t: 'All right.', next: 'hub' },

    thaw0: { if: (S) => S.has('coins', 12), else: 'thaw_no', s: 'vesna', t: 'What have you got for the cold, besides soup?', next: 'thaw1' },
    thaw1: { s: 'zbyszek', t: "Thaw draughts. Twelve grosze, and before you say anything, I don't set the price.", next: 'thaw2' },
    thaw2: { s: 'vesna', t: 'One.', next: 'thaw3' },
    thaw3: { s: 'zbyszek', t: 'There. Twelve.', do: (S) => { S.take('coins', 12); S.give('thaw', 1); }, next: 'hub' },
    thaw_no: { s: 'vesna', t: 'What have you got for the cold, besides soup?', next: 'thaw_no2' },
    thaw_no2: { s: 'zbyszek', t: "Thaw draughts. Twelve grosze, and I don't set the price.", next: 'thaw_no3' },
    thaw_no3: { s: 'vesna', t: 'Not yet.', next: 'thaw_no4' },
    thaw_no4: { s: 'zbyszek', t: "Well, it's not going anywhere. I've two.", next: 'hub' },

    // ---- bed and goodbye -------------------------------------------------------------------------
    bed1: { s: 'vesna', t: 'Is there a bed?', next: 'bed2' },
    bed2: { s: 'zbyszek', t: 'Upstairs, end of the landing. Boots off.', next: 'bed3' },
    bed3: { s: 'zbyszek', t: "Nobody's paid for it since the autumn, so I'm not asking.", next: 'bed4' },
    bed4: { s: 'vesna', t: 'Wake me at dusk.', next: 'rest_dusk' },
    rest_dusk: { s: 'zbyszek', t: "I'll knock.", end: true },

    bye: { s: 'zbyszek', t: "Shut the door behind you, you're letting the heat out.", end: true },
  },
};
