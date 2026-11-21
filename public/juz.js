// The 30 ajza' (juz) of the Quran: the opening words each is known by, and where it starts (surah:ayah).
// Shared by the browser and the Pages Functions.
export const JUZ = [
  ['Alif Lam Mim', 'الم', 'Al-Fatihah 1'],
  ['Sayaqul', 'سيقول', 'Al-Baqarah 142'],
  ['Tilka r-Rusul', 'تلك الرسل', 'Al-Baqarah 253'],
  ['Kullu t-Ta‘am', 'كل الطعام', 'Al-Imran 93'],
  ['Wal-Muhsanat', 'والمحصنات', 'An-Nisa 24'],
  ['La Yuhibbullah', 'لا يحب الله', 'An-Nisa 148'],
  ['Wa Idha Sami‘u', 'وإذا سمعوا', 'Al-Ma’idah 82'],
  ['Wa Law Annana', 'ولو أننا', 'Al-An‘am 111'],
  ['Qalal-Mala’u', 'قال الملأ', 'Al-A‘raf 88'],
  ['Wa‘lamu', 'واعلموا', 'Al-Anfal 41'],
  ['Ya‘tadhirun', 'يعتذرون', 'At-Tawbah 93'],
  ['Wa Ma Min Dabbah', 'وما من دابة', 'Hud 6'],
  ['Wa Ma Ubarri’u', 'وما أبرئ', 'Yusuf 53'],
  ['Rubama', 'ربما', 'Al-Hijr 1'],
  ['Subhanalladhi', 'سبحان الذي', 'Al-Isra 1'],
  ['Qal Alam', 'قال ألم', 'Al-Kahf 75'],
  ['Iqtaraba', 'اقترب', 'Al-Anbiya 1'],
  ['Qad Aflaha', 'قد أفلح', 'Al-Mu’minun 1'],
  ['Wa Qalalladhina', 'وقال الذين', 'Al-Furqan 21'],
  ['Amman Khalaqa', 'أمن خلق', 'An-Naml 56'],
  ['Utlu Ma Uhiya', 'اتل ما أوحي', 'Al-‘Ankabut 46'],
  ['Wa Man Yaqnut', 'ومن يقنت', 'Al-Ahzab 31'],
  ['Wa Maliya', 'وما لي', 'Ya-Sin 28'],
  ['Fa Man Azlamu', 'فمن أظلم', 'Az-Zumar 32'],
  ['Ilayhi Yuraddu', 'إليه يرد', 'Fussilat 47'],
  ['Ha Mim', 'حم', 'Al-Ahqaf 1'],
  ['Qala Fama Khatbukum', 'قال فما خطبكم', 'Adh-Dhariyat 31'],
  ['Qad Sami‘allah', 'قد سمع الله', 'Al-Mujadilah 1'],
  ['Tabarakalladhi', 'تبارك الذي', 'Al-Mulk 1'],
  ['‘Amma', 'عم', 'An-Naba 1'],
].map(([name, ar, start], i) => ({ n: i + 1, name, ar, start }));

export const PURPOSES = {
  memorial: { label: 'In memory of someone', short: 'In memory of', title: (h) => (h ? `Khatm in memory of ${h}` : 'Khatm in loving memory') },
  shifa: { label: 'For someone who is ill', short: 'For the recovery of', title: (h) => (h ? `Khatm for ${h}’s recovery` : 'Khatm for shifa (healing)') },
  ramadan: { label: 'Ramadan khatm', short: 'Ramadan', title: (h) => (h ? `${h} Ramadan khatm` : 'Our Ramadan khatm') },
  occasion: { label: 'An occasion (wedding, exam, new baby, travel)', short: 'For', title: (h) => (h ? `Khatm for ${h}` : 'Khatm for a blessed occasion') },
  circle: { label: 'A regular circle (monthly or weekly)', short: 'Circle', title: (h) => (h ? `${h} khatm circle` : 'Our khatm circle') },
  general: { label: 'Something else', short: 'For', title: (h) => (h ? `Khatm for ${h}` : 'Our group khatm') },
};

export const PHRASES = {
  salawat: { label: 'Salawat on the Prophet ﷺ', ar: 'اللهم صل على محمد' },
  subhanallah: { label: 'SubhanAllah', ar: 'سبحان الله' },
  alhamdulillah: { label: 'Alhamdulillah', ar: 'الحمد لله' },
  allahuakbar: { label: 'Allahu Akbar', ar: 'الله أكبر' },
  tahlil: { label: 'La ilaha illallah', ar: 'لا إله إلا الله' },
  istighfar: { label: 'Astaghfirullah', ar: 'أستغفر الله' },
  ikhlas: { label: 'Surah Al-Ikhlas', ar: 'سورة الإخلاص' },
  yasin: { label: 'Surah Ya-Sin', ar: 'سورة يس' },
};
export const phraseLabel = (p) => (PHRASES[p] ? PHRASES[p].label : p || 'Dhikr');

export const STALE_DAYS = 3;
