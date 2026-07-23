import React, { useState, useMemo } from "react";
import {
  Zap,
  Droplets,
  Bell,
  BellRing,
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Radio,
  Megaphone,
  ThermometerSun,
  ChevronDown,
  Languages,
  Send,
} from "lucide-react";

/* ============================================================
   قصّان — Qassan  ·  Tunisia power & water cuts tracker (DEMO)
   Real announcements: STEG + SONEDE, week of 16–20 July 2026
   Demo clock frozen at Mon 20 July, 15:30 (so a live cut shows)
   ============================================================ */

const T = {
  night: "#0E1720",
  surface: "#16222E",
  surface2: "#1C2A38",
  line: "#243646",
  amber: "#FFB637",
  amberDim: "#8A6320",
  aqua: "#3EC8DA",
  live: "#FF6A55",
  text: "#EAF1F7",
  muted: "#8CA1B3",
  ok: "#5BD08F",
};

const DEMO_NOW = { day: "الثلاثاء 21 جويلية", hour: 10.4, label: "10:22" };

const STR = {
  ar: {
    appName: "قصّان",
    tagline: "الضو والماء في تونس — لحظة بلحظة",
    demo: "نسخة تجريبية · بيانات حقيقية 16–20 جويلية 2026",
    riskTitle: "خطر القطع اليوم: مرتفع",
    riskWhy: "موجة حر قياسية تلامس 49° + إنذار كبير في 20 ولاية — سادس يوم قطع متتالي",
    whyTitle: "علاش يقصّو الضو؟",
    whyBody: "شرح الستاغ: وقت الذروة (13:00–17:00) الطلب على الكهرباء يتجاوز قدرة الإنتاج بسبب المكيفات في موجة الحر، فيقع قطع دوري بالتداول باش ما تنهارش الشبكة الكل.",
    weekAhead: "الحرارة 40–45° طول الأسبوع — خطر القطع متواصل",
    hotline: "رقم الستاغ للطوارئ: 71.239.222",
    myArea: "منطقتي",
    cityLabel: "المدينة / المعتمدية",
    cityNamed: "منطقتك مذكورة بالاسم في البلاغ",
    govOnly: "ولايتك معنيّة — منطقتك بالتحديد غير مؤكدة",
    pickArea: "اختر منطقتك",
    follow: "فعّل التنبيهات",
    following: "التنبيهات مفعّلة",
    nextCut: "أقرب قطع محتمل",
    liveNow: "جاري الآن",
    today: "اليوم",
    all: "الكل",
    elec: "الضو",
    water: "الماء",
    planned: "مبرمج",
    sudden: "عطب فجئي",
    monitoring: "مراقبة",
    endsUnknown: "بدون توقيت رجوع رسمي",
    source: "المصدر",
    timeline: "خط النهار — منطقتك",
    reports: "بلاغات السكان",
    reportBtn: "يقطع عندي توّا",
    reported: "وصل بلاغك — يعاون جيرانك",
    statCost: "٤٥٠ دينار خسارة معدل العائلة في العام بسبب القطوعات",
    statSrc: "المعهد الوطني للاستهلاك",
    sources: "المصادر: بلاغات الستاغ والصوناد + الصحافة التونسية",
    areas: "المناطق المذكورة",
    noArea: "منطقتك ما ظهرتش في بلاغات اليوم — نراقبو ونعلموك",
  },
  fr: {
    appName: "Qassan",
    tagline: "Électricité & eau en Tunisie — en temps réel",
    demo: "Démo · données réelles du 16–20 juillet 2026",
    riskTitle: "Risque de coupure aujourd'hui : élevé",
    riskWhy: "Canicule record jusqu'à 49° + alerte majeure dans 20 gouvernorats — 6e jour de coupures",
    whyTitle: "Pourquoi ces coupures ?",
    whyBody: "Explication STEG : au pic (13h–17h), la demande dépasse la capacité de production à cause de la climatisation pendant la canicule — d'où le délestage tournant pour éviter l'effondrement du réseau.",
    weekAhead: "40–45° toute la semaine — risque de coupures maintenu",
    hotline: "Urgences STEG : 71.239.222",
    myArea: "Ma zone",
    cityLabel: "Ville / délégation",
    cityNamed: "Votre zone est citée nommément dans le communiqué",
    govOnly: "Gouvernorat concerné — votre zone exacte non confirmée",
    pickArea: "Choisir ma zone",
    follow: "Activer les alertes",
    following: "Alertes activées",
    nextCut: "Prochaine coupure probable",
    liveNow: "En cours",
    today: "Aujourd'hui",
    all: "Tout",
    elec: "Électricité",
    water: "Eau",
    planned: "Programmée",
    sudden: "Panne soudaine",
    monitoring: "Surveillance",
    endsUnknown: "Retour sans préavis officiel",
    source: "Source",
    timeline: "Votre journée",
    reports: "Signalements citoyens",
    reportBtn: "Coupé chez moi",
    reported: "Signalement reçu — merci !",
    statCost: "450 DT de pertes par foyer et par an à cause des coupures",
    statSrc: "Institut National de la Consommation",
    sources: "Sources : communiqués STEG & SONEDE + presse tunisienne",
    areas: "Zones citées",
    noArea: "Votre zone n'apparaît pas aujourd'hui — on surveille pour vous",
  },
};

