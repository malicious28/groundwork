import type {
  Brief,
  Conflicts,
  Outline,
  ProcessArtifact,
  Prototype,
  Questions,
} from "./schemas";

/**
 * Recorded artifacts for the Nova Interiors demo.
 *
 * These stand in for a live model call when ANTHROPIC_API_KEY is not set, which
 * makes the whole product demonstrable on a clone with no credentials — and
 * they double as deterministic fixtures for the verification tests.
 *
 * What is *not* faked is the part that matters. These go through exactly the
 * same path as live output: every quote below is checked against the real
 * source text, the grounding score is computed from those results, and a
 * citation that cannot be found is reported as unverified. Which is why one of
 * them, marked below, is deliberately wrong.
 *
 * The UI labels artifacts produced this way, so nobody is left thinking a model
 * ran when it did not.
 */

export const RECORDED_BRIEF: Brief = {
  headline:
    "Nova Interiors is losing days and occasionally money because project status lives in WhatsApp groups and a spreadsheet nobody has time to reconcile.",

  goal: {
    text: "Give clients a single place to see where their project stands, so the founder stops acting as a switchboard between clients and site teams.",
    confidence: "explicit",
    citations: [
      {
        sourceRef: "kickoff-call",
        quote: "If I stop being the switchboard",
      },
      {
        sourceRef: "kickoff-call",
        quote:
          "I get a call from a client asking where their kitchen is, and I don't know.",
      },
    ],
  },

  stakeholders: [
    {
      name: "Rohit Menon",
      role: "Founder / Managing Director",
      cares:
        "Being interrupted constantly for status he cannot answer, and being burned again by a promise made to a client without his sight of it.",
    },
    {
      name: "Priya Nair",
      role: "Head of Operations",
      cares:
        "Reconciling the master spreadsheet on weekends, and losing days to material deliveries that slip without warning.",
    },
    {
      name: "Sameer Kulkarni",
      role: "Senior Project Manager",
      cares:
        "Writing the same update three times, and holding delivery dates in his own notes where nobody else can see them.",
    },
    {
      name: "Anjali Deshpande",
      role: "Client (Kharadi 3BHK)",
      cares:
        "Knowing what is happening and what she owes without having to chase anyone for it.",
    },
  ],

  asIsProcess: [
    {
      step: "Sales closes, and operations opens a WhatsApp group per project",
      actor: "Head of Operations",
      tools: ["WhatsApp"],
      friction: null,
      confidence: "explicit",
      citations: [
        {
          sourceRef: "kickoff-call",
          quote:
            "a client signs, we take the advance, and then Priya's team opens a WhatsApp group",
        },
      ],
    },
    {
      step: "Project status is tracked in a master spreadsheet, one tab per project",
      actor: "Project Manager",
      tools: ["Excel"],
      friction:
        "Updated when the week allows rather than weekly; runs up to ten days behind.",
      confidence: "explicit",
      citations: [
        { sourceRef: "kickoff-call", quote: "It can be ten days stale." },
        {
          sourceRef: "whatsapp-site-group",
          quote: "the master sheet is 9 days out of date",
        },
      ],
    },
    {
      step: "Site supervisors post progress photos into the project group",
      actor: "Site supervisor",
      tools: ["WhatsApp"],
      friction:
        "The photos are the only visual record, and they are lost when the group goes dormant.",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "kickoff-call",
          quote: "Photos, mostly. Site progress photos, snags, material deliveries.",
        },
        { sourceRef: "handover-sop", quote: "No project archive exists." },
      ],
    },
    {
      step: "Client approvals are given in the group and treated as the record",
      actor: "Client and Project Manager",
      tools: ["WhatsApp"],
      friction:
        "Approvals have been lost when a client left the group or a supervisor changed handset.",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "kickoff-call",
          quote:
            "Client says \"yes go ahead with the walnut finish\" in the group, and that's our only record of it.",
        },
      ],
    },
    {
      step: "Materials are ordered in Zoho, chased over WhatsApp, and dates kept on a site whiteboard",
      actor: "Project Manager",
      tools: ["Zoho Books", "WhatsApp", "whiteboard"],
      friction:
        "No shared record of delivery dates, so a slip surfaces on the morning labour arrives.",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "followup-call",
          quote:
            "It's a purchase order in Zoho, then a WhatsApp message to the vendor, then hopefully the vendor sends a delivery date, then we write it on the site whiteboard.",
        },
        {
          sourceRef: "handover-sop",
          quote: "There is no shared record of expected delivery dates.",
        },
      ],
    },
    {
      step: "Clients who cannot get an answer call the founder directly",
      actor: "Client",
      tools: ["telephone"],
      friction:
        "Answering takes a full round trip down to site and back, roughly a day.",
      confidence: "explicit",
      citations: [
        { sourceRef: "kickoff-call", quote: "That round trip is a day sometimes." },
        {
          sourceRef: "whatsapp-site-group",
          quote: "I called Rohit sir yesterday because I couldn't reach Sameer",
        },
      ],
    },
  ],

  painPoints: [
    {
      title: "The tracker everyone is supposed to trust is eleven days stale",
      detail:
        "The master spreadsheet is the only place a project's real state is written down, and the copy on the shared drive was last touched by Priya eleven days ago. Half the stages on the open project have a planned date and nothing else against them, so the sheet cannot answer the question it exists to answer.",
      severity: 3,
      whoFeelsIt: "Head of Operations, founder, anyone asked for a date",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "master-tracker",
          quote: "last saved by Priya 11 days ago",
        },
        {
          sourceRef: "master-tracker",
          quote:
            "have a planned date and nothing else; Owner, Actual and Client told? are all empty",
        },
      ],
    },
    {
      title: "Late deliveries cost Nova money and are recorded nowhere",
      detail:
        "The vendor terms put the cost of idle labour on Nova rather than the supplier, and no penalty attaches to slippage. Because delivery dates are agreed over WhatsApp with nothing written down, there is no record to reconcile against when a delivery does not arrive.",
      severity: 3,
      whoFeelsIt: "Head of Operations, site team, founder",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "vendor-terms",
          quote:
            "Idle labour caused by a late delivery is borne by Nova Interiors, not the vendor.",
        },
        {
          sourceRef: "vendor-terms",
          quote:
            "Vendors confirm delivery dates by WhatsApp; no written confirmation is required.",
        },
      ],
    },
    {
      title: "The founder is the status switchboard",
      detail:
        "Clients call Rohit because he is the number they have, and every question becomes a chain down to site and back before anyone can answer it.",
      severity: 3,
      whoFeelsIt: "Founder, Head of Operations, client",
      confidence: "explicit",
      citations: [
        { sourceRef: "kickoff-call", quote: "Every day. Multiple times a day." },
        { sourceRef: "kickoff-call", quote: "That round trip is a day sometimes." },
      ],
    },
    {
      title: "The same update is written three times",
      detail:
        "A supervisor posts it in the group, operations copies it into the sheet, and the founder writes it again if a client asks him.",
      severity: 2,
      whoFeelsIt: "Project Manager, Head of Operations",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "kickoff-call",
          quote:
            "Right now Sameer writes an update in the group, then I copy it into the sheet, then if the client asks Rohit he writes it a third time.",
        },
      ],
    },
    {
      title: "Material slips are discovered too late to reschedule labour",
      detail:
        "Delivery dates exist only in a project manager's notes and on a whiteboard, so a slipped delivery is found when the carpenter arrives to no plywood. Nova has paid for idle days three times in one month.",
      severity: 3,
      whoFeelsIt: "Head of Operations, site supervisor",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "followup-call",
          quote:
            "when a delivery slips, nobody finds out until the carpenter turns up and there's no plywood",
        },
        {
          sourceRef: "whatsapp-site-group",
          quote:
            "This is the third time this month we've paid for an idle day because a delivery moved and nobody told us until the morning of.",
        },
      ],
    },
    {
      title: "Approval records are lost with the group",
      detail:
        "A client's written approval lives only in WhatsApp. Two disputes arose this year; one could not be evidenced and cost about eighty thousand rupees to redo.",
      severity: 3,
      whoFeelsIt: "Project Manager, the business",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "kickoff-call",
          quote: "That one was about eighty thousand. Redoing a wardrobe shutter set.",
        },
        {
          sourceRef: "handover-sop",
          quote:
            "Where a client has left the group or a supervisor has changed handsets, the approval record has in some cases been lost entirely.",
        },
      ],
    },
    {
      title: "Clients cannot see what they owe",
      detail:
        "Payment schedules sit in Zoho Books where the client has no visibility, so a large share of operations' inbound is simply asking what is due and when.",
      severity: 2,
      whoFeelsIt: "Client, Head of Operations",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "whatsapp-site-group",
          quote: "What is my next payment and when is it due?",
        },
      ],
    },
    {
      title: "The photographic record is unrecoverable after handover",
      detail:
        "Groups go dormant thirty days after handover and the photos scatter across individual handsets, so past clients cannot be sent images of their own completed project.",
      severity: 2,
      whoFeelsIt: "The business, past clients",
      confidence: "inferred",
      citations: [
        {
          sourceRef: "handover-sop",
          quote:
            "Requests from past clients for photographs of their completed project cannot currently be fulfilled.",
        },
      ],
    },
  ],

  requirements: [
    {
      text: "Expected delivery dates recorded against each material order, so a slipped date is visible rather than remembered",
      category: "functional",
      confidence: "inferred",
      citations: [
        {
          sourceRef: "vendor-terms",
          quote:
            "Delivery slippage is not tracked centrally and no penalty applies.",
        },
        {
          sourceRef: "master-tracker",
          quote: "Hardware delivery (Hettich) | Deshmukh Traders | 14-Mar | not delivered",
        },
      ],
    },
    {
      text: "A per-project client view showing current stage, what is next, and the expected completion date",
      category: "functional",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "kickoff-call",
          quote: "Where we are. What's done, what's next, when it finishes.",
        },
      ],
    },
    {
      text: "Site photos published to the client view, and retained after handover",
      category: "functional",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "kickoff-call",
          quote:
            "If they can see the photos themselves they'll stop calling me to ask how it looks.",
        },
      ],
    },
    {
      text: "Payment status shown read-only, sourced from Zoho Books; the portal must never generate anything resembling an invoice",
      category: "constraint",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "kickoff-call",
          quote:
            "Show. Definitely just show. We're not putting payments through something new, not in the first version.",
        },
        {
          sourceRef: "followup-call",
          quote:
            "I wouldn't want the portal generating anything that looks like an invoice.",
        },
      ],
    },
    {
      text: "One place to write a progress update that reaches the client, the internal record and the schedule at once",
      category: "functional",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "kickoff-call",
          quote: "Somewhere to put the weekly update once, and have it go everywhere.",
        },
      ],
    },
    {
      text: "Material orders tracked per project with expected and actual delivery dates, and a warning when a date slips",
      category: "functional",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "followup-call",
          quote: "We also need to know what's ordered against each project.",
        },
      ],
    },
    {
      text: "Client approvals captured in a durable, attributable record rather than a chat message",
      category: "functional",
      confidence: "inferred",
      citations: [
        {
          sourceRef: "kickoff-call",
          quote:
            "One we couldn't because the client had left the group and we'd lost the history on the old phone.",
        },
      ],
    },
    {
      text: "Usable on a phone, on poor site connectivity; photo upload must survive a dropped connection",
      category: "non_functional",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "followup-call",
          quote:
            "will this work on a phone? Because my supervisors do not own laptops",
        },
        {
          sourceRef: "followup-call",
          quote:
            "Uploading photos has to be fast and it has to survive a bad connection.",
        },
      ],
    },
    {
      text: "Client access by forwardable link, with no app installation",
      category: "constraint",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "followup-call",
          quote: "Most of our clients are not going to install an app",
        },
        {
          sourceRef: "followup-call",
          quote:
            "So whatever it is, it has to work if you forward it to somebody else.",
        },
      ],
    },
    {
      // Deliberately planted: this sentence appears in no source. It exists so
      // the verification layer can be seen failing a claim in the demo, and so
      // the test suite has a real unverifiable citation to assert on.
      text: "The portal must integrate directly with Tally for GST reconciliation",
      category: "integration",
      confidence: "inferred",
      citations: [
        {
          sourceRef: "followup-call",
          quote:
            "Our accountant uses Tally and the portal will need to reconcile GST against it every month.",
        },
      ],
    },
  ],

  outOfScope: [
    {
      text: "Taking payments through the portal",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "kickoff-call",
          quote: "We're not putting payments through something new",
        },
      ],
    },
    {
      text: "Replacing Zoho Books as the financial system of record",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "handover-sop",
          quote: "Zoho Books is the sole system of record for anything financial.",
        },
      ],
    },
    {
      text: "Any GST calculation or treatment, which stays with the accountant",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "followup-call",
          quote:
            "GST on interior work is complicated and our accountant is particular",
        },
      ],
    },
  ],

  assumptions: [
    {
      text: "Zoho Books exposes payment milestone status through an API that can be read on a schedule",
      why: "Payment visibility is a stated requirement, but no source describes how Zoho would be integrated or whether Nova's plan includes API access.",
    },
    {
      text: "WhatsApp groups continue alongside the portal for day-to-day chatter, at least initially",
      why: "Priya says the portal 'will not replace this group immediately', but no source states what the end state is.",
    },
    {
      text: "Around 20 live projects and 14 internal users is the sizing to design against",
      why: "Taken from the kickoff call figures; no source confirms expected growth, so capacity beyond this is unplanned.",
    },
    {
      text: "Clients will accept a link-based login without a password",
      why: "Derived from the constraint that access must be forwardable and app-free. Nobody has said what happens if a link is forwarded to someone who should not see the project.",
    },
  ],
};

