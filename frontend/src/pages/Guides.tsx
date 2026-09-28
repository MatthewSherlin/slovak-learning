import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, BookText, MessageCircle, ChevronDown, ChevronUp, BookOpen, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useUser } from '../components/UserPicker';

interface Guide {
  id: string;
  icon: typeof Volume2;
  color: string;
  iconBg: string;
  accentColor: string;
  title: string;
  subtitle: string;
  sections: { heading: string; content: string }[];
}

const guides: Guide[] = [
  {
    id: 'pronunciation',
    icon: Volume2,
    color: 'text-[var(--color-success)]',
    iconBg: 'bg-[rgba(93,228,165,0.12)]',
    accentColor: 'var(--color-success)',
    title: 'Slovak Pronunciation',
    subtitle: 'Master the sounds that make Slovak unique',
    sections: [
      {
        heading: 'Vowels & Length',
        content: `Slovak has **short** and **long** vowels. Length changes meaning!\n\n**Short vowels:** a, e, i, o, u, y\n**Long vowels:** á, é, í, ó, ú, ý (marked with a dĺžeň ´)\n\n**Examples:**\n- **pas** (passport) vs **pás** (belt) -- length matters!\n- **byt** (apartment) vs **byť** (to be)\n- **sud** (barrel) vs **súd** (court)\n\n**Diphthongs:** ia, ie, iu, ô\n- **viera** (faith), **riešiť** (to solve), **dôchodca** (retiree)\n\n**Tip:** When you see a dĺžeň (´), hold the vowel roughly twice as long.`,
      },
      {
        heading: 'Consonants & Tricky Sounds',
        content: `**Soft consonants (with mäkčeň ˇ):**\n- **č** = "ch" as in "church"\n- **š** = "sh" as in "ship"\n- **ž** = "zh" as in "measure"\n- **ď, ť, ň, ľ** = softened versions (palatalized)\n\n**Special consonants:**\n- **ch** = like German "ach" or Scottish "loch"\n- **dz** = "dz" as in "adze"\n- **dž** = "j" as in "jungle"\n\n**The Slovak R:**\n- Basic **r** is always trilled (rolled)\n- **r** and **l** can act as vowels between consonants\n- **ŕ** and **ĺ** are their long versions: **vŕba** (willow), **stĺp** (pillar)\n- Famous word: **tvrdý** (hard) -- three consonants in a row!`,
      },
      {
        heading: 'Stress & Rhythm',
        content: `**The golden rule:** Stress is ALWAYS on the first syllable.\n\n- **SLO-ven-sko** (Slovakia)\n- **DOB-rý deň** (Good day)\n- **ĎA-ku-jem** (Thank you)\n\n**No exceptions!** Unlike English, stress never shifts. This makes pronunciation predictable once you know it.\n\n**Rhythm tips:**\n- Slovak has a relatively even rhythm\n- Don't reduce unstressed vowels (unlike English)\n- Every vowel is pronounced clearly\n- Prepositions often form one unit with the following word: "**v škole**" (at school) has stress on "v"`,
      },
      {
        heading: 'Common Mistakes',
        content: `**Avoid these pitfalls:**\n\n- **Don't aspirate consonants** -- Slovak p, t, k are unaspirated (no puff of air)\n- **Don't reduce vowels** -- every vowel is full, never becomes "uh"\n- **Don't add vowels between consonants** -- "prst" (finger) really is just consonants!\n- **Don't stress the wrong syllable** -- always first!\n- **Don't confuse y and i** -- they sound the same! The difference is only in spelling\n\n**Practice words with consonant clusters:**\n- **streda** (Wednesday) = str-e-da\n- **vrch** (hill) = v-r-ch\n- **štvrť** (quarter) = štvr-ť\n- **zmrzlina** (ice cream) = zmr-zli-na`,
      },
    ],
  },
  {
    id: 'cases',
    icon: BookText,
    color: 'text-[var(--color-mode-grammar)]',
    iconBg: 'bg-[rgba(167,139,250,0.12)]',
    accentColor: 'var(--color-mode-grammar)',
    title: 'Case System Overview',
    subtitle: 'The 6 cases of Slovak nouns and how to use them',
    sections: [
      {
        heading: '1. Nominatív (Nominative) -- Who? What?',
        content: `**The subject of the sentence.** This is the dictionary form.\n\n**Used for:**\n- The doer of an action: **Chlapec** číta. (The boy reads.)\n- After "to be": To je **študent**. (That is a student.)\n\n**Question words:** Kto? (Who?) Čo? (What?)\n\n**Examples:**\n- **Mama** varí. (Mom is cooking.)\n- **Pes** spí. (The dog is sleeping.)\n- **Kniha** je na stole. (The book is on the table.)`,
      },
      {
        heading: '2. Genitív (Genitive) -- Whose? Of what?',
        content: `**Possession, origin, absence, and "of" relationships.**\n\n**Used for:**\n- Possession: dom **otca** (father's house)\n- After negation: Nemám **času**. (I don't have time.)\n- After quantity: veľa **ľudí** (many people)\n- After certain prepositions: bez (without), do (to/into), od (from), z (from)\n\n**Question words:** Koho? Čoho? (Whom? Of what?)\n\n**Examples:**\n- Pohár **vody** (a glass of water)\n- Bez **peňazí** (without money)\n- Od **pondelka** do **piatku** (from Monday to Friday)`,
      },
      {
        heading: '3. Datív (Dative) -- To whom? For whom?',
        content: `**The indirect object. Who receives something?**\n\n**Used for:**\n- Indirect objects: Dám to **bratovi**. (I'll give it to my brother.)\n- After certain verbs: pomáhať **ľuďom** (to help people)\n- After prepositions: k/ku (toward), kvôli (because of)\n\n**Question words:** Komu? Čomu? (To whom? To what?)\n\n**Examples:**\n- Povedal to **učiteľke**. (He told the teacher.)\n- Idem k **lekárovi**. (I'm going to the doctor.)\n- Ďakujem **vám**. (Thank you [formal].)`,
      },
      {
        heading: '4. Akuzatív (Accusative) -- Whom? What? (direct object)',
        content: `**The direct object of a verb.**\n\n**Used for:**\n- Direct objects: Vidím **psa**. (I see a dog.)\n- After prepositions of motion: na (onto), cez (through), za (behind)\n- Time expressions: Prídem o **hodinu**. (I'll come in an hour.)\n\n**Question words:** Koho? Čo? (Whom? What?)\n\n**Key rule:** For masculine animate nouns, accusative = genitive!\n\n**Examples:**\n- Čítam **knihu**. (I'm reading a book.)\n- Idem na **stanicu**. (I'm going to the station.)\n- Mám **brata**. (I have a brother.)`,
      },
      {
        heading: '5. Lokál (Locative) -- About what? Where?',
        content: `**Location and topics. ALWAYS used with a preposition!**\n\n**Used after:**\n- **v/vo** (in): v **škole** (in school)\n- **na** (on/at): na **stole** (on the table)\n- **o** (about): o **živote** (about life)\n- **po** (after/around): po **meste** (around the city)\n- **pri** (near/at): pri **okne** (near the window)\n\n**Question words:** O kom? O čom? (About whom? About what?)\n\n**Examples:**\n- Bývam v **Bratislave**. (I live in Bratislava.)\n- Hovoríme o **počasí**. (We're talking about the weather.)\n- Kniha je na **pošte**. (The book is at the post office.)`,
      },
      {
        heading: '6. Inštrumentál (Instrumental) -- With whom? By what means?',
        content: `**Instrument, accompaniment, manner.**\n\n**Used for:**\n- Instrument/tool: Píšem **perom**. (I write with a pen.)\n- Accompaniment: Idem s **priateľom**. (I'm going with a friend.)\n- After prepositions: s/so (with), nad (above), pod (under), pred (in front of), za (behind), medzi (between)\n\n**Question words:** Kým? Čím? (By whom? By what?)\n\n**Examples:**\n- Cestujeme **autobusom**. (We travel by bus.)\n- Je spokojný so **životom**. (He's satisfied with life.)\n- Medzi **domami** (between the houses)`,
      },
    ],
  },
  {
    id: 'phrases',
    icon: MessageCircle,
    color: 'text-[var(--color-warning)]',
    iconBg: 'bg-[rgba(245,196,94,0.12)]',
    accentColor: 'var(--color-warning)',
    title: 'Essential Phrases',
    subtitle: 'Survival Slovak for everyday situations',
    sections: [
      {
        heading: 'Greetings & Basics',
        content: `**Everyday greetings:**\n- **Ahoj!** -- Hi! (informal, among friends)\n- **Dobrý deň!** -- Good day! (formal, most common)\n- **Dobré ráno!** -- Good morning!\n- **Dobrý večer!** -- Good evening!\n- **Dovidenia!** -- Goodbye! (formal)\n- **Čaute!** -- Bye! (informal)\n\n**Essentials:**\n- **Ďakujem / Ďakujem pekne** -- Thank you / Thank you very much\n- **Prosím** -- Please / You're welcome\n- **Prepáčte** -- Excuse me (formal)\n- **Áno / Nie** -- Yes / No\n- **Neviem** -- I don't know\n- **Nerozumiem** -- I don't understand\n- **Hovoríte po anglicky?** -- Do you speak English?\n- **Volám sa...** -- My name is...`,
      },
      {
        heading: 'Shopping & Restaurants',
        content: `**At a restaurant:**\n- **Jedálny lístok, prosím.** -- The menu, please.\n- **Chcel/Chcela by som...** -- I would like... (m/f)\n- **Účet, prosím.** -- The bill, please.\n- **Bolo to dobré!** -- That was good!\n- **Ešte jedno pivo, prosím.** -- One more beer, please.\n\n**Shopping:**\n- **Koľko to stojí?** -- How much does it cost?\n- **Je to príliš drahé.** -- That's too expensive.\n- **Beriem to.** -- I'll take it.\n- **Máte to v inej veľkosti?** -- Do you have it in another size?\n- **Kde je pokladňa?** -- Where is the cash register?\n\n**Useful numbers:**\n- jeden, dva, tri, štyri, päť, šesť, sedem, osem, deväť, desať\n- sto (100), tisíc (1000)`,
      },
      {
        heading: 'Travel & Directions',
        content: `**Getting around:**\n- **Kde je...?** -- Where is...?\n- **Ako sa dostanem do...?** -- How do I get to...?\n- **Vľavo / Vpravo / Rovno** -- Left / Right / Straight\n- **Ďaleko / Blízko** -- Far / Near\n- **Zastávka autobusu** -- Bus stop\n- **Vlaková stanica** -- Train station\n- **Letisko** -- Airport\n\n**Transportation:**\n- **Jeden lístok do Bratislavy, prosím.** -- One ticket to Bratislava, please.\n- **O koľkej odchádza vlak?** -- What time does the train leave?\n- **Koľko stojí lístok?** -- How much is a ticket?\n- **Kde je najbližšie metro?** -- Where is the nearest metro?\n\n**Accommodation:**\n- **Mám rezerváciu.** -- I have a reservation.\n- **Na jednu noc / dve noci.** -- For one night / two nights.\n- **Koľko stojí izba?** -- How much is a room?`,
      },
      {
        heading: 'Emergencies & Health',
        content: `**Urgent situations:**\n- **Pomoc!** -- Help!\n- **Zavolajte sanitku!** -- Call an ambulance!\n- **Zavolajte políciu!** -- Call the police!\n- **Je to naliehavé!** -- It's urgent!\n- **Potrebujem lekára.** -- I need a doctor.\n\n**At the doctor:**\n- **Bolí ma hlava / brucho / hrdlo.** -- My head/stomach/throat hurts.\n- **Mám horúčku.** -- I have a fever.\n- **Som alergický/alergická na...** -- I'm allergic to... (m/f)\n- **Kde je lekáreň?** -- Where is the pharmacy?\n\n**Important numbers:**\n- **112** -- European emergency number\n- **155** -- Ambulance\n- **158** -- Police\n- **150** -- Fire department\n\n**Key phrase:** **Nehovorím dobre po slovensky. Hovoríte po anglicky?**\n(I don't speak Slovak well. Do you speak English?)`,
      },
    ],
  },
];