const AREAS = [
  "تونس الكبرى",
  "أريانة",
  "بن عروس",
  "منوبة",
  "نابل",
  "بنزرت",
  "زغوان",
  "سوسة",
  "صفاقس",
  "قابس",
  "مدنين",
  "جندوبة",
  "الكاف",
  "سليانة",
  "باجة",
];

/* Cities & delegations inside each governorate (sample of the full 264) */
const DELEGATIONS = {
  "تونس الكبرى": ["المنازه", "عين زغوان", "الكرم", "حدائق قرطاج", "قصر السعيد", "حلق الوادي", "باردو", "الحرايرية", "الزهور", "سيدي حسين", "قرطاج", "المرسى", "الوردية", "السيجومي"],
  "أريانة": ["أريانة المدينة", "سكرة", "رواد", "المنيهلة", "التضامن", "قلعة الأندلس", "سيدي ثابت", "برج الطويل"],
  "بن عروس": ["بن عروس", "المحمدية", "فوشانة", "برج السدرية", "حمام الأنف", "رادس", "مقرين", "الزهراء", "مرناق"],
  "منوبة": ["منوبة", "الجديدة", "دوار هيشر", "وادي الليل", "طبربة", "المرناقية", "برج العامري"],
  "نابل": ["نابل", "الحمامات", "منزل تميم", "قربة", "تازركة", "قليبية", "سليمان", "بني خلاد", "الصمعة"],
  "بنزرت": ["بنزرت المدينة", "منزل بورقيبة", "ماطر", "رأس الجبل", "العالية", "جرزونة"],
  "زغوان": ["زغوان", "الفحص", "الناظور", "بئر مشارقة", "الزريبة"],
  "سوسة": ["سوسة المدينة", "حمام سوسة", "النفيضة", "مساكن", "القلعة الكبرى", "أكودة", "بوفيشة"],
  "صفاقس": ["صفاقس المدينة", "ساقية الزيت", "ساقية الداير", "طينة", "جبنيانة", "العامرة"],
  "قابس": ["قابس المدينة", "الحامة", "مارث", "غنوش", "المطوية"],
  "مدنين": ["مدنين", "جربة حومة السوق", "جربة ميدون", "جرجيس", "بن قردان"],
  "جندوبة": ["جندوبة", "بوسالم", "طبرقة", "غار الدماء", "فرنانة", "وشتاتة"],
  "الكاف": ["الكاف الغربية", "الدهماني", "الجريصة", "نبّر", "تاجروين", "ساقية سيدي يوسف"],
  "سليانة": ["سليانة", "بوعرادة", "مكثر", "الروحية", "قعفور", "العروسة"],
  "باجة": ["باجة الشمالية", "مجاز الباب", "تستور", "نفزة", "تبرسق"],
};

