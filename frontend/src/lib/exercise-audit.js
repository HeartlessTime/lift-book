// Every library exercise reviewed against the owner's gym and his hard rules (2026-10-20 audit,
// four reviewers over the 554 the automatic check could not settle; the other 770 are clear-cut
// no's in gear.js: dumbbells, bands, kettlebells, leverage machines, …).
//   ok: false  archived — why says what rules it out (gear or the back/shoulders)
//   ok: true   doable — tg the real target muscle (library vocab; fixes the library where wrong),
//              primary/focus/secondary in gear.js's group vocab, then the setup: station, horns,
//              attachment, bench, heavy (big compound), sh (load rests on the shoulders).
// To change a verdict, edit the row; OVERRIDES in gear.js still win over this table.
export const AUDIT = {
  "3293": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["biceps"], station: "pullup", horns: 0, heavy: true }, // archer pull up
  "1405": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["chest"], station: "bodyweight", horns: 0 }, // back pec stretch
  "1316": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["chest", "triceps"], station: "barbell", horns: 0, bench: "flat" }, // barbell bent arm pullover
  "0049": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps", "shoulders"], station: "barbell", horns: 0, bench: "incline", heavy: true }, // barbell incline row
  "0073": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["chest", "triceps"], station: "barbell", horns: 0, bench: "flat" }, // barbell pullover
  "0022": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["chest", "triceps"], station: "barbell", horns: 0, bench: "flat" }, // barbell pullover to press
  "1317": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps", "shoulders"], station: "barbell", horns: 0, bench: "incline", heavy: true }, // barbell reverse grip incline bench row
  "3019": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps"], station: "smith", horns: 0 }, // bench pull-ups
  "0139": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["biceps", "forearms"], station: "pullup", horns: 0, heavy: true }, // biceps narrow pull-ups
  "0140": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["biceps", "forearms"], station: "pullup", horns: 0, heavy: true }, // biceps pull-up
  "3168": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps"], station: "rack", horns: 0 }, // bodyweight squatting row
  "3158": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps"], station: "rack", horns: 0 }, // bodyweight standing close-grip row
  "3162": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps"], station: "rack", horns: 0 }, // bodyweight standing one arm row
  "3166": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps"], station: "rack", horns: 0 }, // bodyweight standing row
  "0160": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps", "shoulders"], station: "cable", horns: 1, attachment: "flatbar", heavy: true }, // cable floor seated wide-grip row
  "0167": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps"], station: "cable", horns: 1, attachment: "flatbar", heavy: true }, // cable high row (kneeling)
  "1318": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps"], station: "cable", horns: 1, attachment: "handle", bench: "incline", heavy: true }, // cable incline bench row
  "0172": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["triceps"], station: "cable", horns: 1, attachment: "flatbar" }, // cable incline pushdown
  "0180": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps", "forearms"], station: "cable", horns: 1, attachment: "vhandle", bench: "flat", heavy: true }, // cable low seated row
  "0184": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["chest", "triceps"], station: "cable", horns: 1, attachment: "rope", bench: "flat" }, // cable lying extension pullover (with rope attachment)
  "3563": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["biceps"], station: "cable", horns: 1, attachment: "handle", heavy: true }, // cable one arm pulldown
  "0193": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps"], station: "cable", horns: 1, attachment: "handle", heavy: true }, // cable one arm straight back high row (kneeling)
  "1319": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps"], station: "cable", horns: 1, attachment: "handle", heavy: true }, // cable palm rotational row
  "0199": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["triceps"], station: "cable", horns: 1, attachment: "flatbar" }, // cable pushdown (straight arm) v. 2
  "0208": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps"], station: "cable", horns: 1, attachment: "flatbar", bench: "flat", heavy: true }, // cable reverse-grip straight back seated high row
  "1320": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps", "shoulders"], station: "cable", horns: 2, attachment: "handle", bench: "flat", heavy: true }, // cable rope crossover seated row
  "1321": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps"], station: "cable", horns: 1, attachment: "rope", bench: "flat", heavy: true }, // cable rope elevated seated row
  "1322": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps", "shoulders"], station: "cable", horns: 1, attachment: "rope", bench: "incline", heavy: true }, // cable rope extension incline bench row
  "1323": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps", "shoulders"], station: "cable", horns: 1, attachment: "rope", bench: "flat", heavy: true }, // cable rope seated row
  "0213": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["biceps"], station: "cable", horns: 1, attachment: "vhandle", bench: "flat", heavy: true }, // cable seated high row (v-bar)
  "0214": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps"], station: "cable", horns: 2, attachment: "handle", bench: "flat", heavy: true }, // cable seated one arm alternate row
  "0861": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps"], station: "cable", horns: 1, attachment: "vhandle", bench: "flat", heavy: true }, // cable seated row
  "0218": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps", "shoulders"], station: "cable", horns: 1, attachment: "flatbar", bench: "flat", heavy: true }, // cable seated wide-grip row
  "1717": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps", "quads"], station: "cable", horns: 1, attachment: "rope", heavy: true }, // cable squat row (with rope attachment)
  "0232": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["triceps"], station: "cable", horns: 1, attachment: "rope" }, // cable standing pulldown (with rope)
  "0234": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps"], station: "cable", horns: 1, attachment: "vhandle", heavy: true }, // cable standing row (v-bar)
  "0238": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["triceps"], station: "cable", horns: 1, attachment: "flatbar" }, // cable straight arm pulldown
  "0237": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["triceps"], station: "cable", horns: 1, attachment: "rope" }, // cable straight arm pulldown (with rope)
  "0239": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps"], station: "cable", horns: 1, attachment: "vhandle", bench: "flat", heavy: true }, // cable straight back seated row
  "2464": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["biceps"], station: "cable", horns: 1, attachment: "handle", bench: "flat" }, // cable thibaudeau kayak row
  "1324": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps", "shoulders"], station: "cable", horns: 1, attachment: "flatbar", heavy: true }, // cable upper row
  "1326": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["biceps", "forearms"], station: "pullup", horns: 0, heavy: true }, // chin-up
  "0253": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["biceps"], station: "pullup", horns: 0, heavy: true }, // chin-ups (narrow parallel grip)
  "1327": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["biceps", "forearms"], station: "pullup", horns: 0, heavy: true }, // close grip chin-up
  "1772": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["shoulders"], station: "bodyweight", horns: 0 }, // elbow lift - reverse push-up
  "3296": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["core"], station: "pullup", horns: 0 }, // front lever
  "3295": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["core"], station: "pullup", horns: 0 }, // front lever reps
  "0466": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["biceps"], station: "pullup", horns: 0, heavy: true }, // gironda sternum chin
  "0467": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["biceps", "core"], station: "pullup", horns: 0, heavy: true }, // gorilla chin
  "0499": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps"], station: "smith", horns: 0 }, // inverted row
  "2300": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps"], station: "smith", horns: 0 }, // inverted row bent knees
  "2298": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps"], station: "smith", horns: 0, bench: "flat" }, // inverted row on bench
  "0497": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["biceps"], station: "smith", horns: 0 }, // inverted row v. 2
  "1346": { ok: true, tg: "lats", primary: "back", focus: "lats", station: "bodyweight", horns: 0 }, // kneeling lat stretch
  "3418": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["biceps", "core"], station: "pullup", horns: 0, heavy: true }, // l-pull-up
  "0627": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["biceps"], station: "pullup", horns: 0, heavy: true }, // mixed grip chin-up
  "1355": { ok: true, tg: "lats", primary: "back", focus: "lats", station: "bodyweight", horns: 0 }, // one arm against wall
  "0638": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["biceps", "forearms"], station: "pullup", horns: 0, heavy: true }, // one arm chin-up
  "0651": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["biceps"], station: "pullup", horns: 0, heavy: true }, // pull up (neutral grip)
  "0652": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["biceps"], station: "pullup", horns: 0, heavy: true }, // pull-up
  "0670": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["biceps"], station: "pullup", horns: 0, heavy: true }, // rear pull-up
  "0674": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["biceps"], station: "pullup", horns: 0, heavy: true }, // reverse grip pull-up
  "0688": { ok: true, tg: "traps", primary: "back", focus: "lats", secondary: ["traps"], station: "pullup", horns: 0 }, // scapular pull-up
  "1763": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["biceps"], station: "pullup", horns: 0, heavy: true }, // shoulder grip pull-up
  "1358": { ok: true, tg: "lats", primary: "back", focus: "lats", station: "bodyweight", horns: 0 }, // side lying floor stretch
  "0720": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["biceps"], station: "pullup", horns: 0, heavy: true }, // side-to-side chin
  "3669": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["shoulders"], station: "bodyweight", horns: 0 }, // standing archer
  "0794": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["core"], station: "bodyweight", horns: 0 }, // standing lateral stretch
  "1365": { ok: true, tg: "upper back", primary: "back", focus: "mid back", secondary: ["shoulders"], station: "bodyweight", horns: 0 }, // upper back stretch
  "1429": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["biceps"], station: "pullup", horns: 0, heavy: true }, // wide grip pull-up
  "1367": { ok: true, tg: "lats", primary: "back", focus: "lats", secondary: ["biceps"], station: "pullup", horns: 0, heavy: true }, // wide grip rear pull-up
  "0031": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "barbell", horns: 0 }, // barbell curl
  "0038": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "barbell", horns: 0 }, // barbell drag curl
  "0072": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "rack", horns: 0, bench: "incline" }, // barbell prone incline curl
  "0080": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "barbell", horns: 0 }, // barbell reverse curl
  "0089": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "rack", horns: 0, bench: "flat" }, // barbell seated close-grip concentration curl
  "0106": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "barbell", horns: 0 }, // barbell standing close grip curl
  "0110": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "barbell", horns: 0 }, // barbell standing reverse grip curl
  "1629": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "barbell", horns: 0 }, // barbell standing wide grip biceps curl
  "0113": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "barbell", horns: 0 }, // barbell standing wide-grip curl
  "1770": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "bodyweight", horns: 0 }, // biceps leg concentration curl
  "1630": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "cable", horns: 1, attachment: "flatbar" }, // cable close grip curl
  "1631": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "cable", horns: 1, attachment: "handle", bench: "flat" }, // cable concentration curl
  "0868": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "cable", horns: 1, attachment: "flatbar" }, // cable curl
  "1632": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "cable", horns: 1, attachment: "flatbar" }, // cable drag curl
  "0165": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "cable", horns: 1, attachment: "rope" }, // cable hammer curl (with rope)
  "1634": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "cable", horns: 1, attachment: "flatbar", bench: "flat" }, // cable lying bicep curl
  "0182": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "cable", horns: 1, attachment: "flatbar", bench: "flat" }, // cable lying close-grip curl
  "0190": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "cable", horns: 1, attachment: "handle" }, // cable one arm curl
  "1636": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "cable", horns: 1, attachment: "flatbar" }, // cable overhead curl
  "0206": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "cable", horns: 1, attachment: "flatbar" }, // cable reverse curl
  "1413": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "cable", horns: 1, attachment: "handle" }, // cable reverse one arm curl
  "1641": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "cable", horns: 1, attachment: "flatbar", bench: "upright" }, // cable seated curl
  "1642": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "cable", horns: 1, attachment: "handle", bench: "flat" }, // cable seated one arm concentration curl
  "1643": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "cable", horns: 1, attachment: "flatbar", bench: "upright" }, // cable seated overhead curl
  "1644": { ok: true, tg: "biceps", primary: "biceps", secondary: ["quads", "forearms"], station: "cable", horns: 1, attachment: "flatbar" }, // cable squatting curl
  "0229": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "cable", horns: 1, attachment: "handle" }, // cable standing inner curl
  "1645": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "cable", horns: 2, attachment: "handle", bench: "incline" }, // cable two arm curl on incline bench
  "1683": { ok: true, tg: "biceps", primary: "biceps", secondary: ["forearms"], station: "smith", horns: 0 }, // smith machine bicep curl
  "1368": { ok: true, tg: "calves", primary: "calves", station: "bodyweight", horns: 0 }, // ankle circles
  "1370": { ok: true, tg: "calves", primary: "calves", station: "barbell", horns: 0 }, // barbell floor calf raise
  "0088": { ok: false, tg: "calves", primary: "calves", why: "Loads the knees (2026-10-29)." }, // barbell seated calf raise
  "1371": { ok: false, tg: "calves", primary: "calves", why: "Loads the knees (2026-10-29)." }, // barbell seated calf raise
  "1372": { ok: true, tg: "calves", primary: "calves", station: "rack", horns: 0, sh: true }, // barbell standing calf raise
  "0108": { ok: true, tg: "calves", primary: "calves", station: "rack", horns: 0, sh: true }, // barbell standing leg calf raise
  "0111": { ok: true, tg: "calves", primary: "calves", station: "rack", horns: 0, sh: true }, // barbell standing rocking leg calf raise
  "1373": { ok: true, tg: "calves", primary: "calves", station: "bodyweight", horns: 0 }, // bodyweight standing calf raise
  "1375": { ok: false, tg: "calves", primary: "calves", why: "No equipment for them (2026-10-20, 2026-10-29)." }, // cable standing calf raise
  "1376": { ok: false, tg: "calves", primary: "calves", why: "No equipment for them (2026-10-20, 2026-10-29)." }, // cable standing one leg calf raise
  "1407": { ok: true, tg: "calves", primary: "calves", station: "bodyweight", horns: 0 }, // calf push stretch with hands against wall
  "1377": { ok: true, tg: "calves", primary: "calves", station: "bodyweight", horns: 0 }, // calf stretch with hands against wall
  "0257": { ok: true, tg: "calves", primary: "calves", station: "bodyweight", horns: 0 }, // circles knee stretch
  "0284": { ok: true, tg: "calves", primary: "calves", station: "bodyweight", horns: 0 }, // donkey calf raise
  "1386": { ok: true, tg: "calves", primary: "calves", station: "bodyweight", horns: 0 }, // one leg donkey calf raise
  "1387": { ok: true, tg: "calves", primary: "calves", station: "bodyweight", horns: 0 }, // one leg floor calf raise
  "1390": { ok: true, tg: "calves", primary: "calves", station: "bodyweight", horns: 0 }, // seated calf stretch (male)
  "1393": { ok: true, tg: "calves", primary: "calves", station: "smith", horns: 0, sh: true }, // smith one leg floor calf raise
  "0763": { ok: true, tg: "calves", primary: "calves", station: "smith", horns: 0 }, // smith reverse calf raises
  "1394": { ok: true, tg: "calves", primary: "calves", station: "smith", horns: 0 }, // smith reverse calf raises
  "1395": { ok: false, tg: "calves", primary: "calves", why: "Loads the knees (2026-10-29)." }, // smith seated one leg calf raise
  "0773": { ok: true, tg: "calves", primary: "calves", station: "smith", horns: 0, sh: true }, // smith standing leg calf raise
  "1396": { ok: true, tg: "calves", primary: "calves", station: "smith", horns: 0, sh: true }, // smith toe raise
  "1490": { ok: true, tg: "calves", primary: "calves", station: "bodyweight", horns: 0 }, // standing calf raise (on a staircase)
  "1397": { ok: true, tg: "calves", primary: "calves", station: "bodyweight", horns: 0 }, // standing calves
  "1398": { ok: true, tg: "calves", primary: "calves", station: "bodyweight", horns: 0 }, // standing calves calf stretch
  "3220": { ok: true, tg: "cardiovascular system", primary: "cardio", station: "bodyweight", horns: 0 }, // astride jumps (male)
  "3672": { ok: true, tg: "cardiovascular system", primary: "cardio", station: "bodyweight", horns: 0 }, // back and forth step
  "3360": { ok: true, tg: "cardiovascular system", primary: "cardio", secondary: ["shoulders", "core"], station: "bodyweight", horns: 0 }, // bear crawl
  "1160": { ok: true, tg: "cardiovascular system", primary: "cardio", station: "bodyweight", horns: 0 }, // burpee
  "3636": { ok: true, tg: "cardiovascular system", primary: "cardio", station: "bodyweight", horns: 0 }, // high knee against wall
  "0501": { ok: true, tg: "cardiovascular system", primary: "cardio", station: "bodyweight", horns: 0 }, // jack burpee
  "3224": { ok: true, tg: "cardiovascular system", primary: "cardio", station: "bodyweight", horns: 0 }, // jack jump (male)
  "0630": { ok: true, tg: "cardiovascular system", primary: "cardio", secondary: ["core"], station: "bodyweight", horns: 0 }, // mountain climber
  "3638": { ok: true, tg: "cardiovascular system", primary: "cardio", secondary: ["chest", "core"], station: "bodyweight", horns: 0 }, // push to run
  "3552": { ok: true, tg: "cardiovascular system", primary: "cardio", secondary: ["calves"], station: "bodyweight", horns: 0 }, // quick feet v. 2
  "0685": { ok: true, tg: "cardiovascular system", primary: "cardio", station: "treadmill", horns: 0 }, // run
  "0684": { ok: true, tg: "cardiovascular system", primary: "cardio", station: "treadmill", horns: 0 }, // run (equipment)
  "3219": { ok: true, tg: "cardiovascular system", primary: "cardio", station: "bodyweight", horns: 0 }, // scissor jumps (male)
  "3222": { ok: true, tg: "cardiovascular system", primary: "cardio", secondary: ["quads"], station: "bodyweight", horns: 0 }, // semi squat jump (male)
  "3656": { ok: true, tg: "cardiovascular system", primary: "cardio", station: "treadmill", horns: 0 }, // short stride run
  "3361": { ok: true, tg: "cardiovascular system", primary: "cardio", station: "bodyweight", horns: 0 }, // skater hops
  "3671": { ok: true, tg: "cardiovascular system", primary: "cardio", station: "bodyweight", horns: 0 }, // ski step
  "3223": { ok: true, tg: "cardiovascular system", primary: "cardio", station: "bodyweight", horns: 0 }, // star jump (male)
  "3318": { ok: true, tg: "cardiovascular system", primary: "cardio", station: "bodyweight", horns: 0 }, // swing 360
  "3655": { ok: true, tg: "cardiovascular system", primary: "cardio", secondary: ["quads", "glutes"], station: "bodyweight", horns: 0 }, // walking high knees lunge
  "3666": { ok: true, tg: "cardiovascular system", primary: "cardio", station: "treadmill", horns: 0 }, // walking on incline treadmill
  "0858": { ok: true, tg: "cardiovascular system", primary: "cardio", secondary: ["quads", "hamstrings", "calves"], station: "treadmill", horns: 0 }, // wind sprints
  "3294": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "bodyweight", horns: 0 }, // archer push up
  "0025": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "rack", horns: 0, bench: "flat", heavy: true }, // barbell bench press
  "0040": { ok: true, tg: "pectorals", primary: "chest", secondary: ["shoulders", "back"], station: "barbell", horns: 0, bench: "flat" }, // barbell front raise and pullover
  "0045": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "rack", horns: 0, bench: "flat", heavy: true }, // barbell guillotine bench press
  "0047": { ok: true, tg: "pectorals", primary: "chest", focus: "upper chest", secondary: ["triceps", "shoulders"], station: "rack", horns: 0, bench: "incline", heavy: true }, // barbell incline bench press
  "0048": { ok: true, tg: "pectorals", primary: "chest", focus: "upper chest", secondary: ["triceps", "shoulders"], station: "rack", horns: 0, bench: "incline", heavy: true }, // barbell incline reverse-grip press
  "0050": { ok: true, tg: "serratus anterior", primary: "chest", secondary: ["shoulders"], station: "barbell", horns: 0, bench: "incline" }, // barbell incline shoulder raise
  "1257": { ok: true, tg: "pectorals", primary: "chest", focus: "upper chest", secondary: ["triceps", "shoulders"], station: "rack", horns: 0, bench: "incline", heavy: true }, // barbell reverse grip incline bench press
  "0122": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "rack", horns: 0, bench: "flat", heavy: true }, // barbell wide bench press
  "1258": { ok: true, tg: "pectorals", primary: "chest", focus: "upper chest", secondary: ["triceps", "shoulders"], station: "rack", horns: 0, bench: "flat", heavy: true }, // barbell wide reverse grip bench press
  "0151": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "cable", horns: 2, attachment: "handle", bench: "flat", heavy: true }, // cable bench press
  "0155": { ok: true, tg: "pectorals", primary: "chest", secondary: ["shoulders"], station: "cable", horns: 2, attachment: "handle" }, // cable cross-over variation
  "0169": { ok: true, tg: "pectorals", primary: "chest", focus: "upper chest", secondary: ["triceps", "shoulders"], station: "cable", horns: 2, attachment: "handle", bench: "incline", heavy: true }, // cable incline bench press
  "0171": { ok: true, tg: "pectorals", primary: "chest", focus: "upper chest", secondary: ["shoulders"], station: "cable", horns: 2, attachment: "handle", bench: "incline" }, // cable incline fly
  "0179": { ok: true, tg: "pectorals", primary: "chest", focus: "upper chest", secondary: ["shoulders"], station: "cable", horns: 2, attachment: "handle" }, // cable low fly
  "0185": { ok: true, tg: "pectorals", primary: "chest", secondary: ["shoulders"], station: "cable", horns: 2, attachment: "handle", bench: "flat" }, // cable lying fly
  "0188": { ok: true, tg: "pectorals", primary: "chest", secondary: ["shoulders"], station: "cable", horns: 2, attachment: "handle" }, // cable middle fly
  "1265": { ok: true, tg: "pectorals", primary: "chest", focus: "upper chest", secondary: ["triceps", "shoulders"], station: "cable", horns: 1, attachment: "handle", bench: "incline", heavy: true }, // cable one arm incline press
  "2144": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "cable", horns: 2, attachment: "handle", bench: "upright", heavy: true }, // cable seated chest press
  "0227": { ok: true, tg: "pectorals", primary: "chest", secondary: ["shoulders"], station: "cable", horns: 2, attachment: "handle" }, // cable standing fly
  "1269": { ok: true, tg: "pectorals", primary: "chest", secondary: ["shoulders"], station: "cable", horns: 2, attachment: "handle" }, // cable standing up straight crossovers
  "1270": { ok: true, tg: "pectorals", primary: "chest", focus: "upper chest", secondary: ["shoulders"], station: "cable", horns: 2, attachment: "handle" }, // cable upper chest crossovers
  "1271": { ok: true, tg: "pectorals", primary: "chest", secondary: ["shoulders"], station: "bodyweight", horns: 0 }, // chest and front of shoulder stretch
  "3216": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "bodyweight", horns: 0 }, // chest tap push-up (male)
  "1273": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "bodyweight", horns: 0 }, // clap push up
  "0258": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "bodyweight", horns: 0 }, // clock push-up
  "1275": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "bodyweight", horns: 0 }, // drop push up
  "1167": { ok: true, tg: "pectorals", primary: "chest", secondary: ["shoulders"], station: "bodyweight", horns: 0 }, // dynamic chest stretch (male)
  "3327": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "bodyweight", horns: 0 }, // full planche push-up
  "0493": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "bench", horns: 0, bench: "flat" }, // incline push-up
  "3785": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "bench", horns: 0, bench: "flat" }, // incline push-up (on box)
  "0494": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "bench", horns: 0, bench: "flat" }, // incline reverse grip push-up
  "3011": { ok: true, tg: "serratus anterior", primary: "chest", secondary: ["shoulders"], station: "bench", horns: 0, bench: "flat" }, // incline scapula push up
  "1297": { ok: true, tg: "pectorals", primary: "chest", station: "bodyweight", horns: 0 }, // isometric chest squeeze
  "3211": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "bodyweight", horns: 0 }, // kneeling push-up (male)
  "3217": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "bodyweight", horns: 0 }, // modified hindu push-up (male)
  "0642": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "glutes"], station: "bodyweight", horns: 0 }, // outside leg kick push-up
  "1306": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "bodyweight", horns: 0 }, // plyo push up
  "0662": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "bodyweight", horns: 0 }, // push-up
  "0659": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "bodyweight", horns: 0 }, // push-up (wall)
  "0658": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "bodyweight", horns: 0 }, // push-up (wall) v. 2
  "0661": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "hips"], station: "bodyweight", horns: 0 }, // push-up inside leg kick
  "3145": { ok: true, tg: "serratus anterior", primary: "chest", secondary: ["triceps", "shoulders"], station: "bodyweight", horns: 0 }, // push-up plus
  "0666": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "bodyweight", horns: 0 }, // raise single arm push-up
  "3021": { ok: true, tg: "serratus anterior", primary: "chest", secondary: ["shoulders"], station: "bodyweight", horns: 0 }, // scapula push-up
  "0699": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "core"], station: "bodyweight", horns: 0 }, // shoulder tap push-up
  "0725": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "bodyweight", horns: 0 }, // single arm push-up
  "0748": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "smith", horns: 0, bench: "flat", heavy: true }, // smith bench press
  "0757": { ok: true, tg: "pectorals", primary: "chest", focus: "upper chest", secondary: ["triceps", "shoulders"], station: "smith", horns: 0, bench: "incline", heavy: true }, // smith incline bench press
  "0758": { ok: true, tg: "pectorals", primary: "chest", focus: "upper chest", secondary: ["triceps", "shoulders"], station: "smith", horns: 0, bench: "incline", heavy: true }, // smith incline reverse-grip press
  "0759": { ok: true, tg: "serratus anterior", primary: "chest", secondary: ["shoulders"], station: "smith", horns: 0, bench: "incline" }, // smith incline shoulder raises
  "0764": { ok: true, tg: "pectorals", primary: "chest", focus: "upper chest", secondary: ["triceps", "shoulders"], station: "smith", horns: 0, bench: "flat", heavy: true }, // smith reverse-grip press
  "1308": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "smith", horns: 0, bench: "flat", heavy: true }, // smith wide grip bench press
  "0778": { ok: true, tg: "pectorals", primary: "chest", secondary: ["core", "triceps"], station: "bodyweight", horns: 0 }, // spider crawl push up
  "0803": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "bodyweight", horns: 0 }, // superman push-up
  "1311": { ok: true, tg: "pectorals", primary: "chest", secondary: ["triceps", "shoulders"], station: "bodyweight", horns: 0 }, // wide hand push up
  "0084": { ok: true, tg: "abs", primary: "core", secondary: ["back", "shoulders"], station: "barbell", horns: 0 }, // barbell rollerout
  "0083": { ok: true, tg: "abs", primary: "core", secondary: ["back", "shoulders"], station: "barbell", horns: 0, bench: "flat" }, // barbell rollerout from bench
  "2799": { ok: true, tg: "abs", primary: "core", secondary: ["quads"], station: "barbell", horns: 0, bench: "flat" }, // barbell sitted alternate leg raise
  "2800": { ok: true, tg: "abs", primary: "core", secondary: ["quads"], station: "barbell", horns: 0, bench: "flat" }, // barbell sitted alternate leg raise (female)
  "3544": { ok: true, tg: "abs", primary: "core", secondary: ["shoulders"], station: "bodyweight", horns: 0 }, // bodyweight incline side plank
  "2466": { ok: true, tg: "abs", primary: "core", secondary: ["shoulders", "cardio"], station: "bodyweight", horns: 0 }, // bridge - mountain climber (cross body)
  "0870": { ok: true, tg: "abs", primary: "core", secondary: ["hips"], station: "bodyweight", horns: 0 }, // butt-ups
  "0276": { ok: true, tg: "abs", primary: "core", secondary: ["hips"], station: "bodyweight", horns: 0 }, // dead bug
  "0459": { ok: true, tg: "abs", primary: "core", secondary: ["hips"], station: "bodyweight", horns: 0 }, // flutter kicks
  "0472": { ok: true, tg: "abs", primary: "core", secondary: ["hips", "forearms"], station: "pullup", horns: 0 }, // hanging leg raise
  "0475": { ok: true, tg: "abs", primary: "core", secondary: ["hips", "forearms"], station: "pullup", horns: 0 }, // hanging straight leg raise
  "1471": { ok: true, tg: "abs", primary: "core", secondary: ["hamstrings", "shoulders"], station: "bodyweight", horns: 0 }, // inchworm
  "3698": { ok: true, tg: "abs", primary: "core", secondary: ["hamstrings", "shoulders"], station: "bodyweight", horns: 0 }, // inchworm v. 2
  "0491": { ok: true, tg: "abs", primary: "core", secondary: ["hips"], station: "bench", horns: 0, bench: "incline" }, // incline leg hip raise (leg straight)
  "3239": { ok: true, tg: "abs", primary: "core", secondary: ["shoulders"], station: "bodyweight", horns: 0 }, // kneeling plank tap shoulder (male)
  "3419": { ok: true, tg: "abs", primary: "core", secondary: ["triceps", "hips"], station: "bodyweight", horns: 0 }, // l-sit on floor
  "0570": { ok: true, tg: "abs", primary: "core", secondary: ["hips"], station: "bench", horns: 0, bench: "flat" }, // leg pull in flat bench
  "0620": { ok: true, tg: "abs", primary: "core", secondary: ["hips"], station: "bench", horns: 0, bench: "flat" }, // lying leg raise flat bench
  "0865": { ok: true, tg: "abs", primary: "core", secondary: ["hips"], station: "bodyweight", horns: 0 }, // lying leg-hip raise
  "3147": { ok: true, tg: "abs", primary: "core", station: "bodyweight", horns: 0 }, // pelvic tilt
  "3665": { ok: true, tg: "abs", primary: "core", secondary: ["shoulders", "triceps"], station: "bodyweight", horns: 0 }, // power point plank
  "0664": { ok: true, tg: "abs", primary: "core", secondary: ["chest", "triceps", "shoulders"], station: "bodyweight", horns: 0 }, // push-up to side plank
  "3663": { ok: true, tg: "abs", primary: "core", secondary: ["glutes", "hamstrings"], station: "bodyweight", horns: 0 }, // reverse plank with leg lift
  "0689": { ok: true, tg: "abs", primary: "core", secondary: ["hips"], station: "bodyweight", horns: 0 }, // seated leg raise
  "3699": { ok: true, tg: "abs", primary: "core", secondary: ["shoulders"], station: "bodyweight", horns: 0 }, // shoulder tap
  "0705": { ok: true, tg: "abs", primary: "core", station: "bodyweight", horns: 0 }, // side bridge v. 2
  "1364": { ok: true, tg: "abs", primary: "core", secondary: ["lower back"], station: "bodyweight", horns: 0 }, // standing pelvic tilt
  "1411": { ok: true, tg: "forearms", primary: "forearms", station: "rack", horns: 0, bench: "flat" }, // barbell palms down wrist curl over a bench
  "1412": { ok: true, tg: "forearms", primary: "forearms", station: "rack", horns: 0, bench: "flat" }, // barbell palms up wrist curl over a bench
  "0079": { ok: true, tg: "forearms", primary: "forearms", station: "barbell", horns: 0 }, // barbell revers wrist curl v. 2
  "0082": { ok: true, tg: "forearms", primary: "forearms", station: "barbell", horns: 0 }, // barbell reverse wrist curl
  "0104": { ok: true, tg: "forearms", primary: "forearms", station: "barbell", horns: 0 }, // barbell standing back wrist curl
  "0126": { ok: true, tg: "forearms", primary: "forearms", station: "barbell", horns: 0 }, // barbell wrist curl
  "0125": { ok: true, tg: "forearms", primary: "forearms", station: "barbell", horns: 0 }, // barbell wrist curl v. 2
  "0210": { ok: true, tg: "forearms", primary: "forearms", station: "cable", horns: 1, attachment: "flatbar" }, // cable reverse wrist curl
  "0224": { ok: true, tg: "forearms", primary: "forearms", station: "cable", horns: 1, attachment: "flatbar" }, // cable standing back wrist curl
  "0247": { ok: true, tg: "forearms", primary: "forearms", station: "cable", horns: 1, attachment: "flatbar" }, // cable wrist curl
  "0455": { ok: true, tg: "forearms", primary: "forearms", station: "barbell", horns: 0, bench: "flat" }, // finger curls
  "0721": { ok: true, tg: "forearms", primary: "forearms", station: "bodyweight", horns: 0 }, // side wrist pull stretch
  "1426": { ok: true, tg: "forearms", primary: "forearms", station: "smith", horns: 0, bench: "flat" }, // smith seated wrist curl
  "0771": { ok: true, tg: "forearms", primary: "forearms", station: "smith", horns: 0 }, // smith standing back wrist curl
  "1428": { ok: true, tg: "forearms", primary: "forearms", station: "bodyweight", horns: 0 }, // wrist circles
  "1409": { ok: true, tg: "glutes", primary: "glutes", secondary: ["hamstrings"], station: "barbell", horns: 0, heavy: true }, // barbell glute bridge
  "3562": { ok: true, tg: "glutes", primary: "glutes", secondary: ["hamstrings"], station: "barbell", horns: 0, bench: "flat", heavy: true }, // barbell glute bridge two legs on bench (male)
  "1410": { ok: true, tg: "adductors", primary: "glutes", secondary: ["quads", "hips"], station: "rack", horns: 0, sh: true }, // barbell lateral lunge
  "0058": { ok: true, tg: "glutes", primary: "glutes", secondary: ["hamstrings"], station: "barbell", horns: 0, bench: "flat", heavy: true }, // barbell lying lifting (on hip)
  "0078": { ok: true, tg: "glutes", primary: "glutes", secondary: ["quads", "hamstrings"], station: "rack", horns: 0, sh: true }, // barbell rear lunge
  "0077": { ok: true, tg: "glutes", primary: "glutes", secondary: ["quads", "hamstrings"], station: "rack", horns: 0, sh: true }, // barbell rear lunge v. 2
  "0102": { ok: true, tg: "glutes", primary: "glutes", secondary: ["hamstrings"], station: "rack", horns: 0, sh: true }, // barbell squat (on knees)
  "0130": { ok: true, tg: "glutes", primary: "glutes", secondary: ["hamstrings"], station: "bench", horns: 0, bench: "flat" }, // bench hip extension
  "0196": { ok: true, tg: "glutes", primary: "glutes", secondary: ["hamstrings"], station: "cable", horns: 1, attachment: "rope", heavy: true }, // cable pull through (with rope)
  "0228": { ok: true, tg: "glutes", primary: "glutes", secondary: ["hamstrings"], station: "cable", horns: 1, attachment: "ankle" }, // cable standing hip extension
  "3769": { ok: true, tg: "glutes", primary: "glutes", secondary: ["quads", "hips"], station: "bodyweight", horns: 0 }, // curtsey squat
  "3561": { ok: true, tg: "glutes", primary: "glutes", secondary: ["hamstrings", "core"], station: "bodyweight", horns: 0 }, // glute bridge march
  "3523": { ok: true, tg: "glutes", primary: "glutes", secondary: ["hamstrings"], station: "bench", horns: 0, bench: "flat" }, // glute bridge two legs on bench (male)
  "0484": { ok: true, tg: "glutes", primary: "glutes", secondary: ["hamstrings", "core"], station: "bodyweight", horns: 0 }, // hip raise (bent knee)
  "1419": { ok: true, tg: "glutes", primary: "glutes", secondary: ["lower back", "core"], station: "bodyweight", horns: 0 }, // iron cross stretch
  "3013": { ok: true, tg: "glutes", primary: "glutes", secondary: ["hamstrings"], station: "bodyweight", horns: 0 }, // low glute bridge on floor
  "1422": { ok: true, tg: "glutes", primary: "glutes", secondary: ["hamstrings", "core"], station: "bodyweight", horns: 0 }, // pelvic tilt into bridge
  "1423": { ok: true, tg: "glutes", primary: "glutes", secondary: ["hamstrings", "lower back"], station: "bench", horns: 0, bench: "flat" }, // reverse hyper on flat bench
  "1424": { ok: true, tg: "glutes", primary: "glutes", station: "bodyweight", horns: 0 }, // seated glute stretch
  "2567": { ok: true, tg: "glutes", primary: "glutes", station: "bodyweight", horns: 0 }, // seated piriformis stretch
  "3645": { ok: true, tg: "glutes", primary: "glutes", secondary: ["hamstrings"], station: "bodyweight", horns: 0 }, // single leg bridge with outstretched leg
  "0756": { ok: true, tg: "glutes", primary: "glutes", secondary: ["hamstrings"], station: "smith", horns: 0, bench: "flat", heavy: true }, // smith hip raise
  "1434": { ok: true, tg: "glutes", primary: "glutes", secondary: ["quads", "hamstrings"], station: "smith", horns: 0, heavy: true, sh: true }, // smith low bar squat
  "0769": { ok: true, tg: "glutes", primary: "glutes", secondary: ["quads", "hamstrings"], station: "smith", horns: 0, heavy: true, sh: true }, // smith sprint lunge
  "3142": { ok: true, tg: "glutes", primary: "glutes", secondary: ["quads", "hips"], station: "smith", horns: 0, heavy: true, sh: true }, // smith sumo squat
  "3433": { ok: true, tg: "glutes", primary: "glutes", secondary: ["lower back"], station: "bodyweight", horns: 0 }, // swimmer kicks v. 2 (male)
  "3235": { ok: true, tg: "hamstrings", primary: "hamstrings", secondary: ["calves"], station: "cable", horns: 1, attachment: "ankle", bench: "flat" }, // cable assisted inverse leg curl
  "1548": { ok: true, tg: "hamstrings", primary: "hamstrings", secondary: ["calves"], station: "bench", horns: 0, bench: "flat" }, // chair leg extended stretch
  "1511": { ok: true, tg: "hamstrings", primary: "hamstrings", station: "bodyweight", horns: 0 }, // hamstring stretch
  "0496": { ok: true, tg: "hamstrings", primary: "hamstrings", station: "bench", horns: 0, bench: "flat" }, // inverse leg curl (bench support)
  "2400": { ok: true, tg: "hamstrings", primary: "hamstrings", secondary: ["calves"], station: "cable", horns: 1, attachment: "ankle", bench: "flat" }, // inverse leg curl (on pull-up cable machine)
  "1576": { ok: true, tg: "hamstrings", primary: "hamstrings", station: "bodyweight", horns: 0 }, // leg up hamstring stretch
  "1585": { ok: true, tg: "hamstrings", primary: "hamstrings", secondary: ["calves"], station: "bodyweight", horns: 0 }, // runners stretch
  "1587": { ok: true, tg: "hamstrings", primary: "hamstrings", secondary: ["hips"], station: "bodyweight", horns: 0 }, // seated wide angle pose sequence
  "0697": { ok: true, tg: "hamstrings", primary: "hamstrings", secondary: ["glutes"], station: "smith", horns: 0 }, // self assisted inverse leg curl
  "0696": { ok: true, tg: "hamstrings", primary: "hamstrings", secondary: ["glutes"], station: "smith", horns: 0 }, // self assisted inverse leg curl (on floor)
  "0795": { ok: true, tg: "hamstrings", primary: "hamstrings", station: "cable", horns: 1, attachment: "ankle" }, // standing single leg curl
  "1604": { ok: true, tg: "hamstrings", primary: "hamstrings", secondary: ["hips", "glutes"], station: "bodyweight", horns: 0 }, // world greatest stretch
  "1494": { ok: true, tg: "adductors", primary: "hips", station: "bodyweight", horns: 0 }, // butterfly yoga pose
  "0168": { ok: true, tg: "adductors", primary: "hips", station: "cable", horns: 1, attachment: "ankle" }, // cable hip adduction
  "2571": { ok: true, tg: "adductors", primary: "hips", station: "bodyweight", horns: 0 }, // rocking frog stretch
  "1774": { ok: true, tg: "abductors", primary: "hips", secondary: ["core", "glutes"], station: "bodyweight", horns: 0 }, // side bridge hip abduction
  "0710": { ok: true, tg: "abductors", primary: "hips", secondary: ["glutes"], station: "cable", horns: 1, attachment: "ankle" }, // side hip abduction
  "3667": { ok: true, tg: "adductors", primary: "hips", station: "bodyweight", horns: 0 }, // side lying hip adduction (male)
  "1775": { ok: true, tg: "adductors", primary: "hips", secondary: ["core"], station: "bodyweight", horns: 0 }, // side plank hip adduction
  "1427": { ok: true, tg: "abductors", primary: "hips", secondary: ["glutes"], station: "bodyweight", horns: 0 }, // straight leg outer hip abductor
  "3292": { ok: true, tg: "spine", primary: "lower back", secondary: ["hamstrings", "glutes"], station: "bodyweight", horns: 0 }, // elevator
  "1352": { ok: true, tg: "spine", primary: "lower back", secondary: ["glutes"], station: "bodyweight", horns: 0 }, // lower back curl
  "0690": { ok: true, tg: "spine", primary: "lower back", secondary: ["hamstrings"], station: "bodyweight", horns: 0 }, // seated lower back stretch
  "1362": { ok: true, tg: "spine", primary: "lower back", station: "bodyweight", horns: 0 }, // sphinx
  "1363": { ok: true, tg: "spine", primary: "lower back", station: "bodyweight", horns: 0 }, // spine stretch
  "1366": { ok: true, tg: "spine", primary: "lower back", secondary: ["core"], station: "bodyweight", horns: 0 }, // upward facing dog
  "1512": { ok: true, tg: "quads", primary: "quads", station: "bodyweight", horns: 0 }, // all fours squad stretch
  "1473": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "calves"], station: "bodyweight", horns: 0 }, // backward jump
  "0024": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes"], station: "rack", horns: 0, bench: "flat", heavy: true, sh: true }, // barbell bench front squat
  "0026": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes"], station: "rack", horns: 0, bench: "flat", heavy: true, sh: true }, // barbell bench squat
  "0029": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes"], station: "rack", horns: 0, heavy: true, sh: true }, // barbell clean-grip front squat
  "0039": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes"], station: "rack", horns: 0, heavy: true, sh: true }, // barbell front chest squat
  "0042": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes"], station: "rack", horns: 0, heavy: true, sh: true }, // barbell front squat
  "0043": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "hamstrings"], station: "rack", horns: 0, heavy: true, sh: true }, // barbell full squat
  "1545": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "core"], station: "rack", horns: 0, heavy: true }, // barbell full zercher squat
  "0046": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "hamstrings"], station: "rack", horns: 0, heavy: true }, // barbell hack squat
  "1436": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes"], station: "rack", horns: 0, heavy: true, sh: true }, // barbell high bar squat
  "1435": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "hamstrings"], station: "rack", horns: 0, heavy: true, sh: true }, // barbell low bar squat
  "0054": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes"], station: "rack", horns: 0, sh: true }, // barbell lunge
  "0063": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes"], station: "rack", horns: 0, heavy: true, sh: true }, // barbell narrow stance squat
  "0098": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "hips"], station: "rack", horns: 0, heavy: true, sh: true }, // barbell side split squat
  "0097": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "hips"], station: "rack", horns: 0, sh: true }, // barbell side split squat v. 2
  "0099": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes"], station: "rack", horns: 0, sh: true }, // barbell single leg split squat
  "0101": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes"], station: "rack", horns: 0, heavy: true, sh: true }, // barbell speed squat
  "2810": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes"], station: "rack", horns: 0, sh: true }, // barbell split squat v. 2
  "0124": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "hips"], station: "rack", horns: 0, heavy: true, sh: true }, // barbell wide squat
  "0127": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "core"], station: "rack", horns: 0, heavy: true }, // barbell zercher squat
  "3543": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "calves"], station: "bodyweight", horns: 0 }, // bodyweight drop jump squat
  "1472": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "calves"], station: "bodyweight", horns: 0 }, // forward jump
  "3470": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "hamstrings"], station: "bodyweight", horns: 0 }, // forward lunge (male)
  "3194": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "core"], station: "rack", horns: 0, heavy: true, sh: true }, // frankenstein squat
  "3221": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes"], station: "bodyweight", horns: 0 }, // half knee bends (male)
  "0514": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "calves"], station: "bodyweight", horns: 0 }, // jump squat
  "0513": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "calves"], station: "bodyweight", horns: 0 }, // jump squat v. 2
  "0555": { ok: true, tg: "quads", primary: "quads", secondary: ["core"], station: "bench", horns: 0, bench: "flat" }, // kick out sit
  "3582": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "calves"], station: "bodyweight", horns: 0 }, // lunge with jump
  "0613": { ok: true, tg: "quads", primary: "quads", station: "bodyweight", horns: 0 }, // lying (side) quads stretch
  "0624": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "core"], station: "bodyweight", horns: 0 }, // march sit (wall)
  "1476": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes"], station: "bodyweight", horns: 0 }, // one leg squat
  "1687": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "shoulders"], station: "bodyweight", horns: 0 }, // posterior step to overhead reach
  "3119": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes"], station: "bodyweight", horns: 0 }, // potty squat
  "3132": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes"], station: "bodyweight", horns: 0 }, // potty squat with support
  "3533": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes"], station: "bodyweight", horns: 0 }, // quads
  "1759": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "core"], station: "bodyweight", horns: 0 }, // single leg squat (pistol) male
  "1489": { ok: true, tg: "quads", primary: "quads", station: "bodyweight", horns: 0 }, // sissy squat
  "0750": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes"], station: "smith", horns: 0, heavy: true, sh: true }, // smith chair squat
  "1433": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "core"], station: "smith", horns: 0, heavy: true, sh: true }, // smith front squat (clean grip)
  "3281": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "hamstrings"], station: "smith", horns: 0, heavy: true, sh: true }, // smith full squat
  "0755": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes"], station: "smith", horns: 0, heavy: true, sh: true }, // smith hack squat
  "0768": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes"], station: "smith", horns: 0, heavy: true, sh: true }, // smith single leg split squat
  "0770": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "hamstrings"], station: "smith", horns: 0, heavy: true, sh: true }, // smith squat
  "2368": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes"], station: "bodyweight", horns: 0 }, // split squats
  "1685": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "shoulders"], station: "bodyweight", horns: 0 }, // squat to overhead reach
  "1460": { ok: true, tg: "quads", primary: "quads", secondary: ["glutes", "hamstrings"], station: "bodyweight", horns: 0 }, // walking lunge
  "0041": { ok: true, tg: "delts", primary: "shoulders", focus: "front delts", station: "barbell", horns: 0 }, // barbell front raise
  "0107": { ok: true, tg: "delts", primary: "shoulders", focus: "front delts", station: "barbell", horns: 0 }, // barbell standing front raise over head
  "0120": { ok: true, tg: "delts", primary: "shoulders", focus: "side delts", secondary: ["traps"], station: "barbell", horns: 0 }, // barbell upright row
  "0119": { ok: true, tg: "delts", primary: "shoulders", focus: "side delts", secondary: ["traps"], station: "barbell", horns: 0 }, // barbell upright row v. 2
  "0121": { ok: true, tg: "delts", primary: "shoulders", focus: "side delts", secondary: ["traps"], station: "barbell", horns: 0 }, // barbell upright row v. 3
  "0123": { ok: true, tg: "delts", primary: "shoulders", focus: "side delts", secondary: ["traps"], station: "barbell", horns: 0 }, // barbell wide-grip upright row
  "0148": { ok: true, tg: "delts", primary: "shoulders", focus: "front delts", secondary: ["triceps"], station: "cable", horns: 2, attachment: "handle", bench: "upright" }, // cable alternate shoulder press
  "0154": { ok: true, tg: "delts", primary: "shoulders", focus: "rear delts", secondary: ["back"], station: "cable", horns: 2, attachment: "handle" }, // cable cross-over revers fly
  "0161": { ok: true, tg: "delts", primary: "shoulders", focus: "front delts", station: "cable", horns: 1, attachment: "handle" }, // cable forward raise
  "0162": { ok: true, tg: "delts", primary: "shoulders", focus: "front delts", station: "cable", horns: 1, attachment: "handle" }, // cable front raise
  "0164": { ok: true, tg: "delts", primary: "shoulders", focus: "front delts", station: "cable", horns: 1, attachment: "handle" }, // cable front shoulder raise
  "3697": { ok: true, tg: "delts", primary: "shoulders", focus: "rear delts", secondary: ["back"], station: "cable", horns: 1, attachment: "rope" }, // cable kneeling rear delt row (with rope) (male)
  "0178": { ok: true, tg: "delts", primary: "shoulders", focus: "side delts", station: "cable", horns: 1, attachment: "handle" }, // cable lateral raise
  "0192": { ok: true, tg: "delts", primary: "shoulders", focus: "side delts", station: "cable", horns: 1, attachment: "handle" }, // cable one arm lateral raise
  "0202": { ok: true, tg: "delts", primary: "shoulders", focus: "rear delts", secondary: ["back"], station: "cable", horns: 1, attachment: "handle" }, // cable rear delt row (stirrups)
  "0203": { ok: true, tg: "delts", primary: "shoulders", focus: "rear delts", secondary: ["back"], station: "cable", horns: 1, attachment: "rope" }, // cable rear delt row (with rope)
  "0215": { ok: true, tg: "delts", primary: "shoulders", focus: "rear delts", secondary: ["back"], station: "cable", horns: 1, attachment: "handle", bench: "flat" }, // cable seated rear lateral raise
  "0216": { ok: true, tg: "delts", primary: "shoulders", station: "cable", horns: 1, attachment: "handle", bench: "flat" }, // cable seated shoulder internal rotation
  "0219": { ok: true, tg: "delts", primary: "shoulders", focus: "front delts", secondary: ["triceps"], station: "cable", horns: 2, attachment: "handle", bench: "upright" }, // cable shoulder press
  "0225": { ok: true, tg: "delts", primary: "shoulders", focus: "rear delts", secondary: ["back"], station: "cable", horns: 2, attachment: "handle" }, // cable standing cross-over high reverse fly
  "0233": { ok: true, tg: "delts", primary: "shoulders", focus: "rear delts", secondary: ["back"], station: "cable", horns: 1, attachment: "rope" }, // cable standing rear delt row (with rope)
  "0235": { ok: true, tg: "delts", primary: "shoulders", focus: "rear delts", station: "cable", horns: 1, attachment: "handle" }, // cable standing shoulder external rotation
  "0240": { ok: true, tg: "delts", primary: "shoulders", focus: "rear delts", secondary: ["back"], station: "cable", horns: 2, attachment: "handle", bench: "flat" }, // cable supine reverse fly
  "0246": { ok: true, tg: "delts", primary: "shoulders", focus: "side delts", secondary: ["traps"], station: "cable", horns: 1, attachment: "flatbar" }, // cable upright row
  "3301": { ok: true, tg: "delts", primary: "shoulders", focus: "front delts", secondary: ["core", "chest"], station: "bodyweight", horns: 0 }, // frog planche
  "3299": { ok: true, tg: "delts", primary: "shoulders", focus: "front delts", secondary: ["core", "chest"], station: "bodyweight", horns: 0 }, // full planche
  "3237": { ok: true, tg: "delts", primary: "shoulders", focus: "side delts", station: "landmine", horns: 0 }, // landmine lateral raise
  "3300": { ok: true, tg: "delts", primary: "shoulders", focus: "front delts", secondary: ["core", "chest"], station: "bodyweight", horns: 0 }, // lean planche
  "2271": { ok: true, tg: "delts", primary: "shoulders", secondary: ["core", "cardio"], station: "bodyweight", horns: 0 }, // left hook. boxing
  "3662": { ok: true, tg: "delts", primary: "shoulders", focus: "front delts", secondary: ["chest", "triceps"], station: "bodyweight", horns: 0 }, // pike-to-cobra push-up
  "0669": { ok: true, tg: "delts", primary: "shoulders", focus: "rear delts", station: "bodyweight", horns: 0 }, // rear deltoid stretch
  "0765": { ok: true, tg: "delts", primary: "shoulders", focus: "front delts", secondary: ["triceps"], station: "smith", horns: 0, bench: "upright", heavy: true }, // smith seated shoulder press
  "0775": { ok: true, tg: "delts", primary: "shoulders", focus: "side delts", secondary: ["traps"], station: "smith", horns: 0 }, // smith upright row
  "3298": { ok: true, tg: "delts", primary: "shoulders", focus: "front delts", secondary: ["core", "chest"], station: "bodyweight", horns: 0 }, // straddle planche
  "0095": { ok: true, tg: "traps", primary: "traps", secondary: ["forearms"], station: "barbell", horns: 0 }, // barbell shrug
  "0220": { ok: true, tg: "traps", primary: "traps", secondary: ["forearms"], station: "cable", horns: 1, attachment: "flatbar" }, // cable shrug
  "1403": { ok: true, tg: "levator scapulae", primary: "traps", station: "bodyweight", horns: 0 }, // neck side stretch
  "0716": { ok: true, tg: "levator scapulae", primary: "traps", station: "bodyweight", horns: 0 }, // side push neck stretch
  "0746": { ok: true, tg: "traps", primary: "traps", secondary: ["forearms"], station: "smith", horns: 0 }, // smith back shrug
  "0767": { ok: true, tg: "traps", primary: "traps", secondary: ["forearms"], station: "smith", horns: 0 }, // smith shrug
  "0030": { ok: true, tg: "triceps", primary: "triceps", secondary: ["chest", "shoulders"], station: "rack", horns: 0, bench: "flat", heavy: true }, // barbell close-grip bench press
  "1719": { ok: true, tg: "triceps", primary: "triceps", secondary: ["chest", "shoulders"], station: "rack", horns: 0, bench: "incline", heavy: true }, // barbell incline close grip bench press
  "0052": { ok: true, tg: "triceps", primary: "triceps", secondary: ["chest", "shoulders"], station: "rack", horns: 0, bench: "flat", heavy: true }, // barbell jm bench press
  "1720": { ok: true, tg: "triceps", primary: "triceps", station: "rack", horns: 0, bench: "flat" }, // barbell lying back of the head tricep extension
  "0055": { ok: true, tg: "triceps", primary: "triceps", secondary: ["chest", "shoulders"], station: "rack", horns: 0, bench: "flat", heavy: true }, // barbell lying close-grip press
  "0056": { ok: true, tg: "triceps", primary: "triceps", station: "rack", horns: 0, bench: "flat" }, // barbell lying close-grip triceps extension
  "0057": { ok: true, tg: "triceps", primary: "triceps", station: "rack", horns: 0, bench: "flat" }, // barbell lying extension
  "0061": { ok: true, tg: "triceps", primary: "triceps", station: "rack", horns: 0, bench: "flat" }, // barbell lying triceps extension
  "0060": { ok: true, tg: "triceps", primary: "triceps", station: "rack", horns: 0, bench: "flat" }, // barbell lying triceps extension skull crusher
  "1751": { ok: true, tg: "triceps", primary: "triceps", secondary: ["chest", "shoulders"], station: "rack", horns: 0, bench: "flat", heavy: true }, // barbell pin presses
  "2187": { ok: true, tg: "triceps", primary: "triceps", secondary: ["chest", "shoulders"], station: "rack", horns: 0, bench: "flat", heavy: true }, // barbell reverse close-grip bench press
  "1721": { ok: true, tg: "triceps", primary: "triceps", station: "rack", horns: 0, bench: "flat" }, // barbell reverse grip skullcrusher
  "1718": { ok: true, tg: "triceps", primary: "triceps", station: "rack", horns: 0, bench: "upright" }, // barbell seated close grip behind neck triceps extension
  "0092": { ok: true, tg: "triceps", primary: "triceps", station: "rack", horns: 0, bench: "upright" }, // barbell seated overhead triceps extension
  "0109": { ok: true, tg: "triceps", primary: "triceps", station: "barbell", horns: 0 }, // barbell standing overhead triceps extension
  "0129": { ok: true, tg: "triceps", primary: "triceps", secondary: ["chest", "shoulders"], station: "bench", horns: 0, bench: "flat" }, // bench dip (knees bent)
  "1399": { ok: true, tg: "triceps", primary: "triceps", secondary: ["chest", "shoulders"], station: "bench", horns: 0, bench: "flat" }, // bench dip on floor
  "0137": { ok: true, tg: "triceps", primary: "triceps", secondary: ["chest", "shoulders"], station: "bench", horns: 0, bench: "flat" }, // body-up
  "1771": { ok: true, tg: "triceps", primary: "triceps", secondary: ["chest"], station: "bodyweight", horns: 0 }, // bodyweight kneeling triceps extension
  "0149": { ok: true, tg: "triceps", primary: "triceps", station: "cable", horns: 1, attachment: "handle" }, // cable alternate triceps extension
  "0152": { ok: true, tg: "triceps", primary: "triceps", station: "cable", horns: 1, attachment: "handle", bench: "flat" }, // cable concentration extension (on knee)
  "1722": { ok: true, tg: "triceps", primary: "triceps", station: "cable", horns: 1, attachment: "rope" }, // cable high pulley overhead tricep extension
  "0173": { ok: true, tg: "triceps", primary: "triceps", station: "cable", horns: 1, attachment: "flatbar", bench: "incline" }, // cable incline triceps extension
  "0860": { ok: true, tg: "triceps", primary: "triceps", station: "cable", horns: 1, attachment: "handle" }, // cable kickback
  "0176": { ok: true, tg: "triceps", primary: "triceps", station: "cable", horns: 1, attachment: "rope" }, // cable kneeling triceps extension
  "0186": { ok: true, tg: "triceps", primary: "triceps", station: "cable", horns: 1, attachment: "rope", bench: "flat" }, // cable lying triceps extension v. 2
  "1723": { ok: true, tg: "triceps", primary: "triceps", station: "cable", horns: 1, attachment: "rope" }, // cable one arm tricep pushdown
  "0194": { ok: true, tg: "triceps", primary: "triceps", station: "cable", horns: 1, attachment: "rope" }, // cable overhead triceps extension (rope attachment)
  "0201": { ok: true, tg: "triceps", primary: "triceps", station: "cable", horns: 1, attachment: "flatbar" }, // cable pushdown
  "0200": { ok: true, tg: "triceps", primary: "triceps", station: "cable", horns: 1, attachment: "rope" }, // cable pushdown (with rope attachment)
  "0204": { ok: true, tg: "triceps", primary: "triceps", secondary: ["shoulders"], station: "cable", horns: 1, attachment: "handle" }, // cable rear drive
  "0207": { ok: true, tg: "triceps", primary: "triceps", secondary: ["forearms"], station: "cable", horns: 1, attachment: "flatbar" }, // cable reverse-grip pushdown
  "1724": { ok: true, tg: "triceps", primary: "triceps", station: "cable", horns: 1, attachment: "rope" }, // cable rope high pulley overhead tricep extension
  "1725": { ok: true, tg: "triceps", primary: "triceps", station: "cable", horns: 1, attachment: "rope", bench: "incline" }, // cable rope incline tricep extension
  "1726": { ok: true, tg: "triceps", primary: "triceps", station: "cable", horns: 1, attachment: "rope" }, // cable rope lying on floor tricep extension
  "0231": { ok: true, tg: "triceps", primary: "triceps", station: "cable", horns: 1, attachment: "handle" }, // cable standing one arm triceps extension
  "1727": { ok: true, tg: "triceps", primary: "triceps", station: "cable", horns: 1, attachment: "handle" }, // cable standing reverse grip one arm overhead tricep extension
  "0241": { ok: true, tg: "triceps", primary: "triceps", station: "cable", horns: 1, attachment: "vhandle" }, // cable triceps pushdown (v-bar)
  "0259": { ok: true, tg: "triceps", primary: "triceps", secondary: ["chest", "shoulders"], station: "bodyweight", horns: 0 }, // close-grip push-up
  "2398": { ok: true, tg: "triceps", primary: "triceps", secondary: ["chest", "shoulders"], station: "bodyweight", horns: 0 }, // close-grip push-up (on knees)
  "0283": { ok: true, tg: "triceps", primary: "triceps", secondary: ["chest", "shoulders"], station: "bodyweight", horns: 0 }, // diamond push-up
  "3287": { ok: true, tg: "triceps", primary: "triceps", secondary: ["chest", "shoulders"], station: "bench", horns: 0, bench: "flat" }, // elbow dips
  "0490": { ok: true, tg: "triceps", primary: "triceps", secondary: ["chest", "shoulders"], station: "bodyweight", horns: 0, bench: "flat" }, // incline close-grip push-up
  "1421": { ok: true, tg: "triceps", primary: "triceps", secondary: ["chest", "shoulders"], station: "bodyweight", horns: 0 }, // modified push up to lower arms
  "0643": { ok: true, tg: "triceps", primary: "triceps", station: "bodyweight", horns: 0 }, // overhead triceps stretch
  "1467": { ok: true, tg: "triceps", primary: "triceps", secondary: ["chest", "core"], station: "bodyweight", horns: 0 }, // push-up on lower arms
  "0717": { ok: true, tg: "triceps", primary: "triceps", secondary: ["shoulders", "core"], station: "bodyweight", horns: 0 }, // side push-up
  "0751": { ok: true, tg: "triceps", primary: "triceps", secondary: ["chest", "shoulders"], station: "smith", horns: 0, bench: "flat", heavy: true }, // smith close-grip bench press
  "1752": { ok: true, tg: "triceps", primary: "triceps", station: "smith", horns: 0, bench: "incline" }, // smith machine incline tricep extension
  "0812": { ok: true, tg: "triceps", primary: "triceps", secondary: ["chest", "shoulders"], station: "bench", horns: 0, bench: "flat" }, // triceps dip (bench leg)
  "0815": { ok: true, tg: "triceps", primary: "triceps", secondary: ["chest", "shoulders"], station: "bench", horns: 0, bench: "flat" }, // triceps dips floor
  "0817": { ok: true, tg: "triceps", primary: "triceps", station: "bodyweight", horns: 0 }, // triceps stretch
  "3297": { ok: false, tg: "lats", primary: "back", why: "Back lever is an advanced loaded-extension hold, risky for a bad back." }, // back lever
  "3167": { ok: false, tg: "upper back", primary: "back", why: "Towel variant of the squatting row; the plain version covers it." }, // bodyweight squatting row (with towel)
  "3156": { ok: false, tg: "upper back", primary: "back", why: "Instructions call for a dumbbell; he owns none." }, // bodyweight standing close-grip one arm row
  "3161": { ok: false, tg: "upper back", primary: "back", why: "Towel variant of the one-arm row; the plain version covers it." }, // bodyweight standing one arm row (with towel)
  "3165": { ok: false, tg: "upper back", primary: "back", why: "Towel variant of the standing row; the plain version covers it." }, // bodyweight standing row (with towel)
  "0248": { ok: false, tg: "upper back", primary: "back", why: "Needs a cambered bar and a raised row bench." }, // cambered bar lying row
  "0498": { ok: false, tg: "upper back", primary: "back", why: "Needs a suspension trainer." }, // inverted row with straps
  "0558": { ok: false, tg: "lats", primary: "back", why: "Kipping whips the spine; off the bad-back list." }, // kipping muscle up
  "0631": { ok: false, tg: "lats", primary: "back", why: "Needs clearance over the bar; not practical on the G3." }, // muscle up
  "1401": { ok: false, tg: "lats", primary: "back", why: "Needs a vertical bar he does not have." }, // muscle-up (on vertical bar)
  "1773": { ok: false, tg: "upper back", primary: "back", why: "Towel variant; needs a towel anchor, and the standing row covers it." }, // one arm towel row
  "3304": { ok: false, tg: "upper back", primary: "back", why: "Knees-to-chest inversion is spinal flexion; off the bad-back list." }, // skin the cat
  "1360": { ok: false, tg: "upper back", primary: "back", why: "Bent-over self-supported row; the back holds the torso." }, // smith one arm row
  "0808": { ok: false, tg: "upper back", primary: "back", why: "Needs a suspension trainer." }, // suspended row
  "0023": { ok: false, tg: "biceps", primary: "biceps", why: "Alternating curls need dumbbells." }, // barbell alternate biceps curl
  "2407": { ok: false, tg: "biceps", primary: "biceps", why: "Needs an arm blaster." }, // barbell biceps curl (with arm blaster)
  "0059": { ok: false, tg: "biceps", primary: "biceps", why: "Needs a preacher bench." }, // barbell lying preacher curl
  "0070": { ok: false, tg: "biceps", primary: "biceps", why: "Needs a preacher bench." }, // barbell preacher curl
  "0081": { ok: false, tg: "biceps", primary: "biceps", why: "Needs a preacher pad." }, // barbell reverse preacher curl
  "2414": { ok: false, tg: "biceps", primary: "biceps", why: "One-handed full barbell is unworkable; needs a dumbbell." }, // barbell standing concentration curl
  "1769": { ok: false, tg: "biceps", primary: "biceps", why: "No resistance at all; does nothing." }, // bodyweight side lying biceps curl
  "1633": { ok: false, tg: "biceps", primary: "biceps", why: "Needs a preacher pad." }, // cable one arm preacher curl
  "1635": { ok: false, tg: "biceps", primary: "biceps", why: "Needs a preacher pad." }, // cable one arm reverse preacher curl
  "0195": { ok: false, tg: "biceps", primary: "biceps", why: "Needs a preacher pad." }, // cable preacher curl
  "0209": { ok: false, tg: "biceps", primary: "biceps", why: "Needs a preacher pad." }, // cable reverse preacher curl
  "1639": { ok: false, tg: "biceps", primary: "biceps", why: "Needs a preacher pad." }, // cable rope hammer preacher curl
  "1640": { ok: false, tg: "biceps", primary: "biceps", why: "Needs a preacher pad." }, // cable rope one arm hammer preacher curl
  "1374": { ok: false, tg: "calves", primary: "calves", why: "Needs a plyo box to jump from." }, // box jump down with one leg stabilization
  "0251": { ok: false, tg: "pectorals", primary: "chest", why: "Needs dip bars." }, // chest dip
  "1430": { ok: false, tg: "pectorals", primary: "chest", why: "Needs dip bars; the G3 has no dip station." }, // chest dip (on dip-pull-up cage)
  "2462": { ok: false, tg: "pectorals", primary: "chest", why: "Needs dip bars." }, // chest dip on straight bar
  "0458": { ok: false, tg: "pectorals", primary: "chest", why: "A fly can't be done with a barbell; junk entry." }, // floor fly (with barbell)
  "3315": { ok: false, tg: "pectorals", primary: "chest", why: "Rings-level skill — needs rings or parallettes." }, // full maltese
  "0492": { ok: false, tg: "pectorals", primary: "chest", why: "Needs a plyo box to jump from." }, // incline push up depth jump
  "3288": { ok: false, tg: "pectorals", primary: "chest", why: "Needs dip bars." }, // korean dips
  "1689": { ok: false, tg: "pectorals", primary: "chest", why: "Garbled entry; it is just a push-up." }, // push and pull bodyweight
  "3314": { ok: false, tg: "pectorals", primary: "chest", why: "Rings-level skill — needs rings or parallettes." }, // straddle maltese
  "0806": { ok: false, tg: "pectorals", primary: "chest", why: "Needs suspension straps or rings." }, // suspended push-up
  "2363": { ok: false, tg: "pectorals", primary: "chest", why: "Needs dip bars." }, // wide-grip chest dip on high parallel bars
  "0003": { ok: false, tg: "abs", primary: "core", why: "Crunching with a twist — spinal flexion and rotation, off the bad-back list." }, // air bike
  "0006": { ok: false, tg: "abs", primary: "core", why: "Spinal flexion — off the bad-back list." }, // alternate heel touchers
  "2355": { ok: false, tg: "abs", primary: "core", why: "Needs hanging ab straps." }, // arm slingers hanging bent knee legs
  "2333": { ok: false, tg: "abs", primary: "core", why: "Needs hanging ab straps." }, // arm slingers hanging straight legs
  "0096": { ok: false, tg: "abs", primary: "core", why: "Loaded side bend — off the bad-back list." }, // barbell side bent v. 2
  "0103": { ok: false, tg: "abs", primary: "core", why: "Standing rollout overloads the lower back." }, // barbell standing ab rollerout
  "0138": { ok: false, tg: "abs", primary: "core", why: "Spinal flexion — off the bad-back list." }, // bottoms-up
  "2963": { ok: false, tg: "abs", primary: "core", why: "Needs a captain's chair." }, // captains chair straight leg raise
  "0260": { ok: false, tg: "abs", primary: "core", why: "Spinal flexion — off the bad-back list." }, // cocoons
  "3016": { ok: false, tg: "abs", primary: "core", why: "Spinal flexion — off the bad-back list." }, // curl-up
  "0443": { ok: false, tg: "abs", primary: "core", why: "Crunching with a twist — spinal flexion and rotation, off the bad-back list." }, // elbow-to-knee
  "3303": { ok: false, tg: "abs", primary: "core", why: "Needs a vertical pole." }, // flag
  "0456": { ok: false, tg: "abs", primary: "core", why: "Spinal flexion — off the bad-back list." }, // flexion leg sit up (bent knee)
  "0457": { ok: false, tg: "abs", primary: "core", why: "Spinal flexion — off the bad-back list." }, // flexion leg sit up (straight arm)
  "1764": { ok: false, tg: "abs", primary: "core", why: "Curls the pelvis up — spinal flexion, off the bad-back list." }, // hanging leg hip raise
  "1761": { ok: false, tg: "abs", primary: "core", why: "Twisting crunch at the hang — flexion and rotation, off the bad-back list." }, // hanging oblique knee raise
  "0473": { ok: false, tg: "abs", primary: "core", why: "Spinal flexion — off the bad-back list." }, // hanging pike
  "0474": { ok: false, tg: "abs", primary: "core", why: "Curls the pelvis up — spinal flexion, off the bad-back list." }, // hanging straight leg hip raise
  "0500": { ok: false, tg: "abs", primary: "core", why: "Loaded spinal rotation; off the bad-back list." }, // isometric wipers
  "0562": { ok: false, tg: "abs", primary: "core", why: "Loaded rotation — off the bad-back list." }, // landmine 180
  "2312": { ok: false, tg: "abs", primary: "core", why: "Crunching with a twist — spinal flexion and rotation, off the bad-back list." }, // lying elbow to knee
  "0709": { ok: false, tg: "abs", primary: "core", why: "Needs parallel bars." }, // side hip (on parallel bars)
  "3213": { ok: false, tg: "abs", primary: "core", why: "Spinal flexion — off the bad-back list." }, // side-to-side toe touch (male)
  "0805": { ok: false, tg: "abs", primary: "core", why: "Needs a suspension trainer." }, // suspended abdominal fallout
  "3420": { ok: false, tg: "abs", primary: "core", why: "Rounds the lower back — off the bad-back list." }, // v-sit on floor
  "0826": { ok: false, tg: "abs", primary: "core", why: "Needs dip bars." }, // vertical leg raise (on parallel bars)
  "3637": { ok: false, tg: "abs", primary: "core", why: "Needs an ab wheel, and rollouts load his lower back." }, // wheel run
  "0074": { ok: false, tg: "glutes", primary: "glutes", why: "Heavy loaded hinge with the back holding the torso; rule 1." }, // barbell rack pull
  "1418": { ok: false, tg: "glutes", primary: "glutes", why: "Rounded-back knee hug — spinal flexion, off the bad-back list." }, // hug keens to chest
  "0648": { ok: false, tg: "glutes", primary: "glutes", why: "Heavy pull from the floor — the back holds the torso under load." }, // power clean
  "0730": { ok: false, tg: "glutes", primary: "glutes", why: "Needs a slide board." }, // single leg platform slide
  "0776": { ok: false, tg: "glutes", primary: "glutes", why: "Heavy pull from the floor — the back holds the torso under load." }, // snatch pull
  "3214": { ok: false, tg: "hamstrings", primary: "hamstrings", why: "Repeated spinal flexion with rotation; off the bad-back list." }, // arms apart circular toe touch (male)
  "0085": { ok: false, tg: "hamstrings", primary: "hamstrings", why: "Barbell hinge with the back holding the torso; he does the landmine RDL instead." }, // barbell romanian deadlift
  "3212": { ok: false, tg: "hamstrings", primary: "hamstrings", why: "Repeated spinal flexion; off the bad-back list." }, // basic toe touch (male)
  "3193": { ok: false, tg: "hamstrings", primary: "hamstrings", why: "Needs a glute-ham developer." }, // glute-ham raise
  "3218": { ok: false, tg: "hamstrings", primary: "hamstrings", why: "Spinal flexion — off the bad-back list." }, // hands clasped circular toe touch (male)
  "3215": { ok: false, tg: "hamstrings", primary: "hamstrings", why: "Spinal flexion — off the bad-back list." }, // hands reversed clasped circular toe touch (male)
  "1766": { ok: false, tg: "hamstrings", primary: "hamstrings", why: "Duplicate of 0697 (steps describe a leg-curl machine he lacks)." }, // self assisted inverse leg curl
  "0628": { ok: false, tg: "abductors", primary: "hips", why: "Needs a resistance band." }, // monster walk
  "3231": { ok: false, tg: "spine", primary: "lower back", why: "Repeated toe touches are spinal flexion; off the bad-back list." }, // two toe touch (male)
  "0020": { ok: false, tg: "quads", primary: "quads", why: "Needs a balance board." }, // balance board
  "0028": { ok: false, tg: "quads", primary: "quads", why: "Explosive floor pull plus overhead jerk; too much disc risk." }, // barbell clean and press
  "1461": { ok: false, tg: "quads", primary: "quads", why: "Duplicate camera angle of barbell full squat." }, // barbell full squat (back pov)
  "1462": { ok: false, tg: "quads", primary: "quads", why: "Duplicate camera angle of barbell full squat." }, // barbell full squat (side pov)
  "0051": { ok: false, tg: "quads", primary: "quads", why: "Straddle lift loads the spine unevenly with a twist; off the bad-back list." }, // barbell jefferson squat
  "0053": { ok: false, tg: "quads", primary: "quads", why: "Jumping with a bar on the spine; off the bad-back list." }, // barbell jump squat
  "0068": { ok: false, tg: "quads", primary: "quads", why: "Single-leg squat with a bar on the back; fall risk." }, // barbell one leg squat
  "0069": { ok: false, tg: "quads", primary: "quads", why: "Heavy overhead axial load and a skill lift; not worth the disc risk." }, // barbell overhead squat
  "2798": { ok: false, tg: "quads", primary: "quads", why: "Jumping with a bar on the spine; off the bad-back list." }, // barbell squat jump step rear lunge
  "0114": { ok: false, tg: "quads", primary: "quads", why: "Needs a box; stepping onto the bench with a bar on the back is unsafe." }, // barbell step-up
  "3305": { ok: false, tg: "quads", primary: "quads", why: "Standing overhead press off a front squat; not for the back." }, // barbell thruster
  "1420": { ok: false, tg: "quads", primary: "quads", why: "Jumping with a bar on the back — off the bad-back list." }, // kneeling jump squat
  "0809": { ok: false, tg: "quads", primary: "quads", why: "Needs a suspension trainer." }, // suspended split squat
  "0067": { ok: false, tg: "delts", primary: "shoulders", why: "Explosive one-arm floor pull; risky for a bad back." }, // barbell one arm snatch
  "0075": { ok: false, tg: "delts", primary: "shoulders", why: "Bent over unsupported; the back holds the torso." }, // barbell rear delt raise
  "0076": { ok: false, tg: "delts", primary: "shoulders", why: "Bent over unsupported; the back holds the torso." }, // barbell rear delt row
  "0087": { ok: false, tg: "delts", primary: "shoulders", why: "Overhead pressing is seated on the Smith path for him." }, // barbell seated bradford rocky press
  "0091": { ok: false, tg: "delts", primary: "shoulders", why: "Overhead pressing is seated on the Smith path for him." }, // barbell seated overhead press
  "0100": { ok: false, tg: "delts", primary: "shoulders", why: "Jumping hinge with a bar; risky for a bad back." }, // barbell skier
  "0105": { ok: false, tg: "delts", primary: "shoulders", why: "Standing free-bar overhead press; he presses seated on the Smith." }, // barbell standing bradford press
  "3302": { ok: false, tg: "delts", primary: "shoulders", why: "Inverted bodyweight load through the spine; a skill hold, not worth the disc risk." }, // handstand
  "0471": { ok: false, tg: "delts", primary: "shoulders", why: "Full bodyweight axial load through the spine; off the bad-back list." }, // handstand push-up
  "0786": { ok: false, tg: "delts", primary: "shoulders", why: "Standing overhead jerk — his overhead work is seated only." }, // squat jerk
  "3012": { ok: false, tg: "traps", primary: "traps", why: "Needs dip bars." }, // scapula dips
  "0065": { ok: false, tg: "triceps", primary: "triceps", why: "One-arm barbell press is not realistic; a dumbbell move." }, // barbell one arm floor press
  "2406": { ok: false, tg: "triceps", primary: "triceps", why: "Needs an EZ bar and arm blaster; the flat-bar reverse pushdown covers it." }, // cable reverse grip triceps pushdown (sz-bar) (with arm blaster)
  "2405": { ok: false, tg: "triceps", primary: "triceps", why: "Needs an arm blaster; the plain V-handle pushdown covers it." }, // cable triceps pushdown (v-bar) (with arm blaster)
  "1728": { ok: false, tg: "triceps", primary: "triceps", why: "Unsupported bent-over hold under load; off the bad-back list." }, // cable two arm tricep kickback
  "3289": { ok: false, tg: "triceps", primary: "triceps", why: "Needs dip bars." }, // impossible dips
  "0639": { ok: false, tg: "triceps", primary: "triceps", why: "Needs dip bars." }, // one arm dip
  "0672": { ok: false, tg: "triceps", primary: "triceps", why: "Needs dip bars." }, // reverse dip
  "0677": { ok: false, tg: "triceps", primary: "triceps", why: "Needs rings." }, // ring dips
  "3291": { ok: false, tg: "triceps", primary: "triceps", why: "Gymnastics skill with garbage instructions; no real movement here." }, // stalder press
  "1753": { ok: false, tg: "triceps", primary: "triceps", why: "Needs three benches; he has one." }, // three bench dip
  "0814": { ok: false, tg: "triceps", primary: "triceps", why: "Needs dip bars." }, // triceps dip
  "0813": { ok: false, tg: "triceps", primary: "triceps", why: "Needs two benches; he has one." }, // triceps dip (between benches)
  "0816": { ok: false, tg: "triceps", primary: "triceps", why: "Nonsense instructions with no load; junk entry." }, // triceps press
}
