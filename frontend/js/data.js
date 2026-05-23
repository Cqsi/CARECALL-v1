/* ------------------------------------------------------------------ *
 *  DATA MODEL — your backend fills this from call webhooks in
 *  production. Dashboard only reads from here, so it never goes blank.
 * ------------------------------------------------------------------ */
const residents = [
  { id:'r1', name:'Aino Virtanen', age:84, district:'Nummi', status:'alert', trend:[4,4,3,3,2,2,1], last:'Today 09:12', dir:'out', dur:'4m 18s',
    flag:{level:'red', title:'Possible fall / mobility change', detail:'Resident mentioned falling in the bathroom yesterday and feeling unsteady. No injury reported but a follow-up visit is recommended within 24h.'},
    transcript:[
      {r:'ai', t:'Good morning, Aino. It\'s your CareCall check-in. How are you feeling today?'},
      {r:'user', t:'Oh, morning. I\'m alright I suppose. A bit shaken though.'},
      {r:'ai', t:'I\'m sorry to hear that. What happened?'},
      {r:'user', t:'I had a little fall in the bathroom yesterday evening. I didn\'t hurt myself badly but I\'ve been unsteady on my feet since.', flag:['fall','unsteady']},
      {r:'ai', t:'Thank you for telling me, that\'s important. Are you in any pain right now, and were you able to get up by yourself?'},
      {r:'user', t:'I managed to get up, slowly. My hip is a bit sore but nothing broken I think.'},
      {r:'ai', t:'I understand. I\'m going to let your care team know so someone can check in on you today. Is there anything you need in the meantime?'},
      {r:'user', t:'No, that\'s kind of you. Maybe just someone to talk to.'},
      {r:'ai', t:'I\'m here. Let\'s have a proper chat — and your nurse will be in touch shortly.'}
    ]},
  { id:'r2', name:'Eero Lahtinen', age:79, district:'Port Arthur', status:'watch', trend:[5,5,4,4,4,3,3], last:'Today 08:47', dir:'out', dur:'3m 02s',
    flag:{level:'amber', title:'Low mood — third day', detail:'Sentiment trending down over the last three check-ins. Resident expressed loneliness and reduced appetite. Suggest social prescribing referral.'},
    transcript:[
      {r:'ai', t:'Hello Eero, good morning. How did you sleep?'},
      {r:'user', t:'Not great. I don\'t see much point getting up early these days.', flag:['point getting up']},
      {r:'ai', t:'That sounds heavy. Has something been on your mind?'},
      {r:'user', t:'It\'s quiet here since my wife passed. The days are long.', flag:['quiet','days are long']},
      {r:'ai', t:'I\'m really sorry, Eero. That kind of quiet is hard. Have you been eating okay?'},
      {r:'user', t:'Not much of an appetite, to be honest.', flag:['appetite']},
      {r:'ai', t:'Thank you for being honest with me. There\'s a community lunch group on Thursdays nearby — would you like me to ask someone to tell you more about it?'},
      {r:'user', t:'Maybe. That might be nice.'}
    ]},
  { id:'r3', name:'Marja Koskinen', age:88, district:'Nummi', status:'watch', trend:[4,3,4,3,3,3,2], last:'Today 09:40', dir:'out', dur:'5m 33s',
    flag:{level:'amber', title:'Possible memory concern', detail:'Resident repeated the same question three times and was uncertain about the day. Recommend cognitive screening at next nurse visit.'},
    transcript:[
      {r:'ai', t:'Good morning Marja, it\'s your daily call. How are you?'},
      {r:'user', t:'Hello dear. What day is it today?'},
      {r:'ai', t:'It\'s Friday today, Marja.'},
      {r:'user', t:'Friday already. And have I taken my pills? What day is it?', flag:['what day','pills']},
      {r:'ai', t:'It\'s Friday. Your morning medication reminder went off at eight — did you manage to take them?'},
      {r:'user', t:'I think so. Remind me, what day is it now?', flag:['what day']},
      {r:'ai', t:'Still Friday. I\'ll note that you might like a little extra support remembering, and let your nurse know. No rush at all.'}
    ]},
  { id:'r4', name:'Tapio Niemi', age:81, district:'Hirvensalo', status:'ok', trend:[4,4,4,5,4,5,5], last:'Today 08:30', dir:'in', dur:'2m 15s', flag:null,
    transcript:[
      {r:'ai', t:'CareCall, good morning Tapio.'},
      {r:'user', t:'Morning! Just calling to say I\'ll be at my daughter\'s this weekend, so no need to ring me Saturday.'},
      {r:'ai', t:'Wonderful, thank you for letting me know. I\'ll pause Saturday\'s call. Have a lovely time.'},
      {r:'user', t:'Will do. Feeling good this week, the new walking route helps.'},
      {r:'ai', t:'That\'s great to hear. Enjoy the weekend, Tapio.'}
    ]},
  { id:'r5', name:'Liisa Mäkinen', age:86, district:'Port Arthur', status:'ok', trend:[5,5,5,4,5,5,5], last:'Today 09:05', dir:'out', dur:'3m 48s', flag:null,
    transcript:[
      {r:'ai', t:'Good morning Liisa, how are you feeling today?'},
      {r:'user', t:'Very well thank you, the sun is out for once!'},
      {r:'ai', t:'It is lovely. Did you sleep well?'},
      {r:'user', t:'Like a log. And I\'ve already had my porridge and my pills.'},
      {r:'ai', t:'Perfect. You\'re doing everything right. Anything you need today?'},
      {r:'user', t:'No, all good here. Thank you for checking, it\'s nice to hear a voice.'}
    ]},
  { id:'r6', name:'Veikko Salo', age:90, district:'Hirvensalo', status:'watch', trend:[4,4,3,4,3,3,3], last:'Yesterday 09:20', dir:'out', dur:'No answer',
    flag:{level:'amber', title:'Missed check-in (2 attempts)', detail:'Did not answer two scheduled calls. Auto-retry queued for 14:00, then escalation to on-call team.'},
    transcript:[
      {r:'ai', t:'Good morning Veikko, this is your CareCall check-in. (No answer — voicemail left.)'}
    ]},
  { id:'r7', name:'Helena Aho', age:83, district:'Nummi', status:'ok', trend:[5,4,5,5,4,5,4], last:'Today 08:55', dir:'out', dur:'2m 40s', flag:null,
    transcript:[
      {r:'ai', t:'Morning Helena, your daily check-in. How are you today?'},
      {r:'user', t:'Fine thank you, just a bit of a busy morning.'},
      {r:'ai', t:'Did you manage your morning medication?'},
      {r:'user', t:'Oh — not yet, I forgot with all the fuss.'},
      {r:'ai', t:'No problem at all. I\'ll send you a gentle reminder in twenty minutes. Take care, Helena.'}
    ]},
  { id:'r8', name:'Pentti Korhonen', age:78, district:'Port Arthur', status:'ok', trend:[5,5,5,5,5,4,5], last:'Today 09:30', dir:'out', dur:'3m 11s', flag:null,
    transcript:[
      {r:'ai', t:'Good morning Pentti, how are things?'},
      {r:'user', t:'Can\'t complain! Off to the library shortly.'},
      {r:'ai', t:'Lovely. Everything alright with sleep and meals?'},
      {r:'user', t:'All good. Pills taken, breakfast done.'},
      {r:'ai', t:'Perfect, enjoy the library. Talk tomorrow.'}
    ]}
];

