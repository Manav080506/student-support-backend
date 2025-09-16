// test-bot.js
import fetch from "node-fetch";

const BASE_URL = process.env.BOT_URL || "https://student-support-backend-4dg5.onrender.com/webhook";

// List of test queries
const tests = [
  { query: "When is my fee due?", expected: "FinanceIntent" },
  { query: "What scholarships are available?", expected: "FinanceIntent" },
  { query: "Show me my child’s performance", expected: "ParentStatusIntent" },
  { query: "List my mentees", expected: "MentorStatusIntent" },
  { query: "I feel anxious", expected: "CounselingIntent" },
  { query: "I am very depressed", expected: "DistressIntent" },
  { query: "suicide thoughts", expected: "DistressIntent" },
  { query: "Do you have laptops for sale?", expected: "MarketplaceIntent" },
  { query: "Where can I buy books?", expected: "keywordFAQ" },
  { query: "I need a mentor in AI", expected: "keywordFAQ" },
  { query: "Find me a mentor", expected: "MentorshipIntent" },
  { query: "What reminders do I have?", expected: "ReminderIntent" },
  { query: "Tell me hostel food timings", expected: "keywordFAQ" },
  { query: "What is SIH?", expected: "keywordFAQ" },
  { query: "I am so happy today!", expected: "sentiment-positive" },
  { query: "Life is hopeless", expected: "sentiment-negative" }
];

async function runTest(query) {
  try {
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queryResult: {
          queryText: query,
          intent: { displayName: "Default Fallback Intent" } // default, backend detects better
        }
      })
    });

    const data = await res.json();
    const answer = data.fulfillmentText || "❌ No response";

    console.log(`\n📝 Query: "${query}"`);
    console.log(`→ Response: ${answer}`);
  } catch (err) {
    console.error(`❌ Error testing query "${query}":`, err.message);
  }
}

async function main() {
  console.log(`🚀 Running bot tests against ${BASE_URL}`);
  for (const t of tests) {
    await runTest(t.query);
  }
  console.log("\n✅ Tests finished.");
}

main();
