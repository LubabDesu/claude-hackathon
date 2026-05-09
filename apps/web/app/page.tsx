"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type LanguageCode =
  | "en"
  | "es"
  | "vi"
  | "ar"
  | "zh-Hans"
  | "so"
  | "tl"
  | "ko"
  | "other";

type ImmigrationCategory =
  | "prefer_not_to_say"
  | "citizen_or_national"
  | "lawful_permanent_resident"
  | "mixed_household"
  | "other";

type UserProfile = {
  language: LanguageCode;
  zipCode: string;
  county: string;
  householdSize: number;
  monthlyIncomeRange: string;
  hasDependents: boolean;
  isStudent: boolean;
  isVeteran: boolean;
  immigrationCategory: ImmigrationCategory;
  urgentNeeds: string[];
};

type MatchResult = {
  resource: {
    id: string;
    name: string;
    category: string;
    official_url: string;
    source_url: string;
    geography: string;
    human_help: string[];
  };
  match_level: "likely match" | "possible match" | "unlikely based on what you shared";
  reasons: string[];
  blockers: string[];
  required_documents: string[];
  next_action: string;
};

type Copy = {
  appLang: string;
  dir?: "ltr" | "rtl";
  kicker: string;
  title: string;
  dek: string;
  trust: string[];
  privacySaved: string;
  privacyUnsaved: string;
  remember: string;
  languageTitle: string;
  languageHelp: string;
  locationTitle: string;
  zipLabel: string;
  householdTitle: string;
  peopleLabel: string;
  incomeLabel: string;
  incomeUnknown: string;
  statusLabel: string;
  statuses: Record<ImmigrationCategory, string>;
  flags: {
    dependents: string;
    student: string;
    veteran: string;
  };
  needsTitle: string;
  selectAll: string;
  needs: Record<string, string>;
  next: string;
  back: string;
  searching: string;
  findBenefits: string;
  resultsKicker: string;
  resultsTitle: string;
  emptyStrong: string;
  emptyText: string;
  errorDefault: string;
  check: string;
  officialSite: string;
  viewSource: string;
  stepLabel: (current: number, total: number) => string;
  matchLevels: Record<MatchResult["match_level"], string>;
};

const STORAGE_KEY = "benefits-navigator-profile";
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
const TOTAL_STEPS = 4;

const languageOptions: Array<{
  code: LanguageCode;
  nativeName: string;
  englishName: string;
}> = [
  { code: "en", nativeName: "English", englishName: "English" },
  { code: "es", nativeName: "Español", englishName: "Spanish" },
  { code: "vi", nativeName: "Tiếng Việt", englishName: "Vietnamese" },
  { code: "ar", nativeName: "العربية", englishName: "Arabic" },
  { code: "zh-Hans", nativeName: "简体中文", englishName: "Chinese (Simplified)" },
  { code: "so", nativeName: "Soomaali", englishName: "Somali" },
  { code: "tl", nativeName: "Tagalog", englishName: "Tagalog" },
  { code: "ko", nativeName: "한국어", englishName: "Korean" },
  { code: "other", nativeName: "Other", englishName: "Other" }
];

const languageByCode = Object.fromEntries(
  languageOptions.map((language) => [language.code, language])
) as Record<LanguageCode, (typeof languageOptions)[number]>;

const languageAliases: Record<string, LanguageCode> = {
  English: "en",
  Spanish: "es",
  Vietnamese: "vi",
  Arabic: "ar",
  "Chinese (Simplified)": "zh-Hans",
  Somali: "so",
  Tagalog: "tl",
  Korean: "ko",
  Other: "other"
};

const baseStatuses: Copy["statuses"] = {
  prefer_not_to_say: "Prefer not to say",
  citizen_or_national: "U.S. citizen or national",
  lawful_permanent_resident: "Permanent resident (green card)",
  mixed_household: "Mixed-status household",
  other: "Other or not sure"
};