export const RECORDED_CONFLICTS: Conflicts = {
  conflicts: [
    {
      topic: "budget",
      summary:
        "The first-phase budget was given as two lakh by the founder and as around five lakh by the head of operations two weeks later.",
      severity: 3,
      sides: [
        {
          stance: "Two lakh is the ceiling for phase one",
          speaker: "Rohit Menon",
          sourceRef: "kickoff-call",
          quote: "We can't go beyond two lakh for the first phase.",
        },
        {
          stance: "Around five lakh is acceptable if it saves coordinator time",
          speaker: "Priya Nair",
          sourceRef: "followup-call",
          quote:
            "Rohit mentioned around five lakh is fine if it saves the coordinator time.",
        },
      ],
      suggestedResolution:
        "Second-hand and unconfirmed: Priya is reporting what Rohit said to her, not what he said to us. Confirm the figure with Rohit directly before scoping to it — the difference decides whether materials tracking is in phase one.",
    },
    {
      topic: "authority",
      summary:
        "The founder requires every client-facing update to pass through him; the head of operations says progress updates must go out without waiting for him.",
      severity: 3,
      sides: [
        {
          stance: "All client-facing communication is approved by the founder",
          speaker: "Rohit Menon",
          sourceRef: "kickoff-call",
          quote:
            "Everything client-facing goes through me. That's non-negotiable for me.",
        },
        {
          stance: "Site-level progress updates are approved by operations",
          speaker: "Priya Nair",
          sourceRef: "followup-call",
          quote: "Site-level updates I approve, I don't want to wait for Rohit.",
        },
      ],
      suggestedResolution:
        "A genuine disagreement between two people, not a stale figure. Both are defensible: Rohit was burned by an optimistic date, Priya is protecting turnaround. The workable split is by content — dates, money and scope changes to Rohit; progress and photos to operations — but this is Nova's decision to make, not ours.",
    },
    {
      topic: "scope",
      summary:
        "Material tracking was absent from the first call and arrived in the second as something the first release is not useful without.",
      severity: 2,
      sides: [
        {
          stance: "Scope is the client-facing portal: status, photos, payments",
          speaker: "Rohit Menon",
          sourceRef: "kickoff-call",
          quote: "Where we are. What's done, what's next, when it finishes.",
        },
        {
          stance: "Materials must be in the first release",
          speaker: "Priya Nair",
          sourceRef: "followup-call",
          quote:
            "I don't think the first version is useful to us internally without it.",
        },
      ],
      suggestedResolution:
        "Later statement, and a new area rather than a contradiction — but it is a second module, not a feature. Cost it separately so Nova can see the difference and decide, which is what was promised on the call.",
    },
  ],
};

