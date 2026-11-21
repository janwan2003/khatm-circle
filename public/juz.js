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

// Arabic names of the surahs where a juz starts, for the Arabic and Urdu interface.
const SURAH_AR = {
  'Al-Fatihah': 'الفاتحة', 'Al-Baqarah': 'البقرة', 'Al-Imran': 'آل عمران', 'An-Nisa': 'النساء', 'Al-Ma’idah': 'المائدة',
  'Al-An‘am': 'الأنعام', 'Al-A‘raf': 'الأعراف', 'Al-Anfal': 'الأنفال', 'At-Tawbah': 'التوبة', Hud: 'هود', Yusuf: 'يوسف',
  'Al-Hijr': 'الحجر', 'Al-Isra': 'الإسراء', 'Al-Kahf': 'الكهف', 'Al-Anbiya': 'الأنبياء', 'Al-Mu’minun': 'المؤمنون',
  'Al-Furqan': 'الفرقان', 'An-Naml': 'النمل', 'Al-‘Ankabut': 'العنكبوت', 'Al-Ahzab': 'الأحزاب', 'Ya-Sin': 'يس',
  'Az-Zumar': 'الزمر', Fussilat: 'فصلت', 'Al-Ahqaf': 'الأحقاف', 'Adh-Dhariyat': 'الذاريات', 'Al-Mujadilah': 'المجادلة',
  'Al-Mulk': 'الملك', 'An-Naba': 'النبأ',
};
const arabicScript = (lang) => lang === 'ar' || lang === 'ur';
export const juzName = (j, lang) => (arabicScript(lang) ? j.ar : j.name);
export function juzStart(j, lang) {
  if (!arabicScript(lang)) return j.start;
  const [, surah, ayah] = j.start.match(/^(.*) (\d+)$/);
  return `${SURAH_AR[surah] || surah} ${ayah}`;
}

// What a khatm is for. Labels and automatic titles are translated (public/i18n/*.js: purpose.*, title.*).
export const PURPOSES = ['memorial', 'shifa', 'ramadan', 'occasion', 'circle', 'general'];
export const isPurpose = (p) => PURPOSES.includes(p);
export const purposeTitle = (t, p, h) => (h ? t(`title.${p}`, { h }) : t(`title.${p}.none`));

export const PHRASES = {
  salawat: { ar: 'اللهم صل على محمد' },
  subhanallah: { ar: 'سبحان الله' },
  alhamdulillah: { ar: 'الحمد لله' },
  allahuakbar: { ar: 'الله أكبر' },
  tahlil: { ar: 'لا إله إلا الله' },
  istighfar: { ar: 'أستغفر الله' },
  ikhlas: { ar: 'سورة الإخلاص' },
  yasin: { ar: 'سورة يس' },
};
// A preset phrase key is shown translated; a custom phrase is shown as the organiser typed it.
export const phraseLabel = (t, p) => (PHRASES[p] ? t(`phrase.${p}`) : p || t('title.dhikr.plain'));

export const STALE_DAYS = 3;
