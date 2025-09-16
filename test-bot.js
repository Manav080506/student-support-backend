// test-bot.js
import fetch from "node-fetch";

// Your backend URL (set in Render or .env for local)
const BASE_URL = process.env.BACKEND_URL || "https://student-support-backend-4dg5.onrender.com";

// Define test queries
const TEST_QUERIES = [
  // Finance
  { text: "What is my fee due?", intent: "FinanceIntent", params: { studentId: "STU001" } },
  { text: "Do I have any dues?", intent: "FinanceIntent", params: { studentId: "STU002" } },

  // Parent
  { text: "Parent dashboard", intent: "ParentStatusIntent", params: { parentId: "PARENT001" } },

  // Mentor
  { text: "Show my mentees", intent: "MentorStatusIntent", params: { mentorId: "MENTOR001" } },

  // Counseling & Distress
  { text: "I feel anxious", intent: "CounselingIntent" },
  { text: "I am very depressed", intent: "DistressIntent" },
  { text: "I want to end my life", intent: "DistressIntent" },

  // Marketplace & Mentorship
  { text: "Show me marketplace", intent: "MarketplaceIntent" },
  { text: "Is there a commerce mentor?", intent: "MentorshipIntent" },

  // Reminders
  { text: "Any reminders for me?", intent: "ReminderIntent", params: { studentId: "STU001" } },

  // Keyword FAQs
  { text: "When are hostel mess timings?", intent: "Default Fallback Intent" },
  { text: "What is SIH?", intent: "Default Fallback Intent" },
  { text: "Library fine?", intent: "Default Fallback Intent" },
  { text: "When is the fee deadline?", intent: "Default Fallback Intent" },

  // Sentiment fallback
  { text: "I feel lonely", intent: "Default Fallback Intent" },
  { text: "Give me study tips!", intent: "Default Fallback Intent" },

  // Random fallback
  { text: "Blah blah random words", intent: "Default Fallback Intent" },
];

// Run tests
async function runTests() {
  console.log(`🚀 Running ${TEST_QUERIES.length} chatbot tests...\n`);

  for (const q of TEST_QUERIES) {
    const payload = {
      queryResult: {
        queryText: q.text,
        intent: { displayName: q.intent },
        parameters: q.params || {},
      },
    };

    try {
      const res = await fetch(`${BASE_URL}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      console.log(`📝 Query: "${q.text}"`);
      console.log(`→ Intent: ${q.intent}`);
      console.log(`→ Response: ${data.fulfillmentText}`);
      console.log("-------------------------------------------------\n");
    } catch (err) {
      console.error(`❌ Failed for query "${q.text}":`, err.message);
    }
  }
}

runTests();