const translations: Record<LanguageCode, Copy> = {
  en: {
    appLang: "en",
    kicker: "Free · Private · Official sources",
    title: "Find benefits you may qualify for.",
    dek: "A multilingual guide to food, health, housing, and cash assistance from official government sources.",
    trust: ["No SSN needed", "Private", "Official sources only"],
    privacySaved: "Saved on this browser. Not on any server.",
    privacyUnsaved: "Your answers stay on this device only.",
    remember: "Remember my answers on this device",
    languageTitle: "Choose your language.",
    languageHelp: "The rest of the guide will use the language you choose.",
    locationTitle: "Where are you located?",
    zipLabel: "ZIP code",
    householdTitle: "Tell us about your household.",
    peopleLabel: "How many people live with you?",
    incomeLabel: "Monthly income (before taxes)",
    incomeUnknown: "I am not sure",
    statusLabel: "What is your status?",
    statuses: baseStatuses,
    flags: {
      dependents: "Children or dependents",
      student: "Student",
      veteran: "Veteran"
    },
    needsTitle: "What do you need most?",
    selectAll: "Select all that apply.",
    needs: {
      food: "Food",
      healthcare: "Health care",
      cash: "Cash aid",
      utilities: "Utilities",
      housing: "Housing",
      childcare: "Child care"
    },
    next: "Next",
    back: "Back",
    searching: "Searching...",
    findBenefits: "Find benefits",
    resultsKicker: "Official-source ranking",
    resultsTitle: "Recommended programs",
    emptyStrong: "Fill out the short form to see programs that may help you.",
    emptyText: "Takes about 1 minute. No SSN needed.",
    errorDefault: "Could not reach the local matching service.",
    check: "Check",
    officialSite: "Open official site",
    viewSource: "View source",
    stepLabel: (current, total) => `Step ${current} of ${total}`,
    matchLevels: {
      "likely match": "likely match",
      "possible match": "possible match",
      "unlikely based on what you shared": "unlikely based on what you shared"
    }
  },
  es: {
    appLang: "es",
    kicker: "Gratis · Privado · Fuentes oficiales",
    title: "Encuentra beneficios para los que podrías calificar.",
    dek: "Una guía multilingüe de comida, salud, vivienda y ayuda en efectivo de fuentes oficiales del gobierno.",
    trust: ["No necesita SSN", "Privado", "Solo fuentes oficiales"],
    privacySaved: "Guardado en este navegador. No en un servidor.",
    privacyUnsaved: "Tus respuestas se quedan solo en este dispositivo.",
    remember: "Recordar mis respuestas en este dispositivo",
    languageTitle: "Elige tu idioma.",
    languageHelp: "El resto de la guía usará el idioma que elijas.",
    locationTitle: "¿Dónde estás ubicado?",
    zipLabel: "Código postal",
    householdTitle: "Cuéntanos sobre tu hogar.",
    peopleLabel: "¿Cuántas personas viven contigo?",
    incomeLabel: "Ingreso mensual (antes de impuestos)",
    incomeUnknown: "No estoy seguro",
    statusLabel: "¿Cuál es tu estatus?",
    statuses: {
      prefer_not_to_say: "Prefiero no decirlo",
      citizen_or_national: "Ciudadano o nacional de EE. UU.",
      lawful_permanent_resident: "Residente permanente (green card)",
      mixed_household: "Hogar con estatus mixto",
      other: "Otro o no estoy seguro"
    },
    flags: {
      dependents: "Niños o dependientes",
      student: "Estudiante",
      veteran: "Veterano"
    },
    needsTitle: "¿Qué necesitas más?",
    selectAll: "Selecciona todo lo que aplique.",
    needs: {
      food: "Comida",
      healthcare: "Salud",
      cash: "Ayuda en efectivo",
      utilities: "Servicios públicos",
      housing: "Vivienda",
      childcare: "Cuidado infantil"
    },
    next: "Siguiente",
    back: "Atrás",
    searching: "Buscando...",
    findBenefits: "Buscar beneficios",
    resultsKicker: "Clasificación de fuentes oficiales",
    resultsTitle: "Programas recomendados",
    emptyStrong: "Completa el formulario corto para ver programas que podrían ayudarte.",
    emptyText: "Toma cerca de 1 minuto. No necesita SSN.",
    errorDefault: "No se pudo conectar con el servicio local.",
    check: "Revisar",
    officialSite: "Abrir sitio oficial",
    viewSource: "Ver fuente",
    stepLabel: (current, total) => `Paso ${current} de ${total}`,
    matchLevels: {
      "likely match": "probable coincidencia",
      "possible match": "posible coincidencia",
      "unlikely based on what you shared": "poco probable según lo que compartiste"
    }
  },
  vi: {
    appLang: "vi",
    kicker: "Miễn phí · Riêng tư · Nguồn chính thức",
    title: "Tìm phúc lợi bạn có thể đủ điều kiện nhận.",
    dek: "Hướng dẫn đa ngôn ngữ về thực phẩm, y tế, nhà ở và trợ cấp tiền mặt từ các nguồn chính phủ chính thức.",
    trust: ["Không cần SSN", "Riêng tư", "Chỉ nguồn chính thức"],
    privacySaved: "Đã lưu trên trình duyệt này. Không lưu trên máy chủ.",
    privacyUnsaved: "Câu trả lời của bạn chỉ ở trên thiết bị này.",
    remember: "Ghi nhớ câu trả lời trên thiết bị này",
    languageTitle: "Chọn ngôn ngữ của bạn.",
    languageHelp: "Phần còn lại của hướng dẫn sẽ dùng ngôn ngữ bạn chọn.",
    locationTitle: "Bạn ở đâu?",
    zipLabel: "Mã ZIP",
    householdTitle: "Cho chúng tôi biết về hộ gia đình của bạn.",
    peopleLabel: "Có bao nhiêu người sống cùng bạn?",
    incomeLabel: "Thu nhập hàng tháng (trước thuế)",
    incomeUnknown: "Tôi không chắc",
    statusLabel: "Tình trạng của bạn là gì?",
    statuses: {
      prefer_not_to_say: "Không muốn nói",
      citizen_or_national: "Công dân hoặc công dân quốc gia Hoa Kỳ",
      lawful_permanent_resident: "Thường trú nhân (thẻ xanh)",
      mixed_household: "Hộ gia đình có tình trạng hỗn hợp",
      other: "Khác hoặc không chắc"
    },
    flags: {
      dependents: "Trẻ em hoặc người phụ thuộc",
      student: "Sinh viên",
      veteran: "Cựu chiến binh"
    },
    needsTitle: "Bạn cần gì nhất?",
    selectAll: "Chọn tất cả mục phù hợp.",
    needs: {
      food: "Thực phẩm",
      healthcare: "Chăm sóc sức khỏe",
      cash: "Trợ cấp tiền mặt",
      utilities: "Tiện ích",
      housing: "Nhà ở",
      childcare: "Chăm sóc trẻ em"
    },
    next: "Tiếp",
    back: "Quay lại",
    searching: "Đang tìm...",
    findBenefits: "Tìm phúc lợi",
    resultsKicker: "Xếp hạng nguồn chính thức",
    resultsTitle: "Chương trình được đề xuất",
    emptyStrong: "Điền mẫu ngắn để xem các chương trình có thể giúp bạn.",
    emptyText: "Mất khoảng 1 phút. Không cần SSN.",
    errorDefault: "Không thể kết nối với dịch vụ địa phương.",
    check: "Kiểm tra",
    officialSite: "Mở trang chính thức",
    viewSource: "Xem nguồn",
    stepLabel: (current, total) => `Bước ${current} / ${total}`,
    matchLevels: {
      "likely match": "có khả năng phù hợp",
      "possible match": "có thể phù hợp",
      "unlikely based on what you shared": "ít có khả năng dựa trên thông tin bạn chia sẻ"
    }
  },
  ar: {
    appLang: "ar",
    dir: "rtl",
    kicker: "مجاني · خاص · مصادر رسمية",
    title: "ابحث عن المزايا التي قد تكون مؤهلا لها.",
    dek: "دليل متعدد اللغات للطعام والصحة والسكن والمساعدة النقدية من مصادر حكومية رسمية.",
    trust: ["لا حاجة إلى رقم الضمان", "خاص", "مصادر رسمية فقط"],
    privacySaved: "تم الحفظ في هذا المتصفح. ليس على أي خادم.",
    privacyUnsaved: "تبقى إجاباتك على هذا الجهاز فقط.",
    remember: "تذكر إجاباتي على هذا الجهاز",
    languageTitle: "اختر لغتك.",
    languageHelp: "سيستخدم باقي الدليل اللغة التي تختارها.",
    locationTitle: "أين موقعك؟",
    zipLabel: "الرمز البريدي",
    householdTitle: "أخبرنا عن أسرتك.",
    peopleLabel: "كم شخصا يعيش معك؟",
    incomeLabel: "الدخل الشهري (قبل الضرائب)",
    incomeUnknown: "لست متأكدا",
    statusLabel: "ما هي حالتك؟",
    statuses: {
      prefer_not_to_say: "أفضل عدم الإجابة",
      citizen_or_national: "مواطن أو تابع للولايات المتحدة",
      lawful_permanent_resident: "مقيم دائم (بطاقة خضراء)",
      mixed_household: "أسرة ذات حالات مختلفة",
      other: "آخر أو غير متأكد"
    },
    flags: {
      dependents: "أطفال أو معالون",
      student: "طالب",
      veteran: "محارب قديم"
    },
    needsTitle: "ما الذي تحتاجه أكثر؟",
    selectAll: "اختر كل ما ينطبق.",
    needs: {
      food: "طعام",
      healthcare: "رعاية صحية",
      cash: "مساعدة نقدية",
      utilities: "خدمات",
      housing: "سكن",
      childcare: "رعاية أطفال"
    },
    next: "التالي",
    back: "رجوع",
    searching: "جار البحث...",
    findBenefits: "ابحث عن المزايا",
    resultsKicker: "ترتيب المصادر الرسمية",
    resultsTitle: "برامج موصى بها",
    emptyStrong: "املأ النموذج القصير لرؤية البرامج التي قد تساعدك.",
    emptyText: "يستغرق حوالي دقيقة واحدة. لا حاجة إلى رقم الضمان.",
    errorDefault: "تعذر الوصول إلى الخدمة المحلية.",
    check: "تحقق",
    officialSite: "افتح الموقع الرسمي",
    viewSource: "عرض المصدر",
    stepLabel: (current, total) => `الخطوة ${current} من ${total}`,
    matchLevels: {
      "likely match": "مطابقة محتملة",
      "possible match": "مطابقة ممكنة",
      "unlikely based on what you shared": "غير مرجح بناء على ما شاركته"
    }
  },
  "zh-Hans": {
    appLang: "zh-Hans",
    kicker: "免费 · 私密 · 官方来源",
    title: "查找你可能符合资格的福利。",
    dek: "来自官方政府来源的多语言指南，涵盖食品、医疗、住房和现金援助。",
    trust: ["无需社安号", "私密", "仅官方来源"],
    privacySaved: "已保存在此浏览器中，不在任何服务器上。",
    privacyUnsaved: "你的回答只保留在此设备上。",
    remember: "在此设备上记住我的回答",
    languageTitle: "选择你的语言。",
    languageHelp: "接下来的指南将使用你选择的语言。",
    locationTitle: "你在哪里？",
    zipLabel: "邮政编码",
    householdTitle: "告诉我们你的家庭情况。",
    peopleLabel: "有多少人与你同住？",
    incomeLabel: "月收入（税前）",
    incomeUnknown: "我不确定",
    statusLabel: "你的身份状态是什么？",
    statuses: {
      prefer_not_to_say: "不想透露",
      citizen_or_national: "美国公民或国民",
      lawful_permanent_resident: "永久居民（绿卡）",
      mixed_household: "混合身份家庭",
      other: "其他或不确定"
    },
    flags: {
      dependents: "儿童或受抚养人",
      student: "学生",
      veteran: "退伍军人"
    },
    needsTitle: "你最需要什么？",
    selectAll: "选择所有符合的项目。",
    needs: {
      food: "食品",
      healthcare: "医疗保健",
      cash: "现金援助",
      utilities: "水电燃气",
      housing: "住房",
      childcare: "儿童照护"
    },
    next: "下一步",
    back: "返回",
    searching: "正在搜索...",
    findBenefits: "查找福利",
    resultsKicker: "官方来源排序",
    resultsTitle: "推荐项目",
    emptyStrong: "填写简短表格，查看可能帮助你的项目。",
    emptyText: "大约需要 1 分钟。无需社安号。",
    errorDefault: "无法连接到本地匹配服务。",
    check: "检查",
    officialSite: "打开官方网站",
    viewSource: "查看来源",
    stepLabel: (current, total) => `第 ${current} 步，共 ${total} 步`,
    matchLevels: {
      "likely match": "很可能符合",
      "possible match": "可能符合",
      "unlikely based on what you shared": "根据你提供的信息不太可能符合"
    }
  },
  so: {
    appLang: "so",
    kicker: "Bilaash · Gaar ah · Ilo rasmi ah",
    title: "Hel gargaarka aad u qalmi karto.",
    dek: "Hage luqado badan ah oo ku saabsan cunto, caafimaad, guri, iyo kaalmo lacag ah oo ka yimid ilo dawladeed oo rasmi ah.",
    trust: ["SSN looma baahna", "Gaar ah", "Ilo rasmi ah oo keliya"],
    privacySaved: "Waxaa lagu kaydiyay biraawsarkan. Server laguma kaydin.",
    privacyUnsaved: "Jawaabahaagu waxay ku ekaanayaan qalabkan oo keliya.",
    remember: "Ku xasuuso jawaabahayga qalabkan",
    languageTitle: "Dooro luqaddaada.",
    languageHelp: "Qaybaha kale ee hagaha waxay isticmaali doonaan luqadda aad doorato.",
    locationTitle: "Xaggee ku nooshahay?",
    zipLabel: "ZIP code",
    householdTitle: "Nooga warran qoyskaaga.",
    peopleLabel: "Immisa qof ayaa kula nool?",
    incomeLabel: "Dakhliga bishii (cashuurta ka hor)",
    incomeUnknown: "Ma hubo",
    statusLabel: "Waa maxay xaaladdaadu?",
    statuses: {
      prefer_not_to_say: "Ma rabo inaan sheego",
      citizen_or_national: "Muwaadin ama national Maraykan ah",
      lawful_permanent_resident: "Degane rasmi ah (green card)",
      mixed_household: "Qoys leh xaalado kala duwan",
      other: "Kale ama ma hubo"
    },
    flags: {
      dependents: "Carruur ama dad kugu tiirsan",
      student: "Arday",
      veteran: "Ciidan hore"
    },
    needsTitle: "Maxaad ugu baahan tahay?",
    selectAll: "Dooro dhammaan kuwa ku khuseeya.",
    needs: {
      food: "Cunto",
      healthcare: "Daryeel caafimaad",
      cash: "Kaalmo lacag ah",
      utilities: "Adeegyada guriga",
      housing: "Guri",
      childcare: "Daryeel carruur"
    },
    next: "Xiga",
    back: "Dib u noqo",
    searching: "Waa la raadinayaa...",
    findBenefits: "Raadi gargaar",
    resultsKicker: "Kala-sarraynta ilo rasmi ah",
    resultsTitle: "Barnaamijyo lagu taliyay",
    emptyStrong: "Buuxi foomka gaaban si aad u aragto barnaamijyo ku caawin kara.",
    emptyText: "Waxay qaadataa qiyaastii 1 daqiiqo. SSN looma baahna.",
    errorDefault: "Lama gaari karo adeegga maxalliga ah.",
    check: "Hubi",
    officialSite: "Fur bogga rasmiga ah",
    viewSource: "Eeg isha",
    stepLabel: (current, total) => `Tallaabo ${current} ee ${total}`,
    matchLevels: {
      "likely match": "waxay u badan tahay inuu ku habboon yahay",
      "possible match": "waa suurtagal inuu ku habboon yahay",
      "unlikely based on what you shared": "uma badna marka loo eego waxa aad sheegtay"
    }
  },
  tl: {
    appLang: "tl",
    kicker: "Libre · Pribado · Opisyal na sanggunian",
    title: "Maghanap ng mga benepisyong maaari mong makuha.",
    dek: "Isang gabay sa maraming wika para sa pagkain, kalusugan, pabahay, at tulong pinansyal mula sa opisyal na sanggunian ng gobyerno.",
    trust: ["Hindi kailangan ang SSN", "Pribado", "Opisyal na sanggunian lang"],
    privacySaved: "Naka-save sa browser na ito. Hindi sa server.",
    privacyUnsaved: "Mananatili lang sa device na ito ang mga sagot mo.",
    remember: "Tandaan ang mga sagot ko sa device na ito",
    languageTitle: "Piliin ang iyong wika.",
    languageHelp: "Gagamitin ng natitirang gabay ang wikang pipiliin mo.",
    locationTitle: "Saan ka nakatira?",
    zipLabel: "ZIP code",
    householdTitle: "Sabihin sa amin ang tungkol sa iyong sambahayan.",
    peopleLabel: "Ilang tao ang nakatira kasama mo?",
    incomeLabel: "Buwanang kita (bago buwis)",
    incomeUnknown: "Hindi ako sigurado",
    statusLabel: "Ano ang iyong status?",
    statuses: {
      prefer_not_to_say: "Mas gusto kong hindi sabihin",
      citizen_or_national: "Mamamayan o national ng U.S.",
      lawful_permanent_resident: "Permanent resident (green card)",
      mixed_household: "Sambahayan na may halo-halong status",
      other: "Iba pa o hindi sigurado"
    },
    flags: {
      dependents: "Mga anak o umaasa sa iyo",
      student: "Estudyante",
      veteran: "Beterano"
    },
    needsTitle: "Ano ang pinaka-kailangan mo?",
    selectAll: "Piliin ang lahat ng naaangkop.",
    needs: {
      food: "Pagkain",
      healthcare: "Pangangalagang pangkalusugan",
      cash: "Tulong pinansyal",
      utilities: "Utilities",
      housing: "Pabahay",
      childcare: "Pag-aalaga ng bata"
    },
    next: "Susunod",
    back: "Bumalik",
    searching: "Naghahanap...",
    findBenefits: "Maghanap ng benepisyo",
    resultsKicker: "Ranggo mula sa opisyal na sanggunian",
    resultsTitle: "Mga inirerekomendang programa",
    emptyStrong: "Sagutan ang maikling form para makita ang mga programang maaaring makatulong.",
    emptyText: "Mga 1 minuto lang. Hindi kailangan ang SSN.",
    errorDefault: "Hindi maabot ang lokal na serbisyo.",
    check: "Suriin",
    officialSite: "Buksan ang opisyal na site",
    viewSource: "Tingnan ang source",
    stepLabel: (current, total) => `Hakbang ${current} ng ${total}`,
    matchLevels: {
      "likely match": "malamang tugma",
      "possible match": "posibleng tugma",
      "unlikely based on what you shared": "hindi malamang batay sa ibinahagi mo"
    }
  },
  ko: {
    appLang: "ko",
    kicker: "무료 · 비공개 · 공식 출처",
    title: "받을 수 있는 혜택을 찾아보세요.",
    dek: "공식 정부 출처를 바탕으로 식품, 의료, 주거, 현금 지원을 안내하는 다국어 가이드입니다.",
    trust: ["SSN 필요 없음", "비공개", "공식 출처만 사용"],
    privacySaved: "이 브라우저에 저장되었습니다. 서버에는 저장되지 않습니다.",
    privacyUnsaved: "답변은 이 기기에만 남습니다.",
    remember: "이 기기에 내 답변 저장",
    languageTitle: "언어를 선택하세요.",
    languageHelp: "이후 안내는 선택한 언어로 표시됩니다.",
    locationTitle: "어디에 거주하시나요?",
    zipLabel: "우편번호",
    householdTitle: "가구 정보를 알려주세요.",
    peopleLabel: "함께 사는 사람이 몇 명인가요?",
    incomeLabel: "월 소득 (세전)",
    incomeUnknown: "잘 모르겠습니다",
    statusLabel: "현재 신분은 무엇인가요?",
    statuses: {
      prefer_not_to_say: "말하고 싶지 않음",
      citizen_or_national: "미국 시민권자 또는 국민",
      lawful_permanent_resident: "영주권자 (그린카드)",
      mixed_household: "신분이 혼합된 가구",
      other: "기타 또는 잘 모름"
    },
    flags: {
      dependents: "자녀 또는 부양가족",
      student: "학생",
      veteran: "재향군인"
    },
    needsTitle: "가장 필요한 것은 무엇인가요?",
    selectAll: "해당하는 항목을 모두 선택하세요.",
    needs: {
      food: "식품",
      healthcare: "의료",
      cash: "현금 지원",
      utilities: "공과금",
      housing: "주거",
      childcare: "보육"
    },
    next: "다음",
    back: "뒤로",
    searching: "검색 중...",
    findBenefits: "혜택 찾기",
    resultsKicker: "공식 출처 순위",
    resultsTitle: "추천 프로그램",
    emptyStrong: "짧은 양식을 작성하면 도움이 될 수 있는 프로그램을 볼 수 있습니다.",
    emptyText: "약 1분이 걸립니다. SSN은 필요하지 않습니다.",
    errorDefault: "로컬 매칭 서비스에 연결할 수 없습니다.",
    check: "확인",
    officialSite: "공식 사이트 열기",
    viewSource: "출처 보기",
    stepLabel: (current, total) => `${total}단계 중 ${current}단계`,
    matchLevels: {
      "likely match": "가능성이 높은 일치",
      "possible match": "가능한 일치",
      "unlikely based on what you shared": "제공한 정보로는 가능성이 낮음"
    }
  },
  other: {
    appLang: "en",
    kicker: "Free · Private · Official sources",
    title: "Find benefits you may qualify for.",
    dek: "A multilingual guide to food, health, housing, and cash assistance from official government sources.",
    trust: ["No SSN needed", "Private", "Official sources only"],
    privacySaved: "Saved on this browser. Not on any server.",
    privacyUnsaved: "Your answers stay on this device only.",
    remember: "Remember my answers on this device",
    languageTitle: "Choose your language.",
    languageHelp: "The rest of the guide will use the language you choose.",
    locationTitle: "Where are you located?",
    zipLabel: "ZIP code",
    householdTitle: "Tell us about your household.",
    peopleLabel: "How many people live with you?",
    incomeLabel: "Monthly income (before taxes)",
    incomeUnknown: "I am not sure",
    statusLabel: "What is your status?",
    statuses: baseStatuses,
    flags: {
      dependents: "Children or dependents",
      student: "Student",
      veteran: "Veteran"
    },
    needsTitle: "What do you need most?",
    selectAll: "Select all that apply.",
    needs: {
      food: "Food",
      healthcare: "Health care",
      cash: "Cash aid",
      utilities: "Utilities",
      housing: "Housing",
      childcare: "Child care"
    },
    next: "Next",
    back: "Back",
    searching: "Searching...",
    findBenefits: "Find benefits",
    resultsKicker: "Official-source ranking",
    resultsTitle: "Recommended programs",
    emptyStrong: "Fill out the short form to see programs that may help you.",
    emptyText: "Takes about 1 minute. No SSN needed.",
    errorDefault: "Could not reach the local matching service.",
    check: "Check",
    officialSite: "Open official site",
    viewSource: "View source",
    stepLabel: (current, total) => `Step ${current} of ${total}`,
    matchLevels: {
      "likely match": "likely match",
      "possible match": "possible match",
      "unlikely based on what you shared": "unlikely based on what you shared"
    }
  }
};

