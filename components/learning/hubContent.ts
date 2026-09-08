/**
 * The written modules and the self-check quiz.
 *
 * THIS FILE IS COURSEWARE, NOT DATA. Everything numeric in it is a fact of
 * the deployed system that was verified against the live build -- the 0.95
 * availability floor and its 0.9996 agreement with the stockout flag, the
 * five-week replenishment floor (four weeks of lead plus one of review), the
 * cover ceiling at half a category's typical life, the Rs 50,00,000 planner
 * ceiling, the append-only ledger, the direction-dependent arithmetic behind
 * value at stake. If the system changes, this prose is wrong and should be
 * edited like any other stale comment.
 *
 * WHY WRITTEN MODULES AND NOT VIDEOS. The reference design showed video
 * cards with play buttons and runtimes. There are no video files, and a play
 * button over nothing is a dead click with a disclaimer. A written module
 * has no such gap: the read time is computed from the words actually here,
 * the thumbnail is a drawing of the screen the module walks, and clicking
 * opens the text. Nothing promised a video, so nothing has to apologise.
 *
 * THE QUIZ IS A SELF-CHECK AND SAYS SO. There is no learning_quiz_attempt
 * table, and writing scores into learning_completion would overwrite pilot
 * assessment data with browser clicks. So the quiz grades locally, shows the
 * result, and records nothing -- the card says "not recorded" rather than
 * letting anyone believe otherwise.
 */

export type WrittenSection = {
  heading: string;
  body: string;
};

export type WrittenModule = {
  /** learning_module.module_id this text belongs to. */
  moduleId: string;
  /** The screen this module walks, e.g. "/workbench". Shown on the tile. */
  route: string;
  /** Which tile drawing to use. */
  art: "forecast" | "drivers" | "buy" | "exceptions" | "escalation";
  sections: WrittenSection[];
};

