import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, BookText, MessageCircle, ChevronDown, ChevronUp, BookOpen } from 'lucide-react';

interface Guide {
  id: string;
  icon: typeof Volume2;
  color: string;
  iconBg: string;
  title: string;
  subtitle: string;
  sections: { heading: string; content: string }[];
}

const guides: Guide[] = [
  {
    id: 'pronunciation',
    icon: Volume2,
    color: 'text-mode-vocab',
    iconBg: 'bg-emerald-500/12',
    title: 'Slovak Pronunciation',
    subtitle: 'Master the sounds that make Slovak unique',
    sections: [
      {
        heading: 'Vowels & Length',
        content: `Slovak has **short** and **long** vowels. Length changes meaning!\n\n**Short vowels:** a, e, i, o, u, y\n**Long vowels:** a, e, i, o, u, y (marked with carky/dlzen)\n\n**Examples:**\n- **pas** (passport) vs **pas** (belt) -- length matters!\n- **byt** (apartment) vs **byt** (to be)\n- **sud** (barrel) vs **sud** (court)\n\n**Diphthongs:** ia, ie, iu, uo\n- **viera** (faith), **riesit** (to solve), **duchodca** (retiree)\n\n**Tip:** When you see a dlzen (^) or carky ('), hold the vowel roughly twice as long.`,
      },
      {
        heading: 'Consonants & Tricky Sounds',
        content: `**Soft consonants (with hacek):**\n- **c** = "ch" as in "church"\n- **s** = "sh" as in "ship"\n- **z** = "zh" as in "measure"\n- **d, t, n, l** = softened versions (palatalized)\n\n**Special consonants:**\n- **ch** = like German "ach" or Scottish "loch"\n- **dz** = "dz" as in "adze"\n- **dz** (with hacek) = "j" as in "jungle"\n- **r** (with hacek) = the famous rolled r+zh sound (unique to Czech/Slovak!)\n\n**The Slovak R:**\n- Basic **r** is always trilled (rolled)\n- **r** (with hacek) combines a trill with "zh" -- practice by saying "rzh" quickly\n- Famous word: **tvrdy** (hard) -- four consonants in a row!`,
      },
      {
        heading: 'Stress & Rhythm',
        content: `**The golden rule:** Stress is ALWAYS on the first syllable.\n\n- **SLO-ven-sko** (Slovakia)\n- **DOB-ry den** (Good day)\n- **DA-ku-jem** (Thank you)\n\n**No exceptions!** Unlike English, stress never shifts. This makes pronunciation predictable once you know it.\n\n**Rhythm tips:**\n- Slovak has a relatively even rhythm\n- Don't reduce unstressed vowels (unlike English)\n- Every vowel is pronounced clearly\n- Prepositions often form one unit with the following word: "**v skole**" (at school) has stress on "v"`,
      },
      {
        heading: 'Common Mistakes',
        content: `**Avoid these pitfalls:**\n\n- **Don't aspirate consonants** -- Slovak p, t, k are unaspirated (no puff of air)\n- **Don't reduce vowels** -- every vowel is full, never becomes "uh"\n- **Don't add vowels between consonants** -- "prst" (finger) really is just consonants!\n- **Don't stress the wrong syllable** -- always first!\n- **Don't confuse y and i** -- they sound the same! The difference is only in spelling\n\n**Practice words with consonant clusters:**\n- **streda** (Wednesday) = str-e-da\n- **vrch** (hill) = v-r-ch\n- **ctvrt** (quarter) = ct-v-r-t\n- **zmrzlina** (ice cream) = zmr-zli-na`,
      },
    ],
  },
  {
    id: 'cases',
    icon: BookText,
    color: 'text-mode-grammar',
    iconBg: 'bg-violet-500/12',
    title: 'Case System Overview',
    subtitle: 'The 6 cases of Slovak nouns and how to use them',
    sections: [
      {
        heading: '1. Nominativ (Nominative) -- Who? What?',
        content: `**The subject of the sentence.** This is the dictionary form.\n\n**Used for:**\n- The doer of an action: **Chlapec** cita. (The boy reads.)\n- After "to be": To je **student**. (That is a student.)\n\n**Question words:** Kto? (Who?) Co? (What?)\n\n**Examples:**\n- **Mama** vari. (Mom is cooking.)\n- **Pes** spi. (The dog is sleeping.)\n- **Kniha** je na stole. (The book is on the table.)`,
      },
      {
        heading: '2. Genitiv (Genitive) -- Whose? Of what?',
        content: `**Possession, origin, absence, and "of" relationships.**\n\n**Used for:**\n- Possession: dom **otca** (father's house)\n- After negation: Nemam **casu**. (I don't have time.)\n- After quantity: vela **ludi** (many people)\n- After certain prepositions: bez (without), do (to/into), od (from), z (from)\n\n**Question words:** Koho? Coho? (Whom? Of what?)\n\n**Examples:**\n- Sklo **vody** (a glass of water)\n- Bez **penazi** (without money)\n- Od **pondelka** do **piatku** (from Monday to Friday)`,
      },
      {
        heading: '3. Dativ (Dative) -- To whom? For whom?',
        content: `**The indirect object. Who receives something?**\n\n**Used for:**\n- Indirect objects: Dam to **bratovi**. (I'll give it to my brother.)\n- After certain verbs: pomahať **ludom** (to help people)\n- After prepositions: k/ku (toward), kvoli (because of)\n\n**Question words:** Komu? Comu? (To whom? To what?)\n\n**Examples:**\n- Povedal to **ucitelke**. (He told the teacher.)\n- Idem k **lekarovi**. (I'm going to the doctor.)\n- Dakujem **vam**. (Thank you [formal].)`,
      },
      {
        heading: '4. Akuzativ (Accusative) -- Whom? What? (direct object)',
        content: `**The direct object of a verb.**\n\n**Used for:**\n- Direct objects: Vidim **psa**. (I see a dog.)\n- After prepositions of motion: na (onto), cez (through), za (behind)\n- Time expressions: Pridem o **hodinu**. (I'll come in an hour.)\n\n**Question words:** Koho? Co? (Whom? What?)\n\n**Key rule:** For masculine animate nouns, accusative = genitive!\n\n**Examples:**\n- Citam **knihu**. (I'm reading a book.)\n- Idem na **stanicu**. (I'm going to the station.)\n- Mam **brata**. (I have a brother.)`,
      },
      {
        heading: '5. Lokal (Locative) -- About what? Where?',
        content: `**Location and topics. ALWAYS used with a preposition!**\n\n**Used after:**\n- **v/vo** (in): v **skole** (in school)\n- **na** (on/at): na **stole** (on the table)\n- **o** (about): o **zivote** (about life)\n- **po** (after/around): po **meste** (around the city)\n- **pri** (near/at): pri **okne** (near the window)\n\n**Question words:** O kom? O com? (About whom? About what?)\n\n**Examples:**\n- Byvam v **Bratislave**. (I live in Bratislava.)\n- Hovorime o **pocasi**. (We're talking about the weather.)\n- Kniha je na **poste**. (The book is at the post office.)`,
      },
      {
        heading: '6. Instrumental -- With whom? By what means?',
        content: `**Instrument, accompaniment, manner.**\n\n**Used for:**\n- Instrument/tool: Pisem **perom**. (I write with a pen.)\n- Accompaniment: Idem s **priatelom**. (I'm going with a friend.)\n- After prepositions: s/so (with), nad (above), pod (under), pred (in front of), za (behind), medzi (between)\n\n**Question words:** Kym? Cim? (By whom? By what?)\n\n**Examples:**\n- Cestujeme **autobusom**. (We travel by bus.)\n- Je spokojny so **zivotom**. (He's satisfied with life.)\n- Medzi **domami** (between the houses)`,
      },
    ],
  },
  {
    id: 'phrases',
    icon: MessageCircle,
    color: 'text-mode-conversation',
    iconBg: 'bg-amber-500/12',
    title: 'Essential Phrases',
    subtitle: 'Survival Slovak for everyday situations',
    sections: [
      {
        heading: 'Greetings & Basics',
        content: `**Everyday greetings:**\n- **Ahoj!** -- Hi! (informal, among friends)\n- **Dobry den!** -- Good day! (formal, most common)\n- **Dobre rano!** -- Good morning!\n- **Dobry vecer!** -- Good evening!\n- **Dovidenia!** -- Goodbye! (formal)\n- **Caute!** -- Bye! (informal)\n\n**Essentials:**\n- **Dakujem / Dakujem pekne** -- Thank you / Thank you very much\n- **Prosim** -- Please / You're welcome\n- **Prepacte** -- Excuse me (formal)\n- **Ano / Nie** -- Yes / No\n- **Neviem** -- I don't know\n- **Nerozumiem** -- I don't understand\n- **Hovorite po anglicky?** -- Do you speak English?\n- **Volam sa...** -- My name is...`,
      },
      {
        heading: 'Shopping & Restaurants',
        content: `**At a restaurant:**\n- **Jedalny listok, prosim.** -- The menu, please.\n- **Chcel/Chcela by som...** -- I would like... (m/f)\n- **Ucet, prosim.** -- The bill, please.\n- **Dobre to bolo!** -- That was good!\n- **Este jedno pivo, prosim.** -- One more beer, please.\n\n**Shopping:**\n- **Kolko to stoji?** -- How much does it cost?\n- **Je to prilis drahe.** -- That's too expensive.\n- **Beriem to.** -- I'll take it.\n- **Mate to v inej velkosti?** -- Do you have it in another size?\n- **Kde je pokladna?** -- Where is the cash register?\n\n**Useful numbers:**\n- jeden, dva, tri, styri, pat, sest, sedem, osem, devat, desat\n- sto (100), tisic (1000)`,
      },
      {
        heading: 'Travel & Directions',
        content: `**Getting around:**\n- **Kde je...?** -- Where is...?\n- **Ako sa dostanem do...?** -- How do I get to...?\n- **Vlavo / Vpravo / Rovno** -- Left / Right / Straight\n- **Daleko / Blizko** -- Far / Near\n- **Zastavka autobusu** -- Bus stop\n- **Vlaková stanica** -- Train station\n- **Letisko** -- Airport\n\n**Transportation:**\n- **Jeden listok do Bratislavy, prosim.** -- One ticket to Bratislava, please.\n- **O kolkej odchadza vlak?** -- What time does the train leave?\n- **Kolko stoji listok?** -- How much is a ticket?\n- **Kde je najblizsie metro?** -- Where is the nearest metro?\n\n**Accommodation:**\n- **Mam rezervaciu.** -- I have a reservation.\n- **Na jednu noc / dve noci.** -- For one night / two nights.\n- **Kolko stoji izba?** -- How much is a room?`,
      },
      {
        heading: 'Emergencies & Health',
        content: `**Urgent situations:**\n- **Pomoc!** -- Help!\n- **Zavolajte sanitku!** -- Call an ambulance!\n- **Zavolajte policiu!** -- Call the police!\n- **Je to naliehave!** -- It's urgent!\n- **Potrebujem lekara.** -- I need a doctor.\n\n**At the doctor:**\n- **Boli ma hlava / brucho / hrdlo.** -- My head/stomach/throat hurts.\n- **Mam horacku.** -- I have a fever.\n- **Som alergicky/alergicka na...** -- I'm allergic to... (m/f)\n- **Kde je lekaren?** -- Where is the pharmacy?\n\n**Important numbers:**\n- **112** -- European emergency number\n- **155** -- Ambulance\n- **158** -- Police\n- **150** -- Fire department\n\n**Key phrase:** **Nehovorim dobre po slovensky. Hovorite po anglicky?**\n(I don't speak Slovak well. Do you speak English?)`,
      },
    ],
  },
];