const defaultProfile: UserProfile = {
  language: "en",
  zipCode: "92101",
  county: "San Diego",
  householdSize: 3,
  monthlyIncomeRange: "1500-3000",
  hasDependents: true,
  isStudent: false,
  isVeteran: false,
  immigrationCategory: "prefer_not_to_say",
  urgentNeeds: ["food", "healthcare"]
};

const needIconPaths: Record<string, React.ReactNode> = {
  food: (
    <>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" />
    </>
  ),
  healthcare: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  cash: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v1m0 6v1M9.5 9.5c.4-.8 1.2-1.5 2.5-1.5s2.5.7 2.5 2c0 2-2.5 2-2.5 3.5m0 1.5h.01" />
    </>
  ),
  utilities: <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
  housing: (
    <>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </>
  ),
  childcare: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M6 20v-2a6 6 0 0 1 12 0v2" />
    </>
  )
};

function normalizeLanguage(language: unknown): LanguageCode {
  if (typeof language !== "string") {
    return "en";
  }
  if (language in translations) {
    return language as LanguageCode;
  }
  return languageAliases[language] ?? "en";
}

function normalizeProfile(profile: unknown): UserProfile {
  if (!profile || typeof profile !== "object") {
    return defaultProfile;
  }

  const candidate = profile as Partial<UserProfile> & { language?: unknown };
  return {
    ...defaultProfile,
    ...candidate,
    language: normalizeLanguage(candidate.language)
  };
}