/* Real events parsed from this week's actual announcements */
const EVENTS = [
  {
    id: "e0",
    kind: "elec",
    status: "live",
    day: "اليوم الثلاثاء 21 جويلية",
    start: 6,
    end: 12,
    window: "06:00 → 12:00",
    title: {
      ar: "قطع دوري جارٍ — تونس الكبرى والشمال الغربي",
      fr: "Délestage en cours — Grand Tunis & Nord-Ouest",
    },
    regions: ["تونس الكبرى", "أريانة", "منوبة", "جندوبة", "باجة", "الكاف", "سليانة", "صفاقس"],
    hoods: [
      "المنازه", "المنارات", "عين زغوان", "حدائق قرطاج", "قصر السعيد", "الكرم",
      "حلق الوادي", "طبربة", "الجديدة", "سيدي ثابت", "برج الطويل",
      "وشتاتة", "نفزة", "الروحية", "مكثر", "بوسالم", "غار الدماء",
      "تبرسق", "نبّر", "الجريصة", "الدهماني", "بوعرادة",
    ],
    type: "planned",
    endsUnknown: true,
    source: "بلاغ الستاغ (مساء 20/07) · المصدر تونس",
    reports: 12,
  },
  {
    id: "e0b",
    kind: "elec",
    status: "upcoming",
    day: "اليوم الثلاثاء 21 جويلية",
    start: 17,
    end: 21,
    window: "مساءً ~17:00 — في انتظار بلاغ الستاغ",
    title: {
      ar: "قطع مسائي محتمل — الستاغ قطعت مساء أمس أيضًا",
      fr: "Coupures du soir probables — comme hier soir",
    },
    regions: ["تونس الكبرى", "بن عروس", "أريانة"],
    hoods: ["نراقبو البلاغ المسائي ونبعثولك إشعار فور صدوره"],
    type: "planned",
    endsUnknown: true,
    source: "قصّان — مراقبة تلقائية",
    reports: 0,
  },
  {
    id: "e1",
    kind: "elec",
    status: "past",
    day: "أمس الاثنين 20 جويلية",
    start: 10,
    end: 17,
    window: "10:00 → 17:00",
    title: { ar: "قطع دوري — الشمال وتونس الكبرى", fr: "Coupures tournantes — Nord & Grand Tunis" },
    regions: ["تونس الكبرى", "أريانة", "منوبة", "بنزرت", "باجة"],
    hoods: ["الحرايرية", "باردو", "منوبة", "المنزه", "أريانة", "المنار", "فوشانة", "برج السدرية"],
    type: "planned",
    endsUnknown: true,
    source: "بلاغ الستاغ · Tuniscope",
    reports: 34,
  },
  {
    id: "e2",
    kind: "elec",
    status: "past",
    day: "أمس الاثنين 20 جويلية",
    start: 17,
    end: 24,
    window: "17:00 → 00:00",
    title: { ar: "قطع مسائي محتمل — تونس الكبرى", fr: "Coupures du soir — Grand Tunis" },
    regions: ["تونس الكبرى", "بن عروس"],
    hoods: ["حسب بلاغ الستاغ المسائي"],
    type: "planned",
    endsUnknown: true,
    source: "الستاغ · Tunisie Numérique",
    reports: 0,
  },
  {
    id: "e3",
    kind: "water",
    status: "live",
    day: "منذ الأحد 19 جويلية",
    start: 0,
    end: 24,
    window: "عطب مستمر",
    title: { ar: "انقطاع ماء — عطب فجئي في القناة الرئيسية", fr: "Coupure d'eau — rupture de conduite" },
    regions: ["جندوبة", "باجة"],
    hoods: ["مناطق إقليمي جندوبة وباجة"],
    type: "sudden",
    endsUnknown: true,
    source: "الصوناد · Assarih",
    reports: 21,
  },
  {
    id: "e4",
    kind: "elec",
    status: "past",
    day: "الأحد 19 جويلية",
    start: 13,
    end: 16,
    window: "13:00 → 16:00",
    title: { ar: "قطع دوري — نابل، زغوان، بنزرت", fr: "Coupures — Nabeul, Zaghouan, Bizerte" },
    regions: ["نابل", "زغوان", "بنزرت"],
    hoods: ["الحمامة", "تازركة", "منزل تميم", "قربة", "المرازقة", "الصمعة"],
    type: "planned",
    endsUnknown: false,
    source: "الستاغ · Cap FM",
    reports: 58,
  },
  {
    id: "e5",
    kind: "elec",
    status: "past",
    day: "السبت 18 جويلية",
    start: 17,
    end: 22,
    window: "17:00 → 22:00",
    title: { ar: "قطع متقطع — الجنوب التونسي", fr: "Coupures intermittentes — Sud tunisien" },
    regions: ["قابس", "مدنين", "صفاقس"],
    hoods: ["على فترات متقطعة"],
    type: "planned",
    endsUnknown: false,
    source: "الستاغ · Tuniscope",
    reports: 42,
  },
  {
    id: "e6",
    kind: "water",
    status: "past",
    day: "الجمعة 10 جويلية",
    start: 6,
    end: 16,
    window: "06:00 → 16:00",
    title: { ar: "قطع ماء مبرمج — أشغال ربط خزان", fr: "Coupure d'eau programmée — travaux" },
    regions: ["سوسة"],
    hoods: ["قريميط الغربية", "الغواليف", "سيدي سعيدان", "أولاد بليل", "الصمايدية"],
    type: "planned",
    endsUnknown: false,
    source: "الصوناد · Directinfo",
    reports: 9,
  },
];

