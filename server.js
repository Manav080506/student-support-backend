
app.get('/students/:id', async (req, res) => {
  try {
    const studentId = req.params.id;  // e.g., STU001
    const student = await Student.findOne({ studentId: studentId });

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    res.json(student);
  } catch (err) {
    console.error("Error fetching student:", err);
    res.status(500).json({ error: "Server error" });
  }
});
