// .github/tests/run-tests.js
// ESM file (works if your project uses "type":"module")
import fs from "fs";

const WEBHOOK_URL = process.env.WEBHOOK_URL || "http://localhost:5000/webhook";
const EXIT_ON_FAIL = process.argv.includes("--ci") || process.env.EXIT_ON_FAIL === "true";

console.log("▶︎ Webhook test runner");
console.log("  WEBHOOK_URL:", WEBHOOK_URL);
console.log("  EXIT_ON_FAIL:", EXIT_ON_FAIL ? "yes" : "no");

const tests = [
  // Keyword FAQ tests (add / tweak queries & expected phrases as needed)
  { name: "Hostel mess", query: "When is mess food served?", expectsAny: ["mess", "hostel", "🍽️"] },
  { name: "Sports ground", query: "Where is cricket ground?", expectsAny: ["sport", "cricket", "🏏"] },
  { name: "WiFi", query: "How to connect wifi?", expectsAny: ["wifi", "📶", "login"] },
  { name: "Fees", query: "How much do I need to pay?", expectsAny: ["fees", "pending", "₹", "fee"] },
  { name: "Dues", query: "Any dues pending?", expectsAny: ["dues", "pending"] },
  { name: "Scholarship", query: "Are there any scholarships available?", expectsAny: ["scholarship", "🎓"] },
  { name: "Deadline", query: "What is the next deadline?", expectsAny: ["deadline", "last date", "due"] },
  { name: "Books", query: "Where can I get second-hand books?", expectsAny: ["books", "marketplace", "textbook"] },
  { name: "Laptop", query: "I need a laptop", expectsAny: ["laptop", "computer"] },
  { name: "AI mentor", query: "Is there a mentor for AI?", expectsAny: ["mentor", "artificial", "ai"] },
  { name: "Commerce mentor", query: "Mentor for commerce", expectsAny: ["mentor", "commerce"] },
  { name: "Counseling", query: "I want counseling", expectsAny: ["counsel", "counseling", "🧠"] },
  { name: "Help catchall", query: "I need help", expectsAny: ["guide", "help", "finance", "mentorship"] },
  { name: "SIH", query: "what is sih", expectsAny: ["sih", "smart india hackathon", "hackathon"] },
  { name: "Fee deadline alt", query: "When is the fee deadline?", expectsAny: ["deadline", "10th", "fee"] },
  { name: "Exam schedule", query: "exam schedule", expectsAny: ["exam", "schedule"] },
  { name: "Revaluation", query: "revaluation process", expectsAny: ["revaluation", "recheck"] },
  { name: "Passing marks", query: "what are passing marks", expectsAny: ["passing", "40%"] },
  { name: "Clinic", query: "where is the clinic", expectsAny: ["clinic", "health", "doctor"] },
  { name: "Mental health", query: "I am suicidal", expectsAny: ["help", "helpline", "1800", "mental"] },
  { name: "Events", query: "college fest", expectsAny: ["event", "fest", "cultural", "techfest"] },
  { name: "Sports club", query: "join sports club", expectsAny: ["sports", "club", "register"] },
  { name: "Bonafide", query: "how to apply bonafide certificate", expectsAny: ["bonafide", "certificate"] },
  { name: "ID card", query: "lost id card", expectsAny: ["id", "replacement", "FIR"] },
  { name: "Admin timing", query: "admin office timing", expectsAny: ["admin", "timing", "office"] },
  { name: "Library issue", query: "library issue books", expectsAny: ["library", "issue", "borrow"] },
  { name: "Library fine", query: "library fine", expectsAny: ["fine", "late", "₹"] },
  { name: "Bus facility", query: "transport bus facility", expectsAny: ["bus", "transport", "pass"] },
  { name: "Contact admin", query: "contact admin office", expectsAny: ["contact", "admin", "0123", "phone"] },

  // Intent tests
  { name: "FinanceIntent (valid)", query: { queryText: "Check finance for STU001", intent: "FinanceIntent", params: { studentId: "STU001" } }, expectsAny: ["finance", "pending", "₹", "Finance Summary"] },
  { name: "FinanceIntent (missing id)", query: { queryText: "Show my finance details", intent: "FinanceIntent", params: {} }, expectsAny: ["Please provide your Student ID", "Please provide"] },
  { name: "ParentStatusIntent", query: { queryText: "Parent dashboard", intent: "ParentStatusIntent", params: { parentId: "PARENT001" } }, expectsAny: ["Parent Dashboard", "Attendance", "Marks"] },
  { name: "MentorStatusIntent", query: { queryText: "Mentor dashboard", intent: "MentorStatusIntent", params: { mentorId: "MENTOR001" } }, expectsAny: ["Mentor Dashboard", "Mentees"] },
  { name: "CounselingIntent", query: { queryText: "I need counseling", intent: "CounselingIntent", params: {} }, expectsAny: ["Counseling", "counselor", "🧠"] },
  { name: "DistressIntent", query: { queryText: "I feel very depressed", intent: "DistressIntent", params: {} }, expectsAny: ["distress", "helpline", "1800", "🚨"] },

  // Sentiment checks
  { name: "Sentiment positive", query: "I am very happy today", expectsAny: ["glad", "progress", "happy", "😊", "Keep going"] },
  { name: "Sentiment negative", query: "I feel hopeless", expectsAny: ["connect you to a counselor", "counselor", "helpline", "😔"] },

  // fallback test
  { name: "Fallback unknown", query: "blargh zzz", expectsAny: ["couldn", "couldn’t find", "I can guide you", "sorry"] },
];