export const RECORDED_QUESTIONS: Questions = {
  questions: [
    {
      category: "budget",
      question:
        "Rohit, is the first-phase budget two lakh as you said on the 12th, or the five lakh Priya understood from you afterwards?",
      whyItMatters:
        "Materials tracking is a second module. At two lakh it is phase two; at five lakh it can be in the first release.",
      priority: 3,
    },
    {
      category: "auth_and_access",
      question:
        "Who approves a client-facing update — and does that differ for progress updates versus anything involving a date, a cost or a scope change?",
      whyItMatters:
        "This decides whether updates publish immediately or queue for approval, which is the difference between the portal being faster than WhatsApp or slower than it.",
      priority: 3,
    },
    {
      category: "data_migration",
      question:
        "For the roughly twenty projects that will be mid-flight on launch day, do you want their full history carried across, milestones only, or nothing?",
      whyItMatters:
        "Sameer wants milestones only and Priya thinks Rohit may want everything. Full history means a migration of eight months of spreadsheet tabs; milestones only is an afternoon.",
      priority: 3,
    },
    {
      category: "integrations",
      question:
        "Which Zoho Books plan are you on, and can we get API access to read payment milestone status?",
      whyItMatters:
        "Showing clients what they owe is a stated requirement, and it is only buildable if Zoho will give up that data. If not, someone has to key it in twice.",
      priority: 3,
    },
    {
      category: "auth_and_access",
      question:
        "If a client forwards their project link to a family member, is that fine, or should the link stop working for anyone but the named client?",
      whyItMatters:
        "You have asked for links that survive forwarding, which rules out per-person login. That is a deliberate privacy trade-off and should be your call, not ours.",
      priority: 2,
    },
    {
      category: "success_metrics",
      question:
        "Six months in, what number would tell you this worked — calls to Rohit per week, idle days per month, or something else?",
      whyItMatters:
        "You described the outcome in feel rather than figures. Agreeing one measurable number now is what makes phase two arguable on evidence.",
      priority: 2,
    },
    {
      category: "support",
      question:
        "Who inside Nova owns the portal day to day once it is live — adding projects, adding staff, removing people who leave?",
      whyItMatters:
        "No source mentions an internal owner. Without one, the portal drifts out of date the way the spreadsheet did, and for the same reason.",
      priority: 2,
    },
  ],
};

