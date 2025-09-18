import fetch from "node-fetch";

const WEBHOOK_URL = process.env.WEBHOOK_URL || "http://localhost:5000/webhook";

// Helper to run test and check if response contains keyword
async function runTest(name, payload, expected) {
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    const text = data.fulfillmentText || JSON.stringify(data);
    const success = text.toLowerCase().includes(expected.toLowerCase());

    console.log(success ? `✅ ${name}` : `❌ ${name}`);
    if (!success) {
      console.log("   Expected:", expected);
      console.log("   Got:", text);
      process.exitCode = 1; // mark workflow as failed
    }
  } catch (err) {
    console.error(`❌ ${name} - Error:`, err.message);
    process.exitCode = 1;
  }
}

async function main() {
  console.log("🚀 Starting backend tests...");

  // ---------- Keyword FAQs ----------
  await runTest("Mess Food", { queryResult: { queryText: "When is mess food served?", intent: { displayName: "Default Fallback Intent" } } }, "Hostel mess");
  await runTest("Sports Ground", { queryResult: { queryText: "Where is cricket ground?", intent: { displayName: "Default Fallback Intent" } } }, "Sports ground");
  await runTest("WiFi", { queryResult: { queryText: "How to connect wifi?", intent: { displayName: "Default Fallback Intent" } } }, "WiFi login");
  await runTest("Fees", { queryResult: { queryText: "Check my fees", intent: { displayName: "Default Fallback Intent" } } }, "pending fees");
  await runTest("Dues", { queryResult: { queryText: "Do I have any dues?", intent: { displayName: "Default Fallback Intent" } } }, "dues");
  await runTest("Scholarship", { queryResult: { queryText: "Are scholarships open?", intent: { displayName: "Default Fallback Intent" } } }, "scholarship");
  await runTest("Deadline", { queryResult: { queryText: "What is the last date?", intent: { displayName: "Default Fallback Intent" } } }, "deadline");
  await runTest("Books", { queryResult: { queryText: "Where to buy books?", intent: { displayName: "Default Fallback Intent" } } }, "books");
  await runTest("Laptop", { queryResult: { queryText: "Need a laptop", intent: { displayName: "Default Fallback Intent" } } }, "laptop");
  await runTest("Mentor AI", { queryResult: { queryText: "mentor artificial intelligence", intent: { displayName: "Default Fallback Intent" } } }, "Mentors for Artificial Intelligence");
  await runTest("Mentor Commerce", { queryResult: { queryText: "mentor commerce", intent: { displayName: "Default Fallback Intent" } } }, "Commerce");
  await runTest("Counseling", { queryResult: { queryText: "I need counseling", intent: { displayName: "Default Fallback Intent" } } }, "Counseling services");
  await runTest("Help", { queryResult: { queryText: "help me", intent: { displayName: "Default Fallback Intent" } } }, "guide you in Finance");
  await runTest("SIH", { queryResult: { queryText: "what is sih", intent: { displayName: "Default Fallback Intent" } } }, "Smart India Hackathon");
  await runTest("Revaluation", { queryResult: { queryText: "How to apply revaluation?", intent: { displayName: "Default Fallback Intent" } } }, "Revaluation");
  await runTest("Clinic", { queryResult: { queryText: "Where is campus clinic?", intent: { displayName: "Default Fallback Intent" } } }, "clinic");
  await runTest("Events", { queryResult: { queryText: "techfest details", intent: { displayName: "Default Fallback Intent" } } }, "events");
  await runTest("Sports Club", { queryResult: { queryText: "join football club", intent: { displayName: "Default Fallback Intent" } } }, "sports office");
  await runTest("Bonafide", { queryResult: { queryText: "bonafide certificate", intent: { displayName: "Default Fallback Intent" } } }, "bonafide");
  await runTest("ID Card", { queryResult: { queryText: "lost ID card", intent: { displayName: "Default Fallback Intent" } } }, "ID card");
  await runTest("Admin Timing", { queryResult: { queryText: "what are office timings", intent: { displayName: "Default Fallback Intent" } } }, "Admin block");
  await runTest("Library Borrow", { queryResult: { queryText: "how many books can I borrow", intent: { displayName: "Default Fallback Intent" } } }, "issue up to");
  await runTest("Library Fine", { queryResult: { queryText: "library fine", intent: { displayName: "Default Fallback Intent" } } }, "Library fine");
  await runTest("Bus", { queryResult: { queryText: "is bus service available", intent: { displayName: "Default Fallback Intent" } } }, "buses");
  await runTest("Bus Pass", { queryResult: { queryText: "bus pass", intent: { displayName: "Default Fallback Intent" } } }, "bus pass");
  await runTest("Contact Admin", { queryResult: { queryText: "contact admin", intent: { displayName: "Default Fallback Intent" } } }, "Contact admin office");

  // ---------- Intents ----------
  await runTest("FinanceIntent - Valid", { queryResult: { queryText: "Check finance for STU001", intent: { displayName: "FinanceIntent" }, parameters: { studentId: "STU001" } } }, "Finance Summary");
  await runTest("FinanceIntent - Missing ID", { queryResult: { queryText: "Show finance details", intent: { displayName: "FinanceIntent" }, parameters: {} } }, "Please provide");
  await runTest("ParentStatusIntent", { queryResult: { queryText: "Parent dashboard", intent: { displayName: "ParentStatusIntent" }, parameters: { parentId: "PARENT001" } } }, "Parent Dashboard");
  await runTest("MentorStatusIntent", { queryResult: { queryText: "Mentor dashboard", intent: { displayName: "MentorStatusIntent" }, parameters: { mentorId: "MENTOR001" } } }, "Mentor Dashboard");
  await runTest("CounselingIntent", { queryResult: { queryText: "I need counseling", intent: { displayName: "CounselingIntent" } } }, "Counseling services");
  await runTest("DistressIntent", { queryResult: { queryText: "I feel very depressed", intent: { displayName: "DistressIntent" } } }, "distress");
  await runTest("MarketplaceIntent", { queryResult: { queryText: "Show marketplace", intent: { displayName: "MarketplaceIntent" } } }, "Marketplace Listings");
  await runTest("MentorshipIntent", { queryResult: { queryText: "Show mentors", intent: { displayName: "MentorshipIntent" } } }, "Mentorship Available");

  // ---------- Sentiment ----------
  await runTest("Sentiment - Positive", { queryResult: { queryText: "I am very happy today", intent: { displayName: "Default Fallback Intent" } } }, "Glad you’re doing well");
  await runTest("Sentiment - Negative", { queryResult: { queryText: "I am hopeless", intent: { displayName: "Default Fallback Intent" } } }, "counselor");

  // ---------- Fallback ----------
  await runTest("Fallback - Unknown", { queryResult: { queryText: "blah blah blah", intent: { displayName: "Default Fallback Intent" } } }, "couldn’t find");
}

main();
