// Bus services: which operator runs which route. AI buses on the road are on one of these: they show it on
// a placard (front-left side window and the rear), stop at the towns on their route and turn off where their
// route leaves yours. [operator id, from zilla, to zilla]; every service runs both ways.
// Loosely based on the real operators' routes; a game list, not a timetable.
export const SERVICES = [
  // Hanif Enterprise
  ['hanif', 'Dhaka', 'Chattogram'], ['hanif', 'Dhaka', "Cox's Bazar"], ['hanif', 'Dhaka', 'Rajshahi'], ['hanif', 'Dhaka', 'Kushtia'],
  ['hanif', 'Dhaka', 'Rangpur'], ['hanif', 'Dhaka', 'Dinajpur'], ['hanif', 'Dhaka', 'Chapai Nawabganj'], ['hanif', 'Dhaka', 'Sylhet'],
  ['hanif', 'Dhaka', 'Meherpur'], ['hanif', 'Dhaka', 'Panchagarh'],
  // Green Line
  ['greenline', 'Dhaka', 'Chattogram'], ['greenline', 'Dhaka', "Cox's Bazar"], ['greenline', 'Dhaka', 'Sylhet'], ['greenline', 'Dhaka', 'Khulna'],
  ['greenline', 'Dhaka', 'Barishal'], ['greenline', 'Dhaka', 'Benapole'], ['greenline', 'Chattogram', 'Sylhet'],
  // Ena Transport
  ['ena', 'Dhaka', 'Sylhet'], ['ena', 'Dhaka', 'Mymensingh'], ['ena', 'Dhaka', 'Chattogram'], ['ena', 'Dhaka', "Cox's Bazar"],
  ['ena', 'Chattogram', 'Sylhet'], ['ena', 'Dhaka', 'Netrokona'], ['ena', 'Dhaka', 'Sunamganj'], ['ena', 'Dhaka', 'Habiganj'],
  // Shyamoli Paribahan
  ['shyamoli', 'Dhaka', 'Chattogram'], ['shyamoli', 'Dhaka', 'Rangpur'], ['shyamoli', 'Dhaka', 'Benapole'], ['shyamoli', 'Dhaka', 'Kushtia'],
  ['shyamoli', 'Dhaka', 'Bogura'], ['shyamoli', 'Dhaka', 'Jashore'], ['shyamoli', 'Dhaka', 'Kurigram'], ['shyamoli', 'Dhaka', 'Lalmonirhat'],
  // Soudia
  ['soudia', 'Dhaka', 'Chattogram'], ['soudia', 'Chattogram', "Cox's Bazar"], ['soudia', 'Chattogram', 'Sylhet'], ['soudia', 'Dhaka', 'Feni'],
  ['soudia', 'Chattogram', 'Teknaf'],
  // Marsa
  ['marsa', 'Dhaka', 'Chattogram'], ['marsa', 'Dhaka', 'Noakhali'], ['marsa', 'Dhaka', 'Lakshmipur'],
  // Nabil
  ['nabil', 'Dhaka', 'Rangpur'], ['nabil', 'Dhaka', 'Dinajpur'], ['nabil', 'Dhaka', 'Thakurgaon'], ['nabil', 'Dhaka', 'Rajshahi'],
  ['nabil', 'Dhaka', 'Nilphamari'], ['nabil', 'Dhaka', 'Gaibandha'], ['nabil', 'Dhaka', 'Naogaon'],
  // Shohagh
  ['shohagh', 'Dhaka', 'Chattogram'], ['shohagh', 'Dhaka', 'Benapole'], ['shohagh', 'Dhaka', 'Khulna'], ['shohagh', 'Dhaka', 'Jashore'],
  ['shohagh', 'Dhaka', 'Satkhira'], ['shohagh', 'Chattogram', 'Benapole'],
  // Unique
  ['unique', 'Dhaka', 'Sylhet'], ['unique', 'Dhaka', 'Chattogram'], ['unique', 'Dhaka', "Cox's Bazar"], ['unique', 'Dhaka', 'Moulvibazar'],
  // Desh Travels
  ['desh', 'Dhaka', 'Chattogram'], ['desh', 'Dhaka', "Cox's Bazar"], ['desh', 'Dhaka', 'Teknaf'], ['desh', 'Dhaka', 'Bandarban'],
  // Shah Fateh Ali
  ['shahfatehali', 'Dhaka', 'Chattogram'], ['shahfatehali', 'Dhaka', "Cox's Bazar"], ['shahfatehali', 'Dhaka', 'Rangamati'],
  ['shahfatehali', 'Dhaka', 'Khagrachhari'],
  // Ekushey
  ['ekushey', 'Dhaka', 'Rajshahi'], ['ekushey', 'Dhaka', 'Pabna'], ['ekushey', 'Dhaka', 'Sirajganj'], ['ekushey', 'Dhaka', 'Joypurhat'],
  ['ekushey', 'Dhaka', 'Tangail'], ['ekushey', 'Dhaka', 'Jamalpur'], ['ekushey', 'Dhaka', 'Sherpur'],
  // Sakura
  ['sakura', 'Dhaka', 'Barishal'], ['sakura', 'Dhaka', 'Kuakata'], ['sakura', 'Dhaka', 'Khulna'], ['sakura', 'Dhaka', 'Patuakhali'],
  ['sakura', 'Dhaka', 'Barguna'], ['sakura', 'Dhaka', 'Pirojpur'], ['sakura', 'Dhaka', 'Gopalganj'], ['sakura', 'Dhaka', 'Bagerhat'],
  ['sakura', 'Dhaka', 'Madaripur'], ['sakura', 'Dhaka', 'Shariatpur'], ['sakura', 'Dhaka', 'Faridpur'], ['sakura', 'Dhaka', 'Jhalokathi'],
  // the rest of the zillas: whoever runs them in the game
  ['shyamoli', 'Dhaka', 'Magura'], ['shyamoli', 'Dhaka', 'Jhenaidah'], ['shyamoli', 'Dhaka', 'Chuadanga'], ['shyamoli', 'Dhaka', 'Narail'],
  ['hanif', 'Dhaka', 'Natore'], ['hanif', 'Dhaka', 'Rajbari'], ['ena', 'Dhaka', 'Kishoreganj'], ['ena', 'Dhaka', 'Brahmanbaria'],
  ['ena', 'Dhaka', 'Narsingdi'], ['ena', 'Dhaka', 'Gazipur'], ['marsa', 'Dhaka', 'Chandpur'], ['marsa', 'Dhaka', 'Cumilla'],
  ['shohagh', 'Dhaka', 'Manikganj'], ['desh', 'Dhaka', 'Munshiganj'], ['unique', 'Dhaka', 'Narayanganj'],
  // between other towns
  ['soudia', 'Chattogram', 'Rangamati'], ['soudia', 'Chattogram', 'Bandarban'], ['shohagh', 'Khulna', 'Rajshahi'], ['hanif', 'Rajshahi', 'Rangpur'],
  ['nabil', 'Bogura', 'Rangpur'], ['shyamoli', 'Khulna', 'Benapole'], ['sakura', 'Barishal', 'Kuakata'], ['greenline', 'Sylhet', 'Sunamganj'],
];
