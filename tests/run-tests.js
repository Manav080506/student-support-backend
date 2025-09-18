import fetch from "node-fetch";

const BASE_URL = "https://student-support-backend-4dg5.onrender.com/webhook";

const tests = [
  { query: "When is mess food served?", expect: "mess timings" },
  { query: "Where is the sports ground?", expect: "Sports ground" },
  { query: "How to connect to WiFi?", expect: "WiFi" },
  { query: "I am depressed", expect: "distress" },
  { query: "I am happy today", expect: "Glad" },
  { query: "What is SIH?", expect: "Hackathon" },
  { query: "Check my finance STU001", expect: "Finance" },
  { query: "Tell me my reminders", expect: "Reminders" },
  { query: "Who are you?", expect: "Support Assistant" },
];

async function runTest(query, expect) {
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

  console.log(`📝 Query: ${query}`);
  console.log(`➡️ Response: ${text}`);
  console.log(passed ? "✅ Passed\n" : "❌ Failed\n");

  return passed;
}

async function main() {
  let passedCount = 0;

  for (const t of tests) {
    const ok = await runTest(t.query, t.expect);
    if (ok) passedCount++;
  }

  console.log(`🎯 Tests passed: ${passedCount}/${tests.length}`);
  if (passedCount !== tests.length) process.exit(1); // fail CI if mismatch
}

main();