const alerts = [
  { resId:'r1', level:'red', title:'Aino Virtanen — fall reported', desc:'Mentioned a bathroom fall and unsteadiness. Routed to on-call nurse.', when:'9 min ago' },
  { resId:'r2', level:'amber', title:'Eero Lahtinen — low mood (day 3)', desc:'Declining sentiment + reduced appetite. Social referral suggested.', when:'1 h ago' },
  { resId:'r3', level:'amber', title:'Marja Koskinen — memory concern', desc:'Repeated questions, day disorientation. Flagged for screening.', when:'2 h ago' },
  { resId:'r6', level:'amber', title:'Veikko Salo — no answer (2 attempts)', desc:'Missed scheduled check-in twice. Auto-retry at 14:00, then escalate.', when:'3 h ago' },
  { resId:'r7', level:'amber', title:'Helena Aho — medication not confirmed', desc:'Did not confirm morning dose during call. Reminder re-sent.', when:'4 h ago' }
];

const callLog = [
  { resId:'r3', dir:'out', sub:'Outbound check-in · flagged', dur:'5m 33s', time:'09:40' },
  { resId:'r8', dir:'out', sub:'Outbound check-in · normal', dur:'3m 11s', time:'09:30' },
  { resId:'r1', dir:'out', sub:'Outbound check-in · escalated', dur:'4m 18s', time:'09:12' },
  { resId:'r5', dir:'out', sub:'Outbound check-in · normal', dur:'3m 48s', time:'09:05' },
  { resId:'r7', dir:'out', sub:'Outbound check-in · normal', dur:'2m 40s', time:'08:55' },
  { resId:'r2', dir:'out', sub:'Outbound check-in · flagged', dur:'3m 02s', time:'08:47' },
  { resId:'r4', dir:'in',  sub:'Inbound · schedule change', dur:'2m 15s', time:'08:30' },
  { resId:'r5', dir:'out', sub:'Outbound check-in · normal', dur:'4m 02s', time:'08:11' }
];
