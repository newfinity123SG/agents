export const NEWSPAPER_SPEC_VERSION = "pbt-v6.0";

export const REQUIRED_MARKERS = [
  'data-layout="pbt-broadsheet-v6"',
  'data-skill-build="pbt-v6.0"',
  'data-masthead="pbt-exact-graphical-v1"',
  'id="weather-ocean"',
  'id="money"',
  'id="local"',
  'id="development"',
  'id="local-news"',
  'id="community-issues"',
  'id="technology"',
  'id="lifestyle"',
  'id="comic"',
  'id="screen-guide"',
];

export const EDITION_RULES = {
  timeZone: "America/New_York",
  regionPriority: [
    "Boca Raton",
    "Delray Beach",
    "West Palm Beach",
    "Palm Beach County",
    "South Florida",
  ],
  deliveryTargetLocal: "06:30",
  normalScanMinutes: "5-8",
  slackDeliveryPrefix: "Here is today’s paper",
  sourceOrder: [
    "official/primary sources",
    "reputable local reporting",
    "reputable national reporting",
    "other corroborating public sources",
  ],
} as const;

export const DESK_LIMITS = {
  frontPageLead: 1,
  morningBriefs: 4,
  moneyStories: 2,
  aroundTownStories: 3,
  developmentStories: 2,
  localNewsStories: 4,
  communityMain: 1,
  communitySecondary: 1,
  technologyStories: 2,
  worldLifestyleStories: 2,
  weekdayStreamingPicks: 4,
  weekdayTheatricalPicks: 2,
  quickExtras: 3,
} as const;

export function resolveEditionType(date: Date) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: EDITION_RULES.timeZone,
    weekday: "long",
  }).format(date);

  if (weekday === "Friday") return "friday-weekend";
  if (weekday === "Saturday") return "weekend";
  if (weekday === "Sunday") return "sunday-week-ahead";
  return "weekday";
}