export const RECORDED_PROCESS: ProcessArtifact = {
  asIsMermaid: `flowchart TD
  A["Client wants a status update"] --> B["Calls the founder directly"]
  B --> C["Founder messages Head of Operations"]
  C --> D["Ops messages the Project Manager"]
  D --> E["PM checks with site supervisor"]
  E --> F["Answer travels back up the chain"]
  F --> G["Founder replies to the client"]
  G --> H["Roughly one day elapsed"]
  I["Supervisor posts update in WhatsApp"] --> J["PM copies it into the master sheet"]
  J --> K["Sheet reconciled when the week allows"]
  K --> L["Up to 10 days stale"]
  M["PM raises PO in Zoho"] --> N["Chases vendor on WhatsApp"]
  N --> O["Date written on site whiteboard"]
  O --> P["Slip found when labour arrives"]`,

  toBeMermaid: `flowchart TD
  A["Supervisor posts update and photos from site"] --> B["Update lands on the project record"]
  B --> C{"Does it involve a date, cost or scope change?"}
  C -->|"No"| D["Operations publishes to the client view"]
  C -->|"Yes"| E["Founder approves"]
  E --> D
  D --> F["Client sees status, photos and next milestone"]
  F --> G["Client stops calling to ask"]
  H["PM records the PO and expected delivery date"] --> I["Portal flags the date as it approaches"]
  I --> J{"Has the date slipped?"}
  J -->|"Yes"| K["Dependent labour rescheduled before the day"]
  J -->|"No"| L["Work proceeds as planned"]
  M["Client approves a change in the portal"] --> N["Approval stored against the project permanently"]`,

  changes: [
    {
      change:
        "Publish progress once, to a client-visible project record, instead of writing it into three places",
      removes:
        "The duplicate re-entry of every update — supervisor to group, ops to sheet, founder to client.",
      effort: "medium",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "kickoff-call",
          quote:
            "Right now Sameer writes an update in the group, then I copy it into the sheet, then if the client asks Rohit he writes it a third time.",
        },
      ],
    },
    {
      change:
        "Give the client a link showing stage, next milestone, photos and payment status",
      removes:
        "The day-long round trip that starts every time a client rings the founder for status.",
      effort: "medium",
      confidence: "explicit",
      citations: [
        { sourceRef: "kickoff-call", quote: "That round trip is a day sometimes." },
        {
          sourceRef: "whatsapp-site-group",
          quote: "Is there somewhere I can see the plan and the timeline?",
        },
      ],
    },
    {
      change:
        "Record expected delivery dates against the project and warn before the date rather than on it",
      removes:
        "Idle-day cost from deliveries that slip unnoticed until labour is already on site.",
      effort: "medium",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "whatsapp-site-group",
          quote:
            "This is the third time this month we've paid for an idle day because a delivery moved and nobody told us until the morning of.",
        },
      ],
    },
    {
      change:
        "Capture client approvals in the project record, attributable and permanent",
      removes:
        "The loss of an approval when a client leaves the group or a handset changes — which cost about eighty thousand rupees once this year.",
      effort: "low",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "kickoff-call",
          quote: "That one was about eighty thousand. Redoing a wardrobe shutter set.",
        },
      ],
    },
    {
      change:
        "Route approval by content — progress to operations, anything touching dates, money or scope to the founder",
      removes:
        "The choice between updates queueing behind one person and updates going out unchecked.",
      effort: "low",
      confidence: "inferred",
      citations: [
        {
          sourceRef: "followup-call",
          quote:
            "Dates and money, sure, send those to him. But progress updates? If those queue behind Rohit's inbox they'll go out three days late",
        },
      ],
    },
  ],
};