const kindColor = (k) => (k === "elec" ? T.amber : T.aqua);
const KindIcon = ({ kind, size = 16 }) =>
  kind === "elec" ? (
    <Zap size={size} color={T.amber} fill={T.amber} />
  ) : (
    <Droplets size={size} color={T.aqua} />
  );

function StatusBadge({ status, type, lang }) {
  const s = STR[lang];
  if (status === "live")
    return (
      <span
        className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
        style={{ background: "rgba(255,106,85,0.15)", color: T.live }}
      >
        <Radio size={11} className="animate-pulse" /> {s.liveNow}
      </span>
    );
  const isSudden = type === "sudden";
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{
        background: isSudden ? "rgba(255,182,55,0.12)" : "rgba(140,161,179,0.12)",
        color: isSudden ? T.amber : T.muted,
      }}
    >
      {isSudden ? s.sudden : s.planned}
    </span>
  );
}

/* Signature element: the day strip — your 24h with cut windows burned in */
function DayStrip({ events, lang }) {
  const s = STR[lang];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const bands = events.filter((e) => e.status !== "past" && e.kind === "elec");
  const waterLive = events.some((e) => e.status === "live" && e.kind === "water");
  return (
    <div className="rounded-2xl p-4" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold" style={{ color: T.text }}>
          {s.timeline}
        </span>
        <span className="text-xs" style={{ color: T.muted }}>
          {DEMO_NOW.day} · {DEMO_NOW.label}
        </span>
      </div>
      <div className="relative h-9 rounded-lg overflow-hidden flex" style={{ background: T.surface2 }}>
        {hours.map((h) => {
          const inBand = bands.some((b) => h >= b.start && h < b.end);
          const isPast = h < Math.floor(DEMO_NOW.hour);
          return (
            <div
              key={h}
              className="flex-1 border-l first:border-l-0"
              style={{
                borderColor: "rgba(36,54,70,0.6)",
                background: inBand
                  ? isPast
                    ? "rgba(138,99,32,0.55)"
                    : "rgba(255,182,55,0.85)"
                  : "transparent",
                opacity: isPast && !inBand ? 0.35 : 1,
              }}
            />
          );
        })}
        <div
          className="absolute top-0 bottom-0 w-0.5"
          style={{
            right: lang === "ar" ? `${(DEMO_NOW.hour / 24) * 100}%` : "auto",
            left: lang === "ar" ? "auto" : `${(DEMO_NOW.hour / 24) * 100}%`,
            background: T.live,
            boxShadow: `0 0 8px ${T.live}`,
          }}
        />
      </div>
      <div className="flex justify-between mt-1 text-[10px]" style={{ color: T.muted }}>
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: T.muted }}>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: "rgba(255,182,55,0.85)" }} />
          {s.elec}
        </span>
        {waterLive && (
          <span className="flex items-center gap-1.5" style={{ color: T.aqua }}>
            <Droplets size={12} /> {s.sudden} — {s.water}
          </span>
        )}
      </div>
    </div>
  );
}

