/**
 * Local-first task planner for the Raabta agent.
 *
 * The agent used to run a single fixed pipeline (research → answer), which made it
 * behave like a chat assistant rather than an agent. This planner decomposes a user
 * request into an explicit, inspectable plan whose steps the agent reports as it works.
 * It is deliberately deterministic so it can be unit tested and shown before any
 * network request is made.
 */

export type AgentIntent =
  | "research"
  | "coding"
  | "github"
  | "workspace"
  | "media"
  | "writing"
  | "general";

export type AgentStepKind = AgentIntent | "plan" | "verify" | "answer";

export type AgentStepStatus = "pending" | "active" | "done" | "failed" | "skipped";

export type AgentStep = {
  id: string;
  kind: AgentStepKind;
  title: string;
  titleUr: string;
  status: AgentStepStatus;
  /** Optional tool the step is expected to use, for timeline labelling. */
  tool?: string;
};

export type AgentPlan = {
  goal: string;
  intent: AgentIntent;
  steps: AgentStep[];
  createdAt: string;
};

export type AgentPlanInput = {
  request: string;
  attachmentKinds: string[];
  githubConnected: boolean;
};

type StepTemplate = {
  kind: AgentStepKind;
  title: string;
  titleUr: string;
  tool?: string;
};

const VERIFY_STEP: StepTemplate = {
  kind: "verify",
  title: "Verify the result against real tool output before answering",
  titleUr: "جواب دینے سے پہلے نتیجہ حقیقی tool output سے جانچیں",
};

const ANSWER_STEP: StepTemplate = {
  kind: "answer",
  title: "Write the final answer with sources and honest limits",
  titleUr: "ذرائع اور واضح حدود کے ساتھ حتمی جواب لکھیں",
};

const INTENT_STEPS: Record<AgentIntent, StepTemplate[]> = {
  research: [
    {
      kind: "research",
      title: "Search the public web for current, relevant sources",
      titleUr: "موجودہ اور متعلقہ ذرائع کے لیے عوامی ویب پر تلاش کریں",
      tool: "web_search",
    },
    {
      kind: "research",
      title: "Read the most relevant pages and keep bounded excerpts",
      titleUr: "سب سے متعلقہ صفحات پڑھیں اور محدود اقتباسات محفوظ کریں",
      tool: "read_public_web_page",
    },
    {
      kind: "plan",
      title: "Cross-check the sources and note disagreements or gaps",
      titleUr: "ذرائع کا موازنہ کریں اور اختلاف یا کمی نوٹ کریں",
    },
  ],
  coding: [
    {
      kind: "workspace",
      title: "Inspect the relevant files in the private workspace",
      titleUr: "نجی workspace میں متعلقہ فائلیں دیکھیں",
      tool: "ai_workspace_read_file",
    },
    {
      kind: "coding",
      title: "Draft the change and the exact code to write",
      titleUr: "تبدیلی اور لکھنے کے لیے درست کوڈ تیار کریں",
    },
    {
      kind: "coding",
      title: "Write or update the file in the workspace",
      titleUr: "workspace میں فائل لکھیں یا اپ ڈیٹ کریں",
      tool: "ai_workspace_write_file",
    },
  ],
  github: [
    {
      kind: "github",
      title: "List repositories, or create one first if none exists yet",
      titleUr: "repositories کی فہرست بنائیں، یا اگر کوئی نہ ہو تو پہلے نیا بنائیں",
      tool: "github_list_repositories",
    },
    {
      kind: "github",
      title: "Read the target files before proposing any change",
      titleUr: "کوئی تبدیلی تجویز کرنے سے پہلے مطلوبہ فائلیں پڑھیں",
      tool: "github_read_file",
    },
    {
      kind: "github",
      title: "Create an isolated branch so the default branch is never written directly",
      titleUr: "الگ branch بنائیں تاکہ default branch پر سیدھا نہ لکھا جائے",
      tool: "github_create_branch",
    },
    {
      kind: "github",
      title: "Prepare the change and ask for approval before writing",
      titleUr: "تبدیلی تیار کریں اور لکھنے سے پہلے منظوری لیں",
      tool: "github_update_file",
    },
    {
      kind: "verify",
      title: "Read the commits back to confirm the change actually landed",
      titleUr: "commits دوبارہ پڑھ کر تصدیق کریں کہ تبدیلی واقعی محفوظ ہوئی",
      tool: "github_list_commits",
    },
    {
      kind: "verify",
      title: "Confirm the run or pull request from GitHub's response",
      titleUr: "GitHub کے جواب سے run یا pull request کی تصدیق کریں",
      tool: "github_get_workflow_run",
    },
  ],
  workspace: [
    {
      kind: "workspace",
      title: "List the workspace and read what is already stored",
      titleUr: "workspace کی فہرست دیکھیں اور موجود مواد پڑھیں",
      tool: "ai_workspace_list_files",
    },
    {
      kind: "workspace",
      title: "Organise or produce the requested files",
      titleUr: "مطلوبہ فائلیں تیار یا منظم کریں",
      tool: "ai_workspace_write_file",
    },
  ],
  media: [
    {
      kind: "media",
      title: "Prepare the selected image, document or audio for analysis",
      titleUr: "منتخب تصویر، دستاویز یا آڈیو تجزیے کے لیے تیار کریں",
    },
    {
      kind: "media",
      title: "Analyse the media with the appropriate model",
      titleUr: "مناسب ماڈل کے ذریعے میڈیا کا تجزیہ کریں",
    },
  ],
  writing: [
    {
      kind: "writing",
      title: "Collect the material the writing must draw from",
      titleUr: "لکھائی کے لیے درکار مواد جمع کریں",
    },
    {
      kind: "writing",
      title: "Draft the text and refine structure and tone",
      titleUr: "متن لکھیں اور ساخت و لہجہ بہتر بنائیں",
    },
  ],
  general: [
    {
      kind: "general",
      title: "Gather any context needed to answer well",
      titleUr: "بہتر جواب کے لیے ضروری سیاق و سباق جمع کریں",
    },
    {
      kind: "general",
      title: "Compose a direct, accurate answer",
      titleUr: "براہِ راست اور درست جواب تیار کریں",
    },
  ],
};

