// Run:  node tools/filter-test.js
// Tests for js/filter.js (the chat & name safety filter).
var F = require('../js/filter.js');
var pass = 0, fail = 0;
function rev(s) { return s.split('').reverse().join(''); }   // keeps strong words out of this file

function eq(label, got, want) {
  if (got === want) pass++;
  else { fail++; console.log('FAIL', label, '\n   got: ', JSON.stringify(got), '\n   want:', JSON.stringify(want)); }
}
function ok(t) { var r = F.check(t); eq('should pass: ' + t, r.ok ? 'ok' : r.reason, 'ok'); }
function bad(t) { var r = F.check(t); eq('should be bad: ' + t, r.ok ? 'ok' : r.reason, 'bad'); }
function personal(t) { var r = F.check(t); eq('should be personal: ' + t, r.ok ? 'ok' : r.reason, 'personal'); }
function nameOk(n) { var r = F.checkName(n); eq('name ok: ' + n, r.ok ? 'ok' : r.reason, 'ok'); }
function nameNo(n, why) { var r = F.checkName(n); eq('name blocked: ' + n, r.ok ? 'ok' : r.reason, why); }

// ---------- plain bad words ----------
bad('you are an idiot');
bad('stupid');
bad('loser');
bad('you are so ugly');
bad('shut up');
bad('lets drink beer');
bad('vodka time');
bad('I smoke weed');
bad('cocaine');
bad('he is drunk');
bad('what the ' + rev('kcuf'));
bad(rev('tihs') + 'head');
bad('sexy');
// ---------- bullying phrases ----------
bad('kill yourself');
bad('kys');
bad('k y s');
bad("you're stupid");
bad('nobody likes you');
bad('go die');
bad('you suck');
bad('i hope you die');
bad('k1ll y0urs3lf');
bad('killyourself');
// ---------- evasion ----------
bad('5tup1d');            // leet
bad('1d10t');             // leet with 1 = i
bad('$tupid');
bad('s t u p i d');       // spaced
bad('s.t.u.p.i.d');       // dotted
bad('i-d-i-o-t');         // dashes
bad('s_t_u_p_i_d');
bad('i*d*i*o*t');
bad('stuuuuupid');        // stretched
bad('iiiiidiot');
bad('StUpId');            // case
bad('youidiotface');      // hidden inside a word
bad('sh!t');
bad('f*ck');
bad(rev('kcuf').slice(0, 2) + ' ' + rev('kcuf').slice(2));   // "fu ck"
bad('w33d');
bad('a$$');
bad('a s s');
bad('b00bs');
bad('l0ser');
bad('wh\u200Bore');      // zero-width space hidden inside
bad('\u0455tupid');       // Cyrillic look-alike s
bad('s - t - u - p - i - d');
// ---------- innocent words must pass ----------
['class', 'grass', 'pass', 'bass', 'glass', 'Scunthorpe', 'assassin', 'assume', 'passage',
 'hello', 'shell', 'title', 'analysis', 'therapist', 'button', 'cucumber', 'Sussex', 'Essex',
 'skyscraper', 'shiitake', 'cocktail', 'Blimp Dock', 'Paint Shop', 'Candy Kitchen',
 'I think BLOB is the hexagoner', 'where are you?', 'follow me!', 'I saw RED zap someone',
 'vote green', 'skip', 'nice!', "I'm doing tasks in the boiler room", 'he killed him', 'kill',
 'vote him out', 'sus', 'hexed', 'hex', 'is it ok', 'gg', 'good game', 'I did it', 'no u',
 'who is it', 'it is a trap', 'he was in the class', 'I hit him', 'meet me at the blimp dock',
 'I have 2 tasks left', 'the grapes are in the kitchen', 'he passed me', 'u r so good at this',
 'Where are you? Follow me!', 'I am at the paint shop', 'red is sus!!', 'ok so i do it'
].forEach(ok);
// ---------- personal info ----------
personal('call me 07700 900123');
personal('my number is 555-123-4567');
personal('5 5 5 1 2 3 4');
personal('(555) 123.4567');
personal('five five five one two three four');
personal('email me bob@gmail.com');
personal('bob at gmail dot com');
personal('go to www.coolsite.com');
personal('https://example.org');
personal('join discord.gg/abc');
personal('coolgames dot com');
personal('i live at 42 oak street');
personal('12 high st');
personal("what's your address");
personal('how old are you');
personal('how old r u');
personal('where do you live');
personal('what school do you go to');
personal('which school');
personal('add me on snap');
personal("what's your snapchat");
personal('whats ur insta');
personal('what is your discord');
personal('follow me on tiktok');
personal('my number is');
personal('my address is secret');
personal('lets meet up');
personal('meet me irl');
personal("what's your real name");
personal('send pics');
personal('wh@ts y0ur addr3ss');
personal('h o w old are you');
// ---------- clean() ----------
eq('repeat squash !', F.clean('wow!!!!!!!'), 'wow!!!');
eq('repeat squash o', F.clean('sooooo good'), 'sooo good');
eq('caps lowercased', F.clean('THIS IS REALLY LOUD'), 'this is really loud');
eq('short caps kept', F.clean('GG RED'), 'GG RED');
eq('whitespace', F.clean('   hi    there  '), 'hi there');
eq('100 cut', F.clean('a'.repeat(50) + 'b'.repeat(0) + ' ' + 'xy'.repeat(60)).length, 100);
eq('emoji max 2 no repeats', F.clean('hi \uD83D\uDE00\uD83D\uDE00\uD83D\uDE00 \uD83D\uDC4D \uD83C\uDF89'), 'hi \uD83D\uDE00 \uD83D\uDC4D');
eq('check returns cleaned', F.check('NICE   ONE GUYS WELL DONE!!!!!').text, 'nice one guys well done!!!');
eq('empty', F.check('   ').reason, 'empty');
eq('empty emoji spam only invisible', F.check('\u200B\u200B').reason, 'empty');
// ---------- names ----------
nameOk('Blob');
nameOk('RED_77');
nameOk('Mr. Hex');
nameOk('Grass Hopper');
nameOk('Assassin');
nameOk('Classic');
nameOk('Ginger');
nameOk('Titan');
nameOk('Shelly');
nameOk('Drummer');
nameNo('', 'empty');
nameNo('   ', 'empty');
nameNo('ThisNameIsWayTooLong', 'long');
nameNo('bob<script>', 'chars');
nameNo('h\u00E9llo\uD83D\uDE00', 'chars');
nameNo('StupidKid', 'bad');
nameNo('BigAss', 'bad');
nameNo('bigass', 'bad');
nameNo('xXidiotXx', 'bad');
nameNo('1d10t', 'bad');
nameNo('i_d_i_o_t', 'bad');
nameNo('Fu Ck', 'bad');
nameNo('KYS', 'bad');
nameNo('weedlord', 'bad');
nameNo('5551234567', 'personal');

// ---------- lists can be edited at runtime ----------
ok('banana');
F.BLOCKED_WORDS.push('banana');
bad('b a n a n a');
bad('bananarama');
F.BLOCKED_WORDS.pop();
ok('banana');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