// ── localStorage helpers ──────────────────────────────────────────────

function lsKey(userId: string) {
  return `guides:read:${userId}`;
}

function loadReadIds(userId: string): string[] {
  try {
    const raw = localStorage.getItem(lsKey(userId));
    const parsed = JSON.parse(raw ?? '[]');
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function saveReadIds(userId: string, ids: string[]): void {
  try {
    localStorage.setItem(lsKey(userId), JSON.stringify(ids));
  } catch {
    // Private browsing / quota exceeded — silently ignore
  }
}

// ── Component ─────────────────────────────────────────────────────────

export default function Guides() {
  const { user } = useUser();
  const userId = user?.id ?? 'anonymous';

  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [readIds, setReadIds] = useState<string[]>(() => loadReadIds(userId));

  // The lazy initializer runs once with whatever userId is at mount time —
  // resync when the real user resolves so their read markers load.
  useEffect(() => {
    setReadIds(loadReadIds(userId));
  }, [userId]);

  const toggleGuide = (id: string) => {
    setExpandedGuide((prev) => (prev === id ? null : id));
  };

  const toggleSection = useCallback(
    (sectionId: string, key: string) => {
      setExpandedSections((prev) => {
        const opening = !prev[key];
        const next = { ...prev, [key]: opening };

        // Mark as read when opening
        if (opening) {
          setReadIds((prevRead) => {
            if (prevRead.includes(sectionId)) return prevRead;
            const nextRead = [...prevRead, sectionId];
            saveReadIds(userId, nextRead);
            return nextRead;
          });
        }

        return next;
      });
    },
    [userId]
  );

  return (
    <div
      className="max-w-3xl mx-auto px-5"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 2rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 6rem)',
      }}
    >
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2.5 mb-1.5">
          <BookOpen size={20} className="text-accent" />
          <h1 className="text-[26px] font-extrabold text-text-primary tracking-tight">Guides</h1>
        </div>
        <p className="text-[13.5px] text-text-muted mb-6">
          Cheat sheets for faster learning.
        </p>
      </motion.div>

      <div className="space-y-3">
        {guides.map((guide, gi) => {
          const Icon = guide.icon;
          const isOpen = expandedGuide === guide.id;
          const totalSections = guide.sections.length;
          const readCount = guide.sections.filter((_, si) =>
            readIds.includes(`${guide.id}-${si}`)
          ).length;

          return (
            <motion.div
              key={guide.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: gi * 0.08 }}
              className="bg-[var(--color-surface-card)] border border-[var(--color-overlay-06)] rounded-[22px] overflow-hidden"
            >
              {/* Guide Header */}
              <button
                onClick={() => toggleGuide(guide.id)}
                className="w-full flex items-center gap-3.5 p-[18px] text-left bg-transparent border-none cursor-pointer hover:bg-[var(--color-overlay-03)] transition-colors"
              >
                <div
                  className={`${guide.iconBg} ${guide.color} w-11 h-11 rounded-[14px] flex items-center justify-center shrink-0`}
                >
                  <Icon size={20} />
                </div>
                <div className="flex-1">
                  <h3 className="text-[15px] font-bold text-text-primary m-0">{guide.title}</h3>
                  <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5 m-0">
                    {totalSections} sections{readCount > 0 ? ` · ${readCount} read` : ' · 0 read'}
                  </p>
                </div>
                {isOpen ? (
                  <ChevronUp size={16} className="text-[var(--color-text-faint)] shrink-0" />
                ) : (
                  <ChevronDown size={16} className="text-[var(--color-text-faint)] shrink-0" />
                )}
              </button>

              {/* Guide Content */}
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="px-[18px] pb-[18px] flex flex-col gap-1.5">
                      {guide.sections.map((section, si) => {
                        const sectionId = `${guide.id}-${si}`;
                        const sectionKey = sectionId;
                        const sectionOpen = expandedSections[sectionKey] ?? false;
                        const isRead = readIds.includes(sectionId);

                        return (
                          <div
                            key={si}
                            className="rounded-[14px] bg-[var(--color-overlay-03)] overflow-hidden"
                            style={{ minHeight: 44, boxSizing: 'border-box' }}
                          >
                            {/* Section row */}
                            <button
                              onClick={() => toggleSection(sectionId, sectionKey)}
                              className="w-full flex items-center gap-3 px-3.5 py-[13px] text-left bg-transparent border-none cursor-pointer hover:bg-[var(--color-overlay-04)] transition-colors"
                            >
                              {/* Read indicator */}
                              {isRead ? (
                                <div
                                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                                  style={{ background: `color-mix(in srgb, ${guide.accentColor} 15%, transparent)` }}
                                >
                                  <Check size={11} color={guide.accentColor} strokeWidth={3} />
                                </div>
                              ) : (
                                <div
                                  className="w-5 h-5 rounded-full border shrink-0"
                                  style={{ borderColor: 'var(--color-overlay-15)', boxSizing: 'border-box' }}
                                />
                              )}
                              <span
                                className={`flex-1 text-[13.5px] font-semibold ${isRead ? 'text-text-primary' : 'text-[var(--color-text-secondary)]'}`}
                              >
                                {section.heading}
                              </span>
                              <ChevronDown
                                size={14}
                                className="text-[var(--color-text-faint)] shrink-0 transition-transform"
                                style={{ transform: sectionOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                              />
                            </button>

                            {/* Section content */}
                            <AnimatePresence>
                              {sectionOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-4 py-3 border-t border-[var(--color-overlay-06)]">
                                    <div className="text-[12.5px] text-text-secondary leading-relaxed prose prose-invert prose-sm max-w-none">
                                      <ReactMarkdown>{section.content}</ReactMarkdown>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