/**
 * Latin keywords use `\b` word boundaries; Urdu/Arabic-script keywords cannot,
 * because `\b` only matches ASCII word characters. Urdu terms are matched as
 * plain substrings instead, which is what a speaker expects.
 */
function keywordMatcher(latin: string, urdu: string): RegExp {
  return new RegExp(`(?:\\b(?:${latin})\\b)|(?:${urdu})`, "i");
}

const RESEARCH_HINTS = keywordMatcher(
  "latest|current|today|news|research|search|internet|web|online|real[- ]?time|recent|price|weather|compare|review|best|how much",
  "قیمت|تازہ|آج|تحقیق|انٹرنیٹ|ویب|خبر|موازنہ",
);
const CODING_HINTS = keywordMatcher(
  "code|coding|debug|bug|refactor|function|typescript|javascript|python|api|build|test|script|implement",
  "کوڈ|کوڈنگ|بگ|ٹیسٹ|پروگرام|فنکشن",
);
const GITHUB_HINTS = keywordMatcher(
  "github|repository|repo|commit|branch|pull request|issue|workflow|actions",
  "ریپوزٹری|برانچ|کمٹ|ایشو",
);
const WORKSPACE_HINTS = keywordMatcher(
  "file|files|folder|directory|note|notes|save|workspace",
  "فائل|فائلیں|فولڈر|نوٹ|محفوظ",
);
const WRITING_HINTS = keywordMatcher(
  "write|draft|compose|essay|email|letter|summary|summarise|summarize|translate",
  "لکھیں|خط|ای میل|خلاصہ|ترجمہ",
);

/** Pick the dominant intent from the request, attachments and connection state. */
export function detectIntent(input: AgentPlanInput): AgentIntent {
  const text = input.request.toLowerCase();
  const kinds = input.attachmentKinds;
  if (kinds.includes("image") || kinds.includes("audio")) return "media";
  if (GITHUB_HINTS.test(text) && input.githubConnected) return "github";
  if (CODING_HINTS.test(text)) return "coding";
  if (RESEARCH_HINTS.test(text)) return "research";
  if (WORKSPACE_HINTS.test(text)) return "workspace";
  if (WRITING_HINTS.test(text)) return "writing";
  return "general";
}

/** Build a visible, ordered plan for a request. Pure and deterministic. */
export function buildAgentPlan(input: AgentPlanInput, now = new Date()): AgentPlan {
  const intent = detectIntent(input);
  const templates: StepTemplate[] = [
    {
      kind: "plan",
      title: "Understand the request and list the steps needed",
      titleUr: "درخواست سمجھیں اور ضروری مراحل کی فہرست بنائیں",
    },
    ...INTENT_STEPS[intent],
    VERIFY_STEP,
    ANSWER_STEP,
  ];
  const steps: AgentStep[] = templates.map((template, index) => ({
    id: `step-${index + 1}`,
    kind: template.kind,
    title: template.title,
    titleUr: template.titleUr,
    status: "pending",
    ...(template.tool ? { tool: template.tool } : {}),
  }));
  if (steps.length) steps[0].status = "active";
  return {
    goal: input.request.trim(),
    intent,
    steps,
    createdAt: now.toISOString(),
  };
}

/** Mark a step (by index) as active, completing everything before it. */
export function advancePlan(plan: AgentPlan, index: number): AgentPlan {
  const steps = plan.steps.map((step, position) => {
    if (position < index)
      return step.status === "failed" ? step : { ...step, status: "done" as const };
    if (position === index) return { ...step, status: "active" as const };
    return step;
  });
  return { ...plan, steps };
}

/** Resolve a step status by tool name so tool events map onto the plan. */
export function markStepByTool(
  plan: AgentPlan,
  tool: string,
  status: AgentStepStatus,
): AgentPlan {
  const index = plan.steps.findIndex(
    (step) =>
      step.tool === tool && step.status !== "done" && step.status !== "failed",
  );
  if (index < 0) return plan;
  const steps = plan.steps.map((step, position) =>
    position === index ? { ...step, status } : step,
  );
  return { ...plan, steps };
}

/** Complete the whole plan, honouring any step that already failed. */
export function completePlan(plan: AgentPlan): AgentPlan {
  return {
    ...plan,
    steps: plan.steps.map((step) =>
      step.status === "pending" || step.status === "active"
        ? { ...step, status: "done" as const }
        : step,
    ),
  };
}

/** Human-readable progress, used for the plan summary line. */
export function planProgress(plan: AgentPlan): { done: number; total: number } {
  const done = plan.steps.filter((step) => step.status === "done").length;
  return { done, total: plan.steps.length };
}
