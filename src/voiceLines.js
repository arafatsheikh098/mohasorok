// Voice lines for the bus helper (হেলপার) and passengers, in clear colloquial Bangladeshi Bangla.
// Shared by the runtime (src/voice.js) and the clip generator (tools/gen_voice.mjs).
// Every (line, variant, voice, place) is a whole pre-made sentence. `{place}` lines are generated for every town
// on the route and every bus counter in BUS_STOPS; a place without clips plays one of the line's `generic`
// sentences (no place name) instead, so a new counter still gets a voice before the clips are regenerated.
//
// speaker: 'helper' | 'pax'   prio: higher wins when the queue is busy   cool: seconds before the id repeats
import { WAYPOINTS, BUS_STOPS } from './config.js';

// Microsoft neural voices (edge-tts). The helper is a Bangladeshi man; passengers alternate two voices.
export const VOICES = {
  helper: [{ id: 'pradeep', name: 'bn-BD-PradeepNeural', rate: '+8%' }],
  pax: [{ id: 'nabanita', name: 'bn-BD-NabanitaNeural', rate: '+0%' }, { id: 'bashkar', name: 'bn-IN-BashkarNeural', rate: '+0%' }],
};

// The key a place name is stored and looked up under: drop "(…)", dots and punctuation, squash spaces.
export const placeKey = (s) => String(s).replace(/\(.*?\)/g, ' ').replace(/[.,!?।'"]/g, ' ').replace(/\s+/g, ' ').trim();

// trip ends (what the helper calls out), and every town + bus counter a passenger could get down at
const DEST = ['ঢাকা', 'চট্টগ্রাম'];
const TOWNS = WAYPOINTS.filter((w) => w.town).map((w) => placeKey(w.bn));
const COUNTERS = Object.values(BUS_STOPS).flatMap((d) => [...(d.pickup || []), ...(d.drop || [])])
  .map((x) => x.bn || WAYPOINTS.find((w) => w.en === x.place)?.bn).filter(Boolean).map(placeKey);
const STOPS = [...new Set([...TOWNS, ...COUNTERS])].filter((x) => !DEST.includes(x));
export const PLACE_SETS = { dest: DEST, stops: [...STOPS, ...DEST] };

export const LINES = {
  'helper.call': { speaker: 'helper', prio: 2, cool: 6, places: 'dest', v: [
    ['{place}! {place}! উঠেন উঠেন, সিট খালি আছে!', '{place}! {place}! Hop on, seats free!'],
    ['{place}, {place}! আসেন আসেন, গাড়ি এখনই ছাড়বে!', '{place}, {place}! Come on, we leave right now!'],
    ['{place} যাবেন? উঠে পড়েন, তাড়াতাড়ি!', 'Going to {place}? Get on, quick!'],
  ], generic: [
    ['উঠেন উঠেন, সিট খালি আছে! গাড়ি এখনই ছাড়বে!', 'Hop on, seats free! We leave right now!'],
  ] },
  'helper.board_done': { speaker: 'helper', prio: 3, cool: 4, v: [
    ['ওস্তাদ, যান যান! ডাবল!', 'Boss, go go! All in!'],
    ['ঠিক আছে ওস্তাদ, টান দেন!', 'All right boss, pull away!'],
    ['সবাই উঠে গেছে, ছাড়েন ওস্তাদ!', 'Everyone is on, let\'s go boss!'],
  ] },
  'helper.next_stop': { speaker: 'helper', prio: 2, cool: 20, places: 'stops', v: [
    ['সামনে {place}! যারা নামবেন, রেডি হন!', '{place} ahead! Those getting off, get ready!'],
    ['{place} চলে আসছে, যারা নামবেন দরজার কাছে আসেন!', '{place} is coming, those getting off come to the door!'],
  ], generic: [
    ['সামনের স্টপে যারা নামবেন, দরজার কাছে আসেন!', 'Those getting off at the next stop, come to the door!'],
  ] },
  'helper.arrive': { speaker: 'helper', prio: 3, cool: 10, places: 'dest', v: [
    ['{place} চলে আসছি! সবাই নামেন, মালপত্র দেখে নিয়েন!', 'We are at {place}! Everyone off, mind your luggage!'],
    ['শেষ স্টপ, {place}! আস্তে আস্তে নামেন!', 'Last stop, {place}! Step down carefully!'],
  ], generic: [
    ['শেষ স্টপ চলে আসছি! সবাই নামেন, মালপত্র দেখে নিয়েন!', 'Last stop! Everyone off, mind your luggage!'],
  ] },
  'helper.depart': { speaker: 'helper', prio: 3, cool: 10, places: 'dest', v: [
    ['{place}! {place}! গাড়ি ছাড়ল!', '{place}! {place}! The bus is leaving!'],
    ['{place} ডাইরেক্ট! উঠেন, গাড়ি এখন ছাড়বে!', 'Direct to {place}! Get on, we leave now!'],
  ], generic: [
    ['গাড়ি ছাড়ল! উঠেন উঠেন, তাড়াতাড়ি!', 'The bus is leaving! Get on, quick!'],
  ] },
  'helper.slow': { speaker: 'helper', prio: 2, cool: 30, v: [
    ['ওস্তাদ, আস্তে চালান! সামনে ক্যামেরা আছে।', 'Boss, slow down! There is a camera ahead.'],
    ['ওস্তাদ, একটু ধীরে, যাত্রীরা ভয় পাচ্ছে!', 'Boss, ease off, the passengers are scared!'],
  ] },
  'helper.crash': { speaker: 'helper', prio: 4, cool: 8, v: [
    ['ওস্তাদ! দেখে চালান!', 'Boss! Watch where you drive!'],
    ['হায় হায়! সাবধানে চালান ওস্তাদ!', 'Oh no! Drive carefully boss!'],
  ] },
  'helper.left_clear': { speaker: 'helper', prio: 1, cool: 25, v: [
    ['বাম পাশ খালি ওস্তাদ, বামে চাপেন!', 'Left side is clear boss, move over left!'],
    ['বাম খালি, আসেন আসেন!', 'Left is clear, come on over!'],
  ] },
  'helper.overtake_wait': { speaker: 'helper', prio: 2, cool: 25, v: [
    ['ওস্তাদ, দাঁড়ান! ডান পাশে গাড়ি আছে!', 'Boss, wait! There is a car on the right!'],
    ['এখন না ওস্তাদ, একটু পরে কাটেন!', 'Not now boss, overtake a bit later!'],
  ] },
  'helper.toll': { speaker: 'helper', prio: 2, cool: 40, v: [
    ['ওস্তাদ, সামনে টোল! টাকা রেডি আছে।', 'Boss, toll ahead! The money is ready.'],
    ['টোল প্লাজা চলে আসছে, আস্তে করেন ওস্তাদ!', 'Toll plaza coming up, slow down boss!'],
  ] },
  'helper.fuel': { speaker: 'helper', prio: 2, cool: 60, v: [
    ['ওস্তাদ, তেল কমে গেছে! সামনের পাম্পে ঢুকেন।', 'Boss, fuel is low! Pull into the next pump.'],
    ['ডিজেল প্রায় শেষ ওস্তাদ, পাম্পে থামান!', 'Diesel is almost out boss, stop at a pump!'],
  ] },
  'helper.uturn': { speaker: 'helper', prio: 1, cool: 30, v: [
    ['ওস্তাদ, সামনে ইউ টার্ন!', 'Boss, U-turn ahead!'],
  ] },
  'pax.stop_request': { speaker: 'pax', prio: 3, cool: 3, places: 'stops', v: [
    ['ভাই, আমি {place} নামব!', 'Brother, I am getting off at {place}!'],
    ['ওস্তাদ, {place} একটু রাখবেন!', 'Driver, please stop at {place}!'],
    ['মামা, {place} নামিয়ে দিয়েন!', 'Mama, drop me at {place}!'],
  ], generic: [
    ['ভাই, সামনের স্টপে আমি নামব!', 'Brother, I am getting off at the next stop!'],
  ] },
  'pax.thanks': { speaker: 'pax', prio: 1, cool: 4, v: [
    ['ধন্যবাদ ভাই!', 'Thank you brother!'],
    ['আল্লাহ হাফেজ!', 'Goodbye!'],
    ['ঠিক আছে মামা, ভালো থাকবেন।', 'All right mama, take care.'],
  ] },
  'pax.missed': { speaker: 'pax', prio: 3, cool: 6, v: [
    ['আরে ভাই, আমার স্টপ তো পার হয়ে গেল!', 'Hey brother, you went past my stop!'],
    ['ওস্তাদ, রাখলেন না কেন? পেছনে ফেলে আসলেন!', 'Driver, why did you not stop? You left it behind!'],
    ['ধুর ভাই, আমাকে তো নামালেন না!', 'Come on, you did not let me off!'],
  ] },
  'pax.slow': { speaker: 'pax', prio: 2, cool: 30, v: [
    ['ভাই, আস্তে চালান! আমরা বাড়ি ফিরতে চাই!', 'Slow down brother! We want to get home!'],
    ['ড্রাইভার সাহেব, এত জোরে কেন? একটু আস্তে!', 'Driver sir, why so fast? A bit slower!'],
    ['আল্লাহর ওয়াস্তে আস্তে চালান ভাই!', 'For God\'s sake, drive slowly brother!'],
  ] },
  'pax.crash': { speaker: 'pax', prio: 4, cool: 8, v: [
    ['আল্লাহ গো! এটা কী করলেন!', 'Oh God! What did you just do!'],
    ['ও মা গো! সাবধানে চালান!', 'Oh mother! Drive carefully!'],
    ['এই ড্রাইভার! চোখ কোথায় রাখছেন?', 'Hey driver! Where are your eyes?'],
  ] },
};

// Every clip to make: one whole sentence per (line, variant, voice, place).
export const clipKey = (id, k, voiceId, place = '') => `${id}|${k}|${voiceId}|${place}`;
export function allClips() {
  const out = [];
  for (const [id, line] of Object.entries(LINES)) {
    const places = line.places ? PLACE_SETS[line.places] : [''];
    line.v.forEach(([bn], k) => {
      for (const vo of VOICES[line.speaker]) for (const place of places) {
        out.push({ key: clipKey(id, k, vo.id, place), text: bn.replaceAll('{place}', place), voice: vo });
      }
    });
    (line.generic || []).forEach(([bn], k) => {
      for (const vo of VOICES[line.speaker]) out.push({ key: clipKey(id, `g${k}`, vo.id, ''), text: bn, voice: vo });
    });
  }
  return out;
}