export const RECORDED_OUTLINE: Outline = {
  roles: [
    {
      name: "Founder",
      description: "Oversight across every project, and approval of anything sensitive.",
      permissions: [
        "View all projects",
        "Approve updates involving dates, cost or scope",
        "Add and remove staff",
      ],
    },
    {
      name: "Operations",
      description: "Runs the portfolio and publishes routine client updates.",
      permissions: [
        "Create projects",
        "Publish progress updates and photos",
        "Record material orders and delivery dates",
      ],
    },
    {
      name: "Project manager / supervisor",
      description: "Works from a phone on site.",
      permissions: [
        "Post progress and photos to a project",
        "Record actual delivery against an order",
      ],
    },
    {
      name: "Client",
      description: "Read-only, by forwardable link, no installation.",
      permissions: [
        "View their own project only",
        "View published photos",
        "View payment status",
        "Approve a change request",
      ],
    },
  ],

  modules: [
    {
      name: "Client project view",
      purpose: "The single link a client opens to see where their project stands.",
      screens: ["Project status", "Photo timeline", "Payments", "Approvals"],
    },
    {
      name: "Project workspace",
      purpose: "Where Nova's team runs a project and publishes from.",
      screens: ["Project list", "Project detail", "Post update", "Approval queue"],
    },
    {
      name: "Materials",
      purpose: "Orders against a project, with expected and actual dates.",
      screens: ["Orders by project", "Delivery calendar", "Slipped deliveries"],
    },
  ],

  features: [
    {
      title: "Client project status page on a forwardable link",
      module: "Client project view",
      moscow: "must",
      rationale:
        "This is the outcome the engagement exists for: the founder stops being the switchboard.",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "kickoff-call",
          quote: "Where we are. What's done, what's next, when it finishes.",
        },
      ],
    },
    {
      title: "Post a progress update with photos from a phone",
      module: "Project workspace",
      moscow: "must",
      rationale:
        "The single source of the update that everything else is derived from. Supervisors have no laptops.",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "followup-call",
          quote:
            "will this work on a phone? Because my supervisors do not own laptops",
        },
      ],
    },
    {
      title: "Photo timeline retained after handover",
      module: "Client project view",
      moscow: "must",
      rationale:
        "Photos are the reason clients ask for updates, and the reason past clients come back.",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "kickoff-call",
          quote:
            "If they can see the photos themselves they'll stop calling me to ask how it looks.",
        },
      ],
    },
    {
      title: "Approval routing by content type",
      module: "Project workspace",
      moscow: "must",
      rationale:
        "Unresolved between founder and operations, but the portal cannot ship without a rule. Build it configurable so their answer is a setting, not a rewrite.",
      confidence: "inferred",
      citations: [
        {
          sourceRef: "kickoff-call",
          quote: "Everything client-facing goes through me.",
        },
      ],
    },
    {
      title: "Read-only payment milestone status",
      module: "Client project view",
      moscow: "should",
      rationale:
        "Clearly wanted, but it depends on Zoho API access that nobody has confirmed. Should, until that question comes back answered.",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "whatsapp-site-group",
          quote: "What is my next payment and when is it due?",
        },
      ],
    },
    {
      title: "Material orders with expected delivery dates and slip warnings",
      module: "Materials",
      moscow: "should",
      rationale:
        "Operations says the first release is not useful internally without it, but it arrived after scoping and its budget is unresolved. Cost separately, as promised on the call.",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "followup-call",
          quote: "We also need to know what's ordered against each project.",
        },
      ],
    },
    {
      title: "Durable client approval record",
      module: "Client project view",
      moscow: "should",
      rationale:
        "Directly addresses a loss that has already cost money twice this year.",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "kickoff-call",
          quote: "That one was about eighty thousand. Redoing a wardrobe shutter set.",
        },
      ],
    },
    {
      title: "Weekly digest emailed to the client",
      module: "Client project view",
      moscow: "could",
      rationale:
        "Our suggestion, not Nova's — nobody asked for it. It would reduce inbound further, but it is unevidenced and belongs behind everything above.",
      confidence: "assumed",
      citations: [],
    },
    {
      title: "Offline-tolerant photo upload with retry",
      module: "Project workspace",
      moscow: "must",
      rationale:
        "Named as the sharpest constraint in two calls: if upload fails on bad signal, supervisors return to WhatsApp and the portal dies.",
      confidence: "explicit",
      citations: [
        {
          sourceRef: "followup-call",
          quote:
            "Uploading photos has to be fast and it has to survive a bad connection.",
        },
      ],
    },
  ],

  flowMermaid: `flowchart LR
  A["Supervisor posts update from site"] --> B["Update saved to project"]
  B --> C{"Needs founder approval?"}
  C -->|"No"| D["Published to client view"]
  C -->|"Yes"| E["Approval queue"]
  E --> D
  D --> F["Client opens their link"]
  F --> G["Sees stage, photos, payments"]
  G --> H["Approves a change if asked"]
  H --> I["Approval recorded against the project"]`,
};

