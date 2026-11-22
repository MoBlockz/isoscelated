/* =========================================================================
 *  Isoscelated - chat & name safety filter          (js/filter.js)
 *
 *  Plain JS, no build step. Works in the browser (window.ChatFilter) and
 *  in Node (module.exports) for testing:  node tools/filter-test.js
 *
 *  API:
 *    ChatFilter.clean(text)     -> tidied string
 *    ChatFilter.check(text)     -> {ok:true, text} | {ok:false, reason:'bad'|'personal'|'empty'}
 *    ChatFilter.checkName(name) -> {ok:true, name} | {ok:false, reason:'empty'|'long'|'chars'|'bad'|'personal'}
 * ========================================================================= */

var ChatFilter = (function () {
  'use strict';

  /* =======================================================================
   *  EDITABLE WORD LISTS
   * -----------------------------------------------------------------------
   *  HOW TO ADD A WORD:
   *   - Type it in lower case with plain letters. You do NOT need to add
   *     l33t (5tup1d), spaced (s t u p i d), dotted (s.t.u.p.i.d) or
   *     stretched (stuuuupid) versions - the filter works those out itself.
   *   - BLOCKED_WORDS       -> blocked ANYWHERE, even inside a longer word
   *                            ("idiot" also blocks "youidiotface").
   *                            Use for long words that are never innocent.
   *   - BLOCKED_WHOLE_WORDS -> only blocked as a word on its own (plus an
   *                            "s"/"es" plural). Use for short words that
   *                            hide inside innocent words ("ass" is inside
   *                            "class", "hell" inside "hello").
   *   - BLOCKED_PHRASES     -> groups of words ("kill yourself").
   *                            (A word with a space in it added to either
   *                            word list is treated as a phrase.)
   *   - ALLOWED_WORDS       -> innocent words that happen to contain a
   *                            blocked word. If something gets blocked by
   *                            mistake, add the innocent word here.
   *  The personal-info lists further down work the same way.
   * ======================================================================= */

  var BLOCKED_WORDS = [
    // --- rude / insulting ---
    'stupid', 'idiot', 'imbecile', 'moron', 'dumb', 'dimwit', 'nitwit',
    'halfwit', 'bonehead', 'numbskull', 'cretin', 'worthless', 'fatso',
    'scumbag', 'crappy', 'damn', 'bullcrap',
    // --- adult / body ---
    'sexy', 'sexual', 'boobies', 'nipple', 'testicle', 'scrotum', 'condom',
    'erection', 'stripper', 'brothel',
    // --- drugs, alcohol, smoking ---
    'vodka', 'whisky', 'whiskey', 'tequila', 'champagne', 'alcohol',
    'booze', 'drunk', 'cocaine', 'marijuana', 'cannabis', 'ecstasy', 'mdma',
    'ketamine', 'fentanyl', 'opium', 'shrooms', 'cigarette', 'hangover',
    'vaping', 'xanax'
    // (stronger swears & slurs are added from HIDDEN_WORDS below)
  ];

  var BLOCKED_WHOLE_WORDS = [
    // --- rude / insulting ---
    'ugly', 'loser', 'jerk', 'dunce', 'fatty', 'dork', 'pathetic', 'scum',
    'weirdo', 'hell', 'crap', 'bugger', 'tosser', 'butt', 'shutup',
    'yousuck', 'usuck', 'godie', 'kys', 'kms', 'stfu',
    // --- adult / body ---
    'boob', 'boobs', 'nude', 'nudez', 'noodz', 'naked', 'horny', 'rape', 'raped', 'rapist',
    'anal', 'anus', 'sex', 'thot', 'hoe', 'milf', 'nsfw', 'xxx',
    // --- drugs, alcohol, smoking ---
    'weed', 'beer', 'wine', 'rum', 'gin', 'cider', 'lager', 'meth',
    'heroin', 'drug', 'drugs', 'lsd', 'stoned', 'tipsy', 'vape', 'bong',
    'cig', 'cigs'
    // (more are added from HIDDEN_WHOLE_WORDS below)
  ];

  var BLOCKED_PHRASES = [
    // --- self-harm / bullying ---
    'kill yourself', 'kill urself', 'kill your self', 'kill ur self',
    'kill yourselves', 'kill myself', 'go die', 'go and die', 'go away and die',
    'i hope you die', 'hope you die', 'hope u die', 'you should die',
    'u should die', 'drop dead', 'die in a hole', 'neck yourself',
    'end yourself', 'unalive yourself', 'hang yourself',
    'you are stupid', 'youre stupid', 'ur stupid', 'u r stupid',
    'you are dumb', 'youre dumb', 'ur dumb', 'you are ugly', 'youre ugly',
    'ur ugly', 'you are fat', 'youre fat', 'ur fat', 'u r fat',
    'you are trash', 'youre trash', 'ur trash', 'you are a loser',
    'youre a loser', 'ur a loser', 'nobody likes you', 'nobody likes u',
    'no one likes you', 'no one likes u', 'noone likes you',
    'everyone hates you', 'everybody hates you', 'nobody wants you',
    'no one wants you', 'you have no friends', 'you got no friends',
    'i hate you', 'i hate u', 'we hate you', 'you suck', 'u suck',
    'you sux', 'u sux', 'shut up', 'shut your mouth', 'shut ur mouth',
    'go away loser', 'get lost', 'your mom', 'your mum', 'ur mom', 'ur mum',
    'yo mama', 'yo momma', 'screw you', 'screw u', 'suck my', 'eat my',
    'up yours', 'eff off', 'f off', 'sod off',
    // --- hate ---
    'sieg heil', 'heil hitler', 'white power', 'go back to your country'
  ];

  var ALLOWED_WORDS = [
    // contain "ass"
    'class', 'classes', 'classic', 'classy', 'classroom', 'grass', 'grassy',
    'grasshopper', 'pass', 'passed', 'passing', 'passage', 'passenger',
    'passion', 'password', 'passport', 'bass', 'bassist', 'glass', 'glasses',
    'brass', 'mass', 'massive', 'lass', 'lassie', 'sass', 'sassy', 'compass',
    'embassy', 'ambassador', 'assassin', 'assist', 'assistant', 'assume',
    'assignment', 'assemble', 'assembly', 'associate', 'asset', 'assess',
    'assault', 'cassie', 'cassidy', 'cassius', 'cassette', 'hassle', 'hassan',
    'molasses', 'carcass', 'trespass', 'bypass', 'surpass',
    // contain "cunt" / "shit" / "fuk" / "cock" / "dick"
    'scunthorpe', 'shitake', 'shiitake', 'matsushita', 'fukushima',
    'cockpit', 'cocktail', 'cocktails', 'cockatoo', 'cockroach', 'peacock',
    'hancock', 'hitchcock', 'cockerel', 'shuttlecock', 'woodcock', 'cockney',
    'dickens', 'dickson', 'dickinson', 'benedick',
    // contain "hell"
    'hello', 'shell', 'shells', 'shelly', 'shelley', 'michelle', 'rochelle',
    'shellfish', 'seashell', 'eggshell', 'nutshell', 'othello',
    // contain "tit"
    'title', 'titles', 'titan', 'titanic', 'titanium', 'titus', 'entitle',
    'entitled', 'petition', 'competition', 'appetite', 'institute',
    'constitution', 'attitude', 'partition', 'repetition', 'superstition',
    'stitch', 'stitches',
    // contain "cum" / "anal" / "anus" / "sex"
    'cucumber', 'document', 'documents', 'circumstance', 'accumulate',
    'cumulus', 'cumulative', 'cumbersome', 'cumberland', 'analysis',
    'analyse', 'analyze', 'analyst', 'analog', 'analogue', 'canal', 'banal',
    'janus', 'uranus', 'manuscript', 'sussex', 'essex', 'wessex',
    'middlesex', 'sextant', 'sexton',
    // contain "butt" / "rape" / "rapist"
    'button', 'buttons', 'butter', 'butterfly', 'buttercup', 'butterscotch',
    'rebuttal', 'buttress', 'grape', 'grapes', 'grapefruit', 'drape',
    'drapes', 'scrape', 'scraper', 'skyscraper', 'trapeze', 'parapet',
    'therapist', 'therapists',
    // drug / drink words inside innocent words
    'seaweed', 'tumbleweed', 'tweed', 'method', 'methods', 'something',
    'methane', 'prometheus', 'swine', 'twine', 'heroine', 'heroines',
    'villager', 'villagers', 'bongo', 'bongos', 'drugstore',
    'ginger', 'begin', 'engine', 'origin', 'imagine', 'region', 'login',
    'plugin', 'margin', 'drum', 'drummer', 'forum', 'spectrum', 'rumble',
    'shoe', 'shoes', 'horseshoe', 'whoever', 'phoenix',
    // misc
    'dumbbell', 'dumbbells', 'dumbfounded', 'smugly', 'closer', 'jerky',
    'raccoon', 'cocoon', 'tycoon', 'spicy', 'spice', 'spices', 'auspicious',
    'conspicuous', 'pakistan', 'tardis', 'custard', 'mustard', 'stardust',
    'leotard', 'stardom', 'arsenal', 'arsenic', 'parse', 'parsec', 'sparse',
    'coarse', 'hoarse', 'prickly', 'pissarro', 'thorny', 'denude', 'scrap',
    'scrappy', 'scraps', 'ashkenazi', 'fagin', 'niggle', 'niggles',
    'niggling', 'snigger', 'sniggering', 'oxymoron', 'retardant', 'swank',
    'swanky', 'penistone', 'condominium', 'sympathetic', 'empathetic',
    'milford', 'dorking', 'hexed', 'sus'
  ];

  /* --- Strongest swears & slurs -------------------------------------------
   *  Stored BACKWARDS so this file isn't a wall of nasty words
   *  ("toidi" would mean "idiot"). They are flipped round when the file
   *  loads and added to the lists above. To add a new strong word you can
   *  either add it normally to the lists above, or add it here backwards.
   * ----------------------------------------------------------------------- */
  var HIDDEN_WORDS = 'kcuf,kcf,kuf,quf,kucf,kcuhp,frehtom,tihs,tnuc,hctib,hctaib,' +
    'dratsab,knaw,tawt,kcollob,dnelleb,daehbonk,daehkcid,ehcuod,elohssa,' +
    'elohesra,tahssa,ssakcaj,ssabmud,ssip,erohw,tuls,knaks,ggin,toggaf,togaf,' +
    'ynnart,kcabtew,daehlewot,daehgar,oppyg,izan,drater,yssup,odlid,bojwolb,' +
    'bojdnah,zzij,nrop,iatneh,msagro,sinep,anigav,snafylno,citsaps';
  var HIDDEN_WHOLE_WORDS = 'gaf,ekyd,cips,knihc,ekik,koog,nooc,ikap,renaeb,yekip,' +
    'drat,omoh,obsel,agin,kkk,lieh,kcoc,kcid,muc,tit,yttit,seittit,kcirp,esra,' +
    'ssa,ftw,ufts,oftg,oafml,gfmo,lmf,zaps,gals,renob';

  /* =======================================================================
   *  PERSONAL INFO LISTS  (reason: 'personal')
   * ======================================================================= */

  // Blocked anywhere in a message (as whole words / word groups).
  var PERSONAL_PHRASES = [
    'how old are you', 'how old are u', 'how old r you', 'how old r u',
    'how old ru', 'how old u', 'what age are you', 'what age r u',
    'your age', 'ur age', 'asl', 'boy or girl',
    'where do you live', 'where do u live', 'where you live', 'where u live',
    'where do you stay', 'where do you go to school', 'where do u go to school',
    'where are you from', 'where r u from', 'where you from', 'where u from',
    'what country', 'which country', 'what city', 'which city', 'what town',
    'which town', 'what state',
    'what school', 'which school', 'wat school', 'what grade', 'which grade',
    'what year are you in', 'your school', 'ur school', 'my school',
    'add me', 'friend me', 'dm me', 'pm me', 'message me', 'text me',
    'call me on', 'call me at', 'ring me', 'hit me up', 'hmu',
    'my number', 'my phone', 'my cell', 'my mobile', 'my address', 'my addy',
    'my email', 'my e mail', 'my snap', 'my insta', 'my ig', 'my discord',
    'my tiktok', 'my username', 'my user', 'my gamertag', 'my real name',
    'my full name', 'my last name', 'my surname', 'my postcode', 'my zip',
    'my house', 'my street', 'my birthday', 'my age is',
    'your real name', 'ur real name', 'your full name', 'ur full name',
    'your last name', 'ur last name', 'your surname', 'your username',
    'ur username', 'your gamertag',
    'i live at', 'i live on', 'i live in', 'i live near', 'come to my house',
    'come over',
    'meet up', 'meetup', 'meet irl', 'meet me irl', 'meet me in real life',
    'irl', 'in real life', 'lets meet', 'wanna meet', 'want to meet',
    'meet in person', 'in person', 'meet me at my', 'meet me outside',
    'send pics', 'send pic', 'send me pics', 'send me pic', 'send me a pic',
    'send a pic', 'send photos', 'send photo', 'send me a photo',
    'send a photo', 'send selfie', 'send me a selfie', 'send a selfie',
    'send nudes', 'send me nudes', 'pic of you', 'pics of you',
    'picture of you', 'pictures of you', 'photo of you', 'photos of you',
    'show me your face', 'face reveal'
  ];

  // "what's your ___" / "send me your ___" / "give me ur ___" are blocked
  // for each of these things:
  var PERSONAL_INFO_WORDS = [
    'address', 'addy', 'snap', 'snapchat', 'insta', 'instagram', 'ig',
    'discord', 'tiktok', 'number', 'phone', 'phone number', 'cell', 'mobile',
    'email', 'e mail', 'mail', 'school', 'real name', 'last name', 'surname',
    'full name', 'age', 'birthday', 'postcode', 'post code', 'zip',
    'zip code', 'location', 'house', 'street', 'city', 'town', 'username',
    'user name', 'user', 'account', 'gamertag', 'roblox', 'fortnite', 'psn',
    'xbox', 'whatsapp', 'kik', 'telegram', 'facebook', 'fb', 'twitter',
    'youtube', 'twitch', 'steam', 'socials'
  ];

  // Blocked after "add me on", "follow me on", "dm me on", "are you on"...
  var PLATFORMS = [
    'snap', 'snapchat', 'insta', 'instagram', 'ig', 'discord', 'tiktok',
    'youtube', 'yt', 'twitch', 'twitter', 'facebook', 'fb', 'messenger',
    'whatsapp', 'kik', 'telegram', 'wechat', 'signal', 'skype', 'facetime',
    'zoom', 'roblox', 'fortnite', 'minecraft', 'xbox', 'xbl', 'psn',
    'playstation', 'steam', 'epic', 'reddit', 'bereal', 'threads', 'email',
    'gmail', 'phone'
  ];

  // Blocked whenever they appear at all (messaging apps & email providers).
  var CONTACT_APPS = [
    'snapchat', 'instagram', 'discord', 'whatsapp', 'kik', 'telegram',
    'wechat', 'facetime', 'skype', 'gmail', 'hotmail', 'icloud',
    'protonmail', 'googlemail'
  ];

  // Short drink words that are fine INSIDE a player name ("Ginger", "Drummer").
  var NAME_INSIDE_OK = ['gin', 'rum', 'hoe'];

  /* ======================================================================= */

  function rev(s) { return s.split('').reverse().join(''); }
  BLOCKED_WORDS = BLOCKED_WORDS.concat(HIDDEN_WORDS.split(',').map(rev));
  BLOCKED_WHOLE_WORDS = BLOCKED_WHOLE_WORDS.concat(HIDDEN_WHOLE_WORDS.split(',').map(rev));

  var api = {
    BLOCKED_WORDS: BLOCKED_WORDS,
    BLOCKED_WHOLE_WORDS: BLOCKED_WHOLE_WORDS,
    BLOCKED_PHRASES: BLOCKED_PHRASES,
    ALLOWED_WORDS: ALLOWED_WORDS,
    PERSONAL_PHRASES: PERSONAL_PHRASES,
    PERSONAL_INFO_WORDS: PERSONAL_INFO_WORDS,
    PLATFORMS: PLATFORMS,
    CONTACT_APPS: CONTACT_APPS,
    MAX_LENGTH: 100,
    clean: clean,
    check: check,
    checkName: checkName
  };

  /* ---------------- text normalising helpers ---------------- */

  // Look-alike letters from other alphabets (Cyrillic etc).
  var LOOKALIKE = {
    '\u0430': 'a', '\u0435': 'e', '\u043E': 'o', '\u0440': 'p', '\u0441': 'c',
    '\u0443': 'y', '\u0445': 'x', '\u0456': 'i', '\u0458': 'j', '\u0455': 's',
    '\u043A': 'k', '\u043C': 'm', '\u0442': 't', '\u0432': 'b', '\u043D': 'h',
    '\u04CF': 'l', '\u0491': 'r', '\u0501': 'd'
  };
  // Leetspeak / symbol swaps. 1 ! | can be "i" or "l" so both are tried.
  var LEET = {
    '@': 'a', '4': 'a', '^': 'a', '$': 's', '5': 's', '\u00A7': 's', '0': 'o',
    '3': 'e', '\u20AC': 'e', '7': 't', '+': 't', '8': 'b', '9': 'g'
  };
  var LEET_IL = { '1': 1, '!': 1, '|': 1, '\u00A1': 1 };

  function fold(s) {
    s = String(s);
    if (s.normalize) s = s.normalize('NFKD');
    s = s.replace(/[\u0300-\u036F]/g, '').toLowerCase();
    return s.replace(/[\u0400-\u052F]/g, function (c) { return LOOKALIKE[c] || c; });
  }
  function leet(s, useL) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (LEET_IL[ch]) out += useL ? 'l' : 'i';
      else out += LEET[ch] || ch;
    }
    return out;
  }
  function collapse(s) { return s.replace(/([a-z])\1+/g, '$1'); }
  function normWord(w) { return leet(fold(w), false).replace(/[^a-z]/g, ''); }
  function normPhrase(p) {
    return collapse(String(p).split(/\s+/).map(normWord).filter(Boolean).join(' '));
  }
  // "weed" -> "w+e{2,}d+" : letters may be stretched but not shortened.
  function runSrc(w) {
    return w.replace(/([a-z])\1*/g, function (m, c) {
      return m.length > 1 ? c + '{' + m.length + ',}' : c + '+';
    });
  }

  // Turn one typed word into normalised forms. Index 0 = "1 means i",
  // index 1 = "1 means l".
  function normToken(tok) {
    var t = fold(tok).replace(/^[("'\[{<]+/, '').replace(/[!?.,;:'")\]}>~]+$/, '');
    var hasLetter = /[a-z]/.test(t);
    var doLeet = hasLetter || t.length <= 2;
    var info = { raw: tok, plain: t.replace(/[^a-z]/g, ''), L: [], parts: [], star: null,
                 hasDigit: /\d/.test(t) };
    for (var v = 0; v < 2; v++) {
      var m = doLeet ? leet(t, v === 1) : t;
      var parts = m.split(/[^a-z]+/).filter(Boolean);
      info.parts.push(parts);
      info.L.push(parts.join(''));
    }
    // censored words like f*ck / sh*t : each * stands for one letter
    if (hasLetter && /[a-z0-9@$]\*+[a-z0-9@$]/.test(t)) {
      info.star = new RegExp('^' + leet(t, false).replace(/[^a-z*]/g, '').replace(/\*/g, '[a-z]') + '$');
    }
    return info;
  }

  /* ---------------- compiled dictionary (rebuilt if lists change) ---------------- */

  var cache = null, cacheKey = '';
  function compiled() {
    var key = [api.BLOCKED_WORDS, api.BLOCKED_WHOLE_WORDS, api.BLOCKED_PHRASES,
      api.ALLOWED_WORDS, api.PERSONAL_PHRASES, api.PERSONAL_INFO_WORDS,
      api.PLATFORMS, api.CONTACT_APPS].map(function (l) { return l.join(','); }).join('|');
    if (cache && key === cacheKey) return cache;

    var C = { sub: [], whole: [], phrases: [], compact: [], allowed: {}, allowedC: {},
              nameOk: {}, personal: [] };
    var phraseList = api.BLOCKED_PHRASES.slice();

    function addWord(w, isWhole) {
      if (/\s/.test(String(w).trim())) { phraseList.push(w); return; }
      var n = normWord(w);
      if (!n) return;
      var src = runSrc(n);
      var e = { w: n, sub: new RegExp(src), g: new RegExp(src, 'g') };
      if (isWhole) { e.whole = new RegExp('^' + src + '(?:e?s)?$'); C.whole.push(e); }
      else C.sub.push(e);
    }
    api.BLOCKED_WORDS.forEach(function (w) { addWord(w, false); });
    api.BLOCKED_WHOLE_WORDS.forEach(function (w) { addWord(w, true); });
    phraseList.forEach(function (p) {
      var n = normPhrase(p);
      if (!n) return;
      C.phrases.push(n);
      var c = collapse(n.replace(/ /g, ''));
      if (c.length >= 8) C.compact.push(c);
    });
    api.ALLOWED_WORDS.forEach(function (w) {
      var n = fold(w).replace(/[^a-z]/g, '');
      if (n) { C.allowed[n] = 1; C.allowedC[collapse(n)] = 1; }
    });
    NAME_INSIDE_OK.forEach(function (w) { C.nameOk[w] = 1; });

    C.personalPhrases = api.PERSONAL_PHRASES.map(normPhrase).filter(Boolean);
    function alt(list) {
      return list.map(normPhrase).filter(Boolean)
        .sort(function (a, b) { return b.length - a.length; }).join('|');
    }
    var ASK = alt(['what', 'whats', 'wats', 'wat', 'wut', 'wuts', 'wot', 'wots',
      'where', 'wheres', 'tell me', 'give me', 'gimme', 'send me', 'send', 'share',
      'drop', 'post', 'whats is']);
    var YOUR = alt(['your', 'ur', 'yur', 'yor', 'you', 'u', 'yo', 'ya', 'yours']);
    var INFO = alt(api.PERSONAL_INFO_WORDS);
    var PLAT = alt(api.PLATFORMS.concat(api.CONTACT_APPS));
    var VERB = alt(['follow', 'add', 'friend', 'dm', 'pm', 'message', 'msg', 'text',
      'call', 'find', 'chat', 'ping', 'talk', 'join', 'sub', 'subscribe']);
    var E = '(?= |$)', B = '(?:^| )';
    C.personal = [
      new RegExp(B + '(?:' + ASK + ')(?: is| are| r)? (?:' + YOUR + ') (?:' + INFO + ')' + E),
      new RegExp(B + '(?:' + VERB + ') (?:me|mi|meh|us) (?:on|at|in|thru|through|via|with) (?:' + PLAT + ')' + E),
      new RegExp(B + '(?:you|u|ya) (?:on|have|got|use|got a|have a) (?:' + PLAT + ')' + E),
      new RegExp(B + '(?:' + alt(api.CONTACT_APPS) + ')' + E)
    ];
    // checked on the un-collapsed words (so "www" isn't squashed to "w")
    C.personalRaw = [
      new RegExp(B + '(?:www|http|https)' + E),
      new RegExp(B + '(?:dot|dt) (?:com|net|org|gg|io|co|uk|tv|xyz)' + E)
    ];

    cache = C; cacheKey = key;
    return C;
  }

  function inAllowed(w, C) {
    if (!w) return false;
    if (C.allowed[w] || C.allowedC[collapse(w)]) return true;
    if (/s$/.test(w) && C.allowed[w.slice(0, -1)]) return true;
    if (/es$/.test(w) && C.allowed[w.slice(0, -2)]) return true;
    return false;
  }

  // Is this single normalised word (no spaces) bad?
  function wordBad(c, nameMode, C) {
    var i;
    for (i = 0; i < C.sub.length; i++) if (C.sub[i].sub.test(c)) return true;
    for (i = 0; i < C.whole.length; i++) {
      var e = C.whole[i];
      if (e.whole.test(c)) return true;
      if (nameMode && !C.nameOk[e.w] && e.sub.test(c)) return true;
    }
    return false;
  }

  function tokenBad(info, nameMode, C) {
    for (var v = 0; v < 2; v++) {
      var L = info.L[v];
      if (!L) continue;
      if (inAllowed(info.plain, C) || inAllowed(L, C)) continue;
      var cands = [L];
      if (info.parts[v].length > 1) cands = cands.concat(info.parts[v]);
      if (info.camel) cands = cands.concat(info.camel[v]);
      for (var k = 0; k < cands.length; k++) {
        if (k > 0 && inAllowed(cands[k], C)) continue;
        if (wordBad(cands[k], nameMode, C)) return true;
      }
    }
    if (info.star && !inAllowed(info.plain, C)) {
      var all = C.sub.concat(C.whole);
      for (var j = 0; j < all.length; j++) if (info.star.test(all[j].w)) return true;
    }
    return false;
  }

  // Letters joined across several words ("f u c k", "fu ck", names "Fu Ck").
  // Only matches that cross a word boundary count (single words are checked
  // by tokenBad), and matches lying inside an allowed word are ignored.
  function joinedBad(infos, nameMode, C) {
    var n = infos.length;
    if (n < 2) return false;
    for (var v = 0; v < 2; v++) {
      var J = '', spans = [], a, b;
      infos.forEach(function (i) { spans.push([J.length, J.length + i.L[v].length]); J += i.L[v]; });
      var okRanges = [];
      for (a = 0; a < n; a++) for (b = a + 1; b < n; b++) {
        if (inAllowed(J.slice(spans[a][0], spans[b][1]), C)) okRanges.push([spans[a][0], spans[b][1]]);
      }
      var counts = function (s, e) {
        var ta = -1, tb = -1;
        for (var k = 0; k < n; k++) {
          if (s >= spans[k][0] && s < spans[k][1]) ta = k;
          if (e - 1 >= spans[k][0] && e - 1 < spans[k][1]) tb = k;
        }
        if (ta === tb) return false;
        for (k = 0; k < okRanges.length; k++) if (s >= okRanges[k][0] && e <= okRanges[k][1]) return false;
        return true;
      };
      var list = C.sub.slice();
      if (nameMode) list = list.concat(C.whole.filter(function (e) { return !C.nameOk[e.w]; }));
      for (var i = 0; i < list.length; i++) {
        var g = list[i].g, m;
        g.lastIndex = 0;
        while ((m = g.exec(J))) {
          if (counts(m.index, m.index + m[0].length)) return true;
          g.lastIndex = m.index + 1;
        }
      }
      // whole words lined up exactly with word edges: "a s s", "k y s"
      for (a = 0; a < n; a++) for (b = a + 1; b < n; b++) {
        var seg = J.slice(spans[a][0], spans[b][1]);
        if (inAllowed(seg, C)) continue;
        for (i = 0; i < C.whole.length; i++) if (C.whole[i].whole.test(seg)) return true;
      }
    }
    return false;
  }

  // Build "sentences" of normalised words for phrase matching.
  function sentences(infos, isShort) {
    var out = [];
    for (var v = 0; v < 2; v++) {
      var plain = [], joined = [], run = '';
      infos.forEach(function (i) {
        var L = i.L[v];
        if (!L) return;
        plain.push(L);
        if (isShort(i)) run += L;
        else { if (run) joined.push(run); run = ''; joined.push(L); }
      });
      if (run) joined.push(run);
      out.push(plain.join(' '), joined.join(' '));
    }
    return out;
  }

  function phraseBad(sents, C) {
    for (var s = 0; s < sents.length; s++) {
      var S = ' ' + collapse(sents[s]) + ' ';
      for (var i = 0; i < C.phrases.length; i++) if (S.indexOf(' ' + C.phrases[i] + ' ') >= 0) return true;
      var compact = collapse(S.replace(/ /g, ''));
      for (i = 0; i < C.compact.length; i++) if (compact.indexOf(C.compact[i]) >= 0) return true;
    }
    return false;
  }

  /* ---------------- personal info ---------------- */

  var NUMWORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
  var TLD_LOOSE = /[a-z0-9-]{2,}\s*\.\s*(?:com|net|org)\b/;
  var TLD_TIGHT = /[a-z0-9-]{2,}\.(?:io|gg|co|uk|tv|ly|xyz|app|info|biz|ru|de|fr|au|nz|ca|online|site|link)\b/;
  var RAW_PERSONAL = [
    /(?:https?|ftp)\s*:\s*\/\//,
    /\bwww\s*\./,
    TLD_LOOSE, TLD_TIGHT,
    /\b(?:dot|d0t)\s*(?:com|net|org|co\s*uk|gg|io)\b/,
    /[(\[]\s*(?:dot|at)\s*[)\]]/,
    /[a-z0-9._%+-]+\s*@\s*[a-z0-9-]+\s*(?:\.|\bdot\b)\s*[a-z]{2,}/,
    // house addresses: "42 oak street", "12 high st"
    /\b\d{1,5}[a-z]?\s+(?:[a-z']+\s+){0,2}(?:street|road|rd|avenue|ave|lane|drive|crescent|boulevard|blvd|terrace|highway)\b/,
    /\b\d{1,5}[a-z]?\s+[a-z']+\s+(?:st|close|court|ct|dr|way|place|grove|walk|row|gardens|square|sq)\b\.?\s*(?:[,!?]|$)/
  ];

  function personalBad(text, infos, isShort, C) {
    var f = fold(text);
    // phone numbers: 7+ digits, allowing spaces - . ( ) between, and "five five five"
    var digits = f.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/g, function (m) { return NUMWORDS[m]; });
    if (/(?:\d[\s\-.()\/+]*){6}\d/.test(digits)) return true;
    for (var i = 0; i < RAW_PERSONAL.length; i++) if (RAW_PERSONAL[i].test(f)) return true;

    var sents = sentences(infos, isShort);
    for (var s = 0; s < sents.length; s++) {
      var raw = sents[s], S = collapse(raw), W = ' ' + S + ' ';
      for (i = 0; i < C.personalPhrases.length; i++) if (W.indexOf(' ' + C.personalPhrases[i] + ' ') >= 0) return true;
      for (i = 0; i < C.personal.length; i++) if (C.personal[i].test(S)) return true;
      for (i = 0; i < C.personalRaw.length; i++) if (C.personalRaw[i].test(raw)) return true;
    }
    return false;
  }

  /* ---------------- clean() ---------------- */

  var EMOJI_RE;
  try {
    EMOJI_RE = new RegExp('[\\u{1F1E6}-\\u{1F1FF}]{2}|\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?' +
      '(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?)*', 'gu');
  } catch (e) {
    EMOJI_RE = /(?:\uD83C[\uDDE6-\uDDFF]){2}|(?:[\u2600-\u27BF]|[\uD83C-\uD83E][\uDC00-\uDFFF])\uFE0F?(?:\u200D(?:[\u2600-\u27BF]|[\uD83C-\uD83E][\uDC00-\uDFFF])\uFE0F?)*/g;
  }
  var INVISIBLE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFE00-\uFE0F\uFEFF\u20E3]/g;
  var SKIN = /\uD83C[\uDFFB-\uDFFF]/g;

  function clean(text) {
    var s = text == null ? '' : String(text);
    s = s.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ');
    // keep at most 2 emoji, no repeats (kept ones parked as placeholders)
    var kept = [], seen = {};
    s = s.replace(/[\uE000-\uE0FF]/g, '');
    s = s.replace(EMOJI_RE, function (e) {
      if (kept.length >= 2 || seen[e]) return ' ';
      seen[e] = 1; kept.push(e);
      return String.fromCharCode(0xE000 + kept.length - 1);
    });
    s = s.replace(INVISIBLE, '').replace(SKIN, '');
    s = s.replace(/[\uE000-\uE0FF]/g, function (c) { return kept[c.charCodeAt(0) - 0xE000] || ''; });
    s = s.replace(/\s+/g, ' ').trim();
    // squash anything repeated more than 3 times: "!!!!!!" -> "!!!"
    try { s = s.replace(new RegExp('(.)\\1{3,}', 'gu'), '$1$1$1'); }
    catch (e2) { s = s.replace(/(.)\1{3,}/g, '$1$1$1'); }
    // ALL CAPS shouting (more than 10 letters) -> lower case
    var letters = 0, ch;
    for (var i = 0; i < s.length; i++) { ch = s[i]; if (ch.toLowerCase() !== ch.toUpperCase()) letters++; }
    if (letters > 10 && s === s.toUpperCase()) s = s.toLowerCase();
    var chars = Array.from ? Array.from(s) : s.split('');
    if (chars.length > api.MAX_LENGTH) s = chars.slice(0, api.MAX_LENGTH).join('');
    return s.trim();
  }

  /* ---------------- check() ---------------- */

  function chatShort(i) { return i.L[0].length >= 1 && i.L[0].length <= 2; }

  function check(text) {
    var cleaned = clean(text);
    if (!cleaned) return { ok: false, reason: 'empty' };
    var C = compiled();
    var infos = cleaned.split(' ').map(normToken);

    for (var i = 0; i < infos.length; i++) if (tokenBad(infos[i], false, C)) return { ok: false, reason: 'bad' };

    // runs of 1-2 letter bits: "f u c k", "s.t u p i d", "fu ck"
    var run = [];
    var flush = function () { var r = run; run = []; return r.length >= 2 && joinedBad(r, false, C); };
    for (i = 0; i <= infos.length; i++) {
      var inf = infos[i];
      if (inf && chatShort(inf)) { run.push(inf); continue; }
      if (inf && !inf.L[0] && !inf.hasDigit) continue;   // lone punctuation: "f - u - c - k"
      if (flush()) return { ok: false, reason: 'bad' };
    }

    if (phraseBad(sentences(infos, chatShort), C)) return { ok: false, reason: 'bad' };
    if (personalBad(cleaned, infos, chatShort, C)) return { ok: false, reason: 'personal' };
    return { ok: true, text: cleaned };
  }

  /* ---------------- checkName() ---------------- */

  function checkName(name) {
    var s = (name == null ? '' : String(name)).replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
    if (!s) return { ok: false, reason: 'empty' };
    if (s.length > 12) return { ok: false, reason: 'long' };
    if (!/^[A-Za-z0-9 _.\-]+$/.test(s) || !/[A-Za-z0-9]/.test(s)) return { ok: false, reason: 'chars' };
    var C = compiled();
    var infos = s.split(' ').map(function (t) {
      var info = normToken(t);
      // also split CamelCase / under_score / dash.parts: "BigAss" -> big, ass
      var bits = t.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s_.\-]+/).filter(Boolean);
      info.camel = [0, 1].map(function (v) {
        return bits.map(function (b) { return leet(fold(b), v === 1).replace(/[^a-z]/g, ''); }).filter(Boolean);
      });
      return info;
    });
    var nameShort = function () { return false; };
    for (var i = 0; i < infos.length; i++) if (tokenBad(infos[i], true, C)) return { ok: false, reason: 'bad' };
    var withLetters = infos.filter(function (x) { return x.L[0]; });
    if (joinedBad(withLetters, true, C)) return { ok: false, reason: 'bad' };
    // whole name squashed together: "K Y S", "Go Die"
    var squashed = withLetters.map(function (x) { return x.L[0]; }).join('');
    if (squashed && withLetters.length > 1 && !inAllowed(squashed, C) && wordBad(squashed, true, C)) return { ok: false, reason: 'bad' };
    if (phraseBad(sentences(infos, nameShort), C)) return { ok: false, reason: 'bad' };
    if (personalBad(s, infos, nameShort, C)) return { ok: false, reason: 'personal' };
    return { ok: true, name: s };
  }

  return api;
})();

if (typeof window !== 'undefined') window.ChatFilter = ChatFilter;
if (typeof module!=='undefined') module.exports = ChatFilter;