function StepDots({ current, copy }: { current: number; copy: Copy }) {
  return (
    <div className="stepIndicator" aria-label={copy.stepLabel(current, TOTAL_STEPS)}>
      {Array.from({ length: TOTAL_STEPS }, (_, index) => index + 1).map((n) => (
        <span key={n} className={`stepDot${n <= current ? " active" : ""}`} />
      ))}
      <span className="stepLabel">{copy.stepLabel(current, TOTAL_STEPS)}</span>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function NeedIcon({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {needIconPaths[id]}
    </svg>
  );
}

export default function Home() {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [saveLocal, setSaveLocal] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const copy = translations[profile.language];

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setProfile(normalizeProfile(JSON.parse(stored)));
        setSaveLocal(true);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = copy.appLang;
    document.documentElement.dir = copy.dir ?? "ltr";
  }, [copy]);

  useEffect(() => {
    if (saveLocal) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [profile, saveLocal]);

  const privacyMessage = useMemo(
    () => (saveLocal ? copy.privacySaved : copy.privacyUnsaved),
    [copy, saveLocal]
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/profile/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: {
            ...profile,
            language: languageByCode[profile.language].englishName
          },
          language: languageByCode[profile.language].englishName
        })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = await response.json();
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.errorDefault);
    } finally {
      setLoading(false);
    }
  }

  function toggleNeed(need: string) {
    setProfile((current) => ({
      ...current,
      urgentNeeds: current.urgentNeeds.includes(need)
        ? current.urgentNeeds.filter((item) => item !== need)
        : [...current.urgentNeeds, need]
    }));
  }

  function chooseLanguage(language: LanguageCode) {
    setProfile((current) => ({ ...current, language }));
  }

  return (
    <main className="shell" dir={copy.dir ?? "ltr"}>
      <section className="hero">
        <div className="heroCopy">
          <p className="kicker">{copy.kicker}</p>
          <h1>{copy.title}</h1>
          <p className="dek">{copy.dek}</p>
          <div className="trustRow" aria-label={copy.kicker}>
            {copy.trust.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="workspace">
        <form className="intake" onSubmit={submit}>
          <div className="privacyNotice">
            <LockIcon />
            {privacyMessage}
          </div>
          <div className="saveToggle">
            <label className="switch">
              <input
                type="checkbox"
                checked={saveLocal}
                onChange={(e) => setSaveLocal(e.target.checked)}
              />
              <span className="switchTrack" />
            </label>
            {copy.remember}
          </div>

          {step === 1 && (
            <>
              <StepDots current={1} copy={copy} />
              <p className="stepTitle">{copy.languageTitle}</p>
              <p className="stepHint">{copy.languageHelp}</p>
              <div className="languageGrid" role="radiogroup" aria-label={copy.languageTitle}>
                {languageOptions.map((language) => (
                  <button
                    key={language.code}
                    type="button"
                    className={`languageBtn${profile.language === language.code ? " selected" : ""}`}
                    onClick={() => chooseLanguage(language.code)}
                    aria-pressed={profile.language === language.code}
                    aria-label={language.englishName}
                  >
                    {language.nativeName}
                  </button>
                ))}
              </div>
              <button type="button" className="primary" onClick={() => setStep(2)}>
                {copy.next} →
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <StepDots current={2} copy={copy} />
              <button type="button" className="backBtn" onClick={() => setStep(1)}>
                ← {copy.back}
              </button>
              <p className="stepTitle">{copy.locationTitle}</p>
              <div className="fieldStack">
                <label>
                  {copy.zipLabel}
                  <input
                    inputMode="numeric"
                    maxLength={5}
                    value={profile.zipCode}
                    onChange={(e) => setProfile({ ...profile, zipCode: e.target.value })}
                    placeholder="e.g. 92101"
                  />
                </label>
              </div>
              <button
                type="button"
                className="primary"
                onClick={() => setStep(3)}
                disabled={!profile.zipCode.trim()}
              >
                {copy.next} →
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <StepDots current={3} copy={copy} />
              <button type="button" className="backBtn" onClick={() => setStep(2)}>
                ← {copy.back}
              </button>
              <p className="stepTitle">{copy.householdTitle}</p>
              <div className="fieldGrid">
                <label>
                  {copy.peopleLabel}
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={profile.householdSize}
                    onChange={(e) =>
                      setProfile({ ...profile, householdSize: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  {copy.incomeLabel}
                  <select
                    value={profile.monthlyIncomeRange}
                    onChange={(e) =>
                      setProfile({ ...profile, monthlyIncomeRange: e.target.value })
                    }
                  >
                    <option value="0-1500">$0 - $1,500</option>
                    <option value="1500-3000">$1,500 - $3,000</option>
                    <option value="3000-5000">$3,000 - $5,000</option>
                    <option value="5000+">$5,000+</option>
                    <option value="unknown">{copy.incomeUnknown}</option>
                  </select>
                </label>
              </div>
              <label className="fullWidthField">
                {copy.statusLabel}
                <select
                  value={profile.immigrationCategory}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      immigrationCategory: e.target.value as ImmigrationCategory
                    })
                  }
                >
                  {(Object.keys(copy.statuses) as ImmigrationCategory[]).map((status) => (
                    <option key={status} value={status}>
                      {copy.statuses[status]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flags" aria-label={copy.statusLabel}>
                <label>
                  <input
                    type="checkbox"
                    checked={profile.hasDependents}
                    onChange={(e) => setProfile({ ...profile, hasDependents: e.target.checked })}
                  />
                  {copy.flags.dependents}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={profile.isStudent}
                    onChange={(e) => setProfile({ ...profile, isStudent: e.target.checked })}
                  />
                  {copy.flags.student}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={profile.isVeteran}
                    onChange={(e) => setProfile({ ...profile, isVeteran: e.target.checked })}
                  />
                  {copy.flags.veteran}
                </label>
              </div>
              <button type="button" className="primary" onClick={() => setStep(4)}>
                {copy.next} →
              </button>
            </>
          )}

          {step === 4 && (
            <>
              <StepDots current={4} copy={copy} />
              <button type="button" className="backBtn" onClick={() => setStep(3)}>
                ← {copy.back}
              </button>
              <p className="needsTitle">{copy.needsTitle}</p>
              <p className="stepHint">{copy.selectAll}</p>
              <div className="needsGrid" role="group" aria-label={copy.needsTitle}>
                {Object.entries(copy.needs).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`needBtn${profile.urgentNeeds.includes(id) ? " selected" : ""}`}
                    onClick={() => toggleNeed(id)}
                    aria-pressed={profile.urgentNeeds.includes(id)}
                  >
                    <NeedIcon id={id} />
                    {label}
                  </button>
                ))}
              </div>
              <button className="primary" type="submit" disabled={loading}>
                {loading ? copy.searching : `${copy.findBenefits} →`}
              </button>
              {error ? <p className="error">{error}</p> : null}
            </>
          )}
        </form>

        <section className="results" aria-live="polite">
          <div className="resultsHeader">
            <p className="kicker">{copy.resultsKicker}</p>
            <h2>{copy.resultsTitle}</h2>
          </div>
          {results.length === 0 ? (
            <div className="emptyState">
              <div className="emptyArrow">←</div>
              <strong>{copy.emptyStrong}</strong>
              <p>{copy.emptyText}</p>
            </div>
          ) : (
            results.map((result) => (
              <article className="resultCard" key={result.resource.id}>
                <div>
                  <span className="badge">{copy.matchLevels[result.match_level]}</span>
                  <h3>{result.resource.name}</h3>
                  <p>{result.next_action}</p>
                </div>
                <div className="resultMeta">
                  <span>{result.resource.category}</span>
                  <span>{result.resource.geography}</span>
                </div>
                <ul>
                  {result.reasons.slice(0, 3).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                {result.blockers.length > 0 ? (
                  <p className="blocker">{copy.check}: {result.blockers.join("; ")}</p>
                ) : null}
                <div className="actions">
                  <a
                    href={result.resource.official_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {copy.officialSite}
                  </a>
                  <a
                    href={result.resource.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {copy.viewSource}
                  </a>
                </div>
              </article>
            ))
          )}
        </section>
      </section>
    </main>
  );
}