export default function Guides() {
  const [expandedGuide, setExpandedGuide] = useState<string | null>('pronunciation');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const toggleGuide = (id: string) => {
    setExpandedGuide(expandedGuide === id ? null : id);
  };

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="max-w-3xl mx-auto px-6 pt-28 pb-16">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2.5 mb-2">
          <BookOpen size={20} className="text-accent" />
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Slovak Guides</h1>
        </div>
        <p className="text-text-muted text-sm mb-10">
          Reference guides and cheat sheets to help you learn Slovak faster.
        </p>
      </motion.div>

      <div className="space-y-4">
        {guides.map((guide, gi) => {
          const Icon = guide.icon;
          const isOpen = expandedGuide === guide.id;

          return (
            <motion.div
              key={guide.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: gi * 0.08 }}
              className="bg-surface border border-border rounded-2xl overflow-hidden"
            >
              {/* Guide Header */}
              <button
                onClick={() => toggleGuide(guide.id)}
                className="w-full flex items-center gap-4 p-5 text-left bg-transparent border-none cursor-pointer hover:bg-surface-hover transition-colors"
              >
                <div className={`${guide.iconBg} ${guide.color} w-10 h-10 rounded-xl flex items-center justify-center shrink-0`}>
                  <Icon size={18} />
                </div>
                <div className="flex-1">
                  <h3 className="text-[15px] font-semibold text-text-primary">{guide.title}</h3>
                  <p className="text-[12px] text-text-muted mt-0.5">{guide.subtitle}</p>
                </div>
                {isOpen ? (
                  <ChevronUp size={16} className="text-text-faint shrink-0" />
                ) : (
                  <ChevronDown size={16} className="text-text-faint shrink-0" />
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
                    <div className="px-5 pb-5 space-y-2">
                      {guide.sections.map((section, si) => {
                        const sectionKey = `${guide.id}-${si}`;
                        const sectionOpen = expandedSections[sectionKey] ?? si === 0;

                        return (
                          <div key={si} className="border border-border-subtle rounded-xl overflow-hidden">
                            <button
                              onClick={() => toggleSection(sectionKey)}
                              className="w-full flex items-center justify-between p-3.5 text-left bg-surface-2 hover:bg-surface-3 border-none cursor-pointer transition-colors"
                            >
                              <span className="text-[13px] font-medium text-text-primary">
                                {section.heading}
                              </span>
                              {sectionOpen ? (
                                <ChevronUp size={13} className="text-text-faint shrink-0" />
                              ) : (
                                <ChevronDown size={13} className="text-text-faint shrink-0" />
                              )}
                            </button>

                            <AnimatePresence>
                              {sectionOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-4 py-3 border-t border-border-subtle">
                                    <div className="text-[12.5px] text-text-secondary leading-relaxed whitespace-pre-line markdown-content">
                                      {section.content.split('\n').map((line, li) => {
                                        if (line.startsWith('**') && line.endsWith('**')) {
                                          return <p key={li} className="font-semibold text-text-primary mt-2 mb-1">{line.replace(/\*\*/g, '')}</p>;
                                        }
                                        if (line.startsWith('- **')) {
                                          const [bold, ...rest] = line.slice(2).split('**');
                                          return (
                                            <div key={li} className="flex items-start gap-1.5 ml-2 mb-0.5">
                                              <span className="text-accent shrink-0 mt-px">&bull;</span>
                                              <span><strong className="text-text-primary">{bold.replace(/\*\*/g, '')}</strong>{rest.join('**')}</span>
                                            </div>
                                          );
                                        }
                                        if (line.startsWith('- ')) {
                                          return (
                                            <div key={li} className="flex items-start gap-1.5 ml-2 mb-0.5">
                                              <span className="text-text-faint shrink-0 mt-px">&bull;</span>
                                              <span>{line.slice(2)}</span>
                                            </div>
                                          );
                                        }
                                        if (line.trim() === '') return <div key={li} className="h-2" />;
                                        return <p key={li} className="mb-0.5">{line}</p>;
                                      })}
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
