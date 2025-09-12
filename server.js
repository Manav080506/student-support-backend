// Webhook for Dialogflow
app.post("/webhook", async (req, res) => {
  try {
    const intentName = req.body.queryResult.intent.displayName;
    const params = req.body.queryResult.parameters || {};
    let responseText = "I'm not sure how to help with that.";

    // ========================
    // Finance / Fees Intent
    // ========================
    if (intentName === "CheckFees" || intentName === "FinanceIntent") {
      const studentId = params.studentId;
      if (!studentId) {
        responseText = "Please provide your student ID (e.g., STU001).";
      } else {
        const student = await Student.findOne({ studentId });
        if (student) {
          responseText = `${student.name}, your pending fees are ₹${student.feesPending}.`;
        } else {
          responseText = `No record found for ${studentId}.`;
        }
      }
    }

    // ========================
    // Scholarship Intent
    // ========================
    else if (intentName === "ScholarshipFinder") {
      responseText = "I can search scholarships. Please tell me your course and family income.";
    }

    // ========================
    // Counseling Intent
    // ========================
    else if (intentName === "CounselingIntent") {
      responseText =
        "I understand you’re seeking counseling. A counselor will reach out soon. Meanwhile, would you like self-help resources on stress and mental health?";
    }

    // ========================
    // Distress Intent
    // ========================
    else if (intentName === "DistressIntent") {
      const distressLog = {
        studentId: params.studentId || "unknown",
        message: req.body.queryResult.queryText,
        timestamp: new Date(),
      };
      console.log("🚨 Distress Alert:", distressLog);

      responseText =
        "I sense you’re in distress. You are not alone. I am notifying a counselor to contact you immediately. If it’s an emergency, please call the helpline: 1800-599-0019.";
    }

    // ========================
    // Marketplace Intent
    // ========================
    else if (intentName === "MarketplaceIntent") {
      responseText =
        "Our marketplace currently has: used textbooks, calculators, and hostel essentials available. Would you like me to fetch the latest listings for you?";
    }

    // ========================
    // Mentorship Intent
    // ========================
    else if (intentName === "MentorshipIntent") {
      responseText =
        "We have mentors available in Computer Science, Mechanical, and Commerce. Please tell me your field of interest so I can match you with the right mentor.";
    }

    // ========================
    // Default / Fallback
    // ========================
    res.json({ fulfillmentText: responseText });

  } catch (error) {
    console.error("Webhook error:", error);
    res.json({
      fulfillmentText: "Something went wrong. Please try again later.",
    });
  }
});