// helper to build request body based on test entry
function buildBody(test) {
  if (typeof test.query === "string") {
    return { queryResult: { queryText: test.query, intent: { displayName: "Default Fallback Intent" } } };
  }
  // object with optional params
  const b = {
    queryResult: {
      queryText: test.query.queryText || "",
      intent: { displayName: test.query.intent || "Default Fallback Intent" },
      parameters: test.query.params || {},
    },
  };
  return b;
}

async function doPost(body) {
  // use global fetch
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return { _raw: text };
  }
}

function extractFulfillmentText(resp) {
  if (!resp) return "";
  if (typeof resp === "string") return resp;
  if (resp.fulfillmentText) return resp.fulfillmentText;
  if (resp.fulfillmentMessages && Array.isArray(resp.fulfillmentMessages)) {
    try {
      const txts = resp.fulfillmentMessages.map((m) => m?.text?.text?.[0]).filter(Boolean);
      return txts.join("\n");
    } catch (e) {
      return JSON.stringify(resp);
    }
  }
  if (resp._raw) return resp._raw;
  return JSON.stringify(resp);
}

(async function main() {
  const results = [];
  for (const t of tests) {
    const body = buildBody(t);
    let resp;
    try {
      resp = await doPost(body);
    } catch (err) {
      console.error(`[ERROR] ${t.name} — network error:`, err.message || err);
      results.push({ name: t.name, ok: false, reason: `network error: ${err.message}` });
      continue;
    }

    const text = extractFulfillmentText(resp).toLowerCase();
    const expected = (t.expectsAny || []).map((s) => String(s).toLowerCase());
    const passed = expected.some((e) => text.includes(e));
    results.push({ name: t.name, ok: passed, response: extractFulfillmentText(resp), expected });
    console.log(`${passed ? "✅ PASS" : "❌ FAIL"} — ${t.name}`);
    if (!passed) {
      console.log("  expected any of:", expected);
      console.log("  got response:", extractFulfillmentText(resp));
    }
  }

  // summary
  const failed = results.filter((r) => !r.ok);
  console.log("\n------ SUMMARY ------");
  console.log(`Total: ${results.length}, Passed: ${results.length - failed.length}, Failed: ${failed.length}`);
  if (failed.length) {
    console.log("\nFailed tests:");
    failed.forEach((f) => {
      console.log(` - ${f.name}`);
      console.log(`   expected any: ${JSON.stringify(f.expected)}`);
      console.log(`   response: ${f.response}\n`);
    });
  } else {
    console.log("All tests passed ✅");
  }

  // write a simple JSON report for CI artifacts
  try {
    fs.mkdirSync(".github/test-results", { recursive: true });
    fs.writeFileSync(".github/test-results/report.json", JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2));
    console.log("Wrote .github/test-results/report.json");
  } catch (e) {
    // ignore
  }

  if (EXIT_ON_FAIL && failed.length) {
    console.error("Exiting with code 1 because EXIT_ON_FAIL is true and some tests failed.");
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