export const RECORDED_PROTOTYPE: Prototype = {
  screens: [
    { name: "Client project view", purpose: "What Anjali sees when she opens her link." },
    { name: "Project list", purpose: "Nova's live projects at a glance." },
    { name: "Post update", purpose: "How a supervisor publishes from a phone." },
    { name: "Approval queue", purpose: "What waits on Rohit, and what does not." },
  ],
  html: PROTOTYPE_HTML(),
};

function PROTOTYPE_HTML(): string {
  return String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nova Interiors - portal prototype</title>
<style>
  :root{--ground:#f5f6f3;--surface:#fff;--line:#d8dcd5;--soft:#eceee9;--ink:#171c1a;--muted:#626d67;--accent:#14655a;--accent-soft:#e0eee9;--flag:#a02e22;--flag-soft:#f6e4e1;--gap:#8a6410;--gap-soft:#f5ebd6}
  *{box-sizing:border-box}
  body{margin:0;background:var(--ground);color:var(--ink);font:15px/1.55 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif}
  header{background:var(--surface);border-bottom:1px solid var(--line);padding:10px 16px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  header b{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-right:4px}
  nav{display:flex;gap:6px;flex-wrap:wrap}
  nav button{font:inherit;font-size:13px;border:1px solid var(--line);background:var(--surface);color:var(--ink);padding:5px 10px;border-radius:4px;cursor:pointer}
  nav button[aria-current="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
  .who{margin-left:auto;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted)}
  .who select{font:inherit;font-size:12px;padding:3px 6px;border:1px solid var(--line);border-radius:4px;background:var(--surface);color:var(--ink)}
  main{max-width:780px;margin:0 auto;padding:20px 16px 64px}
  h1{font-size:21px;margin:0 0 4px}
  h2{font-size:14px;margin:22px 0 8px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
  p.sub{color:var(--muted);margin:0 0 16px;font-size:14px}
  .card{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:14px 16px;margin-bottom:12px}
  .row{display:flex;justify-content:space-between;gap:12px;align-items:baseline;flex-wrap:wrap}
  .pill{font-size:11px;text-transform:uppercase;letter-spacing:.06em;padding:2px 8px;border-radius:99px;border:1px solid var(--accent);color:var(--accent);background:var(--accent-soft);white-space:nowrap}
  .pill.warn{border-color:var(--gap);color:var(--gap);background:var(--gap-soft)}
  .pill.late{border-color:var(--flag);color:var(--flag);background:var(--flag-soft)}
  ol.steps{list-style:none;padding:0;margin:0}
  ol.steps li{display:flex;gap:10px;padding:9px 0;border-bottom:1px solid var(--soft)}
  ol.steps li:last-child{border-bottom:0}
  .dot{width:9px;height:9px;border-radius:50%;background:var(--line);margin-top:6px;flex:none}
  .done .dot{background:var(--accent)}
  .now .dot{background:var(--gap);box-shadow:0 0 0 3px var(--gap-soft)}
  .muted{color:var(--muted);font-size:13px}
  .feed{list-style:none;padding:0;margin:0}
  .feed li{border-bottom:1px solid var(--soft);padding:10px 0}
  .feed li:last-child{border-bottom:0}
  label{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:12px 0 4px}
  input,textarea,select{width:100%;font:inherit;padding:8px;border:1px solid var(--line);border-radius:4px;background:var(--surface);color:var(--ink)}
  .btn{margin-top:14px;background:var(--accent);color:#fff;border:0;border-radius:4px;padding:9px 15px;font:inherit;cursor:pointer}
  .btn.ghost{background:transparent;color:var(--muted);border:1px solid var(--line)}
  .btn:disabled{opacity:.5;cursor:default}
  .note{border-left:3px solid var(--accent);padding-left:12px;color:var(--muted);font-size:13px;margin:14px 0}
  .empty{color:var(--muted);font-size:14px;padding:14px 0}
  section{display:none}section.active{display:block}
  .toast{position:fixed;left:50%;transform:translateX(-50%);bottom:18px;background:var(--ink);color:#fff;padding:9px 15px;border-radius:5px;font-size:13px;opacity:0;transition:opacity .2s;pointer-events:none}
  .toast.show{opacity:1}
</style>
</head>
<body>
<header>
  <b>Nova Interiors</b>
  <nav>
    <button data-go="client" aria-current="true">Client view</button>
    <button data-go="post">Post update</button>
    <button data-go="approve">Approvals <span id="queueCount"></span></button>
    <button data-go="list">Projects</button>
  </nav>
  <span class="who">
    You are
    <select id="role">
      <option value="supervisor">Imran (site supervisor)</option>
      <option value="ops">Priya (operations)</option>
      <option value="founder">Rohit (founder)</option>
      <option value="client">Anjali (client)</option>
    </select>
  </span>
</header>
<main>

<section id="client" class="active">
  <h1>Kharadi 3BHK - Anjali Deshpande</h1>
  <p class="sub">What the client sees. Nothing appears here until it is published.</p>
  <div class="card">
    <div class="row"><strong id="stage">Currently: painting</strong><span class="pill" id="stagePill">On schedule</span></div>
    <p class="muted" style="margin:6px 0 0" id="nextUp"></p>
  </div>
  <h2>Progress</h2>
  <div class="card"><ol class="steps" id="timeline"></ol></div>
  <h2>Published updates</h2>
  <div class="card"><ul class="feed" id="clientFeed"></ul></div>
</section>

<section id="post">
  <h1>Post an update</h1>
  <p class="sub">Written once. It reaches the client view, the project record and the schedule.</p>
  <div class="card">
    <label for="pProject">Project</label>
    <select id="pProject"><option>Kharadi 3BHK - Deshpande</option><option>Baner 2BHK - Iyer</option></select>
    <label for="pText">What happened</label>
    <textarea id="pText" rows="3" placeholder="Putty second coat done. Wardrobe carcass arriving Thursday."></textarea>
    <label for="pKind">Does this involve a date, a cost or a scope change?</label>
    <select id="pKind">
      <option value="progress">No - progress only</option>
      <option value="sensitive">Yes - date, cost or scope</option>
    </select>
    <p class="note" id="routeHint"></p>
    <button class="btn" id="publish">Publish update</button>
    <button class="btn ghost" id="reset" style="margin-left:8px">Reset demo</button>
  </div>
</section>

<section id="approve">
  <h1>Waiting on you</h1>
  <p class="sub">Only dates, money and scope reach this queue. Progress updates publish straight away.</p>
  <div id="queue"></div>
  <p class="note" id="approveCount"></p>
</section>

<section id="list">
  <h1>Live projects</h1>
  <p class="sub" id="listSub"></p>
  <div id="projects"></div>
</section>

</main>
<div class="toast" id="toast"></div>
<script>
var KEY = "nova-portal-prototype";

var seed = {
  stage: "Painting",
  next: "Wardrobe installation, expected 8 April. Handover expected 24 April.",
  timeline: [
    {label:"Site measurement and drawings signed off", when:"10 March", state:"done"},
    {label:"Electrical conduiting", when:"13 March", state:"done"},
    {label:"False ceiling", when:"27 March", state:"done"},
    {label:"Painting - putty first coat done", when:"since 30 March", state:"now"},
    {label:"Wardrobe installation", when:"expected 8 April", state:""},
    {label:"Snagging and handover", when:"expected 24 April", state:""}
  ],
  published: [
    {text:"Ceiling complete. Painter coming Monday for putty.", by:"Imran Shaikh", when:"27 Mar"}
  ],
  queue: [
    {text:"Handover moved to 14 May - Hettich hardware slipped 4 days.", by:"Sameer Kulkarni", project:"Baner 2BHK - Iyer"}
  ],
  projects: [
    {name:"Kharadi 3BHK - Deshpande", status:"On schedule", cls:"", note:"Painting - Sameer Kulkarni - handover 24 Apr"},
    {name:"Baner 2BHK - Iyer", status:"Delivery slipped", cls:"late", note:"Hettich hardware 4 days late - carpenter due Monday"},
    {name:"Wakad villa - Sethi", status:"Update overdue", cls:"warn", note:"No client update posted in 9 days"}
  ],
  publishedCount: 14
};

var state = load();

function load(){
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return JSON.parse(JSON.stringify(seed));
}
function save(){
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}
function el(id){ return document.getElementById(id); }
function esc(t){
  return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function toast(msg){
  var t = el("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(function(){ t.classList.remove("show"); }, 2400);
}
function today(){
  var d = new Date();
  var m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return d.getDate() + " " + m[d.getMonth()];
}

function render(){
  el("stage").textContent = "Currently: " + state.stage.toLowerCase();
  el("nextUp").textContent = "Next: " + state.next;

  el("timeline").innerHTML = state.timeline.map(function(s){
    return '<li class="' + s.state + '"><span class="dot"></span><span>' +
      esc(s.label) + '<br><span class="muted">' + esc(s.when) + '</span></span></li>';
  }).join("");

  var feed = el("clientFeed");
  if (!state.published.length) {
    feed.innerHTML = '<li class="empty">Nothing published yet.</li>';
  } else {
    feed.innerHTML = state.published.slice().reverse().map(function(u){
      return "<li><strong>" + esc(u.text) + "</strong><br><span class='muted'>" +
        esc(u.by) + " - " + esc(u.when) + "</span></li>";
    }).join("");
  }

  var q = el("queue");
  if (!state.queue.length) {
    q.innerHTML = '<div class="card"><p class="empty" style="padding:0">Nothing waiting. Progress updates published without you.</p></div>';
  } else {
    q.innerHTML = state.queue.map(function(item, i){
      return '<div class="card"><div class="row"><strong>' + esc(item.text) +
        '</strong><span class="pill warn">Needs approval</span></div>' +
        '<p class="muted" style="margin:6px 0 8px">' + esc(item.by) + " - " + esc(item.project) + '</p>' +
        '<button class="btn" data-approve="' + i + '">Approve and publish</button> ' +
        '<button class="btn ghost" data-reject="' + i + '">Send back</button></div>';
    }).join("");
  }
  el("queueCount").textContent = state.queue.length ? "(" + state.queue.length + ")" : "";
  el("approveCount").textContent = state.publishedCount +
    " progress updates published today without needing you.";

  el("projects").innerHTML = state.projects.map(function(p){
    return '<div class="card"><div class="row"><strong>' + esc(p.name) +
      '</strong><span class="pill ' + p.cls + '">' + esc(p.status) + '</span></div>' +
      '<p class="muted" style="margin:6px 0 0">' + esc(p.note) + '</p></div>';
  }).join("");
  el("listSub").textContent = state.projects.length + " active";

  hint();
}

function hint(){
  var role = el("role").value;
  var kind = el("pKind").value;
  var h = el("routeHint");
  if (kind === "sensitive") {
    h.textContent = "This mentions a date, cost or scope change, so it goes to Rohit for approval before the client sees it.";
  } else if (role === "founder" || role === "ops") {
    h.textContent = "Progress update from operations - publishes to the client straight away.";
  } else {
    h.textContent = "Progress update - publishes to the client straight away, no approval needed.";
  }
}

function publish(){
  var text = el("pText").value.trim();
  if (!text) { toast("Write something first."); return; }

  var role = el("role").value;
  var names = { supervisor:"Imran Shaikh", ops:"Priya Nair", founder:"Rohit Menon", client:"Anjali Deshpande" };
  var by = names[role] || "Imran Shaikh";

  if (el("pKind").value === "sensitive") {
    state.queue.push({ text: text, by: by, project: el("pProject").value });
    save(); render();
    show("approve");
    toast("Sent to Rohit for approval - the client cannot see it yet.");
  } else {
    state.published.push({ text: text, by: by, when: today() });
    state.publishedCount += 1;
    save(); render();
    show("client");
    toast("Published - it is on the client's view now.");
  }
  el("pText").value = "";
}

function show(id){
  var buttons = document.querySelectorAll("nav button");
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].setAttribute("aria-current", buttons[i].dataset.go === id ? "true" : "false");
  }
  var sections = document.querySelectorAll("section");
  for (var j = 0; j < sections.length; j++) sections[j].classList.remove("active");
  el(id).classList.add("active");
  window.scrollTo(0, 0);
}

document.addEventListener("click", function(e){
  var t = e.target;
  if (t.dataset && t.dataset.go) { show(t.dataset.go); return; }

  if (t.dataset && t.dataset.approve !== undefined) {
    var item = state.queue.splice(Number(t.dataset.approve), 1)[0];
    state.published.push({ text: item.text, by: item.by, when: today() });
    save(); render(); show("client");
    toast("Approved - now visible to the client.");
    return;
  }
  if (t.dataset && t.dataset.reject !== undefined) {
    state.queue.splice(Number(t.dataset.reject), 1);
    save(); render();
    toast("Sent back. Nothing reached the client.");
    return;
  }
  if (t.id === "publish") { publish(); return; }
  if (t.id === "reset") {
    state = JSON.parse(JSON.stringify(seed));
    save(); render(); show("client");
    toast("Demo reset.");
  }
});

el("role").addEventListener("change", hint);
el("pKind").addEventListener("change", hint);

render();
</script>
</body>
</html>`;
}