export const WRITTEN_MODULES: readonly WrittenModule[] = [
  {
    moduleId: "LM-F01",
    route: "/workbench",
    art: "forecast",
    sections: [
      {
        heading: "What P50 actually claims",
        body: "The headline forecast is a P50: half of the honest futures sit above it and half below. It is not a promise and not a target -- it is the middle of a distribution. The system never hands you a single number without its band, because the band is where the information is. P10 and P90 are the edges: demand could reasonably land anywhere between them, and the band is calibrated so that it catches the real outcome roughly eight times in ten. On the workbench the band is drawn around the P50 line; a wide band is the model telling you it has not seen this pattern often.",
      },
      {
        heading: "The manual line is drawn beside it",
        body: "The dashed line is the manual baseline -- what the spreadsheet process forecast for the same weeks. It is on the chart so disagreement is visible, not asserted. When the model and the manual plan diverge, the drivers panel says why in units: demand this week last year moved the number by so many units, the four-week rolling mean by so many more. A forecast you cannot interrogate is a forecast you will not act on.",
      },
      {
        heading: "Why some weeks are struck out",
        body: "Weeks where availability ran below 95% are flagged as demand-censored and excluded from accuracy scoring. A sell-out week records what was on the shelf, not what people wanted -- score against it and the model learns to under-buy forever. The 95% cut-off was not chosen by hand: it is the threshold that best reproduces the dataset's own stockout flag, agreeing on 9,996 of every 10,000 rows.",
      },
    ],
  },
  {
    moduleId: "LM-F02",
    route: "/workbench",
    art: "drivers",
    sections: [
      {
        heading: "Drivers are in units, not percentages",
        body: "Every forecast carries its largest drivers, each expressed in units with a direction: last year's same week added 1,300 units, the recent four-week average took 300 out. Units are deliberate -- a driver worth '4%' invites nodding along, a driver worth 338 units invites checking. The attribution method is exact tree SHAP, and the method name is rendered from the data rather than asserted, so if the pipeline ever writes something weaker the screen stops claiming exactness.",
      },
      {
        heading: "Tracing a number back",
        body: "The features are honest about time. The model forecasts twelve weeks out, so it is only allowed inputs that would exist twelve weeks before the target -- nothing lagged shorter. A model that peeks at last week's sales looks brilliant in a backtest and useless in production, because in production last week has not happened yet. When you challenge a forecast, challenge a driver: 'lag-52 is up because last autumn had a promotion this autumn does not' is a challenge someone can act on. 'It feels high' is not.",
      },
      {
        heading: "What the model cannot see",
        body: "The drivers panel also tells you what is absent. A competitor opening across the road, a delayed shipment, a local festival nobody coded -- none of these are features, and the model is silent about all of them. Silence is not disagreement. Where you know something the model cannot, that is exactly what the Modify button and its reason box exist for.",
      },
    ],
  },
  {
    moduleId: "LM-WU01",
    route: "/workbench",
    art: "forecast",
    sections: [
      {
        heading: "Scope, horizon, history",
        body: "The workbench opens on your own scope -- the categories you own plus your home region, decided by row-level security rather than by a filter you could mis-set. The filters only offer combinations your session can actually read. Behind the forecast sit 104 weeks of history; ahead of it, 12 weeks of forward view with the band around the central path and the manual baseline alongside.",
      },
      {
        heading: "Reading a series end to end",
        body: "Pick a series and read it in this order: history first, for the shape of the season; the band second, for how sure the model is; the drivers third, for why the number moved; the manual line last, for where you would have landed without it. That order matters because it puts the evidence before the disagreement. Most series need thirty seconds. The ones that need longer are the ones worth your morning.",
      },
      {
        heading: "The benchmark line",
        body: "Accuracy on this screen is never quoted alone. The model's figure stands next to the seasonal naive -- 'same week last year', which anyone could run in a spreadsheet -- and next to the manual baseline. The gap to naive is the model's real skill; the gap to manual is the commercial case. Quoting the flattering one without the honest one is how tools lose rooms, so the screen simply shows both.",
      },
    ],
  },
  {
    moduleId: "LM-WU02",
    route: "/buy",
    art: "buy",
    sections: [
      {
        heading: "Where the recommended quantity comes from",
        body: "A recommended buy is two numbers added together: the P50 demand over the horizon, plus safety stock derived from the width of the calibrated band. Nothing else. That has a consequence worth sitting with: when the model is LESS sure, the committed buy gets SMALLER, not larger -- a wide band on a new style produces a modest first commitment with more held for reorder once real sales exist. That is the opposite of hedging by instinct, and it is the correct response to uncertainty in a business where the surplus ends up on the discount rail.",
      },
      {
        heading: "What value at stake means on a buy row",
        body: "The rupee figure prices the gap against the manual plan, and the arithmetic depends on direction. On an increase, it is the unit gap at the payload's own selling price -- demand that goes unserved if the manual plan stands. On a reduce, it is the discount given away on the surplus: the gap at that price taken down by the brand's markdown depth, because units bought over plan are modelled as clearing at a cut, not at list.",
      },
      {
        heading: "Modify is the point",
        body: "You have three verbs: Approve, Modify, Reject. Modify prefills the model's number and requires a reason -- blocked in the browser and refused again on the server for anyone who skips the browser. The reason is not paperwork. It is sorted into judgement the model lacked, or a gap the model should close; only the second queues retraining. Every decision lands in an append-only ledger: no edit, no delete, a change of mind is a new row. Above fifty lakh in your own categories, the database refuses the insert -- the decision routes upward, and that is the ceiling working, not the ceiling failing.",
      },
    ],
  },
  {
    moduleId: "LM-WU03",
    route: "/exceptions",
    art: "exceptions",
    sections: [
      {
        heading: "Two rules raise every exception",
        body: "Overstock: projected weeks of supply above the category's cover ceiling, which is set at half the product's typical merchandisable life -- because the binding constraint in fashion is not warehouse space, it is how long the goods stay sellable. Stockout: cover below five weeks, which is the longest channel lead time of four weeks plus one week of review. Below that floor, replenishment physically cannot land in time, so the shortfall is already committed.",
      },
      {
        heading: "The queue is ranked in rupees",
        body: "Exceptions are ordered by value at stake, not by a severity label. 'High, medium, low' cannot tell you which of forty high items to open first; money can. The rupee figure on a row is its units at risk priced out -- so the row's money and its units are the same fact in two dresses, which is why the queue does not print both side by side.",
      },
      {
        heading: "Waiting is the expensive option",
        body: "The case attributes a fifth of all markdown loss to slow in-season response: a problem surfaces in a weekly report, a meeting happens, an execution window closes. Every step is a week of full-price selling lost. An overstock caught while cover is one week over its ceiling is a nudge; the same overstock a month later is a markdown event. The queue exists so the catching happens on arrival, not at month-end.",
      },
    ],
  },
  {
    moduleId: "LM-CM01",
    route: "/exceptions",
    art: "escalation",
    sections: [
      {
        heading: "What changes at the ceiling",
        body: "A planner commits below fifty lakh in their own categories; above that, the database refuses the insert and the decision routes to you. Nothing about the recommendation changes on the way up -- same forecast, same drivers, same value at stake. What changes is the blast radius: decisions this size move category economics, and the ceiling exists so that someone accountable for the category, not the region, is the one whose name lands in the ledger.",
      },
      {
        heading: "The read-versus-write gap",
        body: "Scope has two layers, and they are deliberately different. A planner can SEE every recommendation in their home region -- including ones in categories they do not own -- because a region is a physical place and blindness to half of it would be operational blindness. But they can only DECIDE in their own categories. So a recommendation can sit fully visible on someone's screen that they cannot commit: it is waiting for you. The dashboard's 'above your authority' split is that same gap, counted.",
      },
      {
        heading: "Deciding across regions you do not walk",
        body: "Your escalations arrive from regions you may never visit, decided on evidence rather than floor-feel. That is what the drivers, the band and the manual baseline are for: they travel, and instinct does not. When you disagree with the model at this level, your reason carries more weight in retraining precisely because it was made at the ceiling -- write it as if the next person to read it knows the numbers but not the room.",
      },
    ],
  },
];

