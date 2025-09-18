import fetch from "node-fetch";

const BASE_URL = "https://student-support-backend-4dg5.onrender.com/webhook";

// ========== Fallback/Keyword FAQ Tests ==========
const faqTests = [
  { query: "When is mess food served?", expect: "🍽️" },
  { query: "Sports ground timings?", expect: "🏏" },
  { query: "How to connect to WiFi?", expect: "📶" },
  { query: "When is fee due?", expect: "fee" },
  { query: "Do I have dues?", expect: "⚠️" },
  { query: "Scholarship portal date", expect: "🎓" },
  { query: "What is the deadline?", expect: "⏰" },
  { query: "Where can I buy books?", expect: "📚" },
  { query: "Need a laptop", expect: "💻" },
  { query: "Is there an AI mentor?", expect: "🤖" },
  { query: "Commerce mentor", expect: "📊" },
  { query: "I need counseling", expect: "🧠" },
  { query: "I feel depressed", expect: "🚨" },
  { query: "help me", expect: "🙋" },
  { query: "What is SIH?", expect: "Hackathon" },
  { query: "When are exams?", expect: "Exam" },
  { query: "Revaluation process", expect: "📝" },
  { query: "Passing marks?", expect: "40%" },
  { query: "Where is campus clinic?", expect: "clinic" },
  { query: "Mental health helpline", expect: "📞" },
  { query: "Upcoming events?", expect: "🎉" },
  { query: "Join football club", expect: "⚽" },
  { query: "Bonafide certificate", expect: "📄" },
  { query: "Lost ID card", expect: "💳" },
  { query: "Admin office timing?", expect: "⏰" },
  { query: "Contact admin", expect: "📞" },
  { query: "How many books in library?", expect: "📖" },
  { query: "Library fine?", expect: "💸" },
  { query: "Is bus available?", expect: "🚌" },
  { query: "Bus pass", expect: "🎟️" },
];

// ========== Direct Intent Tests ==========
const intentTests = [
  {
    intent: "FinanceIntent",
    body: { queryText: "Check my fees", parameters: { studentId: "STU001" } },
    expect: "Finance Summary",
  },
  {
    intent: "CounselingIntent",
    body: { queryText: "I need counseling" },
    expect: "Counseling",
  },
  {
    intent: "DistressIntent",
    body: { queryText: "I feel depressed" },
    expect: "Distress",
  },
  {
    intent: "MarketplaceIntent",
    body: { queryText: "What is in marketplace" },
    expect: "Marketplace",
  },
  {
    intent: "MentorshipIntent",
    body: { queryText: "Tell me mentors" },
    expect: "Mentorship",
  },
  {
    intent: "ParentStatusIntent",
    body: { queryText: "Parent dashboard", parameters: { parentId: "PARENT001" } },
    expect: "Parent Dashboard",
  },
  {
    intent: "MentorStatusIntent",
    body: { queryText: "Mentor dashboard", parameters: { mentorId: "MENTOR001" } },
    expect: "Mentor Dashboard",
  },
  {
    intent: "ReminderIntent",
    body: { queryText: "My reminders" },
    expect: "Reminders",
  },
];

// ========== Test Runners ==========
async function runFaqTest(query, expect) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      queryResult: {
        queryText: query,
        intent: { displayName: "Default Fallback Intent" },
      },
    }),
  });

  const data = await res.json();
  const text = data.fulfillmentText || "";
  const passed = text.toLowerCase().includes(expect.toLowerCase());

  console.log(`📝 Fallback Query: ${query}`);
  console.log(`➡️ Response: ${text}`);
  console.log(passed ? "✅ Passed\n" : `❌ Failed (expected: ${expect})\n`);
  return passed;
}

async function runIntentTest(intent, body, expect) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      queryResult: {
        queryText: body.queryText,
        intent: { displayName: intent },
        parameters: body.parameters || {},
      },
    }),
  });

  const data = await res.json();
  const text = data.fulfillmentText || "";
  const passed = text.toLowerCase().includes(expect.toLowerCase());

  console.log(`📝 Intent: ${intent} | Query: ${body.queryText}`);
  console.log(`➡️ Response: ${text}`);
  console.log(passed ? "✅ Passed\n" : `❌ Failed (expected: ${expect})\n`);
  return passed;
}

// ========== Main ==========
async function main() {
  let passed = 0;

  for (const t of faqTests) {
    if (await runFaqTest(t.query, t.expect)) passed++;
  }

  for (const t of intentTests) {
    if (await runIntentTest(t.intent, t.body, t.expect)) passed++;
  }

  const total = faqTests.length + intentTests.length;
  console.log(`🎯 Tests passed: ${passed}/${total}`);
  if (passed !== total) process.exit(1);
}

main();
