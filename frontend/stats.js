snapshot.forEach(doc => {
    let data = doc.data();

    scores.push(data.percentage || 0);

    let label = data.subject || "Paper";
    labels.push(label);

    html += `
    <div style="
        background:white;
        padding:18px;
        margin:12px;
        border-radius:12px;
        box-shadow:0 4px 12px rgba(0,0,0,0.1);
    ">
        <h3 style="color:#1746a2;">
            ${data.paper} - ${data.subject}
        </h3>

        <!-- ✅ NEW CHAPTER DISPLAY -->
        <p><b>📘 Chapter:</b> ${data.chapter || "Not Available"}</p>

        <p><b>📊 Score:</b> ${data.score}/${data.total}</p>
        <p><b>🎯 Percentage:</b> ${data.percentage}%</p>

        <p>
            ✅ Correct: ${data.correct} |
            ❌ Wrong: ${data.wrong} |
            ⏭ Skipped: ${data.skipped}
        </p>

        <p style="font-size:12px;color:gray;">
            📅 ${data.date || ""}
        </p>
    </div>
    `;
});