export type QuizQuestion = {
  question: string;
  options: readonly string[];
  /** Index into options. */
  answer: number;
  /** One sentence shown after answering, right or wrong. */
  why: string;
};

/**
 * Ten questions, every answer verifiable on a screen of this app. Pass mark
 * 70%, matching the assessment bar the certificate checks against.
 */
export const QUIZ: readonly QuizQuestion[] = [
  {
    question: "What does the P50 forecast actually claim?",
    options: [
      "Demand will be exactly this number",
      "Half of likely outcomes sit above it, half below",
      "The maximum the model will commit to",
      "Last year's demand, adjusted for inflation",
    ],
    answer: 1,
    why: "P50 is the middle of a distribution, which is why it never travels without its P10-P90 band.",
  },
  {
    question:
      "A week ran at 58% availability and shows low sales. How does the system treat it?",
    options: [
      "As proof demand is falling",
      "As a normal week",
      "As demand-censored: excluded from accuracy scoring",
      "It doubles the recorded sales to compensate",
    ],
    answer: 2,
    why: "A sell-out records what was on the shelf, not what was wanted; scoring against it teaches the model to under-buy.",
  },
  {
    question: "The availability floor below which a week is censored is:",
    options: ["80%", "90%", "95%", "99%"],
    answer: 2,
    why: "0.95 -- the cut-off that best reproduces the dataset's own stockout flag, agreeing on 9,996 of 10,000 rows.",
  },
  {
    question: "A recommended buy quantity is built from:",
    options: [
      "P50 demand plus safety stock from the band's width",
      "Last year's buy plus growth",
      "The manual plan plus 10%",
      "P90 demand, to be safe",
    ],
    answer: 0,
    why: "Two parts only: expected demand, plus insurance sized by how wrong the model might be.",
  },
  {
    question:
      "The model is very unsure about a new style. What happens to the committed first buy?",
    options: [
      "It gets larger, to be safe",
      "It gets smaller, with more held back for reorder",
      "It is unchanged",
      "The style is dropped",
    ],
    answer: 1,
    why: "Uncertainty widens the band and shrinks the commitment -- commit less, learn from real sales, top up.",
  },
  {
    question: "To Modify a recommendation you must:",
    options: [
      "Have manager approval first",
      "Give a reason -- enforced in the browser and again on the server",
      "Wait for the nightly agent pass",
      "Nothing; just type a new number",
    ],
    answer: 1,
    why: "The reason is the training signal: judgement the model lacked, or a gap it should close.",
  },
  {
    question: "When can a row in the decision ledger be edited?",
    options: [
      "Within 24 hours",
      "By a planning manager",
      "Never -- it is append-only; a change of mind is a new row",
      "When the outcome is known",
    ],
    answer: 2,
    why: "Triggers block UPDATE and DELETE. A decision cannot be tidied after the outcome is known.",
  },
  {
    question: "A category's overstock cover ceiling is derived from:",
    options: [
      "Warehouse capacity",
      "Half the product's typical merchandisable life",
      "A round number chosen in review",
      "Last season's peak stock",
    ],
    answer: 1,
    why: "The binding constraint in fashion is how long goods stay sellable, not where they sit.",
  },
  {
    question: "The five-week stockout floor is five because:",
    options: [
      "It is a round number",
      "Four weeks of longest lead time plus one week of review",
      "Five weeks of safety stock is standard",
      "The model chose it",
    ],
    answer: 1,
    why: "Below the floor, replenishment physically cannot land in time -- the shortfall is already committed.",
  },
  {
    question:
      "You try to commit a decision above Rs 50,00,000 in your own category. What happens?",
    options: [
      "It commits with a warning",
      "It commits and is flagged for review",
      "The database refuses the insert; it routes to the escalation point",
      "It waits for the nightly agent",
    ],
    answer: 2,
    why: "Authority is a database rule, not a hidden button -- the refusal is the ceiling working.",
  },
];

export const QUIZ_PASS_MARK = 0.7;

/** ~200 words a minute, floored at one minute. Computed, never typed. */
export function readMinutes(module_: WrittenModule): number {
  const words = module_.sections
    .map((s) => `${s.heading} ${s.body}`)
    .join(" ")
    .split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}