function EventCard({ ev, lang }) {
  const s = STR[lang];
  const [open, setOpen] = useState(ev.status === "live");
  const dim = ev.status === "past";
  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{
        background: T.surface,
        border: `1px solid ${ev.status === "live" ? "rgba(255,106,85,0.4)" : T.line}`,
        opacity: dim ? 0.55 : 1,
      }}
    >
      <button className="w-full text-start p-4" onClick={() => setOpen(!open)}>
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${kindColor(ev.kind)}1A` }}
          >
            <KindIcon kind={ev.kind} size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <StatusBadge status={ev.status} type={ev.type} lang={lang} />
              <span className="text-xs" style={{ color: T.muted }}>
                {ev.day}
              </span>
            </div>
            <p className="font-bold text-sm leading-snug" style={{ color: T.text }}>
              {ev.title[lang]}
            </p>
            <div className="flex items-center gap-2 mt-1.5 text-xs" style={{ color: T.muted }}>
              <Clock size={12} />
              <span className="font-semibold" style={{ color: dim ? T.muted : T.text }}>
                {ev.window}
              </span>
              {ev.endsUnknown && !dim && (
                <span style={{ color: T.amber }}>· {s.endsUnknown}</span>
              )}
            </div>
          </div>
          <ChevronDown
            size={16}
            color={T.muted}
            className="transition-transform"
            style={{ transform: open ? "rotate(180deg)" : "none" }}
          />
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {ev.regions.map((r) => (
              <span
                key={r}
                className="text-xs px-2 py-1 rounded-lg font-semibold"
                style={{ background: T.surface2, color: T.text }}
              >
                {r}
              </span>
            ))}
          </div>
          <p className="text-xs mb-1 font-semibold" style={{ color: T.muted }}>
            {s.areas}:
          </p>
          <p className="text-xs leading-relaxed mb-3" style={{ color: T.text }}>
            {ev.hoods.join(" · ")}
          </p>
          <div
            className="flex items-center justify-between pt-3 text-xs"
            style={{ borderTop: `1px solid ${T.line}`, color: T.muted }}
          >
            <span className="flex items-center gap-1.5">
              <Megaphone size={12} /> {s.source}: {ev.source}
            </span>
            {ev.reports > 0 && (
              <span className="flex items-center gap-1" style={{ color: T.ok }}>
                <CheckCircle2 size={12} /> {ev.reports} {s.reports}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function QassanApp() {
  const [lang, setLang] = useState("ar");
  const [tab, setTab] = useState("all");
  const [area, setArea] = useState("تونس الكبرى");
  const [city, setCity] = useState("المنازه");
  const [following, setFollowing] = useState(false);
  const [reported, setReported] = useState(false);
  const [reportCount, setReportCount] = useState(34);
  const s = STR[lang];
  const rtl = lang === "ar";

  const filtered = useMemo(
    () => EVENTS.filter((e) => tab === "all" || e.kind === tab),
    [tab]
  );
  const myEvents = useMemo(
    () =>
      EVENTS.filter(
        (e) =>
          e.status !== "past" &&
          (e.regions.includes(area) || e.hoods.includes(city))
      ),
    [area, city]
  );
  const myLive = myEvents.find((e) => e.status === "live");
  const myNext = myEvents.find((e) => e.status === "upcoming");
  const cityNamed = myLive ? myLive.hoods.includes(city) : false;

  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      className="min-h-screen w-full flex justify-center"
      style={{
        background: T.night,
        fontFamily:
          "'IBM Plex Sans Arabic','Segoe UI',Tahoma,system-ui,sans-serif",
      }}
    >
      <div className="w-full max-w-md pb-24">
        {/* Header */}
        <header
          className="sticky top-0 z-20 px-4 pt-4 pb-3"
          style={{
            background: "rgba(14,23,32,0.92)",
            backdropFilter: "blur(10px)",
            borderBottom: `1px solid ${T.line}`,
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${T.amber}, #E08900)`,
                  boxShadow: `0 0 18px rgba(255,182,55,0.35)`,
                }}
              >
                <Zap size={20} color={T.night} fill={T.night} />
              </div>
              <div>
                <h1 className="text-lg font-black leading-none" style={{ color: T.text }}>
                  {s.appName}
                </h1>
                <p className="text-[11px] mt-0.5" style={{ color: T.muted }}>
                  {s.tagline}
                </p>
              </div>
            </div>
            <button
              onClick={() => setLang(rtl ? "fr" : "ar")}
              className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg"
              style={{ background: T.surface, color: T.text, border: `1px solid ${T.line}` }}
            >
              <Languages size={13} /> {rtl ? "FR" : "ع"}
            </button>
          </div>
          <p className="text-[10px] mt-2" style={{ color: T.muted }}>
            {s.demo}
          </p>
        </header>

        <main className="px-4 pt-4 flex flex-col gap-4">
          {/* Risk banner */}
          <div
            className="rounded-2xl p-4 flex items-start gap-3"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,106,85,0.14), rgba(255,182,55,0.08))",
              border: "1px solid rgba(255,106,85,0.3)",
            }}
          >
            <ThermometerSun size={22} color={T.live} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm" style={{ color: T.text }}>
                {s.riskTitle}
              </p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: T.muted }}>
                {s.riskWhy}
              </p>
            </div>
          </div>

          {/* My area */}
          <div
            className="rounded-2xl p-4"
            style={{ background: T.surface, border: `1px solid ${T.line}` }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color: T.text }}>
                <MapPin size={15} color={T.amber} /> {s.myArea}
              </span>
              <button
                onClick={() => setFollowing(!following)}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-all"
                style={{
                  background: following ? "rgba(91,208,143,0.15)" : T.amber,
                  color: following ? T.ok : T.night,
                }}
              >
                {following ? <BellRing size={13} /> : <Bell size={13} />}
                {following ? s.following : s.follow}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={area}
                onChange={(e) => {
                  const g = e.target.value;
                  setArea(g);
                  setCity((DELEGATIONS[g] || [""])[0]);
                }}
                className="w-full rounded-xl px-3 py-2.5 text-sm font-semibold outline-none"
                style={{
                  background: T.surface2,
                  color: T.text,
                  border: `1px solid ${T.line}`,
                }}
              >
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm font-semibold outline-none"
                style={{
                  background: T.surface2,
                  color: T.text,
                  border: `1px solid ${T.line}`,
                }}
              >
                {(DELEGATIONS[area] || []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {myLive ? (
              <div
                className="mt-3 rounded-xl p-3 flex items-center gap-2.5"
                style={{ background: "rgba(255,106,85,0.1)", border: "1px solid rgba(255,106,85,0.3)" }}
              >
                <Radio size={16} color={T.live} className="animate-pulse shrink-0" />
                <div>
                  <p className="text-xs font-bold leading-snug" style={{ color: T.text }}>
                    {s.liveNow}: {myLive.title[lang]} — {myLive.window}
                  </p>
                  <p
                    className="text-[11px] mt-1 font-semibold"
                    style={{ color: cityNamed ? T.ok : T.amber }}
                  >
                    {cityNamed ? `✓ ${s.cityNamed}` : s.govOnly}
                  </p>
                </div>
              </div>
            ) : myNext ? (
              <div
                className="mt-3 rounded-xl p-3 flex items-center gap-2.5"
                style={{ background: "rgba(255,182,55,0.08)", border: "1px solid rgba(255,182,55,0.25)" }}
              >
                <AlertTriangle size={16} color={T.amber} className="shrink-0" />
                <p className="text-xs font-bold leading-snug" style={{ color: T.text }}>
                  {s.nextCut}: {myNext.window}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-xs flex items-center gap-2" style={{ color: T.ok }}>
                <CheckCircle2 size={14} /> {s.noArea}
              </p>
            )}
          </div>

          {/* Day strip — signature */}
          <DayStrip events={myEvents.length ? myEvents : EVENTS} lang={lang} />

          {/* Tabs */}
          <div
            className="flex rounded-xl p-1 gap-1"
            style={{ background: T.surface, border: `1px solid ${T.line}` }}
          >
            {[
              { id: "all", label: s.all, icon: null },
              { id: "elec", label: s.elec, icon: <Zap size={13} /> },
              { id: "water", label: s.water, icon: <Droplets size={13} /> },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all"
                style={{
                  background: tab === t.id ? T.surface2 : "transparent",
                  color:
                    tab === t.id
                      ? t.id === "water"
                        ? T.aqua
                        : t.id === "elec"
                        ? T.amber
                        : T.text
                      : T.muted,
                }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Feed */}
          <div className="flex flex-col gap-3">
            {filtered.map((ev) => (
              <EventCard key={ev.id} ev={ev} lang={lang} />
            ))}
          </div>

          {/* Why — depth card */}
          <div
            className="rounded-2xl p-4"
            style={{ background: T.surface, border: `1px solid ${T.line}` }}
          >
            <p className="text-sm font-bold mb-2 flex items-center gap-1.5" style={{ color: T.text }}>
              <Zap size={14} color={T.amber} /> {s.whyTitle}
            </p>
            <p className="text-xs leading-relaxed mb-3" style={{ color: T.muted }}>
              {s.whyBody}
            </p>
            <p className="text-[11px] font-bold mb-2" style={{ color: T.amber }}>
              <ThermometerSun size={12} className="inline" /> {s.weekAhead}
            </p>
            <p
              className="text-[11px] font-bold pt-2"
              style={{ color: T.text, borderTop: `1px solid ${T.line}` }}
            >
              📞 {s.hotline}
            </p>
          </div>

          {/* Stat */}
          <div
            className="rounded-2xl p-4 text-center"
            style={{ background: T.surface, border: `1px solid ${T.line}` }}
          >
            <p className="text-sm font-black leading-relaxed" style={{ color: T.amber }}>
              {s.statCost}
            </p>
            <p className="text-[11px] mt-1" style={{ color: T.muted }}>
              {s.statSrc}
            </p>
          </div>

          <p className="text-[10px] text-center pb-2" style={{ color: T.muted }}>
            {s.sources}
          </p>
        </main>

        {/* Report FAB */}
        <div className="fixed bottom-5 inset-x-0 flex justify-center z-30 px-4">
          <button
            onClick={() => {
              if (!reported) {
                setReported(true);
                setReportCount((c) => c + 1);
              }
            }}
            className="w-full max-w-md flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm transition-all active:scale-95"
            style={{
              background: reported
                ? "rgba(91,208,143,0.9)"
                : `linear-gradient(135deg, ${T.live}, #E04A38)`,
              color: reported ? T.night : "#fff",
              boxShadow: reported
                ? "0 8px 24px rgba(91,208,143,0.35)"
                : "0 8px 24px rgba(255,106,85,0.4)",
            }}
          >
            {reported ? (
              <>
                <CheckCircle2 size={17} /> {s.reported} ({reportCount})
              </>
            ) : (
              <>
                <Send size={16} /> {s.reportBtn}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
